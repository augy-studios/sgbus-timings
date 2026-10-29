// The map saved for offline draws Singapore's buildings in 3D (help desk #13): Explorer's Save
// the map (js/map-save.js) is run for real, the connection's cut, and Explorer's opened again
// over Orchard, zoomed in past OpenFreeMap's last zoom (14) and tilted, in light and dark.
//
//   node scripts/map-save-3d-test.cjs
//
// Needs the network for the save: one real download from OpenFreeMap (616 tiles and the fonts,
// about 25 MB, within its terms for an app's offline download), so don't run it in a loop.
// PROFILE=<folder> keeps Chrome's profile there and, once a map's saved in it, saves again with
// its tiles as they're kept (only the styles, fonts and the like are fetched again). Needs
// Playwright as scripts/explore-return-test.cjs does (PLAYWRIGHT=<path>, or a global install),
// and Chromium where Playwright finds it, or CHROME=<path to Chrome>, drawing WebGL with
// SwiftShader. The page is served from main-site/ by a server started here on
// http://localhost:PORT (8765; a secure context, so sw.js runs as it does live), with /api/*
// answered from what's below. SHOTS=<folder> saves a screenshot of each view. About a minute.
//
// What it checks:
//   1. The save finishes with every tile in (none missing, none cut short at 50 MB).
//   2. Offline (Chrome's own offline, nothing reaches the server or OpenFreeMap), with the tiles
//      kept as they're seen thrown away so only the saved ones are there: Explorer opens on
//      OpenFreeMap's map, not OpenStreetMap's, and stays on it past STYLE_WAIT_MS.
//   3. Over Orchard at MapLibre zoom 15, 16 and 17, tilted 60°, `building-3d` draws (rendered
//      features), from zoom 14 tiles drawn closer in (no tile past 14 asked for), with the
//      map's labels drawn too (its fonts and sprites from the save), no tile left undrawn and no
//      errors. A font range the save missed fails the whole tile a label needing it is in.
//   4. The same in dark mode (OpenFreeMap's Dark, with the 3D layer js/map-engine.js adds).
//   5. Once OpenFreeMap's TileJSON names a newer week than the one saved, offline still draws
//      them from the saved week's (sw.js, savedKey and x-saved-from).
const path = require('path');
const fs = require('fs');
const http = require('http');

// So context.route() sees what sw.js itself fetches: Chrome's offline mode alone doesn't always
// stop the service worker's own requests.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT || 'playwright');
} catch {
  try { playwright = require('playwright-core'); } catch {
    playwright = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const SITE = path.resolve(process.env.SITE || path.join(__dirname, '../main-site'));
const PORT = Number(process.env.PORT) || 8765;
const ORIGIN = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const PROFILE = process.env.PROFILE ? path.resolve(process.env.PROFILE) : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.geojson': 'application/json' };
const ORCHARD = [1.3040, 103.8320];
const STOPS = [
  { c: '09047', n: 'Orchard Stn/Lucky Plaza', r: 'Orchard Rd', la: 1.30419, lo: 103.83346 },
  { c: '09022', n: 'Orchard Stn/Tang Plaza', r: 'Orchard Blvd', la: 1.30370, lo: 103.83218 },
];
const SAVE_MS = 10 * 60 * 1000;
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

// The site, and /api/* from what's above. `offline` counts what reaches it once it shouldn't,
// but for sw.js itself: Chrome's own check for a new one isn't stopped by its offline mode (on a
// phone with no connection it fails).
let offline = false;
const hitsOffline = [];
const server = http.createServer((req, res) => {
  if (offline && req.url !== '/sw.js') hitsOffline.push(req.url);
  const url = new URL(req.url, ORIGIN);
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/api/bus-stops') return json(200, STOPS);
  if (url.pathname === '/api/bus-arrivals') return json(200, { busStopCode: url.searchParams.get('stop'), services: [] });
  if (url.pathname.startsWith('/api/')) return json(404, {});
  const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((resolve) => server.listen(PORT, 'localhost', resolve));
  // SwiftShader for WebGL, so MapLibre runs headless; analytics never leaves the machine.
  const launch = {
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP www.googletagmanager.com 127.0.0.1, MAP *.google-analytics.com 127.0.0.1, MAP analytics.google.com 127.0.0.1, MAP www.google.com 127.0.0.1'],
    ...(process.env.CHROME && { executablePath: process.env.CHROME }),
  };
  const options = { viewport: { width: 400, height: 820 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, geolocation: { latitude: ORCHARD[0], longitude: ORCHARD[1], accuracy: 10 }, permissions: ['geolocation'], serviceWorkers: 'allow' };
  let browser = null;
  let context;
  if (PROFILE) context = await playwright.chromium.launchPersistentContext(PROFILE, { ...launch, ...options });
  else {
    browser = await playwright.chromium.launch(launch);
    context = await browser.newContext(options);
  }
  // Seeded once (the save is kept in localStorage across reloads), and the MapLibre map caught
  // as it's made, for the test only: the first map.on() it's given marks it, and its errors are
  // kept.
  await context.addInitScript(() => {
    if (!localStorage.getItem('sgbus_test_seeded')) {
      localStorage.clear();
      const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('sgbus_test_seeded', '1');
      set('sgbus_first_run', 'done');
      set('sgbus_tour', 'done');
      set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
      set('sgbus_start', 'timings');
      set('sgbus.mode', 'light');
    }
    window.__mapErrors = [];
    let ml;
    Object.defineProperty(window, 'maplibregl', {
      configurable: true,
      get: () => ml,
      set(v) {
        ml = v;
        const on = v.Map.prototype.on;
        v.Map.prototype.on = function (...a) {
          if (!this.__caught) {
            this.__caught = true;
            window.__map = this;
            on.call(this, 'error', (e) => window.__mapErrors.push(`${e.sourceId || ''}${e.tile ? ` ${e.tile.tileID?.canonical?.z}/${e.tile.tileID?.canonical?.x}/${e.tile.tileID?.canonical?.y}` : ''} ${e.error?.url || ''} ${e.error?.message || 'error'}`.trim()));
          }
          return on.apply(this, a);
        };
      },
    });
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));

  const ready = async () => {
    await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'), null, { timeout: 30000 });
    await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); document.body.classList.remove('touring'); });
  };
  // Explorer open, its map's style in.
  const openExplorer = async () => {
    await page.evaluate(() => window.LiveMap.explore());
    await page.waitForFunction(() => window.LiveMap.mode() === 'explore' && window.__map?.isStyleLoaded?.() !== undefined && window.__map.getStyle()?.layers?.length > 3, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
  };
  // Every tile in and drawn (or 30 s).
  const settle = () => page.evaluate(() => new Promise((resolve) => {
    const m = window.__map;
    const t = setTimeout(resolve, 30000);
    m.once('idle', () => { clearTimeout(t); resolve(); });
    m.triggerRepaint();
  }));

  // ---------- the save ----------

  await page.goto(`${ORIGIN}/`);
  await ready();
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await ready();
  }
  ok('sw.js controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));
  // This checkout's files, not what sw.js kept of them in PROFILE before they changed.
  if (PROFILE) {
    await page.evaluate(async () => Promise.all((await caches.keys()).filter((k) => /^sgbus-v\d+$/.test(k)).map((k) => caches.delete(k))));
    await page.reload();
    await ready();
  }
  await openExplorer();
  ok('online, Explorer draws with MapLibre on OpenFreeMap', await page.evaluate(() => !!window.__map.getSource('openmaptiles')));

  // OpenFreeMap's fonts kept from looking at the map go first, so only what the save fetches is
  // there offline. A map saved in PROFILE already is saved again: its tiles are kept (sw.js
  // doesn't fetch those again), the rest is fetched afresh.
  const reused = await page.evaluate(async () => {
    const cache = await caches.open('sgbus-map');
    await Promise.all((await cache.keys()).filter((k) => k.url.includes('/fonts/')).map((k) => cache.delete(k)));
    const had = window.MapSave.saved();
    localStorage.removeItem('sgbus_map_saved');
    return had;
  });
  if (reused) console.log('(a map was saved in this profile already: its tiles are used again)');
  const t0 = Date.now();
  await page.click('#mapSave');
  await page.click('[data-map-save="download"]');
  await page.waitForFunction(() => window.MapSave.busy(), null, { timeout: 30000 });
  await page.waitForFunction(() => !window.MapSave.busy(), null, { timeout: SAVE_MS, polling: 1000 });
  console.log(`(saved in ${Math.round((Date.now() - t0) / 1000)} s)`);
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('sgbus_map_saved') || 'null'));
  ok('the map saved, every tile in', meta && meta.count > 0 && !meta.missing && !meta.capped, JSON.stringify(meta && { count: meta.count, missing: meta.missing, capped: meta.capped, MB: (meta.bytes / 1048576).toFixed(1) }) + ` ${await page.evaluate(() => document.querySelector('#mapSaveBody')?.innerText.replace(/\s+/g, ' ') || '')}`.trim());
  const z14 = await page.evaluate(async () => (await (await caches.open('sgbus-map-saved')).keys()).filter((k) => /\/saved\/14\//.test(k.url)).length);
  ok('zoom 14 tiles saved', z14 > 300, `${z14}`);

  // Only the saved tiles from here: the ones kept as they're seen go.
  await page.evaluate(() => { window.LiveMap.close(); return caches.delete('sgbus-vector'); });

  // ---------- offline ----------

  // Offline: Chrome's offline mode, and anything still asked of the network (sw.js's own fetches
  // too) refused here, so nothing comes from it.
  await context.setOffline(true);
  offline = true;
  const asked = [];
  await context.route('**/*', (route) => { asked.push(route.request().url()); return route.abort('internetdisconnected'); });
  async function view(label) {
    await page.reload();
    await ready();
    ok(`${label}: offline`, await page.evaluate(() => navigator.onLine === false));
    const t0 = Date.now();
    await openExplorer();
    for (const z of [15, 16, 17]) {
      await page.evaluate(([lat, lng, zoom]) => window.__map.jumpTo({ center: [lng, lat], zoom, pitch: 60, bearing: -20 }), [ORCHARD[0], ORCHARD[1], z]);
      await settle();
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const m = window.__map;
        const symbols = m.getStyle().layers.filter((l) => l.type === 'symbol' && l.source === 'openmaptiles').map((l) => l.id);
        const tiles = Object.values(m.style.sourceCaches.openmaptiles?._tiles || {}).filter((t) => t.state === 'loaded');
        return {
          zoom: +m.getZoom().toFixed(1),
          pitch: m.getPitch(),
          b3d: m.getLayer('building-3d') ? m.queryRenderedFeatures({ layers: ['building-3d'] }).length : -1,
          labels: m.queryRenderedFeatures({ layers: symbols }).length,
          tiles: tiles.length,
          maxZ: Math.max(-1, ...tiles.map((t) => t.tileID.canonical.z)),
          errored: Object.values(m.style.sourceCaches.openmaptiles?._tiles || {}).filter((t) => t.state === 'errored').map((t) => `${t.tileID.canonical.z}/${t.tileID.canonical.x}/${t.tileID.canonical.y}@${t.tileID.overscaledZ}`),
        };
      });
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${label.replace(/\W+/g, '-')}-z${z}.png`) });
      }
      ok(`${label}: zoom ${z} tilted, 3D buildings drawn`, r.b3d > 0 && r.pitch === 60, JSON.stringify({ ...r, errored: r.errored.length }));
      ok(`${label}: zoom ${z}, no tile past 14 (drawn closer in from 14)`, r.tiles > 0 && r.maxZ === 14, `max z ${r.maxZ}`);
      ok(`${label}: zoom ${z}, labels drawn`, r.labels > 0, `${r.labels}`);
      ok(`${label}: zoom ${z}, no tile left undrawn`, r.errored.length === 0, r.errored.join(' '));
    }
    // Past the wait for its style: still OpenFreeMap's.
    const left = 11000 - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
    const src = await page.evaluate(() => Object.keys(window.__map.getStyle().sources).filter((s) => !s.startsWith('sg-')));
    ok(`${label}: stays on OpenFreeMap's map, not OpenStreetMap's`, src.includes('openmaptiles') && !src.includes('osm'), src.join(','));
    const errs = await page.evaluate(() => window.__mapErrors.splice(0));
    ok(`${label}: no map errors (tiles, fonts, sprites all saved)`, errs.length === 0, errs.slice(0, 5).join(' | '));
    await page.evaluate(() => window.LiveMap.close());
  }

  await view('light');
  // Nothing's fetched for real: sw.js asking OpenFreeMap for what it hasn't kept gets nothing.
  ok('offline for real: sw.js gets nothing from OpenFreeMap', await page.evaluate(() => fetch(`https://tiles.openfreemap.org/planet?probe=${Date.now()}`).then(() => false, () => true)) && asked.some((u) => u.includes('?probe=')));

  await page.evaluate(() => localStorage.setItem('sgbus.mode', 'dark'));
  await view('dark');
  ok('dark: OpenFreeMap Dark', await page.evaluate(() => document.documentElement.getAttribute('data-mode') === 'dark'));

  // A newer week named by the TileJSON kept, as it is once it's been fetched online.
  const weeks = await page.evaluate(async () => {
    const cache = await caches.open('sgbus-map');
    const key = (await cache.keys()).find((k) => /\/planet\/?$/.test(new URL(k.url).pathname));
    const tj = await (await cache.match(key)).json();
    const was = tj.tiles[0];
    tj.tiles = tj.tiles.map((t) => t.replace(/\/planet\/[^/]+\//, '/planet/20991231_000000_pt/'));
    await cache.put(key, new Response(JSON.stringify(tj), { headers: { 'content-type': 'application/json' } }));
    return [was, tj.tiles[0]];
  });
  await page.evaluate(() => localStorage.setItem('sgbus.mode', 'light'));
  await view('newer week');
  const used = await page.evaluate(() => window.__map?.getSource('openmaptiles')?.tiles?.[0] || '');
  ok('newer week: the map asked for the newer week', used.includes('20991231_000000_pt'), `${weeks[0]} -> ${used}`);

  const ofm = [...new Set(asked.filter((u) => u.includes('openfreemap')).map((u) => u.replace(/\?.*/, '')))];
  console.log(`(asked of OpenFreeMap offline, refused: ${ofm.length ? ofm.slice(0, 6).join(' ') : 'nothing'})`);
  const fonts = [...new Set(asked.filter((u) => u.includes('/fonts/')))].map((u) => decodeURIComponent(u.replace(/.*\/fonts\//, '')));
  ok('offline, every font range the labels need was saved', fonts.length === 0, fonts.join(' '));
  ok('nothing reached the server offline', hitsOffline.length === 0, `${hitsOffline.length}: ${[...new Set(hitsOffline)].slice(0, 8).join(' ')}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
  if (browser) await browser.close();
  server.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
