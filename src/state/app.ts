// App-wide state: platform, spellbook, wand mode, status line.
import type { ReactNode } from "react";
import { create } from "zustand";
import { api, listen } from "../api/tauri";
import type { Book, CastResult, Platform, WandModeEvent } from "../api/types";

export type Status = { text: ReactNode; ok: boolean };

type AppState = {
  platform: Platform;
  book: Book;
  wandOn: boolean;
  needsAccessibility: boolean;
  status: Status;
  /** Id of the spell card to flash (after a successful cast/test). */
  flashId: string | null;
  lastCast: CastResult | null;
  settingsOpen: boolean;

  setBook: (book: Book) => void;
  setStatus: (text: ReactNode, ok?: boolean) => void;
  flashSpell: (id: string) => void;
  openSettings: (open: boolean) => void;
};

let flashTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set) => ({
  platform: { os: "macos", physical_coords: false },
  book: { spells: [], threshold: 0.8, hotkey: "CmdOrCtrl+Shift+M", overlay_color: "#050506", overlay_opacity: 0.9 },
  wandOn: false,
  needsAccessibility: false,
  status: {
    text: "Click the menu-bar icon (or press the hotkey), then hold a mouse button and draw a rune.",
    ok: false,
  },
  flashId: null,
  lastCast: null,
  settingsOpen: new URLSearchParams(location.search).get("open") === "settings",

  setBook: (book) => set({ book }),
  setStatus: (text, ok = false) => set({ status: { text, ok } }),
  flashSpell: (id) => {
    clearTimeout(flashTimer);
    set({ flashId: id });
    flashTimer = setTimeout(() => set({ flashId: null }), 900);
  },
  openSettings: (settingsOpen) => set({ settingsOpen }),
}));

export const selectIsMac = (s: AppState) => s.platform.os === "macos";
export const isMac = () => selectIsMac(useApp.getState());

/** Load initial state and subscribe to backend events. Call once at startup. */
export async function bootstrap() {
  const { setState } = useApp;
  const platform = await api.getPlatform();
  setState({ platform });
  document.body.classList.toggle("win", platform.os !== "macos");
  setState({ book: await api.getBook(), wandOn: await api.getWand() });
  if (platform.os === "macos" && !(await api.accessibilityOk())) setState({ needsAccessibility: true });

  listen<WandModeEvent>("wand:mode", ({ on }) => {
    setState({ wandOn: on });
    useApp
      .getState()
      .setStatus(
        on
          ? "Wand summoned — hold a mouse button anywhere and draw a rune."
          : "Wand sheathed. Click the menu-bar icon or press the hotkey to summon it.",
      );
  });
  // Spells can also be saved from the overlay (a rune nobody matched → "Make it a spell").
  listen<Book>("book:changed", (book) => setState({ book }));
  listen<CastResult>("wand:cast", (r) => {
    setState({ lastCast: r });
    if (r.matched && r.id) useApp.getState().flashSpell(r.id);
  });
  listen<string>("wand:hook-error", () => {
    if (isMac()) setState({ needsAccessibility: true });
  });
}
