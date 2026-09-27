//! Is the user busy with a fullscreen app (video, presentation, game)?
//! Breaks wait while this is true, up to a limit.

#[cfg(target_os = "windows")]
pub fn is_busy() -> bool {
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

#[cfg(target_os = "macos")]
pub fn is_busy() -> bool {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::display::CGDisplay;
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowLayer, kCGWindowListExcludeDesktopElements,
        kCGWindowListOptionOnScreenOnly, kCGWindowOwnerPID,
    };

    let Some(windows) = copy_window_info(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID,
    ) else {
        return false;
    };
    let displays: Vec<_> = CGDisplay::active_displays()
        .unwrap_or_default()
        .into_iter()
        .map(|id| CGDisplay::new(id).bounds())
        .collect();
    let own_pid = std::process::id() as i64;

    let number = |dict: &CFDictionary<CFString, CFType>, key: CFString| -> Option<f64> {
        dict.find(&key).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_f64())
    };

    // The list goes front to back: the first ordinary window (layer 0) is the one the user looks at.
    for item in windows.iter() {
        let dict: CFDictionary<CFString, CFType> =
            unsafe { CFDictionary::wrap_under_get_rule(*item as CFDictionaryRef) };
        let layer = number(&dict, unsafe { CFString::wrap_under_get_rule(kCGWindowLayer) });
        if layer != Some(0.0) {
            continue;
        }
        let pid = number(&dict, unsafe { CFString::wrap_under_get_rule(kCGWindowOwnerPID) });
        if pid == Some(own_pid as f64) {
            continue;
        }
        let Some(bounds) = dict
            .find(&unsafe { CFString::wrap_under_get_rule(kCGWindowBounds) })
            .and_then(|v| v.downcast::<CFDictionary>())
        else {
            return false;
        };
        let bounds: CFDictionary<CFString, CFType> =
            unsafe { CFDictionary::wrap_under_get_rule(bounds.as_concrete_TypeRef()) };
        let (Some(w), Some(h)) = (
            number(&bounds, CFString::from_static_string("Width")),
            number(&bounds, CFString::from_static_string("Height")),
        ) else {
            return false;
        };
        return displays
            .iter()
            .any(|d| w >= d.size.width - 1.0 && h >= d.size.height - 1.0);
    }
    false
}

/// X11: the active window has _NET_WM_STATE_FULLSCREEN. Wayland does not expose it: always false.
#[cfg(target_os = "linux")]
pub fn is_busy() -> bool {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

    if std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland") {
        return false;
    }
    let check = || -> Option<bool> {
        let (conn, screen) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots[screen].root;
        let atom = |name: &[u8]| conn.intern_atom(false, name).ok()?.reply().ok().map(|r| r.atom);
        let (active, state, fullscreen) = (atom(b"_NET_ACTIVE_WINDOW")?, atom(b"_NET_WM_STATE")?, atom(b"_NET_WM_STATE_FULLSCREEN")?);
        let window = conn.get_property(false, root, active, AtomEnum::WINDOW, 0, 1).ok()?.reply().ok()?.value32()?.next()?;
        let states = conn.get_property(false, window, state, AtomEnum::ATOM, 0, 32).ok()?.reply().ok()?;
        let found = states.value32()?.any(|a| a == fullscreen);
        Some(found)
    };
    check().unwrap_or(false)
}
