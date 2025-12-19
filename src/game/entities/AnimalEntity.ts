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
  sheep: 'models/npcs/sheep.gltf',
  cow: 'models/npcs/cow.gltf',
  pig: 'models/npcs/pig.gltf',
  chicken: 'models/npcs/chicken.gltf',
  horse: 'models/npcs/horse.gltf',
  donkey: 'models/npcs/donkey.gltf',

  // Small animals
  rabbit: 'models/npcs/rabbit.gltf',
  raccoon: 'models/npcs/raccoon.gltf',
  beaver: 'models/npcs/beaver.gltf',
  frog: 'models/npcs/frog.gltf',
  turtle: 'models/npcs/turtle.gltf',
  lizard: 'models/npcs/lizard.gltf',
  crab: 'models/npcs/crab.gltf',

  // Forest predators
  fox: 'models/npcs/fox.gltf',
  wolf: 'models/npcs/wolf.gltf',
  bear: 'models/npcs/bear.gltf',
  ocelot: 'models/npcs/ocelot.gltf',

  // Exotic animals
  capybara: 'models/npcs/capybara.gltf',
  penguin: 'models/npcs/penguin.gltf',
  flamingo: 'models/npcs/flamingo.gltf',
  peacock: 'models/npcs/peacock.gltf',
  bat: 'models/npcs/bat.gltf',
  dog: 'models/npcs/dog-german-shepherd.gltf',
};

// Fallback model if specific animal model not found
const DEFAULT_ANIMAL_MODEL = 'models/npcs/cow.gltf';

// Map boundaries to keep animals in playable area
// mount-ararat: 120x120 dual-sided mountain (X: -60 to +60, Z: -60 to +60)
// Ark at center (Z=0), terrain rises symmetrically from both edges
// For SOLO MODE: Animals restricted to south side only (Z <= 5)
const MAP_NAME = process.env.MAP_NAME || 'mount-ararat';
const MAP_BOUNDS: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }> = {
  // Solo mode: South side only (Z: -60 to +5, slightly past Ark for delivery)
  'mount-ararat': { minX: -60, maxX: 60, minZ: -60, maxZ: 5 },
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

    // Set up tick handler for following behavior
    this.on(EntityEvent.TICK, this._onTick.bind(this));
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
   * Start following a player
   */
  public startFollowing(player: Player): boolean {
    if (this._isFollowing) {
      return false; // Already following someone
    }

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
   * Start fleeing from the flood to higher ground
   * For dual-sided mountain: Ark is at Z=0 (center)
   * Animals should flee just enough to escape the flood, staying SPREAD OUT
   * They shouldn't all cluster at the top - this keeps gameplay interesting
   */
  private _startFleeingFlood(): void {
    if (this._isFleeingFlood || !this.isSpawned || !this.world) return;

    this._isFleeingFlood = true;
    this._clearIdleWander();

    const myPos = this.position;

    // Calculate how far to flee based on current flood level
    // Only move a small amount toward safety - don't rush to the very top
    const floodBuffer = 8; // Stay this many blocks above flood
    const safeY = this._currentFloodHeight + floodBuffer;

    // Only move toward center if we're actually in danger
    // Move just enough to get to safe height, not all the way to Z=0
    let targetZ: number;
    if (myPos.y < safeY) {
      // In danger - move a moderate distance toward center (3-8 blocks)
      const fleeDist = 3 + Math.random() * 5;
      if (myPos.z < 0) {
        // South side: move toward Z=0 but stop well before it
        targetZ = Math.min(myPos.z + fleeDist, -5); // Don't go past Z=-5
      } else {
        // North side (shouldn't happen in solo): move toward Z=0
        targetZ = Math.max(myPos.z - fleeDist, 5);
      }
    } else {
      // Already safe - just move laterally to spread out
      targetZ = myPos.z + (Math.random() - 0.5) * 4;
    }

    // Spread out on X-axis - move MORE laterally to keep animals distributed
    const lateralSpread = (Math.random() - 0.5) * 20; // -10 to +10 blocks

    // Clamp to map boundaries to prevent animals from escaping
    this._fleeTarget = this._clampToBounds({
      x: myPos.x + lateralSpread,
      y: myPos.y + 2,  // Small upward movement
      z: targetZ,
    });

    // Start walking animation
    this.stopModelAnimations(['idle']);
    this.startModelLoopedAnimations(['walk']);

    // Use simple movement for fleeing (much cheaper than pathfinding)
    this.pathfindingController.move(this._fleeTarget, this._followSpeed * 1.3, {
      moveCompleteCallback: () => {
        this._onFleeComplete();
      },
    });

    this.pathfindingController.face(this._fleeTarget, 5);
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

    // Get player entity position
    const playerEntities = this.world?.entityManager.getPlayerEntitiesByPlayer(this._followingPlayer);
    if (!playerEntities || playerEntities.length === 0) {
      this.stopFollowing();
      return;
    }

    const playerEntity = playerEntities[0];
    const playerPos = playerEntity.position;
    const myPos = this.position;

    // Calculate distance to player
    const dx = playerPos.x - myPos.x;
    const dy = playerPos.y - myPos.y;
    const dz = playerPos.z - myPos.z;
    const distanceSquared = dx * dx + dz * dz;
    const distance = Math.sqrt(distanceSquared);

    // Decrease pathfinding cooldown
    if (this._pathfindCooldown > 0) {
      this._pathfindCooldown--;
    }

    // Only move if we're too far from the player
    if (distance > this._followDistance) {
      // Use catch-up speed if animal is falling behind
      const isFarBehind = distance > this._catchupDistanceThreshold;
      const currentSpeed = isFarBehind ? this._catchupSpeed : this._followSpeed;

      // Check if we need to recalculate path
      const needsNewPath = this._shouldRecalculatePath(playerPos);

      if (needsNewPath && this._pathfindCooldown <= 0) {
        // Use pathfinding for terrain navigation
        const pathFound = this.pathfindingController.pathfind(playerPos, currentSpeed, {
          maxJump: 2,  // Keep pathfinding search space reasonable for performance
          maxFall: 3,
          pathfindCompleteCallback: () => {
            // Path complete, will check again on next tick
            this._lastPathfindTarget = null;
          },
          pathfindAbortCallback: () => {
            // Path failed, try simple movement instead
            this._lastPathfindTarget = null;
            this._pathfindCooldown = 15; // Wait longer before retry on failure
          },
        });

        if (pathFound) {
          this._lastPathfindTarget = { ...playerPos };
          this._pathfindCooldown = 12; // Don't recalculate for 12 ticks (~1.2 seconds)
        } else {
          // Fallback to simple movement if pathfinding fails (much cheaper)
          this.pathfindingController.move(playerPos, currentSpeed, {
            moveIgnoreAxes: { y: true },
          });
          this._pathfindCooldown = 15;
        }
      }

      // Always face the player
      this.pathfindingController.face(playerPos, 5);
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
