//! Windows platform calls, kept out of `lib.rs` the way the macOS ones are
//! kept in `objc2` blocks there. Three jobs: hand focus back to the app that
//! was in front, open a file the way Explorer would, and pull an application's
//! icon out of the shell.

use std::ffi::c_void;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Security::{TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
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

/// Shell calls (`ShellExecuteW`, `SHGetImageList`) may hand off to in-process
/// shell extensions, which expect an initialised apartment. Both run off the
/// main thread here, so each one initialises its own; a thread that is already
/// initialised just gets an error we ignore.
fn com_init() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
}

// ---------- focus ----------

/// Handle of the foreground window, unless it is one of ours. Stored as an
/// `isize` so it can live in the same slot as the macOS pid.
pub fn frontmost_window() -> Option<isize> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            return None;
        }
        Some(hwnd.0 as isize)
    }
}

/// Bring a window remembered by [`frontmost_window`] back to the front.
///
/// `SetForegroundWindow` is refused unless the caller already owns the
/// foreground, which is true here: the overlay's panel is what took it.
pub fn activate_window(handle: isize) {
    unsafe {
        let hwnd = HWND(handle as *mut c_void);
        if !IsWindow(Some(hwnd)).as_bool() {
            return;
        }
        if !SetForegroundWindow(hwnd).as_bool() {
            log::warn!("could not hand focus back to {handle:#x}");
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
    com_init();
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
pub fn system_action(id: &str) -> Result<(), String> {
    use windows::Win32::System::Power::SetSuspendState;
    use windows::Win32::System::Shutdown::{
        ExitWindowsEx, LockWorkStation, EWX_LOGOFF, SHUTDOWN_REASON,
    };
    match id {
        "lock" => unsafe { LockWorkStation().map_err(|e| e.to_string()) },
        "signout" => unsafe {
            ExitWindowsEx(EWX_LOGOFF, SHUTDOWN_REASON(0)).map_err(|e| e.to_string())
        },
        // Disconnecting the session is what "Switch user" does.
        "switchuser" => launch(r"C:\Windows\System32	sdiscon.exe"),
        "taskmgr" => launch(r"C:\Windows\System32\Taskmgr.exe"),
        "sleep" => {
            // Not hibernate, not forced: ask the way the power button does.
            let ok = unsafe { SetSuspendState(false, false, false) };
            if !ok {
                Err("the system refused to sleep".into())
            } else {
                Ok(())
            }
        }
        other => Err(format!("unknown system action: {other}")),
    }
}

// ---------- elevation ----------

/// Is this process running elevated?
fn self_elevated() -> bool {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut len = 0u32;
        let ok = windows::Win32::Security::GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut c_void),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

/// Does the window in front belong to a process we cannot reach?
///
/// A low-level hook and synthetic key presses are both blocked at an elevated
/// window unless Wandful is elevated too, and the block is silent: the keys
/// simply go nowhere. Opening the process is the cheapest probe there is —
/// it is denied for exactly the windows we cannot type into.
pub fn foreground_unreachable() -> bool {
    if self_elevated() {
        return false;
    }
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return false;
        }
        match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => {
                let _ = CloseHandle(h);
                false
            }
            Err(_) => true,
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
    com_init();
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
        let mut px = vec![0u8; (w * h * 4) as usize];
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
    use super::content_extent;

    fn canvas(w: u32, h: u32, filled: (u32, u32, u32, u32)) -> Vec<u8> {
        let (x0, y0, x1, y1) = filled;
        let mut px = vec![0u8; (w * h * 4) as usize];
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
