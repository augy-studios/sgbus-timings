// The roads the shuttle buses take, worked out once and kept in main-site/data/campus/roads.json,
// so Explorer draws each route along its road at once, offline too, and never asks /api/road
// for thirty routes in one go (it allows 30 a minute from one connection).
//
//   node scripts/shuttle-roads.mjs            every route, written to roads.json
//   node scripts/shuttle-roads.mjs sgh:Blue   only these (the others kept as they are)
//
// Needs the network: LTA's stops from the live site (sgbus.uwuapps.org/api/bus-stops) and the
// car router OpenStreetMap Germany runs on OSRM (routing.openstreetmap.de), as api/road.js uses.
// Run it again whenever a route's stops change: js/campus.js uses a road only while its `at`
// matches the route's stops, and Explorer asks /api/road for one that doesn't.
//
// Each route is asked for whole first, held to api/road.js's checks (every stop within SNAP_M of
// a road, no stretch more than DETOUR times the straight line plus DETOUR_M). One that fails is
// asked stop to stop, through the VIA points below where a stretch needs them, and a stretch
// is taken if it's within LONG times plus LONG_M (an airport's or a hospital's one-way loops);
// one still past that, or with a stop off every road, is drawn straight, and said so.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'main-site');
const OUT = join(site, 'data/campus/roads.json');
const OSRM = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
const SNAP_M = 150;
const DETOUR = 2.5;
const DETOUR_M = 1500;
const LONG = 8;
const LONG_M = 4000;
// Points a stretch goes through, by route and the stop it leaves from (its place on the route),
// where the router's own way isn't the shuttle's.
const VIA = {};
// Points within this of the line through their neighbours are left out of the road.
const SIMPLIFY_M = 2;

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(site, 'js/campus.js'), 'utf8'), ctx);
const C = ctx.Campus;
const file = (f) => JSON.parse(readFileSync(join(site, 'data/campus', f), 'utf8'));
const raw = { nus: file('nus.json'), ntu: file('ntu.json'), config: file('config.json'), shuttles: file('shuttles.json') };

const stops = await fetch('https://sgbus.uwuapps.org/api/bus-stops').then((r) => r.json());
const lta = Object.fromEntries(stops.map((s) => [s.c, { n: s.n, road: s.r, lat: s.la, lng: s.lo }]));
const m = C.build(raw, lta);
if (m.problems.length) console.warn('problems:', m.problems.join('; '));

const metres = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const round5 = ([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The router's road through `points`, as { path, legs: [metres], snaps: [metres] }, or null.
async function osrm(points) {
  await sleep(1100); // gently: it's a free service
  const coords = points.map(([a, b]) => `${b},${a}`).join(';');
  for (let tries = 0; tries < 3; tries++) {
    try {
      const r = await fetch(`${OSRM}/${coords}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(20000) });
      const d = await r.json();
      const route = d?.routes?.[0];
      if (!route) return null;
      return { path: route.geometry.coordinates.map(([lng, lat]) => round5([lat, lng])), legs: route.legs.map((l) => l.distance), snaps: d.waypoints.map((w) => w.distance) };
    } catch {
      await sleep(3000);
    }
  }
  return null;
}

// Douglas-Peucker, in metres near enough at Singapore's latitude.
function simplify(path) {
  if (path.length < 3) return path;
  const k = 111320;
  const xy = path.map(([a, b]) => [b * k * Math.cos((a * Math.PI) / 180), a * k]);
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[j];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let at = -1;
    for (let n = i + 1; n < j; n++) {
      // From the stretch between them, not the line through them: a loop's ends are one point.
      const t = len2 ? Math.max(0, Math.min(1, ((xy[n][0] - x1) * dx + (xy[n][1] - y1) * dy) / len2)) : 0;
      const d = Math.hypot(xy[n][0] - (x1 + t * dx), xy[n][1] - (y1 + t * dy));
      if (d > far) { far = d; at = n; }
    }
    if (far > SIMPLIFY_M) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return path.filter((_, n) => keep[n]);
}

const fits = (got, points, detour, extra) => got && got.snaps.every((s) => s <= SNAP_M)
  && got.legs.every((d, i) => d <= metres(points[i], points[i + 1]) * detour + extra);

// One route's road: { path, straight: [stretches drawn straight], long: [stretches taken long] }.
async function roadOf(key, points) {
  const whole = await osrm(points);
  if (fits(whole, points, DETOUR, DETOUR_M)) return { path: whole.path, straight: [], long: [] };
  const path = [];
  const straight = [];
  const long = [];
  for (let i = 0; i < points.length - 1; i++) {
    const via = VIA[key]?.[i] || [];
    const pts = [points[i], ...via, points[i + 1]];
    const got = await osrm(pts);
    const direct = metres(points[i], points[i + 1]);
    const legSum = got ? got.legs.reduce((a, b) => a + b, 0) : Infinity;
    let piece;
    if (got && got.snaps.every((s) => s <= SNAP_M) && legSum <= direct * LONG + LONG_M) {
      piece = got.path;
      if (legSum > direct * DETOUR + DETOUR_M) long.push(`${i}->${i + 1} ${Math.round(legSum)} m for ${Math.round(direct)} m`);
    } else {
      piece = [round5(points[i]), round5(points[i + 1])];
      straight.push(`${i}->${i + 1}${got ? ` (${Math.round(legSum)} m for ${Math.round(direct)} m, snaps ${got.snaps.map(Math.round).join('/')} m)` : ' (no road)'}`);
    }
    path.push(...(path.length ? piece.slice(1) : piece));
  }
  return { path, straight, long };
}

const only = process.argv.slice(2);
let kept = {};
try { kept = JSON.parse(readFileSync(OUT, 'utf8')).routes || {}; } catch { /* a first run */ }
const out = {};
for (const r of m.routes) {
  const points = r.keys.filter(Boolean).map((k) => m.stops.get(k)).map((s) => [s.lat, s.lng]);
  if (points.length < 2) continue;
  if (only.length && !only.includes(r.key)) {
    if (kept[r.key]) out[r.key] = kept[r.key];
    continue;
  }
  const { path, straight, long } = await roadOf(r.key, points);
  out[r.key] = { at: C.roadKey(points), path: simplify(path) };
  console.log(`${r.key}: ${out[r.key].path.length} points${long.length ? `; long: ${long.join(', ')}` : ''}${straight.length ? `; STRAIGHT: ${straight.join(', ')}` : ''}`);
}
writeFileSync(OUT, `${JSON.stringify({
  _about: 'The roads the shuttle buses take, for Explorer (js/campus.js, js/map.js): each route by its key, `at` its stops (Campus.roadKey) and `path` its road, [[lat, lng], ...]. Made by scripts/shuttle-roads.mjs from OpenStreetMap through OSRM (routing.openstreetmap.de); run it again when a route\'s stops change. Road data (c) OpenStreetMap contributors.',
  routes: out,
})}\n`);
console.log(`wrote ${OUT}`);
