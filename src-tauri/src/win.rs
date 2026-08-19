//! Windows platform calls, kept out of `lib.rs` the way the macOS ones are
//! kept in `objc2` blocks there. Three jobs: hand focus back to the app that
//! was in front, open a file the way Explorer would, and pull an application's
//! icon out of the shell.

use std::ffi::c_void;
use std::sync::Mutex;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_NOT_ALL_ASSIGNED, HANDLE, HWND, LUID,
};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Security::{
    AdjustTokenPrivileges, GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation,
    LookupPrivilegeValueW, TokenIntegrityLevel, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED,
    SE_SHUTDOWN_NAME, TOKEN_ADJUST_PRIVILEGES, TOKEN_MANDATORY_LABEL, TOKEN_PRIVILEGES,
    TOKEN_QUERY,
};
use windows::Win32::System::Com::{
    CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Controls::{IImageList, ILD_TRANSPARENT};
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHGetImageList, ShellExecuteW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    SHGFI_SYSICONINDEX, SHIL_EXTRALARGE, SHIL_JUMBO,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, GetForegroundWindow, GetIconInfo, GetWindowThreadProcessId, IsWindow,
    SetForegroundWindow, HICON, ICONINFO, SW_SHOWNORMAL,
};

/// An initialised COM apartment for as long as the value is alive.
///
/// Shell calls (`ShellExecuteW`, `SHGetImageList`) may hand off to in-process
/// shell extensions, which expect one. Each call site initialises its own,
/// because they run on whatever thread Tauri or the cast gave them, and
/// uninitialises on the way out — a thread that exits still holding an
/// apartment leaves any shell extension DLL loaded on its behalf behind.
///
/// `COINIT_DISABLE_OLE1DDE` is what MSDN asks for around `ShellExecute`:
/// without it, a file association that still carries a DDE command starts a
/// DDE conversation, and an STA thread that does not pump messages (neither
/// of ours does) waits out the whole DDE timeout before failing.
struct Com(bool);

impl Com {
    fn init() -> Com {
        // S_FALSE (already initialised on this thread) still counts, and still
        // has to be balanced; only a hard failure must not be.
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
        Com(hr.is_ok())
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

/// A path inside the system directory, from `%SystemRoot%` rather than a
/// literal `C:\Windows` — Windows is not always on the C: volume.
fn system32(exe: &str) -> String {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    format!(r"{root}\System32\{exe}")
}

// ---------- focus ----------

/// Which process the last handed-out handle belonged to.
///
/// A window handle is only unique while its window lives: Windows reuses the
/// value once the window is gone. Remembering the owner lets [`activate_window`]
/// tell "the app I meant" from "whatever inherited its handle", which is the
/// difference between handing focus back and raising a stranger's window.
static LAST_FRONT: Mutex<Option<(isize, u32)>> = Mutex::new(None);

fn pid_of(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid
}

/// Handle of the foreground window, unless it is one of ours. Stored as an
/// `isize` so it can live in the same slot as the macOS pid.
pub fn frontmost_window() -> Option<isize> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let pid = pid_of(hwnd);
        if pid == std::process::id() {
            return None;
        }
        let handle = hwnd.0 as isize;
        *LAST_FRONT.lock().unwrap_or_else(|e| e.into_inner()) = Some((handle, pid));
        Some(handle)
    }
}

/// Bring a window remembered by [`frontmost_window`] back to the front.
///
/// `SetForegroundWindow` is only granted to a caller that already owns the
/// foreground, which is true after the overlay's new-spell panel closes — the
/// panel is what took it. It is *not* true when the wand is sheathed without
/// the panel ever opening: on Windows the overlay is a no-activate window, so
/// focus never left, the call is refused and there is nothing to fix. Hence
/// `debug!` and not `warn!` — a warning here sends the next reader hunting a
/// bug in the ordinary case.
pub fn activate_window(handle: isize) {
    unsafe {
        let hwnd = HWND(handle as *mut c_void);
        if !IsWindow(Some(hwnd)).as_bool() {
            return;
        }
        // The handle may have been recycled since it was remembered.
        let owner = *LAST_FRONT.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((remembered, pid)) = owner {
            if remembered == handle && pid_of(hwnd) != pid {
                log::debug!("not activating {handle:#x}: the window it named is gone");
                return;
            }
        }
        if !SetForegroundWindow(hwnd).as_bool() {
            log::debug!("focus stayed where it was; {handle:#x} was not raised");
        }
    }
}

/// Which modifier keys are physically down right now: (meta, ctrl, alt, shift).
///
/// The hook tracks presses and releases itself, which is fine until a release
/// never arrives — see `hook::os_mods` for how `Ctrl+Alt+Del` arranges exactly
/// that. This cannot go stale, because it asks the OS rather than remembering.
pub fn modifiers_down() -> (bool, bool, bool, bool) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };
    // The high bit is "down now"; the low bit is "pressed since last asked".
    let down = |vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY| unsafe {
        (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0
    };
    (
        down(VK_LWIN) || down(VK_RWIN),
        down(VK_CONTROL),
        down(VK_MENU),
        down(VK_SHIFT),
    )
}

// ---------- launching ----------

/// Open a path the way a double-click in Explorer would: `.exe`, `.lnk`,
/// folders and documents all work, and nothing flashes a console window on
/// the way (which `cmd /C start` does).
pub fn launch(path: &str) -> Result<(), String> {
    let _com = Com::init();
    let verb = HSTRING::from("open");
    let file = HSTRING::from(path);
    let rc = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    // Documented: anything above 32 is success, at or below is an error code.
    if rc.0 as isize <= 32 {
        return Err(format!("ShellExecute failed ({})", rc.0 as isize));
    }
    Ok(())
}

// ---------- system actions ----------

/// The things people actually want from the `Ctrl+Alt+Del` screen, done the
/// way Windows means them to be done.
///
/// The sequence itself is unreachable in both directions: the kernel takes it
/// before any hook sees it, and `SendInput` cannot synthesize it. Calling the
/// APIs behind each menu item needs no elevation and no policy change, which
/// faking the sequence would.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SystemAction {
    Lock,
    SignOut,
    SwitchUser,
    TaskManager,
    Sleep,
}

/// The ids the spellbook stores, in one place so they can be checked without
/// locking anybody's screen. The frontend's list lives in `src/lib/system.ts`
/// and has to agree with this one; `system_ids_are_the_ones_the_ui_offers`
/// below is what fails when it stops agreeing.
pub fn system_action_kind(id: &str) -> Option<SystemAction> {
    Some(match id {
        "lock" => SystemAction::Lock,
        "signout" => SystemAction::SignOut,
        "switchuser" => SystemAction::SwitchUser,
        "taskmgr" => SystemAction::TaskManager,
        "sleep" => SystemAction::Sleep,
        _ => return None,
    })
}

pub fn system_action(id: &str) -> Result<(), String> {
    use windows::Win32::System::Power::SetSuspendState;
    use windows::Win32::System::Shutdown::{
        ExitWindowsEx, LockWorkStation, EWX_LOGOFF, SHUTDOWN_REASON,
    };
    let action = system_action_kind(id).ok_or_else(|| format!("unknown system action: {id}"))?;
    match action {
        SystemAction::Lock => unsafe { LockWorkStation().map_err(|e| e.to_string()) },
        SystemAction::SignOut => unsafe {
            ExitWindowsEx(EWX_LOGOFF, SHUTDOWN_REASON(0)).map_err(|e| e.to_string())
        },
        // Disconnecting the session is what "Switch user" does.
        SystemAction::SwitchUser => launch(&system32("tsdiscon.exe")),
        SystemAction::TaskManager => launch(&system32("Taskmgr.exe")),
        SystemAction::Sleep => {
            // `SetSuspendState` needs SE_SHUTDOWN_NAME, which every token has
            // and none has enabled: without this the call just returns false.
            if !enable_privilege(SE_SHUTDOWN_NAME) {
                return Err("Windows would not grant the privilege to sleep".into());
            }
            // Not hibernate, not forced: ask the way the power button does.
            let ok = unsafe { SetSuspendState(false, false, false) };
            if ok {
                Ok(())
            } else {
                let code = unsafe { GetLastError() };
                Err(format!("the system refused to sleep ({})", code.0))
            }
        }
    }
}

/// Turn on a privilege the process already holds but has switched off.
fn enable_privilege(name: PCWSTR) -> bool {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        )
        .is_err()
        {
            return false;
        }
        let mut luid = LUID::default();
        let mut ok = LookupPrivilegeValueW(PCWSTR::null(), name, &mut luid).is_ok();
        if ok {
            let tp = TOKEN_PRIVILEGES {
                PrivilegeCount: 1,
                Privileges: [LUID_AND_ATTRIBUTES {
                    Luid: luid,
                    Attributes: SE_PRIVILEGE_ENABLED,
                }],
            };
            // Documented oddity: this succeeds even when it changed nothing,
            // and says so through GetLastError instead of the return value.
            ok = AdjustTokenPrivileges(token, false, Some(&tp), 0, None, None).is_ok()
                && GetLastError() != ERROR_NOT_ALL_ASSIGNED;
        }
        let _ = CloseHandle(token);
        ok
    }
}

// ---------- elevation ----------

/// A token's integrity level as its RID: 0x2000 medium, 0x3000 high, 0x4000
/// system. Comparing these is what decides whether input from us reaches a
/// window at all — that is exactly the rule UIPI applies.
fn integrity_of(token: HANDLE) -> Option<u32> {
    unsafe {
        // Variable-length: ask for the size, then for the value.
        let mut len = 0u32;
        let _ = GetTokenInformation(token, TokenIntegrityLevel, None, 0, &mut len);
        if len == 0 {
            return None;
        }
        let mut buf = vec![0u8; len as usize];
        GetTokenInformation(
            token,
            TokenIntegrityLevel,
            Some(buf.as_mut_ptr() as *mut c_void),
            len,
            &mut len,
        )
        .ok()?;
        let label = &*(buf.as_ptr() as *const TOKEN_MANDATORY_LABEL);
        let sid = label.Label.Sid;
        let count = *GetSidSubAuthorityCount(sid);
        if count == 0 {
            return None;
        }
        Some(*GetSidSubAuthority(sid, count as u32 - 1))
    }
}

/// Integrity level of a process, or `None` when it will not say.
fn process_integrity(process: HANDLE) -> Option<u32> {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(process, TOKEN_QUERY, &mut token).is_err() {
            return None;
        }
        let level = integrity_of(token);
        let _ = CloseHandle(token);
        level
    }
}

/// Does the window in front belong to a process we cannot reach?
///
/// A low-level hook and synthetic key presses are both blocked at a window
/// whose process runs at a higher integrity level than ours, and the block is
/// silent: `SendInput` reports success and the keys go nowhere.
///
/// Opening the *process* is not the probe it looks like.
/// `PROCESS_QUERY_LIMITED_INFORMATION` exists precisely so a medium-integrity
/// caller can query a higher-integrity one — it is how an unelevated Task
/// Manager lists elevated processes — so it succeeds for the very windows this
/// is meant to catch. The token is what is guarded: opening it is refused
/// across the boundary, and when it is not, its integrity level answers
/// directly.
pub fn foreground_unreachable() -> bool {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return false;
        }
        let pid = pid_of(hwnd);
        if pid == 0 || pid == std::process::id() {
            return false;
        }
        let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            // Denied even this much: nothing we send is going to arrive.
            return true;
        };
        let theirs = process_integrity(process);
        let _ = CloseHandle(process);
        let ours = process_integrity(GetCurrentProcess());
        match (theirs, ours) {
            // Refused the token: the classic elevated-window case.
            (None, _) => true,
            (Some(theirs), Some(ours)) => theirs > ours,
            // We cannot even read our own; assume the cast is worth trying.
            (Some(_), None) => false,
        }
    }
}

// ---------- icons ----------

/// Icon of an application as PNG bytes, the Windows half of `app_icon`.
///
/// The shell's own icon is used, so `.exe`, `.lnk`, folders and documents all
/// resolve the way they look in Explorer. The jumbo (256px) list is asked
/// first to match the crispness the macOS side gets from `NSWorkspace`.
pub fn app_icon_png(path: &str) -> Option<Vec<u8>> {
    let _com = Com::init();
    let wide = HSTRING::from(path);
    let mut info = SHFILEINFOW::default();
    let size = std::mem::size_of::<SHFILEINFOW>() as u32;
    let ok = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            Default::default(),
            Some(&mut info),
            size,
            SHGFI_SYSICONINDEX,
        )
    };
    if ok != 0 {
        // A file with no 256px art is drawn small into a 256px canvas rather
        // than scaled up, so the jumbo icon is only kept when it has the art
        // to fill it; otherwise the 48px list is the honest size.
        if let Some((w, h, px)) = image_list_icon(info.iIcon, SHIL_JUMBO)
            .filter(|(w, h, px)| content_extent(*w, *h, px) > 64)
            .or_else(|| image_list_icon(info.iIcon, SHIL_EXTRALARGE))
        {
            return encode_png(w, h, &px);
        }
    }
    // Last resort: the 32px icon SHGetFileInfo hands out itself.
    let mut info = SHFILEINFOW::default();
    let ok = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            Default::default(),
            Some(&mut info),
            size,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if ok == 0 || info.hIcon.is_invalid() {
        return None;
    }
    let rgba = icon_rgba(info.hIcon);
    unsafe {
        let _ = DestroyIcon(info.hIcon);
    }
    let (w, h, px) = rgba?;
    encode_png(w, h, &px)
}

/// One icon out of a system image list (`SHIL_JUMBO` is 256px, `SHIL_EXTRALARGE` 48px).
fn image_list_icon(index: i32, size: u32) -> Option<(u32, u32, Vec<u8>)> {
    unsafe {
        let list: IImageList = SHGetImageList(size as i32).ok()?;
        let icon = list.GetIcon(index, ILD_TRANSPARENT.0).ok()?;
        let rgba = icon_rgba(icon);
        let _ = DestroyIcon(icon);
        rgba
    }
}

/// Widest run of non-transparent pixels in either direction — how much of the
/// canvas the art actually uses.
fn content_extent(w: u32, h: u32, rgba: &[u8]) -> u32 {
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0u32, 0u32);
    for y in 0..h {
        for x in 0..w {
            if rgba[((y * w + x) * 4 + 3) as usize] != 0 {
                x0 = x0.min(x);
                y0 = y0.min(y);
                x1 = x1.max(x);
                y1 = y1.max(y);
            }
        }
    }
    if x1 < x0 || y1 < y0 {
        return 0;
    }
    (x1 - x0 + 1).max(y1 - y0 + 1)
}

/// Pull an `HICON`'s pixels out as straight RGBA.
fn icon_rgba(icon: HICON) -> Option<(u32, u32, Vec<u8>)> {
    unsafe {
        let mut ii = ICONINFO::default();
        GetIconInfo(icon, &mut ii).ok()?;
        let colour = ii.hbmColor;
        let mask = ii.hbmMask;
        let out = (|| {
            let mut bm = BITMAP::default();
            let got = GetObjectW(
                HGDIOBJ(colour.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bm as *mut _ as *mut c_void),
            );
            if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
                return None;
            }
            let (w, h) = (bm.bmWidth as u32, bm.bmHeight as u32);
            let mut px = read_bgra(colour.0, w, h)?;
            // A 24-bit icon carries its transparency in the mask instead; a
            // 32-bit one has it in the alpha channel already.
            if px.iter().skip(3).step_by(4).all(|&a| a == 0) {
                let m = read_bgra(mask.0, w, h)?;
                for i in 0..(w * h) as usize {
                    // The mask is 1 where the icon is transparent.
                    px[i * 4 + 3] = if m[i * 4] == 0 { 255 } else { 0 };
                }
            }
            // GDI hands back BGRA; PNG wants RGBA.
            for p in px.chunks_exact_mut(4) {
                p.swap(0, 2);
            }
            Some((w, h, px))
        })();
        let _ = DeleteObject(HGDIOBJ(colour.0));
        let _ = DeleteObject(HGDIOBJ(mask.0));
        out
    }
}

/// A bitmap's pixels as top-down 32-bit BGRA.
fn read_bgra(bitmap: *mut c_void, w: u32, h: u32) -> Option<Vec<u8>> {
    unsafe {
        let hdc = GetDC(None);
        if hdc.is_invalid() {
            return None;
        }
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w as i32,
                // Negative: rows come back top-down, the order PNG wants.
                biHeight: -(h as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut px = vec![0u8; w as usize * h as usize * 4];
        let lines = GetDIBits(
            hdc,
            windows::Win32::Graphics::Gdi::HBITMAP(bitmap),
            0,
            h,
            Some(px.as_mut_ptr() as *mut c_void),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, hdc);
        (lines != 0).then_some(px)
    }
}

fn encode_png(w: u32, h: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, w, h);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header().ok()?.write_image_data(rgba).ok()?;
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::{content_extent, system32, system_action_kind, SystemAction};

    /// The five ids `src/lib/system.ts` offers. A spell saves whatever string
    /// the UI put in it, so an id that only one side knows about becomes a
    /// spell that saves fine and fails at cast time.
    #[test]
    fn system_ids_are_the_ones_the_ui_offers() {
        for (id, kind) in [
            ("lock", SystemAction::Lock),
            ("signout", SystemAction::SignOut),
            ("switchuser", SystemAction::SwitchUser),
            ("taskmgr", SystemAction::TaskManager),
            ("sleep", SystemAction::Sleep),
        ] {
            assert_eq!(system_action_kind(id), Some(kind), "{id} is not known");
        }
        assert_eq!(system_action_kind("shutdown"), None);
        assert_eq!(system_action_kind(""), None);
    }

    /// A tab that had eaten its backslash lived inside a raw string here for a
    /// while: `r"…\System32\tsdiscon.exe"` became `…\System32<TAB>sdiscon.exe`,
    /// which no `rustfmt` or `clippy` pass can see and every cast failed on.
    #[test]
    fn system_paths_are_built_from_the_real_system_root() {
        let p = system32("tsdiscon.exe");
        assert!(p.ends_with(r"\System32\tsdiscon.exe"), "{p}");
        assert!(!p.contains('\t'), "a literal tab crept into {p:?}");
    }

    fn canvas(w: u32, h: u32, filled: (u32, u32, u32, u32)) -> Vec<u8> {
        let (x0, y0, x1, y1) = filled;
        let mut px = vec![0u8; w as usize * h as usize * 4];
        for y in y0..=y1 {
            for x in x0..=x1 {
                px[((y * w + x) * 4 + 3) as usize] = 255;
            }
        }
        px
    }

    #[test]
    fn empty_canvas_has_no_content() {
        assert_eq!(content_extent(8, 8, &vec![0u8; 8 * 8 * 4]), 0);
    }

    #[test]
    fn extent_is_the_longer_side_of_the_opaque_box() {
        // 4 wide, 2 tall, and nowhere near the origin.
        assert_eq!(content_extent(16, 16, &canvas(16, 16, (5, 9, 8, 10))), 4);
    }

    #[test]
    fn a_full_canvas_reports_its_own_size() {
        assert_eq!(content_extent(16, 16, &canvas(16, 16, (0, 0, 15, 15))), 16);
    }

    /// The jumbo list pads a small icon into a 256px canvas instead of scaling
    /// it, and that is exactly what `app_icon_png` uses this to detect.
    #[test]
    fn a_padded_jumbo_icon_reads_as_small() {
        assert!(content_extent(256, 256, &canvas(256, 256, (0, 0, 31, 31))) <= 64);
    }
}
