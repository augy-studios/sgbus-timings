// What the live feeds add to the router's journeys (api/nav.js), for setting off now:
//
// - withTraffic(graph, traffic): the network with each bus run's minutes stretched by the
//   traffic on its way right now (api/_lib/traffic.js), so a bus through a jam is slower and
//   a train can win. Made once per traffic update.
// - annotate(options, ...): on each bus leg, `lastBus` ("00:18") when it's boarded within
//   LAST_WINDOW_MIN of that stop's last bus of the day, and `traffic` { extra, roads,
//   incidents } when the traffic makes it a minute or more slower or an incident is on its
//   way: the minutes added, the slow roads by name, and the incidents, to say why. And
//   `usual`, its minutes without traffic, for a trip to time it by the traffic as it goes.
// - othersFor(from, to, ...): walking and, for someone with a bike, cycling the whole way,
//   { walk: { minutes, distance }, cycle: { ... } }, each only where it might compete.

import { footRoute, metres } from "../_lib/foot.js";
import { incidentsNear, segmentFactor, slowRoads } from "../_lib/traffic.js";
import { lastBusAfter, sgClock } from "./when.js";

const LAST_WINDOW_MIN = 30;
const MAX_INCIDENTS = 2;
// Worth working out only if it could come within this of the quickest way by bus and train.
const OTHERS_SLACK_MIN = 10;
const WALK_MAX_M = 6000;
const CYCLE_MAX_M = 20000;
// Straight-line pace for that first guess, metres a minute, and the way's detour.
const GUESS_M_PER_MIN = { walk: 80, cycle: 250 };
const GUESS_DETOUR = 1.2;

const traffickedGraphs = new WeakMap();

export function withTraffic(graph, traffic) {
  const kept = traffickedGraphs.get(graph);
  if (kept?.at === traffic.at) return kept.graph;
  const runs = graph.runs.map((run) => {
    if (run.mode !== "B") return run;
    const cum = [0];
    for (let i = 1; i < run.nodes.length; i++) {
      const a = graph.nodes[run.nodes[i - 1]];
      const b = graph.nodes[run.nodes[i]];
      cum.push(cum[i - 1] + (run.cum[i] - run.cum[i - 1]) * segmentFactor(traffic, [a.lat, a.lng], [b.lat, b.lng]));
    }
    return { ...run, cum };
  });
  const out = { ...graph, runs };
  traffickedGraphs.set(graph, { at: traffic.at, graph: out });
  return out;
}

// The network's bus runs by service, and its nodes by stop code, made once per network.
const indexes = new WeakMap();
function indexOf(graph) {
  if (!indexes.has(graph)) {
    const byRoute = new Map();
    for (const run of graph.runs) {
      if (run.mode !== "B") continue;
      if (!byRoute.has(run.route)) byRoute.set(run.route, []);
      byRoute.get(run.route).push(run);
    }
    const byCode = new Map();
    graph.nodes.forEach((n, id) => n.kind === "stop" && byCode.set(n.code, id));
    indexes.set(graph, { byRoute, byCode });
  }
  return indexes.get(graph);
}

// The run a bus leg rides, and where on it the leg gets on and off.
function rideOf(graph, leg) {
  const { byRoute, byCode } = indexOf(graph);
  const from = byCode.get(leg.from?.code);
  const to = byCode.get(leg.to?.code);
  if (from == null || to == null) return null;
  for (const run of byRoute.get(leg.route) || []) {
    if (leg.dir != null && run.dir !== leg.dir) continue;
    const i = run.nodes.indexOf(from);
    const j = i === -1 ? -1 : run.nodes.indexOf(to, i + 1);
    if (j !== -1) return { run, i, j };
  }
  return null;
}

const hhmm = (ms) => {
  const { min } = sgClock(ms);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};

// `graph` is the network without traffic, for each leg's usual minutes and its stops' times.
export function annotate(options, { graph, traffic, setOff }) {
  for (const o of options) {
    let t = 0;
    for (const leg of o.legs) {
      if (leg.mode === "walk") {
        t += leg.minutes || 0;
        continue;
      }
      const board = leg.board ?? t + (leg.wait || 0);
      t = board + (leg.minutes || 0);
      if (leg.mode !== "bus") continue;
      const ride = rideOf(graph, leg);
      if (!ride) continue;
      const usual = ride.run.cum[ride.j] - ride.run.cum[ride.i];
      leg.usual = Math.round(usual * 10) / 10;
      const boardMs = setOff + board * 60000;
      const last = lastBusAfter(ride.run.times?.[ride.i], boardMs);
      if (last != null && last - boardMs <= LAST_WINDOW_MIN * 60000) leg.lastBus = hhmm(last);
      if (!traffic) continue;
      const extra = Math.round((leg.minutes || 0) - usual);
      const incidents = incidentsNear(traffic, leg.path).slice(0, MAX_INCIDENTS).map(({ type, message, lat, lng }) => ({ type, message, lat, lng }));
      if (extra >= 1 || incidents.length) leg.traffic = { extra: Math.max(0, extra), roads: slowRoads(traffic, leg.path), incidents };
    }
  }
}

export async function othersFor(from, to, best, { bike = false } = {}) {
  const straight = metres([from.lat, from.lng], [to.lat, to.lng]);
  const worth = (mode, max) => straight <= max && (straight * GUESS_DETOUR) / GUESS_M_PER_MIN[mode] <= best + OTHERS_SLACK_MIN;
  const out = {};
  const ask = (mode) => footRoute(from, to, { mode }).then((r) => {
    out[mode] = { minutes: r.minutes, distance: r.distance };
  });
  await Promise.all([
    worth("walk", WALK_MAX_M) ? ask("walk") : null,
    bike && worth("cycle", CYCLE_MAX_M) ? ask("cycle") : null,
  ].map((p) => p?.catch(() => {})));
  return out;
}
