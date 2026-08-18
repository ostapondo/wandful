import { useEffect, useRef, type RefObject } from "react";
import { useForge } from "../state/forge";
import { replayRune, type Replay } from "../wand/replay";
import { Wand, fitCanvas, type Pt } from "../wand/wand";

/** The drawing canvas. Owns the imperative Wand and reacts to forge commands. */
export function Forge({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const hintHidden = useForge((s) => s.points.length > 0);
  const command = useForge((s) => s.command);
  const wandRef = useRef<Wand | null>(null);
  const replayRef = useRef<Replay | null>(null);

  // Mount: create the wand, wire pointer handlers, run the frame loop.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let ctx = fitCanvas(canvas);
    const wand = new Wand(ctx);
    wand.px = 3;
    wand.grid = 3;
    wand.visible = false;
    wand.persistStroke = true;
    wandRef.current = wand;

    let drawing = false;
    let stroke: Pt[] = [];
    const { setPoints, setMsg } = useForge.getState();

    const local = (e: PointerEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const stopReplay = () => {
      replayRef.current?.cancel();
      replayRef.current = null;
    };
    const onEnter = () => (wand.visible = true);
    const onLeave = () => {
      if (!drawing) wand.visible = false;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      stopReplay();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      const p = local(e);
      stroke = [p];
      setPoints(stroke);
      setMsg("");
      wand.start(p);
    };
    const onMove = (e: PointerEvent) => {
      if (replayRef.current) return; // the wand is busy replaying a rune
      const p = local(e);
      wand.moveTo(p);
      if (drawing) stroke.push(p);
    };
    const onUp = () => {
      if (!drawing) return;
      drawing = false;
      wand.end(null);
      setPoints([...stroke]);
    };
    const noMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", noMenu);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      ctx = fitCanvas(canvas);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      wand.frame(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      stopReplay();
      wandRef.current = null;
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("contextmenu", noMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Commands from the store (clear / replay).
  useEffect(() => {
    const wand = wandRef.current;
    const canvas = canvasRef.current;
    if (!wand || !canvas) return;
    replayRef.current?.cancel();
    replayRef.current = null;
    if (command.kind === "clear") wand.clear();
    else
      replayRef.current = replayRune(wand, command.pts, () => {
        replayRef.current = null;
        if (!canvas.matches(":hover")) wand.visible = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.seq]);

  return (
    <div className="forge-wrap">
      <canvas id="forge" ref={canvasRef} />
      <div className={"forge-hint" + (hintHidden ? " hidden" : "")}>Draw a rune here</div>
    </div>
  );
}
