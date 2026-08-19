// Composing a chord by hand, instead of capturing one.
//
// Capturing needs a global hook, which is exactly what cannot be relied on:
// the OS eats some combinations before any hook sees them, and acts on others
// while you are still recording. Composed chords have neither problem.

export const MODIFIERS = ["Cmd", "Ctrl", "Alt", "Shift"] as const;
export type Modifier = (typeof MODIFIERS)[number];

export const isModifier = (t: string): t is Modifier => (MODIFIERS as readonly string[]).includes(t);

/** Modifiers first, in a fixed order, so "Shift+Ctrl+S" and "Ctrl+Shift+S" are one chord. */
export function buildChord(mods: string[], key: string): string {
  const ordered = MODIFIERS.filter((m) => mods.includes(m));
  return [...ordered, key].filter(Boolean).join("+");
}

export function splitChord(chord: string): { mods: Modifier[]; key: string } {
  const parts = chord.split("+").filter(Boolean);
  return {
    mods: parts.filter(isModifier),
    key: parts.find((p) => !isModifier(p)) ?? "",
  };
}

/** Why a chord cannot be cast, or null when it can. */
export function chordProblem(mods: string[], key: string, mac: boolean): string | null {
  if (!key) return "Add a key — modifiers alone are not a shortcut.";
  if (mac) return null;
  const has = (m: string) => mods.includes(m);
  // The kernel takes this one before any application, in both directions:
  // it cannot be recorded and `SendInput` cannot produce it either.
  if (has("Ctrl") && has("Alt") && key === "Delete")
    return "Windows reserves Ctrl+Alt+Delete for itself — no application can send it. Use a System spell instead.";
  if (has("Cmd") && key === "L")
    return "Windows handles Win+L itself, so it cannot be sent. A System spell can lock the screen.";
  return null;
}

/** The keys worth offering as buttons, grouped the way a keyboard is. */
export const KEY_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Letters", keys: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") },
  { label: "Digits", keys: "0123456789".split("") },
  { label: "Function", keys: Array.from({ length: 12 }, (_, i) => `F${i + 1}`) },
  {
    label: "Editing",
    keys: ["Enter", "Space", "Tab", "Escape", "Backspace", "Delete", "Home", "End", "PageUp", "PageDown"],
  },
  { label: "Arrows", keys: ["Up", "Down", "Left", "Right"] },
  { label: "Punctuation", keys: ["-", "=", "[", "]", ";", "'", "\\", ",", ".", "/", "`"] },
];
