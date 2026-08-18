# Changelog

All notable changes to Wandful are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/) once 1.0 is out. Before that, minor versions
may change the spellbook format — the changelog says so when they do.

## [Unreleased]

### Added
- Pixel-art wand that follows the cursor; hold the right mouse button and draw
  a rune, release to cast the bound shortcut.
- `$1 Unistroke` recognizer with a per-spellbook strictness setting.
- Spellbook window: draw a rune, name it, record a shortcut or pick an app to
  open, save. Spells live in `spellbook.json` in the app config directory.
- Tray icon: left-click summons the wand, right-click opens the menu.
- Global hotkey `⌘⇧M` / `Ctrl+Shift+M` to toggle the wand.
- macOS: Accessibility check with a banner and a listen-only fallback; helper
  scripts to sign builds with a stable self-signed identity so the permission
  survives rebuilds.
- Windows: full-screen click-through overlay on the primary monitor.
- Open-source scaffolding: CI, release workflow, issue and PR templates,
  contributing guide, security policy, code of conduct.

[Unreleased]: https://github.com/ostapondo/wandful/commits/main
