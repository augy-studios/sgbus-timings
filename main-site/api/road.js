// The road a bus leg runs along, for the Get Off Alert (js/trip.js): GET
// /api/road?points=lat,lng;lat,lng;... with the leg's stops in order.
//
// A trip only knows a bus leg's stops, and a straight line from one to the next can be a long
// way off the road the bus takes, on an expressway most of all. So the trip asks for the road
// itself, and follows you along it (within 100 m) rather than along the straight lines.
//
// Answers { path: [[lat, lng], ...], stops: [metres along path of each stop], source: "osm" },
// from the car router OpenStreetMap Germany runs on OSRM (routing.openstreetmap.de, free for
// light use with attribution), routed through every stop. If that's down, or its road strays
// so far from the stops it can't be the bus's, { path: null, source: "line" }, and the trip
// goes by the straight lines.

import { rateLimited, storeConfigured } from "./_push/store.js";

const RATE_LIMIT = 30; // roads per IP per minute
const SG = { lat: [1.1, 1.5], lng: [103.5, 104.2] };
const MAX_POINTS = 120;
const OSRM = "https://routing.openstreetmap.de/routed-car/route/v1/driving";
// A stop the router had to move further than this to reach a road isn't on one it knows.
const SNAP_M = 150;
// Between two stops, a road longer than this many times the straight line, plus DETOUR_M, is
// a wrong turn of the router's (a stop put on the far carriageway), not the bus's way.
const DETOUR = 2.5;
const DETOUR_M = 1500;

function parsePoints(v) {
  const parts = String(v || "").split(";");
  if (parts.length < 2 || parts.length > MAX_POINTS) return null;
  const out = [];
  for (const part of parts) {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(part);
    if (!m) return null;
    const lat = Math.round(Number(m[1]) * 1e5) / 1e5;
    const lng = Math.round(Number(m[2]) * 1e5) / 1e5;
    if (lat < SG.lat[0] || lat > SG.lat[1] || lng < SG.lng[0] || lng > SG.lng[1]) return null;
    out.push([lat, lng]);
  }
  return out;
}

function metres(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const round5 = ([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5];

// OSRM's answer as the road, or null if it can't be the bus's.
function fromOsrm(data, points) {
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  const legs = route?.legs;
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(legs) || legs.length !== points.length - 1) return null;
  if ((data.waypoints || []).some((w) => !(w?.distance <= SNAP_M))) return null;
  for (let i = 0; i < legs.length; i++) {
    if (!(legs[i].distance <= metres(points[i], points[i + 1]) * DETOUR + DETOUR_M)) return null;
  }
  const path = coords.map(([lng, lat]) => round5([lat, lng]));
  let length = 0;
  for (let i = 1; i < path.length; i++) length += metres(path[i - 1], path[i]);
  // Where each stop is along the path: OSRM's own distances between them, scaled to the
  // path's length as measured here, so the two agree.
  const total = legs.reduce((sum, l) => sum + l.distance, 0) || 1;
  const stops = [0];
  let at = 0;
  for (const l of legs) {
    at += l.distance;
    stops.push(Math.round((at / total) * length));
  }
  return { path, stops, source: "osm" };
}

export default async function handler(req, res) {
  const points = parsePoints(req.query.points);
  if (!points) return res.status(400).json({ error: `points must be 2 to ${MAX_POINTS} lat,lng pairs in Singapore, split by ;` });

  if (storeConfigured()) {
    const ip = req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    try {
      if (await rateLimited(`road:${ip}`, RATE_LIMIT)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
    } catch { /* the limit's a nicety; the road still goes */ }
  }

  let road = null;
  try {
    const r = await fetch(`${OSRM}/${points.map(([lat, lng]) => `${lng},${lat}`).join(";")}?overview=full&geometries=geojson`, {
      headers: { "user-agent": "sgbus-timings (https://sgbus.uwuapps.org)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`OSRM responded ${r.status}`);
    road = fromOsrm(await r.json(), points);
  } catch (err) {
    console.warn(`[road] OSRM: ${err.message}`);
  }
  // A bus's road is the same tomorrow; none is only kept a minute, to try again.
  res.setHeader("Cache-Control", road ? "public, s-maxage=2592000, stale-while-revalidate=604800" : "public, s-maxage=60");
  return res.status(200).json(road || { path: null, source: "line" });
}
