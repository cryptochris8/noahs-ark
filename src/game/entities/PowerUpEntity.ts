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

/**
 * PERFORMANCE OPTIMIZATION: Shared visual effects system
 * Instead of each power-up having 2 intervals (rotation + bobbing),
 * use a single shared interval for all power-ups
 * Reduces from (N * 2 * 10/sec) to (1 * 10/sec) callbacks
 */
class PowerUpVisualEffects {
  private static _instance: PowerUpVisualEffects | null = null;
  private _interval: NodeJS.Timeout | null = null;
  private _powerUps: Set<PowerUpEntity> = new Set();
  private _rotation: number = 0;
  private _bobTime: number = 0;

  public static get instance(): PowerUpVisualEffects {
    if (!this._instance) {
      this._instance = new PowerUpVisualEffects();
    }
    return this._instance;
  }

  public register(powerUp: PowerUpEntity): void {
    this._powerUps.add(powerUp);

    // Start the shared interval if this is the first power-up
    if (this._powerUps.size === 1 && !this._interval) {
      this._start();
    }
  }

  public unregister(powerUp: PowerUpEntity): void {
    this._powerUps.delete(powerUp);

    // Stop the interval if no power-ups remain
    if (this._powerUps.size === 0 && this._interval) {
      this._stop();
    }
  }

  private _start(): void {
    this._rotation = 0;
    this._bobTime = 0;

    this._interval = setInterval(() => {
      this._rotation += 0.1;
      this._bobTime += 0.2;
      const bobOffset = Math.sin(this._bobTime) * 0.25;

      // Update all registered power-ups in one batch
      for (const powerUp of this._powerUps) {
        if (powerUp.isSpawned && !powerUp.isCollected) {
          powerUp.updateVisuals(this._rotation, bobOffset);
        }
      }
    }, 100); // 10 times per second (same as before, but shared)
  }

  private _stop(): void {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

export default class PowerUpEntity extends Entity {
  public readonly powerUpType: PowerUpType;
  public readonly config: PowerUpConfig;

  private _isCollected: boolean = false;
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

    // Register with shared visual effects system
    PowerUpVisualEffects.instance.register(this);
  }

  /**
   * Despawn the power-up
   */
  public despawn(): void {
    // Unregister from shared visual effects system
    PowerUpVisualEffects.instance.unregister(this);

    if (this._collider) {
      this._collider.removeFromSimulation();
      this._collider = null;
    }

    super.despawn();
  }

  /**
   * Update visuals (called by shared system)
   * PERFORMANCE: This method is called by the shared PowerUpVisualEffects system
   */
  public updateVisuals(rotation: number, bobOffset: number): void {
    if (!this.isSpawned || this._isCollected) return;

    // Update rotation
    this.setRotation({ x: 0, y: rotation, z: 0, w: 1 });

    // Update bobbing position
    this.setPosition({
      x: this.position.x,
      y: this._spawnY + bobOffset,
      z: this.position.z,
    });
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
}
