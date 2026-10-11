// The desktop app's Bus timings widgets: each a small frameless window of its own on the
// desktop, showing the next buses at a stop you pick (main-site/widget.html), resizable any
// way, kept on top if you like. The same widget as the Windows 11 Widgets board's and the
// Android app's; a Windows app outside the Microsoft Store can't add to the Widgets board
// itself, so its widgets live on the desktop instead.
//
// Added from the tray's menu. Each one's stop, size and place are kept in settings.json and
// it's opened again where it was when the app starts. Closing one with its × removes it;
// quitting the app keeps them all.

const { BrowserWindow, ipcMain } = require('electron');
const crypto = require('node:crypto');
const path = require('node:path');

let ctx = null; // { site, isSite, readSettings, writeSettings, isQuitting, showWindow, version }
const open = new Map(); // widget id -> its window

const list = () => ctx.readSettings().widgets || [];
function update(id, changes) {
  const widgets = list();
  const i = widgets.findIndex((w) => w.id === id);
  if (i === -1) return;
  widgets[i] = { ...widgets[i], ...changes };
  ctx.writeSettings({ widgets });
}
function remove(id) {
  ctx.writeSettings({ widgets: list().filter((w) => w.id !== id) });
}

function idOf(sender) {
  for (const [id, win] of open) if (!win.isDestroyed() && win.webContents === sender) return id;
  return null;
}

function openWidget(w) {
  const win = new BrowserWindow({
    width: w.bounds?.width || 320,
    height: w.bounds?.height || 300,
    x: w.bounds?.x,
    y: w.bounds?.y,
    minWidth: 200,
    minHeight: 110,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: !!w.onTop,
    title: 'Bus timings',
    backgroundColor: '#151b18',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--sgbus-version=${ctx.version}`, `--sgbus-widget=${w.id}`],
    },
  });
  win.removeMenu();
  win.loadURL(`${ctx.site}/widget.html?id=${encodeURIComponent(w.id)}`);
  // Only the widget page: anything else it links to opens in the app's window or the browser.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Where it is and how big, kept as it's moved or resized.
  let saveTimer = null;
  const keep = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => !win.isDestroyed() && update(w.id, { bounds: win.getBounds() }), 500);
  };
  win.on('move', keep);
  win.on('resize', keep);
  // Closed with its × (or Alt+F4): gone. Closed by quitting the app: kept for next time.
  win.on('close', () => {
    if (!ctx.isQuitting()) remove(w.id);
  });
  win.on('closed', () => open.delete(w.id));
  open.set(w.id, win);
  return win;
}

function add() {
  const w = { id: crypto.randomUUID(), code: null, buses: [], name: '', onTop: false };
  ctx.writeSettings({ widgets: [...list(), w] });
  openWidget(w).focus();
}

function restore() {
  for (const w of list()) if (!open.has(w.id)) openWidget(w);
}

function init(context) {
  ctx = context;

  ipcMain.handle('widget-get', (e) => {
    const id = idOf(e.sender);
    return id ? list().find((w) => w.id === id) || null : null;
  });
  ipcMain.handle('widget-save', (e, config) => {
    const id = idOf(e.sender);
    if (!id || !config || !/^\d{5}$/.test(config.code || '')) return false;
    const buses = Array.isArray(config.buses) ? config.buses.filter((b) => /^[0-9A-Z]{1,4}$/.test(b)).slice(0, 20) : [];
    update(id, { code: config.code, name: String(config.name || '').slice(0, 80), buses });
    return true;
  });
  ipcMain.handle('widget-on-top', (e, on) => {
    const id = idOf(e.sender);
    if (!id) return false;
    open.get(id).setAlwaysOnTop(!!on);
    update(id, { onTop: !!on });
    return !!on;
  });
  ipcMain.on('widget-close', (e) => {
    const id = idOf(e.sender);
    if (id) open.get(id).close();
  });
}

module.exports = { init, add, restore, count: () => list().length };
