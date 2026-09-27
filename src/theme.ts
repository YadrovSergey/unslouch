import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Theme } from "./api";

/** Page colors follow data-theme; the native title bar follows the window theme. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    getCurrentWindow()
      .setTheme(theme === "system" ? null : theme)
      .catch(() => {});
  } catch {
    // Outside Tauri (browser preview): nothing to do.
  }
}
