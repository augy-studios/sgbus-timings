// A shuttle bus's next arrival at a stop, live, for the shuttles whose operator shows them on a
// tracker (Augy, 2 November 2026): GET /api/shuttle-live?route=ikea:IKEA%20T&stop=ikea-tampines
//
//   { eta: minutes till the next bus (0 for arriving), or null with none coming,
//     buses: [[lat, lng], ...] where the route's buses are now, at: when it was read }
//
// Leisure Frontier runs IKEA Tampines' shuttles and the Novotel and Mercure on Stevens' (and
// Marina Square's), and each stop has a page on its tracker (leisurefrontier.solo-cloud.com,
// "locatebus.php"), the one the QR code on each shuttle's timetable opens: the stop's next bus
// in minutes and the buses on a map, drawn into the page. There's no API, so the page is read
// as it is (readPage), and anything it can't read is said as none coming, never an error the
// page shows: Bus timings keeps the timetable's times either way (js/campus.js, live).
//
// Only the stops data/campus/shuttles.json lists under a route's `live` can be asked for, so
// this fetches nothing else. Cached 15 s at the edge, as the tracker's own page refreshes
// every 10 s, so however many ask, the tracker sees a request a stop every 15 s at most.

import { readFileSync } from "node:fs";

const shuttles = JSON.parse(readFileSync(new URL("../data/campus/shuttles.json", import.meta.url), "utf8"));
const PROVIDERS = {
  leisurefrontier: (param) => `https://leisurefrontier.solo-cloud.com/ext/locatebus.php?param=${encodeURIComponent(param)}`,
};
const TIMEOUT_MS = 6000;

// The tracker's param for a route ("group:id") at a stop, and which tracker, or null.
function trackerFor(routeKey, stop) {
  const [group, ...rest] = String(routeKey || "").split(":");
  const id = rest.join(":");
  const route = shuttles.groups?.[group]?.routes?.find((r) => String(r.id) === id);
  const param = route?.live?.stops?.[stop];
  const url = param && PROVIDERS[route.live.provider]?.(param);
  return url ? { url } : null;
}

// The stop's page, read: its next bus ("4<i>mins</i>", "-" with none), and each marker on the
// map that isn't a stop (a stop's marker is given its _stopId straight after) or you.
export function readPage(html) {
  const eta = /eta-route[\s\S]*?<span[^>]*>\s*(\d+|-)\s*<i/.exec(html)?.[1];
  const buses = [];
  const re = /L\.marker\(\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\)/g;
  let m;
  while ((m = re.exec(html))) {
    // Up to the next marker: a stop's says its _stopId there.
    const rest = html.slice(re.lastIndex);
    const own = rest.slice(0, rest.search(/L\.marker\(/) === -1 ? 600 : rest.search(/L\.marker\(/));
    if (/_stopId/.test(own)) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (lat > 1.1 && lat < 1.5 && lng > 103.5 && lng < 104.2) buses.push([lat, lng]);
  }
  return { eta: eta && eta !== "-" ? Number(eta) : null, buses };
}

export default async function handler(req, res) {
  const tracker = trackerFor(req.query.route, req.query.stop);
  if (!tracker) return res.status(404).json({ error: "No live times for that shuttle." });
  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
  try {
    const r = await fetch(tracker.url, { headers: { "user-agent": "sgbus-timings" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(`tracker replied ${r.status}`);
    return res.status(200).json({ ...readPage(await r.text()), at: Date.now() });
  } catch (err) {
    console.warn("shuttle-live:", err.message);
    return res.status(200).json({ eta: null, buses: [], at: Date.now() });
  }
}
