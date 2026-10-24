#!/usr/bin/env node
// SG Bus Timings in the terminal: the Linux command-line edition (README.md). Everything the
// site and the Telegram bot do that needs no screen: a stop's timings, search, a bus's route,
// the route planner, Navigate, favourites, places, routines, service alerts, the weather and
// your calendar.
//
// The commands themselves are main-site/js/sgbus-core.js, the same file the web app's terminal
// runs (js/terminal.js), so both say the same thing. This file is what only a terminal has: the
// config file, the cache on disk, colours, the sgbus> prompt with its history, updating itself,
// and routines sent as desktop notifications.
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
const SITE_FILES = ['when.js', 'network.js', 'journeys.js', 'contractions.js', 'station-search.js', 'mrt-stations.js', 'calendar.js'];
const CORE_FILE = 'sgbus-core.js';

const HOME = os.homedir();
const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'sgbus');
const CACHE_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(HOME, '.cache'), 'sgbus');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// The stop list, every route and the stations: refreshed after this long, kept when offline.
const LIST_TTL_MS = 12 * 3600 * 1000;
const SG_OFFSET_MS = 8 * 3600 * 1000;

const colour = process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : !process.env.NO_COLOR && process.stdout.isTTY;

// ---------- the site's scripts ----------

function siteScripts() {
  if (typeof SITE_SCRIPTS !== 'undefined') return SITE_SCRIPTS;
  const dir = path.join(__dirname, '..', 'main-site', 'js');
  return Object.fromEntries([...SITE_FILES, CORE_FILE].map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
}

// The site's own scripts, run in a sandbox with what they'd find in a browser: window, fetch
// for the site's paths, and a localStorage that keeps nothing.
let site = null;
function loadSite() {
  if (site) return site;
  const ok = (data) => ({ ok: true, status: 200, json: async () => data });
  const siteFetch = async (where) => {
    const p = String(where);
    if (p === '/api/bus-routes') return ok(await cachedList('bus-routes.json', p));
    if (p === '/data/rail-stations.json') return ok(await cachedList('rail-stations.json', p));
    return ok(await core.get(p));
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

// ---------- the cache on disk ----------

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
    const data = await core.get(where, { timeout: 60000 });
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

// ---------- what you've saved ----------

const store = {
  load() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw new core.Fail(`${CONFIG_FILE} isn't readable JSON: ${e.message}`);
      return {};
    }
  },
  save(config) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const tmp = `${CONFIG_FILE}.${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
    fs.renameSync(tmp, CONFIG_FILE);
  },
};

// ---------- routines, as notifications ----------

function timerHint() {
  const on = spawnSync('systemctl', ['--user', 'is-enabled', 'sgbus-routines.timer'], { encoding: 'utf8' });
  if (on.stdout?.trim() === 'enabled') return;
  console.error(core.ansi(core.dim('For routines to arrive as notifications, turn on their timer once:\n  systemctl --user enable --now sgbus-routines.timer\nor run `sgbus routine run --notify` from cron every minute.')));
}

// The routines due now, each once a day: from its time to five minutes after, so a minute the
// timer missed still sends it. What was sent is kept beside the stop list.
async function routinesRun(opts) {
  const c = core.config();
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
      const lines = await core.stopTimings(r.code, filter, { details: false });
      body = lines.slice(1).map(core.plain).join('\n');
    } catch (e) {
      body = core.plain(`Couldn't get the timings just now: ${e.message}`);
    }
    const title = core.plain(`${r.name} (${r.code})`);
    console.log(core.ansi([core.bold(title), body].join('\n')));
    if (opts.notify) {
      const sent = spawnSync('notify-send', ['--app-name=SG Bus Timings', title, body]);
      if (sent.error) console.error(core.ansi(core.dim('notify-send isn\'t installed (libnotify-bin), so it\'s only printed here.')));
    }
    fired[r.id] = today;
  }
  if (due.length) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(firedFile, JSON.stringify(fired));
  }
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
  const out = (...lines) => console.log(core.ansi(lines.join('\n')));
  const latest = (await core.get('/api/app-release'))?.version;
  if (!latest || !newer(latest, VERSION)) return out(`sgbus ${VERSION} is the newest.`);
  const deb = `https://github.com/${REPO}/releases/latest/download/sg-bus-timings-cli-${latest}-all.deb`;
  const self = fs.realpathSync(process.argv[1] || __filename);
  if (self.startsWith('/usr/')) {
    return out(`sgbus ${latest} is out (you have ${VERSION}). Installed from the .deb, so update it the same way:`,
      `  curl -LO ${deb}`, `  sudo apt install ./sg-bus-timings-cli-${latest}-all.deb`);
  }
  const code = await core.get(`https://github.com/${REPO}/releases/latest/download/sgbus`, { text: true, timeout: 60000 });
  if (!code.startsWith('#!/usr/bin/env node')) throw new core.Fail("The download wasn't the sgbus script. Try again later.");
  const tmp = `${self}.new`;
  fs.writeFileSync(tmp, code, { mode: 0o755 });
  fs.renameSync(tmp, self);
  out(`Updated sgbus to ${latest}.`);
}

// ---------- the commands ----------

vm.runInThisContext(siteScripts()[CORE_FILE], { filename: CORE_FILE });
const core = globalThis.SgbusCore.create({
  version: VERSION,
  site: SITE,
  colour,
  fetch: (url, { timeout, headers, ...init }) => fetch(url, {
    ...init,
    headers: { 'user-agent': `sgbus-cli/${VERSION}`, ...headers },
    signal: AbortSignal.timeout(timeout),
  }),
  stops,
  scripts: loadSite,
  store,
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  clear: () => process.stdout.write('\x1b[2J\x1b[H'),
  savedIn: CONFIG_FILE,
  stopKey: 'Ctrl+C',
  linux: true,
  update,
  routinesRun,
  afterRoutineAdd: timerHint,
});

// ---------- the prompt ----------

// `sgbus` on its own, in a terminal: a prompt of its own, so each command is typed without
// "sgbus" in front, like a chat with the bot. Up and down go through what you've typed before
// (kept beside the stop list, the last HISTORY_MAX), Tab finishes a command or a place's name,
// and Ctrl+C stops a -w, or clears what's typed. exit, quit or Ctrl+D leaves.
const HISTORY_MAX = 500;

async function repl() {
  const readline = require('readline');
  const historyFile = path.join(CACHE_DIR, 'history');
  let history = [];
  try { history = fs.readFileSync(historyFile, 'utf8').split('\n').filter(Boolean).slice(-HISTORY_MAX).reverse(); } catch { /* none yet */ }
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, completer: core.complete, history, historySize: HISTORY_MAX,
    prompt: core.ansi(`${core.green('sgbus')}${core.dim('>')} `),
  });
  let busy = false;
  rl.on('SIGINT', () => {
    if (core.watching()) return core.stopWatching();
    if (busy) return;
    if (rl.line) {
      rl.write(null, { ctrl: true, name: 'u' });
      return;
    }
    console.log(core.ansi(`\n${core.dim('exit, or Ctrl+D, to leave.')}`));
    rl.prompt();
  });
  console.log([...core.intro(), ''].join('\n'));
  rl.prompt();
  for await (const line of rl) {
    let words = core.wordsOf(line.trim());
    if (words[0] === 'sgbus') words = words.slice(1);
    const [first] = words;
    if (first === 'exit' || first === 'quit' || first === 'q') break;
    // Your calendar's private link isn't kept, on disk or for Up.
    if (!core.remembered(line)) rl.history = rl.history.filter(core.remembered);
    else if (words.length) {
      try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.appendFileSync(historyFile, `${line.trim()}\n`); } catch { /* this session only */ }
    }
    if (first === 'clear') process.stdout.write('\x1b[2J\x1b[H');
    else if (first === 'help' && words.length === 1) console.log(`${core.promptHelp()}\n`);
    else if (words.length) {
      busy = true;
      try {
        await core.run(words);
      } catch (e) {
        core.report(e);
      } finally {
        busy = false;
      }
      console.log('');
    }
    rl.prompt();
  }
  rl.close();
}

// In a terminal with nothing after it, or as `sgbus shell` (which also reads commands piped in,
// a line each), the prompt; otherwise the one command, as cron and the routines' timer run it.
const argv = process.argv.slice(2);
if ((!argv.length && process.stdin.isTTY && process.stdout.isTTY) || (argv.length === 1 && argv[0] === 'shell')) {
  repl().catch((e) => { core.report(e); process.exitCode = 1; });
} else {
  core.run(argv).catch((e) => { core.report(e); process.exitCode = 1; });
}
