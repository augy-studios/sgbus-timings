// The shuttle buses in Navigate (Augy, 1 November 2026): NUS's and NTU's internal buses, and the
// island's others (data/campus/shuttles.json: IKEA's, Changi Airport's, KKH's, Mandai's and so
// on), as runs in the router's graph (network.js), so a way can start at PGP or end at IKEA, or
// ride a shuttle to a public bus or train. Built from the same files and the same reading of
// them as Bus timings' (data/campus/*.json, js/campus.js, whose build and status are used here
// as they are).
//
// Each run says what it costs and who may ride it (`campus.fare`, `campus.access`), for
// rideable(): a paid one only with Settings' Shuttle buses on Free and paid, and a hotel's or a
// condo's only on a way that starts or ends at it (PLACE_M).
//
// Neither university publishes live times, so the wait to board is the mean wait, half the gap
// between buses at that time (meanWait): a band's "every 8 to 10 min" waits 4.5, a timetable's
// departures half their average gap. A route not running then is never boarded; one starting
// within START_GRACE_MIN is waited for. Between stops, ~15 km/h (CAMPUS_M_PER_MIN), the middle
// of the 12 to 18 km/h shuttles keep to.
//
// An ES module, as the rest of nav-core: on the server (api/_nav/network.js reads the files) and
// on the phone (offline.js fetches them; sw.js keeps them). js/campus.js is a plain script, so
// it's loaded here for what it sets on globalThis, where the page hasn't already.

if (!globalThis.Campus) await import("../campus.js");
const Campus = globalThis.Campus;

const CAMPUS_M_PER_MIN = 250;
const START_GRACE_MIN = 15;
// A way starts or ends at a hotel or a condo when it's within this of one of its own stops.
const PLACE_M = 300;

const haversine = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// The shuttles' runs, and the campus stops LTA hasn't got as nodes of their own. `files` is
// { nus, ntu, config, shuttles }; `nodes` and `busNode` are network.js's, added to; `crossings`
// its hops across the Causeway, "46101>46211": "out", for TS1's immigration. Returns the runs.
export function campusRuns(files, nodes, busNode, crossings = {}) {
  if (!files?.nus && !files?.ntu) return [];
  const lta = {};
  for (const [code, id] of busNode) {
    const n = nodes[id];
    lta[code] = { n: n.name, road: n.road, lat: n.lat, lng: n.lng };
  }
  const model = Campus.build(files, lta);
  const nodeOf = new Map();
  const node = (key) => {
    if (!key) return null;
    if (nodeOf.has(key)) return nodeOf.get(key);
    const s = model.stops.get(key);
    let id = s?.lta ? busNode.get(key) : null;
    if (id == null && s) {
      id = nodes.length;
      nodes.push({ kind: "stop", code: key, name: s.name, road: s.road || "", lat: s.lat, lng: s.lng, campus: s.uni });
    }
    nodeOf.set(key, id ?? null);
    return id ?? null;
  };
  const runs = [];
  for (const route of model.routes) {
    // Each stop's place on the route, for its times (Campus.status), with the node it's at.
    const stops = route.keys.map((k, i) => [node(k), i]).filter(([id]) => id != null);
    if (stops.length < 2) continue;
    const path = stops.map(([id]) => id);
    const speed = route.kmh ? (route.kmh * 1000) / 60 : CAMPUS_M_PER_MIN;
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(nodes[path[i - 1]], nodes[path[i]]) / speed);
    const cross = [];
    for (let i = 1; i < path.length; i++) {
      const way = crossings[`${nodes[path[i - 1]].code}>${nodes[path[i]].code}`];
      if (way) cross.push([i, way]);
    }
    const place = route.place.map((k) => model.stops.get(k)).filter(Boolean).map((s) => ({ lat: s.lat, lng: s.lng }));
    runs.push({
      mode: "B",
      key: `C:${route.key}`,
      route: route.code,
      campus: {
        uni: route.uni,
        name: model.config?.[route.uni]?.name || route.uni.toUpperCase(),
        colour: route.colour,
        label: route.name,
        fare: route.fare,
        fareText: route.fareText,
        access: route.access,
        place,
      },
      towards: nodes[path[path.length - 1]].name,
      nodes: path,
      cum,
      cross,
      // Where each node is on the route as the files have it, for its timetable.
      at: stops.map(([, i]) => i),
      shuttle: route,
    });
  }
  runs.config = model.config;
  return runs;
}

// Whether `run` may be ridden on a way from `from` to `to` (each { lat, lng }): anything but a
// shuttle; a paid shuttle only with `paid` (Settings' Shuttle buses on Free and paid); a hotel's
// or a condo's only from or to it.
export function rideable(run, from, to, { paid = false } = {}) {
  const c = run.campus;
  if (!c) return true;
  if (c.fare === "paid" && !paid) return false;
  if (c.access && c.access !== "public") return c.place.some((p) => haversine(p, from) <= PLACE_M || haversine(p, to) <= PLACE_M);
  return true;
}

// The mean wait to board `run` at its i-th node at the moment `ms`, in minutes, or null when it
// isn't running then. `isHoliday(ymd)` as when.js has the public holidays.
export function meanWait(run, i, ms, config, isHoliday) {
  const st = Campus.status(run.shuttle, run.at[i], ms, { config, isHoliday });
  if (st.state === "every") return (st.min + st.max) / 4;
  if (st.state === "departs") {
    const gaps = [];
    for (let k = 1; k < st.times.length; k++) gaps.push(st.times[k] - st.times[k - 1]);
    // The last departures of the day: as long as the wait for the next one.
    if (!gaps.length) return Math.max(0, st.times[0] - Campus.sgDay(ms).min);
    return gaps.reduce((a, b) => a + b, 0) / gaps.length / 2;
  }
  if (st.state === "first" || st.state === "gap") {
    const until = st.at - Campus.sgDay(ms).min;
    return until <= START_GRACE_MIN ? until + (st.min + st.max) / 4 : null;
  }
  return null;
}
