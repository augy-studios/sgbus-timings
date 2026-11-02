// The uwuCoins switches, the first open's Standard, the three feats from 2 November 2026 and the
// Circle Line's way round on a trip (main-site/js/coins.js, js/first-run.js, js/eggs.js,
// js/trip.js), in Chrome under Playwright, from this checkout.
//
//   node scripts/coins-modes-feats-test.cjs
//
// Needs Playwright as scripts/pace-test.cjs does (PLAYWRIGHT=<path>, or a global install), and
// Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the page is served
// from main-site/ by Playwright itself, and /api/* answers "not found".
//
// What it checks:
//   1. Coins on: +uwuCoins floats up. Coin pop-ups off: the coins come in, nothing floats up.
//   2. Show uwuCoins off: the Edge Tray's coin, the wheel, its tray switch and Achievements'
//      word on coins are put away, the pop-ups switch too, nothing floats up, but the coins
//      still come in; a feat's window says nothing of coins and has no Spin the wheel. On
//      again, they're all back, with the coins earned meanwhile.
//   3. The first open offers Minimal, Standard and Full. Standard: Glance, Service alerts,
//      Your trips and Explorer stay; the Edge Tray's uwuCoins, Buy Augy a Coffee and Telegram
//      bot go; coin pop-ups off. Minimal: coin pop-ups off too.
//   4. First to last: on a bus at 01012, then off one at 99189 on another ride: done. Ends of
//      the island: off a train at each of the four ends; three aren't enough. 100 rides: 99
//      aren't, the 100th is. Achievements lists nine feats, with how far along each is.
//   5. A Circle Line ride on a trip says which way round: Dhoby Ghaut to Paya Lebar
//      anticlockwise, Paya Lebar to Dhoby Ghaut clockwise, as a chip in the timeline and in
//      the bar's words; another line has neither.
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

async function site(browser, { fresh = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.addInitScript((fresh) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      if (!fresh) {
        localStorage.setItem('sgbus_first_run', 'done');
        localStorage.setItem('sgbus_tour', 'done');
        localStorage.setItem('sgbus_tours', JSON.stringify(['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']));
        localStorage.setItem('sgbus_retrofit', JSON.stringify({ at: 0, trips: 0, coins: 0, feats: [] }));
        localStorage.setItem('sgbus_lang', 'en');
      }
    }
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {} } });
  }, fresh);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
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
  await page.waitForFunction(() => window.MainScreen && window.Coins && window.Eggs && window.Trip);
  return { context, page, errors };
}

const visible = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && !el.closest('[hidden]') && (r.width > 0 || r.height > 0 || el.offsetParent !== null); }, sel);
const toasts = (page) => page.evaluate(() => document.querySelectorAll('.coinToast').length);

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });

  // ---- 1, 2. the switches ----
  {
    const { context, page, errors } = await site(browser);
    await page.evaluate(() => Coins.add(10, { why: 'test' }));
    ok('1. coins on: +uwuCoins floats up', (await toasts(page)) === 1);
    await page.evaluate(() => document.querySelectorAll('.coinToast').forEach((t) => t.remove()));
    await page.click('#settingsBtn');
    await page.click('[data-settings-open="help"]');
    ok('1. Help and extras has both switches', await visible(page, '[data-coins-show="off"]') && await visible(page, '[data-coins-pops="off"]'));
    await page.click('[data-coins-pops="off"]');
    await page.evaluate(() => Coins.add(10, { why: 'test' }));
    ok('1. pop-ups off: the coins come in, nothing floats up', (await toasts(page)) === 0 && (await page.evaluate(() => Coins.balance())) === 20);
    await page.click('[data-coins-pops="on"]');

    await page.click('[data-coins-show="off"]');
    ok('2. hidden: the wheel put away', !(await visible(page, '#coinsBox')));
    ok('2. hidden: the pop-ups switch put away too', await page.evaluate(() => document.getElementById('coinsPopsSetting').hidden));
    ok('2. hidden: the Edge Tray\'s coin put away', await page.evaluate(() => getComputedStyle(document.getElementById('coinsBtn')).display === 'none'));
    ok('2. hidden: its Edge Tray switch put away', await page.evaluate(() => getComputedStyle(document.querySelector('[data-tray-show="coins"]')).display === 'none'));
    ok('2. hidden: Achievements\' word on coins put away', await page.evaluate(() => getComputedStyle(document.querySelector('[data-i18n="achievements.eggsNote"]')).display === 'none'));
    ok('2. hidden: the switch to bring it back stays', await visible(page, '[data-coins-show="on"]'));
    await page.evaluate(() => Coins.add(15, { why: 'test' }));
    ok('2. hidden: nothing floats up, the coins still come in', (await toasts(page)) === 0 && (await page.evaluate(() => Coins.balance())) === 35);
    await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => window.closeModal?.(m.id)); Eggs.feat('long'); });
    await page.waitForFunction(() => !document.getElementById('eggModal').classList.contains('hidden'));
    ok('2. hidden: a feat\'s window says nothing of coins', (await page.textContent('#eggGot')).trim() === '' && await page.evaluate(() => document.getElementById('eggGo').hidden));
    ok('2. hidden: the feat\'s coins still come in', (await page.evaluate(() => Coins.balance())) === 135);
    await page.evaluate(() => window.closeModal('eggModal'));
    await page.evaluate(() => Coins.setShown(true));
    await page.waitForTimeout(1500);
    ok('2. on again: the coin and the wheel are back, with what was earned', await page.evaluate(() => getComputedStyle(document.getElementById('coinsBtn')).display !== 'none' && document.querySelector('#coinsBtn [data-coins-balance]').textContent.trim() === '135'));
    ok('2. kept as the phone\'s', await page.evaluate(() => localStorage.getItem('sgbus_coins_shown') === null && localStorage.getItem('sgbus_coins_pops') === null));
    ok('6. no page errors (switches)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 3. the first open ----
  for (const pick of ['standard', 'minimal']) {
    const { context, page, errors } = await site(browser, { fresh: true });
    await page.waitForFunction(() => !document.getElementById('firstRunModal').classList.contains('hidden'), null, { timeout: 10000 });
    if (pick === 'standard') {
      const names = await page.$$eval('#firstRunForm .firstRunName', (els) => els.map((e) => e.textContent.trim()));
      ok('3. Minimal, Standard and Full', names.join() === 'Minimal,Standard,Full', names.join());
    }
    await page.click(`#firstRunForm label:has(input[value="${pick}"])`);
    await page.click('#firstRunForm .firstRunGo');
    await page.waitForFunction(() => localStorage.getItem('sgbus_first_run') === 'done');
    const state = await page.evaluate(() => {
      const extra = (id) => document.querySelector(`[data-tray-extra="${id}"]`);
      const shown = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
      return {
        pops: Coins.pops(),
        coins: shown(extra('coins')), coffee: shown(extra('coffee')), telegram: shown(extra('telegram')), explorer: shown(extra('explorer')),
        pages: MainScreen.CAN_HIDE.map((id) => MainScreen.shown?.(id) ?? null),
      };
    });
    if (pick === 'standard') {
      ok('3. Standard: coin pop-ups off', state.pops === false, JSON.stringify(state));
      ok('3. Standard: uwuCoins, coffee and Telegram bot off the Edge Tray', !state.coins && !state.coffee && !state.telegram, JSON.stringify(state));
      ok('3. Standard: Explorer stays', state.explorer, JSON.stringify(state));
      ok('3. Standard: Glance, Service alerts and Your trips stay', !state.pages.includes(false), JSON.stringify(state.pages));
    } else {
      ok('3. Minimal: coin pop-ups off too', state.pops === false && !state.explorer, JSON.stringify(state));
    }
    ok(`6. no page errors (${pick})`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 4. the feats ----
  {
    const { context, page, errors } = await site(browser);
    const bus = (board, alight) => ({ kind: 'bus', service: '2', board, alight, points: [[1.3, 103.85], [1.31, 103.86]] });
    const train = (end) => ({ kind: 'train', route: 'EW', points: [[1.33, 103.75], end] });
    let r = await page.evaluate((b) => { Eggs.rideDone(b); return Eggs.feats(); }, bus('01012', '04167'));
    ok('4. on at 01012 alone: not yet', !r.includes('first'));
    r = await page.evaluate((b) => { Eggs.rideDone(b); return Eggs.feats(); }, bus('98049', '99189'));
    ok('4. off at 99189 on another ride: First to last done', r.includes('first'));
    const ends = [[1.340429, 103.636961], [1.448646, 103.785519], [1.415018, 103.910329], [1.357338, 103.988565]];
    for (const end of ends.slice(0, 3)) r = await page.evaluate((t) => { Eggs.rideDone(t); return Eggs.feats(); }, train(end));
    ok('4. three ends: not yet', !r.includes('ends'));
    r = await page.evaluate((t) => { Eggs.rideDone(t); return Eggs.feats(); }, train(ends[3]));
    ok('4. all four: Ends of the island done', r.includes('ends'));
    r = await page.evaluate(() => { for (let i = 0; i < 99; i++) simulateRide('12'); return Eggs.feats(); });
    ok('4. 99 rides: not yet', !r.includes('hundred'));
    r = await page.evaluate(() => { simulateRide('NE'); return Eggs.feats(); });
    ok('4. the 100th: 100 rides done', r.includes('hundred'));
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => window.closeModal?.(m.id)));
    const prog = await page.evaluate(() => Eggs.progress().map((p) => `${p.id}:${p.have}/${p.need}`));
    ok('4. nine feats, each with how far along', prog.length === 9 && prog.includes('hundred:100/100') && prog.includes('ends:4/4') && prog.includes('first:2/2'), prog.join(' '));
    await page.evaluate(() => { window.openSettingsGroup?.('achievements'); Eggs.renderAchievements(); });
    const items = await page.$$eval('#achievementsList .achievement strong', (els) => els.map((e) => e.textContent.trim()));
    ok('4. Achievements lists them by name', items.includes('First to last') && items.includes('100 rides') && items.includes('Ends of the island'), items.join(' | '));
    ok('6. no page errors (feats)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 5. the Circle Line's way round ----
  {
    const { context, page, errors } = await site(browser);
    const DG = [1.299169, 103.845799]; const BB = [1.296978, 103.850715]; const ES = [1.293995, 103.855396]; const PM = [1.293444, 103.861076];
    const NC = [1.300292, 103.863449]; const SD = [1.302847, 103.875417]; const MB = [1.306106, 103.883175]; const DK = [1.307638, 103.888818]; const PL = [1.317767, 103.892381];
    const cc = (points) => ({ kind: 'train', label: 'CC Line', route: 'CC', to: 'End', points, names: points.map((_, i) => `S${i}`), minutes: 12, wait: 0 });
    const run = async (points) => {
      await page.evaluate((leg) => Trip.start({ title: 'Round', legs: [leg] }), cc(points));
      await page.waitForTimeout(400);
      await page.click('#tripToggle');
      await page.waitForTimeout(400);
      const out = await page.evaluate(() => ({ chip: document.querySelector('#tripTimeline .loopWay')?.textContent.trim() || '', title: document.querySelector('#tripTimeline .loopWay')?.getAttribute('title') || '', bar: document.getElementById('tripStatus').textContent }));
      await page.evaluate(() => Trip.stop());
      return out;
    };
    let w = await run([DG, BB, ES, PM, NC, SD, MB, DK, PL]);
    ok('5. Dhoby Ghaut to Paya Lebar: anticlockwise', w.chip === 'ACW' && w.title === 'Anticlockwise' && /CC Line \(anticlockwise\)/.test(w.bar), JSON.stringify(w));
    w = await run([PL, DK, MB, SD, NC, PM, ES, BB, DG]);
    ok('5. Paya Lebar to Dhoby Ghaut: clockwise', w.chip === 'CW' && /CC Line \(clockwise\)/.test(w.bar), JSON.stringify(w));
    await page.evaluate(() => Trip.start({ title: 'EW', legs: [{ kind: 'train', label: 'EW Line', route: 'EW', to: 'Bedok', points: [[1.32, 103.85], [1.33, 103.9], [1.324, 103.93]], minutes: 10, wait: 0 }] }));
    await page.waitForTimeout(400);
    await page.click('#tripToggle');
    await page.waitForTimeout(300);
    ok('5. another line: no way round', await page.evaluate(() => !document.querySelector('#tripTimeline .loopWay') && !/clockwise/.test(document.getElementById('tripStatus').textContent)));
    ok('6. no page errors (CCL)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
