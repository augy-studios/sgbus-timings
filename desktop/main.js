// SG Bus Timings for Windows, macOS and Linux: the site at sgbus.uwuapps.org in a window of its own,
// so the site's updates reach it at once, as with the Android app (android/). What it adds:
//
// - a tray icon (the menu bar on macOS): closing the window keeps the app running there, so Service Alerts still
//   come as desktop notifications (main-site/js/alerts.js checks for them every minute while
//   it runs, as Electron has no Web Push, and hands them here through preload.js);
// - starting when you sign in, from the tray's menu, quietly into the tray;
// - its own title bar: back, forward, reload, the page's address, which copies the link
//   when clicked, and a screenshot button (titlebar.html);
// - links to anywhere but the site opening in your own browser;
// - uwu://sgbus/ links opening it, as they open the Android app (see fromAppLink);
// - checking for its own updates (updater.js);
// - Bus timings widgets on the desktop (widgets.js).
//
// The page talks to this only through preload.js's window.sgbusDesktop, and only from the
// site's own origin. Nothing here holds a key or a secret.

const {
  app, BrowserWindow, WebContentsView, ClipboardItem, Menu, Notification, Tray, clipboard, nativeImage, session, shell,
  ipcMain,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const updater = require('./updater');
const widgets = require('./widgets');

const SITE = 'https://sgbus.uwuapps.org';
const ORIGIN = new URL(SITE).origin;
const APP_ID = 'org.uwuapps.sgbus';
// Permissions the site may have: your location (Stops near me, Navigate, the live map) and
// notifications. Anything else it asks for is refused.
const ALLOWED = new Set(['geolocation', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);

let win = null; // the window, its own webContents the title bar (titlebar.html)
let page = null; // the site's webContents, in a view below the title bar
let tray = null;
let quitting = false;
// uwu://sgbus/ links. Windows, macOS and Linux give a scheme to one app only, unlike Android,
// which shares uwu:// out by host, so this answers every uwu:// link and opens only sgbus's.
const SCHEME = 'uwu';
const LINK_HOST = 'sgbus';
const linkIn = (argv) => argv.find((a) => a.toLowerCase().startsWith(`${SCHEME}://`)) || null;
// Windows and Linux pass it in argv; macOS sends it as open-url (at the end of this file).
let startLink = linkIn(process.argv);


// uwu://sgbus/ links, to the page they name, as MainActivity.fromAppLink does in the Android
// app: the site's short links by their path (uwu://sgbus/go/k3v9q2x7ma), anything else as
// the site's # address (uwu://sgbus/84009 for a stop, uwu://sgbus/bus/22, uwu://sgbus/nav,
// uwu://sgbus/map/84009), and uwu://sgbus/ alone to the home page. Null for another host,
// or anything that isn't a plain address.
function fromAppLink(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:` || url.hostname.toLowerCase() !== LINK_HOST) return null;
  const rest = url.pathname.replace(/^\/+|\/+$/g, '');
  if (!/^[\w\-./,~%]*$/.test(rest)) return null;
  if (!rest) return `${SITE}/`;
  if (/^(go|trip|eta)\/[a-z0-9]{10}$/.test(rest)) return `${SITE}/${rest}`;
  return `${SITE}/#${rest}`;
}

// A link while the app's open: the page it names, in the window there.
function openLink(link) {
  const target = fromAppLink(link);
  if (!win || !target) return showWindow();
  const hash = target.startsWith(`${SITE}/#`) ? target.slice(SITE.length + 1) : null;
  if (hash && isSite(page.getURL())) showWindow(hash);
  else {
    page.loadURL(target);
    showWindow();
  }
}

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

// The title bar's height, and its colour until the site says its own (its theme-color).
const BAR_HEIGHT = 40;
const BAR_COLOR = '#ccffcc';
const mac = process.platform === 'darwin';

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
    backgroundColor: BAR_COLOR,
    autoHideMenuBar: true,
    // The system's own title bar goes; titlebar.html is drawn there instead, around the
    // window's controls: macOS keeps its traffic lights, and Windows and Linux draw minimise,
    // maximise and close over the bar's right (titleBarOverlay).
    titleBarStyle: 'hidden',
    ...(mac
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: BAR_COLOR, symbolColor: '#0c100e', height: BAR_HEIGHT } }),
    webPreferences: {
      preload: path.join(__dirname, 'titlebar-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'titlebar.html'));
  // The window keeps its own name, not the title bar page's or the site's.
  win.on('page-title-updated', (e) => e.preventDefault());

  const view = new WebContentsView({
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
  view.setBackgroundColor(BAR_COLOR);
  win.contentView.addChildView(view);
  page = view.webContents;
  page.setUserAgent(`${page.getUserAgent()} SGBusTimingsDesktop/${app.getVersion()}`);

  // The site fills the window below the title bar; all of it while it's full screen (a video,
  // say), when the bar hides.
  let pageFullScreen = false;
  const layout = () => {
    const [width, height] = win.getContentSize();
    const top = pageFullScreen ? 0 : BAR_HEIGHT;
    view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
  };
  layout();
  for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(event, layout);
  page.on('enter-html-full-screen', () => { pageFullScreen = true; layout(); });
  page.on('leave-html-full-screen', () => { pageFullScreen = false; layout(); });

  // What the title bar shows: where the site is, whether it can go back or forward, and the
  // site's colour.
  let color = null;
  const sendState = () => {
    if (win.isDestroyed() || page.isDestroyed()) return;
    const url = shownUrl();
    win.webContents.send('bar-state', {
      url,
      display: url.replace(/^https?:\/\//, '').replace(/^([^/]+)\/$/, '$1'),
      canBack: page.navigationHistory.canGoBack(),
      canForward: page.navigationHistory.canGoForward(),
      loading: page.isLoading(),
      fullscreen: win.isFullScreen(),
      color,
    });
  };
  for (const event of ['did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']) page.on(event, sendState);
  win.webContents.on('did-finish-load', sendState);
  win.on('enter-full-screen', sendState);
  win.on('leave-full-screen', sendState);
  page.on('did-change-theme-color', (_e, c) => {
    if (!/^#[0-9a-f]{6}$/i.test(c || '')) return;
    color = c;
    view.setBackgroundColor(c);
    if (!mac) win.setTitleBarOverlay({ color: c, symbolColor: isDarkColor(c) ? '#f2fff2' : '#0c100e', height: BAR_HEIGHT });
    sendState();
  });

  page.loadURL((startLink && fromAppLink(startLink)) || SITE);
  // Can't reach the site, and there's no copy of it kept yet (the first launch offline).
  page.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isSite(url)) page.loadFile(path.join(__dirname, 'offline.html'));
  });

  win.once('ready-to-show', () => {
    firstShow();
  });
  // Typing goes to the site, not the title bar.
  win.on('focus', () => page.focus());

  // The site's own pages stay here; everything else opens in your browser.
  page.setWindowOpenHandler(({ url }) => {
    if (isSite(url)) {
      page.loadURL(url);
    } else if (/^https?:|^mailto:/.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  page.on('will-navigate', (e, url) => {
    if (isSite(url) || url.startsWith('file:')) return;
    e.preventDefault();
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
  });

  // Back, forward and reload, as a browser has them, from the site or the title bar.
  const keys = (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (input.key === 'F5' || (ctrl && input.key.toLowerCase() === 'r')) {
      page.reload();
      e.preventDefault();
    } else if ((input.alt && input.key === 'ArrowLeft') || (mac && input.meta && input.key === '[')) {
      if (page.navigationHistory.canGoBack()) page.navigationHistory.goBack();
      e.preventDefault();
    } else if ((input.alt && input.key === 'ArrowRight') || (mac && input.meta && input.key === ']')) {
      if (page.navigationHistory.canGoForward()) page.navigationHistory.goForward();
      e.preventDefault();
    }
  };
  page.on('before-input-event', keys);
  win.webContents.on('before-input-event', keys);

  // Closing puts it in the tray; Quit, from the tray, closes it.
  win.on('close', (e) => {
    writeSettings({ bounds: win.getNormalBounds(), maximized: win.isMaximized() });
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!readSettings().trayHintShown && Notification.isSupported()) {
      new Notification({
        title: 'SG Bus Timings is still running',
        body: mac
          ? 'It keeps checking for Service Alerts from the menu bar. Quit it from the menu bar icon, or with ⌘Q.'
          : 'It keeps checking for Service Alerts from the tray. Quit it from the tray icon.',
        icon: path.join(__dirname, 'build', 'icon.png'),
      }).show();
      writeSettings({ trayHintShown: true });
    }
  });
}

// The site's address, for the title bar to show and copy: the site itself while the offline
// page is up.
const shownUrl = () => {
  const url = page?.getURL() || '';
  return /^https?:/.test(url) ? url : `${SITE}/`;
};

// Light writing on the site's colour, or dark? (As titlebar.js decides for the bar.)
function isDarkColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

// The window shows maximised, unless it was last closed un-maximised.
let shown = false;
function firstShow() {
  shown = true;
  if (readSettings().maximized !== false) win.maximize();
  win.show();
}

function showWindow(hash) {
  if (!win) return;
  if (hash) {
    if (isSite(page.getURL())) page.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => {});
    else page.loadURL(`${SITE}/${hash}`);
  }
  if (win.isMinimized()) win.restore();
  if (!shown) firstShow();
  else win.show();
  win.focus();
}

// ---------- starting when you sign in ----------

// Windows keeps it in its own startup list. Linux desktops read ~/.config/autostart.
const autostartFile = () => path.join(app.getPath('home'), '.config', 'autostart', 'sgbus-timings.desktop');

function startsAtLogin() {
  if (process.platform === 'linux') return fs.existsSync(autostartFile());
  return app.getLoginItemSettings().openAtLogin;
}

function setStartAtLogin(on) {
  if (process.platform === 'linux') {
    if (!on) return fs.rmSync(autostartFile(), { force: true });
    // An AppImage runs from a temporary mount, so it's started by the file itself.
    const exec = process.env.APPIMAGE || process.execPath;
    fs.mkdirSync(path.dirname(autostartFile()), { recursive: true });
    fs.writeFileSync(autostartFile(), [
      '[Desktop Entry]', 'Type=Application', 'Name=SG Bus Timings',
      `Exec="${exec}"`, 'X-GNOME-Autostart-enabled=true', '',
    ].join('\n'));
    return;
  }
  app.setLoginItemSettings({ openAtLogin: on });
}

// ---------- the tray ----------

function createTray() {
  // sgbusnotificon.png, made square at 16px, with tray@2x.png and tray@3x.png beside it, which
  // Electron picks for high-DPI screens itself.
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('SG Bus Timings');
  const menu = () => Menu.buildFromTemplate([
    ...(updater.menuItem() ? [updater.menuItem(), { type: 'separator' }] : []),
    { label: 'Open SG Bus Timings', click: () => showWindow() },
    { label: 'Service alerts', click: () => showWindow('#alerts') },
    { label: 'Navigate', click: () => showWindow('#nav') },
    { label: 'Add a Bus timings widget', click: () => widgets.add() },
    { type: 'separator' },
    {
      label: 'Start when I sign in',
      type: 'checkbox',
      checked: startsAtLogin(),
      click: (item) => {
        setStartAtLogin(item.checked);
        writeSettings({ loginChosen: true });
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  // An update found or downloaded: the menu offers it.
  updater.start(() => tray.setContextMenu(menu()));
  // macOS opens the menu on a click, so only Windows and Linux show and hide the window with it.
  if (process.platform !== 'darwin') tray.on('click', () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  // Linux trays show the menu on any click; refreshed so the checkbox is right.
  tray.on('right-click', () => tray.setContextMenu(menu()));
}

// ---------- from the title bar (titlebar-preload.js) ----------

const fromBar = (e) => win && !win.isDestroyed() && e.sender === win.webContents;
ipcMain.on('bar-back', (e) => {
  if (fromBar(e) && page.navigationHistory.canGoBack()) page.navigationHistory.goBack();
});
ipcMain.on('bar-forward', (e) => {
  if (fromBar(e) && page.navigationHistory.canGoForward()) page.navigationHistory.goForward();
});
ipcMain.on('bar-reload', (e) => {
  if (fromBar(e)) page.reload();
});
// The address can't be typed in: clicking it copies the link.
ipcMain.handle('bar-copy', async (e) => {
  if (!fromBar(e)) return false;
  await clipboard.writeText(shownUrl());
  return true;
});
// The site as it is now, without the title bar: copied, and saved in Pictures/SG Bus Timings,
// where a notification opens it.
ipcMain.handle('bar-screenshot', async (e) => {
  if (!fromBar(e)) return false;
  try {
    const image = await page.capturePage();
    if (image.isEmpty()) return false;
    const png = image.toPNG();
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
    const dir = path.join(app.getPath('pictures'), 'SG Bus Timings');
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}`;
    const file = path.join(dir, `SG Bus Timings ${stamp}.png`);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(file, png);
    if (Notification.isSupported()) {
      const note = new Notification({
        title: 'Screenshot saved',
        body: `It's copied too, and in Pictures > SG Bus Timings. Click to show it.`,
        icon: path.join(__dirname, 'build', 'icon.png'),
      });
      note.on('click', () => shell.showItemInFolder(file));
      note.show();
    }
    return true;
  } catch (err) {
    console.warn('screenshot failed:', err?.message || err);
    return false;
  }
});

// ---------- from the page (preload.js) ----------

// A #address on the site, in the app's window: from a widget's bus, say.
ipcMain.on('open-hash', (e, hash) => {
  if (!isSite(e.senderFrame?.url || '') || typeof hash !== 'string' || !/^#[\w/.,~-]*$/.test(hash)) return;
  showWindow(hash);
});

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
  // Opened again (from a shortcut, at sign-in while running, or by a uwu://sgbus/ link): the
  // window that's there, on the link's page if there's one.
  app.on('second-instance', (_e, argv) => {
    const link = linkIn(argv);
    if (link) openLink(link);
    else showWindow();
  });
  app.setAppUserModelId(APP_ID);
  // macOS: uwu://sgbus/ links come as this, whether the app's running or the link started it.
  app.on('open-url', (e, link) => {
    e.preventDefault();
    if (win) openLink(link);
    else startLink = link;
  });
  // macOS: clicking the Dock icon with the window hidden.
  app.on('activate', () => showWindow());
  // uwu:// links come here. The installers register it too; this keeps it so after an update
  // or a move. Run from source (npm start), Windows has to be told the script as well.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => {
      done(ALLOWED.has(permission) && isSite(details.requestingUrl || wc.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => ALLOWED.has(permission) && origin === ORIGIN);
    // Starts when you sign in from the first run, opening maximised like any other start. The
    // tray's "Start when I sign in" turns it off, and that sticks.
    if (app.isPackaged && !readSettings().loginChosen) {
      setStartAtLogin(true);
      writeSettings({ loginChosen: true });
    }
    createWindow();
    createTray();
    widgets.init({
      site: SITE, version: app.getVersion(), readSettings, writeSettings,
      isQuitting: () => quitting,
    });
    widgets.restore();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('sgbus-quitting', () => { quitting = true; });
  // Kept running in the tray with every window closed.
  app.on('window-all-closed', () => {});
}
