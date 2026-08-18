//! Turn "Cmd+Shift+S" into real key presses via enigo.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub fn press(shortcut: &str) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e:?}"))?;
    let tokens: Vec<&str> = shortcut
        .split('+')
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .collect();
    if tokens.is_empty() {
        return Err("empty shortcut".into());
    }
    let (mods, key) = tokens.split_at(tokens.len() - 1);
    let key = parse_key(key[0]).ok_or_else(|| format!("unknown key: {}", key[0]))?;
    let mods: Vec<Key> = mods.iter().filter_map(|m| parse_key(m)).collect();

    for m in &mods {
        enigo
            .key(*m, Direction::Press)
            .map_err(|e| format!("{e:?}"))?;
    }
    enigo
        .key(key, Direction::Click)
        .map_err(|e| format!("{e:?}"))?;
    for m in mods.iter().rev() {
        enigo
            .key(*m, Direction::Release)
            .map_err(|e| format!("{e:?}"))?;
    }
    Ok(())
}

fn parse_key(token: &str) -> Option<Key> {
    let t = token.to_ascii_lowercase();
    Some(match t.as_str() {
        "cmd" | "command" | "meta" | "super" | "win" => Key::Meta,
        "cmdorctrl" | "commandorcontrol" => {
            if cfg!(target_os = "macos") {
                Key::Meta
            } else {
                Key::Control
            }
        }
        "ctrl" | "control" => Key::Control,
        "alt" | "option" | "opt" => Key::Alt,
        "shift" => Key::Shift,
        "enter" | "return" => Key::Return,
        "space" => Key::Space,
        "tab" => Key::Tab,
        "esc" | "escape" => Key::Escape,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "up" | "arrowup" => Key::UpArrow,
        "down" | "arrowdown" => Key::DownArrow,
        "left" | "arrowleft" => Key::LeftArrow,
        "right" | "arrowright" => Key::RightArrow,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        _ => {
            let mut chars = t.chars();
            let c = chars.next()?;
            if chars.next().is_some() {
                return None;
            }
            Key::Unicode(c)
        }
    })
}
