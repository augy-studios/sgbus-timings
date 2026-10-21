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
const enc = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}~${encodeURIComponent(p.label)}`;
const navHash = (a, b, when = '') => `#nav/${a === 'here' ? 'here' : enc(a)}/${enc(b)}${when}`;

const STATE = {
  sgbus_name: 'Sam',
  sgbus_hold_hint: '1',
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

// `ua`: a browser to be, such as Chrome on Android for the app's download bar.
async function open(browser, { width = 1000, height = 1200, hash = '', extra = {}, geo = null, touch = false, app = false, ua = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 3, isMobile: touch, hasTouch: touch, colorScheme: 'light', locale: 'en-SG', timezoneId: 'Asia/Singapore',
    ...(ua && { userAgent: ua }),
    ...(geo && { geolocation: geo, permissions: ['geolocation'] }),
  });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1|https:\/\/fonts\.(googleapis|gstatic)\.com)/, (r) => r.abort());
  // A share card makes a short link: a made-up one here, not a real one on the live site.
  await ctx.route(/\/api\/share$/, (r) => (r.request().method() === 'POST'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'k3v9q2x7ma', path: '/go/k3v9q2x7ma' }) })
    : r.continue()));
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
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const R = '#plannerSection .card';
  const N = '#navSection .card';

  if (want('install-tour')) {
    const { ctx, page } = await open(browser, { width: 1000, height: 604, hash: '#84009' });
    await page.waitForSelector('#services .svc', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: OUT + 'install-tour.png' });
    console.log('wrote install-tour.png 1000 604');
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
    const { ctx, page } = await open(browser, { width: 420, height: 2000, extra: { sgbus_birthday: '1998-04-23' } });
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
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }).slice(5);
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
  await browser.close();
})();
