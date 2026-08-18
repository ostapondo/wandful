# Agent rules

Rules for AI agents working in this repo. Humans: this is also the engineering
guide, so read it before a second change. Naming and tone rules are in
[CLAUDE.md](CLAUDE.md) and apply everywhere.

## Layout

- `src/` — the frontend, vanilla TypeScript, no framework. Two entry points:
  `overlay.ts` (the transparent full-screen window that draws the wand) and
  `settings.ts` (the spellbook). `wand.ts` is the sprite and trail both share.
  `mock.ts` stands in for Tauri when `vite` runs alone, so the UI previews in
  a browser with no Rust toolchain.
- `src-tauri/src/` — the app. `lib.rs` is the wiring: windows, tray, hotkey,
  commands, the worker thread. Behaviour lives beside it in one file per
  concern: `hook.rs` (global keyboard hook state), `recognizer.rs` (`$1`),
  `spells.rs` (spellbook file), `shortcut.rs` (string → key presses).
- `src-tauri/vendor/rdev/` — a vendored copy of `rdev` 0.5.3 with local
  patches, pulled in as a path dependency. Every patch carries a
  `// PATCHED (wandful): …` comment saying why. There are two today: macOS
  drag events are delivered (`LeftMouseDragged` / `RightMouseDragged` /
  `OtherMouseDragged` in the tap mask and the event match), and key events
  never resolve their Unicode name on the tap thread (see "macOS threading").
- `src-tauri/capabilities/default.json` — the whole list of host APIs the web
  views may call. Adding a Tauri plugin call means adding a line here, and
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
- **The overlay must be click-through while the wand is hidden** and
  hit-testable while it is out; `set_ignore_cursor_events` is the switch and
  the overlay is the only window that flips it. A regression here looks like
  "the app ate my right click" and is the first thing to check.
- **The Accessibility grant is tied to the code signature.** Ad-hoc signed
  bundles get a new signature every build and lose the grant; `scripts/sign-mac.sh`
  re-signs with a stable local identity so it survives. In `tauri dev` the
  grant belongs to the parent process (Terminal, VS Code). If the wand draws
  but shortcuts do not fire, this is why, not the code.

## Windows

- Low-level hooks need no permission but cannot see or reach an
  elevated window unless Wandful is elevated too. Say so, do not retry.
- The overlay covers the primary monitor. Multi-monitor is on the roadmap;
  a change there touches `create_overlay` in `lib.rs` and nothing else.

## Frontend

- Tauri commands are the only bridge. The frontend calls `invoke` and listens
  for events; it never reaches the OS itself. A new command is a `#[tauri::command]`
  in `lib.rs`, an entry in the `generate_handler!` list, and — if `mock.ts`
  needs it to preview — a stub there.
- No framework, no bundler plugins beyond what Vite ships, no CSS framework.
  Two windows do not need one.
- The wand sprite in `wand.ts` is duplicated in `scripts/make-readme-gif.mjs`
  and `scripts/make-readme-png.mjs` so the README media matches the app. If
  the sprite changes, regenerate both (`node scripts/make-readme-gif.mjs`
  needs `ffmpeg`).

## Testing

`cargo test` runs the unit suite. Anything with logic and no platform call —
the recognizer, the shortcut parser, spellbook (de)serialisation — belongs
there, with a test. The hook and the overlay need a real desktop session and
are tested by hand: draw a rune, watch the log.

CI runs, on macOS and Windows: `npm ci && npm run build`, `cargo fmt --check`,
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
and publish it by hand.
