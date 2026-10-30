// The guide's screenshots, at 3x, from this checkout's main-site with live data: start
// serve.cjs first, then from docs-site/, `node screenshots/shots.cjs [group ...]` (every group
// without any). Then `python3 screenshots/sizes.py <names>` to set their sizes in the pages.
// Take the ones with live timings (*-live, install-tour) in the day, while buses run.
// Needs Playwright (npm i -g playwright, or Chromium where Playwright finds it). CHROME=<path
// to chrome.exe> uses an installed Chrome instead of Playwright's own.
//
// The app-* groups show the page as the Android app has it (2.1.0's reminders, Offline
// Sharing, the search box's mic and camera): `app: true` stands a fake window.Capacitor in for
// the app, answering as the app would (APP_ANSWERS), so the page draws what it does there.
//
// STILL=1 takes any group still: the page's clock stopped at STILL_AT, and each stop's bus
// timings made up (stillArrivals) for the buses its routes have running then, so a shot comes
// out the same whenever it's taken. The groups after "help desk #13" are always taken still.
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
const OUT = path.resolve(__dirname, '../public/screenshots/web') + '/';
const SITE = `http://127.0.0.1:${Number(process.env.PORT) || 8766}/`;
const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);

const P = {
  bedokMall: { label: 'Bedok Mall', lat: 1.324736, lng: 103.929256 },
  raffles: { label: 'One Raffles Place', lat: 1.284350, lng: 103.851073 },
  botanic: { label: 'Botanic Gardens station', lat: 1.322559, lng: 103.815747 },
  changi: { label: 'Changi Airport', lat: 1.357338, lng: 103.988565 },
  punggol: { label: 'Punggol Coast Mall', lat: 1.414553, lng: 103.908235 },
};
// The moment a still shot is taken: a Friday morning in an NUS term.
const STILL_AT = new Date('2026-10-30T08:30:00+08:00');
const enc = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}~${encodeURIComponent(p.label)}`;
const navHash = (a, b, when = '') => `#nav/${a === 'here' ? 'here' : enc(a)}/${enc(b)}${when}`;

const STATE = {
  sgbus_name: 'Sam',
  sgbus_hold_hint: '1',
  // Not the tour of the basics over every shot (main-site/js/tour.js), only where it's the subject.
  sgbus_tour: 'done',
  // Nor each page's own the first time it opens.
  sgbus_tours: JSON.stringify(['timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer', 'terminal']),
  sgbus_favs_v2: JSON.stringify([{ code: '84009', name: 'Bedok Int' }, { code: '75009', name: 'Tampines Int' }]),
  sgbus_fav_buses: JSON.stringify(['60', '14']),
  sgbus_fav_routes: JSON.stringify([{ start: '84009', startName: 'Bedok Int', end: '66009', endName: 'Serangoon Int' }]),
  sgbus_fav_navs: JSON.stringify([
    { from: P.bedokMall, to: P.changi },
  ]),
  sgbus_home: JSON.stringify(P.bedokMall),
  sgbus_work: JSON.stringify(P.raffles),
  sgbus_places: JSON.stringify([
    { id: 'gym', name: 'Gym', label: 'Our Tampines Hub', lat: 1.353134, lng: 103.940408 },
    { id: 'mum', name: "Mum's", label: 'Blk 101 Simei Street 1', lat: 1.340850, lng: 103.951434 },
  ]),
};

// What the fake Android app (see the top) says to the page, by plugin and method; anything else
// answers {}. "never" stays waiting, as the app does for a sticker or a card.
const APP_FEATURES = ['calendar', 'update', 'checkupdate', 'trip', 'pace', 'notify', 'board', 'share', 'shareto', 'sharetap', 'sharenearby',
  'widget', 'places', 'flag', 'torch', 'earphones', 'battery', 'lastbus', 'leavetime', 'nearstops', 'onabus', 'scan', 'sticker', 'listen', 'pip', 'card', 'cardtap', 'routines'];
const APP_ANSWERS = {
  'SgBus.info': { version: '2.1.0', versionCode: 13, android: 35, features: APP_FEATURES },
  'OfflineShare.status': { nfc: 'on', tap: true, nearby: true, allowed: true },
  'OfflineShare.write': 'never',
  'Reminders.status': {
    nearStops: ['84009'], lastBus: [{ code: '84009', service: '14' }], leaveTime: true, onABus: false, routines: 2,
    background: true, notifications: true, calendar: true, activity: true,
  },
};
// Run in the page: a window.Capacitor that answers as above, and finds a phone nearby when
// Offline Sharing looks for one.
function fakeApp(answers) {
  const listeners = {};
  const emit = (plugin, event, data) => (listeners[`${plugin}.${event}`] || []).forEach((fn) => fn(data));
  window.Capacitor = {
    getPlatform: () => 'android',
    nativePromise(plugin, method) {
      if (plugin === 'OfflineShare' && method === 'find') setTimeout(() => emit('OfflineShare', 'found', { id: 'p1', name: 'Alex' }), 300);
      const a = answers[`${plugin}.${method}`];
      return a === 'never' ? new Promise(() => {}) : Promise.resolve(a ?? {});
    },
    addListener(plugin, event, fn) {
      (listeners[`${plugin}.${event}`] ||= []).push(fn);
      return { remove() {} };
    },
  };
}

// Made-up timings for STILL (see the top), from the real stops and routes: each bus that calls at
// the stop and runs at STILL_AT on a weekday, due in a few minutes picked by its number, and on
// the road the stops before it that far back, so its distance shows as it does live.
// Fetched once however many stops ask at the same time, and again a few times over: the live site
// answers some of these with an HTML page rather than the route list while the page fetches its own.
let NET = null;
async function liveJson(api, tries = 4) {
  for (let i = 1; ; i++) {
    const r = await fetch(`${SITE}api/${api}`);
    const text = await r.text();
    try { return JSON.parse(text); } catch {
      if (i >= tries) throw new Error(`/api/${api} answered ${r.status} ${text.slice(0, 80)}`);
      await new Promise((ok) => setTimeout(ok, 1500 * i));
    }
  }
}
function stillNet() {
  NET ??= Promise.all(['bus-stops', 'bus-routes'].map((a) => liveJson(a)))
    .then(([stops, routes]) => ({ at: Object.fromEntries(stops.map((x) => [x.c, [x.la, x.lo]])), runs: routes.runs || {}, ops: routes.services || {} }))
    .catch((e) => { NET = null; throw e; });
  return NET;
}
async function stillArrivals(stop) {
  const { at, runs, ops } = await stillNet();
  const now = STILL_AT.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' }).replace(':', '');
  const services = [];
  for (const [no, dirs] of Object.entries(runs)) {
    for (const run of Object.values(dirs)) {
      const i = run.stops.indexOf(stop);
      if (i === -1 || (i === run.stops.length - 1 && run.stops.length > 1 && run.stops[0] !== stop)) continue;
      const t = run.times?.[i] || '';
      const [first, last] = [t.slice(0, 4), t.slice(4, 8)];
      if (!first || (first <= last ? now < first || now > last : now < first && now > last)) continue;
      const h = [...no].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
      const m1 = (h % 13) + (h % 5 === 0 ? 0 : 1);
      const mins = [m1, m1 + 8 + (h % 6), m1 + 17 + (h % 9)];
      // From where it starts, a bus not out yet is timed by the timetable, with no position: as
      // LTA has it.
      const bus = (m, k) => {
        const back = i - Math.max(1, Math.round(m / 1.8));
        const [lat, lng] = (back >= 0 && at[run.stops[back]]) || [null, null];
        return { eta_ms: m * 60000, load: ['SEA', 'SEA', 'SDA'][(h + k) % 3], wheelchair: true, deck: (h + k) % 3 ? 'Double' : 'Single', lat, lng, rough: back < 0, origin: run.stops[0], dest: run.stops[run.stops.length - 1], visit: 1 };
      };
      services.push({ serviceNo: no, operator: ops[no]?.op || 'SBST', next: bus(mins[0], 0), next2: bus(mins[1], 1), next3: bus(mins[2], 2) });
      break;
    }
  }
  return { busStopCode: stop, services };
}

// `ua`: a browser to be, such as Chrome on Android for the app's download bar. `still`: see the
// top. `mapHook`: the live map's MapLibre map kept as window.__map, to move by hand.
async function open(browser, { width = 1000, height = 1200, hash = '', extra = {}, geo = null, touch = false, app = false, ua = null, still = !!process.env.STILL, mapHook = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 3, isMobile: touch, hasTouch: touch, colorScheme: 'light', locale: 'en-SG', timezoneId: 'Asia/Singapore',
    ...(ua && { userAgent: ua }),
    ...(geo && { geolocation: geo, permissions: ['geolocation'] }),
  });
  // Nothing from outside but the fonts and the live map's tiles.
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1|https:\/\/fonts\.(googleapis|gstatic)\.com|https:\/\/tiles?\.(openfreemap|openstreetmap)\.org)/, (r) => r.abort());
  // A share card makes a short link: a made-up one here, not a real one on the live site.
  await ctx.route(/\/api\/share$/, (r) => (r.request().method() === 'POST'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'k3v9q2x7ma', path: '/go/k3v9q2x7ma' }) })
    : r.continue()));
  if (still) {
    await ctx.clock.setFixedTime(STILL_AT);
    await ctx.route(/\/api\/bus-arrivals\?/, async (r) => {
      const q = new URL(r.request().url()).searchParams;
      const a = await stillArrivals(q.get('stop'));
      if (q.get('service')) a.services = a.services.filter((x) => x.serviceNo === q.get('service'));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(a) });
    });
  }
  if (mapHook) {
    await ctx.addInitScript(() => {
      let ml;
      Object.defineProperty(window, 'maplibregl', {
        configurable: true,
        get: () => ml,
        set(v) {
          ml = v;
          const on = v.Map.prototype.on;
          v.Map.prototype.on = function (...a) { window.__map = this; return on.apply(this, a); };
        },
      });
    });
  }
  if (app) await ctx.addInitScript(fakeApp, APP_ANSWERS);
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, { ...STATE, ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(SITE + hash);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const blur = (page) => page.evaluate(() => document.activeElement?.blur());
// Settings, open on one of its groups (`you`, `pages`, `trips`, `navigate`, `help`, `sync`).
async function settingsGroup(page, id) {
  await page.click('#settingsBtn');
  await page.waitForTimeout(400);
  await page.click(`#settingsGroups [data-settings-open="${id}"]`);
  await page.waitForTimeout(500);
}
async function idle(page, sel, ms = 25000) {
  // Until the panel's body stops saying it's working.
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return el && !/Finding|Looking|Planning|Loading|Working/i.test(el.textContent) && el.textContent.trim().length > 20;
  }, sel, { timeout: ms }).catch(() => console.log('still busy:', sel));
  await page.waitForTimeout(1200);
}
// The card from its top down to the bottom of `to`.
async function cardDown(page, card, to, name, pad = 16) {
  const c = await page.locator(card).boundingBox();
  const t = await page.locator(to).boundingBox();
  await page.screenshot({ path: OUT + name, clip: { x: c.x, y: c.y, width: c.width, height: t.y + t.height + pad - c.y } });
  console.log('wrote', name, Math.round(c.width), Math.round(t.y + t.height + pad - c.y));
}
async function el(page, sel, name) {
  const b = await page.locator(sel).first().boundingBox();
  await page.locator(sel).first().screenshot({ path: OUT + name });
  console.log('wrote', name, Math.round(b.width), Math.round(b.height));
}

(async () => {
  // WebGL in software, for the live map's MapLibre without a GPU.
  const args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args } : { args });
  const R = '#plannerSection .card';
  const N = '#navSection .card';

  if (want('install-tour')) {
    const { ctx, page } = await open(browser, { width: 1000, height: 800, hash: '#84009' });
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: OUT + 'install-tour.png' });
    console.log('wrote install-tour.png 1000 800');
    await ctx.close();
  }
  if (want('route-live')) {
    let { ctx, page } = await open(browser, { hash: '#route/84009/66009' });
    await idle(page, '#plannerBody');
    await blur(page);
    await el(page, R, 'route-planner-journeys.png');
    await page.click('#plannerBody [data-journey="0"]');
    await idle(page, '#plannerBody');
    await page.waitForTimeout(2500);
    await el(page, R, 'route-planner-journey.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { hash: '#route/84009/75009' }));
    await idle(page, '#plannerBody');
    await blur(page);
    await el(page, R, 'route-planner-direct.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { hash: '#route/84631/66009' }));
    await idle(page, '#plannerBody');
    await blur(page);
    await cardDown(page, R, '#plannerBody .sideHint', 'route-planner-wrong-side.png');
    await ctx.close();
  }
  if (want('route')) {
    let { ctx, page } = await open(browser, { hash: '#route/84009/66009' });
    await page.waitForTimeout(1000);
    await blur(page);
    await cardDown(page, R, '#plannerSection .plannerFields', 'route-planner-ends.png');
    await el(page, '#plannerSection .cardHeader', 'route-planner-save.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { hash: '#route/84009/-' }));
    await page.waitForTimeout(1000);
    await page.click('#routeEnd');
    await page.keyboard.type('tampines', { delay: 60 });
    await page.waitForSelector('#routeEndAc:not([hidden])');
    await page.waitForTimeout(2000);
    await cardDown(page, R, '#routeEndAc', 'route-planner-direct-suggest.png', 8);
    await ctx.close();
  }
  if (want('nav')) {
    let { ctx, page } = await open(browser, { hash: navHash(P.bedokMall, P.raffles) });
    await page.waitForTimeout(800);
    await blur(page);
    await cardDown(page, N, '#navSection .navFields', 'nav-home-work.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { hash: '#nav' }));
    await page.click('#navFrom');
    await page.keyboard.type('Bedok Mall', { delay: 60 });
    await page.waitForSelector('#navFromAc:not([hidden]) [data-place]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await cardDown(page, N, '#navFromAc', 'nav-set-suggest.png', 8);
    await ctx.close();
  }
  if (want('nav-live')) {
    let { ctx, page } = await open(browser, { hash: navHash(P.bedokMall, P.botanic), extra: { sgbus_fav_navs: JSON.stringify([{ from: P.bedokMall, to: P.botanic }, { from: P.bedokMall, to: P.changi }]) } });
    await idle(page, '#navBody', 40000);
    await blur(page);
    await el(page, N, 'nav-ways.png');
    await el(page, '#navSection .cardHeader', 'nav-save.png');
    await page.locator('#navBody [data-nav-option]').first().click();
    await page.waitForTimeout(4000);
    await el(page, N, 'nav-open.png');
    await ctx.close();
  }
  // Which train door to stand at: a change of line, then the way out to a terminal or Jewel.
  if (want('nav-doors')) {
    // In the morning tomorrow, so there are trains whenever it's taken.
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const shoot = async (from, to, name, min) => {
      const { ctx, page } = await open(browser, { width: 420, height: 2600, hash: navHash(from, to, `/arrive/${tomorrow}T10:00`) });
      await idle(page, '#navBody', 40000);
      await blur(page);
      // The first way with door tips on its rides.
      const ways = page.locator('#navBody [data-nav-option]');
      for (let i = 0, n = await ways.count(); i < n; i++) {
        await ways.nth(i).click();
        await page.waitForSelector('#navBody .legDoors', { timeout: 8000 }).catch(() => {});
        if (await page.locator('#navBody .legDoors').count() >= min) break;
        await page.goBack().catch(() => {});
        await idle(page, '#navBody', 20000);
      }
      await page.waitForTimeout(1500);
      // The train rides, from the first to the last with doors.
      const rides = page.locator('#navBody .stepLeg:has(.legDoors)');
      const a = await rides.first().boundingBox();
      const b = await rides.last().boundingBox();
      const c = await page.locator(N).boundingBox();
      await page.screenshot({ path: OUT + name, clip: { x: c.x, y: a.y - 10, width: c.width, height: b.y + b.height + 10 - (a.y - 10) } });
      console.log('wrote', name, Math.round(c.width), Math.round(b.y + b.height + 20 - a.y));
      await ctx.close();
    };
    // Off at Changi Airport, its escalators and lifts to the terminals and Jewel.
    await shoot({ label: 'Tanah Merah Stn', lat: 1.327262, lng: 103.946513 }, { label: 'Jewel Changi Airport', lat: 1.360365, lng: 103.989567 }, 'nav-doors.png', 1);
    // A change of line at MacPherson, then off at Serangoon.
    await shoot({ label: 'Bedok Reservoir Stn', lat: 1.336284, lng: 103.931887 }, { label: 'Serangoon Stn', lat: 1.349807, lng: 103.873771 }, 'nav-doors-change.png', 2);
    // Across the platform at Jurong East.
    await shoot({ label: 'Clementi Stn', lat: 1.3151, lng: 103.765231 }, { label: 'Bukit Batok Stn', lat: 1.349057, lng: 103.749591 }, 'nav-doors-across.png', 1);
  }
  if (want('calendar-nav')) {
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const { ctx, page } = await open(browser, { width: 416, height: 1400, hash: navHash('here', P.punggol, `/arrive/${tomorrow}T19:00`), geo: { latitude: 1.324736, longitude: 103.929256, accuracy: 20 } });
    await idle(page, '#navBody', 40000);
    await blur(page);
    const c = await page.locator(N).boundingBox();
    await page.screenshot({ path: OUT + 'calendar-nav.png', clip: { x: c.x, y: c.y, width: c.width, height: Math.min(c.height, 560) } });
    console.log('wrote calendar-nav.png', Math.round(c.width), Math.round(Math.min(c.height, 560)));
    await ctx.close();
  }
  if (want('places-list')) {
    const { ctx, page } = await open(browser, { width: 416, height: 1000 });
    await page.click('#placesBtn');
    await page.waitForTimeout(500);
    await page.locator('#placesList [data-menu-toggle]').first().click();
    await page.waitForTimeout(600);
    await el(page, '#placesSection .card', 'places-list.png');
    await ctx.close();
  }
  if (want('favourites-save')) {
    const { ctx, page } = await open(browser, { width: 440, height: 900 });
    await page.click('#favsBtn');
    await page.waitForTimeout(600);
    await el(page, '#favsModal .modal', 'favourites-save.png');
    await ctx.close();
  }
  if (want('settings')) {
    const { ctx, page } = await open(browser, { width: 420, height: 3400, extra: { sgbus_birthday: '1998-04-23' } });
    await page.click('#settingsBtn');
    await page.waitForTimeout(500);
    await el(page, '#settingsModal .modal', 'settings-settings.png');
    await ctx.close();
  }
  if (want('tray')) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true });
    await el(page, '#trayButtons', 'trips-tray.png');
    const cdp = await ctx.newCDPSession(page);
    const box = await page.locator('#navBtn').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.waitForTimeout(800);
    const tip = await page.locator('.holdTip').boundingBox();
    await page.screenshot({ path: OUT + 'tray-hold.png', clip: { x: tip.x - 12, y: box.y - 64, width: 390 - (tip.x - 12), height: box.height + 128 } });
    console.log('wrote tray-hold.png');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await ctx.close();
  }
  if (want('tabs')) {
    const { ctx, page } = await open(browser, { width: 420, height: 1000, extra: { sgbus_nav_mode: 'all' } });
    await page.click('#navBtn');
    await page.waitForTimeout(500);
    await blur(page);
    await el(page, N, 'nav-tabs.png');
    await page.click('#navSection [data-nav-mode="bus"]');
    await page.waitForTimeout(500);
    await blur(page);
    await el(page, R, 'route-planner-tab.png');
    await ctx.close();
  }
  if (want('birthday')) {
    // Today in Singapore, where the page's clock is.
    const today = (process.env.STILL ? STILL_AT : new Date()).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }).slice(5);
    const { ctx, page } = await open(browser, { width: 390, height: 844, extra: { sgbus_birthday: `1998-${today}`, sgbus_name: 'Samantha Tan Wei Ling' } });
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + 'settings-birthday.png', clip: { x: 0, y: 0, width: 390, height: 300 } });
    console.log('wrote settings-birthday.png');
    await ctx.close();
  }
  // ---- 2.1.0 ----
  // A stop's buttons and "Will I make it?", from about 500 m away. Live timings.
  if (want('stop-live')) {
    const { ctx, page } = await open(browser, {
      width: 420, height: 1400, hash: '#84009', geo: { latitude: 1.3285, longitude: 103.9335, accuracy: 20 },
      extra: { sgbus_makeit: 'on' },
    });
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => /walk from you/.test(document.querySelector('#makeIt')?.textContent || ''), null, { timeout: 15000 }).catch(() => console.log('no walk line'));
    await page.waitForTimeout(800);
    await cardDown(page, '#resultCard', '#services .svc:nth-of-type(2)', 'timings-make-it.png');
    // The flag-down screen, for the first bus there.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#services [data-flag]').first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + 'timings-flag.png' });
    console.log('wrote timings-flag.png 390 844');
    await ctx.close();
  }
  if (want('board-live')) {
    const { ctx, page } = await open(browser, { width: 1000, height: 600, hash: '#board/84009' });
    await page.waitForSelector('#boardRows .boardRow', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + 'timings-board.png' });
    console.log('wrote timings-board.png 1000 600');
    await ctx.close();
  }
  if (want('app-search')) {
    const { ctx, page } = await open(browser, { width: 420, height: 600, app: true });
    await blur(page);
    await el(page, '.searchWrap', 'search-voice-scan.png');
    await ctx.close();
  }
  const lastBusExtra = {
    sgbus_lastbus: JSON.stringify([
      { code: '84009', name: 'Bedok Int', service: '14', wd: '2330', sat: '2330', sun: '2330' },
      { code: '75009', name: 'Tampines Int', service: '10', wd: '2315', sat: '2315', sun: '2315' },
    ]),
    sgbus_nearstops: JSON.stringify(['84009']),
  };
  if (want('app-reminders')) {
    const { ctx, page } = await open(browser, { width: 420, height: 2600, app: true, extra: lastBusExtra });
    await page.click('#settingsBtn');
    await page.waitForTimeout(1200);
    await el(page, '#remindersSettings', 'android-reminders.png');
    await page.click('#nearStopsBtn');
    await page.waitForTimeout(800);
    await el(page, '#nearStopsModal .modal', 'android-near-stops.png');
    await ctx.close();
  }
  // The bell by a bus's last bus at a stop. Live timings.
  if (want('app-lastbus-live')) {
    const { ctx, page } = await open(browser, { width: 420, height: 1400, hash: '#84009', app: true, extra: lastBusExtra });
    await page.waitForSelector('#services .lastBusBell.on', { timeout: 30000 }).catch(() => console.log('no bell'));
    await page.waitForTimeout(800);
    await el(page, '#services .svc:has(.lastBusBell.on)', 'android-last-bus.png');
    await ctx.close();
  }
  if (want('app-share')) {
    let { ctx, page } = await open(browser, { width: 420, height: 1000, app: true });
    await page.evaluate((p) => Share.place(p), P.raffles);
    await page.waitForSelector('#shareTargets [data-share-to="offline"]:not([disabled])', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    await el(page, '#shareTargets', 'android-share-targets.png');
    await page.click('#shareTargets [data-share-to="offline"]');
    await page.waitForSelector('#offlineBody [data-offline-peer]', { timeout: 10000 }).catch(() => console.log('no phone found'));
    await page.waitForTimeout(800);
    await el(page, '#offlineModal .modal', 'android-offline-sharing.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { width: 420, height: 1000, app: true }));
    await page.click('#receiveBtn');
    await page.waitForTimeout(1200);
    await el(page, '#offlineModal .modal', 'android-receive.png');
    await page.evaluate(() => closeModal('offlineModal'));
    await page.evaluate(() => OfflineShare.sticker({ url: `${location.origin}/#84009`, title: 'Bedok Int (84009)' }));
    await page.waitForTimeout(1000);
    await el(page, '#offlineModal .modal', 'android-sticker.png');
    await ctx.close();
  }
  // ---- 2.2.2 ----
  // Navigate's ways to Johor Bahru and with Restricted areas on need this checkout's /api/nav
  // until it's deployed: serve it locally rather than passing it through to the live site.
  const T1 = { label: 'Changi Airport Ter 1', lat: 1.361057, lng: 103.990812 };
  const LARKIN = { label: 'Larkin Ter', lat: 1.495519, lng: 103.743071 };
  const BEDOK_STN = { label: 'Bedok Stn', lat: 1.32398, lng: 103.92998 };
  const AFC = { label: 'AirFreight Ter Bldg', lat: 1.37228, lng: 103.99465 };
  // A stop narrowed to a wildcard. Live timings.
  if (want('several-live')) {
    const { ctx, page } = await open(browser, { width: 1000, height: 1400, hash: '#84009,22*' });
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await cardDown(page, '#resultCard', '#services', 'search-several.png');
    await ctx.close();
  }
  // A bus going both ways and a loop passing twice, at S'goon Gdn Circus. Live timings.
  if (want('both-ways-live')) {
    const { ctx, page } = await open(browser, { width: 1000, height: 1400, hash: '#66271,136,73' });
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await cardDown(page, '#resultCard', '#services', 'reading-both-ways.png');
    await ctx.close();
  }
  if (want('restricted')) {
    let { ctx, page } = await open(browser, { width: 420, height: 2400 });
    await page.click('#settingsBtn');
    await page.waitForTimeout(500);
    await page.click('[data-restricted="on"]');
    await page.waitForTimeout(300);
    const a = await page.locator('#settingsModal .modal-section-label', { hasText: 'Restricted areas' }).boundingBox();
    const b = await page.locator('[data-restricted]').first().locator('xpath=../following-sibling::p[1]').boundingBox();
    const m = await page.locator('#settingsModal .modal').boundingBox();
    await page.screenshot({ path: OUT + 'settings-restricted.png', clip: { x: m.x, y: a.y - 12, width: m.width, height: b.y + b.height + 12 - (a.y - 12) } });
    console.log('wrote settings-restricted.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { hash: navHash(BEDOK_STN, AFC), extra: { sgbus_restricted: 'on' } }));
    await idle(page, '#navBody', 60000);
    await blur(page);
    await el(page, N, 'nav-restricted.png');
    await ctx.close();
  }
  if (want('johor')) {
    const { ctx, page } = await open(browser, { hash: navHash(T1, LARKIN) });
    await idle(page, '#navBody', 60000);
    await blur(page);
    await el(page, N, 'nav-johor.png');
    await ctx.close();
  }
  // Rides on to SAF Ferry Ter, across the road from the end, rather than off at Changi Beach CP 5.
  if (want('ride-nearer')) {
    const { ctx, page } = await open(browser, { hash: '#route/98101/95099' });
    await idle(page, '#plannerBody');
    await blur(page);
    await el(page, R, 'route-planner-ride-nearer.png');
    await ctx.close();
  }
  // Immigration time in Settings, and a journey across the Causeway with its crossing step.
  if (want('customs')) {
    let { ctx, page } = await open(browser, { width: 420, height: 2600 });
    await page.click('#settingsBtn');
    await page.waitForTimeout(500);
    const a = await page.locator('#settingsModal .modal-section-label', { hasText: 'Immigration time' }).boundingBox();
    const b = await page.locator('.customsPick').locator('xpath=following-sibling::p[1]').boundingBox();
    const m = await page.locator('#settingsModal .modal').boundingBox();
    await page.screenshot({ path: OUT + 'settings-customs.png', clip: { x: m.x, y: a.y - 12, width: m.width, height: b.y + b.height + 12 - (a.y - 12) } });
    console.log('wrote settings-customs.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { hash: '#route/84009/46239' }));
    await idle(page, '#plannerBody');
    await page.click('#plannerBody [data-journey="0"]');
    await idle(page, '#plannerBody');
    await page.waitForTimeout(2500);
    await blur(page);
    await el(page, R, 'route-planner-customs.png');
    await ctx.close();
  }
  // Close on the title's line, on a phone.
  if (want('phone-header')) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, hash: navHash(BEDOK_STN, AFC) });
    await page.waitForTimeout(1500);
    await el(page, '#navSection .cardHeader', 'nav-phone-header.png');
    await ctx.close();
  }
  if (want('app-routines')) {
    const { ctx, page } = await open(browser, {
      width: 420, height: 1600, app: true, extra: {
        sgbus_routines: JSON.stringify([
          { id: 'a1', code: '84009', name: 'Bedok Int', buses: ['14', '60'], time: '0745', days: [1, 2, 3, 4, 5] },
          { id: 'b2', code: '75009', name: 'Tampines Int', buses: [], time: '1830', days: [6, 7] },
        ]),
      },
    });
    await page.click('#routinesTrayBtn');
    await page.waitForTimeout(800);
    await page.locator('#routineList [data-routine-edit="0"]').click();
    await page.waitForTimeout(600);
    await el(page, '#routineModal .modal', 'android-routines-edit.png');
    await ctx.close();
  }
  // The Android app offered in Chrome on Android.
  if (want('app-offer')) {
    const { ctx, page } = await open(browser, {
      width: 412, height: 900, touch: true,
      ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    });
    await page.waitForSelector('.app-update-notice', { timeout: 15000 }).catch(() => console.log('no bar'));
    await page.waitForTimeout(500);
    await el(page, '.app-update-notice', 'android-app-offer.png');
    await ctx.close();
  }
  // Settings' Custom home, and Navigate on show with the pages at the top of the Edge Tray
  // (main-site/js/main-screen.js).
  if (want('main-screen')) {
    let { ctx, page } = await open(browser, { width: 420, height: 3000, extra: {} });
    await settingsGroup(page, 'pages');
    const a = await page.locator('#settingsModal .modal-section-label', { hasText: 'Custom home' }).boundingBox();
    const b = await page.locator('#homePick').locator('xpath=following-sibling::p[1]').boundingBox();
    const m = await page.locator('#settingsModal .modal').boundingBox();
    await page.screenshot({ path: OUT + 'settings-main-screen.png', clip: { x: m.x, y: a.y - 12, width: m.width, height: b.y + b.height + 12 - (a.y - 12) } });
    console.log('wrote settings-main-screen.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { width: 390, height: 844, touch: true, extra: {} }));
    await page.click('[data-part="nav"]');
    await page.waitForTimeout(800);
    await blur(page);
    await page.screenshot({ path: OUT + 'main-screen-tabs.png' });
    console.log('wrote main-screen-tabs.png 390 844');
    await ctx.close();
  }
  // The next bus at a glance, from the saved stops, and its chip's list. Live timings.
  if (want('glance-live')) {
    const { ctx, page } = await open(browser, { width: 390, height: 1400, touch: true });
    await page.waitForSelector('#glanceStops .glanceRow', { timeout: 20000 }).catch(() => console.log('no buses'));
    await page.waitForTimeout(800);
    await cardDown(page, '#glance', '#glanceStops', 'glance.png', 12);
    await page.click('#glanceSource');
    await page.waitForTimeout(300);
    await cardDown(page, '#glance', '#glanceMenu', 'glance-pick.png', 12);
    await ctx.close();
  }
  // The live map (js/map.js, MapLibre over OpenFreeMap): walking to Bedok Int from Bedok North
  // Street 1, its overview, and tilted by two fingers for the buildings in 3D. Live tiles.
  if (want('live-map')) {
    const geo = { latitude: 1.32706, longitude: 103.93069, accuracy: 10 };
    const { ctx, page } = await open(browser, { width: 400, height: 820, touch: true, geo });
    await page.evaluate(() => LiveMap.walkTo({ lat: 1.324539, lng: 103.929038, label: 'Bedok Int' }));
    await page.waitForTimeout(9000);
    await page.screenshot({ path: OUT + 'live-map-walk.png' });
    console.log('wrote live-map-walk.png 400 820');
    // Two fingers dragged up the screen, as a person tilts it.
    const cdp = await ctx.newCDPSession(page);
    const fingers = (y) => [{ x: 160, y, id: 1 }, { x: 240, y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(560) });
    for (let y = 550; y >= 340; y -= 15) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(y) });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: OUT + 'live-map-3d.png' });
    console.log('wrote live-map-3d.png 400 820');
    await page.click('#mapOverview');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: OUT + 'live-map-overview.png' });
    console.log('wrote live-map-overview.png 400 820');
    await ctx.close();
  }
  // The tour's first step, the first time the app opens. Live timings.
  if (want('tour-live')) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, extra: { sgbus_tour: '' } });
    await page.waitForSelector('.tour', { timeout: 20000 }).catch(() => console.log('no tour'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: OUT + 'tour.png' });
    console.log('wrote tour.png 390 844');
    await ctx.close();
  }
  // A page's own tour, the first time it opens: Navigate's.
  if (want('tour-pages')) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, extra: { sgbus_tours: '[]' } });
    await page.click('#navBtn');
    await page.waitForSelector('.tour', { timeout: 20000 }).catch(() => console.log('no tour'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: OUT + 'tour-nav.png' });
    console.log('wrote tour-nav.png 390 844');
    await ctx.close();
  }
  // Explorer's tour, the first time it opens, "you" a street from Dhoby Ghaut.
  if (want('tour-views')) {
    const { ctx, page } = await open(browser, {
      width: 390, height: 844, touch: true, geo: { latitude: 1.2972, longitude: 103.8462 },
      extra: { sgbus_tours: JSON.stringify(['timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'terminal']) },
    });
    await page.click('#explorerBtn');
    await page.waitForSelector('.tour', { timeout: 20000 }).catch(() => console.log('no tour'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: OUT + 'tour-explorer.png' });
    console.log('wrote tour-explorer.png 390 844');
    await ctx.close();
  }
  // Navigate's From and To: a plus code, and a stop by any of its names.
  if (want('nav-finds')) {
    const { ctx, page } = await open(browser, { width: 420, height: 900, hash: '#nav' });
    await page.fill('#navTo', '6PH57RQ8+X2');
    await page.waitForSelector('#navToAc:not([hidden]) .acItem', { timeout: 15000 }).catch(() => console.log('no plus code'));
    await page.waitForTimeout(500);
    await cardDown(page, N, '#navToAc', 'nav-plus-code.png');
    await page.fill('#navTo', '');
    await page.fill('#navFrom', 'block 29 bahagia');
    await page.waitForSelector('#navFromAc:not([hidden]) .acItem', { timeout: 15000 }).catch(() => console.log('no stops'));
    await page.waitForTimeout(500);
    await cardDown(page, N, '#navFromAc', 'nav-any-name.png');
    await ctx.close();
  }
  // The sgbus terminal (main-site/js/terminal.js): opened as the console opens it, a stop's
  // timings and a nav typed at its prompt; on a phone from Settings, with -w's Stop; and its
  // button in Settings.
  if (want('terminal-live')) {
    const type = async (page, cmd) => {
      await page.fill('.termIn', cmd);
      await page.press('.termIn', 'Enter');
      await page.waitForFunction(() => !document.querySelector('.termLine').hidden, null, { timeout: 60000 }).catch(() => console.log('still busy:', cmd));
      await page.waitForTimeout(400);
    };
    let { ctx, page } = await open(browser, { width: 1000, height: 640 });
    await page.evaluate(() => window.sgbus);
    await page.waitForSelector('#terminalModal:not(.hidden) .termIn', { timeout: 15000 });
    await type(page, '84009 14,60');
    await type(page, 'fav');
    await page.waitForTimeout(300);
    await el(page, '.terminal', 'terminal.png');
    await type(page, 'clear');
    await type(page, 'nav home work');
    await el(page, '.terminal', 'terminal-nav.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { width: 390, height: 844, touch: true }));
    await settingsGroup(page, 'help');
    const label = page.locator('#settingsTerminal');
    const box = await page.evaluate(() => {
      const btn = document.getElementById('settingsTerminal');
      btn.scrollIntoView({ block: 'center' });
      const top = btn.previousElementSibling.getBoundingClientRect();
      const bottom = btn.nextElementSibling.getBoundingClientRect();
      const card = btn.closest('.modal').getBoundingClientRect();
      return { x: card.x, y: top.y - 10, width: card.width, height: bottom.bottom + 12 - (top.y - 10) };
    });
    await page.screenshot({ path: OUT + 'terminal-settings.png', clip: box });
    console.log('wrote terminal-settings.png', Math.round(box.width), Math.round(box.height));
    await label.click();
    await page.waitForSelector('#terminalModal:not(.hidden) .termIn', { timeout: 15000 });
    await page.fill('.termIn', '84009 14,60,30 -w');
    await page.press('.termIn', 'Enter');
    await page.waitForSelector('.termStop:not([hidden])', { timeout: 30000 }).catch(() => console.log('no Stop'));
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT + 'terminal-phone.png', clip: { x: 0, y: 0, width: 390, height: 300 } });
    console.log('wrote terminal-phone.png 390 300');
    await ctx.close();
  }
  // Explorer (main-site/js/map.js, js/map-card.js): on a phone, "you" at a stop or a station,
  // which Explorer opens on; the middle of the map is that dot, and a tap there opens its card.
  // Live timings in the stop's pills, so in the day, while buses run.
  if (want('explorer-live')) {
    const stops = await (await fetch(`${SITE}api/bus-stops`)).json();
    const bedok = stops.find((x) => x.c === '84009');
    const spots = [
      { name: 'stop', geo: { latitude: bedok.la, longitude: bedok.lo } },
      { name: 'station', geo: { latitude: 1.298786, longitude: 103.84502 } },
    ];
    for (const spot of spots) {
      const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: spot.geo });
      await page.click('#explorerBtn');
      await page.waitForTimeout(7000);
      const box = await page.locator('#liveMap').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(4000);
      await page.screenshot({ path: OUT + `explorer-${spot.name}.png` });
      console.log(`wrote explorer-${spot.name}.png 390 844`);
      if (spot.name === 'station') {
        await page.click('.mcArrow[data-mc-step="1"]');
        await page.waitForTimeout(800);
        await el(page, '.mcBubble', 'explorer-station-next.png');
      }
      await ctx.close();
    }
    // The overview, "you" a street away, so the station's dot isn't under yours.
    let { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: { latitude: 1.2972, longitude: 103.8462 } });
    await page.click('#explorerBtn');
    await page.waitForTimeout(7000);
    await page.screenshot({ path: OUT + 'explorer.png' });
    console.log('wrote explorer.png 390 844');
    await ctx.close();

    ({ ctx, page } = await open(browser, { width: 420, height: 3400 }));
    await page.click('#settingsBtn');
    await page.waitForTimeout(500);
    await el(page, '#trayExtrasPick', 'explorer-settings.png');
    await ctx.close();
  }
  // ---------- traffic, last buses and other ways (main-site/js/trip.js, js/nav.js, js/map.js) ----------
  // LTA's traffic, the bus timings and Navigate's answers are stood in for here (liveMocks), so
  // each shot has what it's about whenever it's taken: a jam, a last bus, a faster way. The rides
  // are real ones, from the route list; only the live feeds are made up.
  const LIVE_TO = { label: 'Our Tampines Hub', lat: 1.353134, lng: 103.940408 };
  const EWL = [['Bedok', 1.323935, 103.929995], ['Tanah Merah', 1.327262, 103.946513], ['Simei', 1.343179, 103.953376], ['Tampines', 1.353374, 103.945084]];
  // A bus from Bedok Int to Tampines Int, with its stops, from the page's route list.
  const liveRide = (page) => page.evaluate(async () => {
    await BusNet.load(typeof stopsIndex === 'undefined' ? undefined : stopsIndex); // eslint-disable-line no-undef
    for (const no of BusNet.servicesAtStop('84009')) {
      for (const dir of BusNet.directions(no)) {
        const stops = BusNet.runStops(no, dir);
        const i = stops.indexOf('84009');
        const j = i === -1 ? -1 : stops.indexOf('75009', i + 1);
        if (j !== -1 && j - i <= 30) {
          const codes = stops.slice(i, j + 1);
          const at = (c) => stopsIndex[c]; // eslint-disable-line no-undef
          return { route: no, dir, codes, path: codes.map((c) => [at(c).lat, at(c).lng]), names: codes.map((c) => at(c).n) };
        }
      }
    }
    return null;
  });
  // Navigate's answer for Bedok Mall to Our Tampines Hub: the train, and the bus slowed by traffic.
  const liveNav = (ride, { lastBus = null } = {}) => {
    const stop = (i) => ({ kind: 'stop', code: ride.codes[i], name: ride.names[i], lat: ride.path[i][0], lng: ride.path[i][1] });
    const station = ([name, lat, lng]) => ({ kind: 'station', name, lat, lng });
    const busMin = Math.round(ride.codes.length * 1.1);
    const bus = {
      minutes: 4 + 5 + busMin + 6 + 7, mix: 'B', routes: [ride.route],
      legs: [
        { mode: 'walk', metres: 260, minutes: 4, to: stop(0) },
        {
          mode: 'bus', route: ride.route, dir: ride.dir, towards: 'Tampines Int', from: stop(0), to: stop(ride.codes.length - 1), stops: ride.codes.length - 1,
          minutes: busMin + 6, usual: busMin, wait: 5, board: 9, path: ride.path, names: ride.names, codes: ride.codes,
          ...(lastBus && { lastBus }),
          traffic: { extra: 6, roads: ['Tampines Avenue 7', 'Bedok North Road'], incidents: [{ type: 'Vehicle breakdown', message: '(25/10)18:02 Vehicle breakdown on Tampines Avenue 7 (towards Tampines Avenue 5).', lat: ride.path[Math.floor(ride.path.length * 0.6)][0], lng: ride.path[Math.floor(ride.path.length * 0.6)][1] }] },
        },
        { mode: 'walk', metres: 520, minutes: 7, to: { kind: 'place' } },
      ],
    };
    const train = {
      minutes: 23, mix: 'T', routes: ['EW'],
      legs: [
        { mode: 'walk', metres: 150, minutes: 4, to: station(EWL[0]) },
        { mode: 'train', route: 'EW', name: 'East-West Line', color: '#009645', towards: 'Pasir Ris', from: station(EWL[0]), to: station(EWL[3]), stops: 3, minutes: 8, wait: 3, board: 7, path: EWL.map(([, a, b]) => [a, b]), names: EWL.map(([n]) => n) },
        { mode: 'walk', metres: 650, minutes: 8, to: { kind: 'place' } },
      ],
    };
    return { options: [train, bus], onemap: false, alerts: { lines: [] }, when: { mode: 'leave', ms: Date.now() }, traffic: { at: Date.now() - 2 * 60000 }, others: { cycle: { minutes: 17, distance: 4300 } } };
  };
  // The live feeds, made up: Navigate (above), the traffic on a road (orange then red partway,
  // or clear where Navigate's bus has none), and each bus's next arrivals (`etas`, minutes by
  // service).
  async function liveMocks(ctx, ride, { nav = liveNav(ride), etas = {} } = {}) {
    await ctx.route(/\/api\/nav\?/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(nav) }));
    await ctx.route(/\/api\/traffic\?/, (r) => {
      const n = decodeURIComponent(new URL(r.request().url()).searchParams.get('points')).split(';').length - 1;
      const jam = nav.options[1]?.legs[1]?.traffic;
      const flows = Array.from({ length: n }, (_, i) => (!jam ? 1 : i < n * 0.35 ? 0.9 : i < n * 0.5 ? 0.6 : i < n * 0.7 ? 0.3 : i < n * 0.8 ? 0.55 : 0.85));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        at: Date.now() - 2 * 60000, flows, factors: flows.map((f) => Math.min(1.6, 1 + 0.6 * (1 - f))), roads: jam ? ['Tampines Avenue 7', 'Bedok North Road'] : [],
        incidents: jam?.incidents || [],
      }) });
    });
    await ctx.route(/\/api\/bus-arrivals\?/, (r) => {
      const q = new URL(r.request().url()).searchParams;
      const services = Object.entries(etas).filter(([no]) => !q.get('service') || q.get('service') === no)
        .map(([no, m]) => ({ serviceNo: no, operator: 'SBST', next: { eta_ms: m[0] * 60000, deck: 'Double', load: 'SEA' }, next2: m[1] != null ? { eta_ms: m[1] * 60000, deck: 'Single', load: 'SEA' } : null, next3: null }));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ services }) });
    });
  }
  const bedokGeo = { latitude: 1.324736, longitude: 103.929256 };
  // A trip from Navigate's bus way (so its usual minutes come too), started on the page. Late at
  // night the bus's real last bus would be said too, so it's said only where it's the subject
  // (`last`, with BusNet.lastBuses stood in for first).
  const startLiveTrip = (page, nav, { k = 1, last = false } = {}) => page.evaluate(({ nav, k, to, last }) => {
    if (!last) BusNet.lastBuses = () => null;
    const trip = tripFromNav(nav.options[k], to, { label: 'Bedok Mall', lat: 1.324736, lng: 103.929256 }); // eslint-disable-line no-undef
    Trip.start(trip);
  }, { nav, k, to: LIVE_TO, last });
  const bar = (page, name) => el(page, '#tripBar', name);

  // Navigate with the traffic: the ways, cycling, one way's bus slowed, and its road on the map.
  if (want('nav-traffic')) {
    const { ctx, page } = await open(browser, { width: 390, height: 1400, touch: true, geo: bedokGeo, extra: { sgbus_bike: 'on' } });
    const ride = await liveRide(page);
    await liveMocks(ctx, ride, { nav: liveNav(ride, { lastBus: '23:48' }), etas: { [ride.route]: [5, 17] } });
    await page.evaluate(([a, b]) => { location.hash = `#nav/${a}/${b}`; }, [enc(P.bedokMall), enc(LIVE_TO)]);
    await idle(page, '#navBody');
    await blur(page);
    // The ways, from the line saying how many down to the note under them.
    const top = await page.locator('#navBody > :first-child').boundingBox();
    const body = await page.locator('#navBody').boundingBox();
    await page.screenshot({ path: OUT + 'nav-traffic.png', clip: { x: body.x - 8, y: top.y - 10, width: body.width + 16, height: body.y + body.height + 10 - (top.y - 10) } });
    console.log('wrote nav-traffic.png', Math.round(body.width + 16));
    await page.click('[data-nav-option="1"]');
    await page.waitForTimeout(1500);
    await el(page, '#navBody .stepLeg:has(.legTraffic)', 'nav-leg-traffic.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('.legTraffic');
    await page.waitForTimeout(9000);
    await page.screenshot({ path: OUT + 'live-map-traffic.png' });
    console.log('wrote live-map-traffic.png 390 844');
    await ctx.close();
  }
  // Settings' Cycling.
  if (want('cycling')) {
    const { ctx, page } = await open(browser, { width: 420, height: 2800, extra: { sgbus_bike: 'on' } });
    await page.click('#settingsBtn');
    await page.waitForTimeout(500);
    const a = await page.locator('#settingsModal .modal-section-label', { hasText: 'Cycling' }).boundingBox();
    const b = await page.locator('[data-bike="on"]').locator('xpath=../following-sibling::p[1]').boundingBox();
    const m = await page.locator('#settingsModal .modal').boundingBox();
    await page.screenshot({ path: OUT + 'settings-cycling.png', clip: { x: m.x, y: a.y - 12, width: m.width, height: b.y + b.height + 12 - (a.y - 12) } });
    console.log('wrote settings-cycling.png');
    await ctx.close();
  }
  // On a trip: the traffic on the bus ahead, a faster way, the last bus, a switch made by
  // itself, and Change here.
  if (want('trip-live')) {
    // The bus slowed by traffic, and a faster way while you wait 16 min for it.
    let { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: bedokGeo });
    let ride = await liveRide(page);
    let nav = liveNav(ride);
    await liveMocks(ctx, ride, { nav, etas: { [ride.route]: [16, 30] } });
    await startLiveTrip(page, nav);
    await page.waitForTimeout(4000);
    await bar(page, 'trip-traffic.png');
    // The faster way's checked on the trip's tick, every 15 s.
    await page.waitForSelector('#tripFaster:not([hidden])', { timeout: 40000 }).catch(() => console.log('no faster way'));
    await page.waitForTimeout(800);
    await bar(page, 'trip-faster.png');
    await ctx.close();

    // The last bus soon: its last from here 25 min away, with its next three in 6, 17 and 28.
    ({ ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: bedokGeo }));
    ride = await liveRide(page);
    nav = liveNav(ride);
    nav.options[1].legs[1].traffic = undefined;
    await liveMocks(ctx, ride, { nav, etas: { [ride.route]: [6, 17, 28] } });
    await page.evaluate((route) => {
      const t = new Date(Date.now() + 8 * 3600e3 + 25 * 60e3);
      const hhmm = String(t.getUTCHours()).padStart(2, '0') + String(t.getUTCMinutes()).padStart(2, '0');
      BusNet.lastBuses = (no) => (no === route ? { wd: hhmm, sat: hhmm, sun: hhmm } : null);
    }, ride.route);
    await startLiveTrip(page, nav, { last: true });
    await page.waitForSelector('#tripWarn:not([hidden])', { timeout: 40000 }).catch(() => console.log('no last bus warning'));
    await page.waitForTimeout(800);
    await bar(page, 'trip-last-bus.png');
    await ctx.close();

    // Its last bus gone, and the trip switched to the train by itself.
    ({ ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: bedokGeo }));
    ride = await liveRide(page);
    nav = liveNav(ride);
    await liveMocks(ctx, ride, { nav, etas: {} });
    await page.evaluate((route) => {
      const t = new Date(Date.now() + 8 * 3600e3 - 10 * 60e3);
      const hhmm = String(t.getUTCHours()).padStart(2, '0') + String(t.getUTCMinutes()).padStart(2, '0');
      BusNet.lastBuses = (no) => (no === route ? { wd: hhmm, sat: hhmm, sun: hhmm } : null);
    }, ride.route);
    await startLiveTrip(page, nav, { last: true });
    await page.waitForFunction(() => /Switched/.test(document.querySelector('#tripWarn')?.textContent || ''), null, { timeout: 40000 }).catch(() => console.log('no switch'));
    await page.waitForTimeout(800);
    await bar(page, 'trip-switched.png');
    await ctx.close();

    // Change here: the timeline's stops, and the ways on from one.
    ({ ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: bedokGeo }));
    ride = await liveRide(page);
    nav = liveNav(ride);
    nav.options[1].legs[1].traffic = undefined;
    // Off at Tanah Merah Stn Exit 2, for the train from there.
    const station = ([name, lat, lng]) => ({ kind: 'station', name, lat, lng });
    const fromTanahMerah = {
      minutes: 19, mix: 'T', routes: ['EW'],
      legs: [
        { mode: 'walk', metres: 140, minutes: 2, to: station(EWL[1]) },
        { mode: 'train', route: 'EW', name: 'East-West Line', color: '#009645', towards: 'Pasir Ris', from: station(EWL[1]), to: station(EWL[3]), stops: 2, minutes: 6, wait: 3, board: 5, path: EWL.slice(1).map(([, a, b]) => [a, b]), names: EWL.slice(1).map(([n]) => n) },
        { mode: 'walk', metres: 650, minutes: 8, to: { kind: 'place' } },
      ],
    };
    await liveMocks(ctx, ride, { nav: { ...nav, options: [fromTanahMerah] }, etas: { [ride.route]: [3, 14] } });
    await startLiveTrip(page, nav);
    await page.waitForTimeout(3000);
    await page.click('#tripBar .tripBarInner');
    await page.waitForTimeout(1200);
    await page.click('[data-tl-change-mode="on"]');
    await page.waitForTimeout(600);
    await bar(page, 'trip-change-timeline.png');
    const atTanahMerah = page.locator('.tlStop', { hasText: 'Tanah Merah' }).locator('[data-tl-change]');
    await ((await atTanahMerah.count()) ? atTanahMerah.first() : page.locator('[data-tl-change]').nth(3)).click();
    await page.waitForSelector('.tripChangeWay', { timeout: 20000 }).catch(() => console.log('no ways on'));
    await page.waitForTimeout(800);
    await bar(page, 'trip-change-ways.png');
    // The way picked: the trip changed, with Undo.
    await page.click('[data-trip-change="0"]');
    await page.waitForTimeout(1500);
    await bar(page, 'trip-changed.png');
    await ctx.close();
  }
  // A bus's own refresh, under Flag, on its card in a stop's timings.
  if (want('svc-refresh')) {
    const { ctx, page } = await open(browser, { width: 390, height: 1400, touch: true });
    const ride = await liveRide(page);
    await liveMocks(ctx, ride, { etas: { [ride.route]: [4, 15], 60: [7, 19] } });
    await page.evaluate(() => { location.hash = '#84009'; });
    await page.waitForSelector('#services .svc', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await el(page, '#services .svc', 'timings-svc-refresh.png');
    await ctx.close();
  }
  // The Newsfeed (main-site/js/alerts.js, api/notices.js): Service alerts' part for it, its
  // notification choice, and a stop's note when its buses skip it. NOTICES=<file> stands a saved
  // /api/notices in for the live one, as before the site has it; otherwise it's the live one.
  if (want('newsfeed')) {
    const saved = process.env.NOTICES ? require('fs').readFileSync(process.env.NOTICES, 'utf8') : null;
    const { ctx, page } = await open(browser, { width: 420, height: 2400, extra: { sgbus_favs_v2: JSON.stringify([{ code: '03501', name: 'Marina Bay Sands Theatre' }, { code: '84009', name: 'Bedok Int' }]) } });
    if (saved) await ctx.route(/\/api\/notices/, (r) => r.fulfill({ contentType: 'application/json', body: saved }));
    await page.click('#alertsBtn');
    await page.waitForFunction(() => /Newsfeed/.test(document.querySelector('#alertsBody')?.textContent || ''), null, { timeout: 30000 }).catch(() => console.log('no newsfeed'));
    await page.waitForTimeout(1200);
    const head = page.locator('#alertsBody .alertsHead', { hasText: 'Newsfeed' });
    const a = await head.boundingBox();
    const b = await page.locator('#alertsBody').boundingBox();
    const m = await page.locator('#alertsSection .card').boundingBox();
    await page.screenshot({ path: OUT + 'alerts-newsfeed.png', clip: { x: m.x, y: a.y - 12, width: m.width, height: b.y + b.height + 12 - (a.y - 12) } });
    console.log('wrote alerts-newsfeed.png');
    const l = await page.locator('#alertNewsfeedLabel').boundingBox();
    const t = await page.locator('[data-alert-kind="newsfeed"]').boundingBox();
    await page.screenshot({ path: OUT + 'alerts-newsfeed-modes.png', clip: { x: m.x, y: l.y - 10, width: m.width, height: t.y + t.height + 12 - (l.y - 10) } });
    console.log('wrote alerts-newsfeed-modes.png');
    await page.evaluate(() => Alerts.close());
    // A stop its buses skip today.
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.evaluate(() => { location.hash = '#03501'; });
    await page.waitForSelector('#stopAside .noticeNote', { timeout: 20000 }).catch(() => console.log('no stop note'));
    await page.waitForTimeout(800);
    await cardDown(page, '#resultCard', '#stopAside', 'timings-newsfeed-note.png');
    await ctx.close();
  }
  // ---------- help desk #13 (always still) ----------
  const stopsList = async () => (await stillNet(), (await (await fetch(`${SITE}api/bus-stops`)).json()));
  const geoOf = (stops, code) => { const x = stops.find((y) => y.c === code); return { latitude: x.la, longitude: x.lo, accuracy: 10 }; };
  const exploreOpen = async (page, ms = 7000) => {
    await page.click('#explorerBtn');
    await page.waitForFunction(() => window.LiveMap?.mode() === 'explore', null, { timeout: 15000 });
    await page.waitForTimeout(ms);
  };
  const tapMiddle = async (page) => {
    const box = await page.locator('#liveMap').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(4000);
  };
  // Stops near me, a card on Bus timings while no stop's open (main-site/script.js), "you" at
  // Bedok Mall with location allowed.
  if (want('near-me')) {
    const { ctx, page } = await open(browser, {
      width: 440, height: 1400, touch: true, geo: { latitude: 1.324736, longitude: 103.929256, accuracy: 10 }, still: true,
      extra: { sgbus_glance_near: '1' },
    });
    await page.click('#timingsBtn');
    await page.waitForSelector('#nearStops:not([hidden]) #nearStopsBody [data-stop]', { timeout: 20000 }).catch(() => console.log('no stops near'));
    await page.waitForTimeout(800);
    await blur(page);
    await el(page, '#nearStops', 'search-near-me.png');
    // Before location's allowed: the button that asks.
    await ctx.close();
    const second = await open(browser, { width: 440, height: 1400, touch: true, still: true });
    await second.page.click('#timingsBtn');
    await second.page.waitForTimeout(800);
    await el(second.page, '#nearStops', 'search-near-me-ask.png');
    await second.ctx.close();
  }
  // Report a bug (main-site/js/bug-report.js), from Settings' Help and extras: its button, the
  // form filled in with what's sent with it, and sent, /api/bug-report stood in for as it
  // answers once the site's set up. Chrome on an Android phone.
  if (want('bug-report')) {
    const ua = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, ua, hash: '#84009', still: true });
    let sent = null;
    await ctx.route(/\/api\/bug-report$/, (r) => { sent = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    // The site's version as its service worker says it, the first time the form opens.
    await page.evaluate(async () => { await navigator.serviceWorker?.ready; });
    if (!(await page.evaluate(() => !!navigator.serviceWorker?.controller))) {
      await page.reload();
      await page.waitForTimeout(1500);
    }
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => console.log('no timings'));
    await settingsGroup(page, 'help');
    const box = await page.evaluate(() => {
      const btn = document.getElementById('settingsBug');
      btn.scrollIntoView({ block: 'center' });
      const top = btn.previousElementSibling.getBoundingClientRect();
      const bottom = btn.nextElementSibling.getBoundingClientRect();
      const card = btn.closest('.modal').getBoundingClientRect();
      return { x: card.x, y: top.y - 10, width: card.width, height: bottom.bottom + 12 - (top.y - 10) };
    });
    await page.screenshot({ path: OUT + 'bug-report-settings.png', clip: box });
    console.log('wrote bug-report-settings.png', Math.round(box.width), Math.round(box.height));
    await page.click('#settingsBug');
    await page.waitForTimeout(2500);
    await page.fill('#bugText', "Bus 60's timings at Bedok Int showed Arr for 5 minutes, but the bus didn't come till 8 minutes later.");
    await page.fill('#bugContact', '@sam_tan');
    await blur(page);
    await page.waitForTimeout(400);
    await el(page, '#bugModal .modal', 'bug-report.png');
    await page.click('#bugSend');
    await page.waitForFunction(() => /Sent/.test(document.querySelector('#bugStatus')?.textContent || ''), null, { timeout: 10000 }).catch(() => console.log('not sent'));
    await page.waitForTimeout(400);
    await blur(page);
    await el(page, '#bugModal .modal', 'bug-report-sent.png');
    console.log('sent', JSON.stringify(sent));
    await ctx.close();
  }
  // Explorer back on the stop it was left from (main-site/js/map.js): Tampines Int's Show bus
  // timings, then Explorer again from Bedok, a few km away.
  if (want('explorer-back')) {
    const stops = await stopsList();
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: geoOf(stops, '75009'), still: true });
    await exploreOpen(page);
    await tapMiddle(page);
    await page.click('#mapPanel .mapCard .mcGo[data-mc-timings]');
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => console.log('no timings'));
    await ctx.setGeolocation({ latitude: 1.324736, longitude: 103.929256, accuracy: 10 });
    await page.waitForTimeout(1000);
    await exploreOpen(page, 6000);
    await page.screenshot({ path: OUT + 'explorer-back.png' });
    console.log('wrote explorer-back.png 390 844');
    await ctx.close();
  }
  // Campus shuttles (main-site/js/campus.js): NUS's routes along their roads (/api/road, from the
  // live site through serve.cjs), an LTA stop the shuttles share on Explorer and on Bus timings,
  // a campus-only stop, and NTU's routes. A Friday morning in term (STILL_AT).
  if (want('campus')) {
    const stops = await stopsList();
    let { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: geoOf(stops, '16181'), still: true, mapHook: true });
    await exploreOpen(page, 9000);
    await tapMiddle(page);
    await page.screenshot({ path: OUT + 'explorer-campus-stop.png' });
    console.log('wrote explorer-campus-stop.png 390 844');
    await page.evaluate(() => window.MapCard?.close());
    await page.evaluate(() => window.__map?.jumpTo({ center: [103.7745, 1.2985], zoom: 14.6 }));
    await page.waitForTimeout(7000);
    await page.screenshot({ path: OUT + 'explorer-campus.png' });
    console.log('wrote explorer-campus.png 390 844');
    await ctx.close();

    // Kent Vale, a stop of NUS's own.
    ({ ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: { latitude: 1.302182, longitude: 103.769265, accuracy: 10 }, still: true }));
    await exploreOpen(page, 9000);
    await tapMiddle(page);
    await page.screenshot({ path: OUT + 'explorer-campus-own.png' });
    console.log('wrote explorer-campus-own.png 390 844');
    await ctx.close();

  }
  // NTU's, "you" in the middle of its campus, which Explorer keeps in the middle.
  if (want('campus-ntu')) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: { latitude: 1.3462, longitude: 103.6853, accuracy: 10 }, still: true, mapHook: true });
    await exploreOpen(page, 5000);
    await page.evaluate(() => window.__map?.jumpTo({ center: [103.6853, 1.3462], zoom: 14.5 }));
    await page.waitForTimeout(8000);
    await page.screenshot({ path: OUT + 'explorer-campus-ntu.png' });
    console.log('wrote explorer-campus-ntu.png 390 844');
    await ctx.close();
  }
  // Bus timings at Ctrl Lib: its buses, then the shuttles under them.
  if (want('campus-timings')) {
    const { ctx, page } = await open(browser, { width: 420, height: 2400, hash: '#16181', still: true });
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => console.log('no timings'));
    await page.waitForSelector('#campusSvc:not([hidden]) .campusRow', { timeout: 20000 }).catch(() => console.log('no shuttles'));
    await page.waitForTimeout(1200);
    await blur(page);
    await cardDown(page, '#resultCard', '#campusSvc', 'timings-campus.png');
    await ctx.close();
  }
  // Explorer's Save the map (main-site/js/map-save.js): its sheet before a download.
  if (want('map-save')) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: { latitude: 1.3040, longitude: 103.8320, accuracy: 10 }, still: true });
    await exploreOpen(page);
    await page.click('#mapSave');
    await page.waitForFunction(() => !/…/.test(document.querySelector('#mapSaveBody')?.textContent || '…'), null, { timeout: 30000 }).catch(() => console.log('no estimate'));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + 'explorer-save-map.png' });
    console.log('wrote explorer-save-map.png 390 844');
    await ctx.close();
  }
  // Settings' Bus times on Clock time (main-site/script.js, etaText): the setting, then a stop's
  // timings and Glance with each bus as the time it comes. Always still, so the times read the
  // same whenever they're taken.
  if (want('bus-times')) {
    const clock = { sgbus_times: 'clock' };
    let { ctx, page } = await open(browser, { width: 420, height: 2800, extra: clock, still: true });
    await settingsGroup(page, 'pages');
    const a = await page.locator('#settingsModal .modal-section-label', { hasText: 'Bus times' }).boundingBox();
    const b = await page.locator('[data-times="clock"]').locator('xpath=../following-sibling::p[1]').boundingBox();
    const m = await page.locator('#settingsModal .modal').boundingBox();
    await page.screenshot({ path: OUT + 'settings-bus-times.png', clip: { x: m.x, y: a.y - 12, width: m.width, height: b.y + b.height + 12 - (a.y - 12) } });
    console.log('wrote settings-bus-times.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { width: 420, height: 1400, hash: '#84009', extra: clock, still: true }));
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => console.log('no buses'));
    await page.waitForTimeout(800);
    await blur(page);
    await cardDown(page, '#resultCard', '#services .svc:nth-of-type(2)', 'timings-clock-times.png');
    await ctx.close();

    ({ ctx, page } = await open(browser, { width: 390, height: 1400, touch: true, extra: clock, still: true }));
    await page.waitForSelector('#glanceStops .glanceRow', { timeout: 20000 }).catch(() => console.log('no buses'));
    await page.waitForTimeout(800);
    await cardDown(page, '#glance', '#glanceStops', 'glance-clock-times.png', 12);
    await ctx.close();
  }
  // Back to Navigate on a trip's timeline (main-site/js/trip.js): a trip started from Navigate's
  // bus way with its Start trip, the timeline with Back to Navigate beside Change my way, and
  // Navigate opened again on that way over the page, the trip bar below.
  if (want('trip-back-nav')) {
    const { ctx, page } = await open(browser, { width: 390, height: 844, touch: true, geo: bedokGeo });
    const ride = await liveRide(page);
    const nav = liveNav(ride);
    nav.options[1].legs[1].traffic = undefined;
    await liveMocks(ctx, ride, { nav, etas: { [ride.route]: [3, 14] } });
    await page.evaluate(() => { BusNet.lastBuses = () => null; });
    await page.evaluate(([a, b]) => { location.hash = `#nav/${a}/${b}`; }, [enc(P.bedokMall), enc(LIVE_TO)]);
    await idle(page, '#navBody');
    await page.click('[data-nav-option="1"]');
    await page.waitForTimeout(1500);
    await page.click('[data-nav-action="trip"]');
    await page.waitForTimeout(3000);
    await page.click('#tripBar .tripBarInner');
    await page.waitForTimeout(1200);
    await bar(page, 'trip-back-nav-timeline.png');
    // Tall enough for both ends and the way above the trip bar.
    await page.setViewportSize({ width: 390, height: 1500 });
    await page.click('[data-tl-origin]');
    await page.waitForTimeout(1500);
    await blur(page);
    await page.evaluate(() => document.querySelector('#navSection').scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + 'trip-back-nav.png' });
    console.log('wrote trip-back-nav.png 390 1500');
    await ctx.close();
  }
  await browser.close();
})();
