//! What to show and when: breaks, gentle cues, sitting stretches. Pure logic: no windows, no system clock,
//! so every rule is covered by tests. Rationale for the numbers is in docs/science.

use crate::settings::{parse_hhmm, Settings};
use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike};
use serde::Serialize;

/// Cues only make sense while the user is at the keyboard. A break that falls due while nobody touched the
/// keyboard or mouse this long waits for the user to come back.
pub const ACTIVE_IDLE_SEC: u64 = 30;
/// Still typing: a break waits for a pause in typing, at most a minute.
const TYPING_IDLE_SEC: u64 = 2;
const TYPING_MAX_WAIT_SEC: u64 = 60;
const FULLSCREEN_MAX_WAIT_SEC: u64 = 10 * 60;
const CALL_MAX_WAIT_SEC: u64 = 30 * 60;
/// A micro-break this close to a stand-up break is dropped: the stand-up break does the job.
const MICRO_SKIP_BEFORE_MOVEMENT_SEC: u64 = 3 * 60;
/// No blink cue right before a micro-break.
const NO_CUE_BEFORE_BREAK_SEC: u64 = 60;
/// Daily extras come with the first micro-break this long into the work day (11:00 and 15:00 for a day from
/// 9:00), counted from the start of the shift, so a night shift gets them in its own late morning and afternoon.
/// Breathing comes an hour before the end of a short shift at the latest.
const NECK_DAILY_AFTER_MIN: u32 = 2 * 60;
const BREATHING_DAILY_AFTER_MIN: u32 = 6 * 60;
/// Without work hours the day starts at this time for them.
const FREE_DAY_START_MIN: u32 = 9 * 60;
/// After the countdown the break screen asks "Did it work out?" this many settings minutes, then counts the break
/// as not answered.
pub const CONFIRM_MIN: u32 = 5;

/// Seconds the break screen waits for "Did it work out?": the same for every break, so lingering over an
/// exercise never closes the window before the answer.
pub fn confirm_sec(_kind: BreakKind, scale: u64) -> u64 {
    minutes(CONFIRM_MIN, scale)
}
/// Exercises add their own time to a break and the page needs a moment to load: the scheduler gives up on an
/// unanswered break this long after the page should have.
const BREAK_MARGIN_SEC: u64 = 4 * 60;
/// Seconds between two ticks that mean the computer slept in between.
const SLEEP_GAP_SEC: i64 = 10;
/// The wellbeing questions come in the last hour of the work day and the hour after it, never late at night.
const EVENING_BEFORE_MIN: u32 = 60;
const EVENING_AFTER_MIN: u32 = 60;
/// Without work hours: from 17:00 to 21:00.
const EVENING_FROM_MIN: u32 = 17 * 60;
const EVENING_TO_MIN: u32 = 21 * 60;

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
    /// Nobody answered and nobody touched the computer: the user was away. Away from the screen is rest for
    /// eyes and body, so timers reset, but it is not counted as a break done.
    Away,
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
    /// A break fell due while the user was away long enough to have rested: it is not shown, counted as away.
    pub rested: Option<BreakInfo>,
    /// The open break waited too long for an answer (the page never answered: sleep, a frozen page). Finish it
    /// with this result.
    pub expired: Option<BreakResult>,
}

impl TickOut {
    fn quiet(quiet: Quiet) -> Self {
        TickOut { action: Action::None, quiet, active: false, sitting_ended: None, rested: None, expired: None }
    }

    fn active() -> Self {
        TickOut { active: true, ..TickOut::quiet(Quiet::None) }
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
    /// When the current break opened: its statistics go to that day, and its answer has a deadline.
    pub break_started: Option<NaiveDateTime>,
    /// The keyboard or mouse was touched while the current break was open: the user was there.
    break_touched: bool,
    /// Nobody touched the computer since the break opened, for at least `AWAY_REST_MIN`: the user is away.
    break_left: bool,
    /// The previous tick during the break: a jump means the computer slept, and the key that woke it says
    /// nothing about the break.
    break_tick: Option<NaiveDateTime>,
    /// The page never answered and the scheduler already asked to finish the break: once is enough.
    expired_sent: bool,
    /// The longest idle time seen while a due break waited for the user to come back, and that break.
    held_idle: u64,
    held: Option<BreakInfo>,
    pub paused_until: Option<NaiveDateTime>,
    pub focus_until: Option<NaiveDateTime>,
    movement_after_focus: bool,
    wait_sec: u64,
    typing_wait_sec: u64,
    neck_day: Option<NaiveDate>,
    breathing_day: Option<NaiveDate>,
    /// The daily neck or breathing minute came while the user was away: it comes back once that day.
    neck_retried: Option<NaiveDate>,
    breathing_retried: Option<NaiveDate>,
    end_of_day: Option<NaiveDate>,
    /// "Keep working" on "Work day is over": breaks go on after work hours until the next work day starts.
    overtime: Option<NaiveDate>,
    /// Last tick the user was counted as at the computer: a long gap (night, sleep, pause) means they left.
    last_active: Option<NaiveDateTime>,
}

fn minutes(v: u32, scale: u64) -> u64 {
    v as u64 * scale
}

/// No keyboard and mouse this long, at least, before a held break counts as rested away. Shorter is likely
/// reading: the eyes stayed on the screen and the user stayed in the chair, so the break is shown on return.
const AWAY_REST_MIN: u32 = 2;

/// How long away from the computer does the job of this break. The daily neck and breathing minutes are
/// exercises: being away doesn't replace them.
fn rest_needed(s: &Settings, info: &BreakInfo, scale: u64) -> u64 {
    let own = match info.kind {
        BreakKind::Micro => s.micro_look_sec as u64,
        BreakKind::Movement => minutes(s.movement_duration_min, scale),
        BreakKind::Long => minutes(s.long_duration_min, scale),
        _ => return u64::MAX,
    };
    own.max(minutes(AWAY_REST_MIN, scale))
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

/// The work day `now` belongs to: a night shift after midnight is still the day it started. Without work hours,
/// the calendar day.
pub fn work_day(s: &Settings, now: NaiveDateTime) -> NaiveDate {
    if s.work_hours_enabled {
        shift(s, now).0
    } else {
        now.date()
    }
}

/// The day the daily extras belong to and minutes into it: from the start of the shift with work hours, from
/// 9:00 without them.
fn daily_clock(s: &Settings, now: NaiveDateTime) -> (NaiveDate, u32) {
    if s.work_hours_enabled {
        shift(s, now)
    } else {
        (now.date(), (now.hour() * 60 + now.minute()).saturating_sub(FREE_DAY_START_MIN))
    }
}

/// The time for the evening wellbeing questions: returns the work day they are about, or None outside it.
/// From an hour before the end of the work day to an hour after it (or the hour after "work day is over" when
/// that screen is on), only on work days. A night shift is asked about at its end, in the morning. Without work
/// hours: from 17:00 to 21:00.
pub fn evening(s: &Settings, now: NaiveDateTime) -> Option<NaiveDate> {
    if !s.work_hours_enabled {
        let t = now.hour() * 60 + now.minute();
        return (EVENING_FROM_MIN..EVENING_TO_MIN).contains(&t).then_some(now.date());
    }
    let (day, offset) = shift(s, now);
    if !s.work_days.contains(&day.weekday().number_from_monday()) {
        return None;
    }
    let start = parse_hhmm(&s.work_start).unwrap_or(0);
    let (from, to) = match parse_hhmm(&s.end_of_day_time).filter(|_| s.end_of_day_enabled) {
        // The questions come with "work day is over" or after it, not an hour before it.
        Some(eod) => {
            let eod = (eod + 24 * 60 - start) % (24 * 60);
            (eod, eod + EVENING_AFTER_MIN)
        }
        None => {
            let end = shift_length(s);
            (end.saturating_sub(EVENING_BEFORE_MIN), end + EVENING_AFTER_MIN)
        }
    };
    (from..to).contains(&offset).then_some(day)
}

impl Scheduler {
    pub fn tick(&mut self, s: &Settings, c: &Context) -> TickOut {
        if let Some(info) = self.current {
            return self.tick_in_break(&info, c);
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
            self.open(info, c.now);
            return TickOut { action: Action::Break(info), ..TickOut::active() };
        }
        if !self.in_hours(s, c.now) {
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
            // A break that waited for the user is rested away now: count it, the stand-up and eye ones only.
            let rested = self.held.take().filter(|i| matches!(i.kind, BreakKind::Micro | BreakKind::Movement | BreakKind::Long));
            self.sitting_sec = 0;
            self.micro_sec = 0;
            self.move_sec = 0;
            self.blink_sec = 0;
            self.posture_sec = 0;
            self.wait_sec = 0;
            self.typing_wait_sec = 0;
            self.held_idle = 0;
            self.movement_after_focus = false;
            if self.focus_until.is_some_and(|t| c.now >= t) {
                self.focus_until = None;
            }
            if c.idle_sec.max(gap) >= minutes(s.long_duration_min, c.scale) {
                self.long_sec = 0;
            }
            self.last_active = (c.idle_sec < reset).then_some(c.now);
            if c.idle_sec >= reset {
                return TickOut { sitting_ended: ended, rested, ..TickOut::quiet(Quiet::None) };
            }
            // Came back after a gap: this tick is already active again.
            let mut out = self.tick_active(s, c);
            out.sitting_ended = ended;
            out.rested = out.rested.or(rested);
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
        let mut out = TickOut::active();

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
            // Nobody at the computer (Claude Code works, the user went out): the break waits for them. Away long
            // enough is the rest itself: then it is not shown at all. A call or a video is not "away".
            let watching = c.in_call || c.fullscreen;
            if c.idle_sec >= ACTIVE_IDLE_SEC && !watching {
                self.held_idle = self.held_idle.max(c.idle_sec);
                self.held = Some(info);
                return out;
            }
            let away = std::mem::take(&mut self.held_idle);
            self.held = None;
            if away > 0 && away >= rest_needed(s, &info, c.scale) {
                self.wait_sec = 0;
                self.typing_wait_sec = 0;
                // The minutes away were not sitting: the stretch ended when the user left.
                self.sitting_sec = self.sitting_sec.saturating_sub(away);
                out.sitting_ended = self.apply(s, &info, BreakResult::Away, c.scale);
                out.rested = Some(info);
                return out;
            }
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
            self.commit_break(s, &info, c);
            self.open(info, c.now);
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
        let (today, into_day) = daily_clock(s, c.now);
        let breathing_after = if s.work_hours_enabled {
            BREATHING_DAILY_AFTER_MIN.min(shift_length(s).saturating_sub(60))
        } else {
            BREATHING_DAILY_AFTER_MIN
        };

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
            if s.neck_daily && s.sections.neck && self.neck_day != Some(today) && into_day >= NECK_DAILY_AFTER_MIN {
                return Some(BreakInfo { kind: BreakKind::NeckStrength, duration_sec: 0, rotation: 0 });
            }
            if s.breathing_daily && self.breathing_day != Some(today) && into_day >= breathing_after {
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

    /// Work hours, or the evening after "Keep working" on "Work day is over".
    pub fn in_hours(&self, s: &Settings, now: NaiveDateTime) -> bool {
        in_work_hours(s, now) || (s.work_hours_enabled && self.overtime == Some(shift(s, now).0))
    }

    /// Once-a-day breaks are marked as shown so they don't come back after "skip".
    fn commit_break(&mut self, s: &Settings, info: &BreakInfo, c: &Context) {
        let today = daily_clock(s, c.now).0;
        match info.kind {
            BreakKind::NeckStrength => self.neck_day = Some(today),
            BreakKind::Breathing => self.breathing_day = Some(today),
            BreakKind::Movement | BreakKind::Long => self.movement_after_focus = false,
            _ => {}
        }
    }

    /// Break from the tray, right now.
    pub fn start_now(&mut self, s: &Settings, kind: BreakKind, scale: u64, now: NaiveDateTime) -> Option<BreakInfo> {
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
        self.open(info, now);
        Some(info)
    }

    fn open(&mut self, info: BreakInfo, now: NaiveDateTime) {
        self.current = Some(info);
        self.break_started = Some(now);
        self.break_touched = false;
        self.break_left = false;
        self.break_tick = Some(now);
        self.expired_sent = false;
        self.held_idle = 0;
        self.held = None;
    }

    /// A break is on screen: no timers, but the scheduler watches whether the user is there and gives up on
    /// a break the page never answered.
    fn tick_in_break(&mut self, info: &BreakInfo, c: &Context) -> TickOut {
        let mut out = TickOut::quiet(Quiet::None);
        let Some(started) = self.break_started else { return out };
        let since = (c.now - started).num_seconds().max(0) as u64;
        let woke = self.break_tick.is_some_and(|t| (c.now - t).num_seconds() > SLEEP_GAP_SEC);
        self.break_tick = Some(c.now);
        // Input after the countdown should have ended: the user is at the computer. A key still pressed while the
        // break opened mid-typing doesn't count, nor the key that woke the computer from sleep.
        if !woke && since > info.duration_sec && c.idle_sec < since - info.duration_sec {
            self.break_touched = true;
        }
        self.break_left = since >= minutes(AWAY_REST_MIN, c.scale);
        // Waiting for the answer is not a gap: without this a long wait would look like the user left.
        if c.idle_sec < ACTIVE_IDLE_SEC {
            self.last_active = Some(c.now);
        }
        // "Work day is over" waits for its answer as long as it takes.
        let limit = info.duration_sec + confirm_sec(info.kind, c.scale) + BREAK_MARGIN_SEC;
        if info.kind != BreakKind::EndOfDay && since >= limit && !self.expired_sent {
            self.expired_sent = true;
            out.expired = Some(self.timeout_result());
        }
        out
    }

    /// No answer to "Did it work out?": away if nobody touched the computer for at least `AWAY_REST_MIN`, skipped
    /// otherwise. Half a minute without the mouse is as likely reading as leaving, and leaving the chair is never
    /// guessed from it.
    pub fn timeout_result(&self) -> BreakResult {
        if self.break_left && !self.break_touched {
            BreakResult::Away
        } else {
            BreakResult::Skipped
        }
    }

    /// Returns the finished break and, if the user stood up for it, the sitting stretch that ended.
    pub fn finish(&mut self, s: &Settings, result: BreakResult, scale: u64) -> Option<(BreakInfo, Option<u64>)> {
        let info = self.current.take()?;
        self.break_started = None;
        let sitting_ended = self.apply(s, &info, result, scale);
        Some((info, sitting_ended))
    }

    /// Timers after a break, shown or rested away. Returns the sitting stretch that ended, if the user got up.
    fn apply(&mut self, s: &Settings, info: &BreakInfo, result: BreakResult, scale: u64) -> Option<u64> {
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
            }
            (BreakKind::NeckStrength | BreakKind::Breathing, _) => {
                // They replaced a micro-break: done or skipped, the micro-break is not due right after.
                self.micro_sec = 0;
                self.blink_sec = 0;
                // Nobody was there to do them: once a day they come back with a later micro-break.
                if result == BreakResult::Away {
                    let (day, retried) = if info.kind == BreakKind::NeckStrength {
                        (&mut self.neck_day, &mut self.neck_retried)
                    } else {
                        (&mut self.breathing_day, &mut self.breathing_retried)
                    };
                    if day.is_some() && *retried != *day {
                        *retried = day.take();
                    }
                }
            }
            // Anything but "Finish": the user stays at the computer, and the breaks stay with them.
            (BreakKind::EndOfDay, r) if r != BreakResult::Done => self.overtime = self.end_of_day,
            _ => {}
        }
        // Stood up for a stand-up break, or was away from the computer: the sitting stretch is over.
        let got_up = result == BreakResult::Away
            || (result == BreakResult::Done && matches!(info.kind, BreakKind::Movement | BreakKind::Long));
        if got_up && info.kind != BreakKind::EndOfDay {
            sitting_ended = (self.sitting_sec > 0).then_some(self.sitting_sec);
            self.sitting_sec = 0;
        }
        sitting_ended
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
    fn keep_working_after_end_of_day_keeps_the_breaks() {
        let s = Settings { end_of_day_enabled: true, movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 1, ctx(at(19, 0)))), BreakKind::EndOfDay);
        sch.finish(&s, BreakResult::Skipped, 60);
        assert_eq!(sch.tick(&s, &ctx(at(19, 1))).quiet, Quiet::None);
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(19, 1)))), BreakKind::Micro);
        sch.finish(&s, BreakResult::Done, 60);
        // Still that evening after midnight; the next work day starts as usual.
        let thursday = |h, m| NaiveDate::from_ymd_opt(2026, 10, 1).unwrap().and_hms_opt(h, m, 0).unwrap();
        assert_eq!(sch.tick(&s, &ctx(thursday(1, 0))).quiet, Quiet::None);
        let saturday = NaiveDate::from_ymd_opt(2026, 10, 3).unwrap().and_hms_opt(20, 0, 0).unwrap();
        assert_eq!(sch.tick(&s, &ctx(saturday)).quiet, Quiet::OutsideHours);
    }

    #[test]
    fn finish_after_end_of_day_keeps_the_evening_quiet() {
        let s = Settings { end_of_day_enabled: true, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 1, ctx(at(19, 0)))), BreakKind::EndOfDay);
        sch.finish(&s, BreakResult::Done, 60);
        assert_eq!(sch.tick(&s, &ctx(at(19, 1))).quiet, Quiet::OutsideHours);
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

    #[test]
    fn break_waits_while_nobody_is_at_the_computer() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60 - 1, ctx(at(10, 0)));
        // Due now, but the keyboard and mouse have been quiet for 40 s: nothing on screen.
        let away = Context { idle_sec: 40, ..ctx(at(10, 20)) };
        assert_eq!(advance(&mut sch, &s, 5, away), Action::None);
        assert!(sch.current.is_none());
        // Still away at 2.5 minutes, then back: rested, not shown.
        sch.tick(&s, &Context { idle_sec: 150, ..ctx(at(10, 22)) });
        let out = sch.tick(&s, &Context { idle_sec: 0, ..ctx(at(10, 23)) });
        assert_eq!(out.action, Action::None);
        assert_eq!(out.rested.map(|i| i.kind), Some(BreakKind::Micro));
        assert_eq!(sch.micro_sec, 0);
    }

    #[test]
    fn reading_without_the_mouse_still_gets_the_eye_break() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60 - 1, ctx(at(10, 0)));
        // 40 s of reading without touching anything: held, then shown when the mouse moves, sitting goes on.
        assert_eq!(advance(&mut sch, &s, 10, Context { idle_sec: 40, ..ctx(at(10, 20)) }), Action::None);
        let out = sch.tick(&s, &Context { idle_sec: 3, ..ctx(at(10, 21)) });
        assert_eq!(kind(out.action), BreakKind::Micro);
        assert!(out.rested.is_none());
        assert!(sch.sitting_sec > 20 * 60);
    }

    #[test]
    fn short_absence_still_shows_the_stand_up_break() {
        let s = Settings { micro_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 45 * 60 - 1, ctx(at(10, 0)));
        assert_eq!(advance(&mut sch, &s, 10, Context { idle_sec: 60, ..ctx(at(10, 45)) }), Action::None);
        // A minute away is less than the 3 minutes of the stand-up break: it is shown when the user is back.
        let out = sch.tick(&s, &Context { idle_sec: 3, ..ctx(at(10, 46)) });
        assert_eq!(kind(out.action), BreakKind::Movement);
        assert!(out.rested.is_none());
    }

    #[test]
    fn long_enough_away_rests_the_stand_up_break_and_ends_sitting() {
        let s = Settings { micro_enabled: false, idle_reset_min: 10, ..settings() };
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 45 * 60 - 1, ctx(at(10, 0)));
        let mut c = Context { idle_sec: 31, ..ctx(at(10, 45)) };
        for _ in 0..200 {
            assert_eq!(sch.tick(&s, &c).action, Action::None);
            c.idle_sec += 1;
            c.now += chrono::Duration::seconds(1);
        }
        let out = sch.tick(&s, &Context { idle_sec: 0, ..c });
        assert_eq!(out.rested.map(|i| i.kind), Some(BreakKind::Movement));
        // The stretch ended when the user left, not when they came back.
        let ended = out.sitting_ended.unwrap();
        assert!(ended < 45 * 60 + 60, "{ended}");
        assert_eq!(sch.move_sec, 0);
    }

    #[test]
    fn held_break_counts_as_rested_when_the_absence_reaches_the_reset() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60 - 1, ctx(at(10, 0)));
        assert_eq!(advance(&mut sch, &s, 5, Context { idle_sec: 40, ..ctx(at(10, 20)) }), Action::None);
        let out = sch.tick(&s, &Context { idle_sec: 5 * 60, ..ctx(at(10, 25)) });
        assert_eq!(out.rested.map(|i| i.kind), Some(BreakKind::Micro));
    }

    #[test]
    fn a_video_without_touching_the_mouse_does_not_hold_the_break() {
        let s = Settings { pause_in_fullscreen: false, ..settings() };
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60 - 1, ctx(at(10, 0)));
        let video = Context { idle_sec: 40, fullscreen: true, ..ctx(at(10, 20)) };
        assert!(matches!(advance(&mut sch, &s, 2, video), Action::Break(_)));
    }

    #[test]
    fn unanswered_break_expires_as_away_or_skipped() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60, ctx(at(10, 0)));
        assert!(sch.current.is_some());
        let started = sch.break_started.unwrap();
        // Nobody touches anything: 20 s of the break + 5 min for the answer + the margin.
        let mut c = Context { idle_sec: 0, ..ctx(started) };
        let mut expired = None;
        for _ in 0..(20 + 5 * 60 + BREAK_MARGIN_SEC + 1) {
            c.idle_sec += 1;
            c.now += chrono::Duration::seconds(1);
            expired = sch.tick(&s, &c).expired;
            if expired.is_some() {
                break;
            }
        }
        assert_eq!(expired, Some(BreakResult::Away));

        // The same, but the user moved the mouse after the countdown: skipped.
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60, ctx(at(11, 0)));
        let started = sch.break_started.unwrap();
        for sec in 1..=30u64 {
            let idle = if sec == 30 { 0 } else { sec };
            sch.tick(&s, &Context { idle_sec: idle, ..ctx(started + chrono::Duration::seconds(sec as i64)) });
        }
        assert_eq!(sch.timeout_result(), BreakResult::Skipped);
    }

    #[test]
    fn laptop_closed_during_a_break_is_away() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60, ctx(at(10, 0)));
        let started = sch.break_started.unwrap();
        sch.tick(&s, &Context { idle_sec: 1, ..ctx(started + chrono::Duration::seconds(1)) });
        // An hour later the lid opens and a key wakes the computer: the break is over, nobody answered.
        let out = sch.tick(&s, &Context { idle_sec: 0, ..ctx(started + chrono::Duration::hours(1)) });
        assert_eq!(out.expired, Some(BreakResult::Away));
        // Asked once, not every second until the main thread gets to it.
        let again = sch.tick(&s, &Context { idle_sec: 1, ..ctx(started + chrono::Duration::seconds(3601)) });
        assert_eq!(again.expired, None);
    }

    #[test]
    fn end_of_day_never_expires() {
        let s = Settings { end_of_day_enabled: true, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 1, ctx(at(19, 0)))), BreakKind::EndOfDay);
        let out = sch.tick(&s, &Context { idle_sec: 3 * 60 * 60, ..ctx(at(22, 0)) });
        assert_eq!(out.expired, None);
    }

    #[test]
    fn away_from_any_break_ends_the_sitting_stretch() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60, ctx(at(10, 0)));
        let (info, ended) = sch.finish(&s, BreakResult::Away, 60).unwrap();
        assert_eq!(info.kind, BreakKind::Micro);
        assert_eq!(ended, Some(20 * 60));
        assert_eq!(sch.micro_sec, 0);
        assert_eq!(sch.micro_rotation, 1);
    }

    #[test]
    fn skipped_micro_break_keeps_the_sitting_stretch() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60, ctx(at(10, 0)));
        assert_eq!(sch.finish(&s, BreakResult::Skipped, 60).unwrap().1, None);
        assert_eq!(sch.sitting_sec, 20 * 60);
    }

    #[test]
    fn long_wait_for_the_answer_is_not_a_natural_break() {
        let s = settings();
        let mut sch = Scheduler::default();
        advance(&mut sch, &s, 20 * 60, ctx(at(10, 0)));
        // The user sits at the screen 6 minutes, touching the mouse now and then, then presses "Not this time".
        let mut c = ctx(at(10, 20));
        for _ in 0..6 * 60 {
            c.now += chrono::Duration::seconds(1);
            sch.tick(&s, &Context { idle_sec: 5, ..c });
        }
        sch.finish(&s, BreakResult::Skipped, 60);
        let out = sch.tick(&s, &Context { idle_sec: 0, ..c });
        assert_eq!(out.sitting_ended, None);
        assert_eq!(sch.sitting_sec, 20 * 60 + 1);
    }

    #[test]
    fn neck_minute_missed_while_away_comes_back_once() {
        let s = Settings { neck_daily: true, movement_enabled: false, ..settings() };
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(11, 0)))), BreakKind::NeckStrength);
        sch.finish(&s, BreakResult::Away, 60);
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(11, 30)))), BreakKind::NeckStrength);
        sch.finish(&s, BreakResult::Away, 60);
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(12, 0)))), BreakKind::Micro);
    }

    #[test]
    fn night_shift_gets_breathing_in_its_own_afternoon() {
        let s = Settings {
            breathing_daily: true,
            movement_enabled: false,
            work_start: "22:00".into(),
            work_end: "06:00".into(),
            ..settings()
        };
        // 23:00 is an hour into the shift: a plain micro-break, not breathing at the shift's start.
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(at(23, 0)))), BreakKind::Micro);
        // 4:10 on Thursday is six hours into Wednesday's shift.
        let thursday = NaiveDate::from_ymd_opt(2026, 10, 1).unwrap().and_hms_opt(4, 10, 0).unwrap();
        let mut sch = Scheduler::default();
        assert_eq!(kind(advance(&mut sch, &s, 20 * 60, ctx(thursday))), BreakKind::Breathing);
    }

    #[test]
    fn evening_questions_window() {
        let s = settings();
        assert_eq!(evening(&s, at(17, 59)), None);
        assert_eq!(evening(&s, at(18, 0)), Some(at(0, 0).date()));
        assert_eq!(evening(&s, at(19, 59)), Some(at(0, 0).date()));
        assert_eq!(evening(&s, at(20, 0)), None);
        let saturday = NaiveDate::from_ymd_opt(2026, 10, 3).unwrap().and_hms_opt(18, 30, 0).unwrap();
        assert_eq!(evening(&s, saturday), None);
        // With "work day is over" at 18:30 the questions come with it, not before.
        let eod = Settings { end_of_day_enabled: true, end_of_day_time: "18:30".into(), ..settings() };
        assert_eq!(evening(&eod, at(18, 15)), None);
        assert_eq!(evening(&eod, at(18, 30)), Some(at(0, 0).date()));
        let free = Settings { work_hours_enabled: false, ..settings() };
        assert_eq!(evening(&free, at(16, 59)), None);
        assert_eq!(evening(&free, at(20, 30)), Some(at(0, 0).date()));
        assert_eq!(evening(&free, at(21, 0)), None);
    }

    #[test]
    fn night_shift_is_asked_about_at_its_end() {
        let s = Settings { work_start: "22:00".into(), work_end: "06:00".into(), ..settings() };
        // Wednesday's shift ends on Thursday at 6:00: asked from 5:00 to 7:00, about Wednesday.
        let thursday = |h, m| NaiveDate::from_ymd_opt(2026, 10, 1).unwrap().and_hms_opt(h, m, 0).unwrap();
        assert_eq!(evening(&s, at(22, 30)), None);
        assert_eq!(evening(&s, thursday(5, 30)), Some(at(0, 0).date()));
        assert_eq!(evening(&s, thursday(6, 59)), Some(at(0, 0).date()));
        assert_eq!(evening(&s, thursday(7, 0)), None);
        assert_eq!(work_day(&s, thursday(3, 0)), at(0, 0).date());
    }
}
