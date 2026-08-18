//! Spellbook persistence: gestures ("runes") mapped to keyboard shortcuts.

use crate::recognizer::{Point, Template};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spell {
    pub id: String,
    pub name: String,
    /// e.g. "Cmd+Shift+S" / "Ctrl+Z" — tokens joined by '+'
    pub shortcut: String,
    pub points: Vec<Point>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Book {
    pub spells: Vec<Spell>,
    #[serde(default = "default_threshold")]
    pub threshold: f64,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
}

fn default_threshold() -> f64 {
    0.80
}
fn default_hotkey() -> String {
    "CmdOrCtrl+Shift+M".into()
}

impl Book {
    pub fn load(path: &PathBuf) -> Book {
        match fs::read_to_string(path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Book::starter()),
            Err(_) => Book::starter(),
        }
    }

    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let s = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, s).map_err(|e| e.to_string())
    }

    /// A fresh spellbook is empty — the user picks their own runes and shortcuts.
    pub fn starter() -> Book {
        Book { spells: vec![], threshold: default_threshold(), hotkey: default_hotkey() }
    }

    pub fn templates(&self) -> Vec<Template> {
        self.spells
            .iter()
            .filter(|s| s.enabled)
            .filter_map(|s| Template::new(s.id.clone(), &s.points))
            .collect()
    }
}
