// Train times on the site (js/trains.js): a station search offers them, the window lists each
// platform's next trains, a disruption marks its changes, and offline a station never opened
// still has its trains from every station's usual timetable (/api/trains-all). A platform's last
// train is said, its last three trains marked, on the window, the map's station card
// (js/map-card.js) and a Navigate ride.
//
//   node scripts/trains-test.cjs        SHOTS=<folder> also saves screenshots there
//
// Needs Playwright as scripts/near-stops-test.cjs does. No server: the page is served from
// main-site/ by Playwright itself, with /api/* answered from what's below.
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
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const STOPS = [
  { c: '75009', n: 'Tampines Int', r: 'Tampines Ctrl 1', la: 1.35406, lo: 103.94339 },
  { c: '84009', n: 'Bedok Int', r: 'Bedok Nth Dr', la: 1.32481, lo: 103.92985 },
];
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

// The service day as the API has it: Singapore's date, until 3am the day before's.
function dayNow() {
  const d = new Date(Date.now() + 8 * 3600e3);
  if (d.getUTCHours() < 3) d.setUTCDate(d.getUTCDate() - 1);
  const day = d.toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00Z`) - 8 * 3600e3;
  return { day, start, now: Math.round((Date.now() - start) / 1000) };
}

// Tampines: the East-West line both ways (one way's trains to Joo Koon or on to Tuas Link, the
// last to Tuas Link in 8 minutes) and the Downtown line towards Expo, its last two trains of the
// day in 4 and 9 minutes.
function tampines({ live = false } = {}) {
  const { day, start, now } = dayNow();
  const at = (min) => now + min * 60;
  return {
    day, start, now, live, feedAt: Math.round(Date.now() / 1000),
    platforms: [
      { id: 'EW2_A', code: 'EW2', name: 'Tampines', line: 'EW', colour: '#189E4A', platform: 'A', heads: ['Pasir Ris'], ways: [['EW1']],
        trains: [[at(2), 0, 0, live ? 2 : 0], [at(7), 0, 0, live ? 1 : 0], [at(12), 0, 0, 0], [at(17), 0, 0, 0], [at(22), 0, 0, 0], [at(27), 0, 0, 0], [at(32), 0, 0, 0]], first: [19281, 0] },
      { id: 'EW2_B', code: 'EW2', name: 'Tampines', line: 'EW', colour: '#189E4A', platform: 'B', heads: ['Joo Koon', 'Tuas Link'], ways: [['EW3', 'EW4', 'EW29'], ['EW3', 'EW4', 'EW29', 'EW33']],
        trains: [[at(3), 0, 0, 0], [at(8), 1, 1, 0], [at(13), 0, 0, 0], [at(18), 0, 0, 0], [at(23), 0, 0, 0], [at(28), 0, 0, 0]], first: [19843, 1] },
      { id: 'DT32_B', code: 'DT32', name: 'Tampines', line: 'DT', colour: '#0354A6', platform: 'B', heads: ['Expo'], ways: [['DT33', 'DT34', 'DT35']],
        trains: [[at(4), 0, 0, 0], [at(9), 0, 0, 0]], first: [22484, 0] },
    ],
  };
}

// Every station's usual trains: Bedok, every five minutes all day, every kind of day.
function everyStation() {
  const flat = [];
  for (let t = 5 * 3600; t < 24 * 3600; t += 300) flat.push(t, 0, 0);
  return {
    v: 1, made: dayNow().day, days: { wd: '', sat: '', sun: '' },
    platforms: [{ id: 'EW5_A', code: 'EW5', name: 'Bedok', parent: 'EW5', line: 'EW', colour: '#189E4A', platform: 'A', heads: ['Pasir Ris'], ways: [['EW4', 'EW3', 'EW2', 'EW1']], trains: { wd: flat, sat: flat, sun: flat } }],
  };
}

async function site(browser, api) {
  const context = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
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
    if (url.pathname === '/api/trains') {
      api.asked.push(url.searchParams.get('codes'));
      return api.trains ? json(api.trains()) : route.abort();
    }
    if (url.pathname === '/api/trains-all') return api.all ? json(api.all()) : route.abort();
    if (url.pathname === '/api/mrt-doors') return api.doors ? json(api.doors) : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
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
  await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'));
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); document.body.classList.remove('touring'); });
  await page.evaluate(() => window.MainScreen.open('timings'));
  await page.evaluate(() => StationSearch.load());
  return { context, page, errors };
}

async function search(page, text) {
  await page.fill('#q', '');
  await page.type('#q', text);
  await page.waitForSelector('#acList .acTrains', { timeout: 5000 }).catch(() => {});
}

const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
const body = (page) => page.evaluate(() => document.getElementById('trainsBody').innerText);

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });

  // ---- online, a normal day ----
  {
    const api = { asked: [], trains: () => tampines(), all: everyStation };
    const { context, page, errors } = await site(browser, api);
    await search(page, 'Tampines MRT');
    const first = await page.evaluate(() => document.querySelector('#acList .acItem')?.className || '');
    ok('1. a station search offers Train times first', /acTrains/.test(first), first);
    ok('1. it names the station', /Tampines MRT station/.test(await page.textContent('#acList .acTrains')));
    await shot(page, 'trains-search.png');
    await page.click('#acList .acTrains');
    await page.waitForFunction(() => document.querySelectorAll('#trainsBody .trainPlatform').length > 0, null, { timeout: 5000 }).catch(() => {});
    const text = await body(page);
    ok('2. it asks for every code of the station', api.asked[0] === 'DT32,EW2', api.asked.join(' | '));
    ok('2. the window is titled for the station', (await page.textContent('#trainsTitle')) === 'Trains at Tampines');
    ok('2. each platform: its line, where it goes, its platform', /Towards Pasir Ris/.test(text) && /Platform A/.test(text) && /Towards Expo/.test(text), text.slice(0, 200));
    ok('2. minutes to each train', /2 min/.test(text) && /7 min/.test(text), text.slice(0, 200));
    ok('2. a platform with trains to two places says which is which', /Joo Koon/.test(text) && /Tuas Link/.test(text));
    ok('2. says these are timetable times', /Timetable times from LTA/.test(text));
    await shot(page, 'trains-window.png');
    await page.evaluate(() => window.closeModal('trainsModal'));

    // Navigate's rides: the next trains that reach the ride's stop.
    const leg = await page.evaluate(async () => {
      const data = await Trains.load(['EW2', 'DT32']);
      const tuas = Trains.forLeg(data, 'EW33', Date.now());
      const joo = Trains.forLeg(data, 'EW29', Date.now());
      return { tuas: tuas?.trains.map((x) => x.head), joo: joo?.trains.map((x) => x.head), none: Trains.forLeg(data, 'NS1', Date.now()) };
    });
    ok('3. a ride to Tuas Link gets only the trains that go there', JSON.stringify(leg.tuas) === '["Tuas Link"]', JSON.stringify(leg));
    ok('3. a ride to Joo Koon gets both', leg.joo?.length === 3, JSON.stringify(leg));
    ok('3. nothing for a stop no train from here reaches', leg.none === null);
    const lasts = await page.evaluate(async () => {
      const data = await Trains.load(['EW2', 'DT32']);
      const tuas = Trains.forLeg(data, 'EW33', Date.now());
      const joo = Trains.forLeg(data, 'EW29', Date.now());
      const expo = Trains.forLeg(data, 'DT35', Date.now());
      return { tuas: tuas.rank, joo: joo.rank, expo: expo.rank, expoLast: expo.lastMs === data.start + data.platforms[2].trains[1][0] * 1000 };
    });
    ok('3. a ride with one train left there is on the last train', lasts.tuas === 1, JSON.stringify(lasts));
    ok('3. three or more left: no warning', lasts.joo === null, JSON.stringify(lasts));
    ok('3. two left: the 2nd last, and the last train\'s time', lasts.expo === 2 && lasts.expoLast, JSON.stringify(lasts));

    // The window's last trains: DT towards Expo has two left, so both are marked.
    await search(page, 'Tampines MRT');
    await page.click('#acList .acTrains');
    await page.waitForFunction(() => document.querySelectorAll('#trainsBody .trainPlatform').length > 0, null, { timeout: 5000 }).catch(() => {});
    const expo = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('#trainsBody .trainPlatform')].find((x) => /Expo/.test(x.textContent));
      return { line: sec.querySelector('.trainLastLine')?.textContent, red: sec.querySelector('.trainLastLine')?.classList.contains('lastThree'), ranks: [...sec.querySelectorAll('.trainRank')].map((r) => r.textContent) };
    });
    ok('4. each platform says when its last train is', /^Last train today at \d\d:\d\d$/.test(expo.line || ''), JSON.stringify(expo));
    ok('4. red once only its last three are left', expo.red === true, JSON.stringify(expo));
    ok('4. its last trains are marked', JSON.stringify(expo.ranks) === '["2nd last","Last train"]', JSON.stringify(expo));
    const pasir = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('#trainsBody .trainPlatform')].find((x) => /Pasir Ris/.test(x.textContent));
      return { red: sec.querySelector('.trainLastLine')?.classList.contains('lastThree'), ranks: sec.querySelectorAll('.trainRank').length };
    });
    ok('4. a platform with more left is neither red nor marked yet', pasir.red === false && pasir.ranks === 0, JSON.stringify(pasir));
    await shot(page, 'trains-last.png');
    await page.evaluate(() => window.closeModal('trainsModal'));

    // The map's station card, with no doors data: each platform's trains under the station.
    const card = (doorsOn) => page.evaluate(async () => {
      MapCard.open({ kind: 'station', name: 'Tampines', codes: ['EW2', 'DT32'], lat: 1.3533, lng: 103.9452 },
        { panel: document.body, ink: { toScreen: () => ({ x: 200, y: 400 }) }, onDirections() {}, onTimings() {} });
      for (let i = 0; i < 40 && !document.querySelector('.mapCard .trainCompact'); i++) await new Promise((r) => setTimeout(r, 100));
      const c = document.querySelector('.mapCard');
      return { chips: [...c.querySelectorAll('.trainChip')].map((x) => x.textContent), last: c.querySelectorAll('.trainChip.last').length, lines: [...c.querySelectorAll('.trainLastLine')].length, text: c.innerText };
    });
    const noDoors = await card();
    ok('5. the map\'s station card lists each platform\'s trains', noDoors.lines === 3 && /Towards Pasir Ris/.test(noDoors.text), noDoors.text.slice(0, 200));
    ok('5. a platform\'s last trains are red, and only those', noDoors.last === 2 && noDoors.chips.filter((c) => /last|Last/.test(c)).length === 2, JSON.stringify(noDoors.chips));
    await shot(page, 'trains-map-card.png');
    await page.evaluate(() => MapCard.close());

    ok('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- the map's station card, with the doors: each direction's page has its trains ----
  {
    const doors = { platforms: [
      { c: 'EW3', l: 'EW', d: 'EW-2', o: 1, x: [], n: 'Simei', e: 1, f: [] },
      { c: 'EW2', l: 'EW', d: 'EW-2', o: 2, x: [], n: 'Tampines', e: 1, f: [{ t: 'escalator', to: 'Exit', doors: [3, 4] }] },
      { c: 'EW1', l: 'EW', d: 'EW-2', o: 3, x: [], n: 'Pasir Ris', e: 1, f: [] },
    ] };
    const api = { asked: [], trains: () => tampines(), all: everyStation, doors };
    const { context, page, errors } = await site(browser, api);
    const got = await page.evaluate(async () => {
      MapCard.open({ kind: 'station', name: 'Tampines', codes: ['EW2', 'DT32'], lat: 1.3533, lng: 103.9452 },
        { panel: document.body, ink: { toScreen: () => ({ x: 200, y: 400 }) }, onDirections() {}, onTimings() {} });
      for (let i = 0; i < 40 && !document.querySelector('.mapCard .mcSlide .trainCompact'); i++) await new Promise((r) => setTimeout(r, 100));
      const c = document.querySelector('.mapCard');
      return { slide: c.querySelector('.mcSlide')?.innerText || '', slideChips: c.querySelectorAll('.mcSlide .trainChip').length, others: c.querySelector('.mcOthers')?.innerText || '' };
    });
    ok('6. a doors page going towards Pasir Ris has those trains', /Towards Pasir Ris/.test(got.slide) && got.slideChips === 3 && /Last train today/.test(got.slide), got.slide.slice(0, 200));
    ok('6. platforms without a doors page are listed under it', /Joo Koon/.test(got.others) && /Expo/.test(got.others), got.others.slice(0, 200));
    ok('no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- a disruption ----
  {
    const api = { asked: [], trains: () => tampines({ live: true }), all: everyStation };
    const { context, page, errors } = await site(browser, api);
    await search(page, 'Tampines MRT');
    await page.click('#acList .acTrains');
    await page.waitForFunction(() => document.querySelectorAll('#trainsBody .trainPlatform').length > 0, null, { timeout: 5000 }).catch(() => {});
    const text = await body(page);
    ok('4. a disruption says it is live', /LTA reports a disruption here/.test(text), text.slice(0, 160));
    ok('4. a cancelled train is marked', /Cancelled/.test(text) && (await page.$$('#trainsBody .trainRow.gone')).length === 1);
    ok('4. a changed time is marked', (await page.$$('#trainsBody .trainRow.changed')).length === 1);
    await shot(page, 'trains-disruption.png');
    ok('4. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- offline, at a station never opened ----
  {
    const api = { asked: [], trains: null, all: everyStation };
    const { context, page, errors } = await site(browser, api);
    await search(page, 'Bedok MRT');
    await page.click('#acList .acTrains');
    await page.waitForFunction(() => document.querySelectorAll('#trainsBody .trainPlatform').length > 0, null, { timeout: 5000 }).catch(() => {});
    const text = await body(page);
    ok('5. offline, a station never opened still has its trains', /Towards Pasir Ris/.test(text) && /min|Now/.test(text), text.slice(0, 200));
    ok('5. it says these are the usual timetable', /usual timetable/.test(text));
    await page.evaluate(() => window.closeModal('trainsModal'));

    // And with no copy of either, it says so.
    api.all = null;
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); });
    await search(page, 'Tampines MRT');
    await page.click('#acList .acTrains');
    await page.waitForFunction(() => /offline|Couldn/.test(document.getElementById('trainsBody').innerText), null, { timeout: 5000 }).catch(() => {});
    ok('6. with nothing saved it says so', /aren’t saved yet/.test(await body(page)), await body(page));
    ok('6. no page errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
