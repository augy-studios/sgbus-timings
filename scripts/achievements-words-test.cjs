// Achievements' 100 rides feat and its note on checked rides, in every language (bug report of
// 3 November 2026: Malay called the feat's rides trips, so 17 of 100 looked like it disagreed
// with Your trips' 13 trips), in Chrome under Playwright, from this checkout.
//
//   node scripts/achievements-words-test.cjs
//
// Needs Playwright as scripts/coins-modes-feats-test.cjs does. No server: the page is served from
// main-site/ by Playwright itself, and /api/* answers "not found". SHOTS=<dir> keeps a
// screenshot of Achievements in each language.
//
// What it checks, in en, ms, ta and zh-SG:
//   1. The 100 rides feat is named in that language's word for rides, as Your trips' stats say
//      rides (history.rides), and not its word for trips (history.trips).
//   2. 17 rides: the feat says 17 of 100.
//   3. The note on checked rides is under the feats, shown, in that language, with coins on or
//      off.
//   4. No page errors.
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
const SHOTS = process.env.SHOTS && path.resolve(process.env.SHOTS);

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };
const words = (lang) => JSON.parse(fs.readFileSync(path.join(SITE, 'i18n', `${lang}.json`), 'utf8'));

async function site(browser, lang, coins) {
  const context = await browser.newContext({ viewport: { width: 354, height: 708 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.addInitScript(([lang, coins]) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('sgbus_first_run', 'done');
      localStorage.setItem('sgbus_tour', 'done');
      localStorage.setItem('sgbus_tours', JSON.stringify(['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']));
      localStorage.setItem('sgbus_retrofit', JSON.stringify({ at: 0, trips: 0, coins: 0, feats: [] }));
      localStorage.setItem('sgbus_lang', lang);
      if (!coins) localStorage.setItem('sgbus_coins_shown', 'off');
    }
    Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {} } });
  }, [lang, coins]);
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
  await page.waitForFunction(() => window.MainScreen && window.Eggs && window.RideCheck && window.simulateRide);
  return { context, page, errors };
}

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  for (const lang of ['en', 'ms', 'ta', 'zh-SG']) {
    const w = words(lang);
    // Chinese puts its measure word (次, 个) by the number, so it's left out.
    const rideWord = w['history.rides'].replace('{n}', '').trim().replace(/^[次个]/, '');
    const tripWord = w['history.trips'].replace('{n}', '').trim().replace(/^[次个]/, '');
    ok(`${lang} 1. rides and trips are different words`, rideWord !== tripWord, `${rideWord} / ${tripWord}`);

    for (const coins of [true, false]) {
      const { context, page, errors } = await site(browser, lang, coins);
      await page.evaluate(() => { for (let i = 0; i < 17; i++) simulateRide(i % 2 ? '12' : 'EW'); });
      await page.evaluate(() => document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => window.closeModal?.(m.id)));
      await page.click('#settingsBtn');
      await page.evaluate(() => { window.openSettingsGroup?.('achievements'); Eggs.renderAchievements(); });
      await page.waitForSelector('#achievementsList .achievement');
      const got = await page.evaluate(() => {
        const p = Eggs.progress().find((x) => x.id === 'hundred');
        const card = [...document.querySelectorAll('#achievementsList .achievement')].find((li) => li.textContent.includes(p.name));
        const note = document.querySelector('[data-i18n="achievements.ridesNote"]');
        const r = note?.getBoundingClientRect();
        return {
          name: p.name, have: p.have, need: p.need, card: card?.textContent.replace(/\s+/g, ' ').trim() || '',
          note: note?.textContent.trim() || '', noteShown: !!note && getComputedStyle(note).display !== 'none' && !note.closest('[hidden]') && r.height > 0,
          noteAfterList: !!note && !!(document.getElementById('achievementsList').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
      });
      const tag = `${lang} coins ${coins ? 'on' : 'off'}`;
      if (coins) {
        ok(`${lang} 1. the feat says rides`, got.name === w['eggs.hundred'] && got.name.includes(rideWord), got.name);
        ok(`${lang} 1. the feat doesn't say trips`, !got.name.includes(tripWord) && !w['eggs.hundred.goal'].includes(tripWord), got.name);
        ok(`${lang} 2. 17 of 100`, got.have === 17 && got.need === 100 && got.card.includes(w['achievements.of'].replace('{have}', '17').replace('{need}', '100')), got.card);
      }
      ok(`${tag} 3. the note on checked rides is shown, in ${lang}`, got.noteShown && got.note === w['achievements.ridesNote'], got.note);
      ok(`${tag} 3. under the feats`, got.noteAfterList);
      if (SHOTS && coins) {
        await page.evaluate(() => document.querySelector('[data-i18n="achievements.ridesNote"]').scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(800); // the sheet's opening fade
        await page.screenshot({ path: path.join(SHOTS, `achievements-${lang}.png`) });
      }
      ok(`${tag} 4. no page errors`, errors.length === 0, errors.join(' | '));
      await context.close();
    }
  }

  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nAll passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
