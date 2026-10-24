// Live traffic, two ways:
//
// - From Vercel Cron, every 5 minutes (vercel.json), with CRON_SECRET: fetches LTA's Traffic
//   Speed Bands and Traffic Incidents afresh and keeps them (api/_lib/traffic.js).
// - GET /api/traffic?points=lat,lng;lat,lng;... from a trip (js/trip.js), a bus leg's stops in
//   order, or its road's points: answers { at, flows, factors, roads, incidents }. For each
//   stretch from one point to the next, `flows` is how freely the roads there flow (1 clear,
//   below 0.7 slow, below 0.4 jammed: the live map's orange and red) and `factors` how much
//   longer than usual a bus takes on it. `roads` names the slowest roads along it, worst
//   first, and `incidents` are those near it, { type, message, lat, lng }. With no live
//   traffic kept, { at: null } and every stretch clear.

import { busFactor, getTraffic, incidentsNear, refreshTraffic, segmentFlow, slowRoads } from "./_lib/traffic.js";
import { rateLimited, storeConfigured } from "./_push/store.js";

const RATE_LIMIT = 30; // per IP per minute
const SG = { lat: [1.1, 1.5], lng: [103.5, 104.2] };
const MAX_POINTS = 120;

function parsePoints(v) {
  const parts = String(v || "").split(";");
  if (parts.length < 2 || parts.length > MAX_POINTS) return null;
  const out = [];
  for (const part of parts) {
    const [lat, lng] = part.split(",").map(Number);
    if (!(lat > SG.lat[0] && lat < SG.lat[1] && lng > SG.lng[0] && lng < SG.lng[1])) return null;
    out.push([lat, lng]);
  }
  return out;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization === `Bearer ${secret}`) {
    if (!process.env.LTA_ACCOUNT_KEY) return res.status(500).json({ error: "LTA_ACCOUNT_KEY isn't set" });
    try {
      return res.status(200).json(await refreshTraffic(process.env.LTA_ACCOUNT_KEY));
    } catch (err) {
      console.error("traffic refresh failed:", err);
      return res.status(502).json({ error: err.message });
    }
  }

  const points = parsePoints(req.query.points);
  if (!points) return res.status(400).json({ error: `points must be 2 to ${MAX_POINTS} lat,lng pairs in Singapore, split by ;` });
  if (storeConfigured()) {
    const ip = req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    try {
      if (await rateLimited(`traffic:${ip}`, RATE_LIMIT)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
    } catch { /* the limit's a nicety */ }
  }
  const traffic = await getTraffic();
  const round = (x) => Math.round(x * 100) / 100;
  const flows = points.slice(1).map((p, i) => (traffic ? round(segmentFlow(traffic, points[i], p)) : 1));
  res.setHeader("Cache-Control", "public, s-maxage=120");
  return res.status(200).json({
    at: traffic?.at ?? null,
    flows,
    factors: flows.map((f) => round(busFactor(f))),
    roads: traffic ? slowRoads(traffic, points) : [],
    incidents: traffic ? incidentsNear(traffic, points) : [],
  });
}
