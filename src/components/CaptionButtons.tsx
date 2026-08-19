import { useEffect, useState } from "react";
import { caption } from "../api/caption";

/** Minimize / maximize / close, drawn by us because Windows has no native
 *  title bar here to draw them. macOS keeps its traffic lights, so `Titlebar`
 *  only mounts this off macOS. */
export function CaptionButtons() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let live = true;
    const sync = () => caption.isMaximized().then((m) => live && setMaximized(m));
    sync();
    // Win+Up, snapping and a double-click on the drag region all maximize
    // without going through the button, so follow the window, not the click.
    const un = caption.onResized(sync);
    return () => {
      live = false;
      un.then((f) => f()).catch(() => {});
    };
  }, []);

  return (
    <div className="tb-controls">
      <button className="cap" type="button" aria-label="Minimize" onClick={() => caption.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className="cap"
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => caption.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.5 2.5h5v5h-5z M0.5 7.5v-7h7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button className="cap close" type="button" aria-label="Close" onClick={() => caption.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
