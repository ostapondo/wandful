<!--
CONTRIBUTING.md has the long version. Delete any section that does not apply —
a one-line docs fix should not carry a hardware checklist.

The title does not have to be clever. `fix: trail stays on screen after a
cancelled swish` is a good title. So is `Add spellbook export`.
-->

## What changed, and why

<!-- One paragraph. The why matters more than the what; the diff has the what. -->

## What you ran

<!--
The loop CI runs, from the repository root. Paste the ones you ran:

  npm ci && npm run build
  (cd src-tauri && cargo fmt --check)
  (cd src-tauri && cargo clippy --all-targets -- -D warnings)
  (cd src-tauri && cargo test)

None of them need a signing certificate or the Accessibility permission.
-->

## Checks

- [ ] `cargo clippy -- -D warnings` and `cargo fmt --check` pass
- [ ] New logic is covered by a test in `src-tauri/src/`, or it is not the kind that can be
- [ ] Commits use `feat:` / `fix:` / `docs:` / `chore:` / `refactor:`
- [ ] If this touches a permission, the network, or where files are written, `README.md` and `SECURITY.md` still tell the truth — fixed in this PR if not
- [ ] User-facing text keeps the vocabulary: spell, spellbook, cast, swish; the product is Wandful
- [ ] A line under *Unreleased* in `CHANGELOG.md` for anything a user would notice
- [ ] Screenshots or a short recording below for anything visual

## If this touches the hook, the overlay, or casting

<!--
Delete this section unless the change decides what the right button does,
what the overlay shows, or how a shortcut reaches another app. None of that
is reachable from the unit suite, so this is the only evidence there is.

Tick what you ran, write "no hardware" against the rest:
-->

- [ ] macOS, single display
- [ ] macOS, two displays (say which is primary and their scale factors)
- [ ] Windows, single display
- [ ] Windows, two displays
- [ ] A plain right-click (no drag) still opens the context menu of the app underneath
- [ ] A shortcut cast into another app arrives in that app, not in Wandful
