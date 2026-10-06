import { invoke } from "@tauri-apps/api/core";
import type { Section } from "./exercises/catalog";

export type Sections = Record<Section, boolean>;
export type Preset = "recommended" | "pomodoro" | "hourly" | "custom";
export type Theme = "system" | "light" | "dark";

export interface Settings {
  preset: Preset;
  sections: Sections;
  microEnabled: boolean;
  microIntervalMin: number;
  microLookSec: number;
  movementEnabled: boolean;
  movementIntervalMin: number;
  movementDurationMin: number;
  longEnabled: boolean;
  longIntervalMin: number;
  longDurationMin: number;
  blinkCueEnabled: boolean;
  blinkIntervalMin: number;
  blinkCueSec: number;
  postureCueEnabled: boolean;
  postureIntervalMin: number;
  waterEnabled: boolean;
  waterIntervalMin: number;
  cueSound: boolean;
  reminders: Reminder[];
  neckDaily: boolean;
  breathingDaily: boolean;
  endOfDayEnabled: boolean;
  endOfDayTime: string;
  workHoursEnabled: boolean;
  workDays: number[];
  workStart: string;
  workEnd: string;
  confirmDone: boolean;
  wellbeingEvery: "day" | "week";
  wellbeingDismissed: string | null;
  wellbeingLater: number;
  wellbeingWeeklyOffered: boolean;
  snoozeMin: number;
  idleResetMin: number;
  pauseOnCalls: boolean;
  pauseInFullscreen: boolean;
  respectDnd: boolean;
  soundEnabled: boolean;
  theme: Theme;
  language: string | null;
  checkUpdates: boolean;
  usageEnabled: boolean;
  usageExcluded: string[];
  usageCategories: Record<string, string>;
  onboardingDone: boolean;
}

export interface AppInfo {
  settings: Settings;
  language: string;
  languages: string[];
  isCis: boolean;
  version: string;
  mzrUrl: string;
  platform: "macos" | "windows" | "linux";
  wayland: boolean;
  usageSupported: boolean;
  wellbeingDue: boolean;
  /** The work day the evening answers are about. */
  wellbeingDay: string | null;
  /** "Not now" three evenings in a row: offer to ask once a week. */
  wellbeingOfferWeekly: boolean;
  /** Seconds the break screen waits for "Did it work out?"; 0 = don't ask. */
  confirmSec: number;
  /** 0..2: steps of extra repetitions in the daily neck minutes, earned by doing them regularly. */
  neckLevel: number;
}

/** A reminder of the user's own: at given times on given days, or every N minutes of working hours. */
export interface Reminder {
  id: string;
  title: string;
  enabled: boolean;
  kind: "times" | "interval";
  /** "HH:MM" */
  times: string[];
  /** 1 = Monday … 7 = Sunday */
  days: number[];
  intervalMin: number;
}

export interface KindCount {
  done: number;
  skipped: number;
  /** Nobody answered and nobody was at the computer. */
  away: number;
}

export const BREAK_KINDS = ["micro", "movement", "long", "neck", "breathing"] as const;
export type BreakKind = (typeof BREAK_KINDS)[number];
export type KindStats = Record<BreakKind, KindCount>;

export interface DayStats {
  day: string;
  done: number;
  skipped: number;
  postponed: number;
  away: number;
  /** Seconds of breaks done. */
  breakSec: number;
  kinds: KindStats;
  /** 2 on days counted with "Did it work out?". */
  v: number;
  microDone: number;
  movementDone: number;
  water: number;
  activeSec: number;
  longestSittingSec: number;
  sittingOver2h: number;
  /** Minutes after midnight: when work started and ended that day. Null before 0.1.8 or on days off. */
  firstActiveMin: number | null;
  lastActiveMin: number | null;
}

export interface DayUsage {
  day: string;
  apps: Record<string, number>;
  hours: number[];
  longest: { app: string; sec: number } | null;
}

export interface Wellbeing {
  eyes: number;
  neck: number;
  back: number;
  hands: number;
  note: string;
}

/** "missed": nobody answered "Did it work out?" in time. */
export type BreakResult = "done" | "skipped" | "postponed" | "missed";

export interface WeekSummary {
  done: number;
  stoodUp: number;
  neckDays: number;
  breathingDone: number;
  breakSec: number;
  away: number;
}

export type Areas = Record<"eyes" | "neck" | "back" | "hands", number>;

export interface WeekRow {
  /** Monday of the week. */
  start: string;
  done: number;
  skipped: number;
  away: number;
  share: number | null;
  breakSec: number;
  answers: number;
  feel: Areas | null;
  confirmed: boolean;
}

export interface ResultView {
  thisWeek: WeekSummary;
  lastWeek: WeekSummary;
  kinds: KindStats;
  breakSec: number;
  daysWorked: number;
  oldDays: number;
  avgLongestSittingSec: number;
  daysOver2h: number;
  /** Newest first. */
  weeks: WeekRow[];
  compare: { moreWeeks: number; fewerWeeks: number; more: Areas; fewer: Areas } | null;
  compareNeeds: number;
}

/** A change to settings: plain fields, or a function of the latest settings for arrays and maps. */
export type SettingsPatch = Partial<Settings> | ((s: Settings) => Partial<Settings>);

export const REPO_URL = "https://github.com/YadrovSergey/unslouch";
export const SITE_URL = "https://unslouch.health-diet.ru";
export const SUPPORT_EMAIL = "support@health-diet.ru";
/** The site's "thank the developer" page in the app's language: all ways to support live there,
 * so a new payment option never needs an app update. English is at the root, others under /<code>/. */
export function donatePage(language: string): string {
  const prefix = language === "en" ? "" : `/${language.toLowerCase()}`;
  return `${SITE_URL}${prefix}/donate/`;
}

/** Numbers behind each preset. "custom" keeps whatever the user set. */
export const PRESETS: Record<Exclude<Preset, "custom">, Partial<Settings>> = {
  recommended: {
    microEnabled: true,
    microIntervalMin: 20,
    microLookSec: 20,
    movementEnabled: true,
    movementIntervalMin: 45,
    movementDurationMin: 3,
    longEnabled: false,
  },
  pomodoro: {
    microEnabled: false,
    movementEnabled: true,
    movementIntervalMin: 25,
    movementDurationMin: 5,
    longEnabled: true,
    longIntervalMin: 120,
    longDurationMin: 15,
  },
  hourly: {
    microEnabled: true,
    microIntervalMin: 20,
    microLookSec: 20,
    movementEnabled: true,
    movementIntervalMin: 60,
    movementDurationMin: 5,
    longEnabled: false,
  },
};

export const getAppInfo = () => invoke<AppInfo>("get_app_info");
export const saveSettings = (settings: Settings) => invoke<AppInfo>("save_settings", { settings });
export const getStats = (days: number) => invoke<DayStats[]>("get_stats", { days });
export const getResult = (days: number) => invoke<ResultView>("get_result", { days });
/** "Try now" on the Result page: that break right away. */
export const startBreak = (kind: BreakKind) => invoke<void>("start_break", { kind });
export const getUsage = (days: number) => invoke<DayUsage[]>("get_usage", { days });
export const clearUsage = () => invoke<void>("clear_usage");
export const getWellbeing = () => invoke<Record<string, Wellbeing>>("get_wellbeing");
/** `day`: the work day the questions were asked for (`AppInfo.wellbeingDay`). */
export const saveWellbeing = (answers: Wellbeing, day?: string | null) =>
  invoke<Record<string, Wellbeing>>("save_wellbeing", { answers, day: day ?? null });
export const setWellbeing = (day: string, answers: Wellbeing) => invoke<Record<string, Wellbeing>>("set_wellbeing", { day, answers });
export const deleteWellbeing = (day: string) => invoke<Record<string, Wellbeing>>("delete_wellbeing", { day });
export const reminderAnswer = (id: string, laterMin?: number) => invoke<void>("reminder_answer", { id, laterMin });
export const previewReminder = (id: string) => invoke<void>("preview_reminder", { id });
export const sendBreakResult = (result: BreakResult, sec?: number) =>
  invoke<void>("break_result", { result, sec: sec == null ? null : Math.round(sec) });
export const waterDrunk = () => invoke<void>("water_drunk");
export const closeCue = () => invoke<void>("close_cue");
export const cueReady = () => invoke<void>("cue_ready");
export const previewCue = (cue: "blink" | "posture" | "water") => invoke<void>("preview_cue", { cue });
export const exportData = (path: string) => invoke<void>("export_data", { path });
export const importData = (path: string) => invoke<AppInfo>("import_data", { path });
/** "Keep every evening" in answer to "Ask once a week?": the offer doesn't come back. */
export const keepWellbeingDaily = () => invoke<void>("keep_wellbeing_daily");
/** "Not now"; `weekly`: the answer to "Ask once a week?". */
export const dismissWellbeing = (weekly?: boolean) => invoke<void>("dismiss_wellbeing", { weekly: weekly ?? null });
export const savePng = (path: string, data: number[]) => invoke<void>("save_png", { path, data });
