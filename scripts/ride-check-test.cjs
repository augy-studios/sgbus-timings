// Tests that only rides really taken count towards the secret colours (help desk #6,
// main-site/js/rides.js): the page runs in Chrome under Playwright, from this checkout, with the
// phone's location and the clock moved along by hand, as a trip would.
//
//   node scripts/ride-check-test.cjs
//
// Needs Playwright, as docs-site/screenshots does: `npm i -g playwright` (or PLAYWRIGHT=<path
// to a playwright or playwright-core folder>), and Chromium where Playwright finds it, or
// CHROME=<path to Chrome>. No server: the page is served from main-site/ by Playwright itself,
// and /api/* answers "not found", so nothing live is asked.
//
// What it checks:
//   1. A genuine ride (seen at the start, along the way and at the end, taking about as long
//      as it should) counts, by its line; the Changi Airport branch (CG) counts as EW.
//   2. A ride with no movement (still at the start when the trip's ended) doesn't.
//   3. A ride gone through too fast (at the end a few seconds after the start) doesn't.
//   4. A bus ride seen only at its ends, never along the way, doesn't.
//   5. A ride with no location at all doesn't.
//   6. Your colours unlock only once every MRT and LRT line has a genuine ride, and the
//      window saying so shows; eight lines, or a ninth gone through too fast, don't unlock it.
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

const SITE = path.resolve(__dirname, '../main-site');
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let failures = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`);
  if (!cond) failures++;
}

// Stations in order along a line, from the rail data the site uses.
const rail = JSON.parse(fs.readFileSync(path.join(SITE, 'data/rail-stations.json'), 'utf8')).stations;
function stretch(line, from = 1, count = 4) {
  const num = (c) => Number(c.slice(line.length).replace(/\D.*$/, ''));
  const on = rail
    .map((s) => ({ s, code: s.codes.find((c) => c.startsWith(line) && /^\d+$/.test(c.slice(line.length))) }))
    .filter((x) => x.code)
    .sort((a, b) => num(a.code) - num(b.code));
  const start = Math.max(0, on.findIndex((x) => num(x.code) >= from));
  return on.slice(start, start + count).map((x) => ({ name: x.s.name, at: [x.s.lat, x.s.lng] }));
}

const trainLeg = (line, stops, minutesPerStop = 2.5) => ({
  kind: 'train', label: `${line} Line`, route: line, lrt: ['BP', 'SK', 'PG'].includes(line),
  points: stops.map((s) => s.at), names: stops.map((s) => s.name), to: stops[stops.length - 1].name,
  minutes: (stops.length - 1) * minutesPerStop, wait: 0, walkAfter: 0,
});

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const errors = [];

  // A fresh page: storage empty unless `keep`, location at `at`, the clock in our hands.
  async function fresh(context) {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.clock.install({ time: new Date('2026-10-28T09:00:00+08:00') });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => window.Trip && window.RideCheck && window.MainScreen);
    // The first open's choice and the tour, out of the way.
    await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal(m.id)); document.body.classList.remove('touring'); });
    return page;
  }

  async function newContext(at) {
    const context = await browser.newContext({ geolocation: { latitude: at[0], longitude: at[1], accuracy: 20 }, permissions: ['geolocation'], serviceWorkers: 'block' });
    await context.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    // Anything else (map tiles, fonts, analytics): nothing.
    await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
    return context;
  }

  const go = (context, at) => context.setGeolocation({ latitude: at[0], longitude: at[1], accuracy: 20 });
  const wait = (page, ms) => page.clock.runFor(ms);

  // Rides `leg` for real: at the start a minute, then each stop after the time it takes.
  async function rideGenuinely(page, context, leg) {
    await go(context, leg.points[0]);
    await page.evaluate((l) => Trip.start({ title: 'Test', legs: [l] }), leg);
    await wait(page, 60 * 1000);
    await go(context, leg.points[0]);
    await wait(page, 2000);
    const step = (leg.minutes * 60000) / (leg.points.length - 1);
    for (let k = 1; k < leg.points.length; k++) {
      await wait(page, step);
      await go(context, leg.points[k]);
      await wait(page, 3000);
    }
    await wait(page, 5000);
    await page.evaluate(() => Trip.active() && Trip.stop());
  }

  const lineCount = (page, line) => page.evaluate((l) => RideCheck.record().lines[l]?.n || 0, line);

  // ---- 1. a genuine ride counts; CG as EW ----
  {
    const leg = trainLeg('EW', stretch('EW', 20));
    const context = await newContext(leg.points[0]);
    const page = await fresh(context);
    await rideGenuinely(page, context, leg);
    ok('genuine EW ride counts', (await lineCount(page, 'EW')) === 1, JSON.stringify(await page.evaluate(() => RideCheck.record().lines)));
    const cg = trainLeg('CG', stretch('CG', 1, 2), 4);
    await rideGenuinely(page, context, cg);
    ok('CG branch counts as EW', (await lineCount(page, 'EW')) === 2 && (await lineCount(page, 'CG')) === 0);
    await context.close();
  }

  // ---- 2. no movement ----
  {
    const leg = trainLeg('NS', stretch('NS', 10));
    const context = await newContext(leg.points[0]);
    const page = await fresh(context);
    await page.evaluate((l) => Trip.start({ title: 'Test', legs: [l] }), leg);
    for (let i = 0; i < 6; i++) {
      await wait(page, 2 * 60 * 1000);
      await go(context, leg.points[0]);
    }
    await page.evaluate(() => Trip.stop());
    ok('no movement does not count', (await lineCount(page, 'NS')) === 0);
    await context.close();
  }

  // ---- 3. too fast ----
  {
    const leg = trainLeg('NE', stretch('NE', 3));
    const context = await newContext(leg.points[0]);
    const page = await fresh(context);
    await page.evaluate((l) => Trip.start({ title: 'Test', legs: [l] }), leg);
    await wait(page, 2000);
    for (let k = 1; k < leg.points.length; k++) {
      await go(context, leg.points[k]);
      await wait(page, 4000);
    }
    await wait(page, 5000);
    const seen = await page.evaluate(() => (window.Trip.active() ? null : 'ended'));
    await page.evaluate(() => Trip.active() && Trip.stop());
    ok('too fast does not count', (await lineCount(page, 'NE')) === 0, seen || '');
    await context.close();
  }

  // ---- 4. a bus seen only at its ends ----
  {
    const stops = stretch('DT', 1, 6);
    const context = await newContext(stops[0].at);
    const page = await fresh(context);
    const verdict = await page.evaluate((st) => {
      const leg = { kind: 'bus', label: 'Bus 975', service: '975', points: st.map((s) => s.at), minutes: 15 };
      const t0 = Date.now();
      return RideCheck.verdict(leg, { startAt: t0, endAt: t0 + 15 * 60000, along: [] });
    }, stops);
    ok('bus not seen along the way does not count', !verdict.ok && /along/.test(verdict.why), verdict.why);
    const good = await page.evaluate((st) => {
      const leg = { kind: 'bus', label: 'Bus 975', service: '975', points: st.map((s) => s.at), minutes: 15 };
      const t0 = Date.now();
      return RideCheck.verdict(leg, { startAt: t0, endAt: t0 + 15 * 60000, along: [1, 2] });
    }, stops);
    ok('bus seen along the way counts', good.ok, good.why);
    await context.close();
  }

  // ---- 5. no location ----
  {
    const leg = trainLeg('CC', stretch('CC', 1));
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, body: '{}' });
      const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
    const page = await fresh(context);
    await page.evaluate((l) => Trip.start({ title: 'Test', legs: [l] }), leg);
    await wait(page, 20 * 60 * 1000);
    await page.evaluate(() => Trip.active() && Trip.stop());
    ok('no location does not count', (await lineCount(page, 'CC')) === 0);
    await context.close();
  }

  // ---- 6. the unlock ----
  {
    const lines = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK', 'PG'];
    // The Sengkang and Punggol LRTs' stations go by their loops' codes.
    const stations = { SK: 'SE', PG: 'PE' };
    const firstOf = { BP: 1, SK: 1, PG: 1 };
    const legs = Object.fromEntries(lines.map((l) => [l, trainLeg(l, stretch(stations[l] || l, firstOf[l] || 5, 3))]));
    const context = await newContext(legs.NS.points[0]);
    const page = await fresh(context);
    for (const l of lines.slice(0, 8)) await rideGenuinely(page, context, legs[l]);
    ok('eight lines: not unlocked', !(await page.evaluate(() => RideCheck.unlocked())), JSON.stringify(await page.evaluate(() => RideCheck.progress().left)));
    // The ninth, gone through too fast.
    const last = legs.PG;
    await page.evaluate((l) => Trip.start({ title: 'Test', legs: [l] }), last);
    for (const p of last.points) {
      await go(context, p);
      await wait(page, 3000);
    }
    await page.evaluate(() => Trip.active() && Trip.stop());
    ok('ninth too fast: not unlocked', !(await page.evaluate(() => RideCheck.unlocked())));
    ok('colours still hidden', await page.evaluate(() => document.getElementById('customColours').hidden));
    await rideGenuinely(page, context, last);
    ok('ninth genuine: unlocked', await page.evaluate(() => RideCheck.unlocked()));
    await wait(page, 2000);
    ok('unlock window shown', await page.evaluate(() => !document.getElementById('unlockModal').classList.contains('hidden')));
    ok('colours offered', await page.evaluate(() => !document.getElementById('customColours').hidden));
    // Unreadable colours are refused; readable ones are kept.
    const refused = await page.evaluate(() => Colours.problems({ bg: '#ffffff', text: '#dddddd', button: '#ccffcc', card: '#ffffff' }).length > 0);
    const fine = await page.evaluate(() => Colours.problems({ bg: '#101820', text: '#f5f5f5', button: '#ffcc00', card: '#1c2833' }).length === 0);
    ok('low contrast refused, good contrast allowed', refused && fine);
    await context.close();
  }

  ok('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(failures ? `${failures} failed` : 'All passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
