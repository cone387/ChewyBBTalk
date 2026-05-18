/**
 * Generate a simple 256x256 app icon (blue circle with + sign).
 * Run: node scripts/generate-icon.js
 * Output: resources/icon.png
 */
const fs = require('fs');
const path = require('path');

// Simple BMP-like raw RGBA → PNG using minimal PNG encoder
// For a real project, use a proper icon file. This is a placeholder.

const SIZE = 512;
const pixels = Buffer.alloc(SIZE * SIZE * 4);

const cx = SIZE / 2;
const cy = SIZE / 2;
const r = 200; // circle radius
const lineW = 32; // plus sign line width
const lineLen = 100; // plus sign half-length

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const idx = (y * SIZE + x) * 4;

    if (dist <= r) {
      // Blue circle
      pixels[idx] = 0x3B;     // R
      pixels[idx + 1] = 0x82; // G
      pixels[idx + 2] = 0xF6; // B
      pixels[idx + 3] = 255;  // A

      // White + sign
      const inHLine = Math.abs(dy) <= lineW / 2 && Math.abs(dx) <= lineLen;
      const inVLine = Math.abs(dx) <= lineW / 2 && Math.abs(dy) <= lineLen;
      if (inHLine || inVLine) {
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
        pixels[idx + 3] = 255;
      }
    } else if (dist <= r + 2) {
      // Anti-alias edge
      const alpha = Math.round((1 - (dist - r) / 2) * 255);
      pixels[idx] = 0x3B;
      pixels[idx + 1] = 0x82;
      pixels[idx + 2] = 0xF6;
      pixels[idx + 3] = alpha;
    }
  }
}

// Minimal PNG encoder (uncompressed)
function createPNG(width, height, rgbaBuffer) {
  const { deflateSync } = require('zlib');

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: add filter byte (0 = None) before each row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    rgbaBuffer.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(rawData);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0, 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
      }
    }
    return c ^ 0xFFFFFFFF;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const png = createPNG(SIZE, SIZE, pixels);
const outDir = path.join(__dirname, '..', 'resources');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
console.log('Generated resources/icon.png (%d bytes)', png.length);
