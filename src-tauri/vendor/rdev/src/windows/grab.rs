use crate::rdev::{Event, EventType, GrabError};
use crate::windows::common::{convert, set_key_hook, set_mouse_hook, HookError, HOOK, KEYBOARD};
use std::ptr::null_mut;
use std::time::SystemTime;
use winapi::um::winuser::{
    CallNextHookEx, DispatchMessageA, GetMessageA, TranslateMessage, HC_ACTION,
};

static mut GLOBAL_CALLBACK: Option<Box<dyn FnMut(Event) -> Option<Event>>> = None;

unsafe extern "system" fn raw_callback(code: i32, param: usize, lpdata: isize) -> isize {
    if code == HC_ACTION {
        let opt = convert(param, lpdata);
        if let Some(event_type) = opt {
            let name = match &event_type {
                EventType::KeyPress(_key) => match (*KEYBOARD).lock() {
                    Ok(mut keyboard) => keyboard.get_name(lpdata),
                    Err(_) => None,
                },
                _ => None,
            };
            let event = Event {
                event_type,
                time: SystemTime::now(),
                name,
            };
            if let Some(callback) = &mut GLOBAL_CALLBACK {
                if callback(event).is_none() {
                    // https://stackoverflow.com/questions/42756284/blocking-windows-mouse-click-using-setwindowshookex
                    // https://android.developreference.com/article/14560004/Blocking+windows+mouse+click+using+SetWindowsHookEx()
                    // https://cboard.cprogramming.com/windows-programming/99678-setwindowshookex-wm_keyboard_ll.html
                    // let _result = CallNextHookEx(HOOK, code, param, lpdata);
                    return 1;
                }
            }
        }
    }
    CallNextHookEx(HOOK, code, param, lpdata)
}
impl From<HookError> for GrabError {
    fn from(error: HookError) -> Self {
        match error {
            HookError::Mouse(code) => GrabError::MouseHookError(code),
            HookError::Key(code) => GrabError::KeyHookError(code),
        }
    }
}

pub fn grab<T>(callback: T) -> Result<(), GrabError>
where
    T: FnMut(Event) -> Option<Event> + 'static,
{
    grab_inner(callback, true)
}

/// PATCHED (wandful): keyboard only. The mouse hook fires on every pointer
/// move, and a low-level hook that misses `LowLevelHooksTimeout` is silently
/// dropped from the chain by Windows — the keyboard then stops arriving with
/// no error anywhere. Wandful reads the mouse in the overlay web view, so the
/// mouse hook is pure cost.
pub fn grab_keys<T>(callback: T) -> Result<(), GrabError>
where
    T: FnMut(Event) -> Option<Event> + 'static,
{
    grab_inner(callback, false)
}

fn grab_inner<T>(callback: T, with_mouse: bool) -> Result<(), GrabError>
where
    T: FnMut(Event) -> Option<Event> + 'static,
{
    unsafe {
        GLOBAL_CALLBACK = Some(Box::new(callback));
        set_key_hook(raw_callback)?;
        if with_mouse {
            set_mouse_hook(raw_callback)?;
        }

        // PATCHED (wandful): pump messages forever, not once. A WH_KEYBOARD_LL
        // hook only lives while the thread that installed it keeps servicing a
        // message-retrieval call. The original single `GetMessageA` returns as
        // soon as any message arrives, this function returns, the thread ends
        // and Windows quietly unhooks — after which no key is ever seen again
        // and nothing anywhere reports an error.
        let mut msg = std::mem::zeroed();
        while GetMessageA(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageA(&msg);
        }
    }
    Ok(())
}
