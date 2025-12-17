/**
 * Generate a simple raindrop particle texture
 * Creates a small vertical elongated white/blue gradient PNG
 */

const fs = require('fs');
const path = require('path');

// Create a simple 4x16 PNG for a raindrop (vertical streak)
// Using raw PNG format with minimal headers

function createRaindropPNG() {
  // Simple 4x16 RGBA image
  const width = 4;
  const height = 16;

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (image header)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // Width
  ihdrData.writeUInt32BE(height, 4);  // Height
  ihdrData.writeUInt8(8, 8);          // Bit depth
  ihdrData.writeUInt8(6, 9);          // Color type (RGBA)
  ihdrData.writeUInt8(0, 10);         // Compression
  ihdrData.writeUInt8(0, 11);         // Filter
  ihdrData.writeUInt8(0, 12);         // Interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Create raw RGBA data for raindrop
  // Vertical streak that's bright in the middle, fading at edges
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter byte
    for (let x = 0; x < width; x++) {
      // Vertical fade: brightest at top-center, fading down
      const verticalFade = 1 - (y / height) * 0.7;
      // Horizontal fade: brightest in center
      const horizontalFade = 1 - Math.abs(x - 1.5) / 2;
      const brightness = verticalFade * horizontalFade;

      // White with light blue tint
      const r = Math.floor(220 + 35 * brightness);
      const g = Math.floor(230 + 25 * brightness);
      const b = 255; // Full blue
      const a = Math.floor(255 * brightness * 0.9);

      rawData.push(r, g, b, a);
    }
  }

  // Compress data using zlib
  const zlib = require('zlib');
  const compressedData = zlib.deflateSync(Buffer.from(rawData), { level: 9 });

  const idatChunk = createChunk('IDAT', compressedData);

  // IEND chunk (end marker)
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  // Combine all chunks
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation for PNG
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1;
}

// Pre-computed CRC32 table
const crc32Table = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[i] = c;
}

// Generate and save
const outputDir = path.join(__dirname, 'assets', 'textures', 'particles');
fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.join(outputDir, 'raindrop.png');
const pngData = createRaindropPNG();
fs.writeFileSync(outputPath, pngData);

console.log(`Created raindrop texture: ${outputPath}`);
console.log(`Size: ${pngData.length} bytes`);
