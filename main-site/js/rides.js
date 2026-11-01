// Rides really taken (help desk #6), for the Easter eggs and their secrets (js/eggs.js): each
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
// Every MRT and LRT line ridden at least once (UNLOCK) is a feat, worth uwuCoins, and so are the
// buses js/eggs.js asks for: each ride kept is handed to Eggs.rides, and Eggs.feat('lines') once
// every line's been ridden.
//
// Rides on trips from before these checks (27 October 2026) are kept from Your trips, once
// (addPast, js/retrofit.js).
//
// Window.RideCheck = { see(trip, i, here, accuracy), done(trip, i), verdict(leg, seen),
// record(), addPast(trips), unlocked(), progress(), LINES }. The console's simulateRide('12')
// counts a ride for a look (below). Plain script: exports go on window.
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
  // A shuttle bus (js/nav.js, `shuttle`) is no public bus number, so it's kept by none.
  const busOf = (leg) => (leg.shuttle ? '' : String(leg.service || leg.route || String(leg.label || '').replace(/^\D+/, '')).toUpperCase());

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

  // The rule, Augy's (27 October 2026): every MRT and LRT line ridden at least once, on any
  // trips. Each trip's lines and buses are kept too (trips), should another rule be wanted.
  const UNLOCK = (rec) => LINES.every((l) => rec.lines[l]?.n >= 1);

  // Whether Your colours is unlocked, by whichever egg (js/eggs.js).
  const unlocked = () => {
    try { return !!localStorage.getItem(UNLOCKED_KEY); } catch { return false; }
  };
  const linesFound = () => !!window.Eggs?.feats().includes('lines');

  function checkUnlock(rec) {
    window.Eggs?.rides(rec);
    if (!linesFound() && UNLOCK(rec)) window.Eggs?.feat('lines');
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
    // Nearly there: the celebration's three.js fetched ahead, in case the last line's offline.
    if (!linesFound() && LINES.filter((l) => !(rec.lines[l]?.n >= 1)).length <= 2) window.Celebrate?.prefetch();
    return true;
  }

  // Trips from before the rides were checked (js/retrofit.js), as Your trips keeps them
  // (js/history.js): each ride they got through (done) kept by line or bus, as if it had been
  // judged real, on trips not kept here already. There's nothing left to judge them by, so the
  // ride being got through stands in. Then the feats, as after any ride.
  function addPast(trips) {
    const rec = record();
    const have = new Set(rec.trips.map((t) => t.id));
    let added = 0;
    const bump = (map, key, at) => {
      const was = map[key];
      map[key] = { n: (was?.n || 0) + 1, first: Math.min(was?.first || at, at), last: Math.max(was?.last || at, at) };
    };
    for (const trip of trips || []) {
      if (!trip?.id || have.has(trip.id)) continue;
      const at = Number(trip.startedAt) || Date.now();
      const entry = { id: trip.id, at, lines: [], buses: [], past: true };
      for (const leg of trip.legs || []) {
        if (!leg?.done) continue;
        if (leg.kind === 'train') {
          const line = lineOf(leg);
          if (!LINES.includes(line)) continue;
          bump(rec.lines, line, at);
          if (!entry.lines.includes(line)) entry.lines.push(line);
          added++;
        } else if (leg.kind === 'bus') {
          const bus = String(leg.route || '').trim().toUpperCase();
          // A public bus's number (a shuttle's route, such as A1, isn't one).
          if (!/^\d{1,3}[A-Z]{0,2}$/.test(bus)) continue;
          bump(rec.buses, bus, at);
          if (!entry.buses.includes(bus)) entry.buses.push(bus);
          added++;
        }
      }
      if (entry.lines.length || entry.buses.length) {
        rec.trips.push(entry);
        have.add(trip.id);
      }
    }
    if (!added) return 0;
    rec.trips = rec.trips.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, MAX_TRIPS);
    keep(rec);
    checkUnlock(rec);
    return added;
  }

  // The lines ridden and still to ride, for saying how far along it is.
  function progress() {
    const rec = record();
    return { done: LINES.filter((l) => rec.lines[l]?.n >= 1), left: LINES.filter((l) => !(rec.lines[l]?.n >= 1)) };
  }

  // In the browser's console (or chrome://inspect's, for the Android app), for a look at
  // Achievements without the rides:
  //   simulateRide('12', 'NE', 'BP')   a ride on bus 12, the NE Line and the Bukit Panjang LRT,
  //                                    kept as a real one is, so the bars move and the bus and
  //                                    line feats are done as they would be
  //   simulateRide('undo')             the rides it added taken back (a feat done stays done)
  //   simulateRide('help')             this, in words
  // What it added is noted under SIM_KEY, for undo. This browser's own storage and nothing else.
  const SIM_KEY = 'sgbus_rides_simulated';
  const RIDE_HELP = `simulateRide('12', 'NE', ...) counts a real ride on each bus or MRT and LRT line given (lines: ${LINES.join(', ')}), for Achievements; simulateRide('undo') takes back the rides it added; simulateRide('help') shows this.`;
  window.simulateRide = (...what) => {
    let added;
    try { added = JSON.parse(localStorage.getItem(SIM_KEY) || '[]'); } catch { added = []; }
    if (!Array.isArray(added)) added = [];
    if (what[0] === 'undo') {
      if (!added.length) return 'nothing to undo';
      const rec = record();
      for (const { kind, key } of added) {
        const map = rec[kind];
        if (map?.[key]) map[key].n -= 1;
        if (map?.[key] && map[key].n < 1) delete map[key];
      }
      keep(rec);
      try { localStorage.removeItem(SIM_KEY); } catch { /* kept */ }
      return `${added.length} ride${added.length === 1 ? '' : 's'} taken back`;
    }
    const rides = what.map((w) => {
      const v = String(w ?? '').trim().toUpperCase();
      const line = SAME_LINE[v] || v;
      if (LINES.includes(line)) return { kind: 'lines', key: line };
      if (/^\d{1,3}[A-Z]{0,2}$/.test(v)) return { kind: 'buses', key: v };
      return null;
    });
    if (!rides.length || rides.includes(null)) return RIDE_HELP;
    const rec = record();
    const now = Date.now();
    for (const { kind, key } of rides) {
      const was = rec[kind][key];
      rec[kind][key] = { n: (was?.n || 0) + 1, first: was?.first || now, last: now };
    }
    keep(rec);
    try { localStorage.setItem(SIM_KEY, JSON.stringify([...added, ...rides])); } catch { /* no undo */ }
    checkUnlock(rec);
    const p = progress();
    return `ridden: ${rides.map((r) => (r.kind === 'lines' ? `${r.key} Line` : `bus ${r.key}`)).join(', ')}. ${p.done.length} of ${LINES.length} lines ridden.`;
  };

  window.RideCheck = { see, done, verdict, record, addPast, unlocked, progress, LINES };
})();
