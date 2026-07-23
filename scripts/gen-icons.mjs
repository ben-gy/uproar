/**
 * gen-icons.mjs — every icon from Uproar's own identity.
 *
 * The mark is four rising bars (an equaliser / a loudness meter climbing), on the
 * ink background, in the game's amber→magenta "louder = hotter" gradient. Written
 * to an RGBA buffer and encoded with a tiny hand-rolled PNG writer so the build
 * never depends on an optional raster package.
 *
 * The iOS icon is OPAQUE: iOS composites a transparent apple-touch-icon onto black,
 * which would smear a dark-themed mark. The maskable icon keeps its art inside the
 * ~80% safe circle, because Android crops anything that is not.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'public');
mkdirSync(out, { recursive: true });

const BG = [14, 18, 48]; // #0e1230
// Four bars, short→tall, cool→hot.
const BARS = [
  { col: [255, 180, 58], h: 0.34 }, // amber
  { col: [255, 122, 69], h: 0.52 }, // orange
  { col: [255, 77, 126], h: 0.72 }, // magenta-pink
  { col: [233, 75, 208], h: 0.9 }, // magenta
];

function paint(size, { opaque, inset }) {
  const buf = Buffer.alloc(size * size * 4);
  const region = size * inset;
  const x0 = (size - region) / 2;
  const y0 = (size - region) / 2;
  const gap = region * 0.06;
  const barW = (region - gap * 3) / 4;
  const radius = barW * 0.32;

  const inRoundRect = (px, py, rx, ry, rw, rh, r) => {
    if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false;
    const cxl = rx + r;
    const cxr = rx + rw - r;
    const cyt = ry + r;
    const cyb = ry + rh - r;
    let qx = px;
    let qy = py;
    if (px < cxl) qx = cxl;
    else if (px > cxr) qx = cxr;
    if (py < cyt) qy = cyt;
    else if (py > cyb) qy = cyb;
    if (qx === px && qy === py) return true;
    return Math.hypot(px - qx, py - qy) <= r;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let col = null;
      let alpha = opaque ? 255 : 0;
      if (opaque) col = BG;

      for (let b = 0; b < 4; b++) {
        const bh = region * BARS[b].h;
        const bx = x0 + b * (barW + gap);
        const by = y0 + region - bh;
        if (inRoundRect(x + 0.5, y + 0.5, bx, by, barW, bh, radius)) {
          col = BARS[b].col;
          alpha = 255;
        }
      }

      if (col) {
        buf[i] = col[0];
        buf[i + 1] = col[1];
        buf[i + 2] = col[2];
        buf[i + 3] = alpha;
      }
    }
  }
  return buf;
}

function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
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

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const jobs = [
  ['icon-192.png', 192, { opaque: false, inset: 0.82 }],
  ['icon-512.png', 512, { opaque: false, inset: 0.82 }],
  // Android crops a non-maskable icon; keep the art inside the safe circle.
  ['icon-512-maskable.png', 512, { opaque: true, inset: 0.6 }],
  // iOS composites transparency onto BLACK, so this one must be opaque.
  ['icon-180.png', 180, { opaque: true, inset: 0.72 }],
];

for (const [name, size, opts] of jobs) {
  writeFileSync(resolve(out, name), png(size, paint(size, opts)));
  console.log(`wrote ${name} (${size}px)`);
}
