// Tests the Telegram bot's uwuCoins wheel and team run widgets (telegram-bot/src/coins_widget.html,
// team_widget.html), the trip card's coins counting up (trip_widget.html), and the website's side
// of them (main-site/js/coins.js, js/share.js, js/sync.js, js/team.js): an Easter egg link from the
// bot opened, uwuCoins in sync, and Join in Telegram on a team run. In Chrome, under Playwright.
//
//   node scripts/coins-widgets-test.cjs
//
// Needs Playwright and the bot's Python as scripts/trip-widget-test.cjs does (PLAYWRIGHT=, CHROME=,
// PYTHON=). The widgets run with the stand-in for window.TelegramWidget from
// core.telegram.org/bots/widgets; the website is served from main-site/ by Playwright itself.
//
// What it checks:
//   1. The wheel: the balance, eight slices, and what a spin needs.
//   2. A spin: the wheel turns onto the slot the bot picked, the balance counts up from before the
//      win, and the win is said; an egg says its link is in the chat; an old spin doesn't turn again.
//   3. The team: its name, members, feats with how far along, the hand-off; a feat tapped says what
//      it asks; it fits under 560 px at 320 wide; an ended one says so.
//   4. The trip card, arrived: its uwuCoins counting up.
//   5. The website: an egg link opened gives GTA VI's colours while they're due, else an egg;
//      a used one says so; uwuCoins go in sync as the balance with this device's id, and taking
//      another's adds it; a team run has Join in Telegram, to the bot with its code.
//   6. No errors, and each widget inside Telegram's size limits.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

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

// Each widget's HTML as the bot sends it, and its compressed size as Telegram counts it.
const widgets = JSON.parse(execFileSync(python(), ['-c', `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'telegram-bot'))})
from src.trip_widget import html_of, compressed_size
print(json.dumps({n: [html_of(n), compressed_size(html_of(n))] for n in ["coins_widget.html", "team_widget.html", "trip_widget.html"]}))`]).toString('utf8'));

const PALETTE = '--tg-theme-bg-color:#fff;--tg-theme-text-color:#000;--tg-theme-hint-color:#707579;--tg-theme-link-color:#3390ec;--tg-theme-button-color:#3390ec;--tg-theme-secondary-bg-color:#f1f1f4;--tg-theme-accent-text-color:#3390ec;--tg-theme-destructive-text-color:#e53935';
function page(html, chatData, publicData) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{${PALETTE}}html{font:15px/1.35 system-ui,sans-serif}</style><script>
window.__h = {};
window.TelegramWidget = { profile: 1, colorScheme: 'light', themeParams: {}, isActive: true, isPreview: false, isForward: false, chatType: 'private',
  chatData: ${JSON.stringify(chatData)}, publicData: ${JSON.stringify(publicData)},
  HapticFeedback: { impactOccurred() {}, notificationOccurred() { window.__buzz = (window.__buzz || 0) + 1; }, selectionChanged() {} },
  onEvent(t, f) { (window.__h[t] ||= []).push(f); }, offEvent() {}, ready() { window.__ready = true; }, watchPublicData() {}, unwatchPublicData() {} };
window.__chat = (d) => { TelegramWidget.chatData = d; (window.__h.chatDataChanged || []).forEach((f) => f()); };
</script></head><body>${html}</body></html>`;
}

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const errors = [];
  const now = () => Math.floor(Date.now() / 1000);
  try {
    for (const [name, [html, size]] of Object.entries(widgets)) ok(`6. ${name} fits: ${size} of 4096 bytes compressed`, size <= 4096 && Buffer.byteLength(html) <= 32768);

    const ctx = await browser.newContext({ viewport: { width: 360, height: 700 } });
    const open = async (name, chatData, publicData, width = 360) => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await p.setViewportSize({ width, height: 900 });
      await p.setContent(page(widgets[name][0], chatData, publicData));
      await p.waitForFunction(() => window.__ready);
      return p;
    };
    const angle = (p) => p.evaluate(() => {
      const m = getComputedStyle(document.getElementById('g')).transform;
      if (!m || m === 'none') return 0;
      const [a, b] = m.slice(7, -1).split(',').map(Number);
      return (Math.atan2(b, a) * 180) / Math.PI;
    });

    // ---------- 1. the wheel ----------
    const wheel = await open('coins_widget.html', JSON.stringify({ r: 1, b: 250, s: -1 }), '');
    ok('1. the balance', (await wheel.textContent('#b')) === '250');
    ok('1. eight slices, the egg first', (await wheel.$$eval('#g path', (e) => e.length)) === 8 && (await wheel.$$eval('#g text', (e) => e.map((t) => t.textContent)))[0] === '🥚');
    ok('1. a spin to be had', (await wheel.textContent('#n')).includes('Spin for 100'));

    // ---------- 2. a spin ----------
    await wheel.evaluate((d) => window.__chat(d), JSON.stringify({ r: 2, b: 200, f: 150, s: 2, w: 50, t: now() }));
    await wheel.waitForTimeout(1200);
    ok('2. turning: the balance from before the win, nothing said yet', (await wheel.textContent('#b')) === '150' && (await wheel.textContent('#w')) === '');
    ok('2. the wheel is turning', Math.abs(await angle(wheel)) > 1);
    await wheel.waitForTimeout(5200);
    const stopped = ((await angle(wheel)) % 360 + 360) % 360;
    // Slot 2's middle is at 90° clockwise from the top; turned onto the pointer, the wheel is at
    // -90° give or take a third of a slice.
    ok('2. it stops with slot 2 (50) under the pointer', Math.abs(((stopped + 90 + 540) % 360) - 180) <= 16, stopped);
    ok('2. the win said, and buzzed', (await wheel.textContent('#w')) === '+50 uwuCoins!' && (await wheel.evaluate(() => window.__buzz)) === 1);
    await wheel.waitForTimeout(1200);
    ok('2. the balance counted up to after it', (await wheel.textContent('#b')) === '200');
    await wheel.close();

    const still = await browser.newContext({ viewport: { width: 360, height: 700 }, reducedMotion: 'reduce' });
    const egg = await still.newPage();
    egg.on('pageerror', (e) => errors.push(`egg: ${e.message}`));
    await egg.setContent(page(widgets['coins_widget.html'][0], JSON.stringify({ r: 1, b: 140, s: -1 }), ''));
    await egg.waitForFunction(() => window.__ready);
    await egg.evaluate((d) => window.__chat(d), JSON.stringify({ r: 2, b: 40, f: 40, s: 0, w: 0, t: now() }));
    await egg.waitForTimeout(300);
    ok('2. the egg slot: its link is in the chat', (await egg.textContent('#w')).includes('Easter egg') && (await egg.textContent('#w')).includes('link'));
    ok('2. 40 left: 60 more for a spin', (await egg.textContent('#n')).startsWith('60 more uwuCoins for a spin'));
    await still.close();

    const old = await open('coins_widget.html', JSON.stringify({ r: 5, b: 120, f: 50, s: 4, w: 70, t: now() - 600 }), '');
    await old.waitForTimeout(300);
    ok('2. a spin from a while ago: said, not turned again', (await old.textContent('#b')) === '120' && (await old.textContent('#w')) === '+70 uwuCoins!' && Math.abs(await angle(old)) < 1);
    await old.close();

    // ---------- 3. the team ----------
    const team = { r: 3, n: 'Night Owls', m: ['Bea', 'Alex', 'Sam'], k: 23,
      h: [[7, 9], [5, 5], [2, 5], [0, 1], [134, 180], [1, 1], [1, 2], [23, 100], [3, 4]], o: ['Bea', now() - 600] };
    const tw = await open('team_widget.html', null, JSON.stringify(team), 320);
    let t = await tw.textContent('#a');
    ok('3. the team, its feats done and rides', t.includes('Night Owls') && t.includes('2 of 9 feats') && t.includes('23 rides'), t.slice(0, 80));
    ok('3. its members', (await tw.$$eval('.ms span', (e) => e.map((x) => x.textContent))).join() === 'Bea,Alex,Sam');
    ok('3. how far along each', t.includes('7/9') && t.includes('✓ Done') && t.includes('2h 14m of 3h') && t.includes('23/100'), t);
    ok('3. the hand-off, and by when to carry on', t.includes('Bea’s trip ended at') && t.includes('Carry on from there by'));
    await tw.click('[data-i="3"]');
    ok('3. a feat tapped says what it asks', (await tw.textContent('#a')).includes('come back to where you started'));
    const tall = await tw.evaluate(() => document.body.getBoundingClientRect().height);
    ok('3. under 560 px at 320 wide, with a feat open', tall < 560, tall);
    await tw.evaluate((d) => { TelegramWidget.publicData = d; (window.__h.publicDataChanged || []).forEach((f) => f()); }, JSON.stringify({ r: 4, n: 'Night Owls', x: 1 }));
    ok('3. an ended team says so', (await tw.textContent('#a')).includes('has ended'));
    await tw.close();

    // ---------- 4. the trip card, arrived ----------
    const trip = { r: 5, n: 'Sam', t: 'One Raffles Place', a: now(), i: 3, c: 4, k: 'w', l: 'Walk', d: 'One Raffles Place', s: 0, u: now(), e: 1, p: [] };
    const card = await open('trip_widget.html', JSON.stringify({ o: 1, c: 42 }), JSON.stringify(trip));
    await card.waitForTimeout(100);
    const mid = Number(await card.textContent('#cc'));
    await card.waitForTimeout(1400);
    ok('4. arrived: its uwuCoins counting up to 42', mid < 42 && (await card.textContent('#cc')) === '42' && (await card.textContent('.cn')).includes('uwuCoins'), mid);
    await card.reload();
    await card.setContent(page(widgets['trip_widget.html'][0], JSON.stringify({ o: 1, c: 42 }), JSON.stringify(trip)));
    await card.close();
    await ctx.close();

    // ---------- 5. the website ----------
    let eggLink = { kind: 'egg', data: { used: false } };
    let redeemed = 0;
    const teamRun = { id: 'nightowls1', name: 'Night Owls', createdAt: Date.now(), expiresAt: Date.now() + 864e5, members: [{ id: 'm1', name: 'Bea', joinedAt: Date.now() - 1e5, left: false }], events: [] };
    const site = async (storage) => {
      const c = await browser.newContext({ serviceWorkers: 'block' });
      await c.addInitScript((s) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }, { sgbus_first_run: 'done', sgbus_tour: 'done', ...storage });
      await c.route(`${ORIGIN}/**`, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.pathname === '/api/share' && req.method() === 'POST') {
          redeemed++;
          return eggLink.data.used ? route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"used"}' })
            : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        }
        if (url.pathname === '/api/share') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...eggLink, updatedAt: Date.now() }) });
        if (url.pathname === '/api/team') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teamRun) });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
        if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      });
      await c.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
      return c;
    };
    const go = async (c, hash = '') => {
      const p = await c.newPage();
      p.on('pageerror', (e) => errors.push(`site: ${e.message}`));
      p.on('dialog', (d) => { p.__said = d.message(); d.dismiss(); });
      await p.goto(`${ORIGIN}/${hash}`);
      await p.waitForFunction(() => window.Coins && window.Eggs && typeof window.openSettings === 'function');
      return p;
    };

    let c = await site({});
    let p = await go(c, '#share/egg0000001');
    await p.waitForFunction(() => !document.getElementById('coinResult')?.hidden, null, { timeout: 10000 });
    // GTA VI's colours are the wheel's to give once anyone can't just set them (js/gta6.js, after
    // 26 November 2026), and an egg before then.
    const first = { text: await p.textContent('#coinResult'), redeemed, due: await p.evaluate(() => window.Gta6.due()) };
    ok(`5. an egg link: ${first.due ? 'GTA VI\'s colours, while they\'re the wheel\'s' : 'an Easter egg, as the colours can still be set'}`,
      first.text.includes(first.due ? 'GTA VI' : 'An Easter egg') && first.redeemed === 1, JSON.stringify(first));
    if (!first.due) {
      // Due, as after 26 November: the colours, not an egg.
      const later = await p.evaluate(async () => {
        window.Gta6.due = () => true;
        window.Gta6.claim = () => {};
        return (await window.Coins.redeemEgg('egg0000009')).gta6 === true;
      });
      ok('5. an egg link once the colours are the wheel\'s: GTA VI\'s colours', later);
    }
    await c.close();

    c = await site({ sgbus_gta6: JSON.stringify({ at: Date.now(), how: 'set' }) });
    p = await go(c, '#share/egg0000002');
    await p.waitForFunction(() => !document.getElementById('coinResult')?.hidden, null, { timeout: 10000 });
    const won = await p.evaluate(() => ({ text: document.getElementById('coinResult').textContent, eggs: window.Eggs.list() }));
    ok('5. with the colours already theirs: an Easter egg, found', won.text.includes('An Easter egg') && won.eggs.length === 1, JSON.stringify(won));
    ok('5. its history says where from', (await p.evaluate(() => JSON.parse(localStorage.getItem('sgbus_coins')).log[0].why)) === 'egg');
    await c.close();

    eggLink = { kind: 'egg', data: { used: true } };
    const before = redeemed;
    c = await site({});
    p = await go(c, '#share/egg0000003');
    await p.waitForTimeout(800);
    ok('5. a used link says so, and gives nothing', (p.__said || '').includes('has been used') && redeemed === before, `${p.__said} ${redeemed} ${before}`);
    ok('5. the sync list: this device\'s balance, with its own id', await p.evaluate(() => {
      window.Coins.add(130, { why: 'simulated' }, { quiet: true });
      const own = ownFavs().coins;
      return own.length === 1 && own[0].balance === 130 && own[0].id === window.Coins.syncId() && /^w-/.test(own[0].id);
    }));
    ok('5. another\'s cleaned: one, a whole positive number', await p.evaluate(() => {
      const got = cleanFavs({ coins: [{ id: 'tg-42', balance: 200 }, { id: 'x', balance: 5 }] }).coins;
      const bad = cleanFavs({ coins: [{ id: 'tg-42', balance: -1 }] }).coins;
      return got.length === 1 && got[0].balance === 200 && bad.length === 0;
    }));
    ok('5. sync keeps coins', await p.evaluate(() => ownKinds().includes('coins') && FAV_KINDS.some((k) => k.kind === 'coins')));
    await c.close();

    c = await site({ sgbus_team: JSON.stringify({ id: 'nightowls1', name: 'Night Owls', member: { id: 'm1', secret: 's'.repeat(32), name: 'Bea' } }) });
    p = await go(c);
    await p.evaluate(() => window.openSettings('achievements'));
    await p.waitForFunction(() => !document.getElementById('teamIn')?.hidden, null, { timeout: 10000 });
    const tg = await p.evaluate(() => { const a = document.getElementById('teamTelegram'); return { href: a.href, text: a.textContent.trim() }; });
    ok('5. a team run: Join in Telegram, to the bot with its code', tg.href === 'https://t.me/sgbus_app?start=team_nightowls1' && tg.text === 'Join in Telegram', JSON.stringify(tg));
    await c.close();

    // The guide's pictures (docs-site/content/bot/coins.md), with SHOTS=1.
    if (process.env.SHOTS) {
      const out = path.join(ROOT, 'docs-site/public/screenshots/bot');
      fs.mkdirSync(out, { recursive: true });
      const shot = await browser.newContext({ viewport: { width: 380, height: 900 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
      const w = await shot.newPage();
      await w.setContent(page(widgets['coins_widget.html'][0], JSON.stringify({ r: 1, b: 230, s: -1 }), ''));
      await w.waitForFunction(() => window.__ready);
      await w.evaluate((d) => window.__chat(d), JSON.stringify({ r: 2, b: 280, f: 130, s: 6, w: 150, t: Math.floor(Date.now() / 1000) }));
      await w.waitForTimeout(400);
      await (await w.$('body')).screenshot({ path: path.join(out, 'coins-wheel.png') });
      const tm = await shot.newPage();
      await tm.setContent(page(widgets['team_widget.html'][0], null, JSON.stringify({ r: 3, n: 'Night Owls', m: ['Bea', 'Alex', 'Sam'], k: 23,
        h: [[7, 9], [5, 5], [2, 5], [0, 1], [134, 180], [1, 1], [1, 2], [23, 100], [3, 4]], o: ['Bea', Math.floor(Date.now() / 1000) - 600] })));
      await tm.waitForFunction(() => window.__ready);
      await (await tm.$('body')).screenshot({ path: path.join(out, 'team-widget.png') });
      await shot.close();
      console.log('saved docs-site/public/screenshots/bot/coins-wheel.png, team-widget.png');
    }

    ok('6. no errors', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
