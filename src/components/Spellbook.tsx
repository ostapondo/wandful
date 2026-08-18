import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/tauri";
import type { Spell } from "../api/types";
import { chordLabel } from "../lib/keys";
import { selectIsMac, useApp } from "../state/app";
import { useForge } from "../state/forge";
import { drawRunePreview } from "../wand/wand";
import { useNativeChange } from "./hooks";
import { ActionLabel } from "./Keys";

function RunePreview({ points }: { points: [number, number][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => drawRunePreview(ref.current!, points, "#c4b5fd"), [points]);
  return <canvas ref={ref} />;
}

function SpellCard({ spell, onPick }: { spell: Spell; onPick: (s: Spell) => void }) {
  const active = useForge((s) => s.editingId === spell.id);
  const flash = useApp((s) => s.flashId === spell.id);
  const cls = ["spell", active && "active", flash && "flash"].filter(Boolean).join(" ");
  return (
    <li className={cls} data-id={spell.id} onClick={() => onPick(spell)}>
      <RunePreview points={spell.points} />
      <div>
        <div className="name">{spell.name}</div>
        <div className="keys">
          <ActionLabel {...spell} />
        </div>
      </div>
    </li>
  );
}

function Strictness() {
  const threshold = useApp((s) => s.book.threshold);
  const setBook = useApp((s) => s.setBook);
  const [draft, setDraft] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const commit = useCallback(
    async (v: string) => {
      setBook(await api.setThreshold(Number(v)));
      setDraft(null);
    },
    [setBook],
  );
  useNativeChange(ref, commit);
  const value = draft ?? threshold;
  return (
    <div className="slider">
      <span>Strictness</span>
      <input
        ref={ref}
        type="range"
        min="0.5"
        max="0.98"
        step="0.01"
        value={value}
        onChange={(e) => setDraft(Number(e.target.value))}
      />
      <b>{value.toFixed(2)}</b>
    </div>
  );
}

/** Left column: the list of spells, strictness, hotkey hint. */
export function Spellbook({ onPick, onNew }: { onPick: (s: Spell) => void; onNew: () => void }) {
  const spells = useApp((s) => s.book.spells);
  const hotkey = useApp((s) => s.book.hotkey);
  const mac = useApp(selectIsMac);
  return (
    <aside className="side">
      <div className="side-head">
        <span>Spells</span>
        <button className="icon-btn" title="New spell" onClick={onNew}>
          +
        </button>
      </div>
      <ul className="spells">
        {spells.length === 0 && (
          <li className="empty">
            No spells yet.
            <br />
            Draw a rune and save it.
          </li>
        )}
        {spells.map((s) => (
          <SpellCard key={s.id} spell={s} onPick={onPick} />
        ))}
      </ul>
      <div className="side-foot">
        <Strictness />
        <div className="hint">
          Hotkey <kbd>{chordLabel(hotkey, mac)}</kbd>
        </div>
      </div>
    </aside>
  );
}
