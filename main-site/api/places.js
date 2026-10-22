// Places to start or end a nav at: GET /api/places?q=... answers up to 10 of
// { kind: "station" | "stop" | "place", label, sub, code?, lat, lng }.
//
// MRT/LRT stations and bus stops are matched here by name or code, stops as the stop search
// matches them, LTA's short forms and all (api/_lib/stop-search.js); anything else, an
// address, a building, a postal code, is OneMap's search. A Google Maps link answers the one
// place it points at (api/_lib/gmaps.js), and typed coordinates or a plus code the one point
// they are (api/_lib/points.js), or a 422 with { error } saying why it can't.

import { findMapsLink, MapsLinkError, placeFromMapsLink } from "./_lib/gmaps.js";
import { addressOf, search, titleCase } from "./_lib/onemap.js";
import { findPoint, PointError } from "./_lib/points.js";
import { matchStops } from "./_lib/stop-search.js";
import { getGraph, originOf, rail } from "./_nav/network.js";

const LIMIT = 10;
const STOP_LIMIT = 4;

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.status(400).json({ error: "q must be at least 2 characters" });

  const link = findMapsLink(q);
  if (link) {
    try {
      const place = await placeFromMapsLink(link);
      res.setHeader("Cache-Control", "s-maxage=86400");
      return res.status(200).json([place]);
    } catch (err) {
      if (!(err instanceof MapsLinkError)) throw err;
      return res.status(422).json({ error: err.message });
    }
  }

  let point;
  try {
    point = findPoint(q);
  } catch (err) {
    if (!(err instanceof PointError)) throw err;
    return res.status(422).json({ error: err.message });
  }
  if (point) {
    res.setHeader("Cache-Control", "s-maxage=86400");
    return res.status(200).json([point]);
  }

  const lower = q.toLowerCase();

  const stations = rail.stations
    .filter((s) => s.name.toLowerCase().includes(lower) || s.codes.some((c) => c.toLowerCase() === lower))
    .slice(0, 4)
    .map((s) => ({ kind: "station", label: `${s.name} station`, sub: s.codes.join(" / "), code: s.codes.join("/"), lat: s.lat, lng: s.lng }));

  const [graph, hits] = await Promise.all([
    getGraph(originOf(req)).catch(() => null),
    search(q).catch(() => []),
  ]);

  const stops = (graph ? matchStops(graph.nodes, q, STOP_LIMIT) : [])
    .map((n) => ({ kind: "stop", label: n.name, sub: `Bus stop ${n.code}${n.road ? ` · ${n.road}` : ""}`, code: n.code, lat: n.lat, lng: n.lng }));

  const places = hits
    .filter((h) => h.LATITUDE && h.LONGITUDE)
    .slice(0, 6)
    .map((h) => {
      const building = h.BUILDING && h.BUILDING !== "NIL" ? titleCase(h.BUILDING) : "";
      const address = addressOf(h);
      return {
        kind: "place",
        label: building || address,
        sub: [building ? address : "", h.POSTAL && h.POSTAL !== "NIL" ? `Singapore ${h.POSTAL}` : ""].filter(Boolean).join(", "),
        lat: Number(h.LATITUDE),
        lng: Number(h.LONGITUDE),
      };
    });

  // An exact stop code first, then stations, then OneMap's places, then stops by name. The
  // places are what's cut to fit, so the stops keep their room: four stations and six places
  // would otherwise leave none for "blk 29 bahagia", or a stop typed by its own name.
  const exact = stops.filter((s) => s.code === q);
  const rest = stops.filter((s) => s.code !== q);
  const room = Math.max(0, LIMIT - exact.length - stations.length - rest.length);
  const seen = new Set();
  const out = [...exact, ...stations, ...places.slice(0, room), ...rest].filter((p) => {
    const key = `${p.label}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json(out.slice(0, LIMIT));
}
