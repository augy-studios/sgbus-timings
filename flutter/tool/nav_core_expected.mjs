// What the site's own planner (main-site/js/nav-core/) says for a set of journeys, as
// test/fixtures/nav-core-expected.json, for test/nav_core_test.dart to hold lib/data/nav_core.dart to.
// From android/: node tool/nav_core_expected.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildGraph } from '../../main-site/js/nav-core/network.js';
import { planFor, planViaFor } from '../../main-site/js/nav-core/plan.js';
import { joinWays } from '../../main-site/js/nav-core/via.js';

const gz = (n) => JSON.parse(gunzipSync(readFileSync(`test/fixtures/${n}.json.gz`)).toString());
const data = (n) => JSON.parse(readFileSync(`../main-site/data/${n}.json`, 'utf8'));
const stops = gz('bus-stops');
const routes = gz('bus-routes');
const rail = data('rail');
const campus = { nus: data('campus/nus'), ntu: data('campus/ntu'), config: data('campus/config'), shuttles: data('campus/shuttles') };

const P = {
  bedok: { lat: 1.324736, lng: 103.929256 },
  raffles: { lat: 1.28435, lng: 103.851073 },
  jurong: { lat: 1.3331, lng: 103.7425 },
  woodlands: { lat: 1.4369, lng: 103.7864 },
  jb: { lat: 1.4655, lng: 103.7578 },
  nus: { lat: 1.2966, lng: 103.7764 },
  ntu: { lat: 1.3483, lng: 103.6831 },
  changi: { lat: 1.3644, lng: 103.9915 },
  punggol: { lat: 1.4043, lng: 103.9021 },
  tuas: { lat: 1.2905, lng: 103.6365 },
  near1: { lat: 1.3048, lng: 103.8318 },
  near2: { lat: 1.3010, lng: 103.8390 },
};
const at = (s) => Date.parse(`${s}+08:00`);
const CASES = [
  ['bedok', 'raffles', 'now', '2026-10-30T08:30'],
  ['jurong', 'punggol', 'now', '2026-10-30T18:15'],
  ['woodlands', 'jb', 'now', '2026-10-30T18:30'],
  ['jb', 'woodlands', 'now', '2026-11-01T20:00'],
  ['nus', 'ntu', 'now', '2026-10-30T10:00'],
  ['nus', 'changi', 'leave', '2026-10-31T23:40'],
  ['changi', 'tuas', 'arrive', '2026-10-30T09:00'],
  ['near1', 'near2', 'now', '2026-10-30T12:00'],
  ['bedok', 'raffles', 'now', '2026-10-30T03:00'],
  ['raffles', 'punggol', 'leave', '2026-11-09T07:30'],
];
const VIA = [
  ['bedok', 'near1', 'jurong', 'now', '2026-10-30T09:00'],
  ['nus', 'raffles', 'changi', 'arrive', '2026-10-30T19:00'],
];

// What's held to account: everything a way says but its floating-point minutes to the last digit.
const round = (n) => Math.round(n * 1000) / 1000;
const shape = (o) => ({
  minutes: o.minutes,
  mix: o.mix,
  routes: o.routes,
  walkOnly: !!o.walkOnly,
  far: o.far ?? null,
  via: o.via ? { leg: o.via.leg, minutes: o.via.minutes } : null,
  legs: o.legs.map((l) => ({
    mode: l.mode,
    route: l.route ?? null,
    metres: l.metres ?? null,
    minutes: round(l.minutes),
    board: l.board == null ? null : round(l.board),
    wait: l.wait ?? null,
    stops: l.stops ?? null,
    towards: l.towards ?? null,
    from: l.from?.code ?? null,
    to: l.to?.code ?? null,
    fromExit: l.fromExit?.name ?? null,
    toExit: l.toExit?.name ?? null,
    codes: l.codes ?? null,
    names: l.names?.length ?? null,
    customs: l.customs ?? null,
    campus: l.campus?.name ?? null,
  })),
});

const out = {};
for (const open of [false]) {
  const graph = buildGraph(rail, stops, routes, { open, campus });
  out.graph = { nodes: graph.nodes.length, runs: graph.runs.length, walks: graph.walks.reduce((n, w) => n + w.length, 0) };
  out.cases = CASES.map(([a, b, mode, t]) => ({
    from: a, to: b, mode, at: t,
    options: planFor(graph, P[a], P[b], { mode, ms: at(t) }, null).options.map(shape),
  }));
  out.paid = planFor(graph, P.nus, P.ntu, { mode: 'now', ms: at('2026-10-30T10:00') }, null, { paid: true }).options.map(shape);
  out.ownCustoms = planFor(graph, P.woodlands, P.jb, { mode: 'now', ms: at('2026-10-30T18:30') }, 45).options.map(shape);
  out.via = VIA.map(([a, v, b, mode, t]) => {
    const { first, second, fits } = planViaFor(graph, P[a], P[v], P[b], { mode, ms: at(t) }, null);
    return { from: a, via: v, to: b, mode, at: t, options: joinWays(first.options, second.options, P[v], { fits }).map(shape) };
  });
}
const openGraph = buildGraph(rail, stops, routes, { open: true, campus });
out.openGraph = { nodes: openGraph.nodes.length, runs: openGraph.runs.length };
out.points = P;
writeFileSync('test/fixtures/nav-core-expected.json', JSON.stringify(out));
console.log('wrote', out.cases.reduce((n, c) => n + c.options.length, 0), 'ways;', JSON.stringify(out.graph));
