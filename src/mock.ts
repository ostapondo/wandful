// Browser-only stand-in for the Tauri backend, so the UI can be previewed with `vite`.
export const IS_TAURI = "__TAURI_INTERNALS__" in window;

const circle = Array.from({ length: 49 }, (_, i) => { const a = -Math.PI / 2 + (i / 48) * Math.PI * 2; return [100 + 60 * Math.cos(a), 100 + 60 * Math.sin(a)] as [number, number]; });
const line = (c: [number, number][]) => { const o: [number, number][] = []; for (let i = 1; i < c.length; i++) for (let k = 0; k < 12; k++) { const t = k / 12; o.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * t, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t]); } o.push(c[c.length - 1]); return o; };
const mac = navigator.platform.toLowerCase().includes("mac");
const P = mac ? "Cmd" : "Ctrl";
let book = {
  spells: [
    { id: "1", name: "Circle of Undo", shortcut: `${P}+Z`, action: "shortcut", app_path: "", app_name: "", points: circle, enabled: true },
    { id: "2", name: "Check of Saving", shortcut: `${P}+S`, action: "shortcut", app_path: "", app_name: "", points: line([[20, 90], [60, 140], [150, 30]]), enabled: true },
    { id: "3", name: "Summon Spotify", shortcut: "", action: "app", app_path: "/Applications/Spotify.app", app_name: "Spotify", points: line([[20, 140], [80, 20], [140, 140]]), enabled: true },
  ],
  threshold: 0.8,
  hotkey: "CmdOrCtrl+Shift+M",
};
let wand = false;

export async function mockInvoke(cmd: string, args: any = {}): Promise<any> {
  switch (cmd) {
    case "get_platform": return { os: mac ? "macos" : "windows", physical_coords: !mac };
    case "get_book": return book;
    case "get_wand": return wand;
    case "set_wand": wand = args.on; return;
    case "set_key_capture": return;
    case "accessibility_ok": return true;
    case "open_accessibility_settings": case "restart_app": return;
    case "set_threshold": book = { ...book, threshold: args.threshold }; return book;
    case "save_spell": {
      const sp = { ...args.spell, id: args.spell.id || String(Date.now()) };
      const i = book.spells.findIndex((s) => s.id === sp.id);
      if (i >= 0) book.spells[i] = sp; else book.spells.push(sp);
      return book;
    }
    case "delete_spell": book.spells = book.spells.filter((s) => s.id !== args.id); return book;
    case "test_recognize": return { matched: true, id: "1", name: "Circle of Undo", shortcut: `${P}+Z`, action: "shortcut", app_name: null, score: 0.91 };
    case "cast_shortcut": return;
  }
}
