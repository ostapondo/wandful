# Changelog

All notable changes to Wandful are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/) once 1.0 is out. Before that, minor versions
may change the spellbook format — the changelog says so when they do.

## [Unreleased]

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
