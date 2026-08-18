// Renders transparent, looping README gifs: the Elderwood wand stays still while
// pixel magic shimmers out of its tip. Four styles: stream | twinkle | spiral | burst.
// Usage: node scripts/make-readme-gif.mjs [style=spiral] [out=docs/wand.gif]   (needs ffmpeg)
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STYLE = process.argv[2] ?? "spiral";
const OUT = process.argv[3] ?? "docs/wand.gif";
const W = 384, H = 384, PX = 6, G = 6, FPS = 20, SECONDS = 3, N = FPS * SECONDS;
const P = SECONDS * 1000; // loop period (ms) — every effect is periodic in P so the gif loops seamlessly

let seed = 777;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const SPRITE = [
  "................","..w.............",".wGw............","..wBb...........",
  "...Bb...........","....Bb..........",".....Bb.....W...","......Bb........",
  ".......Bb.......","........DBb.....",".........DBb....","..........DDb...",
  "...........DDb..","............DD..",".............D..","................",
];
const COL = { B:"#a0622d", b:"#d08a4a", D:"#5c3317", w:"#9ff5ff", G:"#ffffff", W:"#ffffff" };
const TIP = { x: 2.5, y: 2.5 };
const PALETTE = ["#ffd64f","#ff7ad9","#b06bff","#7af0ff","#ffffff","#ffb347"];
const DIM = { "#ffd64f":"#b0912a", "#ff7ad9":"#a84f90", "#b06bff":"#6f44a8", "#7af0ff":"#4c9fb0", "#ffffff":"#a8a4b8", "#ffb347":"#b07a2e" };
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const pick = () => PALETTE[(rnd()*PALETTE.length)|0];

// GIF has 1-bit alpha, so every pixel is either fully painted or transparent:
// fading is done with dimmer colours, shrinking and blinking instead of alpha.
const buf = new Uint8Array(W * H * 4);
function rect(x, y, w, h, c) {
  const [r,g,b] = hex(c);
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const i = (yy*W + xx)*4; buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=255;
  }
}
const snap = v => Math.round(v / G) * G;
function star(x, y, c, arm) { // 4-point pixel star; arm 0 = single dot
  const cx = snap(x), cy = snap(y);
  for (let k = 1; k <= arm; k++) { const cc = k === arm && arm > 1 ? DIM[c] : c;
    rect(cx + k*G, cy, G, G, cc); rect(cx - k*G, cy, G, G, cc); rect(cx, cy + k*G, G, G, cc); rect(cx, cy - k*G, G, G, cc); }
  rect(cx, cy, G, G, "#ffffff");
}
const tip = { x: 228, y: 228 };
const dir = Math.atan2(-1, -1); // up-left, away from the handle
const blink = (t, period, phase) => Math.floor(t / period + phase) % 2 === 0;

// ---- effects: each returns draw(t) for t in [0, P)
function stream() {
  const parts = Array.from({ length: 140 }, () => {
    const a = dir + (rnd()-.5)*0.9, s = 0.05 + rnd()*0.09; // px per ms
    return { birth: rnd()*P, life: 900 + rnd()*900, vx: Math.cos(a)*s, vy: Math.sin(a)*s, color: pick(), big: rnd() < .3, tw: rnd() < .5, ph: rnd()*4 };
  });
  return t => {
    for (const p of parts) {
      const age = ((t - p.birth) % P + P) % P; if (age > p.life) continue;
      const u = age / p.life;
      if (p.tw && u > .5 && blink(t, 100, p.ph)) continue;
      const wob = Math.sin(age/120 + p.ph) * 4;
      const x = tip.x + p.vx*age + wob, y = tip.y + p.vy*age - wob;
      const size = p.big && u < .5 ? G*2 : G, col = u < .6 ? p.color : DIM[p.color];
      if (u < .92) rect(snap(x), snap(y), size, size, col);
    }
    if (blink(t, 150, 0)) star(tip.x - 12, tip.y - 12, "#7af0ff", 0);
  };
}
function twinkle() {
  const stars = [[-70,-40],[-30,-95],[-120,-100],[20,-70],[-95,10],[-40,-20],[-160,-40],[-10,-140],[-140,-150],[45,-120],[-60,-160],[-200,-90],[-110,-60],[0,-30]]
    .map(([dx,dy]) => ({ dx, dy, color: pick(), ph: rnd()*P, per: 900 + rnd()*900, maxArm: rnd() < .4 ? 2 : 1 }));
  const dust = Array.from({ length: 30 }, () => ({ a: rnd()*Math.PI*2, d: 40 + rnd()*160, color: pick(), ph: rnd()*P, per: 600 + rnd()*800 }));
  return t => {
    for (const s of stars) {
      // grow → shine → shrink; each star's cycle length divides P so the loop is seamless
      const cyc = P / Math.max(1, Math.round(P / s.per)), u = ((t + s.ph) % cyc) / cyc;
      const arm = u < .15 ? 0 : u < .35 ? 1 : u < .6 ? s.maxArm : u < .8 ? 1 : -1;
      if (arm >= 0) star(tip.x + s.dx, tip.y + s.dy, s.color, arm);
    }
    for (const d of dust) {
      const cyc = P / Math.max(1, Math.round(P / d.per)), u = ((t + d.ph) % cyc) / cyc;
      if (u < .5) rect(snap(tip.x + Math.cos(d.a)*d.d), snap(tip.y + Math.sin(d.a)*d.d*0.9 - 30 - u*20), G, G, u < .3 ? d.color : DIM[d.color]);
    }
    if (blink(t, 200, 0)) rect(tip.x - PX/2 - G, tip.y - PX/2 - G, G, G, "#7af0ff");
  };
}
function spiral() {
  // a ribbon of sparks curling up-left out of the tip; particles ride the curve and loop
  const beads = Array.from({ length: 120 }, () => ({ ph: rnd(), color: pick(), off: (rnd()-.5)*18, big: rnd() < .35 }));
  // corkscrew: a coil that drifts up-left away from the tip, so it never wraps over the wand
  const pos = u => { const drift = u * 220, R = 6 + u * 64, ang = u * Math.PI * 2 * 2.0;
    return [tip.x - drift + Math.cos(ang)*R, tip.y - drift*0.75 + Math.sin(ang)*R*0.8]; };
  return t => {
    for (const b of beads) {
      const u = (b.ph + t / P) % 1, [x, y] = pos(u);
      const col = u < .55 ? b.color : DIM[b.color]; if (u > .9 && blink(t, 100, b.ph*7)) continue;
      const size = b.big && u < .5 ? G*2 : G;
      rect(snap(x + b.off), snap(y - b.off), size, size, col);
    }
    for (let i = 0; i < 4; i++) { const u = ((i/4) + t/(P*1)) % 1, [x, y] = pos(u); if (blink(t, 160, i)) star(x, y, PALETTE[i], 1); }
    if (blink(t, 120, 0)) star(tip.x - 8, tip.y - 8, "#7af0ff", 0);
  };
}
function burst() {
  // rays of pixels pulsing outward from the tip; rays avoid the handle's direction
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = dir + (i/12 - .5) * Math.PI * 1.35; // fan of ~240° centred up-left
    return { a, len: 80 + rnd()*90, color: pick(), ph: rnd(), speed: 1 + Math.round(rnd()) };
  });
  return t => {
    for (const r of rays) {
      const u = (r.ph + t / P * r.speed) % 1; // pulse travels along the ray
      for (let d = 18; d < r.len; d += G) {
        const q = d / r.len, k = (q - u + 1) % 1;       // distance behind the pulse head
        if (k > .45) continue;
        const col = k < .18 ? r.color : DIM[r.color], w = q < .3 && k < .1 ? G*2 : G;
        rect(snap(tip.x + Math.cos(r.a)*d), snap(tip.y + Math.sin(r.a)*d), w, w, col);
      }
      if (u > .8) star(tip.x + Math.cos(r.a)*(r.len + 14), tip.y + Math.sin(r.a)*(r.len + 14), r.color, u > .9 ? 1 : 0);
    }
    const arm = Math.floor(t / 150) % 3;
    star(tip.x - 12, tip.y - 12, "#7af0ff", arm);
  };
}
const draw = ({ stream, twinkle, spiral, burst })[STYLE]();

// ---- render frames
const chunks = [];
for (let f = 0; f < N; f++) {
  buf.fill(0);
  draw(f * (P / N));
  const ox = tip.x - TIP.x*PX, oy = tip.y - TIP.y*PX;
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
    const ch = SPRITE[r][c]; if (ch === ".") continue;
    if ((ch === "w" || ch === "W") && Math.floor(f/3 + r + c) % 4 === 0) continue; // tip glow twinkles
    rect(ox + c*PX, oy + r*PX, PX, PX, COL[ch]);
  }
  chunks.push(Buffer.from(buf));
}
const dir_ = join(tmpdir(), "wand-gif"); mkdirSync(dir_, { recursive: true });
const raw = join(dir_, `frames-${STYLE}.rgba`); writeFileSync(raw, Buffer.concat(chunks));
mkdirSync("docs", { recursive: true });
execSync(`ffmpeg -y -loglevel error -f rawvideo -pix_fmt rgba -s ${W}x${H} -r ${FPS} -i "${raw}" ` +
  `-vf "split[a][b];[a]palettegen=max_colors=48:reserve_transparent=1:stats_mode=diff[p];[b][p]paletteuse=dither=none:alpha_threshold=128" -loop 0 "${OUT}"`);
console.log(`${OUT} ${W}x${H} ${N} frames`);
