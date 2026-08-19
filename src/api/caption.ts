// Window controls for the custom title bar. A file of its own, beside
// tauri.ts and dialog.ts, so that importing it is a choice: the overlay talks
// to the same backend but has no title bar, and must not carry this code.
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { IS_TAURI } from "./mock";

/** Caption buttons for the custom title bar. Windows has no native ones to
 *  fall back on once the decorations are off; macOS keeps its traffic lights,
 *  so nothing here is called there. No-ops in the browser preview. */
export const caption = {
  minimize: () => void (IS_TAURI && getCurrentWindow().minimize()),
  /** Closing hides to the tray — the backend prevents the close (`on_window_event`). */
  close: () => void (IS_TAURI && getCurrentWindow().close()),
  toggleMaximize: () => (IS_TAURI ? getCurrentWindow().toggleMaximize() : Promise.resolve()),
  isMaximized: () => (IS_TAURI ? getCurrentWindow().isMaximized() : Promise.resolve(false)),
  /** Fires on maximize and restore too, so the glyph can follow the real state. */
  onResized: (cb: () => void): Promise<UnlistenFn> =>
    IS_TAURI ? getCurrentWindow().onResized(() => cb()) : Promise.resolve(() => {}),
};
