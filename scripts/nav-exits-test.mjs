// Tests Navigate's walks to and from a station's nearest exit (main-site/js/nav-core/router.js,
// walkExits): a walk to a station says the exit nearest where it starts (`toExit`), a walk from
// one the exit nearest where it ends (`fromExit`), each with its name from data/rail.json's
// `exitNames`, and a walk between two stations takes the two exits nearest each other.
//
//   node scripts/nav-exits-test.mjs        the real rail network, no buses; nothing fetched
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGraph } from "../main-site/js/nav-core/network.js";
import { plan, walkExits } from "../main-site/js/nav-core/router.js";

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

const rail = JSON.parse(readFileSync(new URL("../main-site/data/rail.json", import.meta.url), "utf8"));
const station = (name) => rail.stations.find((s) => s.name.trim() === name);
const metres = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
// A station's exits as { name, lat, lng }, and the one nearest a point.
const exits = (s) => s.exits.map(([lat, lng], i) => ({ name: s.exitNames[i], lat, lng }));
const nearest = (s, p) => exits(s).reduce((a, b) => (metres(a, p) <= metres(b, p) ? a : b));
// A point `m` metres north and east of an exit, so it's nearest that one.
const near = (e, m = 60) => ({ lat: e.lat + m / 111195, lng: e.lng + m / 111195 });

await test("every station's exits have names, one each", async () => {
  for (const s of rail.stations) {
    assert.equal(s.exitNames.length, s.exits.length, s.name);
    assert.ok(s.exitNames.every((n) => typeof n === "string"), s.name);
  }
  const named = rail.stations.flatMap((s) => s.exitNames).filter(Boolean).length;
  assert.ok(named > 550, `${named} named`);
});

const graph = buildGraph(rail, [], { runs: {}, services: {} });

await test("Tampines to Pasir Ris: walk to the exit nearest the start, from the one nearest the end", async () => {
  const tampines = station("Tampines");
  const pasirRis = station("Pasir Ris");
  // A start just outside an exit on the far side of Tampines from its centre, and an end by
  // one of Pasir Ris's.
  const startExit = exits(tampines).reduce((a, b) => (metres(a, tampines) >= metres(b, tampines) ? a : b));
  const endExit = exits(pasirRis)[0];
  const from = near(startExit, 30);
  const to = near(endExit, 30);
  const ways = plan(graph, from, to);
  const way = ways.find((o) => o.legs.some((l) => l.mode === "train"));
  assert.ok(way, "a way by train");
  const first = way.legs[0];
  const last = way.legs.at(-1);
  assert.equal(first.mode, "walk");
  assert.equal(first.to.name.trim(), "Tampines");
  assert.deepEqual(first.toExit, { name: nearest(tampines, from).name, lat: nearest(tampines, from).lat, lng: nearest(tampines, from).lng });
  assert.ok(first.toExit.name, "the exit has its name");
  assert.equal(last.mode, "walk");
  assert.equal(last.fromExit.name, nearest(pasirRis, to).name);
  assert.ok(!("toExit" in last), "the end is a place, with no exit");
  // The walk's metres are to the exit, as the router counts them, not the station's middle.
  assert.ok(Math.abs(first.metres - metres(from, first.toExit)) <= 2, `${first.metres} vs ${metres(from, first.toExit)}`);
});

await test("a walk between two stations: the two exits nearest each other", async () => {
  // Bras Basah (CC2) and Bencoolen (DT21), a short walk apart out of the stations.
  const a = station("Bras Basah");
  const b = station("Bencoolen");
  const node = (st) => ({ kind: "station", name: st.name, lat: st.lat, lng: st.lng, exits: st.exits, exitNames: st.exitNames });
  const { fromExit, toExit } = walkExits(node(a), node(b));
  let best = Infinity;
  for (const x of exits(a)) for (const y of exits(b)) best = Math.min(best, metres(x, y));
  assert.ok(fromExit.name && toExit.name, "both named");
  assert.ok(Math.abs(metres(fromExit, toExit) - best) < 0.01, `${metres(fromExit, toExit)} vs ${best}`);
  assert.ok(exits(a).some((e) => e.lat === fromExit.lat && e.name === fromExit.name) && exits(b).some((e) => e.lat === toExit.lat && e.name === toExit.name));
});

await test("a walk to a bus stop has no exit", async () => {
  const stops = [
    { c: "90001", n: "Test Stop A", r: "Test Rd", la: 1.4, lo: 103.65 },
    { c: "90002", n: "Test Stop B", r: "Test Rd", la: 1.4 - 1500 / 111195, lo: 103.65 },
  ];
  const routes = { runs: { 9: { 1: { stops: ["90001", "90002"], times: ["", ""] } } }, services: { 9: { dirs: { 1: ["90001", "90002"] } } } };
  const g = buildGraph({ stations: [], lines: [] }, stops, routes);
  const ways = plan(g, { lat: 1.4 + 200 / 111195, lng: 103.65 }, { lat: 1.4 - 1700 / 111195, lng: 103.65 });
  const way = ways.find((o) => o.legs.some((l) => l.mode === "bus"));
  assert.ok(way);
  for (const l of way.legs.filter((x) => x.mode === "walk")) assert.ok(!l.toExit && !l.fromExit);
});

console.log(`\n${passed} passed`);
