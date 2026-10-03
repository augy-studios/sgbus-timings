// The Get Off Alert while the app is in the background (api/push/trip-poll.js). A website
// gets no location once it's hidden, so the server follows the bus instead: LTA's bus
// arrivals at the stop you get off at say where each bus heading there is, and yours is the
// one where the app last saw you, moved on by the time since. After that it's followed
// minute by minute. Trains, and buses LTA isn't tracking, go by the clock, as the app does
// underground.
//
// Keep ALERT_STOPS, ON_ROUTE_M and the alert's wording in step with js/trip.js.

export const ALERT_STOPS = 2;
// Near enough to the leg to be on it.
const ON_ROUTE_M = 250;
// How far, in stops, a bus may be from where yours should be and still be taken for it.
const MATCH_STOPS = 2;
// The cron runs once a minute, so the alert goes this much of a stop early rather than late.
const LEAD_STOPS = 0.5;

function perStop(leg) {
  const last = leg.points.length - 1;
  return Math.max(0.3, leg.minutes / Math.max(1, last) || 1);
}

// Where a point is along a leg, as a stop index with a fraction, or null when it isn't near
// the leg at all. The same as alongLeg in js/trip.js, from the first stop.
export function alongLeg(here, pts) {
  const kx = 111320 * Math.cos((here[0] * Math.PI) / 180);
  const ky = 110540;
  let best = null;
  let bestM = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][1] * kx, ay = pts[i][0] * ky;
    const dx = pts[i + 1][1] * kx - ax, dy = pts[i + 1][0] * ky - ay;
    const px = here[1] * kx - ax, py = here[0] * ky - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
    const m = Math.hypot(px - t * dx, py - t * dy);
    if (m < bestM) [best, bestM] = [i + t, m];
  }
  return bestM <= ON_ROUTE_M ? best : null;
}

export function alertText(trip, left) {
  const leg = trip.legs[trip.leg];
  const last = trip.leg === trip.legs.length - 1;
  return left === 0
    ? `Get off now at ${leg.to}.`
    : `Get off in ${left} stop${left === 1 ? '' : 's'}, at ${leg.to}${last ? '' : ', to change'}.`;
}

function closest(list, expect) {
  let best = null;
  for (const p of list) if (Math.abs(p - expect) <= MATCH_STOPS && (best == null || Math.abs(p - expect) < Math.abs(best - expect))) best = p;
  return best;
}

// Where you probably are on this leg now, and the bus being followed, if any. `buses` is
// LTA's tracked buses for the leg as [{ lat, lng }], or null for a leg with none.
function whereNow(trip, leg, buses, now) {
  const last = leg.points.length - 1;
  const per = perStop(leg);
  const stopsSince = (t) => Math.max(0, now - t) / 60000 / per;
  const known = Math.max(trip.pos || 0, trip.at || 0);
  // By the clock from the last place the app was sure of, as the app's own clock goes
  // (clockPos in js/trip.js): a good fix, a realignment, or the leg's start once the wait is
  // over. Its time can be ahead while the app waits for the bus to come.
  // Not for a bus the app hasn't yet seen you riding (clockRuns): waiting at the stop isn't
  // riding. A bus that LTA shows leaving with you still counts, below.
  const from = trip.anchor || { pos: 0, t: trip.legStartedAt + (leg.wait || 0) * 60000 };
  const clockRuns = trip.clockRuns !== false || leg.kind !== 'bus';
  const clock = clockRuns ? Math.min(last, Math.max(known, from.pos + stopsSince(from.t))) : known;
  const track = trip.track;

  if (!buses) return { pos: track ? Math.min(last, track.pos + stopsSince(track.t)) : clock, track };
  const seen = buses.map((b) => alongLeg([b.lat, b.lng], leg.points)).filter((p) => p != null);

  let pick = null;
  if (track) {
    pick = closest(seen.filter((p) => p >= track.pos - 0.3), track.pos + stopsSince(track.t));
    // Gone from the arrivals after nearly reaching the stop: it's there.
    if (pick == null) return { pos: track.pos >= last - 1.5 ? last : track.pos, track };
  } else if (known >= 0.5) {
    // On board when the app last looked: the bus nearest where that one should be by now.
    pick = closest(seen.filter((p) => p >= known - 0.5), known + stopsSince(trip.seenAt));
    if (pick == null) return { pos: clock, track: null };
  } else {
    // Still waiting at the first stop: of the buses that could have left it since, the first.
    const left = seen.filter((p) => p <= stopsSince(trip.seenAt) + 0.5);
    if (!left.length) return { pos: known, track: null };
    pick = Math.max(...left);
  }
  const pos = Math.min(last, Math.max(track?.pos ?? 0, pick));
  return { pos, track: { pos, t: now } };
}

// One minute of a trip. Updates it in place, and says what to send: the alert's text, if
// it's time, and whether the trip is over.
export function step(trip, buses, now) {
  const leg = trip.legs[trip.leg];
  const last = leg.points.length - 1;
  const { pos, track } = whereNow(trip, leg, buses, now);
  trip.track = track ?? null;
  trip.est = pos;

  let alert = null;
  if (pos >= last - ALERT_STOPS - LEAD_STOPS && !trip.alerted[trip.leg]) {
    trip.alerted[trip.leg] = true;
    alert = { text: alertText(trip, Math.max(0, Math.round(last - pos))), leg: trip.leg };
  }

  let done = false;
  if (pos >= last - 0.2) {
    if (trip.leg < trip.legs.length - 1) {
      Object.assign(trip, { leg: trip.leg + 1, at: 0, pos: 0, legStartedAt: now, seenAt: now, anchor: null, track: null, est: 0 });
    } else {
      done = true;
    }
  }
  return { alert, done };
}

// How long a trip is kept without word from the app: twice what's left of it, plus half an
// hour, so one abandoned mid-way doesn't linger.
export function ttlSeconds(trip, now) {
  const left = trip.legs.slice(trip.leg).reduce((sum, l) => sum + l.minutes + (l.wait || 0), 0);
  const since = Math.max(0, now - trip.legStartedAt) / 60000;
  return Math.round(Math.min(6 * 60, Math.max(0, left * 2 - since) + 30) * 60);
}
