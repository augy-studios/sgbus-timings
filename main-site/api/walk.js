// A walking route, for the live map (js/map.js): GET /api/walk?from=lat,lng&to=lat,lng, or a
// cycling one with &mode=cycle.
//
// Answers { distance (metres), minutes, path: [[lat, lng], ...], steps: [{ text, at: [lat,
// lng], distance }], source, roadside?, expressway? }, from OneMap's router, or OSRM's, or a
// straight line, source "line", so the map still points the way. `roadside` is the metres of
// it along a road with no footpath, and `expressway` that it stops short of an expressway
// (api/_lib/foot.js).
//
// The ends are rounded to about 10 m, so routes from much the same place share Vercel's cache.

import { footRoute } from "./_lib/foot.js";
import { rateLimited, storeConfigured } from "./_push/store.js";

const RATE_LIMIT = 60; // routes per IP per minute
const SG = { lat: [1.1, 1.5], lng: [103.5, 104.2] };

function parsePoint(v) {
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(String(v || ""));
  if (!m) return null;
  const lat = Math.round(Number(m[1]) * 1e4) / 1e4;
  const lng = Math.round(Number(m[2]) * 1e4) / 1e4;
  if (lat < SG.lat[0] || lat > SG.lat[1] || lng < SG.lng[0] || lng > SG.lng[1]) return null;
  return { lat, lng };
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

  const out = await footRoute(from, to, { mode: req.query.mode === "cycle" ? "cycle" : "walk" });
  // A real route is the same tomorrow; a straight line is only kept a minute, to try again.
  res.setHeader("Cache-Control", out.source === "line" ? "public, s-maxage=60" : "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(out);
}
