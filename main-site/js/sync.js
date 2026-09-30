// Syncing favourites with another device, from the Settings modal.
//
// One device shows a code (with a link and a QR code of it) and the other enters it. PeerJS's
// public broker introduces the two, then favourites go straight from one to the other over a
// WebRTC data channel, STUN only (js/p2p.js; STUN-p2p-spec.md in the repo root says why). So
// both have to be on the same network, or one on the other's hotspot.
//
// Once connected, each device sees the other's favourites and ticks which to import, or which
// of its own to send over, or all of them. Copying only ever adds: nothing on either device is
// removed or replaced. Closing Settings ends the session.
//
// Loaded before script.js and uses its helpers ($, LS, nameOf, ...), so nothing here runs until
// script.js calls initSync().
//
// The wire, on top of p2p.js's hello and bye:
//   { type: 'favs', favs }        either way: all of the sender's favourites, on connecting
//                                 (the host in answer to hello) and whenever they change
//   { type: 'add', id, favs }     either way: add these to yours
//   { type: 'added', id, count }  the answer to add, with how many were new there

const SYNC_HOST_KEY = 'sgbus_sync_host_code';
const SYNC_LAST_KEY = 'sgbus_sync_last_code';

// More than anybody saves, and it keeps one message to tens of kilobytes.
const SYNC_MAX_ITEMS = 500;

// How long a device has to answer an `add` before this one says it heard nothing.
const SYNC_ACK_MS = 5000;

const FAV_KINDS = [
  { kind: 'stop',  list: 'stops',  label: 'Bus stops', key: (s) => `stop:${s.code}` },
  { kind: 'bus',   list: 'buses',  label: 'Buses',     key: (b) => `bus:${b}` },
  { kind: 'route', list: 'routes', label: 'Routes',    key: (r) => `route:${r.start}>${r.end}` },
];

const sync = {
  role: null,        // 'host' | 'guest' while a session runs
  conn: null,        // its P2P.Host or P2P.Guest
  status: 'idle',
  theirs: null,      // the other device's favourites, once they've arrived
  tab: 'import',
  picked: { import: new Set(), export: new Set() },
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
  $('#syncAll').addEventListener('change', (e) => {
    const picked = sync.picked[sync.tab];
    picked.clear();
    if (e.target.checked) for (const { key } of syncAvailable()) picked.add(key);
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
  showSyncStatus('Tap Connect to sync favourites with the device showing this code.', 'busy');
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

function ownFavs() {
  return { stops: LS.getFavs(), buses: LS.getFavBuses(), routes: LS.getFavRoutes() };
}

// Every favourite as one flat list, each with a key that names it the same way on both devices.
function favItems(favs) {
  return FAV_KINDS.flatMap(({ kind, list, key }) => favs[list].map((item) => ({ key: key(item), kind, item })));
}

function pickFavs(favs, keys) {
  return Object.fromEntries(FAV_KINDS.map(({ list, key }) => [list, favs[list].filter((item) => keys.has(key(item)))]));
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

  return {
    stops: list(raw.stops)
      .filter((s) => isStop(s?.code) && once(`stop:${s.code}`))
      .map((s) => ({ code: s.code, name: text(s.name) })),
    buses: list(raw.buses)
      .filter((b) => typeof b === 'string' && /^[0-9A-Z]{1,5}$/.test(b) && once(`bus:${b}`)),
    routes: list(raw.routes)
      .filter((r) => isStop(r?.start) && isStop(r?.end) && once(`route:${r.start}>${r.end}`))
      .map((r) => ({ start: r.start, startName: text(r.startName), end: r.end, endName: text(r.endName) })),
  };
}

// Adds whichever of `favs` this device doesn't have yet, after the ones it has, and says how
// many that was. Names are this device's own where it knows the stop.
function mergeFavs(favs) {
  const have = new Set(favItems(ownFavs()).map((f) => f.key));
  const stops = LS.getFavs();
  const buses = LS.getFavBuses();
  const routes = LS.getFavRoutes();
  let added = 0;

  for (const { key, kind, item } of favItems(favs)) {
    if (have.has(key)) continue;
    have.add(key);
    added++;
    if (kind === 'stop') {
      stops.push({ code: item.code, name: nameOf(item.code) || item.name });
    } else if (kind === 'bus') {
      buses.push(item);
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
    favouritesChanged();
  }
  return added;
}

// ---- Sessions ----

function beginSession(role) {
  sync.role = role;
  sync.status = 'connecting';
  sync.theirs = null;
  sync.droppedCode = '';
  sync.tab = 'import';
  sync.picked.import.clear();
  sync.picked.export.clear();
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
  } else if (was !== 'connected' && sync.role === 'guest') {
    // The host answers p2p.js's hello with its favourites; these are ours for it.
    sendSync({ type: 'favs', favs: ownFavs() });
  }
  renderSync();
  if (status === 'connected' && was !== 'connected') revealSync();
}

function sendSync(message) {
  sync.conn?.send(message);
}

// Everything the other device sends goes through here. Unknown types are ignored, never
// thrown on: the other device may be a version ahead or behind.
function onSyncMessage(message) {
  switch (message.type) {
    case 'hello':
      if (sync.role === 'host') sendSync({ type: 'favs', favs: ownFavs() });
      break;

    case 'favs': {
      const favs = cleanFavs(message.favs);
      if (!favs) break;
      sync.theirs = favs;
      renderSyncList();
      break;
    }

    case 'add': {
      const favs = cleanFavs(message.favs);
      if (!favs || !Number.isInteger(message.id)) break;
      const added = mergeFavs(favs);
      sendSync({ type: 'added', id: message.id, count: added });
      if (added) sendSync({ type: 'favs', favs: ownFavs() });
      showSyncNote(added
        ? `The other device sent ${plural(added, 'favourite')}, now saved here.`
        : 'The other device sent favourites this device already has.');
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
        ? `Sent. The other device saved ${plural(count, 'new favourite')}.`
        : 'Sent. The other device already had all of those.');
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

function syncAvailable() {
  const source = syncSource();
  const dest = sync.tab === 'import' ? ownFavs() : sync.theirs;
  if (!source || !dest) return [];
  const there = new Set(favItems(dest).map((f) => f.key));
  return favItems(source).filter((f) => !there.has(f.key));
}

function copyPicked() {
  const picked = sync.picked[sync.tab];
  if (!picked.size || !syncSource()) return;
  const chosen = pickFavs(syncSource(), picked);
  const count = picked.size;
  picked.clear();

  if (sync.tab === 'import') {
    const added = mergeFavs(chosen);
    if (added) sendSync({ type: 'favs', favs: ownFavs() });
    showSyncNote(`Imported ${plural(added, 'favourite')} to this device.`);
  } else {
    const id = ++sync.lastId;
    sendSync({ type: 'add', id, favs: chosen });
    sync.pending.set(id, setTimeout(() => {
      sync.pending.delete(id);
      showSyncNote('No answer from the other device. Check it still says connected, then try again.', 'error');
    }, SYNC_ACK_MS));
    showSyncNote(`Sending ${plural(count, 'favourite')}…`);
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

  $('#syncStart').hidden = !!role;
  $('#syncHost').hidden = role !== 'host' || connected;
  $('#syncLive').hidden = !connected;
  $('#syncControls').hidden = !role;
  $('#syncNewCode').hidden = role !== 'host';
  $('#syncEnd').textContent = connected ? 'Disconnect' : role === 'host' ? 'Stop' : 'Cancel';

  if (role === 'host' && status === 'waiting') {
    showSyncStatus('Waiting for the other device. In its Settings, enter this code, or scan the QR code with its camera.', 'warn');
  } else if (role && status === 'connecting') {
    showSyncStatus(role === 'host' ? 'Getting the code ready…' : 'Connecting to the other device…', 'busy');
  } else if (connected) {
    showSyncStatus('Connected to the other device.', 'ok');
  }

  renderSyncList();
}

function favTitle(kind, item) {
  if (kind === 'stop') return nameOf(item.code) || item.name || 'Bus stop';
  if (kind === 'bus') return `Bus ${item}`;
  return `${nameOf(item.start) || item.startName || item.start} → ${nameOf(item.end) || item.endName || item.end}`;
}

function favSubtitle(kind, item) {
  if (kind === 'stop') {
    const road = stopsIndex?.[item.code]?.road;
    return road ? `${item.code} · ${road}` : item.code;
  }
  if (kind === 'bus') return serviceEndsText(item);
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
    ? "The other device's favourites. Tick the ones to add to this device."
    : "This device's favourites. Tick the ones to add to the other device.";

  const source = syncSource();
  const picked = sync.picked[sync.tab];
  if (!source || !sync.theirs) {
    picked.clear();
    $('#syncList').innerHTML = `<div class="empty">Waiting for the other device's favourites…</div>`;
    renderSyncPicks();
    return;
  }

  const available = new Set(syncAvailable().map((f) => f.key));
  // A pick the other end has since saved some other way isn't on offer any more.
  for (const key of picked) if (!available.has(key)) picked.delete(key);

  const items = favItems(source);
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

  $('#syncList').innerHTML = FAV_KINDS.map(({ kind, label }) => {
    const rows = items.filter((f) => f.kind === kind);
    return rows.length ? `<div class="favGroupLabel">${label}</div>${rows.map(row).join('')}` : '';
  }).join('') || `<div class="empty">${importing ? 'The other device has' : 'This device has'} no favourites yet.</div>`;

  renderSyncPicks();
}

// The Select all box and the button, which follow the ticks without redrawing the list.
function renderSyncPicks() {
  const importing = sync.tab === 'import';
  const n = sync.picked[sync.tab].size;
  const offered = syncAvailable().length;

  const all = $('#syncAll');
  all.disabled = !offered;
  all.checked = offered > 0 && n === offered;
  all.indeterminate = n > 0 && n < offered;

  const go = $('#syncGo');
  go.disabled = !n;
  go.textContent = !n
    ? (importing ? 'Tick favourites to import' : 'Tick favourites to send')
    : importing
      ? `Import ${plural(n, 'favourite')} to this device`
      : `Send ${plural(n, 'favourite')} to the other device`;
}
