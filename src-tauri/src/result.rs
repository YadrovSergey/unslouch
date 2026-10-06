//! The "Result" page in the statistics: what the user did and how they felt, side by side. Pure functions over
//! the day statistics and the wellbeing answers, so the numbers are covered by tests.

use crate::settings::{DayStats, KindCount, KindStats, Stats, WellbeingLog, STATS_CONFIRMED};
use crate::scheduler::BreakKind;
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use serde::Serialize;

/// Weeks looked at for the comparison.
const COMPARE_WEEKS: i64 = 26;
/// A week takes part in the comparison with at least this many breaks answered and this many evenings answered.
const COMPARE_MIN_BREAKS: u32 = 5;
const COMPARE_MIN_ANSWERS: u32 = 3;
/// Weeks needed on each side of the comparison.
const COMPARE_MIN_SIDE: usize = 3;

#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WeekSummary {
    pub done: u32,
    /// Stand-up and long breaks done.
    pub stood_up: u32,
    /// Days with the neck minutes done.
    pub neck_days: u32,
    pub breathing_done: u32,
    pub break_sec: u64,
    pub away: u32,
}

/// Average answers 0..=3; None without answers.
#[derive(Serialize, Default, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct Areas {
    pub eyes: f32,
    pub neck: f32,
    pub back: f32,
    pub hands: f32,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WeekRow {
    /// Monday of the week.
    pub start: String,
    pub done: u32,
    pub skipped: u32,
    pub away: u32,
    /// Share of answered breaks done: done / (done + skipped). Away breaks stay out of it.
    pub share: Option<f32>,
    pub break_sec: u64,
    /// Evenings answered.
    pub answers: u32,
    pub feel: Option<Areas>,
    /// Counted with "Did it work out?" (0.1.14 and later).
    pub confirmed: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Compare {
    pub more_weeks: u32,
    pub fewer_weeks: u32,
    /// Weeks with a share of breaks done above the user's own median, and below it.
    pub more: Areas,
    pub fewer: Areas,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResultView {
    pub this_week: WeekSummary,
    pub last_week: WeekSummary,
    /// Over the chosen period.
    pub kinds: KindStats,
    pub break_sec: u64,
    pub days_worked: u32,
    /// Days of the period with breaks counted before per-kind statistics: their kinds are unknown.
    pub old_days: u32,
    pub avg_longest_sitting_sec: u64,
    pub days_over_2h: u32,
    /// Newest first.
    pub weeks: Vec<WeekRow>,
    pub compare: Option<Compare>,
    /// Weeks still missing before the comparison can be shown.
    pub compare_needs: u32,
}

fn key(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn monday(d: NaiveDate) -> NaiveDate {
    d - Duration::days(d.weekday().num_days_from_monday() as i64)
}

fn days(stats: &Stats, from: NaiveDate, to: NaiveDate) -> impl Iterator<Item = (NaiveDate, DayStats)> + '_ {
    (0..=(to - from).num_days().max(-1)).map(move |i| {
        let d = from + Duration::days(i);
        (d, stats.get(&key(d)).copied().unwrap_or_default())
    })
}

fn add(a: &mut KindCount, b: KindCount) {
    a.done += b.done;
    a.skipped += b.skipped;
    a.away += b.away;
}

fn summary(stats: &Stats, from: NaiveDate, to: NaiveDate) -> WeekSummary {
    let mut w = WeekSummary::default();
    for (_, d) in days(stats, from, to) {
        w.done += d.done;
        w.stood_up += d.kinds.movement.done + d.kinds.long.done;
        w.neck_days += (d.kinds.neck.done > 0) as u32;
        w.breathing_done += d.kinds.breathing.done;
        w.break_sec += d.break_sec;
        w.away += d.away;
    }
    w
}

fn mean(values: &[Areas]) -> Option<Areas> {
    if values.is_empty() {
        return None;
    }
    let n = values.len() as f32;
    let sum = |f: fn(&Areas) -> f32| values.iter().map(f).sum::<f32>() / n;
    Some(Areas { eyes: sum(|a| a.eyes), neck: sum(|a| a.neck), back: sum(|a| a.back), hands: sum(|a| a.hands) })
}

fn week_row(stats: &Stats, wellbeing: &WellbeingLog, start: NaiveDate, today: NaiveDate) -> WeekRow {
    let end = (start + Duration::days(6)).min(today);
    let (mut done, mut skipped, mut away, mut break_sec, mut confirmed) = (0, 0, 0, 0, false);
    for (_, d) in days(stats, start, end) {
        done += d.done;
        skipped += d.skipped;
        away += d.away;
        break_sec += d.break_sec;
        confirmed |= d.v >= STATS_CONFIRMED;
    }
    let answers: Vec<Areas> = wellbeing
        .range(key(start)..=key(end))
        .map(|(_, w)| Areas { eyes: w.eyes as f32, neck: w.neck as f32, back: w.back as f32, hands: w.hands as f32 })
        .collect();
    WeekRow {
        start: key(start),
        done,
        skipped,
        away,
        share: (done + skipped > 0).then(|| done as f32 / (done + skipped) as f32),
        break_sec,
        answers: answers.len() as u32,
        feel: mean(&answers),
        confirmed,
    }
}

/// Weeks with more breaks done against weeks with fewer, split at the user's own median: a fixed threshold
/// would leave some users with one side only. Only weeks counted with confirmation and with enough answers.
fn compare(rows: &[WeekRow]) -> (Option<Compare>, u32) {
    let mut ok: Vec<&WeekRow> = rows
        .iter()
        .filter(|r| r.confirmed && r.done + r.skipped >= COMPARE_MIN_BREAKS && r.answers >= COMPARE_MIN_ANSWERS)
        .collect();
    let needs = (COMPARE_MIN_SIDE * 2).saturating_sub(ok.len()) as u32;
    if needs > 0 {
        return (None, needs);
    }
    ok.sort_by(|a, b| a.share.partial_cmp(&b.share).unwrap_or(std::cmp::Ordering::Equal));
    // Every week alike (all breaks done, say): there is nothing to compare.
    if ok.first().map(|r| r.share) == ok.last().map(|r| r.share) {
        return (None, 0);
    }
    let half = ok.len() / 2;
    // With an odd number of weeks the middle one belongs to neither side.
    let fewer: Vec<Areas> = ok[..half].iter().filter_map(|r| r.feel).collect();
    let more: Vec<Areas> = ok[ok.len() - half..].iter().filter_map(|r| r.feel).collect();
    let (Some(m), Some(f)) = (mean(&more), mean(&fewer)) else { return (None, 0) };
    (Some(Compare { more_weeks: more.len() as u32, fewer_weeks: fewer.len() as u32, more: m, fewer: f }), 0)
}

/// The full summary after a break comes this often at most, and this many times a day: praise twenty times a
/// day turns into noise. Otherwise one line.
const FULL_SUMMARY_EVERY_MIN: i64 = 120;
const FULL_SUMMARY_PER_DAY: u8 = 3;

/// After "Done": None for no summary, Some(false) for one line, Some(true) for the full card. The full one only
/// after the breaks the user stood up or worked for (stand-up, long, neck minutes), within the limits above.
pub fn summary_after(kind: BreakKind, last_full: Option<NaiveDateTime>, full_today: u8, now: NaiveDateTime) -> Option<bool> {
    match kind {
        BreakKind::EndOfDay => None,
        BreakKind::Micro | BreakKind::Breathing => Some(false),
        BreakKind::Movement | BreakKind::Long | BreakKind::NeckStrength => {
            let recent = last_full.is_some_and(|t| (now - t).num_minutes() < FULL_SUMMARY_EVERY_MIN);
            Some(!recent && full_today < FULL_SUMMARY_PER_DAY)
        }
    }
}

pub fn build(stats: &Stats, wellbeing: &WellbeingLog, today: NaiveDate, period: u32) -> ResultView {
    let from = today - Duration::days(period.clamp(1, 400) as i64 - 1);
    let mut kinds = KindStats::default();
    let (mut break_sec, mut days_worked, mut old_days, mut longest, mut over) = (0, 0, 0, 0, 0);
    for (_, d) in days(stats, from, today) {
        add(&mut kinds.micro, d.kinds.micro);
        add(&mut kinds.movement, d.kinds.movement);
        add(&mut kinds.long, d.kinds.long);
        add(&mut kinds.neck, d.kinds.neck);
        add(&mut kinds.breathing, d.kinds.breathing);
        break_sec += d.break_sec;
        if d.active_sec > 0 {
            days_worked += 1;
            longest += d.longest_sitting_sec;
            over += (d.sitting_over_2h > 0) as u32;
        }
        if d.v < STATS_CONFIRMED && d.done + d.skipped > 0 {
            old_days += 1;
        }
    }
    let this_monday = monday(today);
    let shown = ((period.clamp(1, 400) as i64 + 6) / 7).max(1);
    let all: Vec<WeekRow> = (0..COMPARE_WEEKS.max(shown))
        .map(|i| week_row(stats, wellbeing, this_monday - Duration::weeks(i), today))
        .collect();
    let (compare, compare_needs) = compare(&all[..COMPARE_WEEKS as usize]);
    let weeks = all.into_iter().take(shown as usize).collect();
    ResultView {
        this_week: summary(stats, this_monday, today),
        last_week: summary(stats, this_monday - Duration::weeks(1), this_monday - Duration::days(1)),
        kinds,
        break_sec,
        days_worked,
        old_days,
        avg_longest_sitting_sec: if days_worked > 0 { longest / days_worked as u64 } else { 0 },
        days_over_2h: over,
        weeks,
        compare,
        compare_needs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scheduler::{BreakKind, BreakResult};
    use crate::settings::Wellbeing;

    fn date(m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, m, d).unwrap()
    }

    /// A working day: `done` breaks done and `skipped` skipped, a stand-up break among the done ones.
    fn day(done: u32, skipped: u32) -> DayStats {
        let mut d = DayStats { active_sec: 6 * 3600, longest_sitting_sec: 3600, ..Default::default() };
        for i in 0..done {
            let kind = if i == 0 { BreakKind::Movement } else { BreakKind::Micro };
            d.record(kind, BreakResult::Done, 60, true);
        }
        for _ in 0..skipped {
            d.record(BreakKind::Micro, BreakResult::Skipped, 0, true);
        }
        d
    }

    fn feel(v: u8) -> Wellbeing {
        Wellbeing { eyes: v, neck: v, back: v, hands: v, note: String::new() }
    }

    #[test]
    fn full_summary_only_after_standing_up_and_not_too_often() {
        let at = |h| date(10, 6).and_hms_opt(h, 0, 0).unwrap();
        assert_eq!(summary_after(BreakKind::Micro, None, 0, at(10)), Some(false));
        assert_eq!(summary_after(BreakKind::Breathing, None, 0, at(10)), Some(false));
        assert_eq!(summary_after(BreakKind::EndOfDay, None, 0, at(19)), None);
        assert_eq!(summary_after(BreakKind::NeckStrength, None, 0, at(11)), Some(true));
        // An hour after the last full one: one line.
        assert_eq!(summary_after(BreakKind::Movement, Some(at(11)), 1, at(12)), Some(false));
        assert_eq!(summary_after(BreakKind::Movement, Some(at(11)), 1, at(13)), Some(true));
        // Three a day at most.
        assert_eq!(summary_after(BreakKind::Long, Some(at(11)), 3, at(16)), Some(false));
    }

    #[test]
    fn this_week_counts_what_was_done() {
        // Tuesday 6 October 2026: Monday and Tuesday of this week, Friday of the last one.
        let mut stats = Stats::new();
        stats.insert("2026-10-05".into(), day(4, 1));
        let mut tue = day(2, 0);
        tue.record(BreakKind::NeckStrength, BreakResult::Done, 120, true);
        tue.record(BreakKind::Breathing, BreakResult::Away, 0, true);
        stats.insert("2026-10-06".into(), tue);
        stats.insert("2026-10-02".into(), day(3, 0));
        let r = build(&stats, &WellbeingLog::new(), date(10, 6), 7);
        assert_eq!(r.this_week.done, 7);
        assert_eq!(r.this_week.stood_up, 2);
        assert_eq!(r.this_week.neck_days, 1);
        assert_eq!(r.this_week.break_sec, 6 * 60 + 120);
        assert_eq!(r.this_week.away, 1);
        assert_eq!(r.last_week.done, 3);
        assert_eq!(r.kinds.breathing.away, 1);
        assert_eq!(r.weeks.len(), 1);
        assert_eq!(r.weeks[0].start, "2026-10-05");
        assert_eq!(r.weeks[0].share, Some(7.0 / 8.0));
    }

    #[test]
    fn old_days_are_flagged_not_counted_as_zero_kinds() {
        let mut stats = Stats::new();
        stats.insert("2026-10-01".into(), DayStats { done: 9, skipped: 1, active_sec: 3600, ..Default::default() });
        let r = build(&stats, &WellbeingLog::new(), date(10, 6), 30);
        assert_eq!(r.old_days, 1);
        assert_eq!(r.kinds.micro.done, 0);
    }

    #[test]
    fn comparison_needs_three_weeks_on_each_side() {
        let mut stats = Stats::new();
        let mut log = WellbeingLog::new();
        let today = date(10, 6);
        // Five full weeks: not enough.
        for w in 1..=5 {
            let monday = monday(today) - Duration::weeks(w);
            for i in 0..5 {
                stats.insert(key(monday + Duration::days(i)), day(3, 1));
                log.insert(key(monday + Duration::days(i)), feel(1));
            }
        }
        let r = build(&stats, &log, today, 30);
        assert!(r.compare.is_none());
        assert_eq!(r.compare_needs, 1);
    }

    #[test]
    fn comparison_splits_at_the_median() {
        let mut stats = Stats::new();
        let mut log = WellbeingLog::new();
        let today = date(10, 6);
        // Weeks 1..=3 back: most breaks done, eyes fine. Weeks 4..=6: half skipped, eyes bother "noticeably".
        for w in 1..=6 {
            let monday = monday(today) - Duration::weeks(w);
            let (d, s, f) = if w <= 3 { (6, 0, 0) } else { (3, 3, 2) };
            for i in 0..5 {
                stats.insert(key(monday + Duration::days(i)), day(d, s));
                log.insert(key(monday + Duration::days(i)), feel(f));
            }
        }
        let c = build(&stats, &log, today, 90).compare.unwrap();
        assert_eq!((c.more_weeks, c.fewer_weeks), (3, 3));
        assert_eq!(c.more.eyes, 0.0);
        assert_eq!(c.fewer.eyes, 2.0);
    }

    #[test]
    fn unconfirmed_weeks_stay_out_of_the_comparison() {
        let mut stats = Stats::new();
        let mut log = WellbeingLog::new();
        let today = date(10, 6);
        for w in 1..=6 {
            let monday = monday(today) - Duration::weeks(w);
            for i in 0..5 {
                stats.insert(key(monday + Duration::days(i)), DayStats { done: 5, active_sec: 3600, ..Default::default() });
                log.insert(key(monday + Duration::days(i)), feel(1));
            }
        }
        assert_eq!(build(&stats, &log, today, 90).compare_needs, 6);
    }
}
