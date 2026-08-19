import { useEffect, useState } from "react";
import { appIcon } from "../api/tauri";
import { systemLabel } from "../api/types";
import { keyTokens, prettyKey } from "../lib/keys";
import { selectIsMac, useApp } from "../state/app";

/** A chord as a row of <kbd> glyphs. */
export function Keys({ chord }: { chord: string }) {
  const mac = useApp(selectIsMac);
  return (
    <>
      {keyTokens(chord).map((k, i) => (
        <kbd key={i}>{prettyKey(k, mac)}</kbd>
      ))}
    </>
  );
}

export function AppIcon({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    appIcon(path).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [path]);
  return src ? <img src={src} alt="" /> : null;
}

/** What a spell does: its shortcut, or the app it opens. */
export function ActionLabel(s: {
  action?: string | null;
  shortcut?: string | null;
  app_name?: string | null;
  app_path?: string | null;
  system?: string | null;
}) {
  if (s.action === "system") return <span className="appchip">⚙ {systemLabel(s.system ?? "")}</span>;
  if (s.action === "app")
    return (
      <span className="appchip">
        {s.app_path ? <AppIcon path={s.app_path} /> : null}↗ {s.app_name || "app"}
      </span>
    );
  return <Keys chord={s.shortcut ?? ""} />;
}
