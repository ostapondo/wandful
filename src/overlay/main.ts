// The transparent full-screen window that draws the wand and casts runes.
// Deliberately framework-free: one canvas, a handful of pointer handlers, and
// two small DOM pieces — the outcome chip under the stroke and the "New spell"
// panel that binds a rune nobody recognised.
import { api, listen } from "../api/tauri";
import type { ActionKind, CastResult, OverlayStyleEvent, Spell, WandModeEvent } from "../api/types";
import { hexToRgba } from "../lib/color";
import { chordLabel, keyTokens, prettyKey } from "../lib/keys";
import { pickApp } from "../api/dialog";
import { installRecorder, recorderStore, startRecording, stopRecording } from "../state/recorder";
import { Wand, drawRunePreview, fitCanvas, type Pt } from "../wand/wand";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("c");
let ctx = fitCanvas(canvas);
const wand = new Wand(ctx);
wand.px = 3;
wand.grid = 3;

let mac = true;
api.getPlatform().then((p) => (mac = p.os === "macos"));

// ---------- drawing ----------

let points: Pt[] = [];
let drawing = false;
let downAt: Pt | null = null;
/** A press that started while the panel was open: releasing it closes the panel. */
let panelTap = false;
/** Bumped per stroke so a slow `cast` reply can't be applied to the next stroke. */
let strokeSeq = 0;
/** The last stroke nobody matched — offered as a new spell until the next stroke. */
let pending: [number, number][] | null = null;
let lastMiss: CastResult | null = null;
let sheatheTimer: ReturnType<typeof setTimeout> | undefined;

/** Fewer points than this is a flick; `save_spell` refuses them too. */
const MIN_RUNE_POINTS = 4;

const local = (e: PointerEvent): Pt => ({ x: e.clientX, y: e.clientY });

/** Forget any press in flight (a release that landed on the chip or panel, or a mode change). */
function resetPointer() {
  drawing = false;
  downAt = null;
  points = [];
  panelTap = false;
}

window.addEventListener("pointermove", (e) => {
  const p = local(e);
  wand.moveTo(p);
  if (drawing) points.push(p);
  else if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 6) {
    // moved far enough → this is a stroke, not a tap
    drawing = true;
    strokeSeq++;
    points = [downAt, p];
    hideChip();
    pending = null;
    lastMiss = null;
    wand.persistStroke = false;
    wand.start(downAt);
    wand.addPoint(p);
  }
});
window.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  clearTimeout(sheatheTimer);
  if (panelOpen()) {
    // no drawing while the panel is up; a tap on the veil dismisses it
    panelTap = true;
    return;
  }
  downAt = local(e);
  wand.cursor = downAt;
});
window.addEventListener("pointerup", async (e) => {
  e.preventDefault();
  if (panelTap) {
    panelTap = false;
    if (!dialogOpen) closePanel();
    return;
  }
  const wasDrawing = drawing;
  drawing = false;
  const start = downAt;
  downAt = null;
  if (!wasDrawing) {
    // a plain click (any button, no drag) on the veil sheathes the wand
    if (start) api.setWand(false);
    return;
  }
  const seq = strokeSeq;
  const pts = points.map((p) => [p.x, p.y] as [number, number]);
  points = [];
  if (pts.length < MIN_RUNE_POINTS) {
    // a flick, not a rune: let it fade, offer nothing
    wand.end(null);
    return;
  }
  let r: CastResult;
  try {
    r = await api.cast(pts);
  } catch {
    r = { matched: false, id: null, name: null, shortcut: null, action: null, app_name: null, score: 0 };
  }
  if (seq !== strokeSeq) return; // a newer stroke has begun; this reply is history
  wand.end(r);
  if (r.matched) {
    showChip("cast", r);
  } else {
    // keep the rune on screen, violet: it is a candidate for a new spell
    pending = pts;
    lastMiss = r;
    wand.persistStroke = true;
    wand.tint("#a78bfa");
    showChip("miss", r);
  }
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("pointerleave", () => (wand.visible = false));
window.addEventListener("pointerenter", () => (wand.visible = true));

const closeBtn = $<HTMLButtonElement>("close");
closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
closeBtn.addEventListener("pointerup", (e) => {
  e.stopPropagation();
  api.setWand(false);
});

// Escape also works via the DOM (the overlay is the key window on macOS),
// in addition to the global hook — belt and braces. While the panel is up the
// hook lets Escape through, so it closes the panel, not the wand.
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    if (panelOpen()) closePanel();
    else api.setWand(false);
  } else if ((e.key === "n" || e.key === "N") && pending && !panelOpen() && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    openPanel();
  }
});

// ---------- outcome chip ----------

const chip = $<HTMLDivElement>("chip");

function actionBadge(r: { action: string | null; shortcut: string | null; app_name: string | null }): string {
  if (r.action === "app") return `<span class="appchip">${esc(r.app_name ?? "app")}</span>`;
  const chord = r.shortcut ?? "";
  if (!chord) return "";
  return mac
    ? `<kbd>${esc(chordLabel(chord, true))}</kbd>`
    : keyTokens(chord)
        .map((k) => `<kbd>${esc(prettyKey(k, false))}</kbd>`)
        .join("");
}

function showChip(kind: "cast" | "miss", r: CastResult) {
  chip.className = kind;
  if (kind === "cast") {
    chip.innerHTML = `<span class="star">✦</span><b>${esc(r.name ?? "spell")}</b>${actionBadge(r)}`;
  } else {
    const pct = Math.round(r.score * 100);
    const why = r.name
      ? `<span>Fizzled — closest was <b>${esc(r.name)}</b> at ${pct}%.</span>`
      : `<span>No spell matches this rune.</span>`;
    // the N shortcut needs keyboard focus, which the overlay only has on macOS
    const hint = mac ? `<span class="dim">or press <kbd>N</kbd></span>` : "";
    chip.innerHTML = `${why}<button id="bind" class="primary" type="button">Make it a spell</button>${hint}`;
    $<HTMLButtonElement>("bind").addEventListener("click", openPanel);
  }
  // under the stroke's tail, kept inside the viewport
  const t = wand.tail ?? wand.cursor;
  const cw = window.innerWidth,
    ch = window.innerHeight;
  chip.style.left = "0px";
  chip.style.top = "0px";
  document.body.classList.add("chip");
  const w = chip.offsetWidth,
    h = chip.offsetHeight;
  chip.style.left = `${Math.min(Math.max(12, t.x - w / 2), cw - w - 12)}px`;
  chip.style.top = `${t.y + 28 + h > ch - 12 ? t.y - h - 28 : t.y + 28}px`;
}
function hideChip() {
  document.body.classList.remove("chip");
}

// Pointer events on the chip and the panel must neither start a stroke nor
// read as a tap on the veil; a release that lands on them ends any press.
chip.addEventListener("pointerdown", (e) => e.stopPropagation());
chip.addEventListener("pointermove", (e) => e.stopPropagation());
chip.addEventListener("pointerup", (e) => {
  e.stopPropagation();
  resetPointer();
});
// the real cursor takes over on top of them; the wand waits outside
chip.addEventListener("pointerenter", () => (wand.visible = false));
chip.addEventListener("pointerleave", () => (wand.visible = true));

// ---------- new-spell panel ----------

const panel = $<HTMLDivElement>("panel");
const nameEl = $<HTMLInputElement>("name");
const shortcutBtn = $<HTMLButtonElement>("shortcut");
const appBtn = $<HTMLButtonElement>("app");
const msgEl = $<HTMLSpanElement>("msg");
const saveBtn = $<HTMLButtonElement>("save");
let kind: ActionKind = "shortcut";
let shortcut = "";
let app = { path: "", name: "" };
let saving = false;
/** A native dialog is up: taps on the veil must not close the panel under it. */
let dialogOpen = false;

panel.addEventListener("pointerdown", (e) => e.stopPropagation());
panel.addEventListener("pointermove", (e) => e.stopPropagation());
panel.addEventListener("pointerup", (e) => {
  e.stopPropagation();
  resetPointer();
});
panel.addEventListener("pointerenter", () => (wand.visible = false));
panel.addEventListener("pointerleave", () => (wand.visible = true));
const panelOpen = () => !panel.classList.contains("hidden");

function openPanel() {
  if (!pending || panelOpen()) return;
  panel.classList.remove("hidden");
  document.body.classList.add("panel");
  api.setOverlayPanel(true).catch(() => {});
  hideChip();
  drawRunePreview($<HTMLCanvasElement>("rune"), pending, "#a78bfa");
  nameEl.value = "";
  shortcut = "";
  app = { path: "", name: "" };
  setKind("shortcut");
  setMsg("");
  renderBind();
  nameEl.focus();
}
function closePanel() {
  if (!panelOpen()) return;
  stopRecording();
  panel.classList.add("hidden");
  document.body.classList.remove("panel");
  api.setOverlayPanel(false).catch(() => {});
  // the rune is still on screen; offer it again
  if (pending && lastMiss) showChip("miss", lastMiss);
}
function setMsg(t: string) {
  msgEl.textContent = t;
}
function setKind(k: ActionKind) {
  kind = k;
  for (const b of panel.querySelectorAll<HTMLButtonElement>("#kind button")) {
    const on = b.dataset.kind === k;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  }
  shortcutBtn.classList.toggle("hidden", k !== "shortcut");
  appBtn.classList.toggle("hidden", k !== "app");
}
function renderBind() {
  const listening = recorderStore.getState().recordingId === "overlay-shortcut";
  shortcutBtn.className = "keybtn" + (listening ? " listening" : shortcut ? " set" : "");
  shortcutBtn.textContent = listening
    ? "Press keys… (Esc to cancel)"
    : shortcut
      ? chordLabel(shortcut, mac)
      : "Shortcut…";
  appBtn.className = "keybtn" + (app.path ? " set" : "");
  appBtn.textContent = app.path ? app.name : "Choose application…";
}
recorderStore.subscribe(renderBind);
installRecorder();

panel
  .querySelectorAll<HTMLButtonElement>("#kind button")
  .forEach((b) => b.addEventListener("click", () => setKind(b.dataset.kind as ActionKind)));
shortcutBtn.addEventListener("click", () => {
  if (recorderStore.getState().recordingId === "overlay-shortcut") stopRecording();
  else
    startRecording("overlay-shortcut", (chord) => {
      shortcut = chord;
      renderBind();
    });
});
appBtn.addEventListener("click", async () => {
  if (dialogOpen) return;
  dialogOpen = true;
  const picked = await pickApp(mac).finally(() => (dialogOpen = false));
  if (picked && panelOpen()) {
    app = picked;
    renderBind();
  }
});
$<HTMLButtonElement>("cancel").addEventListener("click", closePanel);
nameEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return; // let the window handler close the panel
  e.stopPropagation(); // typing must not reach the window handlers (N)
  if (e.key === "Enter") save();
});
saveBtn.addEventListener("click", save);

async function save() {
  if (saving) return;
  if (!pending) return closePanel();
  const name = nameEl.value.trim();
  if (!name) {
    setMsg("Name the spell");
    nameEl.focus();
    return;
  }
  if (kind === "shortcut" && !shortcut) return setMsg("Pick a shortcut");
  if (kind === "app" && !app.path) return setMsg("Choose an application");
  const spell: Spell = {
    id: "",
    name,
    shortcut: kind === "shortcut" ? shortcut : "",
    action: kind,
    app_path: app.path,
    app_name: app.name,
    points: pending,
    enabled: true,
  };
  saving = true;
  saveBtn.disabled = true;
  const seq = strokeSeq;
  try {
    await api.saveSpell(spell);
  } catch (e) {
    return setMsg(String(e));
  } finally {
    saving = false;
    saveBtn.disabled = false;
  }
  if (seq !== strokeSeq) return; // the wand was sheathed meanwhile; the spell is saved, nothing to show
  pending = null;
  lastMiss = null;
  closePanel();
  wand.end({ matched: true });
  showChip("cast", {
    matched: true,
    id: null,
    name,
    shortcut: spell.shortcut,
    action: kind,
    app_name: app.name,
    score: 1,
  });
  clearTimeout(sheatheTimer);
  sheatheTimer = setTimeout(() => api.setWand(false), 700);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// ---------- mode & style ----------

function setMode(on: boolean) {
  document.body.classList.toggle("on", on);
  wand.visible = on;
  if (!on) {
    strokeSeq++; // any cast/save reply still in flight belongs to a wand that is gone
    clearTimeout(sheatheTimer);
    wand.clear();
    wand.persistStroke = false;
    resetPointer();
    pending = null;
    lastMiss = null;
    hideChip();
    closePanel();
  }
}
listen<WandModeEvent>("wand:mode", (e) => setMode(e.on));
api.getWand().then(setMode);

const veil = $<HTMLElement>("veil");
const applyStyle = (color: string, opacity: number) => (veil.style.background = hexToRgba(color, opacity));
api.getBook().then((b) => applyStyle(b.overlay_color, b.overlay_opacity));
listen<OverlayStyleEvent>("overlay:style", (e) => applyStyle(e.color, e.opacity));

window.addEventListener("resize", () => (ctx = fitCanvas(canvas)));

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(50, now - last);
  last = now;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  // soft glow following the wand tip
  if (wand.visible) {
    const g = ctx.createRadialGradient(wand.cursor.x, wand.cursor.y, 0, wand.cursor.x, wand.cursor.y, 140);
    g.addColorStop(0, "rgba(255,255,255,0.05)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(wand.cursor.x - 140, wand.cursor.y - 140, 280, 280);
  }
  wand.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
