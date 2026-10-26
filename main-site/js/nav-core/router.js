// Point-to-point journeys by bus and train, keeping the best for every mix of the two.
//
// The search goes round by round, one vehicle per round (RAPTOR, in outline). What makes
// it give more than one answer is that every arrival is kept per "mix": the modes ridden so
// far, in order, as a string like "T" (one train), "BT" (a bus, then a train) or "TTB". A
// slower arrival survives when its mix differs, so the 2 trains + 1 bus option is still
// there when 1 train + 2 buses is a minute quicker. Up to MAX_VEHICLES vehicles a journey.
//
// Times are estimates (see network.js): riding, walking, and an average wait to board.

import { STATION_ACCESS_MIN, WALK_M_PER_MIN, nodesNear } from "./network.js";

const MAX_VEHICLES = 4;
// The expected wait to board, about half the gap between buses or trains.
const WAIT_MIN = { B: 5, T: 3 };
// Changing trains inside an interchange: walking between platforms.
const INTERCHANGE_MIN = 3;
// How far to walk to the first stop or station, and from the last.
const ACCESS_M = 900;
// The nearest few of each kind are enough to start from; more only slows the search.
const ACCESS_STOPS = 30;
const ACCESS_STATIONS = 5;
// An option is worth showing if it's within this of the quickest.
const KEEP_FACTOR = 1.6;
const KEEP_EXTRA_MIN = 12;
const MAX_OPTIONS = 8;
// An option this much slower than another, with no fewer changes and no less walking, is
// left out as a detour.
const DETOUR_MIN = 5;
// Less walking only counts as better when it saves at least this much.
const WALK_SAVING_M = 150;

function access(graph, lat, lng) {
  let stops = 0;
  let stations = 0;
  const out = [];
  for (const [node, metres] of nodesNear(graph, lat, lng, ACCESS_M)) {
    const station = graph.nodes[node].kind === "station";
    if (station ? stations++ >= ACCESS_STATIONS : stops++ >= ACCESS_STOPS) continue;
    out.push([node, metres / WALK_M_PER_MIN + (station ? STATION_ACCESS_MIN : 0), metres]);
  }
  return out;
}

// Labels: per node, per mix, the best arrival { t, prev }, where prev is how it got there:
// { kind: "access", metres } | { kind: "ride", run, from, to, label } | { kind: "walk", from, metres, label }.
//
// `open(run, i, t)`, when given, says whether a run is running at its i-th node t minutes
// after setting off (when.js); a run that isn't is never boarded there.
//
// `customs(way, t)` is the minutes to clear immigration on a bus crossing the Causeway ("out"
// to Johor Bahru or "in"), reaching the checkpoint t minutes after setting off (api/nav.js):
// added on top of the ride at each crossing (network.js, `cross`).
export function plan(graph, from, to, { open = null, customs = null } = {}) {
  // The crossings a ride from the run's `from`-th node to its i-th passes, each with its time.
  const held = (run, fromIndex, i, base) => {
    if (!customs || !run.cross?.length) return null;
    const passed = run.cross.filter(([c]) => c > fromIndex && c <= i);
    if (!passed.length) return null;
    return passed.map(([c, way]) => ({ c, way, minutes: customs(way, base + run.cum[c - 1]) }));
  };
  const heldMin = (h) => (h ? h.reduce((sum, x) => sum + x.minutes, 0) : 0);
  const starts = access(graph, from.lat, from.lng);
  const ends = access(graph, to.lat, to.lng);
  const endAt = new Map(ends.map(([n, min, m]) => [n, { min, metres: m }]));

  const best = new Map(); // node -> Map(mix -> label)
  const keep = (node, mix, label) => {
    let byMix = best.get(node);
    if (!byMix) best.set(node, (byMix = new Map()));
    const old = byMix.get(mix);
    if (old && old.t <= label.t) return false;
    byMix.set(mix, label);
    return true;
  };

  // The quickest way in so far, for pruning: nothing much slower than it is worth carrying.
  let bound = Infinity;
  const arrived = (node, label) => {
    const end = endAt.get(node);
    if (end) bound = Math.min(bound, label.t + end.min);
  };
  const worthIt = (t) => t <= bound * KEEP_FACTOR + KEEP_EXTRA_MIN;

  // Round 0: walking to the first stop or station.
  let frontier = new Map();
  for (const [node, min, metres] of starts) {
    const label = { t: min, mix: "", node, prev: { kind: "access", metres } };
    keep(node, "", label);
    frontier.set(node, [label]);
  }

  for (let round = 1; round <= MAX_VEHICLES && frontier.size; round++) {
    const reached = new Map(); // node -> Map(mix -> label), this round's rides

    // Every run calling at a node someone is waiting at, from the earliest such position.
    const runFrom = new Map();
    for (const node of frontier.keys()) {
      for (const [r, i] of graph.at[node]) {
        if (!runFrom.has(r) || i < runFrom.get(r)) runFrom.set(r, i);
      }
    }

    for (const [r, start] of runFrom) {
      const run = graph.runs[r];
      // Per mix: the cheapest way to be on this run, as minutes before its own ride counts.
      const onboard = new Map();
      for (let i = start; i < run.nodes.length; i++) {
        const node = run.nodes[i];
        // Getting off here.
        for (const [mix, on] of onboard) {
          const crossed = held(run, on.from, i, on.base);
          const t = on.base + run.cum[i] + heldMin(crossed);
          if (!worthIt(t)) continue;
          const label = { t, mix: mix + run.mode, node, prev: { kind: "ride", run: r, from: on.from, to: i, label: on.label, crossed } };
          let byMix = reached.get(node);
          if (!byMix) reached.set(node, (byMix = new Map()));
          const old = byMix.get(label.mix);
          const known = best.get(node)?.get(label.mix);
          if ((!old || t < old.t) && (!known || t < known.t)) byMix.set(label.mix, label);
        }
        // Getting on here.
        for (const label of frontier.get(node) || []) {
          // Never the same bus or train service twice in one journey: getting back on a line
          // you left is a detour, not a choice.
          if (ridden(graph, label).has(run.key)) continue;
          const last = lastRide(graph, label);
          let t = label.t + WAIT_MIN[run.mode];
          if (last && last.mode === "T" && run.mode === "T") t += INTERCHANGE_MIN;
          if (open && !open(run, i, t)) continue;
          const base = t - run.cum[i];
          const on = onboard.get(label.mix);
          if (!on || base < on.base) onboard.set(label.mix, { base, from: i, label });
        }
      }
    }

    // Keep this round's arrivals, then the short walks on from them, as next round's frontier.
    const next = new Map();
    const add = (node, label) => {
      if (!keep(node, label.mix, label)) return;
      arrived(node, label);
      if (!next.has(node)) next.set(node, []);
      next.get(node).push(label);
    };
    for (const [node, byMix] of reached) for (const label of byMix.values()) add(node, label);
    for (const [node, labels] of [...next]) {
      for (const label of labels) {
        for (const [other, min, metres] of graph.walks[node]) {
          const t = label.t + min;
          if (worthIt(t)) add(other, { t, mix: label.mix, node: other, prev: { kind: "walk", from: node, metres, label } });
        }
      }
    }
    frontier = next;
  }

  // The best way to the end for each mix.
  const byMix = new Map();
  for (const [node, end] of endAt) {
    for (const [mix, label] of best.get(node) || []) {
      if (!mix) continue;
      const total = label.t + end.min;
      const old = byMix.get(mix);
      if (!old || total < old.total) byMix.set(mix, { total, label, end });
    }
  }

  const options = [...byMix.values()].map((o) => toOption(graph, o)).filter(Boolean);
  const walkMetres = haversineDirect(from, to);
  return choose(options, walkMetres);
}

function ridden(graph, label) {
  const keys = new Set();
  for (let l = label; l; l = l.prev.label) {
    if (l.prev.kind === "ride") keys.add(graph.runs[l.prev.run].key);
  }
  return keys;
}

function lastRide(graph, label) {
  for (let l = label; l; l = l.prev.label) {
    if (l.prev.kind === "ride") return graph.runs[l.prev.run];
  }
  return null;
}

function haversineDirect(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const nodeRef = (n) => ({ kind: n.kind, code: n.code, name: n.name, lat: n.lat, lng: n.lng });

// Each option's rides as [run, board index, minutes in when boarded], for runsThroughout.
const ridesOf = new WeakMap();

// Whether every ride on an option is running when it's boarded, by `open` (see plan). An
// option the router didn't make, such as OneMap's, is taken as it is.
export function runsThroughout(option, open) {
  return (ridesOf.get(option) || []).every(([run, i, t]) => open(run, i, t));
}

// A chain of labels back to the start, as legs a person reads: walk, ride, walk.
function toOption(graph, { total, label, end }) {
  const chain = [];
  for (let l = label; l; l = l.prev.label) chain.unshift(l);
  const legs = [];
  const rides = [];
  for (const l of chain) {
    const node = graph.nodes[l.node];
    if (l.prev.kind === "access") {
      legs.push({ mode: "walk", metres: Math.round(l.prev.metres), minutes: l.t, to: nodeRef(node) });
    } else if (l.prev.kind === "walk") {
      legs.push({ mode: "walk", metres: Math.round(l.prev.metres), minutes: l.t - l.prev.label.t, from: nodeRef(graph.nodes[l.prev.from]), to: nodeRef(node) });
    } else {
      const run = graph.runs[l.prev.run];
      const { from, to, crossed } = l.prev;
      const minutes = run.cum[to] - run.cum[from] + (crossed || []).reduce((sum, x) => sum + x.minutes, 0);
      const leg = {
        mode: run.mode === "B" ? "bus" : "train",
        route: run.route,
        towards: run.towards,
        from: nodeRef(graph.nodes[run.nodes[from]]),
        to: nodeRef(graph.nodes[run.nodes[to]]),
        stops: to - from,
        minutes,
        wait: WAIT_MIN[run.mode],
        // Minutes after setting off that it's boarded, the wait to board counted in.
        board: l.t - minutes,
        // Each crossing of the Causeway on the way, where you get off for immigration and on
        // again: the checkpoint you get off at, the one across, and the minutes counted.
        ...(crossed && {
          customs: crossed.map((x) => ({ way: x.way, from: graph.nodes[run.nodes[x.c - 1]].code, to: graph.nodes[run.nodes[x.c]].code, minutes: x.minutes })),
        }),
        // Where the leg passes, for following it on the way (the Get Off Alert), and the
        // name of each stop or station on it, for the trip's timeline.
        path: run.nodes.slice(from, to + 1).map((n) => [graph.nodes[n].lat, graph.nodes[n].lng]),
        names: run.nodes.slice(from, to + 1).map((n) => graph.nodes[n].name),
      };
      // A bus leg's stop codes too, so the trip's timeline can open each stop's timings.
      if (run.mode === "B") Object.assign(leg, { dir: run.dir, codes: run.nodes.slice(from, to + 1).map((n) => graph.nodes[n].code) });
      else Object.assign(leg, { name: run.name, color: run.color, lrt: run.lrt });
      legs.push(leg);
      rides.push([run, from, leg.board]);
    }
  }
  legs.push({ mode: "walk", metres: Math.round(end.metres), minutes: end.min, to: { kind: "place" } });

  // Walks of nothing (starting or ending right at a stop) say nothing.
  const kept = legs.filter((l) => l.mode !== "walk" || l.metres >= 20);
  const ridden = kept.filter((l) => l.mode !== "walk");
  const option = {
    minutes: Math.round(total),
    mix: ridden.map((l) => (l.mode === "bus" ? "B" : "T")).join(""),
    routes: ridden.map((l) => l.route),
    legs: kept,
  };
  ridesOf.set(option, rides);
  return option;
}

// The quickest, then the best of each other mix that's close enough to be worth it, so the
// list is varied rather than eight small variations on one journey.
function choose(options, walkMetres) {
  // A short trip can be quicker on foot than waiting for anything, and then nothing much
  // slower than walking is worth listing.
  const walkMin = Math.round(walkMetres / WALK_M_PER_MIN);
  const walk = walkMetres <= 2000
    ? { minutes: walkMin, mix: "", routes: [], walkOnly: true, legs: [{ mode: "walk", metres: Math.round(walkMetres), minutes: walkMin, to: { kind: "place" } }] }
    : null;
  const all = (walk ? [...options, walk] : options).sort((a, b) => a.minutes - b.minutes);
  const fastest = all[0]?.minutes ?? Infinity;
  const limit = walk && walk === all[0] ? walkMin + 10 : fastest * KEEP_FACTOR + KEEP_EXTRA_MIN;
  const shown = all.filter((o) => o.minutes <= limit);
  // A different mix is worth listing when it's close in time or better in some way: fewer
  // changes or less walking. One that's clearly slower and no better at anything is a
  // detour, not a choice. Only judged against its own kind, though: trains only, buses
  // only, or a mix of both. Whether you'd rather sit on a bus than take the stairs to a
  // platform is yours to choose, so the best of each kind stays.
  const kind = (o) => (o.walkOnly ? "walk" : /^T+$/.test(o.mix) ? "train" : /^B+$/.test(o.mix) ? "bus" : "mixed");
  const facts = new Map(shown.map((o) => [o, { changes: Math.max(0, o.routes.length - 1), walk: walkOf(o) }]));
  const detour = (o) => shown.some((p) => {
    if (p === o || kind(p) !== kind(o)) return false;
    const a = facts.get(o);
    const b = facts.get(p);
    return p.minutes + DETOUR_MIN <= o.minutes && b.changes <= a.changes && b.walk <= a.walk + WALK_SAVING_M;
  });
  return shown.filter((o) => !detour(o)).slice(0, MAX_OPTIONS);
}

const walkOf = (o) => o.legs.filter((l) => l.mode === "walk").reduce((sum, l) => sum + (l.metres || 0), 0);
