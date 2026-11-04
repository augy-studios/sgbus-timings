// Glance on a list from Favourites with more than four stops (bug report 20261104-ZGP2: a stop
// added to "From Engi", its fifth, never showed on Glance). Saved stops and a list's are ones you
// picked, so Glance shows every one of them, up to twelve; Nearby stays the nearest four.
//
//   node scripts/glance-list-test.cjs
//
// Needs Playwright as scripts/bus-times-test.cjs does (PLAYWRIGHT=, CHROME= the same). No server:
// the page is served from main-site/ by Playwright itself, with /api/* answered from below.
//
// What it checks:
//   1. A list of six stops: all six cards on Glance, in the order they were put in the list.
//   2. A seventh stop added to the list shows at once (Favourites calls Glance.favsChanged).
//   3. Saved stops: all six too.
//   4. Nearby: still the nearest four.
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
const HERE = { latitude: 1.2990, longitude: 103.7710, accuracy: 10 };
// Seven stops around NUS, the last NUS Raffles Hall (bus 151) as in the report.
const STOPS = [
  { c: '18331', n: 'Kent Ridge Stn Exit A', r: 'S Buona Vista Rd', la: 1.29400, lo: 103.78470 },
  { c: '18311', n: 'NUH', r: 'Lower Kent Ridge Rd', la: 1.29640, lo: 103.78340 },
  { c: '16189', n: 'SDE3', r: 'Engineering Dr 1', la: 1.29780, lo: 103.77060 },
  { c: '16179', n: 'Coll of Design & Engrg', r: 'Engineering Dr 1', la: 1.29900, lo: 103.77150 },
  { c: '18329', n: 'Opp Kent Ridge Stn', r: 'S Buona Vista Rd', la: 1.29420, lo: 103.78490 },
  { c: '16009', n: 'NUS Raffles Hall', r: 'Kent Ridge Cres', la: 1.30080, lo: 103.77280 },
  { c: '16149', n: 'Opp Yusof Ishak Hse', r: 'Kent Ridge Cres', la: 1.29890, lo: 103.77450 },
];
const FIRST_SIX = STOPS.slice(0, 6).map((s) => s.c);
const bus = (ms) => ({ eta_ms: ms, load: 'SEA', wheelchair: true, deck: 'Double', lat: null, lng: null, rough: false, origin: '17009', dest: '17009', visit: null });
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const context = await browser.newContext({
    viewport: { width: 354, height: 708 }, isMobile: true, hasTouch: true, geolocation: HERE,
    permissions: ['geolocation'], serviceWorkers: 'block',
  });
  await context.addInitScript((six) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('sgbus_first_run', 'done');
    set('sgbus_tour', 'done');
    set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
    set('sgbus_start', 'glance');
    set('sgbus_favs_v2', six.map((code) => ({ code })));
    set('sgbus_fav_lists', [{ id: 'engi', name: 'From Engi', items: six.map((c) => `stop:${c}`) }]);
    set('sgbus_glance', 'list:engi');
  }, FIRST_SIX);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bus-stops') return json(STOPS);
    if (url.pathname === '/api/bus-arrivals') {
      const code = url.searchParams.get('code') || url.searchParams.get('busStopCode') || '';
      return json({ busStopCode: code, services: [{ serviceNo: '151', operator: 'SBST', next: bus(185000), next2: bus(605000), next3: null }] });
    }
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
  await page.waitForFunction(() => window.MainScreen && window.Glance && document.documentElement.hasAttribute('data-view'));
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); MainScreen.open('glance'); });
  const cards = () => page.evaluate(() => [...document.querySelectorAll('#glanceStops .glanceStopHead')].map((b) => b.dataset.stop));
  const waitCards = (n) => page.waitForFunction((k) => document.querySelectorAll('#glanceStops .glanceStopHead').length === k, n, { timeout: 10000 }).catch(() => {});

  await page.evaluate(() => Glance.refresh());
  await waitCards(6);
  let got = await cards();
  ok('1. a list of six: six cards', got.length === 6, got.join(','));
  ok('1. in the order put in the list, NUS Raffles Hall among them', JSON.stringify(got) === JSON.stringify(FIRST_SIX), got.join(','));
  ok('1. on the chip: From Engi', /From Engi/.test(await page.textContent('#glanceSource')));
  ok('1. each card has its bus 151', await page.evaluate(() => [...document.querySelectorAll('#glanceStops .glanceStop')].every((c) => /151/.test(c.textContent))));

  await page.evaluate(() => {
    const lists = LS.getFavLists();
    lists[0].items.push('stop:16149');
    LS.setFavLists(lists);
    Glance.favsChanged();
  });
  await waitCards(7);
  got = await cards();
  ok('2. a seventh stop added shows at once', got.length === 7 && got[6] === '16149', got.join(','));

  const pickSource = async (key) => {
    await page.click('#glanceSource');
    await page.click(`#glanceMenu [data-source="${key}"]`);
  };
  await pickSource('saved');
  await page.waitForFunction(() => /Saved stops/.test(document.querySelector('#glanceSource')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  await waitCards(6);
  got = await cards();
  ok('3. saved stops: all six', got.length === 6, got.join(','));

  await pickSource('near');
  await page.waitForFunction(() => /Nearby/.test(document.querySelector('#glanceSource')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  await waitCards(4);
  got = await cards();
  ok('4. Nearby: still the nearest four', got.length === 4, got.join(','));

  ok('no errors on the page', !errors.length, errors.join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
