import type { Source } from "@app/lib/sources";
import type { Lang } from "../i18n";

export type Topic = "eyes" | "neck" | "back" | "hands" | "legs" | "water" | "breath" | "workplace" | "micro";

/** Heading ids on the science page (generated from the headings of docs/science.*.md). */
export const ANCHORS: Record<Lang, Record<Topic, string>> = {
  en: {
    eyes: "eyes",
    neck: "neck-and-shoulders",
    back: "back-and-long-sitting",
    hands: "hands",
    legs: "legs",
    water: "water",
    breath: "breathing",
    workplace: "workstation",
    micro: "micro-breaks-in-general",
  },
  ru: {
    eyes: "глаза",
    neck: "шея-и-плечи",
    back: "спина-и-долгое-сидение",
    hands: "кисти",
    legs: "ноги",
    water: "вода",
    breath: "дыхание",
    workplace: "рабочее-место",
    micro: "микропаузы-в-целом",
  },
};

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
