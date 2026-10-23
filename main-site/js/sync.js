// Syncing favourites, and everything else of yours, with another device or the Telegram bot,
// from the Settings modal.
//
// With another device, one shows a code (with a link and a QR code of it) and the other enters
// it. PeerJS's public broker introduces the two, then everything goes straight from one to the
// other over a WebRTC data channel, STUN only (js/p2p.js; STUN-p2p-spec.md in the repo root
// says why). So both have to be on the same network, or one on the other's hotspot.
//
// With the Telegram bot, this device shows a code and the bot's /sync takes it: the bot can't
// join a WebRTC channel, so the same messages go through the site's server instead
// (js/sync-relay.js, api/sync.js), kept there 10 minutes at most. This device is the host.
//
// Once connected, each side sees the other's and ticks which to import, or which of its own to
// send over, or all of them. Copying only adds, except where there's only one of a thing (your
// name, your calendar's link, a setting): taking the other's replaces this one's. Nothing is
// ever removed. Closing Settings ends the session.
//
// Each side says which kinds it can keep (`kinds`), and only those are offered to it: the
// website has no routines, and the bot no trips. Whatever the bot and the website both keep,
// two devices sync too.
//
// Loaded before script.js and uses its helpers ($, LS, nameOf, ...), so nothing here runs until
// script.js calls initSync().
//
// The wire, on top of p2p.js's hello and bye:
//   { type: 'favs', favs, kinds }  either way: all of the sender's, on connecting (the host in
//                                  answer to hello) and whenever they change, and the kinds it
//                                  can keep (FAV_KINDS' `kind`, and `setting:<field>` for each
//                                  setting). One without `kinds` is from before there were any
//                                  beyond LEGACY_KINDS.
//   { type: 'add', id, favs }      either way: add these to yours
//   { type: 'added', id, count }   the answer to add, with how many were new there

const SYNC_HOST_KEY = 'sgbus_sync_host_code';
const SYNC_LAST_KEY = 'sgbus_sync_last_code';

// More than anybody saves, and it keeps one message to tens of kilobytes.
const SYNC_MAX_ITEMS = 500;

// How long a device has to answer an `add` before this one says it heard nothing. The bot
// longer, as both it and this device only check the relay every couple of seconds.
const SYNC_ACK_MS = 5000;
const SYNC_BOT_ACK_MS = 15000;

const FAV_KINDS = [
  // You: your name and birthday from Settings, as { field, value }. Keyed by value too, so one
  // that differs from the other device's is offered, and taking it replaces this device's;
  // the same one shows as already there. A device from before this ignores them.
  { kind: 'profile', list: 'profile', label: 'You', key: (p) => `profile:${p.field}=${p.value}` },
  { kind: 'stop',  list: 'stops',  label: 'Bus stops', key: (s) => `stop:${s.code}` },
  { kind: 'bus',   list: 'buses',  label: 'Buses',     key: (b) => `bus:${b}` },
  { kind: 'route', list: 'routes', label: 'Routes',    key: (r) => `route:${r.start}>${r.end}` },
  // Navs, from Navigate (js/nav.js): two places, keyed by where they are. A device from
  // before navs synced sends none and ignores these, so sync still works between the two.
  { kind: 'nav',   list: 'navs',   label: 'Navs',      key: (n) => `nav:${navPoint(n.from)}>${navPoint(n.to)}` },
  // Places (js/places.js): Home and Work as themselves, so one is only ever filled where it
  // isn't set, never replaced, and the rest by where they are. Trips (js/history.js) by id.
  // A device from before these sends none and ignores them, as with navs.
  { kind: 'place', list: 'places', label: 'Places',    key: (p) => Places.syncKey(p) },
  { kind: 'trip',  list: 'trips',  label: 'Trips',     key: (t) => `trip:${t.id}` },
  // Past searches (js/recents.js), merged in by when each was searched.
  { kind: 'search', list: 'searches', label: 'Past searches', key: (r) => `search:${Recents.syncKey(r)}` },
  // The Android app's routines and last bus reminders (js/reminders.js), the bot's routines too.
  { kind: 'routine', list: 'routines', label: 'Routines', key: (r) => `routine:${r.code}@${r.time}/${[...r.days].sort().join('')}/${[...r.buses].sort().join(',')}` },
  { kind: 'lastbus', list: 'lastbus', label: 'Last bus reminders', key: (r) => `lastbus:${r.code}/${r.service}` },
  // Your calendar's link (js/calendar.js), the bot's /calendar too. One of it, as with your name.
  // webcal:// is https://, as the bot keeps it.
  { kind: 'calendar', list: 'calendar', label: 'Calendar', key: (c) => `calendar:${c.url.replace(/^webcals?:\/\//i, 'https://')}` },
  // Settings, as { field, value }, each one as your name is (SYNC_SETTINGS below). Only those
  // changed from how they start, so taking another device's never just undoes a choice.
  { kind: 'setting', list: 'settings', label: 'Settings', key: (s) => `setting:${s.field}=${s.value}` },
];

// What a device from before `kinds` keeps.
const LEGACY_KINDS = ['profile', 'stop', 'bus', 'route', 'nav', 'place', 'trip', 'search'];

const navPoint = (p) => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;

// ---- Settings ----
// Each: what Settings calls it, its value as words, what it starts as, and how it's read and
// put in place, through the same buttons Settings has, so the page follows as if tapped.
// `here` is whether this device has it. The bot keeps only the two pins.

const tap = (selector) => document.querySelector(selector)?.click();
const onOff = (v) => (v === 'on' ? 'On' : 'Off');
const TRAY_EXTRAS = ['simplygo', 'telegram', 'coffee', 'guide', 'nearstops', 'routines'];

const SYNC_SETTINGS = {
  'pin.stop': {
    label: 'Pin favourite stops in lists', values: ['top', 'bottom'], start: 'top',
    text: (v) => (v === 'bottom' ? 'Bottom' : 'Top'),
    get: () => LS.getPin('stop'), set: (v) => tap(`[data-pin-kind="stop"] [data-pin="${v}"]`),
  },
  'pin.bus': {
    label: 'Pin favourite buses at a stop', values: ['top', 'bottom'], start: 'top',
    text: (v) => (v === 'bottom' ? 'Bottom' : 'Top'),
    get: () => LS.getPin('bus'), set: (v) => tap(`[data-pin-kind="bus"] [data-pin="${v}"]`),
  },
  'theme.mode': {
    label: 'Light or dark', values: () => window.MODE_PREFERENCES || [], start: 'light',
    text: (v) => ({ light: 'Light', dark: 'Dark', time: 'By the time of day' })[v] || v,
    get: () => window.getModePreference?.() || 'light', set: (v) => window.applyMode?.(v),
  },
  'theme.colour': {
    label: 'Colour', values: () => (window.COLOR_THEMES || []).map((t) => t.id), start: 'classic',
    text: (v) => (window.COLOR_THEMES || []).find((t) => t.id === v)?.label || v,
    get: () => window.getStoredColorTheme?.() || 'classic', set: (v) => window.applyColorTheme?.(v),
  },
  getoff: {
    label: 'Get Off Alert on a trip', values: ['on', 'off'], start: 'on', text: onOff,
    get: () => (Trip.enabled() ? 'on' : 'off'), set: (v) => tap(`[data-getoff="${v}"]`),
  },
  earphones: {
    label: 'Get Off Alert’s sound', values: ['on', 'off'], start: 'off',
    text: (v) => (v === 'on' ? 'Earphones only' : 'Out loud'),
    here: () => Reminders.has('earphones'),
    get: () => (Reminders.earphonesOnly() ? 'on' : 'off'), set: (v) => tap(`[data-earphones="${v}"]`),
  },
  shake: {
    label: 'Shake to refresh', values: ['on', 'off'], start: 'on', text: onOff,
    get: () => { try { return localStorage.getItem('sgbus_shake') === 'off' ? 'off' : 'on'; } catch { return 'on'; } },
    set: (v) => { try { localStorage.setItem('sgbus_shake', v); } catch { /* this visit only */ } tap(`[data-shake="${v}"]`); },
  },
  confetti: {
    label: 'Birthday confetti', values: ['on', 'off'], start: 'on', text: onOff,
    get: () => (LS.getConfetti() ? 'on' : 'off'), set: (v) => tap(`[data-confetti="${v}"]`),
  },
  'tray.side': {
    label: 'Edge Tray side', values: ['left', 'right'], start: 'right',
    text: (v) => (v === 'left' ? 'Left' : 'Right'),
    get: () => (page.getAttribute('data-tray-side') === 'left' ? 'left' : 'right'), set: (v) => setTraySide(v),
  },
  // The buttons turned off, as "coffee telegram".
  'tray.hide': {
    label: 'Edge Tray buttons turned off', start: '',
    ok: (v) => v.split(' ').filter(Boolean).every((n) => TRAY_EXTRAS.includes(n)),
    text: (v) => v.split(' ').filter(Boolean).map((n) => $(`#trayExtrasPick [data-tray-show="${n}"]`)?.textContent || n).join(', ') || 'None',
    get: () => [...trayHidden()].sort().join(' '),
    set: (v) => { const off = v.split(' '); for (const n of TRAY_EXTRAS) setTrayExtra(n, !off.includes(n)); },
  },
  restricted: {
    label: 'Restricted areas', values: ['on', 'off'], start: 'off',
    text: (v) => (v === 'on' ? 'I have a pass' : 'Keep out'),
    get: () => (LS.getRestricted() ? 'on' : 'off'), set: (v) => tap(`[data-restricted="${v}"]`),
  },
  customs: {
    label: 'Immigration time', values: ['auto', '15', '30', '45', '60'], start: 'auto',
    text: (v) => (v === 'auto' ? 'By the time' : v === '60' ? '1 hr' : `${v} min`),
    get: () => LS.getCustoms(), set: (v) => tap(`[data-customs="${v}"]`),
  },
  glance: {
    label: 'Next bus at a glance', values: ['on', 'off'], start: 'on', text: onOff,
    get: () => (Glance.enabled() ? 'on' : 'off'), set: (v) => Glance.setEnabled(v === 'on'),
  },
  // Custom home (js/main-screen.js), kept as "stop" for Bus timings, as Opens on was.
  start: {
    label: 'Custom home', values: () => ['stop', ...MainScreen.IDS.filter((n) => n !== 'timings')], start: 'stop',
    text: (v) => MainScreen.label(v === 'stop' ? 'timings' : v),
    get: () => (MainScreen.home() === 'timings' ? 'stop' : MainScreen.home()),
    set: (v) => MainScreen.setHome(v === 'stop' ? 'timings' : v),
  },
  'nav.mode': {
    label: 'Navigate opens on', values: ['all', 'bus'], start: 'all',
    text: (v) => (v === 'bus' ? 'Bus only' : 'Bus and train'),
    get: () => { try { return localStorage.getItem('sgbus_nav_mode') === 'bus' ? 'bus' : 'all'; } catch { return 'all'; } },
    set: (v) => { try { localStorage.setItem('sgbus_nav_mode', v); } catch { /* opens on Bus and train */ } },
  },
};

const settingValues = (s) => (typeof s.values === 'function' ? s.values() : s.values);
const settingOk = (field, value) => {
  const s = SYNC_SETTINGS[field];
  if (!s || typeof value !== 'string' || value.length > 100) return false;
  return s.ok ? s.ok(value) : settingValues(s).includes(value);
};
const settingHere = (field) => !SYNC_SETTINGS[field].here || SYNC_SETTINGS[field].here();

function ownSettings() {
  return Object.entries(SYNC_SETTINGS)
    .filter(([field, s]) => settingHere(field) && s.get() !== s.start)
    .map(([field, s]) => ({ field, value: s.get() }));
}

// The kinds this device keeps, for the other side to offer only those.
function ownKinds() {
  return [
    ...LEGACY_KINDS, 'calendar',
    ...(Reminders.has('routines') ? ['routine'] : []),
    ...(Reminders.has('lastbus') ? ['lastbus'] : []),
    ...Object.keys(SYNC_SETTINGS).filter(settingHere).map((field) => `setting:${field}`),
  ];
}

const keeps = (kinds, { kind, item }) => kinds.includes(kind === 'setting' ? `setting:${item.field}` : kind);

const sync = {
  role: null,        // 'host' | 'guest' | 'bot' (hosting for the Telegram bot) while a session runs
  conn: null,        // its P2P.Host, P2P.Guest or BotRelay
  status: 'idle',
  theirs: null,      // the other side's favourites, once they've arrived
  theirKinds: LEGACY_KINDS, // what the other side keeps
  tab: 'import',
  picked: { import: new Set(), export: new Set() },
  cat: { import: 'all', export: 'all' }, // the kind on show in each tab (FAV_KINDS' `kind`), or 'all'
  pending: new Map(), // add id -> timer, for sends not yet answered
  lastId: 0,
  retriedTaken: false,
  droppedCode: '',   // a guest's code whose channel dropped, to reconnect on return
  wakeLock: null,
};

function initSync() {
  $('#syncHostBtn').addEventListener('click', () => {
    sync.retriedTaken = false;
    startHosting();
  });
  $('#syncBotBtn').addEventListener('click', startBotSync);
  $('#syncBotCommand').addEventListener('click', () => {
    navigator.clipboard?.writeText($('#syncBotCommand').textContent)
      .then(() => showSyncNote('Command copied. Paste it to the bot.'))
      .catch(() => {});
  });
  $('#syncJoinBtn').addEventListener('click', () => joinSync($('#syncCodeInput').value));
  $('#syncCodeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinSync(e.target.value);
  });
  $('#syncCode').addEventListener('click', copySyncLink);
  $('#syncNewCode').addEventListener('click', () => newHostCode());
  $('#syncEnd').addEventListener('click', stopSync);

  $('#syncTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-sync-tab]');
    if (!tab) return;
    sync.tab = tab.dataset.syncTab;
    renderSyncList();
    $('#syncList').scrollTop = 0;
  });
  $('#syncList').addEventListener('change', (e) => {
    const key = e.target.dataset.syncKey;
    if (!key) return;
    const picked = sync.picked[sync.tab];
    if (e.target.checked) picked.add(key);
    else picked.delete(key);
    renderSyncPicks();
  });
  $('#syncCats').addEventListener('click', (e) => {
    const cat = e.target.closest('[data-sync-cat]');
    if (!cat) return;
    sync.cat[sync.tab] = cat.dataset.syncCat;
    renderSyncList();
    $('#syncList').scrollTop = 0;
  });
  // Ticks or unticks what's on show: the kind picked, or everything. Ticks in other kinds stay.
  $('#syncAll').addEventListener('change', (e) => {
    const picked = sync.picked[sync.tab];
    for (const { key } of shownAvailable()) {
      if (e.target.checked) picked.add(key);
      else picked.delete(key);
    }
    $$('#syncList [data-sync-key]:not(:disabled)').forEach((box) => { box.checked = picked.has(box.dataset.syncKey); });
    renderSyncPicks();
  });
  $('#syncGo').addEventListener('click', copyPicked);

  // A session belongs to the open Settings modal, so nothing is left running out of sight.
  $('#settingsModal').addEventListener('modalclose', () => {
    stopSync();
    showSyncStatus('');
    showSyncNote('');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // The browser lets go of the wake lock whenever the page is hidden.
    if (sync.role) holdScreenOn();
    // Back from the background with a channel that died meanwhile. An unreachable one isn't
    // retried: the network hasn't changed, so the result wouldn't either.
    else if (sync.droppedCode && !$('#settingsModal').classList.contains('hidden')) joinSync(sync.droppedCode);
  });

  renderSync();
}

// Called as Settings opens: the last code this device joined with, ready to use again.
function prepareSync() {
  if (!sync.role && !$('#syncCodeInput').value) $('#syncCodeInput').value = readSyncKey(SYNC_LAST_KEY);
  renderSync();
}

// A link from another device's QR code (#sync/CODE): the code filled in, waiting for a tap on
// Connect rather than connecting outright, since connecting shows this device's favourites to
// whoever made the link.
function openSyncLink(code) {
  history.replaceState(null, '', location.pathname + location.search);
  openSettings();
  if (sync.role) return;
  $('#syncCodeInput').value = P2P.normaliseCode(code);
  showSyncStatus('Tap Connect to sync with the device showing this code.', 'busy');
  $('#syncJoinBtn').scrollIntoView({ block: 'nearest' });
  $('#syncJoinBtn').focus({ preventScroll: true });
}

// ---- Storage ----

function readSyncKey(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function writeSyncKey(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* private mode: codes just aren't remembered */ }
}

const syncLink = (code) => `${location.origin}/#sync/${code}`;

// ---- Favourites ----

const BIRTHDAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function ownProfile() {
  const out = [];
  const name = LS.getName().trim();
  const birthday = LS.getBirthday();
  if (name) out.push({ field: 'name', value: name });
  if (BIRTHDAY_RE.test(birthday)) out.push({ field: 'birthday', value: birthday });
  return out;
}

function ownFavs() {
  return {
    profile: ownProfile(),
    stops: LS.getFavs(), buses: LS.getFavBuses(), routes: LS.getFavRoutes(), navs: LS.getFavNavs(),
    places: Places.syncList(), trips: TripHistory.list().slice(0, SYNC_MAX_ITEMS), searches: Recents.syncList(),
    routines: Reminders.syncRoutines(), lastbus: Reminders.syncLastBus(), calendar: Calendar.syncList(),
    settings: ownSettings(),
  };
}

// Every favourite as one flat list, each with a key that names it the same way on both devices.
function favItems(favs) {
  return FAV_KINDS.flatMap(({ kind, list, key }) => (favs[list] || []).map((item) => ({ key: key(item), kind, item })));
}

function pickFavs(favs, keys) {
  return Object.fromEntries(FAV_KINDS.map(({ list, key }) => [list, (favs[list] || []).filter((item) => keys.has(key(item)))]));
}

// What the other side said it keeps: the kinds it named that this version knows.
function cleanKinds(raw) {
  if (!Array.isArray(raw)) return LEGACY_KINDS;
  const known = new Set([...FAV_KINDS.map((k) => k.kind), ...Object.keys(SYNC_SETTINGS).map((f) => `setting:${f}`)]);
  return raw.filter((k) => typeof k === 'string' && known.has(k));
}

// Favourites from the other device, checked field by field. They're input from another
// machine, so anything malformed is dropped rather than stored, and duplicates go too.
function cleanFavs(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const list = (v) => (Array.isArray(v) ? v.slice(0, SYNC_MAX_ITEMS) : []);
  const isStop = (v) => typeof v === 'string' && /^\d{5}$/.test(v);
  const text = (v) => (typeof v === 'string' ? v.slice(0, 80) : '');
  const seen = new Set();
  const once = (key) => !seen.has(key) && !!seen.add(key);
  // A nav's end: a label and a point in Singapore, or at a stop in Johor Bahru (api/nav.js).
  const isPlace = (p) => p && typeof p === 'object' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat > 1.15 && p.lat < 1.5 && p.lng > 103.55 && p.lng < 104.1;
  const place = (p) => ({ label: text(p.label) || 'Place', lat: p.lat, lng: p.lng });

  return {
    profile: list(raw.profile)
      .filter((p) => (p?.field === 'name' && typeof p.value === 'string' && p.value.trim() && p.value.length <= 64)
        || (p?.field === 'birthday' && BIRTHDAY_RE.test(p.value)))
      .filter((p) => once(`profile:${p.field}`))
      .map((p) => ({ field: p.field, value: p.value.trim() })),
    stops: list(raw.stops)
      .filter((s) => isStop(s?.code) && once(`stop:${s.code}`))
      .map((s) => ({ code: s.code, name: text(s.name) })),
    buses: list(raw.buses)
      .filter((b) => typeof b === 'string' && /^[0-9A-Z]{1,5}$/.test(b) && once(`bus:${b}`)),
    routes: list(raw.routes)
      .filter((r) => isStop(r?.start) && isStop(r?.end) && once(`route:${r.start}>${r.end}`))
      .map((r) => ({ start: r.start, startName: text(r.startName), end: r.end, endName: text(r.endName) })),
    navs: list(raw.navs)
      .filter((n) => isPlace(n?.from) && isPlace(n?.to) && once(`nav:${navPoint(n.from)}>${navPoint(n.to)}`))
      .map((n) => ({ from: place(n.from), to: place(n.to) })),
    places: list(raw.places).map(Places.clean).filter((p) => p && once(Places.syncKey(p))),
    trips: list(raw.trips).map(TripHistory.clean).filter((t) => t && once(`trip:${t.id}`)),
    searches: list(raw.searches).map(Recents.clean).filter((r) => r && once(`search:${Recents.syncKey(r)}`)),
    routines: list(raw.routines)
      .filter((r) => isStop(r?.code) && /^([01]\d|2[0-3])[0-5]\d$/.test(r.time)
        && Array.isArray(r.days) && r.days.length && r.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
        && Array.isArray(r.buses) && r.buses.length <= 20 && r.buses.every((b) => typeof b === 'string' && /^[0-9A-Z]{1,5}$|^[0-9A-Z]{1,3}\*$/.test(b)))
      .map((r) => ({ code: r.code, name: text(r.name), buses: [...new Set(r.buses)], time: r.time, days: [...new Set(r.days)].sort() }))
      .filter((r) => once(FAV_KINDS.find((k) => k.kind === 'routine').key(r)))
      .slice(0, Reminders.MAX_ROUTINES),
    lastbus: list(raw.lastbus)
      .filter((r) => isStop(r?.code) && typeof r.service === 'string' && /^[0-9A-Z]{1,5}$/.test(r.service)
        && ['wd', 'sat', 'sun'].every((d) => /^(\d{4}|-)$/.test(r[d])) && once(`lastbus:${r.code}/${r.service}`))
      .map((r) => ({ code: r.code, name: text(r.name), service: r.service, wd: r.wd, sat: r.sat, sun: r.sun }))
      .slice(0, 20),
    // A link to a calendar, https or webcal (which is https).
    calendar: list(raw.calendar)
      .filter((c) => typeof c?.url === 'string' && c.url.length <= 2000 && /^(https|webcal):\/\/[^\s]+$/i.test(c.url))
      .slice(0, 1)
      .map((c) => ({ url: c.url })),
    settings: list(raw.settings)
      .filter((s) => settingOk(s?.field, s?.value) && once(`setting:${s.field}`))
      .map((s) => ({ field: s.field, value: s.value })),
  };
}

// Adds whichever of `favs` this device doesn't have yet, after the ones it has, and says how
// many that was. Names are this device's own where it knows the stop.
function mergeFavs(favs) {
  const have = new Set(favItems(ownFavs()).map((f) => f.key));
  const stops = LS.getFavs();
  const buses = LS.getFavBuses();
  const routes = LS.getFavRoutes();
  const navs = LS.getFavNavs();
  const places = [];
  const trips = [];
  const searches = [];
  const routines = [];
  const lastbus = [];
  const kinds = ownKinds();
  let added = 0;
  let profile = false;

  for (const fav of favItems(favs)) {
    const { key, kind, item } = fav;
    if (have.has(key) || !keeps(kinds, fav)) continue;
    have.add(key);
    if (kind === 'routine') {
      routines.push(item);
      continue;
    }
    if (kind === 'lastbus') {
      lastbus.push(item);
      continue;
    }
    if (kind === 'calendar') {
      added += Calendar.mergeSync(item.url);
      continue;
    }
    if (kind === 'setting') {
      SYNC_SETTINGS[item.field].set(item.value);
      added++;
      continue;
    }
    if (kind === 'profile') {
      if (item.field === 'name') LS.setName(item.value);
      else LS.setBirthday(item.value);
      profile = true;
      added++;
      continue;
    }
    if (kind === 'place') {
      places.push(item);
      continue;
    }
    if (kind === 'trip') {
      trips.push(item);
      continue;
    }
    if (kind === 'search') {
      searches.push(item);
      continue;
    }
    added++;
    if (kind === 'stop') {
      stops.push({ code: item.code, name: nameOf(item.code) || item.name });
    } else if (kind === 'bus') {
      buses.push(item);
    } else if (kind === 'nav') {
      navs.push(item);
    } else {
      routes.push({
        start: item.start, startName: nameOf(item.start) || item.startName || item.start,
        end: item.end, endName: nameOf(item.end) || item.endName || item.end,
      });
    }
  }

  if (added) {
    LS.setFavs(stops);
    LS.setFavBuses(buses);
    LS.setFavRoutes(routes);
    LS.setFavNavs(navs);
    favouritesChanged();
  }
  // The greeting, and Settings if it's open, show the name and birthday taken.
  if (profile) {
    updateGreeting();
    $('#setName').value = LS.getName();
    $('#setBirthday').value = LS.getBirthday();
  }
  // Places and trips keep themselves, and say how many they took.
  if (places.length) added += Places.merge(places);
  if (trips.length) added += TripHistory.merge(trips);
  if (searches.length) added += Recents.merge(searches);
  if (routines.length) added += Reminders.mergeRoutines(routines);
  if (lastbus.length) added += Reminders.mergeLastBus(lastbus);
  return added;
}

// ---- Sessions ----

function beginSession(role) {
  sync.role = role;
  sync.status = 'connecting';
  sync.theirs = null;
  sync.theirKinds = LEGACY_KINDS;
  sync.droppedCode = '';
  sync.tab = 'import';
  sync.picked.import.clear();
  sync.picked.export.clear();
  sync.cat = { import: 'all', export: 'all' };
  showSyncNote('');
  holdScreenOn();
}

// Tears down whatever is running. `bye` is for a guest leaving on purpose, which retires the
// host's code; anything else just closes.
function endSession({ bye = false, text = '', tone = 'busy' } = {}) {
  const conn = sync.conn;
  // Cleared first, so the status the closing connection reports on its way out is ignored.
  sync.conn = null;
  if (conn) {
    if (bye && sync.role === 'guest') conn.leave();
    else conn.close();
  }
  for (const timer of sync.pending.values()) clearTimeout(timer);
  sync.pending.clear();
  sync.role = null;
  sync.status = 'idle';
  sync.theirs = null;
  releaseScreen();
  showSyncStatus(text, tone);
  renderSync();
}

// Stop, Cancel or Disconnect, or Settings closing.
function stopSync() {
  sync.droppedCode = '';
  if (sync.role) endSession({ bye: true });
}

async function startHosting() {
  if (sync.role) return;
  const stored = readSyncKey(SYNC_HOST_KEY);
  const code = P2P.isValidCode(stored) ? stored : P2P.generateCode();
  writeSyncKey(SYNC_HOST_KEY, code);

  beginSession('host');
  $('#syncCode').textContent = code;
  $('#syncLink').textContent = syncLink(code);
  $('#syncQr').innerHTML = qrToSvg(syncLink(code));

  const host = new P2P.Host({ maxGuests: 1 });
  sync.conn = host;
  host.addEventListener('status', ({ detail }) => {
    if (sync.conn !== host) return;
    // The stored code is held by something else: another tab, or the broker not yet letting go
    // of it after a reload. A fresh one, once; a second collision in a row is not stale state.
    if (detail.taken && !sync.retriedTaken) {
      sync.retriedTaken = true;
      newHostCode();
      return;
    }
    if (detail.status === 'error') {
      if (detail.taken) writeSyncKey(SYNC_HOST_KEY, '');
      endSession({ text: detail.message, tone: 'error' });
      return;
    }
    if (detail.status === 'waiting') sync.retriedTaken = false;
    onSyncStatus(detail.status);
  });
  // A newcomer replaces the device that was connected, whose favourites no longer apply.
  host.addEventListener('join', () => {
    if (sync.conn !== host) return;
    sync.theirs = null;
    renderSyncList();
  });
  host.addEventListener('message', ({ detail }) => {
    if (sync.conn === host) onSyncMessage(detail.message);
  });
  renderSync();
  revealSync();

  try {
    await host.start(code);
  } catch {
    if (sync.conn === host) endSession({ text: 'Could not load syncing. Check your connection.', tone: 'error' });
  }
}

// The Telegram bot's username, for its links. The same as index.html's Telegram button.
const SYNC_BOT = 'UwUsgbus_bot';
const botLink = (code) => `https://t.me/${SYNC_BOT}?start=sync_${code}`;

// Syncing with the Telegram bot: a fresh code each time, which the bot takes with its /sync
// (or its link, which says it for you), through the site's relay (js/sync-relay.js).
async function startBotSync() {
  if (sync.role) return;
  const code = P2P.generateCode();
  beginSession('bot');
  $('#syncCode').textContent = code;
  $('#syncLink').textContent = botLink(code);
  $('#syncQr').innerHTML = qrToSvg(botLink(code));
  $('#syncBotOpen').href = botLink(code);
  $('#syncBotCommand').textContent = `/sync ${code}`;

  const relay = new BotRelay();
  sync.conn = relay;
  relay.addEventListener('status', ({ detail }) => {
    if (sync.conn !== relay) return;
    if (detail.status === 'ended') endSession({ text: detail.message, tone: 'warn' });
    else if (detail.status === 'error') endSession({ text: detail.message, tone: 'error' });
    else onSyncStatus(detail.status);
  });
  relay.addEventListener('message', ({ detail }) => {
    if (sync.conn === relay) onSyncMessage(detail.message);
  });
  renderSync();
  revealSync();

  try {
    await relay.start(code);
  } catch (err) {
    if (sync.conn === relay) endSession({ text: err.message, tone: 'error' });
  }
}

// Gives up the code on show for a fresh one, which the old one stops working the moment it does.
async function newHostCode(note = '') {
  endSession();
  writeSyncKey(SYNC_HOST_KEY, '');
  await startHosting();
  if (note) showSyncNote(note);
}

async function joinSync(input) {
  const code = P2P.normaliseCode(input);
  if (!P2P.isValidCode(code)) {
    showSyncStatus(`The code is the ${P2P.CODE_LENGTH} letters and numbers on the other device's screen.`, 'error');
    return;
  }
  if (sync.role) endSession();

  beginSession('guest');
  writeSyncKey(SYNC_LAST_KEY, code);
  $('#syncCodeInput').value = code;

  const guest = new P2P.Guest();
  sync.conn = guest;
  guest.addEventListener('status', ({ detail }) => {
    if (sync.conn !== guest) return;
    const { status } = detail;
    if (status === 'dropped') {
      endSession({ text: 'Lost the connection to the other device. Tap Connect to try again.', tone: 'warn' });
      sync.droppedCode = code;
    } else if (status === 'unreachable') {
      endSession({
        text: 'Could not reach the other device. Both have to be on the same network: join the same wifi, ' +
          'or turn on a hotspot on one and join it from the other. Check the code is still the one on screen.',
        tone: 'error',
      });
    } else if (status === 'error') {
      endSession({ text: detail.message, tone: 'error' });
    } else {
      onSyncStatus(status);
    }
  });
  guest.addEventListener('message', ({ detail }) => {
    if (sync.conn === guest) onSyncMessage(detail.message);
  });
  renderSync();
  revealSync();

  try {
    await guest.connect(code);
  } catch {
    if (sync.conn === guest) endSession({ text: 'Could not load syncing. Check your connection.', tone: 'error' });
  }
}

function onSyncStatus(status) {
  const was = sync.status;
  sync.status = status;
  if (status !== 'connected') {
    sync.theirs = null;
  } else if (was !== 'connected' && sync.role !== 'host') {
    // The host answers p2p.js's hello with its favourites; these are ours for it. The bot has
    // sent its own on joining, and hears ours now.
    sendFavs();
  }
  renderSync();
  if (status === 'connected' && was !== 'connected') revealSync();
}

function sendSync(message) {
  sync.conn?.send(message);
}

function sendFavs() {
  sendSync({ type: 'favs', favs: ownFavs(), kinds: ownKinds() });
}

// The other side, in the notes.
const otherSide = () => (sync.role === 'bot' ? 'the Telegram bot' : 'the other device');
const OtherSide = () => (sync.role === 'bot' ? 'The Telegram bot' : 'The other device');

// Everything the other device sends goes through here. Unknown types are ignored, never
// thrown on: the other device may be a version ahead or behind.
function onSyncMessage(message) {
  switch (message.type) {
    case 'hello':
      if (sync.role === 'host') sendFavs();
      break;

    case 'favs': {
      const favs = cleanFavs(message.favs);
      if (!favs) break;
      sync.theirs = favs;
      sync.theirKinds = cleanKinds(message.kinds);
      renderSyncList();
      break;
    }

    case 'add': {
      const favs = cleanFavs(message.favs);
      if (!favs || !Number.isInteger(message.id)) break;
      const added = mergeFavs(favs);
      sendSync({ type: 'added', id: message.id, count: added });
      if (added) sendFavs();
      showSyncNote(added
        ? `${OtherSide()} sent ${plural(added, 'thing')}, now saved here.`
        : `${OtherSide()} sent things this device already has.`);
      renderSyncList();
      break;
    }

    case 'added': {
      const timer = sync.pending.get(message.id);
      if (timer === undefined) break;
      clearTimeout(timer);
      sync.pending.delete(message.id);
      const count = Math.max(0, Math.min(SYNC_MAX_ITEMS * FAV_KINDS.length, Math.floor(Number(message.count)) || 0));
      showSyncNote(count
        ? `Sent. ${OtherSide()} saved ${plural(count, 'new thing')}.`
        : `Sent. ${OtherSide()} already had all of those.`);
      break;
    }

    // The guest is finished with this code, so nobody else gets to use it.
    case 'bye':
      if (sync.role === 'host') newHostCode('The other device disconnected. The old code no longer works; this is a new one.');
      break;

    default:
      break;
  }
}

// ---- Copying ----

// The favourites on offer in the tab on show, minus those the other end already has.
function syncSource() {
  return sync.tab === 'import' ? sync.theirs : ownFavs();
}

// The kinds the receiving end of the tab on show keeps.
const destKinds = () => (sync.tab === 'import' ? ownKinds() : sync.theirKinds);

// What's listed in the tab on show: only what the receiving end can keep.
function syncListed() {
  const source = syncSource();
  if (!source) return [];
  const kinds = destKinds();
  return favItems(source).filter((f) => keeps(kinds, f));
}

function syncAvailable() {
  const dest = sync.tab === 'import' ? ownFavs() : sync.theirs;
  if (!syncSource() || !dest) return [];
  const there = new Set(favItems(dest).map((f) => f.key));
  return syncListed().filter((f) => !there.has(f.key));
}

// Of those, the ones in the kind on show.
const inShownCat = (f) => sync.cat[sync.tab] === 'all' || f.kind === sync.cat[sync.tab];
const shownAvailable = () => syncAvailable().filter(inShownCat);

function copyPicked() {
  const picked = sync.picked[sync.tab];
  if (!picked.size || !syncSource()) return;
  const chosen = pickFavs(syncSource(), picked);
  const count = picked.size;
  picked.clear();

  if (sync.tab === 'import') {
    const added = mergeFavs(chosen);
    if (added) sendFavs();
    showSyncNote(`Imported ${plural(added, 'thing')} to this device.`);
  } else {
    const id = ++sync.lastId;
    sendSync({ type: 'add', id, favs: chosen });
    sync.pending.set(id, setTimeout(() => {
      sync.pending.delete(id);
      showSyncNote(`No answer from ${otherSide()}. Check it still says connected, then try again.`, 'error');
    }, sync.role === 'bot' ? SYNC_BOT_ACK_MS : SYNC_ACK_MS));
    showSyncNote(`Sending ${plural(count, 'thing')}…`);
  }
  renderSyncList();
}

function copySyncLink() {
  const link = $('#syncLink').textContent;
  if (!link || !navigator.clipboard) return;
  navigator.clipboard.writeText(link)
    .then(() => showSyncNote('Link copied.'))
    .catch(() => showSyncNote("Couldn't copy the link. Type the code on the other device instead.", 'error'));
}

// ---- Screen wake lock ----

// A phone that locks mid-sync suspends the page and drops the channel with it.
async function holdScreenOn() {
  if (!sync.role || sync.wakeLock || !navigator.wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!sync.role) { lock.release().catch(() => {}); return; }
    sync.wakeLock = lock;
    lock.addEventListener('release', () => { if (sync.wakeLock === lock) sync.wakeLock = null; });
  } catch { /* battery saver, or not allowed: the session carries on without it */ }
}

function releaseScreen() {
  sync.wakeLock?.release().catch(() => {});
  sync.wakeLock = null;
}

// ---- Rendering ----

function showSyncStatus(text, tone = 'busy') {
  $('#syncStatus').hidden = !text;
  $('#syncStatusText').textContent = text;
  $('#syncStatus .statusDot').className = `statusDot ${tone}`;
}

function showSyncNote(text, tone = '') {
  $('#syncNote').hidden = !text;
  $('#syncNote').textContent = text;
  $('#syncNote').classList.toggle('error', tone === 'error');
}

// The section sits at the foot of Settings, below the fold on a phone.
function revealSync() {
  $('#syncStatus').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSync() {
  const { role, status } = sync;
  const connected = status === 'connected';

  const hosting = role === 'host' || role === 'bot';
  $('#syncStart').hidden = !!role;
  $('#syncHost').hidden = !hosting || connected;
  $('#syncBot').hidden = role !== 'bot';
  $('#syncLive').hidden = !connected;
  $('#syncControls').hidden = !role;
  $('#syncNewCode').hidden = role !== 'host';
  $('#syncEnd').textContent = connected ? 'Disconnect' : hosting ? 'Stop' : 'Cancel';

  if (role === 'host' && status === 'waiting') {
    showSyncStatus('Waiting for the other device. In its Settings, enter this code, or scan the QR code with its camera.', 'warn');
  } else if (role === 'bot' && status === 'waiting') {
    showSyncStatus(`Waiting for the Telegram bot. Tap Open the bot, or send it the command below. On a computer, scan the QR code with your phone.`, 'warn');
  } else if (role && status === 'connecting') {
    showSyncStatus(hosting ? 'Getting the code ready…' : 'Connecting to the other device…', 'busy');
  } else if (connected) {
    showSyncStatus(role === 'bot' ? 'Connected to the Telegram bot.' : 'Connected to the other device.', 'ok');
  }

  renderSyncList();
}

function favTitle(kind, item) {
  if (kind === 'profile') return item.field === 'name' ? 'Your name' : 'Your birthday';
  if (kind === 'stop') return nameOf(item.code) || item.name || 'Bus stop';
  if (kind === 'bus') return `Bus ${item}`;
  if (kind === 'nav') return `${item.from.label} → ${item.to.label}`;
  if (kind === 'place') return Places.FIXED[item.key]?.name || item.name || item.label;
  if (kind === 'trip') return `To ${item.to.label}`;
  if (kind === 'search') return item.label;
  if (kind === 'routine') return `${item.time.slice(0, 2)}:${item.time.slice(2)} at ${nameOf(item.code) || item.name || item.code}`;
  if (kind === 'lastbus') return `Last ${item.service} at ${nameOf(item.code) || item.name || item.code}`;
  if (kind === 'calendar') return 'Your calendar’s link';
  if (kind === 'setting') return SYNC_SETTINGS[item.field].label;
  return `${nameOf(item.start) || item.startName || item.start} → ${nameOf(item.end) || item.endName || item.end}`;
}

// "Weekdays", "Every day", "Weekends" or the days, as the routines in js/reminders.js say.
function syncDays(days) {
  const set = [...days].sort().join(',');
  if (set === '1,2,3,4,5,6,7') return 'Every day';
  if (set === '1,2,3,4,5') return 'Weekdays';
  if (set === '6,7') return 'Weekends';
  return days.map((d) => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(', ');
}

function favSubtitle(kind, item) {
  if (kind === 'profile') {
    if (item.field === 'name') return item.value;
    const [y, m, d] = item.value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (kind === 'stop') {
    const road = stopsIndex?.[item.code]?.road;
    return road ? `${item.code} · ${road}` : item.code;
  }
  if (kind === 'bus') return serviceEndsText(item);
  if (kind === 'nav') return 'By bus and train';
  if (kind === 'place') return item.label;
  if (kind === 'search') return item.sub;
  if (kind === 'trip') return `${TripHistory.day(item.startedAt)} · ${item.legs.map((l) => (l.kind === 'bus' ? `Bus ${l.route}` : l.route)).join(', ')}`;
  if (kind === 'routine') return `${syncDays(item.days)} · ${item.buses.length ? `Bus ${item.buses.join(', ')}` : 'Every bus'}`;
  if (kind === 'lastbus') return item.code;
  // Enough of the link to tell which, not the private part.
  if (kind === 'calendar') return item.url.replace(/^(\w+:\/\/[^/]+).*$/, '$1/…');
  if (kind === 'setting') return SYNC_SETTINGS[item.field].text(item.value);
  return `${item.start} → ${item.end}`;
}

function renderSyncList() {
  if (sync.status !== 'connected') return;
  const importing = sync.tab === 'import';
  $$('#syncTabs [data-sync-tab]').forEach((tab) => {
    const on = tab.dataset.syncTab === sync.tab;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
  });
  $('#syncListNote').textContent = importing
    ? `${sync.role === 'bot' ? 'The Telegram bot’s' : 'The other device’s'} favourites, places and more. Tick the ones to add to this device.`
    : `This device’s favourites, places and more${sync.role === 'bot' ? ' that the bot keeps' : ''}. Tick the ones to add to ${otherSide()}.`;

  const source = syncSource();
  const picked = sync.picked[sync.tab];
  if (!source || !sync.theirs) {
    picked.clear();
    $('#syncList').innerHTML = `<div class="empty">Waiting for ${otherSide()}…</div>`;
    renderSyncPicks();
    return;
  }

  const available = new Set(syncAvailable().map((f) => f.key));
  // A pick the other end has since saved some other way isn't on offer any more.
  for (const key of picked) if (!available.has(key)) picked.delete(key);

  const listed = syncListed();
  // Back to everything when the kind on show has nothing left in this tab.
  if (sync.cat[sync.tab] !== 'all' && !listed.some((f) => f.kind === sync.cat[sync.tab])) sync.cat[sync.tab] = 'all';
  const all = sync.cat[sync.tab] === 'all';
  const items = listed.filter(inShownCat);
  const row = ({ key, kind, item }) => {
    const done = !available.has(key);
    const sub = favSubtitle(kind, item);
    return `<label class="syncItem${done ? ' done' : ''}">` +
      `<input type="checkbox" data-sync-key="${escapeHtml(key)}"${done ? ' disabled' : picked.has(key) ? ' checked' : ''}>` +
      `<span class="syncItemText">` +
      `<span class="name">${escapeHtml(favTitle(kind, item))}</span>` +
      (sub ? `<span class="sub">${escapeHtml(sub)}</span>` : '') +
      `</span>` +
      (done ? `<span class="syncTag">${importing ? 'Already here' : 'Already there'}</span>` : '') +
      `</label>`;
  };

  // Each kind under its heading when they're all on show; one kind needs none.
  $('#syncList').innerHTML = FAV_KINDS.map(({ kind, label }) => {
    const rows = items.filter((f) => f.kind === kind);
    return rows.length ? `${all ? `<div class="favGroupLabel">${label}</div>` : ''}${rows.map(row).join('')}` : '';
  }).join('') || `<div class="empty">${importing ? `${OtherSide()} has` : 'This device has'} nothing to share yet.</div>`;

  renderSyncPicks();
}

// A button per kind in the tab, with how many of it are on offer: highlighted with some of it
// ticked. Only with more than one kind to choose between.
function renderSyncCats() {
  const listed = syncListed();
  const kinds = FAV_KINDS.filter(({ kind }) => listed.some((f) => f.kind === kind));
  const box = $('#syncCats');
  box.hidden = kinds.length < 2;
  if (box.hidden) { box.innerHTML = ''; return; }
  const available = syncAvailable();
  const picked = sync.picked[sync.tab];
  const button = (cat, label, offered) => {
    const on = sync.cat[sync.tab] === cat;
    const some = offered.some((f) => picked.has(f.key));
    return `<button type="button" class="tab${on ? ' active' : ''}${some ? ' picked' : ''}" data-sync-cat="${cat}" aria-pressed="${on}">` +
      `${escapeHtml(label)}<span class="syncCatCount">${offered.length}</span></button>`;
  };
  box.innerHTML = button('all', 'All', available) +
    kinds.map(({ kind, label }) => button(kind, label, available.filter((f) => f.kind === kind))).join('');
}

// The Select all box, the kinds' buttons and the button under the list, which follow the
// ticks without redrawing the list. Select all is for the kind on show.
function renderSyncPicks() {
  const importing = sync.tab === 'import';
  const n = sync.picked[sync.tab].size;
  const shown = shownAvailable();
  const ticked = shown.filter((f) => sync.picked[sync.tab].has(f.key)).length;
  const cat = FAV_KINDS.find((k) => k.kind === sync.cat[sync.tab]);

  renderSyncCats();
  const all = $('#syncAll');
  all.disabled = !shown.length;
  all.checked = shown.length > 0 && ticked === shown.length;
  all.indeterminate = ticked > 0 && ticked < shown.length;
  $('#syncAllLabel').textContent = cat ? `Select all: ${cat.label}` : 'Select all';

  const go = $('#syncGo');
  go.disabled = !n;
  go.textContent = !n
    ? (importing ? 'Tick what to import' : 'Tick what to send')
    : importing
      ? `Import ${plural(n, 'thing')} to this device`
      : `Send ${plural(n, 'thing')} to ${otherSide()}`;
}
