import type { Wellbeing } from "../api";

export const WB_AREAS = ["eyes", "neck", "back", "hands"] as const;
export type WbArea = (typeof WB_AREAS)[number];

const DAY = 24 * 3600 * 1000;
const date = (key: string) => new Date(`${key}T12:00:00`).getTime();

/** Does `area` keep bothering as of entry `i`. Evening answers: "a lot" (3) on the last three answered evenings
 * within five days, or at least "noticeably" (2) on every answer of the two weeks before (six answers or more).
 * Weekly answers: "a lot" once, or at least "noticeably" twice in a row. */
function persistent(log: Record<string, Wellbeing>, keys: string[], i: number, area: WbArea, weekly: boolean): boolean {
  const before = keys.slice(0, i + 1);
  const end = date(before[before.length - 1]);
  const v = (k: string) => log[k][area];
  if (weekly) {
    const last2 = before.slice(-2);
    return v(before[before.length - 1]) >= 3 || (last2.length === 2 && end - date(last2[0]) <= 16 * DAY && last2.every((k) => v(k) >= 2));
  }
  const last3 = before.slice(-3);
  const recent = before.filter((k) => end - date(k) < 14 * DAY);
  const strong = last3.length === 3 && end - date(last3[0]) <= 5 * DAY && last3.every((k) => v(k) >= 3);
  const lasting = recent.length >= 6 && recent.every((k) => v(k) >= 2);
  return strong || lasting;
}

/** Areas that keep bothering, as of the newest answer. The app can't tell why from a number, so it only points
 * to "when to see a doctor" for that area: when the trouble starts and again each week while it lasts. Worked
 * out from the answers themselves, so nothing else is stored. */
export function doctorHints(log: Record<string, Wellbeing>, weekly = false): WbArea[] {
  const keys = Object.keys(log).sort();
  if (!keys.length) return [];
  return WB_AREAS.filter((a) => {
    let shown: number | null = null;
    let newest = false;
    keys.forEach((k, i) => {
      newest = persistent(log, keys, i, a, weekly) && (shown === null || date(k) - shown >= 7 * DAY);
      if (newest) shown = date(k);
    });
    return newest;
  });
}

/** The answers to start the form with: the newest entry if it is recent (three days, or eight for the weekly
 * questions). An old answer would be an anchor, not a shortcut. Only "fine" and "a little" are carried over:
 * "noticeably" and "a lot" are marked anew, so a habit of pressing "Save" never repeats a bad day. */
export function recentAnswers(log: Record<string, Wellbeing>, weekly: boolean, now = Date.now()): Record<WbArea, number> | null {
  const last = Object.keys(log).sort().pop();
  if (!last || now - date(last) > (weekly ? 8 : 3) * DAY) return null;
  const keep = (v: number) => (v <= 1 ? v : -1);
  const w = log[last];
  return { eyes: keep(w.eyes), neck: keep(w.neck), back: keep(w.back), hands: keep(w.hands) };
}
