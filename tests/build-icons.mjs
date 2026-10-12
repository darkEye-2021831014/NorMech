#!/usr/bin/env node
/**
 * Build the favicon variants from src/app/icon.svg.
 *
 * Reads:  src/app/icon.svg
 * Writes: src/app/apple-icon.png (180x180, PNG)
 *         public/favicon.ico   (multi-size ICO: 16, 32, 48)
 *
 * Uses the `sharp` package as a devDependency. ICO files are a
 * simple container of multiple PNG-sized icons preceded by a 6-byte
 * header and a 16-byte-per-image directory entry — we hand-assemble
 * the bytes so we don't need a heavy ICO-encoding dependency.
 *
 * Re-run with: `node tests/build-icons.mjs` (or `npm run icons`).
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SVG_PATH = resolve(ROOT, 'src/app/icon.svg');
const APPLE_PATH = resolve(ROOT, 'src/app/apple-icon.png');
const FAVICON_PATH = resolve(ROOT, 'public/favicon.ico');

const APPLE_SIZE = 180;
const ICO_SIZES = [16, 32, 48];

if (!existsSync(SVG_PATH)) {
  console.error(`Missing ${SVG_PATH}.`);
  process.exit(1);
}

mkdirSync(dirname(APPLE_PATH), { recursive: true });
mkdirSync(dirname(FAVICON_PATH), { recursive: true });

const svg = readFileSync(SVG_PATH);

// Apple touch icon — 180x180, PNG. The background is fully
// transparent where the icon doesn't paint, but since the mark
// itself is a solid ink tile the icon is opaque everywhere it
// matters.
await sharp(svg)
  .resize(APPLE_SIZE, APPLE_SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile(APPLE_PATH);

// Per-size PNG buffers for the ICO.
const pngs = {};
for (const s of ICO_SIZES) {
  pngs[s] = await sharp(svg)
    .resize(s, s, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

// Build the ICO container by hand. Format:
//   ICONDIR (6 bytes):  reserved(2)=0, type(2)=1, count(2)=N
//   ICONDIRENTRY x N (16 bytes each):
//     width(1), height(1), colorCount(1)=0, reserved(1)=0,
//     planes(2)=1, bitCount(2)=32, sizeInBytes(4), offset(4)
//   Then each PNG payload at the recorded offsets.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = ICO
header.writeUInt16LE(ICO_SIZES.length, 4);

const dirEntries = Buffer.alloc(16 * ICO_SIZES.length);
let dataOffset = 6 + 16 * ICO_SIZES.length;
const dataChunks = [];
for (let i = 0; i < ICO_SIZES.length; i++) {
  const s = ICO_SIZES[i];
  const png = pngs[s];
  const e = i * 16;
  dirEntries.writeUInt8(s === 256 ? 0 : s, e + 0); // width (0 = 256)
  dirEntries.writeUInt8(s === 256 ? 0 : s, e + 1); // height
  dirEntries.writeUInt8(0, e + 2); // palette
  dirEntries.writeUInt8(0, e + 3); // reserved
  dirEntries.writeUInt16LE(1, e + 4); // color planes
  dirEntries.writeUInt16LE(32, e + 6); // bits per pixel
  dirEntries.writeUInt32LE(png.length, e + 8); // image size
  dirEntries.writeUInt32LE(dataOffset, e + 12); // offset
  dataChunks.push(png);
  dataOffset += png.length;
}

const ico = Buffer.concat([header, dirEntries, ...dataChunks]);
writeFileSync(FAVICON_PATH, ico);

console.log(`Wrote ${APPLE_PATH}`);
console.log(`Wrote ${FAVICON_PATH} (${ico.length} bytes, ${ICO_SIZES.join('/')})`);
