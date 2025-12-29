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

// Maximum spawn height - must be BELOW the drop-off platform (Y=24 for mount-ararat)
// This prevents animals from spawning higher than where players need to deliver them
const MAX_SPAWN_HEIGHT = 23;

// Minimum spawn height - must be ABOVE the flood starting level
// Flood starts at Y=2 and rises, so animals should spawn well above this
const MIN_SPAWN_HEIGHT = 12;

// Map-specific spawn zones loaded from JSON files
import mountAraratSpawnZones from '../../../assets/mount-ararat-spawn-zones.json';
import plainsOfShinarSpawnZones from '../../../assets/plains-of-shinar-spawn-zones.json';

// Determine which map is loaded
const MAP_NAME = process.env.MAP_NAME || 'mount-ararat';

// Convert JSON spawn zones to SpawnZone format
// For mount-ararat solo mode, only use south-side zones (Z <= 0)
// North-side zones are reserved for future PVP mode
// Also filters out zones above the drop-off platform height and below flood level
function loadSpawnZones(mapName: string): SpawnZone[] {
  const rawZones = mapName === 'mount-ararat' ? mountAraratSpawnZones : plainsOfShinarSpawnZones;

  return rawZones
    .filter((zone: any) => {
      // For mount-ararat, only include south-side zones (Z <= 0) for solo mode
      // This excludes north-t1-*, north-t2-*, north-t3-* zones
      if (mapName === 'mount-ararat') {
        if (zone.z > 0) return false;
      }

      // Filter out zones that are above the drop-off platform
      // Animals should spawn BELOW where players need to deliver them
      if (zone.y > MAX_SPAWN_HEIGHT) {
        return false;
      }

      // Filter out zones that are too low (would be in flood waters)
      // Only use Tier 2 zones (Y=15) which are safely above flood
      if (zone.y < MIN_SPAWN_HEIGHT) {
        return false;
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
   * DISTRIBUTION: Animals are spread across different zones to prevent clustering
   *               Pairs are split between east and west sides of the map
   */
  public spawnInitialAnimals(): void {
    const config = GameConfig.instance;

    // Track which zones have been used recently to spread animals out
    const zoneUsageCount: Map<string, number> = new Map();

    // Spawn animals for each type based on pairs required
    for (const animalType of config.animalTypes) {
      // Spawn 2 animals per required pair (need pairs to collect)
      const animalsToSpawn = animalType.pairs_required * 2;

      // Spread the pair across east/west sides of the map
      for (let i = 0; i < animalsToSpawn; i++) {
        const spawnOnEastSide = i % 2 === 0; // First animal east, second west (split pairs)
        this._spawnAnimalOfType(animalType.id, animalType.spawn_tags, animalType.preferred_tiers, spawnOnEastSide, zoneUsageCount);
      }
    }
  }

  /**
   * Spawn a specific animal type at an appropriate location
   * @param spawnOnEastSide - If true, spawn on east side (X >= 0), else west side (X < 0)
   * @param zoneUsageCount - Optional tracking of zone usage for better distribution
   */
  private _spawnAnimalOfType(animalType: string, spawnTags: string[], preferredTiers: number[], spawnOnEastSide: boolean = false, zoneUsageCount?: Map<string, number>): AnimalEntity | null {
    if (this._animals.size >= this._maxAnimals) {
      return null;
    }

    // Find suitable spawn zones based on east/west preference
    const suitableZones = SPAWN_ZONES.filter(zone => {
      // Filter by map side (east vs west based on X coordinate)
      // East side: X >= 0, West side: X < 0
      if (spawnOnEastSide && zone.position.x < 0) return false;
      if (!spawnOnEastSide && zone.position.x >= 0) return false;

      // Check if zone has matching tags (or animal has no tag preference)
      const hasMatchingTag = spawnTags.some(tag => zone.tags.includes(tag)) || spawnTags.length === 0;

      return hasMatchingTag;
    });

    if (suitableZones.length === 0) {
      // Fallback: Use any zone on the correct side (ignore biome tags)
      const fallbackZones = SPAWN_ZONES.filter(zone => {
        const isCorrectSide = spawnOnEastSide ? zone.position.x >= 0 : zone.position.x < 0;
        return isCorrectSide;
      });

      if (fallbackZones.length === 0) {
        // Last resort: any zone (regardless of side)
        if (SPAWN_ZONES.length === 0) return null;
        const zone = this._selectLeastUsedZone(SPAWN_ZONES, zoneUsageCount);
        return this._spawnAnimalAt(animalType, zone);
      }

      const zone = this._selectLeastUsedZone(fallbackZones, zoneUsageCount);
      return this._spawnAnimalAt(animalType, zone);
    }

    // Pick the least-used zone to spread animals out
    const zone = this._selectLeastUsedZone(suitableZones, zoneUsageCount);
    return this._spawnAnimalAt(animalType, zone);
  }

  /**
   * Select the zone with the lowest usage count to spread animals across the map
   * This prevents clustering by preferring zones that have fewer animals
   */
  private _selectLeastUsedZone(zones: SpawnZone[], zoneUsageCount?: Map<string, number>): SpawnZone {
    if (!zoneUsageCount || zones.length <= 1) {
      // No tracking or only one zone - pick randomly
      return zones[Math.floor(Math.random() * zones.length)];
    }

    // Find the minimum usage count among available zones
    let minUsage = Infinity;
    for (const zone of zones) {
      const key = `${zone.position.x},${zone.position.z}`;
      const usage = zoneUsageCount.get(key) ?? 0;
      if (usage < minUsage) {
        minUsage = usage;
      }
    }

    // Get all zones with the minimum usage count
    const leastUsedZones = zones.filter(zone => {
      const key = `${zone.position.x},${zone.position.z}`;
      const usage = zoneUsageCount.get(key) ?? 0;
      return usage === minUsage;
    });

    // Pick randomly from the least-used zones
    const selectedZone = leastUsedZones[Math.floor(Math.random() * leastUsedZones.length)];

    // Update the usage count
    const key = `${selectedZone.position.x},${selectedZone.position.z}`;
    zoneUsageCount.set(key, (zoneUsageCount.get(key) ?? 0) + 1);

    return selectedZone;
  }

  /**
   * Spawn an animal at a specific zone with some random offset
   * Uses ACTUAL terrain height from the world, not the outdated JSON values
   * Caps spawn height to ensure animals spawn BELOW the drop-off platform
   */
  private _spawnAnimalAt(animalType: string, zone: SpawnZone): AnimalEntity {
    const animal = new AnimalEntity({
      animalType,
      spawnTier: zone.tier,
    });

    // Add random offset to spread animals across the zone area
    // Increased spread for better distribution (±12 blocks)
    const offsetX = (Math.random() - 0.5) * 24;
    const offsetZ = (Math.random() - 0.5) * 24;

    const targetX = Math.round(zone.position.x + offsetX);
    const targetZ = Math.round(zone.position.z + offsetZ);

    // Get ACTUAL terrain height at this position by raycasting down
    // This ensures animals spawn ON TOP of terrain, not inside it
    // IMPORTANT: Start raycast much higher and cast further for tall mountains
    let spawnY = 15; // Default fallback for Tier 1/2 zones

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
      spawnY = Math.max(zone.position.y + 3, 10);
    }

    // IMPORTANT: Enforce spawn height limits
    // Animals should spawn ABOVE the flood level but BELOW the drop-off platform
    if (spawnY < MIN_SPAWN_HEIGHT) {
      spawnY = MIN_SPAWN_HEIGHT;
    }
    if (spawnY > MAX_SPAWN_HEIGHT) {
      spawnY = MAX_SPAWN_HEIGHT;
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

    // Spawn 2 new animals of this type on opposite sides (east/west)
    for (let i = 0; i < 2; i++) {
      const spawnOnEastSide = i % 2 === 0;
      this._spawnAnimalOfType(animalType, animalConfig.spawn_tags, animalConfig.preferred_tiers, spawnOnEastSide);
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
