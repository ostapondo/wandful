import type { Pt } from "../wand/wand";

/** Scale a rune's points to fit a w×h box with `pad` px of breathing room, centred. */
export function fitPoints(points: [number, number][], w: number, h: number, pad = 40): Pt[] {
  if (!points.length) return [];
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
  const s = Math.min((w - pad * 2) / Math.max(maxX - minX, 1), (h - pad * 2) / Math.max(maxY - minY, 1));
  const ox = (w - (maxX - minX) * s) / 2 - minX * s;
  const oy = (h - (maxY - minY) * s) / 2 - minY * s;
  return points.map(([x, y]) => ({ x: x * s + ox, y: y * s + oy }));
}

export const toPairs = (pts: Pt[]): [number, number][] => pts.map((p) => [p.x, p.y]);
