// SG Bus Timings for Windows and Linux: the site at sgbus.uwuapps.org in a window of its own,
// so the site's updates reach it at once, as with the Android app (android/). What it adds:
//
// - a tray icon: closing the window keeps the app running there, so Service Alerts still
//   come as desktop notifications (main-site/js/alerts.js checks for them every minute while
//   it runs, as Electron has no Web Push, and hands them here through preload.js);
// - starting when you sign in, from the tray's menu, quietly into the tray;
// - links to anywhere but the site opening in your own browser.
//
// The page talks to this only through preload.js's window.sgbusDesktop, and only from the
// site's own origin. Nothing here holds a key or a secret.

const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, session, shell, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SITE = 'https://sgbus.uwuapps.org';
const ORIGIN = new URL(SITE).origin;
const APP_ID = 'org.uwuapps.sgbus';
// Permissions the site may have: your location (Stops near me, Navigate, the live map) and
// notifications. Anything else it asks for is refused.
const ALLOWED = new Set(['geolocation', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);

let win = null;
let tray = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

// ---------- settings: where the window was, and the tray hint shown once ----------

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(changes) {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...changes }));
  } catch {
    // Not kept: the window opens at its usual size next time.
  }
}

// ---------- the window ----------

const isSite = (url) => {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
};

function createWindow() {
  const { bounds } = readSettings();
  win = new BrowserWindow({
    width: bounds?.width || 480,
    height: bounds?.height || 880,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 360,
    minHeight: 520,
    show: false,
    title: 'SG Bus Timings',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#ccffcc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Hidden in the tray, the page's timers still run, so Service Alerts are still checked.
      backgroundThrottling: false,
      additionalArguments: [`--sgbus-version=${app.getVersion()}`],
    },
  });
  win.removeMenu();
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} SGBusTimingsDesktop/${app.getVersion()}`);

  win.loadURL(SITE);
  // Can't reach the site, and there's no copy of it kept yet (the first launch offline).
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isSite(url)) win.loadFile(path.join(__dirname, 'offline.html'));
  });

  win.once('ready-to-show', () => {
    if (!startHidden) win.show();
  });

  // The site's own pages stay here; everything else opens in your browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSite(url)) {
      win.loadURL(url);
    } else if (/^https?:|^mailto:/.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isSite(url) || url.startsWith('file:')) return;
    e.preventDefault();
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
  });

  // Back and reload, as a browser has them.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (input.key === 'F5' || (ctrl && input.key.toLowerCase() === 'r')) {
      win.webContents.reload();
      e.preventDefault();
    } else if (input.alt && input.key === 'ArrowLeft' && win.webContents.navigationHistory.canGoBack()) {
      win.webContents.navigationHistory.goBack();
      e.preventDefault();
    }
  });

  // Closing puts it in the tray; Quit, from the tray, closes it.
  win.on('close', (e) => {
    writeSettings({ bounds: win.getNormalBounds() });
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!readSettings().trayHintShown && Notification.isSupported()) {
      new Notification({
        title: 'SG Bus Timings is still running',
        body: 'It keeps checking for Service Alerts from the tray. Quit it from the tray icon.',
        icon: path.join(__dirname, 'build', 'icon.png'),
      }).show();
      writeSettings({ trayHintShown: true });
    }
  });
}

function showWindow(hash) {
  if (!win) return;
  if (hash) {
    const url = new URL(win.webContents.getURL() || SITE);
    if (url.origin === ORIGIN) win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => {});
    else win.loadURL(`${SITE}/${hash}`);
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---------- starting when you sign in ----------

// Windows keeps it in its own startup list. Linux desktops read ~/.config/autostart.
const autostartFile = () => path.join(app.getPath('home'), '.config', 'autostart', 'sgbus-timings.desktop');

function startsAtLogin() {
  if (process.platform === 'linux') return fs.existsSync(autostartFile());
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}

function setStartAtLogin(on) {
  if (process.platform === 'linux') {
    if (!on) return fs.rmSync(autostartFile(), { force: true });
    // An AppImage runs from a temporary mount, so it's started by the file itself.
    const exec = process.env.APPIMAGE || process.execPath;
    fs.mkdirSync(path.dirname(autostartFile()), { recursive: true });
    fs.writeFileSync(autostartFile(), [
      '[Desktop Entry]', 'Type=Application', 'Name=SG Bus Timings',
      `Exec="${exec}" --hidden`, 'X-GNOME-Autostart-enabled=true', '',
    ].join('\n'));
    return;
  }
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
}

// ---------- the tray ----------

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('SG Bus Timings');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open SG Bus Timings', click: () => showWindow() },
    { label: 'Service alerts', click: () => showWindow('#alerts') },
    { label: 'Navigate', click: () => showWindow('#nav') },
    { type: 'separator' },
    {
      label: 'Start when I sign in',
      type: 'checkbox',
      checked: startsAtLogin(),
      click: (item) => setStartAtLogin(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  // Linux trays show the menu on any click; refreshed so the checkbox is right.
  tray.on('right-click', () => tray.setContextMenu(menu()));
}

// ---------- from the page (preload.js) ----------

ipcMain.on('notify', (e, n) => {
  if (!isSite(e.senderFrame?.url || '') || !n || typeof n !== 'object' || !Notification.isSupported()) return;
  const title = String(n.title || 'SG Bus Timings').slice(0, 120);
  const body = String(n.body || '').slice(0, 500);
  const hash = typeof n.url === 'string' && /^\/?#[\w/.,~-]*$/.test(n.url) ? n.url.replace(/^\//, '') : null;
  const note = new Notification({ title, body, icon: path.join(__dirname, 'build', 'icon.png') });
  note.on('click', () => showWindow(hash));
  note.show();
});

// ---------- start ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Opened again (from a shortcut, or at sign-in while running): the window that's there.
  app.on('second-instance', () => showWindow());
  app.setAppUserModelId(APP_ID);
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => {
      done(ALLOWED.has(permission) && isSite(details.requestingUrl || wc.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => ALLOWED.has(permission) && origin === ORIGIN);
    createWindow();
    createTray();
  });
  app.on('before-quit', () => { quitting = true; });
  // Kept running in the tray with every window closed.
  app.on('window-all-closed', () => {});
}
