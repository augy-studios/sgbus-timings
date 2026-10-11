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
// Plain script: this project does not use ES modules.
(function () {
  const LINK = 'intent://update#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;end';
  const UPDATE_CHECK_MS = 6 * 3600 * 1000;

  let checkedAt = 0;
  let dismissed = false;

  // Whether version a comes after version b, number by number: 1.10.0 after 1.9.0. The same
  // as newer() in api/app-release.js.
  function newer(a, b) {
    const x = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }

  async function check() {
    checkedAt = Date.now();
    let latest;
    try {
      const res = await fetch('/api/app-release');
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

  if (!window.AppBridge) return;
  AppBridge.ready(5000).then((inApp) => {
    if (!inApp) return;
    check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - checkedAt > UPDATE_CHECK_MS) check();
    });
  });
})();
