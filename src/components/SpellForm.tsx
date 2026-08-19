import { useRef } from "react";
import { api } from "../api/tauri";
import type { ActionKind, Spell } from "../api/types";
import { SYSTEM_ACTIONS } from "../lib/system";
import { toPairs } from "../lib/geometry";
import { pickApp } from "../api/dialog";
import { isMac, selectIsMac, useApp } from "../state/app";
import { useForge } from "../state/forge";
import { ActionLabel, AppIcon } from "./Keys";
import { KeyRecorderButton } from "./KeyRecorderButton";

/** Name, action kind, shortcut/app picker, and the Clear/Test/Delete/Save row. */
export function SpellForm() {
  const nameRef = useRef<HTMLInputElement>(null);
  // Render reads the store reactively; handlers read a fresh snapshot.
  const view = useForge();
  const editing = !!view.editingId;
  // System actions call Windows APIs that have no counterpart wired up on
  // macOS, so the segment is not offered there.
  const mac = useApp(selectIsMac);
  const kinds: ActionKind[] = mac ? ["shortcut", "app"] : ["shortcut", "app", "system"];

  async function test() {
    const f = useForge.getState();
    const { flashSpell } = useApp.getState();
    if (f.points.length < 4) return f.setMsg("Draw a rune first");
    const r = await api.testRecognize(toPairs(f.points));
    if (r.matched) {
      f.setMsg(`Matches “${r.name}” · ${Math.round(r.score * 100)}%`, true);
      if (r.id) flashSpell(r.id);
    } else
      f.setMsg(
        r.name
          ? `Closest: “${r.name}” · ${Math.round(r.score * 100)}% (below strictness)`
          : "No spells to compare with",
      );
  }

  async function save() {
    const f = useForge.getState();
    const { setBook, setStatus } = useApp.getState();
    const name = f.name.trim();
    if (f.points.length < 4) return f.setMsg("Draw a rune first");
    if (!name) {
      f.setMsg("Name the spell");
      nameRef.current?.focus();
      return;
    }
    if (f.kind === "shortcut" && !f.shortcut) return f.setMsg("Pick a shortcut");
    if (f.kind === "app" && !f.app.path) return f.setMsg("Choose an application");
    if (f.kind === "system" && !f.system) return f.setMsg("Pick a system action");
    const spell: Spell = {
      id: f.editingId,
      name,
      shortcut: f.shortcut,
      action: f.kind,
      app_path: f.app.path,
      app_name: f.app.name,
      system: f.kind === "system" ? f.system : "",
      points: toPairs(f.points),
      enabled: true,
    };
    try {
      setBook(await api.saveSpell(spell));
      f.resetForge();
      setStatus(
        <>
          Saved <b>{name}</b> → <ActionLabel {...spell} />
        </>,
        true,
      );
    } catch (e) {
      f.setMsg(String(e));
    }
  }

  async function remove() {
    const f = useForge.getState();
    const { setBook, setStatus, book } = useApp.getState();
    if (!f.editingId) return;
    const s = book.spells.find((x) => x.id === f.editingId);
    setBook(await api.deleteSpell(f.editingId));
    f.resetForge();
    setStatus(
      <>
        Removed <b>{s?.name ?? ""}</b>
      </>,
    );
  }

  return (
    <>
      <div className="fields">
        <input
          ref={nameRef}
          type="text"
          placeholder="Spell name"
          maxLength={40}
          spellCheck={false}
          value={view.name}
          onChange={(e) => view.setName(e.target.value)}
        />
        <div className="seg">
          {kinds.map((k) => (
            <button key={k} type="button" className={view.kind === k ? "on" : ""} onClick={() => view.setKind(k)}>
              {k === "shortcut" ? "Shortcut" : k === "app" ? "Open app" : "System"}
            </button>
          ))}
        </div>
        {view.kind === "system" ? (
          <select className="keybtn set" value={view.system} onChange={(e) => view.setSystem(e.target.value)}>
            {SYSTEM_ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        ) : view.kind === "shortcut" ? (
          <KeyRecorderButton
            id="spell-shortcut"
            value={view.shortcut}
            placeholder="Shortcut…"
            onChord={view.setShortcut}
          />
        ) : (
          <button
            type="button"
            className={"keybtn" + (view.app.path ? " set" : "")}
            onClick={() => pickApp(isMac()).then((a) => a && view.setApp(a.path, a.name))}
          >
            {view.app.path ? (
              <>
                <AppIcon path={view.app.path} /> {view.app.name}
              </>
            ) : (
              "Choose application…"
            )}
          </button>
        )}
      </div>
      <div className="actions">
        <div className="left">
          <button className="ghost" onClick={view.clearRune}>
            Clear
          </button>
          <button className="ghost" onClick={test}>
            Test
          </button>
          <span className={"msg" + (view.msg.ok ? " ok" : "")}>{view.msg.text}</span>
        </div>
        <div className="right">
          {editing && (
            <button className="ghost danger" onClick={remove}>
              Delete
            </button>
          )}
          <button className="primary" onClick={save}>
            {editing ? "Save changes" : "Save spell"}
          </button>
        </div>
      </div>
    </>
  );
}
