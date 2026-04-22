import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync('public/og.svg');
await sharp(svg, { density: 200 })
  .resize(1200, 630)
  .png({ compressionLevel: 9 })
  .toFile('public/og.png');

console.log('wrote public/og.png');
