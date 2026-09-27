//! Is the camera or the microphone busy right now (a call)? We never open them ourselves,
//! we only ask the system whether another program uses them.

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::c_void;

    #[repr(C)]
    struct Address {
        selector: u32,
        scope: u32,
        element: u32,
    }

    const fn fourcc(s: &[u8; 4]) -> u32 {
        ((s[0] as u32) << 24) | ((s[1] as u32) << 16) | ((s[2] as u32) << 8) | s[3] as u32
    }

    const SYSTEM_OBJECT: u32 = 1;
    const DEVICES: u32 = fourcc(b"dev#");
    const SCOPE_GLOBAL: u32 = fourcc(b"glob");
    const SCOPE_INPUT: u32 = fourcc(b"inpt");
    const SCOPE_OUTPUT: u32 = fourcc(b"outp");
    const STREAMS: u32 = fourcc(b"stm#");
    const RUNNING_SOMEWHERE: u32 = fourcc(b"gone");

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyDataSize(id: u32, a: *const Address, qs: u32, q: *const c_void, size: *mut u32) -> i32;
        fn AudioObjectGetPropertyData(
            id: u32,
            a: *const Address,
            qs: u32,
            q: *const c_void,
            size: *mut u32,
            out: *mut c_void,
        ) -> i32;
    }

    #[link(name = "CoreMediaIO", kind = "framework")]
    extern "C" {
        fn CMIOObjectGetPropertyDataSize(id: u32, a: *const Address, qs: u32, q: *const c_void, size: *mut u32) -> i32;
        fn CMIOObjectGetPropertyData(
            id: u32,
            a: *const Address,
            qs: u32,
            q: *const c_void,
            size: u32,
            used: *mut u32,
            out: *mut c_void,
        ) -> i32;
    }

    fn audio_devices() -> Vec<u32> {
        let addr = Address { selector: DEVICES, scope: SCOPE_GLOBAL, element: 0 };
        let mut size = 0u32;
        unsafe {
            if AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &addr, 0, std::ptr::null(), &mut size) != 0 {
                return vec![];
            }
            let mut ids = vec![0u32; size as usize / 4];
            if AudioObjectGetPropertyData(SYSTEM_OBJECT, &addr, 0, std::ptr::null(), &mut size, ids.as_mut_ptr().cast()) != 0 {
                return vec![];
            }
            ids.truncate(size as usize / 4);
            ids
        }
    }

    fn has_streams(id: u32, scope: u32) -> bool {
        let addr = Address { selector: STREAMS, scope, element: 0 };
        let mut size = 0u32;
        unsafe { AudioObjectGetPropertyDataSize(id, &addr, 0, std::ptr::null(), &mut size) == 0 && size > 0 }
    }

    fn audio_running(id: u32) -> bool {
        let addr = Address { selector: RUNNING_SOMEWHERE, scope: SCOPE_GLOBAL, element: 0 };
        let mut value = 0u32;
        let mut size = 4u32;
        unsafe {
            AudioObjectGetPropertyData(id, &addr, 0, std::ptr::null(), &mut size, (&mut value as *mut u32).cast()) == 0
                && value != 0
        }
    }

    /// "Running somewhere" is per device, not per direction: a headset playing music would look like a call.
    /// So only input-only devices count (the built-in mic, USB mics). Headset calls are still caught by the
    /// camera or, for audio-only calls, missed: better a break during a call than no breaks all day.
    pub fn microphone_busy() -> bool {
        audio_devices()
            .into_iter()
            .any(|id| has_streams(id, SCOPE_INPUT) && !has_streams(id, SCOPE_OUTPUT) && audio_running(id))
    }

    pub fn camera_busy() -> bool {
        let addr = Address { selector: DEVICES, scope: SCOPE_GLOBAL, element: 0 };
        let mut size = 0u32;
        unsafe {
            if CMIOObjectGetPropertyDataSize(SYSTEM_OBJECT, &addr, 0, std::ptr::null(), &mut size) != 0 {
                return false;
            }
            let mut ids = vec![0u32; size as usize / 4];
            let mut used = 0u32;
            if CMIOObjectGetPropertyData(SYSTEM_OBJECT, &addr, 0, std::ptr::null(), size, &mut used, ids.as_mut_ptr().cast()) != 0 {
                return false;
            }
            ids.truncate(used as usize / 4);
            ids.into_iter().any(|id| {
                let a = Address { selector: RUNNING_SOMEWHERE, scope: SCOPE_GLOBAL, element: 0 };
                let mut value = 0u32;
                let mut used = 0u32;
                CMIOObjectGetPropertyData(id, &a, 0, std::ptr::null(), 4, &mut used, (&mut value as *mut u32).cast()) == 0
                    && value != 0
            })
        }
    }
}

#[cfg(target_os = "windows")]
mod win {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    /// Windows records every app that uses the camera or microphone. An open session has a start time
    /// and `LastUsedTimeStop == 0`.
    fn in_use(capability: &str) -> bool {
        let base = format!("Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{capability}");
        let Ok(root) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(&base) else { return false };
        let active = |key: &RegKey| {
            key.get_value::<u64, _>("LastUsedTimeStop").map(|v| v == 0).unwrap_or(false)
                && key.get_value::<u64, _>("LastUsedTimeStart").map(|v| v > 0).unwrap_or(false)
        };
        let check_children = |key: &RegKey| key.enum_keys().flatten().any(|name| key.open_subkey(&name).is_ok_and(|k| active(&k)));
        // Store apps are direct children, desktop apps live under NonPackaged.
        check_children(&root) || root.open_subkey("NonPackaged").is_ok_and(|k| check_children(&k))
    }

    pub fn microphone_busy() -> bool {
        in_use("microphone")
    }

    pub fn camera_busy() -> bool {
        in_use("webcam")
    }
}

#[cfg(target_os = "linux")]
mod linux {
    /// Some process holds /dev/video* open. Only our user's processes are readable, which is what we need.
    pub fn camera_busy() -> bool {
        let Ok(procs) = std::fs::read_dir("/proc") else { return false };
        procs.flatten().any(|p| {
            let Ok(fds) = std::fs::read_dir(p.path().join("fd")) else { return false };
            fds.flatten().any(|fd| {
                std::fs::read_link(fd.path()).is_ok_and(|t| t.to_string_lossy().starts_with("/dev/video"))
            })
        })
    }

    /// An active recording stream in PulseAudio / PipeWire.
    pub fn microphone_busy() -> bool {
        std::process::Command::new("pactl")
            .args(["list", "short", "source-outputs"])
            .output()
            .is_ok_and(|o| o.status.success() && !o.stdout.iter().all(|b| b.is_ascii_whitespace()))
    }
}

#[cfg(target_os = "macos")]
use mac as os;
#[cfg(target_os = "windows")]
use win as os;
#[cfg(target_os = "linux")]
use linux as os;

pub fn in_call() -> bool {
    os::camera_busy() || os::microphone_busy()
}
