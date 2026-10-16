// Bus times at a glance, outside the window (2.1.0):
//
// - The tray countdown: a stop picked from its timings (the page's "Tray countdown", through
//   preload.js), and a bus there if one's picked. Its next buses are fetched every
//   REFRESH_MS and shown in the tray icon's tooltip on Windows and Linux, as text beside the
//   icon in the macOS menu bar, and on macOS as the next bus's minutes on the Dock icon.
//   The tray's menu says which stop it is, and stops it.
// - Your favourite stops, from the page (script.js shareFavsWithWidgets): on Windows, in the
//   taskbar icon's Jump List (right-click), and on macOS, in the Dock icon's menu; each opens
//   that stop's timings. Windows' taskbar thumbnail also gets Refresh, and the previous and
//   next favourite, without bringing the window forward.
//
// The page's requests are checked in main.js to come from the site itself.

const { Menu, app, nativeImage } = require('electron');

const REFRESH_MS = 30 * 1000;
// Windows cuts a tray tooltip off at 127 characters.
const TIP_MAX = 127;

let ctx = null; // { site, tray, win, page, readSettings, writeSettings, showWindow, refreshMenu }
let timer = null;
let favourites = [];
let favAt = -1; // the favourite the thumbnail's buttons last went to
let lastTip = null;

const mac = process.platform === 'darwin';
const windows = process.platform === 'win32';

const stop = () => ctx.readSettings().trayStop || null;

function init(context) {
  ctx = context;
  favourites = ctx.readSettings().favourites || [];
  applyFavourites();
  restart();
}

// ---------- the tray countdown ----------

function setStop(s) {
  const clean = s && /^\d{5}$/.test(String(s.code))
    ? { code: String(s.code), name: String(s.name || '').slice(0, 60), service: s.service ? String(s.service).toUpperCase().slice(0, 5) : null }
    : null;
  ctx.writeSettings({ trayStop: clean });
  restart();
  ctx.refreshMenu();
  return clean;
}

function restart() {
  clearInterval(timer);
  timer = null;
  if (!stop()) return clear();
  update();
  timer = setInterval(update, REFRESH_MS);
}

function clear() {
  const tray = ctx.tray();
  if (tray) {
    tray.setToolTip('SG Bus Timings');
    if (mac) tray.setTitle('');
  }
  if (mac) app.dock?.setBadge('');
  lastTip = null;
}

const minutes = (bus) => (bus && bus.eta_ms != null ? Math.max(0, Math.floor(bus.eta_ms / 60000)) : null);
const say = (m) => (m === 0 ? 'Arr' : `${m} min`);

async function update() {
  const s = stop();
  const tray = ctx.tray();
  if (!s || !tray) return;
  let services;
  try {
    const qs = new URLSearchParams({ stop: s.code });
    if (s.service) qs.set('service', s.service);
    const res = await fetch(`${ctx.site}/api/bus-arrivals?${qs}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    services = (await res.json()).services || [];
  } catch {
    tray.setToolTip(`${s.name || s.code}: couldn't get the timings just now`.slice(0, TIP_MAX));
    return;
  }
  if (s.service) services = services.filter((x) => String(x.serviceNo).toUpperCase() === s.service);
  const rows = services
    .map((x) => ({ no: x.serviceNo, next: minutes(x.next), then: minutes(x.next2) }))
    .filter((r) => r.next != null)
    .sort((a, b) => a.next - b.next);
  const first = rows[0];
  const lines = rows.map((r) => `${r.no}: ${say(r.next)}${r.then != null ? `, ${say(r.then)}` : ''}`);
  const tip = [s.name || s.code, ...(lines.length ? lines : ['No buses due right now'])].join('\n');
  tray.setToolTip(tip.length > TIP_MAX ? `${tip.slice(0, TIP_MAX - 1)}…` : tip);
  if (mac) {
    tray.setTitle(first ? ` ${first.no} · ${say(first.next)}` : '');
    app.dock?.setBadge(first ? (first.next === 0 ? 'Arr' : String(first.next)) : '');
  }
  lastTip = tip;
}

// The tray menu's lines about it (main.js createTray).
function menuItems() {
  const s = stop();
  if (!s) return [];
  return [
    { label: `Tray countdown: ${s.service ? `${s.service} at ` : ''}${s.name || s.code}`, click: () => ctx.showWindow(`#${s.code}${s.service ? `,${s.service}` : ''}`) },
    { label: 'Stop the tray countdown', click: () => setStop(null) },
    { type: 'separator' },
  ];
}

// ---------- favourites: the Jump List, the Dock menu, the thumbnail's buttons ----------

function setFavourites(list) {
  favourites = (Array.isArray(list) ? list : [])
    .filter((f) => f && /^\d{5}$/.test(String(f.code)))
    .slice(0, 10)
    .map((f) => ({ code: String(f.code), name: String(f.name || '').slice(0, 60) }));
  ctx.writeSettings({ favourites });
  applyFavourites();
}

const label = (f) => (f.name ? `${f.name} (${f.code})` : `Stop ${f.code}`);

function applyFavourites() {
  if (windows) {
    // Each a uwu://sgbus/ link to the app itself, which second-instance opens in the window.
    // Only from an installed app: run from source, there's no program to point them at.
    if (app.isPackaged) {
      app.setUserTasks(favourites.map((f) => ({
        program: process.execPath,
        arguments: `uwu://sgbus/${f.code}`,
        iconPath: process.execPath,
        iconIndex: 0,
        title: label(f),
        description: `Bus timings at ${label(f)}`,
      })));
    }
    thumbButtons();
  }
  if (mac && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate(favourites.length
      ? favourites.map((f) => ({ label: label(f), click: () => ctx.showWindow(`#${f.code}`) }))
      : [{ label: 'Star a stop to see it here', enabled: false }]));
  }
}

// 16 px icons for the thumbnail's buttons, drawn here: Windows wants pictures, and these are
// simple enough not to need files. White, as the thumbnail's toolbar is dark.
function glyph(draw) {
  const size = 16;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!draw(x + 0.5, y + 0.5)) continue;
      const i = (y * size + x) * 4;
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255; // BGRA
    }
  }
  return nativeImage.createFromBitmap(px, { width: size, height: size });
}
const ICONS = {};
function icons() {
  if (ICONS.prev) return ICONS;
  // ◀ and ▶
  ICONS.prev = glyph((x, y) => x >= 4 && x <= 12 && Math.abs(y - 8) <= (x - 4) * 0.75);
  ICONS.next = glyph((x, y) => x >= 4 && x <= 12 && Math.abs(y - 8) <= (12 - x) * 0.75);
  // A ring with a gap at its top right and an arrowhead there: refresh.
  ICONS.refresh = glyph((x, y) => {
    const dx = x - 8, dy = y - 8.5, r = Math.hypot(dx, dy);
    const ring = r >= 4 && r <= 6 && !(dx > 0 && dy < 0 && dx > -dy * 0.3);
    const head = y >= 1.5 && y <= 6 && x >= 9 && x <= 13.5 && x - 9 >= y - 1.5;
    return ring || head;
  });
  return ICONS;
}

function goFavourite(step) {
  if (!favourites.length) return;
  favAt = (favAt + step + favourites.length) % favourites.length;
  ctx.showWindow(`#${favourites[favAt].code}`);
}

function thumbButtons() {
  const win = ctx.win();
  if (!win || win.isDestroyed()) return;
  const i = icons();
  const many = favourites.length > 1;
  win.setThumbarButtons([
    { tooltip: 'Previous favourite stop', icon: i.prev, flags: many ? [] : ['disabled'], click: () => goFavourite(-1) },
    { tooltip: 'Refresh', icon: i.refresh, click: () => ctx.page()?.executeJavaScript('typeof refreshStop === "function" && refreshStop()').catch(() => {}) },
    { tooltip: 'Next favourite stop', icon: i.next, flags: many ? [] : ['disabled'], click: () => goFavourite(1) },
  ]);
}

// The window's been shown (thumbnail buttons only take once it's on the taskbar).
function windowShown() {
  if (ctx && windows) thumbButtons();
}

module.exports = { init, setStop, stop, setFavourites, menuItems, windowShown, lastTip: () => lastTip };
