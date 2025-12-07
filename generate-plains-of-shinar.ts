/**
 * Plains of Shinar Map Generator
 *
 * A biblically-inspired Mesopotamian landscape for Noah's Ark Rush.
 *
 * Based on historical research:
 * - Noah lived in Mesopotamia (modern Iraq), between the Tigris and Euphrates rivers
 * - The land was a flood plain - flat, fertile, vulnerable to flooding
 * - The Ark landed on the "mountains of Ararat" (highlands north of Mesopotamia)
 *
 * Map Layout (150x150):
 * - South: Low flood plain with river channels (Tier 1 - most dangerous)
 * - Center: Terraced farmland and ancient village ruins (Tier 2)
 * - North: Rocky highlands rising toward the Ark (Tier 3 - safest)
 * - Ark positioned on northern mountain plateau
 *
 * Biomes:
 * - Grassland: Central and eastern areas (sheep, cow, pig, chicken, etc.)
 * - Forest: Western highlands with trees (fox, wolf, bear, etc.)
 * - Rocky: Northern highlands near Ark (lizard, bat, penguin, etc.)
 */

import * as fs from 'fs';

// ============================================================================
// MAP CONFIGURATION
// ============================================================================

const MAP_SIZE = 150;
const HALF_SIZE = MAP_SIZE / 2; // 75

// Height configuration
const FLOOD_PLAIN_HEIGHT = 3;      // Tier 1: Y=3-8 (floods first)
const TERRACE_HEIGHT = 12;         // Tier 2: Y=12-18
const HIGHLAND_HEIGHT = 22;        // Tier 3: Y=22-28
const ARK_PLATEAU_HEIGHT = 34;     // Ark sits here
const ARK_POSITION = { x: 0, y: ARK_PLATEAU_HEIGHT, z: 60 }; // North end

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
  // Terrain blocks
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

  // Water (for river channels - decorative only, flood uses entity)
  { id: 11, name: 'water', textureUri: 'blocks/water.png', isLiquid: true },

  // Wood blocks
  { id: 12, name: 'oak-log', textureUri: 'blocks/oak-log', isMultiTexture: true },
  { id: 13, name: 'oak-planks', textureUri: 'blocks/oak-planks.png' },
  { id: 14, name: 'spruce-log', textureUri: 'blocks/spruce-log', isMultiTexture: true },
  { id: 15, name: 'spruce-planks', textureUri: 'blocks/spruce-planks.png' },
  { id: 16, name: 'birch-planks', textureUri: 'blocks/birch-planks.png' },

  // Leaves
  { id: 17, name: 'oak-leaves', textureUri: 'blocks/oak-leaves.png' },
  { id: 18, name: 'spruce-leaves', textureUri: 'blocks/spruce-leaves.png' },

  // Building materials (Mesopotamian style)
  { id: 19, name: 'bricks', textureUri: 'blocks/bricks.png' },
  { id: 20, name: 'brown-concrete', textureUri: 'blocks/brown-concrete.png' }, // Mud brick
  { id: 21, name: 'gray-concrete', textureUri: 'blocks/gray-concrete.png' },

  // Path materials (using available textures)
  { id: 22, name: 'stone-bricks', textureUri: 'blocks/stone-bricks.png' },  // Replaces gravel
  { id: 23, name: 'deepslate', textureUri: 'blocks/deepslate.png' },        // Replaces coarse-dirt

  // Accent blocks (using available textures)
  { id: 24, name: 'smooth-stone', textureUri: 'blocks/smooth-stone.png' },  // Replaces clay
  { id: 25, name: 'mossy-stone-bricks', textureUri: 'blocks/mossy-stone-bricks.png' }, // Replaces terracotta
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
const WATER = 11;
const OAK_LOG = 12;
const OAK_PLANKS = 13;
const SPRUCE_LOG = 14;
const SPRUCE_PLANKS = 15;
const BIRCH_PLANKS = 16;
const OAK_LEAVES = 17;
const SPRUCE_LEAVES = 18;
const BRICKS = 19;
const MUD_BRICK = 20; // brown-concrete
const GRAY_CONCRETE = 21;
const GRAVEL = 22;
const COARSE_DIRT = 23;
const CLAY = 24;
const TERRACOTTA = 25;

// ============================================================================
// MAP DATA STRUCTURE
// ============================================================================

interface MapData {
  blockTypes: BlockType[];
  blocks: Record<string, number>;
}

const mapData: MapData = {
  blockTypes: blockTypes,
  blocks: {}
};

// Height tracking for entity placement
const heightMap: Record<string, number> = {};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function setBlock(x: number, y: number, z: number, blockId: number): void {
  const key = `${x},${y},${z}`;
  mapData.blocks[key] = blockId;

  // Track highest Y at this X,Z
  const heightKey = `${x},${z}`;
  if (!heightMap[heightKey] || y > heightMap[heightKey]) {
    heightMap[heightKey] = y;
  }
}

function getTerrainHeight(x: number, z: number): number {
  // Z goes from -75 (south, low) to +75 (north, high)
  // Normalize z to 0-1 range
  const normalizedZ = (z + HALF_SIZE) / MAP_SIZE;

  // Base height increases from south to north
  let baseHeight = FLOOD_PLAIN_HEIGHT + (normalizedZ * (ARK_PLATEAU_HEIGHT - FLOOD_PLAIN_HEIGHT - 10));

  // Add some noise for natural terrain
  const noise = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2;
  baseHeight += noise;

  // River channels on east and west sides (lower terrain)
  const riverWest = Math.abs(x + 40) < 8;
  const riverEast = Math.abs(x - 40) < 8;
  if ((riverWest || riverEast) && z < 20) {
    baseHeight = Math.min(baseHeight, FLOOD_PLAIN_HEIGHT + 1);
  }

  // Ark plateau - flat area in the north center
  if (z > 45 && Math.abs(x) < 25) {
    baseHeight = ARK_PLATEAU_HEIGHT;
  }

  // Highland ridges on the sides
  if (z > 30 && (Math.abs(x) > 50)) {
    baseHeight = Math.max(baseHeight, HIGHLAND_HEIGHT + Math.random() * 4);
  }

  return Math.floor(baseHeight);
}

function getTerrainBlock(x: number, z: number, y: number, surfaceHeight: number): number {
  const depth = surfaceHeight - y;

  // Determine biome based on position
  const normalizedZ = (z + HALF_SIZE) / MAP_SIZE;
  const isRiverArea = (Math.abs(x + 40) < 10 || Math.abs(x - 40) < 10) && z < 20;
  const isHighland = z > 30 || normalizedZ > 0.7;
  const isForest = x < -20 && z > 0 && z < 50;

  // Surface block
  if (depth === 0) {
    if (isRiverArea && y <= FLOOD_PLAIN_HEIGHT + 1) {
      return SAND;
    }
    if (isHighland) {
      return Math.random() > 0.3 ? GRASS : STONE;
    }
    if (isForest) {
      return GRASS;
    }
    // Flood plain - mix of grass and sand
    return Math.random() > 0.4 ? GRASS : SAND;
  }

  // Subsurface layers
  if (depth <= 3) {
    return isRiverArea ? SAND : DIRT;
  }
  if (depth <= 6) {
    return Math.random() > 0.5 ? STONE : DIRT;
  }

  // Deep layers
  return Math.random() > 0.7 ? GRANITE : STONE;
}

// ============================================================================
// TERRAIN GENERATION
// ============================================================================

function generateTerrain(): void {
  console.log('Generating terrain...');

  for (let x = -HALF_SIZE; x <= HALF_SIZE; x++) {
    for (let z = -HALF_SIZE; z <= HALF_SIZE; z++) {
      const surfaceHeight = getTerrainHeight(x, z);

      // Fill from Y=0 up to surface
      for (let y = 0; y <= surfaceHeight; y++) {
        const blockId = getTerrainBlock(x, z, y, surfaceHeight);
        setBlock(x, y, z, blockId);
      }
    }
  }

  console.log('Terrain generated!');
}

// ============================================================================
// RIVER CHANNELS
// ============================================================================

function generateRivers(): void {
  console.log('Generating river channels...');

  // West river (Euphrates-inspired)
  for (let z = -HALF_SIZE; z <= 20; z++) {
    const riverCenter = -40 + Math.sin(z * 0.05) * 3;
    for (let x = riverCenter - 4; x <= riverCenter + 4; x++) {
      const xInt = Math.floor(x);
      if (xInt >= -HALF_SIZE && xInt <= HALF_SIZE) {
        // Carve river bed
        setBlock(xInt, FLOOD_PLAIN_HEIGHT - 1, z, SAND);
        setBlock(xInt, FLOOD_PLAIN_HEIGHT, z, WATER);
      }
    }
  }

  // East river (Tigris-inspired)
  for (let z = -HALF_SIZE; z <= 20; z++) {
    const riverCenter = 40 + Math.sin(z * 0.07) * 4;
    for (let x = riverCenter - 4; x <= riverCenter + 4; x++) {
      const xInt = Math.floor(x);
      if (xInt >= -HALF_SIZE && xInt <= HALF_SIZE) {
        setBlock(xInt, FLOOD_PLAIN_HEIGHT - 1, z, SAND);
        setBlock(xInt, FLOOD_PLAIN_HEIGHT, z, WATER);
      }
    }
  }

  console.log('Rivers generated!');
}

// ============================================================================
// PATHS (Historically accurate - packed earth and stone)
// ============================================================================

function generatePaths(): void {
  console.log('Generating paths...');

  // Main central path from spawn to Ark
  for (let z = -HALF_SIZE + 10; z <= HALF_SIZE - 10; z++) {
    const pathY = getTerrainHeight(0, z) + 1;

    // 4-block wide raised cobblestone path
    for (let x = -2; x <= 2; x++) {
      setBlock(x, pathY, z, COBBLESTONE);
      // Stone border
      if (Math.abs(x) === 2) {
        setBlock(x, pathY, z, STONE);
      }
    }
  }

  // East-west connector paths at tier transitions
  const pathZs = [-30, 0, 30];
  for (const pz of pathZs) {
    const pathY = getTerrainHeight(0, pz) + 1;
    for (let x = -50; x <= 50; x++) {
      // Skip main path intersection
      if (Math.abs(x) <= 3) continue;

      // 3-block wide path
      for (let dz = -1; dz <= 1; dz++) {
        setBlock(x, pathY, pz + dz, GRAVEL);
      }
    }
  }

  console.log('Paths generated!');
}

// ============================================================================
// ANCIENT VILLAGE RUINS
// ============================================================================

function generateVillageRuins(): void {
  console.log('Generating ancient village ruins...');

  // Village located in Tier 2, center-east area
  const villageCenter = { x: 25, z: 0 };
  const villageHeight = getTerrainHeight(villageCenter.x, villageCenter.z);

  // Create 4-5 ruined mud-brick structures
  const structures = [
    { x: villageCenter.x - 8, z: villageCenter.z - 8, w: 6, d: 5, h: 4 },
    { x: villageCenter.x + 5, z: villageCenter.z - 5, w: 5, d: 6, h: 3 },
    { x: villageCenter.x - 5, z: villageCenter.z + 6, w: 7, d: 5, h: 5 },
    { x: villageCenter.x + 8, z: villageCenter.z + 4, w: 5, d: 5, h: 3 },
  ];

  for (const struct of structures) {
    const baseY = getTerrainHeight(struct.x, struct.z);

    // Build walls (partially ruined)
    for (let y = baseY + 1; y <= baseY + struct.h; y++) {
      // Skip some blocks randomly for ruined effect
      const ruinFactor = (y - baseY) / struct.h; // Higher = more ruined

      // North and south walls
      for (let x = struct.x; x < struct.x + struct.w; x++) {
        if (Math.random() > ruinFactor * 0.5) {
          setBlock(x, y, struct.z, MUD_BRICK);
        }
        if (Math.random() > ruinFactor * 0.5) {
          setBlock(x, y, struct.z + struct.d - 1, MUD_BRICK);
        }
      }

      // East and west walls
      for (let z = struct.z; z < struct.z + struct.d; z++) {
        if (Math.random() > ruinFactor * 0.5) {
          setBlock(struct.x, y, z, MUD_BRICK);
        }
        if (Math.random() > ruinFactor * 0.5) {
          setBlock(struct.x + struct.w - 1, y, z, MUD_BRICK);
        }
      }
    }

    // Floor
    for (let x = struct.x; x < struct.x + struct.w; x++) {
      for (let z = struct.z; z < struct.z + struct.d; z++) {
        setBlock(x, baseY, z, BRICKS);
      }
    }
  }

  // Central well
  const wellX = villageCenter.x;
  const wellZ = villageCenter.z;
  const wellY = getTerrainHeight(wellX, wellZ);

  // Well walls
  for (let y = wellY - 2; y <= wellY + 2; y++) {
    setBlock(wellX - 1, y, wellZ - 1, COBBLESTONE);
    setBlock(wellX + 1, y, wellZ - 1, COBBLESTONE);
    setBlock(wellX - 1, y, wellZ + 1, COBBLESTONE);
    setBlock(wellX + 1, y, wellZ + 1, COBBLESTONE);
  }
  // Water in well
  setBlock(wellX, wellY - 1, wellZ, WATER);
  setBlock(wellX, wellY, wellZ, WATER);

  console.log('Village ruins generated!');
}

// ============================================================================
// ARK PLATEAU
// ============================================================================

function generateArkPlateau(): void {
  console.log('Generating Ark plateau...');

  // Create a large flat plateau for the Ark
  const plateauRadius = 20;

  for (let x = ARK_POSITION.x - plateauRadius; x <= ARK_POSITION.x + plateauRadius; x++) {
    for (let z = ARK_POSITION.z - 15; z <= ARK_POSITION.z + 10; z++) {
      const dist = Math.sqrt(Math.pow(x - ARK_POSITION.x, 2) + Math.pow(z - ARK_POSITION.z, 2));

      if (dist <= plateauRadius) {
        // Flatten to plateau height
        for (let y = 0; y <= ARK_PLATEAU_HEIGHT; y++) {
          if (y === ARK_PLATEAU_HEIGHT) {
            setBlock(x, y, z, STONE);
          } else if (y > ARK_PLATEAU_HEIGHT - 3) {
            setBlock(x, y, z, GRANITE);
          } else {
            setBlock(x, y, z, STONE);
          }
        }
      }
    }
  }

  // Boarding ramp/stairs from south side - extends down to walkway level
  // Start from terrace height (where walkway is) up to Ark plateau
  const rampStartZ = ARK_POSITION.z - 35;  // Start further south
  const rampEndZ = ARK_POSITION.z - 5;     // End near Ark
  const rampLength = rampEndZ - rampStartZ;

  // Animal drop-off platform location (midway up the ramp)
  const platformZ = ARK_POSITION.z - 12;  // Z=48 for Ark at Z=60
  const platformY = 28;  // Height for the platform

  for (let z = rampStartZ; z < rampEndZ; z++) {
    const rampProgress = (z - rampStartZ) / rampLength;
    const rampY = Math.floor(TERRACE_HEIGHT + rampProgress * (ARK_PLATEAU_HEIGHT - TERRACE_HEIGHT));

    for (let x = -3; x <= 3; x++) {
      // Clear any blocks above the ramp
      for (let clearY = rampY + 2; clearY <= ARK_PLATEAU_HEIGHT + 2; clearY++) {
        delete mapData.blocks[`${x},${clearY},${z}`];
      }

      // Place ramp blocks (brick stairs look)
      setBlock(x, rampY, z, BRICKS);

      // Railings on sides
      if (Math.abs(x) === 3) {
        setBlock(x, rampY + 1, z, OAK_LOG);
      }
    }
  }

  // Create animal drop-off platform
  console.log('Creating animal drop-off platform...');
  const platformWidth = 7;  // -7 to +7 = 15 blocks wide
  const platformDepth = 5;  // 5 blocks deep

  for (let x = -platformWidth; x <= platformWidth; x++) {
    for (let z = platformZ - platformDepth; z <= platformZ + 2; z++) {
      // Clear blocks above platform
      for (let clearY = platformY + 1; clearY <= ARK_PLATEAU_HEIGHT + 5; clearY++) {
        delete mapData.blocks[`${x},${clearY},${z}`];
      }

      // Main platform floor - oak planks
      setBlock(x, platformY, z, OAK_PLANKS);

      // Border with logs
      if (Math.abs(x) === platformWidth || z === platformZ - platformDepth || z === platformZ + 2) {
        setBlock(x, platformY, z, OAK_LOG);
        // Railing posts at corners
        if ((Math.abs(x) === platformWidth) && (z === platformZ - platformDepth || z === platformZ + 2)) {
          setBlock(x, platformY + 1, z, OAK_LOG);
          setBlock(x, platformY + 2, z, OAK_LOG);
        }
      }
    }
  }

  // Add support pillars under the platform
  for (let x = -platformWidth; x <= platformWidth; x += 7) {
    for (let z = platformZ - platformDepth; z <= platformZ + 2; z += 4) {
      for (let y = HIGHLAND_HEIGHT; y < platformY; y++) {
        setBlock(x, y, z, OAK_LOG);
      }
    }
  }

  // Add decorative fence/railing around platform (except entrance side)
  for (let x = -platformWidth + 1; x <= platformWidth - 1; x++) {
    // Back railing
    setBlock(x, platformY + 1, platformZ + 2, BIRCH_PLANKS);
  }
  for (let z = platformZ - platformDepth + 1; z <= platformZ + 1; z++) {
    // Side railings
    setBlock(-platformWidth, platformY + 1, z, BIRCH_PLANKS);
    setBlock(platformWidth, platformY + 1, z, BIRCH_PLANKS);
  }

  // Extend the cobblestone walkway north to connect to the brick ramp stairs
  // The ramp starts at Z=25 at Y=12, we need to extend cobblestone from Z=20 to Z=24
  // Then the brick ramp takes over from Z=25 onwards
  console.log('Extending walkway to connect to ramp...');

  // First, extend flat cobblestone from Z=20 to Z=24 (before ramp starts)
  const walkwayY = 12;  // Match TERRACE_HEIGHT where ramp starts

  for (let z = 18; z < rampStartZ; z++) {  // Z=18 to Z=24
    for (let x = -4; x <= 4; x++) {
      // Place cobblestone at walkway level
      setBlock(x, walkwayY, z, COBBLESTONE);
      // Fill underneath with dirt/stone for support
      for (let y = 0; y < walkwayY; y++) {
        setBlock(x, y, z, y < 8 ? STONE : DIRT);
      }
    }
  }

  // Now extend the brick ramp down a bit more to connect smoothly
  // Add a few rows of bricks at Y=12-13 to bridge any remaining gap
  for (let z = rampStartZ; z <= rampStartZ + 3; z++) {
    for (let x = -4; x <= 4; x++) {
      // Make sure there's solid ground under the ramp start
      for (let y = 0; y <= walkwayY; y++) {
        if (y == walkwayY) {
          setBlock(x, y, z, BRICKS);
        } else {
          setBlock(x, y, z, y < 8 ? STONE : DIRT);
        }
      }
    }
  }

  console.log('Ark plateau generated!');
}

// ============================================================================
// DECORATIVE TREES
// ============================================================================

function generateTrees(): void {
  console.log('Generating trees...');

  // Forest area (west side, Tier 2)
  for (let i = 0; i < 40; i++) {
    const x = -HALF_SIZE + 10 + Math.random() * 40;
    const z = -20 + Math.random() * 60;
    const baseY = getTerrainHeight(Math.floor(x), Math.floor(z));

    // Skip if in water or on path
    if (baseY < FLOOD_PLAIN_HEIGHT + 2) continue;
    if (Math.abs(x) < 5) continue;

    placeTree(Math.floor(x), baseY, Math.floor(z), 'oak');
  }

  // Scattered trees in grassland
  for (let i = 0; i < 25; i++) {
    const x = -30 + Math.random() * 60;
    const z = -40 + Math.random() * 60;
    const baseY = getTerrainHeight(Math.floor(x), Math.floor(z));

    if (baseY < FLOOD_PLAIN_HEIGHT + 2) continue;
    if (Math.abs(x) < 5) continue;

    placeTree(Math.floor(x), baseY, Math.floor(z), Math.random() > 0.5 ? 'oak' : 'spruce');
  }

  // Highland cedars/spruces near Ark
  for (let i = 0; i < 15; i++) {
    const x = -40 + Math.random() * 80;
    const z = 30 + Math.random() * 20;
    const baseY = getTerrainHeight(Math.floor(x), Math.floor(z));

    // Skip Ark plateau area
    if (Math.abs(x) < 25 && z > 45) continue;

    // Skip the ramp/stairs area leading to the Ark (x: -5 to 5, z: 25 to 55)
    if (Math.abs(x) < 6 && z >= 25 && z <= 55) continue;

    placeTree(Math.floor(x), baseY, Math.floor(z), 'spruce');
  }

  console.log('Trees generated!');
}

function placeTree(x: number, baseY: number, z: number, type: 'oak' | 'spruce'): void {
  const trunkHeight = type === 'oak' ? 4 + Math.floor(Math.random() * 2) : 6 + Math.floor(Math.random() * 3);
  const logBlock = type === 'oak' ? OAK_LOG : SPRUCE_LOG;
  const leafBlock = type === 'oak' ? OAK_LEAVES : SPRUCE_LEAVES;

  // Trunk
  for (let y = baseY + 1; y <= baseY + trunkHeight; y++) {
    setBlock(x, y, z, logBlock);
  }

  // Leaves
  if (type === 'oak') {
    // Oak - round canopy
    const leafY = baseY + trunkHeight;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 2; dy++) {
          const dist = Math.abs(dx) + Math.abs(dz) + dy;
          if (dist <= 3 && (dx !== 0 || dz !== 0 || dy > 0)) {
            setBlock(x + dx, leafY + dy, z + dz, leafBlock);
          }
        }
      }
    }
  } else {
    // Spruce - conical shape
    for (let layer = 0; layer < 4; layer++) {
      const leafY = baseY + trunkHeight - layer;
      const radius = layer + 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= radius + 1) {
            if (dx !== 0 || dz !== 0) {
              setBlock(x + dx, leafY, z + dz, leafBlock);
            }
          }
        }
      }
    }
    // Top
    setBlock(x, baseY + trunkHeight + 1, z, leafBlock);
  }
}

// ============================================================================
// ROCKY OUTCROPS
// ============================================================================

function generateRocks(): void {
  console.log('Generating rocky outcrops...');

  // Highland rocks
  for (let i = 0; i < 30; i++) {
    const x = -HALF_SIZE + 10 + Math.random() * (MAP_SIZE - 20);
    const z = 20 + Math.random() * 40;
    const baseY = getTerrainHeight(Math.floor(x), Math.floor(z));

    // Skip Ark area
    if (Math.abs(x) < 25 && z > 45) continue;
    if (Math.abs(x) < 5) continue; // Skip main path

    placeRock(Math.floor(x), baseY, Math.floor(z));
  }

  // Flood plain scattered rocks
  for (let i = 0; i < 15; i++) {
    const x = -HALF_SIZE + 20 + Math.random() * (MAP_SIZE - 40);
    const z = -HALF_SIZE + 10 + Math.random() * 40;
    const baseY = getTerrainHeight(Math.floor(x), Math.floor(z));

    if (Math.abs(x) < 5) continue;

    placeRock(Math.floor(x), baseY, Math.floor(z));
  }

  console.log('Rocks generated!');
}

function placeRock(x: number, baseY: number, z: number): void {
  const rockBlocks = [STONE, GRANITE, ANDESITE, DIORITE];
  const rockBlock = rockBlocks[Math.floor(Math.random() * rockBlocks.length)];
  const size = 1 + Math.floor(Math.random() * 2);

  for (let dx = -size; dx <= size; dx++) {
    for (let dz = -size; dz <= size; dz++) {
      for (let dy = 0; dy <= size; dy++) {
        const dist = Math.abs(dx) + Math.abs(dz) + dy;
        if (dist <= size + 1 && Math.random() > 0.3) {
          setBlock(x + dx, baseY + dy + 1, z + dz, rockBlock);
        }
      }
    }
  }
}

// ============================================================================
// SPAWN ZONES (for animal spawning)
// ============================================================================

interface SpawnZone {
  id: string;
  x: number;
  z: number;
  tier: number;
  biome: 'grassland' | 'forest' | 'rocky';
}

function defineSpawnZones(): SpawnZone[] {
  const zones: SpawnZone[] = [
    // Tier 1 - Flood plain (dangerous, floods first)
    { id: 'flood-plain-west', x: -30, z: -50, tier: 1, biome: 'grassland' },
    { id: 'flood-plain-east', x: 30, z: -50, tier: 1, biome: 'grassland' },
    { id: 'flood-plain-center', x: 0, z: -60, tier: 1, biome: 'grassland' },
    { id: 'river-west-bank', x: -50, z: -40, tier: 1, biome: 'grassland' },
    { id: 'river-east-bank', x: 50, z: -40, tier: 1, biome: 'grassland' },

    // Tier 2 - Mid elevation (moderate risk)
    { id: 'village-area', x: 25, z: 0, tier: 2, biome: 'grassland' },
    { id: 'forest-edge', x: -35, z: -10, tier: 2, biome: 'forest' },
    { id: 'forest-deep', x: -45, z: 15, tier: 2, biome: 'forest' },
    { id: 'central-terrace', x: 0, z: -20, tier: 2, biome: 'grassland' },
    { id: 'east-terrace', x: 40, z: 10, tier: 2, biome: 'grassland' },

    // Tier 3 - Highlands (safest, near Ark)
    { id: 'highland-west', x: -40, z: 40, tier: 3, biome: 'rocky' },
    { id: 'highland-east', x: 40, z: 40, tier: 3, biome: 'rocky' },
    { id: 'near-ark', x: 0, z: 35, tier: 3, biome: 'rocky' },
  ];

  return zones;
}

// ============================================================================
// MAIN GENERATION
// ============================================================================

function generateMap(): void {
  console.log('='.repeat(60));
  console.log('PLAINS OF SHINAR - Map Generator');
  console.log('A biblically-inspired Mesopotamian landscape');
  console.log('='.repeat(60));
  console.log(`Map size: ${MAP_SIZE}x${MAP_SIZE}`);
  console.log(`Ark position: (${ARK_POSITION.x}, ${ARK_POSITION.y}, ${ARK_POSITION.z})`);
  console.log('');

  // Generate terrain layers
  generateTerrain();
  generateRivers();
  generatePaths();
  generateArkPlateau();
  generateVillageRuins();
  generateTrees();
  generateRocks();

  // Calculate spawn zones with heights
  const spawnZones = defineSpawnZones();
  const spawnZonesWithHeights = spawnZones.map(zone => ({
    ...zone,
    y: heightMap[`${zone.x},${zone.z}`] || getTerrainHeight(zone.x, zone.z)
  }));

  console.log('');
  console.log('Spawn zones defined:');
  spawnZonesWithHeights.forEach(zone => {
    console.log(`  ${zone.id}: (${zone.x}, ${zone.y}, ${zone.z}) - Tier ${zone.tier} ${zone.biome}`);
  });

  // Save map data
  const outputPath = './assets/plains-of-shinar.json';
  fs.writeFileSync(outputPath, JSON.stringify(mapData, null, 2));
  console.log('');
  console.log(`Map saved to: ${outputPath}`);
  console.log(`Total blocks: ${Object.keys(mapData.blocks).length}`);

  // Save height map
  const heightMapPath = './assets/plains-of-shinar-heights.json';
  fs.writeFileSync(heightMapPath, JSON.stringify(heightMap, null, 2));
  console.log(`Height map saved to: ${heightMapPath}`);

  // Save spawn zones config
  const spawnZonesPath = './assets/plains-of-shinar-spawn-zones.json';
  fs.writeFileSync(spawnZonesPath, JSON.stringify(spawnZonesWithHeights, null, 2));
  console.log(`Spawn zones saved to: ${spawnZonesPath}`);

  console.log('');
  console.log('Generation complete!');
  console.log('='.repeat(60));
}

// Run generator
generateMap();
