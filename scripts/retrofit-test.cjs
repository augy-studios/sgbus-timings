// Tests that trips taken before uwuCoins earn their coins and feats, once (main-site/js/retrofit.js,
// js/coins.js forPast, js/eggs.js pastTrip, js/rides.js addPast): the page runs in Chrome under
// Playwright, from this checkout, with Your trips (js/history.js) put in storage first, as an
// existing user's would be.
//
//   node scripts/retrofit-test.cjs
//
// Needs Playwright, as scripts/ride-check-test.cjs does (PLAYWRIGHT=, CHROME= the same). No
// server: the page is served from main-site/ by Playwright itself, and /api/* answers "not found".
//
// What it checks:
//   1. A past trip's coins are the same sums as a trip now: bus 12 for 20 minutes then the EW
//      Line for 15 is 5 + 6 (km) + 3 (a change) + 4 + 4 (an operator each) + 2 (a line) = 24.
//   2. Only trips that got there with a ride got through earn coins; one ended partway, one
//      after uwuCoins came, one already paid, and one from the week rides were judged whose
//      ride wasn't judged real don't. One from that week whose ride was does.
//   3. Rides on trips from before rides were judged count towards the bus feats (12, 34, 56,
//      78, 90, even on a trip ended partway), and the trip feats are done: over three hours, back
//      where it started on two rides, the old railway. Each is worth 100 more.
//   4. It's said once, in the feat window, with no coin floating up for each; opened again,
//      nothing's given or said.
//   5. Every line ridden on past trips does that feat too, with the celebration.
//   6. Someone with no past trips is told nothing, and nothing's given.
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

const HOUR = 3600 * 1000;
const OLD = Date.parse('2026-10-20T09:00:00+08:00'); // before rides were judged
const WEEK = Date.parse('2026-10-29T09:00:00+08:00'); // rides judged, no coins yet
const NEW = Date.parse('2026-11-02T12:00:00+08:00'); // after uwuCoins came
const HOME = { label: 'Home', lat: 1.3521, lng: 103.8198 };
const WORK = { label: 'Work', lat: 1.2966, lng: 103.8520 };
const WOODLANDS = { label: 'Woodlands Train Checkpoint', lat: 1.442783, lng: 103.769356 };
const CANTONMENT = { label: 'Cantonment', lat: 1.273115, lng: 103.837028 };

const bus = (route, rideMin, done = true) => ({ kind: 'bus', route, op: 'SBST', from: 'A', to: 'B', waitMin: 5, rideMin, waitMeasured: false, rideMeasured: false, done });
const train = (route, rideMin, done = true) => ({ kind: 'train', route, color: '', lrt: ['BP', 'SK', 'PG'].includes(route), from: 'A', to: 'B', waitMin: 3, rideMin, waitMeasured: false, rideMeasured: false, done });
let n = 0;
const trip = (startedAt, legs, { from = HOME, to = WORK, arrived = true, hours = 1, id } = {}) =>
  ({ id: id || `past-trip-${++n}`, startedAt, endedAt: startedAt + hours * HOUR, title: '', from, to, arrived, walkMin: 5, legs });

(async () => {
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    ...(process.env.CHROME && { executablePath: process.env.CHROME }),
  });
  const errors = [];

  async function newContext(storage) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    // The storage put in once, before the page's first open, as it was before this update.
    await context.addInitScript((s) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, { sgbus_first_run: 'done', sgbus_tour: 'done', ...storage });
    await context.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
    return context;
  }

  // The page opened, and time enough for the retrofit to run (it waits for the bus routes, which
  // never come here, then for the app).
  async function open(context, page) {
    page ??= await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e.message)));
    if (!page.clockInstalled) {
      await page.clock.install({ time: new Date('2026-11-03T09:00:00+08:00') });
      page.clockInstalled = true;
      await page.goto(`${ORIGIN}/`);
    } else {
      await page.reload();
    }
    await page.waitForFunction(() => window.Retrofit && window.Coins && window.Eggs);
    await page.evaluate(() => { window.__toasts = 0; new MutationObserver((m) => m.forEach((r) => r.addedNodes.forEach((el) => { if (el.classList?.contains('coinToast')) window.__toasts++; }))).observe(document.body, { childList: true }); });
    await page.clock.runFor(20000);
    return page;
  }

  const state = (page) => page.evaluate(() => ({
    balance: Coins.balance(),
    feats: Eggs.feats(),
    done: JSON.parse(localStorage.getItem('sgbus_retrofit') || 'null'),
    modal: !document.getElementById('eggModal').classList.contains('hidden'),
    title: document.getElementById('eggTitle').textContent,
    name: document.getElementById('eggName').textContent,
    how: document.getElementById('eggHow').textContent,
    got: document.getElementById('eggGot').textContent,
    celebrating: ['celebrateModal', 'unlockModal'].some((m) => document.getElementById(m) && !document.getElementById(m).classList.contains('hidden')),
    celebrateText: document.getElementById('celebrateText')?.textContent || '',
    buses: Object.keys(RideCheck.record().buses).sort(),
    lines: Object.keys(RideCheck.record().lines).sort(),
    toasts: window.__toasts,
  }));

  // ---- 1-4. an existing user's past trips ----
  {
    const formula = trip(OLD, [bus('12', 20), train('EW', 15)], { id: 'formula-trip' });
    const trips = [
      formula, // 24
      trip(OLD + HOUR, [bus('34', 30, true), bus('56', 10, false)], { arrived: false }), // ended partway: 34's ride counts, no coins
      trip(OLD + 2 * HOUR, [bus('56', 12)]), // 5 + 1 (3 km) + 4 = 10
      trip(OLD + 3 * HOUR, [bus('78', 12), bus('90', 12)]), // the up feat
      trip(OLD + 5 * HOUR, [train('NS', 200)], { hours: 3.5 }), // the long feat
      trip(OLD + 9 * HOUR, [bus('9', 30), bus('9', 30)], { from: HOME, to: { ...HOME, label: 'Home again' } }), // the loop feat
      trip(OLD + 10 * HOUR, [bus('170', 40)], { from: WOODLANDS, to: CANTONMENT }), // the ktm feat
      trip(OLD + 11 * HOUR, [bus('2', 20)], { id: 'already-paid' }), // in the coins log
      trip(WEEK, [bus('14', 20)], { id: 'judged-real' }), // in the rides record: coins
      trip(WEEK + HOUR, [bus('15', 20)], { id: 'judged-not' }), // not: no coins
      trip(NEW, [bus('16', 20)], { id: 'after-coins' }), // counted as it was taken: none
    ];
    const context = await newContext({
      sgbus_trips: trips,
      sgbus_coins: { balance: 7, log: [{ at: OLD, n: 7, why: 'trip', trip: 'already-paid' }], spins: 0 },
      sgbus_rides: { lines: {}, buses: { 14: { n: 1, first: WEEK, last: WEEK } }, trips: [{ id: 'judged-real', at: WEEK, lines: [], buses: ['14'] }] },
    });
    const page = await open(context);
    const want = await page.evaluate((ids) => {
      const all = TripHistory.list();
      const of = (id) => Coins.forPast(all.find((t) => t.id === id))?.n || 0;
      return { formula: Coins.forPast(all.find((t) => t.id === 'formula-trip')), each: Object.fromEntries(ids.map((id) => [id, of(id)])) };
    }, trips.map((t) => t.id));
    ok('1. a past trip is the same sums as one now', want.formula?.n === 24, JSON.stringify(want.formula));
    const paid = ['formula-trip', 'past-trip-2', 'past-trip-3', 'past-trip-4', 'past-trip-5', 'past-trip-6', 'judged-real'];
    const tripCoins = paid.reduce((s, id) => s + want.each[id], 0);
    const s = await state(page);
    ok('2. only the trips owed get coins', s.done?.trips === paid.length && s.done?.coins === tripCoins, JSON.stringify(s.done));
    ok('3. the feats from past trips are done', ['up', 'long', 'loop', 'ktm'].every((f) => s.feats.includes(f)) && !s.feats.includes('down') && !s.feats.includes('lines'), s.feats.join(','));
    ok('3. past rides kept by bus', ['12', '34', '56', '78', '90', '170'].every((b) => s.buses.includes(b)) && !s.buses.includes('15') && !s.buses.includes('16'), s.buses.join(','));
    ok('3. past rides kept by line', s.lines.join(',') === 'EW,NS', s.lines.join(','));
    ok('2-3. the balance: what was there, the trips, and 100 a feat', s.balance === 7 + tripCoins + 4 * 100, `${s.balance} vs ${7 + tripCoins + 400}`);
    ok('4. said once, in the feat window', s.modal && s.title === 'Coins for your past trips' && s.how.includes(`${paid.length} trips`) && s.got.includes('The long way round'), `${s.title} | ${s.name} | ${s.how} | ${s.got}`);
    ok('4. no coin floating up for each', s.toasts === 0, String(s.toasts));
    await page.evaluate(() => window.closeModal('eggModal'));
    await open(context, page);
    const again = await state(page);
    ok('4. opened again: nothing more given or said', again.balance === s.balance && !again.modal, `${again.balance} ${again.modal}`);
    const said = await page.evaluate(() => simulatePastTrips());
    ok('4. simulatePastTrips() says what was done', said.startsWith('done') && said.includes(`+${tripCoins} uwuCoins`), said);
    await context.close();
  }

  // ---- 5. every line ridden on past trips ----
  {
    const lines = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK', 'PG'];
    const context = await newContext({ sgbus_trips: lines.map((l, i) => trip(OLD + i * HOUR, [train(l, 10)])) });
    const page = await open(context);
    const s = await state(page);
    ok('5. every line ridden on past trips does the feat', s.feats.includes('lines') && s.lines.length === 9, s.feats.join(','));
    ok('5. said with the celebration', s.celebrating && s.celebrateText.includes('every MRT and LRT line') && s.celebrateText.includes('9 trips'), s.celebrateText);
    await context.close();
  }

  // ---- one past trip: said as one ----
  {
    const context = await newContext({ sgbus_trips: [trip(OLD, [bus('16', 20)])] });
    const page = await open(context);
    const s = await state(page);
    ok('4. one past trip, said as one', s.modal && s.how.startsWith('Your trip from before uwuCoins'), s.how);
    await context.close();
  }

  // ---- 6. no past trips ----
  {
    const context = await newContext({ sgbus_trips: [trip(NEW, [bus('16', 20)])] });
    const page = await open(context);
    const s = await state(page);
    ok('6. nothing to give: nothing said or given', !s.modal && !s.celebrating && s.balance === 0 && s.done?.trips === 0, JSON.stringify(s.done));
    await context.close();
  }

  ok('no page errors', !errors.length, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})();
