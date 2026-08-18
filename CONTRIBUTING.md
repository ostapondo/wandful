# Contributing

Bug reports, runes, hardware reports and code are all welcome. You do not need
a signing certificate or an Apple account, and most changes do not need the app
running.

What you can expect:

- **A real answer within 48 hours**, even if the answer is that it needs
  another week of thought. There is one maintainer, so that is a promise about
  attention, not speed. If something sits longer, it is an oversight — say so
  on the thread.
- **A change that is declined is declined with the reason.** "What this
  project will not take" below exists so that happens as rarely as possible.
- **Your branch is yours.** Review asks for changes rather than pushing them.
  If a pull request is nearly there and you would rather it were finished for
  you, say so and it will be.
- Anyone whose change lands is listed in the release notes it ships in.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Get it building

[Rust](https://rustup.rs) stable, Node 20+, and the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
git clone https://github.com/ostapondo/wandful && cd wandful
npm ci
npm test                                            # frontend unit + component tests
npm run build                                       # tsc + vite: the frontend compiles
(cd src-tauri && cargo fmt --check)                 # formatting
(cd src-tauri && cargo clippy --all-targets -- -D warnings)   # lints
(cd src-tauri && cargo test)                        # the unit suite
```

Each line is a subshell, so the block runs as written from the repository
root. That is exactly what CI runs, on macOS and Windows. If it passes, the
mechanical half of review is already done.

To see it: `npm run tauri dev`. On macOS the Accessibility grant then belongs
to whatever launched the process — Terminal, VS Code — so enable that and
restart. `npm run build:mac` produces a bundle signed with a stable local
identity (see [README.md](README.md#macos-the-accessibility-permission)) so the
grant survives rebuilds; ad-hoc signed bundles lose it every build.

## Pick something

Roughly in order of how much of the repo you have to hold in your head:

- **[needs-hardware][hw].** The single most useful thing you can send; see
  below. No code.
- **A rune.** Once the spellbook can import and export (see
  [ROADMAP.md](ROADMAP.md)), a `docs/spellbooks/` gallery is planned. Until
  then, a spellbook you like is welcome in
  [Show and tell](https://github.com/ostapondo/wandful/discussions/categories/show-and-tell).
- **The recognizer.** `src-tauri/src/recognizer.rs` is ~170 lines of pure
  Rust with no platform code. Better resampling, a `$P` or `$Q` variant,
  multi-stroke runes — each is a change with a unit test next to it and no
  desktop session required.
- **The spellbook UI.** `src/components/` (React + zustand). `npm run dev`
  previews it in a browser against `src/api/mock.ts`, so no Rust toolchain
  is needed to work on it; `npm test` runs the component tests.
- **A platform.** Linux is not built or tested. `rdev` supports X11, so a
  first report of what happens under `tauri dev` on Linux is worth an issue on
  its own.
- **The hook.** `src-tauri/src/hook.rs` and the vendored `rdev` patches. Read
  [AGENTS.md](AGENTS.md) first: the macOS threading rules there are the
  mistakes that already cost an hour each.

Issues tagged **[good first issue][gfi]** name the file to open, what done
looks like, and the command that proves it. Comment on one to claim it.

Issues tagged **[reserved][res]** are deliberately left alone: the maintainer
is not working on them and will not start. Say so on the thread and it is
yours.

[gfi]: https://github.com/ostapondo/wandful/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22
[res]: https://github.com/ostapondo/wandful/issues?q=is%3Aissue+is%3Aopen+label%3Areserved-for-contributors
[hw]: https://github.com/ostapondo/wandful/issues?q=is%3Aissue+is%3Aopen+label%3Aneeds-hardware

## Hardware nobody here has

A global mouse hook and a full-screen overlay break on setups the author
cannot see: a second monitor, a display to the left of the primary one, a
Retina screen beside a 1× one, a Windows laptop with a precision trackpad, a
drawing tablet, a mouse with the buttons swapped. None of that is reachable
from the unit suite.

A report from a desk that is not this one is worth more than a patch. The
[needs-hardware][hw] label is that list, and answering one means summoning the
wand, drawing a few runes, and pasting what happened. The bug template asks
for the three things that decide whether it can be reproduced: the OS
version, the monitor arrangement, and the app that was under the cursor.

## Sending a change

- Branch off `main`. Nothing is pushed to `main` directly, including by the
  maintainer.
- **The title is a sentence, and it does not have to be clever.** `fix: right
  click leaks to Finder while wand is hidden` is a good title. So is `Add a
  strictness preview to the spellbook`.
- Conventional commits on your branch: `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`. Imperative subject under 72 characters, body only when the why
  is not obvious. A pull request with more than one commit is squashed under
  its title.
- `cargo clippy -- -D warnings` and `cargo fmt --check` pass. Put new logic
  somewhere testable — `recognizer.rs`, `shortcut.rs` and `spells.rs` exist to
  be reachable without a desktop session — and cover it.
- Say what changed, why, and which commands you ran. A screenshot or short
  recording for anything visual.
- Match the surrounding code. Comments are for constraints the code does not
  show, not for narrating it.
- Text the user reads keeps the vocabulary in [CLAUDE.md](CLAUDE.md): a
  shortcut is a spell, the set is a spellbook, running one is a cast, the
  gesture is a swish. Warm and light, magic as a metaphor, not childish.
- A change that touches a permission, the network, or where files are written
  makes a claim in `README.md` or `SECURITY.md` false. Fix the document in the
  same commit.
- A change to `src-tauri/vendor/rdev` carries a `// PATCHED (wandful): …`
  comment saying why, so the patch survives the next upstream sync.

[AGENTS.md](AGENTS.md) is the long version: what each file owns, the macOS
threading rules, and where things have gone wrong before. It is phrased as
instructions to an agent because that is what most often reads it, but it is
the engineering guide either way. Read it before a second change, not a first.

## Reporting a bug

Use the bug template. Wandful writes a log — `~/Library/Logs/Wandful/wandful.log`
on macOS; on Windows `%HOME%\.wandful\wandful.log` if `HOME` is set, else only
stderr — and the last few lines
of it usually say what the hook thought was happening. Read it before you paste
it: it can contain the names of the keys you pressed while recording a spell.

## Security

Do not open a normal issue for something exploitable. [SECURITY.md](SECURITY.md)
has the reporting route, and describes the boundaries the app is supposed to
hold, which is the useful thing to check a finding against.

## What this project will not take

Some directions are settled, and a pull request in them will be declined
however good it is. This list exists so nobody spends a weekend on one.

- Accounts, cloud sync, telemetry, analytics or crash reporting.
- Any outbound network connection. There is none today, and an update check,
  if one is ever added, will be the only one.
- A heavier frontend stack. The spellbook is React + zustand; the overlay is
  plain TypeScript on purpose. No CSS framework, no router, no UI kit.
- Renaming the project or introducing another name for it. It is Wandful.

Everything outside that list is open, including things already built. If you
think a decision here is wrong, say so in a
[discussion](https://github.com/ostapondo/wandful/discussions) and it will get
a real answer rather than a link back to this page.

[ROADMAP.md](ROADMAP.md) has the rest, including features considered and
deliberately left out.
