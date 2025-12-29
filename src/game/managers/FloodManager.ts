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
  type Player,
} from 'hytopia';

import GameConfig, { type DifficultyKey, type SwimmingConfig } from '../GameConfig';
import FloodVisual from './FloodVisual';
import PowerUpEntity from '../entities/PowerUpEntity';

export type FloodEventCallback = (currentHeight: number, maxHeight: number) => void;
export type PlayerDrownedCallback = (player: Player) => void;

// Track swimming state per player
interface PlayerSwimmingState {
  isSwimming: boolean;
  currentStamina: number;
  lastMessageTime: number;
  hasDrowned: boolean;  // Prevent multiple drown triggers
}

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
  private _onPlayerDrowned: PlayerDrownedCallback | null = null;
  private _isFloodFrozenCheck: (() => boolean) | null = null;

  // Swimming system
  private _swimmingConfig: SwimmingConfig;
  private _playerSwimmingStates: Map<string, PlayerSwimmingState> = new Map();
  private _maxStamina: number;

  constructor(world: World, difficulty: DifficultyKey = 'normal') {
    this._world = world;

    const config = GameConfig.instance;
    const difficultyConfig = config.getDifficultyConfig(difficulty);

    this._currentHeight = config.flood.start_height_y;
    this._maxHeight = config.flood.max_height_y;
    this._riseSpeed = difficultyConfig.flood_rise_speed_blocks_per_second;
    this._startDelay = difficultyConfig.flood_start_delay_seconds;
    this._damagePerSecond = config.flood.damage_per_second_below_surface;

    // Swimming configuration
    this._swimmingConfig = config.swimming;
    this._maxStamina = config.player.stamina_max;

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
   * Set callback for when a player drowns (stamina reaches zero)
   */
  public onPlayerDrowned(callback: PlayerDrownedCallback): void {
    this._onPlayerDrowned = callback;
  }

  /**
   * Set callback to check if flood is frozen (for Flood Freeze power-up)
   */
  public setFloodFrozenCheck(callback: () => boolean): void {
    this._isFloodFrozenCheck = callback;
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

      // Start the tick loop for rising water - PERFORMANCE: Reduced to 5 ticks/sec (was 10)
      this._tickInterval = setInterval(() => this._tick(), 200); // 5 ticks per second
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

    // IMPORTANT: Also reset the visual flood water immediately
    if (this._floodVisual) {
      this._floodVisual.setHeight(this._currentHeight);
    }

    // Reset the flood collider position
    if (this._floodCollider) {
      // Remove old collider
      this._floodCollider.removeFromSimulation();
      this._floodCollider = null;
    }

    // Reset all player swimming states
    this._playerSwimmingStates.clear();

    // Reset flags
    this._hasStarted = false;
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

    // Check if flood is frozen (Flood Freeze power-up)
    const isFrozen = this._isFloodFrozenCheck ? this._isFloodFrozenCheck() : false;

    // Calculate rise amount for this tick (200ms = 0.2 seconds) - PERFORMANCE: Updated for new tick rate
    // Don't rise if frozen
    if (!isFrozen) {
      const riseAmount = this._riseSpeed * 0.2;
      this._currentHeight = Math.min(this._maxHeight, this._currentHeight + riseAmount);
    }

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
      const isSubmerged = playerEntity.position.y < this._currentHeight;
      const isNearSurface = playerEntity.position.y < this._currentHeight + this._swimmingConfig.surface_threshold;

      if (this._swimmingConfig.enabled && isNearSurface) {
        // Apply swimming physics
        this._applySwimmingPhysics(playerEntity, isSubmerged);
      } else if (isSubmerged) {
        // Fallback to old behavior if swimming disabled
        this._applyFloodDamage(playerEntity);
      } else {
        // Player is above water - recover stamina
        this._recoverPlayerStamina(playerEntity);
      }
    });
  }

  /**
   * Get or create swimming state for a player
   */
  private _getPlayerSwimmingState(playerId: string): PlayerSwimmingState {
    if (!this._playerSwimmingStates.has(playerId)) {
      this._playerSwimmingStates.set(playerId, {
        isSwimming: false,
        currentStamina: this._maxStamina,
        lastMessageTime: 0,
        hasDrowned: false,
      });
    }
    return this._playerSwimmingStates.get(playerId)!;
  }

  /**
   * Reset a player's swimming state (call after respawn)
   */
  public resetPlayerSwimmingState(playerId: string): void {
    const state = this._playerSwimmingStates.get(playerId);
    if (state) {
      state.isSwimming = false;
      state.currentStamina = this._maxStamina;
      state.hasDrowned = false;
      state.lastMessageTime = 0;
    }
  }

  /**
   * Apply swimming physics to a player in the water
   */
  private _applySwimmingPhysics(playerEntity: PlayerEntity, isSubmerged: boolean): void {
    const player = playerEntity.player;
    const state = this._getPlayerSwimmingState(player.id);
    const now = Date.now();

    // Mark as swimming
    if (!state.isSwimming) {
      state.isSwimming = true;
      // Initial message when entering water
      if (now - state.lastMessageTime > 3000) {
        this._world.chatManager.sendPlayerMessage(
          player,
          'You are swimming! Get to higher ground before you tire out!',
          '00AAFF'
        );
        state.lastMessageTime = now;
      }
    }

    // Apply buoyancy - gentle upward force to keep player afloat
    // Only apply buoyancy when fully submerged
    if (isSubmerged) {
      playerEntity.applyImpulse({
        x: 0,
        y: this._swimmingConfig.buoyancy_impulse * 0.1, // Scale for per-tick application
        z: 0
      });
    }

    // Drain stamina while swimming (scaled for 200ms tick rate) - PERFORMANCE: Updated
    const staminaDrain = this._swimmingConfig.stamina_drain_per_second * 0.2;
    state.currentStamina = Math.max(0, state.currentStamina - staminaDrain);

    // Warning messages at stamina thresholds
    if (state.currentStamina <= 30 && state.currentStamina > 20 && now - state.lastMessageTime > 2000) {
      this._world.chatManager.sendPlayerMessage(
        player,
        'Your stamina is running low! Find dry land!',
        'FFAA00'
      );
      state.lastMessageTime = now;
    } else if (state.currentStamina <= 20 && state.currentStamina > 0 && now - state.lastMessageTime > 1500) {
      this._world.chatManager.sendPlayerMessage(
        player,
        'WARNING: Almost out of stamina!',
        'FF5500'
      );
      state.lastMessageTime = now;
    }

    // Apply drowning damage when stamina depleted
    if (state.currentStamina <= this._swimmingConfig.drowning_starts_at_stamina) {
      // Player is drowning - apply damage and stronger upward push
      if (now - state.lastMessageTime > 1000) {
        this._world.chatManager.sendPlayerMessage(
          player,
          'DROWNING! You are taking damage!',
          'FF0000'
        );
        state.lastMessageTime = now;
      }

      // Apply a stronger upward impulse to help them escape
      playerEntity.applyImpulse({ x: 0, y: this._swimmingConfig.buoyancy_impulse * 0.3, z: 0 });
    }

    // Player has completely drowned - trigger respawn
    if (state.currentStamina <= 0 && !state.hasDrowned) {
      state.hasDrowned = true;
      this._world.chatManager.sendPlayerMessage(
        player,
        'You drowned! Respawning...',
        'FF0000'
      );

      // Trigger the drowned callback
      if (this._onPlayerDrowned) {
        this._onPlayerDrowned(player);
      }
    }
  }

  /**
   * Recover stamina when player is out of water
   */
  private _recoverPlayerStamina(playerEntity: PlayerEntity): void {
    const player = playerEntity.player;
    const state = this._getPlayerSwimmingState(player.id);

    if (state.isSwimming) {
      // Just got out of water
      state.isSwimming = false;

      if (state.currentStamina < this._maxStamina * 0.5) {
        this._world.chatManager.sendPlayerMessage(
          player,
          'You made it to dry land! Recovering stamina...',
          '00FF00'
        );
      }
    }

    // Recover stamina while on dry land (scaled for 200ms tick rate) - PERFORMANCE: Updated
    const recovery = GameConfig.instance.player.stamina_recovery_per_second * 0.2;
    state.currentStamina = Math.min(this._maxStamina, state.currentStamina + recovery);
  }

  /**
   * Clean up swimming state for a player (call when player leaves)
   */
  public removePlayerSwimmingState(playerId: string): void {
    this._playerSwimmingStates.delete(playerId);
  }

  /**
   * Get a player's current swimming stamina (for UI)
   */
  public getPlayerSwimmingStamina(playerId: string): number {
    const state = this._playerSwimmingStates.get(playerId);
    return state ? state.currentStamina : this._maxStamina;
  }

  /**
   * Check if a player is currently swimming
   */
  public isPlayerSwimming(playerId: string): boolean {
    const state = this._playerSwimmingStates.get(playerId);
    return state ? state.isSwimming : false;
  }

  private _applyFloodDamage(entity: Entity): void {
    // Fallback behavior when swimming is disabled
    // Applies instant damage/impulse like the original implementation

    if (entity instanceof PlayerEntity) {
      // Push player up and deal damage (effectively instant death with 999 damage)
      const player = entity.player;

      // Apply upward impulse to try to save them
      entity.applyImpulse({ x: 0, y: 15, z: 0 });

      // Send damage notification through chat
      this._world.chatManager.sendPlayerMessage(
        player,
        'You are drowning! Get to higher ground!',
        'FF0000'
      );
    } else if (entity instanceof PowerUpEntity) {
      // Power-ups are kinematic - don't apply physics to them
      // They will be collected or despawned naturally
      return;
    } else {
      // Non-player entities get pushed up or could be despawned
      entity.applyImpulse({ x: 0, y: 10, z: 0 });
    }
  }
}
