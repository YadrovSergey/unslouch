// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { fileURLToPath } from "node:url";

// Canonical domain. English lives at /, Russian at /ru/.
// TODO: Russian pages will also be served at https://zasidelsya.ru (same files under /ru/ or a separate
// build with base "/"). When that domain is live, switch the ru hreflang/canonical in src/i18n/index.ts
// (RU_ORIGIN) and decide which one is canonical for Russian.
const SITE = "https://unslouch.app";

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
      filter: (page) => !page.includes("/404"),
      i18n: { defaultLocale: "en", locales: { en: "en", ru: "ru" } },
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
