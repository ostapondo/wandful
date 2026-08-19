import { useEffect, useRef, useState } from "react";
import { KEY_GROUPS, MODIFIERS, buildChord, chordProblem, splitChord } from "../lib/chord";
import { prettyKey } from "../lib/keys";
import { selectIsMac, useApp } from "../state/app";

type Props = { value: string; onSave: (chord: string) => void; onClose: () => void };

/** Build a chord a key at a time. Nothing here listens globally: the keys are
 *  either clicked, or typed into this panel while it has focus, so a chord the
 *  OS would swallow can still be entered. */
export function ChordPicker({ value, onSave, onClose }: Props) {
  const mac = useApp(selectIsMac);
  const initial = splitChord(value);
  const [mods, setMods] = useState<string[]>(initial.mods);
  const [key, setKey] = useState(initial.key);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const problem = chordProblem(mods, key, mac);
  const chord = buildChord(mods, key);

  function toggleMod(m: string) {
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  // Typing works too, for the many chords the OS does not mind.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return onClose();
    e.preventDefault();
    e.stopPropagation();
    if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
    const next: string[] = [];
    if (e.metaKey) next.push("Cmd");
    if (e.ctrlKey) next.push("Ctrl");
    if (e.altKey) next.push("Alt");
    if (e.shiftKey) next.push("Shift");
    let k = e.key;
    if (k === " ") k = "Space";
    else if (k.startsWith("Arrow")) k = k.slice(5);
    else if (k.length === 1) {
      if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
      else if (/^Digit[0-9]$/.test(e.code)) k = e.code.slice(5);
      else k = k.toUpperCase();
    }
    setMods(next);
    setKey(k);
  }

  return (
    <div className="picker-veil" onPointerDown={onClose}>
      <div
        className="picker"
        ref={ref}
        tabIndex={-1}
        role="dialog"
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
          <span className={"msg" + (problem ? "" : " ok")}>{problem ?? (chord ? `Will cast ${chord}` : "")}</span>
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
    </div>
  );
}
