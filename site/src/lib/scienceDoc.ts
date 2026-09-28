import type { MarkdownInstance } from "astro";
import { LANGS, type Lang } from "../i18n";

/** docs/science.<lang>.md for every site language. */
const DOCS = import.meta.glob<MarkdownInstance<Record<string, unknown>>>("../../../docs/science.*.md", { eager: true });

export function scienceDoc(lang: Lang) {
  const doc = DOCS[`../../../docs/science.${lang}.md`];
  if (!doc) throw new Error(`docs/science.${lang}.md is missing`);
  return doc;
}

/** The "##" sections of every docs/science.*.md, in this order. Anchors are generated from the heading text, so they
 * differ per language; they are looked up by position, and every translation keeps the same headings in the same order. */
export const SCIENCE_H2 = [
  "how",
  "eyes",
  "neck",
  "back",
  "hands",
  "legs",
  "water",
  "breath",
  "workplace",
  "microbreaks",
  "endofday",
  "references",
] as const;
export type ScienceSection = (typeof SCIENCE_H2)[number];

function sections(lang: Lang) {
  const h2 = scienceDoc(lang)
    .getHeadings()
    .filter((h) => h.depth === 2);
  if (h2.length !== SCIENCE_H2.length) {
    throw new Error(`docs/science.${lang}.md has ${h2.length} "##" headings, expected ${SCIENCE_H2.length} in the order of docs/science.en.md`);
  }
  return Object.fromEntries(SCIENCE_H2.map((k, i) => [k, { label: h2[i].text, anchor: h2[i].slug }])) as Record<
    ScienceSection,
    { label: string; anchor: string }
  >;
}

/** Heading text and id of each science section, per language. */
export const SCIENCE_SECTIONS = Object.fromEntries(LANGS.map((l) => [l, sections(l)])) as Record<
  Lang,
  Record<ScienceSection, { label: string; anchor: string }>
>;
