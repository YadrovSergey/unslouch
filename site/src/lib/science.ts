import type { Source } from "@app/lib/sources";
import { LANGS, type Lang } from "../i18n";
import { SCIENCE_SECTIONS } from "./scienceDoc";

export type Topic = "eyes" | "neck" | "back" | "hands" | "legs" | "water" | "breath" | "workplace" | "micro";

/** Heading ids on the science page (generated from the headings of docs/science.*.md). */
export const ANCHORS = Object.fromEntries(
  LANGS.map((l) => {
    const x = SCIENCE_SECTIONS[l];
    const topics: Record<Topic, string> = {
      eyes: x.eyes.anchor,
      neck: x.neck.anchor,
      back: x.back.anchor,
      hands: x.hands.anchor,
      legs: x.legs.anchor,
      water: x.water.anchor,
      breath: x.breath.anchor,
      workplace: x.workplace.anchor,
      micro: x.microbreaks.anchor,
    };
    return [l, topics];
  }),
) as Record<Lang, Record<Topic, string>>;

/** Sources used on the site that are listed in docs/science but not in src/lib/sources.ts. */
export const EXTRA_SOURCES: Record<string, Source> = {
  albulescu: {
    label: "Albulescu et al., 2022. PLOS ONE: micro-breaks meta-analysis",
    url: "https://pubmed.ncbi.nlm.nih.gov/36044424/",
  },
  aoa: {
    label: "American Optometric Association: computer vision syndrome",
    url: "https://www.aoa.org/healthy-eyes/eye-and-vision-conditions/computer-vision-syndrome",
  },
};
