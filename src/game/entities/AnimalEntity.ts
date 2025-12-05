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
  private _idleWanderTimeout: NodeJS.Timeout | null = null;
  private _wanderTarget: Vector3Like | null = null;
  private _lastPathfindTarget: Vector3Like | null = null;
  private _pathfindCooldown: number = 0;

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
    } else if (this._wanderTarget) {
      this._updateWanderBehavior();
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
      // Check if we need to recalculate path
      const needsNewPath = this._shouldRecalculatePath(playerPos);

      if (needsNewPath && this._pathfindCooldown <= 0) {
        // Use pathfinding for terrain navigation
        const pathFound = this.pathfindingController.pathfind(playerPos, this._followSpeed, {
          maxJump: 2,  // Can jump up 2 blocks
          maxFall: 3,  // Can fall down 3 blocks
          pathfindCompleteCallback: () => {
            // Path complete, will check again on next tick
            this._lastPathfindTarget = null;
          },
          pathfindAbortCallback: () => {
            // Path failed, try again soon
            this._lastPathfindTarget = null;
            this._pathfindCooldown = 10; // Wait 10 ticks before retry
          },
        });

        if (pathFound) {
          this._lastPathfindTarget = { ...playerPos };
          this._pathfindCooldown = 20; // Don't recalculate for 20 ticks (~2 seconds)
        } else {
          // Fallback to simple movement if pathfinding fails
          this.pathfindingController.move(playerPos, this._followSpeed, {
            moveIgnoreAxes: { y: true },
          });
          this._pathfindCooldown = 30;
        }
      }

      // Always face the player
      this.pathfindingController.face(playerPos, 5);
    }
  }

  private _shouldRecalculatePath(playerPos: Vector3Like): boolean {
    if (!this._lastPathfindTarget) return true;

    // Recalculate if player moved more than 3 blocks
    const dx = playerPos.x - this._lastPathfindTarget.x;
    const dy = playerPos.y - this._lastPathfindTarget.y;
    const dz = playerPos.z - this._lastPathfindTarget.z;
    const distMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distMoved > 3;
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

    // Random delay before wandering (5-15 seconds)
    const delay = 5000 + Math.random() * 10000;

    this._idleWanderTimeout = setTimeout(() => {
      if (!this.isSpawned || this._isFollowing) return;

      // Pick a random nearby position to wander to
      const myPos = this.position;
      const wanderRadius = 3 + Math.random() * 4;
      const angle = Math.random() * Math.PI * 2;

      this._wanderTarget = {
        x: myPos.x + Math.cos(angle) * wanderRadius,
        y: myPos.y,
        z: myPos.z + Math.sin(angle) * wanderRadius,
      };

      // Start walking animation and move
      this.stopModelAnimations(['idle']);
      this.startModelLoopedAnimations(['walk']);

      // Use pathfinding for wander to navigate terrain
      const pathFound = this.pathfindingController.pathfind(this._wanderTarget, this._followSpeed * 0.5, {
        maxJump: 1,  // Smaller jumps for wandering
        maxFall: 2,
        pathfindCompleteCallback: () => {
          if (!this._isFollowing) {
            this.stopModelAnimations(['walk']);
            this.startModelLoopedAnimations(['idle']);
            this._startIdleWander();
          }
        },
        pathfindAbortCallback: () => {
          // If pathfinding fails, just go idle and try again
          this.stopModelAnimations(['walk']);
          this.startModelLoopedAnimations(['idle']);
          this._startIdleWander();
        },
      });

      if (!pathFound) {
        // Fallback to simple movement
        this.pathfindingController.move(this._wanderTarget, this._followSpeed * 0.5, {
          moveIgnoreAxes: { y: true },
          moveCompleteCallback: () => {
            if (!this._isFollowing) {
              this.stopModelAnimations(['walk']);
              this.startModelLoopedAnimations(['idle']);
              this._startIdleWander();
            }
          },
        });
      }
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
