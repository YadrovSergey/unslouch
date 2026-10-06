mod calls;
mod dnd;
mod frontmost;
mod fullscreen;
mod i18n;
mod overlay;
mod reminders;
mod result;
mod scheduler;
mod settings;
mod updates;
mod usage;

use chrono::{Duration as ChronoDuration, Local, NaiveDate, NaiveDateTime, NaiveTime, Timelike};
use scheduler::{Action, BreakKind, BreakResult, Context, Cue, Quiet, Scheduler};
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

/// The МЗР food diary, tagged so its analytics can tell visits from Unslouch. The interface adds `utm_content`
/// with the place of the link (promo card, About, water card), the tray menu uses "tray".
pub const MZR_URL: &str = "https://health-diet.ru/?utm_source=unslouch&utm_medium=app&utm_campaign=unslouch";
const SITE_URL: &str = "https://unslouch.health-diet.ru";
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

/// Seconds the break screen waits for "Did it work out?", 0 when the question is off.
fn confirm_sec(s: &Settings, kind: BreakKind) -> u64 {
    if s.confirm_done {
        scheduler::confirm_sec(kind, scale())
    } else {
        0
    }
}

fn day_key(now: NaiveDateTime) -> String {
    now.format("%Y-%m-%d").to_string()
}

/// The evening wellbeing questions: in the evening window of a work day (see `scheduler::evening`), after at
/// least two hours at the computer, when this day (or, weekly, this week) has no entry yet and they were not put
/// off today. Entries the user adds by hand in the journal count too. Returns the day the answers are about.
fn wellbeing_due(inner: &Inner, now: NaiveDateTime) -> Option<NaiveDate> {
    let s = &inner.settings;
    let day = scheduler::evening(s, now)?;
    let key = day.format("%Y-%m-%d").to_string();
    if s.wellbeing_dismissed.as_deref() == Some(key.as_str()) {
        return None;
    }
    // A night shift is split by midnight: its two calendar days together.
    let mut days = vec![key.clone()];
    if day_key(now) != key {
        days.push(day_key(now));
    }
    let worked: u64 = days.iter().filter_map(|k| inner.stats.get(k)).map(|d| d.active_sec).sum();
    if worked < 120 * scale() {
        return None;
    }
    let from = if s.wellbeing_every == "week" { day - ChronoDuration::days(6) } else { day };
    inner.wellbeing.range(from.format("%Y-%m-%d").to_string()..).next().is_none().then_some(day)
}

/// Neck minutes done on this many days of the last four weeks add a step of repetitions (Andersen 2011: the
/// load grows as the muscles get used to it). Two steps at most; a break of a few weeks brings it back down.
const NECK_STEP_DAYS: usize = 8;
const NECK_MAX_LEVEL: usize = 2;

fn neck_level(stats: &Stats, today: NaiveDate) -> u8 {
    let days = (0..28)
        .map(|back| (today - ChronoDuration::days(back)).format("%Y-%m-%d").to_string())
        .filter(|k| stats.get(k).is_some_and(|d| d.kinds.neck.done > 0))
        .count();
    (days / NECK_STEP_DAYS).min(NECK_MAX_LEVEL) as u8
}

/// "Not now" three evenings in a row: the questions offer once to come weekly instead.
const WELLBEING_LATER_OFFER: u32 = 3;

/// Wellbeing entries kept: more than a year of daily entries.
const WELLBEING_KEPT: usize = 400;

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
    update_check: updates::Check,
    /// The evening wellbeing card was shown for this work day: once is enough.
    wellbeing_card: Option<NaiveDate>,
    reminders: reminders::State,
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
    /// The evening wellbeing questions are due (not answered, not put off).
    wellbeing_due: bool,
    /// The work day the evening answers are about ("2026-10-06"); for a night shift, the day it started.
    wellbeing_day: Option<String>,
    /// "Not now" was pressed three evenings in a row: offer to ask once a week.
    wellbeing_offer_weekly: bool,
    /// Seconds the break screen waits for "Did it work out?"; 0 when the setting is off.
    confirm_sec: u64,
    /// 0..=2: how far the daily neck minutes have progressed, see `neck_level`.
    neck_level: u8,
}

fn app_info(app: &AppHandle, inner: &Inner) -> AppInfo {
    let language = inner.lang();
    let now = Local::now().naive_local();
    let due = wellbeing_due(inner, now);
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
        wellbeing_due: due.is_some(),
        wellbeing_day: due.map(|d| d.format("%Y-%m-%d").to_string()),
        wellbeing_offer_weekly: inner.settings.wellbeing_every == "day"
            && inner.settings.wellbeing_later >= WELLBEING_LATER_OFFER
            && !inner.settings.wellbeing_weekly_offered,
        confirm_sec: confirm_sec(&inner.settings, BreakKind::Movement),
        neck_level: neck_level(&inner.stats, now.date()),
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
    let old_reminders = std::mem::take(&mut inner.settings.reminders);
    // The window may hold an older copy of what the app itself keeps about the evening questions.
    let mut settings = settings;
    settings.wellbeing_dismissed = inner.settings.wellbeing_dismissed.clone();
    settings.wellbeing_later = inner.settings.wellbeing_later;
    settings.wellbeing_weekly_offered = inner.settings.wellbeing_weekly_offered;
    inner.settings = settings.sanitized();
    // Reminders added or given new times don't catch up with today's times already past.
    let now = Local::now().naive_local();
    for r in inner.settings.reminders.clone() {
        let old = old_reminders.iter().find(|o| o.id == r.id);
        if old.is_none_or(|o| o.times != r.times || o.days != r.days || o.kind != r.kind || !o.enabled) {
            inner.reminders.skip_past(&r, now);
        }
    }
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
            let mut stats = inner.stats.get(&day).copied().unwrap_or_default();
            // Start and end came with 0.1.8: an earlier start from before the update, or a day with none recorded,
            // is taken from the hours of the time-per-program data (to the minute within the hour).
            if let Some((start, end)) = inner.usage.get(&day).map(|u| u.work_span()) {
                if let Some(s) = start {
                    stats.first_active_min = Some(stats.first_active_min.map_or(s, |f| f.min(s)));
                }
                if let Some(e) = end {
                    stats.last_active_min = Some(stats.last_active_min.map_or(e, |l| l.max(e)));
                }
            }
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

/// The answers to the evening questions: the entry of the work day they are about. `day` is the one the
/// questions were asked for (a card may wait past midnight or past the evening); without it, the current work
/// day (a night shift's answers in the morning belong to the day it started).
#[tauri::command]
fn save_wellbeing(app: AppHandle, window: WebviewWindow, state: State<AppState>, answers: Wellbeing, day: Option<String>) -> WellbeingLog {
    let mut inner = state.0.lock().unwrap();
    let now = Local::now().naive_local();
    let asked = day
        .and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        .filter(|d| *d <= now.date() && now.date() - *d <= ChronoDuration::days(2));
    let day = asked
        .or_else(|| scheduler::evening(&inner.settings, now))
        .unwrap_or_else(|| scheduler::work_day(&inner.settings, now))
        .format("%Y-%m-%d")
        .to_string();
    inner.wellbeing.insert(day, answers.sanitized());
    settings::trim_days(&mut inner.wellbeing, WELLBEING_KEPT);
    settings::save(&inner.path("wellbeing.json"), &inner.wellbeing);
    if inner.settings.wellbeing_later > 0 {
        inner.settings.wellbeing_later = 0;
        settings::save(&inner.path("settings.json"), &inner.settings);
    }
    let log = inner.wellbeing.clone();
    let info = app_info(&app, &inner);
    drop(inner);
    let _ = app.emit("app-info", &info);
    close_wellbeing_card(&app, &window);
    log
}

/// Answered or put off somewhere else (end of day screen, settings): the evening card has nothing left to ask.
fn close_wellbeing_card(app: &AppHandle, from: &WebviewWindow) {
    if from.label() == overlay::WELLBEING_LABEL {
        return;
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || overlay::close_prefix(&handle, overlay::WELLBEING_LABEL));
}

/// The journal in the settings window: add or fix the entry of any past day.
#[tauri::command]
fn set_wellbeing(window: WebviewWindow, state: State<AppState>, day: String, answers: Wellbeing) -> Result<WellbeingLog, String> {
    from_settings(&window)?;
    let date = NaiveDate::parse_from_str(&day, "%Y-%m-%d").map_err(|_| "bad date".to_string())?;
    if date > Local::now().date_naive() {
        return Err("future date".into());
    }
    let mut inner = state.0.lock().unwrap();
    inner.wellbeing.insert(date.format("%Y-%m-%d").to_string(), answers.sanitized());
    settings::trim_days(&mut inner.wellbeing, WELLBEING_KEPT);
    settings::save(&inner.path("wellbeing.json"), &inner.wellbeing);
    Ok(inner.wellbeing.clone())
}

#[tauri::command]
fn delete_wellbeing(window: WebviewWindow, state: State<AppState>, day: String) -> Result<WellbeingLog, String> {
    from_settings(&window)?;
    let mut inner = state.0.lock().unwrap();
    inner.wellbeing.remove(&day);
    settings::save(&inner.path("wellbeing.json"), &inner.wellbeing);
    Ok(inner.wellbeing.clone())
}

/// "Done" or "Later" on a reminder card. The card closes itself.
#[tauri::command]
fn reminder_answer(window: WebviewWindow, state: State<AppState>, id: String, later_min: Option<i64>) {
    let now = Local::now().naive_local();
    {
        let mut inner = state.0.lock().unwrap();
        match later_min {
            Some(min) => inner.reminders.snooze(&id, now, min.clamp(1, 240)),
            None => inner.reminders.done(&id),
        }
    }
    if window.label().starts_with("cue-") {
        let _ = window.destroy();
    }
}

/// "Show" next to a reminder in the settings.
#[tauri::command]
fn preview_reminder(app: AppHandle, window: WebviewWindow, state: State<AppState>, id: String) -> Result<(), String> {
    from_settings(&window)?;
    let (lang, s) = {
        let inner = state.0.lock().unwrap();
        (inner.lang(), inner.settings.clone())
    };
    let title = s.reminders.iter().find(|r| r.id == id).map(|r| r.title.clone()).unwrap_or_default();
    let handle = app.clone();
    app.run_on_main_thread(move || overlay::show_reminder(&handle, &id, &title, lang, &s.theme, s.cue_sound, true))
        .map_err(|e| e.to_string())
}

/// "Not now" on the evening questions: not again for this work day. `weekly`: the answer to "Ask once a week?".
#[tauri::command]
fn dismiss_wellbeing(app: AppHandle, window: WebviewWindow, state: State<AppState>, weekly: Option<bool>) {
    let mut inner = state.0.lock().unwrap();
    let now = Local::now().naive_local();
    let day = scheduler::evening(&inner.settings, now).unwrap_or_else(|| scheduler::work_day(&inner.settings, now));
    let s = &mut inner.settings;
    s.wellbeing_dismissed = Some(day.format("%Y-%m-%d").to_string());
    match weekly {
        Some(yes) => {
            s.wellbeing_weekly_offered = true;
            if yes {
                s.wellbeing_every = "week".into();
            }
        }
        None => s.wellbeing_later += 1,
    }
    settings::save(&inner.path("settings.json"), &inner.settings);
    let info = app_info(&app, &inner);
    drop(inner);
    let _ = app.emit("app-info", &info);
    close_wellbeing_card(&app, &window);
}

/// "Keep every evening" in answer to "Ask once a week?": the offer doesn't come back.
#[tauri::command]
fn keep_wellbeing_daily(state: State<AppState>) {
    let mut inner = state.0.lock().unwrap();
    inner.settings.wellbeing_weekly_offered = true;
    inner.settings.wellbeing_later = 0;
    settings::save(&inner.path("settings.json"), &inner.settings);
}

/// The answer on the break screen. `sec`: how long the break program really took, counted for done breaks.
/// "missed": nobody answered in time; the scheduler knows whether the user was at the computer meanwhile.
#[tauri::command]
fn break_result(app: AppHandle, state: State<AppState>, result: String, sec: Option<u64>) {
    let result = match result.as_str() {
        "done" => BreakResult::Done,
        "postponed" => BreakResult::Postponed,
        "missed" => state.0.lock().unwrap().sched.timeout_result(),
        _ => BreakResult::Skipped,
    };
    finish_break(&app, result, sec.unwrap_or(0));
    overlay::close_break(&app);
}

/// Ends the current break: statistics, timers, tray. Also called when the break windows were closed
/// without an answer (Alt+F4, a crashed page), so reminders never stop for good.
fn finish_break(app: &AppHandle, result: BreakResult, sec: u64) {
    let state = app.state::<AppState>();
    let mut inner = state.0.lock().unwrap();
    let settings = inner.settings.clone();
    // The break goes to the day it started: an answer after midnight or after the laptop slept is still that day's.
    let started = inner.sched.break_started.unwrap_or_else(|| Local::now().naive_local());
    if let Some((info, sitting)) = inner.sched.finish(&settings, result, scale()) {
        if info.kind != BreakKind::EndOfDay {
            inner.stats.entry(day_key(started)).or_default().record(info.kind, result, sec, settings.confirm_done);
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

/// "Try now" on the Result page: that break right away, as from the tray.
#[tauri::command]
fn start_break(app: AppHandle, window: WebviewWindow, kind: String) -> Result<(), String> {
    from_settings(&window)?;
    let kind = match kind.as_str() {
        "micro" => BreakKind::Micro,
        "movement" => BreakKind::Movement,
        "neck" => BreakKind::NeckStrength,
        "breathing" => BreakKind::Breathing,
        _ => return Err("unknown break".into()),
    };
    let handle = app.clone();
    app.run_on_main_thread(move || start_break_now(&handle, kind)).map_err(|e| e.to_string())
}

/// The "Result" page: what was done and how the user felt, see result.rs.
#[tauri::command]
fn get_result(state: State<AppState>, days: u32) -> result::ResultView {
    let inner = state.0.lock().unwrap();
    result::build(&inner.stats, &inner.wellbeing, Local::now().date_naive(), days)
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

/// "Show" next to a gentle cue in the settings: the cue right now, whatever the schedule, work hours or calls say.
#[tauri::command]
fn preview_cue(app: AppHandle, window: WebviewWindow, state: State<AppState>, cue: String) -> Result<(), String> {
    from_settings(&window)?;
    let cue = match cue.as_str() {
        "blink" => Cue::Blink,
        "posture" => Cue::Posture,
        "water" => Cue::Water,
        _ => return Err("unknown cue".into()),
    };
    let (lang, s) = {
        let inner = state.0.lock().unwrap();
        (inner.lang(), inner.settings.clone())
    };
    let handle = app.clone();
    app.run_on_main_thread(move || {
        overlay::show_cue(&handle, cue, lang, i18n::is_cis(lang), &s.theme, s.blink_cue_sec, s.cue_sound)
    })
        .map_err(|e| e.to_string())
}

/// A cue window is drawn and transparent: show it now (see overlay::show_cue).
#[tauri::command]
fn cue_ready(window: WebviewWindow) {
    if window.label().starts_with("cue-") {
        let _ = window.show();
    }
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

fn build_menu(
    app: &AppHandle,
    lang: &str,
    update: Option<&str>,
    check: updates::Check,
) -> tauri::Result<(Menu<Wry>, TrayItems)> {
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
            &item("wellbeing", "tray.wellbeing")?,
            &item("settings", "tray.settings")?,
            &item("about", "tray.about")?,
            &item("thanks", "tabs.thanks")?,
        ],
    )?;
    if i18n::is_cis(lang) {
        menu.append(&item("mzr", "tray.mzr")?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if let Some(version) = update {
        let text = i18n::t(lang, "tray.update", &[("v", version)]);
        menu.append(&MenuItem::with_id(app, "update", text, true, None::<&str>)?)?;
    } else {
        // "Check for updates", and the answer in the same item: macOS shows no notifications without a permission
        // the app never asks for.
        let (key, enabled) = match check {
            updates::Check::Idle => ("tray.checkUpdates", true),
            updates::Check::Checking => ("tray.checking", false),
            updates::Check::UpToDate => ("tray.upToDate", true),
            updates::Check::Failed => ("tray.checkFailed", true),
            updates::Check::Downloading(Some(_)) => ("tray.downloading", false),
            updates::Check::Downloading(None) => ("tray.downloadingNoPct", false),
            updates::Check::Installing => ("tray.installing", false),
        };
        let pct = match check {
            updates::Check::Downloading(Some(p)) => p.to_string(),
            _ => String::new(),
        };
        let text = i18n::t(lang, key, &[("v", env!("CARGO_PKG_VERSION")), ("pct", &pct)]);
        menu.append(&MenuItem::with_id(app, "check_updates", text, enabled, None::<&str>)?)?;
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
        let (lang, version, check) = {
            let inner = state.0.lock().unwrap();
            (inner.lang(), inner.update.as_ref().map(|u| u.version.clone()), inner.update_check)
        };
        let Ok((menu, items)) = build_menu(&handle, lang, version.as_deref(), check) else { return };
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
fn present_break(app: &AppHandle, info: scheduler::BreakInfo, lang: &'static str, sound: bool, tip: usize, confirm: u64) {
    if overlay::show_break(app, info, lang, sound, tip, confirm) == 0 {
        let state = app.state::<AppState>();
        let mut inner = state.0.lock().unwrap();
        inner.sched.current = None;
        inner.sched.break_started = None;
    }
}

fn start_break_now(app: &AppHandle, kind: BreakKind) {
    let state = app.state::<AppState>();
    let mut inner = state.0.lock().unwrap();
    let settings = inner.settings.clone();
    let Some(info) = inner.sched.start_now(&settings, kind, scale(), Local::now().naive_local()) else { return };
    let (lang, tip) = (inner.lang(), inner.tip);
    drop(inner);
    present_break(app, info, lang, settings.sound_enabled, tip, confirm_sec(&settings, info.kind));
}

/// Downloads and installs the update found earlier, then restarts. If it fails, the update stays in the tray.
fn install_update(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut inner = state.0.lock().unwrap();
    let Some(update) = inner.update.take() else { return };
    // The updater may end the process without the usual exit events (Windows): save now.
    inner.save_stats();
    inner.save_usage();
    inner.update_check = updates::Check::Downloading(Some(0));
    drop(inner);
    rebuild_tray(app);
    let progress = app.clone();
    let handle = app.clone();
    updates::install(
        app.clone(),
        update,
        move |check| {
            progress.state::<AppState>().0.lock().unwrap().update_check = check;
            rebuild_tray(&progress);
        },
        move |failed| {
            let lang = {
                let state = handle.state::<AppState>();
                let mut inner = state.0.lock().unwrap();
                inner.update = Some(failed);
                inner.update_check = updates::Check::Idle;
                inner.lang()
            };
            rebuild_tray(&handle);
            use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
            handle
                .dialog()
                .message(i18n::t(lang, "tray.installFailed", &[]))
                .title(i18n::t(lang, "app.name", &[]))
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCustom("OK".into()))
                .show(|_| {});
        },
    );
}

/// The answer to "Check for updates" in a window: the tray item alone was easy to miss.
/// `found` is the new version; without one, `check` says whether this version is the latest or the check failed.
fn show_update_answer(app: &AppHandle, lang: &'static str, found: Option<String>, check: updates::Check) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let current = env!("CARGO_PKG_VERSION");
    let title = i18n::t(lang, "app.name", &[]);
    match found {
        Some(version) => {
            let text = i18n::t(lang, "tray.updateFound", &[("v", &version), ("current", current)]);
            let buttons =
                MessageDialogButtons::OkCancelCustom(i18n::t(lang, "tray.updateNow", &[]), i18n::t(lang, "tray.later", &[]));
            let handle = app.clone();
            app.dialog().message(text).title(title).kind(MessageDialogKind::Info).buttons(buttons).show(move |install| {
                if install {
                    install_update(&handle);
                }
            });
        }
        None => {
            let (text, kind) = if check == updates::Check::Failed {
                (i18n::t(lang, "tray.checkFailedLong", &[]), MessageDialogKind::Warning)
            } else {
                (i18n::t(lang, "tray.upToDate", &[("v", current)]), MessageDialogKind::Info)
            };
            app.dialog()
                .message(text)
                .title(title)
                .kind(kind)
                .buttons(MessageDialogButtons::OkCustom("OK".into()))
                .show(|_| {});
        }
    }
}

/// The site's "Say thanks" page in the app's language: English at the root, the others under /<code>/.
fn donate_url(lang: &str) -> String {
    if lang == "en" {
        format!("{SITE_URL}/donate/")
    } else {
        format!("{SITE_URL}/{}/donate/", lang.to_lowercase())
    }
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
        "wellbeing" => overlay::show_settings(app, "stats/wellbeing"),
        "settings" => overlay::show_settings(app, "settings"),
        "about" => overlay::show_settings(app, "about"),
        "mzr" => {
            let _ = app.opener().open_url(format!("{MZR_URL}&utm_content=tray"), None::<&str>);
        }
        "thanks" => {
            let lang = app.state::<AppState>().0.lock().unwrap().lang();
            let _ = app.opener().open_url(donate_url(lang), None::<&str>);
        }
        "update" => install_update(app),
        "check_updates" => {
            app.state::<AppState>().0.lock().unwrap().update_check = updates::Check::Checking;
            rebuild_tray(app);
            let handle = app.clone();
            updates::check_now(app.clone(), move |result| {
                let (lang, found, check) = {
                    let state = handle.state::<AppState>();
                    let mut inner = state.0.lock().unwrap();
                    let found = result.as_ref().ok().and_then(|u| u.as_ref().map(|u| u.version.clone()));
                    inner.update_check = match result {
                        Ok(Some(update)) => {
                            inner.update = Some(update);
                            updates::Check::Idle
                        }
                        Ok(None) => updates::Check::UpToDate,
                        Err(()) => updates::Check::Failed,
                    };
                    (inner.lang(), found, inner.update_check)
                };
                rebuild_tray(&handle);
                show_update_answer(&handle, lang, found, check);
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
                let minute = (now.hour() * 60 + now.minute()) as u16;
                // The tick's own time for the day key too: at 23:59:59 the minute must not land in tomorrow.
                let today = inner.stats.entry(day_key(now)).or_default();
                today.active_sec += 1;
                today.first_active_min.get_or_insert(minute);
                today.last_active_min = Some(minute);
                if let Some(app_name) = front.filter(|_| out.quiet != Quiet::OutsideHours) {
                    let key = day_key(now);
                    let Inner { tracker, usage, .. } = &mut *inner;
                    tracker.record(usage, &key, now.hour(), &app_name, &s.usage_excluded, 1);
                }
            }
            if let Some(sec) = out.sitting_ended {
                sitting_ended(&mut inner, sec);
            }
            // A break the user rested away from the computer: not shown, counted as away.
            if let Some(info) = out.rested {
                inner.stats.entry(day_key(now)).or_default().record(info.kind, BreakResult::Away, 0, s.confirm_done);
            }
            // The evening questions in a small card: once a work day, while the user is at the computer and nothing
            // asks for quiet. On Wayland there is no card: the tray item is the way.
            let wayland = std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland");
            // "Work day is over" asks the questions itself: no card after it, even after "Keep working".
            if matches!(out.action, Action::Break(scheduler::BreakInfo { kind: BreakKind::EndOfDay, .. })) {
                if let Some(day) = wellbeing_due(&inner, now) {
                    inner.wellbeing_card = Some(day);
                }
            }
            let evening_card = match wellbeing_due(&inner, now) {
                Some(day)
                    if out.active
                        && out.quiet == Quiet::None
                        && !probe.fullscreen
                        && idle < scheduler::ACTIVE_IDLE_SEC
                        && inner.sched.current.is_none()
                        && out.action == Action::None
                        && inner.wellbeing_card != Some(day)
                        && !wayland =>
                {
                    inner.wellbeing_card = Some(day);
                    true
                }
                _ => false,
            };
            // Own reminders. Interval ones count only at the computer within working hours and when nothing asks
            // for quiet. During a break, a call, Do Not Disturb, focus, a pause or fullscreen everything waits a minute.
            let quiet = matches!(out.quiet, Quiet::Call | Quiet::DoNotDisturb | Quiet::Focus | Quiet::Paused) || probe.fullscreen;
            let counting = out.active && !quiet && scheduler::in_work_hours(&s, now);
            let mut due = inner.reminders.due(&s.reminders, now, counting, 1);
            if inner.sched.current.is_some() || quiet {
                for id in &due {
                    inner.reminders.snooze(id, now, 1);
                }
                due.clear();
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
            let (blink_sec, cue_sound) = (s.blink_cue_sec, s.cue_sound);
            drop(inner);
            if n % 5 == 0 || out.action != Action::None {
                refresh_tray(&app);
            }

            let handle = app.clone();
            if let Some(result) = out.expired {
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    finish_break(&h, result, 0);
                    overlay::close_break(&h);
                });
            }
            if evening_card {
                let (h, theme) = (app.clone(), s.theme.clone());
                let _ = app.run_on_main_thread(move || overlay::show_wellbeing(&h, lang, &theme));
            }
            match out.action {
                Action::Break(info) => {
                    let confirm = confirm_sec(&s, info.kind);
                    let _ = app.run_on_main_thread(move || present_break(&handle, info, lang, sound, tip, confirm));
                }
                Action::Cue(cue) => {
                    let _ = app.run_on_main_thread(move || overlay::show_cue(&handle, cue, lang, is_cis, &theme, blink_sec, cue_sound));
                }
                Action::None => {}
            }
            for id in due {
                let title = s.reminders.iter().find(|r| r.id == id).map(|r| r.title.clone()).unwrap_or_default();
                let (handle, theme) = (app.clone(), s.theme.clone());
                let _ = app.run_on_main_thread(move || overlay::show_reminder(&handle, &id, &title, lang, &theme, cue_sound, false));
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
            get_result,
            start_break,
            get_usage,
            clear_usage,
            get_wellbeing,
            save_wellbeing,
            set_wellbeing,
            delete_wellbeing,
            reminder_answer,
            preview_reminder,
            break_result,
            water_drunk,
            close_cue,
            cue_ready,
            preview_cue,
            save_png,
            dismiss_wellbeing,
            keep_wellbeing_daily,
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
                update_check: updates::Check::Idle,
                wellbeing_card: None,
                reminders: reminders::State::default(),
            };

            let handle = app.handle().clone();
            let (menu, items) = build_menu(&handle, inner.lang(), None, updates::Check::Idle)?;
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
                finish_break(app, BreakResult::Skipped, 0);
            }
            if !others {
                overlay::show_reminder_cards(app);
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
