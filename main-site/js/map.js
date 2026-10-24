// The live map: full screen over the page, following where you are, drawn by js/map-engine.js
// (MapLibre over OpenFreeMap's vector tiles, buildings in 3D when you tilt it with two fingers;
// OpenStreetMap's tiles as the fallback). It takes the place of sending you off to Google
// Maps, in three ways:
//
//   LiveMap.walkTo(place)   walking directions to a stop or place, turn by turn, from where
//                           you are: a stop's Directions (script.js), a walk in a nav
//                           (js/nav.js), #map/<stop> or #map/<lat>,<lng>~<name> links (the
//                           Telegram bot's Live map button). The route is /api/walk's, asked
//                           for again if you stray from it.
//   LiveMap.trip()          the trip being followed (js/trip.js): every ride and walk on it,
//                           the stops, where you get off, and you. On a walk, its route.
//   LiveMap.follow(data)    someone's shared trip (js/share.js): where they are, the way
//                           they're going and where to, updated as their link is.
//   LiveMap.explore()       Explorer, from its Edge Tray button: no way to follow, just every bus
//                           stop and MRT and LRT station as a dot, and you. A tap on one opens
//                           its card (js/map-card.js): a stop's buses, a station's doors.
//
// The stops and stations on a trip or a walk open the same card when tapped.
//
// It opens at street level, as close in as the map goes, on you (or on them, for a shared
// trip), and keeps following. Overview shows the whole way at once; Recentre goes back to
// street level and following.
//
// Made to stay light on a phone, as a map can easily make a page lag:
// - The map's code is only fetched the first time it opens, and sw.js keeps it.
// - What's drawn is made once and moved, never redrawn from scratch.
// - Fixes are drawn at most once every DRAW_MS, and the map only pans when you've moved a
//   fair way across it, so a fix a second doesn't mean a pan a second.
// - sw.js keeps every tile, style, font and sprite it's shown, so a place seen once comes back
//   instantly, and offline.
// - Nothing runs while the map's closed: no location, no timers.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);

  const DRAW_MS = 1000;
  // Panned to keep you on screen once you've moved this share of the way to its edge.
  const PAN_SHARE = 0.25;
  // On a walk: further than this from its route (beyond the fix's own accuracy) for
  // OFF_ROUTE_FIXES fixes running and the route's asked for again, at most every REROUTE_MS.
  const OFF_ROUTE_M = 35;
  const OFF_ROUTE_FIXES = 3;
  const REROUTE_MS = 20 * 1000;
  // This near the end of a walk and you're there.
  const ARRIVE_M = 25;
  // A fix rougher than this isn't drawn as where you are.
  const ROUGH_M = 200;
  const TRIP_EVERY_MS = 5000;
  // Street level: the closest OpenStreetMap's tiles go. Explorer opens further out, to see the
  // stops round about.
  const STREET_ZOOM = 19;
  const EXPLORE_ZOOM = 16;
  // A train ride's dot is the station within this of it.
  const STATION_M = 300;

  const COLOURS = { walk: '#2f7dff', bus: '#1f9d55', train: '#7a4fd6', me: '#2f7dff', them: '#e8590c', done: '#9aa7a0' };
  // Each MRT and LRT line's own colour, for a train leg without one. Keep in step with
  // LINE_COLORS in js/recents.js.
  const LINE_COLOURS = { EW: '#009645', CG: '#009645', NS: '#d42e12', NE: '#9900aa', CC: '#fa9e0d', CE: '#fa9e0d', DT: '#005ec4', TE: '#9d5b25', BP: '#748477', SE: '#748477', SW: '#748477', PE: '#748477', PW: '#748477' };

  // The map (js/map-engine.js): what's drawn goes in its groups, lines, stops, marks and me.
  let ink = null;
  let meDot = null;
  let meRing = null;
  let meCone = null;
  let destMark = null;

  let mode = null; // 'walk' | 'trip' | 'follow' | 'explore'
  let place = null; // where a walk goes: { lat, lng, label }
  let walk = null; // its route from /api/walk: { distance, minutes, path, steps, source }
  let walkFrom = null;
  let walkAsked = 0;
  let offRoute = 0;
  let here = null; // { lat, lng, accuracy, heading, t }
  let lastHere = null;
  let watchId = null;
  let drawTimer = null;
  let tripTimer = null;
  let followData = null;
  let following = true; // the map keeps you in view, until you move it yourself
  let pushed = false; // whether opening added a step to the page's history
  let builtTripLeg = null;
  let tripTrack = null; // the train you're on's track, from js/rail-tracks.js

  const routes = new Map(); // walks already asked for, this page view

  // ---------- geometry ----------

  function metres(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // The nearest point on a line to `p`: { i, t, m, along } with i the segment, t how far along
  // it, m the metres off it, and along the metres from the line's start.
  function nearestOn(path, p) {
    const kx = 111320 * Math.cos((p[0] * Math.PI) / 180);
    const ky = 110540;
    let best = { i: 0, t: 0, m: Infinity, along: 0 };
    let run = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const ax = path[i][1] * kx, ay = path[i][0] * ky;
      const dx = path[i + 1][1] * kx - ax, dy = path[i + 1][0] * ky - ay;
      const px = p[1] * kx - ax, py = p[0] * ky - ay;
      const len2 = dx * dx + dy * dy;
      const len = Math.sqrt(len2);
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const m = Math.hypot(px - t * dx, py - t * dy);
      if (m < best.m) best = { i, t, m, along: run + t * len };
      run += len;
    }
    return best;
  }

  function lengthOf(path) {
    let d = 0;
    for (let i = 0; i < path.length - 1; i++) d += metres(path[i], path[i + 1]);
    return d;
  }

  // Where the trip has you on a train ride, on its track ({ path, stops }, js/rail-tracks.js):
  // `pos` is a stop index with a fraction, as Trip has it, and you're that far along the track
  // between the two stations. Null without a position.
  function onTrack({ path, stops }, pos) {
    if (pos == null || !(pos >= 0)) return null;
    const last = stops.length - 1;
    const i = Math.min(last, Math.floor(pos));
    const j = Math.min(last, i + 1);
    const way = path.slice(stops[i], stops[j] + 1);
    let left = lengthOf(way) * Math.min(1, pos - i);
    for (let k = 0; k < way.length - 1; k++) {
      const d = metres(way[k], way[k + 1]);
      if (left <= d) {
        const f = d ? left / d : 0;
        return [way[k][0] + (way[k + 1][0] - way[k][0]) * f, way[k][1] + (way[k + 1][1] - way[k][1]) * f];
      }
      left -= d;
    }
    return way[way.length - 1];
  }

  function bearing(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
    const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  const distText = (m) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);
  const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' });

  // ---------- loading ----------

  let opening = null;
  async function ensureMap() {
    // Moving the map yourself stops it following you, until Recentre. Turned with the way you
    // face, it can't be dragged, and zooms about you.
    opening ??= MapEngine.open($('#liveMap'), {
      onUserMove: () => setFollowing(false),
      onUserZoom: () => { if (!turning) setFollowing(false); },
      onTurn: needle,
      onPick: openCard,
      onBlank: () => MapCard.close(),
      onMove: () => MapCard.place(),
    }).catch((err) => {
      opening = null;
      throw err;
    });
    ink = await opening;
    // Leaflet, where there's no WebGL, can't turn.
    $('#mapHeading').classList.toggle('noTurn', !ink.canTurn);
    return ink;
  }

  // The compass button's needle keeps pointing north, however the map's turned: by the
  // compass, or by two fingers twisting it.
  function needle(bearing) {
    $('#mapHeading svg')?.style.setProperty('rotate', `${-bearing}deg`);
  }

  // ---------- turned with the way you face ----------
  // The compass button: the map centred on you, turned so the way the phone points is up, as
  // a map app's compass mode. The phone's compass where it has one (iOS asks first, from the
  // tap), the way you're moving where it hasn't. Off with the button again, Overview, or
  // closing the map.

  const COMPASS_FRESH_MS = 3000;
  // How far each reading moves the smoothed heading towards it, so the map doesn't shake.
  const SMOOTH = 0.25;
  let turning = false;
  let facing = null; // the compass's smoothed heading, degrees from north
  let compassAt = 0;
  let turned = 0; // the turn on show, unwrapped, so 359 to 1 goes 2 degrees, not 358
  let turnFrame = null;
  let compassNote = null;

  function onOrient(e) {
    let deg = null;
    if (Number.isFinite(e.webkitCompassHeading)) deg = e.webkitCompassHeading;
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && Number.isFinite(e.alpha)) deg = 360 - e.alpha;
    if (deg == null) return;
    // The way the top of the screen points, held sideways too.
    deg = (deg + (screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    facing = facing == null ? deg : (facing + (((deg - facing + 540) % 360) - 180) * SMOOTH + 360) % 360;
    compassAt = Date.now();
    turnSoon();
  }

  const heading = () => (Date.now() - compassAt < COMPASS_FRESH_MS ? facing : here?.heading ?? null);

  function turnSoon() {
    if (!turnFrame) turnFrame = requestAnimationFrame(applyTurn);
  }

  // The map on you, the way you face up. `turned` is kept unwrapped, so 359 to 1 goes 2 degrees.
  function applyTurn() {
    turnFrame = null;
    if (!turning) return;
    const h = heading();
    if (h == null) return;
    turned += (((h - turned) % 360) + 540) % 360 - 180;
    ink.turn(following ? focus() : null, turned);
  }

  async function setTurning(on) {
    if (!ink?.canTurn || on === turning) return;
    if (on) {
      // iOS lets a page read the compass only once asked, and asks only from a tap.
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch { /* the way you move instead */ }
      }
      turning = true;
      window.addEventListener('deviceorientationabsolute', onOrient);
      window.addEventListener('deviceorientation', onOrient);
      ink.setTurning(true);
      setFollowing(true);
      clearTimeout(compassNote);
      compassNote = setTimeout(() => {
        if (turning && !compassAt) note(here?.heading != null ? 'No compass here, so the map turns the way you move.' : 'No compass here: the map turns once you start moving.');
      }, COMPASS_FRESH_MS);
      turnSoon();
    } else {
      turning = false;
      window.removeEventListener('deviceorientationabsolute', onOrient);
      window.removeEventListener('deviceorientation', onOrient);
      clearTimeout(compassNote);
      turned = 0;
      facing = null;
      compassAt = 0;
      ink.setTurning(false);
    }
    $('#mapHeading').setAttribute('aria-pressed', String(turning));
  }

  // Who the map follows: them on a shared trip, otherwise you. Null until there's a fix.
  function focus() {
    if (mode === 'follow') return followData ? (followData.me ? [followData.me.lat, followData.me.lng] : followData.at) : null;
    return here ? [here.lat, here.lng] : null;
  }

  // Following goes back in to street level on whoever's followed.
  function setFollowing(on) {
    following = on;
    $('#mapRecentre').hidden = on;
    const at = on && focus();
    if (at) ink.setView(at, followZoom(), true);
  }
  const followZoom = () => (mode === 'explore' ? EXPLORE_ZOOM : STREET_ZOOM);

  // The whole way at once: what's left of the walk or trip, or their trip, with you or them
  // and where it ends. Clear of the bars at the top and bottom.
  function showOverview() {
    if (!ink || !mode) return;
    const pts = [];
    if (mode === 'walk') {
      if (walk) pts.push(...walk.path);
      if (place) pts.push([place.lat, place.lng]);
    } else if (mode === 'trip') {
      const p = window.Trip?.progress();
      const legs = window.Trip?.legs?.();
      if (p && legs) pts.push(...legs.slice(p.legIndex).flatMap((l) => l.points));
    } else if (mode === 'follow' && followData) {
      if (followData.path) pts.push(...followData.path);
      if (followData.to) pts.push([followData.to.lat, followData.to.lng]);
    }
    const at = focus();
    if (at) pts.push(at);
    if (!pts.length) return;
    setTurning(false);
    setFollowing(false);
    ink.fit(pts, { top: 90, left: 30, right: 70, bottom: 120 }, STREET_ZOOM - 1);
  }

  // ---------- opening and closing ----------

  async function show(title, sub) {
    $('#mapTitle').textContent = title;
    $('#mapSub').textContent = sub || '';
    $('#mapStep').textContent = '';
    $('#mapNote').hidden = true;
    $('#mapActions').innerHTML = '';
    $('#mapOverview').hidden = false;
    const panel = $('#mapPanel');
    panel.classList.toggle('exploring', mode === 'explore');
    panel.setAttribute('aria-label', mode === 'explore' ? 'Explorer' : 'Live map');
    MapCard.close();
    const wasOpen = !panel.hidden;
    panel.hidden = false;
    document.body.classList.add('map-open');
    // Back closes the map, in a browser and the Android app alike.
    if (!wasOpen && !pushed) {
      history.pushState({ liveMap: true }, '', location.href);
      pushed = true;
    }
    try {
      await ensureMap();
    } catch (err) {
      note(err.message);
      throw err;
    }
    ink.resize();
    ink.refetch();
    ink.clear('lines');
    ink.clear('stops');
    ink.clear('marks');
    if (mode !== 'explore') ink.pois([]);
    destMark = null;
    builtTripLeg = null;
    setFollowing(true);
  }

  function close({ fromHistory = false } = {}) {
    const panel = $('#mapPanel');
    if (panel.hidden) return;
    setTurning(false);
    MapCard.close();
    panel.hidden = true;
    panel.classList.remove('exploring');
    document.body.classList.remove('map-open');
    stopWatching();
    clearInterval(tripTimer);
    tripTimer = null;
    mode = null;
    walk = null;
    followData = null;
    if (location.hash.startsWith('#map/')) history.replaceState(history.state, '', location.pathname);
    if (pushed && !fromHistory) {
      pushed = false;
      history.back();
    }
    pushed = false;
  }

  function note(text) {
    $('#mapNote').textContent = text;
    $('#mapNote').hidden = !text;
  }

  // ---------- where you are ----------

  function startWatching() {
    if (watchId != null || !('geolocation' in navigator)) {
      if (!('geolocation' in navigator)) note("This browser can't share your location, so the map can't follow you.");
      return;
    }
    watchId = navigator.geolocation.watchPosition(onFix, (err) => {
      if (err.desktopMessage) note(`${err.desktopMessage} Until then, the map can only show the way, not follow you.`);
      else if (err.code === 1) note('Location is off for this site, so the map can only show the way, not follow you. Allow location to be followed.');
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
    drawTimer = setInterval(drawMe, DRAW_MS);
  }

  function stopWatching() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(drawTimer);
    drawTimer = null;
  }

  function onFix(pos) {
    const c = pos.coords;
    if (c.accuracy > ROUGH_M && here) return;
    const next = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, heading: Number.isFinite(c.heading) && c.speed > 0.5 ? c.heading : null, t: Date.now() };
    // No heading from the phone: the way you've walked since the last fix that far back.
    if (next.heading == null && lastHere && metres([lastHere.lat, lastHere.lng], [next.lat, next.lng]) > 8) {
      next.heading = bearing([lastHere.lat, lastHere.lng], [next.lat, next.lng]);
    }
    if (!lastHere || metres([lastHere.lat, lastHere.lng], [next.lat, next.lng]) > 8) lastHere = next;
    const first = !here;
    here = next;
    if (first && following && mode !== 'follow') ink.setView([here.lat, here.lng], followZoom());
    if (mode === 'walk') onWalkFix();
  }

  // You, as a dot with a ring for how sure the fix is and a cone for the way you face. Drawn
  // on the timer, not on each fix, and only moved, never made again.
  function drawMe() {
    if (!here || !ink) return;
    const at = [here.lat, here.lng];
    const ring = Math.min(here.accuracy, 500);
    if (!meDot?.alive) {
      ink.clear('me');
      meRing = ink.disc('me', at, ring, { fill: COLOURS.me, opacity: 0.12 });
      meCone = ink.poly('me', [at, at, at], { fill: COLOURS.me, opacity: 0.25 });
      meDot = ink.dot('me', at, { radius: 7, stroke: '#fff', weight: 3, fill: COLOURS.me });
    } else {
      meDot.set(at);
      meRing.set(at, ring);
    }
    // The way you face: the compass while the map turns with it, otherwise the way you move.
    const faces = turning ? heading() : here.heading;
    if (faces != null) {
      const zoomM = 40 * Math.pow(2, 17 - ink.zoom());
      const tip = (deg) => {
        const r = ((faces + deg) * Math.PI) / 180;
        return [here.lat + (Math.cos(r) * zoomM) / 110540, here.lng + (Math.sin(r) * zoomM) / (111320 * Math.cos((here.lat * Math.PI) / 180))];
      };
      meCone.set([at, tip(-25), tip(25)]);
    } else {
      meCone.set([at, at, at]);
    }
    keepInView(at);
  }

  function keepInView(at) {
    if (!following) return;
    // Turned with the way you face, you stay in the middle, which it turns about (applyTurn).
    if (turning) return turnSoon();
    const size = ink.size();
    const p = ink.toScreen(at);
    const dx = Math.abs(p.x - size.x / 2) / (size.x / 2);
    const dy = Math.abs(p.y - size.y / 2) / (size.y / 2);
    if (dx > PAN_SHARE || dy > PAN_SHARE) ink.panTo(at, 600);
  }

  function hideMe() {
    ink?.clear('me');
    meDot = meRing = meCone = null;
  }

  // ---------- a walk ----------

  const key = (p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

  async function fetchWalk(from, to) {
    const k = `${key(from)}>${key(to)}`;
    if (routes.has(k)) return routes.get(k);
    const r = await fetch(`/api/walk?from=${key(from)}&to=${key(to)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Couldn't find a way to walk there.");
    const route = await r.json();
    routes.set(k, route);
    return route;
  }

  async function walkTo(to, { from = null, title = null } = {}) {
    if (to?.lat == null || to?.lng == null) return;
    $('#mapHeading').hidden = false;
    mode = 'walk';
    await show(title || `Walk to ${to.label || 'here'}`, '');
    mode = 'walk';
    place = { lat: Number(to.lat), lng: Number(to.lng), label: to.label || 'Your destination' };
    walk = null;
    walkFrom = from;
    offRoute = 0;
    // A stop's (to.code): its card on a tap.
    destMark = flag([place.lat, place.lng], place.label, undefined, to.code ? { kind: 'stop', code: to.code } : null);
    // On you already (show() went in on your last fix); until there's one, on where it ends.
    if (!here) ink.setView([place.lat, place.lng], STREET_ZOOM - 2);
    $('#mapStep').textContent = 'Finding where you are…';
    startWatching();
    // From the given start, or where you are once that's known; the end alone until then.
    if (from) route(from);
    else if (here) route(here);
  }

  async function route(from) {
    walkAsked = Date.now();
    const asked = place;
    try {
      const got = await fetchWalk(from, place);
      if (mode !== 'walk' || place !== asked) return;
      walk = { ...got, total: lengthOf(got.path) };
      drawWalk();
      onWalkFix();
    } catch (err) {
      if (mode === 'walk') note(err.message);
    }
  }

  function drawWalk() {
    ink.clear('lines');
    if (!walk) return;
    ink.line('lines', walk.path, { color: '#fff', weight: 9, opacity: 0.9 });
    ink.line('lines', walk.path, { color: COLOURS.walk, weight: 5, dash: walk.source === 'line' });
    note(walk.source === 'line' ? "Couldn't find streets for this walk, so this is the straight line there." : '');
  }

  function onWalkFix() {
    if (!here) return;
    const me = [here.lat, here.lng];
    if (!walk) {
      if (!walkFrom && Date.now() - walkAsked > 5000) route(here);
      return;
    }
    const left = metres(me, [place.lat, place.lng]);
    if (left <= ARRIVE_M + Math.min(here.accuracy, 30)) {
      $('#mapStep').textContent = `You've arrived at ${place.label}.`;
      $('#mapSub').textContent = '';
      return;
    }
    const near = nearestOn(walk.path, me);
    // Off the route for a few fixes running: a new one from here.
    if (near.m > OFF_ROUTE_M + Math.min(here.accuracy, 50)) {
      if (++offRoute >= OFF_ROUTE_FIXES && Date.now() - walkAsked > REROUTE_MS && here.accuracy < 60) {
        offRoute = 0;
        walkFrom = null;
        route(here);
      }
    } else {
      offRoute = 0;
    }
    const remaining = Math.max(0, walk.total - near.along);
    const mins = Math.max(1, Math.round((remaining / Math.max(1, walk.total)) * walk.minutes));
    $('#mapSub').textContent = `${distText(remaining)} · ${mins} min · arrive ${clock(Date.now() + mins * 60000)}`;

    // The next turn: the first step whose place is still ahead of you along the route.
    let next = null;
    for (const s of walk.steps) {
      const at = nearestOn(walk.path, s.at);
      if (at.along > near.along + 5) {
        next = { ...s, inM: at.along - near.along };
        break;
      }
    }
    $('#mapStep').textContent = next ? `In ${distText(next.inM)}: ${next.text}` : `${place.label} is ${distText(left)} ahead`;
  }

  // ---------- a trip ----------

  // A place on the map, its name on a tap, or its card for a stop or station (`pick`).
  function flag(at, label, colour = '#d6336c', pick = null) {
    return ink.dot('marks', at, { radius: 9, stroke: '#fff', weight: 3, fill: colour, label, ...(pick && { pick }) });
  }

  async function trip() {
    const p = window.Trip?.progress();
    if (!p) return;
    $('#mapHeading').hidden = false;
    mode = 'trip';
    await show(window.Trip.title?.() || 'Your trip', '');
    // For the stations' cards on a train ride's dots.
    await loadStations().catch(() => {});
    mode = 'trip';
    startWatching();
    drawTrip(true);
    tripTimer = setInterval(() => drawTrip(false), TRIP_EVERY_MS);
  }

  // Every leg from the one you're on, its stops, and where each ends. Redrawn only when you
  // move on to another leg; the status line every few seconds.
  function drawTrip(fit) {
    const p = window.Trip?.progress();
    const legs = window.Trip?.legs?.();
    if (!p || !legs) {
      $('#mapStep').textContent = 'The trip has ended.';
      clearInterval(tripTimer);
      tripTimer = null;
      return;
    }
    if (builtTripLeg !== p.legIndex) {
      builtTripLeg = p.legIndex;
      tripTrack = null;
      ink.clear('lines');
      ink.clear('stops');
      ink.clear('marks');
      legs.forEach((leg, i) => {
        const done = i < p.legIndex;
        const colour = done ? COLOURS.done : leg.kind === 'walk' ? COLOURS.walk
          : leg.color || (leg.kind === 'train' && LINE_COLOURS[String(leg.route || '').toUpperCase()]) || COLOURS[leg.kind] || COLOURS.bus;
        const line = ink.line('lines', leg.points, { color: colour, weight: leg.kind === 'walk' ? 4 : 6, opacity: done ? 0.6 : 0.95, dash: leg.kind === 'walk' });
        // A train ride along its line's track (js/rail-tracks.js), once that's in; straight from
        // station to station till then.
        if (leg.kind === 'train' && window.RailTracks) {
          RailTracks.path(leg.route || String(leg.label || '').split(' ')[0], leg.points).then((track) => {
            if (!track || mode !== 'trip' || builtTripLeg !== p.legIndex || !line.alive) return;
            line.set(track.path);
            if (i === p.legIndex) tripTrack = track;
          });
        }
        if (leg.kind !== 'walk' && !done) {
          leg.points.forEach((pt, k) => {
            if (k === 0 || k === leg.points.length - 1) return;
            const pick = pickAt(leg, k);
            ink.dot('stops', pt, { radius: 3.5, stroke: colour, weight: 2, fill: '#fff', label: leg.names?.[k] || `Stop ${k + 1}`, ...(pick && { pick }) });
          });
        }
        if (!done) {
          const end = leg.points[leg.points.length - 1];
          const last = i === legs.length - 1;
          flag(end, last ? leg.to : `${leg.kind === 'walk' ? 'Walk to' : 'Get off at'} ${leg.to}`, last ? '#d6336c' : colour, pickAt(leg, leg.points.length - 1));
        }
      });
      // On a walk, its streets: from where you are, or where it starts.
      const leg = legs[p.legIndex];
      if (leg.kind === 'walk') {
        const end = leg.points[leg.points.length - 1];
        fetchWalk(here || { lat: leg.points[0][0], lng: leg.points[0][1] }, { lat: end[0], lng: end[1] })
          .then((r) => {
            if (mode !== 'trip' || builtTripLeg !== p.legIndex) return;
            ink.line('lines', r.path, { color: COLOURS.walk, weight: 5 });
          })
          .catch(() => {});
      }
      if (fit && !here) ink.setView(p.at, STREET_ZOOM);
    }
    const status = window.Trip.status?.() || '';
    $('#mapStep').textContent = status;
    const mins = Math.max(0, Math.round(p.minutesLeft));
    $('#mapSub').textContent = p.arrived ? 'Arrived' : `${mins} min left · arrive ${clock(Date.now() + mins * 60000)}`;
    // No fix of your own yet: where the trip has you.
    if (!here) {
      hideMe();
      const at = (tripTrack && onTrack(tripTrack, p.timeline?.pos)) || p.at;
      ink.dot('me', at, { radius: 7, stroke: '#fff', weight: 3, fill: COLOURS.me, fillOpacity: 0.7 });
    }
  }

  // ---------- someone's shared trip ----------

  let themDot = null;
  let themRing = null;
  let themPath = null;
  let themAsked = 0; // the newest update whose tracks are being worked out

  // Where a point is on a path, from `from` on: the first point within a few metres of it, or
  // if thinning (js/share.js) left it out, the nearest within NEAR_STATION_M. Null if neither.
  const NEAR_STATION_M = 300;
  function indexOn(path, p, from) {
    let best = null;
    let bestM = NEAR_STATION_M;
    for (let k = from; k < path.length; k++) {
      const m = metres(path[k], p);
      if (m <= 5) return k;
      if (m < bestM) [best, bestM] = [k, m];
    }
    return best;
  }

  // Their path with each train ride on its line's track (js/rail-tracks.js), in place of the
  // straight lines from station to station; and the track of the one they're on, if a train.
  // A ride that can't be placed stays as it was.
  async function followTracks(data) {
    let path = data.path;
    let current = null;
    let from = 0;
    for (const ride of data.trains || []) {
      const track = await RailTracks.path(ride.route, ride.points);
      if (!track) continue;
      if (ride.leg === data.legIndex) current = track;
      const i = indexOn(path, ride.points[0], from);
      const j = i == null ? null : indexOn(path, ride.points[ride.points.length - 1], i + 1);
      if (j == null) continue;
      path = [...path.slice(0, i), ...track.path, ...path.slice(j + 1)];
      from = i + track.path.length;
    }
    return { path, current };
  }

  // Their dot: where they really are, or else where their trip has them, on the track if
  // they're on a train.
  function themAt(data, track) {
    if (data.me) return [data.me.lat, data.me.lng];
    return (track && onTrack(track, data.timeline?.pos)) || data.at;
  }

  async function follow(data, { title = null } = {}) {
    // Their trip, centred on them: turning it with the way you face would make no sense.
    setTurning(false);
    $('#mapHeading').hidden = true;
    mode = 'follow';
    await show(title || (data.name ? `${data.name}'s trip` : 'Shared trip'), '');
    mode = 'follow';
    themDot = themRing = themPath = null;
    hideMe();
    updateFollow(data, true);
  }

  // Their link's newest, from js/share.js as it refreshes.
  function updateFollow(data, fit = false) {
    if (mode !== 'follow' || !data) return;
    followData = data;
    const at = themAt(data, null);
    const ring = Math.min(data.me?.accuracy || 30, 500);
    if (data.path?.length >= 2) {
      if (!themPath) themPath = ink.line('lines', data.path, { color: COLOURS.them, weight: 5, opacity: 0.85 });
      else themPath.set(data.path);
      // Their train rides on the track, once it's in; straight till then.
      if (data.trains?.length && window.RailTracks) {
        const asked = ++themAsked;
        followTracks(data).then(({ path, current }) => {
          if (mode !== 'follow' || asked !== themAsked || !themPath) return;
          themPath.set(path);
          if (themDot && current && !data.me) {
            const on = themAt(data, current);
            themDot.set(on);
            themRing.set(on, ring);
          }
        }).catch(() => {});
      }
    }
    if (!destMark && data.to) destMark = flag([data.to.lat, data.to.lng], data.to.label);
    if (at) {
      if (!themDot) {
        themRing = ink.disc('me', at, ring, { fill: COLOURS.them, opacity: 0.15 });
        themDot = ink.dot('me', at, { radius: 8, stroke: '#fff', weight: 3, fill: COLOURS.them, label: data.name || 'Them' });
      } else {
        themDot.set(at);
        themRing.set(at, ring);
      }
      if (fit) {
        ink.setView(at, STREET_ZOOM);
      } else if (following) {
        keepInView(at);
      }
    }
    const leg = data.leg;
    const live = !data.ended && !data.stopped;
    $('#mapStep').textContent = !live ? (data.ended ? 'Arrived' : 'Sharing stopped')
      : leg?.label ? `${leg.label}: ${leg.stopsLeft === 0 ? `at ${leg.to}` : `${leg.stopsLeft} stop${leg.stopsLeft === 1 ? '' : 's'} to ${leg.to}`}` : '';
    const mins = Math.max(0, Math.round((data.arriveAt - Date.now()) / 60000));
    $('#mapSub').textContent = live ? `Arriving ${mins ? `in ${mins} min, around ${clock(data.arriveAt)}` : 'now'}` : `at ${data.to?.label || ''}`;
  }

  // ---------- Explorer and the cards ----------

  // Every MRT and LRT station, { name, codes, lat, lng }, as station search has them.
  let stations = null;
  let stationsLoading = null;
  function loadStations() {
    stationsLoading ??= fetch('/data/rail-stations.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no stations'))))
      .then((d) => { stations = d.stations || []; })
      .catch((err) => { stationsLoading = null; throw err; });
    return stationsLoading;
  }

  const stationPick = (s) => ({ kind: 'station', name: s.name, codes: s.codes, lat: s.lat, lng: s.lng });
  const lineColour = (code) => LINE_COLOURS[String(code).toUpperCase().match(/^[A-Z]{2}/)?.[0]] || '#748477';
  // An interchange's colours for its pill, in one order everywhere on the map, whatever order
  // its codes come in: LINE_COLOURS', green, red, purple, orange, blue, brown, the LRT's grey.
  const COLOUR_ORDER = [...new Set(Object.values(LINE_COLOURS))];
  const stationColours = (codes) => [...new Set(codes.map(lineColour))].sort((a, b) => COLOUR_ORDER.indexOf(a) - COLOUR_ORDER.indexOf(b));

  // What a dot on a trip is, for its card: a bus ride's stop by its code (Trip's `codes`), a
  // train ride's station, the nearest within STATION_M. Null for anything else.
  function pickAt(leg, k) {
    if (leg.kind === 'bus' && leg.codes?.length === leg.points.length && leg.codes[k]) return { kind: 'stop', code: leg.codes[k] };
    if (leg.kind !== 'train' || !stations) return null;
    const pt = leg.points[k];
    let best = null;
    let bestM = STATION_M;
    for (const s of stations) {
      const m = metres(pt, [s.lat, s.lng]);
      if (m < bestM) [best, bestM] = [s, m];
    }
    return best ? stationPick(best) : null;
  }

  function openCard(pick) {
    if (!pick) return;
    MapCard.open(pick, { panel: $('#mapPanel'), ink, onDirections: directionsTo });
  }

  // A card's Directions: Navigate's Bus and train, from where you are, once the map's gone
  // (its step back in the page's history first, so Navigate's comes after it).
  function directionsTo(to) {
    const then = () => openNavFromHere(to);
    if (!pushed) {
      close();
      return then();
    }
    window.addEventListener('popstate', () => setTimeout(then, 0), { once: true });
    close();
  }

  // Explorer: no way to follow, just you, every stop and every station.
  async function explore() {
    $('#mapHeading').hidden = false;
    mode = 'explore';
    await show('Explorer', 'Tap a bus stop or a station');
    mode = 'explore';
    $('#mapOverview').hidden = true;
    startWatching();
    if (!here) ink.setView([1.3521, 103.8198], 12);
    const [index] = await Promise.all([ensureStopsIndex(), loadStations().catch(() => {})]);
    if (mode !== 'explore') return;
    const dots = [];
    for (const [code, s] of Object.entries(index || {})) {
      if (s.lat != null && s.lng != null) dots.push({ kind: 'stop', lat: s.lat, lng: s.lng, pick: { kind: 'stop', code } });
    }
    for (const s of stations || []) dots.push({ kind: 'station', lat: s.lat, lng: s.lng, color: lineColour(s.codes[0]), colors: stationColours(s.codes), pick: stationPick(s) });
    ink.pois(dots);
    // Its tour, the first time (js/tour.js), the dots round you lit by #mapSpot.
    window.Tour?.first('explorer');
  }

  // ---------- links ----------

  // #map/84009 (a stop) and #map/1.3184,103.8932~Name (a place): from script.js's router.
  function openFromHash(target) {
    // stopsIndex is script.js's, a top-level let rather than a property of window.
    const stops = typeof stopsIndex === 'undefined' ? null : stopsIndex; // eslint-disable-line no-undef
    const stop = /^\d{5}$/.test(target) ? stops?.[target] : null;
    if (stop) return walkTo({ lat: stop.lat, lng: stop.lng, label: stop.n || target, code: target }), true;
    const m = /^(-?[\d.]+),(-?[\d.]+)(?:~(.*))?$/.exec(target);
    if (m) return walkTo({ lat: Number(m[1]), lng: Number(m[2]), label: m[3] || 'Pinned place' }), true;
    return false;
  }

  function init() {
    $('#mapClose').addEventListener('click', () => close());
    $('#mapRecentre').addEventListener('click', () => setFollowing(true));
    $('#mapOverview').addEventListener('click', showOverview);
    $('#mapHeading').addEventListener('click', () => setTurning(!turning));
    window.addEventListener('popstate', () => {
      if (!$('#mapPanel').hidden) close({ fromHistory: true });
    });
    window.addEventListener('trip:end', () => {
      if (mode === 'trip') drawTrip(false);
    });
    // Back on screen: the map catches up with where you are straight away.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && mode) drawMe();
    });
  }

  window.LiveMap = { walkTo, trip, follow, explore, updateFollow, close, openFromHash, isOpen: () => mode != null, mode: () => mode };
  init();
})();
