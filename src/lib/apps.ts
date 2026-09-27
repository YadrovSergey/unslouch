/** Friendly names and default categories for common programs. Keys are lowercase names as the OS reports them
 * (macOS app name, Windows exe name, Linux WM_CLASS). */
export type Category = "work" | "communication" | "entertainment" | "other";

const KNOWN: Record<string, { name?: string; category: Category }> = {
  code: { name: "Visual Studio Code", category: "work" },
  "visual studio code": { category: "work" },
  cursor: { category: "work" },
  "intellij idea": { category: "work" },
  idea64: { name: "IntelliJ IDEA", category: "work" },
  phpstorm: { category: "work" },
  phpstorm64: { name: "PhpStorm", category: "work" },
  webstorm: { category: "work" },
  xcode: { category: "work" },
  terminal: { category: "work" },
  iterm2: { category: "work" },
  warp: { category: "work" },
  windowsterminal: { name: "Terminal", category: "work" },
  "gnome-terminal-server": { name: "Terminal", category: "work" },
  figma: { category: "work" },
  "microsoft word": { category: "work" },
  winword: { name: "Word", category: "work" },
  "microsoft excel": { category: "work" },
  excel: { name: "Excel", category: "work" },
  powerpnt: { name: "PowerPoint", category: "work" },
  "microsoft powerpoint": { category: "work" },
  notion: { category: "work" },
  obsidian: { category: "work" },
  "1cv8": { name: "1С", category: "work" },
  telegram: { category: "communication" },
  telegramdesktop: { name: "Telegram", category: "communication" },
  slack: { category: "communication" },
  "microsoft teams": { category: "communication" },
  "ms-teams": { name: "Microsoft Teams", category: "communication" },
  zoom: { category: "communication" },
  "zoom.us": { name: "Zoom", category: "communication" },
  whatsapp: { category: "communication" },
  discord: { category: "communication" },
  mail: { category: "communication" },
  outlook: { category: "communication" },
  "microsoft outlook": { category: "communication" },
  thunderbird: { category: "communication" },
  skype: { category: "communication" },
  spotify: { category: "entertainment" },
  music: { category: "entertainment" },
  vlc: { category: "entertainment" },
  steam: { category: "entertainment" },
  steamwebhelper: { name: "Steam", category: "entertainment" },
  netflix: { category: "entertainment" },
  chrome: { name: "Google Chrome", category: "other" },
  "google chrome": { category: "other" },
  "google-chrome": { name: "Google Chrome", category: "other" },
  msedge: { name: "Microsoft Edge", category: "other" },
  firefox: { name: "Firefox", category: "other" },
  safari: { category: "other" },
  "yandex": { name: "Яндекс Браузер", category: "other" },
  browser: { name: "Яндекс Браузер", category: "other" },
  finder: { category: "other" },
  explorer: { name: "Explorer", category: "other" },
};

export function appName(raw: string): string {
  return KNOWN[raw.toLowerCase()]?.name ?? raw;
}

export function appCategory(raw: string, overrides: Record<string, string>): Category {
  const own = overrides[raw] as Category | undefined;
  return own ?? KNOWN[raw.toLowerCase()]?.category ?? "other";
}
