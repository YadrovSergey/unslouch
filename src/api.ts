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
  postureCueEnabled: boolean;
  postureIntervalMin: number;
  waterEnabled: boolean;
  waterIntervalMin: number;
  neckDaily: boolean;
  breathingDaily: boolean;
  endOfDayEnabled: boolean;
  endOfDayTime: string;
  workHoursEnabled: boolean;
  workDays: number[];
  workStart: string;
  workEnd: string;
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
}

export interface DayStats {
  day: string;
  done: number;
  skipped: number;
  postponed: number;
  microDone: number;
  movementDone: number;
  water: number;
  activeSec: number;
  longestSittingSec: number;
  sittingOver2h: number;
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
}

export type BreakResult = "done" | "skipped" | "postponed";

/** A change to settings: plain fields, or a function of the latest settings for arrays and maps. */
export type SettingsPatch = Partial<Settings> | ((s: Settings) => Partial<Settings>);

export const REPO_URL = "https://github.com/YadrovSergey/unslouch";
export const SITE_URL = "https://unslouch.health-diet.ru";
/** Donations: CloudTips, Russian bank cards and SBP only for now. */
export const DONATE_URL = "https://pay.cloudtips.ru/p/9f9a4590";

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
export const getUsage = (days: number) => invoke<DayUsage[]>("get_usage", { days });
export const clearUsage = () => invoke<void>("clear_usage");
export const getWellbeing = () => invoke<Record<string, Wellbeing>>("get_wellbeing");
export const saveWellbeing = (answers: Wellbeing) => invoke<void>("save_wellbeing", { answers });
export const sendBreakResult = (result: BreakResult) => invoke<void>("break_result", { result });
export const waterDrunk = () => invoke<void>("water_drunk");
export const closeCue = () => invoke<void>("close_cue");
export const exportData = (path: string) => invoke<void>("export_data", { path });
export const importData = (path: string) => invoke<AppInfo>("import_data", { path });
export const dismissWellbeing = () => invoke<void>("dismiss_wellbeing");
export const savePng = (path: string, data: number[]) => invoke<void>("save_png", { path, data });
