// Key-chord strings ("Cmd+Shift+M") ↔ tokens ↔ pretty glyphs.

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

/** Turn a DOM keydown into a chord string, or null if only a modifier was pressed. */
export function chordFromKeyEvent(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return null;
  const mods: string[] = [];
  if (e.metaKey) mods.push("Cmd");
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.startsWith("Arrow")) key = key.slice(5);
  else if (key.length === 1) {
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
    else key = key.toUpperCase();
  }
  return [...mods, key].join("+");
}
