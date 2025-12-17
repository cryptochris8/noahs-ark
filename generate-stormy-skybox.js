/**
 * Generate a stormy/darker version of the partly-cloudy skybox
 * Darkens the images and adds a blue-gray storm tint
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SOURCE_DIR = path.join(__dirname, 'assets', 'skyboxes', 'partly-cloudy');
const OUTPUT_DIR = path.join(__dirname, 'assets', 'skyboxes', 'stormy');

// Storm effect parameters
const DARKNESS = 0.45;        // Overall darkness (0 = black, 1 = original)
const STORM_TINT = {          // Blue-gray storm tint
  r: 0.7,
  g: 0.75,
  b: 0.9
};
const DESATURATION = 0.3;     // How much to desaturate (0 = full color, 1 = grayscale)

// Skybox face files
const FACES = ['+x.png', '-x.png', '+y.png', '-y.png', '+z.png', '-z.png'];

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('Creating stormy skybox...');
console.log(`Source: ${SOURCE_DIR}`);
console.log(`Output: ${OUTPUT_DIR}`);
console.log(`Darkness: ${DARKNESS * 100}%`);

function processImage(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(new PNG())
      .on('parsed', function() {
        // Process each pixel
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const idx = (this.width * y + x) << 2;

            let r = this.data[idx];
            let g = this.data[idx + 1];
            let b = this.data[idx + 2];
            // Alpha stays the same

            // Calculate grayscale value for desaturation
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Apply desaturation
            r = r * (1 - DESATURATION) + gray * DESATURATION;
            g = g * (1 - DESATURATION) + gray * DESATURATION;
            b = b * (1 - DESATURATION) + gray * DESATURATION;

            // Apply storm tint
            r *= STORM_TINT.r;
            g *= STORM_TINT.g;
            b *= STORM_TINT.b;

            // Apply darkness
            r *= DARKNESS;
            g *= DARKNESS;
            b *= DARKNESS;

            // Clamp values
            this.data[idx] = Math.max(0, Math.min(255, Math.round(r)));
            this.data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
            this.data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
          }
        }

        // Write output
        this.pack()
          .pipe(fs.createWriteStream(outputPath))
          .on('finish', () => {
            console.log(`  Created: ${path.basename(outputPath)}`);
            resolve();
          })
          .on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  try {
    for (const face of FACES) {
      const inputPath = path.join(SOURCE_DIR, face);
      const outputPath = path.join(OUTPUT_DIR, face);

      if (fs.existsSync(inputPath)) {
        await processImage(inputPath, outputPath);
      } else {
        console.log(`  Warning: ${face} not found, skipping`);
      }
    }

    console.log('\nStormy skybox created successfully!');
    console.log('To use it, update your map or code to reference: skyboxes/stormy');
  } catch (error) {
    console.error('Error creating stormy skybox:', error);
  }
}

main();
