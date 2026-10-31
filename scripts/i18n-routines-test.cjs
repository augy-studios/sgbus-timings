// Routines' form and the location messages in each language (help desk #17): the words the
// site shows come from main-site/i18n/<lang>.json, by key, with English where a language
// hasn't got one.
//
//   node scripts/i18n-routines-test.cjs
//
// Needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
//
// What it checks, in English, Chinese, Malay and Tamil:
//   1. Routines' form: its heading, the buses placeholder and the note under it.
//   2. With no stop open and no favourites, the stop list says to open or save one first.
//   3. Changing a routine heads the form Edit routine; Cancel puts Add a routine back.
//   4. Location not allowed: Bus timings' Stops near me says so, ending on what it was for.
//   5. Location not found: Glance's Nearby says to check Location is on.
//   6. The phone's Location off, in the app: it says to turn it on.
//   7. No {name} left unfilled, and no page errors.
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
const STOPS = [
  { c: '17179', n: 'Clementi Stn Exit B', r: 'Commonwealth Ave West', la: 1.31509, lo: 103.76516 },
  { c: '16009', n: 'Kent Ridge Ter', r: 'Kent Ridge Cres', la: 1.29452, lo: 103.76918 },
];
const ROUTINE = { id: 'r1', code: '17179', name: 'Clementi Stn Exit B', buses: ['96'], time: '0745', days: [1, 2, 3, 4, 5] };
const EN = JSON.parse(fs.readFileSync(path.join(SITE, 'i18n/en.json'), 'utf8'));

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

// The words for `key` in `lang`, as the site would show them: the language's, else English.
function words(lang, key, vars) {
  const map = lang === 'en' ? EN : JSON.parse(fs.readFileSync(path.join(SITE, `i18n/${lang}.json`), 'utf8'));
  const got = map[key] || EN[key];
  return got.replace(/\{(\w+)\}/g, (m, k) => (vars?.[k] ?? m));
}

// The Android app, as far as the page can tell (js/app-bridge.js): Capacitor's bridge, saying it
// has routines, and answering whether the phone's Location is on with `locationOn`.
function asApp({ locationOn }) {
  const answers = { info: { version: '2.2.8', features: ['routines', 'routinewild', 'locationon'] }, location: { on: locationOn } };
  window.Capacitor = {
    getPlatform: () => 'android',
    nativePromise: (plugin, method) => Promise.resolve(plugin === 'SgBus' && answers[method] ? answers[method] : {}),
    addListener: () => ({ remove() {} }),
  };
}

async function site(browser, lang, { routines = [], allowed = false, app = null } = {}) {
  const context = await browser.newContext({
    viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true,
    geolocation: { latitude: 1.31509, longitude: 103.76516, accuracy: 10 },
    permissions: allowed ? ['geolocation'] : [], serviceWorkers: 'block',
  });
  await context.addInitScript(({ lang, routines }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('sgbus_first_run', 'done');
    set('sgbus_tour', 'done');
    set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
    set('sgbus_start', 'timings');
    set('sgbus_lang', lang);
    if (routines.length) set('sgbus_routines', routines);
  }, { lang, routines });
  if (app) await context.addInitScript(asApp, app);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bus-stops') return json(STOPS);
    if (url.pathname === '/api/bus-arrivals') return json({ busStopCode: url.searchParams.get('stop'), services: [] });
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
  return { context, page, errors };
}

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent.trim() ?? null, sel);

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });

  for (const lang of ['en', 'zh-SG', 'ms', 'ta']) {
    const say = (key, vars) => words(lang, key, vars);
    const tag = `[${lang}]`;

    // ---- Routines' form, then the location messages ----
    {
      const { context, page, errors } = await site(browser, lang, { app: { locationOn: true } });
      ok(`${tag} page in the language picked`, await page.evaluate(() => I18n.lang()) === lang);
      ok(`${tag} 1. form heading, as the page draws`, await text(page, '.routineFormHead') === say('routine.add'), await text(page, '.routineFormHead'));
      await page.evaluate(() => document.getElementById('routinesTrayBtn').click());
      await page.waitForFunction(() => !document.getElementById('routineModal').classList.contains('hidden'));
      ok(`${tag} 1. form heading, once opened`, await text(page, '.routineFormHead') === say('routine.add'), await text(page, '.routineFormHead'));
      const placeholder = await page.getAttribute('#routineBuses', 'placeholder');
      ok(`${tag} 1. buses placeholder`, placeholder === say('routine.new.buses'), placeholder);
      const note = await text(page, '[data-i18n="routine.explain.notification"]');
      ok(`${tag} 1. note under the form`, note === say('routine.explain.notification'), note);
      const option = await text(page, '#routineStop option');
      ok(`${tag} 2. no stop to pick says so`, option === say('routine.new.stop_required'), option);
      ok(`${tag} 2. and Add is off`, await page.evaluate(() => document.getElementById('routineSave').disabled));
      await page.evaluate(() => closeModal('routineModal'));

      // 4. Not allowed: Stops near me, as Bus timings asks for it.
      const blocked = await page.evaluate(() => findNearbyStops(8).then(() => 'found', (e) => e.message));
      const wantBlocked = say('glance.locationBlocked', { toDo: say('location.toFindStops') });
      ok(`${tag} 4. location not allowed`, blocked === wantBlocked, blocked);

      // 5. Allowed but nothing found: Glance's Nearby.
      await context.grantPermissions(['geolocation'], { origin: ORIGIN });
      await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 2, message: 'Position unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }), 10);
        localStorage.setItem('sgbus_glance', 'near');
        MainScreen.open('glance');
        Glance.refresh?.({ ask: true });
      });
      const wantFail = say('glance.locationRetrievalFail');
      await page.waitForFunction((w) => document.getElementById('glance')?.textContent.includes(w), wantFail, { timeout: 8000 }).catch(() => {});
      const glance = await page.evaluate(() => document.getElementById('glance')?.textContent.replace(/\s+/g, ' ').trim());
      ok(`${tag} 5. location not found, on Glance`, glance.includes(wantFail), glance.slice(0, 160));
      ok(`${tag} 7. no {name} left`, !/\{\w+\}/.test(blocked + glance));
      ok(`${tag} 7. no page errors`, errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- 3. changing a routine ----
    {
      const { context, page, errors } = await site(browser, lang, { routines: [ROUTINE], app: { locationOn: true } });
      await page.evaluate(() => document.getElementById('routinesTrayBtn').click());
      await page.waitForFunction(() => !document.getElementById('routineModal').classList.contains('hidden'));
      await page.waitForSelector('[data-routine-edit="0"]', { timeout: 5000 }).catch(() => {});
      const listed = await page.$('[data-routine-edit="0"]');
      ok(`${tag} 3. the routine is listed`, !!listed);
      if (listed) {
        await listed.click();
        ok(`${tag} 3. Edit routine heads the form`, await text(page, '.routineFormHead') === say('routine.edit'), await text(page, '.routineFormHead'));
        await page.click('#routineCancel');
        ok(`${tag} 3. Cancel puts Add a routine back`, await text(page, '.routineFormHead') === say('routine.add'), await text(page, '.routineFormHead'));
      }
      ok(`${tag} 3. no page errors`, errors.length === 0, errors.join(' | '));
      await context.close();
    }

    // ---- 6. the phone's Location off, in the app (js/geo-retry.js) ----
    {
      const { context, page, errors } = await site(browser, lang, { allowed: true, app: { locationOn: false } });
      const off = await page.evaluate(() => {
        return new Promise((resolve) => navigator.geolocation.getCurrentPosition(() => resolve('found'), (e) => resolve(e.appMessage || e.message), { noTurnOn: true }));
      });
      ok(`${tag} 6. phone's Location off`, off === say('glance.locationDisabledOnMobile'), off);
      ok(`${tag} 6. no page errors`, errors.length === 0, errors.join(' | '));
      await context.close();
    }
  }

  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
