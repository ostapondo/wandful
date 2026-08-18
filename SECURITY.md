# Security

Wandful asks for one thing on macOS: **Accessibility**. That is the permission
that lets an app watch every mouse and key event on the machine and synthesize
new ones, and it is a lot to hand a small app you found on the internet. This
page is what you can check instead of trusting it, and where the checks stop.

## What Wandful can do

| | |
| --- | --- |
| **Accessibility (macOS)** | Watch global mouse and keyboard events, so a right-button drag can become a gesture; and synthesize key presses, so a spell can cast a shortcut. Granted by you, revocable in System Settings → Privacy & Security. Without it the app runs listen-only |
| **Windows** | Low-level mouse and keyboard hooks need no permission. Key synthesis cannot reach a window running as Administrator unless Wandful does too |
| **Disk** | The spellbook, `spellbook.json`, in the app config directory; a log file, `~/Library/Logs/Wandful/wandful.log` on macOS or `%HOME%\.wandful\wandful.log` on Windows when `HOME` is set (otherwise the log goes to stderr only); nothing else |
| **Processes** | A spell can open an app or path you chose, via `open` (macOS) or `start` (Windows). Only paths you saved in the spellbook |
| **Network** | None. Wandful makes no outbound connections and listens on no port |

## What it does not do

There is no update check, no telemetry, no crash reporting, no login item, no
helper daemon, no privileged tool, no installer script that runs anything. It
is one binary in one bundle. Uninstalling is quitting it and dragging it to the
trash; the config directory and the log directory are the only things it
leaves behind.

The Tauri capability file, [`src-tauri/capabilities/default.json`](src-tauri/capabilities/default.json),
lists every host API the two web views are allowed to call. Anything not on
that list is unreachable from the frontend. It is short and worth reading.

`cargo tree` shows what the binary is built from. The global hook is a vendored
copy of [`rdev`](https://github.com/Narsil/rdev) with a few patches marked
`PATCHED` inline; the rest are the Tauri stack, `enigo` for key synthesis, and
serde. There is no HTTP client in the dependency graph.

**The checkable half of this page is meant to stay checkable.** A pull request
that adds a network dependency, a permission, a port, or a new place files are
written also has to change this page, in the same commit. Review looks for
that.

## Where a build came from

Releases are built by [the release workflow](.github/workflows/release.yml) on
GitHub's runners, never on a laptop, and each artefact leaves with a provenance
attestation GitHub signs:

```sh
gh attestation verify Wandful_<version>_aarch64.dmg -R ostapondo/wandful
```

It prints the commit, the workflow file and the run that produced the file. A
build made anywhere else, or from a source tree that is not this repository,
cannot produce that statement.

macOS builds are signed with a self-signed certificate, not an Apple Developer
ID. Gatekeeper does not trust it, so first launch is a trip through System
Settings → Privacy & Security → **Open Anyway**. What the certificate does do
is keep the identity stable across versions, which is what lets macOS keep the
Accessibility grant from one release to the next. Notarization would remove
the warning and add Apple's malware scan; it needs a paid developer account
this project does not have.

Windows builds are unsigned. SmartScreen will say so.

## Reporting

Do not open a public issue for something exploitable — a way to cast a spell
without the user drawing one, a spellbook file that makes the app run
something it should not, a way for a web page to reach the Tauri commands.

Use [GitHub's private vulnerability reporting](https://github.com/ostapondo/wandful/security/advisories/new)
on this repository. You will get an acknowledgement within 48 hours and a fix
or a reasoned answer within two weeks; if it takes longer you will hear why.
Credit goes to you in the release notes unless you would rather it did not.
