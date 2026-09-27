import en, { type Dict } from "./en";
import ru from "./ru";
import appEn from "@app/locales/en.json";
import appRu from "@app/locales/ru.json";

/** Languages the site is built in. To add one: create `xx.ts` with the `Dict` shape, add it here and to
 * `APP` (the app already has 15 locale files in ../src/locales), and to the sitemap i18n map. */
export const LANGS = ["en", "ru"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

const DICTS: Record<Lang, Dict> = { en, ru };
const APP: Record<Lang, typeof appEn> = { en: appEn, ru: appRu as typeof appEn };

export const ORIGIN = "https://unslouch.health-diet.ru";
// Russian pages live on the same domain under /ru/. Kept separate in case they ever get their own domain.
export const RU_ORIGIN = ORIGIN;

export const GITHUB = "https://github.com/YadrovSergey/unslouch";
export const RELEASES = "https://github.com/YadrovSergey/unslouch/releases/latest";
/** Installers with stable names, copied to the same bucket as the site by cdn.yml on every release. */
export const DOWNLOADS = {
  mac: "/releases/latest/Unslouch.dmg",
  win: "/releases/latest/Unslouch-Setup-x64.exe",
  winArm: "/releases/latest/Unslouch-Setup-arm64.exe",
  linux: "/releases/latest/Unslouch-x86_64.AppImage",
  linuxArm: "/releases/latest/Unslouch-aarch64.AppImage",
  deb: "/releases/latest/unslouch_amd64.deb",
  debArm: "/releases/latest/unslouch_arm64.deb",
  rpm: "/releases/latest/unslouch.x86_64.rpm",
  rpmArm: "/releases/latest/unslouch.aarch64.rpm",
} as const;
export const EMAIL = "support@health-diet.ru";

export const t = (lang: Lang): Dict => DICTS[lang];
export const app = (lang: Lang) => APP[lang];

export const prefix = (lang: Lang) => (lang === DEFAULT_LANG ? "" : `/${lang}`);

/** Link to a page in the given language. `path` is language-neutral and starts and ends with "/". */
export const href = (lang: Lang, path: string) => `${prefix(lang)}${path}`;

export const absolute = (lang: Lang, path: string) => `${lang === "ru" ? RU_ORIGIN : ORIGIN}${href(lang, path)}`;

/** getStaticPaths entries for pages under src/pages/[...lang]/: English at the root, others under /xx/. */
export const langPaths = () =>
  LANGS.map((lang) => ({ params: { lang: lang === DEFAULT_LANG ? undefined : lang }, props: { lang } }));

/** Simple "{name}" substitution. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

export type { Dict };
