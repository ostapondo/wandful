import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { mockInvoke, IS_TAURI } from "./mock";

// In a plain browser (design preview) fall back to an in-memory mock.
const invoke = (IS_TAURI ? tauriInvoke : mockInvoke) as typeof tauriInvoke;
const listen = (IS_TAURI ? tauriListen : (async () => () => {})) as typeof tauriListen;
import { Wand, fitCanvas, drawRunePreview, type Pt } from "./wand";

type Spell = { id: string; name: string; shortcut: string; points: [number, number][]; enabled: boolean };
type Book = { spells: Spell[]; threshold: number; hotkey: string };
type CastResult = { matched: boolean; id: string | null; name: string | null; shortcut: string | null; score: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let platform = { os: "macos", physical_coords: false };
let book: Book = { spells: [], threshold: 0.8, hotkey: "CmdOrCtrl+Shift+M" };
let editingId = "";
let shortcutValue = "";
let forgePoints: Pt[] = [];

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
  forge.setPointerCapture(e.pointerId);
  drawing = true;
  const p = local(e);
  forgePoints = [p];
  fwand.start(p);
  $("forge-hint").classList.add("hidden");
  setMsg("");
});
forge.addEventListener("pointermove", (e) => {
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
    li.innerHTML = `<canvas></canvas><div><div class="name">${escapeHtml(s.name)}</div><div class="keys">${renderKeys(s.shortcut)}</div></div>`;
    ul.appendChild(li);
    drawRunePreview(li.querySelector("canvas")!, s.points, "#c4b5fd");
    li.addEventListener("click", () => startEdit(s));
  }
  ($("threshold") as HTMLInputElement).value = String(book.threshold);
  $("threshold-val").textContent = book.threshold.toFixed(2);
  $("hotkey").innerHTML = keyTokens(book.hotkey).map(prettyKey).join(isMac() ? "" : "+");
}

function startEdit(s: Spell) {
  editingId = s.id;
  ($("name") as HTMLInputElement).value = s.name;
  setShortcut(s.shortcut);
  const w = forge.clientWidth, h = forge.clientHeight;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of s.points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const sc = Math.min((w - 80) / Math.max(maxX - minX, 1), (h - 80) / Math.max(maxY - minY, 1));
  const ox = (w - (maxX - minX) * sc) / 2 - minX * sc, oy = (h - (maxY - minY) * sc) / 2 - minY * sc;
  forgePoints = s.points.map(([x, y]) => ({ x: x * sc + ox, y: y * sc + oy }));
  fwand.clear();
  fwand.start(forgePoints[0]);
  for (const p of forgePoints.slice(1)) fwand.addPoint(p);
  fwand.end(null);
  fwand.visible = false;
  $("forge-hint").classList.add("hidden");
  $("delete").classList.remove("hidden");
  $("save").textContent = "Save changes";
  setMsg("");
  document.querySelectorAll(".spell").forEach((el) => el.classList.toggle("active", (el as HTMLElement).dataset.id === s.id));
}

function resetForge() {
  editingId = "";
  forgePoints = [];
  fwand.clear();
  ($("name") as HTMLInputElement).value = "";
  setShortcut("");
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
function setListening(on: boolean) {
  listening = on;
  invoke("set_key_capture", { on }).catch(() => {});
  const b = $("shortcut");
  if (on) { b.classList.add("listening"); b.textContent = "Press keys… (Esc to cancel)"; }
  else setShortcut(shortcutValue);
}
$("shortcut").addEventListener("click", () => setListening(!listening));
window.addEventListener("blur", () => { if (listening) setListening(false); });
// Chords arrive from the global hook (keys are swallowed there so OS shortcuts don't fire).
listen<{ mods: string[]; key: string }>("wand:key", (e) => {
  if (!listening) return;
  const { mods, key } = e.payload;
  if (key === "Escape" && !mods.length) { setListening(false); return; }
  shortcutValue = [...mods, key].join("+");
  setListening(false);
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
  shortcutValue = [...mods, key].join("+");
  setListening(false);
}, true);

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
  if (!shortcutValue) { setMsg("Pick a shortcut"); return; }
  try {
    book = await invoke<Book>("save_spell", { spell: { id: editingId, name, shortcut: shortcutValue, points: forgePoints.map((p) => [p.x, p.y]), enabled: true } });
    resetForge();
    renderBook();
    setStatus(`Saved <b>${escapeHtml(name)}</b> → ${renderKeys(shortcutValue)}`, true);
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
  ($("toggle") as HTMLInputElement).checked = on;
  $("switch-label").textContent = on ? "Wand out" : "Wand";
}
$("toggle").addEventListener("change", (e) => invoke("set_wand", { on: (e.target as HTMLInputElement).checked }));
listen<{ on: boolean }>("wand:mode", (e) => {
  setToggle(e.payload.on);
  setStatus(e.payload.on ? "Wand summoned — hold the <b>right mouse button</b> anywhere and draw a rune." : "Wand sheathed.");
});
listen<CastResult>("wand:cast", (e) => {
  const r = e.payload;
  if (r.matched) { setStatus(`✦ Cast <b>${escapeHtml(r.name ?? "")}</b> → ${renderKeys(r.shortcut ?? "")} · ${Math.round(r.score * 100)}%`, true); flashSpell(r.id!); }
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
})();
