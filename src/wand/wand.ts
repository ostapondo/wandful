// Pixel-art wand sprite + magic trail. Shared by the screen overlay and the
// spellbook's "forge" canvas so the wand looks identical everywhere.

export type Pt = { x: number; y: number };

const SPRITE = [
  "................",
  "..w.............",
  ".wGw............",
  "..wBb...........",
  "...Bb...........",
  "....Bb..........",
  ".....Bb.....W...",
  "......Bb........",
  ".......Bb.......",
  "........DBb.....",
  ".........DBb....",
  "..........DDb...",
  "...........DDb..",
  "............DD..",
  ".............D..",
  "................",
];
const SPRITE_COLORS: Record<string, string> = {
  B: "#a0622d", // wood
  b: "#d08a4a", // wood highlight
  D: "#5c3317", // dark knotted grip
  w: "#9ff5ff", // tip glow
  G: "#ffffff", // tip core
  W: "#ffffff", // sparkle
};
// Grid cell (centre) of the star tip: the point that touches the cursor.
const TIP = { x: 2.5, y: 2.5 };

export const PALETTE = ["#ffd64f", "#ff7ad9", "#b06bff", "#7af0ff", "#ffffff", "#ffb347"];
export const GOLD = ["#ffd64f", "#fff3b0", "#ffb347", "#ffffff"];
export const SMOKE = ["#7c7c8c", "#a3a3b5", "#5c5c6c"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  twinkle: boolean;
};

export class Wand {
  private particles: Particle[] = [];
  private stroke: Pt[] = [];
  private strokeAlpha = 0;
  private strokeColor = "#ff7ad9";
  private idleT = 0;

  cursor: Pt = { x: -100, y: -100 };
  visible = true;
  casting = false;
  /** Pixel size (CSS px) of one sprite cell */
  px = 3;
  /** Pixel grid step for the trail */
  grid = 3;
  /** Keep the drawn stroke on screen after release (used by the forge canvas) */
  persistStroke = false;

  constructor(private ctx: CanvasRenderingContext2D) {}

  moveTo(p: Pt) {
    this.cursor = p;
    if (this.casting) this.addPoint(p);
  }

  start(p: Pt) {
    this.casting = true;
    this.cursor = p;
    this.stroke = [p];
    this.strokeAlpha = 1;
    this.strokeColor = "#ff7ad9";
    this.burst(p, 18, PALETTE, 2.2);
  }

  addPoint(p: Pt) {
    const last = this.stroke[this.stroke.length - 1];
    if (last) {
      // emit particles along the segment so fast moves don't leave gaps
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      const steps = Math.max(1, Math.floor(d / 4));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this.emit({ x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t }, 2, PALETTE, 0.9);
      }
    }
    this.stroke.push(p);
  }

  /** Finish the stroke. A match turns it gold with a burst; a miss lets it smoulder. */
  end(result: { matched: boolean } | null) {
    this.casting = false;
    const tail = this.stroke[this.stroke.length - 1] ?? this.cursor;
    if (result?.matched) {
      this.strokeColor = "#ffd64f";
      for (let i = 0; i < this.stroke.length; i += 3) this.emit(this.stroke[i], 2, GOLD, 1.8, true);
      this.burst(tail, 40, GOLD, 3.2);
    } else if (result) {
      this.strokeColor = "#8a8aa0";
      for (let i = 0; i < this.stroke.length; i += 4) this.emit(this.stroke[i], 1, SMOKE, 0.6);
    }
  }

  /** Last point of the current/last stroke (where an outcome chip goes). */
  get tail(): Pt | null {
    return this.stroke[this.stroke.length - 1] ?? null;
  }

  /** Recolour the drawn stroke and keep it fully visible, e.g. violet for "new rune, unbound". */
  tint(color: string) {
    this.strokeColor = color;
    this.strokeAlpha = 1;
  }

  clear() {
    this.stroke = [];
    this.strokeAlpha = 0;
    this.particles = [];
  }

  private emit(p: Pt, n: number, colors: string[], speed: number, twinkle = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      this.particles.push({
        x: p.x + (Math.random() - 0.5) * 6,
        y: p.y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * s * 0.4,
        vy: Math.sin(a) * s * 0.4 - 0.35,
        life: 0,
        max: 500 + Math.random() * 700,
        size: this.grid * (Math.random() < 0.7 ? 1 : 2),
        color: colors[(Math.random() * colors.length) | 0],
        twinkle,
      });
    }
  }

  private burst(p: Pt, n: number, colors: string[], speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * speed;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 0.4,
        life: 0,
        max: 600 + Math.random() * 600,
        size: this.grid * (Math.random() < 0.6 ? 1 : 2),
        color: colors[(Math.random() * colors.length) | 0],
        twinkle: true,
      });
    }
  }

  /** Advance simulation by dt ms and draw. Caller clears the canvas. */
  frame(dt: number) {
    const ctx = this.ctx;
    this.idleT += dt;

    // idle sparkle around the tip
    if (this.visible && !this.casting && Math.random() < 0.12) {
      this.emit(this.cursor, 1, PALETTE, 0.4, true);
    }

    // stroke
    if (this.stroke.length > 1 && this.strokeAlpha > 0) {
      if (!this.casting && !this.persistStroke) this.strokeAlpha = Math.max(0, this.strokeAlpha - dt / 900);
      this.drawStroke(ctx);
    }

    // particles
    const g = this.grid;
    const snap = (v: number) => Math.round(v / g) * g;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.vy += 0.004 * dt * 0.06;
      const t = p.life / p.max;
      // stepped alpha = pixel feel
      let alpha = t < 0.5 ? 1 : t < 0.75 ? 0.66 : t < 0.9 ? 0.33 : 0.15;
      if (p.twinkle && Math.floor(p.life / 90) % 2 === 0) alpha *= 0.55;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const size = t > 0.7 ? Math.max(g, p.size - g) : p.size;
      ctx.fillRect(snap(p.x), snap(p.y), size, size);
    }
    ctx.globalAlpha = 1;

    // wand
    if (this.visible) this.drawWand(ctx, this.cursor);
  }

  private drawStroke(ctx: CanvasRenderingContext2D) {
    const g = this.grid;
    ctx.save();
    const cells = strokeCells(this.stroke, g);
    // one ring of dim glow cells around the rune, then the rune itself —
    // the same pixel grid the sparks live on, no anti-aliased lines
    ctx.fillStyle = this.strokeColor;
    ctx.globalAlpha = this.strokeAlpha * 0.22;
    for (const [x, y] of cells) ctx.fillRect(x - g, y - g, g * 3, g * 3);
    ctx.globalAlpha = this.strokeAlpha;
    for (const [x, y] of cells) ctx.fillRect(x, y, g, g);
    ctx.restore();
  }

  drawWand(ctx: CanvasRenderingContext2D, at: Pt) {
    const px = this.px;
    const ox = at.x - TIP.x * px;
    const oy = at.y - TIP.y * px;
    // subtle bob when idle
    const bob = this.casting ? 0 : Math.round(Math.sin(this.idleT / 260) * 1.5) * 1;
    for (let r = 0; r < SPRITE.length; r++) {
      const row = SPRITE[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === ".") continue;
        // twinkle the tip glow and sparkles
        if (ch === "w" || ch === "W") {
          const phase = Math.floor(this.idleT / 140 + r + c) % 4;
          if (phase === 0 && !this.casting) continue;
        }
        ctx.fillStyle = SPRITE_COLORS[ch];
        ctx.fillRect(Math.round(ox + c * px), Math.round(oy + r * px + bob), px, px);
      }
    }
    // hot glowing tip while casting
    if (this.casting) {
      ctx.fillStyle = Math.floor(this.idleT / 80) % 2 ? "#fff" : "#9ff5ff";
      ctx.fillRect(Math.round(at.x - px / 2), Math.round(at.y - px / 2), px, px);
    }
  }
}

/** Snap a polyline to a pixel grid: the distinct g×g cells its segments pass through, in order. */
export function strokeCells(pts: Pt[], g: number): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<number>();
  const push = (x: number, y: number) => {
    const cx = Math.round(x / g) * g;
    const cy = Math.round(y / g) * g;
    const key = cx * 65536 + cy;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([cx, cy]);
  };
  if (pts.length === 1) push(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / g));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
  }
  return out;
}

/** Fit a canvas to its CSS size × devicePixelRatio and return a ctx scaled to CSS px. */
export function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Draw a small preview of a rune's points inside a box (for spell cards). */
export function drawRunePreview(canvas: HTMLCanvasElement, points: [number, number][], color = "#ff7ad9") {
  const ctx = fitCanvas(canvas);
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (points.length < 2) return;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const pad = 10;
  const sw = Math.max(maxX - minX, 1),
    sh = Math.max(maxY - minY, 1);
  const s = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const ox = (w - sw * s) / 2 - minX * s,
    oy = (h - sh * s) / 2 - minY * s;
  const g = 2;
  const cells = strokeCells(
    points.map(([x, y]) => ({ x: x * s + ox, y: y * s + oy })),
    g,
  );
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  for (const [x, y] of cells) ctx.fillRect(x - g, y - g, g * 3, g * 3);
  ctx.globalAlpha = 1;
  for (const [x, y] of cells) ctx.fillRect(x, y, g, g);
  // start marker
  ctx.fillStyle = "#ffd64f";
  const [sx, sy] = points[0];
  ctx.fillRect(Math.round(sx * s + ox) - 3, Math.round(sy * s + oy) - 3, 6, 6);
}
