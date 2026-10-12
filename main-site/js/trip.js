// The Get Off Alert: while you're on a trip, the site follows your live location along each
// bus or train ride and alerts you about two stops before you get off, at a change or at the
// end. On by default; Settings turns it off.
//
// A website only gets your location while it's open with the screen on, so the trip keeps
// the screen awake (the Wake Lock API) while it runs. Underground, where GPS gives out, it
// falls back on the time each ride should take. With notifications allowed, the trip is also
// sent to the server, which follows the bus from LTA's live positions while the app is in the
// background and pushes the alert itself (api/push/trip-poll.js).
//
// Trip.start({ title, legs, to, from, walkBefore }) with legs of
// { kind: "bus" | "train" | "walk", label, to, points: [[lat, lng], ...], names, minutes, wait,
//   walkAfter, service, board, alight, route, color, lrt }, and `to` (optional) the place it
// ends at, { label, lat, lng }, for a live ETA link (js/share.js); `walkAfter` is the minutes
// walked after the ride, to the next one or the end, for the same. `from` (optional) is where
// it starts and `walkBefore` the minutes walked to the first ride, for Your trips
// (js/history.js); a train leg's `route`, `color` and `lrt` are its line, for the same.
//
// Your trips hears of the trip as it goes (record): when it starts, as each ride is boarded
// and left, and as it ends, so a tab closed mid-trip still leaves the rides taken so far.
// `points` are the stops from boarding to alighting, so a leg of 5 stops has 6 points, and
// `names` (optional) names each of them for the timeline. A bus leg's `service` and `alight`
// (the stop code you get off at) let the server find the bus, and `board` (the stop code you
// get on at) lets the clock wait for it; without them it goes by the clock alone.
//
// A walk leg (js/nav.js's tripFromNav) is the way on foot from the start to the first stop,
// between two rides, or from the last stop to the end: two points, where it starts and where it
// ends, and how long it should take. You're along it by how near its end you are, or by the
// clock without a fix, and it's done once you're there; a ride that ends at a walk is done
// once you're off. No Get Off Alert for a walk.
//
// In the Android app (2.0.0 and later), the trip's followed by the app's own service
// (TripPlugin, through js/app-bridge.js) instead of the page: it keeps your location coming with
// the screen off, shows the trip in a notification (its End trip ends it here too), and
// sounds the alert over the lock screen. The page still works everything out; the screen
// needn't stay on.
//
// Tapping the trip bar opens that timeline: the stops still ahead, with a blue dot where you
// are, gliding between stops like a progress bar. It's drawn once a frame only while the dot
// is moving, and moved with transforms, so an open timeline doesn't make the page lag. A bus
// leg's `codes` (optional) are the stop codes of its points: with them, tapping a stop on the
// timeline closes it and opens that stop's timings for the bus, below.
//
// Get ready to board: while you wait at the stop for a bus leg's bus (not on board yet: the
// fixes haven't shown you moving along its route), its live timing at your stop (`board`) is
// checked, and once it's about a minute away you're told, once per leg: a notification, a buzz
// and the bar. The server does the same while the app's in the background (api/_push/trip.js),
// and each side hears of the other's (`readied`), so it's said only once.
//
// A bus leg's stops alone are a poor guide to where the bus goes: the straight line from one
// to the next can be kilometres off an expressway. So at the start each bus leg's road is
// fetched (/api/road, kept in `trip.roads`), and you're followed along it, within ON_ROAD_M.
// Without it (the router's down), the straight lines are used with room for the road to bend.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const SETTING_KEY = "sgbus.getOffAlert";
  const SAVED_KEY = "sgbus.trip";

  const ALERT_STOPS = 2;
  // A fix this accurate counts; a rough one (indoors, underground) is ignored.
  const GOOD_FIX_M = 150;
  // A rough fix up to this is still good enough to tell you're nowhere near where the trip
  // has you, and realign it (see realign), though not to move you on.
  const ROUGH_FIX_M = 500;
  // Further than this, beyond the fix's own accuracy, from where the trip has you, and the
  // trip is wrong: the clock ran on while you waited indoors, or a stray fix sent it ahead.
  const REALIGN_M = 400;
  // While you wait at the first stop with no good fix, its live timings are checked this
  // often, and the clock held until your bus is due.
  const HOLD_CHECK_MS = 30 * 1000;
  // On board for sure once the fixes have moved you this many stops along the route within
  // this long (noteMove), or this far down its road, away from the stop you got on at.
  const MOVE_STOPS = 0.5;
  const MOVE_M = 200;
  const LEFT_STOP_M = 300;
  const MOVE_WINDOW_MS = 10 * 60 * 1000;
  // Fixes come many times a second; one this often is kept to tell you've moved.
  const MOVE_SAMPLE_MS = 3 * 1000;
  // Near enough to a stop on the leg to say you're there.
  const ON_ROUTE_M = 250;
  // Near enough to a bus leg's road (trip.roads) to be on it.
  const ON_ROAD_M = 100;
  // Without the road, as much of the straight line between two stops as the road may bend
  // away from it, at least ON_ROUTE_M.
  const BEND_SHARE = 0.3;
  // A fix comes many times a second: the bar and the saved trip are brought up to date at most
  // this often. The timeline's dot eases between them on its own.
  const REDRAW_MS = 500;
  // With no good fix for this long, go by the clock instead.
  const FIX_STALE_MS = 60 * 1000;
  const TICK_MS = 15 * 1000;
  // "OFF" in Morse code (--- ..-. ..-.), buzz and pause in turn, with a 120 ms dot: a dash is
  // three dots, the gap inside a letter one dot, and between letters three. Keep sw.js in step.
  const VIBRATION = [
    360, 120, 360, 120, 360, 360, // O  ---
    120, 120, 120, 120, 360, 120, 120, 360, // F  ..-.
    120, 120, 120, 120, 360, 120, 120, // F  ..-.
  ];

  // The timeline's dot closes this share of the gap to where you are every FRAME_MS, at
  // whatever rate the screen draws, so it eases rather than jumps when a new fix comes in.
  const FRAME_MS = 50;
  const EASE = 0.15;
  // With no fix, the clock moves the dot on slowly; this often it's checked for that.
  const NUDGE_MS = 1000;

  // Get ready to board: the bus's timing at your stop is checked this often while you wait,
  // and more often once it's close, and you're told once it's this near. Keep BOARD_MS and the
  // wording in step with api/_push/trip.js.
  const BOARD_CHECK_MS = 30 * 1000;
  const BOARD_CHECK_NEAR_MS = 15 * 1000;
  const BOARD_NEAR_MS = 3 * 60 * 1000;
  const BOARD_MS = 75 * 1000;
  // A bus LTA has as already at the stop for longer than this has likely gone.
  const BOARD_GONE_MS = -30 * 1000;
  // Two short buzzes: not the Get Off Alert's "OFF".
  const BOARD_VIBRATION = [200, 120, 200];

  let trip = null;
  let watchId = null;
  let nativeSubs = null; // the app's location and end events, while it follows the trip
  let nativeText = null; // what its notification last said
  let tick = null;
  let wakeLock = null;
  let expanded = false;
  let frame = null; // the pending animation frame, while the dot is moving
  let nudge = null;
  let lastFrame = null;
  let shown = null; // the dot's drawn position, as a stop index with a fraction
  let builtLeg = null;
  let shownStop = null;
  let geo = null; // the current leg's column, measured (see measure)
  let passedUpTo = null;

  const enabled = () => {
    try {
      return localStorage.getItem(SETTING_KEY) !== "off";
    } catch {
      return true;
    }
  };

  function setEnabled(on) {
    try {
      if (on) localStorage.removeItem(SETTING_KEY);
      else localStorage.setItem(SETTING_KEY, "off");
    } catch {}
  }

  const isWalk = (leg) => leg?.kind === "walk";
  // On a walk, this near its end and you're there.
  const WALK_ARRIVE_M = 40;
  const inApp = () => Boolean(window.AppBridge?.native && AppBridge.has("trip"));

  function metres([lat1, lng1], [lat2, lng2]) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function save() {
    try {
      if (trip) sessionStorage.setItem(SAVED_KEY, JSON.stringify(trip));
      else sessionStorage.removeItem(SAVED_KEY);
    } catch {}
  }

  // ---------- starting and ending ----------

  function start({ title, legs, to = null, from = null, walkBefore = 0 }) {
    if (!legs?.length) return;
    // A trip still running is over as this one starts: Your trips keeps what it got to.
    if (trip) {
      endLegTime();
      record();
    }
    stop(false);
    boardCheckedAt = 0;
    boardEta = null;
    roadsAsked = null;
    const now = Date.now();
    trip = {
      tripId: crypto.randomUUID(),
      title,
      legs,
      to,
      from,
      walkBefore,
      startedAt: now,
      leg: 0,
      at: 0, // the index of the stop you're at or have just passed, on the current leg
      legStartedAt: now,
      lastFixAt: 0,
      alerted: legs.map(() => false),
      // Whether each leg's Get ready to board was given.
      readied: legs.map(() => false),
      // Each bus leg's road (fetchRoads), as { path, stops, cum }; false if there's none to
      // be had, null if it's not been got yet.
      roads: legs.map(() => null),
      noLocation: false,
      // When each leg began, was boarded (`gps` when the fixes showed it) and ended.
      times: legs.map((_, i) => (i === 0 ? { start: now } : {})),
    };
    save();
    record();
    run();
    // Asked once, so the alert can also show as a notification over a locked screen's wake.
    // Once allowed, the server can send it while the app is in the background too.
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(sync).catch(() => {});
  }

  function run() {
    if (!trip) return;
    render();
    if (inApp()) followNatively();
    else watchHere();
    tick = setInterval(onTick, TICK_MS);
    keepAwake();
    sync();
    watchBoard();
    fetchRoads();
  }

  // Each bus leg's road, once per trip (a reload asks again for any it didn't get).
  let roadsAsked = null;
  function fetchRoads() {
    if (!trip || roadsAsked === trip) return;
    roadsAsked = trip;
    const asked = trip;
    asked.roads ??= asked.legs.map(() => null);
    asked.legs.forEach(async (leg, i) => {
      if (leg.kind !== "bus" || leg.points.length < 2 || asked.roads[i] != null) return;
      try {
        const points = leg.points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";");
        const res = await fetch(`/api/road?points=${encodeURIComponent(points)}`);
        if (!res.ok) return;
        const road = await res.json();
        if (trip !== asked) return;
        asked.roads[i] = road?.path?.length >= 2 && road.stops?.length === leg.points.length ? withCum(road) : false;
        save();
      } catch {}
    });
  }

  // The road with the distance along it to each of its points, for alongRoad.
  function withCum({ path, stops }) {
    const cum = [0];
    for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + metres(path[k - 1], path[k]));
    // The stops as measured on the server, scaled to this measure of the path.
    const scale = stops[stops.length - 1] ? cum[cum.length - 1] / stops[stops.length - 1] : 1;
    return { path, stops: stops.map((m) => m * scale), cum };
  }

  const roadOf = (leg) => trip?.roads?.[trip.legs.indexOf(leg)] || null;

  function watchHere() {
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    } else {
      trip.noLocation = true;
    }
  }

  // The app's TripService: its fixes come here as the browser's would, screen off or not.
  function followNatively() {
    const asked = trip;
    nativeSubs = [
      AppBridge.on("Trip", "location", (f) => onFix({ coords: { latitude: f.lat, longitude: f.lng, accuracy: f.accuracy } })),
      AppBridge.on("Trip", "end", () => stop()),
    ];
    nativeText = statusText();
    AppBridge.call("Trip", "start", { title: trip.title, text: nativeText }).catch((err) => {
      if (trip !== asked) return;
      if (err?.code === "permission") {
        trip.noLocation = true;
        render();
      } else if (err?.code !== "ended") {
        // The app couldn't: the page follows the trip itself, while it's on screen.
        console.warn("the app couldn't follow the trip:", err);
        dropNative();
        watchHere();
      }
    });
  }

  function dropNative() {
    nativeSubs?.forEach((sub) => sub.remove());
    nativeSubs = null;
    nativeText = null;
  }

  function stop(clear = true) {
    if (clear && trip) {
      endLegTime();
      record();
    }
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (nativeSubs) {
      dropNative();
      AppBridge.call("Trip", "stop").catch(() => {});
    }
    clearInterval(tick);
    tick = null;
    releaseAwake();
    if (clear) {
      // A trip being shared as a live ETA link says it's over (js/share.js).
      if (trip) window.dispatchEvent(new CustomEvent("trip:end", { detail: { tripId: trip.tripId } }));
      trip = null;
      save();
      unsync();
      setExpanded(false);
      $("#tripBar").classList.add("hidden");
      document.body.classList.remove("on-trip");
    }
  }

  // ---------- where you are ----------

  function onFix(pos) {
    const accuracy = pos.coords.accuracy;
    if (!trip || accuracy > ROUGH_FIX_M) return;
    const here = [pos.coords.latitude, pos.coords.longitude];
    const leg = trip.legs[trip.leg];
    if (accuracy <= GOOD_FIX_M) trip.me = { lat: here[0], lng: here[1], accuracy: Math.round(accuracy), t: Date.now() };
    if (isWalk(leg)) return onWalkFix(here, accuracy, leg);
    if (realign(here, accuracy, leg)) return;
    if (accuracy > GOOD_FIX_M) return;
    trip.lastFixAt = Date.now();
    trip.noLocation = false;

    // Not yet on the bus for sure: you stay at the first stop, and the clock waits, until the
    // fixes show you moving along its route (noteMove).
    if (!underWay(leg) && !noteMove(here, alongLeg(here, leg, 0))) {
      trip.anchor = { pos: 0, t: Date.now() };
      soon();
      return;
    }

    const road = roadOf(leg);
    // The nearest stop on this leg at or past the last one, so a fix that wobbles behind
    // can't send you back; realign deals with one that's really somewhere else.
    let best = -1;
    let bestM = Infinity;
    for (let i = Math.max(0, trip.at - 1); i < leg.points.length; i++) {
      const m = metres(here, leg.points[i]);
      if (m < bestM) [best, bestM] = [i, m];
    }
    if (best !== -1 && bestM <= (road ? ON_ROAD_M : ON_ROUTE_M)) trip.at = Math.max(trip.at, best);
    // How far between stops, for the timeline's dot; and every stop behind that, passed. On
    // the road that's sure enough to go by, so a stop passed at speed, between fixes, or one
    // after a long stretch that the fixes never came near counts all the same.
    const along = alongLeg(here, leg, trip.at);
    if (along != null) {
      trip.pos = Math.max(trip.pos || 0, along);
      trip.at = Math.max(trip.at, Math.floor(along + 0.001));
      trip.onLegAt = Date.now();
    }
    // The clock goes on from here if the fixes stop.
    trip.anchor = { pos: Math.max(trip.pos || 0, trip.at), t: Date.now() };

    // Off at the end of this leg and already near the next one's first stop: on to it.
    const next = trip.legs[trip.leg + 1];
    if (next && trip.at >= leg.points.length - 1 && metres(here, next.points[0]) <= ON_ROUTE_M) nextLeg();
    check();
  }

  // On a walk: how far along it you are, by how much nearer its end you are than its start, and
  // there once you're near it. Never back, so a wobbling fix doesn't undo the way walked.
  function onWalkFix(here, accuracy, leg) {
    if (accuracy > GOOD_FIX_M) return;
    const now = Date.now();
    trip.lastFixAt = now;
    trip.noLocation = false;
    const start = leg.points[0];
    const end = leg.points[leg.points.length - 1];
    const left = metres(here, end);
    const pos = Math.min(1, Math.max(0, 1 - left / Math.max(1, metres(start, end))));
    trip.pos = Math.max(trip.pos || 0, pos);
    trip.anchor = { pos: trip.pos, t: now };
    trip.onLegAt = now;
    if (left <= WALK_ARRIVE_M + Math.min(accuracy, 40)) {
      trip.at = 1;
      trip.pos = 1;
    }
    check();
  }

  // Whether this leg is under way for sure. A bus leg is once the fixes have shown you moving
  // along its route (noteMove); until then the trip keeps you at the first stop and the clock
  // doesn't run, so waiting for the bus never counts as riding it. A train leg goes by the
  // clock from the start, as GPS gives out underground, and so does any leg with location
  // turned off, where the clock is all there is.
  function underWay(leg) {
    return Boolean(trip.boarded) || leg.kind !== "bus" || trip.noLocation;
  }

  // Whether there's another ride after this leg, to change to.
  const ridesAfter = () => trip.legs.slice(trip.leg + 1).some((l) => !isWalk(l));

  // Good fixes along the leg before boarding, as { along, m, t }, one every MOVE_SAMPLE_MS:
  // `m` is how far down the route that is, in metres. Boarded once you're really moving down
  // the route, not a fix wobbling about the stop you wait at: LEFT_STOP_M from the stop and
  // MOVE_M further down than a fix in the last MOVE_WINDOW_MS (or the leg's whole time, if
  // that's longer, for a long stretch with no stop); or at or past the second stop and
  // MOVE_STOPS on from such a fix; or at any stop after the first, within ON_ROAD_M of it.
  // Says whether you're now on board.
  function noteMove(here, along) {
    if (along == null) return false;
    const now = Date.now();
    const leg = trip.legs[trip.leg];
    const m = metresAlong(leg, along);
    const span = Math.max(MOVE_WINDOW_MS, (leg.minutes || 0) * 60000);
    const moves = (trip.moves || []).filter((x) => now - x.t <= span);
    const fromStop = metres(here, leg.points[0]);
    // A stop by the one you got on at (across the road, on a route that comes back) doesn't count.
    const atStop = leg.points.some((p, i) => i > 0 && metres(here, p) <= ON_ROAD_M && metres(p, leg.points[0]) >= LEFT_STOP_M);
    const moved = atStop
      || (fromStop >= LEFT_STOP_M && moves.some((x) => m - (x.m ?? 0) >= MOVE_M))
      || (along >= 1 && fromStop > ON_ROAD_M && moves.some((x) => along - x.along >= MOVE_STOPS));
    const lastT = moves.length ? moves[moves.length - 1].t : 0;
    trip.moves = now - lastT >= MOVE_SAMPLE_MS ? [...moves.slice(-240), { along, m, t: now }] : moves;
    if (!moved) return false;
    trip.boarded = true;
    trip.moves = [];
    // Boarded about as long ago as riding this far along takes, by the leg's own time per
    // stop, though not before the last fix that still had you at the stop.
    const t = trip.times[trip.leg];
    if (t) {
      const perStopMs = ((leg.minutes || 0) / Math.max(1, leg.points.length - 1)) * 60000;
      const waiting = moves.filter((x) => x.along < 0.25).map((x) => x.t);
      const board = Math.max(now - along * perStopMs, ...waiting, t.start || 0);
      Object.assign(t, { board: Math.min(now, board), gps: true });
    }
    sync();
    record();
    return true;
  }

  // Checked on every fix, rough ones too: if you're clearly not where the trip has you, it
  // moves to the stop you're at, backwards if need be. That's how it recovers when the
  // clock ran on while you waited somewhere GPS can't reach, like inside an interchange, or
  // when a stray fix sent it ahead. Wobbles of a stop or two never trigger it. Says whether
  // it moved.
  function realign(here, accuracy, leg) {
    if (leg.points.length < 2) return false;
    const believed = Math.min(leg.points.length - 1, target());
    const i = Math.floor(believed);
    const j = Math.min(leg.points.length - 1, i + 1);
    const f = believed - i;
    const shownAt = [
      leg.points[i][0] + (leg.points[j][0] - leg.points[i][0]) * f,
      leg.points[i][1] + (leg.points[j][1] - leg.points[i][1]) * f,
    ];
    if (metres(here, shownAt) <= accuracy + REALIGN_M) return false;

    let best = -1;
    let bestM = Infinity;
    leg.points.forEach((p, k) => {
      const m = metres(here, p);
      if (m < bestM) [best, bestM] = [k, m];
    });
    if (best === -1 || bestM > accuracy + ON_ROUTE_M) return false;
    // Ahead only once you're on board for sure; before that only back to the first stop.
    if (best > believed && !underWay(leg)) return false;

    const now = Date.now();
    const along = accuracy <= GOOD_FIX_M ? alongLeg(here, leg, 0) : null;
    trip.at = best;
    trip.pos = along ?? best;
    trip.anchor = { pos: trip.pos, t: now };
    trip.realignedAt = now;
    if (accuracy <= GOOD_FIX_M) trip.lastFixAt = trip.onLegAt = now;
    trip.noLocation = false;
    // Back at the first stop: you're waiting for the bus, not on it.
    if (best === 0) {
      trip.boarded = false;
      trip.moves = [];
      const t = trip.times[trip.leg];
      if (t) delete t.board;
    }
    // Moved back before the alert stop: the alert that went off too early can go off again.
    const last = leg.points.length - 1;
    if (trip.at < last - ALERT_STOPS && trip.alerted[trip.leg]) {
      trip.alerted[trip.leg] = false;
      trip.alertText = null;
    }
    shown = null; // the dot jumps rather than gliding back across the stops
    save();
    sync();
    check();
    return true;
  }

  function onFixError(err) {
    if (!trip) return;
    if (err.code === 1) trip.noLocation = true; // permission refused: the clock only
    render();
  }

  // How far the ride should have got by the clock, from the last place it was sure of (a good
  // fix, a realignment, or the leg's start once the wait for the bus is over) and the time
  // it was there. Null for a leg with no time to go by.
  function clockPos(leg) {
    if (!leg.minutes) return null;
    const last = leg.points.length - 1;
    const from = trip.anchor || { pos: 0, t: trip.legStartedAt + (leg.wait || 0) * 60000 };
    const perStop = leg.minutes / Math.max(1, last);
    return Math.min(last, from.pos + Math.max(0, Date.now() - from.t) / 60000 / perStop);
  }

  // No good fix lately that put you on the leg: the clock moves you on. A fix that comes but
  // is off the leg (the road's left it for a bit, or without the road, the straight line's far
  // from it) doesn't hold the clock up.
  const stale = () => Date.now() - (trip.onLegAt || 0) > FIX_STALE_MS;

  // Without a recent good fix, how far the ride should have got by the clock.
  function onTick() {
    if (!trip) return;
    const leg = trip.legs[trip.leg];
    if (stale() && underWay(leg)) {
      holdForBus(leg);
      const guess = clockPos(leg);
      if (guess != null) {
        trip.at = Math.max(trip.at, Math.floor(guess));
        check();
      }
    }
    watchBoard();
    render();
  }

  // Still at the first stop with no good fix, often inside an interchange: the clock waits
  // for your bus, by its live timing there, rather than setting off as soon as the trip
  // starts. Only before the clock has you halfway to the second stop, so a ride that has
  // begun isn't pulled back by the next bus's timing.
  let holdCheckedAt = 0;
  async function holdForBus(leg) {
    if (leg.kind !== "bus" || !leg.service || !leg.board) return;
    if (Math.max(trip.at, trip.pos || 0, clockPos(leg) ?? 0) >= 0.5) return;
    if (Date.now() - holdCheckedAt < HOLD_CHECK_MS) return;
    holdCheckedAt = Date.now();
    const asked = trip;
    try {
      const res = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(leg.board)}&service=${encodeURIComponent(leg.service)}`, { cache: "no-store" });
      if (!res.ok) return;
      const svc = (await res.json()).services?.find((s) => String(s.serviceNo).toUpperCase() === String(leg.service).toUpperCase());
      const eta = svc?.next?.eta_ms;
      if (trip !== asked || asked.legs[asked.leg] !== leg || eta == null || eta <= 60 * 1000) return;
      trip.anchor = { pos: 0, t: Date.now() + eta };
      trip.at = 0;
      trip.pos = 0;
      save();
      render();
    } catch {}
  }

  // Where a point is along a leg, as a stop index with a fraction: 3.4 is 40% of the way
  // from its fourth stop to its fifth, from the one before `from` on; null when the point isn't
  // on the leg. On the leg's road if it has one (alongRoad); otherwise on the nearest stretch
  // between two stops, allowing for the road to bend away from the straight line.
  function alongLeg(here, leg, from) {
    const road = roadOf(leg);
    if (road) return alongRoad(here, road, from);
    const pts = leg.points;
    const kx = 111320 * Math.cos((here[0] * Math.PI) / 180);
    const ky = 110540;
    let best = null;
    let bestM = Infinity;
    for (let i = Math.max(0, from - 1); i < pts.length - 1; i++) {
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

  // The same on the leg's road: the nearest point on it within ON_ROAD_M, from the stop before
  // `from` on, as a stop index with a fraction by distance along the road.
  function alongRoad(here, { path, stops, cum }, from) {
    const kx = 111320 * Math.cos((here[0] * Math.PI) / 180);
    const ky = 110540;
    const after = stops[Math.max(0, Math.min(stops.length - 1, Math.floor(from) - 1))];
    let k0 = 0;
    while (k0 < path.length - 2 && cum[k0 + 1] <= after) k0++;
    let bestD = null;
    let bestM = Infinity;
    for (let k = k0; k < path.length - 1; k++) {
      const ax = path[k][1] * kx, ay = path[k][0] * ky;
      const dx = path[k + 1][1] * kx - ax, dy = path[k + 1][0] * ky - ay;
      const px = here[1] * kx - ax, py = here[0] * ky - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const m = Math.hypot(px - t * dx, py - t * dy);
      // A later stretch has to be clearly nearer to win, where the road comes back along itself.
      if (m < bestM - (bestM <= ON_ROAD_M ? 15 : 0)) [bestD, bestM] = [cum[k] + t * (cum[k + 1] - cum[k]), m];
    }
    if (bestM > ON_ROAD_M) return null;
    const last = stops.length - 1;
    let i = 0;
    while (i < last - 1 && stops[i + 1] <= bestD) i++;
    const span = stops[i + 1] - stops[i];
    return Math.min(last, i + (span > 0 ? Math.max(0, Math.min(1, (bestD - stops[i]) / span)) : 1));
  }

  // How far down a leg a place along it is, in metres: on its road, or the straight lines.
  function metresAlong(leg, along) {
    const road = roadOf(leg);
    const i = Math.min(leg.points.length - 1, Math.floor(along));
    const j = Math.min(leg.points.length - 1, i + 1);
    if (road) return road.stops[i] + (road.stops[j] - road.stops[i]) * (along - i);
    let m = 0;
    for (let k = 0; k < i; k++) m += metres(leg.points[k], leg.points[k + 1]);
    return m + metres(leg.points[i], leg.points[j]) * (along - i);
  }

  // ---------- get ready to board ----------

  // Whether you're waiting at the stop for this leg's bus: a bus leg with a stop and service to
  // ask about, its ping not yet given, and you not on board. On board is when the fixes have
  // shown you moving along its route (noteMove); without location, once the clock's moved you
  // half a stop on. A recent good fix already along the route counts as on board too, before
  // noteMove is sure of it.
  function waitingForBus() {
    const leg = trip?.legs[trip.leg];
    if (leg?.kind !== "bus" || !leg.service || !leg.board) return false;
    if (trip.readied?.[trip.leg] || trip.boarded || target() >= 0.5) return false;
    if (trip.me && Date.now() - trip.me.t < FIX_STALE_MS && (alongLeg([trip.me.lat, trip.me.lng], leg, 0) ?? 0) >= 0.5) return false;
    return true;
  }

  let boardCheckedAt = 0;
  let boardEta = null; // the last timing heard, to check more often once it's close
  let boardAsking = false;
  async function watchBoard() {
    if (!trip || !waitingForBus() || boardAsking) return;
    const every = boardEta != null && boardEta <= BOARD_NEAR_MS ? BOARD_CHECK_NEAR_MS : BOARD_CHECK_MS;
    // It's run on the tick, so half a tick's slack keeps it from slipping a whole tick late.
    if (Date.now() - boardCheckedAt < every - TICK_MS / 2) return;
    boardCheckedAt = Date.now();
    boardAsking = true;
    const asked = trip;
    const legAt = trip.leg;
    const leg = trip.legs[legAt];
    try {
      const res = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(leg.board)}&service=${encodeURIComponent(leg.service)}`, { cache: "no-store" });
      if (!res.ok) return;
      const svc = (await res.json()).services?.find((s) => String(s.serviceNo).toUpperCase() === String(leg.service).toUpperCase());
      const eta = svc?.next?.eta_ms;
      boardEta = eta ?? null;
      // Checked again after the wait: still the same leg, and still not on board.
      if (trip !== asked || trip.leg !== legAt || eta == null || !waitingForBus()) return;
      if (eta <= BOARD_MS && eta > BOARD_GONE_MS) readyToBoard(leg, eta);
    } catch {
    } finally {
      boardAsking = false;
    }
  }

  function boardText(leg, eta) {
    const where = stopName(leg, 0);
    return eta <= 20 * 1000
      ? `${leg.label} is arriving at ${where}. Get ready to board.`
      : `${leg.label} is 1 min away from ${where}. Get ready to board.`;
  }

  function readyToBoard(leg, eta) {
    const text = boardText(leg, eta);
    trip.readied[trip.leg] = true;
    trip.boardText = text;
    if (navigator.vibrate) navigator.vibrate(BOARD_VIBRATION);
    notify({ title: "Get ready to board", body: text, tag: "board", vibrate: BOARD_VIBRATION, channel: "board" });
    flash();
    save();
    render();
    sync();
  }

  // The server said it while the app was in the background (sw.js, or the app's push through
  // js/alerts.js): shown on the bar, and not said again. If the page hasn't, and you're still
  // waiting, it's shown as a notification here too, as a push to an app in front isn't.
  function readiedElsewhere({ tripId, leg, text }, show = false) {
    if (!trip || tripId !== trip.tripId || trip.readied?.[leg]) return;
    const waiting = leg === trip.leg && waitingForBus();
    trip.readied[leg] = true;
    if (waiting) {
      trip.boardText = text;
      if (show) notify({ title: "Get ready to board", body: text, tag: "board", vibrate: BOARD_VIBRATION, channel: "board" });
      flash();
    }
    save();
    render();
  }

  // A notification, wherever the site is: in the Android app, through the app (on `channel`,
  // if this build has it); in the desktop app, through it; otherwise from the service worker.
  function notify({ title, body, tag, vibrate, channel }) {
    if (window.AppBridge?.native) {
      if (AppBridge.has("notify")) {
        // Every 2.0 build has alerts and get_off; board came in 2.0.4.
        const ch = channel === "board" && !AppBridge.has("board") ? "alerts" : channel;
        AppBridge.notify({ channel: ch, tag, title, body, url: "/" });
      }
      return;
    }
    if (window.sgbusDesktop?.notify) {
      window.sgbusDesktop.notify({ title, body });
      return;
    }
    navigator.serviceWorker?.ready
      .then((reg) => {
        if (Notification.permission !== "granted") return;
        return reg.showNotification(title, {
          body,
          tag,
          renotify: true,
          requireInteraction: true,
          vibrate,
          icon: "/sgbusicon1.png",
          badge: "/sgbusnotificon.png",
          data: { url: "/", kind: tag },
        });
      })
      .catch(() => {});
  }

  function flash() {
    const bar = $("#tripBar");
    bar.classList.add("alerting");
    setTimeout(() => bar.classList.remove("alerting"), 8000);
  }

  function nextLeg() {
    endLegTime();
    trip.leg += 1;
    trip.times[trip.leg] = { start: Date.now() };
    trip.at = 0;
    trip.pos = 0;
    trip.anchor = null;
    trip.boarded = false;
    trip.moves = [];
    trip.alertText = null;
    trip.boardText = null;
    trip.legStartedAt = Date.now();
    shown = null;
    save();
    sync();
    record();
    boardCheckedAt = 0;
    watchBoard();
  }

  // ---------- Your trips (js/history.js) ----------

  // The leg on now has ended, if it hadn't: changed from, arrived at, or the trip ended on it.
  function endLegTime() {
    const t = trip.times?.[trip.leg];
    if (t && !t.end) t.end = Date.now();
  }

  // The trip as it stands, for Your trips to keep. It works out the rides taken and their
  // times itself, so nothing here has to.
  function record() {
    if (!trip || !window.TripHistory) return;
    const { tripId, title, from, to, walkBefore, startedAt, legs, times, leg, at, pos, boarded, arrived, noLocation } = trip;
    try {
      window.TripHistory.record({ tripId, title, from, to, walkBefore, startedAt, legs, times, leg, at, pos, boarded, arrived, noLocation });
    } catch (err) {
      console.warn("couldn't keep the trip in Your trips:", err);
    }
  }

  function stopsLeft() {
    const leg = trip.legs[trip.leg];
    return Math.max(0, leg.points.length - 1 - trip.at);
  }

  function check() {
    const left = stopsLeft();
    const leg = trip.legs[trip.leg];
    const next = trip.legs[trip.leg + 1];
    if (!isWalk(leg) && left <= ALERT_STOPS && !trip.alerted[trip.leg]) {
      trip.alerted[trip.leg] = true;
      if (enabled()) alertNow(left);
    }
    // At the end of a walk, or off a ride with a walk next: on to the next leg.
    if (left === 0 && next && (isWalk(leg) || isWalk(next))) {
      nextLeg();
      render();
      return;
    }
    // At the last stop of the last leg: the trip's done.
    if (left === 0 && trip.leg === trip.legs.length - 1) {
      if (!trip.arrived) {
        trip.arrived = true;
        endLegTime();
        save();
        record();
      }
      render("You've arrived.");
      setTimeout(() => stop(), 60 * 1000);
      return;
    }
    soon();
  }

  // The bar and the saved trip brought up to date, at most every REDRAW_MS: fixes come many
  // times a second.
  let soonTimer = null;
  let soonAt = 0;
  function soon() {
    if (soonTimer) return;
    soonTimer = setTimeout(() => {
      soonTimer = null;
      soonAt = Date.now();
      if (!trip) return;
      save();
      render();
    }, Math.max(0, soonAt + REDRAW_MS - Date.now()));
  }

  // ---------- the alert ----------

  function alertNow(left) {
    const leg = trip.legs[trip.leg];
    const last = !ridesAfter();
    const text = left === 0
      ? `Get off now at ${leg.to}.`
      : `Get off in ${left} stop${left === 1 ? "" : "s"}, at ${leg.to}${last ? "" : ", to change"}.`;

    if (navigator.vibrate) navigator.vibrate(VIBRATION);
    beep();
    // In the app, its own notification, which sounds over the lock screen even with the page
    // in the background.
    if (nativeSubs) AppBridge.call("Trip", "alert", { title: "Get Off Alert", body: text }).catch(() => {});
    else notify({ title: "Get Off Alert", body: text, tag: "get-off", vibrate: VIBRATION, channel: "get_off" });
    flash();
    // The bar keeps saying so until you pass another stop, rather than until the next
    // redraw, which comes straight after this.
    trip.alertText = text;
    trip.alertLeft = left;
    render(text);
    sync();
  }

  // The server sent the alert (it follows the bus too, from LTA's live positions): shown on
  // the bar. From sw.js, which has already shown it as a notification, it isn't sounded again;
  // from the app while it's in front (`sound`), where Android shows nothing for a push, it's
  // sounded here as if the page had found it, unless the page already has.
  function alertedElsewhere({ tripId, leg, text }, sound = false) {
    if (!trip || tripId !== trip.tripId || trip.alerted[leg]) return;
    trip.alerted[leg] = true;
    if (leg === trip.leg) {
      if (sound && enabled()) {
        if (navigator.vibrate) navigator.vibrate(VIBRATION);
        beep();
        if (nativeSubs) AppBridge.call("Trip", "alert", { title: "Get Off Alert", body: text }).catch(() => {});
        else notify({ title: "Get Off Alert", body: text, tag: "get-off", vibrate: VIBRATION, channel: "get_off" });
      }
      trip.alertText = text;
      trip.alertLeft = stopsLeft();
      flash();
    }
    save();
    render();
  }

  // ---------- the server, for while the app is in the background ----------
  // Sent at the start, at each change of leg or alert, and as the app goes into or comes back
  // from the background. The answer says how far the server has got, so a change of leg or an
  // alert it made while the app was away is picked up here.

  const TRIPS_API = "/api/push/trips";
  let pushTo = null; // { deviceId, subscription }, from js/alerts.js

  async function sync() {
    if (!trip || !enabled()) return;
    try {
      pushTo ??= await window.Alerts.pushTarget();
    } catch (err) {
      console.warn("get off alert can't subscribe:", err);
    }
    if (!pushTo || !trip) return;
    const body = JSON.stringify({
      tripId: trip.tripId,
      subscription: pushTo.subscription,
      legs: trip.legs.map((l) => ({
        kind: l.kind, to: l.to, points: l.points, minutes: l.minutes || 0, wait: l.wait || 0, service: l.service, alight: l.alight,
        label: l.label, walkAfter: l.walkAfter || 0,
        // For Get ready to board: the stop you get on at, and its name.
        board: l.board, boardName: l.kind === "bus" ? stopName(l, 0).slice(0, 80) : undefined,
      })),
      // A live ETA link, kept updated by the server while the app is in the background.
      share: trip.share || null,
      leg: trip.leg,
      at: trip.at,
      pos: trip.pos || 0,
      legStartedAt: trip.legStartedAt,
      seenAt: trip.lastFixAt || trip.legStartedAt,
      // Where the clock goes on from, and when the trip last moved itself back (realign):
      // the server takes the app's place and alerts over its own after that.
      anchor: trip.anchor || null,
      realignedAt: trip.realignedAt || 0,
      // Whether the clock may move you on: not on a bus until you're on board for sure.
      clockRuns: underWay(trip.legs[trip.leg]),
      alerted: trip.alerted,
      readied: trip.readied,
    });
    try {
      const res = await fetch(`${TRIPS_API}/${pushTo.deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // So the one sent as the app goes into the background still goes. Browsers cap a
        // keepalive body at 64 KB; a trip that long is sent without it.
        keepalive: body.length < 60000,
        body,
      });
      if (!res.ok) throw new Error(`replied ${res.status}`);
      adopt(await res.json());
    } catch (err) {
      console.warn("get off alert server unavailable:", err);
    }
  }

  function adopt(state) {
    if (!trip || state?.tripId !== trip.tripId) return;
    state.alerted.forEach((a, i) => {
      if (a) trip.alerted[i] = true;
    });
    state.readied?.forEach((r, i) => {
      if (r) trip.readied[i] = true;
    });
    const moved = state.leg > trip.leg && state.leg < trip.legs.length;
    if (moved) {
      // The server moved the trip on while the app was away: the leg it left ended about when
      // the next one began, and any it skipped over are taken but untimed.
      const began = state.legStartedAt || Date.now();
      const t = trip.times[trip.leg];
      if (t && !t.end) t.end = began;
      trip.times[state.leg] = { start: began };
      Object.assign(trip, { leg: state.leg, at: 0, pos: 0, anchor: null, boarded: false, moves: [], alertText: null, boardText: null, legStartedAt: began });
      shown = null;
    }
    save();
    render();
    if (moved) record();
  }

  function unsync() {
    if (pushTo) fetch(`${TRIPS_API}/${pushTo.deviceId}`, { method: "DELETE", keepalive: true }).catch(() => {});
  }

  // Three short beeps, made in the page, so there's nothing to download.
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((at) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + 0.2);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {}
  }

  // ---------- sharing a live ETA (js/share.js) ----------

  // How far the trip has got, and when it should get in: the rest of this ride by how far
  // along it is, the wait for the bus if it hasn't come, the walk after it, and every ride
  // after that with its wait and walk. Null with no trip. Keep in step with etaFromTrip in
  // api/_lib/share-links.js, which works it out for the server's copy of the trip.
  function progress() {
    if (!trip) return null;
    const leg = trip.legs[trip.leg];
    const last = leg.points.length - 1;
    const pos = target();
    let minutes = (leg.minutes || 0) * (1 - pos / Math.max(1, last)) + (leg.walkAfter || 0);
    if (pos < 0.5 && !underWay(leg)) {
      const due = trip.anchor?.t ?? trip.legStartedAt + (leg.wait || 0) * 60000;
      minutes += Math.max(0, due - Date.now()) / 60000;
    }
    for (const l of trip.legs.slice(trip.leg + 1)) minutes += (l.wait || 0) + (l.minutes || 0) + (l.walkAfter || 0);
    const i = Math.min(last, Math.floor(pos));
    const j = Math.min(last, i + 1);
    const f = pos - i;
    const final = trip.legs[trip.legs.length - 1];
    const end = final.points[final.points.length - 1];
    return {
      tripId: trip.tripId,
      to: trip.to || { label: final.to, lat: end[0], lng: end[1] },
      minutesLeft: minutes,
      leg: { label: leg.label, to: leg.to, stopsLeft: stopsLeft(), kind: leg.kind },
      legIndex: trip.leg,
      legCount: trip.legs.length,
      at: [leg.points[i][0] + (leg.points[j][0] - leg.points[i][0]) * f, leg.points[i][1] + (leg.points[j][1] - leg.points[i][1]) * f],
      path: trip.legs.flatMap((l) => l.points),
      arrived: stopsLeft() === 0 && trip.leg === trip.legs.length - 1,
      share: trip.share || null,
      // Your last good fix, if it's recent: on a shared ETA, where you really are.
      me: trip.me && Date.now() - trip.me.t < 2 * 60 * 1000 ? trip.me : null,
      // The stops from here on, for the timeline on a shared ETA.
      timeline: {
        pos: target(),
        legs: trip.legs.slice(trip.leg).slice(0, 6).map((l) => ({
          kind: l.kind, label: l.label, to: l.to, names: l.points.map((_, i) => stopName(l, i)).slice(0, 80),
        })),
      },
    };
  }

  // The ETA link this trip is shared as, { id, secret, name, to }, or null to stop. Sent to the
  // server with the trip, so it can carry on updating the link in the background.
  function setShare(share) {
    if (!trip) return;
    trip.share = share;
    save();
    sync();
  }

  // ---------- keeping the screen on ----------

  async function keepAwake() {
    // The app follows the trip with the screen off; no need to keep it on.
    if (nativeSubs) return;
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen");
    } catch {}
  }

  function releaseAwake() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  // ---------- the trip bar ----------

  // The trip bar's line: where you are on this leg, or the alert while it stands.
  function statusText(message) {
    const leg = trip.legs[trip.leg];
    const left = stopsLeft();
    if (!message && trip.alertText && trip.alertLeft === left) message = trip.alertText;
    // Get ready to board stands while you're still waiting for the bus.
    if (!message && trip.boardText && trip.readied?.[trip.leg] && leg.kind === "bus" && !trip.boarded && target() < 0.5) message = trip.boardText;
    if (message) return message;
    const where = isWalk(leg)
      ? `Walk to ${leg.to}${left === 0 ? ": there" : `, about ${Math.max(1, Math.round((leg.minutes || 1) * (1 - target())))} min`}`
      : `${leg.label}: ${left === 0 ? `at ${leg.to}` : `${left} stop${left === 1 ? "" : "s"} to ${leg.to}`}`;
    return where + (trip.legs.length > 1 ? ` · leg ${trip.leg + 1} of ${trip.legs.length}` : "");
  }

  function render(message) {
    if (!trip) return;
    const leg = trip.legs[trip.leg];
    $("#tripTitle").textContent = trip.title;
    const status = statusText(message);
    $("#tripStatus").textContent = status;
    // The app's notification says the same, when it's changed.
    if (nativeSubs && status !== nativeText) {
      nativeText = status;
      AppBridge.call("Trip", "update", { title: trip.title, text: status }).catch(() => {});
    }
    const notes = [];
    if (!enabled()) notes.push("Get Off Alert is off in Settings.");
    if (trip.noLocation) notes.push("No location: going by the clock.");
    else if (Date.now() - trip.lastFixAt > FIX_STALE_MS && trip.lastFixAt) notes.push("Location weak: going by the clock.");
    $("#tripNote").textContent = notes.join(" ");
    $("#tripNote").hidden = !notes.length;
    $("#tripNext").hidden = trip.leg >= trip.legs.length - 1;
    const icon = $("#tripBar [data-icon]");
    icon.setAttribute("data-icon", leg.kind === "train" ? "train" : isWalk(leg) ? "walk" : "bus");
    window.hydrateIcons($("#tripBar"));
    $("#tripBar").classList.remove("hidden");
    document.body.classList.add("on-trip");
    if (expanded && builtLeg !== trip.leg) buildTimeline();
    else kick();
  }

  // ---------- the timeline ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function stopName(leg, i) {
    const last = leg.points.length - 1;
    return leg.names?.[i] || (i === last ? leg.to : i === 0 ? (isWalk(leg) ? "Where you set off" : "Where you got on") : `Stop ${i + 1}`);
  }

  // Every leg from this one on, each a column of its stops. Only this leg has the dot.
  function buildTimeline() {
    const box = $("#tripTimeline");
    box.innerHTML = trip.legs
      .slice(trip.leg)
      .map((leg, k) => {
        const last = leg.points.length - 1;
        const final = trip.leg + k === trip.legs.length - 1;
        const alertAt = last - ALERT_STOPS;
        const stops = leg.points
          .map((_, i) => {
            const tag = i === last
              ? `<span class="tlTag">${window.icon("flag")} ${isWalk(leg) ? (final ? "Arrive" : "Board") : final ? "Get off" : "Change"}</span>`
              : i === alertAt && alertAt > 0 && enabled()
                ? `<span class="tlTag">${window.icon("bell")} Alert</span>`
                : "";
            // A bus stop with its code: a button to its timings for this bus (init).
            const code = leg.kind === "bus" && leg.codes?.length === leg.points.length ? leg.codes[i] : null;
            const name = code
              ? `<button type="button" class="tlName tlGo" data-tl-stop="${esc(code)}" data-tl-bus="${esc(leg.service || "")}" title="Timings for ${esc(leg.label)} here">${esc(stopName(leg, i))}</button>`
              : `<span class="tlName">${esc(stopName(leg, i))}</span>`;
            return `<li class="tlStop${i === last ? " end" : ""}"><span class="tlNode"></span>${name}${tag}</li>`;
          })
          .join("");
        return (
          `<section class="tlLeg${k === 0 ? " current" : ""}">` +
          `<p class="tlHead">${window.icon(leg.kind === "train" ? "train" : isWalk(leg) ? "walk" : "bus")} ${esc(leg.label)} <span>to ${esc(leg.to)}</span></p>` +
          `<ol class="tlStops"><span class="tlTrack"><span class="tlDone"></span></span>${stops}` +
          (k === 0 ? `<span class="tlDot" aria-hidden="true"></span>` : "") +
          `</ol></section>`
        );
      })
      .join("");
    builtLeg = trip.leg;
    shown = null;
    shownStop = null;
    geo = null;
    passedUpTo = null;
    kick();
  }

  // Where the dot should be: the last fix's place along the leg, or, without a recent good
  // fix, how far the ride should have got by the clock, whichever is further.
  function target() {
    const leg = trip.legs[trip.leg];
    const last = leg.points.length - 1;
    let pos = Math.max(trip.pos || 0, trip.at);
    if (stale() && underWay(leg)) pos = Math.max(pos, clockPos(leg) ?? 0);
    return Math.min(last, pos);
  }

  // Where everything on the current leg's column is, measured once per build (and again if
  // the panel changes width, which rewraps the names), so drawing a frame reads no layout.
  function measure(list) {
    const items = [...list.querySelectorAll(".tlStop")];
    const track = list.querySelector(".tlTrack");
    return {
      list,
      width: list.clientWidth,
      items,
      mids: items.map((el) => el.offsetTop + el.offsetHeight / 2),
      tops: items.map((el) => el.offsetTop),
      dot: list.querySelector(".tlDot"),
      done: list.querySelector(".tlDone"),
      trackTop: track.offsetTop,
      trackHeight: Math.max(1, track.offsetHeight),
    };
  }

  // One frame: eases the dot towards where you are. Says whether it's still moving, so the
  // frames stop once it settles and nothing is redrawn while the dot sits still.
  function draw(now) {
    if (!trip || !expanded) return false;
    const list = $("#tripTimeline .tlLeg.current .tlStops");
    if (!list) return false;
    let remeasured = false;
    if (!geo || geo.list !== list || geo.width !== list.clientWidth) {
      geo = measure(list);
      lastFrame = null;
      remeasured = true;
    }
    const goal = target();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const before = shown;
    if (shown == null || still) {
      shown = goal;
    } else {
      // The same easing at any frame rate: EASE of the gap per FRAME_MS.
      const dt = lastFrame == null ? FRAME_MS : Math.min(200, now - lastFrame);
      shown += (goal - shown) * (1 - Math.pow(1 - EASE, dt / FRAME_MS));
    }
    lastFrame = now;
    if (Math.abs(goal - shown) < 0.002) shown = goal;
    if (shown === before && !remeasured) return false;

    const { items, mids, tops } = geo;
    const i = Math.min(Math.floor(shown), items.length - 1);
    const y = i >= items.length - 1 ? mids[i] : mids[i] + (shown - i) * (mids[i + 1] - mids[i]);
    geo.dot.style.transform = `translateY(${y}px)`;
    // Scaled rather than resized, so the line grows without a layout each frame.
    geo.done.style.transform = `scaleY(${Math.min(1, Math.max(0, (y - geo.trackTop) / geo.trackHeight))})`;
    const passed = Math.floor(shown + 0.001);
    if (passed !== passedUpTo) {
      items.forEach((el, n) => el.classList.toggle("passed", n <= passed));
      passedUpTo = passed;
    }

    // Keep the stop you're at in view as you pass each one.
    if (shownStop !== i) {
      shownStop = i;
      const box = $("#tripTimeline");
      box.scrollTo({ top: Math.max(0, tops[i] - box.clientHeight / 3), behavior: still ? "auto" : "smooth" });
    }
    return shown !== goal;
  }

  // Starts the frames if they've stopped. Called on each new fix or tick; the slow nudge in
  // setExpanded catches the clock moving the dot on when there's no fix at all.
  function kick() {
    if (frame || !expanded) return;
    frame = requestAnimationFrame(function step(now) {
      frame = draw(now) ? requestAnimationFrame(step) : null;
    });
  }

  function setExpanded(on) {
    expanded = on && !!trip;
    $("#tripBar").classList.toggle("expanded", expanded);
    $("#tripToggle").setAttribute("aria-expanded", String(expanded));
    cancelAnimationFrame(frame);
    frame = null;
    clearInterval(nudge);
    nudge = null;
    if (expanded) {
      buildTimeline();
      nudge = setInterval(kick, NUDGE_MS);
    }
  }

  function syncSetting() {
    document.querySelectorAll("[data-getoff]").forEach((btn) => {
      const on = (btn.dataset.getoff === "on") === enabled();
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
  }

  function init() {
    // Anywhere on the bar but its buttons opens or closes the timeline; the title is the
    // button for keyboards and screen readers.
    $("#tripBar .tripBarInner").addEventListener("click", (e) => {
      if (e.target.closest("#tripEnd, #tripNext, #tripShare, #tripMap")) return;
      setExpanded(!expanded);
    });
    $("#tripEnd").addEventListener("click", () => stop());
    // A stop on the timeline: the timeline closes, and the page goes down to its timings for
    // that bus.
    $("#tripTimeline").addEventListener("click", (e) => {
      const go = e.target.closest("[data-tl-stop]");
      if (!go || typeof window.loadStop !== "function") return;
      setExpanded(false);
      window.loadStop(go.dataset.tlStop, { service: go.dataset.tlBus || null, scroll: true });
    });
    $("#tripMap").addEventListener("click", () => window.LiveMap?.trip());
    $("#tripNext").addEventListener("click", () => {
      if (!trip) return;
      nextLeg();
      render();
    });
    // The stop marked for the alert goes or comes back with the setting.
    document.querySelectorAll("[data-getoff]").forEach((btn) =>
      btn.addEventListener("click", () => expanded && buildTimeline())
    );
    document.querySelectorAll("[data-getoff]").forEach((btn) =>
      btn.addEventListener("click", () => {
        setEnabled(btn.dataset.getoff === "on");
        syncSetting();
        render();
        if (enabled()) sync();
        else unsync();
      })
    );
    syncSetting();
    // The wake lock goes when the page is hidden; take it back on return. Either way the
    // server hears: going, how far you'd got; back, what it did meanwhile.
    document.addEventListener("visibilitychange", () => {
      if (!trip) return;
      if (document.visibilityState === "visible") {
        keepAwake();
        onTick();
      }
      sync();
    });
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "get-off") alertedElsewhere(event.data);
      if (event.data?.type === "board") readiedElsewhere(event.data);
    });
    // The same from the server through the app (js/alerts.js), while it's in front, where
    // Android leaves the push for the app to show.
    window.addEventListener("push:get-off", (e) => alertedElsewhere(e.detail, true));
    window.addEventListener("push:board", (e) => readiedElsewhere(e.detail, true));
    // A reload mid-trip carries on.
    try {
      const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY) || "null");
      if (saved?.legs?.length) {
        trip = saved;
        trip.tripId ??= crypto.randomUUID();
        // A trip saved by a version from before Your trips.
        trip.times ??= trip.legs.map((_, i) => (i === trip.leg ? { start: trip.legStartedAt } : {}));
        trip.startedAt ??= trip.legStartedAt;
        // And from before Get ready to board.
        trip.readied ??= trip.legs.map(() => false);
        // And from before the roads.
        trip.roads ??= trip.legs.map(() => null);
        if (window.AppBridge?.native) AppBridge.ready(5000).then(() => trip && run());
        else run();
      }
    } catch {}
  }

  window.Trip = {
    start, stop, enabled, active: () => Boolean(trip), progress, setShare,
    // For the live map (js/map.js).
    legs: () => trip?.legs || null,
    title: () => trip?.title || null,
    status: () => (trip ? statusText() : null),
  };
  init();
})();
