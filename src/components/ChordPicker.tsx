import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  KEY_GROUPS,
  MODIFIERS,
  buildChord,
  chordProblem,
  keyFromEvent,
  modsFromEvent,
  splitChord,
  type ChordPurpose,
} from "../lib/chord";
import { prettyKey } from "../lib/keys";
import { selectIsMac, useApp } from "../state/app";

type Props = {
  value: string;
  purpose?: ChordPurpose;
  onSave: (chord: string) => void;
  onClose: () => void;
};

/** Build a chord a key at a time. Nothing here listens globally: the keys are
 *  either clicked, or typed into this panel while it has focus, so a chord the
 *  OS would swallow can still be entered. */
export function ChordPicker({ value, purpose = "cast", onSave, onClose }: Props) {
  const mac = useApp(selectIsMac);
  const initial = splitChord(value, mac);
  const [mods, setMods] = useState<string[]>(initial.mods);
  const [key, setKey] = useState(initial.key);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Whoever opened the picker gets the focus back when it closes; otherwise
    // it lands on <body> and the next Tab starts from the top of the window.
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const problem = chordProblem(mods, key, mac, purpose);
  const chord = buildChord(mods, key);

  function toggleMod(m: string) {
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  // Typing works too, for the many chords the OS does not mind.
  function onKeyDown(e: React.KeyboardEvent) {
    // Escape closes. It is still available as a chord key from its keycap —
    // one of the two has to win, and leaving the dialog has to stay possible.
    if (e.key === "Escape") return onClose();
    // Tab still moves focus and Enter/Space still press the button they are
    // on: swallowing those left Save unreachable without a mouse.
    if (e.key === "Tab") return;
    if ((e.target as HTMLElement | null)?.closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    const k = keyFromEvent(e);
    if (k === null) return;
    // A bare key finishes a combination whose modifiers were clicked, rather
    // than throwing them away: clicking Ctrl and then pressing S has to mean
    // Ctrl+S, not a spell bound to the letter S.
    const typed = modsFromEvent(e);
    if (typed.length) setMods(typed);
    setKey(k);
  }

  return createPortal(
    <div className="picker-veil" onPointerDown={onClose}>
      <div
        className="picker"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Build a shortcut"
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="picker-chord" aria-label="Chosen keys">
          {[...MODIFIERS.filter((m) => mods.includes(m)), ...(key ? [key] : [])].map((t, i) => (
            <span key={t} className="chip">
              {i > 0 && <i className="plus">+</i>}
              <kbd>{prettyKey(t, mac)}</kbd>
              <button
                type="button"
                className="chip-x"
                aria-label={`Remove ${t}`}
                onClick={() => (t === key ? setKey("") : toggleMod(t))}
              >
                ×
              </button>
            </span>
          ))}
          {!mods.length && !key && <span className="dim">Press a combination, or pick keys below</span>}
        </div>

        <div className="picker-mods">
          {MODIFIERS.map((m) => (
            <button
              key={m}
              type="button"
              className={"keycap" + (mods.includes(m) ? " on" : "")}
              aria-pressed={mods.includes(m)}
              onClick={() => toggleMod(m)}
            >
              {prettyKey(m, mac)}
            </button>
          ))}
        </div>

        <div className="picker-keys">
          {KEY_GROUPS.map((g) => (
            <div key={g.label} className="picker-group">
              <span className="picker-group-label">{g.label}</span>
              <div className="picker-grid">
                {g.keys.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={"keycap" + (key === k ? " on" : "")}
                    aria-pressed={key === k}
                    onClick={() => setKey(k)}
                  >
                    {prettyKey(k, mac)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="picker-foot">
          <span className={"msg" + (problem ? "" : " ok")}>
            {problem ?? (chord ? (purpose === "hotkey" ? `Summons with ${chord}` : `Will cast ${chord}`) : "")}
          </span>
          <div className="picker-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={!!problem} onClick={() => onSave(chord)}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
