// Shapes shared with the Rust side (src-tauri/src/spells.rs, lib.rs).
// Keep field names snake_case to match serde.

export type ActionKind = "shortcut" | "app" | "system";

/** The parts of the Ctrl+Alt+Del menu an app is allowed to reach. Windows only:
 *  the sequence itself belongs to the kernel and can be neither recorded nor
 *  sent, so these call the APIs behind its menu items instead. */
export const SYSTEM_ACTIONS = [
  { id: "lock", label: "Lock the screen" },
  { id: "taskmgr", label: "Task Manager" },
  { id: "switchuser", label: "Switch user" },
  { id: "signout", label: "Sign out" },
  { id: "sleep", label: "Sleep" },
] as const;
export type SystemAction = (typeof SYSTEM_ACTIONS)[number]["id"];
export const systemLabel = (id: string) => SYSTEM_ACTIONS.find((a) => a.id === id)?.label ?? id;

export type Spell = {
  id: string;
  name: string;
  shortcut: string;
  action: ActionKind;
  app_path: string;
  app_name: string;
  system: string;
  points: [number, number][];
  enabled: boolean;
};

export type Book = {
  spells: Spell[];
  threshold: number;
  hotkey: string;
  overlay_color: string;
  overlay_opacity: number;
};

export type CastResult = {
  matched: boolean;
  id: string | null;
  name: string | null;
  shortcut: string | null;
  action: string | null;
  app_name: string | null;
  system: string | null;
  score: number;
};

export type Platform = { os: "macos" | "windows" | "linux"; physical_coords: boolean };

export type SettingsPatch = { overlay_color?: string; overlay_opacity?: number; hotkey?: string };

export type KeyChordEvent = { mods: string[]; key: string };
export type WandModeEvent = { on: boolean };
export type OverlayStyleEvent = { color: string; opacity: number };
