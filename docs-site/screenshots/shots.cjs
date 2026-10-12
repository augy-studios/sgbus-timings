// The guide's screenshots, at 3x, from this checkout's main-site with live data: start
// serve.cjs first, then from docs-site/, `node screenshots/shots.cjs [group ...]` (every group
// without any). Then `python3 screenshots/sizes.py <names>` to set their sizes in the pages.
// Take the ones with live timings (*-live, install-tour) in the day, while buses run.
// Needs Playwright (npm i -g playwright, or Chromium where Playwright finds it).
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

async function open(browser, { width = 1000, height = 1200, hash = '', extra = {}, geo = null, touch = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 3, isMobile: touch, hasTouch: touch, colorScheme: 'light', locale: 'en-SG', timezoneId: 'Asia/Singapore',
    ...(geo && { geolocation: geo, permissions: ['geolocation'] }),
  });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1|https:\/\/fonts\.(googleapis|gstatic)\.com)/, (r) => r.abort());
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
  const browser = await chromium.launch();
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
  await browser.close();
})();
