import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Wand, fitCanvas, type Pt } from "./wand";

type CastResult = { matched: boolean; id: string | null; name: string | null; shortcut: string | null; score: number };

const canvas = document.getElementById("c") as HTMLCanvasElement;
let ctx = fitCanvas(canvas);
const wand = new Wand(ctx);
wand.px = 3;
wand.grid = 3;

let points: Pt[] = [];
let drawing = false;
let downAt: Pt | null = null;
let button = 0;

const local = (e: PointerEvent): Pt => ({ x: e.clientX, y: e.clientY });

window.addEventListener("pointermove", (e) => {
  const p = local(e);
  wand.moveTo(p);
  if (drawing) points.push(p);
  else if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 6) {
    // moved far enough → this is a stroke, not a tap
    drawing = true;
    points = [downAt, p];
    wand.start(downAt);
    wand.addPoint(p);
  }
});
window.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  downAt = local(e);
  button = e.button;
  wand.cursor = downAt;
});
window.addEventListener("pointerup", async (e) => {
  e.preventDefault();
  const wasDrawing = drawing;
  drawing = false;
  const start = downAt;
  downAt = null;
  if (!wasDrawing) {
    // a plain click (any button, no drag) on the veil sheathes the wand
    if (start) invoke("set_wand", { on: false });
    return;
  }
  const pts = points.map((p) => [p.x, p.y] as [number, number]);
  points = [];
  try {
    const r = await invoke<CastResult>("cast", { points: pts });
    wand.end(r);
  } catch {
    wand.end({ matched: false, name: null, score: 0 });
  }
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
// Escape also works via the DOM (the overlay is the key window on macOS),
// in addition to the global hook — belt and braces.
window.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); invoke("set_wand", { on: false }); } });
window.addEventListener("pointerleave", () => (wand.visible = false));
window.addEventListener("pointerenter", () => (wand.visible = true));

listen<{ on: boolean }>("wand:mode", (e) => {
  document.body.classList.toggle("on", e.payload.on);
  wand.visible = e.payload.on;
  if (!e.payload.on) { wand.clear(); drawing = false; downAt = null; points = []; }
});
invoke<boolean>("get_wand").then((on) => { document.body.classList.toggle("on", on); wand.visible = on; });

function applyStyle(color: string, opacity: number) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  const rgb = m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : "6,4,14";
  (document.getElementById("veil") as HTMLElement).style.background = `rgba(${rgb},${opacity})`;
}
invoke<{ overlay_color: string; overlay_opacity: number }>("get_book").then((b) => applyStyle(b.overlay_color, b.overlay_opacity));
listen<{ color: string; opacity: number }>("overlay:style", (e) => applyStyle(e.payload.color, e.payload.opacity));

window.addEventListener("resize", () => (ctx = fitCanvas(canvas)));

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(50, now - last);
  last = now;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  // soft glow following the wand tip
  if (wand.visible) {
    const g = ctx.createRadialGradient(wand.cursor.x, wand.cursor.y, 0, wand.cursor.x, wand.cursor.y, 140);
    g.addColorStop(0, "rgba(167,139,250,0.16)");
    g.addColorStop(1, "rgba(167,139,250,0)");
    ctx.fillStyle = g;
    ctx.fillRect(wand.cursor.x - 140, wand.cursor.y - 140, 280, 280);
  }
  wand.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
