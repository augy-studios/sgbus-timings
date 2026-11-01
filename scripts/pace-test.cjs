// Are you walking? (js/trip.js, watchPace): on a trip's walk at a pace no walk keeps up, the
// site asks, and I'm cycling or I'm driving makes the rest of the trip a ride by bike or car.
//
//   node scripts/pace-test.cjs
//
// Needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
// The page's clock is moved on by hand, and its fixes and steps are fed to it.
//
// What it checks:
//   1. At a cyclist's pace, it asks, with I'm cycling the main button.
//   2. I'm cycling: to cycle safely, and the bus still ahead to go on to; Cycle all the way
//      there makes the rest of the trip one ride by bike to where it ends, timed by
//      /api/walk?mode=cycle, the bar says so with Undo, and the live map opens on it.
//   3. At a driver's pace, I'm driving is the main button; to drive safely; picking the bus
//      ahead makes the trip a drive to its stop, then that bus as it was.
//   4. At a walker's pace, it doesn't ask.
//   5. Fast with steps to go with it (a run for the bus), it doesn't ask.
//   6. Closed, it doesn't ask again on that trip, nor after Undo.
//   7. In Chinese, the question is in Chinese.
//   8. No page errors.
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
const ZH = JSON.parse(fs.readFileSync(path.join(SITE, 'i18n/zh-SG.json'), 'utf8'));

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

// A walk east along Singapore's 1.3° N to a bus stop 2.2 km on, then a bus north from it.
const START = [1.3, 103.8];
const STOP = [1.3, 103.82];
const LEGS = [
  { kind: 'walk', label: 'Walk', to: 'Blk 1', points: [START, STOP], minutes: 27, wait: 0 },
  { kind: 'bus', label: 'Bus 99', to: 'Blk 9', service: '99', points: [STOP, [1.31, 103.82], [1.32, 103.82]], minutes: 6, wait: 3 },
];
const M_PER_LNG = 111320 * Math.cos((1.3 * Math.PI) / 180);

async function site(browser, lang = 'en') {
  const context = await browser.newContext({ viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.addInitScript((lang) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('sgbus_first_run', 'done');
      set('sgbus_tour', 'done');
      set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
      set('sgbus_start', 'timings');
      set('sgbus_lang', lang);
    }
    // The page's clock, moved on by hand (__later), and its fixes, fed by hand (__fix).
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
    // Steps, as the accelerometer feels them: two a second for `ms`.
    window.__steps = (ms) => {
      for (let t = 0; t < ms; t += 20) {
        window.__later(20);
        const z = 9.8 + 3 * Math.sin((2 * Math.PI * 2 * t) / 1000);
        window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 0, y: 0, z } }));
      }
    };
  }, lang);
  const asked = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/walk') {
      asked.push(url.searchParams.get('mode'));
      return json({ distance: 2400, minutes: url.searchParams.get('mode') === 'drive' ? 6 : 11, path: [START, STOP], steps: [], source: 'osm' });
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
    // The live map, as far as the trip's concerned: whether it was opened.
    window.__mapOpened = 0;
    if (window.LiveMap) window.LiveMap.trip = () => { window.__mapOpened += 1; };
  });
  await page.evaluate(({ legs }) => Trip.start({ title: 'To Blk 9', legs, to: { label: 'Blk 9', lat: 1.32, lng: 103.82 } }), { legs: LEGS });
  return { context, page, errors, asked };
}

// Moving east at `kmh` for `seconds`, a fix every 3 s; `steps` with each.
async function go(page, kmh, seconds, { steps = false, from = 0 } = {}) {
  return page.evaluate(({ kmh, seconds, steps, from, start, mPerLng }) => {
    let m = from;
    for (let t = 0; t <= seconds; t += 3) {
      if (steps) window.__steps(3000);
      else window.__later(3000);
      m += (kmh / 3.6) * 3;
      window.__fix(start[0], start[1] + m / mPerLng);
    }
    return m;
  }, { kmh, seconds, steps, from, start: START, mPerLng: M_PER_LNG });
}

const shown = (page) => page.evaluate(() => !document.getElementById('paceModal').classList.contains('hidden'));

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });

  // ---- 1, 2. cycling ----
  {
    const { context, page, errors, asked } = await site(browser);
    await go(page, 15, 60);
    ok('1. asks at a cyclist\'s pace', await shown(page));
    ok('1. its question', (await page.textContent('#paceTitle')).trim() === 'Are you walking?');
    ok('1. I\'m cycling the main button', await page.evaluate(() => document.getElementById('paceCycle').className === 'btn' && document.getElementById('paceDrive').className === 'iconBtn'));
    await page.click('#paceCycle');
    ok('2. cycle safely', (await page.textContent('#paceSafeTitle')).trim() === 'Cycle safely' && (await page.textContent('#paceSafe')).includes('give way to people walking')
      && await page.evaluate(() => document.getElementById('paceAskTitle').hidden && document.getElementById('paceAsk').hidden));
    ok('2. asks whether to go on to a bus or train', !(await page.evaluate(() => document.getElementById('paceNextAsk').hidden)));
    const rides = await page.$$eval('[data-pace-ride]', (els) => els.map((el) => el.textContent.trim()));
    ok('2. the bus still ahead offered', rides.length === 1 && rides[0].startsWith('Cycle to Blk 1, then Bus 99') && rides[0].endsWith('Bus 99 to Blk 9'), rides.join(' | '));
    ok('2. or all the way', (await page.textContent('#paceAllWay')).trim() === 'Cycle all the way there');
    await page.click('#paceAllWay');
    await page.waitForFunction(() => Trip.legs()?.length === 1);
    const legs = await page.evaluate(() => Trip.legs());
    ok('2. one ride by bike to the end', legs.length === 1 && legs[0].cycle === true && legs[0].label === 'Cycle' && legs[0].to === 'Blk 9', JSON.stringify(legs[0]));
    ok('2. timed by the cycling route', legs[0].minutes === 11 && asked.includes('cycle'), `${legs[0].minutes} ${asked}`);
    ok('2. the bar says it', (await page.textContent('#tripStatus')).startsWith('Cycle to Blk 9, about'), await page.textContent('#tripStatus'));
    const warn = (await page.textContent('#tripWarn')).replace(/\s+/g, ' ');
    ok('2. switched, with Undo', warn.includes('Switched to cycling.') && warn.includes('Cycle the rest of the way, ~11 min.') && warn.includes('Undo'), warn);
    ok('2. the modal\'s gone', !(await shown(page)));
    ok('2. live map opened', await page.evaluate(() => window.__mapOpened) === 1);
    // 6. Undo: the walk back, and not asked again.
    await page.click('[data-trip-switched="undo"]');
    ok('6. Undo puts the walk back', (await page.evaluate(() => Trip.legs().length)) === 2);
    await go(page, 15, 60, { from: 500 });
    ok('6. not asked again after Undo', !(await shown(page)));
    ok('8. no page errors (cycling)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 3. driving ----
  {
    const { context, page, errors, asked } = await site(browser);
    await go(page, 40, 60);
    ok('3. asks at a driver\'s pace', await shown(page));
    ok('3. I\'m driving the main button', await page.evaluate(() => document.getElementById('paceDrive').className === 'btn' && document.getElementById('paceCycle').className === 'iconBtn'));
    await page.click('#paceDrive');
    ok('3. drive safely', (await page.textContent('#paceSafeTitle')).trim() === 'Drive safely' && (await page.textContent('#paceSafe')).includes('Pull over first'));
    await page.click('[data-pace-ride="1"]');
    await page.waitForFunction(() => Trip.legs()?.[0]?.drive);
    const legs = await page.evaluate(() => Trip.legs());
    ok('3. a drive to the bus\'s stop', legs.length === 2 && legs[0].drive === true && legs[0].label === 'Drive' && legs[0].to === 'Blk 1' && legs[0].minutes === 6 && asked.includes('drive'), JSON.stringify(legs[0]));
    ok('3. then the bus as it was', legs[1].kind === 'bus' && legs[1].service === '99' && legs[1].to === 'Blk 9');
    ok('3. the bar says it', (await page.textContent('#tripStatus')).startsWith('Drive to Blk 1, about'), await page.textContent('#tripStatus'));
    const warn = (await page.textContent('#tripWarn')).replace(/\s+/g, ' ');
    ok('3. switched, saying what\'s next', warn.includes('Switched to driving.') && warn.includes('Drive to Blk 1, ~6 min, then Bus 99.'), warn);
    ok('3. its icon is the way\'s', await page.evaluate(() => document.querySelector('#tripBar [data-icon]').getAttribute('data-icon')) === 'route');
    ok('8. no page errors (driving)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 4, 5, 6. not asked ----
  {
    const { context, page, errors } = await site(browser);
    await go(page, 5, 90);
    ok('4. not asked at a walker\'s pace', !(await shown(page)));
    await context.close();
    const run = await site(browser);
    await go(run.page, 10, 60, { steps: true });
    ok('5. not asked running, with steps', !(await shown(run.page)));
    await run.context.close();
    const closed = await site(browser);
    const m = await go(closed.page, 15, 60);
    ok('6. asked', await shown(closed.page));
    await closed.page.click('[data-close-modal="paceModal"]');
    ok('6. closed keeps the walk', (await closed.page.evaluate(() => Trip.legs().length)) === 2 && !(await shown(closed.page)));
    await go(closed.page, 15, 60, { from: m });
    ok('6. not asked again', !(await shown(closed.page)));
    ok('8. no page errors (not asked)', errors.length + run.errors.length + closed.errors.length === 0, [...errors, ...run.errors, ...closed.errors].join(' | '));
    await closed.context.close();
  }

  // ---- 7. in Chinese ----
  {
    const { context, page, errors } = await site(browser, 'zh-SG');
    await go(page, 15, 60);
    ok('7. asked in Chinese', (await page.textContent('#paceTitle')).trim() === ZH['pace.title'] && (await page.textContent('#paceCycle')).trim() === ZH['pace.cycling'], await page.textContent('#paceTitle'));
    ok('8. no page errors (Chinese)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
