import en, { type Dict } from "./en";
import ru from "./ru";
import uk from "./uk";
import kk from "./kk";
import be from "./be";
import uz from "./uz";
import hy from "./hy";
import ka from "./ka";
import az from "./az";
import de from "./de";
import es from "./es";
import fr from "./fr";
import ptBR from "./pt-BR";
import tr from "./tr";
import zhCN from "./zh-CN";
import appEn from "@app/locales/en.json";
import appRu from "@app/locales/ru.json";
import appUk from "@app/locales/uk.json";
import appKk from "@app/locales/kk.json";
import appBe from "@app/locales/be.json";
import appUz from "@app/locales/uz.json";
import appHy from "@app/locales/hy.json";
import appKa from "@app/locales/ka.json";
import appAz from "@app/locales/az.json";
import appDe from "@app/locales/de.json";
import appEs from "@app/locales/es.json";
import appFr from "@app/locales/fr.json";
import appPtBR from "@app/locales/pt-BR.json";
import appTr from "@app/locales/tr.json";
import appZhCN from "@app/locales/zh-CN.json";

/** Languages the site is built in, the same 15 as the app. A code is a BCP 47 tag (`<html lang>`, hreflang);
 * its URL prefix is the lowercase code (`/pt-br/`). To add one: create `xx.ts` with the `Dict` shape, add it to
 * `DICTS`, `APP` and `LANG_NAMES`, to the sitemap i18n map in astro.config.mjs and to docs (science.xx.md, sources.json). */
export const LANGS = ["en", "ru", "uk", "kk", "be", "uz", "hy", "ka", "az", "de", "es", "fr", "pt-BR", "tr", "zh-CN"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

/** Legal pages (privacy, terms, consent) are written in these languages only. The others show the English text. */
export const LEGAL_LANGS: readonly Lang[] = ["en", "ru"];

/** Each language by its own name, for the language menu. */
export const LANG_NAMES: Record<Lang, string> = {
  ru: "Русский",
  en: "English",
  uk: "Українська",
  kk: "Қазақша",
  be: "Беларуская",
  uz: "Oʻzbekcha",
  hy: "Հայերեն",
  ka: "ქართული",
  az: "Azərbaycanca",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  "pt-BR": "Português (Brasil)",
  tr: "Türkçe",
  "zh-CN": "简体中文",
};

const DICTS: Record<Lang, Dict> = { en, ru, uk, kk, be, uz, hy, ka, az, de, es, fr, "pt-BR": ptBR, tr, "zh-CN": zhCN };
const APP: Record<Lang, typeof appEn> = {
  en: appEn,
  ru: appRu as typeof appEn,
  uk: appUk as typeof appEn,
  kk: appKk as typeof appEn,
  be: appBe as typeof appEn,
  uz: appUz as typeof appEn,
  hy: appHy as typeof appEn,
  ka: appKa as typeof appEn,
  az: appAz as typeof appEn,
  de: appDe as typeof appEn,
  es: appEs as typeof appEn,
  fr: appFr as typeof appEn,
  "pt-BR": appPtBR as typeof appEn,
  tr: appTr as typeof appEn,
  "zh-CN": appZhCN as typeof appEn,
};

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
/** Donations: CloudTips accepts Russian bank cards and SBP only. */
export const DONATE = "https://pay.cloudtips.ru/p/9f9a4590";
/** Donations: Boosty, one-off or monthly, takes cards from other countries too. */
export const BOOSTY = "https://boosty.to/unslouch";
/** The МЗР food diary, tagged so its analytics can tell visits from this site. `place` names the link. */
export const mzrLink = (place: string) =>
  `https://health-diet.ru/?utm_source=unslouch&utm_medium=site&utm_campaign=unslouch&utm_content=${place}`;

export const t = (lang: Lang): Dict => DICTS[lang];
export const app = (lang: Lang) => APP[lang];

/** URL segment of a language: "pt-br" for pt-BR. */
export const urlCode = (lang: Lang) => lang.toLowerCase();

export const prefix = (lang: Lang) => (lang === DEFAULT_LANG ? "" : `/${urlCode(lang)}`);

/** Link to a page in the given language. `path` is language-neutral and starts and ends with "/". */
export const href = (lang: Lang, path: string) => `${prefix(lang)}${path}`;

export const absolute = (lang: Lang, path: string) => `${lang === "ru" ? RU_ORIGIN : ORIGIN}${href(lang, path)}`;

/** getStaticPaths entries for pages under src/pages/[...lang]/: English at the root, others under /xx/. */
export const langParam = (lang: Lang) => (lang === DEFAULT_LANG ? undefined : urlCode(lang));
export const langPaths = () => LANGS.map((lang) => ({ params: { lang: langParam(lang) }, props: { lang } }));

/** Simple "{name}" substitution. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

export type { Dict };
