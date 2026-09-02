/**
 * Generates the PWA PNG icons without an image dependency: we draw into a raw
 * RGBA buffer and encode a minimal PNG with node's own zlib.
 * Run with `node tools/make-icons.mjs` after changing the icon design.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [0x12, 0x16, 0x1d];
const ROAD = [0x33, 0x3b, 0x47];
const STRIPE = [0xff, 0xd2, 0x4a];
const CAB = [0x37, 0xc4, 0x6b];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // rows are prefixed with filter type 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  const rect = (x0, y0, w, h, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
  };
  const u = size / 32; // design grid
  rect(0, 0, size, size, BG);
  // road band running across the icon
  rect(0, Math.round(17 * u), size, Math.round(9 * u), ROAD);
  // dashed centre line
  for (let x = 0; x < size; x += Math.round(7 * u)) {
    rect(x, Math.round(21 * u), Math.round(4 * u), Math.round(1.4 * u), STRIPE);
  }
  // truck: trailer + cab sitting above the road
  rect(Math.round(6 * u), Math.round(8 * u), Math.round(13 * u), Math.round(8 * u), STRIPE);
  rect(Math.round(19 * u), Math.round(10 * u), Math.round(7 * u), Math.round(6 * u), CAB);
  // wheels
  rect(Math.round(9 * u), Math.round(16 * u), Math.round(3 * u), Math.round(2 * u), ROAD);
  rect(Math.round(21 * u), Math.round(16 * u), Math.round(3 * u), Math.round(2 * u), ROAD);
  return px;
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), encodePng(size, draw(size)));
}

writeFileSync(
  join(OUT, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#12161d"/>
  <rect y="17" width="32" height="9" fill="#333b47"/>
  <g fill="#ffd24a"><rect x="0" y="21" width="4" height="1.4"/><rect x="7" y="21" width="4" height="1.4"/><rect x="14" y="21" width="4" height="1.4"/><rect x="21" y="21" width="4" height="1.4"/><rect x="28" y="21" width="4" height="1.4"/></g>
  <rect x="6" y="8" width="13" height="8" fill="#ffd24a"/>
  <rect x="19" y="10" width="7" height="6" fill="#37c46b"/>
  <g fill="#333b47"><rect x="9" y="16" width="3" height="2"/><rect x="21" y="16" width="3" height="2"/></g>
</svg>
`,
);

console.warn('icons written to', OUT);
