// Shapes shared with the Rust side (src-tauri/src/spells.rs, lib.rs).
// Keep field names snake_case to match serde.

export type ActionKind = "shortcut" | "app" | "system";

// The system actions a spell can name live in ../lib/system.ts: they are a UI
// table with labels, not a shape serde hands over.

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
