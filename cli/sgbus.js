#!/usr/bin/env node
// SG Bus Timings in the terminal: the Linux command-line edition (README.md). Everything the
// site and the Telegram bot do that needs no screen: a stop's timings, search, a bus's route,
// the route planner, Navigate, favourites, places, routines, service alerts, the weather and
// your calendar.
//
// The data is the site's own, from its public /api/* (no keys). The route planner, the stop
// search with LTA's short forms, the stations, train line names and the calendar's reading are
// the site's own code too (main-site/js/*.js, SITE_FILES below), run here unchanged in a
// sandbox standing in for a browser, so the terminal finds what the web app finds. In this
// repository they're read from main-site/js; build.mjs puts them inside the one file it ships.
//
// What you save (favourites, places, routines, settings, your calendar's link) is kept in
// $XDG_CONFIG_HOME/sgbus/config.json, and the stop and route lists in $XDG_CACHE_HOME/sgbus/
// for a day. Node.js 18 or newer, and nothing else.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

// Node 18 calls fetch experimental, once, on stderr.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (/fetch/i.test(String(warning)) ? undefined : emitWarning.call(process, warning, ...rest));

/* global SITE_SCRIPTS, BUILT_VERSION */
const VERSION = typeof BUILT_VERSION !== 'undefined' ? BUILT_VERSION : require('./package.json').version;
const SITE = (process.env.SGBUS_SITE || 'https://sgbus.uwuapps.org').replace(/\/+$/, '');
const REPO = 'augy-studios/sgbus-timings';
const BOT = '@UwUsgbus_bot';
const SITE_FILES = ['when.js', 'network.js', 'journeys.js', 'contractions.js', 'station-search.js', 'mrt-stations.js', 'calendar.js'];

const HOME = os.homedir();
const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'sgbus');
const CACHE_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(HOME, '.cache'), 'sgbus');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// The stop list, every route and the stations: refreshed after this long, kept when offline.
const LIST_TTL_MS = 12 * 3600 * 1000;
const DAY_MS = 86400000;
const SG_OFFSET_MS = 8 * 3600 * 1000;
const MAX_ROUTINES = 20;
const NEARBY = 8;

class Fail extends Error {}

// ---------- the terminal ----------

const colour = process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code) => (s) => (colour ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint('1');
const dim = paint('2');
const green = paint('32');
const yellow = paint('33');
const red = paint('31');
const blue = paint('34');
const magenta = paint('35');
const cyan = paint('36');
// Lengths as they show, without the colours.
const visible = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - visible(s).length));
const out = (...lines) => console.log(lines.join('\n'));
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] || '');

// ---------- what you've saved ----------

const EMPTY = {
  favs: [], buses: [], routes: [], navs: [],
  places: { home: null, work: null, others: [] },
  routines: [], calendar: null,
  settings: { pinStop: 'top', pinBus: 'top', restricted: false },
};

let configCache = null;
function config() {
  if (configCache) return configCache;
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Fail(`${CONFIG_FILE} isn't readable JSON: ${e.message}`);
  }
  configCache = {
    ...EMPTY, ...raw,
    places: { ...EMPTY.places, ...raw.places },
    settings: { ...EMPTY.settings, ...raw.settings },
  };
  return configCache;
}

function saveConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(configCache, null, 2)}\n`);
  fs.renameSync(tmp, CONFIG_FILE);
}

// ---------- the site ----------

async function get(where, { method = 'GET', body = null, text = false, timeout = 20000 } = {}) {
  const url = /^https?:/.test(where) ? where : SITE + where;
  let res;
  try {
    res = await fetch(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'user-agent': `sgbus-cli/${VERSION}`, ...(body && { 'content-type': 'application/json' }) },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Fail(`Couldn't reach ${new URL(url).host}. Check your connection, then try again.`);
  }
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* text, or nothing */ }
  if (!res.ok) throw new Fail(data?.error || `${new URL(url).pathname} answered ${res.status}.`);
  return text ? raw : data;
}

// A list that hardly changes, kept on disk for LIST_TTL_MS, and kept past it while offline.
async function cachedList(name, where) {
  const file = path.join(CACHE_DIR, name);
  let age = Infinity;
  try { age = Date.now() - fs.statSync(file).mtimeMs; } catch { /* not kept yet */ }
  const kept = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  if (age < LIST_TTL_MS) {
    try { return kept(); } catch { /* fetched again below */ }
  }
  try {
    const data = await get(where, { timeout: 60000 });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
  } catch (e) {
    if (age < Infinity) return kept();
    throw e;
  }
}

// The stop list as the site keeps it: code -> { n, road, lat, lng }.
let stopsIndex = null;
async function stops() {
  if (stopsIndex) return stopsIndex;
  const list = await cachedList('bus-stops.json', '/api/bus-stops');
  stopsIndex = {};
  for (const s of list) if (s.c) stopsIndex[s.c] = { n: s.n, road: s.r || '', lat: s.la, lng: s.lo };
  return stopsIndex;
}
const nameOf = (code) => stopsIndex?.[code]?.n || null;
const stopText = (code) => (nameOf(code) ? `${nameOf(code)} (${code})` : code);

// The site's own scripts, run in a sandbox with what they'd find in a browser: window, fetch
// for the site's paths, and a localStorage that keeps nothing.
let site = null;
function siteScripts() {
  if (typeof SITE_SCRIPTS !== 'undefined') return SITE_SCRIPTS;
  const dir = path.join(__dirname, '..', 'main-site', 'js');
  return Object.fromEntries(SITE_FILES.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
}

function loadSite() {
  if (site) return site;
  const ok = (data) => ({ ok: true, status: 200, json: async () => data });
  const siteFetch = async (where) => {
    const p = String(where);
    if (p === '/api/bus-routes') return ok(await cachedList('bus-routes.json', p));
    if (p === '/data/rail-stations.json') return ok(await cachedList('rail-stations.json', p));
    return ok(await get(p));
  };
  const store = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, fetch: siteFetch,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    location: { origin: SITE },
    navigator: { userAgent: `sgbus-cli/${VERSION}` },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  const scripts = siteScripts();
  for (const f of SITE_FILES) vm.runInContext(scripts[f], ctx, { filename: f });
  site = ctx;
  return site;
}

// The bus network, for routes, the planner and first and last buses, with Settings'
// Restricted areas.
async function network() {
  const s = loadSite();
  await stops();
  await s.BusNet.load(stopsIndex);
  s.BusNet.setOpenAccess(config().settings.restricted);
  return s;
}

function haversine(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ---------- favourites pinned, as the site pins them ----------

function pinned(items, favs, where, key = (x) => x) {
  const yes = items.filter((x) => favs.has(key(x)));
  const no = items.filter((x) => !favs.has(key(x)));
  return where === 'bottom' ? [...no, ...yes] : [...yes, ...no];
}

// ---------- a stop's timings ----------

// The buses a stop is narrowed to: one ("174"), several ("174,175" or "174 175"), or every
// bus starting with something ("22*"). The same as busFilter in main-site/script.js.
function busFilter(text) {
  const parts = String(text || '').toUpperCase().split(/[\s,]+/).filter(Boolean);
  if (!parts.length || !parts.every((p) => /^[0-9A-Z]{1,4}$|^[0-9A-Z]{1,3}\*$/.test(p))) return null;
  return [...new Set(parts)].join(',');
}
const busFilterHas = (filter, no) => filter.split(',').some((p) => (p.endsWith('*') ? no.startsWith(p.slice(0, -1)) : no === p));
const oneBus = (filter) => (filter && /^[0-9A-Z]{1,4}$/.test(filter) ? filter : null);

// A bus listed twice at a stop, once each way, or a loop passing twice, told apart as the
// site does (busWays in main-site/script.js): Map of entry -> { short, tone }.
function busWays(services, net) {
  const destOf = (s) => [s.next, s.next2, s.next3].find((b) => b?.dest)?.dest || null;
  const byNo = new Map();
  for (const s of services) (byNo.get(s.serviceNo) || byNo.set(s.serviceNo, []).get(s.serviceNo)).push(s);
  const headings = new Map();
  for (const group of byNo.values()) {
    if (group.length < 2) continue;
    const dests = group.map(destOf);
    if (dests.some((d) => !d) || new Set(dests).size < group.length) continue;
    const order = [...dests].sort();
    group.forEach((s, i) => headings.set(s, { to: dests[i], tone: order.indexOf(dests[i]) % 3 }));
  }
  const list = [];
  const ways = new Map();
  for (const s of services) {
    const h = headings.get(s);
    if (h) {
      ways.set(s, { short: `→ ${nameOf(h.to) || h.to}`, tone: h.tone });
      list.push(s);
      continue;
    }
    const buses = [s.next, s.next2, s.next3].filter(Boolean);
    if (!buses.some((b) => b.visit === 2)) { list.push(s); continue; }
    for (const visit of [1, 2]) {
      const these = buses.filter((b) => (b.visit === 2 ? 2 : 1) === visit);
      if (!these.length) continue;
      const entry = { ...s, next: these[0] || null, next2: these[1] || null, next3: these[2] || null };
      const loop = net?.BusNet.serviceInfo(s.serviceNo)?.loop || '';
      const home = nameOf(these[0].dest) || these[0].dest || '';
      ways.set(entry, visit === 2 ? { short: `↩ ${home}`, tone: 1 } : { short: `→ ${loop || 'Out'}`, tone: 0 });
      list.push(entry);
    }
  }
  return { list, ways };
}

const TONES = [blue, magenta, cyan];

function etaCell(bus) {
  if (!bus || bus.eta_ms == null) return dim(pad('-', 7));
  const min = Math.floor(bus.eta_ms / 60000);
  const text = pad(min < 1 ? 'Arr' : `${min} min`, 7);
  // How full: seats, standing, or little room to stand.
  const load = (bus.load || '').toUpperCase();
  return load === 'LSD' ? red(text) : load === 'SDA' ? yellow(text) : green(text);
}

function firstLastText(net, no, code) {
  const fl = net?.BusNet.firstLast(no, code);
  if (!fl) return '';
  if (fl.first === '-' && fl.last === '-') return `no ${fl.label === 'Weekday' ? 'weekday' : fl.label === 'Sat' ? 'Saturday' : 'Sunday'} service`;
  return `${fl.label}: first ${fl.first} · last ${fl.last}`;
}

const DECKS = { Single: 'single', Double: 'double', Bendy: 'bendy' };

// The stop's lines, ready to print, or its data with --json.
async function stopTimings(code, filter, opts) {
  await stops();
  const data = await get(`/api/bus-arrivals?stop=${code}`);
  let net = null;
  try { net = await network(); } catch { /* first and last buses are left out */ }
  const { list, ways } = busWays(data.services || [], net);
  const favBuses = new Set(config().buses);
  let services = list.sort((a, b) => a.serviceNo.localeCompare(b.serviceNo, undefined, { numeric: true }));
  if (filter) services = services.filter((s) => busFilterHas(filter, s.serviceNo));
  services = pinned(services, favBuses, config().settings.pinBus, (s) => s.serviceNo);
  if (opts.json) return { stop: code, name: nameOf(code), road: stopsIndex[code]?.road || '', services };

  const lines = [];
  const where = stopsIndex[code];
  lines.push(`${bold(where?.n || 'Bus stop')} ${dim(`(${code})`)}${where?.road ? `  ${dim(where.road)}` : ''}${filter ? `  ${cyan(filter.split(',').join(', '))}` : ''}`);
  const restricted = net?.BusNet.restricted(code);
  if (restricted) lines.push(yellow(`Authorised personnel only: ${restricted.through ? `at ${restricted.place}, the public can't get on or off here` : `inside ${restricted.place}, the public can't get on, off or ride through`}.`));
  const border = net?.BusNet.crossBorder(code);
  if (border) lines.push(yellow(`${border.label}. ${border.note}`));
  if (!services.length) {
    lines.push(dim(filter ? `No live arrivals for ${filter.includes(',') || filter.includes('*') ? `buses ${filter}` : `bus ${filter}`} right now.` : 'No live buses right now.'));
    if (oneBus(filter)) {
      const fl = firstLastText(net, filter, code);
      if (fl) lines.push(dim(fl));
    }
    return lines;
  }
  const width = Math.max(...services.map((s) => s.serviceNo.length)) + 2;
  for (const s of services) {
    const way = ways.get(s);
    const no = `${favBuses.has(s.serviceNo) ? yellow('*') : ' '}${bold(pad(s.serviceNo, width))}`;
    const etas = [s.next, s.next2, s.next3].map(etaCell).join(' ');
    lines.push(`${no}${etas}${way ? `  ${TONES[way.tone](way.short)}` : ''}`);
    if (opts.details) {
      const decks = [s.next, s.next2, s.next3].filter(Boolean).map((b) => DECKS[b.deck] || b.deck || '?');
      const fl = firstLastText(net, s.serviceNo, code);
      lines.push(dim(`${' '.repeat(width + 1)}${[s.operator, decks.join(', '), fl].filter(Boolean).join(' · ')}`));
    }
  }
  return lines;
}

async function showStop(code, filter, opts) {
  const once = async () => {
    const lines = await stopTimings(code, filter, opts);
    if (opts.json) return out(JSON.stringify(lines, null, 2));
    out(...lines);
  };
  if (!opts.watch) return once();
  const every = Math.max(10, Number(opts.watch) || 30) * 1000;
  for (;;) {
    let lines;
    try {
      lines = await stopTimings(code, filter, opts);
    } catch (e) {
      lines = [red(e.message)];
    }
    process.stdout.write('\x1b[2J\x1b[H');
    out(...lines, '', dim(`Updated ${clockNow()}. Every ${every / 1000}s; Ctrl+C to stop.`));
    await new Promise((resolve) => setTimeout(resolve, every));
  }
}

const clockNow = () => new Date(Date.now() + SG_OFFSET_MS).toISOString().slice(11, 16);

// ---------- finding stops ----------

// The site's stop search (matchStops in main-site/script.js): a station's stops, or stops
// by name and road with LTA's short forms. [{ code, name, road, distance? }], and a note.
let findIndex = null;
async function matchStops(q, limit = 20) {
  const s = loadSite();
  await stops();
  await s.StationSearch.load();
  q = q.trim().toLowerCase();
  const station = s.StationSearch.find(q);
  if (station) {
    const at = s.StationSearch.stopsAt(station, stopsIndex, haversine).slice(0, limit);
    if (at.length) return { stops: at.map((x) => ({ code: x.code, name: nameOf(x.code), road: stopsIndex[x.code].road, distance: x.distance })), note: `Bus stops at ${s.StationSearch.label(station)}` };
  }
  findIndex ??= Object.entries(stopsIndex).map(([code, v]) => ({ code, name: v.n, road: v.road, find: `${v.n}\n${v.road}`.toLowerCase() }));
  const isCode = /^\d+$/.test(q);
  const swaps = isCode ? null : s.Contractions.matcher(q);
  const found = [];
  const loose = [];
  const swappedOnly = [];
  for (const it of findIndex) {
    const plain = isCode ? it.code.startsWith(q) : it.find.includes(q);
    if (plain || swaps?.test(it.find)) {
      found.push(it);
      if (!plain) swappedOnly.push(it.find);
      if (found.length >= limit) break;
    } else if (loose.length < limit && swaps?.words(it.find)) {
      loose.push(it);
    }
  }
  const extra = loose.slice(0, limit - found.length);
  swappedOnly.push(...extra.map((it) => it.find));
  return { stops: [...found, ...extra], note: swappedOnly.length ? swaps.note(swappedOnly) : '' };
}

function nearestStops(lat, lng, limit = NEARBY) {
  return Object.entries(stopsIndex)
    .filter(([, s]) => s.lat != null)
    .map(([code, s]) => ({ code, name: s.n, road: s.road, distance: haversine(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function stopListLines(title, list, note = '') {
  const favs = new Set(config().favs.map((f) => f.code));
  const ordered = list.some((s) => s.distance != null) ? list : pinned(list, favs, config().settings.pinStop, (s) => s.code);
  return [
    bold(title),
    ...(note ? [dim(note)] : []),
    ...ordered.map((s) => `${favs.has(s.code) ? yellow('*') : ' '}${cyan(s.code)}  ${pad(s.name, 28)} ${dim(s.road)}${s.distance != null ? dim(`  ${Math.round(s.distance)} m`) : ''}`),
  ];
}

async function postalPlace(code) {
  const p = await get(`/api/postal-code?code=${code}`);
  if (!p) throw new Fail(`No address has the postal code ${code}.`);
  return p;
}

const LATLNG_RE = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

// A saved place by its name: Home, Work, or one of your own.
function savedPlace(text) {
  const t = text.trim().toLowerCase();
  const { places } = config();
  if (t === 'home' || t === 'work') return places[t] ? { ...places[t], label: places[t].label || t } : null;
  return places.others.find((p) => p.name.toLowerCase() === t) || null;
}

// One stop for the route planner's ends: a code, a saved place's stop (or the nearest), the
// stop nearest a postal code, or the best match for what's typed. Says which it picked.
async function resolveStop(text, field) {
  await stops();
  const t = String(text).trim();
  if (/^\d{5}$/.test(t)) {
    if (!stopsIndex[t]) throw new Fail(`There's no bus stop ${t}.`);
    return t;
  }
  const saved = savedPlace(t);
  if (saved) return saved.stop || nearestStops(saved.lat, saved.lng, 1)[0].code;
  if (/^\d{6}$/.test(t)) {
    const p = await postalPlace(t);
    const near = nearestStops(p.lat, p.lng, 1)[0];
    console.error(dim(`${field}: ${stopText(near.code)}, the nearest stop to ${p.address}`));
    return near.code;
  }
  const { stops: found } = await matchStops(t, 5);
  if (!found.length) throw new Fail(`No stop matched "${t}" for the ${field.toLowerCase()}.`);
  if (found.length > 1) console.error(dim(`${field}: ${stopText(found[0].code)}. Others: ${found.slice(1).map((s) => stopText(s.code)).join(', ')}`));
  return found[0].code;
}

// ---------- a bus's route ----------

async function showBus(no, opts) {
  const net = await network();
  const B = net.BusNet;
  no = no.toUpperCase();
  if (!B.hasService(no)) throw new Fail(`No route found for bus ${no}.`);
  const dirs = B.directions(no);
  const from = opts.from ? await resolveStop(opts.from, 'From') : null;
  let dir = opts.dir ? Number(opts.dir) : from ? B.directionAt(no, from) : dirs[0];
  if (!dirs.includes(dir)) throw new Fail(`Bus ${no} runs ${dirs.length === 1 ? 'one way' : `directions ${dirs.join(' and ')}`}.`);
  let codes = B.runStops(no, dir);
  if (from) codes = B.onwardFrom(no, from, dir).stops;
  const info = B.serviceInfo(no) || {};
  const t = B.terminals(no, dir);
  if (opts.json) return out(JSON.stringify({ bus: no, dir, operator: info.op, stops: codes.map((c) => ({ code: c, name: nameOf(c) })) }, null, 2));
  const ends = t.loop || t.origin === t.dest
    ? `Loop from ${nameOf(t.origin) || t.origin}${t.loop ? `, round ${t.loop}` : ''}`
    : `${nameOf(t.origin) || t.origin} → ${nameOf(t.dest) || t.dest}`;
  const lines = [`${bold(`Bus ${no}`)} ${dim(info.op || '')}  ${ends}${dirs.length > 1 ? dim(`  (direction ${dir} of ${dirs.length}; --dir to switch)`) : ''}`];
  const marks = B.landmarks(codes);
  if (marks.length) lines.push(dim(`Via ${marks.join(' · ')}`));
  if (from) lines.push(dim(`From ${stopText(from)} on, ${plural(codes.length - 1, 'stop')}:`));
  codes.forEach((c, i) => {
    const r = B.restricted(c);
    const b = B.crossBorder(c);
    lines.push(`${dim(String(i + 1).padStart(3))}  ${cyan(c)}  ${pad(nameOf(c) || '?', 28)} ${dim(stopsIndex[c]?.road || '')}${r ? yellow('  authorised only') : b ? yellow(`  ${b.label.toLowerCase()}`) : ''}`);
  });
  out(...lines);
}

// ---------- times ----------

// Leave at or arrive by a time, as the site has it: { mode, at: "2026-10-09T08:30" } in
// Singapore's time, or null for now. --day is today, tomorrow, a weekday or a date; without
// one, a time already gone today means tomorrow.
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function parseWhen(opts) {
  const mode = opts.arrive ? 'arrive' : opts.leave ? 'leave' : null;
  if (!mode) return null;
  const m = String(opts[mode]).trim().toLowerCase().match(/^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new Fail(`--${mode} wants a time, like 08:30 or 6:45pm.`);
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) throw new Fail(`${opts[mode]} isn't a time.`);
  const sgNow = new Date(Date.now() + SG_OFFSET_MS);
  const day = new Date(Date.UTC(sgNow.getUTCFullYear(), sgNow.getUTCMonth(), sgNow.getUTCDate()));
  const d = String(opts.day || '').toLowerCase();
  if (d === 'tomorrow') day.setUTCDate(day.getUTCDate() + 1);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) day.setTime(Date.parse(`${d}T00:00:00Z`));
  else if (WEEKDAYS.includes(d.slice(0, 3)) && d) {
    const ahead = (WEEKDAYS.indexOf(d.slice(0, 3)) - day.getUTCDay() + 7) % 7;
    day.setUTCDate(day.getUTCDate() + ahead);
  } else if (d && d !== 'today') throw new Fail('--day wants today, tomorrow, a weekday or a date like 2026-10-24.');
  const at = `${day.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  // A time gone today, with no day given: tomorrow's.
  if (!d && Date.parse(`${at}:00Z`) - SG_OFFSET_MS < Date.now() - 2 * 60000) {
    day.setUTCDate(day.getUTCDate() + 1);
    return { mode, at: `${day.toISOString().slice(0, 10)}${at.slice(10)}` };
  }
  return { mode, at };
}

// ---------- the route planner: bus only, stop to stop ----------

async function routePlan(a, b, opts) {
  const net = await network();
  const { Journeys: J, When: W } = net;
  const start = await resolveStop(a, 'Start');
  const end = await resolveStop(b, 'End');
  if (start === end) throw new Fail('A route needs two different bus stops.');
  const when = parseWhen(opts);
  const late = W.problem(when);
  if (late) throw new Fail(late);
  const timing = { mode: when?.mode || 'leave', ms: when ? W.atToMs(when.at) : Date.now() };
  const then = when ? 'at that time' : 'right now';

  if (opts.save) {
    const routes = config().routes;
    if (!routes.some((r) => r.start === start && r.end === end)) {
      routes.push({ start, startName: nameOf(start) || start, end, endName: nameOf(end) || end });
      saveConfig();
    }
    console.error(dim('Saved: sgbus routes lists it.'));
  }

  const head = `${bold(stopText(start))} → ${bold(stopText(end))}  ${dim(W.describe(when))}`;
  const rides = J.directRides(start, end, timing);
  const running = rides.filter((r) => r.running);
  const idle = rides.filter((r) => !r.running).map((r) => r.bus);
  const idleLine = idle.length ? [dim(`Not running ${then}: ${listText(idle)}.`)] : [];

  if (running.length) {
    if (opts.json) return out(JSON.stringify({ start, end, when, direct: running }, null, 2));
    const lines = [head, `${plural(running.length, 'bus', 'buses')} ${running.length === 1 ? 'runs' : 'run'} straight between these stops${when ? ' at that time' : ''}:`];
    // Leave now: each one's next buses at the start.
    let live = null;
    if (!when) live = await get(`/api/bus-arrivals?stop=${start}`).catch(() => null);
    const favs = new Set(config().buses);
    for (const r of pinned(running, favs, config().settings.pinBus, (x) => x.bus)) {
      const svc = live?.services?.find((s) => s.serviceNo === r.bus);
      const etas = svc ? [svc.next, svc.next2, svc.next3].map(etaCell).join(' ') : '';
      lines.push(`  ${bold(pad(r.bus, 5))} ~${Math.round(r.minutes)} min ride  ${etas}`);
    }
    if (when) {
      const ms = W.atToMs(when.at);
      const totals = running.map((r) => (r.minutes + W.BUS_WAIT_MIN) * 60000);
      const [fast, slow] = [Math.min(...totals), Math.max(...totals)];
      lines.push(when.mode === 'leave'
        ? `Leave at ${W.clockDay(ms)} and you'd get in around ${W.clock(ms + fast)}${fast !== slow ? ` to ${W.clock(ms + slow)}` : ''}, counting an average wait.`
        : `To arrive by ${W.clockDay(ms)}, leave around ${W.clock(ms - slow)}${fast !== slow ? ` to ${W.clock(ms - fast)}` : ''}, counting an average wait.`);
    }
    return out(...lines, ...idleLine);
  }

  const none = idle.length ? `No bus runs straight between these stops ${then}.` : 'No single bus links these two stops.';
  const journeys = J.findJourneys(start, end, undefined, timing);
  if (opts.json) return out(JSON.stringify({ start, end, when, journeys }, null, 2));
  if (!journeys.length) return out(head, `${none} No journey with up to three changes runs ${then} either. Try another time, or other stops.`, ...idleLine);
  const lines = [head];
  const fixes = J.wrongSideEnds(start, end);
  for (const [field, verb] of [['start', 'leave from'], ['end', 'stop at']]) {
    const f = fixes[field];
    if (f) lines.push(yellow(`Wrong side of the road? The quickest buses ${verb} ${stopText(f.code)}, across the road from your ${field}, ~${Math.round(f.metres)} m away.`));
  }
  lines.push(`${none.replace(/\.$/, '')}, but these get there with a short walk or a change:`);
  journeys.forEach((legs, i) => {
    const changes = legs.length - 1;
    const clock = J.journeyClock(legs, start, end);
    let time = `~${Math.round(J.journeyMinutes(legs, start, end))} min`;
    if (when && clock) {
      const span = W.span(when, clock.total);
      time = `${W.clock(span.leave)} → ${W.clock(span.arrive)}`;
    }
    lines.push(`${dim(`${i + 1}.`)} ${legs.map((l) => bold(l.bus)).join(dim(' → '))}  ${time} · ${plural(changes, 'change')}`);
    lines.push(dim(`   ${journeyDetail(legs, start, end)}`));
  });
  lines.push(...idleLine, dim(when ? 'Times are rough estimates from distance, counting an average wait for each bus.' : J.ESTIMATE_NOTE));
  const show = Number(opts.show || 0);
  if (show) lines.push('', ...(await journeySteps(net, journeys[show - 1], start, end, when)));
  else lines.push(dim('--show N for a journey step by step.'));
  out(...lines);
}

function journeyDetail(legs, start, end) {
  const parts = [];
  if (legs[0].from !== start) parts.push(`From ${nameOf(legs[0].from) || legs[0].from}`);
  const changes = legs.slice(0, -1).map((l) => nameOf(l.to) || l.to);
  if (changes.length) parts.push(`change${changes.length > 1 ? 's' : ''} at ${listText(changes)}`);
  const last = legs[legs.length - 1];
  if (last.to !== end) parts.push(`off at ${nameOf(last.to) || last.to}`);
  const text = parts.join(', ');
  return text ? text[0].toUpperCase() + text.slice(1) : 'Walk to a stop nearby';
}

// One journey leg by leg, with each bus's live timings where you set off now.
async function journeySteps(net, legs, start, end, when) {
  if (!legs) throw new Fail('There is no journey with that number.');
  const { Journeys: J, When: W } = net;
  const clock = J.journeyClock(legs, start, end);
  const leaveMs = when ? W.span(when, clock.total).leave : Date.now();
  const live = !when || W.liveLead(leaveMs) != null;
  const arrivals = live ? await Promise.all(legs.map((l) => get(`/api/bus-arrivals?stop=${l.from}`).catch(() => null))) : [];
  const lines = [];
  if (when) lines.push(`Set off around ${W.clockDay(leaveMs)}${when.mode === 'arrive' ? ` to arrive by ${W.clock(W.atToMs(when.at))}` : ''}.`);
  let here = start;
  legs.forEach((leg, k) => {
    const walk = J.walkDetails(here, leg.from);
    if (walk) lines.push(`  Walk ~${Math.round(walk.metres)} m to ${stopText(leg.from)}, ~${Math.round(walk.minutes)} min`);
    const d = J.legDetails(leg);
    lines.push(`  ${bold(`Bus ${leg.bus}`)} from ${stopText(leg.from)} to ${stopText(leg.to)}, ${plural(d.stops, 'stop')}, ~${Math.round(d.minutes)} min`);
    if (live) {
      const svc = arrivals[k]?.services?.find((s) => s.serviceNo === leg.bus);
      lines.push(svc ? `    Next: ${[svc.next, svc.next2, svc.next3].map(etaCell).join(' ')}` : dim('    No live timings for this bus right now.'));
    } else {
      lines.push(dim(`    Board around ${W.clock(leaveMs + clock.boards[k] * 60000)}, after an average wait.`));
    }
    here = leg.to;
  });
  const last = J.walkDetails(here, end);
  if (last) lines.push(`  Walk ~${Math.round(last.metres)} m to ${stopText(end)}, ~${Math.round(last.minutes)} min`);
  lines.push(`  Arrive around ${bold(W.clockDay(leaveMs + clock.total * 60000))}, counting an average wait for each bus.`);
  return lines;
}

// ---------- Navigate: anywhere to anywhere, by bus and train ----------

// A place for Navigate's ends: a saved place, a point, a stop's code, a postal code, or the
// best of /api/places for what's typed. { label, lat, lng }.
async function resolvePlace(text, field) {
  const t = String(text).trim();
  const saved = savedPlace(t);
  if (saved) return { label: saved.name || saved.label, lat: saved.lat, lng: saved.lng };
  const ll = t.match(LATLNG_RE);
  if (ll) return { label: `${ll[1]},${ll[2]}`, lat: Number(ll[1]), lng: Number(ll[2]) };
  if (/^\d{5}$/.test(t)) {
    await stops();
    const s = stopsIndex[t];
    if (!s) throw new Fail(`There's no bus stop ${t}.`);
    return { label: s.n, lat: s.lat, lng: s.lng, stop: t };
  }
  if (/^\d{6}$/.test(t)) {
    const p = await postalPlace(t);
    return { label: p.address, lat: p.lat, lng: p.lng };
  }
  const found = await get(`/api/places?q=${encodeURIComponent(t)}`);
  if (!found?.length) throw new Fail(`Nothing matched "${t}" for ${field.toLowerCase()}. Try an address, a building, a postal code, a station or a stop.`);
  if (found.length > 1) console.error(dim(`${field}: ${found[0].label}${found[0].sub ? `, ${found[0].sub}` : ''}`));
  return { label: found[0].label, lat: found[0].lat, lng: found[0].lng, ...(found[0].kind === 'stop' && { stop: found[0].code }) };
}

const coord = (p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

async function navPlan(fromText, toText, opts) {
  const [from, to] = await Promise.all([resolvePlace(fromText, 'From'), resolvePlace(toText, 'To')]);
  const when = parseWhen(opts);
  const W = loadSite().When;
  const late = W.problem(when);
  if (late) throw new Fail(late);
  if (opts.save) {
    const navs = config().navs;
    const same = (a, b) => coord(a) === coord(b);
    if (!navs.some((n) => same(n.from, from) && same(n.to, to))) {
      navs.push({ from: { label: from.label, lat: from.lat, lng: from.lng }, to: { label: to.label, lat: to.lat, lng: to.lng } });
      saveConfig();
    }
    console.error(dim('Saved: sgbus navs lists it.'));
  }
  const at = when ? `&when=${when.mode}&at=${encodeURIComponent(when.at)}` : '';
  const open = config().settings.restricted ? '&restricted=1' : '';
  const data = await get(`/api/nav?from=${coord(from)}&to=${coord(to)}${at}${open}`, { timeout: 60000 });
  if (opts.json) return out(JSON.stringify({ from, to, ...data }, null, 2));
  const options = data.options || [];
  const lines = [`${bold(from.label)} → ${bold(to.label)}  ${dim(W.describe(when))}`];
  if (!options.length) return out(...lines, 'No way by bus or train found between those two. Try a time when buses are running, or somewhere nearer a stop.');
  if (data.alerts?.lines?.length) lines.push(red(`Train trouble now on ${data.alerts.lines.join(', ')}: see sgbus alerts.`));
  lines.push(`${plural(options.length, 'way')} to get there, quickest first:`);
  const whenMs = data.when?.ms ?? Date.now();
  options.forEach((o, i) => {
    const rides = o.legs.filter((l) => l.mode !== 'walk');
    const walked = o.legs.filter((l) => l.mode === 'walk').reduce((sum, l) => sum + (l.metres || 0), 0);
    const chips = o.walkOnly ? 'Walk' : rides.map((l) => (l.mode === 'train' ? lineChip(l) : bold(l.route))).join(dim(' → '));
    const time = when
      ? (() => { const leave = when.mode === 'arrive' ? whenMs - o.minutes * 60000 : whenMs; return `${W.clock(leave)} → ${W.clock(leave + o.minutes * 60000)}`; })()
      : `~${o.minutes} min`;
    const changes = Math.max(0, rides.length - 1);
    lines.push(`${dim(`${i + 1}.`)} ${chips}  ${time} · ${o.walkOnly ? `${Math.round(walked)} m` : `${changes ? plural(changes, 'change') : 'No change'} · ${Math.round(walked)} m walk`}${o.disrupted ? red('  disrupted') : ''}${o.onemapMinutes ? dim(`  OneMap ~${o.onemapMinutes} min`) : ''}`);
  });
  const pick = Math.min(options.length, Math.max(1, Number(opts.way) || 1));
  lines.push('', bold(`Way ${pick}:`), ...(await waySteps(options[pick - 1], when, to.label)));
  if (options.length > 1) lines.push(dim('--way N for another one step by step.'));
  out(...lines);
}

const LINE_COLOURS = { EW: green, CG: green, NS: red, NE: magenta, CC: yellow, DT: blue, TE: paint('33;2') };
const lineChip = (l) => (LINE_COLOURS[l.route] || cyan)(bold(l.route));

// OneMap's ways name things in capitals: "PASIR RIS MRT STATION".
const tidyName = (name) => (/[a-z]/.test(name || '') ? name || '' : String(name || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Mrt|Lrt)\b/g, (w) => w.toUpperCase()));

// A stop by the stop list's name where its code is known, a station with its code.
function placeLabel(p) {
  if (!p) return '';
  if (p.code && stopsIndex?.[p.code]) return stopText(p.code);
  const name = tidyName(p.name);
  return p.code && p.kind !== 'place' ? `${name} (${p.code})` : name;
}

async function waySteps(o, when, endLabel) {
  await stops().catch(() => {});
  const lines = [];
  // Leave now: the live timings of each bus where it's boarded.
  const buses = o.legs.filter((l) => l.mode === 'bus' && l.from?.code);
  const live = when ? [] : await Promise.all(buses.map((l) => get(`/api/bus-arrivals?stop=${l.from.code}`).catch(() => null)));
  o.legs.forEach((l, i) => {
    if (l.mode === 'walk') {
      if (l.metres < 20) return;
      // A walk's end is a place: the end of the way, or where the next ride starts.
      const next = o.legs[i + 1];
      const to = l.to?.kind !== 'place' ? placeLabel(l.to) : next ? placeLabel(next.from) : endLabel;
      lines.push(`  Walk ${Math.round(l.metres)} m to ${to}, ~${Math.round(l.minutes)} min`);
    } else if (l.mode === 'train') {
      lines.push(`  ${lineChip(l)} ${l.name || ''}${l.towards ? ` towards ${l.towards}` : ''}: ${placeLabel(l.from)} to ${placeLabel(l.to)}, ${plural(l.stops, 'stop')}, ~${Math.round(l.minutes)} min${l.disrupted ? red('  disrupted') : ''}`);
    } else {
      lines.push(`  ${bold(`Bus ${l.route}`)}${l.towards ? dim(` towards ${l.towards}`) : ''}: ${placeLabel(l.from)} to ${placeLabel(l.to)}, ${plural(l.stops, 'stop')}, ~${Math.round(l.minutes)} min`);
      const k = buses.indexOf(l);
      const svc = live[k]?.services?.find((s) => s.serviceNo === l.route);
      if (!when) lines.push(svc ? `    Next: ${[svc.next, svc.next2, svc.next3].map(etaCell).join(' ')}` : dim('    No live timings for this bus right now.'));
    }
  });
  return lines;
}

// ---------- favourites ----------

async function favCommand(args, opts) {
  const [what, ...rest] = args;
  const c = config();
  if (!what || what === 'list') return favList();
  if (what === 'bus' || what === 'buses') {
    const [op, ...nos] = rest;
    if (!['add', 'rm'].includes(op) || !nos.length) throw new Fail('sgbus fav bus add|rm <bus> [...]');
    for (const raw of nos.join(' ').split(/[\s,]+/).filter(Boolean)) {
      const no = raw.toUpperCase();
      if (op === 'add' && !c.buses.includes(no)) c.buses.push(no);
      if (op === 'rm') c.buses = c.buses.filter((b) => b !== no);
    }
    saveConfig();
    return out(`Favourite buses: ${c.buses.join(', ') || 'none'}`);
  }
  if (what === 'add' || what === 'rm') {
    if (!rest.length) throw new Fail(`sgbus fav ${what} <stop> [...]`);
    for (const t of rest) {
      const code = await resolveStop(t, 'Stop');
      if (what === 'add' && !c.favs.some((f) => f.code === code)) c.favs.push({ code, name: nameOf(code) || code });
      if (what === 'rm') c.favs = c.favs.filter((f) => f.code !== code);
      out(`${what === 'add' ? 'Saved' : 'Removed'} ${stopText(code)}`);
    }
    return saveConfig();
  }
  throw new Fail(`Unknown: sgbus fav ${what}. See sgbus help.`);
}

function favList() {
  const c = config();
  out(
    bold('Favourite stops'), ...(c.favs.length ? c.favs.map((f) => `  ${cyan(f.code)}  ${f.name}`) : [dim('  none: sgbus fav add <stop>')]),
    bold('Favourite buses'), `  ${c.buses.join(', ') || dim('none: sgbus fav bus add <bus>')}`,
    bold('Routes'), ...(c.routes.length ? c.routes.map((r, i) => `  ${i + 1}. ${r.startName} (${r.start}) → ${r.endName} (${r.end})`) : [dim('  none: sgbus route <start> <end> --save')]),
    bold('Navs'), ...(c.navs.length ? c.navs.map((n, i) => `  ${i + 1}. ${n.from.label} → ${n.to.label}`) : [dim('  none: sgbus nav <from> <to> --save')]),
  );
}

// Every favourite stop's timings, as the bot's /favs does.
async function favsTimings(opts) {
  const favs = config().favs;
  if (!favs.length) throw new Fail('No favourite stops yet: sgbus fav add <stop>.');
  const once = async () => {
    const blocks = await Promise.all(favs.map((f) => stopTimings(f.code, null, opts).catch((e) => [red(`${f.name} (${f.code}): ${e.message}`)])));
    return opts.json ? [JSON.stringify(blocks, null, 2)] : blocks.flatMap((b, i) => (i ? ['', ...b] : b));
  };
  if (!opts.watch) return out(...(await once()));
  const every = Math.max(10, Number(opts.watch) || 30) * 1000;
  for (;;) {
    const lines = await once().catch((e) => [red(e.message)]);
    process.stdout.write('\x1b[2J\x1b[H');
    out(...lines, '', dim(`Updated ${clockNow()}. Every ${every / 1000}s; Ctrl+C to stop.`));
    await new Promise((resolve) => setTimeout(resolve, every));
  }
}

// `sgbus routes` / `sgbus navs`: the saved ones, one run by its number, or removed.
async function savedCommand(kind, args, opts) {
  const c = config();
  const list = c[kind];
  const [first, second] = args;
  if (!first) {
    if (!list.length) return out(dim(kind === 'routes' ? 'No saved routes: sgbus route <start> <end> --save' : 'No saved navs: sgbus nav <from> <to> --save'));
    return out(...list.map((x, i) => (kind === 'routes' ? `${i + 1}. ${x.startName} (${x.start}) → ${x.endName} (${x.end})` : `${i + 1}. ${x.from.label} → ${x.to.label}`)));
  }
  if (first === 'rm') {
    const i = Number(second) - 1;
    if (!list[i]) throw new Fail(`There's no ${kind.slice(0, -1)} ${second}.`);
    list.splice(i, 1);
    saveConfig();
    return out('Removed.');
  }
  const x = list[Number(first) - 1];
  if (!x) throw new Fail(`There's no ${kind.slice(0, -1)} ${first}.`);
  if (kind === 'routes') return routePlan(x.start, x.end, opts);
  return navPlan(`${x.from.lat},${x.from.lng}`, `${x.to.lat},${x.to.lng}`, opts);
}

// ---------- places ----------

async function placeCommand(args) {
  const c = config();
  const [op, name, ...rest] = args;
  if (!op || op === 'list') {
    const row = (label, p) => `  ${pad(bold(label), 12)} ${p ? `${p.label}${p.stop ? dim(` (${p.stop})`) : ''}` : dim('not set')}`;
    return out(bold('Places'), row('Home', c.places.home), row('Work', c.places.work), ...c.places.others.map((p) => row(p.name, p)), dim('Use one by its name in nav and route: sgbus nav home work'));
  }
  if (op === 'set') {
    if (!name || !rest.length) throw new Fail('sgbus place set <home|work|name> <address, postal code, stop, station or lat,lng>');
    const where = await resolvePlace(rest.join(' '), 'Place');
    const p = { label: where.label, lat: where.lat, lng: where.lng, ...(where.stop && { stop: where.stop }) };
    const key = name.toLowerCase();
    if (key === 'home' || key === 'work') c.places[key] = p;
    else {
      c.places.others = c.places.others.filter((o) => o.name.toLowerCase() !== key);
      c.places.others.push({ name, ...p });
    }
    saveConfig();
    return out(`${name}: ${p.label}`);
  }
  if (op === 'rm') {
    const key = String(name || '').toLowerCase();
    if (key === 'home' || key === 'work') c.places[key] = null;
    else c.places.others = c.places.others.filter((o) => o.name.toLowerCase() !== key);
    saveConfig();
    return out('Removed.');
  }
  throw new Fail(`Unknown: sgbus place ${op}. See sgbus help.`);
}

// ---------- routines ----------

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function parseDays(text) {
  const t = String(text || 'weekdays').toLowerCase();
  if (t === 'weekdays') return [1, 2, 3, 4, 5];
  if (t === 'weekends') return [6, 7];
  if (t === 'daily' || t === 'every' || t === 'everyday') return [1, 2, 3, 4, 5, 6, 7];
  const days = t.split(/[\s,]+/).filter(Boolean).map((d) => DAY_NAMES.findIndex((n) => n && n.toLowerCase() === d.slice(0, 3)));
  if (!days.length || days.some((d) => d < 1)) throw new Fail('--days wants weekdays, weekends, daily, or days like mon,wed,fri.');
  return [...new Set(days)].sort((a, b) => a - b);
}
function daysText(days) {
  const set = [...days].sort((a, b) => a - b).join(',');
  if (set === '1,2,3,4,5,6,7') return 'every day';
  if (set === '1,2,3,4,5') return 'weekdays';
  if (set === '6,7') return 'weekends';
  return days.map((d) => DAY_NAMES[d]).join(', ');
}
function parseHHMM(text) {
  const m = String(text || '').match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Fail('A routine wants a time like 07:45.');
  return `${m[1].padStart(2, '0')}${m[2]}`;
}
const busesOf = (text) => [...new Set(String(text || '').toUpperCase().split(/[\s,]+/).filter((b) => /^[0-9A-Z]{1,5}$/.test(b)))];

async function routineCommand(args, opts) {
  const c = config();
  const [op, ...rest] = args;
  const show = () => out(...(c.routines.length
    ? c.routines.map((r, i) => `${dim(`${i + 1}.`)} ${bold(`${r.time.slice(0, 2)}:${r.time.slice(2)}`)} ${daysText(r.days)} · ${r.name} ${dim(r.code)}${r.buses.length ? ` · ${r.buses.join(', ')}` : ''}`)
    : [dim('No routines yet: sgbus routine add <stop> <HH:MM> [--days weekdays] [--buses 14,60]')]));
  if (!op || op === 'list') return show();
  if (op === 'add') {
    const [stop, time] = rest;
    if (!stop || !time) throw new Fail('sgbus routine add <stop> <HH:MM> [--days weekdays] [--buses 14,60]');
    if (c.routines.length >= MAX_ROUTINES) throw new Fail(`Up to ${MAX_ROUTINES} routines.`);
    const code = await resolveStop(stop, 'Stop');
    c.routines.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, code, name: nameOf(code) || code, buses: busesOf(opts.buses), time: parseHHMM(time), days: parseDays(opts.days) });
    saveConfig();
    show();
    return timerHint();
  }
  if (op === 'edit') {
    const r = c.routines[Number(rest[0]) - 1];
    if (!r) throw new Fail(`There's no routine ${rest[0] ?? ''}. sgbus routines lists them.`);
    if (opts.stop) { r.code = await resolveStop(opts.stop, 'Stop'); r.name = nameOf(r.code) || r.code; }
    if (opts.time) r.time = parseHHMM(opts.time);
    if (opts.days) r.days = parseDays(opts.days);
    if (opts.buses != null) r.buses = busesOf(opts.buses === true ? '' : opts.buses);
    saveConfig();
    return show();
  }
  if (op === 'rm') {
    const i = Number(rest[0]) - 1;
    if (!c.routines[i]) throw new Fail(`There's no routine ${rest[0] ?? ''}.`);
    c.routines.splice(i, 1);
    saveConfig();
    return show();
  }
  if (op === 'run') return routinesRun(opts);
  throw new Fail(`Unknown: sgbus routine ${op}. See sgbus help.`);
}

function timerHint() {
  const on = spawnSync('systemctl', ['--user', 'is-enabled', 'sgbus-routines.timer'], { encoding: 'utf8' });
  if (on.stdout?.trim() === 'enabled') return;
  console.error(dim('For routines to arrive as notifications, turn on their timer once:\n  systemctl --user enable --now sgbus-routines.timer\nor run `sgbus routine run --notify` from cron every minute.'));
}

// The routines due now, each once a day: from its time to five minutes after, so a minute the
// timer missed still sends it. What was sent is kept beside the stop list.
async function routinesRun(opts) {
  const c = config();
  const firedFile = path.join(CACHE_DIR, 'routines-sent.json');
  let fired = {};
  try { fired = JSON.parse(fs.readFileSync(firedFile, 'utf8')); } catch { /* none yet */ }
  const sg = new Date(Date.now() + SG_OFFSET_MS);
  const today = sg.toISOString().slice(0, 10);
  const minute = sg.getUTCHours() * 60 + sg.getUTCMinutes();
  const dow = ((sg.getUTCDay() + 6) % 7) + 1;
  const due = c.routines.filter((r) => {
    const at = Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(2));
    return r.days.includes(dow) && minute >= at && minute - at <= 5 && fired[r.id] !== today;
  });
  for (const r of due) {
    const filter = r.buses.length ? r.buses.join(',') : null;
    let body;
    try {
      const lines = await stopTimings(r.code, filter, { details: false });
      body = lines.slice(1).map(visible).join('\n');
    } catch (e) {
      body = `Couldn't get the timings just now: ${e.message}`;
    }
    const title = `${r.name} (${r.code})`;
    out(bold(title), body);
    if (opts.notify) {
      const sent = spawnSync('notify-send', ['--app-name=SG Bus Timings', title, body]);
      if (sent.error) console.error(dim('notify-send isn\'t installed (libnotify-bin), so it\'s only printed here.'));
    }
    fired[r.id] = today;
  }
  if (due.length) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(firedFile, JSON.stringify(fired));
  }
}

// ---------- service alerts ----------

async function alerts(opts) {
  const data = await get('/api/service-alerts');
  if (opts.json) return out(JSON.stringify(data, null, 2));
  const s = loadSite();
  const split = (v) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : []);
  const station = (code) => s.MRT.stationName(code) || code;
  const lines = [bold('Trains')];
  const train = data.train;
  if (!train) lines.push(dim("Couldn't reach LTA for train alerts."));
  else {
    const status = Number(train.Status) || 1;
    const segments = Array.isArray(train.AffectedSegments) ? train.AffectedSegments : [];
    if (status <= 1 && !segments.length) lines.push(green('All train services are running normally.'));
    for (const seg of segments) {
      const disrupted = (Number(seg.Status ?? status) || status) > 1;
      const dir = seg.Direction ? (/both/i.test(seg.Direction) ? ', both directions' : `, towards ${seg.Direction}`) : '';
      lines.push((disrupted ? red : yellow)(`${s.MRT.lineLabel(seg.Line || '?')} ${disrupted ? 'disrupted' : 'minor delay'}${dir}`));
      const at = split(seg.Stations).map(station);
      if (at.length) lines.push(`  Affects ${at.join(', ')}`);
      const bus = split(seg.FreePublicBus).map(station);
      if (bus.length) lines.push(`  Free buses at ${bus.join(', ')}`);
      const shuttle = split(seg.FreeMRTShuttle).map(station);
      if (shuttle.length) lines.push(`  Free shuttle at ${shuttle.join(', ')}${seg.MRTShuttleDirection ? ` (${seg.MRTShuttleDirection})` : ''}`);
    }
    for (const m of train.Message || []) if (m.Content?.trim()) lines.push(dim(`  ${m.Content.trim()}`));
  }
  lines.push('', bold('Traffic'));
  const traffic = data.traffic;
  if (!traffic) lines.push(dim("Couldn't reach LTA for traffic alerts."));
  else if (!traffic.length) lines.push(green('No traffic incidents reported.'));
  else {
    const shown = opts.all ? traffic : traffic.slice(0, 15);
    for (const i of shown) lines.push(`  ${yellow(i.type)}  ${i.message}`);
    if (shown.length < traffic.length) lines.push(dim(`  and ${traffic.length - shown.length} more: --all for every one.`));
  }
  out(...lines);
}

// ---------- weather ----------

const WMO_TEXT = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers',
  82: 'Violent rain showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm',
  96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};
// NEA's PSI bands.
const psiBand = (v) => (v <= 50 ? green('good') : v <= 100 ? yellow('moderate') : v <= 200 ? red('unhealthy') : v <= 300 ? red('very unhealthy') : red('hazardous'));

async function weather(opts) {
  const w = await get('/api/weather');
  if (opts.json) return out(JSON.stringify(w, null, 2));
  const lines = [bold('Today in Singapore')];
  if (w.temp) lines.push(`  ${w.temp.min}° to ${w.temp.max}° across the island`);
  if (w.now) lines.push(`  Now ${w.now.temp}°, feels like ${w.now.feels}° · ${WMO_TEXT[w.now.code] || 'Not reported'} · humidity ${w.now.humidity}%`);
  if (w.today) lines.push(`  Today: ${WMO_TEXT[w.today.code] || 'Not reported'}, ${w.today.rainChance}% chance of rain${w.today.rain ? `, ${w.today.rain} mm` : ''}`);
  if (w.psi) lines.push(`  PSI ${w.psi.min} to ${w.psi.max}, ${psiBand(w.psi.max)}  ${dim(Object.entries(w.psi.regions || {}).map(([r, v]) => `${r} ${v}`).join(' · '))}`);
  if (w.pm25) lines.push(`  PM2.5 ${w.pm25.min} to ${w.pm25.max} µg/m³  ${dim(Object.entries(w.pm25.regions || {}).map(([r, v]) => `${r} ${v}`).join(' · '))}`);
  const next = (w.hours || []).filter((h) => h.time >= (w.now?.time || '').slice(0, 13)).slice(0, 6);
  if (next.length) lines.push(dim(`  Next hours: ${next.map((h) => `${h.time.slice(11, 16)} ${Math.round(h.temp)}° ${h.pop}%`).join(' · ')}`));
  out(...lines);
}

// ---------- calendar ----------

async function calendarCommand(args, opts) {
  const c = config();
  const [op, ...rest] = args;
  if (op === 'set') {
    const url = rest[0];
    if (!/^(https|webcals?):\/\/\S+$/i.test(url || '')) throw new Fail('sgbus calendar set <your calendar\'s private iCal link>');
    c.calendar = { url };
    saveConfig();
    return out('Calendar linked. sgbus calendar lists your events with a location.');
  }
  if (op === 'rm') {
    c.calendar = null;
    saveConfig();
    return out('Calendar unlinked.');
  }
  if (!c.calendar?.url) throw new Fail('No calendar linked: sgbus calendar set <private iCal link>. Google calls it "Secret address in iCal format".');
  const s = loadSite();
  const url = c.calendar.url.replace(/^webcals?:\/\//i, 'https://');
  const ics = await get('/api/calendar', { method: 'POST', body: { url }, text: true, timeout: 30000 });
  const events = s.Calendar.upcoming(s.Calendar.parseIcs(ics));
  const W = s.When;
  if (op === 'nav') {
    const ev = events[Number(rest[0]) - 1];
    if (!ev) throw new Fail(`There's no event ${rest[0] ?? ''}. sgbus calendar lists them.`);
    const postal = ev.location.match(/\b\d{6}\b/)?.[0];
    const to = postal || ev.location;
    const from = opts.from || (c.places.home ? 'home' : null);
    if (!from) throw new Fail('Where from? --from <place>, or set Home: sgbus place set home <address>.');
    console.error(dim(`${ev.title}, ${W.clockDay(ev.start)}`));
    // Arrive by its start when that's a time Navigate plans for; otherwise leave now.
    const at = W.msToAt(ev.start);
    const timed = !ev.allDay && !W.problem({ mode: 'arrive', at });
    return navPlan(from, to, { ...opts, ...(timed && { arrive: at.slice(11), day: at.slice(0, 10) }) });
  }
  if (opts.json) return out(JSON.stringify(events, null, 2));
  if (!events.length) return out(dim('No events with a location in the next two weeks.'));
  out(...events.map((ev, i) => `${dim(`${String(i + 1).padStart(2)}.`)} ${pad(ev.allDay ? 'all day' : W.clockDay(ev.start), 18)} ${bold(ev.title)} ${dim(`@ ${ev.location}`)}`), dim('sgbus calendar nav N for the way there.'));
}

// ---------- settings ----------

function settingsCommand(args) {
  const c = config();
  const [field, value] = args;
  const show = () => out(
    `  pin.stop    ${c.settings.pinStop}      ${dim('favourite stops, top or bottom of lists')}`,
    `  pin.bus     ${c.settings.pinBus}      ${dim("favourite buses, top or bottom of a stop's timings")}`,
    `  restricted  ${c.settings.restricted ? 'on ' : 'off'}      ${dim("on if you have a pass: Changi Airport's cargo area and MINDEF's stops")}`,
    dim(`Kept in ${CONFIG_FILE}`),
  );
  if (!field) return show();
  if (field === 'pin.stop' || field === 'pin.bus') {
    if (!['top', 'bottom'].includes(value)) throw new Fail(`sgbus settings ${field} top|bottom`);
    c.settings[field === 'pin.stop' ? 'pinStop' : 'pinBus'] = value;
  } else if (field === 'restricted') {
    if (!['on', 'off'].includes(value)) throw new Fail('sgbus settings restricted on|off');
    c.settings.restricted = value === 'on';
  } else throw new Fail(`There's no setting ${field}.`);
  saveConfig();
  show();
}

// ---------- updating itself ----------

const newer = (a, b) => {
  const x = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

// The single file updates itself in place; the .deb's is apt's to replace.
async function update() {
  const latest = (await get('/api/app-release'))?.version;
  if (!latest || !newer(latest, VERSION)) return out(`sgbus ${VERSION} is the newest.`);
  const deb = `https://github.com/${REPO}/releases/latest/download/sg-bus-timings-cli-${latest}-all.deb`;
  const self = fs.realpathSync(process.argv[1] || __filename);
  if (self.startsWith('/usr/')) {
    return out(`sgbus ${latest} is out (you have ${VERSION}). Installed from the .deb, so update it the same way:`,
      `  curl -LO ${deb}`, `  sudo apt install ./sg-bus-timings-cli-${latest}-all.deb`);
  }
  const code = await get(`https://github.com/${REPO}/releases/latest/download/sgbus`, { text: true, timeout: 60000 });
  if (!code.startsWith('#!/usr/bin/env node')) throw new Fail("The download wasn't the sgbus script. Try again later.");
  const tmp = `${self}.new`;
  fs.writeFileSync(tmp, code, { mode: 0o755 });
  fs.renameSync(tmp, self);
  out(`Updated sgbus to ${latest}.`);
}

// ---------- reading the command line ----------

const VALUE_FLAGS = new Set(['leave', 'arrive', 'day', 'days', 'buses', 'stop', 'time', 'dir', 'from', 'way', 'show']);
const SWITCHES = new Set(['watch', 'details', 'json', 'help', 'version', 'save', 'all', 'notify']);
const SHORT = { w: 'watch', d: 'details', j: 'json', h: 'help', v: 'version' };

function parseArgs(argv) {
  const args = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args.push(...argv.slice(i + 1)); break; }
    const long = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    const short = a.match(/^-([a-z])$/);
    if (!long && !short) { args.push(a); continue; }
    const name = long ? long[1] : SHORT[short[1]];
    if (!name || !(VALUE_FLAGS.has(name) || SWITCHES.has(name))) throw new Fail(`Unknown option ${a}. See sgbus help.`);
    if (long?.[2] != null) opts[name] = long[2];
    else if (VALUE_FLAGS.has(name)) {
      if (argv[i + 1] == null) throw new Fail(`--${name} wants a value.`);
      opts[name] = argv[++i];
    } else if (name === 'watch' && /^\d+$/.test(argv[i + 1] || '')) opts.watch = argv[++i];
    else opts[name] = true;
  }
  return { args, opts };
}

const HELP = `sgbus ${VERSION}: Singapore's live bus timings in the terminal, from ${SITE.replace(/^https:\/\//, '')}

Timings and search
  sgbus <stop> [buses]            a stop's timings: sgbus 84009, sgbus 84009 174,175, sgbus 84009 '22*'
    -w, --watch [seconds]         keep them on screen, refreshed (every 30s)
    -d, --details                 operator, decks, first and last bus
  sgbus <name, road or station>   find stops: sgbus bedok int, sgbus 'Bedok MRT'
  sgbus <postal code>             the stops nearest an address: sgbus 519599
  sgbus near <postal | lat,lng>   the same, or from a point
  sgbus bus <bus> [--dir 2] [--from <stop>]   a bus's route; just sgbus 22 works too

Getting somewhere
  sgbus route <start> <end>       by bus only, stop to stop (the route planner)
    --show N                      journey N step by step, with live timings
  sgbus nav <from> <to>           by bus and train, from anywhere to anywhere (Navigate)
    --way N                       way N step by step (the first, unless picked)
  Either takes --leave 08:30 or --arrive 6pm, with --day tomorrow, a weekday or a date,
  and --save to keep it. Ends can be stops, places, postal codes, stations or lat,lng,
  and your places by name: sgbus nav home work.

Saved
  sgbus favs [-w]                 every favourite stop's timings
  sgbus fav add|rm <stop>...      favourite stops; sgbus fav bus add|rm <bus>... for buses
  sgbus fav                       everything saved
  sgbus routes [N | rm N]         saved routes: list, plan one, or remove it; sgbus navs the same
  sgbus places                    Home, Work and your own
  sgbus place set <name> <where>  sgbus place set home 519599; sgbus place rm <name>
  sgbus routine add <stop> <HH:MM> [--days weekdays|weekends|daily|mon,wed] [--buses 14,60]
  sgbus routines                  list them; sgbus routine edit N [--time --days --buses --stop],
                                  sgbus routine rm N
  sgbus routine run [--notify]    send the ones due now (the sgbus-routines.timer does this)

Around Singapore
  sgbus alerts [--all]            train disruptions and traffic incidents
  sgbus weather                   today's weather, PSI and PM2.5
  sgbus calendar                  your events with a location, the next two weeks
  sgbus calendar set <iCal link>  link your calendar; calendar rm unlinks it
  sgbus calendar nav N [--from <place>]   the way to event N, arriving by its start

  sgbus settings [pin.stop|pin.bus top|bottom | restricted on|off]
  sgbus update                    get the newest version
  --json                          the data rather than the text, for scripts

Saved in ${CONFIG_FILE}. Also on Telegram: ${BOT}. Guide: guide.sgbus.uwuapps.org`;

async function main() {
  const { args, opts } = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = args;
  if (opts.version || cmd === 'version') return out(`sgbus ${VERSION}`);
  if (!cmd || opts.help || cmd === 'help') return out(HELP);
  switch (cmd) {
    case 'stop': {
      const code = await resolveStop(rest[0] || '', 'Stop');
      return showStop(code, busFilter(rest.slice(1).join(',')), opts);
    }
    case 'search': case 'find': {
      const { stops: found, note } = await matchStops(rest.join(' '));
      if (opts.json) return out(JSON.stringify(found, null, 2));
      if (!found.length) throw new Fail('No bus stops matched that. Try a stop code, part of its name or road, a station, or a postal code.');
      return out(...stopListLines(note || 'Bus stops', found));
    }
    case 'near': {
      await stops();
      const t = rest.join(' ');
      const ll = t.match(LATLNG_RE);
      const p = ll ? { lat: Number(ll[1]), lng: Number(ll[2]), address: t } : /^\d{6}$/.test(t) ? await postalPlace(t) : null;
      if (!p) throw new Fail('sgbus near <postal code | lat,lng>');
      const near = nearestStops(p.lat, p.lng);
      if (opts.json) return out(JSON.stringify(near, null, 2));
      return out(...stopListLines(`Bus stops near ${p.address}`, near));
    }
    case 'bus': return showBus(rest[0] || '', opts);
    case 'route': case 'routeplan':
      if (rest.length < 2) throw new Fail('sgbus route <start> <end>');
      return routePlan(rest[0], rest.slice(1).join(' '), opts);
    case 'nav': case 'navigate':
      if (rest.length < 2) throw new Fail('sgbus nav <from> <to>: quote an end with spaces, sgbus nav "Bedok Mall" home');
      return navPlan(rest[0], rest.slice(1).join(' '), opts);
    case 'favs': return favsTimings(opts);
    case 'fav': return favCommand(rest, opts);
    case 'routes': return savedCommand('routes', rest, opts);
    case 'navs': return savedCommand('navs', rest, opts);
    case 'places': return placeCommand([]);
    case 'place': return placeCommand(rest);
    case 'routines': return routineCommand([], opts);
    case 'routine': return routineCommand(rest, opts);
    case 'alerts': return alerts(opts);
    case 'weather': return weather(opts);
    case 'calendar': return calendarCommand(rest, opts);
    case 'settings': return settingsCommand(rest);
    case 'update': return update();
    default: break;
  }
  // As the bot reads a message: a stop's code (and buses), a postal code, a bus, or a search.
  const text = args.join(' ').trim();
  const stop = text.match(/^(\d{5})(?:[\s,]+(.+))?$/);
  if (stop) {
    await stops();
    if (!stopsIndex[stop[1]]) throw new Fail(`There's no bus stop ${stop[1]}.`);
    const filter = stop[2] ? busFilter(stop[2]) : null;
    if (stop[2] && !filter) throw new Fail(`"${stop[2]}" isn't a list of buses: 174, or 174,175, or 22*.`);
    return showStop(stop[1], filter, opts);
  }
  if (/^\d{6}$/.test(text)) return main2(['near', text], opts);
  if (/^[0-9A-Za-z]{1,4}$/.test(text)) {
    const net = await network().catch(() => null);
    if (net?.BusNet.hasService(text.toUpperCase())) return showBus(text, opts);
  }
  const { stops: found, note } = await matchStops(text);
  if (!found.length) throw new Fail('No bus stops matched that. Try a stop code, part of its name or road, a station, a postal code or a bus. sgbus help lists the rest.');
  if (found.length === 1) return showStop(found[0].code, null, opts);
  if (opts.json) return out(JSON.stringify(found, null, 2));
  out(...stopListLines(note || 'Did you mean', found));
}

// main again with other words, keeping the options.
function main2(args, opts) {
  process.argv = [process.argv[0], process.argv[1], ...args, ...Object.entries(opts).flatMap(([k, v]) => (v === true ? [`--${k}`] : [`--${k}=${v}`]))];
  return main();
}

main().catch((e) => {
  if (e instanceof Fail) console.error(red(e.message));
  else console.error(red(`Something went wrong: ${e.stack || e}`));
  process.exitCode = 1;
});
