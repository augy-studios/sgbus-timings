// The Get Off Alert while the app is in the background (api/push/trip-poll.js). A website
// gets no location once it's hidden, so the server follows the bus instead: LTA's bus
// arrivals at the stop you get off at say where each bus heading there is, and yours is the
// one where the app last saw you, moved on by the time since. After that it's followed
// minute by minute. Trains, and buses LTA isn't tracking, go by the clock, as the app does
// underground.
//
// Keep ALERT_STOPS, ON_ROUTE_M and the alert's wording in step with js/trip.js.
//
// Get ready to board, too: while the app hasn't seen you get on (clockRuns false) and no bus
// has been seen leaving the stop with you, the bus's next arrival at the stop you wait at
// (`board`) is checked, and once it's about a minute away you're told, once per leg. The cron
// runs once a minute, so this tells you a little earlier than the app does (BOARD_MS there).

export const ALERT_STOPS = 2;
// Near enough to the leg to be on it: the straight line between two stops, or as much of it
// as the road may bend away from it (BEND_SHARE), on a long stretch like an expressway.
const ON_ROUTE_M = 250;
const BEND_SHARE = 0.3;
// How far, in stops, a bus may be from where yours should be and still be taken for it.
const MATCH_STOPS = 2;
// The cron runs once a minute, so the alert goes this much of a stop early rather than late.
const LEAD_STOPS = 0.5;
// While you wait at the first stop, a bus only counts as having left with you if it could
// have left in about this long: the cron's minute, and a missed one. Any further on, it was
// already on its way before the last look, likely before you got to the stop at all.
const LEFT_WINDOW_MS = 3 * 60 * 1000;

export const BOARD_MS = 90 * 1000;
// A bus LTA has as already at the stop for longer than this has likely gone.
const BOARD_GONE_MS = -30 * 1000;

function perStop(leg) {
  const last = leg.points.length - 1;
  return Math.max(0.3, leg.minutes / Math.max(1, last) || 1);
}

// Where a point is along a leg, as a stop index with a fraction, or null when it isn't near
// the leg at all. The same as alongLeg in js/trip.js without a road, from the first stop.
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
    if (m <= Math.max(ON_ROUTE_M, BEND_SHARE * Math.sqrt(len2)) && m < bestM) [best, bestM] = [i + t, m];
  }
  return best;
}

// Whether there's another ride after this leg, to change to: walks don't count.
const ridesAfter = (trip) => trip.legs.slice(trip.leg + 1).some((l) => l.kind !== 'walk');

export function alertText(trip, left) {
  const leg = trip.legs[trip.leg];
  const last = !ridesAfter(trip);
  return left === 0
    ? `Get off now at ${leg.to}.`
    : `Get off in ${left} stop${left === 1 ? '' : 's'}, at ${leg.to}${last ? '' : ', to change'}.`;
}

// The same as boardText in js/trip.js.
export function boardText(leg, eta) {
  const label = leg.label || `Bus ${leg.service}`;
  const where = leg.boardName || 'your stop';
  return eta <= 20 * 1000
    ? `${label} is arriving at ${where}. Get ready to board.`
    : `${label} is 1 min away from ${where}. Get ready to board.`;
}

// Whether to ask how far the bus is from the stop you wait at: a bus leg with one, its ping
// not given, and you not on board, as far as either side knows. The app says it isn't sure
// you've boarded (clockRuns false; an older app doesn't say, and isn't asked for), the server
// isn't following a bus you're on (track), and neither has you past the first stop.
export function waitingToBoard(trip) {
  const leg = trip.legs[trip.leg];
  if (leg?.kind !== 'bus' || !leg.board || !leg.service) return false;
  if (trip.readied?.[trip.leg] || trip.clockRuns !== false || trip.track) return false;
  return Math.max(trip.at || 0, trip.pos || 0, trip.est || 0) < 0.5;
}

// Get ready to board's text, if it's time, given the next bus's arrival in ms from now. Run
// after step, so a bus that has just left with you rules it out.
export function boardStep(trip, eta) {
  if (eta == null || !waitingToBoard(trip) || eta > BOARD_MS || eta <= BOARD_GONE_MS) return null;
  (trip.readied ??= trip.legs.map(() => false))[trip.leg] = true;
  return { text: boardText(trip.legs[trip.leg], eta), leg: trip.leg };
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
    // Still waiting at the first stop: of the buses that could have left it since the app saw
    // you there, and lately (LEFT_WINDOW_MS), the first. Not just since the app saw you: after
    // a long wait, that would take a bus that left well before you got there, stops ahead.
    const left = seen.filter((p) => p <= stopsSince(Math.max(trip.seenAt, now - LEFT_WINDOW_MS)) + 0.5);
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
  // No alert for a walk: it's by the clock here, and there's nothing to get off.
  if (leg.kind !== 'walk' && pos >= last - ALERT_STOPS - LEAD_STOPS && !trip.alerted[trip.leg]) {
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
