// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { fileURLToPath } from "node:url";

// The one domain for every language: English at /, the others under /<code>/ (/ru/, /pt-br/, /zh-cn/).
const SITE = "https://unslouch.health-diet.ru";

// URL segment -> hreflang. Keep in sync with LANGS in src/i18n/index.ts.
const LOCALES = Object.fromEntries(
  ["en", "ru", "uk", "kk", "be", "uz", "hy", "ka", "az", "de", "es", "fr", "pt-BR", "tr", "zh-CN"].map((l) => [l.toLowerCase(), l]),
);
// Legal pages are written in English and Russian only; the other languages show the English text with a canonical
// link to it, so they stay out of the sitemap.
const LEGAL = /\/(privacy|terms|consent)\/$/;
/** @param {string} page */
const legalCopy = (page) => {
  const m = new URL(page).pathname.match(/^\/([a-z-]+)\/(privacy|terms|consent)\/$/);
  return Boolean(m && m[1] !== "ru" && LOCALES[m[1]]);
};

// The app sources (exercise catalog, figures, desk calculator, locales) live one level up and are shared
// with the site. They import `react`, so React is deduped to the site's own copy.
const appSrc = fileURLToPath(new URL("../src", import.meta.url));

export default defineConfig({
  site: SITE,
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes("/404") && !(LEGAL.test(page) && legalCopy(page)),
      i18n: { defaultLocale: "en", locales: LOCALES },
    }),
  ],
  vite: {
    resolve: {
      alias: { "@app": appSrc },
      dedupe: ["react", "react-dom"],
    },
    server: { fs: { allow: [".."] } },
  },
});
