// Builds telegram-bot/src/planning_areas.json, the outline of each of URA's 55 planning
// areas (Bedok, Toa Payoh, Bukit Merah...), so the bot can say which part of Singapore a
// bus stop is in. Vendored, never fetched at runtime, from data.gov.sg's "Master Plan 2019
// Planning Area Boundary (No Sea)".
//
// The outlines are simplified to about 10 m and rounded to 5 decimal places (about 1 m):
// plenty to tell one Blk 111 from another, at a fraction of the size.
//
// Run: node scripts/vendor-planning-areas.mjs

import { writeFileSync } from "node:fs";

const DATASET = "d_4765db0e87b9c86336792efe8a1f7a66";
const TOLERANCE = 0.0001; // degrees, about 11 m

const poll = await (await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}/poll-download`)).json();
if (poll.code !== 0) throw new Error(`data.gov.sg: ${poll.errorMsg}`);
const geo = await (await fetch(poll.data.url)).json();

const round = (n) => Math.round(n * 1e5) / 1e5;

// "NORTH-EASTERN ISLANDS" -> "North-Eastern Islands"
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());

// Douglas-Peucker on a closed ring of [lng, lat] points. The ring starts and ends on the
// same point, so it's first split at the point farthest from there: measured against a
// zero-length first segment, every point would look close enough to drop.
function simplify(points) {
  if (points.length <= 4) return points;
  const last = points.length - 1;
  let far = 1;
  for (let i = 1; i < last; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > Math.hypot(points[far][0] - points[0][0], points[far][1] - points[0][1])) far = i;
  }
  const keep = new Uint8Array(points.length);
  keep[0] = keep[far] = keep[last] = 1;
  const stack = [[0, far], [far, last]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > TOLERANCE) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out = points.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : points;
}

const ring = (r) => simplify(r.map(([lng, lat]) => [lng, lat])).map(([lng, lat]) => [round(lng), round(lat)]);

let vertices = 0;
const areas = geo.features.map((f) => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const polygons = polys.map((rings) => rings.map(ring));
  polygons.flat().forEach((r) => (vertices += r.length));
  return {
    name: titleCase(f.properties.PLN_AREA_N),
    region: titleCase(f.properties.REGION_N.replace(/ REGION$/, "")),
    polygons,
  };
});
areas.sort((a, b) => a.name.localeCompare(b.name));

const out = { source: `URA Master Plan 2019 Planning Area Boundary (No Sea), data.gov.sg ${DATASET}`, areas };
writeFileSync("telegram-bot/src/planning_areas.json", JSON.stringify(out));
console.log(`${areas.length} planning areas, ${vertices} points`);
