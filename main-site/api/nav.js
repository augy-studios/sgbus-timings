// Point-to-point journeys by bus and train: GET /api/nav?from=lat,lng&to=lat,lng, and
// optionally &when=leave|arrive&at=2026-10-09T08:30 (Singapore time) to leave at or arrive by
// a time rather than now, &restricted=1 for Settings' Restricted areas, and &customs=15|30|45|60
// for Settings' Immigration time (otherwise by the time of day, _nav/when.js). A bus leg across
// the Causeway lists where to get off for immigration and the minutes counted, as `customs`.
//
// Setting off now (or within LIVE_MIN), buses are timed by the traffic right now, each bus leg
// says if it's near its last bus or slowed by traffic (and why), and walking and cycling the
// whole way are given where they might compete, cycling only with &bike=1 (_nav/live.js).
//
// Answers { options: [...], alerts: { lines }, when: { mode, ms }, traffic: { at } | null,
// others: { walk?, cycle? } }, each option { minutes, mix, routes, legs, onemapMinutes?,
// source? }, quickest first. The router is
// _nav/router.js, riding only what's running at the time (_nav/when.js); OneMap checks its
// options (_nav/onemap-check.js); train legs on a line LTA reports as disrupted are flagged.
//
// The Telegram bot's /nav calls this too, with BOT_API_TOKEN, so the two always agree.

import { fetchTrainAlerts } from "./_push/lta.js";
import { rateLimited, storeConfigured } from "./_push/store.js";
import { getGraph, originOf } from "./_nav/network.js";
import { plan, runsThroughout } from "./_nav/router.js";
import { checkWithOneMap } from "./_nav/onemap-check.js";
import { busRunsAt, customsMin, readWhen, trainRunsAt } from "./_nav/when.js";
import { annotate, othersFor, withTraffic } from "./_nav/live.js";
import { getTraffic } from "./_lib/traffic.js";

const RATE_LIMIT = 30; // navs per IP per minute
// A time can be picked up to a week ahead (the pickers offer seven days), and a minute or
// two behind, for one picked just before the clock ticked over.
const AHEAD_MS = 8 * 86400000;
const BEHIND_MS = 2 * 60000;
// Arrive by, before the quickest way there is known: how long to guess it takes.
const GUESS_MIN = 60;
// Setting off within this many minutes counts as now, for the live traffic and walking or
// cycling instead.
const LIVE_MIN = 30;

// Whether a run is running at its i-th node, t minutes after setting off at `startMs`.
const openFrom = (startMs) => (run, i, t) => {
  const ms = startMs + t * 60000;
  return run.mode === "T" ? trainRunsAt(ms) : busRunsAt(run.times?.[i], ms);
};

// Minutes to clear immigration on a bus across the Causeway, reaching the checkpoint t
// minutes after `startMs`: ?customs=15|30|45|60 (Settings' Immigration time), or by the time
// of day (when.js).
const customsFrom = (startMs, own) => (way, t) => own ?? customsMin(way, startMs + t * 60000);

// Leave now or at a time: what's running from then. Arrive by: when to set off isn't known
// until the way is, so the ways are found from roughly then (the quickest, ignoring hours,
// before the time), and each one kept only if it runs from its own time to set off.
function planFor(graph, from, to, when, own) {
  if (when.mode !== "arrive") return { options: plan(graph, from, to, { open: openFrom(when.ms), customs: customsFrom(when.ms, own) }), setOff: when.ms };
  const lead = plan(graph, from, to, { customs: customsFrom(when.ms - GUESS_MIN * 60000, own) })[0]?.minutes ?? GUESS_MIN;
  const options = plan(graph, from, to, { open: openFrom(when.ms - lead * 60000), customs: customsFrom(when.ms - lead * 60000, own) })
    .filter((o) => runsThroughout(o, openFrom(when.ms - o.minutes * 60000)));
  return { options, setOff: when.ms - (options[0]?.minutes ?? lead) * 60000 };
}

// LTA's line codes in TrainServiceAlerts, to the router's. The Changi Airport branch is
// part of the East-West Line, so trouble on one is flagged on both.
const LTA_LINES = {
  EWL: ["EW", "CG"], CGL: ["CG"], NSL: ["NS"], NEL: ["NE"], CCL: ["CC"], DTL: ["DT"], TEL: ["TE"],
  BPL: ["BP"], STL: ["SK"], SKL: ["SK"], PTL: ["PG"], PGL: ["PG"],
};

// Singapore, roughly, and the stops in Johor Bahru its buses cross the Causeway to (Larkin
// Terminal, the furthest, is at 1.4955): a point outside it is a mistake, not a journey. The
// same box as js/places.js, js/recents.js, js/history.js, js/sync.js and the bot's sync_bot.py.
const inSingapore = ({ lat, lng }) => lat > 1.15 && lat < 1.5 && lng > 103.55 && lng < 104.1;

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
  const when = readWhen(req.query.when, req.query.at);
  if (!when) return res.status(400).json({ error: "at must be a time like 2026-10-09T08:30" });
  if (when.ms < Date.now() - BEHIND_MS) return res.status(400).json({ error: "That time has already passed. Pick a later one, or Leave now." });
  if (when.ms > Date.now() + AHEAD_MS) return res.status(400).json({ error: "Pick a time within the next week." });

  const bot = process.env.BOT_API_TOKEN && req.headers.authorization === `Bearer ${process.env.BOT_API_TOKEN}`;
  if (!bot && storeConfigured()) {
    const ip = req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    try {
      if (await rateLimited(`nav:${ip}`, RATE_LIMIT)) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
    } catch {}
  }

  try {
    const live = when.mode !== "arrive" && Math.abs(when.ms - Date.now()) <= LIVE_MIN * 60000;
    const [graph, alerts, traffic] = await Promise.all([
      // &restricted=1: Settings' Restricted areas, riding to and through the stops behind a
      // checkpoint (_nav/network.js).
      getGraph(originOf(req), { open: req.query.restricted === "1" }),
      process.env.LTA_ACCOUNT_KEY ? fetchTrainAlerts(process.env.LTA_ACCOUNT_KEY).catch(() => null) : null,
      live ? getTraffic() : null,
    ]);
    const own = ["15", "30", "45", "60"].includes(req.query.customs) ? Number(req.query.customs) : null;
    const { options: ours, setOff } = planFor(traffic ? withTraffic(graph, traffic) : graph, from, to, when, own);
    const best = ours.find((o) => !o.walkOnly)?.minutes ?? GUESS_MIN;
    const [{ options, checked }, others] = await Promise.all([
      checkWithOneMap(ours, from, to, new Date(setOff)),
      live ? othersFor(from, to, best, { bike: req.query.bike === "1" }).catch(() => ({})) : {},
    ]);
    annotate(options, { graph, traffic, setOff });

    // Lines LTA reports trouble on, as the router's line codes.
    const disrupted = new Set((alerts?.AffectedSegments || []).flatMap((s) => LTA_LINES[s.Line] || []));
    for (const o of options) {
      for (const leg of o.legs) if (leg.mode === "train" && disrupted.has(leg.route)) leg.disrupted = true;
      o.disrupted = o.legs.some((l) => l.disrupted);
    }

    return res.status(200).json({
      options, onemap: checked, alerts: { lines: [...disrupted] }, when: { mode: when.mode, ms: when.ms },
      traffic: traffic ? { at: traffic.at } : null, others,
    });
  } catch (err) {
    console.error("nav failed:", err);
    return res.status(502).json({ error: "Couldn't plan that right now. Please try again." });
  }
}
