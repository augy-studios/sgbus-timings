// Builds main-site/data/rail-tracks.json, the MRT and LRT lines' tracks, so the live map
// (js/rail-tracks.js, js/map.js) draws a train ride along the rails rather than straight from
// station to station. From cheeaun/sgraildata's data/v1/sg-rail.geojson, the same snapshot
// as rail.json (scripts/vendor-rail.mjs). Vendored, never fetched from sgraildata at runtime.
//
// Each line is a list of parts, each part a list of [lat, lng]. Parts that run on from one
// another (the Punggol East Loop comes in four) are joined into one.
//
// Run: node scripts/vendor-rail-tracks.mjs <sg-rail.geojson>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const [sgRailPath] = process.argv.slice(2);
if (!sgRailPath) {
  console.error("usage: node scripts/vendor-rail-tracks.mjs <sg-rail.geojson>");
  process.exit(1);
}

// sgraildata's line names, to the line codes rail.json and the nav's train legs use. The
// Changi Airport branch (CG) is a part of the East West Line's.
const CODES = {
  "East West Line": "EW",
  "North South Line": "NS",
  "North East Line": "NE",
  "Circle Line": "CC",
  "Downtown Line": "DT",
  "Thomson-East Coast Line": "TE",
  "Bukit Panjang LRT": "BP",
  "Sengkang LRT (East Loop)": "SK",
  "Sengkang LRT (West Loop)": "SK",
  "Punggol LRT (East Loop)": "PG",
  "Punggol LRT (West Loop)": "PG",
};

const sgRail = JSON.parse(readFileSync(sgRailPath, "utf8"));
const round = (n) => Math.round(n * 1e5) / 1e5;
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;

const lines = {};
for (const f of sgRail.features) {
  const g = f.geometry;
  if (g.type !== "LineString" && g.type !== "MultiLineString") continue;
  const code = CODES[f.properties.name];
  if (!code) throw new Error(`sg-rail.geojson: no line code for "${f.properties.name}"; add it to CODES`);
  const parts = (g.type === "LineString" ? [g.coordinates] : g.coordinates).map((part) =>
    part.map(([lng, lat]) => [round(lat), round(lng)]).filter((p, i, all) => i === 0 || !same(p, all[i - 1]))
  );
  const joined = [];
  for (const part of parts) {
    const last = joined[joined.length - 1];
    if (last && same(last[last.length - 1], part[0])) last.push(...part.slice(1));
    else joined.push(part);
  }
  (lines[code] ||= []).push(...joined);
}

const out = { source: "cheeaun/sgraildata data/v1/sg-rail.geojson", lines };
mkdirSync("main-site/data", { recursive: true });
writeFileSync("main-site/data/rail-tracks.json", JSON.stringify(out));
const points = Object.values(lines).flat().reduce((n, part) => n + part.length, 0);
console.log(`${Object.keys(lines).length} lines, ${points} points`);
