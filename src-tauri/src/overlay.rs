//! Windows: the break screen and the blink cue on every monitor, plus the settings window.

use crate::scheduler::{BreakInfo, BreakKind, Cue};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Every window gets a fresh label: closing is asynchronous, so reusing "break-0" right after closing it
/// would fail with "label already exists".
static NEXT: AtomicU64 = AtomicU64::new(1);

fn next_id() -> u64 {
    NEXT.fetch_add(1, Ordering::Relaxed)
}

const BLINK_CUE_MS: u64 = 2500;
const POSTURE_CUE_MS: u64 = 4000;
const WATER_CUE_W: f64 = 360.0;
const WATER_CUE_H: f64 = 132.0;

fn monitors(app: &AppHandle) -> Vec<(Monitor, bool)> {
    let primary = app.primary_monitor().ok().flatten().map(|m| *m.position());
    let list = app.available_monitors().unwrap_or_default();
    let has_primary = list.iter().any(|m| Some(*m.position()) == primary);
    list.into_iter()
        .enumerate()
        .map(|(i, m)| {
            let is_primary = if has_primary { Some(*m.position()) == primary } else { i == 0 };
            (m, is_primary)
        })
        .collect()
}

/// A borderless window over everything, hidden until `place_and_show` puts it on its monitor.
fn cover_monitor<'a>(
    app: &'a AppHandle,
    label: String,
    url: String,
) -> tauri::Result<WebviewWindowBuilder<'a, tauri::Wry, AppHandle>> {
    Ok(WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Unslouch")
        .visible(false)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .shadow(false))
}

/// Positions in physical pixels after the window exists: with monitors of different scale, a logical position
/// can land on the wrong monitor on Windows.
fn place_and_show(win: &WebviewWindow, monitor: &Monitor) {
    let _ = win.set_position(*monitor.position());
    let _ = win.set_size(*monitor.size());
    let _ = win.show();
}

#[cfg(target_os = "macos")]
fn raise_above_menu_bar(win: &WebviewWindow) {
    use objc2::{msg_send, runtime::AnyObject};
    const NS_STATUS_WINDOW_LEVEL: isize = 25;
    // canJoinAllSpaces | stationary | fullScreenAuxiliary: visible over another app's fullscreen space too.
    const BEHAVIOR: usize = 1 | 16 | 256;
    if let Ok(ptr) = win.ns_window() {
        let ns = ptr as *mut AnyObject;
        unsafe {
            let _: () = msg_send![&*ns, setLevel: NS_STATUS_WINDOW_LEVEL];
            let _: () = msg_send![&*ns, setCollectionBehavior: BEHAVIOR];
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn raise_above_menu_bar(_: &WebviewWindow) {}

/// Returns how many windows were opened.
pub fn show_break(app: &AppHandle, info: BreakInfo, lang: &str, sound: bool, tip: usize) -> usize {
    close_prefix(app, "break-");
    close_prefix(app, "cue-");
    let kind = match info.kind {
        BreakKind::Micro => "micro",
        BreakKind::Movement => "movement",
        BreakKind::Long => "long",
        BreakKind::NeckStrength => "neck",
        BreakKind::Breathing => "breathing",
        BreakKind::EndOfDay => "endOfDay",
    };
    let id = next_id();
    let mut opened = 0;
    for (i, (monitor, primary)) in monitors(app).into_iter().enumerate() {
        let url = format!(
            "index.html?view=break&kind={kind}&dur={}&rot={}&primary={}&sound={}&tip={tip}&lang={lang}",
            info.duration_sec, info.rotation, primary as u8, (sound && primary) as u8,
        );
        let Ok(builder) = cover_monitor(app, format!("break-{id}-{i}"), url) else { continue };
        if let Ok(win) = builder.focused(primary).build() {
            place_and_show(&win, &monitor);
            raise_above_menu_bar(&win);
            if primary {
                let _ = win.set_focus();
            }
            opened += 1;
        }
    }
    opened
}

pub fn close_break(app: &AppHandle) {
    close_prefix(app, "break-");
}

fn close_later(app: &AppHandle, labels: Vec<String>, ms: u64) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(ms));
        let h = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            for label in labels {
                if let Some(win) = h.get_webview_window(&label) {
                    let _ = win.destroy();
                }
            }
        });
    });
}

/// Gentle cues. Blink and posture: a transparent window over every monitor, clicks pass through, focus stays
/// where it was. Water: a small card in the corner of the main monitor with two buttons, gone by itself.
pub fn show_cue(app: &AppHandle, cue: Cue, lang: &str, is_cis: bool, theme: &str) {
    if app.webview_windows().keys().any(|l| l.starts_with("break-")) {
        return;
    }
    // Wayland lets no program keep a transparent window on top: a system notification works everywhere.
    if std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland") {
        use tauri_plugin_notification::NotificationExt;
        let key = match cue {
            Cue::Blink => "cue.blink",
            Cue::Posture => "cue.posture",
            Cue::Water => "cue.water",
        };
        let _ = app
            .notification()
            .builder()
            .title(crate::i18n::t(lang, "app.name", &[]))
            .body(crate::i18n::t(lang, key, &[]))
            .show();
        return;
    }
    let id = next_id();
    match cue {
        Cue::Blink | Cue::Posture => {
            // A new edge cue replaces an old one; the water card stays until the user answers it.
            for (label, win) in app.webview_windows() {
                if label.starts_with("cue-") && !label.starts_with("cue-water") {
                    let _ = win.destroy();
                }
            }
            let name = if cue == Cue::Blink { "blink" } else { "posture" };
            let mut labels = vec![];
            for (i, (monitor, _)) in monitors(app).into_iter().enumerate() {
                let url = format!("index.html?view=cue&cue={name}&lang={lang}&theme={theme}");
                let label = format!("cue-{id}-{i}");
                let Ok(builder) = cover_monitor(app, label.clone(), url) else { continue };
                if let Ok(win) = builder.transparent(true).focused(false).focusable(false).build() {
                    let _ = win.set_ignore_cursor_events(true);
                    place_and_show(&win, &monitor);
                    raise_above_menu_bar(&win);
                    labels.push(label);
                }
            }
            close_later(app, labels, if cue == Cue::Blink { BLINK_CUE_MS } else { POSTURE_CUE_MS });
        }
        Cue::Water => {
            close_prefix(app, "cue-water");
            let Some((monitor, _)) = monitors(app).into_iter().find(|(_, p)| *p) else { return };
            let scale = monitor.scale_factor();
            let pos = monitor.position().to_logical::<f64>(scale);
            let size = monitor.size().to_logical::<f64>(scale);
            let margin = 24.0;
            let url = format!("index.html?view=cue&cue=water&cis={}&lang={lang}&theme={theme}", is_cis as u8);
            let win = WebviewWindowBuilder::new(app, format!("cue-water-{id}"), WebviewUrl::App(url.into()))
                .title("Unslouch")
                .position(pos.x + size.width - WATER_CUE_W - margin, pos.y + size.height - WATER_CUE_H - margin * 3.0)
                .inner_size(WATER_CUE_W, WATER_CUE_H)
                .decorations(false)
                .resizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .transparent(true)
                .shadow(false)
                .focused(false)
                // The first click on "Done" must press the button, not just activate the window.
                .accept_first_mouse(true)
                .visible_on_all_workspaces(true)
                .build();
            if let Ok(win) = win {
                raise_above_menu_bar(&win);
            }
        }
    }
}

pub fn show_settings(app: &AppHandle, tab: &str) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.eval(&format!("window.location.hash = '{tab}'"));
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        return;
    }
    let url = format!("index.html?view=settings#{tab}");
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("Unslouch")
        .inner_size(640.0, 760.0)
        .min_inner_size(480.0, 560.0)
        .center()
        .focused(true)
        .build();
}

pub fn close_prefix(app: &AppHandle, prefix: &str) {
    for (label, win) in app.webview_windows() {
        if label.starts_with(prefix) {
            let _ = win.destroy();
        }
    }
}
