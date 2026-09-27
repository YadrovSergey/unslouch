mod calls;
mod dnd;
mod frontmost;
mod fullscreen;
mod i18n;
mod overlay;
mod scheduler;
mod settings;
mod updates;
mod usage;

use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveDate, NaiveDateTime, NaiveTime, Timelike};
use scheduler::{Action, BreakKind, BreakResult, Context, Quiet, Scheduler};
use serde::Serialize;
use settings::{DayStats, Settings, Stats, Wellbeing, WellbeingLog};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewWindow, Wry};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_opener::OpenerExt;
use usage::{DayUsage, Tracker, Usage};

pub const MZR_URL: &str = "https://health-diet.ru/";
const TRAY_ID: &str = "main";
/// "Pause until tomorrow" ends at this hour.
const TOMORROW_HOUR: u32 = 4;
const STATS_DAYS_KEPT: usize = 400;
/// Sitting longer than this without getting up is flagged (Healy 2010).
const SITTING_RISK_SEC: u64 = 2 * 60 * 60;

/// Seconds in one settings minute. `UNSLOUCH_FAST=1` turns a minute into 5 seconds for manual testing.
fn scale() -> u64 {
    if std::env::var_os("UNSLOUCH_FAST").is_some() {
        5
    } else {
        60
    }
}

fn day_key(now: NaiveDateTime) -> String {
    now.format("%Y-%m-%d").to_string()
}

/// Monday of the current week: the key for the weekly wellbeing check.
fn week_key(now: NaiveDateTime) -> String {
    let monday = now.date() - ChronoDuration::days(now.weekday().num_days_from_monday() as i64);
    monday.format("%Y-%m-%d").to_string()
}

struct Inner {
    settings: Settings,
    stats: Stats,
    wellbeing: WellbeingLog,
    usage: Usage,
    sched: Scheduler,
    tracker: Tracker,
    quiet: Quiet,
    tip: usize,
    config_dir: PathBuf,
    update: Option<tauri_plugin_updater::Update>,
    /// "Not now" on the weekly wellbeing questions: ask again tomorrow.
    wellbeing_dismissed: Option<NaiveDate>,
}

impl Inner {
    fn lang(&self) -> &'static str {
        match &self.settings.language {
            Some(code) => i18n::resolve(code),
            None => i18n::system_language(),
        }
    }

    fn path(&self, name: &str) -> PathBuf {
        self.config_dir.join(name)
    }

    fn today(&mut self) -> &mut DayStats {
        self.stats.entry(day_key(Local::now().naive_local())).or_default()
    }

    fn save_stats(&mut self) {
        settings::trim_days(&mut self.stats, STATS_DAYS_KEPT);
        settings::save(&self.path("stats.json"), &self.stats);
    }

    fn save_usage(&mut self) {
        settings::trim_days(&mut self.usage, usage::DAYS_KEPT);
        settings::save(&self.path("usage.json"), &self.usage);
    }
}

/// Menu items live apart from the rest of the state: they are only touched on the main thread,
/// never while `Inner` is locked (a menu call waits for the main thread, which may be waiting for the lock).
struct AppState(Mutex<Inner>, Mutex<Option<TrayItems>>);

#[derive(Clone)]
struct TrayItems {
    status: MenuItem<Wry>,
    today: MenuItem<Wry>,
    resume: MenuItem<Wry>,
    focus_stop: MenuItem<Wry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    settings: Settings,
    language: &'static str,
    languages: &'static [&'static str],
    is_cis: bool,
    version: String,
    mzr_url: &'static str,
    /// "macos" | "windows" | "linux"
    platform: &'static str,
    wayland: bool,
    usage_supported: bool,
    /// This week's wellbeing check is not answered yet and was not put off today.
    wellbeing_due: bool,
}

fn app_info(app: &AppHandle, inner: &Inner) -> AppInfo {
    let language = inner.lang();
    let now = Local::now().naive_local();
    AppInfo {
        settings: inner.settings.clone(),
        language,
        languages: i18n::LANGUAGES,
        is_cis: i18n::is_cis(language),
        version: app.package_info().version.to_string(),
        mzr_url: MZR_URL,
        platform: std::env::consts::OS,
        wayland: std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland"),
        usage_supported: frontmost::supported(),
        wellbeing_due: !inner.wellbeing.contains_key(&week_key(now)) && inner.wellbeing_dismissed != Some(now.date()),
    }
}

#[tauri::command]
fn get_app_info(app: AppHandle, state: State<AppState>) -> AppInfo {
    app_info(&app, &state.0.lock().unwrap())
}

#[tauri::command]
fn save_settings(app: AppHandle, state: State<AppState>, settings: Settings) -> AppInfo {
    let mut inner = state.0.lock().unwrap();
    let old_lang = inner.lang();
    inner.settings = settings.sanitized();
    settings::save(&inner.path("settings.json"), &inner.settings);
    let lang_changed = inner.lang() != old_lang;
    let info = app_info(&app, &inner);
    drop(inner);
    if lang_changed {
        rebuild_tray(&app);
    } else {
        refresh_tray(&app);
    }
    let _ = app.emit("app-info", &info);
    info
}

#[derive(Serialize)]
struct StatsDay {
    day: String,
    #[serde(flatten)]
    stats: DayStats,
}

/// Last `days` days including today, oldest first; empty days are zeros.
#[tauri::command]
fn get_stats(state: State<AppState>, days: u32) -> Vec<StatsDay> {
    let inner = state.0.lock().unwrap();
    let today = Local::now().date_naive();
    (0..days.clamp(1, 400) as i64)
        .rev()
        .map(|back| {
            let day = (today - ChronoDuration::days(back)).format("%Y-%m-%d").to_string();
            let stats = inner.stats.get(&day).copied().unwrap_or_default();
            StatsDay { day, stats }
        })
        .collect()
}

#[derive(Serialize)]
struct UsageDay {
    day: String,
    #[serde(flatten)]
    usage: DayUsage,
}

#[tauri::command]
fn get_usage(state: State<AppState>, days: u32) -> Vec<UsageDay> {
    let inner = state.0.lock().unwrap();
    let today = Local::now().date_naive();
    (0..days.clamp(1, 90) as i64)
        .rev()
        .map(|back| {
            let day = (today - ChronoDuration::days(back)).format("%Y-%m-%d").to_string();
            let usage = inner.usage.get(&day).cloned().unwrap_or_default();
            UsageDay { day, usage }
        })
        .collect()
}

#[tauri::command]
fn clear_usage(state: State<AppState>) {
    let mut inner = state.0.lock().unwrap();
    inner.usage.clear();
    inner.save_usage();
}

#[tauri::command]
fn get_wellbeing(state: State<AppState>) -> WellbeingLog {
    state.0.lock().unwrap().wellbeing.clone()
}

#[tauri::command]
fn save_wellbeing(state: State<AppState>, answers: Wellbeing) {
    let mut inner = state.0.lock().unwrap();
    let week = week_key(Local::now().naive_local());
    inner.wellbeing.insert(week, answers);
    settings::trim_days(&mut inner.wellbeing, 104);
    settings::save(&inner.path("wellbeing.json"), &inner.wellbeing);
}

#[tauri::command]
fn dismiss_wellbeing(state: State<AppState>) {
    state.0.lock().unwrap().wellbeing_dismissed = Some(Local::now().date_naive());
}

#[tauri::command]
fn break_result(app: AppHandle, result: String) {
    let result = match result.as_str() {
        "done" => BreakResult::Done,
        "postponed" => BreakResult::Postponed,
        _ => BreakResult::Skipped,
    };
    finish_break(&app, result);
    overlay::close_break(&app);
}

/// Ends the current break: statistics, timers, tray. Also called when the break windows were closed
/// without an answer (Alt+F4, a crashed page), so reminders never stop for good.
fn finish_break(app: &AppHandle, result: BreakResult) {
    let state = app.state::<AppState>();
    let mut inner = state.0.lock().unwrap();
    let settings = inner.settings.clone();
    if let Some((info, sitting)) = inner.sched.finish(&settings, result, scale()) {
        let counted = info.kind != BreakKind::EndOfDay;
        if counted {
            let day = inner.today();
            match result {
                BreakResult::Done => {
                    day.done += 1;
                    match info.kind {
                        BreakKind::Micro => day.micro_done += 1,
                        BreakKind::Movement | BreakKind::Long => day.movement_done += 1,
                        _ => {}
                    }
                }
                BreakResult::Skipped => day.skipped += 1,
                BreakResult::Postponed => day.postponed += 1,
            }
            inner.tip += 1;
        }
        if let Some(sec) = sitting {
            sitting_ended(&mut inner, sec);
        }
        inner.save_stats();
    }
    drop(inner);
    refresh_tray(app);
}

/// Water cue: the user tapped "I drank".
#[tauri::command]
fn water_drunk(window: WebviewWindow, state: State<AppState>) {
    let mut inner = state.0.lock().unwrap();
    inner.today().water += 1;
    inner.save_stats();
    let _ = window.destroy();
}

/// Paths come from the native save/open dialog in the settings window; other windows may not write files.
fn from_settings(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "settings" {
        Ok(())
    } else {
        Err("not allowed from this window".into())
    }
}

/// Saves a PNG made in the page (the "Share" card) to the path the user picked.
#[tauri::command]
fn save_png(window: WebviewWindow, path: String, data: Vec<u8>) -> Result<(), String> {
    from_settings(&window)?;
    if !data.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("not a PNG".into());
    }
    std::fs::write(path, data).map_err(|e| e.to_string())
}

/// A cue window closes itself, not the other cues that may be on screen.
#[tauri::command]
fn close_cue(window: WebviewWindow) {
    let _ = window.destroy();
}

/// Everything the app keeps, in one file. Import replaces it.
#[derive(Serialize, serde::Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Backup {
    app: String,
    version: String,
    settings: Settings,
    stats: Stats,
    wellbeing: WellbeingLog,
    usage: Usage,
}

#[tauri::command]
fn export_data(app: AppHandle, window: WebviewWindow, state: State<AppState>, path: String) -> Result<(), String> {
    from_settings(&window)?;
    let inner = state.0.lock().unwrap();
    let backup = Backup {
        app: "unslouch".into(),
        version: app.package_info().version.to_string(),
        settings: inner.settings.clone(),
        stats: inner.stats.clone(),
        wellbeing: inner.wellbeing.clone(),
        usage: inner.usage.clone(),
    };
    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_data(app: AppHandle, window: WebviewWindow, state: State<AppState>, path: String) -> Result<AppInfo, String> {
    from_settings(&window)?;
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let backup: Backup = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if backup.app != "unslouch" {
        return Err("not an Unslouch backup".into());
    }
    let mut inner = state.0.lock().unwrap();
    inner.settings = backup.settings.sanitized();
    inner.stats = backup.stats;
    inner.wellbeing = backup.wellbeing;
    inner.usage = backup.usage;
    settings::save(&inner.path("settings.json"), &inner.settings);
    settings::save(&inner.path("wellbeing.json"), &inner.wellbeing);
    inner.save_stats();
    inner.save_usage();
    let info = app_info(&app, &inner);
    drop(inner);
    rebuild_tray(&app);
    let _ = app.emit("app-info", &info);
    Ok(info)
}

fn sitting_ended(inner: &mut Inner, sec: u64) {
    let key = day_key(Local::now().naive_local());
    let day = inner.today();
    day.longest_sitting_sec = day.longest_sitting_sec.max(sec);
    if sec >= SITTING_RISK_SEC {
        day.sitting_over_2h += 1;
    }
    if inner.settings.usage_enabled && inner.settings.onboarding_done {
        let Inner { tracker, usage, .. } = inner;
        tracker.stretch_ended(usage, &key, sec);
    }
}

fn tray_icon(light: bool) -> Image<'static> {
    #[cfg(target_os = "macos")]
    let bytes: &[u8] = {
        let _ = light;
        include_bytes!("../icons/tray-template.png")
    };
    #[cfg(not(target_os = "macos"))]
    let bytes: &[u8] = if light {
        include_bytes!("../icons/tray-light.png")
    } else {
        include_bytes!("../icons/tray-color.png")
    };
    Image::from_bytes(bytes).expect("tray icon")
}

/// Windows taskbar is dark → white icon. Other systems: the colored one (Linux) or a template (macOS).
#[cfg(target_os = "windows")]
fn taskbar_dark() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    winreg::RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .and_then(|k| k.get_value::<u32, _>("SystemUsesLightTheme"))
        .map(|v| v == 0)
        .unwrap_or(true)
}

#[cfg(not(target_os = "windows"))]
fn taskbar_dark() -> bool {
    false
}

fn build_menu(app: &AppHandle, lang: &str, update: Option<&str>) -> tauri::Result<(Menu<Wry>, TrayItems)> {
    let t = |key: &str| i18n::t(lang, key, &[]);
    let item = |id: &str, key: &str| MenuItem::with_id(app, id, t(key), true, None::<&str>);
    let status = MenuItem::with_id(app, "status", "", false, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "", false, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", t("tray.resume"), false, None::<&str>)?;
    let focus_stop = MenuItem::with_id(app, "focus_stop", t("tray.focusStop"), false, None::<&str>)?;
    let focus = Submenu::with_id_and_items(
        app,
        "focus",
        t("tray.focus"),
        true,
        &[&item("focus_25", "tray.focus25")?, &item("focus_50", "tray.focus50")?, &focus_stop],
    )?;
    let pause = Submenu::with_id_and_items(
        app,
        "pause",
        t("tray.pause"),
        true,
        &[&item("pause_30", "tray.pause30")?, &item("pause_60", "tray.pause60")?, &item("pause_tomorrow", "tray.pauseTomorrow")?],
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &item("micro_now", "tray.microNow")?,
            &item("movement_now", "tray.movementNow")?,
            &item("breathing_now", "tray.breathingNow")?,
            &PredefinedMenuItem::separator(app)?,
            &focus,
            &pause,
            &resume,
            &PredefinedMenuItem::separator(app)?,
            &today,
            &item("stats", "tray.stats")?,
            &item("settings", "tray.settings")?,
            &item("about", "tray.about")?,
        ],
    )?;
    if i18n::is_cis(lang) {
        menu.append(&item("mzr", "tray.mzr")?)?;
    }
    if let Some(version) = update {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        let text = i18n::t(lang, "tray.update", &[("v", version)]);
        menu.append(&MenuItem::with_id(app, "update", text, true, None::<&str>)?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item("quit", "tray.quit")?)?;
    Ok((menu, TrayItems { status, today, resume, focus_stop }))
}

/// Rebuilds the tray menu (language changed, update found). Always on the main thread, without the state lock.
fn rebuild_tray(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let state = handle.state::<AppState>();
        let (lang, version) = {
            let inner = state.0.lock().unwrap();
            (inner.lang(), inner.update.as_ref().map(|u| u.version.clone()))
        };
        let Ok((menu, items)) = build_menu(&handle, lang, version.as_deref()) else { return };
        if let Some(tray) = handle.tray_by_id(TRAY_ID) {
            let _ = tray.set_menu(Some(menu));
        }
        *state.1.lock().unwrap() = Some(items);
        apply_tray(&handle);
    });
}

/// Updates the status lines of the tray menu. Safe to call from any thread and with the lock held:
/// it only posts a task to the main thread.
fn refresh_tray(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || apply_tray(&handle));
}

fn hours_minutes(lang: &str, sec: u64) -> String {
    let (h, m) = (sec / 3600, sec % 3600 / 60);
    if h > 0 {
        i18n::t(lang, "tray.hm", &[("h", &h.to_string()), ("m", &m.to_string())])
    } else {
        i18n::t(lang, "tray.m", &[("m", &m.to_string())])
    }
}

struct TrayView {
    status: String,
    today: String,
    paused: bool,
    focus: bool,
}

fn tray_view(inner: &Inner) -> TrayView {
    let lang = inner.lang();
    let s = &inner.settings;
    let time = |t: NaiveDateTime| t.format("%H:%M").to_string();
    let status = if let Some(until) = inner.sched.paused_until {
        i18n::t(lang, "tray.pausedUntil", &[("time", &time(until))])
    } else if let Some(until) = inner.sched.focus_until {
        i18n::t(lang, "tray.focusUntil", &[("time", &time(until))])
    } else {
        match inner.quiet {
            Quiet::OutsideHours => i18n::t(lang, "tray.outsideHours", &[]),
            Quiet::Call => i18n::t(lang, "tray.inCall", &[]),
            Quiet::DoNotDisturb => i18n::t(lang, "tray.dnd", &[]),
            _ => match inner.sched.seconds_to_break(s, scale()) {
                Some(secs) => {
                    let min = secs.div_ceil(scale()).max(1).to_string();
                    i18n::t(lang, "tray.nextBreak", &[("n", &min)])
                }
                None => i18n::t(lang, "tray.breaksOff", &[]),
            },
        }
    };
    let day = inner.stats.get(&day_key(Local::now().naive_local())).copied().unwrap_or_default();
    let today = i18n::t(
        lang,
        "tray.today",
        &[("done", &day.done.to_string()), ("time", &hours_minutes(lang, day.active_sec))],
    );
    TrayView { status, today, paused: inner.sched.paused_until.is_some(), focus: inner.sched.focus_until.is_some() }
}

/// Main thread only: reads the state under the lock, releases it, then touches the menu.
fn apply_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    let view = tray_view(&state.0.lock().unwrap());
    let Some(items) = state.1.lock().unwrap().clone() else { return };
    let _ = items.status.set_text(view.status);
    let _ = items.today.set_text(view.today);
    let _ = items.resume.set_enabled(view.paused);
    let _ = items.focus_stop.set_enabled(view.focus);
}

fn tomorrow_morning() -> NaiveDateTime {
    let now = Local::now().naive_local();
    let at = NaiveTime::from_hms_opt(TOMORROW_HOUR, 0, 0).unwrap();
    let day = if now.time() < at { now.date() } else { now.date() + ChronoDuration::days(1) };
    day.and_time(at)
}

/// Main thread: opens the break windows. If none could be opened, the break is dropped at once,
/// otherwise the scheduler would wait for an answer that never comes.
fn present_break(app: &AppHandle, info: scheduler::BreakInfo, lang: &'static str, sound: bool, tip: usize) {
    if overlay::show_break(app, info, lang, sound, tip) == 0 {
        app.state::<AppState>().0.lock().unwrap().sched.current = None;
    }
}

fn start_break_now(app: &AppHandle, kind: BreakKind) {
    let state = app.state::<AppState>();
    let mut inner = state.0.lock().unwrap();
    let settings = inner.settings.clone();
    let Some(info) = inner.sched.start_now(&settings, kind, scale()) else { return };
    let (lang, tip) = (inner.lang(), inner.tip);
    drop(inner);
    present_break(app, info, lang, settings.sound_enabled, tip);
}

fn with_sched(app: &AppHandle, f: impl FnOnce(&mut Scheduler)) {
    let state = app.state::<AppState>();
    f(&mut state.0.lock().unwrap().sched);
    refresh_tray(app);
}

fn on_menu(app: &AppHandle, id: &str) {
    let now = Local::now().naive_local();
    match id {
        "micro_now" => start_break_now(app, BreakKind::Micro),
        "movement_now" => start_break_now(app, BreakKind::Movement),
        "breathing_now" => start_break_now(app, BreakKind::Breathing),
        "focus_25" => with_sched(app, |s| s.start_focus(now + ChronoDuration::minutes(25))),
        "focus_50" => with_sched(app, |s| s.start_focus(now + ChronoDuration::minutes(50))),
        "focus_stop" => with_sched(app, |s| s.stop_focus()),
        "pause_30" => with_sched(app, |s| s.pause(now + ChronoDuration::minutes(30))),
        "pause_60" => with_sched(app, |s| s.pause(now + ChronoDuration::hours(1))),
        "pause_tomorrow" => with_sched(app, |s| s.pause(tomorrow_morning())),
        "resume" => with_sched(app, |s| s.resume()),
        "stats" => overlay::show_settings(app, "stats"),
        "settings" => overlay::show_settings(app, "settings"),
        "about" => overlay::show_settings(app, "about"),
        "mzr" => {
            let _ = app.opener().open_url(MZR_URL, None::<&str>);
        }
        "update" => {
            let state = app.state::<AppState>();
            let mut inner = state.0.lock().unwrap();
            let Some(update) = inner.update.take() else { return };
            // The updater may end the process without the usual exit events (Windows): save now.
            inner.save_stats();
            inner.save_usage();
            drop(inner);
            let handle = app.clone();
            updates::install(app.clone(), update, move |failed| {
                handle.state::<AppState>().0.lock().unwrap().update = Some(failed);
                rebuild_tray(&handle);
            });
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

/// System state that is slow to read: refreshed every few seconds, not every tick.
#[derive(Default)]
struct Probe {
    fullscreen: bool,
    in_call: bool,
    dnd: bool,
    dark_taskbar: Option<bool>,
}

/// Once a second: idle time, system state, what the scheduler wants to show, statistics.
fn run_ticker(app: AppHandle) {
    std::thread::spawn(move || {
        let mut probe = Probe::default();
        let mut n: u64 = 0;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            n += 1;
            let idle = user_idle::UserIdle::get_time().map(|i| i.as_seconds()).unwrap_or(0);
            let state = app.state::<AppState>();
            let s = state.0.lock().unwrap().settings.clone();

            if n % 5 == 0 {
                probe.fullscreen = s.pause_in_fullscreen && fullscreen::is_busy();
                probe.in_call = s.pause_on_calls && calls::in_call();
                probe.dnd = s.respect_dnd && dnd::is_on();
            }
            if n % 30 == 1 {
                let dark = taskbar_dark();
                if probe.dark_taskbar != Some(dark) {
                    probe.dark_taskbar = Some(dark);
                    if let Some(tray) = app.tray_by_id(TRAY_ID) {
                        let _ = tray.set_icon(Some(tray_icon(dark)));
                        let _ = tray.set_icon_as_template(cfg!(target_os = "macos"));
                    }
                }
            }
            // Outside of the lock: talking to the window server can take a moment.
            let front = if s.usage_enabled && s.onboarding_done && idle < 60 { frontmost::app() } else { None };

            let now = Local::now().naive_local();
            let ctx = Context {
                now,
                idle_sec: idle,
                fullscreen: probe.fullscreen,
                in_call: probe.in_call,
                dnd: probe.dnd,
                dt: 1,
                scale: scale(),
            };
            let mut inner = state.0.lock().unwrap();
            let out = inner.sched.tick(&s, &ctx);
            inner.quiet = out.quiet;
            if out.active {
                inner.today().active_sec += 1;
                if let Some(app_name) = front.filter(|_| out.quiet != Quiet::OutsideHours) {
                    let key = day_key(now);
                    let Inner { tracker, usage, .. } = &mut *inner;
                    tracker.record(usage, &key, now.hour(), &app_name, &s.usage_excluded, 1);
                }
            }
            if let Some(sec) = out.sitting_ended {
                sitting_ended(&mut inner, sec);
            }
            if n % 60 == 0 {
                inner.save_stats();
                if s.usage_enabled {
                    inner.save_usage();
                }
            }
            let lang = inner.lang();
            let sound = s.sound_enabled;
            let tip = inner.tip;
            let is_cis = i18n::is_cis(lang);
            let theme = s.theme.clone();
            drop(inner);
            if n % 5 == 0 || out.action != Action::None {
                refresh_tray(&app);
            }

            let handle = app.clone();
            match out.action {
                Action::Break(info) => {
                    let _ = app.run_on_main_thread(move || present_break(&handle, info, lang, sound, tip));
                }
                Action::Cue(cue) => {
                    let _ = app.run_on_main_thread(move || overlay::show_cue(&handle, cue, lang, is_cis, &theme));
                }
                Action::None => {}
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| overlay::show_settings(app, "settings")))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            save_settings,
            get_stats,
            get_usage,
            clear_usage,
            get_wellbeing,
            save_wellbeing,
            break_result,
            water_drunk,
            close_cue,
            save_png,
            dismiss_wellbeing,
            export_data,
            import_data
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let config_dir = app.path().app_config_dir()?;
            let settings: Settings = settings::load::<Settings>(&config_dir.join("settings.json")).sanitized();
            let first_run = !settings.onboarding_done;
            let inner = Inner {
                settings,
                stats: settings::load(&config_dir.join("stats.json")),
                wellbeing: settings::load(&config_dir.join("wellbeing.json")),
                usage: settings::load(&config_dir.join("usage.json")),
                sched: Scheduler::default(),
                tracker: Tracker::default(),
                quiet: Quiet::None,
                tip: 0,
                config_dir,
                update: None,
                wellbeing_dismissed: None,
            };

            let handle = app.handle().clone();
            let (menu, items) = build_menu(&handle, inner.lang(), None)?;
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(tray_icon(taskbar_dark()))
                .icon_as_template(cfg!(target_os = "macos"))
                .tooltip(i18n::t(inner.lang(), "app.name", &[]))
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
                .build(app)?;
            app.manage(AppState(Mutex::new(inner), Mutex::new(Some(items))));
            apply_tray(&handle);

            // Start with the computer is asked on the first-run screen, not switched on silently.
            if first_run {
                overlay::show_settings(&handle, "onboarding");
            }
            let checker = handle.clone();
            let notifier = handle.clone();
            updates::watch(
                handle.clone(),
                move || checker.state::<AppState>().0.lock().unwrap().settings.check_updates,
                move |update| {
                    notifier.state::<AppState>().0.lock().unwrap().update = Some(update);
                    rebuild_tray(&notifier);
                },
            );
            run_ticker(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        // Lives in the tray: closing the settings window must not quit.
        RunEvent::ExitRequested { api, code: None, .. } => api.prevent_exit(),
        // All break windows gone without an answer (Alt+F4, crash): count it as skipped.
        RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label.starts_with("break-") => {
            let others = app.webview_windows().keys().any(|l| l.starts_with("break-") && *l != label);
            let waiting = app.state::<AppState>().0.lock().unwrap().sched.current.is_some();
            if !others && waiting {
                finish_break(app, BreakResult::Skipped);
            }
        }
        RunEvent::Exit => {
            let state = app.state::<AppState>();
            let mut inner = state.0.lock().unwrap();
            inner.save_stats();
            inner.save_usage();
        }
        _ => {}
    });
}
