// Team runs (main-site/js/team.js, api/team.js, api/_lib/team-runs.js, the hooks in js/rides.js
// and js/eggs.js): three phones, each its own Chrome context under Playwright, served from this
// checkout. /api/team is answered by a stand-in for Supabase kept here, checking what's sent with
// the site's own parseName and parseEvents, as api/team.js does.
//
//   node scripts/team-run-test.cjs
//
// Needs Playwright as scripts/feat-share-test.cjs does (PLAYWRIGHT=, CHROME= the same).
//
// What it checks:
//   1. Achievements has Team run; Augy starts "Night Owls" and sees its code.
//   2. Pax opens the invite (#team/<code>): Achievements, the code filled in; joins; both listed.
//   3. A ride judged real (RideCheck.done) goes to the team, as its line and the island's end.
//   4. Augy rides to two ends of the island, Pax to the other two: Ends of the island done by
//      the team, and each of them gets the feat and its 100 uwuCoins, said as the team's.
//   5. A trip handed on: Augy's 1 h 55 min, then Pax's from where Augy got to, 1 h 33 min: The
//      long way round for both. Augy's own two trips back to back aren't one.
//   6. There and back again and Down the old railway, handed on; a hand-off 45 min late, or
//      400 m off, isn't one (Team.fold).
//   7. The latest hand-off on Pax's phone, with Continue from there opening Navigate from it.
//   8. A ride with no signal waits in the outbox and goes once there is.
//   9. Wei joins after: the team's earlier feats aren't Wei's.
//  10. Eggs.tripDone sends an arrived trip with a real ride to the team.
//  11. Pax leaves: Team run as it was, and Augy's list without Pax.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

let failures = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`);
  if (!cond) failures++;
}

// Places: the four ends' stations, and somewhere to start and hand on.
const END = { EW33: [1.340429, 103.636961], TE1: [1.448646, 103.785519], NE18: [1.415018, 103.910329], CG2: [1.357338, 103.988565] };
const S = [1.3000, 103.8000];
const X = [1.3200, 103.8400];
const Y = [1.3135, 103.8000]; // 1.5 km from S
const WOODLANDS = [1.442783, 103.769356];
const CANTONMENT = [1.273115, 103.837028];

(async () => {
  const team = await import(pathToFileURL(path.join(SITE, 'api/_lib/team-runs.js')).href);
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME && { executablePath: process.env.CHROME }) });
  const errors = [];

  // ---------- the stand-in for Supabase, behind /api/team ----------
  const teams = new Map();
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const newId = () => Array.from(crypto.randomBytes(10), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  let refuseAdds = false;
  const received = [];
  function serve(method, query, body) {
    if (method === 'GET') {
      const t = teams.get(query.get('id'));
      if (!t) return [404, { error: 'gone' }];
      return [200, { id: t.id, name: t.name, createdAt: t.createdAt, expiresAt: t.createdAt + team.TEAM_TTL_MS, members: t.members.map(({ id, name, joinedAt, left }) => ({ id, name, joinedAt, left })), events: t.events }];
    }
    const add = (t, name) => {
      const member = { id: newId(), secret: crypto.randomBytes(18).toString('base64url') };
      t.members.push({ id: member.id, name, hash: sha(member.secret), joinedAt: Date.now(), left: false });
      return member;
    };
    const isMember = (t, b) => t.members.some((m) => m.id === b.member && m.hash === sha(String(b.secret)) && !m.left);
    try {
      if (body.action === 'create') {
        const t = { id: newId(), name: team.parseName(body.team), createdAt: Date.now(), members: [], events: [] };
        teams.set(t.id, t);
        return [200, { id: t.id, name: t.name, member: add(t, team.parseName(body.name)) }];
      }
      const t = teams.get(body.id);
      if (!team.isTeamId(body.id)) return [400, { error: 'bad id' }];
      if (!t) return [404, { error: 'gone' }];
      if (body.action === 'join') {
        if (t.members.filter((m) => !m.left).length >= team.MAX_MEMBERS) return [409, { error: 'full' }];
        return [200, { id: t.id, name: t.name, member: add(t, team.parseName(body.name)) }];
      }
      if (body.action === 'add') {
        if (refuseAdds) return [503, { error: 'no signal' }];
        const events = team.parseEvents(body.events);
        if (!isMember(t, body)) return [404, { error: 'gone' }];
        for (const e of events) {
          received.push(e);
          if (!t.events.some((x) => x.eid === e.eid)) t.events.push({ eid: e.eid, member: body.member, kind: e.kind, data: e.data, at: Date.now() });
        }
        return [204, null];
      }
      if (body.action === 'leave') {
        const m = t.members.find((x) => x.id === body.member && x.hash === sha(String(body.secret)));
        if (m) m.left = true;
        return [204, null];
      }
      return [400, { error: 'bad action' }];
    } catch (e) {
      if (e instanceof team.ValidationError) return [400, { error: e.message }];
      throw e;
    }
  }

  async function phone(name) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 400, height: 860 } });
    await context.addInitScript((n) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      set('sgbus_first_run', 'done');
      set('sgbus_tour', 'done');
      set('sgbus_tours', ['glance', 'timings', 'favs', 'nav', 'alerts', 'trips', 'places', 'explorer']);
      set('sgbus_name', n);
      window.confirm = () => true;
    }, name);
    await context.route(`${ORIGIN}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname === '/api/team') {
        const [status, body] = serve(req.method(), url.searchParams, req.method() === 'POST' ? req.postDataJSON() : null);
        return route.fulfill({ status, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body) });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      const file = path.join(SITE, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await context.route(/^(?!https:\/\/sgbus\.test\/)/, (route) => route.fulfill({ status: 404, body: '' }));
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('dialog', (d) => d.accept());
    return page;
  }

  const ready = async (page, hash = '') => {
    await page.goto(`${ORIGIN}/${hash}`);
    await page.waitForFunction(() => window.Team && window.Eggs && window.MainScreen && document.documentElement.hasAttribute('data-view'));
  };
  const closeAll = (page) => page.evaluate(() => document.querySelectorAll('.modal-backdrop:not(.hidden):not(.docked)').forEach((m) => window.closeModal?.(m.id)));
  const achievements = async (page) => {
    await closeAll(page);
    await page.evaluate(() => { window.openSettings('achievements'); window.Team.refresh(); });
    await page.waitForTimeout(400);
  };
  const refresh = (page) => page.evaluate(() => window.Team.refresh());
  // A train ride to `end`, judged real by RideCheck as it would be on a trip.
  const trainTo = (page, line, end) => page.evaluate(([l, e]) => {
    const now = Date.now();
    const trip = { tripId: `t${now}${Math.random()}`, legs: [{ kind: 'train', route: l, label: l, points: [[1.30, 103.80], e], minutes: 20 }], seen: [{ fixes: 6, startAt: now - 40 * 60000, endAt: now, along: [] }] };
    return window.RideCheck.done(trip, 0);
  }, [line, end]);
  const trip = (page, t) => page.evaluate((x) => window.Team.tripDone({ ...x, startedAt: Date.now() - x.ago, endedAt: Date.now() - x.endAgo }), t);
  const H = 3600000;
  const M = 60000;

  // ---------- 1. Augy starts a team ----------
  const augy = await phone('Augy');
  await ready(augy);
  await achievements(augy);
  ok('1. Achievements has Team run', await augy.isVisible('#teamOut') && await augy.isVisible('#teamCreate'));
  ok('1. your name filled in from Settings', (await augy.inputValue('#teamYou')) === 'Augy');
  await augy.fill('#teamName', 'Night Owls');
  await augy.click('#teamCreate');
  await augy.waitForSelector('#teamIn:not([hidden])', { timeout: 5000 }).catch(() => {});
  const code = await augy.evaluate(() => window.Team.mine()?.id);
  ok('1. in the team, with its code', /^[a-z0-9]{10}$/.test(code || '') && (await augy.textContent('#teamHead')).includes(code), await augy.textContent('#teamHead'));
  ok('1. the team on the server', teams.get(code)?.name === 'Night Owls');

  // ---------- 2. Pax opens the invite ----------
  const pax = await phone('Pax');
  await ready(pax, `#team/${code}`);
  await pax.waitForFunction(() => document.querySelector('#teamCode')?.value?.length === 10, null, { timeout: 5000 }).catch(() => {});
  ok('2. the invite opens Achievements with the code', (await pax.inputValue('#teamCode')) === code && await pax.isVisible('#teamCode'));
  ok('2. its address put away', !(await pax.evaluate(() => location.hash)).includes('team/'));
  await pax.click('#teamJoin');
  await pax.waitForSelector('#teamIn:not([hidden])', { timeout: 5000 }).catch(() => {});
  await pax.waitForFunction(() => /Augy/.test(document.querySelector('#teamMembers')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  ok('2. Pax is in, both listed', /Augy/.test(await pax.textContent('#teamMembers')) && /Pax \(you\)/.test(await pax.textContent('#teamMembers')), await pax.textContent('#teamMembers'));

  // ---------- 3, 4. the ends of the island ----------
  const coinsBefore = await Promise.all([augy, pax].map((p) => p.evaluate(() => window.Coins.balance())));
  ok('3. a real ride is judged real', await trainTo(augy, 'EW', END.EW33));
  await refresh(augy);
  const firstRide = received.find((e) => e.kind === 'ride');
  ok('3. it went to the team as its line and the end', firstRide?.data?.line === 'EW' && firstRide?.data?.end === 'EW33', JSON.stringify(firstRide?.data));
  await trainTo(augy, 'TE', END.TE1);
  await trainTo(pax, 'NE', END.NE18);
  await refresh(augy);
  await refresh(pax);
  ok('4. three ends in: not yet done', !(await augy.evaluate(() => window.Eggs.feats().includes('ends'))));
  await trainTo(pax, 'EW', END.CG2);
  await refresh(pax);
  await refresh(augy);
  const ends = await Promise.all([augy, pax].map((p) => p.evaluate(() => window.Eggs.feats().includes('ends'))));
  ok('4. Ends of the island done for both', ends.every(Boolean), JSON.stringify(ends));
  const coinsAfter = await Promise.all([augy, pax].map((p) => p.evaluate(() => window.Coins.balance())));
  // The coins for the rides' trips aren't these: only the feats' 100 each.
  ok('4. each gets its 100 uwuCoins', coinsAfter.every((c, i) => c - coinsBefore[i] >= 100), `${coinsBefore} -> ${coinsAfter}`);
  const said = await augy.evaluate(() => document.getElementById('eggHow').textContent);
  ok('4. said as the team’s', /Your team run, Night Owls, did it together/.test(said), said);
  await achievements(augy);
  const teamNote = await augy.evaluate(() => [...document.querySelectorAll('#achievementsList .achievementTeam')].map((e) => e.textContent));
  ok('4. Achievements says so', teamNote.some((t) => /Done with your team run, Night Owls/.test(t)), teamNote.join(' | '));
  const teamDone = await augy.evaluate(() => [...document.querySelectorAll('#teamList .achievement.done strong')].map((e) => e.textContent));
  ok('4. the team’s list has it done', teamDone.includes('Ends of the island'), teamDone.join(', '));

  // ---------- 5. the long way round, handed on ----------
  await trip(augy, { start: S, end: X, via: null, ago: 3.6 * H, endAgo: 3.55 * H - 115 * M + 3.55 * H - 3.55 * H });
  // Augy's own second trip, straight on from the first: not a hand-off.
  await trip(augy, { start: S, end: X, via: null, ago: 3.5 * H, endAgo: 1.9 * H });
  await trip(augy, { start: X, end: S, via: null, ago: 1.85 * H, endAgo: 0.1 * H });
  await refresh(augy);
  ok('5. Augy’s own trips back to back aren’t one', !(await augy.evaluate(() => window.Eggs.feats().includes('long'))));
  await trip(pax, { start: [X[0] + 0.001, X[1]], end: [1.33, 103.85], via: null, ago: 1.88 * H, endAgo: 0.3 * H });
  await refresh(pax);
  await refresh(augy);
  const long = await Promise.all([augy, pax].map((p) => p.evaluate(() => window.Eggs.feats().includes('long'))));
  ok('5. handed on to Pax: The long way round for both', long.every(Boolean), JSON.stringify(long));

  // ---------- 6. the rules, by Team.fold ----------
  const fold = (events, members = ['a', 'b']) => augy.evaluate(([ev, ms]) => {
    const f = window.Team.fold({ members: ms.map((id) => ({ id, name: id, joinedAt: 0 })), events: ev });
    return Object.keys(f.done).sort();
  }, [events, members]);
  const tripEv = (by, start, end, startedAt, endedAt, via = null, at = endedAt) => ({ eid: `${by}-${startedAt}`, member: by, kind: 'trip', data: { start, end, via, startedAt, endedAt }, at });
  const t0 = Date.now() - 6 * H;
  let got = await fold([tripEv('a', S, Y, t0, t0 + 30 * M), tripEv('b', Y, S, t0 + 35 * M, t0 + 70 * M)]);
  ok('6. there and back, handed on at somewhere well away: loop', got.includes('loop'), got.join(','));
  got = await fold([tripEv('a', S, [1.3005, 103.8005], t0, t0 + 30 * M), tripEv('b', [1.3005, 103.8005], S, t0 + 35 * M, t0 + 70 * M)]);
  ok('6. a lap of the block handed on isn’t', !got.includes('loop'), got.join(','));
  got = await fold([tripEv('a', WOODLANDS, X, t0, t0 + 60 * M), tripEv('b', X, CANTONMENT, t0 + 62 * M, t0 + 100 * M)]);
  ok('6. Woodlands to Cantonment, handed on: ktm', got.includes('ktm'), got.join(','));
  got = await fold([tripEv('a', WOODLANDS, X, t0, t0 + 60 * M), tripEv('b', X, CANTONMENT, t0 + 105 * M, t0 + 140 * M)]);
  ok('6. a hand-off 45 min late isn’t one', !got.includes('ktm'), got.join(','));
  got = await fold([tripEv('a', WOODLANDS, X, t0, t0 + 60 * M), tripEv('b', [X[0] + 0.005, X[1]], CANTONMENT, t0 + 62 * M, t0 + 100 * M)]);
  ok('6. nor one 550 m off', !got.includes('ktm'), got.join(','));
  got = await fold([tripEv('a', WOODLANDS, X, t0, t0 + 60 * M), tripEv('a', X, CANTONMENT, t0 + 62 * M, t0 + 100 * M)]);
  ok('6. nor to yourself', !got.includes('ktm'), got.join(','));
  got = await fold([tripEv('a', S, X, t0, t0 + 70 * M), tripEv('b', X, Y, t0 + 72 * M, t0 + 140 * M), tripEv('a', Y, S, t0 + 145 * M, t0 + 190 * M)]);
  ok('6. three legs, back to the first: long and loop', got.includes('long') && got.includes('loop'), got.join(','));

  // ---------- 7. the hand-off, on Pax's phone ----------
  await trip(augy, { start: S, end: Y, via: null, ago: 50 * M, endAgo: 5 * M });
  await refresh(augy);
  await achievements(pax);
  await pax.waitForSelector('#teamHandoff:not([hidden])', { timeout: 5000 }).catch(() => {});
  const handoff = await pax.textContent('#teamHandoffText').catch(() => '');
  ok('7. Pax sees Augy’s hand-off', /Augy’s trip ended 5 min ago/.test(handoff) && /within 25 min/.test(handoff), handoff);
  ok('7. Augy sees it as theirs, with no Continue', /Your trip ended/.test(await augy.evaluate(() => { window.openSettings('achievements'); return document.getElementById('teamHandoffText').textContent; })) && await augy.evaluate(() => document.getElementById('teamContinue').hidden));
  // SHOTS=<dir>: Pax's Team run, with the hand-off, for a look.
  if (process.env.SHOTS) {
    await pax.setViewportSize({ width: 354, height: 708 });
    await pax.evaluate(() => document.getElementById('teamIn').scrollIntoView({ block: 'start' }));
    await pax.waitForTimeout(300);
    await pax.screenshot({ path: path.join(process.env.SHOTS, 'team-run.png') });
  }
  await pax.click('#teamContinue');
  await pax.waitForTimeout(800);
  const from = await pax.evaluate(() => (typeof nav !== 'undefined' && nav.from) ? { label: nav.from.label, lat: nav.from.lat, lng: nav.from.lng } : null);
  ok('7. Continue from there: Navigate from where Augy got to', from?.label === 'Where Augy got to' && Math.abs(from.lat - Y[0]) < 1e-4 && Math.abs(from.lng - Y[1]) < 1e-4, JSON.stringify(from));

  // ---------- 8. no signal ----------
  refuseAdds = true;
  await trainTo(augy, 'NS', [1.35, 103.85]);
  await refresh(augy);
  ok('8. a ride with no signal waits in the outbox', (await augy.evaluate(() => JSON.parse(localStorage.getItem('sgbus_team_outbox') || '[]').length)) === 1);
  refuseAdds = false;
  await refresh(augy);
  ok('8. and goes once there is', (await augy.evaluate(() => JSON.parse(localStorage.getItem('sgbus_team_outbox') || '[]').length)) === 0 && teams.get(code).events.some((e) => e.data.line === 'NS'));

  // ---------- 9. Wei joins after ----------
  const wei = await phone('Wei');
  await ready(wei);
  await achievements(wei);
  await wei.fill('#teamCode', code);
  await wei.click('#teamJoin');
  await wei.waitForSelector('#teamIn:not([hidden])', { timeout: 5000 }).catch(() => {});
  await refresh(wei);
  const weiFeats = await wei.evaluate(() => window.Eggs.feats());
  ok('9. the team’s earlier feats aren’t Wei’s', !weiFeats.includes('ends') && !weiFeats.includes('long'), weiFeats.join(','));
  ok('9. but Wei sees the team’s progress', /2 of 9 feats done/.test(await wei.textContent('#teamSummary')) || /of 9 feats done/.test(await wei.textContent('#teamSummary')), await wei.textContent('#teamSummary'));

  // ---------- 10. Eggs.tripDone sends the trip ----------
  const before = teams.get(code).events.filter((e) => e.kind === 'trip').length;
  await wei.evaluate(() => {
    const now = Date.now();
    window.Eggs.tripDone({ startedAt: now - 20 * 60000, legs: [{ kind: 'bus', points: [[1.30, 103.80], [1.31, 103.81]] }], seen: [{ ok: true }], origin: {} });
  });
  await refresh(wei);
  const tripsNow = teams.get(code).events.filter((e) => e.kind === 'trip');
  ok('10. an arrived trip with a real ride goes to the team', tripsNow.length === before + 1 && tripsNow[tripsNow.length - 1].data.start[0] === 1.3);
  await wei.evaluate(() => window.Eggs.tripDone({ startedAt: Date.now() - 20 * 60000, legs: [{ kind: 'bus', points: [[1.30, 103.80], [1.31, 103.81]] }], seen: [{ ok: false }], origin: {} }));
  await refresh(wei);
  ok('10. one without a real ride doesn’t', teams.get(code).events.filter((e) => e.kind === 'trip').length === before + 1);

  // ---------- 11. Pax leaves ----------
  await achievements(pax);
  await pax.click('#teamLeave');
  await pax.waitForSelector('#teamOut:not([hidden])', { timeout: 5000 }).catch(() => {});
  ok('11. Pax is out: Team run as it was', await pax.isVisible('#teamOut') && !(await pax.evaluate(() => window.Team.mine())));
  ok('11. Pax keeps the feats', await pax.evaluate(() => window.Eggs.feats().includes('ends')));
  await achievements(augy);
  await augy.waitForFunction(() => !/Pax/.test(document.querySelector('#teamMembers')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  ok('11. Augy’s list without Pax', !/Pax/.test(await augy.textContent('#teamMembers')) && /Wei/.test(await augy.textContent('#teamMembers')), await augy.textContent('#teamMembers'));

  ok('no errors on the pages', !errors.length, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
