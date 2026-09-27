// Every locale has the same keys as en.json (plural variants aside), no empty strings,
// the same placeholders and the same number of tips.
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../src/locales/", import.meta.url);
const load = (file) => JSON.parse(readFileSync(new URL(file, dir), "utf8"));
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const placeholders = (s) => (typeof s === "string" ? (s.match(/{{\w+}}/g) ?? []).sort().join() : "");
const base = (key) => key.replace(PLURAL, "");

const en = flatten(load("en.json"));
const enBases = new Set(Object.keys(en).map(base));
const errors = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const loc = flatten(load(file));
  const bases = new Set(Object.keys(loc).map(base));
  for (const key of enBases) if (!bases.has(key)) errors.push(`${file}: missing ${key}`);
  for (const key of bases) if (!enBases.has(key)) errors.push(`${file}: extra ${key}`);
  for (const [key, value] of Object.entries(loc)) {
    if (Array.isArray(value)) {
      if (value.length !== en[key]?.length) errors.push(`${file}: ${key} has ${value.length} items`);
      if (value.some((v) => !v)) errors.push(`${file}: empty item in ${key}`);
    } else if (!value) {
      errors.push(`${file}: empty ${key}`);
    } else if (!PLURAL.test(key) && en[key] !== undefined && placeholders(value) !== placeholders(en[key])) {
      errors.push(`${file}: placeholders differ in ${key}`);
    }
  }
  if (!Object.keys(loc).some((k) => k.startsWith("break.seconds_other"))) errors.push(`${file}: no seconds_other`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("locales ok");
