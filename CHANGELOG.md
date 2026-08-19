# Changelog

All notable changes to Wandful are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/) once 1.0 is out. Before that, minor versions
may change the spellbook format — the changelog says so when they do.

## [Unreleased]

### Added
- Homebrew cask: `brew install --cask ostapondo/tap/wandful`. The tap is
  updated by CI when a release is published (`scripts/make-cask.sh` by hand).
- Windows is built, tested and shipped again: `windows-latest` is back in CI
  and `.exe` / `.msi` installers are back in the release matrix.
- Windows: a cast aimed at a window running as administrator says so instead
  of failing silently — a normal-privilege hook cannot reach one.
- Windows: a third kind of spell, **System** — lock the screen, Task Manager,
  switch user, sign out, sleep. `Ctrl+Alt+Del` cannot be recorded or sent by
  any application, so these call the APIs behind its menu items instead.
- Windows: the spellbook has one title bar instead of two. The native frame is
  gone and the app's own bar carries minimize, maximize and close, the way the
  macOS window already overlays its traffic lights.

### Changed
- Shortcuts are **built, not captured**. Clicking the shortcut field opens a
  panel: click the keys, or press the combination, and each one appears as a
  chip you can remove. Nothing listens globally, so combinations the OS acts on
  or hides from hooks can be entered like any other — and one that could never
  be delivered is refused with the reason instead of saved as a dead spell.

### Fixed
- Windows: a shortcut whose key was punctuation (`` ` ``, `-`, `/`, …) was
  typed as text instead of pressed, so its modifiers were dropped and the
  shortcut never fired. Those keys are sent as virtual keys now.
- Windows: a **System** spell could not be saved — the backend asked every
  spell that was not an app for a shortcut, and a system spell has none.
- Windows: the keyboard hook never received a single key. `rdev`'s Windows
  `grab` pumped one message instead of looping, so the thread that owned the
  hook ended and Windows unhooked it — silently, because only the error arm was
  reported. It also installed a mouse hook that fires on every pointer move,
  which is enough to have the whole chain dropped for overrunning
  `LowLevelHooksTimeout`. Both are patched in `vendor/rdev`.
- Recording a shortcut no longer goes quietly deaf. The keyboard is released
  after 30 seconds rather than 8, and when that happens the button stops
  saying "Press keys…" instead of sitting over a keyboard nobody is reading.
- Windows: pressing `Ctrl+Alt+Del` while recording a shortcut no longer leaves
  `Ctrl` and `Alt` stuck on every chord recorded afterwards. The kernel takes
  the sequence and the two releases happen on the secure desktop, where no hook
  can see them. Each recording now seeds its modifier state from the OS before
  it starts listening.

### Changed
- Windows: the app underneath gets focus back after the overlay's new-spell
  panel closes, so the next cast lands where it was aimed rather than in
  Wandful.
- Windows: app icons come from the shell at up to 256px, instead of a 32px
  icon fetched by starting PowerShell once per app.
- Windows: opening an app no longer flashes a console window on the way.
- Windows: the status line says "tray icon" rather than "menu-bar icon".
- Windows: the log moved to `%LOCALAPPDATA%\Wandful\logs\wandful.log`, which
  exists whether or not a shell set `HOME`.

## [0.0.1] — 2026-08-18

First tagged build. Everything below is new.

### Added
- Pixel-art wand that follows the cursor: summon it, hold a mouse button and
  draw a rune, release to cast the bound shortcut.
- `$1 Unistroke` recognizer with a per-spellbook strictness setting.
- Spellbook window: draw a rune, name it, record a shortcut or pick an app to
  open, save. Spells live in `spellbook.json` in the app config directory.
- Tray icon: left-click summons the wand, right-click opens the menu.
- Global hotkey `⌘⇧M` / `Ctrl+Shift+M` to toggle the wand.
- macOS: Accessibility check with a banner and a listen-only fallback; helper
  scripts to sign builds with a stable self-signed identity so the permission
  survives rebuilds.
- Windows: compiles and is wired up (overlay, hook, casting), but is not part
  of the release until it has been run on real hardware — see ROADMAP.md.
- Open-source scaffolding: CI, release workflow, issue and PR templates,
  contributing guide, security policy, code of conduct.
- Bind a rune from the overlay: when a stroke matches nothing, the wand offers
  "Make it a spell" (or `N`) and a small panel names and binds it on the spot.
  Cast and fizzle outcomes show as a quiet chip under the stroke; the rune
  itself is drawn on the same pixel grid as the sparks.

[Unreleased]: https://github.com/ostapondo/wandful/compare/v0.0.1...main
[0.0.1]: https://github.com/ostapondo/wandful/releases/tag/v0.0.1
