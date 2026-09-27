//! System "Do not disturb". Read where the system allows it, otherwise false.

#[cfg(target_os = "windows")]
pub fn is_on() -> bool {
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_QUIET_TIME};
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    // Windows 11 "Do not disturb" turns toasts off globally.
    let toasts_off = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings")
        .and_then(|k| k.get_value::<u32, _>("NOC_GLOBAL_SETTING_TOASTS_ENABLED"))
        .is_ok_and(|v| v == 0);
    toasts_off || unsafe { SHQueryUserNotificationState() }.is_ok_and(|s| s == QUNS_QUIET_TIME)
}

/// macOS keeps Focus state in a file that needs Full Disk Access on recent versions. If we can read it,
/// any active assertion means a Focus mode is on.
#[cfg(target_os = "macos")]
pub fn is_on() -> bool {
    let Some(home) = std::env::var_os("HOME") else { return false };
    let path = std::path::Path::new(&home).join("Library/DoNotDisturb/DB/Assertions.json");
    let Ok(text) = std::fs::read_to_string(path) else { return false };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return false };
    json["data"]
        .as_array()
        .is_some_and(|d| d.iter().any(|e| e["storeAssertionRecords"].as_array().is_some_and(|r| !r.is_empty())))
}

#[cfg(target_os = "linux")]
pub fn is_on() -> bool {
    std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.notifications", "show-banners"])
        .output()
        .is_ok_and(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).trim() == "false")
}
