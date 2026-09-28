import data from "../../../docs/sources.json";
import { LANGS, t, type Lang } from "../i18n";
import { SCIENCE_SECTIONS } from "./scienceDoc";

/** Research sources cited in docs/science.*.md. docs/sources.json is the single source of truth: the reference
 * lists in the markdown and the /science/sources/ pages are built from it. */
export type Section = "eyes" | "neck" | "back" | "hands" | "legs" | "water" | "breath" | "workplace" | "microbreaks" | "endofday";
export type Kind = "study" | "review" | "guideline" | "webpage";

interface Text {
  short: string;
  summary: string;
  findings: string[];
  strength: string;
  inApp: string;
  titleTranslation?: string;
}

interface SourceMeta {
  slug: string;
  n: number;
  kind: Kind;
  authors: string;
  title: string;
  journal: string;
  year: number | null;
  volume_pages?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  url: string;
  links?: { label: string; url: string }[];
  sections: Section[];
  openAccess: boolean;
}

/** Every source has a short retelling in each site language. */
export type ResearchSource = SourceMeta & Record<Lang, Text>;

export const SOURCES = data as ResearchSource[];

export const SECTIONS: Section[] = ["eyes", "neck", "back", "hands", "legs", "water", "breath", "workplace", "microbreaks", "endofday"];

/** Section headings of docs/science.*.md and their generated ids. */
export const SECTION_INFO: Record<Lang, Record<Section, { label: string; anchor: string }>> = SCIENCE_SECTIONS;

/** Heading id of the reference list in docs/science.*.md. */
export const REFERENCES_ANCHOR = Object.fromEntries(LANGS.map((l) => [l, SCIENCE_SECTIONS[l].references.anchor])) as Record<Lang, string>;

export const sourcePath = (s: ResearchSource) => `/science/sources/${s.slug}/`;

/** Organisations get a short name in titles instead of "American Academy of Ophthalmology 2024". */
const ORG_SHORT: Record<string, string> = {
  "American Academy of Ophthalmology": "AAO",
  "American Optometric Association": "AOA",
  "Occupational Safety and Health Administration (OSHA)": "OSHA",
  "EFSA Panel on Dietetic Products, Nutrition, and Allergies (NDA)": "EFSA",
};

const authorList = (s: ResearchSource) => (ORG_SHORT[s.authors] ? [s.authors] : s.authors.split(",").map((a) => a.trim()));

/** "Dunstan 2012", "AOA". */
export function citeShort(s: ResearchSource) {
  const first = ORG_SHORT[s.authors] ?? authorList(s)[0].replace(/\s+[A-Z]+$/, "");
  return s.year ? `${first} ${s.year}` : first;
}

/** First three authors, then "et al." */
export function authorsShort(s: ResearchSource, lang: Lang) {
  const list = authorList(s);
  return list.length > 3 ? `${list.slice(0, 3).join(", ")} ${t(lang).sources.etAl}` : list.join(", ");
}

export interface Link {
  label: string;
  url: string;
}

/** DOI, PubMed, free full text, extra pages. */
export function sourceLinks(s: ResearchSource, lang: Lang): Link[] {
  const d = t(lang).sources;
  const links: Link[] = [];
  if (s.kind === "webpage") links.push({ label: d.openPage, url: s.url });
  if (s.doi) links.push({ label: d.doi, url: `https://doi.org/${s.doi}` });
  if (s.pmid) links.push({ label: d.pubmed, url: `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/` });
  if (s.pmcid) links.push({ label: d.fullText, url: `https://pmc.ncbi.nlm.nih.gov/articles/${s.pmcid}/` });
  else if (s.openAccess && s.doi && s.kind !== "webpage") links.push({ label: d.fullText, url: `https://doi.org/${s.doi}` });
  for (const l of s.links ?? []) links.push(l);
  // The same URL twice (EFSA: DOI and free full text) is shown once.
  return links.filter((l, i) => links.findIndex((x) => x.url === l.url) === i);
}

/** Up to `max` sources sharing a section, most shared sections first, then nearest in the list. */
export function related(s: ResearchSource, max = 5) {
  return SOURCES.filter((x) => x !== s)
    .map((x) => ({ x, shared: x.sections.filter((sec) => s.sections.includes(sec)).length }))
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared - a.shared || Math.abs(a.x.n - s.n) - Math.abs(b.x.n - s.n))
    .slice(0, max)
    .map((r) => r.x);
}

/** Meta description: whole sentences of the summary that fit into `max` characters. */
export function metaDescription(text: string, max = 160) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let out = "";
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  out = out.trim();
  if (out.length >= 80) return out;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

/** "Dunstan DW, Kingwell BA" -> "Dunstan DW, Kingwell BA." without doubling the dot after "et al." */
export const withDot = (s: string) => (s.endsWith(".") ? s : `${s}.`);
