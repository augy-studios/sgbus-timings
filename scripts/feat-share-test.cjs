// Tests sharing a feat (main-site/js/eggs.js, js/share.js Share.feat, api/_lib/share-links.js
// kind 'feat', api/_lib/feat-card.js): the page runs in Chrome under Playwright, from this
// checkout, with feats done put in storage first.
//
//   node scripts/feat-share-test.cjs
//
// Needs Playwright, as scripts/ride-check-test.cjs does (PLAYWRIGHT=, CHROME= the same). No
// server: the page is served from main-site/ by Playwright itself. /api/share checks what's sent
// with the site's own parseLink and keeps it, and /api/feat-card draws the card with the site's
// own featCardPng (in the plain font if Google Fonts can't be reached).
//
// What it checks:
//   1. Achievements has a Share on each feat done, and none on the others, and Share your
//      achievements once one's done.
//   2. A feat's Share opens the share card: it sends the feat, every feat done, your name and the
//      day, which the server takes; the link is /feat/<id>, the card's picture is 1200 × 630, and
//      Save image is offered.
//   3. Share your achievements sends no one feat.
//   4. The link opened on another phone, with no feats done: the feat, the goal as "Your turn",
//      how far along they are, and its button opens their Achievements.
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

const SITE = path.resolve(__dirname, '../main-site');
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ID = 'abcde12345';
const KTM_AT = Date.parse('2026-11-01T20:30:00+08:00');

let failures = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`);
  if (!cond) failures++;
}

(async () => {
  const links = await import(pathToFileURL(path.join(SITE, 'api/_lib/share-links.js')).href);
  const { featCardPng } = await import(pathToFileURL(path.join(SITE, 'api/_lib/feat-card.js')).href);
  const browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.CHROME && { executablePath: process.env.CHROME }),
  });
  const errors = [];
  const sent = []; // what each POST to /api/share sent, as the server took it
  let kept = null;

  async function newContext(storage) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript((s) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, { sgbus_first_run: 'done', sgbus_tour: 'done', ...storage });
    await context.route(`${ORIGIN}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname === '/api/share' && req.method() === 'POST') {
        const { kind, data } = req.postDataJSON();
        try {
          kept = { kind, data: links.parseLink(kind, data) };
          sent.push(kept.data);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: ID, path: `/${links.PATHS[kind]}/${ID}` }) });
        } catch (e) {
          sent.push({ error: e.message });
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: e.message }) });
        }
      }
      if (url.pathname === '/api/share' && kept) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...kept, updatedAt: Date.now() }) });
      if (url.pathname === '/api/feat-card' && kept) return route.fulfill({ status: 200, contentType: 'image/png', body: await featCardPng(kept.data) });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
    return context;
  }

  async function open(context, hash = '') {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(`${ORIGIN}/${hash}`);
    await page.waitForFunction(() => window.Eggs && window.Share && typeof window.openSettings === 'function');
    return page;
  }

  try {
    // ---------- the sharer ----------
    const mine = await newContext({ sgbus_name: 'Augy', sgbus_feats: { up: KTM_AT - 86400000, ktm: KTM_AT } });
    const page = await open(mine);
    await page.evaluate(() => window.openSettings('achievements'));
    const list = await page.evaluate(() => ({
      shares: [...document.querySelectorAll('#achievementsList [data-feat-share]')].map((b) => b.dataset.featShare),
      all: !document.getElementById('achievementsShare').hidden,
    }));
    ok('1. a Share on each feat done, and only those', JSON.stringify(list.shares) === '["up","ktm"]', JSON.stringify(list.shares));
    ok('1. Share your achievements, with a feat done', list.all);

    await page.click('#achievementsList [data-feat-share="ktm"]');
    await page.waitForSelector('#shareCardModal:not(.hidden)');
    await page.waitForFunction(() => !document.getElementById('shareMapImg').hidden, null, { timeout: 15000 });
    const card = await page.evaluate(() => ({
      title: document.getElementById('shareCardTitle').textContent,
      name: document.getElementById('shareCardName').textContent,
      link: document.getElementById('shareCardLink').textContent,
      size: [document.getElementById('shareMapImg').naturalWidth, document.getElementById('shareMapImg').naturalHeight],
      wide: document.getElementById('shareMap').classList.contains('card'),
      save: (() => { const b = document.querySelector('[data-share-to="image"]'); return !b.hidden && !b.disabled; })(),
    }));
    ok('2. what was sent, as the server took it', JSON.stringify(sent[0]) === JSON.stringify({ feat: 'ktm', done: ['up', 'ktm'], name: 'Augy', on: '2026-11-01' }), JSON.stringify(sent[0]));
    ok('2. the card says the feat', card.title === 'Share this feat' && card.name === 'Down the old railway', `${card.title} / ${card.name}`);
    ok('2. a /feat/ link', card.link === `${ORIGIN}/feat/${ID}`, card.link);
    ok('2. the card\'s picture, 1200 × 630, shown whole', card.size.join('x') === '1200x630' && card.wide, card.size.join('x'));
    ok('2. Save image offered', card.save);

    await page.evaluate(() => window.closeModal('shareCardModal'));
    await page.click('#achievementsShare');
    await page.waitForFunction(() => document.getElementById('shareCardLink').textContent.includes('/feat/'));
    ok('3. Share your achievements: no one feat', sent[1]?.feat === null && JSON.stringify(sent[1]?.done) === '["up","ktm"]', JSON.stringify(sent[1]));
    await mine.close();

    // ---------- whoever opens it ----------
    kept = { kind: 'feat', data: sent[0] };
    const theirs = await newContext({});
    const them = await open(theirs, `#share/${ID}`);
    await them.waitForSelector('#eggModal:not(.hidden)');
    const shown = await them.evaluate(() => ['eggTitle', 'eggName', 'eggHow', 'eggCount', 'eggGo'].map((id) => document.getElementById(id).textContent));
    ok('4. who did which feat', shown[0] === 'Augy did a feat!' && shown[1] === 'Down the old railway', `${shown[0]} / ${shown[1]}`);
    ok('4. their turn, and how far along they are', shown[2] === 'Your turn: Travel between two places on the old KTM railway line.' && shown[3] === 'You: 0 of 9 feats done', `${shown[2]} / ${shown[3]}`);
    await them.click('#eggGo');
    await them.waitForFunction(() => !document.querySelector('[data-settings-group="achievements"]').hidden, null, { timeout: 5000 }).catch(() => {});
    ok('4. its button opens their Achievements', await them.evaluate(() => !document.querySelector('[data-settings-group="achievements"]').hidden));
    await theirs.close();

    ok('no errors on the page', !errors.length, errors.join(' | '));
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
