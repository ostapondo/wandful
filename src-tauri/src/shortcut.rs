//! Turn "Cmd+Shift+S" into real key presses via enigo.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub fn press(shortcut: &str) -> Result<(), String> {
    let (mods, key) = parse_chord(shortcut)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo: {e:?}"))?;

    // The `?`s below can leave a modifier held only until `enigo` drops at the
    // end of this function, where it releases every key it pressed. That is
    // why an early return here is not a stuck Ctrl.
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

/// "Ctrl+Shift+S" → the modifiers to hold and the key to strike. Split out so
/// the rules can be tested without a keyboard to type into.
fn parse_chord(shortcut: &str) -> Result<(Vec<Key>, Key), String> {
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
    // Every token has to parse: silently dropping one turns "Ctrl+Foo+K" into
    // Ctrl+K, which is a different shortcut fired into somebody's editor.
    let mods: Vec<Key> = mods
        .iter()
        .map(|m| parse_key(m).ok_or_else(|| format!("unknown key: {m}")))
        .collect::<Result<_, _>>()?;
    Ok((mods, key))
}

/// Punctuation as a virtual key, which is the only form that survives being
/// held down with a modifier on Windows.
///
/// `Key::Unicode` makes enigo look the character up in the layout; when that
/// fails it types the character as text instead, and text injection carries no
/// modifiers — so `Ctrl+Win+\`` arrived as a lone backtick and did nothing.
/// The OEM codes are positional and layout-independent, exactly like the
/// letter keys beside them.
#[cfg(target_os = "windows")]
fn oem_key(token: &str) -> Option<Key> {
    let vk: u32 = match token {
        "`" => 0xC0,
        "-" => 0xBD,
        "=" => 0xBB,
        "[" => 0xDB,
        "]" => 0xDD,
        ";" => 0xBA,
        "'" => 0xDE,
        "\\" => 0xDC,
        "," => 0xBC,
        "." => 0xBE,
        "/" => 0xBF,
        _ => return None,
    };
    Some(Key::Other(vk))
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
            #[cfg(target_os = "windows")]
            if let Some(k) = oem_key(&t) {
                return Some(k);
            }
            let mut chars = t.chars();
            let c = chars.next()?;
            if chars.next().is_some() {
                return None;
            }
            Key::Unicode(c)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modifiers_and_plain_keys_parse() {
        assert!(matches!(parse_key("ctrl"), Some(Key::Control)));
        assert!(matches!(parse_key("shift"), Some(Key::Shift)));
        assert!(matches!(parse_key("f5"), Some(Key::F5)));
        assert!(matches!(parse_key("escape"), Some(Key::Escape)));
        assert!(parse_key("nonsense").is_none());
    }

    #[test]
    fn win_and_cmd_are_the_same_key() {
        assert!(matches!(parse_key("win"), Some(Key::Meta)));
        assert!(matches!(parse_key("cmd"), Some(Key::Meta)));
    }

    /// The bug this exists for: as `Key::Unicode`, punctuation was typed as
    /// text and the modifiers were dropped, so the shortcut never fired.
    #[cfg(target_os = "windows")]
    #[test]
    fn punctuation_becomes_a_virtual_key_not_text() {
        for (token, vk) in [("`", 0xC0u32), ("-", 0xBD), ("/", 0xBF), (",", 0xBC)] {
            match parse_key(token) {
                Some(Key::Other(got)) => assert_eq!(got, vk, "wrong code for {token}"),
                other => panic!("{token} parsed as {other:?}, not a virtual key"),
            }
        }
    }

    /// A corrupted or hand-edited spellbook must not cast something *else*.
    #[test]
    fn an_unknown_modifier_is_an_error_not_a_shrug() {
        let e = parse_chord("Ctrl+Foo+K").unwrap_err();
        assert!(e.contains("Foo"), "{e}");
        assert!(parse_chord("").is_err());
    }

    /// The last token is the key and everything before it is a modifier —
    /// the rule `splitChord` in `src/lib/chord.ts` has to mirror.
    #[test]
    fn the_last_token_is_the_key() {
        let (mods, key) = parse_chord("CmdOrCtrl+Shift+M").expect("parses");
        assert_eq!(mods.len(), 2);
        assert!(matches!(key, Key::Unicode('m')));
    }

    /// The other half of the contract with `KEY_GROUPS` in src/lib/chord.ts:
    /// the picker offers exactly these keycaps, and every one of them has to
    /// be pressable. A key on one side only is a spell that saves and then
    /// does nothing.
    #[test]
    fn every_key_the_picker_offers_can_be_pressed() {
        let letters = ('A'..='Z').map(String::from);
        let digits = ('0'..='9').map(String::from);
        let function = (1..=12).map(|n| format!("F{n}"));
        let named = [
            "Enter",
            "Space",
            "Tab",
            "Escape",
            "Backspace",
            "Delete",
            "Home",
            "End",
            "PageUp",
            "PageDown",
            "Up",
            "Down",
            "Left",
            "Right",
            "-",
            "=",
            "[",
            "]",
            ";",
            "'",
            "\\",
            ",",
            ".",
            "/",
            "`",
        ]
        .into_iter()
        .map(String::from);
        for token in letters.chain(digits).chain(function).chain(named) {
            assert!(
                parse_key(&token).is_some(),
                "the picker offers {token:?} and nothing can press it"
            );
        }
    }

    #[test]
    fn letters_stay_unicode() {
        assert!(matches!(parse_key("k"), Some(Key::Unicode('k'))));
    }
}
