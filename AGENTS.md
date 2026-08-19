# Agent rules

Rules for AI agents working in this repo. Humans: this is also the engineering
guide, so read it before a second change. Naming and tone rules are in
[CLAUDE.md](CLAUDE.md) and apply everywhere.

## Layout

- `src/` — the frontend: TypeScript, React + zustand, Vite. Two entry points:
  `overlay/main.ts` (the transparent full-screen window that draws the wand;
  deliberately framework-free, one canvas and a few pointer handlers) and
  `main.tsx` (the spellbook, a React app). Inside:
  - `api/` — `tauri.ts` is the only place that calls `invoke`/`listen`, typed
    per command; `dialog.ts` is the native "choose an application" dialog and
    `caption.ts` the window controls the custom title bar needs, both kept
    separate so importing them is a choice (the overlay has neither);
    `types.ts` mirrors the Rust structs; `mock.ts` stands in for Tauri when
    `vite` runs alone, so the UI previews in a browser with no Rust toolchain.
  - `state/` — zustand stores. `app.ts` (platform, spellbook, wand mode, status),
    `forge.ts` (the spell being drawn/edited), `recorder.ts` (the key-chord
    recorder — a vanilla store, because the overlay is the only thing left that
    uses it; see "Two ways to name a chord" below).
  - `components/` — one file per piece of UI: `Spellbook`, `Forge`,
    `SpellForm`, `SettingsSheet`, `KeyRecorderButton`, `ChordPicker`,
    `CaptionButtons`, …
  - `lib/` — pure helpers with unit tests (`keys`, `chord`, `system`, `color`,
    `path`, `geometry`). `chord.ts` is the one with a counterpart in Rust:
    every key it offers has to be one `shortcut.rs` can press.
  - `wand/` — `wand.ts` is the sprite and trail both windows share;
    `replay.ts` animates a saved rune being redrawn.
- `src-tauri/src/` — the app. `lib.rs` is the wiring: windows, tray, hotkey,
  commands, the worker thread. Behaviour lives beside it in one file per
  concern: `hook.rs` (global keyboard hook state), `recognizer.rs` (`$1`),
  `spells.rs` (spellbook file), `shortcut.rs` (string → key presses),
  `win.rs` (the Win32 calls, the counterpart of the `objc2` blocks in
  `lib.rs`: foreground window, `ShellExecute`, shell icons, elevation).
- `src-tauri/vendor/rdev/` — a vendored copy of `rdev` 0.5.3 with local
  patches, pulled in as a path dependency. Every patch carries a
  `// PATCHED (wandful): …` comment saying why, and grepping for that string is
  the list. Two on macOS: drag events are delivered (`LeftMouseDragged` /
  `RightMouseDragged` / `OtherMouseDragged` in the tap mask and the event
  match), and key events never resolve their Unicode name on the tap thread
  (see "macOS threading"). Two on Windows, both in the hook installers:
  `grab` / `listen` pump messages in a loop instead of once (a single
  `GetMessageA` lets the thread end, and Windows then unhooks without telling
  anyone), and `grab_keys` / `listen_keys` install the keyboard hook without
  the mouse one. A patch stays applicable to upstream's own configurations —
  keep the `#[cfg]`s that guard the code you are patching.
- `src-tauri/capabilities/` — the whole list of host APIs the web views may
  call: `default.json` for both windows, `main.json` for what only the
  spellbook window may do (the title-bar controls). Adding a Tauri plugin call
  means adding a line here — to the narrower of the two where that works — and
  saying so in `SECURITY.md` if it widens what the app can reach.
- `scripts/` — icon and README media generators (`make-*.mjs`, run by hand,
  output is committed), and the two macOS signing helpers.

## The one rule about names

The product is **Wandful**. A shortcut is a *spell*, the set is the
*spellbook*, running one is a *cast*, the trigger gesture is a *swish*. Use
those in code identifiers, user-facing text, docs and commit messages. Do not
introduce a synonym or a codename; the last one (`magic-wand`) has been
removed and should not come back.

## macOS threading

This is where the hours have gone.

- **The `rdev` tap runs on its own thread. Nothing that touches TSM /
  HIToolbox / Cocoa may run there.** Resolving a key's Unicode name does, and
  traps with `SIGTRAP` on recent macOS — that is the vendored patch in
  `vendor/rdev/src/macos/common.rs`. Key synthesis (`enigo`) does too, which
  is why every cast goes through `press_on_main` in `lib.rs`. If you need
  something from the tap thread, send it over a channel and let the main
  thread act.
- **`app.run_on_main_thread` is the way onto the main thread**, not a Grand
  Central Dispatch call of your own. It queues into Tauri's run loop, which is
  the same one AppKit uses.
- **The overlay is hidden, not click-through, while the wand is away.**
  `set_wand_mode` in `lib.rs` shows it and takes focus when the wand comes
  out, remembers the frontmost app's pid, and hands focus back after a cast.
  All mouse handling happens inside the overlay web view while it is up.
  A regression here looks like "the app ate my right click" or "my shortcut
  went to Wandful instead of the app", and is the first thing to check.
- **Escape has three meanings, decided in `hook.rs`.** Recording a shortcut
  → it ends the recording (reported as an `Escape` chord). The overlay's
  new-spell panel or a native dialog is up (`set_overlay_panel`) → it passes
  through to the web view. Otherwise, wand out → it sheathes the wand. Keep
  that order; the panel is where a user has typed something worth keeping.
- **The Accessibility grant is tied to the code signature.** Ad-hoc signed
  bundles get a new signature every build and lose the grant; `scripts/sign-mac.sh`
  re-signs with a stable local identity so it survives. In `tauri dev` the
  grant belongs to the parent process (Terminal, VS Code). If the wand draws
  but shortcuts do not fire, this is why, not the code.

## Windows

- **Build with MSVC.** `rustup default stable-msvc`; the GNU toolchain
  fails to link the app (`export ordinal too large`) and Tauri does not
  support it on Windows. CI and the release matrix both use MSVC.
- Low-level hooks need no permission but cannot reach a window whose process
  runs at a higher integrity level than ours unless Wandful runs there too.
  `win::foreground_unreachable` is the probe, and it compares integrity levels,
  because that is the rule UIPI applies. Opening the *process* is not a probe:
  `PROCESS_QUERY_LIMITED_INFORMATION` exists so a medium-integrity caller can
  query a higher-integrity one, so it succeeds for exactly the windows that
  need catching. The token is the guarded thing. `perform` then drops the cast
  with a message on `wand:cast-error`. Say so, do not retry.
- The overlay covers the primary monitor. Multi-monitor is on the roadmap;
  a change there touches `create_overlay` in `lib.rs` and nothing else.
- The overlay is a no-activate window so drawing never steals focus; the
  new-spell panel flips it focusable for as long as it is open
  (`set_overlay_panel`). Because the panel *does* take focus, both it and
  `set_wand_mode` hand it back through `activate_app`, using the window
  remembered in `prev_app` when the wand was summoned. A regression here looks
  like a cast landing in Wandful instead of the app you drew over.
- `prev_app` holds a pid on macOS and an `HWND` on Windows, both as `isize`,
  behind the same `frontmost_app` / `activate_app` pair. Keep new platform
  code behind that shape rather than adding a second field.
- A system action that needs a privilege enables it first: `SetSuspendState`
  wants `SE_SHUTDOWN_NAME`, which every token carries and none has switched on,
  and without `enable_privilege` it simply returns false. System paths come
  from `%SystemRoot%` (`win::system32`), never a literal `C:\Windows`.
- The **System** action (`win::system_action`) exists because `Ctrl+Alt+Del` is
  unreachable in both directions — the kernel takes the sequence before any
  hook sees it, and `SendInput` cannot synthesize it. Making it work would need
  `SendSAS`, which means a signed `UIAccess` binary plus a machine-wide
  `SoftwareSASGeneration` policy: both break what `SECURITY.md` promises. Call
  the API behind the menu item instead. It is Windows-only, and `SpellForm`
  hides the segment on macOS rather than offering something that errors. The
  five ids are a contract between `src/lib/system.ts` and `system_action_kind`
  in `win.rs`; a test in `win.rs` names them, because an id only one side knows
  about saves happily and fails at cast time.
- Icons and launching go through the shell (`SHGetImageList`, `ShellExecuteW`),
  not a subprocess: a `cmd` or `powershell` child flashes a console window on
  a desktop app. Anything new that shells out on Windows has the same problem.
- The spellbook window is undecorated here: `titleBarStyle: "Overlay"` is
  macOS-only, so Windows would draw a second title bar under its own. `lib.rs`
  drops the frame at setup and `CaptionButtons` supplies the buttons that goes
  with. Snap Layouts (the flyout on hovering maximize) need `WM_NCHITTEST` to
  report `HTMAXBUTTON` and are deliberately not implemented; Win+arrow still
  snaps.
- **Nothing may block inside the hook callback.** A `WH_KEYBOARD_LL` callback
  that overruns `LowLevelHooksTimeout` (300ms by default) is dropped from the
  chain silently, and the keyboard stops arriving with no error anywhere. That
  rules out file I/O — logging included, which is why `hook.rs` logs at `trace`
  and the chord itself is logged on the worker thread. Same rule as "get off
  the tap thread" on macOS, for a different reason.
- Verified by hand on Windows 11: hotkey summon/sheathe with focus staying
  put, shell icons and launching for `.exe`, `.lnk` and folders. Drawing and
  casting by hand, the recorder, multi-monitor, the five System actions and the
  elevated-window probe are not — see the `needs-hardware` label.

## Frontend

- Tauri commands are the only bridge. The frontend calls `invoke` and listens
  for events; it never reaches the OS itself. A new command is a `#[tauri::command]`
  in `lib.rs`, an entry in the `generate_handler!` list, a typed wrapper in
  `src/api/tauri.ts`, and — if `mock.ts` needs it to preview — a stub there.
- State lives in zustand stores under `src/state/`. Components subscribe with
  selectors (`useApp((s) => s.book)`); event handlers and non-React code read a
  fresh snapshot with `useApp.getState()`. Components do not `invoke` directly
  and do not hold copies of the spellbook.
- Backend writes happen on commit, not on every keystroke: sliders and colour
  inputs keep a local draft and save on the native `change` event
  (`useNativeChange`). Imperative canvas work (the `Wand`) stays inside its component;
  other components talk to it through `forge.command`.
- **Two ways to name a chord, one set of rules.** The spellbook *builds* one in
  `ChordPicker`: nothing listens globally, so a combination the OS would swallow
  can still be entered. The overlay's new-spell panel *records* one through the
  global hook, because it is a strip over a drawn rune with no room for a keycap
  grid. Both ask `chordProblem` in `lib/chord.ts` before accepting anything, so
  neither door saves a spell that can never fire, and both turn a keydown into a
  token through `keyFromEvent` — `e.key` is the shifted glyph (Shift+`;` is `:`)
  and only `e.code` says which key it really was.
- The overlay stays framework-free: it must be light and start instantly.
  Nothing it imports may pull React in (check the `overlay-*.js` chunk after
  `vite build`); shared state goes through `zustand/vanilla` stores.
- No CSS framework. `src/controls.css` holds the tokens and the controls both
  windows share (kbd, inputs, buttons, segments); `src/styles.css` is the
  spellbook window, `overlay.html` carries its own few rules inline.
- The wand sprite in `wand/wand.ts` is duplicated in `scripts/make-readme-gif.mjs`
  so the README media matches the app. If the sprite changes, regenerate it
  (`node scripts/make-readme-gif.mjs`, needs `ffmpeg`).

## Testing

`cargo test` runs the Rust unit suite. Anything with logic and no platform
call — the recognizer, the shortcut parser, spellbook (de)serialisation —
belongs there, with a test.

`npm test` runs the frontend suite (Vitest + jsdom + Testing Library):
`lib/` helpers, `state/` stores, `api/mock.ts`, `wand/replay.ts`, and the
components against the mock backend. A new component or store change comes
with a test beside it in `__tests__/`. `npm run format` is Prettier.

The hook and the overlay need a real desktop session and are tested by hand:
draw a rune, watch the log.

**Run the app through the Tauri CLI, never bare `cargo`.** `npm run tauri dev`
or `npm run tauri build`; a plain `cargo build` (debug *or* release) produces a
binary whose web view loads `devUrl` — `http://localhost:1420` — instead of the
embedded `dist`, because the CLI is what sets the environment that decides it.
Launched on its own, that binary shows `ERR_CONNECTION_REFUSED` in a window
whose tray, hotkey and hook all work perfectly, which is a confusing half hour
if you do not know it.

CI runs, on macOS and Windows: `npm ci && npm test && npm run build`, `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings`, `cargo test`. Run the same
before opening a pull request. Clippy at `-D warnings` is deliberate: the
first warning to land makes the second invisible.

## Documents that make claims

`README.md` and `SECURITY.md` state what the app can reach: one permission,
no network, two places on disk. A change that makes any of that false changes
the document in the same commit. `CHANGELOG.md` gets a line under
*Unreleased* for anything a user would notice.

## Releasing

Bump `version` in `package.json`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml` (all three, they must agree — CI checks), move the
*Unreleased* section of `CHANGELOG.md` under the new version, commit, then
`git tag v<version> && git push --tags`. The release workflow builds macOS and
Windows bundles, attests them, and opens a **draft** release; edit the notes
and publish it by hand. Publishing triggers the Homebrew workflow, which
regenerates the cask in `ostapondo/homebrew-tap` (needs the
`HOMEBREW_TAP_TOKEN` secret; without it, `sh scripts/make-cask.sh <version>`
and commit the output there by hand).
