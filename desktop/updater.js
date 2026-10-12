// The desktop app checking for its own updates, with electron-updater: soon after it starts,
// then every CHECK_EVERY_MS while it runs (it lives in the tray for days), and whenever the
// tray's "Check for updates..." asks (checkNow), which says what it found either way.
//
// It reads latest.yml (Windows), latest-mac.yml (macOS) or latest-linux.yml (Linux), which the
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

const { app, Notification, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RELEASES = 'https://github.com/augy-studios/sgbus-timings/releases/latest';
const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const state = { available: null, ready: null, checking: false }; // the newer version, and once it's downloaded
let onChange = () => {};
let notifiedFor = null;
let asked = false; // this check was asked for from the tray, so its answer is shown whatever it is
let install = false;

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

function restartToUpdate() {
  if (!state.ready) return;
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

function start(changed) {
  if (!app.isPackaged) return; // nothing to update when run from source (npm start)
  onChange = changed || onChange;
  install = canInstall();
  autoUpdater.autoDownload = install;
  // macOS installs it itself (swapMacOnQuit), never through Squirrel.Mac.
  autoUpdater.autoInstallOnAppQuit = install && !mac;
  autoUpdater.logger = null;
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

  autoUpdater.on('update-available', (info) => {
    state.available = info.version;
    onChange();
    // Asked from the tray: what's happening with it, even if it was said before.
    if (asked && install) {
      if (state.ready === info.version) notify(`SG Bus Timings ${info.version} is ready`, 'Click to restart and update. Otherwise it updates the next time you quit.', restartToUpdate);
      else notify(`SG Bus Timings ${info.version} is out`, "It's downloading. You'll be told when it's ready to install.", () => {});
    }
    if (install || (notifiedFor === info.version && !asked)) return;
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
        return;
      }
    }
    state.ready = info.version;
    onChange();
    if (notifiedFor === info.version) return;
    notifiedFor = info.version;
    notify(`SG Bus Timings ${info.version} is ready`, 'Click to restart and update. Otherwise it updates the next time you quit.', restartToUpdate);
  });
  // Offline, GitHub down, or no latest.yml on the release: the next check tries again.
  autoUpdater.on('error', (err) => console.warn('update check failed:', err?.message || err));
  autoUpdater.on('update-not-available', () => {
    if (asked) notify("You're up to date", `SG Bus Timings ${app.getVersion()} is the newest version.`, () => {});
  });

  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);
}

async function check() {
  if (state.checking) return;
  state.checking = true;
  onChange();
  try {
    await autoUpdater.checkForUpdates();
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

module.exports = { start, menuItem, checkItem, ready: () => state.ready, restart: restartToUpdate };
