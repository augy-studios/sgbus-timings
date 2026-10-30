// Campus shuttles (help desk #13, main-site/js/campus.js): Augy's NUS and NTU files read in all
// their shapes, every stop placed, and what a stop says at given moments, by Singapore's clock.
//
//   node scripts/campus-test.mjs
//
// No browser or network: js/campus.js runs in a sandbox of its own, given the files in
// main-site/data/campus/ and LTA's stops for the codes they use (below, as LTA lists them).
//   1. The files read with no problems: 12 routes, every stop placed, 27061 (CR-W) from LTA's
//      stops, NUS-OTH a stop of NUS's own, nothing merged, and each shape as it should be.
//   2. Without LTA's stops, NTU's stops with no position are said to be missing.
//   3. Frequencies: running, before the first bus, a gap between bands, after the last, a
//      Saturday night, term and vacation, a public holiday, bands that share a minute.
//   4. Departures: from each end of K, a stop after either end, the end of R1, P's way back from
//      OTH, the days K, R1, CR and CR-W don't run, after the last departure.
//   5. The words, and the problems a broken file gives.
//   6. The credits: each university's only while one of its lines is in the map's view.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'main-site');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(site, 'js/campus.js'), 'utf8'), ctx);
const C = ctx.Campus;
const file = (f) => JSON.parse(readFileSync(join(site, 'data/campus', f), 'utf8'));
const raw = { nus: file('nus.json'), ntu: file('ntu.json'), config: file('config.json') };

// LTA's stops for the codes the files use: [code, lat, lng, name, road].
const LTA = Object.fromEntries([
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
  ['27221', 1.34623, 103.67852, 'Sch of CEE', 'Nanyang Dr'],
  ['27231', 1.34208, 103.67922, 'Wee Kim Wee Sch of C&I', 'Nanyang Dr'],
  ['27241', 1.33999, 103.68089, 'SPMS', 'Nanyang Dr'],
  ['27261', 1.34378, 103.68692, 'Hall 4', 'Nanyang Dr'],
  ['27281', 1.34566, 103.68781, 'Hall 1', 'Lien Ying Chow Dr'],
  ['27291', 1.34772, 103.6865, 'Opp Hall 6', 'Lien Ying Chow Dr'],
  ['27311', 1.34902, 103.68539, 'Hall 2', 'Lien Ying Chow Dr'],
  ['41021', 1.32265, 103.81554, 'Botanic Gdns Stn', 'Bt Timah Rd'],
  ['41029', 1.32333, 103.81631, 'Opp Botanic Gdns Stn', 'Dunearn Rd'],
].map(([c, lat, lng, n, road]) => [c, { n, road, lat, lng }]));

let fails = 0;
let passes = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? ` :: ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
  if (cond) passes++;
  else fails++;
};
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}${JSON.stringify(got) === JSON.stringify(want) ? '' : `, want ${JSON.stringify(want)}`}`);

// Singapore's clock: "2026-10-30T08:30" (a Friday) as a moment.
const sg = (at) => {
  const [d, t] = at.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return Date.UTC(y, mo - 1, da, h, mi) - 8 * 3600 * 1000;
};
const HOLIDAYS = new Set(['2026-11-09', '2026-12-25', '2027-01-01']);
const opts = { config: raw.config, isHoliday: (ymd) => HOLIDAYS.has(ymd) };

// ---------- 1. Augy's files ----------
const m = C.build(raw, LTA);
eq('no problems reading the files', m.problems, []);
eq('12 routes', m.routes.map((r) => r.code), ['A1', 'A2', 'D1', 'D2', 'K', 'R1', 'R2', 'P', 'CL-B', 'CL-R', 'CR', 'CR-W']);
ok('every route stop placed', m.routes.every((r) => r.keys.every(Boolean)));
const route = (code) => m.routes.find((r) => r.code === code);
const adm = m.stops.get('27061');
ok('27061 (CR-W, not in ntu.json) from LTA: Sch of ADM', adm?.lta && adm.name === 'Sch of ADM' && adm.road === 'Nanyang Dr', adm);
ok('the note says 27061 came from LTA', m.notes.some((n) => /27061 isn't in ntu\.json/.test(n)));
ok('NTU stops with no loc placed by LTA (27219 NIE Blk 2)', m.stops.get('27219')?.lat === 1.34793);
ok('NUS-OTH is a stop of NUS own, at the Bukit Timah campus', m.stops.get('NUS-OTH')?.lta === false && m.stops.get('NUS-OTH').road === 'Bukit Timah Rd');
ok('nothing merged with an LTA stop', !m.notes.some((n) => /shown as that stop/.test(n)));
ok('a shared LTA stop is one stop, LTA-named: 16009 Kent Ridge Ter, on A1, A2', m.stops.get('16009')?.lta && m.stops.get('16009').routes.map((x) => x.route.code).join() === 'A1,A2');
ok('16181 Ctrl Lib has A1, D1, K, R1', m.stops.get('16181')?.routes.map((x) => x.route.code).join() === 'A1,D1,K,R1');
ok('a campus stop keeps its loc with a space after the comma: NUS-KV', Math.abs(m.stops.get('NUS-KV').lat - 1.302182) < 1e-5);
const campusOnly = [...m.stops.values()].filter((s) => !s.lta).length;
const ltaShared = [...m.stops.values()].filter((s) => s.lta).length;
eq('stops drawn: 33 campus-only (14 NUS, 19 NTU) and 33 LTA (19 NUS, 14 NTU)', [campusOnly, ltaShared], [33, 33]);
ok('27221 Sch of CEE and 27291 Opp Hall 6 are on no route, and said so', ['27221', '27291'].every((c) => m.notes.some((n) => new RegExp(`${c}.*isn't on any route`).test(n)) && !m.stops.has(c)));
eq('A1: term and vacation, weekday, sat and sun_ph', Object.keys(route('A1').timings).concat(Object.keys(route('A1').timings.term)), ['term', 'vacation', 'weekday', 'sat', 'sun_ph']);
eq('A1 term weekday has 11 bands', route('A1').timings.term.weekday.bands.length, 11);
eq('K: departures from both ends, weekdays and Saturday', [Object.keys(route('K').timings.all), Object.keys(route('K').timings.all.weekday.departs)], [['weekday', 'sat'], ['NUS-PGP', 'NUS-KV']]);
eq('P: term and vacation weekdays, from KV and OTH', [Object.keys(route('P').timings), Object.keys(route('P').timings.term.weekday.departs)], [['term', 'vacation'], ['NUS-KV', 'NUS-OTH']]);
eq('NTU CL-B: all year, three days', Object.keys(route('CL-B').timings.all), ['weekday', 'sat', 'sun_ph']);
eq('NTU CR weekdays only, CR-W weekends only', [Object.keys(route('CR').timings.all), Object.keys(route('CR-W').timings.all)], [['weekday'], ['sat', 'sun_ph']]);

// ---------- 2. Without LTA's stops ----------
const bare = C.build(raw, {});
ok('without LTA, NTU stops with no loc are problems', bare.problems.some((p) => /27219 \(NIE Blk 2\) has no position/.test(p)) && bare.problems.some((p) => /stop 27061 has no position, and LTA has no such stop/.test(p)));
ok('without LTA, NUS LTA-coded stops still drawn from Augy locs', bare.stops.get('16009')?.lta === false);

// ---------- 3. Frequencies ----------
const at = (code, stop, when) => {
  const r = route(code);
  return C.status(r, r.ids.indexOf(stop), sg(when), opts);
};
const pick = (st, ...keys) => Object.fromEntries(keys.map((k) => [k, st[k]]));
eq('A1, Fri 08:30 in term: every 4-6 till 23:00', pick(at('A1', '16009', '2026-10-30T08:30'), 'state', 'min', 'max', 'last', 'season'), { state: 'every', min: 4, max: 6, last: 1380, season: 'term' });
eq('A1, 06:00: first bus 07:15', pick(at('A1', '16009', '2026-10-30T06:00'), 'state', 'at'), { state: 'first', at: 435 });
eq('A1, 14:05: a gap till 14:16, then 8-10', pick(at('A1', '16009', '2026-10-30T14:05'), 'state', 'at', 'min', 'max'), { state: 'gap', at: 856, min: 8, max: 10 });
eq('A1, 14:16: every 8-10 again', pick(at('A1', '16009', '2026-10-30T14:16'), 'state', 'min'), { state: 'every', min: 8 });
eq('A1, 23:00: the last band to its end', at('A1', '16009', '2026-10-30T23:00').state, 'every');
const late = at('A1', '16009', '2026-10-30T23:30');
eq('A1, Fri 23:30: no more today, Saturday 07:15 tomorrow', [late.state, late.next.inDays, late.next.at], ['done', 1, 435]);
const satNight = at('A1', '16009', '2026-10-31T23:30');
eq('A1, Sat 23:30: Sunday 09:07', [satNight.next.inDays, satNight.next.dow, satNight.next.at], [1, 0, 547]);
eq('A1, Tue 15 Dec 08:00 (vacation): every 7-9', pick(at('A1', '16009', '2026-12-15T08:00'), 'state', 'min', 'max', 'season'), { state: 'every', min: 7, max: 9, season: 'vacation' });
eq('A1, Mon 9 Nov 10:00 (public holiday): Sunday times, every ~30', pick(at('A1', '16009', '2026-11-09T10:00'), 'state', 'min', 'max'), { state: 'every', min: 30, max: 30 });
eq('A1, Mon 9 Nov 08:00 (public holiday): first bus 09:07', pick(at('A1', '16009', '2026-11-09T08:00'), 'state', 'at'), { state: 'first', at: 547 });
eq('a day past config covers counts as term (Wed 1 Sep 2027)', at('A1', '16009', '2027-09-01T08:30').season, 'term');
eq('a day between semesters is vacation (Wed 6 Jan 2027)', at('A1', '16009', '2027-01-06T08:30').season, 'vacation');
eq('NTU CL-B, Fri 08:00, where two bands meet: the later, every 5-7', pick(at('CL-B', '378222', '2026-10-30T08:00'), 'state', 'min', 'max', 'season'), { state: 'every', min: 5, max: 7, season: null });
eq('NTU CL-B, Sun 12:00: every 11-13', pick(at('CL-B', '378222', '2026-11-01T12:00'), 'min', 'max'), { min: 11, max: 13 });

// ---------- 4. Departures ----------
const k0700 = at('K', 'NUS-PGP', '2026-10-30T07:00');
eq('K at PGP, Fri 07:00: leaves here 07:04, 07:44, 08:24', pick(k0700, 'state', 'from', 'here', 'times'), { state: 'departs', from: 'NUS-PGP', here: true, times: [424, 464, 504] });
eq('K at 16151 (before KV): PGP departures', pick(at('K', '16151', '2026-10-30T07:00'), 'from', 'here'), { from: 'NUS-PGP', here: false });
eq('K at 16161 (after KV): KV departures, 07:20 first', pick(at('K', '16161', '2026-10-30T07:00'), 'from', 'times'), { from: 'NUS-KV', times: [440, 480, 520] });
eq('K at 07:04 itself: that bus counts', at('K', 'NUS-PGP', '2026-10-30T07:04').times[0], 424);
const kSun = at('K', 'NUS-PGP', '2026-11-01T10:00');
eq('K on a Sunday: not running; Monday 07:04 from PGP', [kSun.state, kSun.next.inDays, kSun.next.dow, kSun.next.at, kSun.next.from], ['notToday', 1, 1, 424, 'NUS-PGP']);
const kLate = at('K', 'NUS-KV', '2026-10-30T23:30');
eq('K at KV after 23:20: done; Saturday 07:20', [kLate.state, kLate.next.inDays, kLate.next.at], ['done', 1, 440]);
eq('K on Saturday 19:50 at KV: one left, 20:00', at('K', 'NUS-KV', '2026-10-31T19:50').times, [1200]);
eq('R1 at PGP, its end: KV times, ends here', pick(at('R1', 'NUS-PGP', '2026-10-30T07:50'), 'from', 'end', 'times'), { from: 'NUS-KV', end: true, times: [480, 500, 520] });
const r1Sat = at('R1', 'NUS-KV', '2026-10-31T09:00');
eq('R1 on Saturday: not running; Monday', [r1Sat.state, r1Sat.next.inDays, r1Sat.next.dow], ['notToday', 2, 1]);
eq('P at 41021 (after OTH), term Fri 09:00: from OTH, 09:00 first', pick(at('P', '41021', '2026-10-30T09:00'), 'from', 'times'), { from: 'NUS-OTH', times: [540, 605, 665] });
eq('P at KV, term Fri 08:00: from KV 08:20', pick(at('P', 'NUS-KV', '2026-10-30T08:00'), 'from', 'here', 'times'), { from: 'NUS-KV', here: true, times: [500, 575, 635] });
eq('P at KV, vacation Tue 15 Dec 10:00: vacation times (11:35 next)', pick(at('P', 'NUS-KV', '2026-12-15T10:00'), 'season', 'times'), { season: 'vacation', times: [695, 755, 995] });
const crSat = at('CR', '22529', '2026-10-31T10:00');
eq('NTU CR on Saturday: not running; Monday 07:30', [crSat.state, crSat.next.inDays, crSat.next.at], ['notToday', 2, 450]);
const crwFri = at('CR-W', '22529', '2026-10-30T10:00');
eq('NTU CR-W on Friday: not running; Saturday 07:30', [crwFri.state, crwFri.next.inDays, crwFri.next.at], ['notToday', 1, 450]);
eq('NTU CR-W at 27061 on Saturday 10:30: every 8-10', pick(at('CR-W', '27061', '2026-10-31T10:30'), 'state', 'min', 'max'), { state: 'every', min: 8, max: 10 });

// ---------- 5. Words and broken files ----------
const name = (id) => m.stops.get(id)?.name || id;
eq('words: running', { ...C.describe(at('A1', '16009', '2026-10-30T09:50'), name) }, { main: 'Every 8–10 min', sub: 'Till 23:00' });
eq('words: running, one figure', C.describe(at('A1', '16009', '2026-10-30T20:00'), name).main, 'Every ~15 min');
eq('words: before the first', { ...C.describe(at('A1', '16009', '2026-10-30T06:00'), name) }, { main: 'First bus 07:15', sub: 'Every 8–10 min' });
eq('words: a gap', { ...C.describe(at('A1', '16009', '2026-10-30T14:05'), name) }, { main: 'No bus till 14:16', sub: 'Every 8–10 min' });
eq('words: departures', { ...C.describe(at('K', '16161', '2026-10-30T07:00'), name) }, { main: '07:20 · 08:00 · 08:40', sub: 'Leaves Kent Vale' });
eq('words: the end of R1', C.describe(at('R1', 'NUS-PGP', '2026-10-30T07:50'), name).sub, 'Leaves Kent Vale · ends here');
eq('words: done', { ...C.describe(late, name) }, { main: 'No more buses today', sub: 'Next: tomorrow 07:15' });
eq('words: not today, two days on, from a terminal', { ...C.describe(at('R1', 'NUS-KV', '2026-10-31T09:00'), name) }, { main: 'Not running today', sub: 'Next: Mon 07:40 from Kent Vale' });
eq('hhmm and clock', [C.hhmm('0715'), C.hhmm('2300'), C.hhmm('715'), C.hhmm('2460'), C.clock(435)], [435, 1380, null, null, '07:15']);
eq('parseLoc with and without a space', [C.parseLoc('1.3,103.8'), C.parseLoc('1.3, 103.8'), C.parseLoc('x'), C.parseLoc('51.5,0.1')], [[1.3, 103.8], [1.3, 103.8], null, null]);
eq('black on yellow, white on red', [C.inkOn('#e0a800'), C.inkOn('#d6312b')], ['#000', '#fff']);

const problems = [];
C.readTimings({ term: { weekday: [{ start: '0800', end: '0700', min: 5, max: 6 }], fri: [] }, holiday: {} }, ['A'], 'x', problems);
C.readTimings({ A: { weekdays: ['0700', '7:30'] }, weekdays: ['0800'] }, ['A'], 'y', problems);
C.readTimings({ weekdays: [{ start: '0700', end: '0800', min: 5, max: 3 }] }, ['A'], 'z', problems);
ok('a backwards band is a problem', problems.some((p) => /x\.term\.weekday: 0800-0700/.test(p)), problems);
ok('an unknown day or key is a problem', problems.some((p) => /x\.term\.fri: "fri"/.test(p)) && problems.some((p) => /x\.holiday: "holiday"/.test(p)));
ok('a time not HHMM is a problem', problems.some((p) => /y\.A\.weekdays: "7:30" isn't a time/.test(p)));
ok('times with no terminal are a problem', problems.some((p) => /y\.weekdays: departure times with no stop/.test(p)));
ok('max under min is a problem', problems.some((p) => /z\.weekdays: every 5-3/.test(p)));

// A campus stop within MERGE_M of an LTA stop is shown as that stop.
const merged = C.build({ nus: { stops: [{ id: 'NUS-X', name: 'X', loc: '1.29430,103.76990' }, { id: 'NUS-Y', name: 'Y', loc: '1.2950,103.7700' }], routes: [{ id: 'T', stops: ['NUS-X', 'NUS-Y'], timings: { weekday: [{ start: '0700', end: '0800', min: 5, max: 5 }] } }] } }, LTA);
ok(`a campus stop ${C.MERGE_M} m or less from an LTA stop is that stop`, merged.stops.has('16009') && !merged.stops.has('NUS-X') && merged.stops.has('NUS-Y'), [...merged.stops.keys()]);

// ---------- 6. The credits ----------
// Each route as Explorer draws it before the roads are in: straight from stop to stop.
const drawn = m.routes.map((r) => ({ uni: r.uni, points: r.keys.map((k) => m.stops.get(k)).map((x) => [x.lat, x.lng]) }));
const credited = (view, list = drawn) => C.creditsIn(raw.config, list, view).map((c) => c.uni);
const around = ([lat, lng], d) => [[lat - d, lng - d], [lat + d, lng + d]];
eq('credits: NUS\'s and NTU\'s, linked, from config.json', C.creditsIn(raw.config, drawn, null).map((c) => [c.uni, c.text === raw.config[c.uni].credit, /^https:\/\//.test(c.url)]), [['nus', true, true], ['ntu', true, true]]);
eq('credits: none at Orchard', credited(around([1.3040, 103.8318], 0.006)), []);
eq('credits: NUS only over Kent Ridge', credited(around([1.2966, 103.7764], 0.006)), ['nus']);
eq('credits: NTU only over NTU', credited(around([1.3483, 103.6831], 0.006)), ['ntu']);
eq('credits: both, zoomed out over Singapore', credited([[1.2, 103.6], [1.47, 104.05]]), ['nus', 'ntu']);
eq('credits: NUS, where P crosses the view with no stop in it (Holland)', credited(around([1.3128, 103.7928], 0.002)), ['nus']);
eq('credits: none just off P\'s line, padded or not', credited(around([1.3040, 103.7990], 0.002)), []);
eq('credits: none without lines', credited(null, []), []);
eq('credits: a university with no credit has none', C.creditsIn({ nus: {}, ntu: raw.config.ntu }, drawn, null).map((c) => c.uni), ['ntu']);

console.log(fails ? `${fails} failed, ${passes} passed` : `all ${passes} passed`);
process.exit(fails ? 1 : 0);
