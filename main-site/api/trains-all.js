// Every station's trains on a usual weekday, Saturday and Sunday, for the phone to keep offline
// as it keeps the bus routes (sw.js): js/trains.js works a station's next trains out from it when
// /api/trains can't be reached. LTA's timetable, as /api/trains has it (api/_trains/gtfs.js), but
// for a day of each kind with no works on: a day calendar_dates.txt changes is passed over, as is
// a public holiday, so the copy is the lines' usual timetable. No disruption changes: offline, it
// says so.
//
// Answers { v: 1, made, days: { wd, sat, sun }, platforms: [{ id, code, name, parent, line,
// colour, platform, heads, ways, trains: { wd, sat, sun } }] }: `days` the dates each kind was
// taken from, and each kind's trains a flat list [t, head, way, t, head, way, …], `t` seconds
// after the day's midnight, `head` and `way` indexing the platform's `heads` and `ways` as in
// /api/trains. About 6 MB, 1.2 MB as sent.
//
// Keep in step with js/trains.js, flutter/lib/data/trains.dart and telegram-bot/src/trains.py.

import { HOLIDAYS } from "../js/nav-core/when.js";
import { nextDay, platformTrains, serviceDay, servicesOn } from "./_trains/gtfs.js";
import { getTimetable } from "./trains.js";

const KINDS = { wd: [1, 2, 3, 4, 5], sat: [6], sun: [0] };
// How far ahead a usual day of each kind is looked for.
const LOOK_DAYS = 60;

// The first day from `from` of this kind that's a usual one: no exceptions in calendar_dates and
// not a public holiday. Else the first of its kind at all.
export function usualDay(index, from, kind) {
  const changed = new Set([...index.exceptions.keys()].map((k) => k.split("|")[1]));
  let day = from;
  let fallback = null;
  for (let i = 0; i < LOOK_DAYS; i++, day = nextDay(day)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (!KINDS[kind].includes(dow) || HOLIDAYS.has(day)) continue;
    fallback ??= day;
    if (!changed.has(day.replace(/-/g, ""))) return day;
  }
  return fallback || from;
}

export function network(index, ms = Date.now()) {
  const { day: today } = serviceDay(ms);
  const days = Object.fromEntries(Object.keys(KINDS).map((k) => [k, usualDay(index, today, k)]));
  const running = Object.fromEntries(Object.entries(days).map(([k, d]) => [k, servicesOn(index, d, HOLIDAYS)]));
  const platforms = [];
  index.stops.forEach((stop, p) => {
    if (stop.station || !index.atStop[p].length) return;
    const heads = [];
    const ways = [];
    const wayIx = new Map();
    let line = null;
    const trains = {};
    for (const kind of Object.keys(KINDS)) {
      const got = platformTrains(index, p, running[kind]);
      if (got.line) line ??= got;
      const flat = [];
      for (const tr of got.trains) {
        let h = heads.indexOf(tr.head);
        if (h < 0) { h = heads.length; heads.push(tr.head); }
        const key = tr.on.join(" ");
        if (!wayIx.has(key)) { wayIx.set(key, ways.length); ways.push(tr.on); }
        flat.push(tr.t, h, wayIx.get(key));
      }
      trains[kind] = flat;
    }
    if (!Object.values(trains).some((t) => t.length)) return;
    platforms.push({
      id: stop.id,
      code: stop.code,
      name: stop.name,
      parent: stop.parent || stop.code,
      line: line?.line || null,
      colour: line?.colour ? `#${line.colour.replace(/^#/, "")}` : null,
      platform: stop.platform,
      heads,
      ways,
      trains,
    });
  });
  return { v: 1, made: today, days, platforms };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const out = network(await getTimetable());
    // The timetable changes a few times a month; a phone asks once a day.
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(out);
  } catch (err) {
    console.error("trains-all:", err);
    return res.status(502).json({ error: "LTA's train timetable couldn't be reached" });
  }
}
