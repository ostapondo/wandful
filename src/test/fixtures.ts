import type { Book, Spell } from "../api/types";
import { useApp } from "../state/app";
import { useForge } from "../state/forge";

export const emptyBook: Book = {
  spells: [],
  threshold: 0.8,
  hotkey: "CmdOrCtrl+Shift+M",
  overlay_color: "#050506",
  overlay_opacity: 0.9,
};

export const demoSpells: Spell[] = [
  {
    id: "1",
    name: "Circle of Undo",
    shortcut: "Cmd+Z",
    action: "shortcut",
    app_path: "",
    app_name: "",
    points: [
      [0, 0],
      [1, 1],
    ],
    enabled: true,
  },
  {
    id: "2",
    name: "Summon Spotify",
    shortcut: "",
    action: "app",
    app_path: "/Applications/Spotify.app",
    app_name: "Spotify",
    points: [
      [0, 0],
      [1, 1],
    ],
    enabled: true,
  },
];

export const rune = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

/** Put both stores into a known state: macOS, given spells, nothing being edited. */
export function resetStores(spells: Spell[] = []) {
  useApp.setState({
    platform: { os: "macos", physical_coords: false },
    book: { ...emptyBook, spells },
    flashId: null,
    needsAccessibility: false,
    settingsOpen: false,
    lastCast: null,
  });
  useForge.getState().resetForge();
}
