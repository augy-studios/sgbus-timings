// Report a bug (help desk #13): Settings' form (main-site/js/bug-report.js) and the function that
// sends it to Augy on Telegram (main-site/api/bug-report.js). Telegram and Redis are stand-ins
// here: nothing is sent, and no real token is used.
//
//   node scripts/bug-report-test.cjs
//
// The function is run as Vercel would run it, on made-up requests, with fetch answered here. The
// form needs Playwright as scripts/layout-check-test.cjs does (PLAYWRIGHT=<path>, or a global
// install), and Chromium where Playwright finds it, or CHROME=<path to Chrome>; its
// /api/bug-report is the same function. API_ONLY=1 skips the form.
//
// What it checks:
//   1. Not set up (no token or chat), it says so, 503, and sends nothing.
//   2. Only POST; only from the site's own page when a browser says where it's from.
//   3. Nothing said, or too much, is refused, and nothing is sent.
//   4. A report goes to the chat as plain text, with the app, device, page and contact, and
//      what was typed as it was (<b> and all), the token only in Telegram's address.
//   5. Two a minute from one IP; with Redis, six an hour from one IP, sixty from everyone.
//   6. The field only a bot fills in: told it went, nothing sent.
//   7. Telegram failing or slow is a 502 that says to try again, with no token in the logs.
//   8. The form: Settings, Help and extras, Report a bug; it shows what it adds, sends it, and
//      says it's sent; not set up, it offers email instead with the words filled in.
const path = require('path');
const fs = require('fs');

const TOKEN = '123456:TEST-not-a-real-token';
const CHAT = '424242';
const REDIS = 'https://redis.test';
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) fails++; };

// Telegram and Redis, as fetch sees them: every call kept in `sent`, Redis counted in `counts`.
const sent = [];
const counts = new Map();
let telegram = () => ({ status: 200, body: { ok: true } });
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url === REDIS) {
    const [cmd, key] = JSON.parse(opts.body);
    if (cmd === 'INCR') counts.set(key, (counts.get(key) || 0) + 1);
    const result = cmd === 'INCR' ? counts.get(key) : 1;
    return new Response(JSON.stringify({ result }), { status: 200 });
  }
  if (url.startsWith('https://api.telegram.org/')) {
    sent.push({ url, body: JSON.parse(opts.body) });
    const r = await telegram(opts);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }
  throw new Error(`unexpected fetch ${url}`);
};

// A Vercel request and response, enough for the function.
let ipSeq = 0;
function call(handler, { method = 'POST', body, headers = {}, ip = `10.0.0.${++ipSeq}` } = {}) {
  const req = { method, body, query: {}, headers: { host: 'sgbus.test', 'x-real-ip': ip, ...headers } };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {}, payload: null,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(d) { this.payload = d; resolve(this); return this; },
      end() { resolve(this); return this; },
    };
    Promise.resolve(handler(req, res)).catch((e) => { res.statusCode = 'threw'; res.payload = String(e); resolve(res); });
  });
}

const REPORT = {
  text: 'The <b>timings</b> for 84009 show "Arr" forever & never change.\nSteps: open it, wait.',
  contact: '@someone',
  version: '2.2.7, site v127',
  platform: 'android',
  device: 'Android 14 · Chrome 130 · 412×915',
  page: 'Bus timings, stop 84009',
  lang: 'en',
};

async function api() {
  // Redis on (it's read as the module loads), for the hour's limits.
  process.env.KV_REST_API_URL = REDIS;
  process.env.KV_REST_API_TOKEN = 'redis-test-token';
  const { default: handler } = await import(path.join(__dirname, '../main-site/api/bug-report.js'));

  delete process.env.BUG_REPORT_BOT_TOKEN;
  delete process.env.BUG_REPORT_CHAT_ID;
  let r = await call(handler, { body: REPORT });
  ok('1. not set up: 503 with a message', r.statusCode === 503 && /can't be sent/.test(r.payload?.error), r.payload?.error);
  process.env.BUG_REPORT_BOT_TOKEN = TOKEN;
  r = await call(handler, { body: REPORT });
  ok('1. a token but no chat is still not set up', r.statusCode === 503);
  process.env.BUG_REPORT_CHAT_ID = CHAT;
  ok('1. nothing sent while not set up', sent.length === 0);

  r = await call(handler, { method: 'GET' });
  ok('2. GET refused', r.statusCode === 405 && r.headers.allow === 'POST');
  r = await call(handler, { body: REPORT, headers: { origin: 'https://evil.example' } });
  ok('2. another site\'s page refused', r.statusCode === 403);
  r = await call(handler, { body: REPORT, headers: { origin: 'not a url' } });
  ok('2. a nonsense Origin refused', r.statusCode === 403);

  for (const [label, body, code] of [
    ['no body', undefined, 400],
    ['no text', { ...REPORT, text: '' }, 400],
    ['only spaces', { ...REPORT, text: '   \n  ' }, 400],
    ['text not a string', { ...REPORT, text: ['a', 'b', 'c', 'd', 'e', 'f'] }, 400],
    ['over 2,000 characters', { ...REPORT, text: 'x'.repeat(2001) }, 400],
    ['over 8 KB in all', { ...REPORT, device: 'y'.repeat(9000) }, 413],
  ]) {
    r = await call(handler, { body });
    ok(`3. ${label}: ${code}`, r.statusCode === code, `${r.statusCode} ${r.payload?.error || ''}`);
  }
  ok('3. nothing sent for any of them', sent.length === 0);

  r = await call(handler, { body: REPORT, headers: { origin: 'https://sgbus.test' } });
  ok('4. a report from the site: 204', r.statusCode === 204, `${r.statusCode} ${JSON.stringify(r.payload)}`);
  const m = sent[0];
  ok('4. to Telegram\'s sendMessage with the bot\'s token', m?.url === `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  ok('4. to the chat set', m?.body.chat_id === CHAT);
  ok('4. as plain text: no parse_mode', m && !('parse_mode' in m.body));
  ok('4. no link previews', m?.body.link_preview_options?.is_disabled === true);
  const text = m?.body.text || '';
  ok('4. what was typed, as it was', text.includes(REPORT.text), JSON.stringify(text));
  ok('4. the app and its version', text.includes('App: Android app 2.2.7, site v127'));
  ok('4. the device, page, language and contact', text.includes(`Device: ${REPORT.device}`) && text.includes(`Page: ${REPORT.page}`) && text.includes('Language: en') && text.includes('Contact: @someone'));
  ok('4. no token in the message', !text.includes(TOKEN));

  sent.length = 0;
  r = await call(handler, { body: { text: 'Only the words.\u0000\u0007 Bye' } });
  ok('4. with nothing else, it says so, control characters out', r.statusCode === 204 && /App: Unknown\n/.test(sent[0]?.body.text) && /Contact: none given/.test(sent[0]?.body.text) && /Only the words\. Bye$/.test(sent[0]?.body.text), JSON.stringify(sent[0]?.body.text));
  r = await call(handler, { body: { ...REPORT, platform: '<script>' } });
  ok('4. an unknown platform is Unknown', /App: Unknown 2\.2\.7/.test(sent.at(-1)?.body.text));

  // A minute's limit, from one IP.
  sent.length = 0;
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call(handler, { body: REPORT, ip: '10.9.9.9' })).statusCode);
  ok('5. two a minute from one IP, then 429', codes.join() === '204,204,429', codes.join());
  ok('5. the third not sent', sent.length === 2);
  // An hour's, from one IP (a different instance each minute, so only Redis counts).
  const hour = Math.floor(Date.now() / 3600000);
  counts.set(`sgbus:bug:${hour}:10.8.8.8`, 6);
  r = await call(handler, { body: REPORT, ip: '10.8.8.8' });
  ok('5. a seventh in the hour from one IP: 429', r.statusCode === 429);
  counts.set(`sgbus:bug:${hour}:all`, 60);
  r = await call(handler, { body: REPORT });
  ok('5. the sixty-first in the hour from anyone: 429', r.statusCode === 429);
  counts.clear();

  sent.length = 0;
  r = await call(handler, { body: { ...REPORT, website: 'https://spam.example' } });
  ok('6. the bot\'s field filled in: 204, nothing sent', r.statusCode === 204 && sent.length === 0);

  const logs = [];
  const error = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  telegram = () => ({ status: 400, body: { ok: false, description: 'Bad Request: chat not found' } });
  r = await call(handler, { body: REPORT });
  ok('7. Telegram refusing it: 502, try again', r.statusCode === 502 && /try again/.test(r.payload?.error));
  telegram = () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); };
  r = await call(handler, { body: REPORT });
  ok('7. Telegram too slow: 502', r.statusCode === 502);
  console.error = error;
  ok('7. the reason logged, never the token', logs.some((l) => l.includes('chat not found')) && !logs.some((l) => l.includes(TOKEN)), logs.join(' | '));
  telegram = () => ({ status: 200, body: { ok: true } });
  return handler;
}

async function form(handler) {
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
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const context = await browser.newContext({ viewport: { width: 400, height: 820 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
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
  const posted = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/bug-report') {
      const body = JSON.parse(req.postData() || 'null');
      posted.push(body);
      const r = await call(handler, { method: req.method(), body, headers: { origin: (await req.headerValue('origin')) || undefined } });
      return route.fulfill({ status: r.statusCode, contentType: 'application/json', body: r.payload ? JSON.stringify(r.payload) : '' });
    }
    if (url.pathname === '/api/bus-stops') return json([{ c: '84009', n: 'Bedok Int', r: 'Bedok Nth Dr', la: 1.32427, lo: 103.95514 }]);
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
  await page.goto(`${ORIGIN}/#84009`);
  await page.waitForFunction(() => window.MainScreen && window.BugReport && !document.getElementById('resultCard').hidden);
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)); document.body.classList.remove('touring'); });

  const openForm = async () => {
    await page.click('#settingsBtn');
    await page.click('[data-settings-open="help"]');
    await page.click('#settingsBug');
    await page.waitForFunction(() => !document.getElementById('bugModal').classList.contains('hidden'));
  };
  await openForm();
  ok('8. Settings, Help and extras, Report a bug opens the form', true);
  const details = await page.textContent('#bugDetails');
  ok('8. it shows what it adds: the app, the device and the page', /^Web\b/.test(details) && /Chrome \d+/.test(details) && /Bus timings, stop 84009/.test(details), details);

  await page.click('#bugSend');
  ok('8. empty, it asks what went wrong, and sends nothing', /what went wrong/i.test(await page.textContent('#bugStatus')) && posted.length === 0);

  sent.length = 0;
  await page.fill('#bugText', 'The map is blank <i>here</i>.');
  await page.fill('#bugContact', 'me@example.com');
  await page.click('#bugSend');
  await page.waitForFunction(() => /Sent/.test(document.getElementById('bugStatus').textContent));
  const p = posted.at(-1) || {};
  ok('8. sends the words, the contact and what it showed', p.text === 'The map is blank <i>here</i>.' && p.contact === 'me@example.com' && p.platform === 'web' && p.page === 'Bus timings, stop 84009' && /Chrome/.test(p.device) && p.lang === 'en', JSON.stringify(p));
  ok('8. nothing more: no location, favourites or address', Object.keys(p).sort().join() === 'contact,device,lang,page,platform,text,version,website', Object.keys(p).join());
  ok('8. it reached Telegram (the stand-in)', sent.length === 1 && sent[0].body.text.includes('The map is blank <i>here</i>.'));
  ok('8. the form is cleared once sent', (await page.inputValue('#bugText')) === '' && (await page.inputValue('#bugContact')) === '');

  // Not set up: email instead, with the words in it.
  delete process.env.BUG_REPORT_CHAT_ID;
  await page.fill('#bugText', 'Second one, please read.');
  await page.click('#bugSend');
  await page.waitForFunction(() => /can't be sent/.test(document.getElementById('bugStatus').textContent));
  const mail = await page.getAttribute('#bugStatus a', 'href');
  ok('8. not set up, it offers email instead', /^mailto:augy@augystudios\.com\?/.test(mail || ''), mail);
  ok('8. the email has the words and what it adds', decodeURIComponent(mail || '').includes('Second one, please read.') && decodeURIComponent(mail || '').includes('Bus timings, stop 84009'));
  ok('8. the words stay in the box', (await page.inputValue('#bugText')) === 'Second one, please read.');
  process.env.BUG_REPORT_CHAT_ID = CHAT;

  ok('8. no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
}

(async () => {
  const handler = await api();
  if (!process.env.API_ONLY) await form(handler);
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
