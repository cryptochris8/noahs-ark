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
   */
  private _startFleeingFlood(): void {
    if (this._isFleeingFlood || !this.isSpawned || !this.world) return;

    this._isFleeingFlood = true;
    this._clearIdleWander();

    // Find a safe position - move toward higher ground (positive Z and higher Y)
    const myPos = this.position;

    // Calculate flee target - move toward the ark area (higher Z) and uphill
    this._fleeTarget = {
      x: myPos.x + (Math.random() - 0.5) * 8, // Some random lateral movement
      y: myPos.y + 3,                          // Move up gradually
      z: myPos.z + 10 + Math.random() * 8,     // Move toward higher ground (ark direction)
    };

    // Start walking animation
    this.stopModelAnimations(['idle']);
    this.startModelLoopedAnimations(['walk']);

    // Use simple movement for fleeing (much cheaper than pathfinding)
    // This keeps CPU low when many animals flee at once
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

    // Check if we're safe now
    const myY = this.position.y;
    const dangerZone = this._currentFloodHeight + 5;

    if (myY < dangerZone) {
      // Still not safe, keep fleeing
      this._isFleeingFlood = false;
      this._startFleeingFlood();
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

      this._wanderTarget = {
        x: myPos.x + Math.cos(angle) * wanderRadius,
        y: myPos.y,
        z: myPos.z + Math.sin(angle) * wanderRadius,
      };

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
