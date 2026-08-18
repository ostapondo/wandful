// Generates src-tauri/app-icon.png (1024x1024) — a pixel-art magic wand.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const G = [
  "................",
  "..........Y.....",
  ".........YWY....",
  "..........Y..P..",
  "........W..PP...",
  "..........PP..Y.",
  ".........PP.....",
  "..Y.....PP......",
  ".......PP.......",
  "......PP...W....",
  ".....HH.........",
  "....HH..........",
  "...HH...........",
  "..HH............",
  "..H.............",
  "................",
];
const COL = {
  ".": null,
  P: [214, 120, 255, 255], // wand shaft (purple)
  H: [104, 62, 158, 255],  // handle (dark purple)
  Y: [255, 214, 79, 255],  // star sparkle (gold)
  W: [255, 255, 255, 255],
};
const BG = [26, 16, 46, 255];
const S = 1024, cell = 56, off = (S - 16 * cell) / 2;
const px = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = (y * S + x) * 4;
  // rounded dark background
  const r = 200, cx = S / 2, cy = S / 2;
  const dx = Math.max(Math.abs(x - cx) - (S / 2 - r), 0), dy = Math.max(Math.abs(y - cy) - (S / 2 - r), 0);
  const inside = dx * dx + dy * dy <= r * r;
  let c = inside ? BG : [0, 0, 0, 0];
  const gx = Math.floor((x - off) / cell), gy = Math.floor((y - off) / cell);
  if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) { const cc = COL[G[gy][gx]]; if (cc) c = cc; }
  px.set(c, i);
}
// PNG encode
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1); }
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
writeFileSync("src-tauri/app-icon.png", png);
console.log("wrote src-tauri/app-icon.png");
