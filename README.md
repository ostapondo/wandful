# Wandful ✦

A tiny cross-platform (macOS + Windows) desktop app: summon a **pixel-art magic wand** that follows
your cursor; hold the **right mouse button** and draw a rune — sparkling magic trails behind the wand,
and when you release, the rune is recognised and the bound **keyboard shortcut** is cast.

- Tauri v2 (Rust backend, HTML/Canvas frontend) — one small binary, native window.
- Global mouse hook (`rdev`, vendored + patched) → right-drag becomes a gesture, plain right-click still works.
- `$1 Unistroke Recognizer` — rotation/scale/position invariant, works with any freehand rune.
- Shortcuts are typed with `enigo`.
- Spellbook window: draw a rune, name it, record a shortcut, done. Spells live in `spellbook.json`
  (app config dir).

## Run (dev)

```bash
npm install
npm run tauri dev
```

## Build a real app

```bash
npm run tauri build
# macOS: src-tauri/target/release/bundle/macos/Wandful.app  (+ .dmg)
# Windows: src-tauri/target/release/bundle/nsis/*.exe / msi/*.msi
```

## Using it

1. Toggle **Wand** in the title bar, **left-click the menu-bar icon** (right-click = menu), or press `⌘⇧M` / `Ctrl+Shift+M`.
2. Hold the **right mouse button** anywhere and draw a rune. Release → the matching spell fires.
3. Right-click without moving still opens the normal context menu.
4. In the Spellbook: draw a rune in the canvas, type a name, click **Shortcut** and press the keys, **Save spell**.
   Click a spell in the list to edit or delete it. The spellbook starts empty — every rune and shortcut is yours. **Strictness** controls how precise the rune must be.

## macOS permission

Global mouse hooks and key synthesis need **Accessibility**:
System Settings → Privacy & Security → Accessibility → enable **Wandful**.
In dev mode the permission goes to whatever launched the process (Terminal / VS Code / iTerm) — enable that instead,
then restart. Without it the app shows a red banner and falls back to "listen-only" mode (the wand still draws, but
the right button also reaches other apps).

## Windows

No extra permissions. Shortcuts can't be sent into windows running as Administrator unless Wandful also runs as Administrator.
The overlay covers the primary monitor.

## Project layout

```
src/                 frontend (vanilla TS)
  wand.ts            pixel wand sprite + magic trail (shared by overlay & spellbook)
  overlay.ts         full-screen transparent click-through overlay
  settings.ts        spellbook UI
  mock.ts            browser stand-in so `vite` alone previews the UI
src-tauri/src/
  lib.rs             windows, tray, hotkey, commands, worker
  hook.rs            global mouse/keyboard hook state machine
  recognizer.rs      $1 unistroke recognizer
  spells.rs          spellbook persistence
  shortcut.rs        "Cmd+Shift+S" → key presses
src-tauri/vendor/rdev  patched rdev (macOS drag events + no TSM calls off the main thread)
```
