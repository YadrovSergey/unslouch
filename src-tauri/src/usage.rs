//! Time per program. Stores only program names and seconds, per day and per hour. Stays on this computer.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

pub const DAYS_KEPT: usize = 90;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Longest {
    pub app: String,
    pub sec: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct DayUsage {
    /// Program → seconds.
    pub apps: BTreeMap<String, u64>,
    /// Active seconds in each hour of the day.
    pub hours: Vec<u64>,
    /// The longest sitting stretch today and the program most of it went to.
    pub longest: Option<Longest>,
}

impl Default for DayUsage {
    fn default() -> Self {
        DayUsage { apps: BTreeMap::new(), hours: vec![0; 24], longest: None }
    }
}

/// Day ("2026-09-27") → usage.
pub type Usage = BTreeMap<String, DayUsage>;

/// Seconds per program inside the current sitting stretch.
#[derive(Default, Debug)]
pub struct Tracker {
    stretch: HashMap<String, u64>,
}

fn excluded(app: &str, list: &[String]) -> bool {
    list.iter().any(|e| e.eq_ignore_ascii_case(app))
}

impl Tracker {
    pub fn record(&mut self, usage: &mut Usage, day: &str, hour: u32, app: &str, exclude: &[String], dt: u64) {
        if excluded(app, exclude) {
            return;
        }
        let entry = usage.entry(day.to_string()).or_default();
        if entry.hours.len() != 24 {
            entry.hours.resize(24, 0);
        }
        *entry.apps.entry(app.to_string()).or_default() += dt;
        entry.hours[(hour as usize).min(23)] += dt;
        *self.stretch.entry(app.to_string()).or_default() += dt;
    }

    /// The user got up: remember the stretch if it is the longest today, credited to its main program.
    pub fn stretch_ended(&mut self, usage: &mut Usage, day: &str, sec: u64) {
        let main = self.stretch.drain().max_by_key(|(_, s)| *s).map(|(app, _)| app);
        let Some(app) = main else { return };
        let entry = usage.entry(day.to_string()).or_default();
        if entry.longest.as_ref().is_none_or(|l| sec > l.sec) {
            entry.longest = Some(Longest { app, sec });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregates_by_program_and_hour() {
        let mut usage = Usage::new();
        let mut t = Tracker::default();
        for _ in 0..90 {
            t.record(&mut usage, "2026-09-30", 10, "Code", &[], 1);
        }
        t.record(&mut usage, "2026-09-30", 11, "Telegram", &[], 30);
        let day = &usage["2026-09-30"];
        assert_eq!(day.apps["Code"], 90);
        assert_eq!(day.hours[10], 90);
        assert_eq!(day.hours[11], 30);
    }

    #[test]
    fn excluded_programs_are_not_written() {
        let mut usage = Usage::new();
        let mut t = Tracker::default();
        t.record(&mut usage, "2026-09-30", 10, "KeePassXC", &["keepassxc".into()], 5);
        assert!(usage.is_empty());
    }

    #[test]
    fn longest_stretch_goes_to_its_main_program() {
        let mut usage = Usage::new();
        let mut t = Tracker::default();
        t.record(&mut usage, "d", 9, "Code", &[], 3000);
        t.record(&mut usage, "d", 9, "Safari", &[], 600);
        t.stretch_ended(&mut usage, "d", 3600);
        t.record(&mut usage, "d", 11, "Safari", &[], 1200);
        t.stretch_ended(&mut usage, "d", 1200);
        assert_eq!(usage["d"].longest, Some(Longest { app: "Code".into(), sec: 3600 }));
    }
}
