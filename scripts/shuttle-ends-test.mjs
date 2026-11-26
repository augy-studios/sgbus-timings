// A shuttle bus service that's ending (help desk #22): IKEA Tampines' shuttles run their last day
// on Thursday 31 December 2026 (data/campus/shuttles.json, `ends`). Until then a way on one says
// so; from Friday 1 January 2027 they're Discontinued, in Bus timings and Explorer, and Navigate
// no longer rides them. Every moment here is by Singapore's clock, whatever this machine's is.
//
//   node scripts/shuttle-ends-test.mjs    the real network, from the Flutter app's test fixtures
//
//   1. shuttles.json: IKEA's group ends on 31 December 2026, with the buses its notice says to
//      take instead (`instead`), and its two routes read both.
//   2. Bus timings (js/campus.js, status and describe): the times on 31 Dec at 18:00, with
//      "Ends on 31 Dec 2026" under them, and Discontinued, with no live times, on 1 Jan 2027 at
//      10:00; 31 Dec after the last bus looks for none in the new year.
//   3. Explorer (lines, dots, anyEnded): IKEA's lines and its own stops ended only from 1 Jan.
//   4. Navigate (js/nav-core, as /api/nav and the phone plan): Serangoon MRT to IKEA Tampines
//      rides IKEA S on 31 Dec at 18:00 and 19:00, with `campus.ends` on its leg, and never on
//      1 or 2 Jan 2027, whenever it's planned from: the graph is the same one throughout. And
//      without `ends`, the same plans do ride it.
//   4b. Live times (api/shuttle-live.js): the tracker asked on 31 Dec, never from 1 Jan.
//   5. The notice (endingOn, endsNotice): on a way's legs and a trip's, before the end only, with
//      the buses to take instead; in Chinese too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { buildGraph, rail } from "../main-site/api/_nav/network.js";
import { buildGraph as buildNetwork } from "../main-site/js/nav-core/network.js";
import { planFor } from "../main-site/js/nav-core/plan.js";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

// js/nav-core/campus.js has loaded js/campus.js onto globalThis by now.
const C = globalThis.Campus;
const file = (f) => JSON.parse(readFileSync(new URL(`../main-site/data/campus/${f}.json`, import.meta.url), "utf8"));
const raw = { nus: file("nus"), ntu: file("ntu"), config: file("config"), shuttles: file("shuttles") };
// A Singapore time, "2026-12-31T18:00", as a moment.
const sg = (at) => Date.parse(`${at}:00+08:00`);
const BEFORE = sg("2026-12-31T18:00");
const LAST_EVENING = sg("2026-12-31T19:00");
const AFTER = sg("2027-01-01T10:00");

// ---------- 1. the data ----------

const model = C.build(raw, {});
const ikea = model.routes.filter((r) => r.uni === "ikea");

test("shuttles.json: IKEA's group ends on 31 December 2026", () => {
  assert.equal(raw.shuttles.groups.ikea.ends, "2026-12-31");
});

test("both IKEA routes read it from their group; no other route ends", () => {
  assert.deepEqual(ikea.map((r) => [r.code, r.ends]), [["IKEA T", "2026-12-31"], ["IKEA S", "2026-12-31"]]);
  assert.deepEqual(model.routes.filter((r) => r.ends && r.uni !== "ikea"), []);
});

const INSTEAD = { buses: ["296", "460", "68"], from: "Tampines Interchange" };
test("shuttles.json: IKEA's notice says to take 296, 460 or 68 from Tampines Interchange, and both routes read it", () => {
  assert.deepEqual(raw.shuttles.groups.ikea.instead, INSTEAD);
  assert.deepEqual(ikea.map((r) => r.instead), [INSTEAD, INSTEAD]);
  assert.deepEqual(model.routes.filter((r) => r.instead && r.uni !== "ikea"), []);
});

test("a route's own `instead` comes before its group's, and one without buses or where from is a problem", () => {
  const m = C.build({ shuttles: { groups: { x: { name: "X", instead: { buses: ["1"], from: "A Int" }, stops: [{ id: "a", name: "A", loc: "1.30,103.80" }, { id: "b", name: "B", loc: "1.31,103.81" }], routes: [
    { id: "R1", stops: ["a", "b"], timings: { daily: ["0900"] } },
    { id: "R2", instead: { buses: [2, "3"], from: "B Int" }, stops: ["a", "b"], timings: { daily: ["0900"] } },
    { id: "R3", instead: { buses: [] }, stops: ["a", "b"], timings: { daily: ["0900"] } },
  ] } } } }, {});
  assert.deepEqual(m.routes.map((r) => r.instead), [{ buses: ["1"], from: "A Int" }, { buses: ["2", "3"], from: "B Int" }, null]);
  assert.ok(m.problems.some((p) => /x R3: instead needs its buses/.test(p)), m.problems.join("; "));
});

test("a route's own `ends` comes before its group's, and one that isn't a date is a problem", () => {
  const m = C.build({ shuttles: { groups: { x: { name: "X", ends: "2026-12-31", stops: [{ id: "a", name: "A", loc: "1.30,103.80" }, { id: "b", name: "B", loc: "1.31,103.81" }], routes: [
    { id: "R1", stops: ["a", "b"], timings: { daily: ["0900"] } },
    { id: "R2", ends: "2027-03-01", stops: ["a", "b"], timings: { daily: ["0900"] } },
    { id: "R3", ends: "31 Dec", stops: ["a", "b"], timings: { daily: ["0900"] } },
  ] } } } }, {});
  assert.deepEqual(m.routes.map((r) => r.ends), ["2026-12-31", "2027-03-01", null]);
  assert.ok(m.problems.some((p) => /x R3: ends "31 Dec" isn't a date/.test(p)), m.problems.join("; "));
});

// ---------- 2. Bus timings ----------

const opts = { config: model.config, isHoliday: () => false };
const t = ikea.find((r) => r.code === "IKEA T");
const at = (ms) => C.status(t, 0, ms, opts);

test("31 Dec 2026 18:00: IKEA T's next departures from Tampines MRT, as ever", () => {
  const st = at(BEFORE);
  assert.equal(st.state, "departs");
  assert.deepEqual(st.times.map(C.clock), ["18:15", "18:45", "19:15"]);
});

test("31 Dec 2026 23:30, after the last bus: no more today, and none looked for in the new year", () => {
  const st = at(sg("2026-12-31T23:30"));
  assert.equal(st.state, "done");
  assert.equal(st.next, null);
});

test("30 Dec 2026 23:30: the next bus is still the morning after", () => {
  assert.equal(at(sg("2026-12-30T23:30")).next?.inDays, 1);
});

test("1 Jan 2027 10:00: discontinued, and said so in place of its times", () => {
  const st = at(AFTER);
  assert.deepEqual(st, { season: null, state: "ended", ends: "2026-12-31" });
  assert.deepEqual(C.describe(st), { main: "Discontinued", sub: "" });
});

test("ended: the day after its last day, by Singapore's date, not the machine's", () => {
  assert.equal(C.ended(t, sg("2026-12-31T23:59")), false);
  assert.equal(C.ended(t, sg("2027-01-01T00:00")), true);
  // 1 Jan 00:30 in Singapore is still 31 Dec in UTC.
  assert.equal(C.ended(t, Date.UTC(2026, 11, 31, 16, 30)), true);
  assert.equal(C.ended({ ends: null }, AFTER), false);
});

// ---------- 3. Explorer ----------

const fixture = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../flutter/test/fixtures/${name}.json.gz`, import.meta.url))).toString());
const busStops = fixture("bus-stops");
// The page's model: js/campus.js's load(), with the files and LTA's stops (script.js's stops
// index) given in place of the network.
globalThis.fetch = async (url) => ({ ok: true, json: async () => raw[/\/([a-z]+)\.json$/.exec(url)[1]] });
globalThis.ensureStopsIndex = async () => Object.fromEntries(busStops.map((s) => [s.c, { n: s.n, road: s.r, lat: s.la, lng: s.lo }]));
await C.load();

test("Explorer: IKEA's lines are ended only from 1 Jan 2027, and nobody else's", () => {
  const ended = (ms) => C.lines(null, ms).filter((l) => l.ended).map((l) => l.key);
  assert.deepEqual(ended(BEFORE), []);
  assert.deepEqual(ended(AFTER), ["ikea:IKEA T", "ikea:IKEA S"]);
  assert.equal(C.anyEnded(BEFORE), false);
  assert.equal(C.anyEnded(AFTER), true);
});

test("Explorer: IKEA's three own stops go with them; no other stop does", () => {
  const ended = (ms) => C.dots(null, ms).filter((d) => d.ended).map((d) => d.key).sort();
  assert.deepEqual(ended(BEFORE), []);
  assert.deepEqual(ended(AFTER), ["ikea-serangoon-mrt", "ikea-tampines", "ikea-tampines-mrt"]);
});

test("Bus timings at IKEA Tampines: its times on 31 Dec, each with when it ends, Discontinued with no live times on 1 Jan", () => {
  const before = C.listHtml("ikea-tampines", BEFORE);
  const after = C.listHtml("ikea-tampines", AFTER);
  assert.match(before, /data-live-route="ikea:IKEA T"/);
  assert.doesNotMatch(before, /Discontinued/);
  assert.equal((before.match(/<span class="campusEnds">Ends on 31 Dec 2026<\/span>/g) || []).length, 2);
  assert.doesNotMatch(after, /campusEnds|Ends on/);
  assert.equal((after.match(/<strong>Discontinued<\/strong>/g) || []).length, 2);
  assert.doesNotMatch(after, /data-live-route/);
  assert.match(after, /class="campusRow off ended"/);
});

test("a route's own window says when it ends till then, and Discontinued from 1 Jan", () => {
  assert.equal(C.route("ikea:IKEA T", AFTER).now.main, "Discontinued");
  assert.equal(C.route("ikea:IKEA T", AFTER).ends, "");
  assert.notEqual(C.route("ikea:IKEA T", BEFORE).now.main, "Discontinued");
  assert.equal(C.route("ikea:IKEA T", BEFORE).ends, "Ends on 31 Dec 2026");
  assert.equal(C.route("ikea:IKEA T", sg("2026-12-31T23:59")).ends, "Ends on 31 Dec 2026");
});

test("no other shuttle's times say they end", () => {
  assert.deepEqual(model.routes.filter((r) => r.uni !== "ikea" && C.endsOnText(r, BEFORE)), []);
  assert.doesNotMatch(C.listHtml("ikea-tampines-mrt", AFTER) + C.listHtml("16181", BEFORE), /campusEnds/);
});

// ---------- 4. Navigate ----------

// One graph, built once, as /api/nav keeps it for hours.
const graph = buildGraph(busStops, fixture("bus-routes"));
// Serangoon MRT's Exit E, to IKEA Tampines' door: IKEA S is one of the ways there.
const FROM = { lat: 1.351257, lng: 103.872718 };
const TO = { lat: 1.37405, lng: 103.93255 };
const ikeaLegs = (when) => planFor(graph, FROM, TO, when, null).options.flatMap((o) => o.legs).filter((l) => l.campus?.uni === "ikea");

test("31 Dec 2026, leaving at 18:00: a way rides IKEA S, its leg carrying when it ends", () => {
  const legs = ikeaLegs({ mode: "leave", ms: BEFORE });
  assert.ok(legs.length, "no way on IKEA's shuttle");
  assert.equal(legs[0].route, "IKEA S");
  assert.equal(legs[0].campus.ends, "2026-12-31");
  assert.deepEqual(legs[0].campus.instead, INSTEAD);
  assert.equal(legs[0].campus.name, "IKEA");
});

test("31 Dec 2026, leaving at 19:00 (its last evening): still rides it", () => {
  assert.ok(ikeaLegs({ mode: "leave", ms: LAST_EVENING }).length);
});

test("31 Dec 2026, arriving by 20:30: still rides it", () => {
  assert.ok(ikeaLegs({ mode: "arrive", ms: sg("2026-12-31T20:30") }).length);
});

test("1 Jan 2027, leaving at 10:00 or 13:00 (its times are a public holiday's): never rides it", () => {
  assert.deepEqual(ikeaLegs({ mode: "leave", ms: AFTER }), []);
  assert.deepEqual(ikeaLegs({ mode: "leave", ms: sg("2027-01-01T13:00") }), []);
});

test("2 Jan 2027, leaving at 13:00 or arriving by 14:00, on the graph that planned December: never rides it", () => {
  assert.deepEqual(ikeaLegs({ mode: "leave", ms: sg("2027-01-02T13:00") }), []);
  assert.deepEqual(ikeaLegs({ mode: "arrive", ms: sg("2027-01-02T14:00") }), []);
  // And back to December: the graph wasn't changed by planning for January.
  assert.ok(ikeaLegs({ mode: "leave", ms: BEFORE }).length);
});

test("…and it's `ends` that leaves it out: without it, the same graph rides it on 1 and 2 Jan", () => {
  const files = structuredClone(raw);
  delete files.shuttles.groups.ikea.ends;
  const g = buildNetwork(rail, busStops, fixture("bus-routes"), { campus: files });
  const legs = (when) => planFor(g, FROM, TO, when, null).options.flatMap((o) => o.legs).filter((l) => l.campus?.uni === "ikea");
  assert.ok(legs({ mode: "leave", ms: sg("2027-01-01T13:00") }).length);
  assert.ok(legs({ mode: "leave", ms: sg("2027-01-02T13:00") }).length);
  assert.equal(legs({ mode: "leave", ms: BEFORE })[0].campus.ends, undefined);
});

// ---------- 4b. live times ----------

// api/shuttle-live.js, at a moment of the test's choosing, with the tracker never to be asked
// once the route's ended.
const { default: shuttleLive } = await import("../main-site/api/shuttle-live.js");
async function askLive(ms, route = "ikea:IKEA T", stop = "ikea-tampines") {
  const realNow = Date.now;
  const realFetch = globalThis.fetch;
  let asked = false;
  Date.now = () => ms;
  globalThis.fetch = async () => {
    asked = true;
    return { ok: true, text: async () => "" };
  };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    await shuttleLive({ query: { route, stop } }, res);
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
  }
  return { ...res, asked };
}

{
  const before = await askLive(BEFORE);
  const after = await askLive(AFTER);
  test("live times: on 31 Dec 2026 the tracker's asked", () => {
    assert.equal(before.asked, true);
    assert.equal(before.body.ended, undefined);
  });
  test("live times: on 1 Jan 2027 it isn't, and no bus is coming", () => {
    assert.equal(after.asked, false);
    assert.equal(after.code, 200);
    assert.deepEqual([after.body.eta, after.body.buses, after.body.ended], [null, [], true]);
  });
}

// ---------- 5. the notice ----------

const way = planFor(graph, FROM, TO, { mode: "leave", ms: BEFORE }, null).options.find((o) => o.legs.some((l) => l.campus?.uni === "ikea"));

const NOTICE = "IKEA's shuttle bus service ends on 31 Dec 2026. Buses 296, 460 and 68 from Tampines Interchange stop near IKEA.";
test("the notice: a way on it says, until it ends, with the buses to take instead", () => {
  assert.deepEqual(C.endsNotice(way.legs, BEFORE), [NOTICE]);
  assert.deepEqual(C.endsNotice(way.legs, sg("2026-12-31T23:59")), [NOTICE]);
  assert.deepEqual(C.endsNotice(way.legs, AFTER), []);
});

test("the notice: without `instead`, its first sentence alone", () => {
  const legs = [{ mode: "bus", campus: { name: "IKEA", ends: "2026-12-31" } }];
  assert.deepEqual(C.endsNotice(legs, BEFORE), ["IKEA's shuttle bus service ends on 31 Dec 2026."]);
  assert.deepEqual(C.endsNotice([{ mode: "bus", campus: { name: "IKEA", ends: "2026-12-31", instead: { buses: [], from: "X" } } }], BEFORE), ["IKEA's shuttle bus service ends on 31 Dec 2026."]);
});

test("the notice: one bus, or two, said as a list", () => {
  const one = [{ mode: "bus", campus: { name: "X", ends: "2026-12-31", instead: { buses: ["296"], from: "Y Int" } } }];
  const two = [{ mode: "bus", campus: { name: "X", ends: "2026-12-31", instead: { buses: ["296", "460"], from: "Y Int" } } }];
  assert.match(C.endsNotice(one, BEFORE)[0], /Buses 296 from Y Int stop near X\.$/);
  assert.match(C.endsNotice(two, BEFORE)[0], /Buses 296 and 460 from Y Int stop near X\.$/);
});

test("the notice: a trip's legs (js/nav.js's tripFromNav, `shuttle`) too, once for two rides on it", () => {
  const legs = [{ kind: "walk" }, { kind: "bus", shuttle: { name: "IKEA", route: "IKEA T", ends: "2026-12-31", instead: INSTEAD } }, { kind: "bus", shuttle: { name: "IKEA", route: "IKEA S", ends: "2026-12-31", instead: INSTEAD } }];
  assert.deepEqual(C.endingOn(legs, BEFORE), [{ name: "IKEA", ends: "2026-12-31", instead: INSTEAD }]);
  assert.deepEqual(C.endsNotice(legs, BEFORE), [NOTICE]);
  assert.deepEqual(C.endingOn(legs, AFTER), []);
});

test("the notice and the times' line in Chinese: its words, date and list", () => {
  const zh = JSON.parse(readFileSync(new URL("../main-site/i18n/zh-SG.json", import.meta.url), "utf8"));
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  globalThis.I18n = { lang: () => "zh-SG", t: (key, en, vars) => fill(zh[key] ?? en, vars || {}) };
  try {
    const date = C.dateText("2026-12-31");
    const buses = new Intl.ListFormat("zh-SG", { type: "conjunction" }).format(INSTEAD.buses);
    assert.doesNotMatch(date, /Dec/);
    assert.deepEqual(C.endsNotice(way.legs, BEFORE), [fill(zh["nav.shuttle.ends"], { name: "IKEA", date }) + fill(zh["nav.shuttle.instead"], { buses, from: INSTEAD.from, name: "IKEA" })]);
    assert.equal(C.route("ikea:IKEA T", BEFORE).ends, fill(zh["campus.endsOn"], { date }));
  } finally {
    delete globalThis.I18n;
  }
});

test("the notice: none on a shuttle that isn't ending, or on a way with no shuttle", () => {
  assert.deepEqual(C.endingOn([{ mode: "bus", campus: { name: "NUS" } }, { mode: "bus", route: "12" }], BEFORE), []);
  assert.deepEqual(C.endingOn(null, BEFORE), []);
});

console.log(`\n${passed} passed`);
