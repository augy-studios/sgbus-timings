// OneMap's public transport router, used as a second opinion on the nav router's options.
// Its times come from timetables, so where it rides the same buses and lines as one of ours,
// that option shows OneMap's time too. Journeys it finds that ours didn't are added, marked
// as OneMap's. Nav works the same without it: any failure here is ignored.

import { route } from "../_lib/onemap.js";
import { LRT_LINES, haversine, rail } from "./network.js";

const TIMEOUT_MS = 8000;
// The wait to board where OneMap gives no times to work it out from, as router.js has it.
const WAIT_MIN = { bus: 5, train: 3 };
// A gap longer than this is taken for a mix-up of times, not a real wait. A wait is at most
// MAX_WAIT_MIN, as a trip's legs have to be (api/_push/validate.js).
const MAX_WAIT_MS = 60 * 60000;
const MAX_WAIT_MIN = 60;

// OneMap names a train leg's line in more than one way; this finds the line code.
function lineCode(text) {
  const t = String(text || "").toUpperCase();
  const byCode = rail.lines.find((l) => t === l.code || t.startsWith(`${l.code}L`) || t.startsWith(`${l.code} `));
  if (byCode) return byCode.code;
  const byName = rail.lines.find((l) => t.includes(l.name.toUpperCase().replace(" LINE", "").replace(" LRT", "")));
  return byName?.code ?? (t || "?");
}

// OneMap names a station in capitals with its kind: "PASIR RIS MRT STATION". A train ride's
// stations are named as the router's are instead (help desk #6), by the rail network's own
// station nearest OneMap's point (within STATION_M), as kind "station", so Navigate and the
// trip bar say "Pasir Ris station" rather than "PASIR RIS MRT STATION station". A station
// that can't be matched keeps OneMap's name without the suffix, and a walk's end at one is
// "Pasir Ris station".
const STATION_M = 400;
const STATION_SUFFIX = /\s+(?:MRT|LRT)(?:\s+STATION)?(?:\s*\/\s*(?:MRT|LRT)(?:\s+STATION)?)?\s*$/i;
const tidyName = (name) => {
  const s = String(name || "").replace(STATION_SUFFIX, "").trim();
  return /[a-z]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s(/-])\S/g, (c) => c.toUpperCase());
};
function stationAt(p) {
  if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) return null;
  let best = null;
  let bestM = STATION_M;
  for (const st of rail.stations) {
    const m = haversine(p.lat, p.lon, st.lat, st.lng);
    if (m < bestM) [best, bestM] = [st, m];
  }
  return best;
}
const stationPlace = (p) => {
  const st = stationAt(p);
  if (st) return { kind: "station", code: st.codes.join("/"), codes: st.codes, name: st.name, lat: st.lat, lng: st.lng };
  return { kind: "station", code: null, codes: [], name: tidyName(p?.name), lat: p?.lat, lng: p?.lon };
};

// Each ride's `wait` is the gap OneMap's timetable leaves before it: since the previous leg
// ended, and for the first ride also how much later than `when` OneMap has you setting off,
// as it has you walk out just in time for the bus. Its own duration counts neither of those,
// and a trip's live ETA (js/trip.js, progress) counted no wait at all on a OneMap way, so it
// said you'd be in sooner than you would. `minutes` is the whole of it, waits included, as the
// router's own options are.
function toOption(it, when) {
  const gap = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b - a >= 0 && b - a <= MAX_WAIT_MS ? b - a : null);
  const late = gap(when.getTime(), it.startTime) ?? 0;
  let prevEnd = null;
  let first = true;
  const legs = (it.legs || []).map((l) => {
    const before = prevEnd;
    prevEnd = l.endTime;
    const place = (p) => ({ kind: p?.stopCode && /^\d{5}$/.test(p.stopCode) ? "stop" : "place", code: p?.stopCode || null, name: STATION_SUFFIX.test(p?.name || "") ? `${tidyName(p.name)} station` : p?.name || "", lat: p?.lat, lng: p?.lon });
    const minutes = (l.duration || 0) / 60;
    if (l.mode === "WALK") return { mode: "walk", metres: Math.round(l.distance || 0), minutes, to: place(l.to) };
    const bus = l.mode === "BUS";
    // Every stop or station on the ride, for following it on a trip (the Get Off Alert), as
    // the router's own legs have: without a path, Start trip had nothing to follow.
    const stops = [l.from, ...(l.intermediateStops || []), l.to].filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
    const route = bus ? String(l.route || l.routeShortName || "") : lineCode(l.route || l.routeShortName || l.routeId);
    // A train leg's line as the router's own legs have it (router.js), so it gets its colour
    // dot and name in Navigate too.
    // The Changi Airport branch (CG) is the East-West Line's, as network.js has it.
    const line = bus ? null : rail.lines.find((x) => x.code === (route === "CG" ? "EW" : route));
    const between = !Number.isFinite(l.startTime) ? null : before == null ? 0 : gap(before, l.startTime);
    const waitMs = between == null ? null : between + (first ? late : 0);
    first = false;
    return {
      mode: bus ? "bus" : "train",
      wait: waitMs == null ? WAIT_MIN[bus ? "bus" : "train"] : Math.min(MAX_WAIT_MIN, waitMs / 60000),
      route,
      ...(line && {
        name: route === "CG" ? "East-West Line (Changi Airport branch)" : line.name,
        color: line.color,
        lrt: LRT_LINES.has(line.code),
      }),
      from: bus ? place(l.from) : stationPlace(l.from),
      to: bus ? place(l.to) : stationPlace(l.to),
      stops: (l.intermediateStops?.length ?? 0) + 1,
      minutes,
      path: stops.map((p) => [p.lat, p.lon]),
      names: stops.map((p) => (bus ? p.name || "" : stationAt(p)?.name || tidyName(p.name))),
      // A bus leg's stop codes too, as the router's have them, so the trip's timeline can
      // open each stop's timings. Null for a stop without a five-digit code.
      ...(bus && { codes: stops.map((p) => (/^\d{5}$/.test(p.stopCode || "") ? p.stopCode : null)) }),
    };
  });
  const rides = legs.filter((l) => l.mode !== "walk");
  return {
    minutes: Math.round(legs.reduce((sum, l) => sum + l.minutes + (l.wait || 0), 0)),
    mix: rides.map((l) => (l.mode === "bus" ? "B" : "T")).join(""),
    routes: rides.map((l) => l.route),
    legs: legs.filter((l) => l.mode !== "walk" || l.metres >= 20),
    source: "onemap",
  };
}

const keyOf = (o) => o.routes.join(">");

// `when` is the moment to set off, so OneMap's timetables answer for then.
export async function checkWithOneMap(options, from, to, when = new Date()) {
  const ask = (mode) =>
    Promise.race([route(from, to, { mode, when }), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))]);
  const results = await Promise.allSettled(["TRANSIT", "BUS", "RAIL"].map(ask));
  const theirs = new Map();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const it of r.value) {
      const o = toOption(it, when);
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
