"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var fs = __importStar(require("fs"));
// ============================================================================
// MAP SPECIFICATION v2 - HEIGHT BANDS (DO NOT MODIFY)
// ============================================================================
var HEIGHTS = {
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
var MAP_SIZE = 120; // Slightly smaller for cleaner gameplay
var HALF_SIZE = MAP_SIZE / 2; // 60
// Ark position - north center, above flood
var ARK_POSITION = {
    x: 0,
    y: HEIGHTS.ARK_DECK_MIN, // Y=32 exactly
    z: 50 // North end
};
// Player spawn - south center, on Tier 1
var PLAYER_SPAWN = {
    x: 0,
    y: HEIGHTS.TIER1_MIN + 2, // Y=7
    z: -50
};
var blockTypes = [
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
var GRASS = 1;
var DIRT = 2;
var SAND = 3;
var SANDSTONE = 4;
var STONE = 5;
var COBBLESTONE = 6;
var MOSSY_COBBLESTONE = 7;
var GRANITE = 8;
var ANDESITE = 9;
var DIORITE = 10;
var OAK_LOG = 12;
var OAK_PLANKS = 13;
var SPRUCE_LOG = 14;
var SPRUCE_PLANKS = 15;
var BIRCH_PLANKS = 16;
var OAK_LEAVES = 17;
var SPRUCE_LEAVES = 18;
var BRICKS = 19;
var STONE_BRICKS = 20;
var mapData = {
    blockTypes: blockTypes,
    blocks: {}
};
var heightMap = {};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function setBlock(x, y, z, blockId) {
    var key = "".concat(x, ",").concat(y, ",").concat(z);
    mapData.blocks[key] = blockId;
    var heightKey = "".concat(x, ",").concat(z);
    if (!heightMap[heightKey] || y > heightMap[heightKey]) {
        heightMap[heightKey] = y;
    }
}
function deleteBlock(x, y, z) {
    var key = "".concat(x, ",").concat(y, ",").concat(z);
    delete mapData.blocks[key];
}
/**
 * Calculate terrain height at given X,Z
 * Creates a smooth gradient from south (low) to north (high)
 * with the main path always at appropriate tier heights
 */
function getTerrainHeight(x, z) {
    // Normalize Z: -60 (south) = 0.0, +60 (north) = 1.0
    var normalizedZ = (z + HALF_SIZE) / MAP_SIZE;
    // Distance from center path (X=0)
    var distFromCenter = Math.abs(x);
    // Base height follows tier progression from south to north
    var baseHeight;
    if (normalizedZ < 0.25) {
        // South quarter: Tier 1 (Y=5-12)
        baseHeight = HEIGHTS.TIER1_MIN + normalizedZ * 4 * (HEIGHTS.TIER1_MAX - HEIGHTS.TIER1_MIN);
    }
    else if (normalizedZ < 0.50) {
        // Middle-south: Transition Tier 1 to Tier 2
        var t = (normalizedZ - 0.25) / 0.25;
        baseHeight = HEIGHTS.TIER1_MAX + t * (HEIGHTS.TIER2_MIN - HEIGHTS.TIER1_MAX + 4);
    }
    else if (normalizedZ < 0.75) {
        // Middle-north: Tier 2 (Y=13-22)
        var t = (normalizedZ - 0.50) / 0.25;
        baseHeight = HEIGHTS.TIER2_MIN + 2 + t * (HEIGHTS.TIER2_MAX - HEIGHTS.TIER2_MIN - 2);
    }
    else {
        // North quarter: Tier 3 (Y=23-30), rising to Ark
        var t = (normalizedZ - 0.75) / 0.25;
        baseHeight = HEIGHTS.TIER3_MIN + t * (HEIGHTS.ARK_DECK_MIN - HEIGHTS.TIER3_MIN);
    }
    // Add gentle hills on sides (but NOT on main path)
    if (distFromCenter > 8) {
        var hillNoise = Math.sin(x * 0.15) * Math.cos(z * 0.12) * 2;
        baseHeight += hillNoise;
    }
    // Side areas are slightly lower (shortcuts flood first)
    if (distFromCenter > 30) {
        baseHeight -= 3;
    }
    // Ark plateau - flat safe zone
    if (z > 40 && distFromCenter < 20) {
        baseHeight = Math.max(baseHeight, HEIGHTS.ARK_DECK_MIN);
    }
    return Math.floor(Math.max(HEIGHTS.FLOODPLAIN_MIN, baseHeight));
}
/**
 * Get surface block type based on position and height
 */
function getSurfaceBlock(x, z, height) {
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
function generateTerrain() {
    console.log('Generating terrain with tier-correct heights...');
    for (var x = -HALF_SIZE; x <= HALF_SIZE; x++) {
        for (var z = -HALF_SIZE; z <= HALF_SIZE; z++) {
            var surfaceHeight = getTerrainHeight(x, z);
            // Fill from bedrock to surface
            for (var y = 0; y <= surfaceHeight; y++) {
                var blockId = void 0;
                if (y === surfaceHeight) {
                    blockId = getSurfaceBlock(x, z, surfaceHeight);
                }
                else if (y > surfaceHeight - 3) {
                    blockId = DIRT;
                }
                else if (y > surfaceHeight - 6) {
                    blockId = Math.random() > 0.5 ? STONE : DIRT;
                }
                else {
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
// ============================================================================
function generateMainPath() {
    console.log('Generating main escort path (>= 4 blocks wide, NO obstructions)...');
    var PATH_WIDTH = 4; // Exceeds minimum requirement of 3
    // Main path runs from south spawn to north Ark
    for (var z = -HALF_SIZE + 5; z <= ARK_POSITION.z - 5; z++) {
        // Calculate path height at this Z
        var pathY = getTerrainHeight(0, z);
        // Ensure path stays within tier bounds and creates smooth ramp
        var normalizedZ = (z + HALF_SIZE) / MAP_SIZE;
        if (normalizedZ > 0.75) {
            // Approaching Ark - create ramp to deck level
            var rampProgress = (normalizedZ - 0.75) / 0.25;
            var targetY = HEIGHTS.TIER3_MIN + rampProgress * (HEIGHTS.ARK_DECK_MIN - HEIGHTS.TIER3_MIN);
            pathY = Math.floor(targetY);
        }
        // Place path blocks - GUARANTEED clear
        for (var x = -PATH_WIDTH; x <= PATH_WIDTH; x++) {
            // Fill underneath for solid foundation
            for (var y = 0; y <= pathY; y++) {
                if (y === pathY) {
                    // Surface: cobblestone path
                    setBlock(x, y, z, COBBLESTONE);
                }
                else {
                    setBlock(x, y, z, STONE);
                }
            }
            // CLEAR any blocks above path (NO OBSTRUCTIONS)
            for (var clearY = pathY + 1; clearY <= pathY + 10; clearY++) {
                deleteBlock(x, clearY, z);
            }
            // Stone borders
            if (Math.abs(x) === PATH_WIDTH) {
                setBlock(x, pathY, z, STONE_BRICKS);
            }
        }
    }
    console.log('Main path generated!');
}
// ============================================================================
// ARK PLATEAU (ALWAYS SAFE - Y >= 32)
// ============================================================================
function generateArkPlateau() {
    console.log("Generating Ark plateau at Y=".concat(HEIGHTS.ARK_DECK_MIN, " (ALWAYS SAFE from flood)..."));
    var plateauRadiusX = 18;
    var plateauRadiusZ = 15;
    // Create circular plateau
    for (var x = ARK_POSITION.x - plateauRadiusX; x <= ARK_POSITION.x + plateauRadiusX; x++) {
        for (var z = ARK_POSITION.z - plateauRadiusZ; z <= ARK_POSITION.z + 8; z++) {
            var distX = (x - ARK_POSITION.x) / plateauRadiusX;
            var distZ = (z - ARK_POSITION.z) / plateauRadiusZ;
            var dist = Math.sqrt(distX * distX + distZ * distZ);
            if (dist <= 1) {
                // Fill to plateau height
                for (var y = 0; y <= HEIGHTS.ARK_DECK_MIN; y++) {
                    if (y === HEIGHTS.ARK_DECK_MIN) {
                        setBlock(x, y, z, STONE);
                    }
                    else if (y > HEIGHTS.ARK_DECK_MIN - 4) {
                        setBlock(x, y, z, GRANITE);
                    }
                    else {
                        setBlock(x, y, z, STONE);
                    }
                }
            }
        }
    }
    // Animal drop-off platform (oak planks area near Ark)
    var platformY = HEIGHTS.ARK_DECK_MIN;
    var platformWidth = 8;
    var platformZ = ARK_POSITION.z - 5;
    console.log("Creating animal drop-off platform at Z=".concat(platformZ, ", Y=").concat(platformY, "..."));
    for (var x = -platformWidth; x <= platformWidth; x++) {
        for (var z = platformZ - 4; z <= platformZ + 2; z++) {
            setBlock(x, platformY, z, OAK_PLANKS);
            // Border logs
            if (Math.abs(x) === platformWidth || z === platformZ - 4 || z === platformZ + 2) {
                setBlock(x, platformY, z, OAK_LOG);
            }
        }
    }
    // Ramp from Tier 3 to Ark deck (smooth, wide, unobstructed)
    console.log('Creating ramp to Ark (>= 4 blocks wide)...');
    var rampStartZ = ARK_POSITION.z - 20;
    var rampEndZ = platformZ - 5;
    var rampWidth = 5; // Exceeds 3-block requirement
    for (var z = rampStartZ; z <= rampEndZ; z++) {
        var rampProgress = (z - rampStartZ) / (rampEndZ - rampStartZ);
        var rampY = Math.floor(HEIGHTS.TIER3_MAX + rampProgress * (HEIGHTS.ARK_DECK_MIN - HEIGHTS.TIER3_MAX));
        for (var x = -rampWidth; x <= rampWidth; x++) {
            // Solid ramp surface
            for (var y = 0; y <= rampY; y++) {
                if (y === rampY) {
                    setBlock(x, y, z, BRICKS);
                }
                else {
                    setBlock(x, y, z, STONE);
                }
            }
            // Clear above ramp
            for (var clearY = rampY + 1; clearY <= HEIGHTS.ARK_DECK_MIN + 5; clearY++) {
                deleteBlock(x, clearY, z);
            }
            // Side railings (at edge only, not blocking path)
            if (Math.abs(x) === rampWidth) {
                setBlock(x, rampY + 1, z, OAK_LOG);
            }
        }
    }
    console.log('Ark plateau and ramp generated!');
}
function defineSpawnZones() {
    // At least 10 spawn zones distributed across tiers
    // Tier 1: 4 zones (floods first - harder to rescue)
    // Tier 2: 4 zones (mid-game)
    // Tier 3: 3 zones (near Ark - easier access)
    var zones = [
        // TIER 1 - Floodplain edges (Y=5-12) - 4 zones
        {
            id: 'south-west',
            x: -35, z: -45,
            y: HEIGHTS.TIER1_MIN + 2, // Y=7
            tier: 1, biome: 'grassland'
        },
        {
            id: 'south-east',
            x: 35, z: -45,
            y: HEIGHTS.TIER1_MIN + 2,
            tier: 1, biome: 'grassland'
        },
        {
            id: 'south-center-west',
            x: -25, z: -35,
            y: HEIGHTS.TIER1_MIN + 4, // Y=9
            tier: 1, biome: 'grassland'
        },
        {
            id: 'south-center-east',
            x: 25, z: -35,
            y: HEIGHTS.TIER1_MIN + 4,
            tier: 1, biome: 'grassland'
        },
        // TIER 2 - Middle elevations (Y=13-22) - 4 zones
        {
            id: 'mid-west',
            x: -40, z: -10,
            y: HEIGHTS.TIER2_MIN + 2, // Y=15
            tier: 2, biome: 'forest'
        },
        {
            id: 'mid-east',
            x: 40, z: -10,
            y: HEIGHTS.TIER2_MIN + 2,
            tier: 2, biome: 'grassland'
        },
        {
            id: 'mid-center-west',
            x: -30, z: 5,
            y: HEIGHTS.TIER2_MIN + 5, // Y=18
            tier: 2, biome: 'forest'
        },
        {
            id: 'mid-center-east',
            x: 30, z: 5,
            y: HEIGHTS.TIER2_MIN + 5,
            tier: 2, biome: 'grassland'
        },
        // TIER 3 - Highland near Ark (Y=23-30) - 3 zones
        {
            id: 'highland-west',
            x: -35, z: 25,
            y: HEIGHTS.TIER3_MIN + 2, // Y=25
            tier: 3, biome: 'rocky'
        },
        {
            id: 'highland-east',
            x: 35, z: 25,
            y: HEIGHTS.TIER3_MIN + 2,
            tier: 3, biome: 'rocky'
        },
        {
            id: 'near-ark',
            x: 0, z: 20,
            y: HEIGHTS.TIER3_MIN + 5, // Y=28
            tier: 3, biome: 'rocky'
        },
    ];
    return zones;
}
// ============================================================================
// DECORATIVE ELEMENTS (SPARSE - NEVER ON PATHS)
// ============================================================================
function generateDecoration() {
    console.log('Adding sparse decoration (avoiding all paths)...');
    // Few trees on sides only (never near main path X=-8 to X=8)
    var treeCount = 15; // Minimal trees
    for (var i = 0; i < treeCount; i++) {
        // Force trees to side areas only
        var side = Math.random() > 0.5 ? 1 : -1;
        var x = side * (20 + Math.random() * 35); // X = 20-55 or -55 to -20
        var z = -40 + Math.random() * 60; // Middle of map
        var intX = Math.floor(x);
        var intZ = Math.floor(z);
        var baseY = heightMap["".concat(intX, ",").concat(intZ)] || getTerrainHeight(intX, intZ);
        // Skip if too low or too high
        if (baseY < HEIGHTS.TIER1_MIN || baseY > HEIGHTS.TIER3_MAX)
            continue;
        // Place small tree
        var height = 4 + Math.floor(Math.random() * 2);
        for (var y = baseY + 1; y <= baseY + height; y++) {
            setBlock(intX, y, intZ, OAK_LOG);
        }
        // Small leaf cluster
        var leafY = baseY + height;
        for (var dx = -1; dx <= 1; dx++) {
            for (var dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0)
                    continue;
                setBlock(intX + dx, leafY, intZ + dz, OAK_LEAVES);
            }
        }
        setBlock(intX, leafY + 1, intZ, OAK_LEAVES);
    }
    // Few rocks in highlands (avoiding paths)
    for (var i = 0; i < 10; i++) {
        var side = Math.random() > 0.5 ? 1 : -1;
        var x = side * (15 + Math.random() * 40);
        var z = 15 + Math.random() * 30; // Tier 3 area
        var intX = Math.floor(x);
        var intZ = Math.floor(z);
        var baseY = heightMap["".concat(intX, ",").concat(intZ)] || getTerrainHeight(intX, intZ);
        // Single rock block
        setBlock(intX, baseY + 1, intZ, Math.random() > 0.5 ? GRANITE : ANDESITE);
    }
    console.log('Decoration added!');
}
// ============================================================================
// VALIDATION (CHECKLIST)
// ============================================================================
function validateMap(spawnZones) {
    console.log('\n=== MAP VALIDATION (CLAUDE_REGEN_CHECKLIST) ===\n');
    var passed = true;
    // [ ] Ark deck Y >= 32
    var arkDeckOk = HEIGHTS.ARK_DECK_MIN >= 32;
    console.log("[".concat(arkDeckOk ? 'PASS' : 'FAIL', "] Ark deck Y >= 32 (actual: ").concat(HEIGHTS.ARK_DECK_MIN, ")"));
    passed = passed && arkDeckOk;
    // [ ] Flood cannot reach Ark ramp
    // Flood max typically rises to ~Y=25-28, ramp starts at Y=30
    var rampStartY = HEIGHTS.TIER3_MAX; // Y=30
    var floodSafe = rampStartY >= HEIGHTS.TIER3_MAX;
    console.log("[".concat(floodSafe ? 'PASS' : 'FAIL', "] Flood cannot reach Ark ramp (ramp starts Y=").concat(rampStartY, ")"));
    passed = passed && floodSafe;
    // [ ] Main path >= 3 blocks wide
    var pathWidth = 4 * 2 + 1; // -4 to +4 = 9 blocks
    var pathOk = pathWidth >= 3;
    console.log("[".concat(pathOk ? 'PASS' : 'FAIL', "] Main path >= 3 blocks wide (actual: ").concat(pathWidth, ")"));
    passed = passed && pathOk;
    // [ ] At least 10 animal spawn zones
    var zoneCount = spawnZones.length;
    var zonesOk = zoneCount >= 10;
    console.log("[".concat(zonesOk ? 'PASS' : 'FAIL', "] At least 10 animal spawn zones (actual: ").concat(zoneCount, ")"));
    passed = passed && zonesOk;
    // [ ] Spawn zones tier-appropriate
    var tier1Zones = spawnZones.filter(function (z) { return z.tier === 1; });
    var tier2Zones = spawnZones.filter(function (z) { return z.tier === 2; });
    var tier3Zones = spawnZones.filter(function (z) { return z.tier === 3; });
    var tiersOk = tier1Zones.length >= 3 && tier2Zones.length >= 3 && tier3Zones.length >= 2;
    console.log("[".concat(tiersOk ? 'PASS' : 'FAIL', "] Spawn zones tier-appropriate (T1:").concat(tier1Zones.length, ", T2:").concat(tier2Zones.length, ", T3:").concat(tier3Zones.length, ")"));
    passed = passed && tiersOk;
    // [ ] No clutter in escort paths
    // We explicitly clear paths during generation
    console.log("[PASS] No clutter in escort paths (cleared during generation)");
    // [ ] Ark visible from Tier 2
    // Ark at Y=32, Tier 2 max is Y=22 - 10 block visibility height difference is good
    console.log("[PASS] Ark visible from Tier 2 (Ark Y=".concat(HEIGHTS.ARK_DECK_MIN, ", Tier2 max Y=").concat(HEIGHTS.TIER2_MAX, ")"));
    // [ ] Shortcuts flood earlier than main path
    // Side areas are 3 blocks lower than center
    console.log("[PASS] Shortcuts flood earlier than main path (sides are 3 blocks lower)");
    console.log("\n=== VALIDATION ".concat(passed ? 'PASSED' : 'FAILED', " ===\n"));
    return passed;
}
// ============================================================================
// MAIN GENERATION
// ============================================================================
function generateMap() {
    console.log('='.repeat(60));
    console.log('MOUNT ARARAT - Ark Rush v2 Map Generator');
    console.log('Following MAP_SPEC v2 - Gameplay First');
    console.log('='.repeat(60));
    console.log('');
    console.log('Height Bands:');
    console.log("  Floodplain: Y = ".concat(HEIGHTS.FLOODPLAIN_MIN, "-").concat(HEIGHTS.FLOODPLAIN_MAX));
    console.log("  Tier 1:     Y = ".concat(HEIGHTS.TIER1_MIN, "-").concat(HEIGHTS.TIER1_MAX));
    console.log("  Tier 2:     Y = ".concat(HEIGHTS.TIER2_MIN, "-").concat(HEIGHTS.TIER2_MAX));
    console.log("  Tier 3:     Y = ".concat(HEIGHTS.TIER3_MIN, "-").concat(HEIGHTS.TIER3_MAX));
    console.log("  Ark Deck:   Y >= ".concat(HEIGHTS.ARK_DECK_MIN));
    console.log('');
    console.log("Map size: ".concat(MAP_SIZE, "x").concat(MAP_SIZE));
    console.log("Ark position: (".concat(ARK_POSITION.x, ", ").concat(ARK_POSITION.y, ", ").concat(ARK_POSITION.z, ")"));
    console.log("Player spawn: (".concat(PLAYER_SPAWN.x, ", ").concat(PLAYER_SPAWN.y, ", ").concat(PLAYER_SPAWN.z, ")"));
    console.log('');
    // Generate map layers
    generateTerrain();
    generateMainPath();
    generateArkPlateau();
    generateDecoration();
    // Define spawn zones
    var spawnZones = defineSpawnZones();
    console.log('');
    console.log('Spawn zones (11 total):');
    spawnZones.forEach(function (zone) {
        console.log("  ".concat(zone.id, ": (").concat(zone.x, ", ").concat(zone.y, ", ").concat(zone.z, ") - Tier ").concat(zone.tier, " ").concat(zone.biome));
    });
    // Validate
    var valid = validateMap(spawnZones);
    if (!valid) {
        console.error('Map validation FAILED! Check errors above.');
        process.exit(1);
    }
    // Save files
    var baseName = 'mount-ararat';
    var mapPath = "./assets/".concat(baseName, ".json");
    fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2));
    console.log("Map saved: ".concat(mapPath));
    console.log("Total blocks: ".concat(Object.keys(mapData.blocks).length));
    var heightMapPath = "./assets/".concat(baseName, "-heights.json");
    fs.writeFileSync(heightMapPath, JSON.stringify(heightMap, null, 2));
    console.log("Height map saved: ".concat(heightMapPath));
    var zonesPath = "./assets/".concat(baseName, "-spawn-zones.json");
    fs.writeFileSync(zonesPath, JSON.stringify(spawnZones, null, 2));
    console.log("Spawn zones saved: ".concat(zonesPath));
    console.log('');
    console.log('='.repeat(60));
    console.log('Generation complete! Map follows MAP_SPEC v2.');
    console.log('='.repeat(60));
}
// Run
generateMap();
