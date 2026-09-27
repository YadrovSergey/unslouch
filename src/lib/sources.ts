import type { Section } from "../exercises/catalog";

export interface Source {
  label: string;
  url: string;
}

/** The main sources behind each section, shown under "Why this". The full list is in docs/science. */
export const SOURCES: Record<Section | "water" | "workplace", Source[]> = {
  eyes: [
    { label: "Talens-Estarelles et al., 2023. Contact Lens & Anterior Eye", url: "https://doi.org/10.1016/j.clae.2022.101744" },
    { label: "Sheppard & Wolffsohn, 2018. BMJ Open Ophthalmology", url: "https://doi.org/10.1136/bmjophth-2018-000146" },
    { label: "American Academy of Ophthalmology", url: "https://www.aao.org/eye-health/tips-prevention/computer-usage" },
  ],
  neck: [
    { label: "Chen et al., 2018. Physical Therapy (27 RCTs)", url: "https://pubmed.ncbi.nlm.nih.gov/29088401/" },
    { label: "Andersen et al., 2011. Pain: 2 minutes a day", url: "https://www.sciencedirect.com/science/article/abs/pii/S0304395910007013" },
  ],
  back: [
    { label: "Dunstan et al., 2012. Diabetes Care", url: "https://doi.org/10.2337/dc11-1931" },
    { label: "WHO guidelines on physical activity, 2020", url: "https://doi.org/10.1136/bjsports-2020-102955" },
    { label: "O'Sullivan et al., 2020. BJSM: 10 facts about back pain", url: "https://pubmed.ncbi.nlm.nih.gov/31892534/" },
  ],
  hands: [
    { label: "McLean et al., 2001. Applied Ergonomics: micro-breaks", url: "https://pubmed.ncbi.nlm.nih.gov/11394463/" },
    { label: "Galinsky et al., 2007. Am J Ind Med", url: "https://pubmed.ncbi.nlm.nih.gov/17514726/" },
    { label: "Thomsen et al., 2008. BMC Musculoskelet Disord", url: "https://pubmed.ncbi.nlm.nih.gov/18838001/" },
  ],
  legs: [
    { label: "Healy et al., 2010. J R Soc Med", url: "https://doi.org/10.1258/jrsm.2010.100155" },
    { label: "Duran et al., 2023. Med Sci Sports Exerc", url: "https://doi.org/10.1249/MSS.0000000000003109" },
  ],
  breath: [
    { label: "Fincham et al., 2023. Scientific Reports", url: "https://www.nature.com/articles/s41598-022-27247-y" },
    { label: "Zaccaro et al., 2018. Front Hum Neurosci", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6137615/" },
  ],
  water: [
    { label: "Wittbrodt & Millard-Stafford, 2018. MSSE", url: "https://journals.lww.com/acsm-msse/Fulltext/2018/11000/Dehydration_Impairs_Cognitive_Performance__A.21.aspx" },
    { label: "EFSA, 2010. Dietary reference values for water", url: "https://doi.org/10.2903/j.efsa.2010.1459" },
  ],
  workplace: [
    { label: "OSHA: Computer workstations eTool", url: "https://www.osha.gov/etools/computer-workstations" },
    { label: "Hoe et al., 2018. Cochrane", url: "https://pubmed.ncbi.nlm.nih.gov/30350850/" },
  ],
};
