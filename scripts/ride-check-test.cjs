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
//      celebration (js/celebrate.js) shows; eight lines, or a ninth gone through too fast,
//      don't unlock it. Pick my colours opens Theme, and it can be watched again from there.
//   7. Without WebGL, the unlock shows the plain window instead of the celebration.
//   8. On a phone with little memory (deviceMemory 2), the flat celebration: an SVG trophy and
//      2D confetti, no three.js fetched; with reduced motion, no confetti.
//   9. The console's simulateAllLines() (help desk #13): a preview by default, each variant
//      forced ('3d', 'flat', 'plain'), saving nothing; { unlock: true } unlocks Your colours
//      with no rides saved, and 'undo' locks them again (and takes away colours picked since),
//      but never a real unlock; without WebGL, '3d' gives the plain window.
// SHOTS=<folder> saves a screenshot of the celebration there, and of each simulated one.
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
  // WebGL in headless Chrome, for the celebration (js/celebrate.js), from its software renderer.
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    ...(process.env.CHROME && { executablePath: process.env.CHROME }),
  });
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

  // `noWebGL`: a phone without it, for the celebration's plain window.
  // `lowMemory`: a phone saying it has 2 GB, for the flat celebration.
  async function newContext(at, { noWebGL = false, lowMemory = false, reducedMotion = 'no-preference' } = {}) {
    const context = await browser.newContext({ geolocation: { latitude: at[0], longitude: at[1], accuracy: 20 }, permissions: ['geolocation'], serviceWorkers: 'block', reducedMotion });
    if (lowMemory) await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 2, configurable: true }));
    if (noWebGL) {
      await context.addInitScript(() => {
        const real = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
          return /webgl/i.test(kind) ? null : real.call(this, kind, ...rest);
        };
      });
    }
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
    // The celebration: its 3D scene drawn, the plain window not.
    await page.waitForFunction(() => !document.getElementById('celebrateModal').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
    ok('celebration shown', await page.evaluate(() => !document.getElementById('celebrateModal').classList.contains('hidden') && window.Celebrate.running() && !!document.querySelector('#celebrateScene canvas')));
    ok('plain window not shown with the scene', await page.evaluate(() => document.getElementById('unlockModal').classList.contains('hidden')));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'celebration.png') });
    // Close stops it, and Pick my colours opens Theme at Your colours.
    await page.evaluate(() => document.getElementById('celebrateGo').click());
    await wait(page, 500);
    ok('pick my colours opens Theme', await page.evaluate(() => document.getElementById('celebrateModal').classList.contains('hidden') && !window.Celebrate.running() && !document.getElementById('themeModal').classList.contains('hidden')));
    // Watched again from Your colours.
    await page.evaluate(() => document.getElementById('colourReplay').click());
    await page.waitForFunction(() => window.Celebrate.running(), null, { timeout: 15000 }).catch(() => {});
    ok('watch the celebration again', await page.evaluate(() => window.Celebrate.running()));
    await page.evaluate(() => document.getElementById('celebrateClose').click());
    ok('colours offered', await page.evaluate(() => !document.getElementById('customColours').hidden));
    // Unreadable colours are refused; readable ones are kept.
    const refused = await page.evaluate(() => Colours.problems({ bg: '#ffffff', text: '#dddddd', button: '#ccffcc', card: '#ffffff' }).length > 0);
    const fine = await page.evaluate(() => Colours.problems({ bg: '#101820', text: '#f5f5f5', button: '#ffcc00', card: '#1c2833' }).length === 0);
    ok('low contrast refused, good contrast allowed', refused && fine);
    await context.close();
  }

  // ---- 7. no WebGL: the plain window instead ----
  {
    const lines = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK'];
    const last = trainLeg('PG', stretch('PE', 1, 3));
    const context = await newContext(last.points[0], { noWebGL: true });
    const page = await fresh(context);
    await page.evaluate((ls) => {
      const now = Date.now();
      localStorage.setItem('sgbus_rides', JSON.stringify({ lines: Object.fromEntries(ls.map((l) => [l, { n: 1, first: now, last: now }])), buses: {}, trips: [] }));
    }, lines);
    await rideGenuinely(page, context, last);
    await wait(page, 2000);
    ok('no WebGL: unlocked', await page.evaluate(() => RideCheck.unlocked()));
    ok('no WebGL: the plain window, no scene', await page.evaluate(() => !document.getElementById('unlockModal').classList.contains('hidden') && document.getElementById('celebrateModal').classList.contains('hidden')));
    await context.close();
  }

  // ---- 8. little memory: the flat celebration, confetti and all, with no three.js ----
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const lines = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK'];
    const last = trainLeg('PG', stretch('PE', 1, 3));
    const context = await newContext(last.points[0], { lowMemory: true, reducedMotion });
    let threeAsked = false;
    context.on('request', (r) => { if (/\/vendor\/three-/.test(r.url())) threeAsked = true; });
    const page = await fresh(context);
    await page.evaluate((ls) => {
      const now = Date.now();
      localStorage.setItem('sgbus_rides', JSON.stringify({ lines: Object.fromEntries(ls.map((l) => [l, { n: 1, first: now, last: now }])), buses: {}, trips: [] }));
      // The confetti's canvas comes and goes in a few seconds: noted as it comes.
      new MutationObserver(() => { if (document.querySelector('canvas.confetti')) window.__confettiSeen = true; }).observe(document.body, { childList: true });
    }, lines);
    await rideGenuinely(page, context, last);
    await wait(page, 500);
    const got = await page.evaluate(() => ({
      unlocked: RideCheck.unlocked(),
      shown: !document.getElementById('celebrateModal').classList.contains('hidden'),
      flat: document.getElementById('celebrateModal').classList.contains('flat') && !!document.querySelector('#celebrateScene .flatTrophy'),
      mode: Celebrate.mode(),
      webgl: !!document.querySelector('#celebrateScene canvas'),
      confetti: !!window.__confettiSeen,
      plain: !document.getElementById('unlockModal').classList.contains('hidden'),
    }));
    const still = reducedMotion === 'reduce';
    if (process.env.SHOTS && !still) await page.screenshot({ path: path.join(process.env.SHOTS, 'celebration-flat.png') });
    ok(`little memory${still ? ', reduced motion' : ''}: flat celebration`, got.unlocked && got.shown && got.flat && got.mode === 'flat' && !got.webgl && !got.plain, JSON.stringify(got));
    ok(`little memory${still ? ', reduced motion' : ''}: ${still ? 'no confetti' : 'confetti'}`, got.confetti === !still);
    ok(`little memory${still ? ', reduced motion' : ''}: three.js not fetched`, !threeAsked);
    await page.evaluate(() => document.getElementById('celebrateClose').click());
    ok(`little memory${still ? ', reduced motion' : ''}: Close stops it`, await page.evaluate(() => !Celebrate.running() && document.getElementById('celebrateModal').classList.contains('hidden')));
    await context.close();
  }

  // ---- 9. the console's simulateAllLines() (help desk #13) ----
  {
    const context = await newContext([1.3521, 103.8198]);
    const page = await fresh(context);
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    const keys = () => page.evaluate(() => Object.fromEntries(['sgbus_rides', 'sgbus_colours_unlocked', 'sgbus_colours_told', 'sgbus_colours', 'sgbus_colours_simulated'].map((k) => [k, localStorage.getItem(k)])));
    const state = () => page.evaluate(() => ({
      celebrate: !document.getElementById('celebrateModal').classList.contains('hidden'),
      plain: !document.getElementById('unlockModal').classList.contains('hidden'),
      mode: Celebrate.mode(),
      canvas: !!document.querySelector('#celebrateScene canvas'),
      flat: !!document.querySelector('#celebrateScene .flatTrophy'),
      unlocked: RideCheck.unlocked(),
    }));
    const before = await keys();

    const help = await page.evaluate(() => simulateAllLines('help'));
    ok('simulate: help prints usage', help === 'help' && logs.some((l) => /simulateAllLines\(\) plays/.test(l)) && !(await state()).celebrate);

    // A preview by default: this browser's own celebration, nothing saved.
    logs.length = 0;
    const own = await page.evaluate(() => simulateAllLines());
    const s0 = await state();
    ok('simulate: no args plays this browser\'s own and prints usage', own === 'scene' && s0.celebrate && s0.canvas && logs.some((l) => /Options:/.test(l)), JSON.stringify(s0));
    for (const [as, want] of [['3d', 'scene'], ['flat', 'flat'], ['plain', 'plain']]) {
      const got = await page.evaluate((a) => simulateAllLines(a), as);
      await wait(page, 1500);
      const s = await state();
      const shown = want === 'plain' ? s.plain && !s.celebrate : s.celebrate && !s.plain && s.mode === want && (want === 'flat' ? s.flat && !s.canvas : s.canvas);
      ok(`simulate: '${as}' shows the ${want} one`, got === want && shown, JSON.stringify(s));
      // The windows fade on the real clock, not the page's.
      if (process.env.SHOTS) { await page.waitForTimeout(1000); await page.screenshot({ path: path.join(process.env.SHOTS, `simulate-${as}.png`) }); }
    }
    ok('simulate: preview saves nothing', JSON.stringify(await keys()) === JSON.stringify(before) && !(await page.evaluate(() => RideCheck.unlocked())), JSON.stringify(await keys()));
    ok('simulate: preview leaves Your colours hidden', await page.evaluate(() => { document.getElementById('celebrateGo')?.click(); return document.getElementById('customColours').hidden; }));
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal(m.id)));
    ok('simulate: unknown variant only helps', (await page.evaluate(() => simulateAllLines('sparkly'))) === 'help' && !(await state()).celebrate);
    ok('simulate: undo with nothing to undo', (await page.evaluate(() => simulateAllLines('undo'))) === 'nothing');

    // Unlocking for real, then undone.
    const unlockedAs = await page.evaluate(() => simulateAllLines({ unlock: true, as: 'flat' }));
    await wait(page, 2000);
    const s1 = await state();
    const k1 = await keys();
    ok('simulate: unlock unlocks and plays it once', unlockedAs === 'flat' && s1.unlocked && s1.celebrate && s1.mode === 'flat' && !s1.plain && !!k1.sgbus_colours_simulated && k1.sgbus_rides === before.sgbus_rides, JSON.stringify({ s1, k1 }));
    await page.evaluate(() => document.getElementById('celebrateGo').click());
    await wait(page, 500);
    ok('simulate: unlocked, Your colours offered', await page.evaluate(() => !document.getElementById('customColours').hidden));
    // Colours picked while it was unlocked go with the undo.
    await page.evaluate(() => { const box = document.getElementById('customColours'); for (const [k, v] of Object.entries({ bg: '#101820', text: '#f5f5f5', button: '#ffcc00', card: '#1c2833' })) { const i = box.querySelector(`[data-colour="${k}"]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } document.getElementById('colourKeep').click(); });
    ok('simulate: colours kept while unlocked', !!(await keys()).sgbus_colours && (await page.evaluate(() => document.documentElement.hasAttribute('data-custom-colours'))));
    const undone = await page.evaluate(() => simulateAllLines('undo'));
    ok('simulate: undo locks again and takes the colours away', undone === 'undone' && JSON.stringify(await keys()) === JSON.stringify(before) && !(await page.evaluate(() => RideCheck.unlocked() || document.documentElement.hasAttribute('data-custom-colours'))), JSON.stringify(await keys()));
    // A reload after the undo: no celebration comes back.
    await page.reload();
    await page.waitForFunction(() => window.RideCheck && window.Celebrate);
    await wait(page, 3000);
    ok('simulate: nothing after a reload', !(await state()).celebrate && !(await state()).plain && !(await page.evaluate(() => RideCheck.unlocked())));

    // Colours unlocked by riding: unlock doesn't touch them and undo doesn't lock them.
    await page.evaluate(() => localStorage.setItem('sgbus_colours_unlocked', '1'));
    await page.evaluate(() => simulateAllLines({ unlock: true }));
    ok('simulate: undo leaves a real unlock alone', (await page.evaluate(() => simulateAllLines('undo'))) === 'nothing' && (await page.evaluate(() => RideCheck.unlocked())));
    await context.close();
  }

  // ---- 9b. the console's simulateAllLines() with no WebGL: '3d' falls back to plain ----
  {
    const context = await newContext([1.3521, 103.8198], { noWebGL: true });
    const page = await fresh(context);
    const got = await page.evaluate(() => simulateAllLines('3d'));
    ok('simulate: no WebGL, 3d falls back to plain', got === 'plain' && (await page.evaluate(() => !document.getElementById('unlockModal').classList.contains('hidden'))));
    const flat = await page.evaluate(() => simulateAllLines('flat'));
    ok('simulate: no WebGL, flat still shows', flat === 'flat' && (await page.evaluate(() => !document.getElementById('celebrateModal').classList.contains('hidden') && document.getElementById('unlockModal').classList.contains('hidden'))));
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
