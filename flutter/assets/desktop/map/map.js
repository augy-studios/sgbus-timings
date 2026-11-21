// The desktop live map's page script (map.html): MapLibre GL JS driven by the app's Dart side
// (lib/features/map/web/), which stands in for maplibre_gl's Android map.
//
// Dart -> page: window.sgMap.run(command, data). Each command is {id, cmd, ...} (built by
// map_commands.dart); data is a GeoJSON source's contents where there is one. Every command is
// answered on the channel with {reply: id, result, camera} or {reply: id, error, code}, so Dart's
// Future for it completes when it's done (an animated camera move: when the move ends).
//
// Page -> Dart: SgMapChannel.postMessage(json), the WebView's JavaScript channel. Besides the
// replies: {event: 'ready', page} once this script runs (page is a random id for this load),
// 'style' when a style has loaded, 'move' and 'idle' with the camera, 'click' and 'longpress'
// (a right-click, or a touch held still) with {x, y, lat, lng}, 'gesture' when a drag, scroll or
// pinch moves the map, 'link' when a link (the map's credits) is clicked, and 'error'.
//
// Places come from Dart as [lat, lng] (maplibre_gl's LatLng.toJson) and go to MapLibre GL JS as
// [lng, lat]. A layer's properties come as maplibre_gl's toJson() and are split here into
// MapLibre GL JS's `layout` and `paint`. OpenFreeMap's addresses are sent to the app's local
// server (transformRequest), which keeps everything in its disk cache for offline use.
(function () {
  'use strict';

  const OFM = 'https://tiles.openfreemap.org/';
  // An animated camera move's time when Dart gives none, in ms.
  const DEFAULT_DURATION = 300;
  // How long a touch held still counts as a long press, in ms, and how far it may wander, in px.
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_SLOP = 8;
  // At most one error posted per this many ms, as offline every missing tile reports one.
  const ERROR_GAP_MS = 2000;
  // A style that couldn't load (offline, with no copy kept) is tried again this often, in ms,
  // and as soon as the computer says it's back online.
  const STYLE_RETRY_MS = 15000;

  // The properties that go in a layer's `layout`; every other one goes in its `paint`. The same
  // list maplibre_gl's web build uses (maplibre_gl_web's layer_tools.dart), from MapLibre's
  // style specification.
  const LAYOUT = new Set([
    'symbol-placement', 'symbol-spacing', 'symbol-avoid-edges', 'symbol-sort-key', 'symbol-z-order',
    'icon-allow-overlap', 'icon-overlap', 'icon-ignore-placement', 'icon-optional', 'icon-rotation-alignment',
    'icon-size', 'icon-text-fit', 'icon-text-fit-padding', 'icon-image', 'icon-rotate', 'icon-padding',
    'icon-keep-upright', 'icon-offset', 'icon-anchor', 'icon-pitch-alignment', 'text-pitch-alignment',
    'text-rotation-alignment', 'text-field', 'text-font', 'text-size', 'text-max-width', 'text-line-height',
    'text-letter-spacing', 'text-justify', 'text-radial-offset', 'text-variable-anchor',
    'text-variable-anchor-offset', 'text-anchor', 'text-max-angle', 'text-writing-mode', 'text-rotate',
    'text-padding', 'text-keep-upright', 'text-transform', 'text-offset', 'text-allow-overlap', 'text-overlap',
    'text-ignore-placement', 'text-optional', 'symbol-height-offset', 'symbol-height-anchor', 'visibility',
    'circle-sort-key', 'line-cap', 'line-join', 'line-miter-limit', 'line-round-limit', 'line-sort-key',
    'fill-sort-key', 'fill-extrusion-rounded-corner-distance',
  ]);

  // This page load's id, so Dart sends its set-up once per load.
  const page = Math.random().toString(36).slice(2);

  let map = null;
  // Whether the style has loaded, so sources and layers can be added.
  let styleReady = false;
  // The box the camera's centre is kept in, [[south, west], [north, east]], or null.
  let bounds = null;
  // The animated camera move under way, and the ones cut short (by another move or a drag).
  let flying = null;
  let lastMove = 0;
  const cut = new Set();
  let lastError = 0;
  // The style asked for last (an address or a style object), to try again if it failed, and
  // the timer of the next try.
  let currentStyle = null;
  let styleRetry = null;

  // ---------- talking to Dart ----------

  // Posts one message to Dart, as JSON. Without the channel (the page opened on its own) nothing
  // happens.
  function post(message) {
    const channel = window.SgMapChannel;
    if (channel && typeof channel.postMessage === 'function') channel.postMessage(JSON.stringify(message));
  }

  // Tells Dart this page is ready for its set-up (again, if Dart asks after the page loaded).
  function hello() {
    post({ event: 'ready', page });
  }

  // An error with a code, as maplibre_gl's own calls fail with (SOURCE_NOT_FOUND and so on).
  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  // Carries out one command from Dart and posts its reply, with the camera as it is now.
  async function run(command, data) {
    const id = command && command.id;
    try {
      const handler = commands[command.cmd];
      if (!handler) throw fail('UNKNOWN_COMMAND', `No command "${command.cmd}"`);
      if (command.cmd !== 'init' && !map) throw fail('MAP_NOT_READY', 'The map is not set up yet');
      const result = await handler(command, data);
      post({ reply: id, result: result === undefined ? null : result, camera: map ? cameraNow() : undefined });
    } catch (err) {
      post({ reply: id, error: String((err && err.message) || err), code: (err && err.code) || 'ERROR' });
    }
  }

  // ---------- small conversions ----------

  // [lat, lng] (maplibre_gl's) as [lng, lat] (MapLibre GL JS's).
  function lngLat(latLng) {
    return [latLng[1], latLng[0]];
  }

  // A bearing from 0 to 360, as Android's map reports it (MapLibre GL JS's goes -180 to 180).
  function bearing360(b) {
    return ((b % 360) + 360) % 360;
  }

  // The camera as maplibre_gl's CameraPosition: {target: [lat, lng], zoom, bearing, tilt}.
  function cameraNow() {
    const c = map.getCenter();
    return { target: [c.lat, c.lng], zoom: map.getZoom(), bearing: bearing360(map.getBearing()), tilt: map.getPitch() };
  }

  // A map event's point on screen and place, as Dart's tap callbacks take them.
  function pointAndPlace(e) {
    return { x: e.point.x, y: e.point.y, lat: e.lngLat.lat, lng: e.lngLat.lng };
  }

  // OpenFreeMap's address as the app's local server's (beside this page: <key>/ofm/...), so it
  // goes through the server's cache. Anything else as it is.
  function proxied(url) {
    if (!url.startsWith(OFM)) return url;
    return new URL(`ofm/${url.slice(OFM.length)}`, location.href).href;
  }

  // A layer's properties (maplibre_gl's toJson) split into MapLibre GL JS's layout and paint.
  function splitProperties(properties) {
    const layout = {};
    const paint = {};
    for (const [name, value] of Object.entries(properties || {})) {
      if (value === null || value === undefined) continue;
      if (LAYOUT.has(name)) layout[name] = value;
      else paint[name] = value;
    }
    return { layout, paint };
  }

  // The page's ground colour, behind the map until its style draws.
  function setGround(colour) {
    if (colour) document.documentElement.style.setProperty('--ground', colour);
  }

  // Android's corner names (AttributionButtonPosition) as MapLibre GL JS's.
  function corner(name) {
    return { topLeft: 'top-left', topRight: 'top-right', bottomLeft: 'bottom-left' }[name] || 'bottom-right';
  }

  // ---------- the camera ----------

  // A camera move from Dart (maplibre_gl's CameraUpdate.toJson(), such as ['newLatLngZoom',
  // [lat, lng], zoom]) as options for MapLibre GL JS's easeTo, or null if it isn't one.
  function cameraOptions(update) {
    const [kind, a, b, c, d, e] = update || [];
    switch (kind) {
      case 'newCameraPosition':
        return { center: lngLat(a.target), zoom: a.zoom, bearing: a.bearing, pitch: a.tilt };
      case 'newLatLng':
        return { center: lngLat(a) };
      case 'newLatLngZoom':
        return { center: lngLat(a), zoom: b };
      case 'newLatLngBounds':
        return boundsCamera(a, { left: b, top: c, right: d, bottom: e });
      case 'scrollBy': {
        const p = map.project(map.getCenter());
        const centre = map.unproject([p.x + a, p.y + b]);
        return { center: [centre.lng, centre.lat] };
      }
      case 'zoomBy':
        return b ? { zoom: map.getZoom() + a, around: map.unproject(b) } : { zoom: map.getZoom() + a };
      case 'zoomIn':
        return { zoom: map.getZoom() + 1 };
      case 'zoomOut':
        return { zoom: map.getZoom() - 1 };
      case 'zoomTo':
        return { zoom: a };
      case 'bearingTo':
        return { bearing: a };
      case 'tiltTo':
        return { pitch: a };
      default:
        return null;
    }
  }

  // The camera that fits the box [[south, west], [north, east]] inside the map less [padding],
  // keeping its turn (as Android's does). If the padding leaves no room, the box's middle.
  function boundsCamera(box, padding) {
    const corners = [lngLat(box[0]), lngLat(box[1])];
    const camera = map.cameraForBounds(corners, { padding, bearing: map.getBearing() });
    if (camera) return { center: camera.center, zoom: camera.zoom, bearing: camera.bearing };
    return { center: [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2] };
  }

  // Whether every number in a camera's options is a real one, as Android refuses NaN.
  function allFinite(options) {
    const numbers = [options.zoom, options.bearing, options.pitch];
    const c = options.center;
    if (Array.isArray(c)) numbers.push(c[0], c[1]);
    else if (c) numbers.push(c.lng, c.lat);
    return numbers.every((n) => n === undefined || Number.isFinite(n));
  }

  // Moves the camera smoothly over [duration] ms. Resolves when the move ends: true if it got
  // there, false if another move or a drag cut it short. Its moveend is told from others' by the
  // event data MapLibre GL JS passes through ({sgMove: n}).
  function animate(options, duration) {
    return new Promise((resolve) => {
      const n = ++lastMove;
      if (flying !== null) cut.add(flying);
      flying = n;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        map.off('moveend', onEnd);
        clearTimeout(timer);
        if (flying === n) flying = null;
        const arrived = !cut.has(n);
        cut.delete(n);
        resolve(arrived);
      };
      const onEnd = (e) => {
        if (e.sgMove === n) finish();
      };
      // In case MapLibre GL JS never ends it (the map hidden mid-move): a second after it's due.
      const timer = setTimeout(finish, duration + 1000);
      map.on('moveend', onEnd);
      map.easeTo({ ...options, duration }, { sgMove: n });
    });
  }

  // Moves the camera at once (a zero-length ease, so `around` works too), cutting short any
  // animated move under way.
  function jump(options) {
    if (flying !== null) cut.add(flying);
    map.easeTo({ ...options, duration: 0 });
  }

  // After a drag that took the camera's centre out of its box, eases it back to the box's edge
  // (Android's map stops the camera there; this is the nearest MapLibre GL JS has to it).
  function backInBounds() {
    if (!bounds) return;
    const c = map.getCenter();
    const lat = Math.min(Math.max(c.lat, bounds[0][0]), bounds[1][0]);
    const lng = Math.min(Math.max(c.lng, bounds[0][1]), bounds[1][1]);
    if (lat !== c.lat || lng !== c.lng) map.easeTo({ center: [lng, lat], duration: 300 });
  }

  // Shows the compass only while the map is turned or tilted.
  function updateCompass() {
    const north = Math.abs(map.getBearing()) < 0.5 && map.getPitch() < 0.5;
    map.getContainer().classList.toggle('sg-north', north);
  }

  // ---------- the commands ----------

  const commands = {
    // The map's set-up: style, camera, zoom limits, the box the camera's centre stays in,
    // whether it tilts by hand, the compass and the credits. Once per page load.
    init(c) {
      if (map) return null;
      setGround(c.ground);
      bounds = c.bounds || null;
      const camera = c.camera || {};
      const tilt = c.tilt !== false;
      currentStyle = c.style;
      map = new maplibregl.Map({
        container: 'map',
        style: c.style,
        center: lngLat(camera.target || [1.3521, 103.8198]),
        zoom: camera.zoom ?? 11,
        bearing: camera.bearing || 0,
        pitch: camera.tilt || 0,
        minZoom: c.minZoom ?? 0,
        maxZoom: c.maxZoom ?? 22,
        // Android's tiltGesturesEnabled: off, the right-drag turns the map without tilting it.
        pitchWithRotate: tilt,
        touchPitch: tilt,
        attributionControl: false,
        transformRequest: (url) => ({ url: proxied(url) }),
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), corner(c.attribution));
      if (c.compass !== false) addCompass(c.compassMargins);
      listen();
      window.addEventListener('online', retryStyle);
      return null;
    },

    // Swaps the style (light or dark, with the theme); 'style' is posted when it has loaded.
    // Not diffed: a full load always ends in style.load, which tells Dart to add its layers.
    setStyle(c) {
      styleReady = false;
      currentStyle = c.style;
      setGround(c.ground);
      map.setStyle(c.style, { diff: false });
      return null;
    },

    // Adds a GeoJSON source with [data].
    addSource(c, data) {
      needStyle();
      if (map.getSource(c.source)) throw fail('SOURCE_ALREADY_EXISTS', `Source "${c.source}" already exists`);
      const source = { type: 'geojson', data: data || { type: 'FeatureCollection', features: [] } };
      if (c.promoteId) source.promoteId = c.promoteId;
      map.addSource(c.source, source);
      return null;
    },

    // Replaces a GeoJSON source's data with [data].
    setSource(c, data) {
      needStyle();
      const source = map.getSource(c.source);
      if (!source) throw fail('SOURCE_NOT_FOUND', `No source "${c.source}"`);
      if (typeof source.setData !== 'function') throw fail('UNSUPPORTED_SOURCE_TYPE', `Source "${c.source}" isn't GeoJSON`);
      source.setData(data);
      return null;
    },

    // Adds (or replaces) an image icons can name, from a base64 PNG.
    async addImage(c, data) {
      needStyle();
      const bytes = Uint8Array.from(atob(String(data || '')), (ch) => ch.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      if (map.hasImage(c.name)) map.removeImage(c.name);
      map.addImage(c.name, image, { pixelRatio: c.pixelRatio || 1 });
      return null;
    },

    // Adds a line, circle, fill or symbol layer from its maplibre_gl properties.
    addLayer(c) {
      needStyle();
      if (map.getLayer(c.layer)) throw fail('LAYER_ALREADY_EXISTS', `Layer "${c.layer}" already exists`);
      if (!map.getSource(c.source)) throw fail('SOURCE_NOT_FOUND', `No source "${c.source}"`);
      addValidatedLayer(c, c.properties || {});
      return null;
    },

    // Moves the camera, smoothly or at once; answered with whether it got there.
    async camera(c) {
      const options = cameraOptions(c.update);
      if (!options) throw fail('INVALID_ARGUMENT', `Unknown camera move ${JSON.stringify(c.update)}`);
      if (!allFinite(options)) throw fail('INVALID_ARGUMENT', 'A camera value is not a number');
      if (!c.animate) {
        jump(options);
        return { arrived: true };
      }
      return { arrived: await animate(options, c.duration ?? DEFAULT_DURATION) };
    },

    // Where a place is on screen, in CSS pixels from the map's top left.
    project(c) {
      const p = map.project(lngLat(c.at));
      return { x: p.x, y: p.y };
    },

    // The features drawn in a box on screen by some layers (every one if none are named).
    query(c) {
      if (!styleReady) return [];
      const [left, top, right, bottom] = c.rect;
      const wanted = c.layers || [];
      const layers = wanted.filter((id) => map.getLayer(id));
      if (wanted.length && !layers.length) return [];
      const options = {};
      if (layers.length) options.layers = layers;
      if (c.filter) options.filter = typeof c.filter === 'string' ? JSON.parse(c.filter) : c.filter;
      return map.queryRenderedFeatures([[left, top], [right, bottom]], options).map(featureJson);
    },
  };

  // Fails a source or layer command made before the style has loaded, as Android's does.
  function needStyle() {
    if (!styleReady) throw fail('STYLE_NOT_READY', 'The style has not loaded yet');
  }

  // Adds the layer [c] with [properties]. MapLibre GL JS reports a bad property or filter as an
  // error event rather than by throwing, and then doesn't add the layer: that's thrown instead.
  // A property it doesn't know at all (one of maplibre_gl's own extras) is left out and the add
  // tried once more, as maplibre_gl's web build does.
  function addValidatedLayer(c, properties) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { layout, paint } = splitProperties(properties);
      const layer = { id: c.layer, type: c.type, source: c.source, layout, paint };
      if (c.sourceLayer) layer['source-layer'] = c.sourceLayer;
      if (c.minzoom !== undefined && c.minzoom !== null) layer.minzoom = c.minzoom;
      if (c.maxzoom !== undefined && c.maxzoom !== null) layer.maxzoom = c.maxzoom;
      if (c.filter !== undefined && c.filter !== null) layer.filter = c.filter;
      const before = c.below && map.getLayer(c.below) ? c.below : undefined;
      const errors = errorsDuring(() => map.addLayer(layer, before));
      if (map.getLayer(c.layer)) return;
      const unknown = errors.map((m) => (/unknown property "([^"]+)"/.exec(m) || [])[1]).filter(Boolean);
      if (!unknown.length || attempt > 0) throw fail('INVALID_LAYER', errors[0] || `Layer "${c.layer}" was not added`);
      properties = Object.fromEntries(Object.entries(properties).filter(([name]) => !unknown.includes(name)));
    }
  }

  // The messages of the error events MapLibre GL JS fires while [fn] runs.
  function errorsDuring(fn) {
    const messages = [];
    const listener = (e) => messages.push(String((e.error && e.error.message) || e.error || 'error'));
    map.on('error', listener);
    try {
      fn();
    } finally {
      map.off('error', listener);
    }
    return messages;
  }

  // A rendered feature as GeoJSON, as Android's query answers.
  function featureJson(f) {
    return {
      type: 'Feature',
      id: f.id,
      geometry: f.geometry,
      properties: f.properties,
      source: f.source,
      sourceLayer: f.sourceLayer,
      layer: { id: f.layer && f.layer.id },
    };
  }

  // The compass (MapLibre GL JS's NavigationControl without its zoom buttons), [margins] =
  // [from the right, from the top] in px as Android's compassViewMargins. A click turns the map
  // back to north and flat.
  function addCompass(margins) {
    map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right');
    const box = map.getContainer().querySelector('.maplibregl-ctrl-top-right');
    if (box && margins) {
      box.style.right = `${margins[0]}px`;
      box.style.top = `${margins[1]}px`;
    }
    updateCompass();
  }

  // ---------- events to Dart ----------

  // Posts the map's events to Dart.
  function listen() {
    map.on('style.load', () => {
      styleReady = true;
      post({ event: 'style' });
    });
    map.on('movestart', (e) => {
      // A move with an originalEvent is a person's: a drag, a scroll, a pinch, a key.
      if (!e.originalEvent) return;
      if (flying !== null) cut.add(flying);
      post({ event: 'gesture' });
    });
    map.on('move', () => {
      updateCompass();
      post({ event: 'move', camera: cameraNow() });
    });
    map.on('moveend', (e) => {
      post({ event: 'idle', camera: cameraNow() });
      if (e.originalEvent) backInBounds();
    });
    map.on('click', (e) => post({ event: 'click', ...pointAndPlace(e) }));
    map.on('contextmenu', (e) => post({ event: 'longpress', ...pointAndPlace(e) }));
    listenForLongPress();
    map.on('error', (e) => {
      // Before the style has loaded, an error is the style (or its sprite or fonts) not
      // coming: tried again later.
      if (!styleReady) retryStyleLater();
      const now = Date.now();
      if (now - lastError < ERROR_GAP_MS) return;
      lastError = now;
      post({ event: 'error', message: String((e.error && e.error.message) || e.error || 'error') });
    });
  }

  // Asks for the style again, if it still hasn't loaded: back online, or STYLE_RETRY_MS after
  // it failed. The map's server goes to OpenFreeMap first for a style, so this gets it once the
  // connection's back.
  function retryStyle() {
    clearTimeout(styleRetry);
    styleRetry = null;
    if (map && !styleReady && currentStyle) map.setStyle(currentStyle, { diff: false });
  }

  // Tries the style again in STYLE_RETRY_MS, unless a try is already due.
  function retryStyleLater() {
    if (styleRetry === null) styleRetry = setTimeout(retryStyle, STYLE_RETRY_MS);
  }

  // A touch held still for LONG_PRESS_MS is a long press (on a touch screen; a mouse
  // right-clicks).
  function listenForLongPress() {
    let timer = null;
    let start = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      start = null;
    };
    map.on('touchstart', (e) => {
      cancel();
      if (e.points.length !== 1) return;
      start = e.point;
      const at = pointAndPlace(e);
      timer = setTimeout(() => {
        timer = null;
        post({ event: 'longpress', ...at });
      }, LONG_PRESS_MS);
    });
    map.on('touchmove', (e) => {
      if (start && Math.hypot(e.point.x - start.x, e.point.y - start.y) > LONG_PRESS_SLOP) cancel();
    });
    map.on('touchend', cancel);
    map.on('touchcancel', cancel);
  }

  // ---------- the WebView's own parts, held back ----------

  // A map, not a web page: no right-click menu, no dragging images out, no following links in
  // the map's place (they open in the browser, through Dart), and none of the browser's keys
  // that would reload, find, print or zoom the page.
  function holdBrowserBack() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());
    document.addEventListener('click', (e) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!link) return;
      e.preventDefault();
      post({ event: 'link', url: link.href });
    }, true);
    document.addEventListener('keydown', (e) => {
      const key = (e.key || '').toLowerCase();
      const withCtrl = e.ctrlKey || e.metaKey;
      if (key === 'f5' || (withCtrl && ['r', 'f', 'g', 'p', 's', 'o', 'u', '=', '+', '-', '0'].includes(key))) e.preventDefault();
    });
  }

  // run and hello are Dart's; the map itself is there for the page's tests (tool/playwright/).
  window.sgMap = {
    run,
    hello,
    splitProperties,
    get map() {
      return map;
    },
  };
  holdBrowserBack();
  hello();
})();
