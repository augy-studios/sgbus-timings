// Leave now, Leave at or Arrive by, with or without a stop on the way: the router's ways for a
// time (router.js, riding only what's running then, when.js), before anything live is added.
// /api/nav (api/nav.js) and the phone's offline planning (offline.js) both plan through here,
// so the two always find the same ways.

import { meanWait, rideable } from "./campus.js";
import { plan, runsThroughout } from "./router.js";
import { HOLIDAYS, busRunsAt, customsMin, trainRunsAt } from "./when.js";

// Arrive by, before the quickest way there is known: how long to guess it takes.
export const GUESS_MIN = 60;

const isHoliday = (ymd) => HOLIDAYS.has(ymd);

// Whether a run is running at its i-th node, t minutes after setting off at `startMs`. A campus
// shuttle, whether its timetable has it running then (campus.js).
const openFrom = (startMs, config) => (run, i, t) => {
  const ms = startMs + t * 60000;
  if (run.campus) return meanWait(run, i, ms, config, isHoliday) != null;
  return run.mode === "T" ? trainRunsAt(ms) : busRunsAt(run.times?.[i], ms);
};

// A campus shuttle's mean wait to board, t minutes after setting off at `startMs`.
const waitFrom = (startMs, config) => (run, i, t) => meanWait(run, i, startMs + t * 60000, config, isHoliday);

// Minutes to clear immigration on a bus across the Causeway, reaching the checkpoint t
// minutes after `startMs`: ?customs=15|30|45|60 (Settings' Immigration time), or by the time
// of day (when.js).
const customsFrom = (startMs, own) => (way, t) => own ?? customsMin(way, startMs + t * 60000);

// Leave now or at a time: what's running from then. Arrive by: when to set off isn't known
// until the way is, so the ways are found from roughly then (the quickest, ignoring hours,
// before the time), and each one kept only if it runs from its own time to set off.
//
// `shuttles`: { paid }, Settings' Shuttle buses (Free only, or Free and paid), for which shuttle
// buses may be ridden (campus.js, rideable).
export function planFor(graph, from, to, when, own, shuttles = {}) {
  const c = graph.campusConfig;
  const ride = (run) => rideable(run, from, to, shuttles);
  if (when.mode !== "arrive") return { options: plan(graph, from, to, { open: openFrom(when.ms, c), customs: customsFrom(when.ms, own), wait: waitFrom(when.ms, c), ride }), setOff: when.ms };
  const lead = plan(graph, from, to, { customs: customsFrom(when.ms - GUESS_MIN * 60000, own), wait: waitFrom(when.ms - GUESS_MIN * 60000, c), ride })[0]?.minutes ?? GUESS_MIN;
  const options = plan(graph, from, to, { open: openFrom(when.ms - lead * 60000, c), customs: customsFrom(when.ms - lead * 60000, own), wait: waitFrom(when.ms - lead * 60000, c), ride })
    .filter((o) => runsThroughout(o, openFrom(when.ms - o.minutes * 60000, c)));
  return { options, setOff: when.ms - (options[0]?.minutes ?? lead) * 60000 };
}

// With a stop on the way, each half planned as above. Leave now or at a time: the first half
// from then, and the second from when the quickest first half reaches the stop. Arrive by: the
// second half to arrive by the time, then the first to reach the stop by when the quickest
// second half sets off. Either way the halves are timed from the quickest of the other, so
// each pair joined (via.js) is kept only if all its rides run at their own times then.
export function planViaFor(graph, from, via, to, when, own, shuttles = {}) {
  if (when.mode !== "arrive") {
    const first = planFor(graph, from, via, when, own, shuttles);
    const second = planFor(graph, via, to, { mode: "leave", ms: when.ms + (first.options[0]?.minutes ?? 0) * 60000 }, own, shuttles);
    return { first, second, fits: (a, b) => runsThroughout(b, openFrom(when.ms + a.minutes * 60000, graph.campusConfig)) };
  }
  const second = planFor(graph, via, to, when, own, shuttles);
  const first = planFor(graph, from, via, { mode: "arrive", ms: second.setOff }, own, shuttles);
  return {
    first,
    second,
    fits: (a, b) => runsThroughout(a, openFrom(when.ms - (a.minutes + b.minutes) * 60000, graph.campusConfig)) && runsThroughout(b, openFrom(when.ms - b.minutes * 60000, graph.campusConfig)),
  };
}
