// Tests the page's layout on a phone with the Edge Tray out (help desk #11): Chrome under
// Playwright at 360x800 as a phone (isMobile, so it zooms out to fit anything too wide, as a
// phone does), with the tray on the right and then the left.
//
//   node scripts/layout-check-test.cjs
//
// Needs Playwright, as scripts/ride-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
//
// What it checks, on each side:
//   1. The page reaches the tray's buttons, 8px short of them, not of the arrow tab beside
//      them; the greeting still keeps clear of the tab.
//   2. The subtitle isn't cut off: "Made with ♥ by Augy" shows whole.
//   3. Stop 17179's timings (LTA's answer, kept below) don't widen the page or zoom it out, and
//      a bus with no position says "no GPS", not "~ ∞m"; LTA's empty third bus is a dash.
//   4. Favourites: the lists' tabs keep their row and New list shows whole under them, and a
//      stop's starred buses show whole, the cross never over the words.
//   5. Navigate to a place 2.5 km past the last bus stop shows its way, saying how far off the
//      nearest stop is (/api/nav answered with such a way).
//
// SITE=<folder> serves another checkout's main-site (to see how it was before); NOCHECK=1 then
// only reports. SHOTS=<folder> saves a screenshot of each. FIXTURES=<folder> with bus-stops.json,
// bus-routes.json (the site's own /api answers) and nav.json uses those instead of the few stops
// below; with bus-stops.json and bus-routes.json but no nav.json, /api/nav is planned from them
// here, with this checkout's router.
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
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const FIX = process.env.FIXTURES ? path.resolve(process.env.FIXTURES) : null;
const fixture = (f) => (FIX && fs.existsSync(path.join(FIX, f)) ? JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')) : null);

let failures = 0;
let passes = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`);
  if (cond) passes++;
  else failures++;
}

// The stops the pages below need, as /api/bus-stops has them.
const STOPS = fixture('bus-stops.json') || [
  { c: '17179', n: 'Clementi Stn Exit B', r: 'Commonwealth Ave West', la: 1.31509, lo: 103.76516 },
  { c: '16149', n: 'SDE3', r: 'Lower Kent Ridge Rd', la: 1.29874, lo: 103.77279 },
  { c: '16009', n: 'Kent Ridge Ter', r: 'Kent Ridge Cres', la: 1.29452, lo: 103.76918 },
  { c: '95091', n: 'SAF Ferry Ter', r: 'Nicoll Dr', la: 1.387294, lo: 103.999644 },
  { c: '25059', n: 'Aft Tuas Sth Blvd', r: 'Tuas Sth Way', la: 1.2700005, lo: 103.617479 },
];
const ROUTES = fixture('bus-routes.json');

// LTA's arrivals at 17179 on 27 October 2026, 21:17, through /api/bus-arrivals: buses timed by
// the schedule have no position (lat and lng null), and 106, 183 and 189 have an empty third.
const bus = (eta, lat, lng, extra = {}) => ({ eta_ms: eta, load: 'SEA', wheelchair: true, deck: 'Double', lat, lng, visit: 1, rough: lat == null, ...extra });
const none = { eta_ms: null, load: '', wheelchair: false, deck: 'Single', lat: null, lng: null, visit: null, origin: '', dest: '', rough: true };
const ARRIVALS = fixture('arrivals-17179.json') || {
  busStopCode: '17179',
  services: [
    { serviceNo: '105', operator: 'SBST', next: bus(719405, 1.34084, 103.743), next2: bus(1132405, null, null), next3: bus(2032405, null, null) },
    { serviceNo: '106', operator: 'TTS', next: bus(281405, 1.33571, 103.75991), next2: bus(1846405, null, null), next3: none },
    { serviceNo: '154', operator: 'SBST', next: bus(245405, 1.32242, 103.75064), next2: bus(726405, 1.32693, 103.7203), next3: bus(1702405, 1.33978, 103.70778) },
    { serviceNo: '183', operator: 'TTS', next: bus(0, 1.31774, 103.76407), next2: bus(1174405, null, null), next3: none },
    { serviceNo: '184', operator: 'SMRT', next: bus(427405, 1.33331, 103.7780), next2: bus(1026405, 1.36264, 103.76762), next3: bus(1573405, 1.3790, 103.76945) },
    { serviceNo: '185', operator: 'SMRT', next: bus(486405, 1.34441, 103.73639), next2: bus(1472405, 1.35418, 103.70747), next3: bus(2374405, 1.33557, 103.6963) },
    { serviceNo: '189', operator: 'TTS', next: bus(183405, 1.33331, 103.7659), next2: bus(1907405, null, null), next3: none },
    { serviceNo: '201', operator: 'SBST', next: bus(404405, 1.32160, 103.74549), next2: bus(1199405, 1.32676, 103.7387), next3: bus(2175405, 1.30438, 103.76453) },
    { serviceNo: '52', operator: 'SBST', next: bus(1177405, null, null), next2: bus(1559405, null, null), next3: bus(2519405, null, null) },
  ],
};

const FROM = { lat: 1.387294, lng: 103.999644, name: 'SAF Ferry Ter' };
const TO = { lat: 1.247486, lng: 103.614159, name: 'Scm Tuas Lodge' };

// /api/nav's answer for FROM to TO: a fixture, planned here from the fixtures, or a way like
// the router's, ending with the 2.5 km walk.
async function navAnswer() {
  const fixed = fixture('nav.json');
  if (fixed) return fixed;
  const when = { mode: 'leave', ms: Date.parse('2026-10-28T09:00:00+08:00') };
  if (ROUTES && FIX) {
    const { buildGraph } = await import(path.join(__dirname, '../main-site/js/nav-core/network.js'));
    const { planFor } = await import(path.join(__dirname, '../main-site/js/nav-core/plan.js'));
    const rail = JSON.parse(fs.readFileSync(path.join(__dirname, '../main-site/data/rail.json'), 'utf8'));
    const { options } = planFor(buildGraph(rail, STOPS, ROUTES), FROM, TO, when, null);
    return { options, onemap: false, alerts: { lines: [] }, when, traffic: null, others: {} };
  }
  const stop = (code, name, lat, lng) => ({ kind: 'stop', code, name, lat, lng });
  const a = stop('95099', 'Opp SAF Ferry Ter', 1.388248, 103.998803);
  const b = stop('25059', 'Aft Tuas Sth Blvd', 1.2700005, 103.617479);
  return {
    options: [{
      minutes: 213, mix: 'B', routes: ['9'], far: { to: 2531 },
      legs: [
        { mode: 'walk', metres: 141, minutes: 2.4, to: a },
        { mode: 'bus', route: '9', towards: 'Aft Tuas Sth Blvd', from: a, to: b, stops: 2, minutes: 160, wait: 5, board: 7.4, path: [[a.lat, a.lng], [b.lat, b.lng]], names: [a.name, b.name], dir: 1, codes: [a.code, b.code] },
        { mode: 'walk', metres: 2531, minutes: 42, to: { kind: 'place' } },
      ],
    }],
    onemap: false, alerts: { lines: [] }, when, traffic: null, others: {},
  };
}

(async () => {
  const NAV = await navAnswer();
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const errors = [];

  async function newContext(side) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      geolocation: { latitude: 1.3151, longitude: 103.7652, accuracy: 20 }, permissions: ['geolocation'], serviceWorkers: 'block',
    });
    // Someone who's been here before (no first-run choice or tours), with favourites and lists
    // as in Augy's screenshot, the tray out on `side`.
    await context.addInitScript((side) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('sgbus_first_run', 'done');
      set('sgbus_tour', 'done');
      set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places']);
      set('sgbus_start', 'timings');
      if (side === 'left') set('sgbus_tray_side', 'left');
      set('sgbus_favs_v2', [{ code: '17179', name: '' }, { code: '16009', name: '' }]);
      set('sgbus_fav_buses', ['183']);
      set('sgbus_fav_stop_buses', [{ code: '16149', service: '183' }, { code: '16149', service: '188' }, { code: '17179', service: '96' }, { code: '17179', service: '183' }, { code: '17179', service: '189' }]);
      set('sgbus_fav_lists', [
        { id: 'l1', name: 'To Engineering', items: ['stopbus:16149/183', 'stopbus:16149/188'] },
        { id: 'l2', name: 'Home from school', items: ['stop:17179'] },
      ]);
    }, side);
    await context.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/bus-stops') return json(STOPS);
      if (url.pathname === '/api/bus-routes') return ROUTES ? json(ROUTES) : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      if (url.pathname === '/api/bus-arrivals') return json(url.searchParams.get('stop') === '17179' ? ARRIVALS : { busStopCode: url.searchParams.get('stop'), services: [] });
      if (url.pathname === '/api/nav') return json(NAV);
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
    return context;
  }

  async function open(context, hash = '') {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(`${ORIGIN}/${hash}`);
    await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'));
    await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); document.body.classList.remove('touring'); });
    await page.waitForTimeout(500); // the tray's and page's transitions
    return page;
  }

  const shot = async (page, name, clip) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...(clip ? { clip } : { fullPage: false }) });
  };

  // Whether the page fits the screen: no wider than it, so not zoomed out.
  // With what sticks out past it, if anything, to say where to look.
  const fits = (page) => page.evaluate(() => {
    const out = [...document.querySelectorAll('body *')]
      .filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > 361)
      .filter((e) => !e.closest('.hud'))
      .slice(0, 4)
      .map((e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${[...e.classList].join('.')} ${Math.round(e.getBoundingClientRect().right)}`);
    const scroll = document.documentElement.scrollWidth;
    return { inner: innerWidth, scroll, scale: visualViewport.scale, ...(scroll > 360 && out.length && { out }) };
  });

  for (const side of ['right', 'left']) {
    const context = await newContext(side);
    const page = await open(context);

    // ---- 1. the page reaches the tray's buttons; the greeting clears the tab ----
    const tray = await page.evaluate((side) => {
      const c = document.querySelector('.container');
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const btn = [...document.querySelectorAll('#trayButtons .glass-btn')].find((b) => b.offsetParent).getBoundingClientRect();
      const tab = document.getElementById('trayTab').getBoundingClientRect();
      const text = document.querySelector('.brand-text').getBoundingClientRect();
      const logo = document.querySelector('.brand .logo').getBoundingClientRect();
      const edge = side === 'left' ? r.left + parseFloat(cs.paddingLeft) : r.right - parseFloat(cs.paddingRight);
      return {
        gap: side === 'left' ? edge - btn.right : btn.left - edge,
        width: r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        clear: side === 'left' ? logo.left - tab.right : tab.left - text.right,
      };
    }, side);
    ok(`${side}: page ends 8px short of the tray's buttons`, Math.abs(tray.gap - 8) <= 1, `gap ${tray.gap.toFixed(1)}px, page ${tray.width.toFixed(0)}px wide`);
    ok(`${side}: the greeting keeps clear of the arrow tab`, tray.clear >= 4, `${tray.clear.toFixed(1)}px`);

    // ---- 2. the subtitle shows whole ----
    const sub = await page.evaluate(() => {
      const s = document.querySelector('.subtitle');
      const made = [...s.querySelectorAll('span')].pop() || s;
      const r = made.getBoundingClientRect();
      const box = s.getBoundingClientRect();
      return { cut: s.scrollWidth > s.clientWidth + 1, text: made.textContent.trim(), inside: r.right <= box.right + 1 && r.left >= box.left - 1, lines: Math.round(box.height / parseFloat(getComputedStyle(s).lineHeight || 16)) };
    });
    ok(`${side}: subtitle not cut off`, !sub.cut && sub.inside && /Made with/.test(sub.text) && /Augy/.test(sub.text), JSON.stringify(sub));
    await shot(page, `header-${side}`, { x: 0, y: 0, width: 360, height: 140 });

    // ---- 3. stop 17179 ----
    await page.evaluate(() => loadStop('17179'));
    await page.waitForSelector('#services .svc');
    await page.waitForTimeout(400);
    const stop = await page.evaluate(() => ({
      infinity: document.getElementById('services').textContent.includes('∞'),
      noGps: [...document.querySelectorAll('.badge-dist-na')].map((b) => b.textContent.trim()),
      nan: /NaN/.test(document.getElementById('resultCard').textContent),
      rows: document.querySelectorAll('#services .svc').length,
    }));
    const size = await fits(page);
    ok(`${side}: stop 17179 fits the screen`, size.inner === 360 && size.scroll <= 360 && size.scale === 1, JSON.stringify(size));
    ok(`${side}: no "~ ∞m", "no GPS" instead`, !stop.infinity && stop.noGps.length > 0 && stop.noGps.every((t) => t === 'no GPS'), JSON.stringify(stop));
    ok(`${side}: no NaN in the timings`, !stop.nan);
    await shot(page, `stop-17179-${side}`);
    // The services, past the incoming bar: a screenful further down.
    await page.evaluate(() => document.getElementById('services').scrollIntoView());
    await shot(page, `stop-17179-rows-${side}`);

    // ---- 4. Favourites ----
    await page.evaluate(() => { window.scrollTo(0, 0); MainScreen.open('favs'); });
    await page.waitForTimeout(500);
    const favs = await page.evaluate(() => {
      const modal = document.querySelector('#favsModal .modal').getBoundingClientRect();
      const tabs = document.getElementById('favListTabs').getBoundingClientRect();
      const nl = document.getElementById('favListNew').getBoundingClientRect();
      const chips = [...document.querySelectorAll('#favsModal .chip')].map((c) => {
        const main = c.querySelector('.chipMain');
        const x = c.querySelector('.remove').getBoundingClientRect();
        const m = main.getBoundingClientRect();
        const buses = c.querySelector('.buses');
        // Every word inside the main button within it, and so never under the cross.
        const words = [...main.querySelectorAll('span')].every((s) => {
          const r = s.getBoundingClientRect();
          return r.width === 0 || (getComputedStyle(s).overflow === 'hidden' ? true : r.right <= m.right + 0.5);
        });
        return { text: main.textContent, overlap: m.right > x.left + 0.5, words, busesWhole: !buses || buses.scrollWidth <= buses.clientWidth + 0.5 };
      });
      return {
        newInside: nl.left >= modal.left - 0.5 && nl.right <= modal.right + 0.5,
        tabsWidth: Math.round(tabs.width),
        chips,
      };
    });
    ok(`${side}: New list shows whole`, favs.newInside, JSON.stringify(favs).slice(0, 200));
    ok(`${side}: the lists' tabs keep a row of their own`, favs.tabsWidth >= 200, `${favs.tabsWidth}px`);
    ok(`${side}: no chip's words under its cross`, favs.chips.length > 0 && favs.chips.every((c) => !c.overlap && c.words), JSON.stringify(favs.chips.filter((c) => c.overlap || !c.words)));
    ok(`${side}: a stop's starred buses show whole`, favs.chips.every((c) => c.busesWhole), JSON.stringify(favs.chips.map((c) => c.text)));
    await shot(page, `favourites-${side}`);
    // In a list.
    await page.click('[data-fav-list="l1"]');
    await page.waitForTimeout(300);
    await shot(page, `favourites-list-${side}`);
    // Choose what's in it (the sync picker's rows), and Glance's menu with the lists in it.
    await page.click('[data-fav-list-pick]');
    await page.waitForTimeout(300);
    ok(`${side}: Choose what's in it fits the screen`, (await fits(page)).scroll <= 360);
    await shot(page, `favourites-pick-${side}`);
    await page.evaluate(() => MainScreen.open('glance'));
    await page.waitForTimeout(300);
    await page.click('#glanceSource');
    await page.waitForTimeout(300);
    ok(`${side}: Glance's menu fits the screen`, (await fits(page)).scroll <= 360);
    await shot(page, `glance-menu-${side}`);

    // ---- 5. Navigate to a far place ----
    const navPage = await open(context, `#nav/${FROM.lat},${FROM.lng}~${encodeURIComponent(FROM.name)}/${TO.lat},${TO.lng}~${encodeURIComponent(TO.name)}`);
    await navPage.waitForFunction(() => /way|No way/.test(document.getElementById('navBody')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    await navPage.waitForTimeout(500);
    const nav = await navPage.evaluate(() => ({
      ways: document.querySelectorAll('#navBody .journeyItem').length,
      far: [...document.querySelectorAll('#navBody .journeyWarn')].map((w) => w.textContent.trim()).filter((t) => /nearest stop/i.test(t)),
      body: document.getElementById('navBody').textContent.slice(0, 160),
    }));
    ok(`${side}: Navigate shows the way to the far place`, nav.ways > 0, nav.body);
    ok(`${side}: it says how far the nearest stop is`, nav.far.length > 0 && /The nearest stop is [\d.]+ km from where you’re going/.test(nav.far[0]), JSON.stringify(nav.far));
    const navSize = await fits(navPage);
    ok(`${side}: Navigate fits the screen`, navSize.inner === 360 && navSize.scroll <= 360, JSON.stringify(navSize));
    await shot(navPage, `navigate-far-${side}`);
    await navPage.evaluate(() => document.querySelector('#navBody .journeyList, #navBody')?.scrollIntoView());
    await shot(navPage, `navigate-far-ways-${side}`);

    await context.close();
  }

  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures && !process.env.NOCHECK ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
