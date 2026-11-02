// Trains on a trip (js/trip.js) and the stop on the way: help desk, 2 November 2026, where a trip
// had the EW Line done and Bus 183 boarded while still on the train, then arrived while still
// waiting for the bus; Your trips (js/history.js) timed a train ride across a change of line;
// and a faster way went past the trip's stop on the way to its end.
//
//   node scripts/train-handoff-test.cjs
//
// Needs Playwright as scripts/pace-test.cjs does (PLAYWRIGHT=<path>, or a global install), and
// Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the page is served
// from main-site/ by Playwright itself, with /api/* answered below. The page's clock is moved
// on by hand, and its fixes are fed to it. Takes a minute or so: the trip's own tick, every
// 15 s, is waited for where it matters.
//
// What it checks:
//   1. A train coming in to its last station along the next bus's route, going the other way,
//      neither moves the trip on to the bus nor boards it, even with the clock at the station;
//      once the train's stopped there, the trip's on to the bus, waiting for it.
//   2. A bus taken as boarded, a stop or two on, with good fixes standing at the stop it's got
//      on at: back to waiting there, not on board.
//   3. Underground, with no fixes, the trip goes from one line to the next at the interchange
//      by the clock; and Your trips keeps that ride's time as planned, not as measured.
//   4. Your trips doesn't take a train ride's measured time far over the plan (Next tapped
//      late, a change it never saw).
//   5. A faster way, with a stop on the way still ahead, is looked for to the stop, not the end;
//      tripFromNav marks the leg after the stop with it.
//   6. No page errors.
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

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };
const M_PER_LNG = 111320 * Math.cos((1.3 * Math.PI) / 180);
const lngAt = (m) => 103.8 + m / M_PER_LNG;

async function site(browser) {
  const context = await browser.newContext({ viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('sgbus_first_run', 'done');
      set('sgbus_tour', 'done');
      set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
      set('sgbus_start', 'timings');
      set('sgbus_lang', 'en');
    }
    const real = Date.now.bind(Date);
    let ahead = 0;
    Date.now = () => real() + ahead;
    window.__later = (ms) => { ahead += ms; };
    let onFix = null;
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition: (ok) => { onFix = ok; return 1; },
      clearWatch: () => { onFix = null; },
      getCurrentPosition: () => {},
    } });
    window.__fix = (lat, lng, accuracy = 10) => onFix?.({ coords: { latitude: lat, longitude: lng, accuracy } });
  });
  const navAsked = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/nav') {
      navAsked.push({ from: url.searchParams.get('from'), to: url.searchParams.get('to') });
      return json({ options: [] });
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
  await page.waitForFunction(() => window.MainScreen && window.Trip && document.documentElement.hasAttribute('data-view'));
  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id));
    document.body.classList.remove('touring');
    if (window.LiveMap) window.LiveMap.trip = () => {};
  });
  return { context, page, errors, navAsked };
}

const state = (page) => page.evaluate(() => {
  const p = Trip.progress();
  const saved = JSON.parse(sessionStorage.getItem('sgbus.trip') || 'null');
  return p && { leg: p.legIndex, kind: p.leg.kind, stopsLeft: p.leg.stopsLeft, arrived: p.arrived, boarded: !!saved?.boarded };
});
// Fixes `every` s apart at each of `ms` metres east of 103.8° E, on 1.3005° N (the bus's road).
const fixes = (page, ms, every = 3, lat = 1.3005) => page.evaluate(({ lngs, every, lat }) => {
  for (const lng of lngs) {
    window.__later(every * 1000);
    window.__fix(lat, lng);
  }
}, { lngs: ms.map(lngAt), every, lat });
const settle = (page) => page.waitForTimeout(700);

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });

  // ---- 1. a train beside the bus's route ----
  {
    const { context, page, errors } = await site(browser);
    // The EW Line comes in from the west to its last station, at 103.8° E; Bus 183 starts at
    // the stop outside it and goes back west along the same road, under the viaduct.
    const legs = [
      { kind: 'train', label: 'EW Line', route: 'EW', to: 'Clementi', points: [[1.3, lngAt(-4000)], [1.3, lngAt(-2000)], [1.3, lngAt(0)]], names: ['Dover', 'Mid', 'Clementi'], minutes: 6, wait: 0 },
      { kind: 'bus', label: 'Bus 183', to: 'Coll of Design', service: '183', points: [0, -200, -400, -600, -800].map((m) => [1.3005, lngAt(m)]), minutes: 6, wait: 3 },
      { kind: 'walk', label: 'Walk', to: 'LT7A', points: [[1.3005, lngAt(-800)], [1.302, lngAt(-800)]], minutes: 3, wait: 0 },
    ];
    await page.evaluate((legs) => Trip.start({ title: 'To LT7A', legs, to: { label: 'LT7A', lat: 1.302, lng: legs[2].points[1][1] } }), legs);
    // Running late: the clock has the train at the station, while it's still 1.5 km out,
    // coming in at about 60 km/h along the bus's road.
    await page.evaluate(() => window.__later(8 * 60 * 1000));
    const run = [];
    for (let m = -1500; m <= -50; m += 50) run.push(m);
    await fixes(page, run);
    await settle(page);
    let s = await state(page);
    ok('1. still on the train coming in, past the bus\'s stops', s.leg === 0 && s.kind === 'train', JSON.stringify(s));
    // Stopped at the station: on to the bus, waiting for it.
    await fixes(page, Array(15).fill(0));
    await settle(page);
    s = await state(page);
    ok('1. stopped at the station: on to the bus', s.leg === 1 && s.kind === 'bus', JSON.stringify(s));
    ok('1. waiting for it, not on board', !s.boarded && s.stopsLeft === 4, JSON.stringify(s));
    // Standing at the stop for ten minutes: still waiting, never arrived.
    await fixes(page, Array(40).fill(5), 15);
    await settle(page);
    s = await state(page);
    ok('1. still waiting after ten minutes at the stop', s.leg === 1 && !s.boarded && !s.arrived && s.stopsLeft === 4, JSON.stringify(s));
    ok('6. no page errors (1)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 2. boarded, then seen standing at the stop ----
  {
    const { context, page, errors } = await site(browser);
    const legs = [
      { kind: 'bus', label: 'Bus 183', to: 'Coll of Design', service: '183', points: [0, -200, -400, -600, -800, -1000].map((m) => [1.3005, lngAt(m)]), minutes: 10, wait: 3 },
      { kind: 'walk', label: 'Walk', to: 'LT7A', points: [[1.3005, lngAt(-1000)], [1.302, lngAt(-1000)]], minutes: 3, wait: 0 },
    ];
    await page.evaluate((legs) => Trip.start({ title: 'To LT7A', legs }), legs);
    await fixes(page, [0, 0, 0, -100, -200, -300, -400]);
    await settle(page);
    let s = await state(page);
    ok('2. on board two stops on', s.boarded && s.stopsLeft <= 3, JSON.stringify(s));
    // Seen at the stop it starts at, standing there.
    await fixes(page, Array(15).fill(0));
    await settle(page);
    s = await state(page);
    ok('2. standing at the stop: waiting again', !s.boarded && s.stopsLeft === 5, JSON.stringify(s));
    ok('6. no page errors (2)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 3, 4. a change of line underground, and Your trips ----
  {
    const { context, page, errors } = await site(browser);
    const legs = [
      { kind: 'train', label: 'DT Line', route: 'DT', to: 'Stevens', points: [[1.32, 103.78], [1.32, 103.80], [1.32, 103.82]], names: ['Sixth Avenue', 'Botanic Gardens', 'Stevens'], minutes: 6, wait: 3 },
      { kind: 'train', label: 'TE Line', route: 'TE', to: 'Orchard', points: [[1.32, 103.82], [1.31, 103.83], [1.30, 103.83]], names: ['Stevens', 'Napier', 'Orchard'], minutes: 5, wait: 3 },
      { kind: 'walk', label: 'Walk', to: 'ION', points: [[1.30, 103.83], [1.302, 103.832]], minutes: 3, wait: 0 },
    ];
    await page.evaluate((legs) => Trip.start({ title: 'To Orchard', legs }), legs);
    await page.evaluate(() => window.__later(10 * 60 * 1000));
    // The trip's own tick, every 15 s, goes by the clock with no fix.
    await page.waitForTimeout(16000);
    let s = await state(page);
    ok('3. on to the TE Line at the change, by the clock', s.leg === 1 && s.kind === 'train', JSON.stringify(s));
    // Next, by hand, twenty minutes on, for a ride of five: Your trips.
    await page.evaluate(() => window.__later(20 * 60 * 1000));
    await page.evaluate(() => document.getElementById('tripNext').click());
    await page.evaluate(() => Trip.stop());
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('sgbus_trips') || '[]')[0]);
    const dt = kept?.legs?.[0];
    const te = kept?.legs?.[1];
    ok('3. the DT ride kept as planned, the clock having ended it', dt && dt.route === 'DT' && dt.rideMeasured === false && dt.rideMin === 6, JSON.stringify(dt));
    ok('4. the TE ride\'s 20 min not taken for its 5', te && te.route === 'TE' && te.rideMeasured === false, JSON.stringify(te));
    ok('6. no page errors (3)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 5. a faster way, with a stop on the way ----
  {
    const { context, page, errors, navAsked } = await site(browser);
    const via = { label: 'Haw Par Villa', lat: 1.2825, lng: 103.782 };
    // tripFromNav marks the leg after the stop.
    const marked = await page.evaluate((via) => {
      nav.via = via;
      const place = (lat, lng, extra = {}) => ({ kind: 'place', lat, lng, ...extra });
      const o = {
        minutes: 60,
        via: { leg: 2, minutes: 25 },
        legs: [
          { mode: 'bus', route: '188', from: { code: '16149', lat: 1.30, lng: 103.77 }, to: { code: '16019', lat: 1.2830, lng: 103.7815 }, path: [[1.30, 103.77], [1.2830, 103.7815]], names: ['SDE3', 'Haw Par Villa Stn'], minutes: 20, wait: 5 },
          { mode: 'walk', from: { code: '16019', lat: 1.2830, lng: 103.7815 }, to: place(via.lat, via.lng, { via: true }), minutes: 3, metres: 200 },
          { mode: 'walk', from: place(via.lat, via.lng, { via: true }), to: { code: '16011', lat: 1.2820, lng: 103.7810 }, minutes: 3, metres: 200 },
          { mode: 'bus', route: '30', from: { code: '16011', lat: 1.2820, lng: 103.7810 }, to: { code: '84009', lat: 1.324, lng: 103.93 }, path: [[1.2820, 103.7810], [1.324, 103.93]], names: ['Opp Haw Par Villa', 'Bedok Int'], minutes: 30, wait: 5 },
        ],
      };
      const t = tripFromNav(o, { label: 'Bedok Int', lat: 1.324, lng: 103.93 }, { label: 'SDE3', lat: 1.30, lng: 103.77 });
      Trip.start(t);
      return t.legs.map((l) => l.afterVia?.label || '');
    }, via);
    ok('5. the leg after the stop marked with it', marked.indexOf('Haw Par Villa') !== -1 && marked.filter(Boolean).length === 1, JSON.stringify(marked));
    // The trip's first tick looks for a faster way.
    await page.waitForTimeout(16000);
    const to = navAsked[0]?.to;
    ok('5. a faster way looked for to the stop, not the end', to === `${via.lat.toFixed(5)},${via.lng.toFixed(5)}`, JSON.stringify(navAsked));
    ok('6. no page errors (5)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
