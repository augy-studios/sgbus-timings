// The desktop app checking for its own updates, with electron-updater: soon after it starts,
// then every CHECK_EVERY_MS while it runs (it lives in the tray for days).
//
// It reads latest.yml (Windows) or latest-linux.yml (Linux), which the build writes beside the
// installers, from the newest GitHub release: releases/latest/download/ always points at it,
// whatever its tag (they're android-v<version>, shared with the Android app). Each lists the
// version, the installer's file name and its SHA-512, which is checked before installing.
//
// How it updates depends on how it was installed:
//   Windows .exe (NSIS), Linux .AppImage   downloaded in the background; a notification and the
//                                          tray offer Restart to update, and it's installed on
//                                          quit anyway.
//   Windows .msi, Linux .deb, from source  told only: an updater can't replace these safely (it
//                                          would put a second copy beside the .msi's, and a
//                                          .deb needs your password), so it opens the release
//                                          page to download the new one.

const { app, Notification, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');

const RELEASES = 'https://github.com/augy-studios/sgbus-timings/releases/latest';
const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const state = { available: null, ready: null }; // the newer version, and once it's downloaded
let onChange = () => {};
let notifiedFor = null;

// Installed by the .exe: NSIS leaves its uninstaller beside the app. The .msi doesn't.
function canInstall() {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return fs.existsSync(path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`));
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
  return false;
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
  // Silent, and the app opens again once it's installed.
  autoUpdater.quitAndInstall(true, true);
}

function start(changed) {
  if (!app.isPackaged) return; // nothing to update when run from source (npm start)
  onChange = changed || onChange;
  const install = canInstall();
  autoUpdater.autoDownload = install;
  autoUpdater.autoInstallOnAppQuit = install;
  autoUpdater.logger = null;

  autoUpdater.on('update-available', (info) => {
    state.available = info.version;
    onChange();
    if (install || notifiedFor === info.version) return;
    notifiedFor = info.version;
    notify(`SG Bus Timings ${info.version} is out`, 'Click to download it from GitHub, then install it over this one.', () => shell.openExternal(RELEASES));
  });
  autoUpdater.on('update-downloaded', (info) => {
    state.ready = info.version;
    onChange();
    if (notifiedFor === info.version) return;
    notifiedFor = info.version;
    notify(`SG Bus Timings ${info.version} is ready`, 'Click to restart and update. Otherwise it updates the next time you quit.', restartToUpdate);
  });
  // Offline, GitHub down, or no latest.yml on the release: the next check tries again.
  autoUpdater.on('error', (err) => console.warn('update check failed:', err?.message || err));

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);
}

// For the tray's menu: one item while there's an update, else none.
function menuItem() {
  if (state.ready) return { label: `Restart to update to ${state.ready}`, click: restartToUpdate };
  if (state.available && !canInstall()) return { label: `Download version ${state.available}`, click: () => shell.openExternal(RELEASES) };
  return null;
}

module.exports = { start, menuItem };
