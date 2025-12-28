/**
 * AnimalManager - Handles spawning and tracking animals in the world
 */

import type { World, Vector3Like, Player } from 'hytopia';
import AnimalEntity from '../entities/AnimalEntity';
import GameConfig from '../GameConfig';

// Spawn zones by tier and biome type
interface SpawnZone {
  position: Vector3Like;
  tier: number;
  tags: string[];
}

// Map-specific spawn zones loaded from JSON files
import mountAraratSpawnZones from '../../../assets/mount-ararat-spawn-zones.json';
import plainsOfShinarSpawnZones from '../../../assets/plains-of-shinar-spawn-zones.json';

// Determine which map is loaded
const MAP_NAME = process.env.MAP_NAME || 'mount-ararat';

// Convert JSON spawn zones to SpawnZone format
// For mount-ararat solo mode, only use south-side zones (Z <= 0)
// North-side zones are reserved for future PVP mode
function loadSpawnZones(mapName: string): SpawnZone[] {
  const rawZones = mapName === 'mount-ararat' ? mountAraratSpawnZones : plainsOfShinarSpawnZones;

  return rawZones
    .filter((zone: any) => {
      // For mount-ararat, only include south-side zones (Z <= 0) for solo mode
      // This excludes north-t1-*, north-t2-*, north-t3-* zones
      if (mapName === 'mount-ararat') {
        return zone.z <= 0;
      }
      return true;
    })
    .map((zone: any) => ({
      position: { x: zone.x, y: zone.y, z: zone.z },
      tier: zone.tier,
      tags: [zone.biome],
    }));
}

const SPAWN_ZONES: SpawnZone[] = loadSpawnZones(MAP_NAME);

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
   * PERFORMANCE: Get nearby animals within a radius (for Animal Magnet power-up)
   * Uses early rejection tests to avoid expensive distance calculations
   */
  public getNearbyAnimals(position: Vector3Like, radius: number, maxCount: number = Infinity): AnimalEntity[] {
    const radiusSquared = radius * radius;
    const nearby: AnimalEntity[] = [];

    for (const animal of this._animals) {
      // Quick checks first (cheapest operations)
      if (!animal.isSpawned || animal.isFollowing) continue;

      // PERFORMANCE: Quick axis-aligned rejection test (avoids sqrt)
      // If the animal is more than radius blocks away on ANY axis, skip it
      const dx = animal.position.x - position.x;
      if (Math.abs(dx) > radius) continue; // X-axis rejection

      const dz = animal.position.z - position.z;
      if (Math.abs(dz) > radius) continue; // Z-axis rejection

      // Only now calculate squared distance (no sqrt needed!)
      const distanceSquared = dx * dx + dz * dz;

      if (distanceSquared <= radiusSquared) {
        nearby.push(animal);

        // PERFORMANCE: Early exit when we have enough animals
        if (nearby.length >= maxCount) break;
      }
    }

    return nearby;
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
   * PERFORMANCE: Animals spawn as static (no tick events) until player interacts
   */
  public spawnInitialAnimals(): void {
    const config = GameConfig.instance;

    // Spawn animals for each type based on pairs required
    for (const animalType of config.animalTypes) {
      // Spawn 2 animals per required pair (need pairs to collect)
      const animalsToSpawn = animalType.pairs_required * 2;

      // PERFORMANCE: Spawn pairs on opposite sides of the map
      for (let i = 0; i < animalsToSpawn; i++) {
        const spawnOnNorthSide = i % 2 === 0; // First animal north, second south (for pairs)
        this._spawnAnimalOfType(animalType.id, animalType.spawn_tags, animalType.preferred_tiers, spawnOnNorthSide);
      }
    }
  }

  /**
   * Spawn a specific animal type at an appropriate location
   * @param spawnOnNorthSide - If true, spawn on north side (Z > 0), else south side (Z <= 0)
   */
  private _spawnAnimalOfType(animalType: string, spawnTags: string[], preferredTiers: number[], spawnOnNorthSide: boolean = false): AnimalEntity | null {
    if (this._animals.size >= this._maxAnimals) {
      return null;
    }

    // PERFORMANCE: Only spawn in mid-to-top tiers (Tier 2 and 3) to keep animals safe from flood
    const safeTiers = [2, 3];

    // Find suitable spawn zones
    const suitableZones = SPAWN_ZONES.filter(zone => {
      // PERFORMANCE: Only use mid-to-top tiers (safe from flood at start)
      if (!safeTiers.includes(zone.tier)) return false;

      // PERFORMANCE: Filter by map side (north vs south)
      if (spawnOnNorthSide && zone.position.z <= 0) return false;
      if (!spawnOnNorthSide && zone.position.z > 0) return false;

      // Check if zone has matching tags (or animal has no tag preference)
      const hasMatchingTag = spawnTags.some(tag => zone.tags.includes(tag)) || spawnTags.length === 0;

      return hasMatchingTag;
    });

    if (suitableZones.length === 0) {
      // Fallback: Use any mid-to-top tier zone on the correct side
      const fallbackZones = SPAWN_ZONES.filter(zone => {
        const isSafeTier = safeTiers.includes(zone.tier);
        const isCorrectSide = spawnOnNorthSide ? zone.position.z > 0 : zone.position.z <= 0;
        return isSafeTier && isCorrectSide;
      });

      if (fallbackZones.length === 0) {
        // Last resort: any safe tier zone
        const anySafeZone = SPAWN_ZONES.find(zone => safeTiers.includes(zone.tier));
        if (!anySafeZone) return null;
        return this._spawnAnimalAt(animalType, anySafeZone);
      }

      const randomZone = fallbackZones[Math.floor(Math.random() * fallbackZones.length)];
      return this._spawnAnimalAt(animalType, randomZone);
    }

    // Pick a random suitable zone
    const zone = suitableZones[Math.floor(Math.random() * suitableZones.length)];
    return this._spawnAnimalAt(animalType, zone);
  }

  /**
   * Spawn an animal at a specific zone with some random offset
   * Uses ACTUAL terrain height from the world, not the outdated JSON values
   */
  private _spawnAnimalAt(animalType: string, zone: SpawnZone): AnimalEntity {
    const animal = new AnimalEntity({
      animalType,
      spawnTier: zone.tier,
    });

    // Add random offset to spread animals across the zone area
    // Increased spread for better distribution (±10 blocks instead of ±3)
    const offsetX = (Math.random() - 0.5) * 20;
    const offsetZ = (Math.random() - 0.5) * 20;

    const targetX = Math.round(zone.position.x + offsetX);
    const targetZ = Math.round(zone.position.z + offsetZ);

    // Get ACTUAL terrain height at this position by raycasting down
    // This ensures animals spawn ON TOP of terrain, not inside it
    // IMPORTANT: Start raycast much higher and cast further for tall mountains
    let spawnY = 30; // Higher default fallback for mid-tier zones

    // Raycast from very high above to find the actual ground level
    const rayStart = { x: targetX, y: 100, z: targetZ }; // Start very high (above tallest mountain)
    const rayDir = { x: 0, y: -1, z: 0 }; // Cast downward
    const rayResult = this._world.simulation.raycast(rayStart, rayDir, 120, {
      filterFlags: 2, // Only hit blocks, not entities
    });

    if (rayResult && rayResult.hitPoint) {
      // Spawn 1.5 blocks above the hit point (on top of terrain)
      spawnY = rayResult.hitPoint.y + 1.5;
    } else {
      // Raycast failed - use zone's Y position as safer fallback
      // Add extra height to ensure we're above terrain
      spawnY = Math.max(zone.position.y + 5, 25);
    }

    const spawnPos = {
      x: targetX,
      y: spawnY,
      z: targetZ,
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

    // Spawn 2 new animals of this type on opposite sides
    for (let i = 0; i < 2; i++) {
      const spawnOnNorthSide = i % 2 === 0;
      this._spawnAnimalOfType(animalType, animalConfig.spawn_tags, animalConfig.preferred_tiers, spawnOnNorthSide);
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

  /**
   * Update all animals with the current flood level
   * Animals will flee to higher ground if they're too close to the water
   */
  public updateFloodLevel(floodHeight: number): void {
    this._animals.forEach(animal => {
      animal.updateFloodLevel(floodHeight);
    });
  }
}
