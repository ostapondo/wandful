import { useEffect, useRef } from "react";
import { useApp } from "../state/app";
import { Wand, fitCanvas } from "../wand/wand";
import { useFrameLoop } from "./hooks";

/** The tiny idle wand next to the app name. */
function BrandWand() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wand = useRef<Wand | null>(null);
  useEffect(() => {
    const ctx = fitCanvas(ref.current!);
    const w = new Wand(ctx);
    w.px = 1;
    w.grid = 1;
    w.cursor = { x: 15, y: 5 };
    wand.current = w;
  }, []);
  useFrameLoop((dt) => {
    const w = wand.current;
    if (!w || !ref.current) return;
    const ctx = fitCanvas(ref.current);
    ctx.clearRect(0, 0, 22, 22);
    w.frame(dt);
  });
  return <canvas ref={ref} id="brand-wand" width={22} height={22} />;
}

export function Titlebar() {
  const wandOn = useApp((s) => s.wandOn);
  const openSettings = useApp((s) => s.openSettings);
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="title" data-tauri-drag-region>
        <BrandWand />
        <span data-tauri-drag-region>Wandful</span>
      </div>
      <div className="tb-right">
        <span className={"wand-state" + (wandOn ? " on" : "")} data-tauri-drag-region>
          {wandOn ? "✦ wand is out" : ""}
        </span>
        <button id="open-settings" className="icon-btn" title="Settings" onClick={() => openSettings(true)}>
          ⚙ Settings
        </button>
      </div>
    </div>
  );
}
