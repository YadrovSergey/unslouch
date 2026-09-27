import i18n from "i18next";

/** 125 → "2:05"; with `words` → "2 ч 05 мин" style from the locale. */
export function formatDuration(sec: number, words = false): string {
  const s = Math.max(0, Math.round(sec));
  if (!words) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? i18n.t("time.hm", { h, m }) : i18n.t("time.m", { m });
}
