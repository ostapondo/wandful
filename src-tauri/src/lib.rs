mod hook;
mod recognizer;
mod shortcut;
mod spells;

use hook::{HookState, Msg};
use recognizer::Point;
use serde::Serialize;
use spells::{Book, Spell};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub struct AppState {
    book: Mutex<Book>,
    path: PathBuf,
    hook: Arc<HookState>,
    tray_toggle: Mutex<Option<MenuItem<tauri::Wry>>>,
    /// pid of the app that was frontmost when the wand was summoned (macOS)
    prev_app: Mutex<Option<i32>>,
    icon_cache: Mutex<std::collections::HashMap<String, Option<String>>>,
}

#[derive(Serialize, Clone)]
struct Platform {
    os: String,
    physical_coords: bool,
}

#[derive(Serialize, Clone)]
struct CastResult {
    matched: bool,
    id: Option<String>,
    name: Option<String>,
    shortcut: Option<String>,
    /// "shortcut" | "app"
    action: Option<String>,
    app_path: Option<String>,
    app_name: Option<String>,
    score: f64,
}

#[derive(Serialize, Clone)]
struct WandMode {
    on: bool,
}

#[derive(Serialize, Clone)]
struct KeyChord {
    mods: Vec<String>,
    key: String,
}

// ---------- commands ----------

#[tauri::command]
fn get_platform() -> Platform {
    Platform {
        os: std::env::consts::OS.into(),
        physical_coords: cfg!(target_os = "windows"),
    }
}

#[tauri::command]
fn get_book(state: State<AppState>) -> Book {
    state.book.lock().unwrap().clone()
}

#[tauri::command]
fn save_spell(app: AppHandle, state: State<AppState>, mut spell: Spell) -> Result<Book, String> {
    if spell.points.len() < 4 {
        return Err("Draw a longer rune".into());
    }
    if spell.name.trim().is_empty() {
        return Err("Give the spell a name".into());
    }
    if spell.action == "app" {
        if spell.app_path.trim().is_empty() {
            return Err("Choose an application".into());
        }
    } else if spell.shortcut.trim().is_empty() {
        return Err("Choose a shortcut".into());
    }
    log::info!(
        "save_spell {} ({} pts) -> {}",
        spell.name,
        spell.points.len(),
        spell.shortcut
    );
    let mut book = state.book.lock().unwrap();
    if spell.id.is_empty() {
        spell.id = uuid::Uuid::new_v4().to_string();
    }
    if let Some(existing) = book.spells.iter_mut().find(|s| s.id == spell.id) {
        *existing = spell;
    } else {
        book.spells.push(spell);
    }
    book.save(&state.path)?;
    // The overlay can save too (binding a rune nobody matched); keep the
    // spellbook window in step.
    let _ = app.emit_to("main", "book:changed", book.clone());
    Ok(book.clone())
}

#[tauri::command]
fn delete_spell(state: State<AppState>, id: String) -> Result<Book, String> {
    let mut book = state.book.lock().unwrap();
    book.spells.retain(|s| s.id != id);
    book.save(&state.path)?;
    Ok(book.clone())
}

#[tauri::command]
fn set_threshold(state: State<AppState>, threshold: f64) -> Result<Book, String> {
    let mut book = state.book.lock().unwrap();
    book.threshold = threshold.clamp(0.5, 0.98);
    book.save(&state.path)?;
    Ok(book.clone())
}

#[derive(serde::Deserialize)]
struct SettingsPatch {
    overlay_color: Option<String>,
    overlay_opacity: Option<f64>,
    hotkey: Option<String>,
}

#[derive(Serialize, Clone)]
struct OverlayStyle {
    color: String,
    opacity: f64,
}

/// "Cmd+Shift+M" (our chord format) → "Command+Shift+M" (global-shortcut format)
fn to_hotkey_string(chord: &str) -> String {
    chord
        .split('+')
        .map(|t| match t {
            "Cmd" => "Command",
            "Ctrl" => "Control",
            "Up" => "ArrowUp",
            "Down" => "ArrowDown",
            "Left" => "ArrowLeft",
            "Right" => "ArrowRight",
            "Esc" => "Escape",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn register_hotkey(app: &AppHandle, chord: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let sc: Shortcut = to_hotkey_string(chord)
        .parse()
        .map_err(|e| format!("{e}"))?;
    gs.on_shortcut(sc, |app, _sc, ev| {
        if ev.state == ShortcutState::Pressed {
            // The new-spell panel holds something the user typed; the hotkey
            // does not throw it away (Esc, Cancel and the tray still do).
            if app
                .state::<AppState>()
                .hook
                .overlay_panel
                .load(Ordering::SeqCst)
            {
                return;
            }
            toggle_wand(app);
        }
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_settings(
    app: AppHandle,
    state: State<AppState>,
    patch: SettingsPatch,
) -> Result<Book, String> {
    let mut book = state.book.lock().unwrap();
    if let Some(c) = patch.overlay_color {
        book.overlay_color = c;
    }
    if let Some(o) = patch.overlay_opacity {
        book.overlay_opacity = o.clamp(0.0, 1.0);
    }
    if let Some(h) = patch.hotkey {
        if h != book.hotkey {
            let old = book.hotkey.clone();
            let _ = app.global_shortcut().unregister_all();
            match register_hotkey(&app, &h) {
                Ok(()) => book.hotkey = h,
                Err(e) => {
                    let _ = register_hotkey(&app, &old);
                    return Err(format!("Can't use that hotkey: {e}"));
                }
            }
        }
    }
    book.save(&state.path)?;
    let _ = app.emit_to(
        "overlay",
        "overlay:style",
        OverlayStyle {
            color: book.overlay_color.clone(),
            opacity: book.overlay_opacity,
        },
    );
    let _ = app.emit_to("main", "book:changed", book.clone());
    Ok(book.clone())
}

#[tauri::command]
fn reset_settings(app: AppHandle, state: State<AppState>) -> Result<Book, String> {
    let mut book = state.book.lock().unwrap();
    book.reset_settings();
    let _ = app.global_shortcut().unregister_all();
    if let Err(e) = register_hotkey(&app, &book.hotkey) {
        log::error!("hotkey re-register failed: {e}");
    }
    book.save(&state.path)?;
    let _ = app.emit_to(
        "overlay",
        "overlay:style",
        OverlayStyle {
            color: book.overlay_color.clone(),
            opacity: book.overlay_opacity,
        },
    );
    Ok(book.clone())
}

#[tauri::command]
fn test_recognize(state: State<AppState>, points: Vec<Point>) -> CastResult {
    let book = state.book.lock().unwrap();
    recognize_with(&book, &points)
}

/// Called by the overlay when a stroke ends. Recognizes it; on a match the
/// wand is sheathed (overlay hidden) and the shortcut is typed into whatever
/// app is focused underneath.
#[tauri::command]
fn cast(app: AppHandle, state: State<AppState>, points: Vec<Point>) -> CastResult {
    let result = {
        let book = state.book.lock().unwrap();
        recognize_with(&book, &points)
    };
    log::info!(
        "cast: {} pts -> matched={} name={:?} score={:.2}",
        points.len(),
        result.matched,
        result.name,
        result.score
    );
    let _ = app.emit_to("main", "wand:cast", result.clone());
    if result.matched {
        let app2 = app.clone();
        let r = result.clone();
        std::thread::spawn(move || {
            // let the golden burst play, then vanish and act
            std::thread::sleep(Duration::from_millis(420));
            set_wand_mode(&app2, false);
            std::thread::sleep(Duration::from_millis(180));
            perform(&app2, &r);
        });
    }
    result
}

fn perform(app: &AppHandle, r: &CastResult) {
    if r.action.as_deref() == Some("app") {
        if let Some(path) = r.app_path.clone() {
            if let Err(e) = launch_app(&path) {
                log::error!("launch failed: {e}");
            }
        }
    } else if let Some(sc) = r.shortcut.clone() {
        press_on_main(app, sc);
    }
}

fn launch_app(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn launch(path: String) -> Result<(), String> {
    launch_app(&path)
}

/// Icon of an application as a `data:image/png;base64,...` URL (cached).
#[tauri::command]
fn app_icon(state: State<AppState>, path: String) -> Option<String> {
    if let Some(hit) = state.icon_cache.lock().unwrap().get(&path) {
        return hit.clone();
    }
    use base64::Engine;
    let icon = extract_app_icon(&path).map(|b| {
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(b)
        )
    });
    state.icon_cache.lock().unwrap().insert(path, icon.clone());
    icon
}

#[cfg(target_os = "macos")]
fn extract_app_icon(path: &str) -> Option<Vec<u8>> {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
    use objc2_foundation::{NSDictionary, NSString};
    unsafe {
        let img = NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(path));
        let tiff = img.TIFFRepresentation()?;
        let reps = NSBitmapImageRep::imageRepsWithData(&tiff);
        // pick the representation closest to 128px
        let mut best: Option<(i64, objc2::rc::Retained<NSBitmapImageRep>)> = None;
        for rep in reps.iter() {
            let rep: objc2::rc::Retained<NSBitmapImageRep> =
                objc2::rc::Retained::cast_unchecked(rep);
            let w = rep.pixelsWide() as i64;
            let d = (w - 128).abs();
            if best.as_ref().is_none_or(|(bd, _)| d < *bd) {
                best = Some((d, rep));
            }
        }
        let (_, rep) = best?;
        let data = rep
            .representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())?;
        Some(data.to_vec())
    }
}
#[cfg(target_os = "windows")]
fn extract_app_icon(path: &str) -> Option<Vec<u8>> {
    let tmp = std::env::temp_dir().join(format!("wandful-icon-{}.png", std::process::id()));
    let script = format!(
        "Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Icon]::ExtractAssociatedIcon('{}'); $b=$i.ToBitmap(); $b.Save('{}',[System.Drawing.Imaging.ImageFormat]::Png)",
        path.replace('\'', "''"),
        tmp.display()
    );
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .output();
    let png = std::fs::read(&tmp).ok();
    let _ = std::fs::remove_file(&tmp);
    png
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn extract_app_icon(_path: &str) -> Option<Vec<u8>> {
    None
}

#[tauri::command]
fn cast_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        press_on_main(&app, shortcut);
    });
    Ok(())
}

#[tauri::command]
fn accessibility_ok() -> bool {
    accessibility_trusted(false)
}

#[tauri::command]
fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

/// macOS: is this process allowed to use the Accessibility API? With
/// `prompt` the system dialog is shown (and the app is added to the list).
#[cfg(target_os = "macos")]
fn accessibility_trusted(prompt: bool) -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::{CFString, CFStringRef};
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
        static kAXTrustedCheckOptionPrompt: CFStringRef;
    }
    unsafe {
        let key = CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt);
        let val = if prompt {
            CFBoolean::true_value()
        } else {
            CFBoolean::false_value()
        };
        let dict = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), val.as_CFType())]);
        AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef())
    }
}
#[cfg(not(target_os = "macos"))]
fn accessibility_trusted(_prompt: bool) -> bool {
    true
}

#[tauri::command]
fn set_key_capture(state: State<AppState>, on: bool) {
    state.hook.capture_keys.store(on, Ordering::SeqCst);
    if on {
        // Safety net: never swallow the keyboard for more than a few seconds.
        // The generation guard keeps an old timer from ending a newer capture.
        let gen = state.hook.capture_gen.fetch_add(1, Ordering::SeqCst) + 1;
        let hook = state.hook.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(8));
            if hook.capture_gen.load(Ordering::SeqCst) == gen {
                hook.capture_keys.store(false, Ordering::SeqCst);
            }
        });
    }
}

/// The overlay reports when its new-spell panel (or a native dialog it opened)
/// is up, so Escape reaches the panel instead of sheathing the wand.
#[tauri::command]
fn set_overlay_panel(app: AppHandle, state: State<AppState>, on: bool) {
    state.hook.overlay_panel.store(on, Ordering::SeqCst);
    // On Windows the overlay is a no-activate window so it never steals focus
    // while you draw; the panel needs the keyboard, so it becomes focusable
    // only for as long as it is up.
    #[cfg(not(target_os = "macos"))]
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.set_focusable(on);
        if on {
            let _ = overlay.set_focus();
        }
    }
    #[cfg(target_os = "macos")]
    let _ = app;
}

/// Key synthesis touches Cocoa/TIS APIs that must run on the main queue.
fn press_on_main(app: &AppHandle, shortcut: String) {
    let _ = app.run_on_main_thread(move || {
        if let Err(e) = shortcut::press(&shortcut) {
            log::error!("cast failed: {e}");
        }
    });
}

#[tauri::command]
fn get_wand(state: State<AppState>) -> bool {
    state.hook.wand_on.load(Ordering::SeqCst)
}

#[tauri::command]
fn set_wand(app: AppHandle, on: bool) {
    set_wand_mode(&app, on);
}

// ---------- helpers ----------

fn recognize_with(book: &Book, points: &[Point]) -> CastResult {
    let templates = book.templates();
    match recognizer::recognize(points, &templates) {
        Some(m) if m.score >= book.threshold => {
            let spell = book.spells.iter().find(|s| s.id == m.id);
            CastResult {
                matched: true,
                id: Some(m.id.clone()),
                name: spell.map(|s| s.name.clone()),
                shortcut: spell.map(|s| s.shortcut.clone()),
                action: spell.map(|s| s.action.clone()),
                app_path: spell.map(|s| s.app_path.clone()),
                app_name: spell.map(|s| s.app_name.clone()),
                score: m.score,
            }
        }
        Some(m) => {
            let spell = book.spells.iter().find(|s| s.id == m.id);
            CastResult {
                matched: false,
                id: None,
                name: spell.map(|s| s.name.clone()),
                shortcut: None,
                action: None,
                app_path: None,
                app_name: None,
                score: m.score,
            }
        }
        None => CastResult {
            matched: false,
            id: None,
            name: None,
            shortcut: None,
            action: None,
            app_path: None,
            app_name: None,
            score: 0.0,
        },
    }
}

/// macOS: pid of the frontmost app.
#[cfg(target_os = "macos")]
fn frontmost_pid() -> Option<i32> {
    use objc2_app_kit::NSWorkspace;
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|a| a.processIdentifier())
}
/// macOS: bring the app with `pid` back to the front.
#[cfg(target_os = "macos")]
fn activate_pid(pid: i32) {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
    if let Some(a) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        // Deprecated (a no-op) from macOS 14, but the bundle still targets 10.15
        // where it is the only way to steal focus back after the overlay hides.
        #[allow(deprecated)]
        a.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    }
}

fn set_wand_mode(app: &AppHandle, on: bool) {
    let state = app.state::<AppState>();
    let was_on = state.hook.wand_on.swap(on, Ordering::SeqCst);
    if !on {
        state.hook.overlay_panel.store(false, Ordering::SeqCst);
    }
    if let Some(overlay) = app.get_webview_window("overlay") {
        if on {
            // Remember who was in front so we can hand focus back when casting.
            #[cfg(target_os = "macos")]
            if !was_on {
                let me = std::process::id() as i32;
                let front = frontmost_pid().filter(|&p| p != me);
                *state.prev_app.lock().unwrap() = front;
            }
            let _ = overlay.show();
            // On macOS a window only receives mouse-moved events while its app is
            // active, so the overlay takes focus while the wand is out.
            #[cfg(target_os = "macos")]
            let _ = overlay.set_focus();
        } else {
            let _ = overlay.hide();
            #[cfg(target_os = "macos")]
            if was_on {
                if let Some(pid) = state.prev_app.lock().unwrap().take() {
                    activate_pid(pid);
                }
            }
        }
    }
    if let Some(item) = state.tray_toggle.lock().unwrap().as_ref() {
        let _ = item.set_text(if on { "Sheathe wand" } else { "Summon wand" });
    }
    let _ = app.emit("wand:mode", WandMode { on });
}

fn toggle_wand(app: &AppHandle) {
    let on = app.state::<AppState>().hook.wand_on.load(Ordering::SeqCst);
    set_wand_mode(app, !on);
}

fn show_spellbook(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    let monitor = app.primary_monitor()?;
    let (w, h, scale) = match monitor {
        Some(m) => (
            m.size().width as f64,
            m.size().height as f64,
            m.scale_factor(),
        ),
        None => (1920.0, 1080.0, 1.0),
    };
    let _win = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("Wandful Overlay")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .focusable(cfg!(target_os = "macos"))
        .visible(false)
        .visible_on_all_workspaces(true)
        .position(0.0, 0.0)
        .inner_size(w / scale, h / scale)
        .accept_first_mouse(true)
        .build()?;
    Ok(())
}

fn spawn_worker(app: AppHandle, rx: mpsc::Receiver<Msg>) {
    std::thread::Builder::new()
        .name("wand-worker".into())
        .spawn(move || {
            for msg in rx {
                match msg {
                    Msg::Cancel => set_wand_mode(&app, false),
                    Msg::HookError(e) => {
                        let _ = app.emit("wand:hook-error", e);
                    }
                    Msg::KeyChord { mods, key } => {
                        // Both windows may be recording a shortcut: the spellbook
                        // form, or the overlay's new-spell panel. Each ignores
                        // chords while it is not listening.
                        let _ = app.emit("wand:key", KeyChord { mods, key });
                    }
                }
            }
        })
        .expect("spawn worker");
}

fn init_logging() {
    let mut builder =
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"));
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(home) = home {
        let dir = std::path::PathBuf::from(home).join(if cfg!(target_os = "macos") {
            "Library/Logs/Wandful"
        } else {
            ".wandful"
        });
        if std::fs::create_dir_all(&dir).is_ok() {
            if let Ok(f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join("wandful.log"))
            {
                builder.target(env_logger::Target::Pipe(Box::new(f)));
            }
        }
    }
    let _ = builder.try_init();
}

pub fn run() {
    init_logging();
    log::info!("Wandful starting");
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_book,
            save_spell,
            delete_spell,
            set_threshold,
            test_recognize,
            cast_shortcut,
            get_wand,
            set_wand,
            set_key_capture,
            set_overlay_panel,
            set_settings,
            reset_settings,
            cast,
            accessibility_ok,
            open_accessibility_settings,
            restart_app,
            launch,
            app_icon,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let path = app.path().app_config_dir()?.join("spellbook.json");
            let book = Book::load(&path);
            let hotkey = book.hotkey.clone();
            let hook = HookState::new();
            app.manage(AppState {
                book: Mutex::new(book),
                path,
                hook: hook.clone(),
                tray_toggle: Mutex::new(None),
                prev_app: Mutex::new(None),
                icon_cache: Mutex::new(Default::default()),
            });

            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let edit = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, None)?,
                        &PredefinedMenuItem::redo(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, None)?,
                        &PredefinedMenuItem::copy(app, None)?,
                        &PredefinedMenuItem::paste(app, None)?,
                        &PredefinedMenuItem::select_all(app, None)?,
                    ],
                )?;
                let app_menu = Submenu::with_items(
                    app,
                    "Wandful",
                    true,
                    &[&PredefinedMenuItem::about(app, None, None)?],
                )?;
                app.set_menu(Menu::with_items(app, &[&app_menu, &edit])?)?;
            }

            create_overlay(&handle)?;

            // Ask for Accessibility up front (macOS shows its dialog and lists the app).
            if !accessibility_trusted(true) {
                log::warn!("Accessibility not granted yet — casting and key capture are limited");
            }

            // Global hook + worker
            let (tx, rx) = mpsc::channel::<Msg>();
            hook::spawn(hook.clone(), tx);
            spawn_worker(handle.clone(), rx);

            // Tray
            let toggle = MenuItem::with_id(app, "toggle", "Summon wand", true, None::<&str>)?;
            let book_item = MenuItem::with_id(app, "book", "Spellbook", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &toggle,
                    &book_item,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;
            *app.state::<AppState>().tray_toggle.lock().unwrap() = Some(toggle);
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Wandful")
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "toggle" => toggle_wand(app),
                    "book" => show_spellbook(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                // Left click on the menu-bar icon = summon / sheathe the wand.
                // Right click = the menu (spellbook, quit, ...).
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = ev
                    {
                        toggle_wand(tray.app_handle());
                    }
                });
            // macOS: monochrome template icon that adapts to light/dark menu bars.
            #[cfg(target_os = "macos")]
            {
                tray = tray
                    .icon(tauri::image::Image::from_bytes(include_bytes!(
                        "../icons/tray@2x.png"
                    ))?)
                    .icon_as_template(true);
            }
            #[cfg(not(target_os = "macos"))]
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Global hotkey to summon/sheathe the wand
            if let Err(e) = register_hotkey(&handle, &hotkey) {
                log::error!("hotkey register failed for {hotkey}: {e}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Wandful");
}
