import { useEffect } from "react";
import { useApp } from "../state/app";
import { ActionLabel } from "./Keys";

/** Bottom status line; also narrates casts coming from the overlay. */
export function StatusLine() {
  const status = useApp((s) => s.status);
  const lastCast = useApp((s) => s.lastCast);
  const setStatus = useApp((s) => s.setStatus);

  useEffect(() => {
    const r = lastCast;
    if (!r) return;
    if (r.matched)
      setStatus(
        <>
          ✦ Cast <b>{r.name ?? ""}</b> → <ActionLabel {...r} /> · {Math.round(r.score * 100)}%
        </>,
        true,
      );
    else
      setStatus(
        r.name ? (
          <>
            Fizzled — closest was <b>{r.name}</b> at {Math.round(r.score * 100)}%
          </>
        ) : (
          "Fizzled — no rune matched"
        ),
      );
  }, [lastCast, setStatus]);

  return <div className={"status" + (status.ok ? " ok" : "")}>{status.text}</div>;
}
