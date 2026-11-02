// The shuttle buses' kept roads (main-site/data/campus/roads.json, scripts/shuttle-roads.mjs):
// every route has one, made for its stops as they are, along roads and through every stop.
//
//   node scripts/campus-roads-test.mjs
//
// Needs the network for LTA's stops (the live site's /api/bus-stops), as a route's `at` is its
// stops' places; behind a proxy, NODE_USE_ENV_PROXY=1. Run scripts/shuttle-roads.mjs again when
// this says a route's stops have changed.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'main-site');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(site, 'js/campus.js'), 'utf8'), ctx);
const C = ctx.Campus;
const file = (f) => JSON.parse(readFileSync(join(site, 'data/campus', f), 'utf8'));
const raw = { nus: file('nus.json'), ntu: file('ntu.json'), config: file('config.json'), shuttles: file('shuttles.json') };
const roads = file('roads.json').routes;

let fails = 0;
let passes = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); cond ? passes++ : fails++; };
const metres = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
// How far a point is from a path, to the nearest of its points or the stretches between them.
const fromPath = (p, path) => {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b] = [path[i], path[i + 1]];
    const k = Math.cos((p[0] * Math.PI) / 180);
    const ax = a[1] * k; const ay = a[0]; const bx = b[1] * k; const by = b[0]; const px = p[1] * k; const py = p[0];
    const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    best = Math.min(best, metres(p, [ay + t * dy, (ax + t * dx) / k]));
  }
  return best;
};

ok('roadKey is the same for the same stops, and differs for others', C.roadKey([[1.3, 103.8], [1.31, 103.81]]) === C.roadKey([[1.300001, 103.800001], [1.31, 103.81]]) && C.roadKey([[1.3, 103.8], [1.31, 103.81]]) !== C.roadKey([[1.31, 103.81], [1.3, 103.8]]));

const stops = await fetch('https://sgbus.uwuapps.org/api/bus-stops').then((r) => r.json());
const lta = Object.fromEntries(stops.map((s) => [s.c, { n: s.n, road: s.r, lat: s.la, lng: s.lo }]));
const m = C.build(raw, lta);
const routes = m.routes.map((r) => ({ key: r.key, points: r.keys.filter(Boolean).map((k) => m.stops.get(k)).map((s) => [s.lat, s.lng]) })).filter((r) => r.points.length >= 2);
ok(`every route has a kept road (${routes.length})`, routes.every((r) => roads[r.key]), routes.filter((r) => !roads[r.key]).map((r) => r.key).join());
ok('none kept for a route that isn\'t there', Object.keys(roads).every((k) => routes.some((r) => r.key === k)), Object.keys(roads).filter((k) => !routes.some((r) => r.key === k)).join());
const stale = routes.filter((r) => roads[r.key] && roads[r.key].at !== C.roadKey(r.points));
ok('each made for its route\'s stops as they are now', !stale.length, `stops changed: ${stale.map((r) => r.key).join()} (run scripts/shuttle-roads.mjs)`);
for (const r of routes) {
  const path = roads[r.key]?.path || [];
  // Many points: a road, not stop to stop.
  const far = r.points.map((p) => fromPath(p, path));
  ok(`${r.key}: a road of ${path.length} points, every stop within 150 m of it`, path.length > r.points.length * 3 && far.every((d) => d <= 150), far.map(Math.round).join('/'));
}
console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
process.exitCode = fails ? 1 : 0;
