// Native "choose an application" dialog, shared by the spellbook form and the
// overlay's new-spell panel. Lives beside tauri.ts because it is the other
// bridge to the host; in the browser preview it falls back to a prompt.
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { appBaseName } from "../lib/path";
import { IS_TAURI } from "./mock";

export type PickedApp = { path: string; name: string };

export async function pickApp(mac: boolean): Promise<PickedApp | null> {
  let path: string | null = null;
  if (!IS_TAURI) path = window.prompt("Path to application:");
  else
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        title: "Choose an application",
        defaultPath: mac ? "/Applications" : "C:\\Program Files",
        filters: mac
          ? [{ name: "Applications", extensions: ["app"] }]
          : [{ name: "Programs", extensions: ["exe", "lnk", "bat", "cmd"] }],
      });
      if (typeof picked === "string") path = picked;
    } catch {
      path = null;
    }
  if (!path) return null;
  return { path, name: appBaseName(path) };
}
