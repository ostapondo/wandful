// Composing a chord by hand, instead of capturing one.
//
// Capturing needs a global hook, which is exactly what cannot be relied on:
// the OS eats some combinations before any hook sees them, and acts on others
// while you are still recording. Composed chords have neither problem.
//
// The other half of this file is the contract with the backend: every key
// offered here has to be one `parse_key` in src-tauri/src/shortcut.rs can
// press, and the way a stored chord is taken apart has to match `parse_chord`
// beside it. A chord this file accepts and the backend cannot press saves
// happily and does nothing at cast time, which is the worst of both.

export const MODIFIERS = ["Cmd", "Ctrl", "Alt", "Shift"] as const;
export type Modifier = (typeof MODIFIERS)[number];

/** What the picker is building: a chord to send, or the global summon hotkey. */
export type ChordPurpose = "cast" | "hotkey";

export const isModifier = (t: string): t is Modifier => (MODIFIERS as readonly string[]).includes(t);

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

/** Every key the backend can actually press — the keycaps above, no more. */
export const SENDABLE_KEYS: ReadonlySet<string> = new Set(KEY_GROUPS.flatMap((g) => g.keys));

// Spelling the backend accepts for a modifier, mapped onto ours. "CmdOrCtrl"
// is the one the app ships its own hotkey as, so the picker has to read it.
const MODIFIER_ALIASES: Record<string, Modifier | "platform"> = {
  cmd: "Cmd",
  command: "Cmd",
  meta: "Cmd",
  super: "Cmd",
  win: "Cmd",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  opt: "Alt",
  shift: "Shift",
  cmdorctrl: "platform",
  commandorcontrol: "platform",
};

// Same for keys: what `parse_key` accepts, spelled the way the keycaps are.
const KEY_ALIASES: Record<string, string> = {
  return: "Enter",
  esc: "Escape",
  del: "Delete",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
};

function canonicalModifier(token: string, mac: boolean): Modifier | null {
  const m = MODIFIER_ALIASES[token.toLowerCase()];
  if (!m) return null;
  return m === "platform" ? (mac ? "Cmd" : "Ctrl") : m;
}

// The backend lowercases before it matches, so "pageup" and "PageUp" are one
// key to it; the keycaps have one spelling each and this is how to reach it.
const BY_LOWERCASE = new Map([...SENDABLE_KEYS].map((k) => [k.toLowerCase(), k]));

/** A key token as the keycaps spell it: "esc" and "arrowup" become "Escape", "Up". */
export function canonicalKey(token: string): string {
  const low = token.toLowerCase();
  return KEY_ALIASES[low] ?? BY_LOWERCASE.get(low) ?? token;
}

/** Modifiers first, in a fixed order, so "Shift+Ctrl+S" and "Ctrl+Shift+S" are one chord. */
export function buildChord(mods: string[], key: string): string {
  const ordered = MODIFIERS.filter((m) => mods.includes(m));
  return [...ordered, key].filter(Boolean).join("+");
}

/** Take a stored chord apart for editing.
 *
 *  The last token is the key and everything before it is a modifier — the rule
 *  `parse_chord` uses in src-tauri/src/shortcut.rs. Reading it any other way
 *  loses the key of the app's own "CmdOrCtrl+Shift+M": `CmdOrCtrl` is not one
 *  of our four names, so a "first token that is not a modifier" search picks
 *  *it* as the key and drops the M.
 *
 *  Re-saving a `CmdOrCtrl` chord writes the platform's own modifier back
 *  ("Ctrl+Shift+M" here, "Cmd+Shift+M" on macOS), which is what the user just
 *  looked at and agreed to. Opening the picker and cancelling changes nothing.
 */
export function splitChord(chord: string, mac = false): { mods: Modifier[]; key: string } {
  const parts = chord
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { mods: [], key: "" };
  const named = parts
    .slice(0, -1)
    .map((p) => canonicalModifier(p, mac))
    .filter((m): m is Modifier => m !== null);
  return { mods: MODIFIERS.filter((m) => named.includes(m)), key: canonicalKey(parts[parts.length - 1]) };
}

// A typed punctuation key has to become the same token its keycap carries.
// `e.key` is the *shifted* glyph — Shift+; is ":" — and ":" is not a key the
// backend can press, so it would be typed as text with the modifiers dropped:
// exactly the bug `oem_key` in shortcut.rs was written to fix, arriving by the
// other door. `e.code` is positional and says which key it really was.
const CODE_TO_KEY: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

/** Which modifiers a DOM keydown is carrying, in our names. */
export function modsFromEvent(e: {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): Modifier[] {
  const mods: Modifier[] = [];
  if (e.metaKey) mods.push("Cmd");
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return mods;
}

/** Which key a DOM keydown means, as a token, or null for a modifier on its
 *  own. AltGr counts as a modifier: it reports itself as a key named
 *  "AltGraph" that nothing can press. */
export function keyFromEvent(e: { key: string; code: string }): string | null {
  if (["Meta", "Control", "Alt", "Shift", "AltGraph"].includes(e.key)) return null;
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k.startsWith("Arrow")) k = k.slice(5);
  else if (k.length === 1) {
    if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
    else if (/^Digit[0-9]$/.test(e.code)) k = e.code.slice(5);
    else k = CODE_TO_KEY[e.code] ?? k.toUpperCase();
  }
  return canonicalKey(k);
}

/** Why a chord cannot be used, or null when it can. */
export function chordProblem(mods: string[], key: string, mac: boolean, purpose: ChordPurpose = "cast"): string | null {
  if (!key) return "Add a key — modifiers alone are not a shortcut.";
  // Anything else saves fine and then fails at cast time with "unknown key",
  // which the user meets a day later with no idea what it refers to. AltGr,
  // F13 and the media keys all arrive here from a keyboard.
  if (!SENDABLE_KEYS.has(key)) return `Wandful can't send ${key} — pick one of the keys below.`;
  if (purpose === "hotkey" && !mods.length)
    return "The summon hotkey needs a modifier, or it takes that key away from every app.";
  if (mac) return null;
  const has = (m: string) => mods.includes(m);
  // The kernel takes this one before any application, in both directions:
  // it cannot be recorded and `SendInput` cannot produce it either.
  if (has("Ctrl") && has("Alt") && key === "Delete")
    return "Windows reserves Ctrl+Alt+Delete for itself — no application can send it. Use a System spell instead.";
  // Win+L only. Windows reserves the bare combination; Ctrl+Win+L and friends
  // are ordinary shortcuts and refusing them would be inventing a rule.
  if (mods.length === 1 && has("Cmd") && key === "L")
    return "Windows handles Win+L itself, so it cannot be sent. A System spell can lock the screen.";
  return null;
}
