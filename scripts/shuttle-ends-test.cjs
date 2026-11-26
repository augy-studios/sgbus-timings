// A shuttle bus service that's ending (help desk #22), in the page, in Chrome under Playwright,
// at moments set on the page's clock: IKEA's shuttles run their last day on 31 December 2026
// (data/campus/shuttles.json, `ends`). The logic is scripts/shuttle-ends-test.mjs's; this is
// what the page shows of it (js/nav.js, js/trip.js, js/campus.js, script.js).
//
//   node scripts/shuttle-ends-test.cjs
//   SHOTS=<folder> node scripts/shuttle-ends-test.cjs     also saves screenshots there
//
// Needs Playwright as scripts/layers-test.cjs does (PLAYWRIGHT=<path>, or a global install), and
// Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the page is served
// from main-site/ by Playwright itself, and /api/nav answers with two ways from Serangoon MRT to
// IKEA Tampines, one on IKEA S (its leg's `campus.ends` as the API sends it) and one on bus 53.
//
// What it checks:
//   1. 31 Dec 2026, 18:00: Navigate's list says IKEA's shuttle bus service ends on 31 Dec 2026
//      under the IKEA way only; the way's page says it first, above the rest; a trip started from
//      it says it at the top of its timeline. Bus timings at IKEA Tampines has its times, not
//      Discontinued.
//   2. 1 Jan 2027, 10:00: the same way (as an old copy of the API might still send it) says
//      nothing; Bus timings at IKEA Tampines says Discontinued for both routes, with no live
//      times asked for; IKEA S's own window says Discontinued and nothing after it.
//   3. In Chinese, the notice and Discontinued are in Chinese, the date too.
//   4. No page errors.
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
const SHOTS = process.env.SHOTS && path.resolve(process.env.SHOTS);
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ZH = JSON.parse(fs.readFileSync(path.join(SITE, 'i18n/zh-SG.json'), 'utf8'));
const NOTICE = "IKEA's shuttle bus service ends on 31 Dec 2026.";

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

const FROM = { label: 'Serangoon MRT', lat: 1.351257, lng: 103.872718 };
const TO = { label: 'IKEA Tampines', lat: 1.37405, lng: 103.93255 };
const enc = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}~${encodeURIComponent(p.label)}`;
const place = (kind, code, name, lat, lng) => ({ kind, code, name, lat, lng });
const SERANGOON = place('stop', 'ikea-serangoon-mrt', 'Serangoon Stn Exit E', 1.351257, 103.872718);
const IKEA = place('stop', 'ikea-tampines', 'IKEA Tampines', 1.374015, 103.932576);
// /api/nav's two ways, in its shape (js/nav-core/router.js).
const WAYS = [
  {
    minutes: 57, mix: 'B', routes: ['IKEA S'],
    legs: [
      { mode: 'bus', route: 'IKEA S', towards: 'Serangoon Stn Exit E', from: SERANGOON, to: IKEA, stops: 1, minutes: 28, wait: 30, board: 30,
        path: [[SERANGOON.lat, SERANGOON.lng], [IKEA.lat, IKEA.lng]], names: [SERANGOON.name, IKEA.name], dir: undefined, codes: [SERANGOON.code, IKEA.code],
        campus: { uni: 'ikea', name: 'IKEA', colour: '#0058a3', label: 'IKEA Tampines shuttle, Serangoon MRT', fare: 'free', fareText: '', access: 'public', place: [], ends: '2026-12-31' } },
      { mode: 'walk', metres: 40, minutes: 1, to: { kind: 'place' } },
    ],
  },
  {
    minutes: 60, mix: 'B', routes: ['53'],
    legs: [
      { mode: 'walk', metres: 81, minutes: 1, to: place('stop', '66359', "S'goon Stn Exit C/Blk 201", 1.35063, 103.87299) },
      { mode: 'bus', route: '53', towards: 'Bishan Int', from: place('stop', '66359', "S'goon Stn Exit C/Blk 201", 1.35063, 103.87299), to: place('stop', '77339', 'Opp Blk 756', 1.3727, 103.9341), stops: 14, minutes: 32, wait: 5, board: 6,
        path: [[1.35063, 103.87299], [1.3727, 103.9341]], names: ["S'goon Stn Exit C/Blk 201", 'Opp Blk 756'], codes: ['66359', '77339'] },
      { mode: 'walk', metres: 443, minutes: 7, to: { kind: 'place' } },
    ],
  },
];

async function site(browser, { at, lang = 'en' }) {
  const context = await browser.newContext({ viewport: { width: 400, height: 1400 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-SG', timezoneId: 'Europe/London' });
  await context.clock.setFixedTime(new Date(at));
  await context.addInitScript((lang) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('sgbus_first_run', 'done');
    set('sgbus_tour', 'done');
    set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
    set('sgbus_retrofit', { at: 0, trips: 0, coins: 0, feats: [] });
    set('sgbus_lang', lang);
  }, lang);
  const asked = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/nav') return json({ options: WAYS, onemap: false, alerts: { lines: [] }, others: {}, when: { mode: 'leave', ms: Date.parse(at) } });
    if (url.pathname === '/api/shuttle-live') {
      asked.push(url.search);
      return json({ eta: 4, buses: [] });
    }
    if (url.pathname === '/api/bus-stops') return json([]);
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
  await page.waitForFunction(() => window.MainScreen && window.I18n && window.Campus && document.documentElement.hasAttribute('data-view'));
  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id));
    document.body.classList.remove('touring');
  });
  return { context, page, errors, asked };
}

const shot = async (page, name, sel) => {
  if (SHOTS) await page.locator(sel).first().screenshot({ path: path.join(SHOTS, name) });
};
const navTo = async (page) => {
  await page.evaluate((h) => { location.hash = h; }, `#nav/${enc(FROM)}/${enc(TO)}`);
  await page.waitForSelector('#navBody [data-nav-option]', { timeout: 20000 });
};
// Each way in the list: its first ride and the notices under it.
const listed = (page) => page.$$eval('#navBody .journeyItem', (els) => els.map((el) => ({
  ride: el.querySelector('.journeyBuses')?.textContent.trim(),
  ends: [...el.querySelectorAll('.shuttleEnds')].map((x) => x.textContent.trim()),
})));
const ikeaIndex = (page) => page.$$eval('#navBody .journeyItem', (els) => els.find((el) => /IKEA S/.test(el.textContent))?.dataset.navOption);
const campusRows = (page) => page.$$eval('#campusSvc .campusRow', (els) => els.map((el) => ({ no: el.querySelector('.campusNo').textContent, main: el.querySelector('strong').textContent, live: el.hasAttribute('data-live-route'), cls: el.className })));

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  // ---- 1. Its last day ----
  {
    const { context, page, errors } = await site(browser, { at: '2026-12-31T18:00:00+08:00' });
    await navTo(page);
    const list = await listed(page);
    const ikea = list.find((w) => /IKEA S/.test(w.ride));
    const other = list.find((w) => !/IKEA/.test(w.ride));
    ok('1. the list: the IKEA way says when it ends', ikea?.ends.join() === NOTICE, JSON.stringify(list));
    ok('1. …and the other way says nothing', other && other.ends.length === 0, JSON.stringify(list));
    await shot(page, '1-list.png', '#navSection .card');
    await page.click(`#navBody [data-nav-option="${await ikeaIndex(page)}"]`);
    await page.waitForSelector('#navBody .plannerNav', { timeout: 10000 });
    const top = await page.evaluate(() => {
      const nav = document.querySelector('#navBody .plannerNav');
      const next = nav?.nextElementSibling;
      return { cls: next?.className || '', text: next?.textContent.trim() || '', count: document.querySelectorAll('#navBody .shuttleEnds').length };
    });
    ok("1. the way's page: the notice first, under its buttons, once", top.cls.includes('shuttleEnds') && top.text === NOTICE && top.count === 1, JSON.stringify(top));
    await shot(page, '1-way.png', '#navSection .card');
    await page.click('#navBody [data-nav-action="trip"]');
    await page.waitForFunction(() => !document.getElementById('tripBar').classList.contains('hidden'), null, { timeout: 10000 });
    await page.click('#tripToggle');
    await page.waitForSelector('#tripTimeline .tlLeg', { timeout: 10000 });
    const tl = await page.evaluate(() => {
      const first = document.querySelector('#tripTimeline').firstElementChild;
      return { cls: first?.className || '', text: first?.textContent.trim() || '' };
    });
    ok("1. the trip: the notice at the top of its timeline", tl.cls === 'tlEnds' && tl.text === NOTICE, JSON.stringify(tl));
    await shot(page, '1-trip.png', '#tripBar');
    await page.evaluate(() => Trip.stop?.());
    await page.evaluate(() => Campus.load().then(() => loadStop('ikea-tampines')));
    await page.waitForFunction(() => document.querySelectorAll('#campusSvc .campusRow').length === 2, null, { timeout: 10000 });
    const rows = await campusRows(page);
    ok('1. Bus timings at IKEA Tampines: its times, live where seen, not Discontinued', rows.length === 2 && rows.every((r) => r.main !== 'Discontinued' && r.live), JSON.stringify(rows));
    ok('1. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 2. The day after ----
  {
    const { context, page, errors, asked } = await site(browser, { at: '2027-01-01T10:00:00+08:00' });
    await navTo(page);
    const list = await listed(page);
    ok('2. the list: no notice, even on a way an old API sent on it', list.every((w) => w.ends.length === 0), JSON.stringify(list));
    await page.click(`#navBody [data-nav-option="${await ikeaIndex(page)}"]`);
    await page.waitForSelector('#navBody .plannerNav', { timeout: 10000 });
    ok("2. the way's page: no notice", await page.evaluate(() => !document.querySelector('#navBody .shuttleEnds')));
    await page.evaluate(() => Campus.load().then(() => loadStop('ikea-tampines')));
    await page.waitForFunction(() => document.querySelectorAll('#campusSvc .campusRow').length === 2, null, { timeout: 10000 });
    await page.waitForTimeout(500);
    const rows = await campusRows(page);
    ok('2. Bus timings at IKEA Tampines: Discontinued, both, greyed', rows.length === 2 && rows.every((r) => r.main === 'Discontinued' && !r.live && /\boff\b/.test(r.cls) && /\bended\b/.test(r.cls)), JSON.stringify(rows));
    const sub = await page.$$eval('#campusSvc .campusWhen > span:not(.campusLive)', (els) => els.map((e) => e.textContent));
    ok('2. …with only whose they are under it', sub.every((t) => t === 'IKEA'), JSON.stringify(sub));
    ok('2. no live times asked for', asked.length === 0, asked.join(' '));
    await shot(page, '2-timings.png', '#resultCard');
    await page.evaluate(() => openCampusRoute('ikea:IKEA S'));
    await page.waitForFunction(() => !document.getElementById('campusRouteModal').classList.contains('hidden'));
    ok("2. IKEA S's window: Discontinued, and nothing after it", (await page.textContent('#campusRouteNow')).trim() === 'Discontinued');
    ok('2. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 3. In Chinese ----
  {
    const { context, page, errors } = await site(browser, { at: '2026-12-31T18:00:00+08:00', lang: 'zh-SG' });
    await navTo(page);
    const date = new Date('2026-12-31T12:00:00+08:00').toLocaleDateString('zh-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
    const want = ZH['nav.shuttle.ends'].replace('{name}', 'IKEA').replace('{date}', date);
    const ikea = (await listed(page)).find((w) => /IKEA S/.test(w.ride));
    ok('3. the notice in Chinese, its date too', ikea?.ends.join() === want && !/Dec/.test(want), `${ikea?.ends.join()} / ${want}`);
    ok('3. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    const { context, page } = await site(browser, { at: '2027-01-01T10:00:00+08:00', lang: 'zh-SG' });
    await page.evaluate(() => Campus.load().then(() => loadStop('ikea-tampines')));
    await page.waitForFunction(() => document.querySelectorAll('#campusSvc .campusRow').length === 2, null, { timeout: 10000 });
    ok('3. Discontinued in Chinese', (await campusRows(page)).every((r) => r.main === ZH['campus.discontinued']));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
