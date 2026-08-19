import { useState } from "react";
import { ChordPicker } from "./ChordPicker";
import { Keys } from "./Keys";

type Props = { id: string; value: string; placeholder: string; onChord: (chord: string) => void };

/** Shows a chord and, when clicked, opens the picker that builds one.
 *  Composing beats capturing: a global hook cannot see every combination, and
 *  acts on some of them while you are still trying to record. */
export function KeyRecorderButton({ id, value, placeholder, onChord }: Props) {
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
