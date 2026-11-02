// A new version put in by itself at a safe moment (main-site/js/sw-update.js), and the language's
// words never used from before an update (js/i18n.js, WORDS_REV), in Chrome under Playwright.
//
//   node scripts/auto-update-test.cjs
//
// Needs Playwright as scripts/pace-test.cjs does (PLAYWRIGHT=<path>, or a global install), and
// Chromium where Playwright finds it, or CHROME=<path to Chrome>. The page is served from
// main-site/ by a server here, on http://localhost:PORT (8767; a secure context, so sw.js runs
// as it does live), with sw.js's VERSION changed by hand to stand in for a deploy, and /api/*
// answering "not found".
//
// What it checks:
//   1. A new version waiting, the app coming back to the screen with a window open: no reload.
//   2. The window closed, the app back on the screen: the new version's put in by itself, the
//      page reloaded, served by the new worker.
//   3. A new version waiting, a page picked in the Edge Tray: put in, and that page open again
//      after the reload.
//   4. A bug report typed and not sent: no reload on coming back.
//   5. A copy of the words kept from another revision isn't used: Malay comes from the file.
//   6. No page errors.
const path = require('path');
const fs = require('fs');
const http = require('http');

let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT || 'playwright');
} catch {
  try { playwright = require('playwright-core'); } catch {
    playwright = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const SITE = path.resolve(process.env.SITE || path.join(__dirname, '../main-site'));
const PORT = Number(process.env.PORT) || 8767;
const ORIGIN = `http://localhost:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

let version = 'test-1';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{}'); }
  const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (url.pathname === '/sw.js') body = Buffer.from(String(body).replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});

// The app away and back: the page hidden, then shown, as switching apps or tabs does.
const awayAndBack = (page) => page.evaluate(() => {
  for (const state of ['hidden', 'visible']) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }
});
// A deploy: the next sw.js is a new version, found and installed, waiting.
async function deploy(page, v) {
  version = v;
  await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000, polling: 250 });
  // The app's noticed it too: its bar's up.
  await page.waitForSelector('.update-notice', { state: 'attached', timeout: 15000 });
}
const swVersion = (page) => page.evaluate(() => new Promise((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = ({ data }) => resolve(data);
  navigator.serviceWorker.controller ? navigator.serviceWorker.controller.postMessage({ type: 'version' }, [ch.port2]) : resolve(null);
}));

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const context = await browser.newContext({ viewport: { width: 400, height: 820 } });
  await context.addInitScript(() => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('seeded', '1');
      localStorage.setItem('sgbus_first_run', 'done');
      localStorage.setItem('sgbus_tour', 'done');
      localStorage.setItem('sgbus_tours', JSON.stringify(['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']));
      localStorage.setItem('sgbus_retrofit', JSON.stringify({ at: 0, trips: 0, coins: 0, feats: [] }));
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(async () => { await page.reload(); });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  ok('serving from the first version', (await swVersion(page)) === 'test-1');

  // 1, 2.
  await deploy(page, 'test-2');
  await page.evaluate(() => { window.__same = 1; window.openSettings?.(); });
  await page.waitForTimeout(500);
  await awayAndBack(page);
  await page.waitForTimeout(2500);
  ok('1. a window open: no reload', await page.evaluate(() => window.__same === 1));
  await page.evaluate(() => document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)));
  await page.waitForTimeout(400);
  await awayAndBack(page).catch(() => {});
  await page.waitForFunction(() => window.__same !== 1, null, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('load');
  await page.waitForFunction(() => window.MainScreen && navigator.serviceWorker.controller, null, { timeout: 20000 });
  ok('2. back on the screen: reloaded by itself', await page.evaluate(() => window.__same !== 1));
  ok('2. served by the new version', (await swVersion(page)) === 'test-2');

  // 3.
  await deploy(page, 'test-3');
  await page.evaluate(() => { window.__same = 1; });
  await page.evaluate(() => document.querySelector('[data-part="favs"]')?.click() || MainScreen.open('favs'));
  await page.waitForFunction(() => window.__same !== 1, null, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('load');
  await page.waitForFunction(() => window.MainScreen && navigator.serviceWorker.controller, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  ok('3. a page picked: reloaded by itself', await page.evaluate(() => window.__same !== 1) && (await swVersion(page)) === 'test-3');
  ok('3. and that page open again', (await page.evaluate(() => MainScreen.active())) === 'favs', await page.evaluate(() => MainScreen.active()));

  // 4.
  await deploy(page, 'test-4');
  await page.evaluate(() => { window.__same = 1; document.getElementById('bugText').value = 'Half a report'; document.activeElement?.blur(); });
  await awayAndBack(page);
  await page.waitForTimeout(2500);
  ok('4. a bug report not sent: no reload', await page.evaluate(() => window.__same === 1));
  ok('6. no page errors', errors.length === 0, errors.join(' | '));
  await context.close();

  // 5. Words kept from another revision.
  const ctx2 = await browser.newContext({ viewport: { width: 400, height: 820 }, serviceWorkers: 'block' });
  await ctx2.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sgbus_first_run', 'done');
    localStorage.setItem('sgbus_tour', 'done');
    localStorage.setItem('sgbus_lang', 'ms');
    localStorage.setItem('sgbus_lang_words', JSON.stringify({ lang: 'ms', rev: 'old', words: { 'settings.on': 'LAMA' } }));
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${ORIGIN}/`);
  await p2.waitForFunction(() => window.I18n);
  const said = await p2.evaluate(() => [I18n.t('settings.on', 'On'), I18n.t('tour.skip', 'Skip')]);
  ok('5. an old copy of the words isn\'t used: Malay from the file', said[0] !== 'LAMA' && said[1] !== 'Skip', said.join(' / '));
  ok('5. and the new copy kept with its revision', await p2.evaluate(() => JSON.parse(localStorage.getItem('sgbus_lang_words')).rev.length === 12));
  await ctx2.close();

  await browser.close();
  server.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); server.close(); process.exit(1); });
