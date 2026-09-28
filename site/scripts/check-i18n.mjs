// Checks the site translations: every dictionary has exactly the keys of en.ts, every source in docs/sources.json has
// all languages with the same numbers as English, docs/science.*.md keep the English heading structure, no em dash
// anywhere, and feet or inches only in English.
// Usage (Node 22.18+ for TypeScript imports): node scripts/check-i18n.mjs
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url).pathname;
const LANGS = ["en", "ru", "uk", "kk", "be", "uz", "hy", "ka", "az", "de", "es", "fr", "pt-BR", "tr", "zh-CN"];
const NEW = LANGS.filter((l) => l !== "en" && l !== "ru");
const PLURALS = new Set(["player.sec", "player.min"]);
const IMPERIAL_KEYS = new Set(["tools.deskHeight.unitIn", "tools.deskHeight.feet", "tools.deskHeight.inches"]);
// Imperial units after a number, in any of the site languages, or the English words anywhere.
const FEET_AFTER_NUMBER = /\d\s?(feet|foot|ft|inch|inches|fuß|zoll|pieds?|pouces?|pies|pulgadas?|pés|polegadas?|фут|дюйм|цал|fit|inç|英尺|英寸)(?!\p{L})/iu;
const FEET_WORD = /(?<!\p{L})(feet|inches)(?!\p{L})/iu;
const FEET = { test: (s) => FEET_AFTER_NUMBER.test(s) || FEET_WORD.test(s) };

let problems = 0;
const bad = (m) => {
  problems++;
  console.log("✗ " + m);
};

// ---- dictionaries
const dicts = {};
for (const l of LANGS) dicts[l] = (await import(new URL(`../src/i18n/${l}.ts`, import.meta.url))).default;

function walk(a, b, path, lang) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return bad(`${lang}: ${path} should be an array`);
    if (PLURALS.has(path)) {
      if (b.length < 1 || b.length > 3) bad(`${lang}: ${path} has ${b.length} plural forms`);
      return;
    }
    if (a.length !== b.length) bad(`${lang}: ${path} has ${b.length} items, en has ${a.length}`);
    a.forEach((x, i) => b[i] !== undefined && walk(x, b[i], `${path}[${i}]`, lang));
    return;
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object") return bad(`${lang}: ${path} should be an object`);
    for (const k of Object.keys(a)) if (!(k in b)) bad(`${lang}: missing ${path ? path + "." : ""}${k}`);
    for (const k of Object.keys(b)) if (!(k in a)) bad(`${lang}: extra ${path ? path + "." : ""}${k}`);
    for (const k of Object.keys(a)) if (k in b) walk(a[k], b[k], path ? `${path}.${k}` : k, lang);
    return;
  }
  if (typeof a === "string") {
    if (typeof b !== "string") return bad(`${lang}: ${path} should be a string`);
    if (a && !b.trim() && path !== "legalNotice") bad(`${lang}: ${path} is empty`);
    const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    if (ph(a) !== ph(b)) bad(`${lang}: ${path} placeholders ${ph(b)} differ from en ${ph(a)}`);
    if (lang !== "en" && b.includes("—")) bad(`${lang}: ${path} has an em dash`);
    if (lang !== "en" && !IMPERIAL_KEYS.has(path) && FEET.test(b)) bad(`${lang}: ${path} mentions feet or inches: ${b}`);
  }
}
const CIS = new Set(["ru", "uk", "kk", "be", "uz", "hy", "ka", "az"]);
for (const l of LANGS) {
  if (l === "en") continue;
  const { cis: cisEn, ...en } = dicts.en;
  const { cis, ...d } = dicts[l];
  walk(en, d, "", l);
  if (CIS.has(l) !== Boolean(cis)) bad(`${l}: cis promo should be ${CIS.has(l) ? "present" : "null"}`);
  if (cis) walk(dicts.ru.cis, cis, "cis", l);
  if (d.lang !== l) bad(`${l}: lang is ${d.lang}`);
  for (const [k, v] of Object.entries(d.tools.list)) if (v.slug !== en.tools.list[k].slug) bad(`${l}: slug of ${k} changed`);
  if (NEW.includes(l) && !d.legalNotice.trim()) bad(`${l}: legalNotice is empty`);
}

// ---- sources.json
const sources = JSON.parse(readFileSync(root + "docs/sources.json", "utf8"));
const FIELDS = ["short", "summary", "findings", "strength", "inApp"];
const stripImperial = (s) => s.replace(/\(?(about |around )?\d[\d.,]*(\s*(-|to)\s*\d[\d.,]*)?\s*(inches|inch|feet|foot|ft\b)\)?/g, "");
const joinThousands = (s) => s.replace(/(\d)[,.\s  '’](?=\d{3}(?!\d))/g, "$1");
const digits = (s) => (joinThousands(s).match(/\d+/g) ?? []).map((x) => x.replace(/^0+(?=\d)/, "")).sort().join();
const textOf = (x) => [x.short, x.summary, ...x.findings, x.strength, x.inApp].join(" \n ");
for (const s of sources) {
  const en = digits(stripImperial(textOf(s.en)));
  for (const l of LANGS) {
    const x = s[l];
    if (!x) {
      bad(`sources ${s.slug}: no ${l}`);
      continue;
    }
    for (const f of [...FIELDS, ...(l === "en" ? [] : ["titleTranslation"])]) {
      const v = x[f];
      if (!v || (Array.isArray(v) ? !v.length || v.some((i) => !String(i).trim()) : !String(v).trim())) bad(`sources ${s.slug}.${l}.${f} is empty`);
    }
    if (l === "en" || l === "ru") continue; // Russian was written before this check and is left as is
    if (x.findings.length !== s.en.findings.length) bad(`sources ${s.slug}.${l}: ${x.findings.length} findings, en has ${s.en.findings.length}`);
    if (digits(textOf(x)) !== en) bad(`sources ${s.slug}.${l}: numbers differ from English`);
    const all = JSON.stringify(x);
    if (all.includes("—")) bad(`sources ${s.slug}.${l}: em dash`);
    if (FEET.test(all)) bad(`sources ${s.slug}.${l}: feet or inches`);
  }
}

// ---- science.*.md
const headings = (md) => md.split("\n").filter((line) => /^#{1,6} /.test(line)).map((line) => line.match(/^#+/)[0].length);
const enMd = readFileSync(root + "docs/science.en.md", "utf8");
for (const l of NEW.concat("ru")) {
  let md;
  try {
    md = readFileSync(root + `docs/science.${l}.md`, "utf8");
  } catch {
    bad(`docs/science.${l}.md is missing`);
    continue;
  }
  if (headings(md).join() !== headings(enMd).join()) bad(`docs/science.${l}.md: heading structure differs from English`);
  if (l === "ru") continue;
  md.split("\n").forEach((line, i) => {
    if (line.includes("—")) bad(`docs/science.${l}.md:${i + 1} em dash`);
    if (!/^\d+\. /.test(line) && FEET.test(line)) bad(`docs/science.${l}.md:${i + 1} feet or inches: ${line.slice(0, 80)}`);
  });
}

console.log(problems ? `${problems} problem(s)` : `OK: ${LANGS.length} dictionaries, ${sources.length} sources, ${NEW.length + 1} science translations`);
process.exit(problems ? 1 : 0);
