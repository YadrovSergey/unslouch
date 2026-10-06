use crate::scheduler::{BreakKind, BreakResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Body parts the user wants to look after. Exercises are picked only from enabled sections.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Sections {
    pub eyes: bool,
    pub neck: bool,
    pub back: bool,
    pub hands: bool,
    pub legs: bool,
    pub breath: bool,
}

impl Default for Sections {
    fn default() -> Self {
        Sections { eyes: true, neck: true, back: true, hands: true, legs: true, breath: false }
    }
}

/// Defaults follow the research summary in docs/science: a micro-break every 20 minutes (eyes + one small
/// exercise), stand up every 45 minutes, gentle cues in between.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// "recommended" | "pomodoro" | "hourly" | "custom". The interface fills the numbers, Rust only stores it.
    pub preset: String,
    pub sections: Sections,

    pub micro_enabled: bool,
    pub micro_interval_min: u32,
    /// Look into the distance, seconds. The exercise after it adds its own time.
    pub micro_look_sec: u32,

    pub movement_enabled: bool,
    pub movement_interval_min: u32,
    pub movement_duration_min: u32,

    /// Optional long break (lunch, walk). Off by default.
    pub long_enabled: bool,
    pub long_interval_min: u32,
    pub long_duration_min: u32,

    pub blink_cue_enabled: bool,
    pub blink_interval_min: u32,
    /// How long the screen edges stay dark. 1.5 s was easy to miss.
    pub blink_cue_sec: u32,
    pub posture_cue_enabled: bool,
    pub posture_interval_min: u32,
    pub water_enabled: bool,
    pub water_interval_min: u32,
    /// A soft sound with every gentle cue (blink, posture, water). Off by default: the cues are meant to be quiet.
    pub cue_sound: bool,
    /// The user's own reminders (pills, lunch…), see reminders.rs.
    pub reminders: Vec<crate::reminders::Reminder>,

    /// Once a day: 2 minutes for neck and shoulders (Andersen 2011).
    pub neck_daily: bool,
    /// Once a day: a minute of slow breathing in the afternoon.
    pub breathing_daily: bool,

    pub end_of_day_enabled: bool,
    /// "HH:MM"
    pub end_of_day_time: String,

    pub work_hours_enabled: bool,
    /// 1 = Monday … 7 = Sunday
    pub work_days: Vec<u32>,
    pub work_start: String,
    pub work_end: String,

    /// After the countdown the break waits for "Done" or "Not this time"; no answer means the user was away.
    /// Off: the break counts as done when the countdown ends, as before 0.1.14.
    pub confirm_done: bool,
    /// After "Done", a short summary card: what was done today, the neck routine's progress.
    pub show_summary: bool,
    /// "day" | "week": how often the evening wellbeing questions come.
    pub wellbeing_every: String,
    /// The work day ("2026-10-06") whose wellbeing questions were put off with "Not now".
    pub wellbeing_dismissed: Option<String>,
    /// "Not now" in a row: after three the questions offer to come once a week, once.
    pub wellbeing_later: u32,
    pub wellbeing_weekly_offered: bool,

    pub snooze_min: u32,
    /// Away from the computer this long counts as having got up.
    pub idle_reset_min: u32,
    pub pause_on_calls: bool,
    pub pause_in_fullscreen: bool,
    pub respect_dnd: bool,

    pub sound_enabled: bool,
    /// "system" | "light" | "dark"
    pub theme: String,
    /// None means the system language.
    pub language: Option<String>,
    pub check_updates: bool,

    pub usage_enabled: bool,
    pub usage_excluded: Vec<String>,
    /// Program → "work" | "communication" | "entertainment" | "other", set by the user.
    pub usage_categories: BTreeMap<String, String>,

    pub onboarding_done: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            preset: "recommended".into(),
            sections: Sections::default(),
            micro_enabled: true,
            micro_interval_min: 20,
            micro_look_sec: 20,
            movement_enabled: true,
            movement_interval_min: 45,
            movement_duration_min: 3,
            long_enabled: false,
            long_interval_min: 150,
            long_duration_min: 10,
            blink_cue_enabled: true,
            blink_interval_min: 5,
            blink_cue_sec: 4,
            posture_cue_enabled: true,
            posture_interval_min: 30,
            water_enabled: true,
            water_interval_min: 90,
            cue_sound: false,
            reminders: vec![],
            neck_daily: false,
            breathing_daily: false,
            end_of_day_enabled: false,
            end_of_day_time: "19:00".into(),
            work_hours_enabled: true,
            work_days: vec![1, 2, 3, 4, 5],
            work_start: "09:00".into(),
            work_end: "19:00".into(),
            confirm_done: true,
            show_summary: true,
            wellbeing_every: "day".into(),
            wellbeing_dismissed: None,
            wellbeing_later: 0,
            wellbeing_weekly_offered: false,
            snooze_min: 5,
            idle_reset_min: 5,
            pause_on_calls: true,
            pause_in_fullscreen: true,
            respect_dnd: true,
            sound_enabled: true,
            theme: "system".into(),
            language: None,
            check_updates: true,
            usage_enabled: true,
            usage_excluded: vec![],
            usage_categories: BTreeMap::new(),
            onboarding_done: false,
        }
    }
}

/// "09:30" → minutes since midnight.
pub fn parse_hhmm(s: &str) -> Option<u32> {
    let (h, m) = s.split_once(':')?;
    let (h, m): (u32, u32) = (h.trim().parse().ok()?, m.trim().parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

impl Settings {
    /// Guards against a hand-edited file or a broken form: no zero intervals, valid times.
    pub fn sanitized(mut self) -> Self {
        let d = Settings::default();
        self.micro_interval_min = self.micro_interval_min.clamp(5, 120);
        self.micro_look_sec = self.micro_look_sec.clamp(10, 120);
        self.movement_interval_min = self.movement_interval_min.clamp(15, 180);
        self.movement_duration_min = self.movement_duration_min.clamp(1, 30);
        self.long_interval_min = self.long_interval_min.clamp(60, 480);
        self.long_duration_min = self.long_duration_min.clamp(5, 60);
        self.blink_interval_min = self.blink_interval_min.clamp(1, 60);
        self.blink_cue_sec = self.blink_cue_sec.clamp(2, 10);
        self.reminders.truncate(crate::reminders::MAX_REMINDERS);
        self.reminders = std::mem::take(&mut self.reminders).into_iter().enumerate().map(|(i, r)| r.sanitized(i)).collect();
        self.posture_interval_min = self.posture_interval_min.clamp(10, 120);
        self.water_interval_min = self.water_interval_min.clamp(30, 240);
        self.snooze_min = self.snooze_min.clamp(1, 60);
        self.idle_reset_min = self.idle_reset_min.clamp(1, 60);
        if parse_hhmm(&self.end_of_day_time).is_none() {
            self.end_of_day_time = d.end_of_day_time;
        }
        if parse_hhmm(&self.work_start).is_none() {
            self.work_start = d.work_start;
        }
        if parse_hhmm(&self.work_end).is_none() {
            self.work_end = d.work_end;
        }
        self.work_days.retain(|d| (1..=7).contains(d));
        self.work_days.sort_unstable();
        self.work_days.dedup();
        // No work days at all would silence the app for good.
        if self.work_days.is_empty() {
            self.work_days = d.work_days.clone();
        }
        if !["system", "light", "dark"].contains(&self.theme.as_str()) {
            self.theme = d.theme;
        }
        if !["day", "week"].contains(&self.wellbeing_every.as_str()) {
            self.wellbeing_every = d.wellbeing_every;
        }
        self
    }
}

/// One kind of break in a day: done, skipped, or nobody answered (away).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct KindCount {
    pub done: u32,
    pub skipped: u32,
    pub away: u32,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct KindStats {
    pub micro: KindCount,
    pub movement: KindCount,
    pub long: KindCount,
    pub neck: KindCount,
    pub breathing: KindCount,
}

/// `DayStats::v` of days counted with "Did it work out?": their "done" means the user said so.
pub const STATS_CONFIRMED: u8 = 2;
/// One break never adds more than this to the time on breaks, whatever the page says.
const MAX_BREAK_SEC: u64 = 2 * 60 * 60;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct DayStats {
    /// Breaks of any kind finished to the end (since 0.1.14 with confirmation: the user said "Done").
    pub done: u32,
    pub skipped: u32,
    pub postponed: u32,
    /// Nobody answered and nobody was at the computer, or the user was away when the break fell due.
    /// Neither done nor skipped: it stays out of the share of breaks done.
    pub away: u32,
    /// Seconds of breaks done.
    pub break_sec: u64,
    /// Since 0.1.14, per kind of break. Empty on older days.
    pub kinds: KindStats,
    /// `STATS_CONFIRMED` on days counted with confirmation; 0 on older days.
    pub v: u8,
    pub micro_done: u32,
    pub movement_done: u32,
    pub water: u32,
    /// Seconds at the computer (not idle).
    pub active_sec: u64,
    /// Longest stretch of sitting without getting up.
    pub longest_sitting_sec: u64,
    /// Stretches longer than 2 hours: the risk threshold from Healy 2010.
    pub sitting_over_2h: u32,
    /// First and last active minute of the day (minutes after local midnight): when work started and ended.
    pub first_active_min: Option<u16>,
    pub last_active_min: Option<u16>,
}

/// Day ("2026-09-27") → counters.
pub type Stats = BTreeMap<String, DayStats>;

impl DayStats {
    /// A break finished with `result`. `sec`: how long it really took (done breaks only). `confirmed`: the
    /// break screen asked "Did it work out?".
    pub fn record(&mut self, kind: BreakKind, result: BreakResult, sec: u64, confirmed: bool) {
        let count = match kind {
            BreakKind::Micro => &mut self.kinds.micro,
            BreakKind::Movement => &mut self.kinds.movement,
            BreakKind::Long => &mut self.kinds.long,
            BreakKind::NeckStrength => &mut self.kinds.neck,
            BreakKind::Breathing => &mut self.kinds.breathing,
            BreakKind::EndOfDay => return,
        };
        match result {
            BreakResult::Done => {
                count.done += 1;
                self.done += 1;
                self.break_sec += sec.min(MAX_BREAK_SEC);
                match kind {
                    BreakKind::Micro => self.micro_done += 1,
                    BreakKind::Movement | BreakKind::Long => self.movement_done += 1,
                    _ => {}
                }
            }
            BreakResult::Skipped => {
                count.skipped += 1;
                self.skipped += 1;
            }
            BreakResult::Away => {
                count.away += 1;
                self.away += 1;
            }
            BreakResult::Postponed => self.postponed += 1,
        }
        if confirmed {
            self.v = STATS_CONFIRMED;
        }
    }
}

/// Day ("2026-09-29") → answers 0..=3 for eyes, neck, back, hands and a short note. Before 0.1.8 the check was
/// weekly and keyed by the week's Monday: those entries read as entries of that Monday.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct Wellbeing {
    pub eyes: u8,
    pub neck: u8,
    pub back: u8,
    pub hands: u8,
    pub note: String,
}

impl Wellbeing {
    pub fn sanitized(mut self) -> Self {
        self.eyes = self.eyes.min(3);
        self.neck = self.neck.min(3);
        self.back = self.back.min(3);
        self.hands = self.hands.min(3);
        self.note = self.note.trim().chars().take(500).collect();
        self
    }
}

pub type WellbeingLog = BTreeMap<String, Wellbeing>;

/// Keeps the newest `days` entries (keys are ISO dates, so they sort by time).
pub fn trim_days<V>(map: &mut BTreeMap<String, V>, days: usize) {
    while map.len() > days {
        let oldest = map.keys().next().cloned().unwrap();
        map.remove(&oldest);
    }
}

pub fn load<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save<T: Serialize>(path: &Path, value: &T) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    // Write to a temp file first so a crash never leaves half a file behind.
    let tmp: PathBuf = path.with_extension("tmp");
    if let Ok(json) = serde_json::to_string_pretty(value) {
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_times() {
        assert_eq!(parse_hhmm("09:30"), Some(570));
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("abc"), None);
    }

    #[test]
    fn old_settings_file_still_loads() {
        // v1 file had other fields: unknown ones are ignored, missing ones get defaults.
        let s: Settings = serde_json::from_str(r#"{"breakIntervalMin": 20, "language": "ru"}"#).unwrap();
        assert_eq!(s.language.as_deref(), Some("ru"));
        assert_eq!(s.micro_interval_min, 20);
    }

    #[test]
    fn records_breaks_by_kind() {
        let mut d = DayStats::default();
        d.record(BreakKind::Micro, BreakResult::Done, 45, true);
        d.record(BreakKind::Movement, BreakResult::Away, 0, true);
        d.record(BreakKind::Breathing, BreakResult::Skipped, 0, true);
        d.record(BreakKind::Micro, BreakResult::Postponed, 0, true);
        d.record(BreakKind::EndOfDay, BreakResult::Done, 0, true);
        assert_eq!((d.done, d.skipped, d.away, d.postponed), (1, 1, 1, 1));
        assert_eq!(d.kinds.micro, KindCount { done: 1, skipped: 0, away: 0 });
        assert_eq!(d.kinds.movement.away, 1);
        assert_eq!(d.kinds.breathing.skipped, 1);
        assert_eq!((d.micro_done, d.break_sec, d.v), (1, 45, STATS_CONFIRMED));
        d.record(BreakKind::Long, BreakResult::Done, 99_999, true);
        assert_eq!(d.break_sec, 45 + MAX_BREAK_SEC);
        assert_eq!(d.movement_done, 1);
    }

    #[test]
    fn old_stats_file_still_loads() {
        let stats: Stats = serde_json::from_str(
            r#"{"2026-09-01": {"done": 7, "skipped": 2, "postponed": 0, "microDone": 5, "movementDone": 2,
                "water": 1, "activeSec": 3600, "longestSittingSec": 1200, "sittingOver2h": 0,
                "firstActiveMin": 540, "lastActiveMin": 1080}}"#,
        )
        .unwrap();
        let d = stats["2026-09-01"];
        assert_eq!((d.done, d.away, d.break_sec, d.v), (7, 0, 0, 0));
        assert_eq!(d.kinds, KindStats::default());
    }

    #[test]
    fn sanitizes_bad_values() {
        let s = Settings { micro_interval_min: 0, work_start: "99:99".into(), work_days: vec![0, 3, 3, 9], ..Default::default() }
            .sanitized();
        assert_eq!(s.micro_interval_min, 5);
        assert_eq!(s.work_start, "09:00");
        assert_eq!(s.work_days, vec![3]);
        let none = Settings { work_days: vec![], ..Default::default() }.sanitized();
        assert_eq!(none.work_days, vec![1, 2, 3, 4, 5]);
    }
}
