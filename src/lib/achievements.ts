import type { DayStats } from "../api";

export interface Achievement {
  id: string;
  earned: boolean;
  /** 0..1 toward the goal. */
  progress: number;
}

/** A day counts toward the streak when at least one break was done and no more were skipped than done.
 * Days without any computer time (weekends, holidays) do not break it. */
export function streak(days: DayStats[]): number {
  let count = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    const isToday = i === days.length - 1;
    if (d.activeSec === 0) continue;
    const good = d.done > 0 && d.done >= d.skipped;
    if (good) count++;
    else if (!isToday) break;
  }
  return count;
}

/** The longest run of days passing `good` over the whole history; days without computer time are skipped. */
function bestRun(days: DayStats[], good: (d: DayStats) => boolean, counts: (d: DayStats) => boolean): number {
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (!counts(d)) continue;
    run = good(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Earned badges stay earned: streaks use the best run in history, not the current one. */
export function achievements(days: DayStats[]): Achievement[] {
  const sum = (f: (d: DayStats) => number) => days.reduce((s, d) => s + f(d), 0);
  const done = sum((d) => d.done);
  const movement = sum((d) => d.movementDone);
  const water = sum((d) => d.water);
  const current = Math.max(
    streak(days),
    bestRun(days, (d) => d.done > 0 && d.done >= d.skipped, (d) => d.activeSec > 0),
  );
  // Working days in a row without a 2-hour sitting stretch.
  const noLongSitting = bestRun(days, (d) => d.sittingOver2h === 0, (d) => d.activeSec >= 2 * 3600);
  const goal = (id: string, value: number, target: number): Achievement => ({
    id,
    earned: value >= target,
    progress: Math.min(1, value / target),
  });
  return [
    goal("firstBreak", done, 1),
    goal("streak7", current, 7),
    goal("streak30", current, 30),
    goal("breaks100", done, 100),
    goal("breaks1000", done, 1000),
    goal("standUp100", movement, 100),
    goal("water50", water, 50),
    goal("noLongSitting5", noLongSitting, 5),
  ];
}
