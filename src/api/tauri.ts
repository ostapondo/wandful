// The only place the frontend talks to Tauri. In a plain browser (design
// preview with `vite`) it falls back to the in-memory mock.
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import { IS_TAURI, mockInvoke } from "./mock";
import type { Book, CastResult, Platform, SettingsPatch, Spell } from "./types";

const invoke = (IS_TAURI ? tauriInvoke : mockInvoke) as typeof tauriInvoke;

export function listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!IS_TAURI) return Promise.resolve(() => {});
  return tauriListen<T>(event, (e) => handler(e.payload));
}

export const api = {
  getPlatform: () => invoke<Platform>("get_platform"),
  getBook: () => invoke<Book>("get_book"),
  getWand: () => invoke<boolean>("get_wand"),
  setWand: (on: boolean) => invoke<void>("set_wand", { on }),
  setKeyCapture: (on: boolean) => invoke<void>("set_key_capture", { on }),
  /** Overlay only: its new-spell panel / a dialog is up, so Escape must reach it, not sheathe the wand. */
  setOverlayPanel: (on: boolean) => invoke<void>("set_overlay_panel", { on }),
  accessibilityOk: () => invoke<boolean>("accessibility_ok"),
  openAccessibilitySettings: () => invoke<void>("open_accessibility_settings"),
  restartApp: () => invoke<void>("restart_app"),
  setThreshold: (threshold: number) => invoke<Book>("set_threshold", { threshold }),
  setSettings: (patch: SettingsPatch) => invoke<Book>("set_settings", { patch }),
  resetSettings: () => invoke<Book>("reset_settings"),
  saveSpell: (spell: Spell) => invoke<Book>("save_spell", { spell }),
  deleteSpell: (id: string) => invoke<Book>("delete_spell", { id }),
  testRecognize: (points: [number, number][]) => invoke<CastResult>("test_recognize", { points }),
  cast: (points: [number, number][]) => invoke<CastResult>("cast", { points }),
  appIcon: (path: string) => invoke<string | null>("app_icon", { path }),
};

const iconCache = new Map<string, Promise<string | null>>();
/** Data-URL of an app's icon, cached per path. Resolves to null when unavailable. */
export function appIcon(path: string): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  let p = iconCache.get(path);
  if (!p) {
    p = api.appIcon(path).catch(() => null);
    iconCache.set(path, p);
  }
  return p;
}
