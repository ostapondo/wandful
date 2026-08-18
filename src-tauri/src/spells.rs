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
    #[serde(default)]
    pub shortcut: String,
    /// "shortcut" (default) or "app"
    #[serde(default = "default_action")]
    pub action: String,
    /// Path to the application to launch when `action == "app"`
    #[serde(default)]
    pub app_path: String,
    /// Display name of that application
    #[serde(default)]
    pub app_name: String,
    pub points: Vec<Point>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}
fn default_action() -> String {
    "shortcut".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Book {
    pub spells: Vec<Spell>,
    #[serde(default = "default_threshold")]
    pub threshold: f64,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    /// Overlay veil colour (#rrggbb) and opacity 0..1
    #[serde(default = "default_overlay_color")]
    pub overlay_color: String,
    #[serde(default = "default_overlay_opacity")]
    pub overlay_opacity: f64,
}
fn default_overlay_color() -> String {
    "#050506".into()
}
fn default_overlay_opacity() -> f64 {
    0.9
}

fn default_threshold() -> f64 {
    0.80
}
fn default_hotkey() -> String {
    "CmdOrCtrl+Shift+M".into()
}

impl Book {
    /// Restore every setting (not the spells) to its default.
    pub fn reset_settings(&mut self) {
        self.threshold = default_threshold();
        self.hotkey = default_hotkey();
        self.overlay_color = default_overlay_color();
        self.overlay_opacity = default_overlay_opacity();
    }

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
        Book {
            spells: vec![],
            threshold: default_threshold(),
            hotkey: default_hotkey(),
            overlay_color: default_overlay_color(),
            overlay_opacity: default_overlay_opacity(),
        }
    }

    pub fn templates(&self) -> Vec<Template> {
        self.spells
            .iter()
            .filter(|s| s.enabled)
            .filter_map(|s| Template::new(s.id.clone(), &s.points))
            .collect()
    }
}
