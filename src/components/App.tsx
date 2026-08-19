import { useEffect, useRef } from "react";
import type { Spell } from "../api/types";
import { fitPoints } from "../lib/geometry";
import { bootstrap } from "../state/app";
import { useForge } from "../state/forge";
import { Forge } from "./Forge";
import { PermissionBanner } from "./PermissionBanner";
import { SettingsSheet } from "./SettingsSheet";
import { SpellForm } from "./SpellForm";
import { Spellbook } from "./Spellbook";
import { Starfield } from "./Starfield";
import { StatusLine } from "./StatusLine";
import { Titlebar } from "./Titlebar";

export function App() {
  const forgeCanvas = useRef<HTMLCanvasElement>(null);
  const startEdit = useForge((s) => s.startEdit);
  const resetForge = useForge((s) => s.resetForge);

  useEffect(() => {
    // No recorder here: the spellbook builds chords in the picker. The one
    // recorder left belongs to the overlay's new-spell panel, and is installed
    // there — see src/overlay/main.ts.
    bootstrap();
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", noMenu);
    return () => window.removeEventListener("contextmenu", noMenu);
  }, []);

  const pick = (s: Spell) => {
    const c = forgeCanvas.current!;
    startEdit(s, fitPoints(s.points, c.clientWidth, c.clientHeight));
  };

  return (
    <>
      <Starfield />
      <div className="glow" />
      <Titlebar />
      <PermissionBanner />
      <div className="app">
        <Spellbook onPick={pick} onNew={resetForge} />
        <section className="detail">
          <Forge canvasRef={forgeCanvas} />
          <SpellForm />
          <StatusLine />
        </section>
      </div>
      <SettingsSheet />
    </>
  );
}
