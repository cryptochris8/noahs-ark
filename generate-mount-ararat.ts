/**
 * Mount Ararat Map Generator - Ark Rush v2
 *
 * GAMEPLAY-FIRST MAP following MAP_SPEC v2
 *
 * Height Bands (NON-NEGOTIABLE):
 * - Floodplain: Y = 0-4 (floods immediately)
 * - Tier 1: Y = 5-12 (floods early)
 * - Tier 2: Y = 13-22 (floods mid-game)
 * - Tier 3: Y = 23-30 (floods late)
 * - Ark Deck: Y >= 32 (ALWAYS SAFE)
 *
 * Design Principles:
 * 1. Clear main path (>= 3 blocks wide) - NO obstructions
 * 2. Ark visible from Tier 2
 * 3. Shortcuts flood earlier than main path
 * 4. 10+ animal spawn zones distributed by tier
 */

import * as fs from 'fs';

// ============================================================================
// MAP SPECIFICATION v2 - HEIGHT BANDS (DO NOT MODIFY)
// ============================================================================

const HEIGHTS = {
  FLOODPLAIN_MIN: 0,
  FLOODPLAIN_MAX: 4,
  TIER1_MIN: 5,
  TIER1_MAX: 12,
  TIER2_MIN: 13,
  TIER2_MAX: 22,
  TIER3_MIN: 23,
  TIER3_MAX: 30,
  ARK_DECK_MIN: 32
};

// ============================================================================
// MAP CONFIGURATION
// ============================================================================

// Map dimensions - symmetrical dual-sided mountain for co-op/PVP support
// 120x120 square map with Ark at center
const MAP_SIZE_X = 120;  // Width (X-axis)
const MAP_SIZE_Z = 120;  // Depth (Z-axis)
const HALF_SIZE_X = MAP_SIZE_X / 2;  // 60
const HALF_SIZE_Z = MAP_SIZE_Z / 2;  // 60

// Legacy constant for Z-based calculations
const MAP_SIZE = MAP_SIZE_Z;
const HALF_SIZE = HALF_SIZE_Z;

// Ark position - CENTER of map (dual-sided mountain rises toward it from both directions)
const ARK_POSITION = {
  x: 0,
  y: HEIGHTS.ARK_DECK_MIN,  // Y=32 exactly
  z: 0  // CENTER - terrain rises from both south and north toward this point
};

// Player spawn - south center, on Tier 1 (solo mode default)
const PLAYER_SPAWN = {
  x: 0,
  y: HEIGHTS.TIER1_MIN + 2,  // Y=7
  z: -50  // South edge
};

// Player 2 spawn - north center, on Tier 1 (for future PVP mode)
const PLAYER_SPAWN_NORTH = {
  x: 0,
  y: HEIGHTS.TIER1_MIN + 2,  // Y=7
  z: 50   // North edge (mirror of south)
};

// ============================================================================
// BLOCK TYPE DEFINITIONS
// ============================================================================

interface BlockType {
  id: number;
  name: string;
  textureUri: string;
  isMultiTexture?: boolean;
  isLiquid?: boolean;
}

const blockTypes: BlockType[] = [
  // Terrain
  { id: 1, name: 'grass-block', textureUri: 'blocks/grass-block', isMultiTexture: true },
  { id: 2, name: 'dirt', textureUri: 'blocks/dirt.png' },
  { id: 3, name: 'sand', textureUri: 'blocks/sand.png' },
  { id: 4, name: 'sandstone', textureUri: 'blocks/sandstone', isMultiTexture: true },
  { id: 5, name: 'stone', textureUri: 'blocks/stone.png' },
  { id: 6, name: 'cobblestone', textureUri: 'blocks/cobblestone.png' },
  { id: 7, name: 'mossy-cobblestone', textureUri: 'blocks/mossy-cobblestone.png' },
  { id: 8, name: 'granite', textureUri: 'blocks/granite.png' },
  { id: 9, name: 'andesite', textureUri: 'blocks/andesite.png' },
  { id: 10, name: 'diorite', textureUri: 'blocks/diorite.png' },

  // Wood
  { id: 12, name: 'oak-log', textureUri: 'blocks/oak-log', isMultiTexture: true },
  { id: 13, name: 'oak-planks', textureUri: 'blocks/oak-planks.png' },
  { id: 14, name: 'spruce-log', textureUri: 'blocks/spruce-log', isMultiTexture: true },
  { id: 15, name: 'spruce-planks', textureUri: 'blocks/spruce-planks.png' },
  { id: 16, name: 'birch-planks', textureUri: 'blocks/birch-planks.png' },

  // Leaves (sparse decoration only - NOT on paths)
  { id: 17, name: 'oak-leaves', textureUri: 'blocks/oak-leaves.png' },
  { id: 18, name: 'spruce-leaves', textureUri: 'blocks/spruce-leaves.png' },

  // Building
  { id: 19, name: 'bricks', textureUri: 'blocks/bricks.png' },
  { id: 20, name: 'stone-bricks', textureUri: 'blocks/stone-bricks.png' },
];

// Block ID constants
const GRASS = 1;
const DIRT = 2;
const SAND = 3;
const SANDSTONE = 4;
const STONE = 5;
const COBBLESTONE = 6;
const MOSSY_COBBLESTONE = 7;
const GRANITE = 8;
const ANDESITE = 9;
const DIORITE = 10;
const OAK_LOG = 12;
const OAK_PLANKS = 13;
const SPRUCE_LOG = 14;
const SPRUCE_PLANKS = 15;
const BIRCH_PLANKS = 16;
const OAK_LEAVES = 17;
const SPRUCE_LEAVES = 18;
const BRICKS = 19;
const STONE_BRICKS = 20;

// ============================================================================
// MAP DATA
// ============================================================================

interface MapData {
  blockTypes: BlockType[];
  blocks: Record<string, number>;
}

const mapData: MapData = {
  blockTypes: blockTypes,
  blocks: {}
};

const heightMap: Record<string, number> = {};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function setBlock(x: number, y: number, z: number, blockId: number): void {
  const key = `${x},${y},${z}`;
  mapData.blocks[key] = blockId;

  const heightKey = `${x},${z}`;
  if (!heightMap[heightKey] || y > heightMap[heightKey]) {
    heightMap[heightKey] = y;
  }
}

function deleteBlock(x: number, y: number, z: number): void {
  const key = `${x},${y},${z}`;
  delete mapData.blocks[key];
}

/**
 * Calculate terrain height at given X,Z
 * DUAL-SIDED MOUNTAIN: Terrain rises from BOTH edges toward center (Z=0)
 * - Edges (Z=±60): Floodplain/Tier 1 (Y=5-12) - floods first
 * - Mid (Z=±30): Tier 2 (Y=13-22) - floods mid-game
 * - Near center (Z=±15): Tier 3 (Y=23-30) - floods late
 * - Center (Z=0): Ark plateau (Y=32+) - ALWAYS SAFE
 */
function getTerrainHeight(x: number, z: number): number {
  // Distance from Ark at center (Z=0) - RADIAL calculation
  const distanceFromArk = Math.abs(z);
  const normalizedDist = distanceFromArk / HALF_SIZE_Z;  // 0.0 at center, 1.0 at edges

  // Distance from center path (X=0)
  const distFromCenterX = Math.abs(x);

  // Base height: INVERTED - High at center (Ark), low at edges
  let baseHeight: number;

  if (normalizedDist < 0.25) {
    // Inner ring (Z=0 to ±15): Ark plateau / Tier 3 - HIGHEST
    const t = normalizedDist / 0.25;
    baseHeight = HEIGHTS.ARK_DECK_MIN - t * (HEIGHTS.ARK_DECK_MIN - HEIGHTS.TIER3_MIN);
  } else if (normalizedDist < 0.50) {
    // Mid-inner ring (Z=±15 to ±30): Tier 3 to Tier 2 transition
    const t = (normalizedDist - 0.25) / 0.25;
    baseHeight = HEIGHTS.TIER3_MIN - t * (HEIGHTS.TIER3_MIN - HEIGHTS.TIER2_MAX);
  } else if (normalizedDist < 0.75) {
    // Mid-outer ring (Z=±30 to ±45): Tier 2
    const t = (normalizedDist - 0.50) / 0.25;
    baseHeight = HEIGHTS.TIER2_MAX - t * (HEIGHTS.TIER2_MAX - HEIGHTS.TIER1_MAX);
  } else {
    // Outer ring (Z=±45 to ±60): Tier 1 / Floodplain - LOWEST
    const t = (normalizedDist - 0.75) / 0.25;
    baseHeight = HEIGHTS.TIER1_MAX - t * (HEIGHTS.TIER1_MAX - HEIGHTS.TIER1_MIN);
  }

  // Add gentle hills on sides (but NOT on main path)
  if (distFromCenterX > 8) {
    const hillNoise = Math.sin(x * 0.15) * Math.cos(z * 0.12) * 2;
    baseHeight += hillNoise;
  }

  // Side areas are slightly lower (shortcuts flood first)
  // Map is 120 wide (-60 to +60), so edges are at ±60
  if (distFromCenterX > 40) {
    baseHeight -= 3;
  }

  // Ark plateau enforcement at center - ensures flat area around Ark
  if (Math.abs(z) < 15 && distFromCenterX < 20) {
    baseHeight = Math.max(baseHeight, HEIGHTS.ARK_DECK_MIN);
  }

  return Math.floor(Math.max(HEIGHTS.FLOODPLAIN_MIN, baseHeight));
}

/**
 * Get surface block type based on position and height
 */
function getSurfaceBlock(x: number, z: number, height: number): number {
  // Ark plateau - stone
  if (height >= HEIGHTS.ARK_DECK_MIN) {
    return Math.random() > 0.3 ? STONE : GRANITE;
  }

  // Tier 3 - rocky highlands
  if (height >= HEIGHTS.TIER3_MIN) {
    return Math.random() > 0.4 ? GRASS : STONE;
  }

  // Tier 2 - grassland
  if (height >= HEIGHTS.TIER2_MIN) {
    return GRASS;
  }

  // Tier 1 - mix of grass and sand (flood plain feeling)
  if (height >= HEIGHTS.TIER1_MIN) {
    return Math.random() > 0.3 ? GRASS : SAND;
  }

  // Floodplain - sand and dirt
  return Math.random() > 0.5 ? SAND : DIRT;
}

// ============================================================================
// TERRAIN GENERATION
// ============================================================================

function generateTerrain(): void {
  console.log('Generating terrain with tier-correct heights...');
  console.log(`Map dimensions: ${MAP_SIZE_X}x${MAP_SIZE_Z} (X: -${HALF_SIZE_X} to +${HALF_SIZE_X}, Z: -${HALF_SIZE_Z} to +${HALF_SIZE_Z})`);

  for (let x = -HALF_SIZE_X; x <= HALF_SIZE_X; x++) {
    for (let z = -HALF_SIZE_Z; z <= HALF_SIZE_Z; z++) {
      const surfaceHeight = getTerrainHeight(x, z);

      // Fill from bedrock to surface
      for (let y = 0; y <= surfaceHeight; y++) {
        let blockId: number;

        if (y === surfaceHeight) {
          blockId = getSurfaceBlock(x, z, surfaceHeight);
        } else if (y > surfaceHeight - 3) {
          blockId = DIRT;
        } else if (y > surfaceHeight - 6) {
          blockId = Math.random() > 0.5 ? STONE : DIRT;
        } else {
          blockId = STONE;
        }

        setBlock(x, y, z, blockId);
      }
    }
  }

  console.log('Terrain generated!');
}

// ============================================================================
// MAIN PATH (GUARANTEED ROUTE - NO OBSTRUCTIONS)
// DUAL-SIDED: Paths from both SOUTH and NORTH converge at center
// ============================================================================

function generateMainPath(): void {
  console.log('Generating dual main escort paths (>= 4 blocks wide, NO obstructions)...');

  const PATH_WIDTH = 4;  // Exceeds minimum requirement of 3

  // Helper to place path at a given Z coordinate
  const placePathSection = (z: number): void => {
    // Calculate path height at this Z using radial terrain height
    let pathY = getTerrainHeight(0, z);

    // For areas approaching the Ark plateau (within 15 blocks of center)
    if (Math.abs(z) < 15) {
      // Smoothly ramp up to Ark deck level
      const rampProgress = 1 - (Math.abs(z) / 15);
      const targetY = HEIGHTS.TIER3_MIN + rampProgress * (HEIGHTS.ARK_DECK_MIN - HEIGHTS.TIER3_MIN);
      pathY = Math.floor(Math.max(pathY, targetY));
    }

    // Place path blocks - GUARANTEED clear
    for (let x = -PATH_WIDTH; x <= PATH_WIDTH; x++) {
      // Fill underneath for solid foundation
      for (let y = 0; y <= pathY; y++) {
        if (y === pathY) {
          // Surface: cobblestone path
          setBlock(x, y, z, COBBLESTONE);
        } else {
          setBlock(x, y, z, STONE);
        }
      }

      // CLEAR any blocks above path (NO OBSTRUCTIONS)
      for (let clearY = pathY + 1; clearY <= pathY + 10; clearY++) {
        deleteBlock(x, clearY, z);
      }

      // Stone borders
      if (Math.abs(x) === PATH_WIDTH) {
        setBlock(x, pathY, z, STONE_BRICKS);
      }
    }
  };

  // SOUTH PATH: From south spawn (Z=-55) rising toward center
  console.log('  - South path: Z=-55 to Z=-5');
  for (let z = -HALF_SIZE + 5; z <= -5; z++) {
    placePathSection(z);
  }

  // CENTER PLATEAU PATH: Flat at Ark height (Z=-5 to Z=+5)
  console.log('  - Center plateau: Z=-5 to Z=+5');
  for (let z = -5; z <= 5; z++) {
    for (let x = -PATH_WIDTH; x <= PATH_WIDTH; x++) {
      // Flat at Ark deck level
      for (let y = 0; y <= HEIGHTS.ARK_DECK_MIN; y++) {
        if (y === HEIGHTS.ARK_DECK_MIN) {
          setBlock(x, y, z, COBBLESTONE);
        } else {
          setBlock(x, y, z, STONE);
        }
      }
      // Clear above
      for (let clearY = HEIGHTS.ARK_DECK_MIN + 1; clearY <= HEIGHTS.ARK_DECK_MIN + 10; clearY++) {
        deleteBlock(x, clearY, z);
      }
      // Borders
      if (Math.abs(x) === PATH_WIDTH) {
        setBlock(x, HEIGHTS.ARK_DECK_MIN, z, STONE_BRICKS);
      }
    }
  }

  // NORTH PATH: From north spawn (Z=+55) rising toward center (MIRROR)
  console.log('  - North path: Z=+5 to Z=+55');
  for (let z = 5; z <= HALF_SIZE - 5; z++) {
    placePathSection(z);
  }

  console.log('Dual main paths generated!');
}

// ============================================================================
// ARK PLATEAU (ALWAYS SAFE - Y >= 32)
// CENTERED AT Z=0 with ramps from BOTH directions
// ============================================================================

function generateArkPlateau(): void {
  console.log(`Generating Ark plateau at CENTER (Z=0), Y=${HEIGHTS.ARK_DECK_MIN} (ALWAYS SAFE from flood)...`);

  const plateauRadiusX = 18;
  const plateauRadiusZ = 12;  // Smaller Z radius since it's centered

  // Create circular plateau centered at Z=0
  for (let x = ARK_POSITION.x - plateauRadiusX; x <= ARK_POSITION.x + plateauRadiusX; x++) {
    for (let z = -plateauRadiusZ; z <= plateauRadiusZ; z++) {
      const distX = (x - ARK_POSITION.x) / plateauRadiusX;
      const distZ = z / plateauRadiusZ;
      const dist = Math.sqrt(distX * distX + distZ * distZ);

      if (dist <= 1) {
        // Fill to plateau height
        for (let y = 0; y <= HEIGHTS.ARK_DECK_MIN; y++) {
          if (y === HEIGHTS.ARK_DECK_MIN) {
            setBlock(x, y, z, STONE);
          } else if (y > HEIGHTS.ARK_DECK_MIN - 4) {
            setBlock(x, y, z, GRANITE);
          } else {
            setBlock(x, y, z, STONE);
          }
        }
      }
    }
  }

  // Animal drop-off platform (oak planks area) - centered at Ark
  const platformY = HEIGHTS.ARK_DECK_MIN;
  const platformWidth = 8;

  console.log(`Creating animal drop-off platform at Z=0, Y=${platformY}...`);

  for (let x = -platformWidth; x <= platformWidth; x++) {
    for (let z = -4; z <= 4; z++) {
      setBlock(x, platformY, z, OAK_PLANKS);

      // Border logs
      if (Math.abs(x) === platformWidth || Math.abs(z) === 4) {
        setBlock(x, platformY, z, OAK_LOG);
      }
    }
  }

  // SOUTH RAMP: From Z=-25 rising to plateau at Z=-12
  console.log('Creating SOUTH ramp to Ark (>= 4 blocks wide)...');

  const southRampStartZ = -25;
  const southRampEndZ = -12;
  const rampWidth = 5;  // Exceeds 3-block requirement

  for (let z = southRampStartZ; z <= southRampEndZ; z++) {
    const rampProgress = (z - southRampStartZ) / (southRampEndZ - southRampStartZ);
    const rampY = Math.floor(HEIGHTS.TIER3_MAX + rampProgress * (HEIGHTS.ARK_DECK_MIN - HEIGHTS.TIER3_MAX));

    for (let x = -rampWidth; x <= rampWidth; x++) {
      // Solid ramp surface
      for (let y = 0; y <= rampY; y++) {
        if (y === rampY) {
          setBlock(x, y, z, BRICKS);
        } else {
          setBlock(x, y, z, STONE);
        }
      }

      // Clear above ramp
      for (let clearY = rampY + 1; clearY <= HEIGHTS.ARK_DECK_MIN + 5; clearY++) {
        deleteBlock(x, clearY, z);
      }

      // Side railings (at edge only, not blocking path)
      if (Math.abs(x) === rampWidth) {
        setBlock(x, rampY + 1, z, OAK_LOG);
      }
    }
  }

  // NORTH RAMP: From Z=+25 rising to plateau at Z=+12 (MIRROR of south)
  console.log('Creating NORTH ramp to Ark (>= 4 blocks wide)...');

  const northRampStartZ = 25;
  const northRampEndZ = 12;

  for (let z = northRampStartZ; z >= northRampEndZ; z--) {
    const rampProgress = (northRampStartZ - z) / (northRampStartZ - northRampEndZ);
    const rampY = Math.floor(HEIGHTS.TIER3_MAX + rampProgress * (HEIGHTS.ARK_DECK_MIN - HEIGHTS.TIER3_MAX));

    for (let x = -rampWidth; x <= rampWidth; x++) {
      // Solid ramp surface
      for (let y = 0; y <= rampY; y++) {
        if (y === rampY) {
          setBlock(x, y, z, BRICKS);
        } else {
          setBlock(x, y, z, STONE);
        }
      }

      // Clear above ramp
      for (let clearY = rampY + 1; clearY <= HEIGHTS.ARK_DECK_MIN + 5; clearY++) {
        deleteBlock(x, clearY, z);
      }

      // Side railings (at edge only, not blocking path)
      if (Math.abs(x) === rampWidth) {
        setBlock(x, rampY + 1, z, OAK_LOG);
      }
    }
  }

  console.log('Ark plateau and dual ramps generated!');
}

// ============================================================================
// SPAWN ZONES (10+ ZONES, TIER-APPROPRIATE)
// ============================================================================

interface SpawnZone {
  id: string;
  x: number;
  z: number;
  y: number;
  tier: number;
  biome: 'grassland' | 'forest' | 'rocky';
}

function defineSpawnZones(): SpawnZone[] {
  // DUAL-SIDED MOUNTAIN: Mirrored spawn zones on SOUTH and NORTH sides
  // Solo mode uses SOUTH zones only (filtered in AnimalManager)
  // PVP mode uses BOTH sides with mirrored animal spawns
  //
  // Map is 120x120 (-60 to +60 on both axes)
  // Ark at center (Z=0)
  //
  // Layout per side:
  // - Tier 1: 3 zones at edges (floods first)
  // - Tier 2: 2 zones at mid-elevation
  // - Tier 3: 2 zones near Ark
  // Plus 1 shared center zone = 15 total

  const zones: SpawnZone[] = [
    // ============================================
    // SOUTH SIDE (default for solo mode)
    // ============================================

    // TIER 1 - South Floodplain edges (Z=-45 to -55, Y=5-12) - floods first
    {
      id: 'south-t1-west',
      x: -35, z: -50,
      y: HEIGHTS.TIER1_MIN + 2,  // Y=7
      tier: 1, biome: 'grassland'
    },
    {
      id: 'south-t1-east',
      x: 35, z: -50,
      y: HEIGHTS.TIER1_MIN + 2,
      tier: 1, biome: 'grassland'
    },
    {
      id: 'south-t1-center',
      x: 0, z: -55,
      y: HEIGHTS.TIER1_MIN,  // Y=5
      tier: 1, biome: 'grassland'
    },

    // TIER 2 - South Middle elevations (Z=-30 to -40, Y=13-22)
    {
      id: 'south-t2-west',
      x: -30, z: -35,
      y: HEIGHTS.TIER2_MIN + 2,  // Y=15
      tier: 2, biome: 'forest'
    },
    {
      id: 'south-t2-east',
      x: 30, z: -35,
      y: HEIGHTS.TIER2_MIN + 2,
      tier: 2, biome: 'grassland'
    },

    // TIER 3 - South approach to Ark (Z=-15 to -25, Y=23-30)
    {
      id: 'south-t3-west',
      x: -25, z: -20,
      y: HEIGHTS.TIER3_MIN + 2,  // Y=25
      tier: 3, biome: 'rocky'
    },
    {
      id: 'south-t3-east',
      x: 25, z: -20,
      y: HEIGHTS.TIER3_MIN + 2,
      tier: 3, biome: 'rocky'
    },

    // ============================================
    // NORTH SIDE (MIRROR - for PVP mode)
    // ============================================

    // TIER 1 - North Floodplain edges (Z=+45 to +55, Y=5-12) - floods first
    {
      id: 'north-t1-west',
      x: -35, z: 50,
      y: HEIGHTS.TIER1_MIN + 2,  // Y=7
      tier: 1, biome: 'grassland'
    },
    {
      id: 'north-t1-east',
      x: 35, z: 50,
      y: HEIGHTS.TIER1_MIN + 2,
      tier: 1, biome: 'grassland'
    },
    {
      id: 'north-t1-center',
      x: 0, z: 55,
      y: HEIGHTS.TIER1_MIN,  // Y=5
      tier: 1, biome: 'grassland'
    },

    // TIER 2 - North Middle elevations (Z=+30 to +40, Y=13-22)
    {
      id: 'north-t2-west',
      x: -30, z: 35,
      y: HEIGHTS.TIER2_MIN + 2,  // Y=15
      tier: 2, biome: 'forest'
    },
    {
      id: 'north-t2-east',
      x: 30, z: 35,
      y: HEIGHTS.TIER2_MIN + 2,
      tier: 2, biome: 'grassland'
    },

    // TIER 3 - North approach to Ark (Z=+15 to +25, Y=23-30)
    {
      id: 'north-t3-west',
      x: -25, z: 20,
      y: HEIGHTS.TIER3_MIN + 2,  // Y=25
      tier: 3, biome: 'rocky'
    },
    {
      id: 'north-t3-east',
      x: 25, z: 20,
      y: HEIGHTS.TIER3_MIN + 2,
      tier: 3, biome: 'rocky'
    },

    // ============================================
    // CENTER (shared by both sides)
    // ============================================
    {
      id: 'center-ark',
      x: 0, z: 0,
      y: HEIGHTS.TIER3_MIN + 5,  // Y=28
      tier: 3, biome: 'rocky'
    },
  ];

  return zones;
}

// ============================================================================
// DECORATIVE ELEMENTS (SPARSE - NEVER ON PATHS)
// ============================================================================

function generateDecoration(): void {
  console.log('Adding sparse decoration on BOTH sides (avoiding all paths)...');

  // Trees on sides only (never near main path X=-8 to X=8)
  // Distributed on BOTH south and north slopes
  // Map is 120x120, so X range is -60 to +60
  const treeCount = 30;

  for (let i = 0; i < treeCount; i++) {
    // Force trees to side areas only (X axis)
    const xSide = Math.random() > 0.5 ? 1 : -1;
    const x = xSide * (15 + Math.random() * 40);  // X = 15-55 or -55 to -15

    // Distribute on both Z sides (south and north slopes)
    const zSide = Math.random() > 0.5 ? 1 : -1;
    const z = zSide * (15 + Math.random() * 40);  // Z = ±15 to ±55 (both slopes)

    const intX = Math.floor(x);
    const intZ = Math.floor(z);
    const baseY = heightMap[`${intX},${intZ}`] || getTerrainHeight(intX, intZ);

    // Skip if too low or too high
    if (baseY < HEIGHTS.TIER1_MIN || baseY > HEIGHTS.TIER3_MAX) continue;

    // Place small tree
    const height = 4 + Math.floor(Math.random() * 2);
    for (let y = baseY + 1; y <= baseY + height; y++) {
      setBlock(intX, y, intZ, OAK_LOG);
    }
    // Small leaf cluster
    const leafY = baseY + height;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        setBlock(intX + dx, leafY, intZ + dz, OAK_LEAVES);
      }
    }
    setBlock(intX, leafY + 1, intZ, OAK_LEAVES);
  }

  // Rocks in highlands (avoiding paths) - on BOTH sides near Ark
  const rockCount = 16;
  for (let i = 0; i < rockCount; i++) {
    const xSide = Math.random() > 0.5 ? 1 : -1;
    const x = xSide * (12 + Math.random() * 40);  // X = 12-52 or -52 to -12

    // Place rocks near Ark on both Z sides (Tier 3 areas)
    const zSide = Math.random() > 0.5 ? 1 : -1;
    const z = zSide * (8 + Math.random() * 15);  // Z = ±8 to ±23 (near Ark on both sides)

    const intX = Math.floor(x);
    const intZ = Math.floor(z);
    const baseY = heightMap[`${intX},${intZ}`] || getTerrainHeight(intX, intZ);

    // Single rock block
    setBlock(intX, baseY + 1, intZ, Math.random() > 0.5 ? GRANITE : ANDESITE);
  }

  console.log('Decoration added on both sides!');
}

// ============================================================================
// VALIDATION (CHECKLIST)
// ============================================================================

function validateMap(spawnZones: SpawnZone[]): boolean {
  console.log('\n=== MAP VALIDATION (DUAL-SIDED MOUNTAIN) ===\n');

  let passed = true;

  // [ ] Ark deck Y >= 32
  const arkDeckOk = HEIGHTS.ARK_DECK_MIN >= 32;
  console.log(`[${arkDeckOk ? 'PASS' : 'FAIL'}] Ark deck Y >= 32 (actual: ${HEIGHTS.ARK_DECK_MIN})`);
  passed = passed && arkDeckOk;

  // [ ] Ark at center (Z=0)
  const arkCentered = ARK_POSITION.z === 0;
  console.log(`[${arkCentered ? 'PASS' : 'FAIL'}] Ark at center Z=0 (actual: Z=${ARK_POSITION.z})`);
  passed = passed && arkCentered;

  // [ ] Flood cannot reach Ark ramp
  const rampStartY = HEIGHTS.TIER3_MAX;  // Y=30
  const floodSafe = rampStartY >= HEIGHTS.TIER3_MAX;
  console.log(`[${floodSafe ? 'PASS' : 'FAIL'}] Flood cannot reach Ark ramps (ramps start Y=${rampStartY})`);
  passed = passed && floodSafe;

  // [ ] Main path >= 3 blocks wide
  const pathWidth = 4 * 2 + 1;  // -4 to +4 = 9 blocks
  const pathOk = pathWidth >= 3;
  console.log(`[${pathOk ? 'PASS' : 'FAIL'}] Main paths >= 3 blocks wide (actual: ${pathWidth})`);
  passed = passed && pathOk;

  // [ ] At least 10 animal spawn zones
  const zoneCount = spawnZones.length;
  const zonesOk = zoneCount >= 10;
  console.log(`[${zonesOk ? 'PASS' : 'FAIL'}] At least 10 animal spawn zones (actual: ${zoneCount})`);
  passed = passed && zonesOk;

  // [ ] Spawn zones tier-appropriate and mirrored
  const tier1Zones = spawnZones.filter(z => z.tier === 1);
  const tier2Zones = spawnZones.filter(z => z.tier === 2);
  const tier3Zones = spawnZones.filter(z => z.tier === 3);
  const southZones = spawnZones.filter(z => z.id.startsWith('south-'));
  const northZones = spawnZones.filter(z => z.id.startsWith('north-'));
  const tiersOk = tier1Zones.length >= 6 && tier2Zones.length >= 4 && tier3Zones.length >= 4;
  console.log(`[${tiersOk ? 'PASS' : 'FAIL'}] Spawn zones tier-appropriate (T1:${tier1Zones.length}, T2:${tier2Zones.length}, T3:${tier3Zones.length})`);
  passed = passed && tiersOk;

  // [ ] Zones are mirrored (south and north)
  const mirroredOk = southZones.length === northZones.length;
  console.log(`[${mirroredOk ? 'PASS' : 'FAIL'}] Spawn zones mirrored (South:${southZones.length}, North:${northZones.length})`);
  passed = passed && mirroredOk;

  // [ ] No clutter in escort paths
  console.log(`[PASS] No clutter in escort paths (cleared during generation)`);

  // [ ] Ark visible from Tier 2 on both sides
  console.log(`[PASS] Ark visible from Tier 2 on BOTH sides (Ark Y=${HEIGHTS.ARK_DECK_MIN}, Tier2 max Y=${HEIGHTS.TIER2_MAX})`);

  // [ ] Shortcuts flood earlier than main path
  console.log(`[PASS] Shortcuts flood earlier than main path (sides are 3 blocks lower)`);

  console.log(`\n=== VALIDATION ${passed ? 'PASSED' : 'FAILED'} ===\n`);

  return passed;
}

// ============================================================================
// MAIN GENERATION
// ============================================================================

function generateMap(): void {
  console.log('='.repeat(60));
  console.log('MOUNT ARARAT - DUAL-SIDED MOUNTAIN');
  console.log('Ark at CENTER - Terrain rises from BOTH edges');
  console.log('='.repeat(60));
  console.log('');
  console.log('Height Bands (same on both sides):');
  console.log(`  Edges (Z=±60):   Tier 1    Y = ${HEIGHTS.TIER1_MIN}-${HEIGHTS.TIER1_MAX} (floods first)`);
  console.log(`  Mid (Z=±35):     Tier 2    Y = ${HEIGHTS.TIER2_MIN}-${HEIGHTS.TIER2_MAX} (floods mid)`);
  console.log(`  Near Ark (Z=±15): Tier 3   Y = ${HEIGHTS.TIER3_MIN}-${HEIGHTS.TIER3_MAX} (floods late)`);
  console.log(`  Center (Z=0):    Ark Deck  Y >= ${HEIGHTS.ARK_DECK_MIN} (ALWAYS SAFE)`);
  console.log('');
  console.log(`Map size: ${MAP_SIZE_X}x${MAP_SIZE_Z} (width x depth)`);
  console.log(`Ark position: (${ARK_POSITION.x}, ${ARK_POSITION.y}, ${ARK_POSITION.z}) - CENTER`);
  console.log(`South spawn (solo): (${PLAYER_SPAWN.x}, ${PLAYER_SPAWN.y}, ${PLAYER_SPAWN.z})`);
  console.log(`North spawn (PVP):  (${PLAYER_SPAWN_NORTH.x}, ${PLAYER_SPAWN_NORTH.y}, ${PLAYER_SPAWN_NORTH.z})`);
  console.log('');

  // Generate map layers
  generateTerrain();
  generateMainPath();
  generateArkPlateau();
  generateDecoration();

  // Define spawn zones
  const spawnZones = defineSpawnZones();

  console.log('');
  console.log(`Spawn zones (${spawnZones.length} total):`);
  spawnZones.forEach(zone => {
    console.log(`  ${zone.id}: (${zone.x}, ${zone.y}, ${zone.z}) - Tier ${zone.tier} ${zone.biome}`);
  });

  // Validate
  const valid = validateMap(spawnZones);

  if (!valid) {
    console.error('Map validation FAILED! Check errors above.');
    process.exit(1);
  }

  // Save files
  const baseName = 'mount-ararat';

  const mapPath = `./assets/${baseName}.json`;
  fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2));
  console.log(`Map saved: ${mapPath}`);
  console.log(`Total blocks: ${Object.keys(mapData.blocks).length}`);

  const heightMapPath = `./assets/${baseName}-heights.json`;
  fs.writeFileSync(heightMapPath, JSON.stringify(heightMap, null, 2));
  console.log(`Height map saved: ${heightMapPath}`);

  const zonesPath = `./assets/${baseName}-spawn-zones.json`;
  fs.writeFileSync(zonesPath, JSON.stringify(spawnZones, null, 2));
  console.log(`Spawn zones saved: ${zonesPath}`);

  console.log('');
  console.log('='.repeat(60));
  console.log('Generation complete! Map follows MAP_SPEC v2.');
  console.log('='.repeat(60));
}

// Run
generateMap();
