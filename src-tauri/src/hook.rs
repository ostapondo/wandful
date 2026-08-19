//! Global keyboard hook (rdev). Two jobs:
//! * while a shortcut is being recorded (spellbook form or the overlay's
//!   new-spell panel), swallow key events and report them as chords so OS /
//!   other apps' hotkeys don't fire;
//! * while the wand is out, Escape cancels casting — unless the overlay has
//!   its panel (or a native dialog) open, in which case keys pass through and
//!   the web view decides.
//!
//! Mouse handling lives in the overlay webview itself (it is hit-testable
//! while the wand is out), so no mouse interception is needed here.

use rdev::{Event, EventType, Key};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

pub enum Msg {
    /// Escape pressed while the wand is out.
    Cancel,
    /// Hook could not be installed with grab (no permission?) → degraded mode.
    HookError(String),
    /// A key chord captured while the spellbook is recording a shortcut.
    KeyChord { mods: Vec<String>, key: String },
}

#[derive(Default, Clone, Copy, PartialEq, Debug)]
struct Mods {
    meta: bool,
    ctrl: bool,
    alt: bool,
    shift: bool,
}

/// What the OS says is held down, when it can be asked.
///
/// Only ever read when a capture *starts* — see [`HookState::begin_capture`]
/// for why it is useless once one is under way.
fn os_mods() -> Option<Mods> {
    #[cfg(target_os = "windows")]
    {
        let (meta, ctrl, alt, shift) = crate::win::modifiers_down();
        Some(Mods {
            meta,
            ctrl,
            alt,
            shift,
        })
    }
    // macOS has the same failure in principle, but nothing there takes the
    // keyboard away mid-chord the way the secure desktop does, and it cannot
    // be tested from here. Left on tracked state deliberately.
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

pub struct HookState {
    /// Where the modifier state is seeded from when a capture starts.
    /// Production asks the OS where it can; tests pass a source that returns
    /// nothing, so the tracking logic stays checkable without a keyboard.
    mod_source: fn() -> Option<Mods>,
    pub wand_on: AtomicBool,
    /// While true, keyboard events are swallowed and reported as chords.
    pub capture_keys: AtomicBool,
    /// Bumped on every capture start; the safety-net timer only clears the
    /// capture it was started for.
    pub capture_gen: AtomicU64,
    /// The overlay has its new-spell panel or a native dialog up: Escape must
    /// reach it instead of sheathing the wand.
    pub overlay_panel: AtomicBool,
    mods: Mutex<Mods>,
}

impl HookState {
    pub fn new() -> Arc<Self> {
        Self::with_mod_source(os_mods)
    }
    fn with_mod_source(mod_source: fn() -> Option<Mods>) -> Arc<Self> {
        Arc::new(HookState {
            mod_source,
            wand_on: AtomicBool::new(false),
            capture_keys: AtomicBool::new(false),
            capture_gen: AtomicU64::new(0),
            overlay_panel: AtomicBool::new(false),
            mods: Mutex::new(Mods::default()),
        })
    }
    /// A state that only ever trusts what it has tracked.
    #[cfg(test)]
    fn tracked_only() -> Arc<Self> {
        Self::with_mod_source(|| None)
    }

    /// Start swallowing keys and reporting them as chords.
    ///
    /// The tracked modifier state is seeded from the OS here, and only here.
    /// It cannot be re-read later: while capturing, the hook suppresses the
    /// very events it reports, so the OS never learns those keys went down and
    /// would answer "nothing is held" for every one of them. Seeding at the
    /// start fixes the one thing tracking gets wrong — a release that never
    /// arrived, which `Ctrl+Alt+Del` arranges by handing the machine to the
    /// secure desktop — and leaves the tracking that works alone.
    pub fn begin_capture(&self) {
        if let Some(live) = (self.mod_source)() {
            *self.mods.lock().unwrap() = live;
        }
        self.capture_keys.store(true, Ordering::SeqCst);
    }
}

fn key_token(k: Key) -> Option<String> {
    use Key::*;
    let s = match k {
        KeyA => "A",
        KeyB => "B",
        KeyC => "C",
        KeyD => "D",
        KeyE => "E",
        KeyF => "F",
        KeyG => "G",
        KeyH => "H",
        KeyI => "I",
        KeyJ => "J",
        KeyK => "K",
        KeyL => "L",
        KeyM => "M",
        KeyN => "N",
        KeyO => "O",
        KeyP => "P",
        KeyQ => "Q",
        KeyR => "R",
        KeyS => "S",
        KeyT => "T",
        KeyU => "U",
        KeyV => "V",
        KeyW => "W",
        KeyX => "X",
        KeyY => "Y",
        KeyZ => "Z",
        Num0 => "0",
        Num1 => "1",
        Num2 => "2",
        Num3 => "3",
        Num4 => "4",
        Num5 => "5",
        Num6 => "6",
        Num7 => "7",
        Num8 => "8",
        Num9 => "9",
        Return => "Enter",
        Space => "Space",
        Tab => "Tab",
        Escape => "Escape",
        Backspace => "Backspace",
        Delete => "Delete",
        Home => "Home",
        End => "End",
        PageUp => "PageUp",
        PageDown => "PageDown",
        UpArrow => "Up",
        DownArrow => "Down",
        LeftArrow => "Left",
        RightArrow => "Right",
        F1 => "F1",
        F2 => "F2",
        F3 => "F3",
        F4 => "F4",
        F5 => "F5",
        F6 => "F6",
        F7 => "F7",
        F8 => "F8",
        F9 => "F9",
        F10 => "F10",
        F11 => "F11",
        F12 => "F12",
        Minus => "-",
        Equal => "=",
        LeftBracket => "[",
        RightBracket => "]",
        SemiColon => ";",
        Quote => "'",
        BackSlash => "\\",
        Comma => ",",
        Dot => ".",
        Slash => "/",
        BackQuote => "`",
        _ => return None,
    };
    Some(s.to_string())
}

/// Returns `true` to pass the event through, `false` to swallow it.
fn handle(state: &HookState, tx: &Sender<Msg>, event: &Event) -> bool {
    let (key, down) = match event.event_type {
        EventType::KeyPress(k) => (k, true),
        EventType::KeyRelease(k) => (k, false),
        _ => return true,
    };

    let capturing = state.capture_keys.load(Ordering::SeqCst);
    if capturing {
        log::info!("hook saw {key:?} down={down} token={:?}", key_token(key));
    }

    if key == Key::Escape {
        if capturing {
            // Escape while recording belongs to the recorder (a bare Escape
            // ends the recording; with modifiers it is a chord like any other),
            // and must never fall through to "sheathe the wand". Handled by
            // the capture branch below.
        } else if state.wand_on.load(Ordering::SeqCst)
            && !state.overlay_panel.load(Ordering::SeqCst)
        {
            // Escape cancels casting while the wand is out — unless the
            // overlay's panel or a dialog is up, then the web view handles it.
            if down {
                let _ = tx.send(Msg::Cancel);
            }
            return false;
        }
    }

    // Track modifiers at all times so releases that arrive after capture ends
    // don't leave stale state behind.
    let mut m = state.mods.lock().unwrap();
    match key {
        Key::MetaLeft | Key::MetaRight => m.meta = down,
        Key::ControlLeft | Key::ControlRight => m.ctrl = down,
        Key::Alt | Key::AltGr => m.alt = down,
        Key::ShiftLeft | Key::ShiftRight => m.shift = down,
        other => {
            if !capturing {
                return true;
            }
            if down {
                if let Some(key) = key_token(other) {
                    let held = *m;
                    let mut mods = vec![];
                    if held.meta {
                        mods.push("Cmd".to_string());
                    }
                    if held.ctrl {
                        mods.push("Ctrl".to_string());
                    }
                    if held.alt {
                        mods.push("Alt".to_string());
                    }
                    if held.shift {
                        mods.push("Shift".to_string());
                    }
                    let _ = tx.send(Msg::KeyChord { mods, key });
                    // one chord per capture — never leave the keyboard swallowed
                    state.capture_keys.store(false, Ordering::SeqCst);
                }
            }
        }
    }
    !capturing
}

pub fn spawn(state: Arc<HookState>, tx: Sender<Msg>) {
    std::thread::Builder::new()
        .name("wand-hook".into())
        .spawn(move || {
            let st = state.clone();
            let tx2 = tx.clone();
            let cb = move |event: Event| {
                if handle(&st, &tx2, &event) {
                    Some(event)
                } else {
                    None
                }
            };
            log::info!("installing keyboard hook");
            #[cfg(target_os = "windows")]
            let res = rdev::grab_keys(cb);
            #[cfg(not(target_os = "windows"))]
            let res = rdev::grab(cb);
            // `grab` pumps messages for the life of the process, so returning
            // at all means the hook is gone: no chord will ever be reported and
            // Escape will not sheathe the wand. Say so — this went unnoticed
            // once already because only the error arm was reported.
            if res.is_ok() {
                log::error!("keyboard hook ended on its own — shortcuts can no longer be recorded");
                let _ = tx.send(Msg::HookError(
                    "The keyboard hook stopped. Restart Wandful to record shortcuts again.".into(),
                ));
            }
            if let Err(e) = res {
                log::error!(
                    "grab failed: {e:?} — falling back to listen (keys can't be swallowed)"
                );
                let _ = tx.send(Msg::HookError(format!("{e:?}")));
                let st = state.clone();
                let tx3 = tx.clone();
                if let Err(e) = rdev::listen(move |event: Event| {
                    handle(&st, &tx3, &event);
                }) {
                    log::error!("listen failed too: {e:?}");
                }
            }
        })
        .expect("spawn hook thread");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Receiver};
    use std::time::SystemTime;

    fn ev(key: Key, down: bool) -> Event {
        Event {
            time: SystemTime::now(),
            name: None,
            event_type: if down {
                EventType::KeyPress(key)
            } else {
                EventType::KeyRelease(key)
            },
        }
    }
    fn setup() -> (Arc<HookState>, Sender<Msg>, Receiver<Msg>) {
        let (tx, rx) = channel();
        (HookState::tracked_only(), tx, rx)
    }
    fn chord(rx: &Receiver<Msg>) -> Option<(Vec<String>, String)> {
        match rx.try_recv() {
            Ok(Msg::KeyChord { mods, key }) => Some((mods, key)),
            _ => None,
        }
    }

    #[test]
    fn idle_keys_pass_through() {
        let (st, tx, rx) = setup();
        assert!(handle(&st, &tx, &ev(Key::KeyA, true)));
        assert!(handle(&st, &tx, &ev(Key::Escape, true)));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn escape_sheathes_the_wand_when_out() {
        let (st, tx, rx) = setup();
        st.wand_on.store(true, Ordering::SeqCst);
        assert!(!handle(&st, &tx, &ev(Key::Escape, true)));
        assert!(matches!(rx.try_recv(), Ok(Msg::Cancel)));
        // the release is swallowed too, silently
        assert!(!handle(&st, &tx, &ev(Key::Escape, false)));
        assert!(rx.try_recv().is_err());
        // other keys still reach the overlay (typing a spell name)
        assert!(handle(&st, &tx, &ev(Key::KeyN, true)));
    }

    #[test]
    fn escape_reaches_the_overlay_while_its_panel_is_open() {
        let (st, tx, rx) = setup();
        st.wand_on.store(true, Ordering::SeqCst);
        st.overlay_panel.store(true, Ordering::SeqCst);
        assert!(handle(&st, &tx, &ev(Key::Escape, true)));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn recording_swallows_and_reports_a_chord_once() {
        let (st, tx, rx) = setup();
        st.capture_keys.store(true, Ordering::SeqCst);
        assert!(!handle(&st, &tx, &ev(Key::MetaLeft, true)));
        assert!(!handle(&st, &tx, &ev(Key::ShiftLeft, true)));
        assert!(!handle(&st, &tx, &ev(Key::KeyS, true)));
        assert_eq!(
            chord(&rx),
            Some((vec!["Cmd".into(), "Shift".into()], "S".into()))
        );
        // one chord per capture: the keyboard is released right away
        assert!(!st.capture_keys.load(Ordering::SeqCst));
        assert!(handle(&st, &tx, &ev(Key::KeyS, false)));
        assert!(handle(&st, &tx, &ev(Key::ShiftLeft, false)));
        assert!(handle(&st, &tx, &ev(Key::MetaLeft, false)));
        // modifier releases after capture ended left no stale state behind
        st.capture_keys.store(true, Ordering::SeqCst);
        assert!(!handle(&st, &tx, &ev(Key::KeyZ, true)));
        assert_eq!(chord(&rx), Some((vec![], "Z".into())));
    }

    /// The bug `Ctrl+Alt+Del` causes: Ctrl and Alt go down, the kernel takes
    /// Del, the secure desktop takes the machine, and the two releases happen
    /// where no hook can see them. Tracked state alone would then put
    /// `Ctrl+Alt` on every chord for the rest of the session.
    #[cfg(target_os = "windows")]
    #[test]
    fn a_release_the_hook_never_saw_does_not_haunt_later_chords() {
        let (tx, rx) = channel();
        let st = HookState::new(); // the real, OS-backed source
        st.begin_capture();
        handle(&st, &tx, &ev(Key::ControlLeft, true));
        handle(&st, &tx, &ev(Key::Alt, true));
        // ... the releases happen on the secure desktop and never arrive ...
        // The user gives up and records something else: a fresh capture, which
        // is where the stale state has to be thrown away.
        st.begin_capture();
        handle(&st, &tx, &ev(Key::KeyD, true));
        let (mods, key) = chord(&rx).expect("a chord was reported");
        assert_eq!(key, "D");
        assert!(
            mods.is_empty(),
            "stale modifiers leaked into the chord: {mods:?}"
        );
    }

    #[test]
    fn escape_while_recording_ends_the_recording_not_the_wand() {
        let (st, tx, rx) = setup();
        st.wand_on.store(true, Ordering::SeqCst);
        st.capture_keys.store(true, Ordering::SeqCst);
        assert!(!handle(&st, &tx, &ev(Key::Escape, true)));
        assert_eq!(chord(&rx), Some((vec![], "Escape".into())));
        assert!(!st.capture_keys.load(Ordering::SeqCst));
        assert!(rx.try_recv().is_err(), "no Cancel was sent");
    }
}
