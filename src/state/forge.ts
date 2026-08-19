// The forge: the spell being drawn / edited on the right-hand side.
import { create } from "zustand";
import type { ActionKind, Spell } from "../api/types";
import type { Pt } from "../wand/wand";

/** Imperative requests to the canvas: replay a rune or wipe it. The Forge component reacts. */
type Cmd = { kind: "replay"; pts: Pt[] } | { kind: "clear" };
export type ForgeCommand = Cmd & { seq: number };

type ForgeState = {
  editingId: string;
  name: string;
  kind: ActionKind;
  shortcut: string;
  app: { path: string; name: string };
  system: string;
  points: Pt[];
  msg: { text: string; ok: boolean };
  command: ForgeCommand;

  setName: (name: string) => void;
  setKind: (kind: ActionKind) => void;
  setShortcut: (shortcut: string) => void;
  setApp: (path: string, name: string) => void;
  setSystem: (system: string) => void;
  setPoints: (points: Pt[]) => void;
  setMsg: (text: string, ok?: boolean) => void;
  resetForge: () => void;
  clearRune: () => void;
  /** Load a saved spell into the forge; `fitted` are its points scaled to the current canvas. */
  startEdit: (s: Spell, fitted: Pt[]) => void;
};

let seq = 0;
const cmd = (c: Cmd): ForgeCommand => ({ ...c, seq: ++seq });

export const useForge = create<ForgeState>((set) => ({
  editingId: "",
  name: "",
  kind: "shortcut",
  shortcut: "",
  app: { path: "", name: "" },
  system: "lock",
  points: [],
  msg: { text: "", ok: false },
  command: { seq: 0, kind: "clear" },

  setName: (name) => set({ name }),
  setKind: (kind) => set({ kind }),
  setShortcut: (shortcut) => set({ shortcut }),
  setApp: (path, name) => set({ app: { path, name } }),
  setSystem: (system) => set({ system }),
  setPoints: (points) => set({ points }),
  setMsg: (text, ok = false) => set({ msg: { text, ok } }),
  resetForge: () =>
    set({
      editingId: "",
      name: "",
      kind: "shortcut",
      shortcut: "",
      app: { path: "", name: "" },
      system: "lock",
      points: [],
      msg: { text: "", ok: false },
      command: cmd({ kind: "clear" }),
    }),
  clearRune: () => set({ points: [], msg: { text: "", ok: false }, command: cmd({ kind: "clear" }) }),
  startEdit: (s, fitted) =>
    set({
      editingId: s.id,
      name: s.name,
      kind: s.action === "app" || s.action === "system" ? s.action : "shortcut",
      shortcut: s.shortcut,
      app: { path: s.app_path ?? "", name: s.app_name ?? "" },
      system: s.system || "lock",
      points: fitted,
      msg: { text: "", ok: false },
      command: cmd({ kind: "replay", pts: fitted }),
    }),
}));
