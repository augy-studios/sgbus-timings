// Tests that Navigate drops a way OneMap adds when one of its buses won't be running by the time
// it's reached (bug report 20261113-M8K5, main-site/api/_nav/live.js, running): 96A runs from
// Clementi Int on weekday mornings only, so OneMap's way on it is kept at 08:30 and dropped at
// 14:45. The router's own ways are left alone, as it rides only what's running already.
//
//   node scripts/nav-running-test.mjs    the real network, from the Flutter app's test fixtures
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { buildGraph } from "../main-site/api/_nav/network.js";
import { running } from "../main-site/api/_nav/live.js";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

const fixture = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../flutter/test/fixtures/${name}.json.gz`, import.meta.url))).toString());
const graph = buildGraph(fixture("bus-stops"), fixture("bus-routes"));

// A walk to Clementi Int, then 96A to the College of Design & Engineering.
const way = (source) => ({
  ...(source && { source }),
  legs: [
    { mode: "walk", minutes: 3 },
    { mode: "bus", route: "96A", wait: 5, minutes: 8, from: { code: "17009" }, to: { code: "16159" } },
  ],
});
// Singapore's time on Thursday 12 November 2026, a weekday.
const sg = (h, m) => Date.UTC(2026, 10, 12, h - 8, m);

test("OneMap's way on 96A is kept in the morning, while it runs", () => {
  assert.equal(running([way("onemap")], { graph, setOff: sg(8, 30) }).length, 1);
});

test("OneMap's way on 96A is dropped in the afternoon, after its last bus", () => {
  assert.equal(running([way("onemap")], { graph, setOff: sg(14, 45) }).length, 0);
});

test("reached after the last bus, even setting off before it", () => {
  // Off at 09:30: on 96A at 09:38, after its last at 09:35.
  assert.equal(running([way("onemap")], { graph, setOff: sg(9, 30) }).length, 0);
});

test("the router's own ways are left as they are", () => {
  assert.equal(running([way()], { graph, setOff: sg(14, 45) }).length, 1);
});

console.log(`\n${passed} passed`);
