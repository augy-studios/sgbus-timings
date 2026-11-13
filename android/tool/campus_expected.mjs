// What the site's own js/campus.js says of the shuttle buses, as test/fixtures/campus-expected.json,
// for test/campus_test.dart to hold lib/data/campus.dart to: the stops and routes built from
// main-site/data/campus/*.json against LTA's stops (test/fixtures/bus-stops.json.gz), and the
// words at each stop of each route at moments that cover term and vacation, weekdays, weekends,
// a public holiday and its eve, before the first bus and after the last.
// From android/: node tool/campus_expected.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

const OUT = 'test/fixtures/campus-expected.json';
const site = '../main-site';
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/when.js', 'js/campus.js']) vm.runInContext(readFileSync(`${site}/${f}`, 'utf8'), ctx);
const C = ctx.Campus;
const When = ctx.When;
const file = (f) => JSON.parse(readFileSync(`${site}/data/campus/${f}.json`, 'utf8'));
const raw = { nus: file('nus'), ntu: file('ntu'), config: file('config'), shuttles: file('shuttles') };
const lta = {};
for (const r of JSON.parse(gunzipSync(readFileSync('test/fixtures/bus-stops.json.gz')).toString())) lta[r.c] = { n: r.n, road: r.r, lat: r.la, lng: r.lo };
const model = C.build(raw, lta);

const MOMENTS = ['2026-10-07T08:00', '2026-10-07T23:30', '2026-10-09T13:37', '2026-10-10T10:00', '2026-10-11T12:00', '2026-11-09T09:00', '2026-12-15T09:00', '2026-12-24T09:00', '2027-01-01T07:10'];
const nameIn = (route) => (id) => {
  const k = route.keys[route.ids.indexOf(id)];
  return (k && model.stops.get(k)?.name) || id;
};
const opts = { config: model.config, isHoliday: When.isHoliday };
const say = (key) => {
  const [at, rk, i] = key.split('|');
  const r = model.routes.find((x) => x.key === rk);
  const d = C.describe(C.status(r, Number(i), Date.parse(`${at}:00+08:00`), opts), nameIn(r));
  return `${d.main} / ${d.sub}`;
};

// The moments each route was first written for are kept as they were; a route that's new has
// them all, at every stop.
const was = (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return null; } })();
const keys = new Set(Object.keys(was?.says || {}).filter((k) => model.routes.some((r) => r.key === k.split('|')[1])));
const known = new Set([...keys].map((k) => k.split('|')[1]));
for (const r of model.routes) {
  if (known.has(r.key)) continue;
  for (const at of MOMENTS) r.keys.forEach((k, i) => k && keys.add(`${at}|${r.key}|${i}`));
}
const says = {};
for (const k of keys) says[k] = say(k);

// Bus timings' search, as campus.js's search() has it.
const fold = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function search(q, limit = 4) {
  const f = fold(q);
  const routes = model.routes.filter((r) => fold(r.code) === f || (f.length >= 2 && fold(r.code).startsWith(f)))
    .sort((a, b) => (fold(b.code) === f) - (fold(a.code) === f)).slice(0, limit);
  const own = [...model.stops.values()].filter((st) => !st.lta);
  const score = (st) => (fold(st.name) === f ? 0 : fold(st.name).startsWith(f) ? 1 : fold(st.name).includes(f) ? 2 : 3);
  const stops = f.length < 2 ? [] : own.map((st) => [score(st), st]).filter(([sc]) => sc < 3).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(([, st]) => st).slice(0, limit);
  return [...routes.map((r) => r.key), ...stops.map((s) => s.key)];
}
const queries = [...new Set([...Object.keys(was?.search || {}), 'cw3', 'causeway'])];
const roadKeys = {};
for (const key of Object.keys(was?.roadKeys || { 'nus:A1': 0, 'nus:A2': 0, 'nus:D1': 0 })) {
  const r = model.routes.find((x) => x.key === key);
  if (r) roadKeys[key] = C.roadKey(r.keys.filter(Boolean).map((k) => model.stops.get(k)).map((s) => [s.lat, s.lng]));
}

const out = {
  stops: [...model.stops.keys()].sort(),
  lta: [...model.stops.values()].filter((s) => s.lta).map((s) => s.key).sort(),
  routes: model.routes.map((r) => r.key),
  problems: model.problems.length,
  says,
  search: Object.fromEntries(queries.map((q) => [q, search(q)])),
  roadKeys,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ${out.routes.length} routes, ${Object.keys(says).length} words, ${model.problems.length} problems`);
