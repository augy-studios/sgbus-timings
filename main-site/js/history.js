// Your trips, as Citymapper's Go Trips: every trip taken with the Get Off Alert (js/trip.js),
// newest first and grouped by week, then the stats over all of them: Trip Mix, the time spent
// walking, waiting and riding, and Trip Modes, the share of rides taken with each operator.
//
// A trip is kept once at least one ride on it was taken; one ended before the first bus or
// train came leaves nothing. trip.js hands over the trip as it stands at each step (record),
// and the rides and their times are worked out here:
//
//   waiting  from the leg's start to boarding, when the fixes showed you board (less the walk
//            to the first stop, on the first leg); otherwise the plan's wait.
//   riding   from boarding to getting off, when both were seen; a train from the leg's start
//            to its end less the plan's wait; otherwise the plan's ride time, or the share of
//            it covered on a ride the trip ended partway along.
//   walking  always the plan's walks, before the first ride and after each one finished.
//
// A measured time far off the plan (a trip started well before leaving, a bar left running
// after getting off) goes by the plan instead. Kept in this browser only, up to MAX_TRIPS,
// and offered to favourites sync (js/sync.js) as the "Trips" kind.
//
// Loaded before script.js and uses its helpers ($, escapeHtml, ico, ...), so nothing here
// draws until the panel opens. Plain script: exports go on window.
(function () {
  const KEY = 'sgbus_trips';
  const MAX_TRIPS = 1000;
  // Trips shown before All trips.
  const RECENT = 5;
  // A waited time over this was the trip started early, not a wait.
  const MAX_WAIT_MIN = 60;
  // A measured ride outside this share of the plan's (plus a little) wasn't the ride.
  const RIDE_MIN_SHARE = 0.3;
  const RIDE_MAX_SHARE = 3;
  // An end this near a saved place is named after it: "To Home".
  const NEAR_PLACE_M = 150;

  const OPERATORS = { SBST: 'SBS Transit', SMRT: 'SMRT', TTS: 'Tower Transit', GAS: 'Go-Ahead Singapore' };
  const SG_OFFSET_MS = 8 * 3600 * 1000;
  const DAY_MS = 24 * 3600 * 1000;

  const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short' });
  const shortFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
  const day = (ms) => dayFmt.format(ms).replace(',', '');

  // ---------- storage ----------

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function store(trips) {
    trips.sort((a, b) => b.startedAt - a.startedAt);
    try {
      localStorage.setItem(KEY, JSON.stringify(trips.slice(0, MAX_TRIPS)));
    } catch (err) {
      console.warn("couldn't save Your trips:", err);
    }
    if (!$('#tripsSection').hidden) render();
  }

  // ---------- a trip from trip.js ----------

  const minutes = (ms) => ms / 60000;
  const point = (p) => (Array.isArray(p) ? { lat: p[0], lng: p[1] } : null);

  function operatorOf(service) {
    try {
      return window.BusNet?.isReady?.() ? BusNet.serviceInfo(service)?.op || '' : '';
    } catch {
      return '';
    }
  }

  // The rides taken on a trip as trip.js has it, each with its times, or null with none.
  function fromSnapshot(s) {
    const legs = [];
    let walkMin = 0;
    let endedAt = s.startedAt;

    s.legs.forEach((leg, i) => {
      const t = s.times?.[i] || {};
      const current = i === s.leg;
      const done = i < s.leg || (current && !!s.arrived);
      const taken = done || (current && (s.boarded || s.at > 0 || (s.pos || 0) >= 0.5));
      if (!taken) return;
      const last = Math.max(1, leg.points.length - 1);
      const planRide = leg.minutes || 0;
      const planWait = leg.wait || (leg.kind === 'bus' ? When.BUS_WAIT_MIN : 0);

      let waitMin = planWait;
      let waitMeasured = false;
      if (t.gps && t.board && t.start) {
        const w = minutes(t.board - t.start) - (i === 0 ? s.walkBefore || 0 : 0);
        if (w <= MAX_WAIT_MIN) {
          waitMin = Math.max(0, w);
          waitMeasured = true;
        }
      }

      const share = done ? 1 : Math.min(1, Math.max(s.at || 0, s.pos || 0) / last);
      let rideMin = planRide * share;
      let rideMeasured = false;
      let measured = null;
      if (t.gps && t.board && t.end) measured = minutes(t.end - t.board);
      else if (leg.kind === 'train' && t.start && t.end) measured = minutes(t.end - t.start) - planWait;
      const plan = planRide * share;
      if (measured != null && measured >= 0 && (!done || (measured >= plan * RIDE_MIN_SHARE && measured <= plan * RIDE_MAX_SHARE + 10))) {
        rideMin = measured;
        rideMeasured = true;
      }

      if (i === 0) walkMin += s.walkBefore || 0;
      if (done) walkMin += leg.walkAfter || 0;
      endedAt = Math.max(endedAt, t.end || 0, t.board || 0, t.start || 0);

      legs.push({
        kind: leg.kind === 'train' ? 'train' : 'bus',
        route: leg.kind === 'train' ? leg.route || leg.label.replace(/ (Line|LRT)$/, '') : leg.service || leg.label.replace(/^Bus /, ''),
        ...(leg.kind === 'train' ? { color: leg.color || '', lrt: !!leg.lrt } : { op: operatorOf(leg.service) }),
        from: leg.names?.[0] || '',
        to: leg.to || '',
        waitMin: Math.round(waitMin * 10) / 10,
        rideMin: Math.round(rideMin * 10) / 10,
        waitMeasured,
        rideMeasured,
        done,
      });
    });
    if (!legs.length) return null;

    const first = s.legs[0];
    const final = s.legs[s.legs.length - 1];
    // "Your location" means nothing once you've left it: named after the first stop instead.
    let from = s.from || { label: first.names?.[0] || 'Start', ...point(first.points[0]) };
    if (from.label === 'Your location') from = { ...from, label: first.names?.[0] ? `Near ${first.names[0]}` : 'Where you started' };
    const to = s.to || { label: final.to, ...point(final.points[final.points.length - 1]) };

    return {
      id: s.tripId,
      startedAt: s.startedAt,
      endedAt,
      title: s.title || '',
      from: { label: from.label, lat: from.lat, lng: from.lng },
      to: { label: to.label, lat: to.lat, lng: to.lng },
      arrived: !!s.arrived,
      walkMin: Math.round(walkMin * 10) / 10,
      legs,
    };
  }

  // From trip.js, at each step of a trip: kept, replacing what was kept of it before, or, with
  // no ride taken yet, nothing (and anything kept of it dropped).
  function record(snapshot) {
    const kept = fromSnapshot(snapshot);
    const before = load();
    const trips = before.filter((t) => t.id !== snapshot.tripId);
    if (!kept && trips.length === before.length) return;
    if (kept) trips.push(kept);
    store(trips);
  }

  function remove(id) {
    store(load().filter((t) => t.id !== id));
  }

  // ---------- sync (js/sync.js) ----------

  const isPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 1.15 && p.lat < 1.48 && p.lng > 103.55 && p.lng < 104.1;
  const text = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);

  // A trip from another device, checked field by field, or null.
  function clean(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[\w-]{8,64}$/.test(raw.id)) return null;
    if (!Number.isFinite(raw.startedAt) || !isPoint(raw.from) || !isPoint(raw.to) || !Array.isArray(raw.legs) || !raw.legs.length) return null;
    const legs = raw.legs.slice(0, 20).filter((l) => l && (l.kind === 'bus' || l.kind === 'train')).map((l) => ({
      kind: l.kind,
      route: text(l.route, 12),
      ...(l.kind === 'train'
        ? { color: /^#[0-9a-f]{3,8}$/i.test(l.color || '') ? l.color : '', lrt: !!l.lrt }
        : { op: text(l.op, 8) }),
      from: text(l.from),
      to: text(l.to),
      waitMin: num(l.waitMin, 600),
      rideMin: num(l.rideMin, 600),
      waitMeasured: !!l.waitMeasured,
      rideMeasured: !!l.rideMeasured,
      done: !!l.done,
    }));
    if (!legs.length) return null;
    return {
      id: raw.id,
      startedAt: raw.startedAt,
      endedAt: Number.isFinite(raw.endedAt) ? raw.endedAt : raw.startedAt,
      title: text(raw.title),
      from: { label: text(raw.from.label) || 'Start', lat: raw.from.lat, lng: raw.from.lng },
      to: { label: text(raw.to.label) || 'End', lat: raw.to.lat, lng: raw.to.lng },
      arrived: !!raw.arrived,
      walkMin: num(raw.walkMin, 600),
      legs,
    };
  }

  // Adds the trips this device doesn't have, and says how many that was. Never replaces one.
  function merge(trips) {
    const have = load();
    const ids = new Set(have.map((t) => t.id));
    const added = trips.filter((t) => !ids.has(t.id));
    if (added.length) store([...have, ...added]);
    return added.length;
  }

  // ---------- how a trip reads ----------

  function chip(leg) {
    if (leg.kind === 'bus') return `<span class="busChip">${ico('bus')} ${escapeHtml(leg.route)}</span>`;
    const dot = leg.color ? `<span class="lineDot" style="--line:${escapeHtml(leg.color)}"></span>` : '';
    return `<span class="busChip lineChip">${dot}${escapeHtml(leg.route)}</span>`;
  }

  const chips = (trip) => trip.legs.map(chip).join('<span class="tripDot" aria-hidden="true">&middot;</span>');

  // Where a trip went, by a saved place's name when it ended at one.
  function toName(trip) {
    return window.Places?.nameNear(trip.to, NEAR_PLACE_M) || trip.to.label;
  }

  function duration(min) {
    const m = Math.round(min);
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }

  const planned = (measured) => (measured ? '' : ' <span class="tripPlanned">(planned)</span>');

  function details(trip) {
    const legs = trip.legs.map((l) =>
      `<li class="tripLeg">${chip(l)}<div>` +
      `<p>${escapeHtml(l.from ? `${l.from} to ${l.to}` : `To ${l.to}`)}${l.done ? '' : ' <span class="tripPlanned">(ended partway)</span>'}</p>` +
      `<p class="tripTimes">Waited ${duration(l.waitMin)}${planned(l.waitMeasured)} &middot; Rode ${duration(l.rideMin)}${planned(l.rideMeasured)}</p>` +
      `</div></li>`
    ).join('');
    const total = trip.walkMin + trip.legs.reduce((sum, l) => sum + l.waitMin + l.rideMin, 0);
    return `<div class="tripDetails">` +
      `<ol class="tripLegs">${legs}</ol>` +
      (trip.walkMin ? `<p class="tripTimes">${ico('walk')} Walked ${duration(trip.walkMin)} <span class="tripPlanned">(planned)</span></p>` : '') +
      `<p class="tripTimes">About ${duration(total)} in all, from ${escapeHtml(When.clock(trip.startedAt))}${trip.arrived ? '' : '. Ended before getting there'}.</p>` +
      `<div class="tripActions">` +
      `<button type="button" class="iconBtn" data-trip-act="plan" data-trip="${escapeHtml(trip.id)}">${ico('navigate')} Plan again</button>` +
      `<button type="button" class="iconBtn" data-trip-act="share" data-trip="${escapeHtml(trip.id)}">${ico('share')} Share</button>` +
      `<button type="button" class="iconBtn" data-trip-act="delete" data-trip="${escapeHtml(trip.id)}">${ico('trash')} Delete</button>` +
      `</div></div>`;
  }

  function row(trip) {
    const open = openId === trip.id;
    return `<div class="tripRow${open ? ' open' : ''}">` +
      `<button type="button" class="tripRowMain" data-trip-open="${escapeHtml(trip.id)}" aria-expanded="${open}">` +
      `<span class="tripWhen">${escapeHtml(day(trip.startedAt))} &middot; ${escapeHtml(When.clock(trip.startedAt))}</span>` +
      `<span class="tripChips">${chips(trip)}<span class="tripTo">To ${escapeHtml(toName(trip))}</span></span>` +
      `</button>` +
      (open ? details(trip) : '') +
      `</div>`;
  }

  // Monday of the week a moment falls in, Singapore's, as a moment.
  function weekStart(ms) {
    const d = new Date(ms + SG_OFFSET_MS);
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - SG_OFFSET_MS;
    return midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS;
  }

  function weeks(trips) {
    const groups = [];
    for (const trip of trips) {
      const start = weekStart(trip.startedAt);
      if (groups[groups.length - 1]?.start !== start) groups.push({ start, trips: [] });
      groups[groups.length - 1].trips.push(trip);
    }
    return groups.map((g) =>
      `<section class="tripWeek card">` +
      `<p class="tripWeekHead">${escapeHtml(day(g.start))} - ${escapeHtml(day(g.start + 6 * DAY_MS))}</p>` +
      g.trips.map(row).join('') +
      `</section>`
    ).join('');
  }

  // ---------- stats ----------

  function modeOf(leg) {
    if (leg.kind === 'train') return leg.lrt ? 'LRT' : 'MRT';
    const op = leg.op || operatorOf(leg.route);
    return OPERATORS[op] || op || 'Bus';
  }

  const pct = (part, whole) => `${whole ? Math.round((part / whole) * 100) : 0}%`;

  function statRow(icon, label, value) {
    return `<div class="statRow">${icon ? ico(icon) : ''}<span class="statLabel">${escapeHtml(label)}</span><span class="statValue">${escapeHtml(value)}</span></div>`;
  }

  function stats(trips) {
    let walk = 0;
    let wait = 0;
    let ride = 0;
    const modes = new Map();
    let rides = 0;
    for (const trip of trips) {
      walk += trip.walkMin;
      for (const leg of trip.legs) {
        wait += leg.waitMin;
        ride += leg.rideMin;
        const mode = modeOf(leg);
        modes.set(mode, (modes.get(mode) || 0) + 1);
        rides++;
      }
    }
    const all = walk + wait + ride;
    const since = trips[trips.length - 1].startedAt;
    const byCount = [...modes].sort((a, b) => b[1] - a[1]);
    return `<h3 class="statsTitle">Stats</h3>` +
      `<p class="statsSince">${plural(trips.length, 'trip')} and ${plural(rides, 'ride')} since ${escapeHtml(shortFmt.format(since))}, about ${escapeHtml(duration(all))} on the move.</p>` +
      `<p class="statsHead">Trip Mix</p>` +
      `<div class="statsCard card">` +
      statRow('walk', `Walking - ${duration(walk)}`, pct(walk, all)) +
      statRow('clock', `Waiting - ${duration(wait)}`, pct(wait, all)) +
      statRow('navigate', `Riding - ${duration(ride)}`, pct(ride, all)) +
      `</div>` +
      `<p class="statsHead">Trip Modes</p>` +
      `<div class="statsCard card">` +
      byCount.map(([mode, n]) => statRow('', `${mode} (${plural(n, 'ride')})`, pct(n, rides))).join('') +
      `</div>` +
      `<p class="estimateNote">Waiting and riding are measured on the trip where your location showed when you got on; otherwise, and for walking, they're the plan's. Trip Modes counts each bus or train you got on.</p>`;
  }

  // ---------- the panel ----------

  let showAll = false;
  let openId = null;

  function render() {
    const trips = load();
    const body = $('#tripsBody');
    if (!trips.length) {
      body.innerHTML = `<div class="empty">No trips yet. Start a trip from Navigate, Plan a route or a bus's route (Get Off Alert), and each one you take shows here, with your stats.</div>`;
      return;
    }
    const shown = showAll ? trips : trips.slice(0, RECENT);
    body.innerHTML =
      weeks(shown) +
      (trips.length > RECENT
        ? `<button type="button" class="btn tripsAll" data-trips-all>${showAll ? 'Fewer trips' : `All trips (${trips.length})`}</button>`
        : '') +
      `<hr class="tripsRule">` +
      stats(trips) +
      `<button type="button" class="iconBtn tripsClear" data-trips-clear>${ico('trash')} Clear Your trips</button>`;
  }

  function open() {
    showAll = false;
    openId = null;
    render();
    showPanel('tripsSection', true);
  }

  function close() {
    showPanel('tripsSection', false);
  }

  function share(trip) {
    const legs = trip.legs.map((l) => (l.kind === 'bus' ? `Bus ${l.route}` : l.route)).join(', ');
    window.Share.directions({ from: trip.from, to: trip.to, summary: `${legs}, taken ${day(trip.startedAt)}` });
  }

  function init() {
    $('#tripsBtn').addEventListener('click', () => ($('#tripsSection').hidden ? open() : close()));
    $('#tripsClose').addEventListener('click', close);
    wirePanel('tripsSection', close);
    $('#tripsBody').addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-trip-open]');
      if (toggle) {
        openId = openId === toggle.dataset.tripOpen ? null : toggle.dataset.tripOpen;
        render();
        return;
      }
      if (e.target.closest('[data-trips-all]')) {
        showAll = !showAll;
        render();
        return;
      }
      if (e.target.closest('[data-trips-clear]')) {
        if (confirm('Clear every trip from Your trips on this device? Your stats go with them.')) store([]);
        return;
      }
      const act = e.target.closest('[data-trip-act]');
      if (!act) return;
      const trip = load().find((t) => t.id === act.dataset.trip);
      if (!trip) return;
      if (act.dataset.tripAct === 'plan') {
        close();
        openNav(trip.from, trip.to);
      } else if (act.dataset.tripAct === 'share') {
        share(trip);
      } else if (act.dataset.tripAct === 'delete' && confirm('Delete this trip from Your trips?')) {
        remove(trip.id);
      }
    });
  }

  window.TripHistory = { init, open, record, list: load, clean, merge, chip, toName, day };
})();
