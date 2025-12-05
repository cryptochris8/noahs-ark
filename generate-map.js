/**
 * Noah's Ark Rush - Map Generator
 * Generates the complete game world with:
 * - Floodplain (Y=0-4)
 * - Mid-tier terraces (Y=5-30)
 * - Ark Plateau (Y=32-40)
 * - 13 animal spawn zones
 * - Paths and shortcuts
 * - Biome decorations
 */

const fs = require('fs');

// Block type IDs
const BLOCKS = {
  ANDESITE: 1,
  BIRCH_LEAVES: 2,
  BRICKS: 3,
  COAL_ORE: 4,
  COBBLESTONE: 5,
  GRASS_PINE: 6,
  GRASS: 7,
  GRASS_FLOWER_PINE: 8,
  GRASS_FLOWER: 9,
  OAK_LEAVES: 10,
  OAK_LOG: 11,
  SAND: 12,
  SPRUCE_LEAVES: 13,
  SPRUCE_LOG: 14,
  STONE: 15,
  WATER: 16,
  OAK_PLANKS: 17,
  SPRUCE_PLANKS: 18,
  DIRT: 19
};

// Map dimensions (centered on 0,0)
const MAP_WIDTH = 100;  // X: -50 to 50
const MAP_DEPTH = 120;  // Z: -60 to 60

// Key positions from game code
const ARK_POSITION = { x: 0, y: 35, z: 20 };
const PLAYER_SPAWN = { x: 0, y: 10, z: 0 };

// Spawn zones from AnimalManager.ts
const SPAWN_ZONES = [
  // Tier 1 - Lower areas (flood risk) Y=5-6
  { position: { x: -20, y: 5, z: -20 }, tier: 1, biome: 'grassland' },
  { position: { x: 20, y: 5, z: -20 }, tier: 1, biome: 'grassland' },
  { position: { x: 0, y: 5, z: -30 }, tier: 1, biome: 'grassland' },
  { position: { x: -15, y: 6, z: -15 }, tier: 1, biome: 'forest' },
  { position: { x: 15, y: 6, z: -15 }, tier: 1, biome: 'forest' },
  // Tier 2 - Mid elevation Y=12-15
  { position: { x: -15, y: 12, z: -10 }, tier: 2, biome: 'grassland' },
  { position: { x: 15, y: 12, z: -10 }, tier: 2, biome: 'rocky' },
  { position: { x: 0, y: 14, z: -18 }, tier: 2, biome: 'forest' },
  { position: { x: -10, y: 15, z: 0 }, tier: 2, biome: 'grassland' },
  { position: { x: 10, y: 15, z: 0 }, tier: 2, biome: 'rocky' },
  // Tier 3 - Higher elevation (safer) Y=22-25
  { position: { x: -8, y: 22, z: 5 }, tier: 3, biome: 'rocky' },
  { position: { x: 8, y: 22, z: 5 }, tier: 3, biome: 'rocky' },
  { position: { x: 0, y: 25, z: 10 }, tier: 3, biome: 'grassland' },
];

const blocks = {};

function setBlock(x, y, z, blockType) {
  blocks[`${x},${y},${z}`] = blockType;
}

function getTerrainHeight(x, z) {
  // Create a sloped terrain from south (low) to north (high, toward Ark)
  // Base height increases as Z increases (toward Ark at z=20)

  // Distance from center for bowl-like shape
  const distFromCenter = Math.sqrt(x * x + (z - 10) * (z - 10));

  // Base gradient: Y increases as Z increases
  let baseHeight = 2 + (z + 60) * 0.35;  // Ranges from ~2 at z=-60 to ~44 at z=60

  // Create terraced effect
  if (z < -40) {
    baseHeight = Math.min(baseHeight, 4);  // Floodplain
  } else if (z < -25) {
    baseHeight = Math.min(baseHeight, 8);  // Tier 1 terrace
  } else if (z < -5) {
    baseHeight = Math.min(baseHeight, 16);  // Tier 2 terrace
  } else if (z < 10) {
    baseHeight = Math.min(baseHeight, 24);  // Tier 3 terrace
  } else {
    baseHeight = Math.max(baseHeight, 32);  // Ark plateau
  }

  // Add some natural variation
  const noise = Math.sin(x * 0.3) * Math.cos(z * 0.2) * 2;

  // Create paths by lowering terrain along specific routes
  const onMainPath = isOnMainPath(x, z);
  if (onMainPath) {
    baseHeight -= 1;  // Slightly lower for paths
  }

  return Math.floor(Math.max(0, baseHeight + noise));
}

function isOnMainPath(x, z) {
  // Main zig-zag path from spawn to Ark
  // Path segments connecting key points

  // Central path from z=-60 to z=20
  if (Math.abs(x) <= 4) {
    return true;
  }

  // Zig-zag sections
  if (z > -40 && z < -30 && Math.abs(x - 15) <= 3) return true;
  if (z > -30 && z < -20 && Math.abs(x + 10) <= 3) return true;
  if (z > -20 && z < -10 && Math.abs(x - 8) <= 3) return true;
  if (z > -10 && z < 0 && Math.abs(x + 5) <= 3) return true;

  return false;
}

function generateTerrain() {
  console.log('Generating base terrain...');

  for (let x = -50; x <= 50; x++) {
    for (let z = -60; z <= 60; z++) {
      const height = getTerrainHeight(x, z);

      // Place blocks from y=0 up to height
      for (let y = 0; y <= height; y++) {
        let blockType;

        if (y === height) {
          // Surface block
          if (height < 4) {
            blockType = BLOCKS.SAND;  // Floodplain is sandy
          } else if (height < 8) {
            blockType = Math.random() > 0.8 ? BLOCKS.GRASS_FLOWER : BLOCKS.GRASS;
          } else if (height < 20) {
            blockType = Math.random() > 0.85 ? BLOCKS.GRASS_FLOWER_PINE : BLOCKS.GRASS_PINE;
          } else {
            blockType = Math.random() > 0.9 ? BLOCKS.GRASS_FLOWER : BLOCKS.GRASS;
          }
        } else if (y > height - 3) {
          blockType = BLOCKS.DIRT;  // Dirt layer
        } else {
          blockType = BLOCKS.STONE;  // Stone underneath
        }

        setBlock(x, y, z, blockType);
      }
    }
  }
}

function generateArkPlateau() {
  console.log('Generating Ark plateau...');

  // Flatten the plateau area (24x24 centered at Ark position)
  for (let x = -16; x <= 16; x++) {
    for (let z = 10; z <= 40; z++) {
      // Create flat plateau at Y=34
      for (let y = 0; y <= 34; y++) {
        if (y === 34) {
          setBlock(x, y, z, BLOCKS.GRASS);
        } else if (y > 30) {
          setBlock(x, y, z, BLOCKS.DIRT);
        } else {
          setBlock(x, y, z, BLOCKS.STONE);
        }
      }
    }
  }
}

function generateArk() {
  console.log('Generating Noah\'s Ark structure...');

  const arkX = ARK_POSITION.x;
  const arkY = ARK_POSITION.y;
  const arkZ = ARK_POSITION.z;

  // Ark dimensions
  const arkLength = 30;  // Z direction
  const arkWidth = 12;   // X direction
  const arkHeight = 12;  // Y direction

  // Hull base (boat shape)
  for (let z = arkZ - 5; z <= arkZ + arkLength - 5; z++) {
    for (let x = arkX - arkWidth/2; x <= arkX + arkWidth/2; x++) {
      // Taper the hull at front and back
      const zRelative = z - arkZ;
      let widthAtZ = arkWidth / 2;

      if (zRelative > arkLength - 10) {
        // Taper at back
        widthAtZ = Math.max(2, widthAtZ - (zRelative - (arkLength - 10)) * 0.8);
      }
      if (zRelative < 5) {
        // Taper at front (boarding side)
        widthAtZ = Math.max(3, widthAtZ - (5 - zRelative) * 0.5);
      }

      if (Math.abs(x - arkX) <= widthAtZ) {
        // Floor
        setBlock(x, arkY, z, BLOCKS.OAK_PLANKS);

        // Walls
        if (Math.abs(x - arkX) >= widthAtZ - 1) {
          for (let y = arkY + 1; y <= arkY + arkHeight; y++) {
            setBlock(x, y, z, BLOCKS.SPRUCE_PLANKS);
          }
        }

        // Front and back walls
        if (z === arkZ - 5 || z === arkZ + arkLength - 5) {
          for (let y = arkY + 1; y <= arkY + arkHeight; y++) {
            setBlock(x, y, z, BLOCKS.SPRUCE_PLANKS);
          }
        }
      }
    }
  }

  // Roof (peaked)
  for (let z = arkZ - 4; z <= arkZ + arkLength - 6; z++) {
    for (let level = 0; level <= 4; level++) {
      const roofWidth = arkWidth / 2 - level;
      if (roofWidth >= 1) {
        for (let x = arkX - roofWidth; x <= arkX + roofWidth; x++) {
          setBlock(x, arkY + arkHeight + level, z, BLOCKS.OAK_PLANKS);
        }
      }
    }
  }

  // Boarding ramp (entrance facing player spawn)
  for (let z = arkZ - 10; z <= arkZ - 5; z++) {
    for (let x = arkX - 3; x <= arkX + 3; x++) {
      const rampY = arkY - (arkZ - 5 - z);
      setBlock(x, rampY, z, BLOCKS.OAK_PLANKS);
      // Railing
      if (Math.abs(x - arkX) === 3) {
        setBlock(x, rampY + 1, z, BLOCKS.OAK_LOG);
      }
    }
  }

  // 8x8 boarding pad in front of Ark (goal zone)
  for (let x = arkX - 4; x <= arkX + 4; x++) {
    for (let z = arkZ - 14; z <= arkZ - 10; z++) {
      setBlock(x, arkY - 1, z, BLOCKS.COBBLESTONE);
      // Clear above
    }
  }
}

function generateSpawnZones() {
  console.log('Generating animal spawn zones...');

  SPAWN_ZONES.forEach((zone, index) => {
    const { position, biome } = zone;
    const { x, y, z } = position;

    // Create a 10x10 flat area at each spawn zone
    for (let dx = -5; dx <= 5; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        // Flatten the area
        for (let dy = y - 2; dy <= y; dy++) {
          if (dy === y) {
            // Surface based on biome
            let surfaceBlock;
            switch (biome) {
              case 'grassland':
                surfaceBlock = Math.random() > 0.7 ? BLOCKS.GRASS_FLOWER : BLOCKS.GRASS;
                break;
              case 'forest':
                surfaceBlock = Math.random() > 0.8 ? BLOCKS.GRASS_FLOWER_PINE : BLOCKS.GRASS_PINE;
                break;
              case 'rocky':
                surfaceBlock = Math.random() > 0.6 ? BLOCKS.COBBLESTONE : BLOCKS.STONE;
                break;
              default:
                surfaceBlock = BLOCKS.GRASS;
            }
            setBlock(x + dx, dy, z + dz, surfaceBlock);
          } else {
            setBlock(x + dx, dy, z + dz, BLOCKS.DIRT);
          }
        }
      }
    }

    // Add biome-specific decorations around edges
    if (biome === 'forest') {
      // Add trees at corners
      addTree(x - 6, y + 1, z - 6, 'oak');
      addTree(x + 6, y + 1, z - 6, 'spruce');
      addTree(x - 6, y + 1, z + 6, 'spruce');
      addTree(x + 6, y + 1, z + 6, 'oak');
    } else if (biome === 'grassland') {
      // Add scattered trees
      if (Math.random() > 0.5) addTree(x - 7, y + 1, z, 'oak');
      if (Math.random() > 0.5) addTree(x + 7, y + 1, z, 'oak');
    } else if (biome === 'rocky') {
      // Add rock formations
      addRocks(x - 6, y + 1, z - 6);
      addRocks(x + 6, y + 1, z + 6);
    }

    // Debug marker - coal ore pillar to mark spawn zones
    for (let dy = 1; dy <= 3; dy++) {
      setBlock(x, y + dy, z, BLOCKS.COAL_ORE);
    }
  });
}

function addTree(x, y, z, type) {
  const logBlock = type === 'oak' ? BLOCKS.OAK_LOG : BLOCKS.SPRUCE_LOG;
  const leafBlock = type === 'oak' ? BLOCKS.OAK_LEAVES : BLOCKS.SPRUCE_LEAVES;
  const height = 4 + Math.floor(Math.random() * 3);

  // Trunk
  for (let dy = 0; dy < height; dy++) {
    setBlock(x, y + dy, z, logBlock);
  }

  // Leaves (simple spherical shape)
  const leafStart = height - 2;
  for (let dy = leafStart; dy <= height + 1; dy++) {
    const radius = dy === height + 1 ? 1 : 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0 && dy < height) continue; // Skip trunk position
        if (Math.abs(dx) + Math.abs(dz) <= radius + 1) {
          setBlock(x + dx, y + dy, z + dz, leafBlock);
        }
      }
    }
  }
}

function addRocks(x, y, z) {
  // Small rock formation
  setBlock(x, y, z, BLOCKS.STONE);
  setBlock(x + 1, y, z, BLOCKS.COBBLESTONE);
  setBlock(x, y, z + 1, BLOCKS.ANDESITE);
  setBlock(x, y + 1, z, BLOCKS.STONE);
}

function generatePaths() {
  console.log('Generating navigation paths...');

  // Main central path from floodplain to Ark
  // Uses cobblestone/stone to mark the path

  // Central spine
  for (let z = -55; z <= 15; z++) {
    for (let x = -2; x <= 2; x++) {
      const height = getTerrainHeight(x, z);
      setBlock(x, height, z, BLOCKS.COBBLESTONE);
    }
  }

  // Zig-zag path connectors
  const pathPoints = [
    { x1: 0, z1: -45, x2: 15, z2: -35 },
    { x1: 15, z1: -35, x2: -10, z2: -25 },
    { x1: -10, z1: -25, x2: 8, z2: -15 },
    { x1: 8, z1: -15, x2: -5, z2: -5 },
    { x1: -5, z1: -5, x2: 0, z2: 10 },
  ];

  pathPoints.forEach(segment => {
    const steps = Math.max(Math.abs(segment.x2 - segment.x1), Math.abs(segment.z2 - segment.z1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(segment.x1 + (segment.x2 - segment.x1) * t);
      const z = Math.round(segment.z1 + (segment.z2 - segment.z1) * t);
      const height = getTerrainHeight(x, z);

      // 3-block wide path
      for (let dx = -1; dx <= 1; dx++) {
        setBlock(x + dx, height, z, BLOCKS.COBBLESTONE);
      }
    }
  });
}

function generatePlayerSpawnArea() {
  console.log('Generating player spawn area...');

  const { x, y, z } = PLAYER_SPAWN;

  // Create a nice spawn platform
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      // Flatten to spawn height
      for (let dy = 0; dy <= y; dy++) {
        if (dy === y) {
          setBlock(x + dx, dy, z + dz, BLOCKS.COBBLESTONE);
        } else if (dy > y - 3) {
          setBlock(x + dx, dy, z + dz, BLOCKS.DIRT);
        } else {
          setBlock(x + dx, dy, z + dz, BLOCKS.STONE);
        }
      }
    }
  }

  // Debug marker - brick pillar at player spawn
  for (let dy = 1; dy <= 4; dy++) {
    setBlock(x, y + dy, z, BLOCKS.BRICKS);
  }
}

function generateWaterEdges() {
  console.log('Generating water at lowest edges...');

  // Add water at the very bottom edges (floodplain visualization)
  for (let x = -50; x <= 50; x++) {
    for (let z = -60; z <= -50; z++) {
      setBlock(x, 0, z, BLOCKS.WATER);
      setBlock(x, 1, z, BLOCKS.WATER);
    }
  }
}

function generateDecorativeTrees() {
  console.log('Adding decorative trees...');

  // Scatter trees across the terrain
  const treePositions = [
    // Floodplain area (sparse)
    { x: -30, z: -45 },
    { x: 25, z: -50 },
    { x: -40, z: -40 },

    // Tier 1 (some trees)
    { x: -25, z: -25 },
    { x: 30, z: -20 },
    { x: -35, z: -15 },
    { x: 35, z: -18 },

    // Tier 2 (more trees - forest feel)
    { x: -25, z: -8 },
    { x: 25, z: -5 },
    { x: -30, z: 0 },
    { x: 30, z: -2 },
    { x: -20, z: 5 },
    { x: 22, z: 3 },

    // Near Ark (scattered)
    { x: -20, z: 15 },
    { x: 20, z: 18 },
    { x: -25, z: 25 },
    { x: 25, z: 28 },
  ];

  treePositions.forEach(pos => {
    const height = getTerrainHeight(pos.x, pos.z);
    const treeType = Math.random() > 0.5 ? 'oak' : 'spruce';
    addTree(pos.x, height + 1, pos.z, treeType);
  });
}

function generateRiskyShortcuts() {
  console.log('Generating risky shortcuts...');

  // Side paths that are closer to flood level
  // These become dangerous as water rises

  // Left shortcut (low path)
  for (let z = -40; z <= -10; z++) {
    const x = -40 + Math.sin((z + 40) * 0.1) * 5;
    const height = 5 + Math.floor((z + 40) * 0.15);  // Low path
    for (let dx = -1; dx <= 1; dx++) {
      setBlock(Math.round(x + dx), height, z, BLOCKS.SAND);
    }
  }

  // Right shortcut (low path)
  for (let z = -35; z <= -5; z++) {
    const x = 38 - Math.sin((z + 35) * 0.12) * 4;
    const height = 6 + Math.floor((z + 35) * 0.18);  // Slightly higher but still risky
    for (let dx = -1; dx <= 1; dx++) {
      setBlock(Math.round(x + dx), height, z, BLOCKS.SAND);
    }
  }
}

// Main generation
console.log('=== Noah\'s Ark Rush Map Generator ===\n');

generateTerrain();
generateArkPlateau();
generateArk();
generateSpawnZones();
generatePaths();
generatePlayerSpawnArea();
generateWaterEdges();
generateDecorativeTrees();
generateRiskyShortcuts();

console.log(`\nGenerated ${Object.keys(blocks).length} blocks`);

// Read existing map.json for block types
const mapPath = './assets/map.json';
const existingMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

// Write the new map
const newMap = {
  blockTypes: existingMap.blockTypes,
  blocks: blocks
};

fs.writeFileSync(mapPath, JSON.stringify(newMap, null, 2));
console.log(`\nMap saved to ${mapPath}`);
console.log('\n=== Map Generation Complete ===');
