# Roadmap

What is being built, roughly in order, and what was considered and left out.
None of it is a promise; an issue is where a line here becomes one.

## Now (0.1 → 0.2)

- **Windows.** The code builds and the overlay, hook and casting are written
  for it, but nobody has run it on a real Windows machine yet, so 0.0.1 ships
  for macOS only. A report from Windows hardware brings it back into CI and
  the release matrix — see the `needs-hardware` label.
- **Signed releases from CI.** macOS `.dmg` built by GitHub Actions on a tag,
  with provenance attestations. The workflow is in place.
- **Spellbook import / export.** One JSON file, so a spellbook can be shared,
  and a `docs/spellbooks/` gallery can exist.
- **Per-app spellbooks.** The same rune casts a different spell depending on
  the frontmost app.
- **Rune preview in the spellbook.** Draw, and see which existing spell it
  would match at the current strictness before saving.

## Next

- **Multi-stroke runes.** `$P`/`$Q` recognizers handle strokes in any order;
  the current `$1` is single-stroke.
- **More actions.** Type a text snippet, run a shell command (off by default,
  with a warning), open a URL.
- **Multi-monitor overlay.** The overlay covers the primary monitor today.
- **Linux.** `rdev` supports X11 and Tauri supports Linux; nobody has run it.
  A report is the first step.

## Not planned

- **Accounts, sync, telemetry.** Spells live in a JSON file you own.
- **A framework for the frontend.** Two small windows in vanilla TypeScript.
- **Trigger on left-drag or middle-drag by default.** Left-drag is how every
  app selects and moves; taking it over globally is the kind of thing that
  gets an app uninstalled. Configurable trigger buttons may come; the default
  stays right.
- **A "macro recorder" that replays arbitrary input.** Wandful casts one
  shortcut or opens one app per rune. Sequences are a different product.

## Considered

- **Notarization.** Removes the Gatekeeper warning; needs a paid Apple
  Developer account. Would be taken if the project ever had one.
