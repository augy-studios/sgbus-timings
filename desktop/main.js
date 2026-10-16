// SG Bus Timings for Windows, macOS and Linux: the site at sgbus.uwuapps.org in a window of its own,
// so the site's updates reach it at once, as with the Android app (android/). What it adds:
//
// - a tray icon (the menu bar on macOS): closing the window keeps the app running there, so Service Alerts still
//   come as desktop notifications (main-site/js/alerts.js checks for them every minute while
//   it runs, as Electron has no Web Push, and hands them here through preload.js);
// - starting when you sign in, from the tray's menu, quietly into the tray;
// - its own title bar: back, forward, reload, the page's address, which can be typed over,
//   and a button to copy it, screenshot and long screenshot buttons, a green Restart to update
//   button once an update's downloaded, and minimise, maximise and close
//   on Windows and Linux (titlebar.html);
// - links to anywhere but the site opening in your own browser;
// - uwu://sgbus/ links opening it, as they open the Android app (see fromAppLink);
// - checking for its own updates (updater.js), and from the tray's "Check for updates...";
// - Bus timings widgets on the desktop (widgets.js);
// - a stop's next buses in the tray (the macOS menu bar, and its Dock badge), and favourite
//   stops in the Windows Jump List, the taskbar thumbnail's buttons and the macOS Dock menu
//   (glance.js);
// - on Linux, your location, which Chromium can't find there by itself (location.js).
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
const glance = require('./glance');
const location = require('./location');

const SITE = 'https://sgbus.uwuapps.org';
const ORIGIN = new URL(SITE).origin;
const APP_ID = 'org.uwuapps.sgbus';
// Permissions the site may have: your location (Stops near me, Navigate, the live map) and
// notifications. Anything else it asks for is refused.
const ALLOWED = new Set(['geolocation', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);

let win = null; // the window, its own webContents the title bar (titlebar.html)
let page = null; // the site's webContents, in a view below the title bar
let tray = null;
let refreshBar = () => {}; // sends the title bar what it shows again (createWindow)
let refreshTrayMenu = () => {}; // builds the tray's menu again (createTray)
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

// What's typed in the title bar's address, as an address: the site's own (sgbus.uwuapps.org/#84009),
// another site's (example.com, https://…), a path or # address on the site (/#bus/22,
// #84009), or a uwu://sgbus/ link. Null for anything else.
function typedAddress(text) {
  const typed = String(text || '').trim();
  if (!typed) return null;
  if (typed.toLowerCase().startsWith(`${SCHEME}://`)) return fromAppLink(typed);
  if (/^[#/]/.test(typed)) return new URL(typed, `${SITE}/`).href;
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed);
  // A word, or a number, is not an address (84009 would be taken as an IP address).
  if (!scheme && !/^[^\s/?#]+\.[^\s/?#]+/.test(typed)) return null;
  let url;
  try {
    url = new URL(scheme ? typed : `https://${typed}`);
  } catch {
    return null;
  }
  return /^https?:$/.test(url.protocol) ? url.href : null;
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
    // The system's own title bar goes; titlebar.html is drawn there instead. macOS keeps its
    // traffic lights over the bar's left; on Windows and Linux the bar draws its own minimise,
    // maximise and close on its right, as the system's (titleBarOverlay) don't always show
    // over the site's view below it.
    titleBarStyle: 'hidden',
    ...(mac ? { trafficLightPosition: { x: 14, y: 13 } } : {}),
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
      maximized: win.isMaximized(),
      color,
      // A downloaded update's version, for the bar's green Restart to update button.
      update: updater.ready(),
    });
  };
  refreshBar = sendState;
  for (const event of ['did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']) page.on(event, sendState);
  win.webContents.on('did-finish-load', sendState);
  win.on('enter-full-screen', sendState);
  win.on('leave-full-screen', sendState);
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  page.on('did-change-theme-color', (_e, c) => {
    if (!/^#[0-9a-f]{6}$/i.test(c || '')) return;
    color = c;
    view.setBackgroundColor(c);
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
    } else if (input.key === 'F6' || (ctrl && input.key.toLowerCase() === 'l')) {
      // To the address, to type over it, as in a browser.
      win.webContents.focus();
      win.webContents.send('bar-edit');
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

// The window shows maximised, unless it was last closed un-maximised.
let shown = false;
function firstShow() {
  shown = true;
  if (readSettings().maximized !== false) win.maximize();
  win.show();
  glance.windowShown();
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
    ...glance.menuItems(),
    { label: 'Open SG Bus Timings', click: () => showWindow() },
    { label: 'Service alerts', click: () => showWindow('#alerts') },
    { label: 'Navigate', click: () => showWindow('#nav') },
    { label: 'Add a Bus timings widget', click: () => widgets.add() },
    { type: 'separator' },
    updater.checkItem(),
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
  refreshTrayMenu = () => tray.setContextMenu(menu());
  // An update found or downloaded, or a check starting or done: the menu says so.
  updater.start(() => {
    tray.setContextMenu(menu());
    refreshBar();
  });
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
// The green update button, there once an update's downloaded.
ipcMain.on('bar-update', (e) => {
  if (fromBar(e)) updater.restart();
});
// The window's own buttons, on Windows and Linux. Closing puts it in the tray, as ever.
ipcMain.on('bar-minimize', (e) => {
  if (fromBar(e)) win.minimize();
});
ipcMain.on('bar-maximize', (e) => {
  if (fromBar(e)) (win.isMaximized() ? win.unmaximize() : win.maximize());
});
ipcMain.on('bar-close', (e) => {
  if (fromBar(e)) win.close();
});
// Typed in the address: the site's own pages open here, anything else in your browser, as
// links do. 'site', 'browser', or null when it isn't an address.
ipcMain.handle('bar-go', (e, text) => {
  if (!fromBar(e)) return null;
  const url = typedAddress(text);
  if (!url) return null;
  if (isSite(url)) {
    page.loadURL(url);
    page.focus();
    return 'site';
  }
  shell.openExternal(url);
  return 'browser';
});
// Typing goes to the title bar while the address is clicked into, not the site.
ipcMain.on('bar-edit', (e) => {
  if (fromBar(e)) win.webContents.focus();
});
ipcMain.on('bar-done', (e) => {
  if (fromBar(e)) page.focus();
});
ipcMain.handle('bar-copy', async (e) => {
  if (!fromBar(e)) return false;
  await clipboard.writeText(shownUrl());
  return true;
});
// The whole page, top to bottom, as a PNG, not just the part on screen: drawn in one go by
// Chromium (the DevTools protocol's captureBeyondViewport), the site's own scrolling being
// the page's. Up to the tallest picture Chromium draws, 16384 pixels; the top of it, past that.
// Taken from the top, so headers that stick as you scroll are at the top, then scrolled back.
// Rows the site leaves undrawn until they scroll near (content-visibility) are drawn for it, or
// the bottom of a long stop comes out as empty boxes.
const DRAW_ALL = '* { content-visibility: visible !important; }';
const SCROLL_TO = (x, y) => `new Promise((done) => {
  const was = [scrollX, scrollY];
  const html = document.documentElement;
  const behavior = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  scrollTo(${x}, ${y});
  html.style.scrollBehavior = behavior;
  requestAnimationFrame(() => requestAnimationFrame(() => done(was)));
})`;

async function longScreenshot() {
  const dbg = page.debugger;
  const attach = !dbg.isAttached();
  if (attach) dbg.attach('1.3');
  const css = await page.insertCSS(DRAW_ALL, { cssOrigin: 'user' });
  const [x, y] = await page.executeJavaScript(SCROLL_TO(0, 0));
  try {
    const { cssContentSize: size } = await dbg.sendCommand('Page.getLayoutMetrics');
    const dpr = await page.executeJavaScript('devicePixelRatio');
    const width = Math.ceil(size.width);
    const height = Math.min(Math.ceil(size.height), Math.floor(16384 / dpr));
    const { data } = await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return Buffer.from(data, 'base64');
  } finally {
    if (attach) dbg.detach();
    await page.removeInsertedCSS(css).catch(() => {});
    await page.executeJavaScript(SCROLL_TO(Number(x) || 0, Number(y) || 0)).catch(() => {});
  }
}

// The site as it is now, without the title bar, or all of it for a long one: copied, and saved
// in your Downloads folder, where a notification shows it.
ipcMain.handle('bar-screenshot', async (e, long) => {
  if (!fromBar(e)) return false;
  try {
    let png;
    if (long) {
      png = await longScreenshot();
    } else {
      const image = await page.capturePage();
      if (image.isEmpty()) return false;
      png = image.toPNG();
    }
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
    const dir = app.getPath('downloads');
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}`;
    const file = path.join(dir, `SG Bus Timings ${stamp}${long ? ' (long)' : ''}.png`);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(file, png);
    if (Notification.isSupported()) {
      const note = new Notification({
        title: long ? 'Long screenshot saved' : 'Screenshot saved',
        body: `It's copied too, and in Downloads. Click to show it.`,
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

// Linux only: where you are, for the page's navigator.geolocation (location.js). Answers
// { lat, lng, accuracy, at }, or { error: { code, message } }, as an error can't cross intact.
ipcMain.handle('locate', async (e, opts) => {
  if (process.platform !== 'linux' || !isSite(e.senderFrame?.url || '')) return { error: { code: 1, message: 'Not allowed.' } };
  const maxAge = Math.max(0, Math.min(10 * 60 * 1000, Number(opts?.maxAge) || 0));
  try {
    return await location.locate({ maxAge, userAgent: `SGBusTimingsDesktop/${app.getVersion()} (+https://sgbus.uwuapps.org)` });
  } catch (err) {
    return { error: { code: err.code === 1 ? 1 : 2, message: String(err.message || "Couldn't get your location.") } };
  }
});

// The tray countdown's stop, { code, name, service } or null to stop it, and what it is now
// (glance.js).
ipcMain.handle('tray-stop', (e, s) => (isSite(e.senderFrame?.url || '') ? glance.setStop(s && typeof s === 'object' ? s : null) : null));
ipcMain.handle('tray-stop-get', (e) => (isSite(e.senderFrame?.url || '') ? glance.stop() : null));

// The favourite stops, [{ code, name }], for the Jump List, the Dock menu and the thumbnail's
// buttons (glance.js).
ipcMain.on('favourites', (e, list) => {
  if (isSite(e.senderFrame?.url || '')) glance.setFavourites(list);
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
    // Before the tray, whose menu asks it for its lines, and before the page can send it
    // favourites; the countdown starts once the tray's there.
    glance.init({
      site: SITE, readSettings, writeSettings, showWindow,
      tray: () => tray, win: () => win, page: () => page,
      refreshMenu: () => refreshTrayMenu(),
    });
    createTray();
    glance.trayReady();
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
