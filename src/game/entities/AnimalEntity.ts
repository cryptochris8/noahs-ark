/**
 * AnimalEntity - Represents an animal that can follow players
 */

import {
  Entity,
  PathfindingEntityController,
  EntityEvent,
  RigidBodyType,
  type World,
  type Vector3Like,
  type Player,
} from 'hytopia';

import GameConfig from '../GameConfig';

// Animal model URIs - using default Hytopia assets
// All available animal models from @hytopia.com/assets
const ANIMAL_MODELS: Record<string, string> = {
  // Farm animals
  sheep: 'models/npcs/animals/sheep.gltf',
  cow: 'models/npcs/animals/cow.gltf',
  pig: 'models/npcs/animals/pig.gltf',
  chicken: 'models/npcs/animals/chicken.gltf',
  horse: 'models/npcs/animals/horse.gltf',
  donkey: 'models/npcs/animals/donkey.gltf',

  // Small animals
  rabbit: 'models/npcs/animals/rabbit.gltf',
  raccoon: 'models/npcs/animals/raccoon.gltf',
  beaver: 'models/npcs/animals/beaver.gltf',
  frog: 'models/npcs/animals/frog.gltf',
  turtle: 'models/npcs/animals/turtle.gltf',
  lizard: 'models/npcs/animals/lizard.gltf',
  crab: 'models/npcs/animals/crab.gltf',

  // Forest predators
  fox: 'models/npcs/animals/fox.gltf',
  wolf: 'models/npcs/animals/wolf.gltf',
  bear: 'models/npcs/animals/bear.gltf',
  ocelot: 'models/npcs/animals/ocelot.gltf',

  // Exotic animals
  capybara: 'models/npcs/animals/capybara.gltf',
  penguin: 'models/npcs/animals/penguin.gltf',
  flamingo: 'models/npcs/animals/flamingo.gltf',
  bat: 'models/npcs/animals/bat.gltf',
  dog: 'models/npcs/animals/dog-german-shepherd.gltf',
  squid: 'models/npcs/animals/squid.gltf',
  bee: 'models/npcs/animals/bee-adult.gltf',
};

// Fallback model if specific animal model not found
const DEFAULT_ANIMAL_MODEL = 'models/npcs/animals/cow.gltf';

// Map boundaries to keep animals in playable area
// mount-ararat: 120x120 dual-sided mountain (X: -60 to +60, Z: -60 to +60)
// Ark at center (Z=0), terrain rises symmetrically from both edges
//
// TERRAIN HEIGHT PROFILE (at X=0 center path):
//   Z=-60: Y=5,  Z=-50: Y=9,  Z=-40: Y=15, Z=-30: Y=22
//   Z=-26: Y=22, Z=-24: Y=30 (8-block cliff at CENTER only!)
//   Z=-20 to Z=0: Y=30-32 (Ark plateau at center)
//
// IMPORTANT: The cliff at Z=-24 only affects the CENTER PATH (X near 0)
// Edge positions (|X| > 20) at Z=-20 are Y=21-23 (navigable)
// Tier 3 spawn zones at X=±25, Z=-20 are valid
//
// Pathfinding will naturally prevent center animals from climbing the cliff
const MAP_NAME = process.env.MAP_NAME || 'mount-ararat';
const MAP_BOUNDS: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }> = {
  // Solo mode: South side, allow up to Z=-20 for edge positions
  // Pathfinding will block center animals from the cliff
  'mount-ararat': { minX: -60, maxX: 60, minZ: -60, maxZ: -20 },
  'plains-of-shinar': { minX: -75, maxX: 75, minZ: -75, maxZ: 70 },
};
const CURRENT_BOUNDS = MAP_BOUNDS[MAP_NAME] || MAP_BOUNDS['mount-ararat'];

export interface AnimalEntityOptions {
  animalType: string;
  spawnTier?: number;
}

export default class AnimalEntity extends Entity {
  public readonly animalType: string;
  public readonly spawnTier: number;

  private _followingPlayer: Player | null = null;
  private _isFollowing: boolean = false;
  private _followDistance: number;
  private _followSpeed: number;
  private _catchupSpeed: number;
  private _catchupDistanceThreshold: number;
  private _idleWanderTimeout: NodeJS.Timeout | null = null;
  private _wanderTarget: Vector3Like | null = null;
  private _lastPathfindTarget: Vector3Like | null = null;
  private _pathfindCooldown: number = 0;
  private _currentFloodHeight: number = 0;
  private _isFleeingFlood: boolean = false;
  private _fleeTarget: Vector3Like | null = null;
  private _boundaryCheckCounter: number = 0; // PERFORMANCE: Throttle boundary checks
  private _followUpdateCounter: number = 0; // PERFORMANCE: Throttle follow updates
  private _lastPlayerPos: Vector3Like | null = null;
  private _isActive: boolean = false; // PERFORMANCE: Track if animal is activated (tick handler registered)

  constructor(options: AnimalEntityOptions) {
    const modelUri = ANIMAL_MODELS[options.animalType] || DEFAULT_ANIMAL_MODEL;
    const config = GameConfig.instance;

    super({
      name: options.animalType,
      modelUri,
      modelScale: 0.7,
      modelLoopedAnimations: ['idle'],
      controller: new PathfindingEntityController(),
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        enabledRotations: { x: false, y: true, z: false },
        linearDamping: 2,
      },
    });

    this.animalType = options.animalType;
    this.spawnTier = options.spawnTier ?? 1;
    this._followDistance = config.animals.follow_distance;
    this._followSpeed = config.player.base_move_speed * config.animals.follow_speed_multiplier;
    this._catchupSpeed = config.player.base_move_speed * (config.animals.catchup_speed_multiplier ?? 1.8);
    this._catchupDistanceThreshold = config.animals.catchup_distance_threshold ?? 8;

    // PERFORMANCE: Stagger boundary checks across animals to distribute load
    this._boundaryCheckCounter = Math.floor(Math.random() * 30);

    // PERFORMANCE OPTIMIZATION: Don't register tick handler until animal is activated
    // Animals spawn as "static" and only become active when player interacts
    // this.on(EntityEvent.TICK, this._onTick.bind(this));
  }

  public get isFollowing(): boolean {
    return this._isFollowing;
  }

  public get followingPlayer(): Player | null {
    return this._followingPlayer;
  }

  public get pathfindingController(): PathfindingEntityController {
    return this.controller as PathfindingEntityController;
  }

  /**
   * Clamp a position to stay within map boundaries
   */
  private _clampToBounds(pos: Vector3Like): Vector3Like {
    return {
      x: Math.max(CURRENT_BOUNDS.minX, Math.min(CURRENT_BOUNDS.maxX, pos.x)),
      y: pos.y,
      z: Math.max(CURRENT_BOUNDS.minZ, Math.min(CURRENT_BOUNDS.maxZ, pos.z)),
    };
  }

  /**
   * Check if position is within map boundaries
   */
  private _isWithinBounds(pos: Vector3Like): boolean {
    return pos.x >= CURRENT_BOUNDS.minX && pos.x <= CURRENT_BOUNDS.maxX &&
           pos.z >= CURRENT_BOUNDS.minZ && pos.z <= CURRENT_BOUNDS.maxZ;
  }

  /**
   * Activate the animal - registers tick handler for behavior updates
   * PERFORMANCE: Animals start inactive and only activate when player interacts
   */
  private _activate(): void {
    if (this._isActive) return;

    this._isActive = true;
    this.on(EntityEvent.TICK, this._onTick.bind(this));
  }

  /**
   * Start following a player
   */
  public startFollowing(player: Player): boolean {
    if (this._isFollowing) {
      return false; // Already following someone
    }

    // PERFORMANCE: Activate the animal when player interacts
    this._activate();

    this._followingPlayer = player;
    this._isFollowing = true;
    this._clearIdleWander();

    // Start walking animation
    this.stopModelAnimations(['idle']);
    this.startModelLoopedAnimations(['walk']);

    return true;
  }

  /**
   * Stop following the current player
   */
  public stopFollowing(): void {
    this._followingPlayer = null;
    this._isFollowing = false;

    // Return to idle animation
    this.stopModelAnimations(['walk']);
    this.startModelLoopedAnimations(['idle']);

    // Start idle wandering
    this._startIdleWander();
  }

  /**
   * Check if this animal can form a pair with another animal
   */
  public canPairWith(other: AnimalEntity): boolean {
    return this.animalType === other.animalType && this !== other;
  }

  /**
   * Update the current flood height - animal will flee if too close to water
   */
  public updateFloodLevel(floodHeight: number): void {
    this._currentFloodHeight = floodHeight;

    // Don't flee if following a player - player leads them to safety
    if (this._isFollowing) return;

    // Check if we need to flee (within 5 blocks of flood level)
    const myY = this.position.y;
    const dangerZone = floodHeight + 5;

    if (myY < dangerZone && !this._isFleeingFlood) {
      // Stagger flee start to avoid all animals fleeing at exact same moment
      const staggerDelay = Math.random() * 500; // 0-500ms random delay
      setTimeout(() => {
        if (!this._isFleeingFlood && !this._isFollowing && this.isSpawned) {
          this._startFleeingFlood();
        }
      }, staggerDelay);
    }
  }

  /**
   * Get safe Z position based on flood height
   * TERRAIN HEIGHT PROFILE (center path X=0):
   *   Z=-60: Y=5,  Z=-50: Y=9,  Z=-45: Y=12, Z=-40: Y=15
   *   Z=-35: Y=18, Z=-30: Y=22, Z=-26: Y=22
   *   Z=-24: Y=30 (cliff at CENTER only - edges are navigable)
   *   Z=-20: Y=21-23 at edges (X=±25), Y=30 at center
   *
   * Animals flee to progressively safer Z positions as flood rises
   * They stay SPREAD across the terrain, not clustering at one line
   */
  private _getSafeZForFloodHeight(floodHeight: number, currentZ: number): number {
    // Safe zones with minimum Y heights (conservative estimates)
    // Animals should flee to the NEAREST safe zone, not the farthest
    const safeZones = [
      { z: -55, minY: 7 },   // Tier 1 start
      { z: -50, minY: 9 },
      { z: -45, minY: 12 },
      { z: -40, minY: 15 },  // Tier 2 threshold
      { z: -35, minY: 18 },
      { z: -30, minY: 22 },  // Tier 3 threshold
      { z: -25, minY: 22 },  // Safe for edge positions
      { z: -20, minY: 21 },  // Final safe zone (edge positions only - pathfinding handles center)
    ];

    const safeBuffer = 6; // Stay this many blocks above flood
    const requiredY = floodHeight + safeBuffer;

    // Find the nearest safe zone that's high enough
    // Start from current position and only move forward as needed
    for (const zone of safeZones) {
      if (zone.z > currentZ && zone.minY >= requiredY) {
        return zone.z;
      }
    }

    // If flood is very high, go to maximum safe position
    // Pathfinding will prevent center animals from reaching unreachable areas
    return -20;
  }

  /**
   * Start fleeing from the flood
   * PERFORMANCE: Simple upward float instead of expensive pathfinding
   * Animals "swim" upward when water touches them - no pathfinding needed!
   */
  private _startFleeingFlood(): void {
    if (this._isFleeingFlood || !this.isSpawned || !this.world) return;

    this._isFleeingFlood = true;
    this._clearIdleWander();

    const myPos = this.position;
    const floodBuffer = 6;
    const safeY = this._currentFloodHeight + floodBuffer;

    // Check if actually in danger
    if (myPos.y >= safeY) {
      // Already safe - stop fleeing
      this._isFleeingFlood = false;
      this.stopModelAnimations(['walk']);
      this.startModelLoopedAnimations(['idle']);
      return;
    }

    // PERFORMANCE: Simple float/swim upward instead of pathfinding
    // Move animal up by 5 blocks to escape water
    const newY = Math.min(myPos.y + 5, safeY);

    // Add slight lateral randomization to prevent stacking
    const lateralOffset = {
      x: (Math.random() - 0.5) * 2, // ±1 block
      z: (Math.random() - 0.5) * 2, // ±1 block
    };

    const newPos = this._clampToBounds({
      x: myPos.x + lateralOffset.x,
      y: newY,
      z: myPos.z + lateralOffset.z,
    });

    // Teleport animal to new position (swimming upward)
    this.setPosition(newPos);

    // Show swimming animation
    this.stopModelAnimations(['idle']);
    this.startModelLoopedAnimations(['walk']);

    // Continue floating up if still submerged
    setTimeout(() => {
      if (this._isFleeingFlood && this.isSpawned && !this._isFollowing) {
        this._startFleeingFlood(); // Recursive - will float up again if needed
      } else {
        this._isFleeingFlood = false;
        this.stopModelAnimations(['walk']);
        this.startModelLoopedAnimations(['idle']);
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Called when flee pathfinding completes
   */
  private _onFleeComplete(): void {
    this._fleeTarget = null;

    // Check if we're safe now (need buffer above flood)
    const myY = this.position.y;
    const safeBuffer = 6; // Consider safe if 6+ blocks above flood
    const dangerZone = this._currentFloodHeight + safeBuffer;

    if (myY < dangerZone) {
      // Still not safe, keep fleeing (but with delay to prevent clustering)
      this._isFleeingFlood = false;
      // Stagger the next flee attempt to keep animals spread out
      const delay = 500 + Math.random() * 1500; // 0.5-2 second delay
      setTimeout(() => {
        if (!this._isFollowing && this.isSpawned) {
          this._startFleeingFlood();
        }
      }, delay);
    } else {
      // We're safe, return to normal behavior
      this._isFleeingFlood = false;
      this.stopModelAnimations(['walk']);
      this.startModelLoopedAnimations(['idle']);
      this._startIdleWander();
    }
  }

  public override spawn(world: World, position: Vector3Like): void {
    super.spawn(world, position);
    this._startIdleWander();
  }

  public override despawn(): void {
    this._clearIdleWander();
    super.despawn();
  }

  private _onTick(): void {
    if (!this.isSpawned || !this.world) return;

    // PERFORMANCE: Only check boundaries every 30 ticks (half second) instead of every tick
    // This reduces boundary checks from 1,380/sec to 46/sec with 23 animals
    this._boundaryCheckCounter++;
    if (this._boundaryCheckCounter >= 30) {
      this._boundaryCheckCounter = 0;

      // Check if animal is out of bounds and bring it back
      if (!this._isWithinBounds(this.position)) {
        const safePos = this._clampToBounds(this.position);
        this.setPosition(safePos);
        // Clear any current movement targets
        this._wanderTarget = null;
        this._fleeTarget = null;
        this._isFleeingFlood = false;
        this.stopModelAnimations(['walk']);
        this.startModelLoopedAnimations(['idle']);
        this._startIdleWander();
        return;
      }
    }

    if (this._isFollowing && this._followingPlayer) {
      this._updateFollowBehavior();
    } else if (this._isFleeingFlood && this._fleeTarget) {
      // Fleeing takes priority - handled by pathfinding callbacks
      this._updateFleeBehavior();
    } else if (this._wanderTarget) {
      this._updateWanderBehavior();
    }
  }

  private _updateFleeBehavior(): void {
    if (!this._fleeTarget) return;

    // Check if we reached the flee target
    const myPos = this.position;
    const dx = this._fleeTarget.x - myPos.x;
    const dz = this._fleeTarget.z - myPos.z;
    const distanceSquared = dx * dx + dz * dz;

    // If we're close to target or above the danger zone, complete the flee
    if (distanceSquared < 4) {
      this._onFleeComplete();
    }
  }

  private _updateFollowBehavior(): void {
    if (!this._followingPlayer) return;

    // PERFORMANCE: Only update follow behavior every 3 ticks (150ms) instead of every tick (50ms)
    // This reduces follow updates from ~460/sec to ~153/sec (67% reduction with 23 animals)
    this._followUpdateCounter++;
    if (this._followUpdateCounter < 3) return;
    this._followUpdateCounter = 0;

    // Get player entity position
    const playerEntities = this.world?.entityManager.getPlayerEntitiesByPlayer(this._followingPlayer);
    if (!playerEntities || playerEntities.length === 0) {
      this.stopFollowing();
      return;
    }

    const playerEntity = playerEntities[0];
    const playerPos = playerEntity.position;
    const myPos = this.position;

    // PERFORMANCE: Skip update if player hasn't moved significantly (< 0.5 blocks)
    if (this._lastPlayerPos) {
      const playerDx = playerPos.x - this._lastPlayerPos.x;
      const playerDz = playerPos.z - this._lastPlayerPos.z;
      const playerMovedSq = playerDx * playerDx + playerDz * playerDz;

      // If player moved less than 0.5 blocks, skip this update entirely
      if (playerMovedSq < 0.25) {
        return;
      }
    }

    // Cache player position for next check
    this._lastPlayerPos = { x: playerPos.x, y: playerPos.y, z: playerPos.z };

    // Calculate distance to player (PERFORMANCE: Use squared distance to avoid sqrt)
    const dx = playerPos.x - myPos.x;
    const dy = playerPos.y - myPos.y;
    const dz = playerPos.z - myPos.z;
    const distanceSquared = dx * dx + dz * dz;

    // PERFORMANCE: Decrease pathfinding cooldown
    if (this._pathfindCooldown > 0) {
      this._pathfindCooldown--;
    }

    // PERFORMANCE OPTIMIZATION: Teleport animals that fall too far behind
    // This prevents pathfinding struggles and reduces CPU load dramatically
    const teleportThreshold = 20 * 20; // 20 blocks squared
    if (distanceSquared > teleportThreshold) {
      // Animal is too far - teleport to player's position
      const teleportPos = {
        x: playerPos.x + (Math.random() - 0.5) * 4, // Random offset to avoid stacking
        y: playerPos.y,
        z: playerPos.z + (Math.random() - 0.5) * 4,
      };
      this.setPosition(teleportPos);
      this._pathfindCooldown = 60; // Reset cooldown after teleport
      this._lastPathfindTarget = null;
      this._lastPlayerPos = null; // Clear cache after teleport
      return;
    }

    // PERFORMANCE: Only process movement if far enough from player
    const followThreshold = this._followDistance * this._followDistance; // Squared distance
    if (distanceSquared > followThreshold) {
      const distance = Math.sqrt(distanceSquared); // Only calculate sqrt when needed

      // PERFORMANCE: Use simple direct movement instead of complex pathfinding
      // Animals following the player don't need obstacle avoidance - they can just move toward player
      const isFarBehind = distance > this._catchupDistanceThreshold;
      const currentSpeed = isFarBehind ? this._catchupSpeed : this._followSpeed;

      // SUPER SIMPLE: Just move toward player (no pathfinding overhead)
      this.pathfindingController.move(playerPos, currentSpeed, {
        moveIgnoreAxes: { y: true },
      });

      // PERFORMANCE: Only face player every 10 ticks instead of every tick
      if (this._pathfindCooldown % 10 === 0) {
        this.pathfindingController.face(playerPos, 5);
      }
    }
  }

  private _shouldRecalculatePath(playerPos: Vector3Like): boolean {
    if (!this._lastPathfindTarget) return true;

    // Recalculate if player moved more than 2 blocks
    const dx = playerPos.x - this._lastPathfindTarget.x;
    const dy = playerPos.y - this._lastPathfindTarget.y;
    const dz = playerPos.z - this._lastPathfindTarget.z;
    const distMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distMoved > 2;
  }

  private _updateWanderBehavior(): void {
    if (!this._wanderTarget) return;

    const myPos = this.position;
    const dx = this._wanderTarget.x - myPos.x;
    const dz = this._wanderTarget.z - myPos.z;
    const distanceSquared = dx * dx + dz * dz;

    // If we reached the wander target, stop and pick a new one later
    if (distanceSquared < 1) {
      this._wanderTarget = null;
      this.stopModelAnimations(['walk']);
      this.startModelLoopedAnimations(['idle']);
    }
  }

  private _startIdleWander(): void {
    this._clearIdleWander();

    // Random delay before wandering (8-20 seconds) - longer delays reduce CPU load
    const delay = 8000 + Math.random() * 12000;

    this._idleWanderTimeout = setTimeout(() => {
      if (!this.isSpawned || this._isFollowing || this._isFleeingFlood) return;

      // Pick a random nearby position to wander to
      const myPos = this.position;
      const wanderRadius = 2 + Math.random() * 3; // Smaller radius = easier paths
      const angle = Math.random() * Math.PI * 2;

      // Clamp wander target to map boundaries
      this._wanderTarget = this._clampToBounds({
        x: myPos.x + Math.cos(angle) * wanderRadius,
        y: myPos.y,
        z: myPos.z + Math.sin(angle) * wanderRadius,
      });

      // Start walking animation and move
      this.stopModelAnimations(['idle']);
      this.startModelLoopedAnimations(['walk']);

      // Use simple movement for wandering (much cheaper than pathfinding)
      // Animals don't need precise navigation when just wandering around
      this.pathfindingController.move(this._wanderTarget, this._followSpeed * 0.5, {
        moveIgnoreAxes: { y: true },
        moveCompleteCallback: () => {
          if (!this._isFollowing && !this._isFleeingFlood) {
            this.stopModelAnimations(['walk']);
            this.startModelLoopedAnimations(['idle']);
            this._startIdleWander();
          }
        },
      });
      this.pathfindingController.face(this._wanderTarget, 3);

    }, delay);
  }

  private _clearIdleWander(): void {
    if (this._idleWanderTimeout) {
      clearTimeout(this._idleWanderTimeout);
      this._idleWanderTimeout = null;
    }
    this._wanderTarget = null;
  }
}
