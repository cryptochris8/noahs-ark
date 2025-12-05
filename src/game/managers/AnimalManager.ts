/**
 * AnimalManager - Handles spawning and tracking animals in the world
 */

import type { World, Vector3Like, Player } from 'hytopia';
import AnimalEntity from '../entities/AnimalEntity';
import GameConfig from '../GameConfig';

// Spawn zones by tier and biome type
// These coordinates should match the map layout
// TODO: Update these coordinates to match actual map spawn points
interface SpawnZone {
  position: Vector3Like;
  tier: number;
  tags: string[];
}

// Default spawn zones - spread across different elevations
const SPAWN_ZONES: SpawnZone[] = [
  // Tier 1 - Lower areas (flood risk)
  { position: { x: -20, y: 5, z: -20 }, tier: 1, tags: ['grassland'] },
  { position: { x: 20, y: 5, z: -20 }, tier: 1, tags: ['grassland'] },
  { position: { x: 0, y: 5, z: -30 }, tier: 1, tags: ['grassland'] },
  { position: { x: -15, y: 6, z: -15 }, tier: 1, tags: ['forest'] },
  { position: { x: 15, y: 6, z: -15 }, tier: 1, tags: ['forest'] },

  // Tier 2 - Mid elevation
  { position: { x: -15, y: 12, z: -10 }, tier: 2, tags: ['grassland'] },
  { position: { x: 15, y: 12, z: -10 }, tier: 2, tags: ['rocky'] },
  { position: { x: 0, y: 14, z: -18 }, tier: 2, tags: ['forest'] },
  { position: { x: -10, y: 15, z: 0 }, tier: 2, tags: ['grassland'] },
  { position: { x: 10, y: 15, z: 0 }, tier: 2, tags: ['rocky'] },

  // Tier 3 - Higher elevation (safer from flood)
  { position: { x: -8, y: 22, z: 5 }, tier: 3, tags: ['rocky'] },
  { position: { x: 8, y: 22, z: 5 }, tier: 3, tags: ['rocky'] },
  { position: { x: 0, y: 25, z: 10 }, tier: 3, tags: ['grassland'] },
];

export default class AnimalManager {
  private _world: World;
  private _animals: Set<AnimalEntity> = new Set();
  private _pairsCollected: Map<string, number> = new Map();
  private _maxAnimals: number;

  constructor(world: World) {
    this._world = world;
    this._maxAnimals = GameConfig.instance.animals.max_animals_world;
  }

  public get animals(): AnimalEntity[] {
    return Array.from(this._animals);
  }

  public get totalAnimalsSpawned(): number {
    return this._animals.size;
  }

  /**
   * Get animals currently following a specific player
   */
  public getAnimalsFollowingPlayer(player: Player): AnimalEntity[] {
    return this.animals.filter(animal => animal.followingPlayer === player);
  }

  /**
   * Get count of pairs collected for a specific animal type
   */
  public getPairsCollected(animalType: string): number {
    return this._pairsCollected.get(animalType) ?? 0;
  }

  /**
   * Get total pairs collected across all animal types
   */
  public getTotalPairsCollected(): number {
    let total = 0;
    this._pairsCollected.forEach(count => total += count);
    return total;
  }

  /**
   * Record a pair being collected
   */
  public recordPairCollected(animalType: string): void {
    const current = this._pairsCollected.get(animalType) ?? 0;
    this._pairsCollected.set(animalType, current + 1);
  }

  /**
   * Spawn initial animals based on game config
   */
  public spawnInitialAnimals(): void {
    const config = GameConfig.instance;

    // Spawn animals for each type based on pairs required
    for (const animalType of config.animalTypes) {
      // Spawn 2 animals per required pair (need pairs to collect)
      const animalsToSpawn = animalType.pairs_required * 2;

      for (let i = 0; i < animalsToSpawn; i++) {
        this._spawnAnimalOfType(animalType.id, animalType.spawn_tags, animalType.preferred_tiers);
      }
    }
  }

  /**
   * Spawn a specific animal type at an appropriate location
   */
  private _spawnAnimalOfType(animalType: string, spawnTags: string[], preferredTiers: number[]): AnimalEntity | null {
    if (this._animals.size >= this._maxAnimals) {
      return null;
    }

    // Find suitable spawn zones
    const suitableZones = SPAWN_ZONES.filter(zone => {
      // Check if zone has matching tags
      const hasMatchingTag = spawnTags.some(tag => zone.tags.includes(tag)) || spawnTags.length === 0;
      // Check if zone is in preferred tier
      const isPreferredTier = preferredTiers.includes(zone.tier) || preferredTiers.length === 0;
      return hasMatchingTag || isPreferredTier;
    });

    if (suitableZones.length === 0) {
      // Fallback to any zone
      const randomZone = SPAWN_ZONES[Math.floor(Math.random() * SPAWN_ZONES.length)];
      return this._spawnAnimalAt(animalType, randomZone);
    }

    // Pick a random suitable zone
    const zone = suitableZones[Math.floor(Math.random() * suitableZones.length)];
    return this._spawnAnimalAt(animalType, zone);
  }

  /**
   * Spawn an animal at a specific zone with some random offset
   */
  private _spawnAnimalAt(animalType: string, zone: SpawnZone): AnimalEntity {
    const animal = new AnimalEntity({
      animalType,
      spawnTier: zone.tier,
    });

    // Add some random offset to avoid spawning animals on top of each other
    const offset = {
      x: (Math.random() - 0.5) * 6,
      y: 1, // Spawn slightly above ground
      z: (Math.random() - 0.5) * 6,
    };

    const spawnPos = {
      x: zone.position.x + offset.x,
      y: zone.position.y + offset.y,
      z: zone.position.z + offset.z,
    };

    animal.spawn(this._world, spawnPos);
    this._animals.add(animal);

    return animal;
  }

  /**
   * Remove an animal from tracking (after being collected)
   */
  public removeAnimal(animal: AnimalEntity): void {
    this._animals.delete(animal);
    if (animal.isSpawned) {
      animal.despawn();
    }
  }

  /**
   * Respawn animals if needed after a pair is collected
   */
  public respawnAnimalsIfNeeded(animalType: string): void {
    if (!GameConfig.instance.animals.respawn_on_pair_completion) {
      return;
    }

    const animalConfig = GameConfig.instance.getAnimalTypeById(animalType);
    if (!animalConfig) return;

    // Spawn 2 new animals of this type
    for (let i = 0; i < 2; i++) {
      this._spawnAnimalOfType(animalType, animalConfig.spawn_tags, animalConfig.preferred_tiers);
    }
  }

  /**
   * Try to have an animal follow a player
   */
  public tryFollowPlayer(animal: AnimalEntity, player: Player): boolean {
    const config = GameConfig.instance;
    const currentlyFollowing = this.getAnimalsFollowingPlayer(player);

    if (currentlyFollowing.length >= config.maxAnimalsFollowing) {
      return false;
    }

    return animal.startFollowing(player);
  }

  /**
   * Release all animals following a player
   */
  public releaseAnimalsFromPlayer(player: Player): void {
    const following = this.getAnimalsFollowingPlayer(player);
    following.forEach(animal => animal.stopFollowing());
  }

  /**
   * Despawn all animals (for game reset)
   */
  public despawnAllAnimals(): void {
    this._animals.forEach(animal => {
      if (animal.isSpawned) {
        animal.despawn();
      }
    });
    this._animals.clear();
  }

  /**
   * Reset pairs collected (for new game)
   */
  public resetPairsCollected(): void {
    this._pairsCollected.clear();
  }
}
