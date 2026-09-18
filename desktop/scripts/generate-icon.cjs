// Deterministic native icon assets from the shared vector master.
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '../resources');
const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
const png = size => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
fs.writeFileSync(path.join(root, 'icon.png'), png(512));
fs.writeFileSync(path.join(root, 'tray.png'), png(32));
const template = fs.readFileSync(path.join(root, 'trayTemplate.svg'), 'utf8');
for (const size of [22, 44]) fs.writeFileSync(path.join(root, size === 22 ? 'trayTemplate.png' : 'trayTemplate@2x.png'), new Resvg(template, { fitTo: { mode: 'width', value: size } }).render().asPng());
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map(png);
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] % 256; header[entry + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
fs.writeFileSync(path.join(root, 'icon.ico'), Buffer.concat([header, ...images]));
const chunks = [[128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([size, type]) => {
  const image = png(size); const chunk = Buffer.alloc(8); chunk.write(type); chunk.writeUInt32BE(image.length + 8, 4);
  return Buffer.concat([chunk, image]);
});
const icns = Buffer.alloc(8); icns.write('icns'); icns.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
fs.writeFileSync(path.join(root, 'icon.icns'), Buffer.concat([icns, ...chunks]));
console.log('Generated PNG, multi-resolution ICO, ICNS and tray assets from icon.svg');
