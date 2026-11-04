// api/team.js and api/_lib/team-runs.js against a stand-in for Supabase's REST API (PostgREST),
// kept in memory here: the queries the server makes, the answers it gives, and what it refuses.
//
//   node scripts/team-api-test.mjs
//
// What it checks:
//   1. create: a team and its first member, with a secret kept only as a hash.
//   2. join by the code; a ninth member is refused (409); a code that's gone is 404.
//   3. add: rides and trips checked (a place outside Singapore, a trip's times, a bad line are
//      refused or cleaned), each added once however often it's sent, and the team's end moved on.
//   4. add with the wrong secret, or after leaving: 404.
//   5. GET: the team, its members (who's left marked), and every ride and trip in order.
//   6. an ended team (past expires_at) is gone to GET, and put away when a new one's made.
process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';

const tables = { team_runs: [], team_members: [], team_events: [] };
let nextEventId = 1;
const calls = [];

function matches(row, filters) {
  return filters.every(([col, op, v]) => {
    const x = row[col];
    if (op === 'eq') return String(x) === v;
    if (op === 'is') return v === 'null' ? x == null : true;
    if (op === 'gt') return Date.parse(x) > Date.parse(v);
    if (op === 'lt') return Date.parse(x) < Date.parse(v);
    throw new Error(`op ${op}`);
  });
}
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const table = u.pathname.replace('/rest/v1/', '');
  const method = opts.method || 'GET';
  calls.push(`${method} ${table}${u.search}`);
  const filters = [];
  let select = null; let order = null; let limit = Infinity; let conflict = null;
  for (const [k, v] of u.searchParams) {
    if (k === 'select') select = v.split(',');
    else if (k === 'order') order = v.split('.');
    else if (k === 'limit') limit = Number(v);
    else if (k === 'on_conflict') conflict = v.split(',');
    else { const i = v.indexOf('.'); filters.push([k, v.slice(0, i), v.slice(i + 1)]); }
  }
  const rows = tables[table];
  const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
  if (method === 'GET') {
    let out = rows.filter((r) => matches(r, filters));
    if (order) out = [...out].sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] === 'desc' ? -1 : 1));
    out = out.slice(0, limit).map((r) => (select ? Object.fromEntries(select.map((c) => [c, r[c]])) : r));
    return reply(200, out);
  }
  if (method === 'POST') {
    const body = JSON.parse(opts.body);
    for (const row of Array.isArray(body) ? body : [body]) {
      const now = new Date().toISOString();
      if (conflict && rows.some((r) => conflict.every((c) => r[c] === row[c]))) {
        if (String(opts.headers.Prefer).includes('ignore-duplicates')) continue;
        return reply(409, { code: '23505', message: 'duplicate' });
      }
      if (table === 'team_runs' && rows.some((r) => r.id === row.id)) return reply(409, { code: '23505', message: 'duplicate' });
      if (table === 'team_members' && rows.some((r) => r.team_id === row.team_id && r.member_id === row.member_id)) return reply(409, { code: '23505', message: 'duplicate' });
      if (table === 'team_events' && !conflict && rows.some((r) => r.team_id === row.team_id && r.eid === row.eid)) return reply(409, { code: '23505', message: 'duplicate' });
      rows.push({ created_at: now, updated_at: now, joined_at: now, left_at: null, ...(table === 'team_events' && { id: nextEventId++ }), ...row });
    }
    return reply(201, null);
  }
  if (method === 'PATCH') {
    const body = JSON.parse(opts.body);
    rows.filter((r) => matches(r, filters)).forEach((r) => Object.assign(r, body));
    return reply(204, null);
  }
  if (method === 'DELETE') {
    const gone = rows.filter((r) => matches(r, filters)).map((r) => r.id);
    tables[table] = rows.filter((r) => !matches(r, filters));
    // on delete cascade
    if (table === 'team_runs') for (const t of ['team_members', 'team_events']) tables[t] = tables[t].filter((r) => !gone.includes(r.team_id));
    return reply(204, null);
  }
  throw new Error(method);
};

const { default: handler } = await import('../main-site/api/team.js');
let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`); if (!cond) failures++; };
async function call(method, { query = {}, body } = {}) {
  let status = 0; let out = null;
  const res = {
    setHeader() {},
    status(s) { status = s; return this; },
    json(b) { out = b; return this; },
    end() { return this; },
  };
  await handler({ method, query, body, headers: { 'x-real-ip': '1.2.3.4' } }, res);
  return { status, body: out };
}

// 1
let r = await call('POST', { body: { action: 'create', team: '  Night   Owls ', name: 'Augy' } });
ok('1. create: 200 with a code and a member', r.status === 200 && /^[a-z0-9]{10}$/.test(r.body.id) && r.body.member?.secret, JSON.stringify(r.body));
const id = r.body.id;
const augy = r.body.member;
ok('1. the name tidied', r.body.name === 'Night Owls');
ok('1. the secret kept only as a hash', tables.team_members[0].secret_hash.length === 64 && !JSON.stringify(tables).includes(augy.secret));
r = await call('POST', { body: { action: 'create', team: '', name: 'Augy' } });
ok('1. no team name: 400', r.status === 400);

// 2
r = await call('POST', { body: { action: 'join', id, name: 'Pax' } });
ok('2. join: 200, the team’s name', r.status === 200 && r.body.name === 'Night Owls' && r.body.id === id);
const pax = r.body.member;
for (let i = 0; i < 6; i++) await call('POST', { body: { action: 'join', id, name: `M${i}` } });
r = await call('POST', { body: { action: 'join', id, name: 'Ninth' } });
ok('2. a ninth: 409 full', r.status === 409, JSON.stringify(r.body));
r = await call('POST', { body: { action: 'join', id: 'zzzzzzzzzz', name: 'Wei' } });
ok('2. a code that’s gone: 404', r.status === 404);

// 3
const now = Date.now();
const ride = { eid: `${augy.id}-r1`, kind: 'ride', data: { mode: 'train', line: 'EW', bus: '', first: [], end: 'EW33' } };
const trip = { eid: `${augy.id}-t1`, kind: 'trip', data: { start: [1.3, 103.8], end: [1.32, 103.84], via: null, startedAt: now - 3600000, endedAt: now - 60000 } };
const before = tables.team_runs[0].expires_at;
await new Promise((res) => setTimeout(res, 5));
r = await call('POST', { body: { action: 'add', id, member: augy.id, secret: augy.secret, events: [ride, trip] } });
ok('3. add: 204', r.status === 204, JSON.stringify(r.body));
r = await call('POST', { body: { action: 'add', id, member: augy.id, secret: augy.secret, events: [ride] } });
ok('3. the same again adds nothing', r.status === 204 && tables.team_events.length === 2, String(tables.team_events.length));
ok('3. the team’s end moved on', tables.team_runs[0].expires_at > before);
r = await call('POST', { body: { action: 'add', id, member: augy.id, secret: augy.secret, events: [{ ...trip, eid: `${augy.id}-t2`, data: { ...trip.data, start: [51.5, -0.1] } }] } });
ok('3. a place outside Singapore: 400', r.status === 400, r.body?.error);
r = await call('POST', { body: { action: 'add', id, member: augy.id, secret: augy.secret, events: [{ ...trip, eid: `${augy.id}-t3`, data: { ...trip.data, endedAt: now + 3600000 } }] } });
ok('3. a trip ending in the future: 400', r.status === 400, r.body?.error);
await call('POST', { body: { action: 'add', id, member: pax.id, secret: pax.secret, events: [{ eid: `${pax.id}-r1`, kind: 'ride', data: { mode: 'train', line: 'XX', bus: '96', first: ['01012', '12345'], end: 'ZZ9' } }] } });
const cleaned = tables.team_events.find((e) => e.eid === `${pax.id}-r1`)?.data;
ok('3. a ride’s unknown line, bus on a train, and other codes dropped', cleaned && cleaned.line === '' && cleaned.bus === '' && cleaned.end === '' && JSON.stringify(cleaned.first) === '["01012"]', JSON.stringify(cleaned));
r = await call('POST', { body: { action: 'add', id, member: augy.id, secret: augy.secret, events: Array.from({ length: 51 }, (_, i) => ({ ...ride, eid: `${augy.id}-x${i}` })) } });
ok('3. more than 50 at once: 400', r.status === 400);

// 4
r = await call('POST', { body: { action: 'add', id, member: augy.id, secret: 'wrong', events: [{ ...ride, eid: `${augy.id}-r9` }] } });
ok('4. the wrong secret: 404', r.status === 404);
r = await call('POST', { body: { action: 'leave', id, member: pax.id, secret: pax.secret } });
ok('4. leave: 204', r.status === 204);
r = await call('POST', { body: { action: 'add', id, member: pax.id, secret: pax.secret, events: [{ ...ride, eid: `${pax.id}-r2` }] } });
ok('4. after leaving: 404', r.status === 404);

// 5
r = await call('GET', { query: { id } });
ok('5. GET: the team', r.status === 200 && r.body.name === 'Night Owls' && r.body.expiresAt > Date.now());
ok('5. its members, Pax marked as left', r.body.members.length === 8 && r.body.members.find((m) => m.id === pax.id)?.left === true && r.body.members[0].name === 'Augy');
ok('5. no secrets in it', !JSON.stringify(r.body).includes('secret'));
ok('5. every ride and trip, in order', r.body.events.map((e) => e.eid).join(',') === [ride.eid, trip.eid, `${pax.id}-r1`].join(',') && r.body.events[1].data.start[0] === 1.3 && r.body.events[0].member === augy.id && Number.isFinite(r.body.events[0].at), JSON.stringify(r.body.events.map((e) => e.eid)));
r = await call('GET', { query: { id: 'NOT-A-CODE' } });
ok('5. a bad code: 400', r.status === 400);

// 6
tables.team_runs[0].expires_at = new Date(Date.now() - 1000).toISOString();
r = await call('GET', { query: { id } });
ok('6. an ended team: 404', r.status === 404);
await call('POST', { body: { action: 'create', team: 'Early Birds', name: 'Wei' } });
ok('6. put away when a new one’s made, its members and rides too', !tables.team_runs.some((t) => t.id === id) && !tables.team_members.some((m) => m.team_id === id) && !tables.team_events.some((e) => e.team_id === id));
ok('6. PostgREST asked for ignore-duplicates on team_id,eid', calls.some((c) => c.startsWith('POST team_events?on_conflict=team_id,eid')));

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
