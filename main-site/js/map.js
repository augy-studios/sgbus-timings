// The live map: OpenStreetMap with Leaflet, full screen over the page, following where you
// are. It takes the place of sending you off to Google Maps, in three ways:
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
//
// It opens at street level, as close in as the map goes, on you (or on them, for a shared
// trip), and keeps following. Overview shows the whole way at once; Recentre goes back to
// street level and following.
//
// Made to stay light on a phone, as a map can easily make a page lag:
// - Leaflet (vendor/leaflet, 40 KB gzipped) is only fetched the first time the map opens.
// - Everything's drawn on one canvas (preferCanvas), and lines and markers are made once and
//   moved, never redrawn from scratch.
// - Fixes are drawn at most once every DRAW_MS, and the map only pans when you've moved a
//   fair way across it, so a fix a second doesn't mean a pan a second.
// - Tiles load once the map stops moving (updateWhenIdle), at the screen's own density, and
//   sw.js keeps them (cache-first, capped), so a place seen once comes back instantly, and
//   offline.
// - Nothing runs while the map's closed: no location, no timers.
//
// Tiles are OpenStreetMap's own, under its tile usage policy (attribution, light use), and
// only theirs: OneMap's lag. Tiles that don't load (underground, on a weak signal) are asked
// for again a little later, and as soon as the phone's back online.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const LEAFLET_JS = '/vendor/leaflet/leaflet.js';
  const LEAFLET_CSS = '/vendor/leaflet/leaflet.css';
  const TILES = {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
  };
  // Tiles that didn't load are asked for again this long after the last one failed.
  const TILE_RETRY_MS = 10 * 1000;

  const SG_CENTRE = [1.3521, 103.8198];
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
  // Street level: the closest OpenStreetMap's tiles go.
  const STREET_ZOOM = 19;

  const COLOURS = { walk: '#2f7dff', bus: '#1f9d55', train: '#7a4fd6', me: '#2f7dff', them: '#e8590c', done: '#9aa7a0' };
  // Each MRT and LRT line's own colour, for a train leg without one. Keep in step with
  // LINE_COLORS in js/recents.js.
  const LINE_COLOURS = { EW: '#009645', CG: '#009645', NS: '#d42e12', NE: '#9900aa', CC: '#fa9e0d', CE: '#fa9e0d', DT: '#005ec4', TE: '#9d5b25', BP: '#748477', SE: '#748477', SW: '#748477', PE: '#748477', PW: '#748477' };

  let leaflet = null; // the promise of Leaflet loaded
  let map = null;
  let tileLayer = null;
  let tileRetry = null; // tiles failed: the timer to ask for them again, or true while closed
  let groups = null; // { lines, stops, marks, me }
  let meDot = null;
  let meRing = null;
  let meCone = null;
  let destMark = null;

  let mode = null; // 'walk' | 'trip' | 'follow'
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

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    leaflet ??= new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_JS;
      js.onload = () => resolve(window.L);
      js.onerror = () => {
        leaflet = null;
        reject(new Error("Couldn't load the map. Check your connection and try again."));
      };
      document.head.appendChild(js);
    });
    return leaflet;
  }

  // OpenStreetMap's tiles. A tile that fails stays blank until asked for again, so once tiles
  // stop failing for TILE_RETRY_MS, or the phone's back online, or the map's opened again, the
  // ones on screen are: those that loaded come straight from sw.js's cache.
  function addTiles() {
    tileLayer = L.tileLayer(TILES.url, {
      attribution: TILES.attribution,
      maxZoom: TILES.maxZoom,
      // CORS (OpenStreetMap sends it), so sw.js can keep them without the size an opaque
      // response costs.
      crossOrigin: true,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 3,
      detectRetina: false,
    });
    tileLayer.on('tileerror', () => {
      clearTimeout(tileRetry);
      tileRetry = setTimeout(retryTiles, TILE_RETRY_MS);
    });
    window.addEventListener('online', retryTiles);
    tileLayer.addTo(map);
  }

  function retryTiles() {
    if (!tileRetry) return;
    clearTimeout(tileRetry);
    // Closed, or still offline: kept for when the map's opened or the phone's online again.
    if ($('#mapPanel').hidden || navigator.onLine === false) {
      tileRetry = true;
      return;
    }
    tileRetry = null;
    tileLayer.redraw();
  }

  async function ensureMap() {
    await loadLeaflet();
    if (map) return map;
    map = L.map($('#liveMap'), {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: true,
      markerZoomAnimation: false,
      // Pinch zooms about the fingers, and a double tap doesn't fight a tap on a stop.
      tap: false,
      maxBounds: [[0.9, 103.2], [1.8, 104.5]],
      minZoom: 10,
    }).setView(SG_CENTRE, 12);
    map.attributionControl.setPrefix(false);
    // Its controls (the OpenStreetMap credit) out of the map's own box and into the panel, so
    // they stay put and upright while the map turns (setTurning).
    $('#mapPanel').insertBefore(map.attributionControl.getContainer().closest('.leaflet-control-container'), $('#liveMap').nextSibling);
    addTiles();
    groups = {
      lines: L.layerGroup().addTo(map),
      stops: L.layerGroup().addTo(map),
      marks: L.layerGroup().addTo(map),
      me: L.layerGroup().addTo(map),
    };
    // Moving the map yourself stops it following you, until Recentre. Turned with the way you
    // face, it can't be dragged, and zooms about you.
    map.on('dragstart', () => setFollowing(false));
    map.on('zoomstart', (e) => { if (e.originalEvent && !turning) setFollowing(false); });
    return map;
  }

  // ---------- turned with the way you face ----------
  // The compass button: the map centred on you, turned so the way the phone points is up, as
  // a map app's compass mode. The phone's compass where it has one (iOS asks first, from the
  // tap), the way you're moving where it hasn't. Its needle keeps pointing north. Off with the
  // button again, Overview, or closing the map.

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

  function applyTurn() {
    turnFrame = null;
    if (!turning) return;
    const h = heading();
    if (h == null) return;
    turned += (((h - turned) % 360) + 540) % 360 - 180;
    $('#liveMap').style.rotate = `${-turned}deg`;
    $('#mapHeading svg').style.rotate = `${-turned}deg`;
  }

  // The map's box as a square the screen's diagonal across, round the panel's middle.
  function fitTurn() {
    const panel = $('#mapPanel');
    const w = panel.clientWidth;
    const h = panel.clientHeight;
    const d = Math.ceil(Math.hypot(w, h));
    Object.assign($('#liveMap').style, { width: `${d}px`, height: `${d}px`, left: `${(w - d) / 2}px`, top: `${(h - d) / 2}px` });
    map.invalidateSize();
  }

  async function setTurning(on) {
    if (!map || on === turning) return;
    const el = $('#liveMap');
    if (on) {
      // iOS lets a page read the compass only once asked, and asks only from a tap.
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch { /* the way you move instead */ }
      }
      turning = true;
      window.addEventListener('deviceorientationabsolute', onOrient);
      window.addEventListener('deviceorientation', onOrient);
      el.classList.add('turning');
      fitTurn();
      map.dragging.disable();
      map.options.touchZoom = map.options.scrollWheelZoom = map.options.doubleClickZoom = 'center';
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
      el.classList.remove('turning');
      Object.assign(el.style, { width: '', height: '', left: '', top: '', rotate: '' });
      $('#mapHeading svg').style.rotate = '';
      turned = 0;
      facing = null;
      compassAt = 0;
      map.invalidateSize();
      map.dragging.enable();
      map.options.touchZoom = map.options.scrollWheelZoom = map.options.doubleClickZoom = true;
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
    if (at) map.setView(at, STREET_ZOOM, { animate: true });
  }

  // The whole way at once: what's left of the walk or trip, or their trip, with you or them
  // and where it ends. Clear of the bars at the top and bottom.
  function showOverview() {
    if (!map || !mode) return;
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
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30, 90], paddingBottomRight: [70, 120], maxZoom: STREET_ZOOM - 1 });
  }

  // ---------- opening and closing ----------

  async function show(title, sub) {
    $('#mapTitle').textContent = title;
    $('#mapSub').textContent = sub || '';
    $('#mapStep').textContent = '';
    $('#mapNote').hidden = true;
    $('#mapActions').innerHTML = '';
    const panel = $('#mapPanel');
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
    map.invalidateSize();
    retryTiles();
    groups.lines.clearLayers();
    groups.stops.clearLayers();
    groups.marks.clearLayers();
    destMark = null;
    builtTripLeg = null;
    setFollowing(true);
  }

  function close({ fromHistory = false } = {}) {
    const panel = $('#mapPanel');
    if (panel.hidden) return;
    setTurning(false);
    panel.hidden = true;
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
    if (first && following && mode !== 'follow') map.setView([here.lat, here.lng], STREET_ZOOM);
    if (mode === 'walk') onWalkFix();
  }

  // You, as a dot with a ring for how sure the fix is and a cone for the way you face. Drawn
  // on the timer, not on each fix, and only moved, never made again.
  function drawMe() {
    if (!here || !map) return;
    const at = [here.lat, here.lng];
    if (!meDot) {
      meRing = L.circle(at, { radius: here.accuracy, stroke: false, fillColor: COLOURS.me, fillOpacity: 0.12, interactive: false });
      meCone = L.polygon([at, at, at], { stroke: false, fillColor: COLOURS.me, fillOpacity: 0.25, interactive: false });
      meDot = L.circleMarker(at, { radius: 7, color: '#fff', weight: 3, fillColor: COLOURS.me, fillOpacity: 1, interactive: false });
      groups.me.addLayer(meRing).addLayer(meCone).addLayer(meDot);
    } else {
      meDot.setLatLng(at);
      meRing.setLatLng(at).setRadius(Math.min(here.accuracy, 500));
    }
    // The way you face: the compass while the map turns with it, otherwise the way you move.
    const faces = turning ? heading() : here.heading;
    if (faces != null) {
      const zoomM = 40 * Math.pow(2, 17 - map.getZoom());
      const tip = (deg) => {
        const r = ((faces + deg) * Math.PI) / 180;
        return [here.lat + (Math.cos(r) * zoomM) / 110540, here.lng + (Math.sin(r) * zoomM) / (111320 * Math.cos((here.lat * Math.PI) / 180))];
      };
      meCone.setLatLngs([at, tip(-25), tip(25)]);
    } else {
      meCone.setLatLngs([at, at, at]);
    }
    if (!groups.me.hasLayer(meDot)) groups.me.addLayer(meRing).addLayer(meCone).addLayer(meDot);
    keepInView(at);
  }

  function keepInView(at) {
    if (!following) return;
    const size = map.getSize();
    const p = map.latLngToContainerPoint(at);
    // Turned with the way you face, you stay in the middle, which it turns about.
    if (turning) {
      if (Math.hypot(p.x - size.x / 2, p.y - size.y / 2) > 4) map.panTo(at, { animate: true, duration: 0.5 });
      turnSoon();
      return;
    }
    const dx = Math.abs(p.x - size.x / 2) / (size.x / 2);
    const dy = Math.abs(p.y - size.y / 2) / (size.y / 2);
    if (dx > PAN_SHARE || dy > PAN_SHARE) map.panTo(at, { animate: true, duration: 0.6 });
  }

  function hideMe() {
    groups?.me.clearLayers();
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
    await show(title || `Walk to ${to.label || 'here'}`, '');
    mode = 'walk';
    place = { lat: Number(to.lat), lng: Number(to.lng), label: to.label || 'Your destination' };
    walk = null;
    walkFrom = from;
    offRoute = 0;
    destMark = flag([place.lat, place.lng], place.label).addTo(groups.marks);
    // On you already (show() went in on your last fix); until there's one, on where it ends.
    if (!here) map.setView([place.lat, place.lng], STREET_ZOOM - 2);
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
    groups.lines.clearLayers();
    if (!walk) return;
    L.polyline(walk.path, { color: '#fff', weight: 9, opacity: 0.9, interactive: false }).addTo(groups.lines);
    L.polyline(walk.path, { color: COLOURS.walk, weight: 5, opacity: 1, dashArray: walk.source === 'line' ? '2 10' : null, lineCap: 'round', interactive: false }).addTo(groups.lines);
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

  function flag(at, label, colour = '#d6336c') {
    return L.circleMarker(at, { radius: 9, color: '#fff', weight: 3, fillColor: colour, fillOpacity: 1 }).bindTooltip(esc(label), { direction: 'top', offset: [0, -8] });
  }

  async function trip() {
    const p = window.Trip?.progress();
    if (!p) return;
    $('#mapHeading').hidden = false;
    await show(window.Trip.title?.() || 'Your trip', '');
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
      groups.lines.clearLayers();
      groups.stops.clearLayers();
      groups.marks.clearLayers();
      legs.forEach((leg, i) => {
        const done = i < p.legIndex;
        const colour = done ? COLOURS.done : leg.kind === 'walk' ? COLOURS.walk
          : leg.color || (leg.kind === 'train' && LINE_COLOURS[String(leg.route || '').toUpperCase()]) || COLOURS[leg.kind] || COLOURS.bus;
        const line = L.polyline(leg.points, {
          color: colour, weight: leg.kind === 'walk' ? 4 : 6, opacity: done ? 0.6 : 0.95,
          dashArray: leg.kind === 'walk' ? '2 9' : null, lineCap: 'round', interactive: false,
        }).addTo(groups.lines);
        // A train ride along its line's track (js/rail-tracks.js), once that's in; straight from
        // station to station till then.
        if (leg.kind === 'train' && window.RailTracks) {
          RailTracks.path(leg.route || String(leg.label || '').split(' ')[0], leg.points).then((track) => {
            if (!track || mode !== 'trip' || builtTripLeg !== p.legIndex || !groups.lines.hasLayer(line)) return;
            line.setLatLngs(track.path);
            if (i === p.legIndex) tripTrack = track;
          });
        }
        if (leg.kind !== 'walk' && !done) {
          leg.points.forEach((pt, k) => {
            if (k === 0 || k === leg.points.length - 1) return;
            L.circleMarker(pt, { radius: 3.5, color: colour, weight: 2, fillColor: '#fff', fillOpacity: 1 })
              .bindTooltip(esc(leg.names?.[k] || `Stop ${k + 1}`), { direction: 'top' }).addTo(groups.stops);
          });
        }
        if (!done) {
          const end = leg.points[leg.points.length - 1];
          const last = i === legs.length - 1;
          flag(end, last ? leg.to : `${leg.kind === 'walk' ? 'Walk to' : 'Get off at'} ${leg.to}`, last ? '#d6336c' : colour).addTo(groups.marks);
        }
      });
      // On a walk, its streets: from where you are, or where it starts.
      const leg = legs[p.legIndex];
      if (leg.kind === 'walk') {
        const end = leg.points[leg.points.length - 1];
        fetchWalk(here || { lat: leg.points[0][0], lng: leg.points[0][1] }, { lat: end[0], lng: end[1] })
          .then((r) => {
            if (mode !== 'trip' || builtTripLeg !== p.legIndex) return;
            L.polyline(r.path, { color: COLOURS.walk, weight: 5, opacity: 1, lineCap: 'round', interactive: false }).addTo(groups.lines);
          })
          .catch(() => {});
      }
      if (fit && !here) map.setView(p.at, STREET_ZOOM);
    }
    const status = window.Trip.status?.() || '';
    $('#mapStep').textContent = status;
    const mins = Math.max(0, Math.round(p.minutesLeft));
    $('#mapSub').textContent = p.arrived ? 'Arrived' : `${mins} min left · arrive ${clock(Date.now() + mins * 60000)}`;
    // No fix of your own yet: where the trip has you.
    if (!here) {
      hideMe();
      const at = (tripTrack && onTrack(tripTrack, p.timeline?.pos)) || p.at;
      groups.me.addLayer(L.circleMarker(at, { radius: 7, color: '#fff', weight: 3, fillColor: COLOURS.me, fillOpacity: 0.7, interactive: false }));
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
    if (data.path?.length >= 2) {
      if (!themPath) themPath = L.polyline(data.path, { color: COLOURS.them, weight: 5, opacity: 0.85, lineCap: 'round', interactive: false }).addTo(groups.lines);
      else themPath.setLatLngs(data.path);
      // Their train rides on the track, once it's in; straight till then.
      if (data.trains?.length && window.RailTracks) {
        const asked = ++themAsked;
        followTracks(data).then(({ path, current }) => {
          if (mode !== 'follow' || asked !== themAsked || !themPath) return;
          themPath.setLatLngs(path);
          if (themDot && current && !data.me) {
            const on = themAt(data, current);
            themDot.setLatLng(on);
            themRing.setLatLng(on);
          }
        }).catch(() => {});
      }
    }
    if (!destMark && data.to) destMark = flag([data.to.lat, data.to.lng], data.to.label).addTo(groups.marks);
    if (at) {
      if (!themDot) {
        themRing = L.circle(at, { radius: data.me?.accuracy || 30, stroke: false, fillColor: COLOURS.them, fillOpacity: 0.15, interactive: false }).addTo(groups.me);
        themDot = L.circleMarker(at, { radius: 8, color: '#fff', weight: 3, fillColor: COLOURS.them, fillOpacity: 1 }).bindTooltip(esc(data.name || 'Them'), { permanent: false }).addTo(groups.me);
      } else {
        themDot.setLatLng(at);
        themRing.setLatLng(at).setRadius(Math.min(data.me?.accuracy || 30, 500));
      }
      if (fit) {
        map.setView(at, STREET_ZOOM);
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

  // ---------- links ----------

  // #map/84009 (a stop) and #map/1.3184,103.8932~Name (a place): from script.js's router.
  function openFromHash(target) {
    // stopsIndex is script.js's, a top-level let rather than a property of window.
    const stops = typeof stopsIndex === 'undefined' ? null : stopsIndex; // eslint-disable-line no-undef
    const stop = /^\d{5}$/.test(target) ? stops?.[target] : null;
    if (stop) return walkTo({ lat: stop.lat, lng: stop.lng, label: stop.n || target }), true;
    const m = /^(-?[\d.]+),(-?[\d.]+)(?:~(.*))?$/.exec(target);
    if (m) return walkTo({ lat: Number(m[1]), lng: Number(m[2]), label: m[3] || 'Pinned place' }), true;
    return false;
  }

  function init() {
    $('#mapClose').addEventListener('click', () => close());
    $('#mapRecentre').addEventListener('click', () => setFollowing(true));
    $('#mapOverview').addEventListener('click', showOverview);
    $('#mapHeading').addEventListener('click', () => setTurning(!turning));
    window.addEventListener('resize', () => { if (turning) fitTurn(); });
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

  window.LiveMap = { walkTo, trip, follow, updateFollow, close, openFromHash, isOpen: () => mode != null, mode: () => mode };
  init();
})();
