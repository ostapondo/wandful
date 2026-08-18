import type { Pt } from "./wand";
import type { Wand } from "./wand";

export type Replay = { cancel(): void };

/** Animate the wand drawing a rune start → end, the way the user drew it. */
export function replayRune(wand: Wand, pts: Pt[], onDone: () => void): Replay {
  wand.clear();
  if (pts.length < 2) {
    onDone();
    return { cancel() {} };
  }
  wand.visible = true;
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const dur = Math.min(900, Math.max(350, total * 0.9));
  const t0 = performance.now();
  let idx = 0;
  let raf = 0;
  let cancelled = false;
  wand.start(pts[0]);
  function step(now: number) {
    if (cancelled) return;
    const t = Math.min(1, (now - t0) / dur);
    const target = t * total;
    while (idx + 1 < pts.length && cum[idx + 1] <= target) wand.addPoint(pts[++idx]);
    if (idx + 1 < pts.length) {
      const a = pts[idx],
        b = pts[idx + 1];
      const seg = cum[idx + 1] - cum[idx];
      const f = seg > 0 ? (target - cum[idx]) / seg : 1;
      wand.cursor = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    if (t < 1) raf = requestAnimationFrame(step);
    else {
      while (idx + 1 < pts.length) wand.addPoint(pts[++idx]);
      wand.end(null);
      onDone();
    }
  }
  raf = requestAnimationFrame(step);
  return {
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}
