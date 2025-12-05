/**
 * FloodManager - Handles the rising flood water and damage to entities below it
 */

import {
  Collider,
  ColliderShape,
  CollisionGroup,
  Entity,
  PlayerEntity,
  BlockType,
  type World,
} from 'hytopia';

import GameConfig, { type DifficultyKey } from '../GameConfig';
import FloodVisual from './FloodVisual';

export type FloodEventCallback = (currentHeight: number, maxHeight: number) => void;

export default class FloodManager {
  private _world: World;
  private _currentHeight: number;
  private _maxHeight: number;
  private _riseSpeed: number;
  private _startDelay: number;
  private _damagePerSecond: number;
  private _isActive: boolean = false;
  private _hasStarted: boolean = false;
  private _tickInterval: NodeJS.Timeout | null = null;
  private _startTimeout: NodeJS.Timeout | null = null;
  private _floodCollider: Collider | null = null;
  private _floodVisual: FloodVisual | null = null;
  private _onFloodRise: FloodEventCallback | null = null;
  private _onFloodWarning: (() => void) | null = null;

  constructor(world: World, difficulty: DifficultyKey = 'normal') {
    this._world = world;

    const config = GameConfig.instance;
    const difficultyConfig = config.getDifficultyConfig(difficulty);

    this._currentHeight = config.flood.start_height_y;
    this._maxHeight = config.flood.max_height_y;
    this._riseSpeed = difficultyConfig.flood_rise_speed_blocks_per_second;
    this._startDelay = difficultyConfig.flood_start_delay_seconds;
    this._damagePerSecond = config.flood.damage_per_second_below_surface;

    // Create flood visual (water surface effect)
    this._floodVisual = new FloodVisual(world, this._currentHeight);
  }

  /**
   * Get the flood visual instance (for testing)
   */
  public get floodVisual(): FloodVisual | null {
    return this._floodVisual;
  }

  public get currentHeight(): number {
    return this._currentHeight;
  }

  public get maxHeight(): number {
    return this._maxHeight;
  }

  public get progress(): number {
    const startHeight = GameConfig.instance.flood.start_height_y;
    const range = this._maxHeight - startHeight;
    const current = this._currentHeight - startHeight;
    return Math.min(1, Math.max(0, current / range));
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public get hasStarted(): boolean {
    return this._hasStarted;
  }

  public get timeUntilStart(): number {
    if (this._hasStarted) return 0;
    return this._startDelay;
  }

  /**
   * Set callback for when flood rises
   */
  public onFloodRise(callback: FloodEventCallback): void {
    this._onFloodRise = callback;
  }

  /**
   * Set callback for flood warning (when flood is about to start)
   */
  public onFloodWarning(callback: () => void): void {
    this._onFloodWarning = callback;
  }

  /**
   * Start the flood system
   */
  public start(): void {
    if (this._isActive) return;

    this._isActive = true;
    this._hasStarted = false;

    // Create the flood damage collider (large sensor covering the world below flood height)
    this._createFloodCollider();

    // Spawn the flood visual (water surface)
    if (this._floodVisual) {
      this._floodVisual.spawn();
    }

    // Set up the start delay
    this._startTimeout = setTimeout(() => {
      this._hasStarted = true;

      // Trigger flood warning
      if (this._onFloodWarning) {
        this._onFloodWarning();
      }

      // Start the tick loop for rising water
      this._tickInterval = setInterval(() => this._tick(), 100); // 10 ticks per second
    }, this._startDelay * 1000);
  }

  /**
   * Stop the flood system
   */
  public stop(): void {
    this._isActive = false;
    this._hasStarted = false;

    if (this._startTimeout) {
      clearTimeout(this._startTimeout);
      this._startTimeout = null;
    }

    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }

    if (this._floodCollider) {
      this._floodCollider.removeFromSimulation();
      this._floodCollider = null;
    }

    // Despawn the flood visual
    if (this._floodVisual) {
      this._floodVisual.despawn();
    }
  }

  /**
   * Reset the flood to starting height
   */
  public reset(): void {
    this.stop();
    this._currentHeight = GameConfig.instance.flood.start_height_y;
  }

  /**
   * Check if a position is below the flood water
   */
  public isBelowFlood(y: number): boolean {
    return y < this._currentHeight;
  }

  private _createFloodCollider(): void {
    // Create a large sensor collider that covers the entire map below flood height
    // This will detect entities that enter the flood zone
    this._floodCollider = new Collider({
      shape: ColliderShape.BLOCK,
      halfExtents: { x: 200, y: 100, z: 200 }, // Large area
      relativePosition: { x: 0, y: this._currentHeight - 100, z: 0 },
      isSensor: true,
      collisionGroups: {
        belongsTo: [CollisionGroup.ENTITY_SENSOR],
        collidesWith: [CollisionGroup.PLAYER, CollisionGroup.ENTITY],
      },
      onCollision: (other: BlockType | Entity, started: boolean) => {
        if (!started || !this._hasStarted) return;

        // Only damage entities that are below the flood height
        if (other instanceof Entity) {
          const entityY = other.position.y;
          if (entityY < this._currentHeight) {
            this._applyFloodDamage(other);
          }
        }
      },
    });

    this._floodCollider.addToSimulation(this._world.simulation);
  }

  private _tick(): void {
    if (!this._isActive || !this._hasStarted) return;

    // Calculate rise amount for this tick (100ms = 0.1 seconds)
    const riseAmount = this._riseSpeed * 0.1;
    this._currentHeight = Math.min(this._maxHeight, this._currentHeight + riseAmount);

    // Update collider position
    if (this._floodCollider) {
      this._floodCollider.setRelativePosition({
        x: 0,
        y: this._currentHeight - 100,
        z: 0,
      });
    }

    // Update flood visual position
    if (this._floodVisual) {
      this._floodVisual.setHeight(this._currentHeight);
    }

    // Check all player entities for flood damage
    this._checkEntitiesForFloodDamage();

    // Notify listeners
    if (this._onFloodRise) {
      this._onFloodRise(this._currentHeight, this._maxHeight);
    }
  }

  private _checkEntitiesForFloodDamage(): void {
    // Get all player entities in the world
    const playerEntities = this._world.entityManager.getAllPlayerEntities();

    playerEntities.forEach(playerEntity => {
      if (playerEntity.position.y < this._currentHeight) {
        this._applyFloodDamage(playerEntity);
      }
    });
  }

  private _applyFloodDamage(entity: Entity): void {
    // For now, we'll use a simple approach - apply impulse to push them up
    // and send a damage notification to the player

    if (entity instanceof PlayerEntity) {
      // Push player up and deal damage (effectively instant death with 999 damage)
      // For a more forgiving version, we could respawn them at a safe location
      const player = entity.player;

      // Apply upward impulse to try to save them
      entity.applyImpulse({ x: 0, y: 15, z: 0 });

      // Send damage notification through chat
      this._world.chatManager.sendPlayerMessage(
        player,
        'You are drowning! Get to higher ground!',
        'FF0000'
      );
    } else {
      // Non-player entities get pushed up or could be despawned
      entity.applyImpulse({ x: 0, y: 10, z: 0 });
    }
  }
}
