// Collects the visible Russian text of the built site (dist/ru, without the pages rendered from docs/ and
// legal/, which are checked on their own) into one plain-text file for a style check.
// Usage: npm run build && node scripts/extract-ru-text.mjs [out.txt]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../dist/ru/", import.meta.url).pathname;
const skip = ["science", "privacy", "terms"];
const out = process.argv[2] ?? "ru-text.txt";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return skip.includes(name) && dir === root ? [] : walk(p);
    return p.endsWith(".html") ? [p] : [];
  });
}

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const seen = new Set();
const lines = [];
for (const file of walk(root)) {
  const html = readFileSync(file, "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ");
  const meta = [...html.matchAll(/<(?:title)>([^<]*)<|name="description" content="([^"]*)"/g)].map((m) => m[1] ?? m[2]);
  const props = [...html.matchAll(/props="([^"]*)"/g)].flatMap((m) =>
    [...decode(m[1]).matchAll(/"([^"\\]*[а-яё][^"\\]*)"/gi)].map((x) => x[1]),
  );
  const text = html
    .replace(/<astro-island[^>]*>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((s) => decode(s).trim());
  for (const s of [...meta, ...text, ...props]) {
    if (!/[а-яё]/i.test(s) || seen.has(s)) continue;
    seen.add(s);
    lines.push(s);
  }
}
writeFileSync(out, lines.join("\n") + "\n");
console.log(`${lines.length} lines -> ${out}`);
