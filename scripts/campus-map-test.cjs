// Campus shuttles in the app (help desk #13, js/campus.js): NUS's and NTU's routes on Explorer,
// a campus stop's card with its routes and what the timetable says, an LTA stop shared with
// them showing its live buses and the shuttles both, on the map and in Bus timings, at moments
// set by hand on Singapore's clock (the phone itself on London time, which mustn't matter).
//
//   node scripts/campus-map-test.cjs
//   SHOTS=<folder> node scripts/campus-map-test.cjs     also saves screenshots there
//   TILES=1 ...                                         lets the map's real tiles in (online)
//   ROADS=<file> ...                                    answers /api/road from a file of
//                                                       { "<points>": [[lat, lng], ...] }, as the
//                                                       site's own answers, for the screenshots
//
// Needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>. No server: the
// page is served from main-site/ by Playwright itself, with /api/* answered from what's below.
// The dots are tapped at the map's middle, where Explorer puts you.
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
const ROADS = process.env.ROADS ? JSON.parse(fs.readFileSync(process.env.ROADS, 'utf8')) : null;
const ORIGIN = 'https://sgbus.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// LTA's stops for the codes the campus files use, and Clementi's: [code, lat, lng, name, road].
const STOPS = [
  ['17179', 1.31509, 103.76516, 'Clementi Stn Exit B', 'Commonwealth Ave West'],
  ['16009', 1.29425, 103.76988, 'Kent Ridge Ter', 'Clementi Rd'],
  ['16141', 1.29787, 103.7696, 'Tentera Diraja Mque', 'Clementi Rd'],
  ['16151', 1.30076, 103.76994, 'The Japanese Pr Sch', 'Clementi Rd'],
  ['16161', 1.30108, 103.77369, 'NUS Museums', 'Kent Ridge Cres'],
  ['16169', 1.30098, 103.7727, 'NUS Raffles Hall', 'Kent Ridge Cres'],
  ['16171', 1.2989, 103.77438, 'Yusof Ishak Hse', 'Kent Ridge Cres'],
  ['16179', 1.29898, 103.77418, 'Opp Yusof Ishak Hse', 'Kent Ridge Cres'],
  ['16181', 1.29657, 103.77254, 'Ctrl Lib', 'Kent Ridge Cres'],
  ['16189', 1.29723, 103.77276, 'Information Technology', 'Kent Ridge Cres'],
  ['18221', 1.2963, 103.78347, 'NUH', 'Lower Kent Ridge Rd'],
  ['18239', 1.29679, 103.78319, 'Opp NUH', 'Lower Kent Ridge Rd'],
  ['18301', 1.29739, 103.78093, 'Lim Seng Tjoe Bldg (LT 27)', 'Lower Kent Ridge Rd'],
  ['18309', 1.29752, 103.78134, 'Blk S17', 'Lower Kent Ridge Rd'],
  ['18311', 1.29744, 103.77792, 'Blk S12', 'Lower Kent Ridge Rd'],
  ['18319', 1.29753, 103.77813, 'Opp University Hall', 'Lower Kent Ridge Rd'],
  ['18321', 1.29879, 103.77562, 'Opp University Health Ctr', 'Lower Kent Ridge Rd'],
  ['18329', 1.29892, 103.77611, 'University Health Ctr', 'Lower Kent Ridge Rd'],
  ['22529', 1.33777, 103.69729, 'Pioneer Stn Exit B', 'Jurong West St 63'],
  ['27011', 1.35586, 103.68611, 'Hall 11 Blk 55', 'Nanyang Cres'],
  ['27031', 1.35187, 103.68052, 'Hall 12', 'Nanyang Cres'],
  ['27061', 1.34985, 103.68387, 'Sch of ADM', 'Nanyang Dr'],
  ['27071', 1.35508, 103.68453, 'Nanyang Cres Halls', 'Nanyang Cres'],
  ['27199', 1.35352, 103.6864, 'Hall 11', 'Nanyang Ave'],
  ['27209', 1.35151, 103.68569, 'Halls 8 & 9', 'Nanyang Ave'],
  ['27211', 1.34793, 103.6805, 'Lee Wee Nam Lib', 'Nanyang Dr'],
  ['27219', 1.34793, 103.68025, 'NIE Blk 2', 'Nanyang Dr'],
  ['27231', 1.34208, 103.67922, 'Wee Kim Wee Sch of C&I', 'Nanyang Dr'],
  ['27241', 1.33999, 103.68089, 'SPMS', 'Nanyang Dr'],
  ['27261', 1.34378, 103.68692, 'Hall 4', 'Nanyang Dr'],
  ['27281', 1.34566, 103.68781, 'Hall 1', 'Lien Ying Chow Dr'],
  ['27311', 1.34902, 103.68539, 'Hall 2', 'Lien Ying Chow Dr'],
  ['41021', 1.32265, 103.81554, 'Botanic Gdns Stn', 'Bt Timah Rd'],
  ['41029', 1.32333, 103.81631, 'Opp Botanic Gdns Stn', 'Dunearn Rd'],
].map(([c, la, lo, n, r]) => ({ c, n, r, la, lo }));
// Live buses at a stop: bus 95 three minutes away, at every stop. Its route calls at them all,
// 06:00 to 23:59 every day.
const arrivals = (stop) => ({ busStopCode: stop, services: [{ serviceNo: '95', operator: 'SBST', next: { eta_ms: 180000, load: 'SEA', deck: 'Double', wheelchair: true } }] });
const ROUTES = {
  services: { 95: { op: 'SBST', cat: 'TRUNK', loop: false, dirs: { 1: [STOPS[0].c, STOPS[STOPS.length - 1].c] } } },
  runs: { 95: { 1: { stops: STOPS.map((s) => s.c), times: STOPS.map(() => '060023590600235906002359') } } },
};

let fails = 0;
let passes = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`);
  if (cond) passes++;
  else fails++;
};
// A moment on Singapore's clock.
const sgTime = (at) => new Date(`${at}:00+08:00`);

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const context = await browser.newContext({
    viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/London',
    geolocation: { latitude: 1.31509, longitude: 103.76516, accuracy: 10 }, permissions: ['geolocation'], serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('sgbus_first_run', 'done');
      set('sgbus_tour', 'done');
      set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
      set('sgbus_start', 'timings');
      set('sgbus.mode', 'light');
    }
    let ml;
    Object.defineProperty(window, 'maplibregl', {
      configurable: true,
      get: () => ml,
      set(v) {
        ml = v;
        const on = v.Map.prototype.on;
        v.Map.prototype.on = function (...a) {
          if (!this.__caught) { this.__caught = true; window.__map = this; }
          return on.apply(this, a);
        };
      },
    });
  });
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bus-stops') return json(STOPS);
    if (url.pathname === '/api/bus-arrivals') return json(arrivals(url.searchParams.get('stop')));
    if (url.pathname === '/api/bus-routes') return json(ROUTES);
    if (url.pathname === '/api/road' && ROADS?.[url.searchParams.get('points')]) return json({ path: ROADS[url.searchParams.get('points')], source: 'osm' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  if (!process.env.TILES) await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  // Console errors, but not the 404s of what this test turns away (tiles, /api/road).
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|404/.test(m.text())) errors.push(`console: ${m.text()}`); });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

  await page.clock.setFixedTime(sgTime('2026-10-30T08:30'));
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'));
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); document.body.classList.remove('touring'); });

  // ---------- Bus timings: an LTA stop with campus shuttles ----------
  const timings = async (code, service = null) => {
    await page.evaluate(([c, s]) => window.loadStop(c, { service: s }), [code, service]);
    await page.waitForFunction(() => document.querySelector('#services .svc'), null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
  };
  const campusRows = () => page.$$eval('#campusSvc:not([hidden]) .campusRow', (rows) => rows.map((r) => ({ no: r.querySelector('.campusNo').textContent, text: r.querySelector('.campusWhen').innerText.replace(/\s+/g, ' ') })));
  const rowText = (rows, no) => rows.find((r) => r.no === no)?.text || '';

  await timings('16181');
  let rows = await campusRows();
  ok('16181 Ctrl Lib, Fri 08:30: its live bus 95 is there', await page.$$eval('#services .svc', (s) => s.map((x) => x.dataset.svc).join()) === '95');
  ok('16181: the campus shuttles A1, D1, K, R1 under it', rows.map((r) => r.no).join() === 'A1,D1,K,R1', JSON.stringify(rows));
  ok('16181: says they\'re scheduled, not live', /scheduled times, not live/.test(await page.$eval('#campusSvc .campusHead', (e) => e.textContent)));
  ok('A1 (frequency), Fri 08:30 in term: every 4–6 min till 23:00', rowText(rows, 'A1') === 'Every 4–6 min NUS · Till 23:00', rowText(rows, 'A1'));
  ok('K (timetable): next three from PGP', rowText(rows, 'K') === '09:04 · 09:44 · 10:24 NUS · Leaves PGP', rowText(rows, 'K'));
  ok('R1 (timetable): next three from Kent Vale', rowText(rows, 'R1') === '08:40 · 09:00 · 09:20 NUS · Leaves Kent Vale', rowText(rows, 'R1'));
  ok('says NUS term timings', /NUS term timings/.test(await page.$eval('#campusSvc .campusFoot', (e) => e.textContent)));
  await page.$eval('#campusSvc', (e) => e.scrollIntoView({ block: 'center' }));
  await shot('1-bus-timings-ctrl-lib-fri-0830');

  await timings('16181', '95');
  ok('narrowed to bus 95, the shuttles step aside', await page.$eval('#campusSvc', (e) => e.hidden));
  await timings('17179');
  ok('a stop with no shuttles (17179) has no campus list', await page.$eval('#campusSvc', (e) => e.hidden));

  // The clock moved on: a gap, late at night, a Sunday, a public holiday, the vacation.
  const at = async (when, code) => {
    await page.clock.setFixedTime(sgTime(when));
    await timings(code);
    return campusRows();
  };
  rows = await at('2026-10-30T14:05', '16009');
  ok('A1, Fri 14:05: a gap in its times, buses again 14:16', rowText(rows, 'A1') === 'No bus till 14:16 NUS · Every 8–10 min', rowText(rows, 'A1'));
  rows = await at('2026-10-31T23:30', '16009');
  ok('A1, Sat 23:30: no more today, Sunday 09:07', rowText(rows, 'A1') === 'No more buses today NUS · Next: tomorrow 09:07', rowText(rows, 'A1'));
  ok('…and the row is marked off', await page.$$eval('#campusSvc .campusRow.off', (r) => r.length) === 2);
  rows = await at('2026-11-01T10:00', '16181');
  ok('K on a Sunday: not running, Monday 07:04 from PGP', rowText(rows, 'K') === 'Not running today NUS · Next: tomorrow 07:04 from PGP', rowText(rows, 'K'));
  ok('A1 on a Sunday: every ~30 min', rowText(rows, 'A1') === 'Every ~30 min NUS · Till 23:00', rowText(rows, 'A1'));
  rows = await at('2026-11-09T08:00', '16009');
  ok('Mon 9 Nov (Deepavali, a public holiday) 08:00: Sunday times, first 09:07', rowText(rows, 'A1') === 'First bus 09:07 NUS · Every ~30 min', rowText(rows, 'A1'));
  rows = await at('2026-12-15T08:00', '16009');
  ok('Tue 15 Dec (vacation) 08:00: vacation times, every 7–9', rowText(rows, 'A1') === 'Every 7–9 min NUS · Till 23:00', rowText(rows, 'A1'));
  ok('…and says NUS vacation timings', /NUS vacation timings/.test(await page.$eval('#campusSvc .campusFoot', (e) => e.textContent)));
  await page.$eval('#campusSvc', (e) => e.scrollIntoView({ block: 'center' }));
  await shot('2-bus-timings-kent-ridge-ter-vacation');
  rows = await at('2026-10-31T10:00', '22529');
  ok('NTU at Pioneer Stn Exit B, Saturday: CR not running, CR-W every 8–10', rowText(rows, 'CR') === 'Not running today NTU · Next: Mon 07:30' && rowText(rows, 'CR-W') === 'Every 8–10 min NTU · Till 23:00', JSON.stringify(rows));

  // ---------- Explorer ----------
  const openExplorer = async (lat, lng) => {
    await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 10 });
    await page.evaluate(() => window.LiveMap.explore());
    await page.waitForFunction(() => window.LiveMap.mode() === 'explore');
    await page.waitForTimeout(3000);
  };
  const tapCentre = async () => {
    const box = await page.locator('#mapPanel canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1500);
  };
  const card = () => page.evaluate(() => {
    const c = document.querySelector('#mapPanel .mapCard');
    return c ? { label: c.getAttribute('aria-label'), rows: [...c.querySelectorAll('.campusRow')].map((r) => `${r.querySelector('.campusNo').textContent}: ${r.querySelector('.campusWhen').innerText.replace(/\s+/g, ' ')}`), pills: [...c.querySelectorAll('.svcPill')].map((p) => p.textContent), text: c.innerText } : null;
  });
  const closeExplorer = async () => { await page.evaluate(() => window.LiveMap.close()); await page.waitForTimeout(600); };

  await page.clock.setFixedTime(sgTime('2026-10-30T08:30'));
  // Kent Vale, a campus stop LTA hasn't got.
  await openExplorer(1.302182011055529, 103.76926465870102);
  const gl = await page.evaluate(() => !!window.__map?.getSource?.('sg-shuttle'));
  if (gl) {
    const drawn = await page.evaluate(() => ({
      lines: window.__map.getSource('sg-shuttle')._data.features.length,
      campus: window.__map.getSource('sg-poi')._data.features.filter((f) => f.properties.kind === 'campus').length,
      stops: window.__map.getSource('sg-poi')._data.features.filter((f) => f.properties.kind === 'stop').length,
      layers: window.__map.getStyle().layers.map((l) => l.id).filter((id) => id.startsWith('sg-')),
    }));
    ok('Explorer draws the 12 NUS and NTU routes', drawn.lines === 12, JSON.stringify(drawn.lines));
    ok('…and 33 campus stops LTA hasn\'t got as dots of their own', drawn.campus === 33, String(drawn.campus));
    ok('…with LTA\'s stops each drawn once (34, no campus copy)', drawn.stops === STOPS.length, String(drawn.stops));
    const order = drawn.layers;
    ok('…the shuttles over the MRT lines and under the stops', order.indexOf('sg-rail') < order.indexOf('sg-shuttle') && order.indexOf('sg-shuttle') < order.indexOf('sg-poi-stop') && order.indexOf('sg-poi-campus') > -1, order.join(' '));
  } else {
    ok('Explorer drew with MapLibre (no WebGL here: Leaflet)', false);
  }
  await shot('3-explorer-nus-lines');
  await tapCentre();
  let c = await card();
  ok('Kent Vale\'s dot opens its card', /NUS shuttle stop Kent Vale/.test(c?.label || ''), c?.label);
  ok('…with K, R1, R2 and P', (c?.rows || []).map((r) => r.split(':')[0]).join() === 'K,R1,R2,P', JSON.stringify(c?.rows));
  ok('…K leaves here', (c?.rows || []).some((r) => r === 'K: 08:40 · 09:20 · 10:00 NUS · Leaves here'), JSON.stringify(c?.rows));
  ok('…R2 ends here, from PGP', (c?.rows || []).some((r) => /^R2: .* NUS · Leaves PGP · ends here$/.test(r)), JSON.stringify(c?.rows));
  ok('…and says they\'re not live', /scheduled times, not live/.test(c?.text || '') && /No live times for campus shuttles/.test(c?.text || ''));
  ok('…no Show bus timings on a campus stop, but Directions', await page.evaluate(() => !document.querySelector('#mapPanel .mapCard [data-mc-timings]') && !!document.querySelector('#mapPanel .mapCard [data-mc-go]')));
  await shot('4-explorer-kent-vale-card');
  await closeExplorer();

  // Kent Ridge Ter, an LTA stop the shuttles share: its buses and the shuttles, one dot.
  await openExplorer(1.29425, 103.76988);
  await tapCentre();
  c = await card();
  ok('16009 Kent Ridge Ter\'s dot opens the stop\'s card', /Bus stop 16009/.test(c?.label || ''), c?.label);
  ok('…its live bus and the shuttles A1 and A2', c?.pills.join() === '95' && c.rows.map((r) => r.split(':')[0]).join() === 'A1,A2', JSON.stringify(c));
  await shot('5-explorer-kent-ridge-ter-shared');
  // Show bus timings and back: Explorer remembers the stop (help desk #13, earlier).
  await page.evaluate(() => document.querySelector('#mapPanel .mapCard .mcGo[data-mc-timings]').click());
  await page.waitForTimeout(1500);
  ok('Show bus timings opens 16009 with the shuttles', await page.evaluate(() => !window.LiveMap.isOpen() && document.querySelector('#stopCode').textContent === '16009' && !document.querySelector('#campusSvc').hidden));
  await openExplorer(1.3521, 103.8198);
  c = await card();
  ok('Explorer opens again on 16009, card open', /Bus stop 16009/.test(c?.label || ''), c?.label);
  await closeExplorer();

  // NTU's Opp Hall 4 (383004), 15 m across the road from LTA's Hall 4 (27261): the nearer dot.
  await page.clock.setFixedTime(sgTime('2026-11-01T12:00'));
  await openExplorer(1.3436602, 103.6869854);
  await tapCentre();
  c = await card();
  ok('NTU Opp Hall 4 (15 m from LTA Hall 4): its own card', /NTU shuttle stop Opp Hall 4/.test(c?.label || ''), c?.label);
  ok('…CL-B, Sunday 12:00: every 11–13 min', (c?.rows || []).includes('CL-B: Every 11–13 min NTU · Till 23:00'), JSON.stringify(c?.rows));
  await shot('6-explorer-ntu-opp-hall-4-sunday');
  // Leave by Directions, come back: on the campus stop again.
  await page.evaluate(() => document.querySelector('#mapPanel .mapCard [data-mc-go]').click());
  await page.waitForTimeout(1500);
  await openExplorer(1.3521, 103.8198);
  c = await card();
  ok('Explorer opens again on a campus stop left by Directions', /Opp Hall 4/.test(c?.label || ''), c?.label);
  await closeExplorer();

  // NTU's 27061 (on CR-W, missing from ntu.json): LTA's Sch of ADM, with CR-W on Saturday.
  await page.clock.setFixedTime(sgTime('2026-10-31T10:30'));
  await openExplorer(1.34985, 103.68387);
  await tapCentre();
  c = await card();
  ok('27061 Sch of ADM: the stop\'s card with CR-W, every 8–10', /Bus stop 27061/.test(c?.label || '') && (c?.rows || []).includes('CR-W: Every 8–10 min NTU · Till 23:00'), JSON.stringify(c));
  await page.evaluate(() => window.__map?.jumpTo({ center: [103.6835, 1.3475], zoom: 14.2 }));
  await page.evaluate(() => window.MapCard.close());
  await page.waitForTimeout(1500);
  await shot('7-explorer-ntu-lines');
  await closeExplorer();

  // In Chinese: the words come from zh-SG.json.
  await page.evaluate(() => { localStorage.setItem('sgbus_lang', 'zh-SG'); localStorage.removeItem('sgbus_lang_words'); });
  await page.clock.setFixedTime(sgTime('2026-10-30T08:30'));
  await page.reload();
  await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'));
  await timings('16009');
  rows = await campusRows();
  ok('in 中文: 校园巴士, 每 4–6 分钟一班', /校园巴士/.test(await page.$eval('#campusSvc .campusHead', (e) => e.textContent)) && /每 4–6 分钟一班/.test(rowText(rows, 'A1')), JSON.stringify(rows));
  await page.evaluate(() => localStorage.setItem('sgbus_lang', 'en'));

  // Without WebGL, Leaflet draws it: the lines, the campus dots, and a campus stop's card.
  await page.evaluate(() => localStorage.setItem('sgbus_lang', 'en'));
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/.test(type) ? null : get.call(this, type, ...a); };
  });
  await page.reload();
  await page.waitForFunction(() => window.MainScreen && document.documentElement.hasAttribute('data-view'));
  await page.clock.setFixedTime(sgTime('2026-10-30T08:30'));
  await openExplorer(1.302182011055529, 103.76926465870102);
  ok('without WebGL, Leaflet: the shuttles are drawn', await page.evaluate(() => !window.__map && document.querySelectorAll('#mapPanel .leaflet-pane canvas').length > 0));
  await tapCentre();
  c = await card();
  ok('…and Kent Vale\'s dot opens its card', /NUS shuttle stop Kent Vale/.test(c?.label || '') && c.rows.length === 4, c?.label);
  await shot('8-explorer-leaflet-kent-vale');
  await closeExplorer();

  ok('no page or console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
