// The app's own settings: one small JSON file in the app's userData folder, read and merged on
// every write, so two modules writing different keys never undo each other. A failed read is
// an empty object, and a failed write is ignored: the window just opens at its usual size next
// time. Nothing secret is ever kept here. Its own file so links.js, the same in every UwU
// desktop app, can reach it.
//
// Keys: bounds, maximized, trayHintShown, loginChosen, updateNotices (main.js); widgets
// (widgets.js); trayStop, favourites (glance.js); linkHandoff (links.js).

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const file = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeSettings(changes) {
  try {
    fs.writeFileSync(file(), JSON.stringify({ ...readSettings(), ...changes }));
  } catch {
    // Not kept: the window opens at its usual size next time.
  }
}

module.exports = { readSettings, writeSettings };
