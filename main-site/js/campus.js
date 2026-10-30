// Campus shuttles (help desk #13): NUS's and NTU's internal shuttle buses, routes and timetables
// only. Neither has live times the app may use (NUS's NextBus isn't open to it), so a stop says
// what the timetable does: "Every 8–10 min" while a route runs at a frequency, or the next
// departures from where it starts, and when the next bus is once it's stopped for the day.
//
// The data is Augy's, as he sent it: /data/campus/nus.json and ntu.json, each { stops, routes },
// read here as they are. /data/campus/config.json goes with them: each university's colour, each
// route's colour, NUS's term dates and NTU's credit, easy to change by hand.
//
//   stops    [{ id, name, road, loc: "lat,lng" }]. An id of five digits is an LTA bus stop, one
//            public buses use too: it's drawn and named as LTA has it (stopsIndex, script.js),
//            so it's never on the map twice. A stop without `loc`, or a route's stop missing from
//            `stops` (NTU's CR-W lists 27061), is found in LTA's stops the same way. Any other id
//            is a campus stop of its own (NUS-KV, NTU-OppS2, NTU's six-digit 382999): drawn by
//            Explorer as a dot of its own. One within MERGE_M of an LTA stop is taken as that stop.
//   routes   [{ id | name, stops: [stop ids, in order], timetable, term_vacation, timings }].
//            `timings` comes in three shapes, all read by the one walk (readTimings):
//              1. Bands: [{ start: "HHMM", end: "HHMM", min, max }], a bus every min to max
//                 minutes from start to end. Under a day (NTU: weekdays, sat, sun_ph) or a
//                 season and a day (NUS A1, A2, D1, D2: term|vacation, then weekday|sat|sun_ph).
//              2. Departures from each end: NUS K, R1, R2, { <terminal stop id>: { weekdays|sat:
//                 ["HHMM", ...] } }.
//              3. Both: NUS P, { term|vacation: { weekday: { <terminal>: ["HHMM", ...] } } }.
//                 Its terminals are Kent Vale (NUS-KV) and OTH (NUS-OTH, the Oei Tiong Ham
//                 Building on NUS's Bukit Timah campus, a stop in nus.json), the way back.
//            A key is a season (term, vacation), a day (DAY_KEYS) or a stop on the route; any
//            other is a problem, said in the console, and left out.
//
// A day is Singapore's (UTC+8), whatever the phone's clock is set to: a weekday, Saturday, or
// Sunday and public holidays together (When.isHoliday, js/when.js's list). A route with no times
// for the day doesn't run that day. NUS's term or vacation is by config.json's dates.
//
// Campus.load() fetches the three files and builds the shuttles against LTA's stops; then
// Campus.at(code), Campus.listHtml(code), Campus.lines() and Campus.dots(), for Bus timings
// (script.js), the map's cards (js/map-card.js) and Explorer (js/map.js). sw.js keeps the files.
//
// In Node (scripts/campus-test.mjs), module.exports is the same, for its pure parts: build,
// readTimings, status and describe, given the files' contents and the time.
// Plain script: exports go on window.
(function (root) {
  'use strict';

  const SG_OFFSET_MS = 8 * 3600 * 1000;
  const DAY_MS = 86400000;
  // A campus stop this close to an LTA stop is that stop, under the university's own code. NTU's
  // closest pairs (15 to 22 m apart) are across the road from each other ("Opp Hall 4" and
  // "Hall 4"), so this is kept tight.
  const MERGE_M = 10;
  const SEASONS = ['term', 'vacation'];
  const DAY_KEYS = { weekday: 'weekday', weekdays: 'weekday', mon_fri: 'weekday', sat: 'sat', saturday: 'sat', sun_ph: 'sun_ph', sun: 'sun_ph', sunday: 'sun_ph', ph: 'sun_ph' };
  // Singapore, roughly: a stop outside it is a typo.
  const SG = { lat: [1.1, 1.5], lng: [103.5, 104.2] };

  const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  const tr = (key, en, vars) => (root.I18n ? root.I18n.t(key, en, vars) : fill(en, vars));
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // "0715" as minutes into the day, 435; null if it isn't a time.
  function hhmm(s) {
    const m = /^(\d\d)(\d\d)$/.exec(String(s ?? ''));
    if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const clock = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

  // "1.2989392, 103.7741488" (a space after the comma or not) as [lat, lng], or null.
  function parseLoc(loc) {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(loc ?? ''));
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (lat < SG.lat[0] || lat > SG.lat[1] || lng < SG.lng[0] || lng > SG.lng[1]) return null;
    return [lat, lng];
  }

  function metres(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // Black or white, whichever reads better on a route's colour.
  function inkOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    const lin = (i) => {
      const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const l = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
    return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#000' : '#fff';
  }

  // ---------- reading the timings ----------

  // A route's `timings`, whatever its shape, as { <season>: { <day>: slot } }, the season 'term',
  // 'vacation' or 'all' (a route that runs the same all year), the day 'weekday', 'sat' or
  // 'sun_ph', and a slot either { bands: [{ from, to, min, max }] } (minutes into the day, sorted)
  // or { departs: { <terminal stop id>: [minutes, sorted] } }. What can't be read goes in
  // `problems` as words, and is left out.
  function readTimings(timings, routeStops, where, problems) {
    const out = {};
    const slotOf = (ctx) => {
      const season = ctx.season || 'all';
      out[season] ??= {};
      return (out[season][ctx.day] ??= {});
    };
    function leaf(list, ctx, at) {
      if (!ctx.day) return problems.push(`${at}: times with no day`);
      if (list.every((x) => typeof x === 'string')) {
        if (!ctx.terminal) return problems.push(`${at}: departure times with no stop they leave from`);
        const mins = [];
        for (const x of list) {
          const m = hhmm(x);
          if (m == null) problems.push(`${at}: "${x}" isn't a time`);
          else mins.push(m);
        }
        const slot = slotOf(ctx);
        if (slot.bands) return problems.push(`${at}: departure times and frequencies on the same day`);
        slot.departs ??= {};
        slot.departs[ctx.terminal] = [...new Set([...(slot.departs[ctx.terminal] || []), ...mins])].sort((a, b) => a - b);
        return;
      }
      if (list.every((x) => x && typeof x === 'object' && 'start' in x)) {
        const bands = [];
        for (const b of list) {
          const from = hhmm(b.start);
          const to = hhmm(b.end);
          const min = Number(b.min);
          const max = Number(b.max);
          if (from == null || to == null || to < from) problems.push(`${at}: ${b.start}-${b.end} isn't a span of time`);
          else if (!(min > 0) || !(max >= min)) problems.push(`${at}: every ${b.min}-${b.max} min isn't a frequency`);
          else bands.push({ from, to, min, max });
        }
        const slot = slotOf(ctx);
        if (slot.departs) return problems.push(`${at}: departure times and frequencies on the same day`);
        slot.bands = [...(slot.bands || []), ...bands].sort((a, b) => a.from - b.from || a.to - b.to);
        return;
      }
      problems.push(`${at}: a list that's neither times nor frequencies`);
    }
    function walk(node, ctx, at) {
      if (Array.isArray(node)) return leaf(node, ctx, at);
      if (!node || typeof node !== 'object') return problems.push(`${at}: not a list or a group`);
      for (const [k, v] of Object.entries(node)) {
        const here = `${at}.${k}`;
        if (SEASONS.includes(k)) {
          if (ctx.season) problems.push(`${here}: a season inside a season`);
          else walk(v, { ...ctx, season: k }, here);
        } else if (DAY_KEYS[k]) {
          if (ctx.day) problems.push(`${here}: a day inside a day`);
          else walk(v, { ...ctx, day: DAY_KEYS[k] }, here);
        } else if (routeStops.includes(k)) {
          if (ctx.terminal) problems.push(`${here}: a stop inside a stop`);
          else walk(v, { ...ctx, terminal: k }, here);
        } else {
          problems.push(`${here}: "${k}" isn't a season, a day or a stop on the route`);
        }
      }
    }
    walk(timings, {}, where);
    // Seasons for some days and not others can't be told apart; the year-round ones stand in.
    if (out.all && (out.term || out.vacation)) problems.push(`${where}: some times by term and some not`);
    return out;
  }

  // ---------- the stops and routes ----------

  // The shuttles from Augy's files (`raw`: { nus, ntu, config }) against LTA's stops (`lta`:
  // code -> { n, road, lat, lng }, script.js's stopsIndex; {} without it). Gives
  //   stops     Map of key -> { key, lta, uni, id, name, road, lat, lng, routes: [{ route, i }] },
  //             the key an LTA stop's code, or a campus stop's own id
  //   routes    [{ key, uni, code, colour, ids, keys, loop, timings, seasonal }]
  //   problems  what couldn't be read or placed, in words
  //   notes     what was found another way (a stop from LTA's list, one merged with LTA's)
  function build(raw, lta = {}) {
    lta = lta || {};
    const stops = new Map();
    const routes = [];
    const problems = [];
    const notes = [];
    const ltaStop = (id) => (/^\d{5}$/.test(id) && lta[id]?.lat != null && lta[id]?.lng != null ? lta[id] : null);
    // The LTA stop within MERGE_M of a point, if any: a quick box first, then the distance.
    const ltaNear = (at) => {
      const box = 0.0002;
      for (const [code, s] of Object.entries(lta)) {
        if (s?.lat == null || Math.abs(s.lat - at[0]) > box || Math.abs(s.lng - at[1]) > box) continue;
        if (metres(at, [s.lat, s.lng]) <= MERGE_M) return code;
      }
      return null;
    };

    for (const uni of ['nus', 'ntu']) {
      const data = raw?.[uni];
      if (!data) continue;
      const conf = raw.config?.[uni] || {};
      const own = new Map((data.stops || []).map((s) => [String(s.id), s]));
      const keyOf = new Map(); // a stop id in this university's file -> its key, or null

      const resolve = (id, where) => {
        if (keyOf.has(id)) return keyOf.get(id);
        const s = own.get(id);
        const l = ltaStop(id);
        let key = null;
        if (l) {
          key = id;
          if (!stops.has(key)) stops.set(key, { key, lta: true, uni, id, name: l.n || s?.name || id, road: l.road || s?.road || '', lat: l.lat, lng: l.lng, routes: [] });
          if (!s) notes.push(`${where}: stop ${id} isn't in ${uni}.json's stops; LTA's ${l.n || id}${l.road ? `, ${l.road}` : ''}`);
          else if (!s.loc) notes.push(`${uni} stop ${id} (${s.name}) placed by LTA's stops`);
        } else if (s && parseLoc(s.loc)) {
          const at = parseLoc(s.loc);
          const near = /^\d{5}$/.test(id) ? null : ltaNear(at);
          if (near) {
            key = near;
            const n = lta[near];
            if (!stops.has(key)) stops.set(key, { key, lta: true, uni, id: near, name: n.n || near, road: n.road || '', lat: n.lat, lng: n.lng, routes: [] });
            notes.push(`${uni} stop ${id} (${s.name}) is within ${MERGE_M} m of LTA's ${near}, so shown as that stop`);
          } else {
            key = id;
            if (!stops.has(key)) stops.set(key, { key, lta: false, uni, id, name: s.name || id, road: s.road || '', lat: at[0], lng: at[1], routes: [] });
          }
        } else {
          problems.push(`${where}: stop ${id}${s ? ` (${s.name})` : ''} has no position${/^\d{5}$/.test(id) ? ', and LTA has no such stop' : ''}`);
        }
        keyOf.set(id, key);
        return key;
      };

      for (const r of data.routes || []) {
        const code = String(r.id ?? r.name ?? '');
        const where = `${uni} ${code}`;
        const ids = (r.stops || []).map(String);
        if (!code || ids.length < 2) {
          problems.push(`${where}: a route needs a name and two stops or more`);
          continue;
        }
        const keys = ids.map((id) => resolve(id, where));
        const timings = readTimings(r.timings || {}, ids, where, problems);
        const kinds = new Set(Object.values(timings).flatMap((days) => Object.values(days).map((slot) => (slot.bands ? 'bands' : 'departs'))));
        if (r.timetable === true && kinds.has('bands')) notes.push(`${where}: says it's a timetable, but has frequencies`);
        if (r.timetable === false && kinds.has('departs')) notes.push(`${where}: says it isn't a timetable, but has departure times`);
        const route = {
          key: `${uni}:${code}`,
          uni,
          code,
          colour: conf.routes?.[code] || conf.colour || '#7a4fd6',
          ids,
          keys,
          loop: ids[0] === ids[ids.length - 1],
          timings,
          seasonal: !!(timings.term || timings.vacation),
        };
        routes.push(route);
        keys.forEach((key, i) => {
          const stop = key && stops.get(key);
          // Once for each route at a stop: where it first calls there.
          if (stop && !stop.routes.some((x) => x.route === route)) stop.routes.push({ route, i });
        });
      }
      // A stop no route calls at isn't drawn.
      for (const id of own.keys()) if (!keyOf.has(id)) notes.push(`${uni} stop ${id} (${own.get(id).name}) isn't on any route, so isn't shown`);
    }
    return { stops, routes, problems, notes, config: raw?.config || {} };
  }

  // ---------- what the timetable says now ----------

  // A moment as Singapore's date, day of the week and minute of the day.
  function sgDay(ms) {
    const d = new Date(ms + SG_OFFSET_MS);
    return { ymd: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }

  const dayType = (ymd, dow, isHoliday) => (dow === 0 || isHoliday?.(ymd) ? 'sun_ph' : dow === 6 ? 'sat' : 'weekday');

  // 'term' or 'vacation' on a day, by a university's config: within one of its `terms`, or
  // outside the dates its `covers` (none known yet), term; otherwise vacation.
  function season(ymd, conf) {
    const terms = conf?.terms;
    if (!Array.isArray(terms)) return 'term';
    const covers = conf.covers;
    if (Array.isArray(covers) && (ymd < covers[0] || ymd > covers[1])) return 'term';
    return terms.some(([from, to]) => ymd >= from && ymd <= to) ? 'term' : 'vacation';
  }

  // A route's times on a day: { season (null all year), day, slot (null if it doesn't run) }.
  function slotFor(route, ymd, dow, opts) {
    const day = dayType(ymd, dow, opts.isHoliday);
    if (!route.seasonal) return { season: null, day, slot: route.timings.all?.[day] || null };
    const s = season(ymd, opts.config?.[route.uni]);
    // A season the file hasn't got: the other's, rather than nothing.
    const days = route.timings[s] || route.timings[s === 'term' ? 'vacation' : 'term'] || {};
    return { season: s, day, slot: days[day] || null };
  }

  // The terminal whose departures a stop's on: the last one at or before it on the route, or
  // with none before it, the last on the route (a loop coming round to it).
  function terminalFor(route, i, slot) {
    const ends = Object.keys(slot.departs || {});
    let before = null;
    let last = null;
    route.ids.forEach((id, k) => {
      if (!ends.includes(id)) return;
      if (k <= i) before = id;
      last = id;
    });
    return before ?? last;
  }

  const firstOf = (route, i, slot) => (slot.bands ? slot.bands[0]?.from ?? null : slot.departs[terminalFor(route, i, slot)]?.[0] ?? null);

  // When the route runs next after today, within a week: { inDays, dow, at, from }, or null.
  function nextRun(route, i, ms, opts) {
    for (let d = 1; d <= 7; d++) {
      const { ymd, dow } = sgDay(ms + d * DAY_MS);
      const { slot } = slotFor(route, ymd, dow, opts);
      const at = slot && firstOf(route, i, slot);
      if (at != null) return { inDays: d, dow, at, from: slot.departs ? terminalFor(route, i, slot) : null };
    }
    return null;
  }

  // What the timetable says at the `i`th stop of `route` at the moment `ms`:
  //   { state: 'every', min, max, last }         running, a bus every min to max minutes
  //   { state: 'first', at, min, max }          not started yet today; first at `at`
  //   { state: 'gap', at, min, max }            a gap in the day's times; buses again from `at`
  //   { state: 'departs', from, here, end, times }  the next departures (up to 3) from `from`
  //   { state: 'done', next }                   no more today; `next` from nextRun
  //   { state: 'notToday', next }               doesn't run today
  // each with `season` ('term', 'vacation', or null for a route that runs the same all year).
  // `opts`: { config, isHoliday(ymd) }.
  function status(route, i, ms, opts = {}) {
    const { ymd, dow, min } = sgDay(ms);
    const today = slotFor(route, ymd, dow, opts);
    const base = { season: today.season };
    const slot = today.slot;
    if (slot?.bands?.length) {
      const bands = slot.bands;
      let now = null;
      for (const b of bands) if (b.from <= min && min <= b.to) now = b;
      if (now) return { ...base, state: 'every', min: now.min, max: now.max, last: bands[bands.length - 1].to };
      const next = bands.find((b) => b.from > min);
      if (next) return { ...base, state: min < bands[0].from ? 'first' : 'gap', at: next.from, min: next.min, max: next.max };
    } else if (slot?.departs) {
      const from = terminalFor(route, i, slot);
      const times = (slot.departs[from] || []).filter((t) => t >= min).slice(0, 3);
      if (times.length) return { ...base, state: 'departs', from, here: route.ids[i] === from, end: !route.loop && i === route.ids.length - 1, times };
    }
    return { ...base, state: slot ? 'done' : 'notToday', next: nextRun(route, i, ms, opts) };
  }

  const dayName = (dow) => [
    tr('campus.dow.sun', 'Sun'), tr('campus.dow.mon', 'Mon'), tr('campus.dow.tue', 'Tue'), tr('campus.dow.wed', 'Wed'),
    tr('campus.dow.thu', 'Thu'), tr('campus.dow.fri', 'Fri'), tr('campus.dow.sat', 'Sat'),
  ][dow];

  const everyText = (min, max) => (min === max ? tr('campus.everyN', 'Every ~{n} min', { n: min }) : tr('campus.every', 'Every {min}–{max} min', { min, max }));

  function nextText(next, nameOf) {
    if (!next) return tr('campus.noneThisWeek', 'No buses in the next week');
    const time = clock(next.at);
    const from = next.from ? nameOf(next.from) : '';
    if (next.inDays === 1) return from ? tr('campus.nextTomorrowFrom', 'Next: tomorrow {time} from {stop}', { time, stop: from }) : tr('campus.nextTomorrow', 'Next: tomorrow {time}', { time });
    const day = dayName(next.dow);
    return from ? tr('campus.nextDayFrom', 'Next: {day} {time} from {stop}', { day, time, stop: from }) : tr('campus.nextDay', 'Next: {day} {time}', { day, time });
  }

  // A status in words: { main, sub }. `nameOf(id)` names a stop by its id in the route's file.
  function describe(st, nameOf = (id) => id) {
    switch (st.state) {
      case 'every': return { main: everyText(st.min, st.max), sub: tr('campus.till', 'Till {time}', { time: clock(st.last) }) };
      case 'first': return { main: tr('campus.firstAt', 'First bus {time}', { time: clock(st.at) }), sub: everyText(st.min, st.max) };
      case 'gap': return { main: tr('campus.gap', 'No bus till {time}', { time: clock(st.at) }), sub: everyText(st.min, st.max) };
      case 'departs': {
        const times = st.times.map(clock).join(' · ');
        const sub = st.here ? tr('campus.leavesHere', 'Leaves here') : tr('campus.leavesFrom', 'Leaves {stop}', { stop: nameOf(st.from) });
        return { main: times, sub: st.end ? `${sub} · ${tr('campus.endsHere', 'ends here')}` : sub };
      }
      case 'done': return { main: tr('campus.done', 'No more buses today'), sub: nextText(st.next, nameOf) };
      default: return { main: tr('campus.notToday', 'Not running today'), sub: nextText(st.next, nameOf) };
    }
  }

  // ---------- in the page ----------

  let files = null;
  let fetching = null;
  let model = null;
  let builtFor = undefined;

  function fetchFiles() {
    fetching ??= Promise.all(['nus', 'ntu', 'config'].map((f) => fetch(`/data/campus/${f}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`campus ${f}: ${r.status}`))))))
      .then(([nus, ntu, config]) => { files = { nus, ntu, config }; })
      .catch((err) => {
        fetching = null; // asked again next time
        throw err;
      });
    return fetching;
  }

  // The shuttles, built once against LTA's stops (again if they've been fetched since).
  function modelFor(lta) {
    if (!files) return null;
    if (!model || builtFor !== lta) {
      model = build(files, lta || {});
      builtFor = lta;
      if (model.problems.length) console.warn(`Campus shuttles: ${model.problems.join('; ')}`);
    }
    return model;
  }

  async function load() {
    await fetchFiles();
    const lta = typeof root.ensureStopsIndex === 'function' ? await root.ensureStopsIndex().catch(() => null) : null;
    return modelFor(lta);
  }

  const opts = () => ({ config: model?.config, isHoliday: root.When?.isHoliday });

  // A stop with campus shuttles by its key (an LTA stop's code, or a campus stop's id), or null.
  const at = (key) => model?.stops.get(String(key)) || null;

  function nameIn(route) {
    return (id) => {
      const k = route.keys[route.ids.indexOf(id)];
      return (k && model.stops.get(k)?.name) || id;
    };
  }

  // The campus shuttles at a stop, for Bus timings and the map's cards: each route's colour and
  // what its timetable says, under a heading that says they're scheduled times, not live. ''
  // when it has none, or before load().
  function listHtml(key, ms = Date.now()) {
    const stop = at(key);
    if (!stop?.routes.length) return '';
    const o = opts();
    const seasons = new Set();
    const rows = stop.routes.map(({ route, i }) => {
      const st = status(route, i, ms, o);
      if (st.season) seasons.add(`${route.uni}:${st.season}`);
      const { main, sub } = describe(st, nameIn(route));
      const uni = model.config?.[route.uni]?.name || route.uni.toUpperCase();
      const off = st.state === 'done' || st.state === 'notToday';
      return `<div class="campusRow${off ? ' off' : ''}" style="--route:${esc(route.colour)};--route-ink:${inkOn(route.colour)}">` +
        `<span class="campusNo" title="${esc(tr('campus.routeTitle', '{uni} shuttle {route}', { uni, route: route.code }))}">${esc(route.code)}</span>` +
        `<span class="campusWhen"><strong>${esc(main)}</strong><span>${esc(`${uni} · ${sub}`)}</span></span></div>`;
    }).join('');
    const notes = [...seasons].map((s) => {
      const [uni, which] = s.split(':');
      const name = model.config?.[uni]?.name || uni.toUpperCase();
      return which === 'term' ? tr('campus.termTimes', '{uni} term timings', { uni: name }) : tr('campus.vacationTimes', '{uni} vacation timings', { uni: name });
    });
    const icon = typeof root.ico === 'function' ? root.ico('clock') : '';
    return `<div class="campusList" role="group" aria-label="${esc(tr('campus.title', 'Campus shuttles'))}">` +
      `<p class="campusHead">${icon}<span><strong>${esc(tr('campus.title', 'Campus shuttles'))}</strong> · ${esc(tr('campus.scheduled', 'scheduled times, not live'))}</span></p>` +
      rows +
      (notes.length ? `<p class="campusFoot">${esc(notes.join(' · '))}</p>` : '') +
      `</div>`;
  }

  // Each route as a line through its stops, for Explorer: [{ key, color, points }].
  function lines() {
    if (!model) return [];
    return model.routes.map((r) => ({
      key: r.key,
      color: r.colour,
      points: r.keys.filter(Boolean).map((k) => model.stops.get(k)).map((s) => [s.lat, s.lng]),
    })).filter((l) => l.points.length >= 2);
  }

  // The campus stops LTA hasn't got, for Explorer's dots: [{ key, lat, lng, color }]. Those LTA
  // has are its stop dots already.
  function dots() {
    if (!model) return [];
    return [...model.stops.values()].filter((s) => !s.lta).map((s) => ({ key: s.key, lat: s.lat, lng: s.lng, color: model.config?.[s.uni]?.colour || '#7a4fd6' }));
  }

  // The credit for data that asks for one, for the map's attribution.
  const credits = () => (model ? ['nus', 'ntu'].map((u) => model.config?.[u]?.credit).filter(Boolean) : []);

  const api = {
    MERGE_M, hhmm, clock, parseLoc, readTimings, build, season, status, describe, inkOn, sgDay,
    load, at, listHtml, lines, dots, credits, isReady: () => !!model,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Campus = api;
})(typeof window !== 'undefined' ? window : globalThis);
