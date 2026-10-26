// Keeps main-site/i18n/en.json in step with the site's English (help desk #6, js/i18n.js), and
// says what each other language is missing.
//
//   node scripts/i18n-check.mjs           check: exits 1 if en.json and the site disagree
//   node scripts/i18n-check.mjs --write   write en.json from the site
//
// The English is read from where the site says it: in index.html, an element's text where it
// has data-i18n="key", and an attribute's value where it has data-i18n-title (or
// -aria-label, -placeholder) ="key"; in the scripts, tr("key", "English") and
// I18n.t("key", "English"), quoted with ', " or `. One key, one English, everywhere it's used.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..", "main-site");
const dir = join(site, "i18n");
const write = process.argv.includes("--write");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", middot: "·", nbsp: " ", mdash: "—", ndash: "–" };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m);

const found = new Map(); // key -> { en, where }
const problems = [];
function add(key, en, where) {
  const had = found.get(key);
  if (had && had.en !== en) problems.push(`${key}: "${had.en}" (${had.where}) but "${en}" (${where})`);
  else if (!had) found.set(key, { en, where });
}

// index.html: elements by data-i18n, attributes by data-i18n-<attr>.
const html = readFileSync(join(site, "index.html"), "utf8");
const line = (i) => html.slice(0, i).split("\n").length;
for (const m of html.matchAll(/<(\w+)([^>]*?)\sdata-i18n="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g)) {
  add(m[3], decode(m[5].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(), `index.html:${line(m.index)}`);
}
for (const m of html.matchAll(/<\w+[^>]*>/g)) {
  for (const a of m[0].matchAll(/data-i18n-(title|aria-label|placeholder)="([^"]+)"/g)) {
    const v = m[0].match(new RegExp(`\\s${a[1]}="([^"]*)"`));
    if (!v) problems.push(`${a[2]}: index.html:${line(m.index)} has no ${a[1]} to take the English from`);
    else add(a[2], decode(v[1]), `index.html:${line(m.index)}`);
  }
}

// The scripts.
const scripts = ["script.js", ...readdirSync(join(site, "js")).filter((f) => f.endsWith(".js")).map((f) => `js/${f}`)];
const CALL = /\b(?:tr|I18n\.t)\(\s*(['"`])([\w.-]+)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/g;
for (const f of scripts) {
  // Comment lines blanked, keeping the line count, so an example in a comment isn't a key.
  const src = readFileSync(join(site, f), "utf8").replace(/^\s*\/\/.*$/gm, "");
  for (const m of src.matchAll(CALL)) {
    if (m[3] === "`" && m[4].includes("${")) {
      problems.push(`${m[2]}: ${f} builds its English with \${...}; use {name} and vars instead`);
      continue;
    }
    add(m[2], m[4].replace(/\\(['"`\\])/g, "$1"), `${f}:${src.slice(0, m.index).split("\n").length}`);
  }
}

const want = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v.en]));
const enPath = join(dir, "en.json");
const have = existsSync(enPath) ? JSON.parse(readFileSync(enPath, "utf8")) : {};

if (write) {
  writeFileSync(enPath, `${JSON.stringify(want, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(want).length} keys to main-site/i18n/en.json.`);
} else {
  for (const [k, v] of Object.entries(want)) {
    if (!(k in have)) problems.push(`${k}: in the site, not in en.json (run with --write)`);
    else if (have[k] !== v) problems.push(`${k}: en.json says "${have[k]}", the site "${v}" (run with --write)`);
  }
  for (const k of Object.keys(have)) if (!(k in want)) problems.push(`${k}: in en.json, used nowhere (run with --write)`);
}

// The other languages: what each is missing (shown in English meanwhile) and has to spare.
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "en.json")) {
  const map = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const missing = Object.keys(want).filter((k) => typeof map[k] !== "string");
  const extra = Object.keys(map).filter((k) => !(k in want));
  console.log(`${f}: ${Object.keys(want).length - missing.length} of ${Object.keys(want).length} keys${missing.length ? `; missing ${missing.join(", ")}` : ""}${extra.length ? `; not used: ${extra.join(", ")}` : ""}`);
  // A {name} in the English must be in the translation too.
  for (const k of Object.keys(want)) {
    const need = [...want[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const v of need) if (typeof map[k] === "string" && !map[k].includes(`{${v}}`)) problems.push(`${f} ${k}: has no {${v}}`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log(`i18n: ${Object.keys(want).length} keys, all in step.`);
