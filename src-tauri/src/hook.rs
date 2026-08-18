//! Global keyboard hook (rdev). Two jobs:
//!  * while the spellbook records a shortcut, swallow key events and report
//!    them as chords so OS / other apps' hotkeys don't fire;
//!  * while the wand is out, Escape cancels casting.
//! Mouse handling lives in the overlay webview itself (it is hit-testable
//! while the wand is out), so no mouse interception is needed here.

use rdev::{Event, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};
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

#[derive(Default)]
struct Mods {
    meta: bool,
    ctrl: bool,
    alt: bool,
    shift: bool,
}

pub struct HookState {
    pub wand_on: AtomicBool,
    /// While true, keyboard events are swallowed and reported as chords.
    pub capture_keys: AtomicBool,
    mods: Mutex<Mods>,
}

impl HookState {
    pub fn new() -> Arc<Self> {
        Arc::new(HookState {
            wand_on: AtomicBool::new(false),
            capture_keys: AtomicBool::new(false),
            mods: Mutex::new(Mods::default()),
        })
    }
}

fn key_token(k: Key) -> Option<String> {
    use Key::*;
    let s = match k {
        KeyA => "A", KeyB => "B", KeyC => "C", KeyD => "D", KeyE => "E", KeyF => "F", KeyG => "G",
        KeyH => "H", KeyI => "I", KeyJ => "J", KeyK => "K", KeyL => "L", KeyM => "M", KeyN => "N",
        KeyO => "O", KeyP => "P", KeyQ => "Q", KeyR => "R", KeyS => "S", KeyT => "T", KeyU => "U",
        KeyV => "V", KeyW => "W", KeyX => "X", KeyY => "Y", KeyZ => "Z",
        Num0 => "0", Num1 => "1", Num2 => "2", Num3 => "3", Num4 => "4",
        Num5 => "5", Num6 => "6", Num7 => "7", Num8 => "8", Num9 => "9",
        Return => "Enter", Space => "Space", Tab => "Tab", Escape => "Escape",
        Backspace => "Backspace", Delete => "Delete", Home => "Home", End => "End",
        PageUp => "PageUp", PageDown => "PageDown",
        UpArrow => "Up", DownArrow => "Down", LeftArrow => "Left", RightArrow => "Right",
        F1 => "F1", F2 => "F2", F3 => "F3", F4 => "F4", F5 => "F5", F6 => "F6",
        F7 => "F7", F8 => "F8", F9 => "F9", F10 => "F10", F11 => "F11", F12 => "F12",
        Minus => "-", Equal => "=", LeftBracket => "[", RightBracket => "]",
        SemiColon => ";", Quote => "'", BackSlash => "\\", Comma => ",", Dot => ".", Slash => "/",
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

    // Escape cancels casting while the wand is out.
    if state.wand_on.load(Ordering::SeqCst) && key == Key::Escape {
        if down {
            let _ = tx.send(Msg::Cancel);
        }
        return false;
    }

    // Track modifiers at all times so releases that arrive after capture ends
    // don't leave stale state behind.
    let mut m = state.mods.lock().unwrap();
    let capturing = state.capture_keys.load(Ordering::SeqCst);
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
                    let mut mods = vec![];
                    if m.meta { mods.push("Cmd".to_string()); }
                    if m.ctrl { mods.push("Ctrl".to_string()); }
                    if m.alt { mods.push("Alt".to_string()); }
                    if m.shift { mods.push("Shift".to_string()); }
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
            let res = rdev::grab(move |event: Event| {
                if handle(&st, &tx2, &event) { Some(event) } else { None }
            });
            if let Err(e) = res {
                log::error!("grab failed: {e:?} — falling back to listen (keys can't be swallowed)");
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
