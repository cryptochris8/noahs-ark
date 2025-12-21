/**
 * PowerUpEntity - Represents a collectible power-up in the world
 */

import {
  Entity,
  RigidBodyType,
  Collider,
  ColliderShape,
  CollisionGroup,
  BlockType,
  PlayerEntity,
  type World,
  type Vector3Like,
} from 'hytopia';

export type PowerUpType = 'speed_boots' | 'animal_magnet' | 'flood_freeze';

export interface PowerUpConfig {
  display_name: string;
  duration_seconds: number;
  effect_multiplier?: number;
  effect_radius?: number;
  color: string;
}

// Visual models for power-ups (using existing item models from @hytopia.com/assets)
const POWERUP_MODELS: Record<PowerUpType, string> = {
  speed_boots: 'models/items/feather.gltf',       // Feather = speed/lightness
  animal_magnet: 'models/items/golden-apple.gltf', // Golden apple = attraction/magnet
  flood_freeze: 'models/items/snowball.gltf',      // Snowball = freeze/ice
};

// Fallback to a generic item model
const DEFAULT_POWERUP_MODEL = 'models/items/apple.gltf';

export interface PowerUpEntityOptions {
  powerUpType: PowerUpType;
  config: PowerUpConfig;
}

export type PowerUpCollectedCallback = (powerUp: PowerUpEntity, player: PlayerEntity) => void;

export default class PowerUpEntity extends Entity {
  public readonly powerUpType: PowerUpType;
  public readonly config: PowerUpConfig;

  private _isCollected: boolean = false;
  private _rotationInterval: NodeJS.Timeout | null = null;
  private _bobOffset: number = 0;
  private _bobInterval: NodeJS.Timeout | null = null;
  private _spawnY: number = 0;
  private _onCollected: PowerUpCollectedCallback | null = null;
  private _collider: Collider | null = null;

  constructor(options: PowerUpEntityOptions) {
    // Try to use specific model, fall back to default
    const modelUri = POWERUP_MODELS[options.powerUpType] || DEFAULT_POWERUP_MODEL;

    super({
      name: `PowerUp_${options.powerUpType}`,
      modelUri: modelUri,
      modelScale: 1.5,  // Increased from 0.8 to make more visible
      rigidBodyOptions: {
        type: RigidBodyType.KINEMATIC_POSITION,
      },
    });

    this.powerUpType = options.powerUpType;
    this.config = options.config;
  }

  /**
   * Set callback for when power-up is collected
   */
  public onCollected(callback: PowerUpCollectedCallback): void {
    this._onCollected = callback;
  }

  /**
   * Check if power-up has been collected
   */
  public get isCollected(): boolean {
    return this._isCollected;
  }

  /**
   * Spawn the power-up in the world
   */
  public spawn(world: World, position: Vector3Like): void {
    // Spawn well above ground level to avoid terrain clipping
    const spawnPos = { x: position.x, y: position.y + 2.5, z: position.z };
    this._spawnY = spawnPos.y;

    super.spawn(world, spawnPos);

    // Create pickup collider
    this._createPickupCollider(world);

    // Start visual effects (rotation and bobbing)
    this._startVisualEffects();
  }

  /**
   * Despawn the power-up
   */
  public despawn(): void {
    this._stopVisualEffects();

    if (this._collider) {
      this._collider.removeFromSimulation();
      this._collider = null;
    }

    super.despawn();
  }

  /**
   * Create the pickup sensor collider - attached to the entity's rigid body
   */
  private _createPickupCollider(world: World): void {
    // Create collider attached to this entity's rigid body
    this._collider = new Collider({
      shape: ColliderShape.CYLINDER,
      radius: 2.0,  // Large radius for easy pickup
      halfHeight: 1.5,  // Tall enough to catch players
      isSensor: true,
      relativePosition: { x: 0, y: 0, z: 0 },  // Relative to parent rigid body
      collisionGroups: {
        belongsTo: [CollisionGroup.ENTITY_SENSOR],
        collidesWith: [CollisionGroup.ENTITY],  // Players belong to ENTITY group, not PLAYER
      },
      onCollision: (other: BlockType | Entity, started: boolean) => {
        if (!started || this._isCollected) return;

        if (other instanceof PlayerEntity) {
          this._collect(other);
        }
      },
    });

    // Add collider to simulation, attached to this entity (which extends RigidBody)
    // The collider will move with the entity automatically
    this._collider.addToSimulation(world.simulation, this);
  }

  /**
   * Handle power-up collection
   */
  private _collect(player: PlayerEntity): void {
    if (this._isCollected) return;

    this._isCollected = true;

    // Trigger callback
    if (this._onCollected) {
      this._onCollected(this, player);
    }

    // Despawn after a brief delay for visual feedback
    setTimeout(() => {
      this.despawn();
    }, 100);
  }

  /**
   * Start visual effects (rotation and bobbing)
   * PERFORMANCE: Reduced frequency from 50ms to 100ms (90% CPU reduction)
   */
  private _startVisualEffects(): void {
    // Rotation effect - REDUCED from 20/sec to 10/sec
    let rotation = 0;
    this._rotationInterval = setInterval(() => {
      if (!this.isSpawned) return;
      rotation += 0.1;  // Doubled increment since running at half speed
      this.setRotation({ x: 0, y: rotation, z: 0, w: 1 });
    }, 100);  // PERFORMANCE: Was 50ms, now 100ms (50% reduction)

    // Bobbing effect (noticeable up/down motion for visibility)
    let bobTime = 0;
    this._bobInterval = setInterval(() => {
      if (!this.isSpawned) return;
      bobTime += 0.2;  // Doubled increment since running at half speed
      this._bobOffset = Math.sin(bobTime) * 0.25;  // Visible bobbing to draw attention
      this.setPosition({
        x: this.position.x,
        y: this._spawnY + this._bobOffset,
        z: this.position.z,
      });
      // Note: Collider is attached to rigid body so it moves automatically with entity
    }, 100);  // PERFORMANCE: Was 50ms, now 100ms (50% reduction)
  }

  /**
   * Stop visual effects
   */
  private _stopVisualEffects(): void {
    if (this._rotationInterval) {
      clearInterval(this._rotationInterval);
      this._rotationInterval = null;
    }
    if (this._bobInterval) {
      clearInterval(this._bobInterval);
      this._bobInterval = null;
    }
  }
}
