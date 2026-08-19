# Roadmap

What is being built, roughly in order, and what was considered and left out.
None of it is a promise; an issue is where a line here becomes one.

## Now (0.1 → 0.2)

- **Windows.** Back in CI and the release matrix, and run on Windows 11 at
  last: the hotkey summons and sheathes the overlay without taking focus from
  the app underneath, the shell supplies icons and opens apps for `.exe`,
  `.lnk` and folders alike, and a cast at an elevated window says so rather
  than failing silently. Drawing a rune by hand, the shortcut recorder and
  anything with a second monitor are still untested there — see the
  `needs-hardware` label.
- **Homebrew proper.** The cask lives in `ostapondo/tap` for now; the main
  `homebrew/cask` tap accepts a project once it has 75 GitHub stars (or 30
  forks / watchers), and the same file moves there.
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
