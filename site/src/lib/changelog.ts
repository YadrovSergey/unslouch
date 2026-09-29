import type { MarkdownInstance } from "astro";
import type { Lang } from "../i18n";
import * as en from "../../../CHANGELOG.md";
import * as ru from "../../../CHANGELOG.ru.md";
import enRaw from "../../../CHANGELOG.md?raw";

/** The app changelog from the repo root: CHANGELOG.ru.md for Russian, CHANGELOG.md for every other language. */
const DOCS: Record<"en" | "ru", MarkdownInstance<Record<string, unknown>>> = { en, ru };

export async function changelogHtml(lang: Lang) {
  const html = await DOCS[lang === "ru" ? "ru" : "en"].compiledContent();
  // The intro links the file in the other language ("Russian version: [CHANGELOG.ru.md](CHANGELOG.ru.md)."). On the
  // site that is a link to a .md file; the language menu does that job, so the sentence is dropped.
  return html.replace(/\s*[^.<>]*<a href="(?:\.\/)?CHANGELOG(?:\.\w+)?\.md">[^<]*<\/a>\.?/g, "");
}

/** The newest released version: the first "## x.y.z · date" section that is not "Unreleased". Versions are the same
 * in both files, so the English one is read. */
export const LATEST_VERSION = enRaw.match(/^##\s+v?(\d+\.\d+\.\d+)/m)?.[1];
