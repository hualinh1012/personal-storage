// Generates the app icons in public/icons/ (a white folder on the app's blue).
// No dependencies: shapes are rounded rectangles, anti-aliased by supersampling,
// written as PNG with node:zlib. Run with `node scripts/make-icons.mjs` after
// changing the design; the PNGs are committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const BLUE = [0x1a, 0x73, 0xe8];
const TAB = [0xd2, 0xe3, 0xfc];
const WHITE = [0xff, 0xff, 0xff];

// Folder in unit coordinates, centred on (0.5, 0.5) at scale 1.
const FOLDER = [
  { x0: 0.18, y0: 0.24, x1: 0.48, y1: 0.42, r: 0.05, color: TAB },
  { x0: 0.18, y0: 0.32, x1: 0.82, y1: 0.76, r: 0.06, color: WHITE },
];

/** Is (x, y) inside the rounded rectangle? */
function inRect(x, y, { x0, y0, x1, y1, r }) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * @param size  pixels per side
 * @param bgRadius corner radius of the blue tile (0 = full bleed square)
 * @param folderScale shrink the folder towards the centre (maskable safe zone)
 */
function render(size, bgRadius, folderScale) {
  const SS = 4;
  const bg = { x0: 0, y0: 0, x1: 1, y1: 1, r: bgRadius };
  const shapes = FOLDER.map((s) => ({
    ...s,
    x0: 0.5 + (s.x0 - 0.5) * folderScale,
    y0: 0.5 + (s.y0 - 0.5) * folderScale,
    x1: 0.5 + (s.x1 - 0.5) * folderScale,
    y1: 0.5 + (s.y1 - 0.5) * folderScale,
    r: s.r * folderScale,
  }));
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (pxi + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (!inRect(x, y, bg)) continue;
          let c = BLUE;
          for (const s of shapes) if (inRect(x, y, s)) c = s.color;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (py * size + pxi) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
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
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = {
  "icon-192.png": render(192, 0.2, 1),
  "icon-512.png": render(512, 0.2, 1),
  // Maskable: full-bleed, folder inside the central 80% safe zone.
  "maskable-512.png": render(512, 0, 0.75),
  // iOS rounds the corners itself and shows transparency as black.
  "apple-touch-icon.png": render(180, 0, 0.85),
  "favicon-32.png": render(32, 0.2, 1),
};
for (const [name, data] of Object.entries(icons)) writeFileSync(join(OUT, name), data);
console.log(`wrote ${Object.keys(icons).length} icons to ${OUT}`);
