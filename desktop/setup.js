// Make it yours (setup.html): the app's first window, once, for a new install and for anyone
// updating to the first version with it, and from the tray's menu after that. Language, starting
// when you sign in, following the system's light or dark or a theme of your own, and the brand colour.
//
// All but starting when you sign in are the site's own settings, in its own storage, so they're
// read from the page and set by its own functions: js/i18n.js, js/theme.js, the rules for GTA VI
// included (js/gta6.js). Kept in settings.json as pendingLook until the page has them, so a first
// launch offline gets them once the site's there. Closing the window is as good as an answer, and
// changes nothing. Keys: setupDone, pendingLook.

const path = require('node:path');
const { BrowserWindow, ipcMain, nativeTheme } = require('electron');

const LANGS = ['auto', 'en', 'zh-SG', 'ms', 'ta'];
const MODES = ['light', 'dark', 'time', 'phone'];
// How long the window waits for the site before showing what's kept, a slow start or none.
const PAGE_WAIT_MS = 5000;
// The brand colours, for when the site can't be asked: offline, on a first launch.
const COLORS = [
  { id: 'classic', label: 'Classic', hex: '#ccffcc' },
  { id: 'not-green-1', label: 'Not green 1', hex: '#ffcccc' },
  { id: 'not-green-2', label: 'Not green 2', hex: '#ccccff' },
  { id: 'not-green-3', label: 'Not green 3', hex: '#ffffcc' },
  { id: 'not-green-4', label: 'Not green 4', hex: '#ffccff' },
  { id: 'not-green-5', label: 'Not green 5', hex: '#ccffff' },
  { id: 'really-light-green', label: 'Really really light green', hex: '#ffffff' },
  { id: 'gta-6', label: 'GTA VI', hex: '#ff2b90', dot: 'linear-gradient(#2b60da, #ff2b90, #e6953e)' },
];

const READ = `(() => {
  const yours = document.documentElement.hasAttribute('data-custom-colours');
  return {
    lang: I18n.chosen() || 'auto',
    mode: getModePreference(),
    color: getStoredColorTheme(),
    yours,
    colors: COLOR_THEMES.map((c) => ({
      id: c.id, label: c.label, hex: c.hex, dot: c.dot,
      locked: c.id === window.Gta6?.THEME && !Gta6.canPick(),
    })),
  };
})()`;

// The site's own functions, the language last, as a new language opens the page again. A brand
// colour would paint over Your colours, which stand in front of it.
const apply = ({ lang, mode, color }) => `(() => {
  applyMode(${JSON.stringify(mode)});
  if (!document.documentElement.hasAttribute('data-custom-colours')) applyColorTheme(${JSON.stringify(color)});
  window.refreshThemeModal?.();
  const lang = ${JSON.stringify(lang)};
  if (lang === 'auto') I18n.unset();
  else I18n.set(lang);
})()`;

let deps = null;
let win = null;
let after = null;

function init(given) {
  deps = given;
}

const due = () => !deps.readSettings().setupDone;

const fromSetup = (e) => win && !win.isDestroyed() && e.sender === win.webContents;

// The site's page, once it's loaded and if it's the site, not the offline page.
async function sitePage() {
  const page = deps.page();
  if (!page || page.isDestroyed()) return null;
  if (page.isLoading()) {
    await new Promise((done) => {
      const timer = setTimeout(done, PAGE_WAIT_MS);
      page.once('did-stop-loading', () => { clearTimeout(timer); done(); });
    });
  }
  return !page.isDestroyed() && !page.isLoading() && deps.isSite(page.getURL()) ? page : null;
}

// What's picked and not yet on the page goes there. main.js runs this as each page of the site loads.
async function applyPending() {
  const { pendingLook } = deps.readSettings();
  if (!pendingLook) return;
  const page = deps.page();
  if (!page || page.isDestroyed() || page.isLoading() || !deps.isSite(page.getURL())) return;
  deps.writeSettings({ pendingLook: null });
  try {
    await page.executeJavaScript(apply(pendingLook));
  } catch (err) {
    // An old copy of the site, kept offline: it gets another go when the page next loads.
    deps.writeSettings({ pendingLook });
    console.warn('make it yours not applied:', err?.message || err);
  }
}

// `then` runs once the window's gone, however it went.
function open(then) {
  if (win && !win.isDestroyed()) {
    win.focus();
    return;
  }
  after = then || null;
  win = new BrowserWindow({
    width: 940,
    height: 660,
    minWidth: 620,
    minHeight: 560,
    show: false,
    title: 'Welcome to SG Bus Timings',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171c19' : '#f4f7f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'setup-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  // It shows its own page and nothing else.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
    deps.writeSettings({ setupDone: true });
    const go = after;
    after = null;
    if (go) go();
  });
  win.loadFile(path.join(__dirname, 'setup.html'));
}

ipcMain.handle('setup-get', async (e) => {
  if (!fromSetup(e)) return null;
  const base = { start: deps.startsAtLogin(), colors: COLORS.filter((c) => c.id !== 'gta-6' || Date.now() < Date.UTC(2026, 10, 25, 16)) };
  const page = await sitePage();
  if (!page) return base;
  try {
    return { ...base, ...(await page.executeJavaScript(READ)) };
  } catch {
    return base;
  }
});

ipcMain.handle('setup-finish', async (e, picked) => {
  if (!fromSetup(e) || !picked || typeof picked !== 'object') return false;
  const look = {
    lang: LANGS.includes(picked.lang) ? picked.lang : 'auto',
    mode: MODES.includes(picked.mode) ? picked.mode : 'light',
    color: /^[a-z0-9-]{1,30}$/.test(picked.color || '') ? picked.color : 'classic',
  };
  if (typeof picked.start === 'boolean' && picked.start !== deps.startsAtLogin()) deps.setStartAtLogin(picked.start);
  deps.writeSettings({ pendingLook: look, loginChosen: true, setupDone: true });
  deps.refreshTrayMenu();
  win.close();
  await applyPending();
  return true;
});

module.exports = { init, due, open, applyPending };
