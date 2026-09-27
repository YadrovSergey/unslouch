import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const files = import.meta.glob<Record<string, unknown>>("./locales/*.json", { eager: true, import: "default" });

const resources = Object.fromEntries(
  Object.entries(files).map(([path, translation]) => [path.replace(/^.*\/([\w-]+)\.json$/, "$1"), { translation }]),
);

/** Each language named in itself, so a user who picked the wrong one can find theirs. */
export const LANGUAGE_NAMES: Record<string, string> = {
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

export function initI18n(language: string) {
  document.documentElement.lang = language;
  return i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export function setLanguage(language: string) {
  document.documentElement.lang = language;
  return i18n.changeLanguage(language);
}
