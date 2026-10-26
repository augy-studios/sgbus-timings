// Rides really taken (help desk #6), for the secret colours (js/theme.js, Your colours): each
// bus or train ride on a trip (js/trip.js) counts once it's shown to be real, by the phone's
// location and the time it took, and is kept by line and by bus.
//
// A ride is real when:
//   - the phone was seen near where it starts (START_M), and then near where it ends (END_M):
//     a ride skipped through with Next, ended early or taken with no location never is;
//   - it took at least MIN_SHARE of the time it's planned to, and never faster than a bus or
//     a train goes (MAX_KMH), from the last fix at the start to the first at the end;
//   - on a bus with stops between its ends, the phone was seen near some of them on the way
//     (ALONG_SHARE of them, at least one). A train goes underground, where the location gives
//     out, so its timing stands in for that.
// Fixes rougher than FIX_M are left out. What's seen is kept on the trip (trip.seen[leg]), so it
// lasts a reload, and the ride is judged once, as the trip moves on from it or ends.
//
// Kept under KEY as { lines: { EW: { n, first, last } }, buses: { "174": {...} }, trips: [{ id,
// at, lines, buses }] }: the Changi Airport branch (CG) is the East-West Line's (EW), and the
// Circle Line's extension (CE) the Circle Line's, and the LRT loops' halves their line's. Not synced, so it's the rides taken with
// this phone.
//
// The unlock is one rule (UNLOCK), with the others it could be beside it: Augy's to choose.
// Unlocked once, it stays (UNLOCKED_KEY), and "rides:unlocked" fires on window.
//
// Window.RideCheck = { see(trip, i, here, accuracy), done(trip, i), verdict(leg, seen),
// record(), unlocked(), progress(), LINES }. Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_rides';
  const UNLOCKED_KEY = 'sgbus_colours_unlocked';
  const START_M = 300;
  const END_M = 300;
  const ALONG_M = 250;
  const FIX_M = 150;
  const MIN_SHARE = 0.5;
  const ALONG_SHARE = 0.25;
  const MAX_KMH = { bus: 70, train: 100 };
  const MAX_TRIPS = 50;
  // Every MRT and LRT line: the six MRT lines and the three LRT ones.
  const LINES = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK', 'PG'];
  // The LRT loops' stations go by SE and SW (Sengkang) and PE and PW (Punggol).
  const SAME_LINE = { CG: 'EW', CE: 'CC', SE: 'SK', SW: 'SK', PE: 'PG', PW: 'PG' };

  function metres([lat1, lng1], [lat2, lng2]) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  const isRide = (leg) => leg && (leg.kind === 'bus' || leg.kind === 'train') && Array.isArray(leg.points) && leg.points.length >= 2;
  const lineOf = (leg) => {
    const code = String(leg.route || leg.label || '').toUpperCase().match(/^[A-Z]{2}/)?.[0] || '';
    return SAME_LINE[code] || code;
  };
  const busOf = (leg) => String(leg.service || leg.route || String(leg.label || '').replace(/^\D+/, '')).toUpperCase();

  // A fix on ride `i` of the trip, as js/trip.js gets one.
  function see(trip, i, here, accuracy) {
    const leg = trip?.legs?.[i];
    if (!isRide(leg) || !(accuracy <= FIX_M)) return;
    const seen = ((trip.seen ??= [])[i] ??= { fixes: 0, startAt: null, endAt: null, along: [] });
    if (seen.judged) return;
    const t = Date.now();
    const last = leg.points.length - 1;
    seen.fixes++;
    // Near the start, before it's been seen at the end: the last of these is when it left.
    if (seen.endAt == null && metres(here, leg.points[0]) <= START_M) seen.startAt = t;
    if (seen.startAt != null && seen.endAt == null && metres(here, leg.points[last]) <= END_M && t > seen.startAt) seen.endAt = t;
    if (seen.startAt != null && seen.endAt == null) {
      for (let k = 1; k < last; k++) {
        if (!seen.along.includes(k) && metres(here, leg.points[k]) <= ALONG_M) seen.along.push(k);
      }
    }
  }

  // Whether ride `leg` was really taken, by what was `seen` of it: { ok, why }.
  function verdict(leg, seen) {
    if (!isRide(leg)) return { ok: false, why: 'not a ride' };
    if (!seen || seen.startAt == null) return { ok: false, why: 'never seen at the start' };
    if (seen.endAt == null) return { ok: false, why: 'never seen at the end' };
    const ms = seen.endAt - seen.startAt;
    const planned = Math.max(1, leg.minutes || 1) * 60000;
    if (ms < planned * MIN_SHARE) return { ok: false, why: 'too quick for the ride' };
    const km = metres(leg.points[0], leg.points[leg.points.length - 1]) / 1000;
    if (km / (ms / 3600000) > MAX_KMH[leg.kind]) return { ok: false, why: 'faster than it goes' };
    const between = leg.points.length - 2;
    if (leg.kind === 'bus' && between >= 2) {
      const need = Math.max(1, Math.ceil(between * ALONG_SHARE));
      if ((seen.along || []).length < need) return { ok: false, why: 'not seen along the way' };
    }
    return { ok: true, why: '' };
  }

  function record() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && typeof v === 'object') return { lines: v.lines || {}, buses: v.buses || {}, trips: Array.isArray(v.trips) ? v.trips : [] };
    } catch { /* none yet */ }
    return { lines: {}, buses: {}, trips: [] };
  }

  function keep(rec) {
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* counted again next ride */ }
  }

  // The rules it could be. UNLOCK is the one in use.
  const RULES = {
    // Every MRT and LRT line ridden at least once, on any trips.
    everyLine: (rec) => LINES.every((l) => rec.lines[l]?.n >= 1),
    // One trip on 5 different MRT and LRT lines, or on 5 different buses.
    fiveInOneTrip: (rec) => rec.trips.some((t) => t.lines.length >= 5 || t.buses.length >= 5),
  };
  const UNLOCK = RULES.everyLine;

  const unlocked = () => {
    try { return !!localStorage.getItem(UNLOCKED_KEY); } catch { return false; }
  };

  function checkUnlock(rec) {
    if (unlocked() || !UNLOCK(rec)) return;
    try { localStorage.setItem(UNLOCKED_KEY, String(Date.now())); } catch { /* asked again next ride */ }
    window.dispatchEvent(new Event('rides:unlocked'));
  }

  // Ride `i` of the trip is over (js/trip.js, endLegTime): judged once, and kept if it was real.
  function done(trip, i) {
    const leg = trip?.legs?.[i];
    if (!isRide(leg)) return null;
    const seen = ((trip.seen ??= [])[i] ??= { fixes: 0, startAt: null, endAt: null, along: [] });
    if (seen.judged) return seen.ok;
    const v = verdict(leg, seen);
    seen.judged = true;
    seen.ok = v.ok;
    seen.why = v.why;
    if (!v.ok) return false;
    const rec = record();
    const now = Date.now();
    const bump = (map, key) => {
      const was = map[key];
      map[key] = { n: (was?.n || 0) + 1, first: was?.first || now, last: now };
    };
    let entry = rec.trips.find((t) => t.id === trip.tripId);
    if (!entry) {
      entry = { id: trip.tripId, at: now, lines: [], buses: [] };
      rec.trips.unshift(entry);
      rec.trips = rec.trips.slice(0, MAX_TRIPS);
    }
    if (leg.kind === 'train') {
      const line = lineOf(leg);
      if (line) {
        bump(rec.lines, line);
        if (!entry.lines.includes(line)) entry.lines.push(line);
      }
    } else {
      const bus = busOf(leg);
      if (bus) {
        bump(rec.buses, bus);
        if (!entry.buses.includes(bus)) entry.buses.push(bus);
      }
    }
    keep(rec);
    checkUnlock(rec);
    return true;
  }

  // The lines ridden and still to ride, for saying how far along it is.
  function progress() {
    const rec = record();
    return { done: LINES.filter((l) => rec.lines[l]?.n >= 1), left: LINES.filter((l) => !(rec.lines[l]?.n >= 1)) };
  }

  window.RideCheck = { see, done, verdict, record, unlocked, progress, LINES, RULES };
})();
