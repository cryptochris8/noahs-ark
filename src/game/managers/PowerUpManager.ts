/**
 * PowerUpManager - Handles spawning, tracking, and applying power-up effects
 */

import type { World, Vector3Like, Player, PlayerEntity } from 'hytopia';
import PowerUpEntity, { type PowerUpType, type PowerUpConfig } from '../entities/PowerUpEntity';
import GamePlayerEntity from '../entities/GamePlayerEntity';
import GameConfig from '../GameConfig';

// Spawn zones for power-ups (reuse animal spawn zones)
import mountAraratSpawnZones from '../../../assets/mount-ararat-spawn-zones.json';
import plainsOfShinarSpawnZones from '../../../assets/plains-of-shinar-spawn-zones.json';

const MAP_NAME = process.env.MAP_NAME || 'mount-ararat';

interface SpawnZone {
  position: Vector3Like;
  tier: number;
}

// Active power-up effect on a player
interface ActiveEffect {
  type: PowerUpType;
  playerId: string;
  expiresAt: number;
  config: PowerUpConfig;
  intervalId?: NodeJS.Timeout;  // For continuous effects like Animal Magnet
}

// Callback types
export type PowerUpCollectedCallback = (player: Player, powerUpType: PowerUpType, config: PowerUpConfig) => void;
export type PowerUpExpiredCallback = (player: Player, powerUpType: PowerUpType) => void;

// For mount-ararat solo mode, only use south-side zones (Z <= 0)
// North-side zones are reserved for future PVP mode
function loadSpawnZones(mapName: string): SpawnZone[] {
  const rawZones = mapName === 'mount-ararat' ? mountAraratSpawnZones : plainsOfShinarSpawnZones;
  return rawZones
    .filter((zone: any) => {
      // For mount-ararat, only include south-side zones (Z <= 0) for solo mode
      if (mapName === 'mount-ararat') {
        return zone.z <= 0;
      }
      return true;
    })
    .map((zone: any) => ({
      position: { x: zone.x, y: zone.y, z: zone.z },
      tier: zone.tier,
    }));
}

const SPAWN_ZONES: SpawnZone[] = loadSpawnZones(MAP_NAME);

export default class PowerUpManager {
  private _world: World;
  private _powerUps: Set<PowerUpEntity> = new Set();
  private _activeEffects: Map<string, ActiveEffect[]> = new Map(); // playerId -> effects
  private _spawnInterval: NodeJS.Timeout | null = null;
  private _effectCheckInterval: NodeJS.Timeout | null = null;
  private _isActive: boolean = false;

  // Configuration
  private _spawnIntervalSeconds: number;
  private _maxActivePowerUps: number;
  private _powerUpTypes: Record<string, PowerUpConfig>;

  // Callbacks
  private _onPowerUpCollected: PowerUpCollectedCallback | null = null;
  private _onPowerUpExpired: PowerUpExpiredCallback | null = null;

  // External references for effects
  private _floodManager: any = null;
  private _animalManager: any = null;

  constructor(world: World) {
    this._world = world;

    const config = GameConfig.instance;
    this._spawnIntervalSeconds = config.powerups.spawn_interval_seconds;
    this._maxActivePowerUps = config.powerups.max_active_powerups;
    this._powerUpTypes = config.powerups.types || {};
  }

  /**
   * Set the flood manager reference (for Flood Freeze effect)
   */
  public setFloodManager(floodManager: any): void {
    this._floodManager = floodManager;
  }

  /**
   * Set the animal manager reference (for Animal Magnet effect)
   */
  public setAnimalManager(animalManager: any): void {
    this._animalManager = animalManager;
  }

  /**
   * Set callback for when a power-up is collected
   */
  public onPowerUpCollected(callback: PowerUpCollectedCallback): void {
    this._onPowerUpCollected = callback;
  }

  /**
   * Set callback for when a power-up effect expires
   */
  public onPowerUpExpired(callback: PowerUpExpiredCallback): void {
    this._onPowerUpExpired = callback;
  }

  /**
   * Start the power-up system
   */
  public start(): void {
    if (this._isActive) {
      return;
    }
    this._isActive = true;

    // Spawn initial power-up after a delay
    setTimeout(() => {
      if (this._isActive) {
        this._spawnRandomPowerUp();
      }
    }, 10000); // First spawn after 10 seconds

    // Start periodic spawning
    this._spawnInterval = setInterval(() => {
      if (this._isActive) this._spawnRandomPowerUp();
    }, this._spawnIntervalSeconds * 1000);

    // Start effect expiration checker
    this._effectCheckInterval = setInterval(() => {
      this._checkExpiredEffects();
    }, 500);
  }

  /**
   * Stop the power-up system
   */
  public stop(): void {
    this._isActive = false;

    if (this._spawnInterval) {
      clearInterval(this._spawnInterval);
      this._spawnInterval = null;
    }

    if (this._effectCheckInterval) {
      clearInterval(this._effectCheckInterval);
      this._effectCheckInterval = null;
    }

    // Despawn all power-ups
    this._powerUps.forEach(powerUp => {
      if (powerUp.isSpawned) {
        powerUp.despawn();
      }
    });
    this._powerUps.clear();

    // Clear all active effects and their intervals
    for (const effects of this._activeEffects.values()) {
      for (const effect of effects) {
        if (effect.intervalId) {
          clearInterval(effect.intervalId);
        }
      }
    }
    this._activeEffects.clear();
  }

  /**
   * Reset the power-up system
   */
  public reset(): void {
    this.stop();
    this._activeEffects.clear();
  }

  /**
   * Get active power-ups in the world
   */
  public get activePowerUps(): PowerUpEntity[] {
    return Array.from(this._powerUps).filter(p => p.isSpawned && !p.isCollected);
  }

  /**
   * Get active effects for a player
   */
  public getActiveEffects(playerId: string): ActiveEffect[] {
    return this._activeEffects.get(playerId) || [];
  }

  /**
   * Check if a player has a specific effect active
   */
  public hasEffect(playerId: string, effectType: PowerUpType): boolean {
    const effects = this._activeEffects.get(playerId) || [];
    return effects.some(e => e.type === effectType && e.expiresAt > Date.now());
  }

  /**
   * Get the speed multiplier for a player (for Speed Boots)
   */
  public getSpeedMultiplier(playerId: string): number {
    const effects = this._activeEffects.get(playerId) || [];
    const speedEffect = effects.find(e => e.type === 'speed_boots' && e.expiresAt > Date.now());
    return speedEffect?.config.effect_multiplier || 1.0;
  }

  /**
   * Check if flood is frozen (any player has Flood Freeze active)
   */
  public isFloodFrozen(): boolean {
    for (const effects of this._activeEffects.values()) {
      if (effects.some(e => e.type === 'flood_freeze' && e.expiresAt > Date.now())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Spawn a random power-up at a random location
   */
  private _spawnRandomPowerUp(): void {
    // Check if we've reached max power-ups
    const currentCount = this.activePowerUps.length;
    if (currentCount >= this._maxActivePowerUps) {
      return;
    }

    // Pick a random power-up type
    const typeKeys = Object.keys(this._powerUpTypes) as PowerUpType[];
    if (typeKeys.length === 0) {
      return;
    }

    const randomType = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    const config = this._powerUpTypes[randomType];

    // Pick a random spawn zone (prefer higher tiers - more accessible)
    const zone = this._getRandomSpawnZone();
    if (!zone) {
      return;
    }

    // Add random offset - keep Y at zone level (PowerUpEntity will add +1 for bobbing)
    // Use smaller X/Z offset to stay on terrain
    const position = {
      x: zone.position.x + (Math.random() - 0.5) * 4,
      y: zone.position.y,  // Don't add extra height here
      z: zone.position.z + (Math.random() - 0.5) * 4,
    };

    // Create and spawn power-up
    const powerUp = new PowerUpEntity({
      powerUpType: randomType,
      config: config,
    });

    powerUp.onCollected((pu, playerEntity) => {
      this._handleCollection(pu, playerEntity);
    });

    powerUp.spawn(this._world, position);
    this._powerUps.add(powerUp);
  }

  /**
   * Get a random spawn zone, preferring lower tiers where players spend more time
   */
  private _getRandomSpawnZone(): SpawnZone | null {
    if (SPAWN_ZONES.length === 0) {
      return null;
    }

    // Only spawn on Tier 1 zones (lowest, most accessible areas)
    // This ensures power-ups are always at player level and easy to reach
    const tier1Zones = SPAWN_ZONES.filter(zone => zone.tier === 1);

    // Fallback to Tier 2 if no Tier 1 zones exist
    const availableZones = tier1Zones.length > 0
      ? tier1Zones
      : SPAWN_ZONES.filter(zone => zone.tier <= 2);

    if (availableZones.length === 0) {
      return null;
    }

    const selectedZone = availableZones[Math.floor(Math.random() * availableZones.length)];
    return selectedZone;
  }

  /**
   * Handle power-up collection
   */
  private _handleCollection(powerUp: PowerUpEntity, playerEntity: PlayerEntity): void {
    const player = playerEntity.player;
    const type = powerUp.powerUpType;
    const config = powerUp.config;

    // Remove from tracking
    this._powerUps.delete(powerUp);

    // Apply the effect
    this._applyEffect(player, type, config);

    // Trigger callback
    if (this._onPowerUpCollected) {
      this._onPowerUpCollected(player, type, config);
    }
  }

  /**
   * Apply a power-up effect to a player
   */
  private _applyEffect(player: Player, type: PowerUpType, config: PowerUpConfig): void {
    const playerId = player.id;
    const duration = config.duration_seconds * 1000;
    const expiresAt = Date.now() + duration;

    // Get or create player's effect list
    if (!this._activeEffects.has(playerId)) {
      this._activeEffects.set(playerId, []);
    }

    const effects = this._activeEffects.get(playerId)!;

    // Remove existing effect of same type (refresh duration)
    const existingIndex = effects.findIndex(e => e.type === type);
    if (existingIndex !== -1) {
      effects.splice(existingIndex, 1);
    }

    // Add new effect
    effects.push({
      type,
      playerId,
      expiresAt,
      config,
    });

    // Apply immediate effects based on type
    this._applyImmediateEffect(player, type, config);
  }

  /**
   * Apply immediate effects when power-up is collected
   */
  private _applyImmediateEffect(player: Player, type: PowerUpType, config: PowerUpConfig): void {
    switch (type) {
      case 'speed_boots':
        // Apply speed multiplier to player entity
        const speedMultiplier = config.effect_multiplier || 1.5;
        this._applySpeedBoost(player, speedMultiplier);
        this._world.chatManager.sendPlayerMessage(
          player,
          `Speed Boots activated! ${config.duration_seconds}s`,
          '00FFFF'
        );
        break;

      case 'animal_magnet':
        // Start attracting nearby animals
        this._world.chatManager.sendPlayerMessage(
          player,
          `Animal Magnet activated! ${config.duration_seconds}s`,
          'FF00FF'
        );
        this._startAnimalMagnet(player, config);
        break;

      case 'flood_freeze':
        // Flood freeze is checked via isFloodFrozen()
        this._world.chatManager.sendPlayerMessage(
          player,
          `Flood Freeze activated! ${config.duration_seconds}s`,
          '00AAFF'
        );
        break;
    }
  }

  /**
   * Apply speed boost to a player
   */
  private _applySpeedBoost(player: Player, multiplier: number): void {
    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);
    for (const entity of playerEntities) {
      if (entity instanceof GamePlayerEntity) {
        entity.setSpeedMultiplier(multiplier);
      }
    }
  }

  /**
   * Remove speed boost from a player
   */
  private _removeSpeedBoost(player: Player): void {
    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);
    for (const entity of playerEntities) {
      if (entity instanceof GamePlayerEntity) {
        entity.resetSpeed();
      }
    }
  }

  /**
   * Start the animal magnet effect - continuously attracts nearby animals
   */
  private _startAnimalMagnet(player: Player, config: PowerUpConfig): void {
    if (!this._animalManager) return;

    const radius = config.effect_radius || 15;
    const playerId = player.id;

    // Create a continuous effect that runs every 500ms
    const magnetInterval = setInterval(() => {
      if (!this._animalManager) return;

      // Check if effect is still active
      const effects = this._activeEffects.get(playerId) || [];
      const magnetEffect = effects.find(e => e.type === 'animal_magnet' && e.expiresAt > Date.now());
      if (!magnetEffect) {
        clearInterval(magnetInterval);
        return;
      }

      // Get player position
      const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);
      if (playerEntities.length === 0) return;

      const playerPos = playerEntities[0].position;

      // Find nearby animals not following anyone
      const nearbyAnimals = this._animalManager.animals.filter((animal: any) => {
        if (animal.isFollowing) return false;
        if (!animal.isSpawned) return false;

        const dx = animal.position.x - playerPos.x;
        const dz = animal.position.z - playerPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        return distance <= radius;
      });

      // Make up to 2 animals follow the player (respecting max following limit)
      const currentFollowing = this._animalManager.getAnimalsFollowingPlayer(player).length;
      const canFollow = 2 - currentFollowing;

      if (canFollow > 0) {
        nearbyAnimals.slice(0, canFollow).forEach((animal: any) => {
          this._animalManager.tryFollowPlayer(animal, player);
        });
      }
    }, 500);

    // Store the interval ID in the effect for cleanup
    const effects = this._activeEffects.get(playerId) || [];
    const magnetEffect = effects.find(e => e.type === 'animal_magnet');
    if (magnetEffect) {
      magnetEffect.intervalId = magnetInterval;
    }
  }

  /**
   * Check for expired effects
   */
  private _checkExpiredEffects(): void {
    const now = Date.now();

    for (const [playerId, effects] of this._activeEffects.entries()) {
      const expiredEffects = effects.filter(e => e.expiresAt <= now);

      // Remove expired effects
      expiredEffects.forEach(expired => {
        const index = effects.indexOf(expired);
        if (index !== -1) {
          effects.splice(index, 1);

          // Find the player
          const players = this._world.entityManager.getAllPlayerEntities();
          const playerEntity = players.find(pe => pe.player.id === playerId);

          // Clean up any intervals for this effect
          if (expired.intervalId) {
            clearInterval(expired.intervalId);
          }

          if (playerEntity) {
            // Handle cleanup for specific effect types
            if (expired.type === 'speed_boots') {
              this._removeSpeedBoost(playerEntity.player);
            }

            // Notify about expiration
            if (this._onPowerUpExpired) {
              this._onPowerUpExpired(playerEntity.player, expired.type);
            }
          }
        }
      });

      // Clean up empty effect lists
      if (effects.length === 0) {
        this._activeEffects.delete(playerId);
      }
    }
  }

  /**
   * Get active effects data for UI
   */
  public getActiveEffectsForUI(playerId: string): Array<{type: string, remainingSeconds: number, color: string}> {
    const effects = this._activeEffects.get(playerId) || [];
    const now = Date.now();

    return effects
      .filter(e => e.expiresAt > now)
      .map(e => ({
        type: e.config.display_name,
        remainingSeconds: Math.ceil((e.expiresAt - now) / 1000),
        color: e.config.color,
      }));
  }

  /**
   * Clean up when a player leaves
   */
  public removePlayer(playerId: string): void {
    this._activeEffects.delete(playerId);
  }
}
