// The next trains at an MRT or LRT station: /api/trains?codes=EW2 (or "EW2,DT32", any of the
// station's codes; one gives the whole station, every line in it).
//
// The times are LTA's timetable, DataMall's GTFS Schedule (Train) (api/_trains/gtfs.js).
// LTA publishes no live train times: its GTFS Realtime trip updates carry only a disruption's
// cancellations, delays and skipped stations, and are empty on a normal day. Whatever they
// say goes over the timetable's times here (api/_trains/rt.js), so a train is either
// "timetable" or "live".
//
// Answers, kept short as it goes to every phone that opens a station:
//   { day: "2026-11-22", start, now, live, feedAt, platforms: [{
//       id: "EW2_A", code: "EW2", line: "EW", colour: "#009645", platform: "A",
//       heads: ["Pasir Ris"], ways: [["EW1"]],
//       trains: [[t, head, way, state]],
//       first: [t, head] | null }] }
// `day` is the service day (trains after midnight are the day before's), `start` its midnight
// in ms since 1970, `now` and each `t` seconds after it. A train's `head` and `way` index the
// platform's `heads` (where it's going) and `ways` (the stations it calls at after this one,
// for Navigate to tell which trains reach a stop); `state` is 0 from the timetable, 1 a time
// the disruption feed changed, 2 cancelled or not stopping here. Only trains still to come
// are listed (a minute's grace), so a copy kept offline holds the rest of the day. `first`
// is the next day's first train, for after the last one. `live` says the disruption feed has
// something for this station.
//
// Keep in step with js/trains.js, flutter/lib/data/trains.dart and telegram-bot/src/trains.py,
// which read it.

import { HOLIDAYS } from "../js/nav-core/when.js";
import { buildIndex, dayStartMs, nextDay, platformTrains, platformsFor, serviceDay, servicesOn, unzip } from "./_trains/gtfs.js";
import { applyUpdate, decodeFeed } from "./_trains/rt.js";

const DM = "https://datamall2.mytransport.sg/ltaodataservice";
// The timetable changes when LTA runs works on a line, a few times a month: six hours'
// copy will do.
const TIMETABLE_MS = 6 * 3600 * 1000;
// The disruption feed is made again every minute or so.
const FEED_MS = 20 * 1000;
// A train this many seconds gone is still listed: it may be at the platform.
const GRACE_S = 60;

let timetable = null; // { at, index } | Promise while loading
let feed = null; // { at, value }

// DataMall's GTFS files come by a link that lasts 15 minutes, from a JSON answer of its own.
async function dmFile(path) {
  const r = await fetch(`${DM}/${path}`, { headers: { AccountKey: process.env.LTA_ACCOUNT_KEY, accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const body = await r.json();
  const link = body?.value?.[0]?.link || body?.value?.[0]?.Link;
  if (!link) throw new Error(`${path}: no link`);
  const f = await fetch(link, { cache: "no-store" });
  if (!f.ok) throw new Error(`${path} file: ${f.status}`);
  return Buffer.from(await f.arrayBuffer());
}

export async function getTimetable() {
  if (timetable?.index && Date.now() - timetable.at < TIMETABLE_MS) return timetable.index;
  if (timetable?.loading) return timetable.loading;
  const old = timetable?.index;
  const loading = dmFile("GTFSScheduleTrain")
    .then((zip) => {
      const index = buildIndex(unzip(zip));
      timetable = { at: Date.now(), index };
      return index;
    })
    .catch((err) => {
      // A failed refresh keeps the copy there was, and tries again in a minute.
      if (old) {
        console.error("GTFSScheduleTrain refresh:", err);
        timetable = { at: Date.now() - TIMETABLE_MS + 60_000, index: old };
        return old;
      }
      timetable = null;
      throw err;
    });
  timetable = { ...(timetable || {}), loading };
  return loading;
}

// The disruption feed, or an empty one when it can't be had: the timetable still answers.
async function getFeed() {
  if (feed && Date.now() - feed.at < FEED_MS) return feed.value;
  try {
    const value = decodeFeed(await dmFile("GTFSRealtimeTrainTripUpdates"));
    feed = { at: Date.now(), value };
  } catch (err) {
    console.error("GTFSRealtimeTrainTripUpdates:", err);
    feed = { at: Date.now(), value: feed?.value || { timestamp: null, updates: [] } };
  }
  return feed.value;
}

// The answer for these codes at this moment, from an index and a feed: apart from the handler
// so scripts/trains-test.mjs can try it without LTA.
export function answer(index, rt, codes, ms = Date.now()) {
  const { day, now } = serviceDay(ms);
  const start = dayStartMs(day);
  const running = servicesOn(index, day, HOLIDAYS);
  const tomorrow = servicesOn(index, nextDay(day), HOLIDAYS);
  const byTrip = new Map(rt.updates.map((u) => [u.trip.id, u]));
  let live = false;

  const platforms = platformsFor(index, codes).map((p) => {
    const stop = index.stops[p];
    const { line, colour, trains } = platformTrains(index, p, running);
    const heads = [];
    const ways = [];
    const wayIx = new Map();
    const headIx = (h) => {
      let k = heads.indexOf(h);
      if (k < 0) { k = heads.length; heads.push(h); }
      return k;
    };
    const out = [];
    for (const tr of trains) {
      let t = tr.t;
      let state = 0;
      const u = byTrip.get(tr.trip);
      if (u) {
        live = true;
        const said = applyUpdate(u, { seq: index.st.seq[tr.i], stopId: stop.id, t, dayStart: start / 1000 });
        if (said?.gone) state = 2;
        else if (said?.t != null && said.t !== t) { t = said.t; state = 1; }
      }
      if (t < now - GRACE_S) continue;
      const key = tr.on.join(" ");
      if (!wayIx.has(key)) { wayIx.set(key, ways.length); ways.push(tr.on); }
      out.push([t, headIx(tr.head), wayIx.get(key), state]);
    }
    out.sort((a, b) => a[0] - b[0]);
    const next = platformTrains(index, p, tomorrow).trains[0];
    return {
      id: stop.id,
      code: stop.code,
      name: stop.name,
      line,
      colour: colour ? `#${colour.replace(/^#/, "")}` : null,
      platform: stop.platform,
      heads,
      ways,
      trains: out,
      first: next ? [next.t, headIx(next.head)] : null,
    };
  });

  // Trains the disruption feed adds that the timetable hasn't got aren't listed: LTA hasn't
  // said where they're going, and they'd be no use without.
  // A platform trains only end at (Tanah Merah's for those back from Changi Airport) isn't one
  // to wait at.
  return { day, start, now, live, feedAt: rt.timestamp, platforms: platforms.filter((p) => p.trains.length || p.first) };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const codes = String(req.query.codes || req.query.code || "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{1,3}\d{0,2}[A-Z]?$/.test(c));
  if (!codes.length) return res.status(400).json({ error: "Missing ?codes=STATION_CODE" });

  try {
    const [index, rt] = await Promise.all([getTimetable(), getFeed()]);
    const out = answer(index, rt, codes);
    if (!out.platforms.length) return res.status(404).json({ error: "No trains at that station" });
    // Short at the edge: a disruption's changes should show within the minute.
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json(out);
  } catch (err) {
    console.error("trains:", err);
    return res.status(502).json({ error: "LTA's train timetable couldn't be reached" });
  }
}
