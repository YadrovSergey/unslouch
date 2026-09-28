/**
 * Comparison data. Every competitor fact was checked on 27 September 2026 against the official site,
 * GitHub repository or App Store page listed in `checked`. The texts live in the site dictionaries
 * (`compareData` in src/i18n/*.ts); a cell missing there could not be confirmed and is shown empty.
 * Keep the tone neutral: facts, no "better".
 */
import { t, type Dict, type Lang } from "../i18n";

export const ROWS = ["price", "source", "platforms", "eyes", "exercises", "cues", "calls", "quiet", "stats", "languages", "data"] as const;
export type Row = (typeof ROWS)[number];

export interface App {
  slug: keyof Dict["compareData"]["apps"];
  name: string;
  url: string;
  checked: string[];
}

/** Our own column. */
export const ours = (lang: Lang, row: Row): string => t(lang).compareData.ours[row];

/** A competitor's texts in the given language. `cell` returns undefined for unchecked cells. */
export function appText(lang: Lang, x: App) {
  const a = t(lang).compareData.apps[x.slug];
  return { ...a, cell: (row: Row): string | undefined => (a.cells as Partial<Record<Row, string>>)[row] };
}

export const COMPETITORS: App[] = [
  {
    slug: "stretchly",
    name: "Stretchly",
    url: "https://hovancik.net/stretchly/",
    checked: ["https://hovancik.net/stretchly/", "https://github.com/hovancik/stretchly"],
  },
  {
    slug: "lookaway",
    name: "LookAway",
    url: "https://lookaway.com/",
    checked: ["https://lookaway.com/", "https://lookaway.com/pricing", "https://lookaway.com/privacy", "https://apps.apple.com/us/app/lookaway-break-reminder/id6747192301"],
  },
  {
    slug: "breaktimer",
    name: "BreakTimer",
    url: "https://breaktimer.app/",
    checked: ["https://breaktimer.app/", "https://github.com/tom-james-watson/breaktimer-app"],
  },
  {
    slug: "time-out",
    name: "Time Out",
    url: "https://www.dejal.com/timeout/",
    checked: ["https://www.dejal.com/timeout/", "https://apps.apple.com/us/app/time-out-break-reminders/id402592703"],
  },
  {
    slug: "deskbreak",
    name: "DeskBreak",
    url: "https://www.deskbreak.app/",
    checked: ["https://www.deskbreak.app/", "https://www.deskbreak.app/features", "https://www.deskbreak.app/features/break-reminders"],
  },
];
