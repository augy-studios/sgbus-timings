// Explorer comes back to where you left it (help desk #13): a stop's or station's card in
// Explorer has Show bus timings and Directions, which close it for Bus timings or Navigate.
// Opened again, Explorer is on that stop or station with its card open, wherever you've walked
// to since; closed by hand, it forgets it and opens on you.
//
//   node scripts/explore-return-test.cjs
//
// Needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
// The dots are tapped at the map's middle, where Explorer puts you: standing on stop 17179
// taps Clementi station's dot, on top of it, and standing on 16009 taps that stop's.
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
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const context = await browser.newContext({ viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, geolocation: { latitude: 1.31509, longitude: 103.76516, accuracy: 10 }, permissions: ['geolocation'], serviceWorkers: 'block' });
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('sgbus_first_run', 'done');
    set('sgbus_tour', 'done');
    set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
    set('sgbus_start', 'timings');
  });
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

  const openExplorer = async () => {
    await page.evaluate(() => window.LiveMap.explore());
    await page.waitForFunction(() => window.LiveMap.mode() === 'explore');
    await page.waitForTimeout(2500);
  };
  const cardTitle = () => page.evaluate(() => (window.MapCard.isOpen() ? document.querySelector('#mapPanel .mapCard')?.getAttribute('aria-label') || '' : null));
  const tapCentre = async () => {
    const box = await page.locator('#mapPanel canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1500);
  };
  const closeExplorer = async () => {
    await page.evaluate(() => window.LiveMap.close());
    await page.waitForTimeout(800);
  };

  // Stand on it, open Explorer, tap it, leave by the card's button, walk off, come back.
  async function run(label, lat, lng, button, name) {
    await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 10 });
    await openExplorer();
    await tapCentre();
    ok(`${label}: its card opens from its dot`, name.test(String(await cardTitle())), String(await cardTitle()));
    const went = await page.evaluate((sel) => { const b = document.querySelector(`#mapPanel ${sel}`); if (!b) return false; b.click(); return true; }, button);
    ok(`${label}: the card has ${button}`, went);
    await page.waitForTimeout(1500);
    ok(`${label}: Explorer closed for the other page`, await page.evaluate(() => !window.LiveMap.isOpen()));
    await context.setGeolocation({ latitude: 1.3521, longitude: 103.8198, accuracy: 10 });
    await openExplorer();
    ok(`${label}: Explorer opens again on it, card open`, name.test(String(await cardTitle())), String(await cardTitle()));
    await closeExplorer();
    await openExplorer();
    ok(`${label}: closed by hand, it opens without a card`, await page.evaluate(() => !window.MapCard.isOpen()));
    await closeExplorer();
  }
  await run('station (Directions)', 1.31509, 103.76516, '[data-mc-go]', /Clementi/);
  await run('stop (Show bus timings)', 1.29452, 103.76918, '[data-mc-timings]', /Kent Ridge Ter|16009/);

  ok('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
