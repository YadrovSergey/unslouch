import { href, type Lang } from "../i18n";

/** The markdown files link to each other with repo paths (../docs/science.en.md). On the site those are pages. */
export function fixLinks(html: string, lang: Lang) {
  return html
    .replace(/href="(?:\.\.\/)?docs\/science\.(\w+)\.md(#[^"]*)?"/g, (_, _l, hash = "") => `href="${href(lang, "/science/")}${hash}"`)
    .replace(/href="(?:\.\.\/)?legal\/(privacy|terms)\.(\w+)\.md(#[^"]*)?"/g, (_, page, _l, hash = "") => `href="${href(lang, `/${page}/`)}${hash}"`)
    .replace(/<a href="http/g, '<a rel="noopener" href="http');
}
