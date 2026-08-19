// One global chord recorder: at most one button "listens" at a time. Chords
// arrive either from the global hook (wand:key — keys are swallowed there so
// OS shortcuts don't fire) or, in the browser preview, from DOM keydown.
import { createStore } from "zustand/vanilla";
import { api, listen } from "../api/tauri";
import type { KeyChordEvent } from "../api/types";
import { chordFromKeyEvent } from "../lib/keys";

type Session = { id: string; onChord: (chord: string) => void };
let active: Session | null = null;

/** `recordingId` is the id of the button currently recording, or null.
 *  A vanilla store: the overlay uses it too and must not pull React in. */
export const recorderStore = createStore<{ recordingId: string | null }>(() => ({ recordingId: null }));

export function startRecording(id: string, onChord: (chord: string) => void) {
  active = { id, onChord };
  recorderStore.setState({ recordingId: id });
  api.setKeyCapture(true).catch(() => {});
}
export function stopRecording() {
  if (!active) return;
  active = null;
  recorderStore.setState({ recordingId: null });
  api.setKeyCapture(false).catch(() => {});
}
export function toggleRecording(id: string, onChord: (chord: string) => void) {
  if (active?.id === id) stopRecording();
  else startRecording(id, onChord);
}

function accept(chord: string) {
  const s = active;
  stopRecording();
  s?.onChord(chord);
}

let installed = false;
/** Wire the global listeners. Idempotent. */
export function installRecorder() {
  if (installed) return;
  installed = true;
  listen<KeyChordEvent>("wand:key", ({ mods, key }) => {
    if (!active) return;
    if (key === "Escape" && !mods.length) return stopRecording();
    accept([...mods, key].join("+"));
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return stopRecording();
      const chord = chordFromKeyEvent(e);
      if (chord) accept(chord);
    },
    true,
  );
  // The backend stops swallowing the keyboard after a while; without this the
  // button would go on saying "Press keys…" over a keyboard nobody is reading.
  listen("wand:capture-ended", () => stopRecording());
  window.addEventListener("blur", stopRecording);
}
