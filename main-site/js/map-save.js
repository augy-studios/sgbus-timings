// Singapore's map saved for offline, from Explorer's Save the map button (js/map.js): every
// OpenFreeMap vector tile over Singapore from the zoom the live map opens out to down to the
// closest OpenFreeMap goes, and what the map needs to draw them (its styles, sprites, the fonts
// for its labels, its world overview and MapLibre itself), so the live map shows the streets
// with no connection, on a trip or a walk.
//
// Within OpenFreeMap's terms for an app's offline download: at most MAX_TILES tiles and
// MAX_BYTES a download, and PARALLEL requests at a time. The tiles are counted before anything's
// fetched, with an estimate of their size from the tiles already seen, and the download can be
// cancelled; a first one cancelled keeps nothing. One that comes to MAX_BYTES stops there and
// keeps what it has, every zoom out first, so only the closest-in of some places is missing.
//
// The service worker fetches and keeps each tile (sw.js, "map-save-tile"), in SAVED_CACHE, apart
// from the tiles kept as they're seen, so it never trims one; it serves them from there, this
// week's as they are and any week's when the network can't be reached. Remove deletes them all.
//
// OpenFreeMap's tiles are at a new address every week (its TileJSON names them): the one used
// is kept with the download, and once a newer one's out, Update map fetches that week's, keeping
// the old until each is replaced.
//
// Window.MapSave = { open(), close() }. Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);

  const OFM = 'https://tiles.openfreemap.org';
  const TILEJSON = `${OFM}/planet`;
  // The same name as SAVED_MAP_CACHE in sw.js.
  const SAVED_CACHE = 'sgbus-map-saved';
  const VECTOR_CACHE = 'sgbus-vector';
  const META_KEY = 'sgbus_map_saved';
  // OpenFreeMap's limits for one offline download.
  const MAX_TILES = 3000;
  const MAX_BYTES = 50 * 1024 * 1024;
  const PARALLEL = 4;
  // Stopped this far short of MAX_BYTES, as the tiles already asked for are still coming in.
  const BYTES_MARGIN = 1024 * 1024;
  // Singapore and the Johor Bahru stops its buses cross to: the box js/nav.js and api/nav.js
  // take for Singapore, [south, west, north, east].
  const BOX = [1.15, 103.55, 1.5, 104.1];
  // MapLibre's zooms: the live map opens out to 9 (js/map-engine.js, MIN_ZOOM 10 in Leaflet's)
  // and OpenFreeMap's tiles go to 14, drawn closer in from those.
  const MIN_ZOOM = 9;
  const MAX_ZOOM = 14;
  // A tile's size when none have been seen yet to go by, from Singapore's at each zoom.
  const GUESS_TILE_BYTES = 40 * 1024;
  // The label fonts' ranges fetched: Latin, its accents, and punctuation (’ – …).
  const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];
  const RENDER_MS = 150;

  let state = null; // the download under way: { total, done, bytes, sent, failed, cancelled, tooBig, update }
  let newer = null; // this week's tiles, when they're newer than the ones saved
  let message = '';
  let estimate = null;
  let lastRender = 0;

  function meta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || 'null');
    } catch {
      return null;
    }
  }
  function setMeta(m) {
    try {
      if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
      else localStorage.removeItem(META_KEY);
    } catch { /* shown as not saved next time; the tiles still serve */ }
  }

  // ---------- counting ----------

  const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
  const tileY = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };

  // Every tile over the box at zooms `from` to `to`, from a {z}/{x}/{y} template.
  function tilesFor(template, from, to) {
    const out = [];
    const [s, w, n, e] = BOX;
    for (let z = from; z <= to; z++) {
      for (let x = tileX(w, z); x <= tileX(e, z); x++) {
        for (let y = tileY(n, z); y <= tileY(s, z); y++) out.push(template.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      }
    }
    return out;
  }

  const vectorCount = () => tilesFor('{z}/{x}/{y}', MIN_ZOOM, MAX_ZOOM).length;

  // The tiles' likely size, from the tiles kept as they're seen (sw.js), or a guess.
  async function estimateBytes(count) {
    let each = GUESS_TILE_BYTES;
    try {
      if (await caches.has(VECTOR_CACHE)) {
        const cache = await caches.open(VECTOR_CACHE);
        const keys = (await cache.keys()).slice(-40);
        const sizes = await Promise.all(keys.map(async (k) => (await (await cache.match(k))?.blob())?.size || 0));
        const seen = sizes.filter(Boolean);
        if (seen.length >= 10) each = seen.reduce((a, b) => a + b, 0) / seen.length;
      }
    } catch { /* the guess */ }
    return Math.round(count * each);
  }

  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  const day = (ms) => new Date(ms).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

  // ---------- fetching ----------

  // This week's tiles, from OpenFreeMap's TileJSON, asked of the network (sw.js otherwise
  // answers it from its copy first).
  async function thisWeek() {
    const r = await fetch(TILEJSON, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`OpenFreeMap replied ${r.status}`);
    const tj = await r.json();
    const template = tj.tiles?.[0];
    if (!template) throw new Error("OpenFreeMap's TileJSON names no tiles");
    return { template, maxzoom: Math.min(MAX_ZOOM, tj.maxzoom ?? MAX_ZOOM) };
  }

  // What the map needs besides the vector tiles, all fetched through sw.js, which keeps them
  // (MAP_CACHE): the styles, their sprites, the fonts for their labels, the world overview's
  // tiles over Singapore, and MapLibre. Each [url, isTile].
  async function extrasFor(styles) {
    const urls = new Set([TILEJSON, ...(window.MapEngine?.files || [])]);
    const tiles = new Set();
    for (const style of styles) {
      urls.add(style.url);
      const s = style.json;
      const sprites = typeof s.sprite === 'string' ? [s.sprite] : (s.sprite || []).map((x) => x.url);
      for (const sp of sprites) for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) urls.add(`${sp}${suffix}`);
      const stacks = new Set();
      for (const layer of s.layers || []) {
        let font = layer.layout?.['text-font'];
        if (Array.isArray(font) && font[0] === 'literal') font = font[1];
        if (Array.isArray(font) && font.length && font.every((f) => typeof f === 'string')) stacks.add(font.join(','));
      }
      if (s.glyphs) for (const stack of stacks) for (const range of GLYPH_RANGES) urls.add(s.glyphs.replace('{fontstack}', stack).replace('{range}', range));
      // A raster source (the world overview) at the closest zoom it goes, which the map draws
      // closer in from.
      for (const src of Object.values(s.sources || {})) {
        if (src.type === 'raster' && src.tiles?.[0]) for (const t of tilesFor(src.tiles[0], src.maxzoom ?? 6, src.maxzoom ?? 6)) tiles.add(t);
      }
    }
    return [...[...urls].map((u) => [u, false]), ...[...tiles].map((u) => [u, true])];
  }

  // One vector tile fetched and kept by sw.js: { ok, bytes, fetched }, `fetched` false when this
  // week's was kept already.
  function saveTile(url) {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => resolve(data);
      navigator.serviceWorker.controller.postMessage({ type: 'map-save-tile', url }, [channel.port2]);
    });
  }

  async function download() {
    if (state) return;
    message = '';
    if (!navigator.serviceWorker?.controller) {
      message = "Saving the map needs the app's offline support, which isn't on here yet. Reload the app and try again.";
      return render();
    }
    if (window.Offline?.on()) {
      message = 'Saving the map needs a connection.';
      return render();
    }
    const had = meta();
    state = { total: 0, done: 0, bytes: 0, sent: 0, failed: 0, cancelled: false, tooBig: false, update: !!had, starting: true };
    render(true);
    try {
      const week = await thisWeek();
      const styles = await Promise.all((window.MapEngine?.styles || []).map(async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`OpenFreeMap replied ${r.status}`);
        return { url, json: await r.json() };
      }));
      const vector = tilesFor(week.template, MIN_ZOOM, week.maxzoom);
      const extras = await extrasFor(styles);
      const tileCount = vector.length + extras.filter(([, isTile]) => isTile).length;
      if (tileCount > MAX_TILES) throw new Error(`That's ${tileCount} tiles, more than the ${MAX_TILES} OpenFreeMap allows in one download.`);
      Object.assign(state, { total: vector.length + extras.length, starting: false });
      render(true);

      // PARALLEL at a time, the extras through the page's own fetch (sw.js keeps them), then the
      // tiles through sw.js's map-save-tile, furthest out first; each tried twice.
      const jobs = [...extras.map(([url]) => ['extra', url]), ...vector.map((url) => ['tile', url])];
      let next = 0;
      const one = async ([kind, url]) => {
        if (kind === 'tile') return saveTile(url);
        const r = await fetch(url);
        if (!r.ok) return { ok: false };
        const bytes = (await r.blob()).size;
        // Only what comes from OpenFreeMap counts towards its limit: not MapLibre, the site's own.
        const sent = url.startsWith(OFM) ? Number(r.headers.get('content-length')) || bytes : 0;
        return { ok: true, bytes, sent };
      };
      const worker = async () => {
        while (!state.cancelled && !state.tooBig && next < jobs.length) {
          const job = jobs[next++];
          let r = await one(job).catch(() => ({ ok: false }));
          if (!r.ok && !state.cancelled) r = await one(job).catch(() => ({ ok: false }));
          state.done++;
          if (!r.ok) state.failed++;
          else {
            state.bytes += r.bytes || 0;
            state.sent += r.sent || 0;
          }
          if (state.sent >= MAX_BYTES - BYTES_MARGIN) state.tooBig = true;
          render();
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));

      const run = state;
      state = null;
      if (run.cancelled) {
        // A first download cancelled keeps nothing; an update keeps what it had, the weeks mixed.
        if (!run.update) await caches.delete(SAVED_CACHE);
        message = run.update ? 'Update cancelled. The map saved before is still there.' : 'Cancelled. Nothing was kept.';
        return render(true);
      }
      // Stopped at MAX_BYTES: kept as it is, without offering to fetch the rest.
      const capped = run.tooBig ? run.total - run.done : 0;
      setMeta({ tiles: week.template, at: Date.now(), bytes: run.bytes, count: vector.length, missing: run.failed, capped });
      newer = null;
      message = capped
        ? `The map came near ${mb(MAX_BYTES)}, OpenFreeMap's limit for one download, so it stopped there: the closest-in view of some places isn't saved.`
        : run.failed ? `${run.failed} of its ${run.total} parts couldn't be saved. Try again to fill them in.` : '';
    } catch (err) {
      const run = state;
      state = null;
      if (run && !run.update) await caches.delete(SAVED_CACHE).catch(() => {});
      message = `Couldn't save the map: ${err.message}`;
    }
    render(true);
  }

  async function remove() {
    if (state) return;
    await caches.delete(SAVED_CACHE).catch(() => {});
    setMeta(null);
    newer = null;
    message = 'Removed. The map keeps what you look at, as before.';
    render(true);
  }

  // Whether OpenFreeMap has a newer week's tiles than the ones saved. Nothing, offline.
  async function checkWeek() {
    const m = meta();
    if (!m || window.Offline?.on() || navigator.onLine === false) return;
    try {
      const week = await thisWeek();
      newer = week.template !== m.tiles ? week.template : null;
      render(true);
    } catch { /* asked again next time it's opened */ }
  }

  // ---------- the sheet ----------

  function render(now = false) {
    const body = $('#mapSaveBody');
    if (!body || $('#mapSaveSheet').hidden) return;
    // At most every RENDER_MS while it's going.
    if (!now && state && Date.now() - lastRender < RENDER_MS) return;
    lastRender = Date.now();
    const m = meta();
    const say = message ? `<p class="mapSaveMsg">${escapeHtml(message)}</p>` : '';
    if (state) {
      body.innerHTML = state.starting
        ? `<p>Counting the tiles…</p>`
        : `<p>${state.update ? 'Updating' : 'Saving'} the map… ${state.done} of ${state.total} · ${mb(state.bytes)}</p>` +
          `<progress max="${state.total}" value="${state.done}"></progress>` +
          `<div class="mapActions"><button type="button" class="iconBtn" data-map-save="cancel">${ico('close')} Cancel</button></div>`;
      return;
    }
    if (m) {
      body.innerHTML = say +
        `<p>${ico('download')} <b>Map saved for offline</b> (${escapeHtml(day(m.at))}, ${escapeHtml(mb(m.bytes))})</p>` +
        (m.capped && !message ? `<p class="mapSaveMsg">It stopped at OpenFreeMap's ${mb(MAX_BYTES)} limit, so the closest-in view of some places isn't saved.</p>` : '') +
        (newer ? `<p class="mapSaveMsg">OpenFreeMap has a newer map out. Update to get it; the one saved still works offline meanwhile.</p>` : '') +
        `<div class="mapActions">` +
        (newer || m.missing ? `<button type="button" class="btn" data-map-save="download">${ico('sync')} ${newer ? 'Update map' : 'Try again'}</button>` : '') +
        `<button type="button" class="iconBtn" data-map-save="remove">${ico('close')} Remove</button></div>`;
      return;
    }
    const count = vectorCount();
    body.innerHTML = say +
      `<p>Keep Singapore's map on this phone, so the live map shows the streets with no connection, on a trip or a walk.</p>` +
      `<p class="mapSaveMsg">${count} tiles from OpenFreeMap, about ${estimate == null ? '…' : escapeHtml(mb(estimate))}. Best on Wi-Fi.</p>` +
      `<div class="mapActions"><button type="button" class="btn" data-map-save="download">${ico('download')} Download the Singapore map</button></div>`;
  }

  function open() {
    $('#mapSaveSheet').hidden = false;
    $('#mapPanel').classList.add('mapSaveOpen');
    $('#mapSave').setAttribute('aria-expanded', 'true');
    if (!state) message = '';
    render(true);
    if (estimate == null) estimateBytes(vectorCount()).then((b) => { estimate = b; render(true); });
    checkWeek();
  }

  function close() {
    $('#mapSaveSheet').hidden = true;
    $('#mapPanel').classList.remove('mapSaveOpen');
    $('#mapSave').setAttribute('aria-expanded', 'false');
  }

  function init() {
    $('#mapSave').addEventListener('click', () => ($('#mapSaveSheet').hidden ? open() : close()));
    $('#mapSaveClose').addEventListener('click', close);
    $('#mapSaveBody').addEventListener('click', (e) => {
      const action = e.target.closest('[data-map-save]')?.dataset.mapSave;
      if (action === 'download') download();
      else if (action === 'remove') remove();
      else if (action === 'cancel' && state) {
        state.cancelled = true;
        render(true);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.MapSave = { open, close, saved: () => !!meta(), busy: () => !!state };
})();
