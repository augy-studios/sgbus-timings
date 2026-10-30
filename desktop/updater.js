// The desktop app checking for its own updates, with electron-updater: soon after it starts,
// then every CHECK_EVERY_MS while it runs (it lives in the tray for days), when the computer
// wakes from sleep, and whenever the tray's "Check for updates..." asks (checkNow), which says
// what it found either way.
//
// Electron has no Web Push or FCM, so the GitHub webhook that tells phones a release is out
// (main-site/api/push/release.js) can't reach it: it looks for itself, hourly from 2.1.1. That's
// soon enough, as the desktop installers reach a release a few minutes after it's published,
// once GitHub Actions has built them. Each check is a few kB of latest*.yml from the release's
// downloads, not GitHub's API, so its hourly limit doesn't come into it.
//
// The notifications it shows unasked ("2.1.1 is out", "2.1.1 is ready") can be turned off with
// "New versions of the app" in the site's Service alerts (main.js, settings.json's
// updateNotices, 2.1.1). The tray's menu and the title bar's button still offer the update. So
// can the one said when a new version was found but didn't download: "Couldn't download SG Bus
// Timings 2.2.4", once per version; a check that fails (offline, say) stays quiet unless asked.
//
// It reads latest.yml (Windows, one installer for x64 and Arm), latest-mac.yml (macOS),
// latest-linux.yml or latest-linux-arm64.yml (Linux, by the processor), which the
// build writes beside the installers, from the newest GitHub release: releases/latest/download/
// always points at it, whatever its tag (they're android-v<version>, shared with the Android
// app). Each lists the version, the installer's file name and its SHA-512, which is checked
// before installing.
//
// How it updates depends on how it was installed:
//   Windows .exe (NSIS), Linux .AppImage,  downloaded in the background; a notification and the
//   macOS                                  tray offer Restart to update, and it's installed on
//                                          quit anyway.
//   Windows .msi, Linux .deb, from source, told only: an updater can't replace these safely (it
//   a Mac app it can't write to            would put a second copy beside the .msi's, a .deb
//                                          needs your password), so it opens the release page
//                                          to download the new one.
//
// macOS: electron-updater hands the downloaded .zip to Squirrel.Mac, which refuses any app not
// signed with an Apple Developer ID, and this one is only signed ad-hoc. So electron-updater
// still finds and downloads the update (the .zip for this Mac's processor, its SHA-512 checked),
// and this does the rest itself: unzips it beside the running app, and once the app has quit, a
// small script swaps the new SG Bus Timings.app in for the old and, for Restart to update,
// opens it. That needs the app somewhere you can write to, as /Applications is for an admin;
// not still on the .dmg, nor run straight from Downloads (macOS runs that from a read-only copy).
//
// From 2.2.8 it also checks as the app opens, as Discord does (startup): a small window,
// splash.html, says "Checking for updates…", and an update it can install downloads there with a
// bar, then "Installing update…" and the app opens again as the new version. Later, under the
// bar, opens the app now and leaves the download to carry on as above. Restart to update shows
// the same window, "Installing update…", as it goes.

const { app, BrowserWindow, Notification, nativeTheme, powerMonitor, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RELEASES = 'https://github.com/augy-studios/sgbus-timings/releases/latest';
const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;
// After waking, the network takes a moment to come back.
const AFTER_WAKE_MS = 20 * 1000;
// At launch, how long to wait for GitHub before opening the app anyway.
const STARTUP_CHECK_MS = 10 * 1000;

const state = { available: null, ready: null, checking: false }; // the newer version, and once it's downloaded
let onChange = () => {};
let notices = () => true; // whether to say so unasked (main.js)
let notifiedFor = null;
let asked = false; // this check was asked for from the tray, so its answer is shown whatever it is
let install = false;
let downloading = null; // the version downloading in the background, until it's ready or fails
let failedFor = null; // the version "couldn't download" was said for: once each, as "is out" is

const mac = process.platform === 'darwin';
// The running SG Bus Timings.app: the executable is in its Contents/MacOS.
const macApp = () => path.resolve(path.dirname(process.execPath), '..', '..');
// Where the new one's unzipped, waiting for the app to quit.
const MAC_STAGING = path.join(os.tmpdir(), 'sgbus-timings-update');
let macStaged = null; // the unzipped .app
let macSwapping = false;

const writable = (p) => {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

// Installed by the .exe: NSIS leaves its uninstaller beside the app. The .msi doesn't.
function canInstall() {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return fs.existsSync(path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`));
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
  if (mac) {
    const bundle = macApp();
    return bundle.endsWith('.app') && !bundle.startsWith('/Volumes/') && !bundle.includes('/AppTranslocation/')
      && writable(bundle) && writable(path.dirname(bundle));
  }
  return false;
}

// macOS: the downloaded .zip, unzipped (ditto keeps the app's symlinks and signature whole).
function stageMac(zip) {
  fs.rmSync(MAC_STAGING, { recursive: true, force: true });
  fs.mkdirSync(MAC_STAGING, { recursive: true });
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-x', '-k', zip, MAC_STAGING], (err) => {
      if (err) return reject(err);
      const name = fs.readdirSync(MAC_STAGING).find((f) => f.endsWith('.app'));
      if (!name) return reject(new Error('no .app in the update'));
      resolve(path.join(MAC_STAGING, name));
    });
  });
}

// macOS: once this process has gone, swap the new app in for the old, keeping the old if the
// swap fails part-way, then open it again if asked. Detached, so it outlives the app.
const SWAP = `
while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
old="$3.old-$$"
if mv "$3" "$old"; then
  if mv "$2" "$3"; then rm -rf "$old"; else mv "$old" "$3"; fi
fi
xattr -dr com.apple.quarantine "$3" 2>/dev/null
rm -rf "$4"
[ "$5" = 1 ] && open "$3"
`;
function swapMacOnQuit(relaunch) {
  if (!macStaged || macSwapping || !fs.existsSync(macStaged)) return;
  macSwapping = true;
  spawn('/bin/sh', ['-c', SWAP, 'sgbus-update', String(process.pid), macStaged, macApp(), MAC_STAGING, relaunch ? '1' : '0'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

function notify(title, body, click) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'build', 'icon.png') });
  n.on('click', click);
  n.show();
}

async function restartToUpdate() {
  if (!state.ready) return;
  // As at launch: the small window, saying so, while it goes.
  if (!splash) await openSplash();
  say({ text: 'Installing update…', percent: -1 });
  await wait(800);
  // main.js's close handler lets the window go once the app is quitting.
  app.emit('sgbus-quitting');
  if (mac) {
    swapMacOnQuit(true);
    app.quit();
    return;
  }
  // Silent, and the app opens again once it's installed.
  autoUpdater.quitAndInstall(true, true);
}

// A new version was found but didn't download (or, on a Mac, wouldn't unzip): the next check
// tries again. Said once per version, unless "New versions of the app" is off, as the other
// unasked notifications are; clicking it gets the installer from GitHub instead.
function downloadFailed(version) {
  downloading = null;
  if (failedFor === version || !notices()) return;
  failedFor = version;
  notify(`Couldn't download SG Bus Timings ${version}`, 'It tries again within the hour, or click to download it from GitHub.', () => shell.openExternal(RELEASES));
}

// How it updates, set once, for the check at launch and the ones after.
let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  install = canInstall();
  // macOS installs it itself (swapMacOnQuit), never through Squirrel.Mac.
  autoUpdater.autoInstallOnAppQuit = install && !mac;
  autoUpdater.logger = null;
  // Always heard, so one that comes with nothing else listening (a download left to carry on
  // after Later, before start's handler) isn't an uncaught error that ends the app.
  autoUpdater.on('error', () => {});
  if (mac && install) {
    // electron-updater would now serve the .zip to Squirrel.Mac (MacUpdater.updateDownloaded);
    // only say it's downloaded, with the file, and leave Squirrel out of it.
    autoUpdater.updateDownloaded = async (_file, event) => {
      autoUpdater.dispatchUpdateDownloaded(event);
      return [];
    };
    // Quit any other way than Restart to update: installed then, as on Windows, not reopened.
    app.on('will-quit', () => swapMacOnQuit(false));
  }
}

// changed: called whenever there's something new for the tray's menu and the title bar.
// wanted: whether "New versions of the app" is on, for the notifications it shows unasked.
function start(changed, { wanted } = {}) {
  if (!app.isPackaged) return; // nothing to update when run from source (npm start)
  onChange = changed || onChange;
  notices = wanted || notices;
  configure();
  autoUpdater.autoDownload = install;

  autoUpdater.on('update-available', (info) => {
    state.available = info.version;
    // autoDownload: it's downloading now (again, at each check, if it failed before).
    if (install) downloading = info.version;
    onChange();
    // Asked from the tray: what's happening with it, even if it was said before.
    if (asked && install) {
      if (state.ready === info.version) notify(`SG Bus Timings ${info.version} is ready`, 'Click to restart and update. Otherwise it updates the next time you quit.', restartToUpdate);
      else notify(`SG Bus Timings ${info.version} is out`, "It's downloading. You'll be told when it's ready to install.", () => {});
    }
    if (install || (notifiedFor === info.version && !asked)) return;
    if (!asked && !notices()) return;
    notifiedFor = info.version;
    notify(`SG Bus Timings ${info.version} is out`, 'Click to download it from GitHub, then install it over this one.', () => shell.openExternal(RELEASES));
  });
  autoUpdater.on('update-downloaded', async (info) => {
    // Checked again later, the same update comes back already downloaded: it's unzipped already.
    if (mac && !(state.ready === info.version && macStaged && fs.existsSync(macStaged))) {
      try {
        macStaged = await stageMac(info.downloadedFile);
      } catch (err) {
        console.warn('update unzip failed:', err?.message || err);
        // Downloaded but can't be used: as good as not downloaded. The next check unzips it again.
        downloadFailed(info.version);
        return;
      }
    }
    downloading = null;
    state.ready = info.version;
    onChange();
    if (notifiedFor === info.version || !notices()) return;
    notifiedFor = info.version;
    notify(`SG Bus Timings ${info.version} is ready`, 'Click to restart and update. Otherwise it updates the next time you quit.', restartToUpdate);
  });
  // A check that failed (offline, GitHub down, no latest.yml on the release): the next check
  // tries again, and only a check asked for from the tray says so (check). A download that
  // failed, once a new version was found: said once, as it otherwise just never arrives. A check
  // running meanwhile has errors of its own, so only one outside a check is the download's.
  autoUpdater.on('error', (err) => {
    console.warn('update failed:', err?.message || err);
    if (downloading && !state.checking) downloadFailed(downloading);
  });
  autoUpdater.on('update-not-available', () => {
    if (asked) notify("You're up to date", `SG Bus Timings ${app.getVersion()} is the newest version.`, () => {});
  });

  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);
  // A laptop asleep overnight: what came out meanwhile, soon after it's opened.
  powerMonitor.on('resume', () => setTimeout(check, AFTER_WAKE_MS));
}

async function check() {
  if (state.checking) return;
  state.checking = true;
  onChange();
  try {
    const result = await autoUpdater.checkForUpdates();
    // The background download's failure reaches the 'error' handler above; caught here too, so
    // it isn't also an unhandled rejection in the main process.
    result?.downloadPromise?.catch(() => {});
  } catch (err) {
    if (asked) notify("Couldn't check for updates", 'Check your connection and try again.', () => {});
  } finally {
    state.checking = false;
    asked = false;
    onChange();
  }
}

// The tray's "Check for updates...": a check now, and a notification of what it found.
function checkNow() {
  if (!app.isPackaged) {
    notify('No updates to check for', 'Run from source (npm start), there is nothing to update. The installed app checks for itself.', () => {});
    return;
  }
  if (state.checking) return;
  asked = true;
  check();
}

// For the tray's menu: one item while there's an update, else none.
function menuItem() {
  if (state.ready) return { label: `Restart to update to ${state.ready}`, click: restartToUpdate };
  if (state.available && !canInstall()) return { label: `Download version ${state.available}`, click: () => shell.openExternal(RELEASES) };
  return null;
}

// For the tray's menu: always there, greyed out while a check is running.
function checkItem() {
  return state.checking
    ? { label: 'Checking for updates...', enabled: false }
    : { label: 'Check for updates...', click: checkNow };
}

// ---------- the window it opens with (splash.html) ----------

let splash = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const megabytes = (bytes) => (bytes / 1e6).toFixed(bytes < 10e6 ? 1 : 0);

function openSplash() {
  splash = new BrowserWindow({
    width: 300,
    height: 360,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    title: 'SG Bus Timings',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b221a' : '#f3faf1',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  splash.removeMenu();
  splash.on('closed', () => { splash = null; });
  const loaded = new Promise((resolve) => splash.webContents.once('did-finish-load', resolve));
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash?.show());
  return loaded;
}

// What the window says: { text, detail, percent (0 to 100, -1 for no telling), later }.
function say(status) {
  splash?.webContents.executeJavaScript(`setStatus(${JSON.stringify(status)})`).catch(() => {});
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.destroy();
  splash = null;
}

// Later, under the download's bar: splash.html says so by its title, having no bridge here.
const later = () => new Promise((resolve) => {
  splash?.on('page-title-updated', (e, title) => {
    e.preventDefault();
    if (title === 'later') resolve('later');
  });
});

// At launch, before the app's window: checks for an update, and downloads and installs one it
// can install itself, as Discord does. Resolves once the app should open; never, if it's
// restarting into the new version. From source, there's nothing to update, unless
// SGBUS_SPLASH_DEMO=1 (npm start) has it go through the steps with made-up numbers.
async function startup() {
  const demo = !app.isPackaged && process.env.SGBUS_SPLASH_DEMO;
  if (!app.isPackaged && !demo) return;
  await openSplash();
  if (demo) return demoSteps();
  say({ text: 'Checking for updates…', percent: -1 });
  configure();
  // Downloaded here, by hand, so it's only once it's known there's one.
  autoUpdater.autoDownload = false;

  const found = await new Promise((resolve) => {
    const done = (info) => {
      autoUpdater.removeListener('update-available', onFound);
      autoUpdater.removeListener('update-not-available', onNone);
      autoUpdater.removeListener('error', onNone);
      resolve(info);
    };
    const onFound = (info) => done(info);
    const onNone = () => done(null);
    autoUpdater.on('update-available', onFound);
    autoUpdater.on('update-not-available', onNone);
    autoUpdater.on('error', onNone);
    autoUpdater.checkForUpdates().catch(() => done(null));
    setTimeout(() => done(null), STARTUP_CHECK_MS);
  });

  // None, offline, or one it can't install itself (.msi, .deb): told about it as before, once
  // the app's open (start).
  if (!found || !install) return opening();

  state.available = found.version;
  downloading = found.version;
  say({ text: 'Downloading update', detail: `Version ${found.version}`, percent: 0, later: true });
  const onProgress = (p) => say({
    text: 'Downloading update',
    detail: `${megabytes(p.transferred)} of ${megabytes(p.total)} MB`,
    percent: Math.floor(p.percent),
    later: true,
  });
  autoUpdater.on('download-progress', onProgress);
  const downloaded = new Promise((resolve) => autoUpdater.once('update-downloaded', (info) => resolve(info)));
  // Only a failure ends the race from here: a download that worked ends it as `downloaded`.
  const failed = autoUpdater.downloadUpdate().then(() => new Promise(() => {}), () => 'failed');
  const outcome = await Promise.race([downloaded, failed, later()]);
  autoUpdater.removeListener('download-progress', onProgress);

  // Later: the app opens, and the download carries on, ready on the tray when it's done.
  if (outcome === 'later') return opening();
  if (outcome === 'failed') {
    downloading = null;
    return opening();
  }
  if (mac) {
    try {
      macStaged = await stageMac(outcome.downloadedFile);
    } catch (err) {
      console.warn('update unzip failed:', err?.message || err);
      downloading = null;
      return opening();
    }
  }
  downloading = null;
  state.ready = outcome.version;
  await restartToUpdate();
  // Quitting into the installer: the app doesn't open meanwhile.
  return new Promise(() => {});
}

// "Starting…", then the app's window in its place.
async function opening() {
  say({ text: 'Starting…', percent: null });
  await wait(500);
  closeSplash();
}

// SGBUS_SPLASH_DEMO: the steps, made up, for seeing the window from source. Later works as it
// does for real.
async function demoSteps() {
  say({ text: 'Checking for updates…', percent: -1 });
  await wait(1500);
  const total = 84.6e6;
  const stop = later();
  for (let p = 0; p <= 100; p += 4) {
    say({ text: 'Downloading update', detail: `${megabytes(total * p / 100)} of ${megabytes(total)} MB`, percent: p, later: true });
    if (await Promise.race([wait(120), stop]) === 'later') return opening();
  }
  say({ text: 'Installing update…', percent: -1 });
  await wait(1500);
  return opening();
}

module.exports = { start, startup, menuItem, checkItem, ready: () => state.ready, restart: restartToUpdate };
