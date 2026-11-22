// LTA's train timetable (DataMall's GTFS Schedule (Train)), read into an index of every
// platform's trains, for /api/trains.
//
// The feed is a zip of the usual GTFS files: stops.txt (a platform is a stop with
// location_type 0, its stop_code the station's code, "EW2", and parent_station the station it's
// part of, "DT32" for both Tampines'), routes.txt (route_short_name the line, "EW"),
// trips.txt, stop_times.txt (about 400,000 rows; times run past 24:00 for trains after
// midnight) and calendar.txt with calendar_dates.txt (a weekday, Saturday and Sunday service,
// and the odd line's own while works are on). LTA's calendar runs Sundays' trains on Sundays
// only: public holidays are ours to add (holidays below).
//
// No dependencies: the zip is read with zlib, and the CSVs are plain enough to split by hand.

import { inflateRawSync } from "node:zlib";

// ---------- zip ----------
// Each file in a zip as { name: Buffer }, from its central directory.
export function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    // The files sit at the top of the zip, or in a folder of its own: either way, by name.
    const base = name.split("/").pop();
    if (base) out[base] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------- csv ----------
// A CSV's rows as arrays, and its header as a name to column map. LTA's fields have no commas
// inside quotes, but quotes are taken off where they're used.
function csv(buf) {
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const split = (l) => (l.includes('"') ? splitQuoted(l) : l.split(","));
  const head = split(lines[0]).map((s) => s.trim());
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  return { col, rows: lines.slice(1).map(split) };
}

function splitQuoted(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

// "25:04:52" as seconds after the service day's midnight.
export function secs(hms) {
  const m = /^(\d+):(\d\d):(\d\d)$/.exec((hms || "").trim());
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

// ---------- the index ----------
// Everything /api/trains needs from the zip's files ({ "stops.txt": Buffer, … }), kept small:
// the stop times as typed arrays, ordered by trip and stop.
export function buildIndex(files) {
  const need = (n) => {
    if (!files[n]) throw new Error(`timetable has no ${n}`);
    return csv(files[n]);
  };
  const stopsCsv = need("stops.txt");
  const routesCsv = need("routes.txt");
  const tripsCsv = need("trips.txt");
  const timesCsv = need("stop_times.txt");
  const cal = files["calendar.txt"] ? csv(files["calendar.txt"]) : { col: {}, rows: [] };
  const dates = files["calendar_dates.txt"] ? csv(files["calendar_dates.txt"]) : { col: {}, rows: [] };

  // Stops: platforms, and the stations they're in.
  const S = stopsCsv.col;
  const stops = [];
  const stopIx = new Map();
  for (const r of stopsCsv.rows) {
    const type = r[S.location_type] || "0";
    if (type !== "0" && type !== "1") continue;
    stopIx.set(r[S.stop_id], stops.length);
    stops.push({
      id: r[S.stop_id],
      code: (r[S.stop_code] || r[S.stop_id]).trim(),
      name: (r[S.stop_name] || "").trim(),
      parent: (r[S.parent_station] || "").trim(),
      platform: (r[S.platform_code] || "").trim(),
      lat: +r[S.stop_lat] || null,
      lng: +r[S.stop_lon] || null,
      station: type === "1",
    });
  }

  const R = routesCsv.col;
  const routes = new Map(routesCsv.rows.map((r) => [r[R.route_id], {
    line: (r[R.route_short_name] || r[R.route_id]).trim(),
    name: (r[R.route_long_name] || "").trim(),
    colour: (r[R.route_color] || "").trim(),
  }]));

  const T = tripsCsv.col;
  const tripIx = new Map();
  const trips = [];
  for (const r of tripsCsv.rows) {
    tripIx.set(r[T.trip_id], trips.length);
    trips.push({ id: r[T.trip_id], route: r[T.route_id], service: r[T.service_id], head: (r[T.trip_headsign] || "").trim(), first: 0, count: 0 });
  }

  // Stop times, sorted by trip then stop_sequence, in flat arrays.
  const C = timesCsv.col;
  const rows = [];
  const heads = [""];
  const headIx = new Map([["", 0]]);
  for (const r of timesCsv.rows) {
    const t = tripIx.get(r[C.trip_id]);
    const s = stopIx.get(r[C.stop_id]);
    if (t == null || s == null) continue;
    const arr = secs(r[C.arrival_time]);
    const dep = secs(r[C.departure_time]);
    if (arr == null && dep == null) continue;
    const h = (C.stop_headsign != null && r[C.stop_headsign] || "").trim();
    if (!headIx.has(h)) { headIx.set(h, heads.length); heads.push(h); }
    rows.push([t, +r[C.stop_sequence] || 0, s, arr ?? dep, dep ?? arr, headIx.get(h)]);
  }
  rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const n = rows.length;
  const st = {
    trip: new Int32Array(n), seq: new Int32Array(n), stop: new Int32Array(n),
    arr: new Int32Array(n), dep: new Int32Array(n), head: new Int32Array(n),
  };
  const atStop = stops.map(() => []);
  rows.forEach((r, i) => {
    [st.trip[i], st.seq[i], st.stop[i], st.arr[i], st.dep[i], st.head[i]] = r;
    const trip = trips[r[0]];
    if (!trip.count) trip.first = i;
    trip.count++;
    atStop[r[2]].push(i);
  });

  // Calendars: which days each service runs.
  const K = cal.col;
  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const calendar = new Map(cal.rows.map((r) => [r[K.service_id], {
    days: DAYS.map((d) => r[K[d]] === "1"),
    start: r[K.start_date],
    end: r[K.end_date],
  }]));
  const D = dates.col;
  const exceptions = new Map();
  for (const r of dates.rows) {
    const key = `${r[D.service_id]}|${r[D.date]}`;
    exceptions.set(key, r[D.exception_type] === "1" ? "add" : "remove");
  }
  const services = new Set([...calendar.keys(), ...dates.rows.map((r) => r[D.service_id])]);

  return { stops, stopIx, routes, trips, tripIx, st, atStop, heads, calendar, exceptions, services };
}

// ---------- days ----------
const SG_OFFSET_MS = 8 * 3600 * 1000;
// Trains after midnight belong to the day before (the feed's times run to about 25:05), so a
// service day lasts until this hour of the next morning.
export const DAY_ENDS_HOUR = 3;

const pad = (n) => String(n).padStart(2, "0");
const ymdOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// The service day a moment falls in, as "2026-11-22", and how many seconds after that day's
// midnight it is (more than 86,400 in the small hours).
export function serviceDay(ms) {
  const d = new Date(ms + SG_OFFSET_MS);
  let s = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  if (d.getUTCHours() < DAY_ENDS_HOUR) {
    d.setUTCDate(d.getUTCDate() - 1);
    s += 86400;
  }
  return { day: ymdOf(d), now: s };
}

export function nextDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return ymdOf(d);
}

// The day's midnight in Singapore, as a moment.
export const dayStartMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`) - SG_OFFSET_MS;

// The services running on a day: its calendar's day of the week (a public holiday counts as a
// Sunday, as LTA's trains run Sunday's timetable then), within its dates, with that day's
// exceptions.
export function servicesOn(index, ymd, holidays) {
  const compact = ymd.replace(/-/g, "");
  const dow = holidays?.has(ymd) ? 0 : new Date(`${ymd}T00:00:00Z`).getUTCDay();
  const on = new Set();
  for (const id of index.services) {
    const c = index.calendar.get(id);
    let runs = !!c && c.days[dow] && compact >= c.start && compact <= c.end;
    const ex = index.exceptions.get(`${id}|${compact}`);
    if (ex === "add") runs = true;
    if (ex === "remove") runs = false;
    if (runs) on.add(id);
  }
  return on;
}

// ---------- a station ----------
// The platforms of the station (or stations) with any of these codes ("EW2"; "EW2,DT32"
// for both of an interchange's): their own codes, the codes of the station they're part of,
// and every platform in it, so asking for Tampines EW2 gives its Downtown line platforms too,
// and Tanah Merah its Changi Airport branch.
export function platformsFor(index, codes) {
  const want = new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const parents = new Set();
  for (const s of index.stops) {
    if (s.station) continue;
    if (want.has(s.code) || want.has(s.parent)) parents.add(s.parent || s.code);
  }
  for (const c of want) parents.add(c);
  const out = [];
  index.stops.forEach((s, i) => {
    if (!s.station && (parents.has(s.parent) || parents.has(s.code)) && index.atStop[i].length) out.push(i);
  });
  return out;
}

// A platform's trains on a service day, by the time they reach it, as
// { line, colour, trains: [{ i, t, head, on }] }: `i` the stop time's index (for live
// updates), `t` seconds after the day's midnight, `head` where it's going, and `on` the
// station codes it calls at after this one, in order. A train that ends here isn't one to
// board, so isn't listed.
export function platformTrains(index, stopI, running) {
  const { st, trips, stops, heads, routes } = index;
  const trains = [];
  let line = null;
  for (const i of index.atStop[stopI]) {
    const trip = trips[st.trip[i]];
    if (!running.has(trip.service)) continue;
    const last = trip.first + trip.count - 1;
    if (i >= last) continue;
    const route = routes.get(trip.route);
    line ??= route;
    const on = [];
    for (let j = i + 1; j <= last; j++) {
      const code = stops[st.stop[j]].code;
      if (on[on.length - 1] !== code) on.push(code);
    }
    trains.push({ i, t: st.arr[i], head: heads[st.head[i]] || trip.head || stops[st.stop[last]].name, on, trip: trip.id });
  }
  trains.sort((a, b) => a.t - b.t);
  return { line: line?.line || null, colour: line?.colour || null, trains };
}
