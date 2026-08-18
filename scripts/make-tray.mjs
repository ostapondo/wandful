// Generates monochrome template tray icons (black + alpha) for the menu bar.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

// 22x22 design grid, rendered at 1x and 2x. '#' = solid, '+' = 55% alpha
// Same pose as the app icon and the in-app sprite: tip (with its little
// star) at the top-left, handle at the bottom-right.
const G = [
  "......................",
  ".....#................",
  ".....#................",
  "...#####..............",
  ".....#................",
  ".....#..###...........",
  ".......####...........",
  ".......+.####.........",
  "......+++..####.......",
  ".......+....####......",
  ".............####.....",
  "..............####....",
  "...............####...",
  "................####..",
  ".................####.",
  "..................###.",
  "...................##.",
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
];
function png(size, scale) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ch = G[Math.floor(y / scale)][Math.floor(x / scale)];
    const a = ch === "#" ? 255 : ch === "+" ? 140 : 0;
    px.set([0, 0, 0, a], (y * size + x) * 4);
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
writeFileSync("src-tauri/icons/tray.png", png(22, 1));
writeFileSync("src-tauri/icons/tray@2x.png", png(44, 2));
console.log("wrote tray icons");
