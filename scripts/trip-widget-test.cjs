// Tests the Telegram bot's live trip widget (telegram-bot/src/trip_widget.html, trip_widget.py)
// in Chrome under Playwright, and the web app's Follow in Telegram under someone's shared trip
// (main-site/js/share.js, index.html #etaTelegram).
//
//   node scripts/trip-widget-test.cjs
//
// Needs Playwright, as scripts/ride-check-test.cjs does (PLAYWRIGHT=, CHROME= the same), and the
// bot's Python (PYTHON=, or telegram-bot/.venv, or python3) for the widget's HTML and its state
// exactly as the bot sends them. A browser isn't a Telegram app: the widget runs here with the
// stand-in for window.TelegramWidget that core.telegram.org/bots/widgets gives for a first look,
// in the chat's palette, light and dark. SHOTS=1 also saves the guide's screenshot
// (docs-site/public/screenshots/bot/trip-widget.png).
//
// What it checks:
//   1. The person on the trip: Your trip to …, the minutes, a bar of the parts with the one
//      they're on lit, that part's stops left, Part 2 of 4, Updated …
//   2. Tapping the minutes shows the time, and back; tapping a part shows it, and back.
//   3. A newer state from the bot redraws it; an older one is ignored.
//   4. Following someone's trip: Sam's trip; arrived, sharing stopped and the link gone.
//   5. Not heard from in a while: Last heard from at …; no state yet: Getting the trip.
//   6. Fits: no sideways overflow from 200 to 600 px wide, under 560 px tall at 320, in both
//      colour schemes, with the palette's colours, and no errors.
//   7. The web app: a live shared trip has Follow in Telegram, to t.me/sgbus_app?start=eta_<id>;
//      an ended one doesn't.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT || 'playwright');
} catch {
  try { playwright = require('playwright-core'); } catch {
    playwright = require(path.join(execFileSync('npm', ['root', '-g'], { shell: true }).toString().trim(), 'playwright'));
  }
}

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'main-site');
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let failures = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra && !cond ? ` :: ${extra}` : ''}`);
  if (!cond) failures++;
}

function python() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venv = path.join(ROOT, 'telegram-bot', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return fs.existsSync(venv) ? venv : 'python3';
}

// The widget's HTML and each case's state, from the bot's own trip_widget.py.
function fromBot(cases) {
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'telegram-bot'))})
from src.trip_widget import widget_html, public_data, OWNER_CHAT_DATA
cases = json.loads(sys.stdin.read())
print(json.dumps({"html": widget_html(), "owner": OWNER_CHAT_DATA,
  "data": [public_data(c["eta"], c["rev"], c["updated"], c.get("parts"), gone=c.get("gone", False)) for c in cases]}))`;
  return JSON.parse(execFileSync(python(), ['-c', code], { input: JSON.stringify(cases), env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).toString('utf8'));
}

const PALETTE = {
  light: { bg: '#ffffff', text: '#000000', hint: '#707579', link: '#3390ec', button: '#3390ec', 'button-text': '#ffffff', 'secondary-bg': '#f1f1f4', 'accent-text': '#3390ec', 'destructive-text': '#e53935' },
  dark: { bg: '#212121', text: '#ffffff', hint: '#aaaaaa', link: '#8774e1', button: '#8774e1', 'button-text': '#ffffff', 'secondary-bg': '#0f0f0f', 'accent-text': '#8774e1', 'destructive-text': '#ff595a' },
};

// The page a widget runs in here: the palette, the stand-in, then the widget as sent.
function page(html, scheme, chatData, publicData) {
  const vars = Object.entries(PALETTE[scheme]).map(([k, v]) => `--tg-theme-${k}-color:${v}`).join(';');
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{${vars};color-scheme:${scheme}}
html{background:var(--tg-theme-bg-color);color:var(--tg-theme-text-color);font:15px/1.35 system-ui,sans-serif}</style>
<script>
window.__handlers = {};
window.TelegramWidget = {
  profile: 1, isProfileAtLeast: (n) => n <= 1, colorScheme: ${JSON.stringify(scheme)}, themeParams: {}, isActive: true,
  isPreview: false, isForward: false, chatType: 'private', viewer: { id: 1, first_name: 'Test' },
  chatData: ${JSON.stringify(chatData)}, publicData: ${JSON.stringify(publicData)}, wallet: null,
  contentSafeAreaInset: { top: 0, right: 0, bottom: 0, left: 0, cornerLeft: 0, cornerRight: 0 },
  HapticFeedback: { impactOccurred() { return this; }, notificationOccurred() { return this; }, selectionChanged() { window.__haptics = (window.__haptics || 0) + 1; return this; } },
  onEvent(t, fn) { (window.__handlers[t] ||= []).push(fn); }, offEvent() {}, ready() { window.__ready = true; }, setResizeAnchor() {},
  watchPublicData() { window.__watching = true; }, unwatchPublicData() {},
  openLink() {}, openTelegramLink() {}, copyText() {}, request: () => Promise.resolve({ result: null }),
};
window.__push = (data) => { TelegramWidget.publicData = data; (window.__handlers.publicDataChanged || []).forEach((f) => f()); };
</script></head><body>${html}</body></html>`;
}

(async () => {
  const now = Date.now();
  const parts = [
    { kind: 'walk', label: 'Walk', to: 'Bedok Int (84031)' },
    { kind: 'bus', label: 'Bus 28', to: 'Paya Lebar Stn Exit D (81111)' },
    { kind: 'train', label: 'EW Line', to: 'Raffles Place station' },
    { kind: 'walk', label: 'Walk', to: 'One Raffles Place' },
  ];
  const eta = (extra = {}) => ({
    name: 'Sam', to: { label: 'One Raffles Place', lat: 1.2842, lng: 103.8513 }, arriveAt: now + 24 * 60000,
    leg: { label: 'Bus 28', to: 'Paya Lebar Stn Exit D (81111)', stopsLeft: 6, kind: 'bus' }, legIndex: 1, legCount: 4, ...extra,
  });
  const cases = [
    { eta: eta(), rev: 2, updated: now, parts },                                              // 0 on the bus
    { eta: eta({ leg: { label: 'EW Line', to: 'Raffles Place station', stopsLeft: 3, kind: 'train' }, legIndex: 2, arriveAt: now + 9 * 60000 }), rev: 3, updated: now, parts }, // 1 newer
    { eta: eta({ legIndex: 0 }), rev: 1, updated: now, parts },                               // 2 older
    { eta: eta({ ended: true, arriveAt: now }), rev: 4, updated: now, parts },                // 3 arrived
    { eta: eta({ stopped: true }), rev: 4, updated: now, parts },                             // 4 stopped
    { eta: eta(), rev: 4, updated: now, parts, gone: true },                                  // 5 gone
    { eta: eta(), rev: 2, updated: now - 12 * 60000, parts },                                 // 6 not heard from
  ];
  const bot = fromBot(cases);
  const D = bot.data;

  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 700 } });
    const widget = async (scheme, chatData, publicData, width = 360) => {
      const p = await context.newPage();
      p.on('pageerror', (e) => errors.push(String(e.message)));
      await p.setViewportSize({ width, height: 700 });
      await p.setContent(page(bot.html, scheme, chatData, publicData));
      await p.waitForFunction(() => window.__ready);
      return p;
    };
    const text = (p) => p.evaluate(() => document.getElementById('a').innerText.replace(/\s+/g, ' ').trim());

    // ---------- 1. the person on the trip ----------
    const own = await widget('light', bot.owner, D[0]);
    let t = await text(own);
    ok('1. whose trip, and where to', t.startsWith('Your trip to One Raffles Place'), t);
    ok('1. the minutes, and the time', /\b24 min\b/.test(t) && /arriving around \d{1,2}:\d{2}/.test(t), t);
    const bar = await own.evaluate(() => [...document.querySelectorAll('.bar [data-i]')].map((e) => e.className.trim()));
    ok('1. a bar of the four parts, the second lit', JSON.stringify(bar) === JSON.stringify(['d', 'c', '', '']), JSON.stringify(bar));
    ok('1. the part they\'re on', t.includes('Bus 28 to Paya Lebar Stn Exit D (81111) · 6 stops left') && t.includes('now') && t.includes('Part 2 of 4'), t);
    ok('1. when it was updated', /Updated \d{1,2}:\d{2}/.test(t), t);
    ok('1. watches the shared state', await own.evaluate(() => window.__watching === true));
    if (process.env.SHOTS) {
      const out = path.join(ROOT, 'docs-site/public/screenshots/bot/trip-widget.png');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const shot = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 3 });
      const s = await shot.newPage();
      await s.setContent(page(bot.html, 'light', bot.owner, D[0]));
      await s.waitForFunction(() => window.__ready);
      await (await s.$('body')).screenshot({ path: out });
      await shot.close();
      console.log(`saved ${path.relative(ROOT, out)}`);
    }

    // ---------- 2. taps ----------
    await own.click('#m');
    t = await text(own);
    ok('2. tap the minutes: the time', /^Your trip to One Raffles Place \d{1,2}:\d{2} in 24 min/.test(t) && (await own.evaluate(() => window.__haptics)) === 1, t);
    await own.click('#m');
    ok('2. and back', /24 min arriving around/.test(await text(own)));
    await own.click('.bar [data-i="2"]');
    t = await text(own);
    ok('2. tap a part: that part', t.includes('EW Line to Raffles Place station') && t.includes('later') && t.includes('Part 3 of 4') && !t.includes('stops left'), t);
    ok('2. picked on the bar', (await own.evaluate(() => document.querySelector('.bar [data-i="2"]').className)).includes('s'));
    await own.click('.bar [data-i="0"]');
    ok('2. a part done says so', (await text(own)).includes('done'));
    await own.click('.bar [data-i="0"]');
    ok('2. tapped again: back to the part they\'re on', (await text(own)).includes('6 stops left'));

    // ---------- 3. the bot's changes ----------
    await own.evaluate((d) => window.__push(d), D[1]);
    t = await text(own);
    ok('3. a newer state redraws it', t.includes('9 min') && t.includes('EW Line to Raffles Place station · 3 stops left') && t.includes('Part 3 of 4'), t);
    await own.evaluate((d) => window.__push(d), D[2]);
    ok('3. an older one is ignored', (await text(own)).includes('Part 3 of 4'));
    await own.close();

    // ---------- 4. following ----------
    const theirs = await widget('light', null, D[0]);
    ok('4. someone else\'s trip', (await text(theirs)).startsWith('Sam’s trip to One Raffles Place'), await text(theirs));
    await theirs.evaluate((d) => window.__push(d), D[3]);
    t = await text(theirs);
    ok('4. arrived', t.includes('Arrived at One Raffles Place') && !t.includes('now') && !t.includes('min'), t);
    ok('4. the whole bar done', (await theirs.evaluate(() => [...document.querySelectorAll('.bar [data-i]')].every((e) => e.className.includes('d')))));
    ok('4. tapping the time does nothing once over', await theirs.click('#m').then(() => text(theirs)).then((x) => x === t));
    await theirs.close();
    const stopped = await widget('light', null, D[4]);
    ok('4. sharing stopped', (await text(stopped)).includes('Sharing stopped Sam stopped sharing'), await text(stopped));
    await stopped.close();
    const gone = await widget('dark', null, D[5]);
    ok('4. the link gone', (await text(gone)).includes('Ended This trip has ended'), await text(gone));
    await gone.close();

    // ---------- 5. stale, and empty ----------
    const stale = await widget('light', bot.owner, D[6]);
    ok('5. not heard from in a while', (await text(stale)).includes('Last heard from at'), await text(stale));
    await stale.close();
    const empty = await widget('light', null, null);
    ok('5. no state yet', (await text(empty)).includes('Getting the trip'), await text(empty));
    await empty.close();

    // ---------- 6. fits, both schemes ----------
    for (const scheme of ['light', 'dark']) {
      for (const width of [200, 320, 430, 600]) {
        const p = await widget(scheme, bot.owner, D[0], width);
        const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.getElementById('a').getBoundingClientRect().bottom }));
        ok(`6. ${scheme} at ${width} px: no sideways overflow${width === 320 ? ', under 560 px tall' : ''}`, m.sw <= m.cw && (width !== 320 || m.h < 560), JSON.stringify(m));
        if (width === 320) {
          const c = await p.evaluate(() => ({
            lit: getComputedStyle(document.querySelector('.bar .c i')).backgroundColor,
            hint: getComputedStyle(document.querySelector('.h')).color,
          }));
          const hex = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
          ok(`6. ${scheme}: the palette's colours`, c.lit === hex(PALETTE[scheme].button) && c.hint === hex(PALETTE[scheme].hint), JSON.stringify(c));
        }
        await p.close();
      }
    }
    await context.close();

    // ---------- 7. the web app ----------
    const links = await import(pathToFileURL(path.join(SITE, 'api/_lib/share-links.js')).href);
    const ID = 'ttzik7wkd6';
    let link = { kind: 'eta', data: links.parseLink('eta', { ...eta(), at: [1.318, 103.893] }) };
    const web = await browser.newContext({ serviceWorkers: 'block' });
    await web.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('sgbus_first_run', 'done');
      localStorage.setItem('sgbus_tour', 'done');
    });
    await web.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/share') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...link, updatedAt: Date.now() }) });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await web.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
    const site = await web.newPage();
    site.on('pageerror', (e) => errors.push(`site: ${e.message}`));
    await site.goto(`${ORIGIN}/#share/${ID}`);
    await site.waitForSelector('#etaModal:not(.hidden)');
    const btn = await site.evaluate(() => { const a = document.getElementById('etaTelegram'); return { shown: !a.hidden && a.offsetWidth > 0, href: a.href, text: a.innerText.trim(), target: a.target }; });
    ok('7. Follow in Telegram, under a live trip', btn.shown && btn.text === 'Follow in Telegram' && btn.target === '_blank', JSON.stringify(btn));
    ok('7. to the bot, with the trip', btn.href === `https://t.me/sgbus_app?start=eta_${ID}`, btn.href);
    link = { kind: 'eta', data: links.parseLink('eta', { ...eta(), ended: true, arriveAt: Date.now() }) };
    await site.evaluate(() => { window.closeModal('etaModal'); });
    await site.evaluate((id) => { location.hash = `#share/${id}`; }, ID);
    await site.waitForFunction(() => document.getElementById('etaHead').textContent.includes('has arrived'));
    ok('7. not once they\'ve arrived', await site.evaluate(() => document.getElementById('etaTelegram').hidden));
    await web.close();

    ok('no errors', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
