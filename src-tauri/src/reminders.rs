//! The user's own reminders: "pills at 9:00 and 21:00", "lunch at 13:00 on weekdays", "check the posture every
//! hour". Pure logic with tests; lib.rs shows the card.

use chrono::{Datelike, Duration, NaiveDateTime, NaiveTime};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// At most this many reminders: the list is meant to be short.
pub const MAX_REMINDERS: usize = 20;
/// A time slot still fires this long after it, if the computer was asleep or off at that moment.
/// A 9:00 reminder first noticed at 11:00 is stale and is skipped.
pub const LATE_WINDOW_MIN: i64 = 60;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub title: String,
    pub enabled: bool,
    /// "times": at the given times on the given days. "interval": every N minutes of work, counted like the breaks:
    /// only while the user is at the computer within working hours.
    pub kind: String,
    /// "HH:MM"
    pub times: Vec<String>,
    /// 1 = Monday … 7 = Sunday
    pub days: Vec<u32>,
    pub interval_min: u32,
}

impl Default for Reminder {
    fn default() -> Self {
        Reminder {
            id: String::new(),
            title: String::new(),
            enabled: true,
            kind: "times".into(),
            times: vec!["13:00".into()],
            days: (1..=7).collect(),
            interval_min: 60,
        }
    }
}

impl Reminder {
    pub fn sanitized(mut self, index: usize) -> Self {
        // The id goes into a window label and a URL: letters, digits, "-" and "_" only.
        self.id.retain(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        self.id.truncate(40);
        if self.id.is_empty() {
            self.id = format!("r{index}");
        }
        self.title = self.title.chars().take(80).collect();
        if self.kind != "interval" {
            self.kind = "times".into();
        }
        self.times.retain(|t| parse_hhmm(t).is_some());
        self.times.sort();
        self.times.dedup();
        self.times.truncate(12);
        self.days.retain(|d| (1..=7).contains(d));
        self.days.sort_unstable();
        self.days.dedup();
        if self.days.is_empty() {
            self.days = (1..=7).collect();
        }
        self.interval_min = self.interval_min.clamp(5, 480);
        self
    }
}

fn parse_hhmm(s: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(s, "%H:%M").ok()
}

/// What was shown and what waits: lives only while the app runs.
#[derive(Default)]
pub struct State {
    /// "id@2026-09-29 13:00": time slots already shown.
    fired: HashSet<String>,
    /// Interval reminders: seconds of work counted since each was shown last.
    worked: HashMap<String, u64>,
    /// "Later": id → show again at.
    snoozed: HashMap<String, NaiveDateTime>,
}

impl State {
    /// Reminders to show now. `counting` is true while the user is at the computer within working hours: only then
    /// interval reminders count `dt` seconds of work, so a lunch away doesn't bring one closer. Time slots fire
    /// regardless, a pill reminder can't wait for work.
    pub fn due(&mut self, list: &[Reminder], now: NaiveDateTime, counting: bool, dt: u64) -> Vec<String> {
        let mut out = vec![];
        for r in list.iter().filter(|r| r.enabled) {
            if let Some(at) = self.snoozed.get(&r.id).copied() {
                if now >= at {
                    self.snoozed.remove(&r.id);
                    out.push(r.id.clone());
                }
                continue;
            }
            if r.kind == "interval" {
                if !counting {
                    continue;
                }
                let worked = self.worked.entry(r.id.clone()).or_insert(0);
                *worked += dt;
                if *worked >= u64::from(r.interval_min.max(5)) * 60 {
                    *worked = 0;
                    out.push(r.id.clone());
                }
                continue;
            }
            if !r.days.contains(&now.weekday().number_from_monday()) {
                continue;
            }
            for t in &r.times {
                let Some(time) = parse_hhmm(t) else { continue };
                let slot = now.date().and_time(time);
                if now < slot || now - slot > Duration::minutes(LATE_WINDOW_MIN) {
                    continue;
                }
                if self.fired.insert(format!("{}@{}", r.id, slot.format("%Y-%m-%d %H:%M"))) {
                    out.push(r.id.clone());
                    break;
                }
            }
        }
        // Slots of earlier days can't fire again: forget them so the set stays small.
        if self.fired.len() > 200 {
            let today = now.format("%Y-%m-%d").to_string();
            self.fired.retain(|k| k.contains(&today));
        }
        out
    }

    /// "Later": the same reminder again in `min` minutes.
    pub fn snooze(&mut self, id: &str, now: NaiveDateTime, min: i64) {
        self.snoozed.insert(id.to_string(), now + Duration::minutes(min));
    }

    /// An interval reminder that was answered counts its next time from now.
    pub fn done(&mut self, id: &str) {
        self.snoozed.remove(id);
        if let Some(worked) = self.worked.get_mut(id) {
            *worked = 0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    // 2026-09-28 is a Monday.
    fn at(day: u32, h: u32, m: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, day).unwrap().and_hms_opt(h, m, 0).unwrap()
    }

    fn pills() -> Reminder {
        Reminder { id: "pills".into(), title: "Pills".into(), times: vec!["09:00".into(), "21:00".into()], ..Default::default() }
    }

    #[test]
    fn a_time_slot_fires_once() {
        let mut s = State::default();
        let list = [pills()];
        assert!(s.due(&list, at(28, 8, 59), true, 1).is_empty());
        assert_eq!(s.due(&list, at(28, 9, 0), true, 1), vec!["pills"]);
        assert!(s.due(&list, at(28, 9, 1), true, 1).is_empty());
        assert_eq!(s.due(&list, at(28, 21, 0), true, 1), vec!["pills"]);
        assert_eq!(s.due(&list, at(29, 9, 0), true, 1), vec!["pills"]);
    }

    #[test]
    fn a_slot_fires_late_but_not_too_late() {
        let mut s = State::default();
        let list = [pills()];
        // The computer woke at 9:40: still show the 9:00 reminder.
        assert_eq!(s.due(&list, at(28, 9, 40), false, 1), vec!["pills"]);
        let mut s = State::default();
        // At 10:30 the 9:00 slot is stale.
        assert!(s.due(&list, at(28, 10, 30), false, 1).is_empty());
    }

    #[test]
    fn only_on_chosen_days() {
        let mut s = State::default();
        let lunch = Reminder { id: "lunch".into(), days: vec![1, 2, 3, 4, 5], ..Default::default() };
        // 2026-10-03 is a Saturday.
        let saturday = NaiveDate::from_ymd_opt(2026, 10, 3).unwrap().and_hms_opt(13, 0, 0).unwrap();
        assert!(s.due(&[lunch.clone()], saturday, true, 1).is_empty());
        assert_eq!(s.due(&[lunch], at(28, 13, 0), true, 1), vec!["lunch"]);
    }

    #[test]
    fn disabled_reminders_stay_quiet() {
        let mut s = State::default();
        let r = Reminder { enabled: false, ..pills() };
        assert!(s.due(&[r], at(28, 9, 0), true, 1).is_empty());
    }

    #[test]
    fn interval_counts_only_minutes_of_work() {
        let mut s = State::default();
        let r = Reminder { id: "posture".into(), kind: "interval".into(), interval_min: 60, ..Default::default() };
        let list = [r];
        // 40 minutes of work, then 40 minutes away (lunch): nothing yet.
        for m in 0..40 {
            assert!(s.due(&list, at(28, 9, m), true, 60).is_empty());
        }
        for m in 0..40 {
            assert!(s.due(&list, at(28, 10, m), false, 60).is_empty());
        }
        // 20 more minutes of work make the hour.
        for m in 40..59 {
            assert!(s.due(&list, at(28, 10, m), true, 60).is_empty());
        }
        assert_eq!(s.due(&list, at(28, 10, 59), true, 60), vec!["posture"]);
        assert!(s.due(&list, at(28, 11, 0), true, 60).is_empty());
    }

    #[test]
    fn answering_starts_the_interval_again() {
        let mut s = State::default();
        let list = [Reminder { id: "p".into(), kind: "interval".into(), interval_min: 10, ..Default::default() }];
        for m in 0..9 {
            s.due(&list, at(28, 9, m), true, 60);
        }
        s.done("p");
        for m in 9..18 {
            assert!(s.due(&list, at(28, 9, m), true, 60).is_empty());
        }
        assert_eq!(s.due(&list, at(28, 9, 18), true, 60), vec!["p"]);
    }

    #[test]
    fn later_brings_it_back() {
        let mut s = State::default();
        let list = [pills()];
        assert_eq!(s.due(&list, at(28, 9, 0), true, 1), vec!["pills"]);
        s.snooze("pills", at(28, 9, 0), 10);
        assert!(s.due(&list, at(28, 9, 9), true, 1).is_empty());
        assert_eq!(s.due(&list, at(28, 9, 10), true, 1), vec!["pills"]);
        assert!(s.due(&list, at(28, 9, 11), true, 1).is_empty());
    }

    #[test]
    fn sanitize_fixes_bad_input() {
        let r = Reminder {
            id: "".into(),
            kind: "weird".into(),
            times: vec!["25:00".into(), "13:00".into(), "13:00".into(), "08:30".into()],
            days: vec![0, 9],
            interval_min: 1,
            ..Default::default()
        }
        .sanitized(3);
        assert_eq!(r.id, "r3");
        assert_eq!(r.kind, "times");
        assert_eq!(r.times, vec!["08:30", "13:00"]);
        assert_eq!(r.days, (1..=7).collect::<Vec<_>>());
        assert_eq!(r.interval_min, 5);
    }
}
