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
// Trip.start({ title, legs }) with legs of
// { kind: "bus" | "train", label, to, points: [[lat, lng], ...], names, minutes, wait,
//   service, board, alight }:
// `points` are the stops from boarding to alighting, so a leg of 5 stops has 6 points, and
// `names` (optional) names each of them for the timeline. A bus leg's `service` and `alight`
// (the stop code you get off at) let the server find the bus, and `board` (the stop code you
// get on at) lets the clock wait for it; without them it goes by the clock alone.
//
// Tapping the trip bar opens that timeline: the stops still ahead, with a blue dot where you
// are, gliding between stops like a progress bar. It's drawn once a frame only while the dot
// is moving, and moved with transforms, so an open timeline doesn't make the page lag.
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
  // this long (noteMove).
  const MOVE_STOPS = 0.5;
  const MOVE_WINDOW_MS = 10 * 60 * 1000;
  // Near enough to a stop on the leg to say you're there.
  const ON_ROUTE_M = 250;
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

  let trip = null;
  let watchId = null;
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

  function start({ title, legs }) {
    if (!legs?.length) return;
    stop(false);
    trip = {
      tripId: crypto.randomUUID(),
      title,
      legs,
      leg: 0,
      at: 0, // the index of the stop you're at or have just passed, on the current leg
      legStartedAt: Date.now(),
      lastFixAt: 0,
      alerted: legs.map(() => false),
      noLocation: false,
    };
    save();
    run();
    // Asked once, so the alert can also show as a notification over a locked screen's wake.
    // Once allowed, the server can send it while the app is in the background too.
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(sync).catch(() => {});
  }

  function run() {
    if (!trip) return;
    render();
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    } else {
      trip.noLocation = true;
    }
    tick = setInterval(onTick, TICK_MS);
    keepAwake();
    sync();
  }

  function stop(clear = true) {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(tick);
    tick = null;
    releaseAwake();
    if (clear) {
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
    if (realign(here, accuracy, leg)) return;
    if (accuracy > GOOD_FIX_M) return;
    trip.lastFixAt = Date.now();
    trip.noLocation = false;

    // Not yet on the bus for sure: you stay at the first stop, and the clock waits, until the
    // fixes show you moving along its route (noteMove).
    if (!underWay(leg) && !noteMove(alongLeg(here, leg, 0))) {
      trip.anchor = { pos: 0, t: Date.now() };
      save();
      render();
      return;
    }

    // The nearest stop on this leg at or past the last one, so a fix that wobbles behind
    // can't send you back; realign deals with one that's really somewhere else.
    let best = -1;
    let bestM = Infinity;
    for (let i = Math.max(0, trip.at - 1); i < leg.points.length; i++) {
      const m = metres(here, leg.points[i]);
      if (m < bestM) [best, bestM] = [i, m];
    }
    if (best !== -1 && bestM <= ON_ROUTE_M) trip.at = Math.max(trip.at, best);
    // How far between stops, for the timeline's dot.
    const along = alongLeg(here, leg, trip.at);
    if (along != null) trip.pos = Math.max(trip.pos || 0, along);
    // The clock goes on from here if the fixes stop.
    trip.anchor = { pos: Math.max(trip.pos || 0, trip.at), t: Date.now() };

    // Off at the end of this leg and already near the next one's first stop: on to it.
    const next = trip.legs[trip.leg + 1];
    if (next && trip.at >= leg.points.length - 1 && metres(here, next.points[0]) <= ON_ROUTE_M) nextLeg();
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

  // Good fixes along the leg before boarding, as { along, t }. Boarded once one is at least
  // MOVE_STOPS further along than another in the last MOVE_WINDOW_MS, and past the first
  // stop: really moving down the route, not a fix wobbling about the stop you wait at. Says
  // whether you're now on board.
  function noteMove(along) {
    if (along == null) return false;
    const now = Date.now();
    const moves = (trip.moves || []).filter((m) => now - m.t <= MOVE_WINDOW_MS);
    const moved = along >= 1 && moves.some((m) => along - m.along >= MOVE_STOPS);
    trip.moves = [...moves.slice(-5), { along, t: now }];
    if (!moved) return false;
    trip.boarded = true;
    trip.moves = [];
    sync();
    return true;
  }

  // Checked on every fix, rough ones too: if you're clearly not where the trip has you, it
  // moves to the stop you're at, backwards if need be. That's how it recovers when the
  // clock ran on while you waited somewhere GPS can't reach, like inside an interchange, or
  // when a stray fix sent it ahead. Wobbles of a stop or two never trigger it. Says whether
  // it moved.
  function realign(here, accuracy, leg) {
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
    if (accuracy <= GOOD_FIX_M) trip.lastFixAt = now;
    trip.noLocation = false;
    // Back at the first stop: you're waiting for the bus, not on it.
    if (best === 0) {
      trip.boarded = false;
      trip.moves = [];
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

  const stale = () => Date.now() - trip.lastFixAt > FIX_STALE_MS;

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
  // from its fourth stop to its fifth. Measured on the nearest stretch between two stops,
  // from the one before `from` on; null when the point isn't near the leg at all.
  function alongLeg(here, leg, from) {
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
      if (m < bestM) [best, bestM] = [i + t, m];
    }
    return bestM <= ON_ROUTE_M ? best : null;
  }

  function nextLeg() {
    trip.leg += 1;
    trip.at = 0;
    trip.pos = 0;
    trip.anchor = null;
    trip.boarded = false;
    trip.moves = [];
    trip.alertText = null;
    trip.legStartedAt = Date.now();
    shown = null;
    save();
    sync();
  }

  function stopsLeft() {
    const leg = trip.legs[trip.leg];
    return Math.max(0, leg.points.length - 1 - trip.at);
  }

  function check() {
    const left = stopsLeft();
    if (left <= ALERT_STOPS && !trip.alerted[trip.leg]) {
      trip.alerted[trip.leg] = true;
      if (enabled()) alertNow(left);
    }
    // At the last stop of the last leg: the trip's done.
    if (left === 0 && trip.leg === trip.legs.length - 1) {
      render("You've arrived.");
      setTimeout(() => stop(), 60 * 1000);
      return;
    }
    save();
    render();
  }

  // ---------- the alert ----------

  function alertNow(left) {
    const leg = trip.legs[trip.leg];
    const last = trip.leg === trip.legs.length - 1;
    const text = left === 0
      ? `Get off now at ${leg.to}.`
      : `Get off in ${left} stop${left === 1 ? "" : "s"}, at ${leg.to}${last ? "" : ", to change"}.`;

    if (navigator.vibrate) navigator.vibrate(VIBRATION);
    beep();
    navigator.serviceWorker?.ready
      .then((reg) => {
        if (Notification.permission !== "granted") return;
        return reg.showNotification("Get Off Alert", {
          body: text,
          tag: "get-off",
          renotify: true,
          requireInteraction: true,
          vibrate: VIBRATION,
          icon: "/sgbusicon1.png",
          badge: "/sgbusicon1.png",
        });
      })
      .catch(() => {});
    const bar = $("#tripBar");
    bar.classList.add("alerting");
    setTimeout(() => bar.classList.remove("alerting"), 8000);
    // The bar keeps saying so until you pass another stop, rather than until the next
    // redraw, which comes straight after this.
    trip.alertText = text;
    trip.alertLeft = left;
    render(text);
    sync();
  }

  // The server sent the alert while the app was in the background (sw.js passes it on):
  // shown on the bar, and not sounded again.
  function alertedElsewhere({ tripId, leg, text }) {
    if (!trip || tripId !== trip.tripId || trip.alerted[leg]) return;
    trip.alerted[leg] = true;
    if (leg === trip.leg) {
      trip.alertText = text;
      trip.alertLeft = stopsLeft();
      const bar = $("#tripBar");
      bar.classList.add("alerting");
      setTimeout(() => bar.classList.remove("alerting"), 8000);
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
      })),
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
    if (state.leg > trip.leg && state.leg < trip.legs.length) {
      Object.assign(trip, { leg: state.leg, at: 0, pos: 0, anchor: null, boarded: false, moves: [], alertText: null, legStartedAt: state.legStartedAt || Date.now() });
      shown = null;
    }
    save();
    render();
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

  // ---------- keeping the screen on ----------

  async function keepAwake() {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen");
    } catch {}
  }

  function releaseAwake() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  // ---------- the trip bar ----------

  function render(message) {
    if (!trip) return;
    const leg = trip.legs[trip.leg];
    const left = stopsLeft();
    $("#tripTitle").textContent = trip.title;
    if (!message && trip.alertText && trip.alertLeft === left) message = trip.alertText;
    const status = message || `${leg.label}: ${left === 0 ? `at ${leg.to}` : `${left} stop${left === 1 ? "" : "s"} to ${leg.to}`}` +
      (trip.legs.length > 1 ? ` · leg ${trip.leg + 1} of ${trip.legs.length}` : "");
    $("#tripStatus").textContent = status;
    const notes = [];
    if (!enabled()) notes.push("Get Off Alert is off in Settings.");
    if (trip.noLocation) notes.push("No location: going by the clock.");
    else if (Date.now() - trip.lastFixAt > FIX_STALE_MS && trip.lastFixAt) notes.push("Location weak: going by the clock.");
    $("#tripNote").textContent = notes.join(" ");
    $("#tripNote").hidden = !notes.length;
    $("#tripNext").hidden = trip.leg >= trip.legs.length - 1;
    const icon = $("#tripBar [data-icon]");
    icon.setAttribute("data-icon", leg.kind === "train" ? "train" : "bus");
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
    return leg.names?.[i] || (i === last ? leg.to : i === 0 ? "Where you got on" : `Stop ${i + 1}`);
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
              ? `<span class="tlTag">${window.icon("flag")} ${final ? "Get off" : "Change"}</span>`
              : i === alertAt && alertAt > 0 && enabled()
                ? `<span class="tlTag">${window.icon("bell")} Alert</span>`
                : "";
            return `<li class="tlStop${i === last ? " end" : ""}"><span class="tlNode"></span><span class="tlName">${esc(stopName(leg, i))}</span>${tag}</li>`;
          })
          .join("");
        return (
          `<section class="tlLeg${k === 0 ? " current" : ""}">` +
          `<p class="tlHead">${window.icon(leg.kind === "train" ? "train" : "bus")} ${esc(leg.label)} <span>to ${esc(leg.to)}</span></p>` +
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
      if (e.target.closest("#tripEnd, #tripNext")) return;
      setExpanded(!expanded);
    });
    $("#tripEnd").addEventListener("click", () => stop());
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
    });
    // A reload mid-trip carries on.
    try {
      const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY) || "null");
      if (saved?.legs?.length) {
        trip = saved;
        trip.tripId ??= crypto.randomUUID();
        run();
      }
    } catch {}
  }

  window.Trip = { start, stop, enabled, active: () => Boolean(trip) };
  init();
})();
