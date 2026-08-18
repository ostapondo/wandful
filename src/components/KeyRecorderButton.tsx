import { useStore } from "zustand";
import { recorderStore, toggleRecording } from "../state/recorder";
import { Keys } from "./Keys";

type Props = { id: string; value: string; placeholder: string; onChord: (chord: string) => void };

/** A button that shows a chord and, when clicked, records a new one. */
export function KeyRecorderButton({ id, value, placeholder, onChord }: Props) {
  const listening = useStore(recorderStore, (s) => s.recordingId === id);
  const cls = ["keybtn", listening && "listening", value && !listening && "set"].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} onClick={() => toggleRecording(id, onChord)}>
      {listening ? "Press keys… (Esc to cancel)" : value ? <Keys chord={value} /> : placeholder}
    </button>
  );
}
