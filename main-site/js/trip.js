// The Get Off Alert: while you're on a trip, the site follows your live location along each
// bus or train ride and alerts you about two stops before you get off, at a change or at the
// end. On by default; Settings turns it off.
//
// A website only gets your location while it's open with the screen on, so the trip keeps
// the screen awake (the Wake Lock API) while it runs. Underground, where GPS gives out, it
// falls back on the time each ride should take.
//
// Trip.start({ title, legs }) with legs of
// { kind: "bus" | "train", label, to, points: [[lat, lng], ...], names, minutes, wait }:
// `points` are the stops from boarding to alighting, so a leg of 5 stops has 6 points, and
// `names` (optional) names each of them for the timeline.
//
// Tapping the trip bar opens that timeline: the stops still ahead, with a blue dot where you
// are, redrawn 20 times a second so it glides between stops like a progress bar.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const SETTING_KEY = "sgbus.getOffAlert";
  const SAVED_KEY = "sgbus.trip";

  const ALERT_STOPS = 2;
  // A fix this accurate counts; a rough one (indoors, underground) is ignored.
  const GOOD_FIX_M = 150;
  // Near enough to a stop on the leg to say you're there.
  const ON_ROUTE_M = 250;
  // With no good fix for this long, go by the clock instead.
  const FIX_STALE_MS = 60 * 1000;
  const TICK_MS = 15 * 1000;
  // Short pulses rather than one long buzz: three quick, a pause, two quick.
  const VIBRATION = [180, 90, 180, 90, 180, 450, 180, 90, 180];

  // The timeline's dot: 20 frames a second, each closing this share of the gap to where
  // you are, so it eases rather than jumps when a new fix comes in.
  const FRAME_MS = 50;
  const EASE = 0.15;

  let trip = null;
  let watchId = null;
  let tick = null;
  let wakeLock = null;
  let expanded = false;
  let frame = null;
  let shown = null; // the dot's drawn position, as a stop index with a fraction
  let builtLeg = null;
  let shownStop = null;

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
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
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
      setExpanded(false);
      $("#tripBar").classList.add("hidden");
      document.body.classList.remove("on-trip");
    }
  }

  // ---------- where you are ----------

  function onFix(pos) {
    if (!trip || pos.coords.accuracy > GOOD_FIX_M) return;
    const here = [pos.coords.latitude, pos.coords.longitude];
    trip.lastFixAt = Date.now();
    trip.noLocation = false;

    const leg = trip.legs[trip.leg];
    // The nearest stop on this leg at or past the last one, so a fix can't send you back.
    let best = -1;
    let bestM = Infinity;
    for (let i = Math.max(0, trip.at - 1); i < leg.points.length; i++) {
      const m = metres(here, leg.points[i]);
      if (m < bestM) [best, bestM] = [i, m];
    }
    if (best !== -1 && bestM <= ON_ROUTE_M) trip.at = Math.max(trip.at, best);
    // How far between stops, for the timeline's dot. Never backwards: a fix that wobbles
    // behind where the last one put you leaves the dot where it is.
    const along = alongLeg(here, leg, trip.at);
    if (along != null) trip.pos = Math.max(trip.pos || 0, along);

    // Off at the end of this leg and already near the next one's first stop: on to it.
    const next = trip.legs[trip.leg + 1];
    if (next && trip.at >= leg.points.length - 1 && metres(here, next.points[0]) <= ON_ROUTE_M) nextLeg();
    check();
  }

  function onFixError(err) {
    if (!trip) return;
    if (err.code === 1) trip.noLocation = true; // permission refused: the clock only
    render();
  }

  // Without a recent good fix, how far the ride should have got by the clock.
  function onTick() {
    if (!trip) return;
    const leg = trip.legs[trip.leg];
    if (Date.now() - trip.lastFixAt > FIX_STALE_MS && leg.minutes) {
      const riding = (Date.now() - trip.legStartedAt) / 60000 - (leg.wait || 0);
      const perStop = leg.minutes / Math.max(1, leg.points.length - 1);
      const guess = Math.min(leg.points.length - 1, Math.floor(Math.max(0, riding) / perStop));
      trip.at = Math.max(trip.at, guess);
      check();
    }
    render();
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
    trip.alertText = null;
    trip.legStartedAt = Date.now();
    shown = null;
    save();
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
    draw();
  }

  // Where the dot should be: the last fix's place along the leg, or, without a recent good
  // fix, how far the ride should have got by the clock, whichever is further.
  function target() {
    const leg = trip.legs[trip.leg];
    const last = leg.points.length - 1;
    let pos = Math.max(trip.pos || 0, trip.at);
    if (Date.now() - trip.lastFixAt > FIX_STALE_MS && leg.minutes) {
      const riding = (Date.now() - trip.legStartedAt) / 60000 - (leg.wait || 0);
      pos = Math.max(pos, Math.max(0, riding) / (leg.minutes / Math.max(1, last)));
    }
    return Math.min(last, pos);
  }

  function draw() {
    if (!trip || !expanded) return;
    const list = $("#tripTimeline .tlLeg.current .tlStops");
    if (!list) return;
    const goal = target();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    shown = shown == null || still ? goal : shown + (goal - shown) * EASE;
    if (Math.abs(goal - shown) < 0.002) shown = goal;

    const items = list.querySelectorAll(".tlStop");
    const i = Math.min(Math.floor(shown), items.length - 1);
    const mid = (el) => el.offsetTop + el.offsetHeight / 2;
    const y = i >= items.length - 1 ? mid(items[i]) : mid(items[i]) + (shown - i) * (mid(items[i + 1]) - mid(items[i]));
    list.querySelector(".tlDot").style.transform = `translateY(${y}px)`;
    const track = list.querySelector(".tlTrack");
    list.querySelector(".tlDone").style.height = `${Math.max(0, y - track.offsetTop)}px`;
    items.forEach((el, n) => el.classList.toggle("passed", n <= shown + 0.001));

    // Keep the stop you're at in view as you pass each one.
    if (shownStop !== i) {
      shownStop = i;
      const box = $("#tripTimeline");
      box.scrollTo({ top: Math.max(0, items[i].offsetTop - box.clientHeight / 3), behavior: still ? "auto" : "smooth" });
    }
  }

  function setExpanded(on) {
    expanded = on && !!trip;
    $("#tripBar").classList.toggle("expanded", expanded);
    $("#tripToggle").setAttribute("aria-expanded", String(expanded));
    $("#tripTimeline").hidden = !expanded;
    clearInterval(frame);
    frame = null;
    if (expanded) {
      buildTimeline();
      frame = setInterval(draw, FRAME_MS);
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
      })
    );
    syncSetting();
    // The wake lock goes when the page is hidden; take it back on return.
    document.addEventListener("visibilitychange", () => {
      if (trip && document.visibilityState === "visible") {
        keepAwake();
        onTick();
      }
    });
    // A reload mid-trip carries on.
    try {
      const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY) || "null");
      if (saved?.legs?.length) {
        trip = saved;
        run();
      }
    } catch {}
  }

  window.Trip = { start, stop, enabled };
  init();
})();
