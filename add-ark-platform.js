/**
 * Script to add a platform under the Ark to hide the hull
 * Run with: node add-ark-platform.js
 */

const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, 'assets', 'mount-ararat.json');

// Load existing map
let mapData;
try {
  mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  console.log('Loaded map with', Object.keys(mapData.blocks).length, 'existing blocks');
} catch (error) {
  console.error('Error loading map:', error);
  process.exit(1);
}

// Ark position and dimensions
const arkCenter = { x: 0, y: 34, z: 50 };
const arkRotation = 135; // degrees

// Platform dimensions to cover the hull
// The ark at 135° runs diagonally from roughly (-25, z+25) to (+25, z-25)
const platformConfig = {
  // We'll create an elongated platform along the ark's axis
  minY: 28,  // Bottom of platform
  maxY: 36,  // Top of platform (just below ark deck)

  // Block types (use IDs from map's blockTypes)
  stoneBlock: 12,      // Stone for main structure
  cobbleBlock: 3,      // Cobblestone for variety
};

let blocksAdded = 0;

// Function to add a block if it doesn't exist
function addBlock(x, y, z, blockType) {
  const key = `${x},${y},${z}`;
  if (!mapData.blocks[key]) {
    mapData.blocks[key] = blockType;
    blocksAdded++;
  }
}

// Create platform under the ark
// The ark is rotated 135°, so it runs from upper-left to lower-right
// We'll create an elliptical/rectangular platform aligned with the ark

console.log('Adding platform blocks under the ark...');

for (let y = platformConfig.minY; y <= platformConfig.maxY; y++) {
  // At each Y level, create a platform
  // The platform follows the ark's diagonal orientation

  for (let offset = -30; offset <= 30; offset++) {
    // Along the ark's length (135° diagonal)
    // At 135°, moving along ark means: x increases, z decreases (or vice versa)
    const alongX = offset * Math.cos(135 * Math.PI / 180); // ≈ -0.707 * offset
    const alongZ = offset * Math.sin(135 * Math.PI / 180); // ≈ 0.707 * offset

    // Width of platform perpendicular to ark (narrower)
    for (let width = -12; width <= 12; width++) {
      // Perpendicular direction (45°)
      const perpX = width * Math.cos(45 * Math.PI / 180);
      const perpZ = width * Math.sin(45 * Math.PI / 180);

      const finalX = Math.round(arkCenter.x + alongX + perpX);
      const finalZ = Math.round(arkCenter.z + alongZ + perpZ);

      // Taper the platform - wider in middle, narrower at ends
      const distFromCenter = Math.abs(offset);
      const maxWidth = 12 - Math.floor(distFromCenter / 5);

      if (Math.abs(width) <= maxWidth) {
        // Alternate between stone and cobble for texture
        const blockType = ((finalX + finalZ + y) % 3 === 0)
          ? platformConfig.cobbleBlock
          : platformConfig.stoneBlock;

        addBlock(finalX, y, finalZ, blockType);
      }
    }
  }
}

// Add some extra fill around the edges to blend with existing terrain
console.log('Adding edge blending blocks...');

for (let y = platformConfig.minY; y <= platformConfig.maxY - 2; y++) {
  for (let x = -35; x <= 35; x++) {
    for (let z = 35; z <= 65; z++) {
      // Only add at the edges to fill gaps
      const distFromArkCenter = Math.sqrt(
        Math.pow(x - arkCenter.x, 2) +
        Math.pow(z - arkCenter.z, 2)
      );

      // Fill in areas close to the ark that might have gaps
      if (distFromArkCenter < 25 && distFromArkCenter > 15) {
        const key = `${x},${y},${z}`;
        if (!mapData.blocks[key]) {
          // Check if there's a block above (don't fill open air)
          const keyAbove = `${x},${y+1},${z}`;
          if (mapData.blocks[keyAbove]) {
            addBlock(x, y, z, platformConfig.stoneBlock);
          }
        }
      }
    }
  }
}

console.log(`Added ${blocksAdded} new blocks`);
console.log('Total blocks now:', Object.keys(mapData.blocks).length);

// Save the updated map
const outputPath = mapPath;
fs.writeFileSync(outputPath, JSON.stringify(mapData, null, 2));
console.log('Saved updated map to:', outputPath);
console.log('\nDone! Restart the game to see changes.');
