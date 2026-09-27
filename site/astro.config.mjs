// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { fileURLToPath } from "node:url";

// The one domain for every language: English at /, Russian at /ru/.
const SITE = "https://unslouch.ru";

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
