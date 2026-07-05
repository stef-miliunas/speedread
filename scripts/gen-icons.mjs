/**
 * Generates the PWA icons with zero image dependencies: the scene (an open
 * book with the app's amber fixation notch above the spine) is rendered
 * per-pixel with point-in-triangle tests + supersampling, then encoded as
 * PNG by hand using node:zlib for the IDAT deflate.
 *
 * Run: npm run icons   (outputs to public/icons/)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---------------------------------------------------------------- palette
const BG = [11, 14, 20]; // #0b0e14
const PAPER = [233, 228, 216]; // #e9e4d8
const INK = [154, 145, 123]; // muted line color on paper
const AMBER = [224, 164, 88]; // #e0a458
const SPINE = [11, 14, 20];

// ------------------------------------------------------------- geometry
function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function inQuad(px, py, quad) {
  return (
    inTriangle(px, py, quad[0], quad[1], quad[2]) ||
    inTriangle(px, py, quad[0], quad[2], quad[3])
  );
}

// Open book, unit coords: x,y in [-1,1], y grows downward.
const LEFT_PAGE = [
  [-0.66, -0.3],
  [-0.02, -0.14],
  [-0.02, 0.44],
  [-0.66, 0.28],
];
const RIGHT_PAGE = [
  [0.02, -0.14],
  [0.66, -0.3],
  [0.66, 0.28],
  [0.02, 0.44],
];
const NOTCH = [
  [-0.1, -0.62],
  [0.1, -0.62],
  [0, -0.42],
];

// Text lines: short bars parallel to each page's sheared top edge.
function pageLines(mirror) {
  const lines = [];
  const topAt = (x) => {
    // Top edge of the page as a function of |x| distance from spine.
    const t = (Math.abs(x) - 0.02) / 0.64; // 0 at spine, 1 at outer edge
    return -0.14 - 0.16 * t;
  };
  const xs = mirror ? [0.1, 0.56] : [-0.56, -0.1];
  for (let i = 0; i < 3; i++) {
    const offset = 0.14 + i * 0.14;
    const thickness = 0.045;
    const [x0, x1] = xs;
    const shrink = i === 2 ? (mirror ? -0.14 : 0.14) : 0; // last line shorter
    lines.push([
      [x0 + (mirror ? 0 : shrink), topAt(x0) + offset],
      [x1 + (mirror ? shrink : 0), topAt(x1) + offset],
      [x1 + (mirror ? shrink : 0), topAt(x1) + offset + thickness],
      [x0 + (mirror ? 0 : shrink), topAt(x0) + offset + thickness],
    ]);
  }
  return lines;
}

const LEFT_LINES = pageLines(false);
const RIGHT_LINES = pageLines(true);

function sceneColor(x, y) {
  // x, y in [-1, 1]
  if (inTriangle(x, y, ...NOTCH)) return AMBER;
  const onLeft = inQuad(x, y, LEFT_PAGE);
  const onRight = inQuad(x, y, RIGHT_PAGE);
  if (onLeft || onRight) {
    if (Math.abs(x) < 0.02) return SPINE;
    const lines = onLeft ? LEFT_LINES : RIGHT_LINES;
    for (let i = 0; i < lines.length; i++) {
      if (inQuad(x, y, lines[i])) {
        // Middle line on the right page carries the accent — the "current
        // word" — echoing the reader's fixation highlight.
        return onRight && i === 1 ? AMBER : INK;
      }
    }
    return PAPER;
  }
  return BG;
}

// ------------------------------------------------------------- rendering
function render(size, contentScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // 3x3 supersampling
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const v = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          const [cr, cg, cb] = sceneColor(u / contentScale, v / contentScale);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / (SS * SS));
      rgba[i + 1] = Math.round(g / (SS * SS));
      rgba[i + 2] = Math.round(b / (SS * SS));
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// ---------------------------------------------------------- PNG encoding
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
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
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ main
mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192, 0.92],
  ['icon-512.png', 512, 0.92],
  ['icon-maskable-512.png', 512, 0.68], // safe-zone inset for maskable
  ['apple-touch-icon.png', 180, 0.92],
  ['favicon-64.png', 64, 1.0],
];
for (const [name, size, scale] of targets) {
  writeFileSync(join(OUT_DIR, name), encodePng(size, render(size, scale)));
  console.log(`wrote public/icons/${name}`);
}
