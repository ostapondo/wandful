import { useCallback, useRef, useState } from "react";
import { api } from "../api/tauri";
import type { SettingsPatch } from "../api/types";
import { hexToRgba } from "../lib/color";
import { useApp } from "../state/app";
import { useNativeChange } from "./hooks";
import { KeyRecorderButton } from "./KeyRecorderButton";

/** Mounted only while open, so the native-change listeners attach to real inputs. */
export function SettingsSheet() {
  const open = useApp((s) => s.settingsOpen);
  return open ? <SettingsSheetBody /> : null;
}

function SettingsSheetBody() {
  const openSettings = useApp((s) => s.openSettings);
  const book = useApp((s) => s.book);
  const setBook = useApp((s) => s.setBook);

  const [draftColor, setDraftColor] = useState<string | null>(null);
  const [draftOpacity, setDraftOpacity] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const colorRef = useRef<HTMLInputElement>(null);
  const opacityRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((text: string, ms = 1500) => {
    setMessage(text);
    clearTimeout(timer.current);
    if (ms) timer.current = setTimeout(() => setMessage(""), ms);
  }, []);
  const save = useCallback(
    async (patch: SettingsPatch) => {
      try {
        setBook(await api.setSettings(patch));
        setMessage("");
      } catch (e) {
        flash(String(e), 0);
      } finally {
        setDraftColor(null);
        setDraftOpacity(null);
      }
    },
    [setBook, flash],
  );
  useNativeChange(
    colorRef,
    useCallback((v: string) => save({ overlay_color: v }), [save]),
  );
  useNativeChange(
    opacityRef,
    useCallback((v: string) => save({ overlay_opacity: Number(v) }), [save]),
  );

  const color = draftColor ?? book.overlay_color;
  const opacity = draftOpacity ?? book.overlay_opacity;
  const close = () => openSettings(false);

  async function reset() {
    try {
      setBook(await api.resetSettings());
      flash("Defaults restored");
    } catch (e) {
      flash(String(e), 0);
    }
  }

  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet-card">
        <div className="sheet-head">
          <span>Settings</span>
          <button className="icon-btn" onClick={close}>
            ✕
          </button>
        </div>
        <label className="row-field">
          <span>Overlay colour</span>
          <span className="color-wrap">
            <input ref={colorRef} type="color" value={color} onChange={(e) => setDraftColor(e.target.value)} />
            <span className="swatch">{color}</span>
          </span>
        </label>
        <label className="row-field">
          <span>Overlay opacity</span>
          <span className="range-wrap">
            <input
              ref={opacityRef}
              type="range"
              min="0.2"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(e) => setDraftOpacity(Number(e.target.value))}
            />
            <b>{opacity.toFixed(2)}</b>
          </span>
        </label>
        <label className="row-field">
          <span>Summon hotkey</span>
          <KeyRecorderButton
            id="hotkey"
            value={book.hotkey}
            purpose="hotkey"
            placeholder="Hotkey…"
            onChord={(hotkey) => save({ hotkey })}
          />
        </label>
        <div className="row-field preview-row">
          <span>Preview</span>
          <div className="ov-preview">
            <i style={{ background: hexToRgba(color, opacity) }} />
          </div>
        </div>
        <div className="sheet-foot">
          <span className="msg">{message}</span>
          <button className="ghost" onClick={reset}>
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
