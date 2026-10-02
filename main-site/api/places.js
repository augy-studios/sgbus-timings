// Places to start or end a nav at: GET /api/places?q=... answers up to 10 of
// { kind: "station" | "stop" | "place", label, sub, code?, lat, lng }.
//
// MRT/LRT stations and bus stops are matched here by name or code; anything else, an
// address, a building, a postal code, is OneMap's search.

import { addressOf, search, titleCase } from "./_lib/onemap.js";
import { getGraph, originOf, rail } from "./_nav/network.js";

const LIMIT = 10;

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.status(400).json({ error: "q must be at least 2 characters" });
  const lower = q.toLowerCase();

  const stations = rail.stations
    .filter((s) => s.name.toLowerCase().includes(lower) || s.codes.some((c) => c.toLowerCase() === lower))
    .slice(0, 4)
    .map((s) => ({ kind: "station", label: `${s.name} station`, sub: s.codes.join(" / "), code: s.codes.join("/"), lat: s.lat, lng: s.lng }));

  const [graph, hits] = await Promise.all([
    getGraph(originOf(req)).catch(() => null),
    search(q).catch(() => []),
  ]);

  const stops = [];
  if (graph) {
    for (const n of graph.nodes) {
      if (n.kind !== "stop") continue;
      if (n.code === q || (!/^\d+$/.test(q) && n.name.toLowerCase().includes(lower))) {
        stops.push({ kind: "stop", label: n.name, sub: `Bus stop ${n.code}${n.road ? ` · ${n.road}` : ""}`, code: n.code, lat: n.lat, lng: n.lng });
        if (stops.length >= 4) break;
      }
    }
  }

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

  // An exact stop code first, then stations, then OneMap's places, then stops by name.
  const exact = stops.filter((s) => s.code === q);
  const rest = stops.filter((s) => s.code !== q);
  const seen = new Set();
  const out = [...exact, ...stations, ...places, ...rest].filter((p) => {
    const key = `${p.label}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json(out.slice(0, LIMIT));
}
