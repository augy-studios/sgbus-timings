// Stops near me in Bus timings (help desk #13): the stops around you are a list on Bus timings'
// page, not a window from a pin in the Edge Tray, which is gone. Glance's Nearby still works.
//
//   node scripts/near-stops-test.cjs
//
// Needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
//
// What it checks:
//   1. The Edge Tray has no Stops near me pin, and Settings' Edge Tray buttons doesn't miss it.
//   2. With location allowed, Bus timings lists the stops near you, nearest first, by itself.
//   3. A stop tapped opens its timings in the list's place; Back to nearby stops brings it back.
//   4. A stop opened from the search hides the list, and closing it shows the list again.
//   5. Glance's Nearby still shows the stops near you.
//   6. #near (the installed app's shortcut) opens Bus timings on the list.
//   7. With location not yet allowed, the list waits for a tap on Show stops near me.
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
// Around Clementi: 17179 nearest where we stand, then 17171, then 16009 further off.
const HERE = { latitude: 1.31509, longitude: 103.76516, accuracy: 10 };
const STOPS = [
  { c: '17179', n: 'Clementi Stn Exit B', r: 'Commonwealth Ave West', la: 1.31509, lo: 103.76516 },
  { c: '17171', n: 'Clementi Stn Exit A', r: 'Clementi Ave 3', la: 1.31440, lo: 103.76390 },
  { c: '16009', n: 'Kent Ridge Ter', r: 'Kent Ridge Cres', la: 1.29452, lo: 103.76918 },
];
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

async function site(browser, { allowed, home = 'timings' }) {
  const context = await browser.newContext({
    viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, geolocation: HERE,
    permissions: allowed ? ['geolocation'] : [], serviceWorkers: 'block',
  });
  await context.addInitScript((h) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('sgbus_first_run', 'done');
    set('sgbus_tour', 'done');
    set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
    set('sgbus_start', h);
  }, home);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bus-stops') return json(STOPS);
    if (url.pathname === '/api/bus-arrivals') return json({ busStopCode: url.searchParams.get('stop'), services: [] });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  return { context, page, errors };
}

async function ready(page, hash = '') {
  await page.goto(`${ORIGIN}/${hash}`);
  await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'));
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); document.body.classList.remove('touring'); });
}

const listed = (page) => page.evaluate(() => [...document.querySelectorAll('#nearStopsBody [data-stop]')].map((b) => b.dataset.stop));
const shown = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && !el.hidden && el.getClientRects().length > 0; }, sel);

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });

  // ---- location allowed, opened on Bus timings ----
  {
    const { context, page, errors } = await site(browser, { allowed: true });
    await ready(page);
    ok('1. no Stops near me pin in the Edge Tray', await page.evaluate(() => !document.getElementById('nearMeBtn') && !document.querySelector('#trayButtons [data-icon="pin"]')));
    await page.waitForFunction(() => document.querySelectorAll('#nearStopsBody [data-stop]').length > 0, null, { timeout: 10000 }).catch(() => {});
    const codes = await listed(page);
    ok('2. Bus timings lists the stops near you by itself', await shown(page, '#nearStops') && codes.length === 3, codes.join(','));
    ok('2. nearest first', codes[0] === '17179' && codes[2] === '16009', codes.join(','));
    ok('2. no window opened for it', await page.evaluate(() => document.getElementById('stopListModal').classList.contains('hidden')));

    await page.click('#nearStopsBody [data-stop="17171"]');
    await page.waitForFunction(() => !document.getElementById('resultCard').hidden);
    ok('3. a stop tapped opens its timings', await page.evaluate(() => document.getElementById('stopCode').textContent === '17171'));
    ok('3. the list is put away meanwhile', !(await shown(page, '#nearStops')));
    ok('3. its Back says Back to nearby stops', /Back to nearby stops/.test(await page.textContent('#stopBackLabel')) && await shown(page, '#stopBackBtn'));
    await page.click('#stopBackBtn');
    await page.waitForTimeout(400);
    ok('3. Back brings the list back, the timings put away', await shown(page, '#nearStops') && await page.evaluate(() => document.getElementById('resultCard').hidden));
    ok('3. the list is still there', (await listed(page)).length === 3);

    await page.evaluate(() => loadStop('16009'));
    await page.waitForFunction(() => !document.getElementById('resultCard').hidden);
    ok('4. a stop from the search hides the list', !(await shown(page, '#nearStops')));
    await page.click('#stopCloseBtn');
    await page.waitForTimeout(400);
    ok('4. closing it shows the list again', await shown(page, '#nearStops') && (await listed(page)).length === 3);

    // Glance's Nearby, unchanged.
    await page.evaluate(() => { localStorage.setItem('sgbus_glance', 'near'); MainScreen.open('glance'); Glance.refresh?.({ ask: true }); });
    await page.waitForFunction(() => document.querySelectorAll('#glanceStops .glanceStop').length > 0, null, { timeout: 10000 }).catch(() => {});
    const glance = await page.evaluate(() => document.querySelectorAll('#glanceStops .glanceStop').length);
    ok('5. Glance\'s Nearby still shows the stops near you', glance > 0, `${glance} stops`);
    ok('5. the list stays on Bus timings only', !(await shown(page, '#nearStops')));

    const edgeTray = await page.evaluate(() => [...document.querySelectorAll('#trayExtrasPick [data-tray-show], #trayExtrasPick [data-page-show]')].map((b) => b.textContent.trim()));
    ok('1. Settings\' Edge Tray buttons unchanged', edgeTray.includes('Explorer') && !edgeTray.some((t) => /near me/i.test(t)), edgeTray.join(', '));
    ok('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- #near, opened on Glance ----
  {
    const { context, page, errors } = await site(browser, { allowed: true, home: 'glance' });
    await ready(page, '#near');
    await page.waitForFunction(() => document.querySelectorAll('#nearStopsBody [data-stop]').length > 0, null, { timeout: 10000 }).catch(() => {});
    ok('6. #near opens Bus timings on the list', await page.evaluate(() => MainScreen.active()) === 'timings' && (await listed(page)).length === 3);
    ok('6. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- location not yet allowed ----
  {
    const { context, page, errors } = await site(browser, { allowed: false });
    await ready(page);
    await page.waitForTimeout(800);
    ok('7. without location allowed, it asks first', await shown(page, '[data-near="ask"]') && (await listed(page)).length === 0);
    await context.grantPermissions(['geolocation'], { origin: ORIGIN });
    await page.click('[data-near="ask"]');
    await page.waitForFunction(() => document.querySelectorAll('#nearStopsBody [data-stop]').length > 0, null, { timeout: 10000 }).catch(() => {});
    ok('7. a tap on Show stops near me lists them', (await listed(page)).length === 3);
    ok('7. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
