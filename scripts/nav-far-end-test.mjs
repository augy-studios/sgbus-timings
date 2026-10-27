// Tests Navigate's far ends (help desk #11, main-site/js/nav-core/router.js): a place with no
// bus stop or station within a walk (900 m) still gets a way there, through the nearest few
// up to 3 km off, and the way says how far the nearest is (`far`); a place within a walk plans
// as it always did, with no `far`.
//
//   node scripts/nav-far-end-test.mjs           a small made-up network, nothing fetched
//   LIVE=1 node scripts/nav-far-end-test.mjs    also the real network from sgbus.uwuapps.org:
//                                               SAF Ferry Ter to Scm Tuas Lodge, the trip
//                                               that found it
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGraph } from "../main-site/js/nav-core/network.js";
import { plan } from "../main-site/js/nav-core/router.js";

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

// Metres to degrees of latitude, near enough.
const north = (m) => m / 111195;

// Three stops in a line north to south, 1 km apart, and one bus along them.
const stops = [
  { c: "10001", n: "Top Stop", r: "Test Rd", la: 1.35, lo: 103.7 },
  { c: "10002", n: "Middle Stop", r: "Test Rd", la: 1.35 - north(1000), lo: 103.7 },
  { c: "10003", n: "Last Stop", r: "Test Rd", la: 1.35 - north(2000), lo: 103.7 },
];
const routes = {
  runs: { 1: { 1: { stops: ["10001", "10002", "10003"], times: ["", "", ""] } } },
  services: { 1: { dirs: { 1: ["10001", "10003"] } } },
};
const graph = buildGraph({ stations: [], lines: [] }, stops, routes);
const from = { lat: 1.35, lng: 103.7 };
const last = stops[2];

await test("an end within a walk plans as before, with no `far`", async () => {
  const to = { lat: last.la - north(500), lng: last.lo };
  const options = plan(graph, from, to).filter((o) => !o.walkOnly);
  assert.equal(options.length, 1);
  assert.equal(options[0].far, undefined);
  assert.equal(options[0].legs.at(-1).mode, "walk");
  assert.ok(Math.abs(options[0].legs.at(-1).metres - 500) < 5);
});

await test("an end 2 km past the last stop gets a way, ending with the long walk", async () => {
  const to = { lat: last.la - north(2000), lng: last.lo };
  const options = plan(graph, from, to).filter((o) => !o.walkOnly);
  assert.equal(options.length, 1);
  const o = options[0];
  assert.deepEqual(o.routes, ["1"]);
  assert.equal(o.legs.at(-1).mode, "walk");
  assert.ok(Math.abs(o.legs.at(-1).metres - 2000) < 10, `final walk ${o.legs.at(-1).metres} m`);
  assert.ok(o.far && o.far.from === undefined, "only the end is far");
  assert.ok(Math.abs(o.far.to - 2000) < 10, `far.to ${o.far.to}`);
});

await test("a start 1.5 km from any stop is marked `far.from`", async () => {
  const start = { lat: 1.35 + north(1500), lng: 103.7 };
  const to = { lat: last.la, lng: last.lo };
  const o = plan(graph, start, to).find((x) => !x.walkOnly);
  assert.ok(o, "a way");
  assert.ok(Math.abs(o.far.from - 1500) < 10, `far.from ${o.far?.from}`);
  assert.equal(o.far.to, undefined);
});

await test("an end more than 3 km from any stop still has no way", async () => {
  const to = { lat: last.la - north(3500), lng: last.lo };
  assert.equal(plan(graph, from, to).filter((o) => !o.walkOnly).length, 0);
});

await test("only the nearest 3 stops are tried for a far end", async () => {
  // Five stops in a row 1.2 to 1.6 km away, each a bus of its own from the top stop.
  const many = [stops[0], ...[0, 1, 2, 3, 4].map((k) => ({ c: `2000${k}`, n: `Far ${k}`, r: "Far Rd", la: 1.35 - north(1200 + k * 100), lo: 103.75 }))];
  const runs = Object.fromEntries(many.slice(1).map((s, k) => [`9${k}`, { 1: { stops: ["10001", s.c], times: ["", ""] } }]));
  const g = buildGraph({ stations: [], lines: [] }, many, { runs, services: {} });
  const to = { lat: 1.35 - north(3000), lng: 103.75 };
  const used = new Set(plan(g, from, to).filter((o) => !o.walkOnly).map((o) => o.routes.join()));
  assert.ok(used.size >= 1 && [...used].every((r) => ["94", "93", "92"].includes(r)), [...used].join(" "));
});

if (process.env.LIVE) {
  await test("live: SAF Ferry Ter to Scm Tuas Lodge has a way, its end over 2 km from the nearest stop", async () => {
    const site = "https://sgbus.uwuapps.org";
    const [s, r] = await Promise.all([fetch(`${site}/api/bus-stops`).then((x) => x.json()), fetch(`${site}/api/bus-routes`).then((x) => x.json())]);
    const rail = JSON.parse(readFileSync(new URL("../main-site/data/rail.json", import.meta.url), "utf8"));
    const g = buildGraph(rail, s, r);
    const options = plan(g, { lat: 1.387294, lng: 103.999644 }, { lat: 1.247486, lng: 103.614159 }).filter((o) => !o.walkOnly);
    assert.ok(options.length > 0, "a way");
    assert.ok(options[0].far.to > 2000 && options[0].far.to < 3000, `far.to ${options[0].far.to}`);
    console.log(`   quickest: ~${options[0].minutes} min, ${options[0].routes.join(" > ")}, final walk ${options[0].legs.at(-1).metres} m`);
  });
}

console.log(`${passed} passed`);
