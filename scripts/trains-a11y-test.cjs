// Train times, the map's station card, a Navigate ride's trains and the place form, in light and
// dark mode and High contrast with each: every bit of text against what's behind it meets WCAG 2.2
// AA's contrast (1.4.3: 4.5:1, or 3:1 for large text), and what a colour means (a changed train,
// one of the last three) is said in words too (1.4.1). What's behind a piece of text is worked out as a
// browser paints it: each ancestor's background colour laid over the one below, see-through ones
// and all, down to the page's own. Glass (a blurred see-through card) is taken over the page's
// background, as axe takes it.
//
//   node scripts/trains-a11y-test.cjs        SHOTS=<folder> also saves each scene
//
// Needs Playwright as scripts/near-stops-test.cjs does. No server: the page is served from
// main-site/ by Playwright itself, with /api/* answered from what's below.
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
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const STOPS = [{ c: '75009', n: 'Tampines Int', r: 'Tampines Ctrl 1', la: 1.35406, lo: 103.94339 }];
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

function dayNow() {
  const d = new Date(Date.now() + 8 * 3600e3);
  if (d.getUTCHours() < 3) d.setUTCDate(d.getUTCDate() - 1);
  const day = d.toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00Z`) - 8 * 3600e3;
  return { day, start, now: Math.round((Date.now() - start) / 1000) };
}

// Tampines during a disruption: a cancelled train and a late one towards Pasir Ris, trains to
// two places towards Tuas Link, and the Downtown line's last two of the day towards Expo, so every
// kind of row and mark is drawn.
function tampines({ live = true } = {}) {
  const { day, start, now } = dayNow();
  const at = (min) => now + min * 60;
  return {
    day, start, now, live, feedAt: Math.round(Date.now() / 1000),
    platforms: [
      { id: 'EW2_A', code: 'EW2', name: 'Tampines', line: 'EW', colour: '#189E4A', platform: 'A', heads: ['Pasir Ris'], ways: [['EW1']],
        trains: [[at(2), 0, 0, live ? 2 : 0], [at(7), 0, 0, live ? 1 : 0], [at(12), 0, 0, 0], [at(17), 0, 0, 0], [at(22), 0, 0, 0]], first: [19281, 0] },
      { id: 'EW2_B', code: 'EW2', name: 'Tampines', line: 'EW', colour: '#189E4A', platform: 'B', heads: ['Joo Koon', 'Tuas Link'], ways: [['EW3', 'EW29'], ['EW3', 'EW29', 'EW33']],
        trains: [[at(3), 0, 0, 0], [at(8), 1, 1, 0], [at(13), 0, 0, 0]], first: [19843, 1] },
      { id: 'DT32_B', code: 'DT32', name: 'Tampines', line: 'DT', colour: '#0354A6', platform: 'B', heads: ['Expo'], ways: [['DT33', 'DT35']],
        trains: [[at(4), 0, 0, 0], [at(9), 0, 0, 0]], first: [22484, 0] },
      { id: 'DT32_A', code: 'DT32', name: 'Tampines', line: 'DT', colour: '#0354A6', platform: 'A', heads: ['Bukit Panjang'], ways: [['DT31']],
        trains: [], first: [20563, 0] },
    ],
  };
}
const DOORS = { platforms: [
  { c: 'EW3', l: 'EW', d: 'EW-2', o: 1, x: [], n: 'Simei', e: 1, f: [] },
  { c: 'EW2', l: 'EW', d: 'EW-2', o: 2, x: [], n: 'Tampines', e: 1, f: [{ t: 'escalator', to: 'Exit', doors: [3, 4] }, { t: 'lift', to: 'Exit', doors: [6] }] },
  { c: 'EW1', l: 'EW', d: 'EW-2', o: 3, x: [], n: 'Pasir Ris', e: 1, f: [] },
] };

const MODES = [
  { name: 'light', mode: 'light', contrast: 'off' },
  { name: 'dark', mode: 'dark', contrast: 'off' },
  { name: 'light, high contrast', mode: 'light', contrast: 'on' },
  { name: 'dark, high contrast', mode: 'dark', contrast: 'on' },
];

async function site(browser, m, api) {
  const context = await browser.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: m.mode });
  await context.addInitScript((mm) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('sgbus_first_run', 'done');
    set('sgbus_tour', 'done');
    set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
    set('sgbus_start', 'timings');
    set('sgbus_gta6_offer', '1');
    set('sgbus.mode', mm.mode);
    set('sgbus_contrast', mm.contrast);
  }, m);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bus-stops') return json(STOPS);
    if (url.pathname === '/api/trains') return api.trains ? json(api.trains()) : route.abort();
    if (url.pathname === '/api/trains-all') return route.abort();
    if (url.pathname === '/api/mrt-doors') return api.doors ? json(api.doors) : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
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
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((x) => window.closeModal?.(x.id)); document.body.classList.remove('touring'); });
  await page.evaluate(() => window.MainScreen.open('timings'));
  await page.evaluate(() => StationSearch.load());
  return { context, page, errors };
}

// Every piece of text under `sel`, and each chip or mark's own background, with its contrast.
// Returns the ones short of AA.
function audit(sel) {
  // rgb()/rgba(), and color(srgb r g b / a) as color-mix() gives it, with 0-1 channels.
  const parse = (c) => {
    let m = String(c).match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
    }
    m = String(c).match(/color\(srgb ([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[ /]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] == null ? 1 : p[3]];
    }
    return [0, 0, 0, 0];
  };
  // A background's colours: its colour, or a gradient's (the one text reads worst on is used).
  const layers = (st) => {
    const out = [];
    const grad = st.backgroundImage && st.backgroundImage !== 'none' ? st.backgroundImage.match(/(rgba?\([^)]+\)|color\(srgb [^)]+\))/g) : null;
    if (grad) out.push(grad.map(parse));
    const c = parse(st.backgroundColor);
    return { colour: c, grad: grad ? grad.map(parse) : null };
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // What's painted behind `el` (not counting its own background), from the page up.
  const behind = (el) => {
    const chain = [];
    for (let e = el.parentElement; e; e = e.parentElement) chain.push(e);
    let bg = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (bg[3] < 1) bg = over(bg, [255, 255, 255, 1]);
    const body = parse(getComputedStyle(document.body).backgroundColor);
    if (body[3] > 0) bg = over(body, bg);
    for (const e of chain.reverse()) {
      if (e === document.documentElement || e === document.body) continue;
      bg = paint(getComputedStyle(e), bg);
    }
    return bg;
  };
  // A box's own background over what's behind it: its colour, then a gradient's middle colour.
  const paint = (st, under) => {
    const { colour, grad } = layers(st);
    let bg = colour[3] > 0 ? over(colour, under) : under;
    if (grad?.length) bg = over(grad[Math.floor(grad.length / 2)], bg);
    return bg;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
  };
  const root = document.querySelector(sel);
  if (!root) return { missing: true, bad: [], checked: 0 };
  const bad = [];
  let checked = 0;
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el) || el.closest('[aria-hidden="true"]') || el.closest('svg')) continue;
    const st = getComputedStyle(el);
    const own = parse(st.backgroundColor);
    const back = behind(el);
    const bg = paint(st, back);
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (text) {
      checked++;
      const size = parseFloat(st.fontSize);
      const bold = Number(st.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const fg = over(parse(st.color), bg);
      const r = ratio(fg, bg);
      if (r < (large ? 3 : 4.5)) bad.push({ text: text.slice(0, 40), cls: el.className, ratio: Math.round(r * 100) / 100, need: large ? 3 : 4.5, fg: st.color, bg: `rgb(${bg.slice(0, 3).map(Math.round)})` });
    }
  }
  // A colour that means something is said in words too (1.4.1): a changed train, a last one.
  for (const el of root.querySelectorAll('.trainRow.changed, .trainChip.changed, .legTrain.changed')) {
    checked++;
    if (!/New time|new time/.test(el.textContent)) bad.push({ text: `(${el.className}: changed, in colour only)`, cls: el.className, ratio: 0, need: 'words' });
  }
  for (const el of root.querySelectorAll('.trainRow.last, .trainChip.last')) {
    checked++;
    if (!/last|Last/.test(el.textContent)) bad.push({ text: `(${el.className}: last three, in colour only)`, cls: el.className, ratio: 0, need: 'words' });
  }
  return { bad, checked };
}

const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
const report = (scene, m, r) => ok(`${scene}, ${m.name}: contrast AA`, !r.missing && r.bad.length === 0 && r.checked > 0,
  r.missing ? 'not on the page' : r.bad.length ? r.bad.map((b) => `"${b.text}" ${b.ratio}:1 < ${b.need} (${b.fg} on ${b.bg}, .${String(b.cls).split(' ').join('.')})`).join(' | ') : `${r.checked} checked`);

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  for (const m of MODES) {
    const slug = m.name.replace(/[^a-z]+/g, '-');
    const api = { trains: () => tampines(), doors: null };
    const { context, page, errors } = await site(browser, m, api);
    const theme = await page.evaluate(() => [document.documentElement.getAttribute('data-mode'), document.documentElement.getAttribute('data-contrast')]);
    ok(`${m.name}: the page is in that mode`, theme[0] === m.mode && (m.contrast === 'on') === (theme[1] === 'more'), JSON.stringify(theme));

    // The station search's Train times row.
    await page.fill('#q', '');
    await page.type('#q', 'Tampines MRT');
    await page.waitForSelector('#acList .acTrains', { timeout: 5000 }).catch(() => {});
    report('Search: Train times row', m, await page.evaluate(audit, '#acList'));
    await shot(page, `${slug}-search.png`);

    // The window, during a disruption: changed, cancelled, the last three, no trains left.
    await page.click('#acList .acTrains');
    await page.waitForFunction(() => document.querySelectorAll('#trainsBody .trainPlatform').length > 2, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const marks = await page.evaluate(() => ['.trainRow.gone', '.trainRow.changed', '.trainRank', '.trainLastLine.lastThree', '.trainRow.none', '.trainsNote.live'].map((s) => !!document.querySelector(`#trainsBody ${s}`)));
    ok(`Trains window, ${m.name}: every kind of row is drawn`, marks.every(Boolean), JSON.stringify(marks));
    report('Trains window', m, await page.evaluate(audit, '#trainsModal .modal'));
    await shot(page, `${slug}-window.png`);
    await page.evaluate(() => window.closeModal('trainsModal'));

    // Offline, with a copy kept: the warning note.
    api.trains = null;
    await page.evaluate(() => Trains.open({ name: 'Tampines', codes: ['EW2', 'DT32'] }));
    await page.waitForFunction(() => /Offline/.test(document.getElementById('trainsBody').innerText), null, { timeout: 5000 }).catch(() => {});
    report('Trains window offline', m, await page.evaluate(audit, '#trainsModal .modal'));
    await page.evaluate(() => window.closeModal('trainsModal'));
    api.trains = () => tampines();

    // The map's station card, no doors: every platform's trains.
    const openCard = () => page.evaluate(async () => {
      await Trains.load(['EW2', 'DT32'], { force: true });
      MapCard.open({ kind: 'station', name: 'Tampines', codes: ['EW2', 'DT32'], lat: 1.3533, lng: 103.9452 },
        { panel: document.getElementById('mapPanel') || document.body, ink: { toScreen: () => ({ x: 200, y: 420 }) }, onDirections() {}, onTimings() {} });
      for (let i = 0; i < 40 && !document.querySelector('.mapCard .trainCompact'); i++) await new Promise((r) => setTimeout(r, 100));
    });
    // The card sits on the live map's panel; shown here over the page as it is on the map's.
    await page.evaluate(() => { const p = document.getElementById('mapPanel'); if (p) { p.hidden = false; p.classList.remove('hidden'); p.style.display = 'block'; } });
    await openCard();
    report('Map station card', m, await page.evaluate(audit, '.mapCard'));
    await shot(page, `${slug}-card.png`);
    await page.evaluate(() => MapCard.close());

    // With the doors: a direction's page with its trains, the others under it.
    api.doors = DOORS;
    await page.evaluate(() => MrtDoors.load?.({ force: true }));
    await openCard();
    await page.waitForFunction(() => !!document.querySelector('.mapCard .mcSlide .trainCompact'), null, { timeout: 5000 }).catch(() => {});
    report('Map station card with doors', m, await page.evaluate(audit, '.mapCard'));
    await shot(page, `${slug}-card-doors.png`);
    await page.evaluate(() => MapCard.close());
    await page.evaluate(() => { const p = document.getElementById('mapPanel'); if (p) p.style.display = ''; });

    // A Navigate ride's trains: the last train warning, as js/nav.js draws it, in Navigate's card.
    const leg = await page.evaluate(async () => {
      const data = await Trains.load(['EW2', 'DT32'], { force: true });
      navTrains.set(Trains.codesKey(['EW2', 'DT32']), data);
      const ride = { mode: 'train', route: 'DT', name: 'Downtown Line', color: '#005ec4', from: { code: 'EW2/DT32', name: 'Tampines' }, to: { code: 'DT35', name: 'Expo' } };
      const plain = { ...ride, to: { code: 'EW1', name: 'Pasir Ris' } };
      openNav?.();
      const body = document.getElementById('navBody');
      body.innerHTML = `<ol class="journeySteps"><li class="step stepLeg"><div class="legHead"><span class="busChip lineChip"><span class="lineDot" style="--line:#005ec4"></span>DT</span><span>Downtown Line</span></div>` +
        `<div class="legRide">From Tampines, towards Expo: 3 stops to Expo, ~6 min</div>${legTrainsHtml(ride, Date.now())}</li>` +
        `<li class="step stepLeg"><div class="legRide">From Tampines, towards Pasir Ris: 1 stop</div>${legTrainsHtml(plain, Date.now())}</li></ol>`;
      return { warn: !!body.querySelector('.legWarn'), last: body.querySelectorAll('.legTrain.last').length };
    });
    ok(`Navigate, ${m.name}: the last train warning and its red trains are drawn`, leg.warn && leg.last === 2, JSON.stringify(leg));
    report('Navigate train ride', m, await page.evaluate(audit, '#navBody'));
    await shot(page, `${slug}-nav.png`);
    await page.evaluate(() => window.closeNav?.());

    // The place form, in its window.
    await page.evaluate(() => { Places.set('home', { label: 'Blk 123 Tampines St 11', lat: 1.35, lng: 103.94 }); Places.edit('home'); });
    await page.waitForTimeout(400);
    report('Place form', m, await page.evaluate(audit, '#placeFormModal .modal'));
    await shot(page, `${slug}-place.png`);
    await page.evaluate(() => window.closeModal('placeFormModal'));

    ok(`${m.name}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
