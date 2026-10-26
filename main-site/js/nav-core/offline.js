// Navigate's Bus and train planned on the phone, with no connection (js/nav.js, planOnPhone):
// the same graph and router /api/nav uses (network.js, plan.js, via.js), built from what the
// phone already keeps. The bus stops come from the page's stops index (script.js), the bus
// routes from /api/bus-routes, which the service worker keeps (sw.js), and the trains from
// data/rail.json, precached with the app.
//
// What the server adds and this can't is left out: OneMap's timetable-based check, the traffic
// right now, last bus warnings, walking or cycling the whole way, and LTA's train disruptions.
// Every way is marked `offline`, and its times are the router's estimates.
//
// Runs in js/nav-worker.js, or in the page where a module worker can't start.

import { buildGraph } from "./network.js";
import { planFor, planViaFor } from "./plan.js";
import { joinWays } from "./via.js";
import { readWhen } from "./when.js";

const ROUTES_URL = "/api/bus-routes";
const RAIL_URL = "/data/rail.json";

let stops = null; // the stops index's stops, as /api/bus-stops sends them
let payloads = null; // { rail, routes }, once both are in
let loading = null;
// The graph, built once per stops index and kept: { public, open } (Restricted areas on), each
// built the first time it's needed. `ms` is how long the last build took.
let graphs = {};
let lastBuildMs = null;

// The page's stops index (script.js, ensureStopsIndex: code -> { n, road, lat, lng }), as the
// rows /api/bus-stops has them, which buildGraph reads.
export function setStops(index) {
  stops = Object.entries(index || {}).map(([c, s]) => ({ c, n: s.n, r: s.road || "", la: s.lat, lo: s.lng }));
  graphs = {};
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} replied ${r.status}`);
  return r.json();
}

// Shared by every caller; a failed load is tried again next time.
function load() {
  loading ??= Promise.all([getJson(RAIL_URL), getJson(ROUTES_URL)])
    .then(([rail, routes]) => {
      payloads = { rail, routes };
      graphs = {};
    })
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

function graphFor(open) {
  const key = open ? "open" : "public";
  if (!graphs[key]) {
    const t0 = performance.now();
    graphs[key] = buildGraph(payloads.rail, stops, payloads.routes, { open });
    lastBuildMs = Math.round(performance.now() - t0);
  }
  return graphs[key];
}

// Loads what's needed and builds the graph ahead of the first plan, so it's quick.
export async function warm({ open = false } = {}) {
  await load();
  if (stops?.length) graphFor(open);
  return { buildMs: lastBuildMs };
}

// The ways from `from` to `to` (and by `via`, a stop on the way, if given), each a point
// { lat, lng }, at `when` ({ mode: "leave" | "arrive", at } or null for Leave now), as /api/nav
// answers them. `open` is Settings' Restricted areas and `customs` its Immigration time in
// minutes (null for by the time of day), and `now` the page's clock. Throws with a message to
// show when it can't.
export async function planOffline({ from, to, via = null, when = null, open = false, customs = null, now = Date.now() }) {
  if (!stops?.length) throw new Error("The bus stops aren't saved on this phone yet. Open the app once with a connection.");
  try {
    await load();
  } catch {
    throw new Error("The bus routes aren't saved on this phone yet. Open the app once with a connection, then Bus and train plans offline.");
  }
  const at = readWhen(when?.mode, when?.at, now);
  if (!at) throw new Error("Pick a time like 08:30.");
  const own = [15, 30, 45, 60].includes(customs) ? customs : null;
  const graph = graphFor(open);
  const t0 = performance.now();
  let options;
  if (via) {
    const { first, second, fits } = planViaFor(graph, from, via, to, at, own);
    options = joinWays(first.options, second.options, via, { fits });
  } else {
    options = planFor(graph, from, to, at, own).options;
  }
  for (const o of options) o.offline = true;
  return {
    options,
    onemap: false,
    alerts: { lines: [] },
    when: { mode: at.mode, ms: at.ms },
    traffic: null,
    others: {},
    ...(via && { via: { lat: via.lat, lng: via.lng } }),
    offline: true,
    // How long building the graph (the last time it was built) and planning took, in ms.
    timing: { buildMs: lastBuildMs, planMs: Math.round(performance.now() - t0) },
  };
}
