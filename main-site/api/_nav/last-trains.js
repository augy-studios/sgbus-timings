// The last trains, for Navigate's ways (api/nav.js), as _nav/live.js's `lastBus` is for buses:
// on each train leg, when the train you'd catch is one of the day's last three that reach where
// you get off, by LTA's timetable (api/_trains/gtfs.js), `lastTrainRank` says which: 3 the 3rd
// last, 2 the 2nd last, 1 the last; and `lastTrain` ("00:12") when the last one leaves. The
// same "last three" as the train times mark in red and an open way's train ride says
// (js/trains.js, forLeg), so a way's card and its ride agree. A disruption's changes aren't
// counted here: the ride's own trains, from /api/trains, show them.
//
// Keep in step with js/nav.js, js/sgbus-core.js (sgbus nav), flutter/lib/features/nav/nav_page.dart
// and telegram-bot/src/nav_view.py, which show it.

import { HOLIDAYS } from "../../js/nav-core/when.js";
import { dayStartMs, platformTrains, platformsFor, serviceDay, servicesOn } from "../_trains/gtfs.js";
import { sgClock } from "./when.js";

// The last three trains of the day, as the train times' red ones.
export const LAST_N = 3;
// A train this close is still one to catch: it may be at the platform (js/trains.js, NOW_S).
const NOW_S = 30;

const hhmm = (ms) => {
  const { min } = sgClock(ms);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};

// The trains still to come today from a station's platforms that call at any of `to`, from
// `ms`: how many, and when the last one leaves, or null when there's none.
export function trainsLeft(index, from, to, ms, kept = new Map()) {
  const { day, now } = serviceDay(ms);
  const running = kept.get(day) ?? kept.set(day, servicesOn(index, day, HOLIDAYS)).get(day);
  const key = `${day}|${from.join(",")}`;
  if (!kept.has(key)) kept.set(key, platformsFor(index, from).flatMap((p) => platformTrains(index, p, running).trains));
  const want = new Set(to.map((c) => c.toUpperCase()));
  let count = 0;
  let last = -1;
  for (const t of kept.get(key)) {
    if (t.t < now - NOW_S || !t.on.some((c) => want.has(c))) continue;
    count++;
    if (t.t > last) last = t.t;
  }
  return count ? { count, lastMs: dayStartMs(day) + last * 1000 } : null;
}

// Each train leg's `lastTrain`, for setting off at `setOff`: timed as live.js times a bus leg,
// from when you'd be on its platform.
export function lastTrains(options, { index, setOff }) {
  const kept = new Map();
  for (const o of options) {
    let t = 0;
    for (const leg of o.legs) {
      if (leg.mode === "walk") {
        t += leg.minutes || 0;
        continue;
      }
      const board = leg.board ?? t + (leg.wait || 0);
      t = board + (leg.minutes || 0);
      if (leg.mode !== "train" || !leg.from?.code || !leg.to?.code) continue;
      const onPlatform = setOff + (board - (leg.wait || 0)) * 60000;
      const left = trainsLeft(index, leg.from.code.split("/"), leg.to.code.split("/"), onPlatform, kept);
      if (left && left.count <= LAST_N) {
        leg.lastTrain = hhmm(left.lastMs);
        // You'd catch the first of those left, so as many from the last as there are left.
        leg.lastTrainRank = left.count;
      }
    }
  }
}
