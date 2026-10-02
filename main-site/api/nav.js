// Point-to-point journeys by bus and train: GET /api/nav?from=lat,lng&to=lat,lng.
//
// Answers { options: [...], alerts: { lines } }, each option { minutes, mix, routes, legs,
// onemapMinutes?, source? }, quickest first. The router is _nav/router.js; OneMap checks its
// options (_nav/onemap-check.js); train legs on a line LTA reports as disrupted are flagged.
//
// The Telegram bot's /nav calls this too, with BOT_API_TOKEN, so the two always agree.

import { fetchTrainAlerts } from "./_push/lta.js";
import { rateLimited, storeConfigured } from "./_push/store.js";
import { getGraph, originOf } from "./_nav/network.js";
import { plan } from "./_nav/router.js";
import { checkWithOneMap } from "./_nav/onemap-check.js";

const RATE_LIMIT = 30; // navs per IP per minute

// LTA's line codes in TrainServiceAlerts, to the router's. The Changi Airport branch is
// part of the East-West Line, so trouble on one is flagged on both.
const LTA_LINES = {
  EWL: ["EW", "CG"], CGL: ["CG"], NSL: ["NS"], NEL: ["NE"], CCL: ["CC"], DTL: ["DT"], TEL: ["TE"],
  BPL: ["BP"], STL: ["SK"], SKL: ["SK"], PTL: ["PG"], PGL: ["PG"],
};

// Singapore, roughly: a point outside it is a mistake, not a journey.
const inSingapore = ({ lat, lng }) => lat > 1.15 && lat < 1.48 && lng > 103.55 && lng < 104.1;

function point(text) {
  const [lat, lng] = String(text || "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const from = point(req.query.from);
  const to = point(req.query.to);
  if (!from || !to) return res.status(400).json({ error: "from and to must be lat,lng" });
  if (!inSingapore(from) || !inSingapore(to)) return res.status(400).json({ error: "Both ends have to be in Singapore" });

  const bot = process.env.BOT_API_TOKEN && req.headers.authorization === `Bearer ${process.env.BOT_API_TOKEN}`;
  if (!bot && storeConfigured()) {
    const ip = req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    try {
      if (await rateLimited(`nav:${ip}`, RATE_LIMIT)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
    } catch {}
  }

  try {
    const [graph, alerts] = await Promise.all([
      getGraph(originOf(req)),
      process.env.LTA_ACCOUNT_KEY ? fetchTrainAlerts(process.env.LTA_ACCOUNT_KEY).catch(() => null) : null,
    ]);
    const ours = plan(graph, from, to);
    const { options, checked } = await checkWithOneMap(ours, from, to);

    // Lines LTA reports trouble on, as the router's line codes.
    const disrupted = new Set((alerts?.AffectedSegments || []).flatMap((s) => LTA_LINES[s.Line] || []));
    for (const o of options) {
      for (const leg of o.legs) if (leg.mode === "train" && disrupted.has(leg.route)) leg.disrupted = true;
      o.disrupted = o.legs.some((l) => l.disrupted);
    }

    return res.status(200).json({ options, onemap: checked, alerts: { lines: [...disrupted] } });
  } catch (err) {
    console.error("nav failed:", err);
    return res.status(502).json({ error: "Couldn't plan that right now. Please try again." });
  }
}
