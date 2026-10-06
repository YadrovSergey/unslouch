import type { DayStats, Wellbeing } from "../api";
import { WB_AREAS, WbArea } from "./wellbeing";

/** Mirrors NECK_STEP_DAYS / NECK_MAX_LEVEL in src-tauri/src/lib.rs: a step of repetitions per 8 days with the neck
 * minutes in the last 4 weeks, two steps at most. */
const NECK_STEP_DAYS = 8;
const NECK_MAX_LEVEL = 2;
/** Average answers this much lower than the week before is worth a word; less is noise on a 0..3 scale. */
const BETTER_BY = 0.5;
const MIN_ANSWERS = 3;

const DAY = 24 * 3600 * 1000;
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The neck routine as of today (`days` oldest first, today last): days with it this week (from Monday), whether
 * today's was the one that earned a new step, and days still to go to the next step. */
export function neckProgress(days: DayStats[]) {
  const today = days[days.length - 1];
  const withNeck = (d: DayStats) => (d.kinds?.neck.done ?? 0) > 0;
  const weekday = (new Date(`${today.day}T12:00:00`).getDay() + 6) % 7;
  const thisWeek = days.slice(-(weekday + 1)).filter(withNeck).length;
  const month = days.slice(-28).filter(withNeck).length;
  const level = Math.min(NECK_MAX_LEVEL, Math.floor(month / NECK_STEP_DAYS));
  const firstToday = (today.kinds?.neck.done ?? 0) === 1;
  const levelUp = firstToday && month > 0 && month % NECK_STEP_DAYS === 0 && month / NECK_STEP_DAYS <= NECK_MAX_LEVEL;
  const toNext = level < NECK_MAX_LEVEL ? NECK_STEP_DAYS * (level + 1) - month : null;
  return { thisWeek, levelUp, toNext };
}

/** Breaks done this week so far and over the same days of last week: comparing a Wednesday with a whole week
 * would always look like falling behind. */
export function weekSoFar(days: DayStats[]) {
  const today = days[days.length - 1];
  const weekday = (new Date(`${today.day}T12:00:00`).getDay() + 6) % 7;
  const now = days.slice(-(weekday + 1)).reduce((s, d) => s + d.done, 0);
  const lastWeek = days.slice(-(weekday + 8), -7);
  const then = lastWeek.reduce((s, d) => s + d.done, 0);
  return { now, then, comparable: lastWeek.length === weekday + 1 };
}

/** The first area the evening answers say bothered less this week than the week before, if any. Only from the
 * evening answers: nothing is asked or saved here. */
export function betterArea(log: Record<string, Wellbeing>, now = Date.now()): WbArea | null {
  const inRange = (from: number, to: number) =>
    Object.keys(log).filter((k) => k >= key(new Date(now - to * DAY)) && k <= key(new Date(now - from * DAY)));
  const recent = inRange(0, 6);
  const before = inRange(7, 13);
  if (recent.length < MIN_ANSWERS || before.length < MIN_ANSWERS) return null;
  const avg = (keys: string[], a: WbArea) => keys.reduce((s, k) => s + log[k][a], 0) / keys.length;
  return WB_AREAS.find((a) => avg(before, a) - avg(recent, a) >= BETTER_BY) ?? null;
}
