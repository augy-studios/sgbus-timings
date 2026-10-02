// The bus and rail network the nav router rides on, built once per function instance and
// kept while it stays warm.
//
// - Bus routes and stops come from this site's own /api/bus-routes and /api/bus-stops,
//   which the edge caches for a day, so building this costs two cached requests.
// - Rail comes from rail.json, a vendored sgraildata snapshot (scripts/vendor-rail.mjs).
//
// Nodes are bus stops and stations. A run is one vehicle's path, a bus service's direction
// or a train's way along a line, with the minutes ridden to each node. Walks link nodes a
// short way apart: stop to stop, and stop to station measured to the nearest exit.
//
// LTA publishes no journey or train times, so every time is an estimate: buses at the
// planner's ~15 km/h, trains from straight-line distance between stations, plus a wait to
// board and the walk from an exit to the platform. Good for comparing options; OneMap's
// timetable-based router checks the best of them (see router.js).

import { readFileSync } from "node:fs";

const rail = JSON.parse(readFileSync(new URL("./rail.json", import.meta.url), "utf8"));

// Straight-line metres per minute.
export const WALK_M_PER_MIN = 60;
const BUS_M_PER_MIN = 250; // the bus planner's ~15 km/h, stops and bends included
// Set so Jurong East to Tanah Merah, 24 stops on the East-West Line, comes to about the 52
// minutes it takes.
const MRT_M_PER_MIN = 650; // ~39 km/h between stations, after the track's bends
const LRT_M_PER_MIN = 375; // ~22 km/h
const TRAIN_DWELL_MIN = 0.4; // stood at each station on the way
const TRACK_FACTOR = 1.1; // track is longer than the straight line between stations

// Walks between nodes, at most this far.
const STOP_WALK_M = 200;
const STATION_WALK_M = 300;
// From a station's exit to its platform, or back.
export const STATION_ACCESS_MIN = 2;

const LRT_LINES = new Set(["BP", "SK", "PG"]);

export function haversine(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Metres from a point to a node: the nearest exit for a station.
export function metresTo(node, lat, lng) {
  if (node.kind === "station" && node.exits.length) {
    let best = Infinity;
    for (const [elat, elng] of node.exits) best = Math.min(best, haversine(lat, lng, elat, elng));
    return best;
  }
  return haversine(lat, lng, node.lat, node.lng);
}

// The order each line's trains really run in. The station codes give most of it; what they
// can't show is listed here: the Changi Airport shuttle off Tanah Merah, the Circle Line's
// loop through Bayfront back to Promenade, and the LRTs, which loop round from their hub.
// Each comes back as both directions. A line whose codes change in a new snapshot fails
// loudly in `railRuns` rather than routing through a station that isn't there.
//
// Each comes back as { key, label, codes }: `key` tells the services apart (riding one
// into the other is a change of train), `label` is the code a person reads.
function railSequences(line) {
  const num = (c) => Number(c.replace(/^\D+/, ""));
  const pre = (c) => c.replace(/\d+$/, "");
  const sorted = (p) => line.codes.filter((c) => pre(c) === p).sort((a, b) => num(a) - num(b));
  const one = (key, codes, label = line.code) => ({ key, label, codes });
  switch (line.code) {
    case "EW":
      return [one("EW", sorted("EW")), one("CG", [...sorted("CG").reverse(), "EW4"], "CG")];
    case "CC": {
      const cc = sorted("CC");
      return [one("CC", cc.filter((c) => num(c) <= 29)), one("CC6", [...cc.filter((c) => num(c) >= 29), "CC4"])];
    }
    case "BP":
      return [one("BP", [...sorted("BP"), "BP6"])];
    case "SK":
      return [one("SKE", ["STC", ...sorted("SE"), "STC"]), one("SKW", ["STC", ...sorted("SW"), "STC"])];
    case "PG":
      return [one("PGE", ["PTC", ...sorted("PE"), "PTC"]), one("PGW", ["PTC", ...sorted("PW"), "PTC"])];
    default:
      return [one(line.code, sorted(pre(line.codes[0])))];
  }
}

function railRuns(nodes, stationNode) {
  const runs = [];
  for (const line of rail.lines) {
    const speed = LRT_LINES.has(line.code) ? LRT_M_PER_MIN : MRT_M_PER_MIN;
    for (const { key, label, codes: seq } of railSequences(line)) {
      const ids = seq.map((code) => {
        const i = line.codes.indexOf(code);
        if (i === -1) throw new Error(`rail.json: ${line.code} has no station ${code}; update railSequences`);
        return stationNode[line.stops[i]];
      });
      for (const path of [ids, [...ids].reverse()]) {
        const cum = [0];
        for (let i = 1; i < path.length; i++) {
          const a = nodes[path[i - 1]];
          const b = nodes[path[i]];
          cum.push(cum[i - 1] + (haversine(a.lat, a.lng, b.lat, b.lng) * TRACK_FACTOR) / speed + TRAIN_DWELL_MIN);
        }
        runs.push({
          mode: "T",
          key: `T:${key}`,
          route: label,
          name: label === "CG" ? "East-West Line (Changi Airport branch)" : line.name,
          color: line.color,
          lrt: LRT_LINES.has(line.code),
          towards: nodes[path[path.length - 1]].name,
          nodes: path,
          cum,
        });
      }
    }
  }
  return runs;
}

function busRuns(nodes, busNode, payload) {
  const runs = [];
  for (const [serviceNo, dirs] of Object.entries(payload.runs || {})) {
    const info = payload.services?.[serviceNo];
    const firstDir = info ? Object.keys(info.dirs).sort()[0] : null;
    const [origin, dest] = (firstDir && info.dirs[firstDir]) || [];
    const loopOrigin = origin && (info.loop || origin === dest) ? origin : null;
    for (const [dir, run] of Object.entries(dirs)) {
      const codes = [...run.stops];
      // A loop ends where it started, but the route list keeps one row per stop.
      if (loopOrigin && codes[0] === loopOrigin && codes[codes.length - 1] !== loopOrigin) codes.push(loopOrigin);
      const path = codes.map((c) => busNode.get(c)).filter((id) => id != null);
      if (path.length < 2) continue;
      const cum = [0];
      for (let i = 1; i < path.length; i++) {
        const a = nodes[path[i - 1]];
        const b = nodes[path[i]];
        cum.push(cum[i - 1] + haversine(a.lat, a.lng, b.lat, b.lng) / BUS_M_PER_MIN);
      }
      runs.push({ mode: "B", key: `B:${serviceNo}`, route: serviceNo, dir: Number(dir), towards: nodes[path[path.length - 1]].name, nodes: path, cum });
    }
  }
  return runs;
}

// Grid cells of about 330 m, so everything within a walk is in the 3x3 block around a node.
const CELL_DEG = 0.003;
const cellOf = (lat, lng) => `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;

function buildGraph(stopsPayload, routesPayload) {
  const nodes = [];
  const busNode = new Map();
  for (const s of stopsPayload) {
    if (s.la == null || s.lo == null) continue;
    busNode.set(s.c, nodes.length);
    nodes.push({ kind: "stop", code: s.c, name: s.n, road: s.r || "", lat: s.la, lng: s.lo });
  }
  const stationNode = rail.stations.map((s) => {
    nodes.push({ kind: "station", code: s.codes.join("/"), codes: s.codes, name: s.name, lat: s.lat, lng: s.lng, exits: s.exits });
    return nodes.length - 1;
  });

  const runs = [...railRuns(nodes, stationNode), ...busRuns(nodes, busNode, routesPayload)];
  const at = nodes.map(() => []);
  runs.forEach((run, r) => run.nodes.forEach((n, i) => at[n].push([r, i])));

  const grid = new Map();
  nodes.forEach((n, i) => {
    const key = cellOf(n.lat, n.lng);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });

  // Walks: [node, minutes], from every node to those a short way off.
  const walks = nodes.map(() => []);
  nodes.forEach((a, i) => {
    const cx = Math.floor(a.lat / CELL_DEG);
    const cy = Math.floor(a.lng / CELL_DEG);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cx + dx},${cy + dy}`) || []) {
          if (j === i) continue;
          const b = nodes[j];
          if (a.kind === "station" && b.kind === "station") continue; // changes inside the network ride on
          const station = a.kind === "station" ? a : b.kind === "station" ? b : null;
          const metres = station ? metresTo(station, ...(station === a ? [b.lat, b.lng] : [a.lat, a.lng])) : haversine(a.lat, a.lng, b.lat, b.lng);
          if (metres > (station ? STATION_WALK_M : STOP_WALK_M)) continue;
          walks[i].push([j, metres / WALK_M_PER_MIN + (station ? STATION_ACCESS_MIN : 0), metres]);
        }
      }
    }
  });

  return { nodes, runs, at, walks, grid, busNode, stationNode };
}

// Every node within `metres` of a point, nearest first, as [node, metres].
export function nodesNear(graph, lat, lng, metres) {
  const reach = Math.ceil(metres / 330) + 1;
  const cx = Math.floor(lat / CELL_DEG);
  const cy = Math.floor(lng / CELL_DEG);
  const found = [];
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (const i of graph.grid.get(`${cx + dx},${cy + dy}`) || []) {
        const d = metresTo(graph.nodes[i], lat, lng);
        if (d <= metres) found.push([i, d]);
      }
    }
  }
  return found.sort((a, b) => a[1] - b[1]);
}

// ---------- loading, cached for the life of the instance ----------

const TTL_MS = 6 * 3600 * 1000;
let cached = null;
let loading = null;

export async function getGraph(origin) {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.graph;
  if (!loading) {
    loading = (async () => {
      const get = async (path) => {
        const r = await fetch(`${origin}${path}`);
        if (!r.ok) throw new Error(`${path} replied ${r.status}`);
        return r.json();
      };
      const [stops, routes] = await Promise.all([get("/api/bus-stops"), get("/api/bus-routes")]);
      const graph = buildGraph(stops, routes);
      cached = { graph, at: Date.now() };
      return graph;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

// The site's own address, for fetching its other routes from inside a function.
export function originOf(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export { rail, buildGraph };
