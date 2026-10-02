// OneMap's public transport router, used as a second opinion on the nav router's options.
// Its times come from timetables, so where it rides the same buses and lines as one of ours,
// that option shows OneMap's time too. Journeys it finds that ours didn't are added, marked
// as OneMap's. Nav works the same without it: any failure here is ignored.

import { route } from "../_lib/onemap.js";
import { rail } from "./network.js";

const TIMEOUT_MS = 8000;

// OneMap names a train leg's line in more than one way; this finds the line code.
function lineCode(text) {
  const t = String(text || "").toUpperCase();
  const byCode = rail.lines.find((l) => t === l.code || t.startsWith(`${l.code}L`) || t.startsWith(`${l.code} `));
  if (byCode) return byCode.code;
  const byName = rail.lines.find((l) => t.includes(l.name.toUpperCase().replace(" LINE", "").replace(" LRT", "")));
  return byName?.code ?? (t || "?");
}

function toOption(it) {
  const legs = (it.legs || []).map((l) => {
    const place = (p) => ({ kind: p?.stopCode && /^\d{5}$/.test(p.stopCode) ? "stop" : "place", code: p?.stopCode || null, name: p?.name || "", lat: p?.lat, lng: p?.lon });
    const minutes = (l.duration || 0) / 60;
    if (l.mode === "WALK") return { mode: "walk", metres: Math.round(l.distance || 0), minutes, to: place(l.to) };
    const bus = l.mode === "BUS";
    return {
      mode: bus ? "bus" : "train",
      route: bus ? String(l.route || l.routeShortName || "") : lineCode(l.route || l.routeShortName || l.routeId),
      from: place(l.from),
      to: place(l.to),
      stops: (l.intermediateStops?.length ?? 0) + 1,
      minutes,
    };
  });
  const rides = legs.filter((l) => l.mode !== "walk");
  return {
    minutes: Math.round((it.duration || 0) / 60),
    mix: rides.map((l) => (l.mode === "bus" ? "B" : "T")).join(""),
    routes: rides.map((l) => l.route),
    legs: legs.filter((l) => l.mode !== "walk" || l.metres >= 20),
    source: "onemap",
  };
}

const keyOf = (o) => o.routes.join(">");

export async function checkWithOneMap(options, from, to) {
  const ask = (mode) =>
    Promise.race([route(from, to, { mode }), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))]);
  const results = await Promise.allSettled(["TRANSIT", "BUS", "RAIL"].map(ask));
  const theirs = new Map();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const it of r.value) {
      const o = toOption(it);
      if (!o.routes.length) continue;
      const old = theirs.get(keyOf(o));
      if (!old || o.minutes < old.minutes) theirs.set(keyOf(o), o);
    }
  }
  if (!theirs.size) return { options, checked: results.some((r) => r.status === "fulfilled") };

  const ours = new Set(options.map(keyOf));
  for (const o of options) {
    const match = theirs.get(keyOf(o));
    if (match) o.onemapMinutes = match.minutes;
  }
  const fastest = Math.min(...options.map((o) => o.minutes), ...[...theirs.values()].map((o) => o.minutes));
  const extra = [...theirs.values()].filter((o) => !ours.has(keyOf(o)) && o.minutes <= fastest * 1.6 + 12);
  return { options: [...options, ...extra].sort((a, b) => a.minutes - b.minutes), checked: true };
}
