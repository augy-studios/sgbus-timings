// The Android app's update bar: in the app (android/), when GitHub has a newer version of it
// than the one running. The app says its version in its hello (js/app-bridge.js), and
// /api/app-release the newest one.
//
// From 1.2.0 the app updates itself: Update opens its update window (UpdateActivity.java),
// which downloads the APK and hands it to Android's installer. 1.1.0 can't, so Download opens
// the release's page on GitHub to install it by hand. 1.0.0 has no hello, so never hears.
//
// Looked up as the page opens, and again on coming back to it after UPDATE_CHECK_MS, as the
// app stays open for days. "Not now" lasts this page view only, like js/sw-update.js.
//
// From 2.0.8 the Edge Tray also has "Check for app updates", which opens the update window to
// look whenever you like (CHECK_LINK): it says if you have the newest version, and asks before
// downloading one. Builds before 2.0.8 ask to install apps before looking, so don't get it.
//
// From 2.1.1, "New versions of the app" in Service alerts (#releaseAlerts), in the apps only:
//   Android  the sgbus-releases FCM topic (SgBusPlugin.setReleases), which api/push/release.js
//            pushes to the moment a release is published. Off until turned on, as turning it on
//            asks for Android's notification permission. Tapping the notification opens the
//            update window (MainActivity); arriving with the app in front, it brings the bar.
//   Desktop  the app's own "a new version is out" notifications (desktop/updater.js, which looks
//            every hour, as Electron can't be pushed to). On unless turned off.
// Plain script: this project does not use ES modules.
(function () {
  const LINK = 'intent://update#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;end';
  const CHECK_LINK = 'intent://update/check#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;end';
  const UPDATE_CHECK_MS = 6 * 3600 * 1000;

  let checkedAt = 0;
  let dismissed = false;

  // Whether version a comes after version b, number by number: 1.10.0 after 1.9.0. The same
  // as newer() in api/_lib/release.js.
  function newer(a, b) {
    const x = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }

  // version: the one a push just said is out, which makes a URL the site's cache hasn't seen.
  async function check(version) {
    checkedAt = Date.now();
    let latest;
    try {
      const res = await fetch(`/api/app-release${version ? `?v=${encodeURIComponent(version)}` : ''}`);
      if (!res.ok) return;
      latest = await res.json();
    } catch {
      return; // Offline: next time.
    }
    const running = AppBridge.version();
    if (latest?.version && running && newer(latest.version, running)) render(latest);
  }

  function render(latest) {
    if (dismissed || document.querySelector('.app-update-notice')) return;
    const selfUpdate = AppBridge.has('update');

    const bar = document.createElement('div');
    bar.className = 'app-update-notice';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', 'App update');
    bar.innerHTML = `
      <div class="update-notice-inner">
        <p></p>
        <a class="btn"></a>
        <button type="button" class="iconBtn">Not now</button>
      </div>
    `;
    bar.querySelector('p').textContent = `Version ${latest.version} of the Android app is out.`;
    const go = bar.querySelector('a');
    go.textContent = selfUpdate ? 'Update' : 'Download';
    // An intent is handed to Android, not opened in a tab; GitHub opens over the app.
    go.href = selfUpdate ? LINK : latest.page;
    bar.querySelector('button').addEventListener('click', () => {
      dismissed = true;
      bar.remove();
    });
    document.body.prepend(bar);
  }

  // ---------- "New versions of the app" in Service alerts (2.1.1) ----------

  const NOTES = {
    appOn: "You'll get a notification the moment a new version is out, even with the app closed. Tap it to update.",
    appOff: 'Off. While the app is open, the bar at the top still says when a new version is out.',
    desktopOn: "A notification says when a new version is out. The app looks every hour while it's running, open or in the tray.",
    desktopOff: "Off. The tray's menu still says when a new version is out.",
    denied: "Notifications are off for SG Bus Timings. Turn them on in Android's settings for the app, then pick again.",
    failed: "Couldn't change that just now. Check you're online, then try again.",
  };

  function showReleases(on, note) {
    document.querySelectorAll('[data-release-mode]').forEach((btn) => {
      const active = (btn.dataset.releaseMode === 'on') === on;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('releaseNote').textContent = note;
  }

  // Android's notification permission, asked only as it's turned on. Once refused for good,
  // Android won't prompt again: its settings are the only way.
  async function allowed() {
    const now = (await AppBridge.call('PushNotifications', 'checkPermissions')).receive;
    if (now === 'granted') return true;
    if (now === 'denied') return false;
    return (await AppBridge.call('PushNotifications', 'requestPermissions')).receive === 'granted';
  }

  // Each says whether it's on now, and turns it on or off: { get(), set(on) }, set resolving
  // to the note to show, or rejecting with one.
  const android = {
    async get() {
      const { on } = await AppBridge.call('SgBus', 'releases');
      // Turned on here, then notifications switched off in Android's settings: say why
      // nothing arrives.
      if (on && (await AppBridge.call('PushNotifications', 'checkPermissions')).receive !== 'granted') {
        return { on, note: NOTES.denied };
      }
      return { on, note: on ? NOTES.appOn : NOTES.appOff };
    },
    async set(on) {
      if (on && !(await allowed())) throw new Error(NOTES.denied);
      await AppBridge.call('SgBus', 'setReleases', { on });
      return on ? NOTES.appOn : NOTES.appOff;
    },
  };

  const desktop = {
    async get() {
      const on = await window.sgbusDesktop.releases.get();
      return { on, note: on ? NOTES.desktopOn : NOTES.desktopOff };
    },
    async set(on) {
      const now = await window.sgbusDesktop.releases.set(on);
      return now ? NOTES.desktopOn : NOTES.desktopOff;
    },
  };

  async function initReleases(how) {
    const box = document.getElementById('releaseAlerts');
    let on = false;
    try {
      const now = await how.get();
      on = now.on;
      showReleases(on, now.note);
    } catch {
      return; // An app that can't say: no switch.
    }
    box.hidden = false;
    let busy = false;
    box.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-release-mode]');
      const want = btn?.dataset.releaseMode === 'on';
      if (!btn || busy || want === on) return;
      busy = true;
      try {
        const note = await how.set(want);
        on = want;
        showReleases(on, note);
      } catch (err) {
        showReleases(on, err?.message || NOTES.failed);
      } finally {
        busy = false;
      }
    });
  }

  // ---------- the Android app, offered in Android's browsers ----------
  // The same bar, in Chrome and the rest on Android: the app has what a browser can't do with
  // the page closed. Download is the newest APK itself, from GitHub; "Not now" leaves it for
  // OFFER_AGAIN_MS. The app can't be seen from a browser, so one already installed (whose
  // links open in it anyway) is offered too, until it's waved away.

  const OFFER_KEY = 'sgbus_app_offer_at';
  const OFFER_AGAIN_MS = 30 * 86400000;
  const GUIDE = 'https://guide.sgbus.uwuapps.org/web/android-app#download-and-install-it';

  async function offerApp() {
    if (!/Android/i.test(navigator.userAgent)) return;
    try {
      if (Date.now() - Number(localStorage.getItem(OFFER_KEY) || 0) < OFFER_AGAIN_MS) return;
    } catch { /* offered every visit */ }
    let latest;
    try {
      const res = await fetch('/api/app-release');
      if (!res.ok) return;
      latest = await res.json();
    } catch {
      return;
    }
    if (!latest?.apk || document.querySelector('.app-update-notice')) return;

    const bar = document.createElement('div');
    bar.className = 'app-update-notice';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', 'Get the Android app');
    bar.innerHTML = `
      <div class="update-notice-inner">
        <p>Get the Android app: widgets, routines and stop reminders, even with it closed. <a target="_blank" rel="noopener noreferrer">How to install</a></p>
        <a class="btn">Download</a>
        <button type="button" class="iconBtn">Not now</button>
      </div>
    `;
    bar.querySelector('p a').href = GUIDE;
    bar.querySelector('a.btn').href = latest.apk;
    const done = () => {
      try { localStorage.setItem(OFFER_KEY, String(Date.now())); } catch { /* this visit only */ }
      bar.remove();
    };
    // Downloading is an answer too: not asked again while it installs.
    bar.querySelector('a.btn').addEventListener('click', done);
    bar.querySelector('button').addEventListener('click', done);
    document.body.prepend(bar);
  }

  // The desktop app from 2.1.1 (desktop/preload.js).
  if (window.sgbusDesktop?.releases) initReleases(desktop);

  if (!window.AppBridge) return;
  AppBridge.ready(5000).then((inApp) => {
    if (!inApp) {
      offerApp();
      return;
    }
    if (AppBridge.has('checkupdate')) {
      const btn = document.getElementById('appUpdateBtn');
      btn.href = CHECK_LINK;
      btn.hidden = false;
    }
    check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - checkedAt > UPDATE_CHECK_MS) check();
    });

    if (AppBridge.has('releases')) {
      initReleases(android);
      // A "new version" push with the app in front, which FCM leaves to the app: the bar,
      // even after "Not now" on an older one, as this is news.
      AppBridge.on('PushNotifications', 'pushNotificationReceived', (n) => {
        if (n?.data?.type !== 'release') return;
        dismissed = false;
        check(n.data.version);
      });
    }
  });
})();
