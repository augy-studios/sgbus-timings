// Live road traffic from LTA DataMall, for timing buses by it rather than at a flat speed:
// Traffic Speed Bands (every road link's speed, about every 5 minutes) and Traffic Incidents
// (accidents, breakdowns and roadworks, with where they are).
//
// The speed bands are tens of thousands of links, paged 500 at a time, far too many to fetch
// per request. So refreshTraffic() fetches them all from a cron (api/traffic.js, every 5
// minutes), sums them up into grid cells of about 330 m, and keeps that in Redis with the
// incidents. getTraffic() reads it back, kept in memory for a minute.
//
// Each cell holds how its roads are flowing: the links' speed over the free-flow speed for
// their kind of road (an expressway 70 km/h, a small road 30), weighted by length, 1 when
// they're flowing freely, and the road slowest there, by name, to say where the traffic is.
// Only cells below FREE are kept, as [flow, road]; the rest count as 1.
//
// A bus doesn't slow as much as the traffic does: part of its time is spent at stops, and
// some roads have bus lanes. So a bus's minutes on a stretch are multiplied by busFactor(),
// 1 in free-flowing traffic up to MAX_FACTOR in a jam.

import { redis, storeConfigured } from "../_push/store.js";

const BASE = "https://datamall2.mytransport.sg/ltaodataservice";
const KEY = "sgbus:traffic";
// Newest first: DataMall has moved the feed on before (Band to SpeedBand, v3 to v4).
const SPEED_PATHS = ["/v4/TrafficSpeedBands", "/v3/TrafficSpeedBands", "/TrafficSpeedBandsv2"];
const PAGE = 500;
const PARALLEL = 12;
const MAX_LINKS = 200000;
// Older than this and it's not live traffic any more.
const STALE_MS = 20 * 60 * 1000;
// It's refreshed every 5 minutes, so an instance asks the store at most this often: it's
// 100 KB or so a read.
const MEMO_MS = 4 * 60 * 1000;

export const CELL_DEG = 0.003;
const cellKey = (lat, lng) => `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;
const FREE = 0.95;
const MAX_FACTOR = 1.6;
const SLOWING = 0.6;

// Free-flow km/h by RoadCategory, which DataMall has given as letters and as numbers.
const FREE_KMH = { A: 70, 1: 70, B: 50, 2: 50, C: 45, 3: 45, D: 40, 4: 40, E: 30, 5: 30, F: 40, 6: 40, G: 35, 8: 35 };

function metres(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function get(path, accountKey) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { AccountKey: accountKey, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`LTA ${path} replied ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.value) ? data.value : [];
}

// Every link, from the first of SPEED_PATHS that answers with any.
async function speedLinks(accountKey) {
  for (const path of SPEED_PATHS) {
    let first;
    try {
      first = await get(`${path}?$skip=0`, accountKey);
    } catch {
      continue;
    }
    if (!first.length) continue;
    const links = [...first];
    let skip = PAGE;
    let done = first.length < PAGE;
    while (!done && skip < MAX_LINKS) {
      const pages = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => get(`${path}?$skip=${skip + i * PAGE}`, accountKey).catch(() => [])));
      for (const p of pages) {
        links.push(...p);
        if (p.length < PAGE) done = true;
      }
      skip += PARALLEL * PAGE;
    }
    return links;
  }
  throw new Error("no Traffic Speed Bands feed answered");
}

// A link's speed in km/h: the middle of its band's range, or of the band itself.
function speedOf(link) {
  const min = Number(link.MinimumSpeed);
  const max = Number(link.MaximumSpeed);
  if (Number.isFinite(min) && Number.isFinite(max) && max > min && max < 200) return (min + max) / 2;
  if (Number.isFinite(min) && min > 0) return min + 5;
  const band = Number(link.SpeedBand);
  return Number.isFinite(band) && band > 0 ? (band >= 8 ? 75 : (band - 1) * 10 + 5) : null;
}

// The links summed up into cells: { "x,y": flow } for each cell flowing below FREE.
function cellsOf(links) {
  const sums = new Map();
  for (const link of links) {
    const a = [Number(link.StartLat), Number(link.StartLon)];
    const b = [Number(link.EndLat), Number(link.EndLon)];
    const speed = speedOf(link);
    if (![...a, ...b].every(Number.isFinite) || speed == null) continue;
    const free = FREE_KMH[String(link.RoadCategory ?? "").trim()] ?? 35;
    const flow = Math.max(0.1, Math.min(1, speed / free));
    const len = Math.max(1, metres(a, b));
    const key = cellKey((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const s = sums.get(key) || { w: 0, f: 0, roads: new Map() };
    s.w += len;
    s.f += flow * len;
    // The road losing the most there: its length times how far below free-flow it is.
    const road = String(link.RoadName || "").trim();
    if (road) s.roads.set(road, (s.roads.get(road) || 0) + len * (1 - flow));
    sums.set(key, s);
  }
  const cells = {};
  for (const [key, { w, f, roads }] of sums) {
    const flow = f / w;
    if (flow >= FREE) continue;
    const road = [...roads].sort((x, y) => y[1] - x[1])[0]?.[0] || "";
    cells[key] = [Math.round(flow * 100) / 100, titleRoad(road)];
  }
  return cells;
}

// "BEDOK NORTH ROAD" as "Bedok North Road", with expressways' short names kept: "PIE".
const titleRoad = (s) => s.toLowerCase().replace(/[a-z]/g, (c) => c.toUpperCase()).replace(/(Pie|Cte|Aye|Ecp|Kje|Kpe|Mce|Sle|Tpe|Bke|Nsc)/g, (x) => x.toUpperCase());

// Every incident, with where it is: { type, message, lat, lng }.
async function incidents(accountKey) {
  const rows = await get("/TrafficIncidents", accountKey);
  return rows
    .map((i) => ({ type: String(i.Type || "Incident").trim(), message: String(i.Message || "").trim(), lat: Number(i.Latitude), lng: Number(i.Longitude) }))
    .filter((i) => i.message && Number.isFinite(i.lat) && Number.isFinite(i.lng));
}

// Fetches both feeds and keeps them, for the cron. Answers what it kept, in numbers.
export async function refreshTraffic(accountKey) {
  const [links, found] = await Promise.all([speedLinks(accountKey), incidents(accountKey).catch(() => [])]);
  const traffic = { at: Date.now(), cells: cellsOf(links), incidents: found };
  if (storeConfigured()) await redis("SET", KEY, JSON.stringify(traffic), "EX", String(Math.round(STALE_MS / 1000)));
  memo = { traffic, at: Date.now() };
  return { links: links.length, slowCells: Object.keys(traffic.cells).length, incidents: found.length };
}

let memo = null;

// The traffic as last kept, or null if there's none recent: buses then go at the flat speed.
export async function getTraffic() {
  if (!memo || Date.now() - memo.at > MEMO_MS) {
    let traffic = null;
    try {
      traffic = storeConfigured() ? JSON.parse((await redis("GET", KEY)) || "null") : null;
    } catch (err) {
      console.warn("traffic: couldn't read it:", err.message);
    }
    memo = { traffic, at: Date.now() };
  }
  const t = memo.traffic;
  return t && Date.now() - t.at < STALE_MS ? t : null;
}

// How much longer a bus takes for the flow in a cell: 1 when free, up to MAX_FACTOR.
export const busFactor = (flow) => Math.min(MAX_FACTOR, 1 + SLOWING * (1 - Math.min(1, flow)));

// A cell's [flow, road], or [1, ""] where the roads are clear. Older copies kept the flow alone.
function cellAt(traffic, [lat, lng]) {
  const c = traffic.cells[cellKey(lat, lng)];
  return c == null ? [1, ""] : Array.isArray(c) ? c : [c, ""];
}
const flowAt = (traffic, p) => cellAt(traffic, p)[0];

// How the roads flow between two places, [lat, lng]: at each end and halfway, 1 when clear.
export function segmentFlow(traffic, a, b) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return (flowAt(traffic, a) + flowAt(traffic, mid) + flowAt(traffic, b)) / 3;
}

// A bus's factor between two places: how much longer than usual it takes there.
export const segmentFactor = (traffic, a, b) => busFactor(segmentFlow(traffic, a, b));

// The roads slowest along a path, worst first, by name: what to say the traffic is on.
export function slowRoads(traffic, path, { max = 2, below = 0.7 } = {}) {
  const loss = new Map();
  for (const p of path || []) {
    const [flow, road] = cellAt(traffic, p);
    if (road && flow < below) loss.set(road, (loss.get(road) || 0) + (1 - flow));
  }
  return [...loss].sort((a, b) => b[1] - a[1]).slice(0, max).map(([road]) => road);
}

// The incidents within `within` metres of a path, [[lat, lng], ...]: its points and halfway
// between them.
export function incidentsNear(traffic, path, within = 200) {
  if (!traffic?.incidents?.length || !(path?.length >= 1)) return [];
  const pts = path.flatMap((p, i) => (i ? [[(p[0] + path[i - 1][0]) / 2, (p[1] + path[i - 1][1]) / 2], p] : [p]));
  return traffic.incidents.filter((inc) => pts.some((p) => metres(p, [inc.lat, inc.lng]) <= within));
}
