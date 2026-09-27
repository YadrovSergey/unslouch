//! Name of the program in the active window. Only the program name: no window titles, no URLs.

#[cfg(target_os = "macos")]
pub fn app() -> Option<String> {
    use objc2::rc::autoreleasepool;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::msg_send;
    use std::ffi::CStr;

    autoreleasepool(|_| unsafe {
        let cls = AnyClass::get(c"NSWorkspace")?;
        let ws: *mut AnyObject = msg_send![cls, sharedWorkspace];
        let app: *mut AnyObject = msg_send![&*ws, frontmostApplication];
        if app.is_null() {
            return None;
        }
        let name: *mut AnyObject = msg_send![&*app, localizedName];
        if name.is_null() {
            return None;
        }
        let utf8: *const std::ffi::c_char = msg_send![&*name, UTF8String];
        (!utf8.is_null()).then(|| CStr::from_ptr(utf8).to_string_lossy().into_owned())
    })
}

#[cfg(target_os = "windows")]
pub fn app() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let hwnd = GetForegroundWindow();
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(process);
        if !ok {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        // "C:\...\Code.exe" → "Code". The interface turns known exe names into friendly ones.
        std::path::Path::new(&path).file_stem().map(|s| s.to_string_lossy().into_owned())
    }
}

/// X11 only: Wayland does not tell other programs which window is active. The connection is opened once per
/// thread and reused: this runs every second.
#[cfg(target_os = "linux")]
pub fn app() -> Option<String> {
    use std::cell::RefCell;
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, Atom, ConnectionExt};
    use x11rb::rust_connection::RustConnection;

    thread_local! {
        static X: RefCell<Option<(RustConnection, usize, Atom)>> = const { RefCell::new(None) };
    }
    if std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland") {
        return None;
    }
    X.with(|cell| {
        let mut slot = cell.borrow_mut();
        if slot.is_none() {
            let (conn, screen) = x11rb::connect(None).ok()?;
            let active = conn.intern_atom(false, b"_NET_ACTIVE_WINDOW").ok()?.reply().ok()?.atom;
            *slot = Some((conn, screen, active));
        }
        let (conn, screen, active) = slot.as_ref()?;
        let read = || -> Option<String> {
            let root = conn.setup().roots[*screen].root;
            let reply = conn.get_property(false, root, *active, AtomEnum::WINDOW, 0, 1).ok()?.reply().ok()?;
            let window = reply.value32()?.next()?;
            let class = conn.get_property(false, window, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 256).ok()?.reply().ok()?;
            // WM_CLASS is "instance\0Class\0": the class is the readable one.
            let parts: Vec<&[u8]> = class.value.split(|b| *b == 0).filter(|p| !p.is_empty()).collect();
            parts.last().map(|p| String::from_utf8_lossy(p).into_owned())
        };
        let name = read();
        if name.is_none() {
            // The X server may have gone away (session restart): reconnect next time.
            *slot = None;
        }
        name
    })
}

pub fn supported() -> bool {
    !(cfg!(target_os = "linux") && std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland"))
}
