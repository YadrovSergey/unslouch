//! What to show and when: breaks, gentle cues, sitting stretches. Pure logic: no windows, no system clock,
//! so every rule is covered by tests. Rationale for the numbers is in docs/science.

use crate::settings::{parse_hhmm, Settings};
use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike};
use serde::Serialize;

/// Cues only make sense while the user is at the keyboard.
const ACTIVE_IDLE_SEC: u64 = 30;
/// Still typing: a break waits for a pause in typing, at most a minute.
const TYPING_IDLE_SEC: u64 = 2;
const TYPING_MAX_WAIT_SEC: u64 = 60;
const FULLSCREEN_MAX_WAIT_SEC: u64 = 10 * 60;
const CALL_MAX_WAIT_SEC: u64 = 30 * 60;
/// A micro-break this close to a stand-up break is dropped: the stand-up break does the job.
const MICRO_SKIP_BEFORE_MOVEMENT_SEC: u64 = 3 * 60;
/// No blink cue right before a micro-break.
const NO_CUE_BEFORE_BREAK_SEC: u64 = 60;
/// Daily extras come with the first micro-break after this time.
const NECK_DAILY_AFTER_MIN: u32 = 11 * 60;
const BREATHING_DAILY_AFTER_MIN: u32 = 15 * 60;

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum BreakKind {
    /// Look into the distance + one small exercise.
    Micro,
    /// Stand up: back and legs exercises, walk, water.
    Movement,
    /// Optional long break.
    Long,
    /// Once a day, 2 minutes for neck and shoulders.
    NeckStrength,
    /// Slow breathing.
    Breathing,
    /// Work day is over.
    EndOfDay,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BreakInfo {
    pub kind: BreakKind,
    /// Look-into-the-distance seconds for Micro, total seconds for Movement/Long, 0 when the program sets it.
    pub duration_sec: u64,
    /// Which exercise from the enabled list: the interface takes `rotation % list.len()`.
    pub rotation: u32,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Cue {
    Blink,
    Posture,
    Water,
}

#[derive(Debug, PartialEq)]
pub enum Action {
    None,
    Break(BreakInfo),
    Cue(Cue),
}

/// Why reminders are silent right now; the tray shows it.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Quiet {
    None,
    Paused,
    OutsideHours,
    Focus,
    Call,
    DoNotDisturb,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BreakResult {
    Done,
    Skipped,
    Postponed,
}

/// What the system looks like this second.
#[derive(Clone, Copy, Debug)]
pub struct Context {
    pub now: NaiveDateTime,
    pub idle_sec: u64,
    pub fullscreen: bool,
    pub in_call: bool,
    pub dnd: bool,
    /// Seconds passed since the previous tick.
    pub dt: u64,
    /// Seconds in one settings minute: 60 normally, less in fast dev mode.
    pub scale: u64,
}

#[derive(Debug, PartialEq)]
pub struct TickOut {
    pub action: Action,
    pub quiet: Quiet,
    /// The user was at the computer this tick.
    pub active: bool,
    /// A sitting stretch just ended (the user got up), its length in seconds.
    pub sitting_ended: Option<u64>,
}

impl TickOut {
    fn quiet(quiet: Quiet) -> Self {
        TickOut { action: Action::None, quiet, active: false, sitting_ended: None }
    }
}

#[derive(Default, Debug)]
pub struct Scheduler {
    pub micro_sec: u64,
    pub move_sec: u64,
    pub long_sec: u64,
    pub blink_sec: u64,
    pub posture_sec: u64,
    pub water_sec: u64,
    /// Current stretch of sitting.
    pub sitting_sec: u64,
    pub micro_rotation: u32,
    pub move_rotation: u32,
    pub current: Option<BreakInfo>,
    pub paused_until: Option<NaiveDateTime>,
    pub focus_until: Option<NaiveDateTime>,
    movement_after_focus: bool,
    wait_sec: u64,
    typing_wait_sec: u64,
    neck_day: Option<NaiveDate>,
    breathing_day: Option<NaiveDate>,
    end_of_day: Option<NaiveDate>,
    /// Last tick the user was counted as at the computer: a long gap (night, sleep, pause) means they left.
    last_active: Option<NaiveDateTime>,
}

fn minutes(v: u32, scale: u64) -> u64 {
    v as u64 * scale
}

/// The work day `now` belongs to and minutes since it started. A night shift (22:00–06:00) belongs to the
/// day it started on, so Friday night shift stays "Friday" after midnight.
fn shift(s: &Settings, now: NaiveDateTime) -> (NaiveDate, u32) {
    let start = parse_hhmm(&s.work_start).unwrap_or(0);
    let t = now.hour() * 60 + now.minute();
    if t < start {
        // Before today's start: still the tail of yesterday's shift (or the gap before today's).
        (now.date() - chrono::Duration::days(1), t + 24 * 60 - start)
    } else {
        (now.date(), t - start)
    }
}

/// "Work day is over" is shown this long after the set time at most, so it never greets you in the morning.
const END_OF_DAY_WINDOW_MIN: u32 = 4 * 60;

/// Length of the work day in minutes; equal start and end mean round the clock.
fn shift_length(s: &Settings) -> u32 {
    let start = parse_hhmm(&s.work_start).unwrap_or(0);
    let end = parse_hhmm(&s.work_end).unwrap_or(0);
    match (end + 24 * 60 - start) % (24 * 60) {
        0 => 24 * 60,
        len => len,
    }
}

pub fn in_work_hours(s: &Settings, now: NaiveDateTime) -> bool {
    if !s.work_hours_enabled {
        return true;
    }
    let (day, offset) = shift(s, now);
    s.work_days.contains(&day.weekday().number_from_monday()) && offset < shift_length(s)
}

impl Scheduler {
    pub fn tick(&mut self, s: &Settings, c: &Context) -> TickOut {
        if self.current.is_some() {
            return TickOut::quiet(Quiet::None);
        }
        if let Some(until) = self.paused_until {
            if c.now < until {
                return TickOut::quiet(Quiet::Paused);
            }
            self.paused_until = None;
            self.reset_timers();
        }
        // End of the work day is checked before work hours: at 19:00 the day is already over.
        if let Some(info) = self.end_of_day_due(s, c) {
            self.current = Some(info);
            return TickOut { action: Action::Break(info), quiet: Quiet::None, active: true, sitting_ended: None };
        }
        if !in_work_hours(s, c.now) {
            return TickOut::quiet(Quiet::OutsideHours);
        }

        // Away long enough: the user got up, eyes and body rested. A long gap between active ticks (night,
        // laptop asleep, pause, hours off) counts the same. A call or a fullscreen video without touching
        // the keyboard is not "away": the user is still sitting.
        let reset = minutes(s.idle_reset_min, c.scale);
        let gap = self.last_active.map_or(0, |t| (c.now - t).num_seconds().max(0) as u64);
        let watching = c.in_call || c.fullscreen;
        if (c.idle_sec >= reset && !watching) || gap >= reset {
            let ended = (self.sitting_sec > 0).then_some(self.sitting_sec);
            self.sitting_sec = 0;
            self.micro_sec = 0;
            self.move_sec = 0;
            self.blink_sec = 0;
            self.posture_sec = 0;
            self.wait_sec = 0;
            self.typing_wait_sec = 0;
            self.movement_after_focus = false;
            if self.focus_until.is_some_and(|t| c.now >= t) {
                self.focus_until = None;
            }
            if c.idle_sec.max(gap) >= minutes(s.long_duration_min, c.scale) {
                self.long_sec = 0;
            }
            self.last_active = (c.idle_sec < reset).then_some(c.now);
            if c.idle_sec >= reset {
                return TickOut { action: Action::None, quiet: Quiet::None, active: false, sitting_ended: ended };
            }
            // Came back after a gap: this tick is already active again.
            let mut out = self.tick_active(s, c);
            out.sitting_ended = ended;
            return out;
        }
        self.last_active = Some(c.now);
        self.tick_active(s, c)
    }

    fn tick_active(&mut self, s: &Settings, c: &Context) -> TickOut {
        for v in [
            &mut self.micro_sec,
            &mut self.move_sec,
            &mut self.long_sec,
            &mut self.blink_sec,
            &mut self.posture_sec,
            &mut self.water_sec,
            &mut self.sitting_sec,
        ] {
            *v += c.dt;
        }
        let mut out = TickOut { action: Action::None, quiet: Quiet::None, active: true, sitting_ended: None };

        if let Some(until) = self.focus_until {
            if c.now < until {
                out.quiet = Quiet::Focus;
                return out;
            }
            self.focus_until = None;
            self.movement_after_focus = true;
        }

        let call = s.pause_on_calls && c.in_call;
        let dnd = s.respect_dnd && c.dnd;
        let fullscreen = s.pause_in_fullscreen && c.fullscreen;
        if call {
            out.quiet = Quiet::Call;
        } else if dnd {
            out.quiet = Quiet::DoNotDisturb;
        }

        if let Some(info) = self.due_break(s, c) {
            let max_wait = if call || dnd {
                CALL_MAX_WAIT_SEC
            } else if fullscreen {
                FULLSCREEN_MAX_WAIT_SEC
            } else {
                0
            };
            if self.wait_sec < max_wait {
                self.wait_sec += c.dt;
                return out;
            }
            if c.idle_sec < TYPING_IDLE_SEC && self.typing_wait_sec < TYPING_MAX_WAIT_SEC {
                self.typing_wait_sec += c.dt;
                return out;
            }
            self.wait_sec = 0;
            self.typing_wait_sec = 0;
            self.commit_break(&info, c);
            self.current = Some(info);
            out.action = Action::Break(info);
            return out;
        }
        self.wait_sec = 0;
        self.typing_wait_sec = 0;

        if call || dnd || fullscreen || c.idle_sec >= ACTIVE_IDLE_SEC {
            return out;
        }
        if s.water_enabled && self.water_sec >= minutes(s.water_interval_min, c.scale) {
            self.water_sec = 0;
            out.action = Action::Cue(Cue::Water);
        } else if s.posture_cue_enabled && self.posture_sec >= minutes(s.posture_interval_min, c.scale) {
            self.posture_sec = 0;
            out.action = Action::Cue(Cue::Posture);
        } else if s.blink_cue_enabled
            && self.blink_sec >= minutes(s.blink_interval_min, c.scale)
            && !(s.micro_enabled
                && minutes(s.micro_interval_min, c.scale).saturating_sub(self.micro_sec) < NO_CUE_BEFORE_BREAK_SEC)
        {
            self.blink_sec = 0;
            out.action = Action::Cue(Cue::Blink);
        }
        out
    }

    /// Which break is due now, highest priority first. Does not change state except dropping a micro-break
    /// that falls right before a stand-up break.
    fn due_break(&mut self, s: &Settings, c: &Context) -> Option<BreakInfo> {
        let today = c.now.date();
        let now_min = c.now.hour() * 60 + c.now.minute();

        if s.long_enabled && self.long_sec >= minutes(s.long_interval_min, c.scale) {
            return Some(BreakInfo {
                kind: BreakKind::Long,
                duration_sec: minutes(s.long_duration_min, c.scale),
                rotation: self.move_rotation,
            });
        }
        let movement_interval = minutes(s.movement_interval_min, c.scale);
        if self.movement_after_focus || (s.movement_enabled && self.move_sec >= movement_interval) {
            return Some(BreakInfo {
                kind: BreakKind::Movement,
                duration_sec: minutes(s.movement_duration_min, c.scale),
                rotation: self.move_rotation,
            });
        }
        // The micro-break clock runs even when micro-breaks are off: the daily neck minutes and breathing
        // ride on it, so they still come in Pomodoro mode.
        if self.micro_sec >= minutes(s.micro_interval_min, c.scale) {
            // Not while the break already waits for a call to end: dropping it would restart the wait.
            let waiting = self.wait_sec > 0 || self.typing_wait_sec > 0;
            if !waiting
                && s.movement_enabled
                && movement_interval.saturating_sub(self.move_sec) < MICRO_SKIP_BEFORE_MOVEMENT_SEC
            {
                self.micro_sec = 0;
                return None;
            }
            if s.neck_daily && s.sections.neck && self.neck_day != Some(today) && now_min >= NECK_DAILY_AFTER_MIN {
                return Some(BreakInfo { kind: BreakKind::NeckStrength, duration_sec: 0, rotation: 0 });
            }
            if s.breathing_daily && self.breathing_day != Some(today) && now_min >= BREATHING_DAILY_AFTER_MIN {
                return Some(BreakInfo { kind: BreakKind::Breathing, duration_sec: 0, rotation: 0 });
            }
            if !s.micro_enabled {
                self.micro_sec = 0;
                return None;
            }
            return Some(BreakInfo {
                kind: BreakKind::Micro,
                duration_sec: s.micro_look_sec as u64,
                rotation: self.micro_rotation,
            });
        }
        None
    }

    /// "Work day is over" once per work day, when the set time is reached, only on work days and while the
    /// user is at the computer. Night shifts count from their start.
    fn end_of_day_due(&mut self, s: &Settings, c: &Context) -> Option<BreakInfo> {
        if !s.end_of_day_enabled || c.idle_sec >= ACTIVE_IDLE_SEC {
            return None;
        }
        let eod = parse_hhmm(&s.end_of_day_time)?;
        let (day, offset) = shift(s, c.now);
        if s.work_hours_enabled && !s.work_days.contains(&day.weekday().number_from_monday()) {
            return None;
        }
        let start = parse_hhmm(&s.work_start).unwrap_or(0);
        let eod_offset = (eod + 24 * 60 - start) % (24 * 60);
        let late = shift_length(s).max(eod_offset) + END_OF_DAY_WINDOW_MIN;
        if self.end_of_day == Some(day) || offset < eod_offset || offset >= late {
            return None;
        }
        self.end_of_day = Some(day);
        self.movement_after_focus = false;
        Some(BreakInfo { kind: BreakKind::EndOfDay, duration_sec: 0, rotation: 0 })
    }

    /// Once-a-day breaks are marked as shown so they don't come back after "skip".
    fn commit_break(&mut self, info: &BreakInfo, c: &Context) {
        let today = c.now.date();
        match info.kind {
            BreakKind::NeckStrength => self.neck_day = Some(today),
            BreakKind::Breathing => self.breathing_day = Some(today),
            BreakKind::Movement | BreakKind::Long => self.movement_after_focus = false,
            _ => {}
        }
    }

    /// Break from the tray, right now.
    pub fn start_now(&mut self, s: &Settings, kind: BreakKind, scale: u64) -> Option<BreakInfo> {
        if self.current.is_some() {
            return None;
        }
        let info = match kind {
            BreakKind::Micro => BreakInfo { kind, duration_sec: s.micro_look_sec as u64, rotation: self.micro_rotation },
            BreakKind::Movement => {
                BreakInfo { kind, duration_sec: minutes(s.movement_duration_min, scale), rotation: self.move_rotation }
            }
            _ => BreakInfo { kind, duration_sec: 0, rotation: 0 },
        };
        self.current = Some(info);
        Some(info)
    }

    /// Returns the finished break and, if the user stood up for it, the sitting stretch that ended.
    pub fn finish(&mut self, s: &Settings, result: BreakResult, scale: u64) -> Option<(BreakInfo, Option<u64>)> {
        let info = self.current.take()?;
        let mut sitting_ended = None;
        let snooze = minutes(s.snooze_min, scale);
        match (info.kind, result) {
            (BreakKind::Micro, BreakResult::Postponed) => {
                self.micro_sec = minutes(s.micro_interval_min, scale).saturating_sub(snooze);
            }
            (BreakKind::Micro, _) => {
                self.micro_sec = 0;
                self.blink_sec = 0;
                self.micro_rotation += 1;
            }
            (BreakKind::Movement | BreakKind::Long, BreakResult::Postponed) => {
                self.move_sec = minutes(s.movement_interval_min, scale).saturating_sub(snooze);
                if info.kind == BreakKind::Long {
                    self.long_sec = minutes(s.long_interval_min, scale).saturating_sub(snooze);
                }
                self.movement_after_focus = false;
            }
            (BreakKind::Movement | BreakKind::Long, _) => {
                self.move_sec = 0;
                self.micro_sec = 0;
                self.blink_sec = 0;
                self.posture_sec = 0;
                self.move_rotation += 1;
                if info.kind == BreakKind::Long {
                    self.long_sec = 0;
                }
                if result == BreakResult::Done {
                    sitting_ended = (self.sitting_sec > 0).then_some(self.sitting_sec);
                    self.sitting_sec = 0;
                }
            }
            (BreakKind::NeckStrength | BreakKind::Breathing, _) => {
                // They replaced a micro-break: done or skipped, the micro-break is not due right after.
                self.micro_sec = 0;
                self.blink_sec = 0;
            }
            _ => {}
        }
        Some((info, sitting_ended))
    }

    pub fn start_focus(&mut self, until: NaiveDateTime) {
        self.focus_until = Some(until);
    }

    pub fn stop_focus(&mut self) {
        self.focus_until = None;
    }

    pub fn pause(&mut self, until: NaiveDateTime) {
        self.paused_until = Some(until);
    }

    pub fn resume(&mut self) {
        self.paused_until = None;
        self.reset_timers();
    }

    fn reset_timers(&mut self) {
        self.micro_sec = 0;
        self.move_sec = 0;
        self.blink_sec = 0;
        self.posture_sec = 0;
        self.wait_sec = 0;
        self.typing_wait_sec = 0;
    }

    /// Seconds of screen time left until the next break, None if all breaks are off.
    pub fn seconds_to_break(&self, s: &Settings, scale: u64) -> Option<u64> {
        let mut next: Option<u64> = None;
        let mut consider = |on: bool, interval: u32, spent: u64| {
            if on {
                let left = minutes(interval, scale).saturating_sub(spent);
                next = Some(next.map_or(left, |n| n.min(left)));
            }
        };
        consider(s.micro_enabled, s.micro_interval_min, self.micro_sec);
        consider(s.movement_enabled, s.movement_interval_min, self.move_sec);
        consider(s.long_enabled, s.long_interval_min, self.long_sec);
        next
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    /// Wednesday 10:00, inside default work hours, cues off unless a test turns them on.
    fn settings() -> Settings {
        Settings { blink_cue_enabled: false, posture_cue_enabled: false, water_enabled: false, ..Settings::default() }
    }

    fn at(h: u32, m: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, 30).unwrap().and_hms_opt(h, m, 0).unwrap()
    }

    fn ctx(now: NaiveDateTime) -> Context {
        Context { now, idle_sec: 10, fullscreen: false, in_call: false, dnd: false, dt: 1, scale: 60 }
    }

    /// Runs `secs` ticks with the given context, returns the first non-empty action.
    fn advance(sch: &mut Scheduler, s: &Settings, secs: u64, mut c: Context) -> Action {
        for _ in 0..secs {
            let out = sch.tick(s, &c);
            c.now += chrono::Duration::seconds(1);
            if out.action != Action::None {
                return out.action;
            }
        }
        Action::None
    }

    fn kind(a: Action) -> BreakKind {
        match a {
            Action::Break(info) => info.kind,
            other => panic!("expected a break, got {other:?}"),
        }
    }

    #[test]
    fn micro_break_every_twenty_minutes() {
        let s = settings();
        let mut sch = Scheduler::default();
        assert_eq!(advance(&mut sch, &s, 20 * 60 - 1, ctx(at(10, 0))), Action::None);
        let Action::Break(info) = advance(&mut sch, &s, 1, ctx(at(10, 20))) else { panic!() };
        assert_eq!(info.kind, BreakKind::Micro);
        assert_eq!(info.duration_sec, 20);
    }

    #[test]
    fn micro_break_is_dropped_right_before_stand_up_break() {
        let s = Settings { movement_interval_min: 42, ..settings() };
        let mut sch = Scheduler::default();
        let first = advance(&mut sch, &s, 20 * 60, ctx(at(10, 0)));
        assert_eq!(kind(first), BreakKind::Micro);
        sch.finish(&s, BreakResult::Done, 60);
        // Second micro-break would come at 40 min, 2 minutes before the stand-up break: dropped.
        assert_eq!(kind(advance(&mut sch, &s, 22 * 60, ctx(at(10, 20)))), BreakKind::Movement);
    }

    #[test]
    fn rotation_moves_on_after_each_micro_break() {
        let s = Settings { movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        let mut rotations = vec![];
        for _ in 0..3 {
            let Action::Break(info) = advance(&mut sch, &s, 20 * 60, ctx(at(10, 0))) else { panic!() };
            rotations.push(info.rotation);
            sch.finish(&s, BreakResult::Done, 60);
        }
        assert_eq!(rotations, vec![0, 1, 2]);
    }

    #[test]
    fn getting_up_ends_the_sitting_stretch() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 10 * 60, ctx(at(10, 0)));
        let out = sch.tick(&s, &Context { idle_sec: 5 * 60, ..ctx(at(10, 15)) });
        assert_eq!(out.sitting_ended, Some(10 * 60));
        assert_eq!(sch.micro_sec, 0);
    }

    #[test]
    fn stand_up_break_done_ends_sitting_but_skip_does_not() {
        let s = Settings { micro_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 45 * 60, ctx(at(10, 0)));
        assert_eq!(sch.finish(&s, BreakResult::Skipped, 60).unwrap().1, None);
        advance(&mut sch, &s, 45 * 60, ctx(at(10, 45)));
        assert_eq!(sch.finish(&s, BreakResult::Done, 60).unwrap().1, Some(90 * 60));
    }

    #[test]
    fn nothing_outside_work_hours() {
        let s = settings();
        let mut sch = Scheduler::default();
        let out = sch.tick(&s, &ctx(at(21, 0)));
        assert_eq!(out.quiet, Quiet::OutsideHours);
        let saturday = NaiveDate::from_ymd_opt(2026, 10, 3).unwrap().and_hms_opt(12, 0, 0).unwrap();
        assert_eq!(sch.tick(&s, &ctx(saturday)).quiet, Quiet::OutsideHours);
        let off = Settings { work_hours_enabled: false, ..settings() };
        assert_eq!(sch.tick(&off, &ctx(saturday)).quiet, Quiet::None);
    }

    #[test]
    fn call_delays_break_up_to_thirty_minutes_and_silences_cues() {
        let s = Settings { blink_cue_enabled: true, ..settings() };
        let mut sch = Scheduler::default();
        let call = Context { in_call: true, ..ctx(at(10, 0)) };
        // 20 min to the break + 30 min of waiting: nothing, not even a blink cue.
        assert_eq!(advance(&mut sch, &s, 50 * 60 - 1, call), Action::None);
        assert!(matches!(advance(&mut sch, &s, 2, call), Action::Break(_)));
    }

    #[test]
    fn typing_delays_break_up_to_a_minute() {
        let s = settings();
        let mut sch = Scheduler::default();
        let typing = Context { idle_sec: 0, ..ctx(at(10, 0)) };
        assert_eq!(advance(&mut sch, &s, 20 * 60 + 59, typing), Action::None);
        assert!(matches!(advance(&mut sch, &s, 2, typing), Action::Break(_)));
    }

    #[test]
    fn focus_holds_breaks_then_asks_to_stand_up() {
        let s = settings();
        let mut sch = Scheduler::default();
        sch.start_focus(at(10, 50));
        assert_eq!(advance(&mut sch, &s, 50 * 60 - 1, ctx(at(10, 0))), Action::None);
        assert_eq!(kind(advance(&mut sch, &s, 2, ctx(at(10, 50)))), BreakKind::Movement);
    }

    #[test]
    fn cues_follow_their_intervals_and_stay_silent_when_idle() {
        let s = Settings { water_enabled: true, micro_enabled: false, movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        let reading = Context { idle_sec: 40, ..ctx(at(10, 0)) };
        assert_eq!(advance(&mut sch, &s, 90 * 60, reading), Action::None);
        assert_eq!(sch.tick(&s, &ctx(at(11, 31))).action, Action::Cue(Cue::Water));
    }

    #[test]
    fn no_blink_cue_right_before_micro_break() {
        let s = Settings { blink_cue_enabled: true, blink_interval_min: 1, ..settings() };
        let mut sch = Scheduler { micro_sec: 19 * 60 + 10, blink_sec: 60, ..Default::default() };
        assert_eq!(sch.tick(&s, &ctx(at(10, 0))).action, Action::None);
    }

    #[test]
    fn end_of_day_fires_once() {
        let s = Settings { end_of_day_enabled: true, end_of_day_time: "18:30".into(), ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 1, ctx(at(18, 30)))), BreakKind::EndOfDay);
        sch.finish(&s, BreakResult::Skipped, 60);
        assert_eq!(advance(&mut sch, &s, 10, ctx(at(18, 31))), Action::None);
    }

    #[test]
    fn neck_minute_replaces_first_micro_break_after_eleven_once_a_day() {
        let s = Settings { neck_daily: true, movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(11, 0)))), BreakKind::NeckStrength);
        sch.finish(&s, BreakResult::Done, 60);
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(11, 30)))), BreakKind::Micro);
    }

    #[test]
    fn postpone_uses_snooze_setting() {
        let s = Settings { snooze_min: 10, movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60, ctx(at(10, 0)));
        sch.finish(&s, BreakResult::Postponed, 60);
        assert_eq!(advance(&mut sch, &s, 10 * 60 - 1, ctx(at(10, 20))), Action::None);
        assert!(matches!(advance(&mut sch, &s, 1, ctx(at(10, 30))), Action::Break(_)));
    }

    #[test]
    fn night_or_sleep_counts_as_getting_up() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 19 * 60, ctx(at(18, 40)));
        // Next morning the user touches the mouse: no micro-break a minute later, the stretch has ended.
        let out = sch.tick(&s, &ctx(NaiveDate::from_ymd_opt(2026, 10, 1).unwrap().and_hms_opt(9, 0, 0).unwrap()));
        assert_eq!(out.sitting_ended, Some(19 * 60));
        assert_eq!(sch.micro_sec, 1);
    }

    #[test]
    fn a_call_without_typing_is_still_sitting() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 10 * 60, ctx(at(10, 0)));
        let out = sch.tick(&s, &Context { idle_sec: 20 * 60, in_call: true, ..ctx(at(10, 10)) });
        assert_eq!(out.sitting_ended, None);
        assert!(sch.sitting_sec > 10 * 60);
    }

    #[test]
    fn end_of_day_with_default_hours_fires_at_seven_once() {
        let s = Settings { end_of_day_enabled: true, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(advance(&mut sch, &s, 60, ctx(at(18, 58))), Action::None);
        assert_eq!(kind(advance(&mut sch, &s, 120, ctx(at(18, 59)))), BreakKind::EndOfDay);
        sch.finish(&s, BreakResult::Done, 60);
        assert_eq!(advance(&mut sch, &s, 120, ctx(at(19, 1))), Action::None);
        // Not in the morning of the next day either.
        let mut fresh = Scheduler::default();
        assert_eq!(fresh.tick(&s, &ctx(at(8, 0))).action, Action::None);
    }

    #[test]
    fn end_of_day_in_a_night_shift_comes_at_its_end() {
        let s = Settings {
            end_of_day_enabled: true,
            end_of_day_time: "05:45".into(),
            work_start: "22:00".into(),
            work_end: "06:00".into(),
            ..settings()
        };
        let mut sch = Scheduler::default();
        assert_eq!(sch.tick(&s, &ctx(at(22, 0))).action, Action::None);
        let mut sch = Scheduler::default();
        let out = sch.tick(&s, &ctx(NaiveDate::from_ymd_opt(2026, 10, 1).unwrap().and_hms_opt(5, 45, 0).unwrap()));
        assert!(matches!(out.action, Action::Break(BreakInfo { kind: BreakKind::EndOfDay, .. })));
    }

    #[test]
    fn skipping_the_neck_minutes_does_not_bring_a_micro_break() {
        let s = Settings { neck_daily: true, movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(11, 0)))), BreakKind::NeckStrength);
        sch.finish(&s, BreakResult::Skipped, 60);
        assert_eq!(advance(&mut sch, &s, 60, ctx(at(11, 20))), Action::None);
    }

    #[test]
    fn neck_minutes_come_in_pomodoro_mode_too() {
        let s = Settings { neck_daily: true, micro_enabled: false, movement_interval_min: 25, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(11, 0)))), BreakKind::NeckStrength);
    }

    #[test]
    fn long_break_clears_the_stand_up_after_focus() {
        let s = Settings { long_enabled: true, long_interval_min: 60, micro_enabled: false, movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        sch.start_focus(at(11, 0));
        assert_eq!(kind(advance(&mut sch, &s, 60 * 60 + 5, ctx(at(10, 0)))), BreakKind::Long);
        sch.finish(&s, BreakResult::Done, 60);
        assert_eq!(advance(&mut sch, &s, 60, ctx(at(11, 1))), Action::None);
    }

    #[test]
    fn friday_night_shift_continues_after_midnight() {
        let s = Settings { work_start: "22:00".into(), work_end: "06:00".into(), ..settings() };
        let saturday_3am = NaiveDate::from_ymd_opt(2026, 10, 3).unwrap().and_hms_opt(3, 0, 0).unwrap();
        assert!(in_work_hours(&s, saturday_3am));
        let monday_3am = NaiveDate::from_ymd_opt(2026, 10, 5).unwrap().and_hms_opt(3, 0, 0).unwrap();
        assert!(!in_work_hours(&s, monday_3am));
        let all_day = Settings { work_start: "00:00".into(), work_end: "00:00".into(), ..settings() };
        assert!(in_work_hours(&all_day, at(15, 0)));
    }

    #[test]
    fn night_shift_work_hours() {
        let s = Settings { work_start: "22:00".into(), work_end: "06:00".into(), work_days: (1..=7).collect(), ..settings() };
        assert!(in_work_hours(&s, at(23, 0)));
        assert!(in_work_hours(&s, at(3, 0)));
        assert!(!in_work_hours(&s, at(12, 0)));
    }
}
