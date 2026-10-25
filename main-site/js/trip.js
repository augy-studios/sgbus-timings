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
// Last bus soon: each bus leg still to board has its last bus of the day at the stop you get on
// at (the route list's, js/network.js) checked against its live timings there, about once a
// minute. Down to its last three buses, as Explorer's stop cards tell it (js/map-card.js), its
// last bus due before you'd get to the stop, or gone already, and the bar says so in red, with
// a notification and a buzz the first time for each leg. A last bus you'll miss or have missed
// has the trip find another way by itself, by bus and train to where it ends (fetchWays,
// js/nav.js), leaving out that bus from that stop. It keeps the trip up to the waypoint, where
// the last ride before the lost bus ends, and plans from there for when you'd get there; with
// no ride before it, or nothing running from there, from where you are. The bar says what to
// do first, in words ("After Bus 21 to Blk 390: take Bus 12 there"), so there's nothing to work
// out: Reroute makes it the trip after the waypoint (replan). With your location on, Navigate
// from here opens Navigate from where you are to the end; without it, See all ways, from the
// waypoint.
//
// When it's switched by itself: a last bus lost and another way found, the trip doesn't wait
// to be asked. It becomes the trip after the waypoint straight away (autoSwitch), with a
// notification saying why, and the bar says so too, with Undo to go back to the way it was.
//
// Traffic: every 5 minutes, each bus leg still ahead asks how the traffic is on its way
// (/api/traffic, LTA's live speeds), and its minutes left go by it: its usual minutes, from
// Navigate, stretched stop by stop. A bus slowed by it, or with an incident on its way, has an
// orange line on the bar saying by how much and why, the road by name; tapped, the live map
// shows its road, orange where slow and red where jammed (LiveMap.traffic).
//
// A faster way: every 3 minutes the trip plans again from where you are (or from the next stop,
// on a ride), and if some other way gets you in at least FASTER_MIN minutes and FASTER_SHARE
// sooner, with its first bus's live timing in place of an average wait, the bar suggests it,
// and why: traffic, or a long wait for your bus. Walking the rest, or cycling with Settings'
// Cycling on, counts too. Reroute takes it; Keep my way puts it away for a while.
//
// Change here: Change my way, at the top of the timeline, puts a Change here by every stop still
// ahead on a ride (hidden otherwise, so a stray tap on the timeline changes nothing). One plans
// the way on from there to where the trip ends, for getting off somewhere else and changing to
// another bus or train. The bar lists the ways, quickest first; the one picked becomes the trip
// from that stop (replan), the ride cut short there.
//
// Every change to the trip, by itself or by you (a way picked after Change here, Reroute), says
// so on the bar with Undo, to put the trip back as it was if it was a slip (trip.switched).
//
// A bus leg's stops alone are a poor guide to where the bus goes: the straight line from one
// to the next can be kilometres off an expressway. So at the start each bus leg's road is
// fetched (/api/road, kept in `trip.roads`), and you're followed along it, within ON_ROAD_M.
// Without it (the router's down), the straight lines are used with room for the road to bend.
// The road can miss a bus's real way (a bus-only road the car router won't take), so a fix off
// it falls back on the straight lines, and a fix near a stop well down the route counts as on
// board whatever the road says.
//
// Walking is told from riding by the phone's accelerometer (Motion, below): the rhythm of your
// steps. Walking along a bus's route to your stop is never taken for riding it; once you've
// stopped walking, being 150 m down the route is enough to be on board (100 m down the next
// ride after a walk), and after you get off a bus your first steps near its last stop end
// the ride. On a walk with no good fix, your steps say how far you've got, not the clock.
// Without an accelerometer (or with it not allowed), the distances are as before it.
// In the Android app (2.0.8 and later), your average speed tells them apart too, as the page
// can't feel your steps with the screen off (Pace.java): about 10 km/h at most is walking,
// and a bus or train's 40 km/h or so is riding. Riding speed is never walking, whatever the
// steps say, and riding speed 150 m down a bus's route is enough to be on board.
//
// On the bar, a trip of more than one part (each ride and each walk; `legs` here) has Back and
// Next, to move it by hand. Back puts you where you were on the part before, or at its start if
// you'd finished it, and re-arms its alerts; the server hears it was by hand (`movedAt`), so
// it doesn't move you on again with what it had.
//
// A trip that rides or walks to Tuas or Woodlands Checkpoint (BusNet.isCheckpoint and
// nearCheckpoint, js/network.js), from the route planner or Navigate, has a MyICA button on the
// bar, for ICA's app and its immigration QR code, on phones only. In the Android app from 2.2.1
// (feature "myica") it opens MyICA itself, as the SimplyGo button does SimplyGo
// (OpenAppActivity.java), or its Play Store page where it isn't installed; anywhere else on
// Android, the Play Store page, and on iPhone and iPad, the App Store's. Either says Open once
// it's installed.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const SETTING_KEY = "sgbus.getOffAlert";
  const SAVED_KEY = "sgbus.trip";
  // The trip kept past the page too, { at, trip }: sessionStorage goes with the app's process,
  // so a force close, or Android closing the app in the background, lost the trip and left
  // its shared ETA never arriving. Brought back on opening if it was saved within
  // KEPT_FOR_MS, and no other tab is running it (LOCK, held while one is).
  const KEPT_KEY = "sgbus.tripKept";
  const KEPT_FOR_MS = 3 * 60 * 60 * 1000;
  const LOCK = "sgbus-trip";

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
  const MOVE_M = 150;
  const LEFT_STOP_M = 150;
  // From a walk to the next ride, by how much further from the walk's end than you've been:
  // WALK_LEFT_M once the accelerometer says you've stopped walking, WALK_LEFT_UNSURE_M
  // without it, so walking past a later stop on the route to yours doesn't count.
  const WALK_LEFT_M = 100;
  const WALK_LEFT_UNSURE_M = 300;
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
  let arrivedTimer = null; // ends the trip a minute after you've arrived
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
    try {
      if (trip) localStorage.setItem(KEPT_KEY, JSON.stringify({ at: Date.now(), trip }));
    } catch {}
  }

  // The kept trip gone with the trip it is, not another tab's since.
  function forget(tripId) {
    try {
      if (JSON.parse(localStorage.getItem(KEPT_KEY) || "null")?.trip?.tripId === tripId) localStorage.removeItem(KEPT_KEY);
    } catch {}
  }

  // Held while this page runs a trip, so another tab opened meanwhile leaves the kept one be.
  // Waited for, not tried once: a new trip straight after another asks before the last
  // release has gone through. Granted with no trip by then, it's let go at once.
  let unlock = null;
  let locking = false;
  function lock() {
    if (locking || !navigator.locks) return;
    locking = true;
    navigator.locks.request(LOCK, () => {
      if (!trip) {
        locking = false;
        return null;
      }
      return new Promise((done) => { unlock = done; });
    }).catch(() => { locking = false; });
  }
  function release() {
    if (!unlock) return;
    unlock();
    unlock = null;
    locking = false;
  }

  // ---------- walking or not, by the accelerometer ----------

  // A step is a rise in the phone's acceleration above the pull of gravity, past STEP_HIGH, and
  // its fall back below STEP_LOW, at least STEP_GAP_MS after the last. Walking is
  // WALK_STEPS of them in the last WALK_WINDOW_MS at a walker's even rhythm; a bus's bumps
  // come unevenly. "still" (riding, or standing) once there's been no step for STILL_MS.
  const STEP_HIGH = 1.3; // m/s², above the slow average (gravity)
  const STEP_LOW = -0.4;
  const STEP_GAP_MS = 280;
  const WALK_WINDOW_MS = 5000;
  const WALK_STEPS = 7;
  const STEP_EVENNESS = 0.3; // the steps' gaps vary by at most this share of their average
  const STILL_MS = 8000;
  // No reading for this long and there's no accelerometer to go by (or the page is hidden).
  const MOTION_STALE_MS = 3000;
  const STRIDE_M = 0.7;
  const WALK_DETOUR = 1.3;
  // The app's last word on your speed (Pace.java) goes for this long.
  const PACE_STALE_MS = 10000;

  const Motion = (() => {
    let listening = false;
    let base = null;
    let smooth = null;
    let rising = false;
    let lastStep = 0;
    let lastReading = 0;
    let firstReading = 0;
    let steps = [];
    let pace = null; // { state, t }: the app's walking, riding or still, by your average speed

    function onMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const now = Date.now();
      if (!firstReading || now - lastReading > MOTION_STALE_MS) {
        firstReading = now;
        base = null;
        steps = [];
      }
      lastReading = now;
      const mag = Math.hypot(a.x, a.y, a.z);
      base = base == null ? mag : base + (mag - base) * 0.02;
      smooth = smooth == null ? mag : smooth + (mag - smooth) * 0.35;
      const d = smooth - base;
      if (!rising && d > STEP_HIGH) rising = true;
      else if (rising && d < STEP_LOW) {
        rising = false;
        if (now - lastStep >= STEP_GAP_MS) {
          lastStep = now;
          steps.push(now);
          if (steps.length > 2000) steps = steps.slice(-1000);
        }
      }
    }

    // Whether the steps in the window are a walk: enough of them, evenly spaced.
    function walking(now) {
      const recent = steps.filter((t) => now - t <= WALK_WINDOW_MS);
      if (recent.length < WALK_STEPS) return false;
      const gaps = recent.slice(1).map((t, i) => t - recent[i]);
      const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
      const spread = Math.sqrt(gaps.reduce((x, g) => x + (g - mean) ** 2, 0) / gaps.length);
      return mean <= 1100 && spread / mean <= STEP_EVENNESS;
    }

    return {
      // From a tap, for iOS. Elsewhere there's nothing to ask.
      allow() {
        try {
          if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
            DeviceMotionEvent.requestPermission().then((r) => r === "granted" && trip && Motion.start()).catch(() => {});
          }
        } catch {}
      },
      start() {
        if (listening || typeof window.DeviceMotionEvent === "undefined") return;
        listening = true;
        window.addEventListener("devicemotion", onMotion);
      },
      stop() {
        if (!listening) return;
        listening = false;
        window.removeEventListener("devicemotion", onMotion);
        steps = [];
        firstReading = lastReading = 0;
        pace = null;
      },
      // From the app, with each fix: "walking", "riding", "still", or nothing to go by.
      setPace(state) {
        pace = state ? { state, t: Date.now() } : null;
      },
      // "walking", "still" (standing, or riding with no word on speed), "riding" (at a bus or
      // train's speed), or null with nothing to go by. Riding speed goes over the steps (a
      // bus's bumps can pass for them); walking speed with no steps for a while is a bus in a
      // jam, not a walk; and with no steps to go by (the screen off), the speed alone.
      state() {
        const now = Date.now();
        const byStep = Motion.byStep(now);
        const bySpeed = pace && now - pace.t <= PACE_STALE_MS ? pace.state : null;
        if (bySpeed === "riding") return "riding";
        if (bySpeed === "walking") return byStep === "still" ? "still" : "walking";
        return byStep ?? bySpeed;
      },
      // By the steps alone.
      byStep(now = Date.now()) {
        if (!listening || now - lastReading > MOTION_STALE_MS || now - firstReading < 2000) return null;
        if (walking(now)) return "walking";
        return now - lastStep >= STILL_MS && now - firstReading >= STILL_MS ? "still" : null;
      },
      // Whether readings are coming in; the steps since a time; and since when the readings
      // have run unbroken.
      reading: () => listening && Date.now() - lastReading <= MOTION_STALE_MS,
      stepsSince: (t) => steps.filter((x) => x > t).length,
      since: () => firstReading || Infinity,
    };
  })();

  // ---------- across the Causeway ----------

  // A bus ride across the Causeway, as three legs: to the first checkpoint, across to the
  // other, and on. Everyone gets off at each to clear immigration (BusNet.crossing), so the
  // Get Off Alert says so at both, and the time to clear, by Settings' Immigration time or the
  // time of day (When.customsMin), is the wait before getting on again, half at each. Each
  // part's minutes are from its own distance, as tripLegForBus (script.js) times a ride.
  const HOP_M_PER_MIN = 250;
  function acrossTheCauseway(legs) {
    return legs.flatMap((leg) => {
      const codes = leg.kind === "bus" && leg.codes?.length === leg.points?.length ? leg.codes : null;
      const crossings = codes ? codes.map((c, k) => k && window.BusNet?.crossing(codes[k - 1], c) && [k, BusNet.crossing(codes[k - 1], c)]).filter(Boolean) : [];
      if (!crossings.length) return [leg];
      // script.js's LS, a top-level const rather than on window.
      const own = typeof LS !== "undefined" ? LS.getCustoms() : "auto";
      const clearing = (way) => (own === "auto" ? When.customsMin(way, Date.now()) : Number(own));
      const cuts = [0, ...crossings.flatMap(([k]) => [k - 1, k]), codes.length - 1];
      const parts = [];
      for (let p = 1; p < cuts.length; p++) {
        const [a, b] = [cuts[p - 1], cuts[p]];
        if (b <= a) continue;
        const points = leg.points.slice(a, b + 1);
        let along = 0;
        for (let i = 1; i < points.length; i++) along += metres(points[i - 1], points[i]);
        // Across, after Singapore's or Malaysia's side: the first half of the clearing; on
        // from the other checkpoint: the second half.
        const crossing = crossings.find(([k]) => k === b && a === k - 1);
        const after = crossings.find(([k]) => k === a);
        const wait = crossing ? Math.ceil(clearing(crossing[1]) / 2) : after ? Math.floor(clearing(after[1]) / 2) : leg.wait;
        parts.push({
          ...leg,
          label: crossing ? `${leg.label} across the Causeway` : leg.label,
          to: leg.names?.[b] || leg.to,
          points,
          names: leg.names?.slice(a, b + 1),
          codes: codes.slice(a, b + 1),
          minutes: along / HOP_M_PER_MIN,
          wait,
          walkAfter: b === codes.length - 1 ? leg.walkAfter : 0,
          board: codes[a],
          alight: codes[b],
        });
      }
      return parts;
    });
  }

  // ---------- starting and ending ----------

  function start({ title, legs, to = null, from = null, walkBefore = 0 }) {
    if (!legs?.length) return;
    legs = acrossTheCauseway(legs);
    // A trip still running is over as this one starts: Your trips keeps what it got to.
    if (trip) {
      endLegTime();
      record();
    }
    stop(false);
    // iOS asks before a page may read the accelerometer, and only from a tap: this one.
    Motion.allow();
    boardCheckedAt = 0;
    boardEta = null;
    lastCheckedAt = 0;
    lastHeard = {};
    another = null;
    changing = null;
    trafficHeard = {};
    trafficCheckedAt = 0;
    faster = null;
    fasterCheckedAt = 0;
    fasterKept = null;
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
      // Whether each leg's last bus warning was sent as a notification (watchLastBus).
      lastWarned: legs.map(() => false),
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
    lock();
    render();
    if (inApp()) followNatively();
    else watchHere();
    Motion.start();
    tick = setInterval(onTick, TICK_MS);
    keepAwake();
    sync();
    watchBoard();
    watchLastBus();
    watchTraffic();
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
      AppBridge.on("Trip", "location", (f) => {
        Motion.setPace(f.pace);
        onFix({ coords: { latitude: f.lat, longitude: f.lng, accuracy: f.accuracy } });
      }),
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
    Motion.stop();
    clearTimeout(arrivedTimer);
    arrivedTimer = null;
    releaseAwake();
    release();
    if (clear) {
      // A trip being shared as a live ETA link says it's over (js/share.js).
      if (trip) window.dispatchEvent(new CustomEvent("trip:end", { detail: { tripId: trip.tripId } }));
      if (trip) forget(trip.tripId);
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
    let leg = trip.legs[trip.leg];
    if (accuracy <= GOOD_FIX_M) trip.me = { lat: here[0], lng: here[1], accuracy: Math.round(accuracy), t: Date.now() };
    // Already on a later ride: on to it, on board.
    const ahead = accuracy <= GOOD_FIX_M ? rideAhead(here, leg) : -1;
    if (ahead !== -1) {
      while (trip.leg < ahead) nextLeg();
      leg = trip.legs[trip.leg];
      boardedNow(alongLeg(here, leg, 0) ?? 0);
    }
    if (isWalk(leg)) return onWalkFix(here, accuracy, leg);
    if (realign(here, accuracy, leg)) return;
    if (accuracy > GOOD_FIX_M) return;
    trip.lastFixAt = Date.now();
    trip.noLocation = false;
    // Alerted well before the stop, by the server about another bus: it can go off again.
    if (trip.alerted[trip.leg] && wellShort()) overrule();

    // Not yet on the bus for sure: you stay at the first stop, and the clock waits, until the
    // fixes show you moving along its route (noteMove).
    if (!underWay(leg) && !noteMove(here, alongLeg(here, leg, 0), accuracy)) {
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

    // Off the bus: walking, by the accelerometer, near its last stop, once you're nearly there.
    const lastStop = leg.points.length - 1;
    if (leg.kind === "bus" && trip.at >= lastStop - 1 && Motion.state() === "walking" && metres(here, leg.points[lastStop]) <= ON_ROUTE_M) {
      trip.at = lastStop;
      trip.pos = lastStop;
    }

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
    trip.nearEnd = Math.min(trip.nearEnd ?? Infinity, left);
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
  // Or, LEFT_STOP_M from the stop, within ON_ROUTE_M of a later one, whether or not the fix is
  // on the route's road. Says whether you're now on board.
  function noteMove(here, along, accuracy = 0) {
    const now = Date.now();
    const leg = trip.legs[trip.leg];
    // On foot, by the accelerometer: walking to the stop, or about it, not riding.
    if (Motion.state() === "walking") {
      trip.moves = [];
      return false;
    }
    // A rough fix can be LEFT_STOP_M out on its own.
    const fromStop = metres(here, leg.points[0]) - Math.max(0, accuracy - 50);
    // A stop by the one you got on at (across the road, on a route that comes back) doesn't count.
    let near = -1;
    let nearM = Infinity;
    leg.points.forEach((p, i) => {
      const d = metres(here, p);
      if (i > 0 && d < nearM && metres(p, leg.points[0]) >= LEFT_STOP_M) [near, nearM] = [i, d];
    });
    const atStop = near !== -1 && (nearM <= ON_ROAD_M || (fromStop >= LEFT_STOP_M && nearM <= ON_ROUTE_M));
    along ??= atStop ? near : null;
    if (along == null) return false;
    const m = metresAlong(leg, along);
    const span = Math.max(MOVE_WINDOW_MS, (leg.minutes || 0) * 60000);
    const moves = (trip.moves || []).filter((x) => now - x.t <= span);
    const moved = atStop
      || (fromStop >= LEFT_STOP_M && moves.some((x) => m - (x.m ?? 0) >= MOVE_M))
      || (fromStop >= LEFT_STOP_M && m >= MOVE_M && Motion.state() === "riding")
      || (along >= 1 && fromStop > ON_ROAD_M && moves.some((x) => along - x.along >= MOVE_STOPS));
    const lastT = moves.length ? moves[moves.length - 1].t : 0;
    trip.moves = now - lastT >= MOVE_SAMPLE_MS ? [...moves.slice(-240), { along, m, t: now }] : moves;
    if (!moved) return false;
    boardedNow(along, moves);
    return true;
  }

  // On board for sure, `along` the leg now. Boarded about as long ago as riding this far along
  // takes, by the leg's own time per stop, though not before the last fix in `moves` that still
  // had you at the stop.
  function boardedNow(along, moves = []) {
    const now = Date.now();
    const leg = trip.legs[trip.leg];
    trip.boarded = true;
    trip.moves = [];
    const t = trip.times[trip.leg];
    if (t) {
      const perStopMs = ((leg.minutes || 0) / Math.max(1, leg.points.length - 1)) * 60000;
      const waiting = moves.filter((x) => x.along < 0.25).map((x) => x.t);
      const board = Math.max(now - along * perStopMs, ...waiting, t.start || 0);
      Object.assign(t, { board: Math.min(now, board), gps: true });
    }
    sync();
    record();
  }

  // The next ride after this part, past any walk before it, if a fix shows you already on it:
  // LEFT_STOP_M from its first stop and half a stop down its route. Then this part's over,
  // though it never saw you get to its end: a walk whose end is off from where you waited,
  // or a ride the fixes lost. From a walk, never while the accelerometer says you're walking,
  // and only once you're WALK_LEFT_M further from its end than you've been (WALK_LEFT_UNSURE_M
  // without the accelerometer), so walking to your stop past a later one isn't riding. From
  // a ride, only once the fix isn't on it any more, so a ride that carries on along the same
  // road, or comes back along it, doesn't end early. The index of that ride, or -1.
  function rideAhead(here, leg) {
    if (isWalk(leg)) {
      const motion = Motion.state();
      if (motion === "walking") return -1;
      const need = motion === "still" || motion === "riding" ? WALK_LEFT_M : WALK_LEFT_UNSURE_M;
      if (!(metres(here, leg.points[leg.points.length - 1]) - (trip.nearEnd ?? Infinity) >= need)) return -1;
    } else if (alongLeg(here, leg, trip.at) != null) return -1;
    const k = trip.legs.findIndex((l, i) => i > trip.leg && !isWalk(l));
    const ride = trip.legs[k];
    if (!ride || ride.points.length < 2 || metres(here, ride.points[0]) < LEFT_STOP_M) return -1;
    return (alongLeg(here, ride, 0) ?? 0) >= MOVE_STOPS ? k : -1;
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
    const last = leg.points.length - 1;
    const from = trip.anchor || { pos: 0, t: trip.legStartedAt + (leg.wait || 0) * 60000 };
    // On a walk, with the accelerometer: by the steps taken since, so waiting at a crossing
    // doesn't walk you on. The way's taken as WALK_DETOUR times the straight line.
    if (isWalk(leg) && !leg.cycle && Motion.reading() && Motion.since() <= from.t) {
      const way = Math.max(1, metres(leg.points[0], leg.points[last]) * WALK_DETOUR);
      return Math.min(last, from.pos + (Motion.stepsSince(from.t) * STRIDE_M) / way);
    }
    if (!leg.minutes) return null;
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
    watchLastBus();
    watchTraffic();
    watchFaster();
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
  // on the leg. On the leg's road if it has one (alongRoad); otherwise, or when the road's lost
  // you (the bus took a road the car router wouldn't), on the nearest stretch between two
  // stops, allowing for the road to bend away from the straight line.
  function alongLeg(here, leg, from) {
    const road = roadOf(leg);
    const onRoad = road ? alongRoad(here, road, from) : null;
    if (onRoad != null) return onRoad;
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
  // The other direct buses' next arrivals at the stop, from the same check:
  // { leg, at, etas: { "51": ms } }.
  let alsoHeard = null;
  // This leg's bus's, for the minutes left (minutesLeft): { tripId, leg, at, eta }.
  let busHeard = null;
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
      // Every bus at the stop, with the other direct buses (directBuses) wanted too.
      const also = directBuses(leg);
      const only = also.length ? "" : `&service=${encodeURIComponent(leg.service)}`;
      const res = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(leg.board)}${only}`, { cache: "no-store" });
      if (!res.ok) return;
      const services = (await res.json()).services || [];
      const etaOf = (no) => services.find((s) => String(s.serviceNo).toUpperCase() === String(no).toUpperCase())?.next?.eta_ms;
      const eta = etaOf(leg.service);
      boardEta = eta ?? null;
      if (trip === asked && trip.leg === legAt) {
        if (eta != null) busHeard = { tripId: trip.tripId, leg: legAt, at: Date.now(), eta };
        if (also.length) alsoHeard = { leg: legAt, at: Date.now(), etas: Object.fromEntries(also.map((no) => [no, etaOf(no)])) };
        render();
      }
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

  // ---------- last bus soon ----------

  // Each bus leg still to board is checked this often.
  const LAST_CHECK_MS = 60 * 1000;
  // With fewer than three buses coming, a last bus within this many minutes is among its last
  // three, as on Explorer's stop cards.
  const LAST_MIN = 30;
  // A last bus before this hour belongs to the day before: Saturday's runs past midnight.
  const NIGHT_HOURS = 3;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SG_MS = 8 * 60 * 60 * 1000;

  // A bus's last bus at a stop on today's service day, { left: minutes from now, text: "00:18" },
  // or null where the route list has none.
  function lastBusAt(service, code) {
    const times = BusNet.lastBuses(service, code);
    if (!times) return null;
    const sgNow = Date.now() + SG_MS;
    const day = Math.floor((sgNow - NIGHT_HOURS * 3600 * 1000) / DAY_MS) * DAY_MS;
    const weekday = new Date(day).getUTCDay();
    const t = weekday === 6 ? times.sat : weekday === 0 ? times.sun : times.wd;
    if (!/^\d{4}$/.test(t || "")) return null;
    let m = Number(t.slice(0, 2)) * 60 + Number(t.slice(2));
    if (m < NIGHT_HOURS * 60) m += 24 * 60;
    // Its midnight, "2400", as 00:00.
    return { left: (day + m * 60000 - sgNow) / 60000, text: `${String(Number(t.slice(0, 2)) % 24).padStart(2, "0")}:${t.slice(2)}` };
  }

  // What the bar says of a leg's last bus, if anything: gone, due before you'd get to the stop
  // `reach` minutes from now, or among the last three. `etas` are the minutes to its next buses.
  function lastBusWord(leg, last, etas, reach) {
    const bus = leg.label || `Bus ${leg.service}`;
    const where = leg.names?.[0] || window.nameOf?.(leg.board) || leg.board;
    if (!etas.length && last.left < 0) return { kind: "gone", text: `${bus}'s last bus from ${where} has gone (${last.text}).` };
    if (last.left < reach && !etas.some((e) => e >= reach)) return { kind: "miss", text: `${bus}'s last bus from ${where} is at ${last.text}, before you'll get there.` };
    if (etas.length >= 3 ? last.left <= etas[2] + 1 : last.left <= LAST_MIN) return { kind: "soon", text: `Last bus soon: ${bus}'s last from ${where} is at ${last.text}.` };
    return null;
  }

  // Whether leg i is a bus ride still to board.
  const toBoard = (i) => {
    const leg = trip.legs[i];
    return i >= trip.leg && leg?.kind === "bus" && !!leg.service && !!leg.board && !(i === trip.leg && (trip.boarded || target() >= 0.5));
  };

  let lastCheckedAt = 0;
  // What was found for each leg, by its index: { kind, text }.
  let lastHeard = {};
  async function watchLastBus() {
    if (!trip || !window.BusNet?.isReady()) return;
    if (Date.now() - lastCheckedAt < LAST_CHECK_MS - TICK_MS / 2) return;
    lastCheckedAt = Date.now();
    const asked = trip;
    const heard = {};
    await Promise.all(trip.legs.map(async (leg, i) => {
      if (!toBoard(i)) return;
      const last = lastBusAt(leg.service, leg.board);
      const reach = minutesTo(i);
      // Hours off yet: nothing to say, so nothing to ask.
      if (!last || last.left > reach + 2 * 60) return;
      try {
        const res = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(leg.board)}&service=${encodeURIComponent(leg.service)}`, { cache: "no-store" });
        if (!res.ok) return;
        const svc = (await res.json()).services?.find((s) => String(s.serviceNo).toUpperCase() === String(leg.service).toUpperCase());
        const etas = [svc?.next, svc?.next2, svc?.next3].map((b) => b?.eta_ms).filter((ms) => ms != null && ms > BOARD_GONE_MS).map((ms) => ms / 60000);
        const word = lastBusWord(leg, last, etas, reach);
        if (word) heard[i] = word;
      } catch {}
    }));
    if (trip !== asked) return;
    lastHeard = heard;
    // A last bus lost: another way, before the notification, so it can say what it is.
    const lost = Object.entries(heard).filter(([, w]) => w.kind !== "soon");
    if (lost.length) await findAnother(lost.map(([i]) => Number(i)));
    else another = null;
    if (trip !== asked) return;
    // Lost, with another way found: switched to it straight away, unless it was undone.
    if (lost.length && another?.way && trip.keptWay !== another.key) {
      autoSwitch(lost.map(([, w]) => w));
      return;
    }
    trip.lastWarned ??= trip.legs.map(() => false);
    for (const [i, word] of Object.entries(heard)) {
      if (trip.lastWarned[i]) continue;
      trip.lastWarned[i] = true;
      if (navigator.vibrate) navigator.vibrate(BOARD_VIBRATION);
      const instead = word.kind !== "soon" && another ? ` ${anotherText()}` : "";
      notify({ title: word.kind === "soon" ? "Last bus soon" : "Last bus", body: word.text + instead, tag: `lastbus-${i}`, vibrate: BOARD_VIBRATION, channel: "board" });
      save();
    }
    render();
  }

  // ---------- another way, when a last bus is lost ----------

  // Asked again this often while the last bus stays lost, as what's running thins out.
  const ANOTHER_EVERY_MS = 5 * 60 * 1000;
  // { from, to, way, at, key }: the quickest way found from where you were to the trip's end,
  // without the lost buses (`way` null if there's none), and what it was asked for.
  let another = null;

  // Where you are: your last good fix if it's recent, or where the trip has you.
  function whereNow() {
    if (trip.me && Date.now() - trip.me.t < 2 * 60 * 1000) return { label: "Where you are", lat: trip.me.lat, lng: trip.me.lng };
    const [lat, lng] = progress().at;
    return { label: "Where you are", lat, lng };
  }

  // Where the trip ends.
  function tripEnd() {
    if (trip.to) return trip.to;
    const final = trip.legs[trip.legs.length - 1];
    const [lat, lng] = final.points[final.points.length - 1];
    return { label: final.to, lat, lng };
  }

  // The ride a way takes, as "bus:59@84031", to tell it from the lost ones.
  const rideKey = (mode, route, code) => `${mode}:${String(route).toUpperCase()}@${code || ""}`;

  // Another way for the lost buses, legs `lostAt`: { from, to, j, k, reach, via, way, at, key }.
  // From the waypoint, `via` the ride that ends there, and `reach` the minutes till you're there;
  // or from where you are (k null). `way` is null if there's none.
  async function findAnother(lostAt) {
    if (typeof fetchWays !== "function") return;
    const key = lostAt.map((i) => rideKey("bus", trip.legs[i].service, trip.legs[i].board)).join(">");
    if (another?.key === key && Date.now() - another.at < ANOTHER_EVERY_MS) return;
    const asked = trip;
    const to = tripEnd();
    const skip = new Set(key.split(">"));
    const pick = (data) => (data.options || []).find((o) => !o.walkOnly && !o.legs.some((l) => l.mode === "bus" && skip.has(rideKey("bus", l.route, l.from?.code)))) ||
      (data.options || []).find((o) => o.walkOnly) || null;
    // The waypoint: where the last ride before the first lost bus ends, if there's one from here on.
    const tries = [];
    for (let r = Math.min(...lostAt) - 1; r >= trip.leg; r--) {
      const leg = trip.legs[r];
      if (isWalk(leg)) continue;
      const last = leg.points.length - 1;
      const from = { label: stopName(leg, last), lat: leg.points[last][0], lng: leg.points[last][1] };
      tries.push({ from, j: r, k: last, via: leg.label, reach: Math.max(0, minutesTo(r + 1) - (leg.walkAfter || 0)) });
      break;
    }
    tries.push({ from: whereNow(), j: trip.leg, k: null, via: null, reach: 0 });
    let failed = 0;
    for (const t of tries) {
      // For when you'd be there, as the buses running then aren't the ones running now.
      const when = t.reach >= 1 && window.When?.msToAt ? { mode: "leave", at: When.msToAt(Date.now() + t.reach * 60000) } : null;
      try {
        const data = await fetchWays(t.from, to, when);
        if (trip !== asked) return;
        const way = pick(data);
        if (way || t === tries[tries.length - 1]) {
          another = { ...t, to, way, at: Date.now(), key };
          return;
        }
      } catch {
        failed += 1;
      }
    }
    if (trip !== asked) return;
    // Not asked again for a minute, rather than on every check.
    if (failed) another = { ...tries[0], to, way: null, at: Date.now() - ANOTHER_EVERY_MS + 60 * 1000, key, failed: true };
  }

  // A way's rides, "Bus 12 → NE Line".
  const ridesText = (o) => o.legs.filter((l) => l.mode !== "walk").map((l) => (l.mode === "bus" ? `Bus ${l.route}` : `${l.route} ${l.lrt ? "LRT" : "Line"}`)).join(" → ");
  // When you'd get in, setting off `after` minutes from now.
  const byClock = (o, after = 0) => (window.When?.clock ? `, there by ${When.clock(Date.now() + (after + o.minutes) * 60000)}` : "");

  // What to do first on a way, in words: "Walk 3 min to Opp Blk 5, take Bus 12 there", or "Take
  // Bus 12 from Blk 390".
  function firstStep(o) {
    const name = (p) => (typeof placeName === "function" ? placeName(p) : p?.name || "");
    const ride = o.legs.find((l) => l.mode !== "walk");
    if (!ride) return "Walk the rest of the way";
    const what = ride.mode === "bus" ? `Bus ${ride.route}` : `the ${ride.route} ${ride.lrt ? "LRT" : "Line"}`;
    const walk = o.legs[0].mode === "walk" && (o.legs[0].metres ?? 100) >= 60 ? o.legs[0] : null;
    return walk
      ? `Walk ${Math.max(1, Math.round(walk.minutes || 1))} min to ${name(ride.from)}, take ${what} there`
      : `Take ${what} from ${name(ride.from)}`;
  }

  // The way found, in a line: "Instead: walk 3 min to Opp Blk 5, take Bus 12 there. Bus 12 →
  // NE Line, ~35 min, there by 01:20."
  function anotherText() {
    const o = another?.way;
    if (!o) return another?.failed ? "Couldn't look for another way just now. It'll try again in a minute." : "No other way by bus or train is running now.";
    const lead = another.via ? `After ${another.via} to ${another.from.label}: ` : "Instead: ";
    const by = byClock(o, another.reach || 0);
    if (o.walkOnly) return `${lead}walk the rest of the way, ~${o.minutes} min${by}.`;
    const step = firstStep(o);
    return `${lead}${step[0].toLowerCase()}${step.slice(1)}. ${ridesText(o)}, ~${o.minutes} min${by}.`;
  }

  // Whether your location's on and recent: Navigate from here can find you.
  const located = () => !trip.noLocation && Boolean(trip.me) && Date.now() - trip.me.t < 2 * 60 * 1000;

  // The way found, as the trip from here on.
  // `note` is what the bar says of it (replan): by default, that you rerouted.
  function switchToAnother(note = { title: "Rerouted.", reason: "", now: anotherText().replace(/^Instead: /, "") }) {
    if (!another?.way || typeof tripFromNav !== "function") return;
    const next = tripFromNav(another.way, another.to, another.from);
    if (!next.legs.length) return;
    replan(another.j, another.k, next.legs, note);
  }

  // ---------- switched by itself ----------

  // What a trip is, for putting it back as it was (Undo).
  const SNAPSHOT = ["legs", "alerted", "readied", "lastWarned", "roads", "times", "left", "leg", "at", "pos", "anchor", "boarded", "moves", "legStartedAt"];

  function autoSwitch(words) {
    const reason = words.map((w) => w.text).join(" ");
    const now = anotherText().replace(/^Instead: /, "");
    switchToAnother({ title: "Switched to another way.", reason, now, key: another.key });
    if (navigator.vibrate) navigator.vibrate(BOARD_VIBRATION);
    notify({ title: "Switched to another way", body: `${reason} Now: ${now}`, tag: "switched", vibrate: BOARD_VIBRATION, channel: "board" });
  }

  function undoSwitch() {
    const s = trip?.switched;
    if (!s) return;
    Object.assign(trip, JSON.parse(s.undo));
    trip.switched = null;
    // Undoing a switch made by itself: not switched again for the same lost bus, as you chose
    // the way as it was.
    if (s.key) trip.keptWay = s.key;
    afterChange();
    watchLastBus();
  }

  // ---------- changing the trip from a stop on ----------

  // The trip from leg j's stop k on, as `legs`: that leg cut short there, then them. With k null,
  // `legs` from leg j on instead, j being the leg you're on: you're at the start of the first.
  // The server's told it was by hand, so its copy gives way (api/push/trips/[id].js). With `note`
  // ({ title, reason, now, key? }), the bar says so, with Undo back to the trip as it was.
  function replan(j, k, legs, note = null) {
    const undo = note ? JSON.stringify(Object.fromEntries(SNAPSHOT.map((x) => [x, trip[x] ?? null]))) : null;
    const cutLeg = k == null ? null : trip.legs[j];
    let cut = [];
    if (cutLeg) {
      const codes = stopCodes(cutLeg);
      const last = cutLeg.points.length - 1;
      cut = [{
        ...cutLeg,
        points: cutLeg.points.slice(0, k + 1),
        names: cutLeg.names?.slice(0, k + 1),
        codes: codes?.slice(0, k + 1),
        to: stopName(cutLeg, k),
        alight: codes ? codes[k] : undefined,
        minutes: ((cutLeg.minutes || 0) * k) / Math.max(1, last),
        walkAfter: 0,
        also: undefined,
      }];
    }
    const n = j + cut.length;
    const pad = (xs, keepCut, blank) => [...(xs || []).slice(0, j), ...(cut.length ? [keepCut ? xs?.[j] ?? blank() : blank()] : []), ...legs.map(blank)];
    trip.alerted = pad(trip.alerted, false, () => false);
    trip.readied = pad(trip.readied, true, () => false);
    trip.lastWarned = pad(trip.lastWarned, true, () => false);
    trip.roads = pad(trip.roads, false, () => null);
    trip.times = pad(trip.times, true, () => ({}));
    if (trip.left) trip.left.length = Math.min(trip.left.length, j);
    trip.legs = [...trip.legs.slice(0, j), ...cut, ...legs];
    if (!cut.length) {
      // On the first of the new legs, from its start.
      trip.times[j] = { start: Date.now() };
      Object.assign(trip, { at: 0, pos: 0, anchor: null, boarded: false, moves: [], legStartedAt: Date.now() });
      shown = null;
    }
    trip.switched = note ? { ...note, at: Date.now(), undo } : null;
    afterChange();
    // Cut short at or past where you are: off at the next stop, alerts and all.
    if (trip.leg < n) check();
    render();
    watchLastBus();
  }

  // The trip's legs changed (replan, Undo): what was found for the old ones goes, and the
  // server's told it was by hand.
  function afterChange() {
    delete trip.nearEnd;
    trip.alertText = null;
    trip.boardText = null;
    handMoved();
    builtLeg = null;
    lastHeard = {};
    another = null;
    changing = null;
    faster = null;
    trafficHeard = {};
    lastCheckedAt = 0;
    boardCheckedAt = 0;
    trafficCheckedAt = 0;
    fasterCheckedAt = Date.now();
    roadsAsked = null;
    save();
    sync();
    record();
    fetchRoads();
    watchTraffic();
    render();
  }

  // ---------- traffic on the buses still ahead ----------

  const TRAFFIC_EVERY_MS = 5 * 60 * 1000;
  // Said on the bar from this many minutes slower.
  const TRAFFIC_SAY_MIN = 2;
  // /api/traffic for each bus leg still ahead, by its index: { at, flows, factors, roads, incidents }.
  let trafficHeard = {};
  let trafficCheckedAt = 0;

  async function watchTraffic() {
    if (!trip || Date.now() - trafficCheckedAt < TRAFFIC_EVERY_MS - TICK_MS / 2) return;
    trafficCheckedAt = Date.now();
    const asked = trip;
    const legs = trip.legs;
    const heard = {};
    await Promise.all(legs.map(async (leg, i) => {
      if (i < trip.leg || leg.kind !== "bus" || leg.points.length < 2 || leg.points.length > 120) return;
      try {
        const points = leg.points.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(";");
        const res = await fetch(`/api/traffic?points=${encodeURIComponent(points)}`);
        const t = res.ok ? await res.json() : null;
        if (t?.at) heard[i] = t;
      } catch {}
    }));
    if (trip !== asked || trip.legs !== legs) return;
    trafficHeard = heard;
    render();
  }

  // The first bus still ahead that the traffic slows, or has an incident on its way: { i, leg,
  // extra, text }, the text saying why.
  function trafficNote() {
    for (let i = trip.leg; i < trip.legs.length; i++) {
      const t = trafficHeard[i];
      const leg = trip.legs[i];
      if (!t || leg.kind !== "bus") continue;
      const pos = i === trip.leg ? target() : 0;
      if (i === trip.leg && pos >= leg.points.length - 1) continue;
      const extra = Math.round(trafficExtra(i, pos));
      const incidents = (t.incidents || []).map((inc) => (typeof incidentText === "function" ? incidentText(inc) : inc.message));
      if (extra < TRAFFIC_SAY_MIN && !incidents.length) continue;
      const slow = extra >= TRAFFIC_SAY_MIN ? `${leg.label} ~${extra} min slower than usual${t.roads?.length ? `: heavy traffic on ${t.roads.join(" and ")}` : ""}.` : `${leg.label}:`;
      return { i, leg, extra, text: [slow, ...incidents].join(" ") };
    }
    return null;
  }

  // ---------- a faster way ----------

  const FASTER_EVERY_MS = 3 * 60 * 1000;
  // Suggested only if it gets you in this many minutes sooner, and this share of what's left.
  const FASTER_MIN = 5;
  const FASTER_SHARE = 0.15;
  // Not worth looking with less than this left.
  const FASTER_FROM_MIN = 10;
  // Keep my way puts suggestions away for this long, unless one comes that saves more again.
  const KEEP_FOR_MS = 15 * 60 * 1000;
  // Getting a bike out and parking it again.
  const BIKE_EXTRA_MIN = 2;
  // { from, to, j, k, reach, kind: "way" | "walk" | "cycle", way, minutes, saves, why }.
  let faster = null;
  let fasterCheckedAt = 0;
  let fasterKept = null; // { at, saves }
  let fasterSaid = null; // the last suggestion notified, so it's said once

  const rideKeyOf = (l) => `${l.kind || l.mode}:${String(l.kind === "bus" || l.mode === "bus" ? l.service || l.route : l.route || String(l.label || "").split(" ")[0]).toUpperCase()}`;

  // A way's minutes with its first bus by its live timing at the stop, catchable after the walk
  // there; null if none comes in time.
  async function liveMinutes(o) {
    const k = o.legs.findIndex((l) => l.mode !== "walk");
    if (k === -1) return o.minutes;
    const ride = o.legs[k];
    if (ride.mode !== "bus" || !ride.from?.code) return o.minutes;
    const walk = o.legs.slice(0, k).reduce((sum, l) => sum + (l.minutes || 0), 0);
    try {
      const res = await fetch(`/api/bus-arrivals?stop=${encodeURIComponent(ride.from.code)}&service=${encodeURIComponent(ride.route)}`, { cache: "no-store" });
      if (!res.ok) return o.minutes;
      const svc = (await res.json()).services?.find((s) => String(s.serviceNo).toUpperCase() === String(ride.route).toUpperCase());
      const due = [svc?.next, svc?.next2, svc?.next3].map((b) => b?.eta_ms).filter((ms) => ms != null).map((ms) => ms / 60000).find((m) => m >= walk);
      return due == null ? null : o.minutes - (ride.wait || 0) + (due - walk);
    } catch {
      return o.minutes;
    }
  }

  // Why another way's quicker, as far as the trip can tell: traffic, or a long wait.
  function whyFaster() {
    const note = trafficNote();
    if (note?.extra >= TRAFFIC_SAY_MIN) return `${note.leg.label} is slowed by traffic${note.leg && trafficHeard[note.i]?.roads?.length ? ` on ${trafficHeard[note.i].roads.join(" and ")}` : ""}`;
    const leg = trip.legs[trip.leg];
    if (toBoard(trip.leg) && busHeard?.tripId === trip.tripId && busHeard.leg === trip.leg) {
      const wait = Math.round((busHeard.at + busHeard.eta - Date.now()) / 60000);
      if (wait >= 8) return `${leg.label} isn't due for ${wait} min`;
    }
    return "";
  }

  async function watchFaster() {
    if (!trip || typeof fetchWays !== "function") return;
    if (Date.now() - fasterCheckedAt < FASTER_EVERY_MS - TICK_MS / 2) return;
    // A lost last bus comes first, and a switch just made stands.
    if (Object.values(lastHeard).some((w) => w.kind !== "soon") || trip.switched) return;
    const left = minutesLeft();
    if (left < FASTER_FROM_MIN) return;
    fasterCheckedAt = Date.now();
    const asked = trip;
    const legs = trip.legs;
    const leg = legs[trip.leg];
    const last = leg.points.length - 1;
    // On a ride: from its next stop, getting off there. Otherwise from where you are.
    let start;
    if (!isWalk(leg) && !toBoard(trip.leg)) {
      const k = Math.min(last, Math.floor(target()) + 1);
      if (k >= last) return;
      start = { from: { label: stopName(leg, k), lat: leg.points[k][0], lng: leg.points[k][1] }, j: trip.leg, k, reach: Math.max(0, rideMinutes(trip.leg, target()) - rideMinutes(trip.leg, k)) };
    } else {
      start = { from: whereNow(), j: trip.leg, k: null, reach: 0 };
    }
    const to = tripEnd();
    let data;
    try {
      const when = start.reach >= 1 && window.When?.msToAt ? { mode: "leave", at: When.msToAt(Date.now() + start.reach * 60000) } : null;
      data = await fetchWays(start.from, to, when);
    } catch {
      return;
    }
    if (trip !== asked || trip.legs !== legs) return;
    // Your own way from there, which isn't another.
    const mine = legs.slice(start.k == null ? start.j : start.j + 1).filter((l) => !isWalk(l)).map(rideKeyOf).join(">");
    const picks = [];
    for (const o of (data.options || []).filter((x) => !x.walkOnly && x.legs.filter((l) => l.mode !== "walk").map(rideKeyOf).join(">") !== mine).slice(0, 2)) {
      const minutes = await liveMinutes(o);
      if (minutes != null) picks.push({ kind: "way", way: o, minutes: start.reach + minutes });
    }
    if (data.others?.walk) picks.push({ kind: "walk", minutes: start.reach + data.others.walk.minutes });
    if (data.others?.cycle && LS.getBike()) picks.push({ kind: "cycle", minutes: start.reach + data.others.cycle.minutes + BIKE_EXTRA_MIN });
    if (trip !== asked || trip.legs !== legs) return;
    const best = picks.sort((a, b) => a.minutes - b.minutes)[0];
    const saves = best ? Math.round(left - best.minutes) : 0;
    const kept = fasterKept && Date.now() - fasterKept.at < KEEP_FOR_MS && saves < fasterKept.saves + FASTER_MIN;
    faster = best && saves >= Math.max(FASTER_MIN, left * FASTER_SHARE) && !kept
      ? { ...start, to, ...best, minutes: Math.round(best.minutes), saves, why: whyFaster() }
      : null;
    if (faster) {
      const said = `${faster.kind}:${faster.way ? faster.way.legs.map((l) => l.route || l.mode).join(">") : ""}`;
      if (said !== fasterSaid) {
        fasterSaid = said;
        notify({ title: `A faster way: saves ${faster.saves} min`, body: fasterText(), tag: "faster", channel: "board" });
      }
    }
    render();
  }

  function fasterText() {
    const f = faster;
    const by = byClock({ minutes: f.minutes });
    const why = f.why ? `, as ${f.why}` : "";
    const off = f.k != null ? `Get off at ${f.from.label}, then ` : "";
    if (f.kind === "walk") return `Faster to walk${f.k != null ? ` from ${f.from.label}` : ""}: ~${f.minutes} min${by}. Saves ${f.saves} min${why}.`;
    if (f.kind === "cycle") return `Faster by bike${f.k != null ? ` from ${f.from.label}` : ""}: ~${f.minutes} min${by}. Saves ${f.saves} min${why}.`;
    const step = firstStep(f.way);
    return `Faster: ${ridesText(f.way)}, ~${f.minutes} min${by}. Saves ${f.saves} min${why}. ${off}${off ? step[0].toLowerCase() + step.slice(1) : step}.`;
  }

  // On foot or by bike from one place to another, as a trip's leg.
  const footLeg = (from, to, minutes, cycle) => ({
    kind: "walk", label: cycle ? "Cycle" : "Walk", to: to.label, points: [[from.lat, from.lng], [to.lat, to.lng]],
    names: [from.label, to.label], minutes: Math.max(1, Math.round(minutes)), wait: 0, walkAfter: 0, ...(cycle && { cycle: true }),
  });

  function takeFaster() {
    const f = faster;
    if (!f) return;
    let legs;
    if (f.kind === "way") {
      if (typeof tripFromNav !== "function") return;
      legs = tripFromNav(f.way, f.to, f.from).legs;
    } else {
      legs = [footLeg(f.from, f.to, f.minutes - f.reach, f.kind === "cycle")];
    }
    if (!legs.length) return;
    const now = f.kind === "way" ? `${firstStep(f.way)}.` : `${f.kind === "cycle" ? "Cycle" : "Walk"} the rest of the way, ~${f.minutes - Math.round(f.reach)} min.`;
    replan(f.j, f.k, legs, { title: f.k != null ? `Changed at ${f.from.label} for a faster way.` : "Rerouted to a faster way.", reason: "", now });
  }

  // ---------- changing the trip from a stop on ----------

  // Change here, from the timeline: { j, k, from, to, ways, failed }, ways null while looked for.
  let changing = null;
  const MAX_CHANGE_WAYS = 4;

  async function changeAt(j, k) {
    const leg = trip.legs[j];
    if (!leg || typeof fetchWays !== "function") return;
    const from = { label: stopName(leg, k), lat: leg.points[k][0], lng: leg.points[k][1] };
    const to = tripEnd();
    const asked = (changing = { j, k, from, to, ways: null });
    setExpanded(false);
    render();
    try {
      const data = await fetchWays(from, to);
      if (changing !== asked) return;
      // Not staying on the ride you're getting off.
      const same = rideKey(leg.kind, leg.kind === "bus" ? leg.service : String(leg.route || leg.label || "").split(" ")[0], leg.kind === "bus" ? stopCodes(leg)?.[k] : "");
      changing.ways = (data.options || []).filter((o) => {
        const first = o.legs.find((l) => l.mode !== "walk");
        return !first || rideKey(first.mode, first.route, first.mode === "bus" ? first.from?.code : "") !== same;
      }).slice(0, MAX_CHANGE_WAYS);
    } catch {
      if (changing !== asked) return;
      changing.ways = [];
      changing.failed = true;
    }
    render();
  }

  function takeChange(i) {
    const o = changing?.ways?.[i];
    if (!o || typeof tripFromNav !== "function") return;
    const next = tripFromNav(o, changing.to, changing.from);
    if (!next.legs.length) return;
    replan(changing.j, changing.k, next.legs, { title: `Changed at ${changing.from.label}.`, reason: "", now: `${firstStep(o)}.` });
  }

  function renderChange() {
    const box = $("#tripChange");
    // A leg moved on past, or the trip changed, since it was asked.
    if (changing && (changing.j < trip.leg || !trip.legs[changing.j])) changing = null;
    box.hidden = !changing;
    if (!changing) return;
    const head = `<p class="tripChangeHead">Change at ${esc(changing.from.label)}</p>`;
    const body = changing.ways == null
      ? `<p>Finding the ways on from there…</p>`
      : changing.ways.length
        ? changing.ways.map((o, i) => `<button type="button" class="tripChangeWay" data-trip-change="${i}">` +
          `<b>${esc(o.walkOnly ? "Walk the rest of the way" : ridesText(o))}</b><span>~${o.minutes} min${esc(byClock(o))}. ${esc(firstStep(o))}.</span></button>`).join("")
        : `<p>${changing.failed ? "Couldn't find the ways on just now." : "No other way on by bus or train is running from there now."}</p>`;
    box.innerHTML = head + body +
      `<div class="tripChangeActions"><button type="button" class="iconBtn" data-trip-change="all">See all ways</button>` +
      `<button type="button" class="iconBtn" data-trip-change="cancel">Cancel</button></div>`;
  }

  // Navigate's Bus and train, from `from` to the trip's end, for every way.
  function seeAllWays(from, to) {
    if (!from || typeof openNav !== "function") return;
    try {
      localStorage.setItem("sgbus_nav_mode", "all");
    } catch {}
    openNav(from, to, { focus: false });
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

  // On to the next part, by itself or by hand (Next). Where you'd got to on this one is kept,
  // for Back.
  function nextLeg(byHand = false) {
    endLegTime();
    (trip.left ??= [])[trip.leg] = {
      at: trip.at, pos: trip.pos || 0, anchor: trip.anchor || null, boarded: Boolean(trip.boarded), legStartedAt: trip.legStartedAt,
    };
    if (byHand) handMoved();
    trip.leg += 1;
    trip.times[trip.leg] = { start: Date.now() };
    delete trip.nearEnd;
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

  // Back to the part before, by hand: it's on again where you'd got to on it, or from its start
  // if you'd finished it (the move on was wrong, so you hadn't), and your location takes it from
  // there. Its alert, if you're back before its stop, and every alert and Get ready to board
  // after it, can go off again.
  function prevLeg() {
    if (!trip || trip.leg === 0) return;
    const from = trip.leg;
    trip.times[from] = {};
    trip.leg -= 1;
    const leg = trip.legs[trip.leg];
    const last = leg.points.length - 1;
    const was = trip.left?.[trip.leg];
    const t = trip.times[trip.leg] || (trip.times[trip.leg] = { start: Date.now() });
    delete t.end;
    if (was && was.at < last) {
      Object.assign(trip, { at: was.at, pos: was.pos, anchor: was.anchor, boarded: was.boarded, legStartedAt: was.legStartedAt });
    } else {
      Object.assign(trip, { at: 0, pos: 0, anchor: null, boarded: false, legStartedAt: Date.now() });
      delete t.board;
      delete t.gps;
    }
    if (trip.left) trip.left.length = trip.leg;
    trip.moves = [];
    trip.onLegAt = 0;
    delete trip.nearEnd;
    trip.alertText = null;
    trip.boardText = null;
    trip.arrived = false;
    clearTimeout(arrivedTimer);
    arrivedTimer = null;
    for (let i = trip.leg; i < trip.legs.length; i++) {
      if (i > trip.leg || trip.at < last - ALERT_STOPS) trip.alerted[i] = false;
      if (i > trip.leg || !trip.boarded) trip.readied[i] = false;
    }
    handMoved();
    shown = null;
    save();
    sync();
    record();
    boardCheckedAt = 0;
    watchBoard();
  }

  // Moved by hand: the server's told so its place doesn't win (sync), and an answer to a sync
  // sent before it is ignored (adopt).
  let handMoves = 0;
  function handMoved() {
    handMoves += 1;
    trip.movedAt = Date.now();
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
      arrivedTimer ??= setTimeout(() => {
        arrivedTimer = null;
        stop();
      }, 60 * 1000);
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

    soundAlert(text);
    flash();
    // The bar keeps saying so until you pass another stop, rather than until the next
    // redraw, which comes straight after this.
    trip.alertText = text;
    trip.alertLeft = left;
    render(text);
    sync();
  }

  // The alert's buzz, beeps and notification. In the app, its own notification, which sounds
  // over the lock screen even with the page in the background; with Settings' earphones only
  // (js/reminders.js), the app plays the beeps itself, in the earphones if they're in, and
  // never out loud (TripPlugin.alert's quiet).
  function soundAlert(text) {
    const quiet = nativeSubs && Boolean(window.Reminders?.earphonesOnly());
    if (navigator.vibrate) navigator.vibrate(VIBRATION);
    if (!quiet) beep();
    if (nativeSubs) AppBridge.call("Trip", "alert", { title: "Get Off Alert", body: text, quiet }).catch(() => {});
    else notify({ title: "Get Off Alert", body: text, tag: "get-off", vibrate: VIBRATION, channel: "get_off" });
  }

  // The server sent the alert (it follows the bus too, from LTA's live positions): shown on
  // the bar. From sw.js, which has already shown it as a notification, it isn't sounded again;
  // from the app while it's in front (`sound`), where Android shows nothing for a push, it's
  // sounded here as if the page had found it, unless the page already has.
  function alertedElsewhere({ tripId, leg, text }, sound = false) {
    if (!trip || tripId !== trip.tripId || trip.alerted[leg]) return;
    if (leg === trip.leg && wellShort()) return overrule();
    trip.alerted[leg] = true;
    if (leg === trip.leg) {
      if (sound && enabled()) soundAlert(text);
      trip.alertText = text;
      trip.alertLeft = stopsLeft();
      flash();
    }
    save();
    render();
  }

  // Whether a fresh fix has you well short of the Get Off Alert on this part: more than a stop
  // before where it goes off. Then an alert from the server, which follows a bus rather than
  // you, was about the wrong one (one that left the stop before you got there, say), and the
  // app's own place stands.
  function wellShort() {
    const leg = trip.legs[trip.leg];
    return !isWalk(leg) && trip.lastFixAt > 0 && Date.now() - trip.lastFixAt <= FIX_STALE_MS && stopsLeft() > ALERT_STOPS + 1;
  }

  // Turns down the server's alert for this part: it can go off again, and the server hears the
  // app's place stands over the bus it was following (realignedAt, as realign does).
  function overrule() {
    trip.alerted[trip.leg] = false;
    trip.alertText = null;
    trip.realignedAt = Date.now();
    save();
    render();
    sync();
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
      // When you last moved the trip by hand (Back or Next): its place stands over the server's.
      movedAt: trip.movedAt || 0,
      // Whether the clock may move you on: not on a bus until you're on board for sure.
      clockRuns: underWay(trip.legs[trip.leg]),
      alerted: trip.alerted,
      readied: trip.readied,
      // Settings' earphones only, in the app: the server's Get Off Alert goes on the app's
      // quiet channel, which buzzes and never sounds out loud (api/_push/fcm.js).
      quiet: Boolean(window.Reminders?.earphonesOnly()),
    });
    const moves = handMoves;
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
      const state = await res.json();
      // Moved by hand since this went: what the server had then is out of date.
      if (moves === handMoves) adopt(state);
    } catch (err) {
      console.warn("get off alert server unavailable:", err);
    }
  }

  function adopt(state) {
    if (!trip || state?.tripId !== trip.tripId) return;
    // An alert the server sent for this part while a fresh fix has you well short of it: turned
    // down, rather than taken as given, which would keep the app's own from going off.
    const wrong = state.leg === trip.leg && state.alerted[trip.leg] && wellShort();
    state.alerted.forEach((a, i) => {
      if (a && !(wrong && i === trip.leg)) trip.alerted[i] = true;
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
      Object.assign(trip, { leg: state.leg, at: 0, pos: 0, anchor: null, boarded: false, moves: [], alertText: null, boardText: null, legStartedAt: began, nearEnd: undefined });
      shown = null;
    }
    save();
    render();
    if (moved) record();
    if (wrong) overrule();
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
  // The minutes still to go, as progress counts them: the trip bar and the app's notification
  // say it too (statusText).
  function minutesLeft() {
    return minutesTo(trip.legs.length);
  }

  // The same up to where leg n begins: its stop, before its wait. 0 for the leg you're on.
  function minutesTo(n) {
    if (n <= trip.leg) return 0;
    const leg = trip.legs[trip.leg];
    const last = leg.points.length - 1;
    const pos = target();
    let minutes = rideMinutes(trip.leg, pos) + (leg.walkAfter || 0);
    if (pos < 0.5 && !underWay(leg)) {
      // The bus's live timing at your stop (watchBoard) over the wait planned for it.
      const heard = busHeard?.tripId === trip.tripId && busHeard.leg === trip.leg ? busHeard.at + busHeard.eta : null;
      const due = heard ?? trip.anchor?.t ?? trip.legStartedAt + (leg.wait || 0) * 60000;
      minutes += Math.max(0, due - Date.now()) / 60000;
    }
    for (let i = trip.leg + 1; i < n; i++) {
      const l = trip.legs[i];
      minutes += (l.wait || 0) + rideMinutes(i, 0) + (l.walkAfter || 0);
    }
    return minutes;
  }

  // A ride's minutes from `pos` (a stop index with a fraction) to its end: for a bus whose
  // usual minutes are known, stretch by stretch by the traffic on each (watchTraffic);
  // otherwise its planned minutes, by how far along it you are.
  function rideMinutes(i, pos = 0) {
    const leg = trip.legs[i];
    const last = Math.max(1, leg.points.length - 1);
    const t = trafficHeard[i];
    if (leg.kind !== "bus" || !leg.usual || t?.factors?.length !== last) return (leg.minutes || 0) * (1 - Math.min(pos, last) / last);
    const per = leg.usual / last;
    const from = Math.min(Math.floor(pos), last);
    let m = 0;
    for (let s = from; s < last; s++) m += per * t.factors[s] * (s === from ? 1 - (pos - s) : 1);
    return m;
  }

  // How many minutes the traffic adds to a bus ride from `pos` on, over its usual.
  function trafficExtra(i, pos = 0) {
    const leg = trip.legs[i];
    if (!leg.usual || !trafficHeard[i]) return 0;
    const last = Math.max(1, leg.points.length - 1);
    return rideMinutes(i, pos) - leg.usual * (1 - Math.min(pos, last) / last);
  }

  function progress() {
    if (!trip) return null;
    const leg = trip.legs[trip.leg];
    const last = leg.points.length - 1;
    const pos = target();
    const minutes = minutesLeft();
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
      // Each train ride's line and stations, so a shared ETA's live map draws it along its
      // track (js/rail-tracks.js).
      trains: trip.legs.map((l, i) => l.kind === "train" && { leg: i, route: l.route || String(l.label || "").split(" ")[0], points: l.points }).filter(Boolean),
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

  // The trip bar's line: where you are on this part, or the alert while it stands.
  // Other buses that go straight from a bus leg's stop to where it's left, from the route
  // list (js/network.js): any of them gets you there without a change. Worked out once the
  // routes are in, and kept with the leg.
  function directBuses(leg) {
    if (leg.kind !== "bus" || !leg.service || !leg.board || !leg.alight) return [];
    if (leg.also) return leg.also;
    if (!window.BusNet?.isReady()) return [];
    const own = String(leg.service).toUpperCase();
    leg.also = BusNet.servicesAtStop(leg.board).filter((no) => no.toUpperCase() !== own && BusNet.directions(no).some((dir) => {
      const stops = BusNet.runStops(no, dir);
      const i = stops.indexOf(leg.board);
      return i !== -1 && stops.indexOf(leg.alight, i + 1) !== -1;
    }));
    return leg.also;
  }

  // Which of them call at a stop along the leg on their way from its first stop to its last,
  // for that stop's timings from the timeline: with the leg's own bus, as "21,59".
  function busesAt(leg, code) {
    const also = directBuses(leg).filter((no) => BusNet.directions(no).some((dir) => {
      const stops = BusNet.runStops(no, dir);
      const from = stops.indexOf(leg.board);
      const at = stops.indexOf(code, from);
      return from !== -1 && at !== -1 && stops.indexOf(leg.alight, at) !== -1;
    }));
    return [leg.service, ...also].filter(Boolean).join(",");
  }

  // The direct buses for the bar while you wait at the stop, soonest first, each with its
  // time while the last check is fresh: "Also direct: 51 in 3 min, 63".
  function alsoText(leg) {
    const also = directBuses(leg);
    if (!also.length) return "";
    const heard = alsoHeard?.leg === trip.leg && Date.now() - alsoHeard.at < 2 * BOARD_CHECK_MS ? alsoHeard : null;
    const left = (no) => {
      const eta = heard?.etas[no];
      return eta == null ? null : eta - (Date.now() - heard.at);
    };
    const buses = also
      .map((no) => ({ no, ms: left(no) }))
      .filter(({ ms }) => ms == null || ms > BOARD_GONE_MS)
      .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
    if (!buses.length) return "";
    const when = (ms) => (ms == null ? "" : ms <= 60 * 1000 ? " arriving" : ` in ${Math.round(ms / 60000)} min`);
    return `Also direct: ${buses.map(({ no, ms }) => no + when(ms)).join(", ")}`;
  }

  // The route list, for the stops' codes on the timeline and the direct buses; asked for
  // once a trip, then everything's drawn again with them.
  let routesAsked = false;
  function needRoutes() {
    if (routesAsked || !window.BusNet || BusNet.isReady()) return;
    if (!trip.legs.some((leg) => leg.kind === "bus")) return;
    routesAsked = true;
    BusNet.load()
      .then(() => {
        if (!trip) return;
        builtLeg = null;
        render();
      })
      .catch(() => {});
  }

  // What the trip bar and the app's notification say: where you are on this part, and the
  // minutes to the end of the whole trip, which an alert or Get ready to board keeps too.
  function statusText(message) {
    const leg = trip.legs[trip.leg];
    const left = stopsLeft();
    const arrived = left === 0 && trip.leg === trip.legs.length - 1;
    // Not on a walk that's the whole trip, which says its minutes already.
    const togo = arrived || (trip.legs.length === 1 && isWalk(leg)) ? "" : ` · ~${Math.max(1, Math.round(minutesLeft()))} min left`;
    if (!message && trip.alertText && trip.alertLeft === left) message = trip.alertText;
    // Get ready to board stands while you're still waiting for the bus.
    if (!message && trip.boardText && trip.readied?.[trip.leg] && leg.kind === "bus" && !trip.boarded && target() < 0.5) message = trip.boardText;
    if (message) return message + togo;
    const where = isWalk(leg)
      ? `${leg.cycle ? "Cycle" : "Walk"} to ${leg.to}${left === 0 ? ": there" : `, about ${Math.max(1, Math.round((leg.minutes || 1) * (1 - target())))} min`}`
      : `${leg.label}: ${left === 0 ? `at ${leg.to}` : `${left} stop${left === 1 ? "" : "s"} to ${leg.to}`}`;
    return where + (trip.legs.length > 1 ? ` · part ${trip.leg + 1} of ${trip.legs.length}` : "") + togo;
  }

  // ---------- MyICA, on a trip to a checkpoint ----------

  const ICA_PLAY = "https://play.google.com/store/apps/details?id=sg.gov.ica.mobile.app";
  const ICA_APP_STORE = "https://apps.apple.com/sg/app/myica-mobile/id1584952674";
  const ICA_ANDROID = "intent://open/myica#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;" +
    `S.browser_fallback_url=${encodeURIComponent(ICA_PLAY)};end`;

  // Where the button goes, or null off a phone.
  function icaLink() {
    const ua = navigator.userAgent;
    // iPadOS asks for desktop sites, so says it's a Mac; a touch screen gives it away.
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 0)) return ICA_APP_STORE;
    if (!/Android/i.test(ua)) return null;
    // Only an app that knows MyICA: an older one's OpenAppActivity would do nothing with it.
    return window.AppBridge?.native && AppBridge.has("myica") ? ICA_ANDROID : ICA_PLAY;
  }

  // Whether a trip goes to a checkpoint: gets on or off a ride at one, rides on across the
  // border (where everyone gets off to clear it), or walks or ends there. Not a ride that only
  // passes one, as buses along Woodlands Centre Rd pass the train checkpoint's stop. Worked out
  // once a trip.
  const atCheckpoint = new WeakMap();
  function toCheckpoint(t) {
    if (!atCheckpoint.has(t)) {
      const net = window.BusNet;
      const ends = (l) => [l.points?.[0], l.points?.[l.points.length - 1]];
      atCheckpoint.set(t, !!net && (
        t.legs.some((l) => [l.board, l.alight, l.codes?.[0], l.codes?.[l.codes.length - 1]].some((c) => c && (net.isCheckpoint(c) || net.crossBorder(c)?.abroad)) ||
          (l.codes || []).some((c) => net.crossBorder(c)?.abroad) ||
          ends(l).some(net.nearCheckpoint)) ||
        (!!t.to && net.nearCheckpoint([t.to.lat, t.to.lng]))));
    }
    return atCheckpoint.get(t);
  }

  function renderIca() {
    const btn = $("#tripIca");
    const href = toCheckpoint(trip) ? icaLink() : null;
    btn.hidden = !href;
    if (!href) return;
    btn.href = href;
    // An intent is handed to Android, not opened in a tab. A store page is, so this page and
    // its trip stay put even where the store's own app doesn't take it.
    if (href === ICA_ANDROID) btn.removeAttribute("target");
    else btn.target = "_blank";
    btn.rel = "noopener noreferrer";
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
    needRoutes();
    const notes = [];
    // While you wait at the stop: the other buses that go straight there.
    if (leg.kind === "bus" && !trip.boarded && target() < 0.5) {
      const also = alsoText(leg);
      if (also) notes.push(`${also}.`);
    }
    if (!enabled()) notes.push("Get Off Alert is off in Settings.");
    if (trip.noLocation) notes.push("No location: going by the clock.");
    else if (Date.now() - trip.lastFixAt > FIX_STALE_MS && trip.lastFixAt) notes.push("Location weak: going by the clock.");
    $("#tripNote").textContent = notes.join(" ");
    $("#tripNote").hidden = !notes.length;
    // Last bus soon, for the rides still to board (watchLastBus), with another way for a lost one.
    const warns = Object.entries(lastHeard).filter(([i]) => toBoard(Number(i))).map(([, w]) => w);
    const lost = warns.some((w) => w.kind !== "soon");
    $("#tripWarn").innerHTML = warns.map((w) => `<p class="tripWarnLine">${window.icon("alert")}<span>${esc(w.text)}</span></p>`).join("") +
      (lost && another
        ? `<div class="tripAnother"><p>${esc(anotherText())}</p>` +
          (another.way ? `<button type="button" class="btn tripGo" data-trip-another="switch" title="${another.via ? `Keep the trip to ${esc(another.from.label)}, then go this way` : "Go this way from where you are"}">Reroute</button>` : "") +
          (located()
            ? `<button type="button" class="iconBtn" data-trip-another="here">Navigate from here</button>`
            : `<button type="button" class="iconBtn" data-trip-another="all">See all ways</button>`) + `</div>`
        : lost ? `<div class="tripAnother"><p>Finding another way…</p></div>` : "");
    // The trip changed, by itself (autoSwitch) or by you: what, why, what's next, and Undo.
    const sw = trip.switched;
    if (sw) {
      $("#tripWarn").innerHTML = `<p class="tripSwitched">${window.icon("alert")}<span><b>${esc(sw.title || "Switched to another way.")}</b>${sw.reason ? ` ${esc(sw.reason)}` : ""} Now: ${esc(sw.now)}</span></p>` +
        `<div class="tripAnother"><button type="button" class="iconBtn" data-trip-switched="undo">Undo</button>` +
        `<button type="button" class="iconBtn" data-trip-switched="ok">OK</button></div>` + $("#tripWarn").innerHTML;
    }
    $("#tripWarn").hidden = !warns.length && !sw;
    // Traffic on a bus still ahead, and why; tapped, its road on the live map.
    const jam = trafficNote();
    $("#tripTraffic").hidden = !jam;
    if (jam) {
      $("#tripTraffic").dataset.leg = jam.i;
      $("#tripTraffic").innerHTML = `${window.icon("alert")}<span>${esc(jam.text)} <u>See it on the map</u></span>`;
    }
    // A faster way, and why.
    $("#tripFaster").hidden = !faster;
    if (faster) {
      $("#tripFaster").innerHTML = `<p>${window.icon("route")}<span>${esc(fasterText())}</span></p>` +
        `<div class="tripAnother"><button type="button" class="btn tripGo" data-trip-faster="take">Reroute</button>` +
        `<button type="button" class="iconBtn" data-trip-faster="keep">Keep my way</button></div>`;
    }
    renderChange();
    $("#tripPrev").hidden = trip.leg === 0;
    $("#tripNext").hidden = trip.leg >= trip.legs.length - 1;
    renderIca();
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

  // A bus leg's stop codes, one per point, for the timeline's buttons: its own, or for a leg
  // without them (a OneMap way, or a trip from before they were sent), worked out from the
  // bus's route (js/network.js) by where it's boarded and left. Null if neither fits.
  function stopCodes(leg) {
    if (leg.kind !== "bus") return null;
    if (leg.codes?.length === leg.points.length) return leg.codes;
    if (!leg.service || !leg.board || !leg.alight || !window.BusNet?.isReady()) return null;
    for (const dir of BusNet.directions(leg.service)) {
      const stops = BusNet.runStops(leg.service, dir);
      const i = stops.indexOf(leg.board);
      const j = i === -1 ? -1 : stops.indexOf(leg.alight, i + 1);
      if (j !== -1 && j - i + 1 === leg.points.length) return (leg.codes = stops.slice(i, j + 1));
    }
    return null;
  }

  // Every leg from this one on, each a column of its stops. Only this leg has the dot.
  function buildTimeline() {
    const box = $("#tripTimeline");
    // Change my way, where there's a ride still ahead to change from.
    const canChange = trip.legs.some((l, i) => i >= trip.leg && !isWalk(l));
    const mode = !canChange ? ""
      : choosingChange
        ? `<p class="tlChangeMode"><span>Tap Change here by the stop to get off at.</span><button type="button" class="iconBtn" data-tl-change-mode="off">Cancel</button></p>`
        : `<p class="tlChangeMode"><button type="button" class="iconBtn" data-tl-change-mode="on">${window.icon("swap")} Change my way</button></p>`;
    box.innerHTML = mode + trip.legs
      .slice(trip.leg)
      .map((leg, k) => {
        const last = leg.points.length - 1;
        const final = trip.leg + k === trip.legs.length - 1;
        const alertAt = last - ALERT_STOPS;
        const codes = stopCodes(leg);
        const also = directBuses(leg);
        const stops = leg.points
          .map((_, i) => {
            const tag = i === last
              ? `<span class="tlTag">${window.icon("flag")} ${isWalk(leg) ? (final ? "Arrive" : "Board") : final ? "Get off" : "Change"}</span>`
              : i === alertAt && alertAt > 0 && enabled()
                ? `<span class="tlTag">${window.icon("bell")} Alert</span>`
                : "";
            // A bus stop with its code: a button to its timings for this bus, and the other direct
            // buses that call there (init).
            const code = codes?.[i] || null;
            const buses = code ? busesAt(leg, code) : "";
            const which = buses.includes(",") ? `buses ${buses.split(",").join(", ")}` : leg.label;
            const name = code
              ? `<button type="button" class="tlName tlGo" data-tl-stop="${esc(code)}" data-tl-bus="${esc(buses)}" title="Timings for ${esc(which)} here">${esc(stopName(leg, i))}</button>`
              : `<span class="tlName">${esc(stopName(leg, i))}</span>`;
            // Change here: a stop still ahead on a ride, to get off at and go on another way, once
            // Change my way's been tapped.
            const ahead = choosingChange && !isWalk(leg) && i > 0 && (k > 0 || i > Math.floor(target()));
            const change = ahead ? `<button type="button" class="tlChange" data-tl-change="${trip.leg + k},${i}" title="Get off here and go on another way">Change here</button>` : "";
            return `<li class="tlStop${i === last ? " end" : ""}"><span class="tlNode"></span>${name}${tag}${change}</li>`;
          })
          .join("");
        return (
          `<section class="tlLeg${k === 0 ? " current" : ""}">` +
          `<p class="tlHead">${window.icon(leg.kind === "train" ? "train" : isWalk(leg) ? "walk" : "bus")} ${esc(leg.label)} <span>to ${esc(leg.to)}</span></p>` +
          (also.length ? `<p class="tlAlso">Also direct: ${also.map(esc).join(", ")}</p>` : "") +
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

  // How much of the bottom of the screen the trip bar takes, as --trip-h on the page, so the
  // Edge Tray's column ends above it (style.css) and its last buttons, Settings among them, can
  // be scrolled to rather than sitting under the bar; the page's end likewise. Kept in step as the bar grows or goes.
  function fitTray() {
    const bar = $("#tripBar");
    const shown = !bar.classList.contains("hidden") && bar.offsetHeight > 0;
    const h = shown ? Math.max(0, window.innerHeight - bar.getBoundingClientRect().top) : 0;
    document.documentElement.style.setProperty("--trip-h", `${Math.round(h)}px`);
  }
  if ("ResizeObserver" in window) new ResizeObserver(fitTray).observe($("#tripBar"));
  new MutationObserver(fitTray).observe($("#tripBar"), { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", fitTray);

  // Whether Change my way's been tapped, for the timeline's Change here buttons.
  let choosingChange = false;

  function setExpanded(on) {
    expanded = on && !!trip;
    if (!expanded) choosingChange = false;
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
      if (e.target.closest("#tripEnd, #tripPrev, #tripNext, #tripShare, #tripMap, #tripIca")) return;
      setExpanded(!expanded);
    });
    $("#tripEnd").addEventListener("click", () => stop());
    // A stop on the timeline: the timeline closes, and the page goes down to its timings for
    // that bus.
    $("#tripTimeline").addEventListener("click", (e) => {
      const mode = e.target.closest("[data-tl-change-mode]");
      if (mode) {
        choosingChange = mode.dataset.tlChangeMode === "on";
        buildTimeline();
        return;
      }
      const change = e.target.closest("[data-tl-change]");
      if (change) {
        choosingChange = false;
        const [j, k] = change.dataset.tlChange.split(",").map(Number);
        return changeAt(j, k);
      }
      const go = e.target.closest("[data-tl-stop]");
      if (!go || typeof window.loadStop !== "function") return;
      setExpanded(false);
      window.loadStop(go.dataset.tlStop, { service: go.dataset.tlBus || null, scroll: true });
    });
    $("#tripMap").addEventListener("click", () => window.LiveMap?.trip());
    $("#tripWarn").addEventListener("click", (e) => {
      const what = e.target.closest("[data-trip-another]")?.dataset.tripAnother;
      if (what === "switch") switchToAnother();
      else if (what === "all") seeAllWays(another?.from, another?.to);
      else if (what === "here" && another && typeof openNavFromHere === "function") openNavFromHere(another.to);
    });
    $("#tripWarn").addEventListener("click", (e) => {
      const what = e.target.closest("[data-trip-switched]")?.dataset.tripSwitched;
      if (what === "undo") undoSwitch();
      else if (what === "ok" && trip) {
        trip.switched = null;
        save();
        render();
      }
    });
    $("#tripTraffic").addEventListener("click", () => {
      const leg = trip?.legs[Number($("#tripTraffic").dataset.leg)];
      if (leg) window.LiveMap?.traffic({ points: leg.points, names: leg.names, title: `${leg.label} to ${leg.to}` });
    });
    $("#tripFaster").addEventListener("click", (e) => {
      const what = e.target.closest("[data-trip-faster]")?.dataset.tripFaster;
      if (what === "take") takeFaster();
      else if (what === "keep" && faster) {
        fasterKept = { at: Date.now(), saves: faster.saves };
        faster = null;
        render();
      }
    });
    $("#tripChange").addEventListener("click", (e) => {
      const what = e.target.closest("[data-trip-change]")?.dataset.tripChange;
      if (what == null) return;
      if (what === "all") seeAllWays(changing?.from, changing?.to);
      else if (what === "cancel") changing = null;
      else return takeChange(Number(what));
      if (what === "cancel") render();
    });
    $("#tripNext").addEventListener("click", () => {
      if (!trip || trip.leg >= trip.legs.length - 1) return;
      nextLeg(true);
      render();
    });
    $("#tripPrev").addEventListener("click", () => {
      if (!trip) return;
      prevLeg();
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
    // A reload mid-trip carries on, and so does opening again after the app was closed.
    try {
      const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY) || "null");
      if (saved?.legs?.length) return resume(saved);
      const kept = JSON.parse(localStorage.getItem(KEPT_KEY) || "null");
      if (!kept?.trip?.legs?.length) return;
      if (!(Date.now() - kept.at < KEPT_FOR_MS)) return forget(kept.trip.tripId);
      // Another tab still running it keeps it to itself.
      if (!navigator.locks) return resume(kept.trip);
      navigator.locks.query()
        .then((state) => { if (!trip && !state.held?.some((l) => l.name === LOCK)) resume(kept.trip); })
        .catch(() => {});
    } catch {}
  }

  function resume(saved) {
    trip = saved;
    trip.tripId ??= crypto.randomUUID();
    // A trip saved by a version from before Your trips.
    trip.times ??= trip.legs.map((_, i) => (i === trip.leg ? { start: trip.legStartedAt } : {}));
    trip.startedAt ??= trip.legStartedAt;
    // And from before Get ready to board.
    trip.readied ??= trip.legs.map(() => false);
    // And from before the roads.
    trip.roads ??= trip.legs.map(() => null);
    save();
    // For its shared ETA, which may have looked for it before it was back (js/share.js).
    window.dispatchEvent(new CustomEvent("trip:resume", { detail: { tripId: trip.tripId } }));
    if (window.AppBridge?.native) AppBridge.ready(5000).then(() => trip && run());
    else run();
  }

  window.Trip = {
    start, stop, enabled, active: () => Boolean(trip), progress, setShare,
    // For the live map (js/map.js).
    legs: () => trip?.legs || null,
    title: () => trip?.title || null,
    status: () => (trip ? statusText() : null),
    // Leg i's road (fetchRoads), { path, stops, cum }: null till it's in, false if there's none.
    road: (i) => trip?.roads?.[i] ?? null,
  };
  init();
})();
