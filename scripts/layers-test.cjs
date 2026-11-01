// Explorer's Layers (js/map.js, #layersModal): a button with Explorer's own opens a window to
// turn each of what Explorer's map shows off or on. It's in Explorer only, not the Edge Tray.
//
//   node scripts/layers-test.cjs
//
// Needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
// The map's engine is a stand-in that keeps what it's asked to draw, so no WebGL is needed.
//
// What it checks:
//   1. No Layers in the Edge Tray.
//   2. In Explorer: its stops, stations and lines drawn; its Layers button opens the window,
//      listing the layers, all on.
//   3. The window over the map, and closing it leaves Explorer open; Back still closes it.
//   4. Bus stops off: no stop dots, the stations still there; MRT and LRT lines off: none drawn;
//      back on, they're back. Kept after a reload.
//   5. Outside Explorer, its button isn't shown.
//   6. In Malay, the window is in Malay.
//   7. No page errors.
const path = require('path');
const fs = require('fs');

let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT || 'playwright');
} catch {
  try { playwright = require('playwright-core'); } catch {
    playwright = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const SITE = path.resolve(process.env.SITE || path.join(__dirname, '../main-site'));
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const STOPS = [
  { c: '17179', n: 'Clementi Stn Exit B', r: 'Commonwealth Ave West', la: 1.31509, lo: 103.76516 },
  { c: '16009', n: 'Kent Ridge Ter', r: 'Kent Ridge Cres', la: 1.29452, lo: 103.76918 },
];
const MS = JSON.parse(fs.readFileSync(path.join(SITE, 'i18n/ms.json'), 'utf8'));

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

async function site(browser, lang = 'en', context = null) {
  context ??= await browser.newContext({ viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.addInitScript((lang) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('sgbus_first_run', 'done');
      set('sgbus_tour', 'done');
      set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
      set('sgbus_start', 'timings');
      set('sgbus_lang', lang);
    }
    // The map's engine, kept to what it's asked to draw (window.__drawn).
    window.__drawn = {};
    let engine;
    Object.defineProperty(window, 'MapEngine', {
      configurable: true,
      get: () => engine,
      set: (real) => {
        const line = () => ({ alive: true, set() {}, remove() {} });
        const fake = new Proxy({ canTurn: false }, {
          get: (t, k) => {
            if (k in t) return t[k];
            if (['pois', 'rails', 'shuttles'].includes(k)) return (list) => { window.__drawn[k] = list; };
            if (k === 'bounds') return () => [[1.2, 103.6], [1.5, 104.1]];
            if (k === 'then') return undefined;
            return () => line();
          },
        });
        engine = { ...real, open: () => Promise.resolve(fake) };
      },
    });
  }, lang);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bus-stops') return json(STOPS);
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.MainScreen && window.LiveMap && document.documentElement.hasAttribute('data-view'));
  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id));
    document.body.classList.remove('touring');
  });
  return { context, page, errors };
}

const shown = (page, id) => page.evaluate((id) => !document.getElementById(id).classList.contains('hidden'), id);
const visible = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); return !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'; }, sel);
const kinds = (page) => page.evaluate(() => [...new Set((window.__drawn.pois || []).map((d) => d.kind))].sort().join(','));
const explorerReady = (page) => page.waitForFunction(() => window.LiveMap.mode() === 'explore' && (window.__drawn.pois || []).length > 0, null, { timeout: 15000 });

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });

  {
    const { context, page, errors } = await site(browser);
    // 1. Not in the Edge Tray.
    ok('1. no Layers in the Edge Tray', await page.evaluate(() => !document.querySelector('#trayButtons [data-icon="layers"]') && !document.getElementById('layersBtn')));
    ok('5. Explorer\'s button not shown outside it', !(await visible(page, '#mapLayers')));

    // 2. In Explorer.
    await page.click('#explorerBtn');
    await explorerReady(page);
    ok('2. its stops and stations', (await kinds(page)).includes('station') && (await kinds(page)).includes('stop'), await kinds(page));
    await page.waitForFunction(() => (window.__drawn.rails || []).length > 0, null, { timeout: 15000 }).catch(() => {});
    ok('2. its lines', await page.evaluate(() => (window.__drawn.rails || []).length > 0));
    ok('2. its Layers button', await visible(page, '#mapLayers'));
    await page.click('#mapLayers');
    ok('2. the window opens', await shown(page, 'layersModal'));
    const layers = await page.$$eval('#layersPick [data-layer]', (els) => els.map((el) => `${el.textContent.trim()}=${el.getAttribute('aria-pressed')}`));
    ok('2. every layer, on', layers.join(' | ') === 'Bus stops=true | MRT and LRT stations=true | MRT and LRT lines=true | Shuttle bus routes=true | Shuttle bus stops=true', layers.join(' | '));
    ok('3. over the map', await page.evaluate(() => {
      const r = document.querySelector('#layersModal .modal').getBoundingClientRect();
      return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('#layersModal');
    }));

    // 4. Off and on.
    await page.click('#layersPick [data-layer="stops"]');
    ok('4. Bus stops off', await page.evaluate(() => document.querySelector('#layersPick [data-layer="stops"]').getAttribute('aria-pressed')) === 'false');
    ok('4. no stop dots, stations kept', !(await kinds(page)).split(',').includes('stop') && (await kinds(page)).includes('station'), await kinds(page));
    await page.click('#layersPick [data-layer="rails"]');
    ok('4. lines off', await page.evaluate(() => window.__drawn.rails.length === 0));
    await page.click('#layersPick [data-layer="stations"]');
    ok('4. stations off', !(await kinds(page)).includes('station'), await kinds(page));
    await page.click('#layersPick [data-layer="rails"]');
    await page.click('#layersPick [data-layer="stations"]');
    ok('4. lines and stations back', await page.evaluate(() => window.__drawn.rails.length > 0) && (await kinds(page)).includes('station'));
    await page.click('[data-close-modal="layersModal"]');
    await page.waitForTimeout(400);
    ok('3. closed, Explorer stays open', !(await shown(page, 'layersModal')) && await page.evaluate(() => !document.getElementById('mapPanel').hidden && LiveMap.mode() === 'explore'));
    // Back closes Explorer as ever.
    await page.goBack();
    await page.waitForTimeout(400);
    ok('3. Back still closes Explorer', await page.evaluate(() => document.getElementById('mapPanel').hidden));
    ok('5. its button not shown outside Explorer', !(await visible(page, '#mapLayers')));

    // Kept after a reload, still with Bus stops off.
    await page.reload();
    await page.waitForFunction(() => window.MainScreen && window.LiveMap && document.documentElement.hasAttribute('data-view'));
    await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); LiveMap.explore(); });
    await page.waitForFunction(() => LiveMap.mode() === 'explore' && window.__drawn.pois, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    ok('4. kept after a reload', !(await kinds(page)).split(',').includes('stop') && (await kinds(page)).includes('station'), await kinds(page));
    ok('7. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 6. In Malay.
  {
    const { context, page, errors } = await site(browser, 'ms');
    await page.click('#explorerBtn');
    await explorerReady(page);
    await page.click('#mapLayers');
    ok('6. title in Malay', (await page.textContent('#layersTitle')).trim() === MS['layers.title']);
    ok('6. layers in Malay', (await page.textContent('#layersPick [data-layer="shuttles"]')).trim() === MS['layers.shuttles']);
    ok('7. no page errors (Malay)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
