// 3 November 2026's Navigate changes and the Android app's language, in Chrome under Playwright,
// from this checkout (main-site/js/nav.js, js/nav-core/router.js, js/sync.js, js/i18n.js,
// js/app-bridge.js):
//
//   node scripts/nav-exits-doors-saved-test.cjs
//
// Needs Playwright as scripts/coins-modes-feats-test.cjs does. Nothing is fetched: /api/nav is
// answered by this checkout's own router over the real rail network (data/rail.json, trains
// only), /api/mrt-doors by scripts/fixtures/mrt-doors-sample.json, and the Android app by a
// stand-in window.Capacitor. SHOTS=<dir> keeps a screenshot of each step.
//
// What it checks:
//   1. Doors: a train ride's doors panel starts folded to its heading ("Changing at MacPherson
//      for the Circle Line"), opens and folds again on a tap of the heading, and stays open when
//      the way is drawn again (Refresh).
//   2. Exits: the walk to a station names the exit nearest the start ("Tampines station, Exit
//      B"), the walk out of one says which exit to leave by, Directions go to the exit's point,
//      not the station's middle, and a trip started from the way walks to and from the exits.
//   3. Saved navs keep their stop on the way: Save nav with a stop saves it with the stop,
//      Favourites shows it as A → stop → B, opening it puts the stop back, the same two ends
//      without the stop aren't saved, and sync carries the stop (cleanFavs, mergeFavs) and
//      keeps A → B and A → stop → B apart.
//   4. The Android app's language (2.3.1, "applang"): the page opens in the app's language,
//      follows a change made in Android's settings while open, tells the app when Language is
//      picked in the page, gives an app with none set the page's choice, and drops its own
//      choice for Android's "System default". An app without "applang" is never asked.
//   5. No page errors.
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

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
const SHOTS = process.env.SHOTS && path.resolve(process.env.SHOTS);
const DOORS = fs.readFileSync(path.join(__dirname, 'fixtures/mrt-doors-sample.json'), 'utf8');

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

const HUB = { label: 'Our Tampines Hub', lat: 1.353134, lng: 103.940408 };
const NEX = { label: 'NEX', lat: 1.350639, lng: 103.87219 };
const GYM = { label: 'Bedok Mall', lat: 1.324736, lng: 103.929256 };
const enc = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}~${encodeURIComponent(p.label)}`;

// This checkout's router over the real rail network, trains only: /api/nav's answer.
let core = null;
async function router() {
  if (core) return core;
  const imp = (f) => import(pathToFileURL(path.join(SITE, 'js/nav-core', f)).href);
  const [{ buildGraph }, { plan }, { joinWays }] = await Promise.all([imp('network.js'), imp('router.js'), imp('via.js')]);
  const rail = JSON.parse(fs.readFileSync(path.join(SITE, 'data/rail.json'), 'utf8'));
  const graph = buildGraph(rail, [], { runs: {}, services: {} });
  core = (q) => {
    const pt = (s) => { const [lat, lng] = s.split(',').map(Number); return { lat, lng }; };
    const from = pt(q.get('from'));
    const to = pt(q.get('to'));
    if (q.get('via')) {
      const via = pt(q.get('via'));
      return { options: joinWays(plan(graph, from, via), plan(graph, via, to), via), onemap: false, alerts: { lines: [] }, others: {} };
    }
    return { options: plan(graph, from, to), onemap: false, alerts: { lines: [] }, others: {} };
  };
  return core;
}

// The Android app as the page sees it: answers kept in sessionStorage, so they last a reload,
// and every call to SgBus.setLanguage logged there. `emit` in the page sends an event.
function fakeApp(info) {
  const KEY = 'fakeApp';
  const state = JSON.parse(sessionStorage.getItem(KEY) || 'null') || { lang: info.lang ?? '', calls: [] };
  const save = () => sessionStorage.setItem(KEY, JSON.stringify(state));
  save();
  const listeners = {};
  window.__fakeApp = {
    state: () => JSON.parse(sessionStorage.getItem(KEY)),
    emit(plugin, event, data) { (listeners[`${plugin}.${event}`] || []).forEach((fn) => fn(data)); },
    setLang(lang) { state.lang = lang; save(); },
  };
  window.Capacitor = {
    getPlatform: () => 'android',
    nativePromise(plugin, method, options = {}) {
      if (plugin === 'SgBus' && method === 'info') return Promise.resolve({ version: '2.3.1', versionCode: 26, android: 35, features: info.features, lang: state.lang });
      if (plugin === 'SgBus' && method === 'setLanguage') {
        state.calls.push(options.lang);
        state.lang = options.lang;
        save();
        return Promise.resolve({ lang: state.lang });
      }
      return Promise.resolve({});
    },
    addListener(plugin, event, fn) {
      (listeners[`${plugin}.${event}`] ||= []).push(fn);
      return { remove() {} };
    },
  };
}

async function site(browser, { state = {}, app = null, width = 400, height = 900, scale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-SG' });
  await context.addInitScript((state) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const base = {
      sgbus_first_run: 'done', sgbus_tour: 'done',
      sgbus_tours: JSON.stringify(['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']),
      sgbus_retrofit: JSON.stringify({ at: 0, trips: 0, coins: 0, feats: [] }),
    };
    for (const [k, v] of Object.entries({ ...base, ...state })) if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  }, state);
  if (app) await context.addInitScript(fakeApp, app);
  const plan = await router();
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/nav') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plan(url.searchParams)) });
    if (url.pathname === '/api/mrt-doors') return route.fulfill({ status: 200, contentType: 'application/json', body: DOORS });
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
  await page.waitForFunction(() => window.MainScreen && window.I18n && window.AppBridge);
  return { context, page, errors };
}

const navTo = async (page, hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForSelector('#navBody [data-nav-option]', { timeout: 20000 });
};
const shot = async (page, name, sel = '#navSection .card') => {
  if (!SHOTS) return;
  await page.locator(sel).first().screenshot({ path: path.join(SHOTS, name) });
};

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const plan = await router();
  const ways = plan(new URLSearchParams({ from: `${HUB.lat},${HUB.lng}`, to: `${NEX.lat},${NEX.lng}` })).options;
  const way = ways[0];
  const firstWalk = way.legs[0];
  const lastWalk = way.legs.at(-1);
  ok('0. the router plans Our Tampines Hub to NEX by the Downtown and Circle lines', way.legs.filter((l) => l.mode === 'train').map((l) => l.route).join() === 'DT,CC', way.legs.map((l) => l.route || l.mode).join(' '));
  ok('0. with an exit at each end', !!firstWalk.toExit?.name && !!lastWalk.fromExit?.name, `${firstWalk.toExit?.name} ${lastWalk.fromExit?.name}`);

  // ---- 1, 2. Doors and exits ----
  {
    const { context, page, errors } = await site(browser, { height: 2200 });
    await navTo(page, `#nav/${enc(HUB)}/${enc(NEX)}`);
    await page.click('#navBody [data-nav-option="0"]');
    await page.waitForSelector('#navBody .legDoors', { timeout: 10000 });
    const panels = await page.$$eval('#navBody .legDoors', (els) => els.map((e) => ({ tag: e.tagName, open: e.open, head: e.querySelector('summary')?.textContent.trim() || '' })));
    ok('1. a doors panel for each train ride, folded to its heading', panels.length === 2 && panels.every((p) => p.tag === 'DETAILS' && !p.open), JSON.stringify(panels));
    ok('1. the heading says the change', panels[0]?.head === 'Changing at MacPherson for the Circle Line', panels[0]?.head);
    ok('1. folded, its doors are out of the way', await page.evaluate(() => [...document.querySelectorAll('#navBody .legDoors .doorRows')].every((r) => !r.checkVisibility())));
    ok('1. each panel as wide as its ride, its heading across it', await page.evaluate(() => [...document.querySelectorAll('#navBody .legDoors')].every((d) => {
      const li = d.closest('.step').getBoundingClientRect();
      const box = d.getBoundingClientRect();
      const s = d.querySelector('summary span:not(.ico)').getBoundingClientRect();
      return box.width > li.width - 40 && s.width > box.width * 0.7;
    })));
    await shot(page, 'nav-doors-folded.png');
    await page.click('#navBody .legDoors summary');
    await page.waitForTimeout(300);
    ok('1. a tap on the heading opens it', await page.evaluate(() => document.querySelector('#navBody .legDoors').open && document.querySelector('#navBody .legDoors .doorRows').checkVisibility()));
    await shot(page, 'nav-doors-open.png');
    await page.click('#navBody [data-nav-action="refresh"]');
    await page.waitForTimeout(600);
    ok('1. still open when the way is drawn again', await page.evaluate(() => document.querySelector('#navBody .legDoors').open && !document.querySelectorAll('#navBody .legDoors')[1].open));
    await page.click('#navBody .legDoors summary');
    ok('1. a second tap folds it', await page.evaluate(() => !document.querySelector('#navBody .legDoors').open));

    const walks = await page.$$eval('#navBody .stepWalk .walkBody', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    ok('2. the walk to the station names its nearest exit', walks[0]?.includes(`Tampines station, Exit ${firstWalk.toExit.name}`), walks[0]);
    ok('2. the walk out says which exit to leave by', walks.at(-1)?.includes(`Leave Serangoon station by Exit ${lastWalk.fromExit.name}.`), walks.at(-1));
    await page.click('#navBody [data-nav-walk="0"]');
    const href = await page.getAttribute('#navBody .walkApps a', 'href');
    ok('2. Directions go to the exit, not the station\'s middle', href?.includes(`endcoord=${firstWalk.toExit.lat}%2C${firstWalk.toExit.lng}`) && !href.includes(`endcoord=${firstWalk.to.lat}%2C`), href);
    const lastK = way.legs.length - 1;
    await page.click(`#navBody [data-nav-walk="${lastK}"]`);
    const outHref = await page.$$eval('#navBody .walkApps', (els) => els.at(-1).querySelector('a').href);
    ok('2. the walk out starts from its exit', outHref.includes(`startcoord=${lastWalk.fromExit.lat}%2C${lastWalk.fromExit.lng}`), outHref);
    await shot(page, 'nav-exits.png');
    await page.click('#navBody [data-nav-action="trip"]');
    await page.waitForFunction(() => window.Trip.active());
    const legs = await page.evaluate(() => Trip.legs().map((l) => ({ kind: l.kind, points: l.points, names: l.names, to: l.to })));
    const w0 = legs[0];
    const wN = legs.at(-1);
    ok('2. the trip walks to the exit', w0.kind === 'walk' && w0.points[1][0] === firstWalk.toExit.lat && w0.points[1][1] === firstWalk.toExit.lng && w0.to === `Tampines station, Exit ${firstWalk.toExit.name}`, JSON.stringify(w0));
    ok('2. and from the exit at the other end', wN.kind === 'walk' && wN.points[0][0] === lastWalk.fromExit.lat && wN.names[0] === `Serangoon station, Exit ${lastWalk.fromExit.name}`, JSON.stringify(wN));
    await page.evaluate(() => Trip.stop());
    ok('5. no page errors (doors and exits)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 3. Saved navs with their stop ----
  {
    const { context, page, errors } = await site(browser, { height: 1400 });
    await navTo(page, `#nav/${enc(HUB)}/${enc(NEX)}/via/${enc(GYM)}`);
    ok('3. Save nav says it keeps the stop', /with your stop on the way/.test(await page.getAttribute('#navFavBtn', 'title') || ''));
    await page.click('#navFavBtn');
    const saved = await page.evaluate(() => LS.getFavNavs());
    ok('3. saved with its stop', saved.length === 1 && saved[0].via?.label === 'Bedok Mall' && Math.abs(saved[0].via.lat - GYM.lat) < 1e-5 && saved[0].from.label === 'Our Tampines Hub', JSON.stringify(saved));
    await shot(page, 'nav-save-stop.png', '#navSection .card .cardHeader, #navSection .card');
    await page.evaluate(() => { closeNav(); MainScreen.open('favs'); });
    await page.waitForTimeout(400);
    const chip = await page.textContent('#favNavChips');
    ok('3. Favourites shows it with its stop', chip.includes('Our Tampines Hub → Bedok Mall → NEX'), chip);
    if (SHOTS) await page.locator('#favNavChips').screenshot({ path: path.join(SHOTS, 'favs-nav-stop.png') });
    await page.click('#favNavChips [data-fav-nav="0"]');
    await page.waitForSelector('#navBody [data-nav-option]', { timeout: 20000 });
    ok('3. opening it puts the stop back', (await page.inputValue('#navVia')) === 'Bedok Mall' && await page.evaluate(() => nav.via?.label === 'Bedok Mall'));
    ok('3. its ways go by the stop', await page.evaluate(() => nav.options.every((o) => o.via)));
    await navTo(page, `#nav/${enc(HUB)}/${enc(NEX)}`);
    await page.waitForTimeout(300);
    ok('3. the same ends without the stop aren\'t saved', /Save nav/.test(await page.textContent('#navFavBtn')) && await page.evaluate(() => !nav.via));
    // Sync: what another device sends, cleaned and merged.
    const merged = await page.evaluate(([a, b, v]) => {
      const raw = { navs: [{ from: a, to: b, via: v }, { from: a, to: b }, { from: a, to: b, via: { label: 'Nowhere', lat: 40, lng: 0 } }] };
      const clean = cleanFavs(raw);
      LS.setFavNavs([]);
      mergeFavs(clean);
      const first = LS.getFavNavs();
      mergeFavs(clean);
      return { clean: clean.navs, first, again: LS.getFavNavs().length };
    }, [HUB, NEX, GYM]);
    ok('3. sync keeps the stop, and A → B apart from A → stop → B', merged.first.length === 2 && merged.first.some((n) => n.via?.label === 'Bedok Mall') && merged.first.some((n) => !n.via), JSON.stringify(merged.first));
    ok('3. a stop outside Singapore is left off, the nav kept as its two ends', merged.clean.length === 2 && merged.clean.filter((n) => !n.via).length === 1, JSON.stringify(merged.clean));
    ok('3. taking them again adds nothing', merged.again === 2);
    ok('5. no page errors (saved navs)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 4. The Android app's language ----
  {
    const lang = (page) => page.evaluate(() => document.documentElement.lang);
    const reloaded = (page, want) => page.waitForFunction((w) => window.I18n && document.documentElement.lang === w, want, { timeout: 15000 });
    // The app set to Malay in Android's settings, the page in English.
    let { context, page, errors } = await site(browser, { state: { sgbus_lang: 'en' }, app: { features: ['applang'], lang: 'ms' } });
    await reloaded(page, 'ms');
    ok('4. the page opens in the app\'s language', (await lang(page)) === 'ms' && await page.evaluate(() => I18n.chosen()) === 'ms');
    await page.evaluate(() => { __fakeApp.setLang('ta'); __fakeApp.emit('SgBus', 'language', { lang: 'ta' }); });
    await reloaded(page, 'ta');
    ok('4. a change in Android\'s settings is followed at once', (await lang(page)) === 'ta');
    await page.waitForTimeout(500);
    await page.evaluate(() => I18n.set('zh-SG'));
    await reloaded(page, 'zh-Hans-SG');
    const st = await page.evaluate(() => __fakeApp.state());
    ok('4. Language picked in the page tells the app', st.calls.at(-1) === 'zh-SG' && st.lang === 'zh-SG', JSON.stringify(st));
    await page.waitForTimeout(500);
    await page.evaluate(() => { __fakeApp.setLang(''); __fakeApp.emit('SgBus', 'language', { lang: '' }); });
    await page.waitForFunction(() => window.I18n && !I18n.chosen(), null, { timeout: 15000 });
    ok('4. "System default" in Android drops the page\'s choice', (await lang(page)) === 'en' && await page.evaluate(() => I18n.chosen()) === null);
    ok('5. no page errors (app language)', errors.length === 0, errors.join(' | '));
    await context.close();

    // An app with no language set, as just updated: given the page's.
    ({ context, page, errors } = await site(browser, { state: { sgbus_lang: 'ms' }, app: { features: ['applang'], lang: '' } }));
    await page.waitForFunction(() => window.__fakeApp.state().calls.length > 0, null, { timeout: 10000 }).catch(() => {});
    const st2 = await page.evaluate(() => __fakeApp.state());
    ok('4. an app with none set is given the page\'s choice, the page staying as it is', JSON.stringify(st2.calls) === '["ms"]' && (await lang(page)) === 'ms', JSON.stringify(st2));
    await context.close();

    // An app from before 2.3.1: never asked.
    ({ context, page, errors } = await site(browser, { state: { sgbus_lang: 'ms' }, app: { features: ['trip'], lang: 'ta' } }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => I18n.set('en'));
    await reloaded(page, 'en');
    const st3 = await page.evaluate(() => __fakeApp.state());
    ok('4. an app without "applang" is never asked, nor followed', st3.calls.length === 0, JSON.stringify(st3));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
