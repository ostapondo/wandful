import { useState } from "react";
import type { ChordPurpose } from "../lib/chord";
import { ChordPicker } from "./ChordPicker";
import { Keys } from "./Keys";

type Props = {
  id: string;
  value: string;
  placeholder: string;
  /** A chord to send, or the global summon hotkey — they are held to
   *  different rules (a bare key is fine to cast, and a disaster to grab). */
  purpose?: ChordPurpose;
  onChord: (chord: string) => void;
};

/** Shows a chord and, when clicked, opens the picker that builds one.
 *  Composing beats capturing: a global hook cannot see every combination, and
 *  acts on some of them while you are still trying to record. */
export function KeyRecorderButton({ id, value, placeholder, purpose = "cast", onChord }: Props) {
  const [open, setOpen] = useState(false);
  const cls = ["keybtn", value && "set"].filter(Boolean).join(" ");
  return (
    <>
      <button type="button" id={id} className={cls} onClick={() => setOpen(true)}>
        {value ? <Keys chord={value} /> : placeholder}
      </button>
      {open && (
        <ChordPicker
          value={value}
          purpose={purpose}
          onClose={() => setOpen(false)}
          onSave={(chord) => {
            onChord(chord);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
