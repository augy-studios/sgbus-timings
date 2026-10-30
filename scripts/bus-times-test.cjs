// Settings' Bus times: each bus as how long till it comes ("3 mins 5s") or as the time it comes
// by Singapore's clock ("14:32"), on every bus timing in the web app.
//
//   node scripts/bus-times-test.cjs
//
// Needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
//
// What it checks:
//   1. Settings has Bus times, on Minutes and seconds to start with.
//   2. A stop's timings and its incoming buses bar count down, as before.
//   3. Clock time turns them into the time each bus comes, at once, and marks the page.
//   4. Glance shows clock times too, and says so.
//   5. So does the departures board, with its footer saying so.
//   6. It's kept over a reload, and sync reads it as "clock".
//   7. Minutes and seconds puts the countdown back.
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
const HERE = { latitude: 1.31509, longitude: 103.76516, accuracy: 10 };
const STOPS = [{ c: '17179', n: 'Clementi Stn Exit B', r: 'Commonwealth Ave West', la: 1.31509, lo: 103.76516 }];
// Bus 96 in 3 min 5 s, then 10 min 5 s; bus 185 in 7 min.
const bus = (ms) => ({ eta_ms: ms, load: 'SEA', wheelchair: true, deck: 'Double', lat: null, lng: null, rough: false, origin: '17009', dest: '17009', visit: null });
const ARRIVALS = {
  busStopCode: '17179',
  services: [
    { serviceNo: '96', operator: 'SBST', next: bus(185000), next2: bus(605000), next3: null },
    { serviceNo: '185', operator: 'SBST', next: bus(420000), next2: null, next3: null },
  ],
};
const CLOCK = /^\d{2}:\d{2}$/;
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const context = await browser.newContext({
    viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, geolocation: HERE,
    permissions: ['geolocation'], serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('sgbus_first_run', 'done');
    set('sgbus_tour', 'done');
    set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
    set('sgbus_start', 'timings');
  });
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bus-stops') return json(STOPS);
    if (url.pathname === '/api/bus-arrivals') return json(ARRIVALS);
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));

  const ready = async (hash = '') => {
    await page.goto(`${ORIGIN}/${hash}`);
    await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'));
    await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); document.body.classList.remove('touring'); });
  };
  const openStop = async () => {
    await page.evaluate(() => loadStop('17179'));
    await page.waitForFunction(() => document.querySelectorAll('#services .eta strong').length >= 3, null, { timeout: 10000 });
  };
  const etas = () => page.evaluate(() => [...document.querySelectorAll('#services .eta strong')].map((e) => e.textContent.trim()));
  const incoming = () => page.evaluate(() => [...document.querySelectorAll('#incomingBuses .incomingBusTime')].map((e) => e.firstChild.textContent.trim()));
  const pick = (v) => page.evaluate((x) => document.querySelector(`[data-times="${x}"]`).click(), v);
  const pressed = () => page.evaluate(() => [...document.querySelectorAll('[data-times]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.times));
  // The clock time `ms` from now, as the page has it, give or take the minute ticking over.
  const near = (shown, ms) => page.evaluate(([s, m]) => [When.clock(Date.now() + m - 60000), When.clock(Date.now() + m), When.clock(Date.now() + m + 60000)].includes(s), [shown, ms]);

  await ready();
  ok('1. Settings has Bus times', await page.evaluate(() => !!document.querySelector('[data-i18n="settings.bus_times"]') && document.querySelectorAll('[data-times]').length === 2));
  ok('1. on Minutes and seconds to start with', JSON.stringify(await pressed()) === '["mins"]', (await pressed()).join(','));

  await openStop();
  let shown = await etas();
  ok('2. the timings count down', shown[0] === '3 mins 5s' && shown[1] === '10 mins 5s', shown.join(' / '));
  let bar = await incoming();
  ok('2. so does the incoming buses bar', bar[0] === '3 min', bar.join(' / '));

  await pick('clock');
  shown = await etas();
  ok('3. Clock time: the timings are clock times', shown.filter((t) => t !== '-').every((t) => CLOCK.test(t)), shown.join(' / '));
  ok('3. the time each bus comes', await near(shown[0], 185000) && await near(shown[1], 605000), shown.join(' / '));
  bar = await incoming();
  ok('3. the incoming buses bar too', bar.length && bar.every((t) => CLOCK.test(t)), bar.join(' / '));
  ok('3. the page is marked', await page.evaluate(() => document.documentElement.hasAttribute('data-clock-times')));
  ok('3. its button is pressed', JSON.stringify(await pressed()) === '["clock"]');

  await page.evaluate(() => { localStorage.setItem('sgbus_glance', 'near'); MainScreen.open('glance'); Glance.refresh?.({ ask: true }); });
  await page.waitForFunction(() => document.querySelectorAll('#glanceStops .glanceTimes > span').length > 0, null, { timeout: 10000 }).catch(() => {});
  const glance = await page.evaluate(() => [...document.querySelectorAll('#glanceStops .glanceTimes > span')].map((e) => e.textContent.trim()).filter(Boolean));
  ok('4. Glance shows clock times', glance.length && glance.every((t) => CLOCK.test(t)), glance.join(' / '));
  ok('4. its big answer too', /at \d{2}:\d{2}/.test(await page.textContent('#glanceHero')), (await page.textContent('#glanceHero')).trim());
  ok('4. and says so', (await page.textContent('#glanceUpdated')).trim() === 'Clock times');
  const glanceFit = await page.evaluate(() => [...document.querySelectorAll('#glanceStops .glanceTimes > span')].every((e) => e.scrollWidth <= e.clientWidth + 1));
  ok('4. the clock times fit their columns', glanceFit);

  await page.evaluate(() => Board.open('17179'));
  await page.waitForFunction(() => document.querySelectorAll('#boardRows .boardEta span').length > 0, null, { timeout: 10000 }).catch(() => {});
  const board = await page.evaluate(() => [...document.querySelectorAll('#boardRows .boardEta span')].map((e) => e.textContent.trim()));
  ok('5. the board shows clock times', board.length && board.every((t) => CLOCK.test(t)), board.join(' / '));
  ok('5. its footer says so', (await page.textContent('#boardUnit')).trim() === 'Clock times');
  const boardFit = await page.evaluate(() => [...document.querySelectorAll('#boardRows .boardEta')].every((e) => e.scrollWidth <= e.clientWidth + 1));
  ok('5. the clock times fit its columns', boardFit);
  await page.evaluate(() => Board.close?.());

  await ready();
  ok('6. kept over a reload', JSON.stringify(await pressed()) === '["clock"]' && await page.evaluate(() => document.documentElement.hasAttribute('data-clock-times')));
  ok('6. sync reads it as clock', await page.evaluate(() => SYNC_SETTINGS['bus.times'].get()) === 'clock');
  await openStop();
  ok('6. the timings still clock times', (await etas()).filter((t) => t !== '-').every((t) => CLOCK.test(t)));

  await pick('mins');
  shown = await etas();
  ok('7. Minutes and seconds puts the countdown back', shown[0] === '3 mins 5s', shown.join(' / '));
  ok('7. the page unmarked', await page.evaluate(() => !document.documentElement.hasAttribute('data-clock-times')));
  ok('7. sync reads it as mins', await page.evaluate(() => SYNC_SETTINGS['bus.times'].get()) === 'mins');

  ok('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})();
