// Key-chord strings ("Cmd+Shift+M") ↔ tokens ↔ pretty glyphs.
import { buildChord, keyFromEvent, modsFromEvent } from "./chord";

export function keyTokens(chord: string): string[] {
  return chord.split("+").filter(Boolean);
}

const MAC_GLYPHS: Record<string, string> = {
  Cmd: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Enter: "↩",
  Backspace: "⌫",
  Delete: "⌦",
  Escape: "⎋",
  Tab: "⇥",
  Space: "␣",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  CmdOrCtrl: "⌘",
};
const OTHER_GLYPHS: Record<string, string> = {
  Cmd: "Win",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  CmdOrCtrl: "Ctrl",
};

export function prettyKey(token: string, mac: boolean): string {
  return (mac ? MAC_GLYPHS : OTHER_GLYPHS)[token] ?? token;
}

/** Compact one-line label, e.g. "⌘⇧M" on macOS or "Ctrl+Shift+M" elsewhere. */
export function chordLabel(chord: string, mac: boolean): string {
  return keyTokens(chord)
    .map((k) => prettyKey(k, mac))
    .join(mac ? "" : "+");
}

/** Turn a DOM keydown into a chord string, or null if only a modifier was
 *  pressed. One set of rules for which token a key is, shared with the picker. */
export function chordFromKeyEvent(e: KeyboardEvent): string | null {
  const key = keyFromEvent(e);
  return key === null ? null : buildChord(modsFromEvent(e), key);
}
