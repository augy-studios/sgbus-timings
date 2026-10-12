// Your location on Linux, for the site's Stops near me, Navigate's "where I am", the live map
// and a trip (main-site/js/desktop-location.js asks through preload.js's sgbusDesktop.locate).
//
// Electron on Windows and macOS asks the system where it is, but on Linux Chromium only has
// Google's location service, which needs an API key Electron doesn't come with, so the page's
// own navigator.geolocation always fails there. Instead, this scans the Wi-Fi networks around
// with NetworkManager (nmcli, on nearly every Linux desktop) and asks BeaconDB
// (https://beacondb.net, an open database of where Wi-Fi networks are, the one GeoClue itself
// now uses) where they are, as phones and Chromium elsewhere do with Google's. What's sent is
// the networks' hardware addresses and strengths, never their names or anything of yours;
// networks that ask not to be mapped (a name ending "_nomap") are left out. GNOME's own
// Location Services switch is respected: off, and nothing is looked up.
//
// Without Wi-Fi, BeaconDB can only go by the internet address, which is a town's width out,
// no use for the stops near you: anything rougher than MAX_ACCURACY_M is turned down.

const { execFile } = require('node:child_process');
const { net } = require('electron');

const GEOLOCATE = 'https://api.beacondb.net/v1/geolocate';
const MAX_ACCURACY_M = 3000;
// One answer is kept this long, so a trip's steady asking doesn't scan and ask every time.
const KEEP_MS = 4000;
const SCAN_TIMEOUT_MS = 12000;

let last = null; // { lat, lng, accuracy, at }
let asking = null;

const run = (cmd, args, timeout = SCAN_TIMEOUT_MS) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, env: { ...process.env, LC_ALL: 'C' } }, (err, stdout) => resolve(err ? null : String(stdout)));
});

// GNOME's Settings > Privacy > Location Services. Elsewhere (KDE and others), or without
// gsettings, there's no such switch to go by.
async function systemAllows() {
  const out = await run('gsettings', ['get', 'org.gnome.system.location', 'enabled'], 3000);
  return out == null || out.trim() !== 'false';
}

// nmcli's terse output escapes ":" in a field as "\:".
function fields(line) {
  const out = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length) cur += line[++i];
    else if (line[i] === ':') { out.push(cur); cur = ''; }
    else cur += line[i];
  }
  out.push(cur);
  return out;
}

// The Wi-Fi networks in range, as BeaconDB takes them. A fresh scan if NetworkManager allows
// one (it refuses more than one every few seconds, and then lists what it last saw).
async function wifi() {
  const out = await run('nmcli', ['-t', '-f', 'SSID,BSSID,SIGNAL,FREQ', 'dev', 'wifi', 'list', '--rescan', 'auto']);
  if (!out) return [];
  const seen = new Set();
  return out.split('\n').map(fields).flatMap(([ssid = '', bssid = '', signal = '', freq = '']) => {
    const mac = bssid.toLowerCase();
    if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) || seen.has(mac) || /_nomap$/i.test(ssid)) return [];
    seen.add(mac);
    // nmcli's signal is a 0 to 100 score; about -100 to -50 dBm.
    const strength = Math.round(Number(signal) / 2 - 100);
    const mhz = parseInt(freq, 10);
    return [{ macAddress: mac, signalStrength: strength, ...(mhz ? { frequency: mhz } : {}) }];
  }).sort((a, b) => b.signalStrength - a.signalStrength).slice(0, 40);
}

class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function lookUp(userAgent) {
  if (!(await systemAllows())) {
    throw new LocationError(1, "Location Services are off on this computer. Turn them on in your system's Settings, under Privacy, to use your location.");
  }
  const aps = await wifi();
  let res;
  try {
    res = await net.fetch(GEOLOCATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
      body: JSON.stringify({ considerIp: true, wifiAccessPoints: aps }),
    });
  } catch {
    throw new LocationError(2, "Couldn't reach the location service. Check you're online, then try again.");
  }
  const data = res.ok ? await res.json().catch(() => null) : null;
  const { lat, lng } = data?.location || {};
  const accuracy = Number(data?.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(accuracy <= MAX_ACCURACY_M)) {
    throw new LocationError(2, aps.length
      ? "Couldn't work out where this computer is from the Wi-Fi around it. Search for a stop, address or postal code instead."
      : "Couldn't work out where this computer is: on Linux it goes by the Wi-Fi networks around, so it needs Wi-Fi turned on. Or search for a stop, address or postal code instead.");
  }
  return { lat, lng, accuracy, at: Date.now() };
}

// Where you are: { lat, lng, accuracy, at }, an answer up to maxAge old if there's one, or
// throws a LocationError with the page's error code (1 not allowed, 2 not found).
async function locate({ maxAge = 0, userAgent = 'SGBusTimings' } = {}) {
  if (last && Date.now() - last.at <= Math.max(maxAge, KEEP_MS)) return last;
  asking ??= lookUp(userAgent)
    .then((found) => (last = found))
    .finally(() => { asking = null; });
  return asking;
}

module.exports = { locate };
