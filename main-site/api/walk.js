// A walking route, for the live map (js/map.js): GET /api/walk?from=lat,lng&to=lat,lng.
//
// Answers { distance (metres), minutes, path: [[lat, lng], ...], steps: [{ text, at: [lat,
// lng], distance }], source }, from OneMap's walking router (api/_lib/onemap.js), or, if that's
// down or not set up, the walking router OpenStreetMap Germany runs on OSRM
// (routing.openstreetmap.de, free for light use with attribution). With neither, a straight
// line, source "line", so the map still points the way.
//
// The ends are rounded to about 10 m, so walks from much the same place share Vercel's cache.

import { walkRoute } from "./_lib/onemap.js";
import { rateLimited, storeConfigured } from "./_push/store.js";

const RATE_LIMIT = 60; // routes per IP per minute
const SG = { lat: [1.1, 1.5], lng: [103.5, 104.2] };
// Walking pace for the straight line: 4.8 km/h, and a fifth more for the corners.
const PACE_M_PER_MIN = 80;
const DETOUR = 1.2;
const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

function parsePoint(v) {
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(String(v || ""));
  if (!m) return null;
  const lat = Math.round(Number(m[1]) * 1e4) / 1e4;
  const lng = Math.round(Number(m[2]) * 1e4) / 1e4;
  if (lat < SG.lat[0] || lat > SG.lat[1] || lng < SG.lng[0] || lng > SG.lng[1]) return null;
  return { lat, lng };
}

function metres(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Google's encoded polyline, precision 5, to [[lat, lng], ...].
function decodePolyline(str) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

const titleCase = (s) => String(s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const round5 = ([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5];

// OneMap's answer: route_geometry, route_instructions as rows of [direction, road, metres,
// "lat,lng", seconds, ..., instruction text last], and route_summary's totals.
function fromOneMap(data) {
  if (typeof data?.route_geometry !== "string" || !data.route_geometry) return null;
  const path = decodePolyline(data.route_geometry);
  if (path.length < 2) return null;
  const steps = (Array.isArray(data.route_instructions) ? data.route_instructions : []).map((r) => {
    if (!Array.isArray(r)) return null;
    const at = typeof r[3] === "string" ? r[3].split(",").map(Number) : null;
    const said = r.slice(5).reverse().find((x) => typeof x === "string" && x.split(" ").length >= 3);
    const text = said ? titleCase(said).replace(/\bOn\b/g, "on").replace(/\bAlong\b/g, "along").replace(/\bInto\b/g, "into")
      : `${titleCase(r[0] || "Continue")}${r[1] ? ` along ${titleCase(r[1])}` : ""}`;
    return { text, at: at && at.every(Number.isFinite) ? at : null, distance: Number(r[2]) || 0 };
  }).filter((s) => s?.at);
  const sum = data.route_summary || {};
  const distance = Number(sum.total_distance) || 0;
  return { distance, minutes: Math.max(1, Math.round((Number(sum.total_time) || distance / 1.3) / 60)), path, steps, source: "onemap" };
}

const TURNS = {
  left: "Turn left", right: "Turn right", "slight left": "Bear left", "slight right": "Bear right",
  "sharp left": "Turn sharp left", "sharp right": "Turn sharp right", straight: "Go straight", uturn: "Turn around",
};

// OSRM's answer, its steps put into words.
function fromOsrm(data) {
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const steps = (route.legs?.[0]?.steps || []).map((s) => {
    const m = s.maneuver || {};
    const road = s.name ? ` onto ${s.name}` : "";
    let text;
    if (m.type === "depart") text = `Head ${s.name ? `along ${s.name}` : "off"}`;
    else if (m.type === "arrive") text = "You've arrived";
    else if (m.type === "roundabout" || m.type === "rotary") text = `At the roundabout, take exit ${m.exit || 1}${road}`;
    else text = `${TURNS[m.modifier] || "Continue"}${road}`;
    return { text, at: [m.location?.[1], m.location?.[0]], distance: Math.round(s.distance || 0) };
  }).filter((s) => s.at.every(Number.isFinite));
  return {
    distance: Math.round(route.distance || 0),
    // OSRM's foot profile walks at 5 km/h; a little slower allows for crossings.
    minutes: Math.max(1, Math.round(((route.distance || 0) / PACE_M_PER_MIN))),
    path: coords.map(([lng, lat]) => [lat, lng]),
    steps,
    source: "osm",
  };
}

async function osrm(from, to) {
  const r = await fetch(`${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`, {
    headers: { "user-agent": "sgbus-timings (https://sgbus.uwuapps.org)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`OSRM responded ${r.status}`);
  return fromOsrm(await r.json());
}

function straight(from, to) {
  const d = metres([from.lat, from.lng], [to.lat, to.lng]);
  return {
    distance: Math.round(d * DETOUR),
    minutes: Math.max(1, Math.round((d * DETOUR) / PACE_M_PER_MIN)),
    path: [[from.lat, from.lng], [to.lat, to.lng]],
    steps: [],
    source: "line",
  };
}

export default async function handler(req, res) {
  const from = parsePoint(req.query.from);
  const to = parsePoint(req.query.to);
  if (!from || !to) return res.status(400).json({ error: "from and to must be lat,lng in Singapore" });

  if (storeConfigured()) {
    const ip = req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    try {
      if (await rateLimited(`walk:${ip}`, RATE_LIMIT)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
    } catch { /* the limit's a nicety; the route still goes */ }
  }

  let route = null;
  try {
    route = fromOneMap(await walkRoute(from, to));
  } catch (err) {
    console.warn(`[walk] OneMap: ${err.message}`);
  }
  if (!route) {
    try {
      route = await osrm(from, to);
    } catch (err) {
      console.warn(`[walk] OSRM: ${err.message}`);
    }
  }
  const out = route || straight(from, to);
  out.path = out.path.map(round5);
  // A real route is the same tomorrow; a straight line is only kept a minute, to try again.
  res.setHeader("Cache-Control", out.source === "line" ? "public, s-maxage=60" : "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(out);
}
