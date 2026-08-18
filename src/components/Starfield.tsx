import { useMemo, useRef } from "react";
import { fitCanvas } from "../wand/wand";
import { useFrameLoop } from "./hooks";

/** Sparse twinkling pixel stars behind everything. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        t: Math.random() * 1000,
      })),
    [],
  );
  useFrameLoop((_dt, now) => {
    const c = ref.current;
    if (!c) return;
    const ctx = fitCanvas(c);
    const w = c.clientWidth,
      h = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const st of stars) {
      const tw = (Math.sin(now / 700 + st.t) + 1) / 2;
      ctx.globalAlpha = 0.15 + tw * 0.5 * st.z;
      ctx.fillStyle = st.z > 0.92 ? "#f5c04a" : "#d6d6dc";
      const size = st.z > 0.8 ? 2 : 1;
      ctx.fillRect(Math.round(st.x * w), Math.round(st.y * h), size, size);
    }
    ctx.globalAlpha = 1;
  });
  return <canvas id="stars" ref={ref} />;
}
