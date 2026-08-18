import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { mockInvoke, IS_TAURI } from "./mock";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

// In a plain browser (design preview) fall back to an in-memory mock.
const invoke = (IS_TAURI ? tauriInvoke : mockInvoke) as typeof tauriInvoke;
const listen = (IS_TAURI ? tauriListen : (async () => () => {})) as typeof tauriListen;
import { Wand, fitCanvas, drawRunePreview, type Pt } from "./wand";

type Spell = { id: string; name: string; shortcut: string; action: "shortcut" | "app"; app_path: string; app_name: string; points: [number, number][]; enabled: boolean };
type Book = { spells: Spell[]; threshold: number; hotkey: string; overlay_color: string; overlay_opacity: number };
type CastResult = { matched: boolean; id: string | null; name: string | null; shortcut: string | null; action: string | null; app_name: string | null; score: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let platform = { os: "macos", physical_coords: false };
let book: Book = { spells: [], threshold: 0.8, hotkey: "CmdOrCtrl+Shift+M", overlay_color: "#06040e", overlay_opacity: 0.9 };
const iconCache = new Map<string, Promise<string | null>>();
function appIcon(path: string): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  if (!iconCache.has(path)) iconCache.set(path, invoke<string | null>("app_icon", { path }).catch(() => null));
  return iconCache.get(path)!;
}
let editingId = "";
let shortcutValue = "";
let actionKind: "shortcut" | "app" = "shortcut";
let appPath = "";
let appName = "";
let forgePoints: Pt[] = [];
let replaying = false;

// ---------- sparse starfield ----------
(function stars() {
  const c = $("stars") as HTMLCanvasElement;
  const ctx = fitCanvas(c);
  const s = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), t: Math.random() * 1000 }));
  function frame(now: number) {
    fitCanvas(c);
    const w = c.clientWidth, h = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const st of s) {
      const tw = (Math.sin(now / 700 + st.t) + 1) / 2;
      ctx.globalAlpha = 0.15 + tw * 0.5 * st.z;
      ctx.fillStyle = st.z > 0.92 ? "#f5c04a" : "#cfc6f2";
      const size = st.z > 0.8 ? 2 : 1;
      ctx.fillRect(Math.round(st.x * w), Math.round(st.y * h), size, size);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ---------- tiny wand in the title bar ----------
(function brand() {
  const c = $("brand-wand") as HTMLCanvasElement;
  const ctx = fitCanvas(c);
  const w = new Wand(ctx);
  w.px = 1; w.grid = 1;
  w.cursor = { x: 15, y: 5 };
  let last = performance.now();
  (function loop(now: number) {
    const dt = now - last; last = now;
    ctx.clearRect(0, 0, 22, 22);
    w.frame(dt);
    requestAnimationFrame(loop);
  })(last);
})();

// ---------- forge canvas ----------
const forge = $("forge") as HTMLCanvasElement;
let fctx = fitCanvas(forge);
const fwand = new Wand(fctx);
fwand.px = 3; fwand.grid = 3;
fwand.visible = false;
fwand.persistStroke = true;
let drawing = false;

const local = (e: PointerEvent): Pt => {
  const r = forge.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
forge.addEventListener("pointerenter", () => (fwand.visible = true));
forge.addEventListener("pointerleave", () => { if (!drawing) fwand.visible = false; });
forge.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  e.preventDefault();
  replayToken++; replaying = false; // interrupt a running replay
  forge.setPointerCapture(e.pointerId);
  drawing = true;
  const p = local(e);
  forgePoints = [p];
  fwand.start(p);
  $("forge-hint").classList.add("hidden");
  setMsg("");
});
forge.addEventListener("pointermove", (e) => {
  if (replaying) return; // the wand is busy replaying a rune
  const p = local(e);
  fwand.moveTo(p);
  if (drawing) forgePoints.push(p);
});
const stopDraw = () => { if (!drawing) return; drawing = false; fwand.end(null); };
forge.addEventListener("pointerup", stopDraw);
forge.addEventListener("pointercancel", stopDraw);
forge.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("contextmenu", (e) => e.preventDefault());

let flast = performance.now();
(function floop(now: number) {
  const dt = Math.min(50, now - flast); flast = now;
  fctx = fitCanvas(forge);
  fctx.clearRect(0, 0, forge.clientWidth, forge.clientHeight);
  fwand.frame(dt);
  requestAnimationFrame(floop);
})(flast);

// ---------- helpers ----------
const isMac = () => platform.os === "macos";
function keyTokens(s: string) { return s.split("+").filter(Boolean); }
function renderKeys(s: string) { return keyTokens(s).map((k) => `<kbd>${prettyKey(k)}</kbd>`).join(""); }
function prettyKey(k: string) {
  const map: Record<string, string> = isMac()
    ? { Cmd: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Enter: "↩", Backspace: "⌫", Delete: "⌦", Escape: "⎋", Tab: "⇥", Space: "␣", Up: "↑", Down: "↓", Left: "←", Right: "→", CmdOrCtrl: "⌘" }
    : { Cmd: "Win", Up: "↑", Down: "↓", Left: "←", Right: "→", CmdOrCtrl: "Ctrl" };
  return map[k] ?? k;
}
function renderAction(s: { action?: string | null; shortcut?: string | null; app_name?: string | null }) {
  return s.action === "app" ? `<span class="appchip">↗ ${escapeHtml(s.app_name || "app")}</span>` : renderKeys(s.shortcut ?? "");
}
function setKind(k: "shortcut" | "app") {
  actionKind = k;
  document.querySelectorAll<HTMLButtonElement>("#kind button").forEach((b) => b.classList.toggle("on", b.dataset.kind === k));
  $("shortcut").classList.toggle("hidden", k !== "shortcut");
  $("app").classList.toggle("hidden", k !== "app");
}
function setApp(path: string, name: string) {
  appPath = path; appName = name;
  const b = $("app");
  b.classList.toggle("set", !!path);
  b.textContent = path ? name : "Choose application…";
  if (path) appIcon(path).then((src) => { if (src && appPath === path) b.innerHTML = `<img src="${src}" alt="" /> ${escapeHtml(name)}`; });
}
function baseName(p: string) {
  const last = p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;
  return last.replace(/\.(app|exe|lnk)$/i, "");
}
function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }
function setMsg(text: string, ok = false) { const m = $("test-result"); m.textContent = text; m.classList.toggle("ok", ok); }
function setStatus(html: string, ok = false) { const s = $("status"); s.innerHTML = html; s.classList.toggle("ok", ok); }

function renderBook() {
  const ul = $("spells");
  ul.innerHTML = "";
  if (!book.spells.length) ul.innerHTML = `<li class="empty">No spells yet.<br/>Draw a rune and save it.</li>`;
  for (const s of book.spells) {
    const li = document.createElement("li");
    li.className = "spell" + (s.id === editingId ? " active" : "");
    li.dataset.id = s.id;
    li.innerHTML = `<canvas></canvas><div><div class="name">${escapeHtml(s.name)}</div><div class="keys">${renderAction(s)}</div></div>`;
    ul.appendChild(li);
    drawRunePreview(li.querySelector("canvas")!, s.points, "#c4b5fd");
    li.addEventListener("click", () => startEdit(s));
    if (s.action === "app" && s.app_path) appIcon(s.app_path).then((src) => { if (src) li.querySelector(".appchip")?.insertAdjacentHTML("afterbegin", `<img src="${src}" alt="" />`); });
  }
  ($("threshold") as HTMLInputElement).value = String(book.threshold);
  $("threshold-val").textContent = book.threshold.toFixed(2);
  $("hotkey").innerHTML = keyTokens(book.hotkey).map(prettyKey).join(isMac() ? "" : "+");
}

function startEdit(s: Spell) {
  editingId = s.id;
  ($("name") as HTMLInputElement).value = s.name;
  setShortcut(s.shortcut);
  setKind(s.action === "app" ? "app" : "shortcut");
  setApp(s.app_path ?? "", s.app_name ?? "");
  const w = forge.clientWidth, h = forge.clientHeight;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of s.points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const sc = Math.min((w - 80) / Math.max(maxX - minX, 1), (h - 80) / Math.max(maxY - minY, 1));
  const ox = (w - (maxX - minX) * sc) / 2 - minX * sc, oy = (h - (maxY - minY) * sc) / 2 - minY * sc;
  forgePoints = s.points.map(([x, y]) => ({ x: x * sc + ox, y: y * sc + oy }));
  replay(forgePoints);
  $("forge-hint").classList.add("hidden");
  $("delete").classList.remove("hidden");
  $("save").textContent = "Save changes";
  setMsg("");
  document.querySelectorAll(".spell").forEach((el) => el.classList.toggle("active", (el as HTMLElement).dataset.id === s.id));
}

// Animate a rune being drawn by the wand, start → end, like the user drew it.
let replayToken = 0;
function replay(pts: Pt[]) {
  const token = ++replayToken;
  fwand.clear();
  if (pts.length < 2) return;
  replaying = true;
  fwand.visible = true;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const dur = Math.min(900, Math.max(350, total * 0.9));
  const t0 = performance.now();
  let idx = 0;
  fwand.start(pts[0]);
  function step(now: number) {
    if (token !== replayToken) { replaying = false; return; }
    const t = Math.min(1, (now - t0) / dur);
    const target = t * total;
    while (idx + 1 < pts.length && cum[idx + 1] <= target) { idx++; fwand.addPoint(pts[idx]); }
    if (idx + 1 < pts.length) {
      const a = pts[idx], b = pts[idx + 1];
      const seg = cum[idx + 1] - cum[idx];
      const f = seg > 0 ? (target - cum[idx]) / seg : 1;
      fwand.cursor = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    if (t < 1) requestAnimationFrame(step);
    else {
      while (idx + 1 < pts.length) { idx++; fwand.addPoint(pts[idx]); }
      fwand.end(null);
      replaying = false;
      if (!forge.matches(":hover")) fwand.visible = false;
    }
  }
  requestAnimationFrame(step);
}

function resetForge() {
  replayToken++; replaying = false;
  editingId = "";
  forgePoints = [];
  fwand.clear();
  ($("name") as HTMLInputElement).value = "";
  setShortcut("");
  setKind("shortcut");
  setApp("", "");
  $("forge-hint").classList.remove("hidden");
  $("delete").classList.add("hidden");
  $("save").textContent = "Save spell";
  setMsg("");
  document.querySelectorAll(".spell").forEach((el) => el.classList.remove("active"));
}

function setShortcut(v: string) {
  shortcutValue = v;
  const b = $("shortcut");
  b.classList.remove("listening");
  b.classList.toggle("set", !!v);
  b.innerHTML = v ? renderKeys(v) : "Shortcut…";
}

// ---------- shortcut capture ----------
let listening = false;
let listenTarget: "shortcut" | "hotkey" = "shortcut";
function setListening(on: boolean, target: "shortcut" | "hotkey" = listenTarget) {
  listening = on;
  listenTarget = target;
  invoke("set_key_capture", { on }).catch(() => {});
  const b = target === "hotkey" ? $("hotkey-btn") : $("shortcut");
  if (on) { b.classList.add("listening"); b.textContent = "Press keys… (Esc to cancel)"; }
  else if (target === "hotkey") renderHotkeyBtn();
  else setShortcut(shortcutValue);
}
function acceptChord(chord: string) {
  if (listenTarget === "hotkey") {
    setListening(false, "hotkey");
    saveSettings({ hotkey: chord });
  } else {
    shortcutValue = chord;
    setListening(false, "shortcut");
  }
}
$("shortcut").addEventListener("click", () => setListening(!listening, "shortcut"));
$("hotkey-btn").addEventListener("click", () => setListening(!listening, "hotkey"));
window.addEventListener("blur", () => { if (listening) setListening(false); });
// Chords arrive from the global hook (keys are swallowed there so OS shortcuts don't fire).
listen<{ mods: string[]; key: string }>("wand:key", (e) => {
  if (!listening) return;
  const { mods, key } = e.payload;
  if (key === "Escape" && !mods.length) { setListening(false); return; }
  acceptChord([...mods, key].join("+"));
});
window.addEventListener("keydown", (e) => {
  if (!listening) return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === "Escape") { setListening(false); return; }
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
  const mods: string[] = [];
  if (e.metaKey) mods.push("Cmd");
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.startsWith("Arrow")) key = key.slice(5);
  else if (key.length === 1) {
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
    else key = key.toUpperCase();
  }
  acceptChord([...mods, key].join("+"));
}, true);

// ---------- settings sheet ----------
function renderHotkeyBtn() {
  const b = $("hotkey-btn");
  b.classList.remove("listening");
  b.classList.add("set");
  b.innerHTML = renderKeys(book.hotkey);
}
function renderSettings() {
  ($("ov-color") as HTMLInputElement).value = book.overlay_color;
  $("ov-swatch").textContent = book.overlay_color;
  ($("ov-opacity") as HTMLInputElement).value = String(book.overlay_opacity);
  $("ov-opacity-val").textContent = book.overlay_opacity.toFixed(2);
  ($("ov-preview").firstElementChild as HTMLElement).style.background = hexToRgba(book.overlay_color, book.overlay_opacity);
  renderHotkeyBtn();
}
function hexToRgba(hex: string, a: number) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(6,4,14,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}
async function saveSettings(patch: { overlay_color?: string; overlay_opacity?: number; hotkey?: string }) {
  try {
    book = await invoke<Book>("set_settings", { patch });
    renderSettings();
    renderBook();
    $("settings-msg").textContent = "";
  } catch (e) { $("settings-msg").textContent = String(e); renderSettings(); }
}
$("open-settings").addEventListener("click", () => { renderSettings(); $("sheet").classList.remove("hidden"); });
$("reset-settings").addEventListener("click", async () => {
  try {
    book = await invoke<Book>("reset_settings");
    renderSettings(); renderBook();
    $("settings-msg").textContent = "Defaults restored";
    setTimeout(() => ($("settings-msg").textContent = ""), 1500);
  } catch (e) { $("settings-msg").textContent = String(e); }
});
$("close-settings").addEventListener("click", () => $("sheet").classList.add("hidden"));
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) $("sheet").classList.add("hidden"); });
$("ov-color").addEventListener("input", (e) => {
  const v = (e.target as HTMLInputElement).value;
  $("ov-swatch").textContent = v;
  ($("ov-preview").firstElementChild as HTMLElement).style.background = hexToRgba(v, Number(($("ov-opacity") as HTMLInputElement).value));
});
$("ov-color").addEventListener("change", (e) => saveSettings({ overlay_color: (e.target as HTMLInputElement).value }));
$("ov-opacity").addEventListener("input", (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  $("ov-opacity-val").textContent = v.toFixed(2);
  ($("ov-preview").firstElementChild as HTMLElement).style.background = hexToRgba(($("ov-color") as HTMLInputElement).value, v);
});
$("ov-opacity").addEventListener("change", (e) => saveSettings({ overlay_opacity: Number((e.target as HTMLInputElement).value) }));

// ---------- action kind + app picker ----------
document.querySelectorAll<HTMLButtonElement>("#kind button").forEach((b) => b.addEventListener("click", () => setKind(b.dataset.kind as "shortcut" | "app")));
$("app").addEventListener("click", async () => {
  try {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      title: "Choose an application",
      defaultPath: isMac() ? "/Applications" : "C:\\Program Files",
      filters: isMac() ? [{ name: "Applications", extensions: ["app"] }] : [{ name: "Programs", extensions: ["exe", "lnk", "bat", "cmd"] }],
    });
    if (typeof picked === "string" && picked) setApp(picked, baseName(picked));
  } catch {
    const p = window.prompt("Path to application:");
    if (p) setApp(p, baseName(p));
  }
});

// ---------- actions ----------
$("new").addEventListener("click", resetForge);
$("clear").addEventListener("click", () => { forgePoints = []; fwand.clear(); $("forge-hint").classList.remove("hidden"); setMsg(""); });
$("test").addEventListener("click", async () => {
  if (forgePoints.length < 4) { setMsg("Draw a rune first"); return; }
  const r = await invoke<CastResult>("test_recognize", { points: forgePoints.map((p) => [p.x, p.y]) });
  if (r.matched) { setMsg(`Matches “${r.name}” · ${Math.round(r.score * 100)}%`, true); flashSpell(r.id!); }
  else setMsg(r.name ? `Closest: “${r.name}” · ${Math.round(r.score * 100)}% (below strictness)` : "No spells to compare with");
});
$("save").addEventListener("click", async () => {
  const name = ($("name") as HTMLInputElement).value.trim();
  if (forgePoints.length < 4) { setMsg("Draw a rune first"); return; }
  if (!name) { setMsg("Name the spell"); ($("name") as HTMLInputElement).focus(); return; }
  if (actionKind === "shortcut" && !shortcutValue) { setMsg("Pick a shortcut"); return; }
  if (actionKind === "app" && !appPath) { setMsg("Choose an application"); return; }
  try {
    const spell = { id: editingId, name, shortcut: shortcutValue, action: actionKind, app_path: appPath, app_name: appName, points: forgePoints.map((p) => [p.x, p.y]), enabled: true };
    book = await invoke<Book>("save_spell", { spell });
    resetForge();
    renderBook();
    setStatus(`Saved <b>${escapeHtml(name)}</b> → ${renderAction(spell)}`, true);
  } catch (e) { setMsg(String(e)); }
});
$("delete").addEventListener("click", async () => {
  if (!editingId) return;
  const s = book.spells.find((x) => x.id === editingId);
  book = await invoke<Book>("delete_spell", { id: editingId });
  resetForge();
  renderBook();
  setStatus(`Removed <b>${escapeHtml(s?.name ?? "")}</b>`);
});
$("threshold").addEventListener("input", (e) => { $("threshold-val").textContent = Number((e.target as HTMLInputElement).value).toFixed(2); });
$("threshold").addEventListener("change", async (e) => { book = await invoke<Book>("set_threshold", { threshold: Number((e.target as HTMLInputElement).value) }); });

function setToggle(on: boolean) {
  const el = $("wand-state");
  el.textContent = on ? "✦ wand is out" : "";
  el.classList.toggle("on", on);
}
listen<{ on: boolean }>("wand:mode", (e) => {
  setToggle(e.payload.on);
  setStatus(e.payload.on ? "Wand summoned — hold a mouse button anywhere and draw a rune." : "Wand sheathed. Click the menu-bar icon or press the hotkey to summon it.");
});
listen<CastResult>("wand:cast", (e) => {
  const r = e.payload;
  if (r.matched) { setStatus(`✦ Cast <b>${escapeHtml(r.name ?? "")}</b> → ${renderAction(r)} · ${Math.round(r.score * 100)}%`, true); flashSpell(r.id!); }
  else setStatus(r.name ? `Fizzled — closest was <b>${escapeHtml(r.name)}</b> at ${Math.round(r.score * 100)}%` : "Fizzled — no rune matched");
});
function showPermissionBanner() {
  const b = $("banner");
  b.classList.remove("hidden");
  b.innerHTML = `<span>Wandful needs <b>Accessibility</b> to type shortcuts and to record them without other apps' hotkeys firing. Enable <b>Wandful</b> in System Settings → Privacy &amp; Security → Accessibility, then restart.</span>
    <span class="banner-actions"><button id="open-ax" class="ghost">Open settings</button><button id="restart" class="ghost">Restart app</button></span>`;
  $("open-ax").addEventListener("click", () => invoke("open_accessibility_settings"));
  $("restart").addEventListener("click", () => invoke("restart_app"));
}
listen<string>("wand:hook-error", () => { if (isMac()) showPermissionBanner(); });

function flashSpell(id: string) {
  const li = document.querySelector<HTMLElement>(`.spell[data-id="${id}"]`);
  if (!li) return;
  li.classList.add("flash");
  setTimeout(() => li.classList.remove("flash"), 900);
}

// ---------- init ----------
(async () => {
  platform = await invoke("get_platform");
  if (!isMac()) document.body.classList.add("win");
  book = await invoke<Book>("get_book");
  renderBook();
  setToggle(await invoke<boolean>("get_wand"));
  if (isMac() && !(await invoke<boolean>("accessibility_ok"))) showPermissionBanner();
  if (new URLSearchParams(location.search).get("open") === "settings") { renderSettings(); $("sheet").classList.remove("hidden"); }
})();
