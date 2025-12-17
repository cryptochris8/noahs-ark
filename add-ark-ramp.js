/**
 * Add a ramp from the cobblestone plaza up to the Ark
 *
 * Starting position: approximately (0, 20, 14)
 * Ending position: approximately (0, 34, 50)
 *
 * Rise: 14 blocks (Y: 20 -> 34)
 * Run: 36 blocks (Z: 14 -> 50)
 */

const fs = require('fs');
const path = require('path');

// Load the existing map
const mapPath = path.join(__dirname, 'assets', 'mount-ararat.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

console.log('Loaded map with', Object.keys(map.blocks).length, 'blocks');

// Block type IDs (from the map's blockTypes)
const BLOCK_TYPES = {
  COBBLESTONE: 7,      // cobblestone
  STONE_BRICKS: 20,    // stone-bricks
  OAK_PLANKS: 12,      // oak-planks
  BIRCH_PLANKS: 3,     // birch-planks
};

// Ramp configuration
const RAMP_WIDTH = 7;  // Width of the ramp (centered on X=0)
const RAMP_START_Z = 16;  // Starting Z position
const RAMP_END_Z = 48;    // Ending Z position (near the ark)
const RAMP_START_Y = 20;  // Starting height
const RAMP_END_Y = 33;    // Ending height (just below ark deck)

// Calculate ramp parameters
const zLength = RAMP_END_Z - RAMP_START_Z;
const yRise = RAMP_END_Y - RAMP_START_Y;
const slope = yRise / zLength;

console.log(`Creating ramp from Z=${RAMP_START_Z} to Z=${RAMP_END_Z}`);
console.log(`Height from Y=${RAMP_START_Y} to Y=${RAMP_END_Y}`);
console.log(`Slope: ${slope.toFixed(3)} (rise ${yRise} over run ${zLength})`);

let blocksAdded = 0;

// Add ramp blocks
for (let z = RAMP_START_Z; z <= RAMP_END_Z; z++) {
  // Calculate the Y height at this Z position
  const progress = (z - RAMP_START_Z) / zLength;
  const rampY = Math.floor(RAMP_START_Y + (yRise * progress));

  // Add blocks across the width of the ramp
  const halfWidth = Math.floor(RAMP_WIDTH / 2);
  for (let x = -halfWidth; x <= halfWidth; x++) {
    // Add the ramp surface block
    const surfaceKey = `${x},${rampY},${z}`;
    map.blocks[surfaceKey] = BLOCK_TYPES.STONE_BRICKS;
    blocksAdded++;

    // Add support blocks underneath (fill down to existing terrain or a reasonable depth)
    for (let supportY = rampY - 1; supportY >= rampY - 3; supportY--) {
      const supportKey = `${x},${supportY},${z}`;
      // Only add if not already occupied
      if (!map.blocks[supportKey]) {
        map.blocks[supportKey] = BLOCK_TYPES.COBBLESTONE;
        blocksAdded++;
      }
    }
  }

  // Add edge railings (optional decorative blocks on sides)
  const leftEdgeKey = `${-halfWidth - 1},${rampY + 1},${z}`;
  const rightEdgeKey = `${halfWidth + 1},${rampY + 1},${z}`;

  // Only add railings every 2 blocks for a cleaner look
  if (z % 2 === 0) {
    if (!map.blocks[leftEdgeKey]) {
      map.blocks[leftEdgeKey] = BLOCK_TYPES.OAK_PLANKS;
      blocksAdded++;
    }
    if (!map.blocks[rightEdgeKey]) {
      map.blocks[rightEdgeKey] = BLOCK_TYPES.OAK_PLANKS;
      blocksAdded++;
    }
  }
}

// Add a flat landing area at the top of the ramp
console.log('Adding landing platform at top of ramp...');
const LANDING_WIDTH = 9;
const LANDING_DEPTH = 4;
const landingHalfWidth = Math.floor(LANDING_WIDTH / 2);

for (let z = RAMP_END_Z; z <= RAMP_END_Z + LANDING_DEPTH; z++) {
  for (let x = -landingHalfWidth; x <= landingHalfWidth; x++) {
    const key = `${x},${RAMP_END_Y},${z}`;
    map.blocks[key] = BLOCK_TYPES.STONE_BRICKS;
    blocksAdded++;

    // Support underneath
    for (let supportY = RAMP_END_Y - 1; supportY >= RAMP_END_Y - 2; supportY--) {
      const supportKey = `${x},${supportY},${z}`;
      if (!map.blocks[supportKey]) {
        map.blocks[supportKey] = BLOCK_TYPES.COBBLESTONE;
        blocksAdded++;
      }
    }
  }
}

// Add a small platform at the start of the ramp for the drop-off zone
console.log('Adding drop-off platform at start of ramp...');
const DROPOFF_WIDTH = 9;
const DROPOFF_DEPTH = 3;
const dropoffHalfWidth = Math.floor(DROPOFF_WIDTH / 2);

for (let z = RAMP_START_Z - DROPOFF_DEPTH; z < RAMP_START_Z; z++) {
  for (let x = -dropoffHalfWidth; x <= dropoffHalfWidth; x++) {
    const key = `${x},${RAMP_START_Y},${z}`;
    if (!map.blocks[key]) {
      map.blocks[key] = BLOCK_TYPES.BIRCH_PLANKS;  // Distinctive color for drop-off
      blocksAdded++;
    }
  }
}

console.log(`Added ${blocksAdded} blocks to the map`);
console.log('Total blocks:', Object.keys(map.blocks).length);

// Save the modified map
fs.writeFileSync(mapPath, JSON.stringify(map));
console.log('Saved modified map to:', mapPath);

console.log('\nRamp created successfully!');
console.log('Drop-off zone is at approximately (0, 20, 14)');
console.log('Ramp leads up to (0, 33, 50) near the Ark');
