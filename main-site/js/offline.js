// Offline mode (help desk #3): with no connection, the pages and buttons that need one go,
// Glance, Bus timings and Service alerts (js/main-screen.js) and Explorer (unless Singapore's
// map is saved, js/map-save.js), Timings near a stop, Routines, Check for app updates and the
// trip bar's Share my ETA (style.css, data-net-off; js/share.js makes no short links offline),
// and a bar at the top says why.
// Favourites, Navigate (both tabs plan without the network; Bus and train on the phone, with
// stops, stations and your places for ends, js/nav.js), Your trips, Places and Stops near me
// stay. Back online, it all comes back, on whatever page is on show.
//
// Offline is data-net-off on <html>, which index.html's head sets before first paint from
// navigator.onLine, so the tabs that need the network don't show for a moment first. After
// that, any of:
//   - the browser's "offline" event (waited on for OFFLINE_WAIT_MS, as a phone moving from
//     Wi-Fi to mobile data can say offline then online again at once);
//   - FAILS fetches of the site's /api failing to reach it within FAIL_WINDOW_MS while the
//     browser still says it's online, as on Wi-Fi with no internet behind it.
// Online again on the browser's "online" event, or any /api answer the service worker never
// makes from a cache (LIVE, sw.js), or the PROBE, asked every PROBE_MS while offline.
//
// The bar's "OK" puts it away for this page view, like the update bars (js/sw-update.js);
// blocked() brings it back when something that needs the network is tapped.
//
// Window.Offline = { on(), onChange(cb), blocked() }: cb(off) runs on every change.
// Plain script: this project does not use ES modules. Loaded first, so every fetch is seen.
(function () {
  const root = document.documentElement;
  const FAILS = 2;
  const FAIL_WINDOW_MS = 10000;
  const PROBE_MS = 20000;
  const OFFLINE_WAIT_MS = 1500;
  // Small, and kept at Vercel's edge for ten minutes (api/app-release.js): an answer of any
  // kind means the site was reached. HEAD, which the service worker leaves to the network.
  const PROBE = '/api/app-release';
  const LIVE = /^\/api\/(bus-arrivals|service-alerts|nav|places|walk|app-release|sync|share|push\/)/;

  let off = root.hasAttribute('data-net-off');
  let fails = [];
  let probeTimer = null;
  let offlineTimer = null;
  let dismissed = false;
  const listeners = [];
  const realFetch = window.fetch.bind(window);

  function set(now) {
    clearTimeout(offlineTimer);
    if (now === off) return;
    off = now;
    fails = [];
    root.toggleAttribute('data-net-off', off);
    clearInterval(probeTimer);
    if (off) probeTimer = setInterval(probe, PROBE_MS);
    render();
    for (const cb of listeners) {
      try { cb(off); } catch (e) { console.error(e); }
    }
  }

  function probe() {
    if (!off || navigator.onLine === false || document.visibilityState === 'hidden') return;
    realFetch(PROBE, { method: 'HEAD', cache: 'no-store' }).then(() => set(false), () => {});
  }

  // A fetch that didn't reach the site, counted only while the page is on show: a phone
  // putting the app away can cut its requests off.
  function failed() {
    if (off || navigator.onLine === false || document.visibilityState === 'hidden') return;
    const now = Date.now();
    fails = fails.filter((t) => now - t < FAIL_WINDOW_MS);
    fails.push(now);
    if (fails.length >= FAILS) set(true);
  }

  window.fetch = function (input, init) {
    const out = realFetch(input, init);
    let path = null;
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/api/')) path = url.pathname;
    } catch { /* not ours */ }
    if (!path) return out;
    return out.then((res) => {
      if (LIVE.test(path)) set(false);
      return res;
    }, (err) => {
      // A network error is a TypeError; one called off (AbortError) says nothing.
      if (err instanceof TypeError) failed();
      throw err;
    });
  };

  window.addEventListener('online', () => set(false));
  window.addEventListener('offline', () => {
    clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => { if (navigator.onLine === false) set(true); }, OFFLINE_WAIT_MS);
  });
  document.addEventListener('visibilitychange', probe);

  // ---------- the bar ----------
  // The update bar's look (style.css), with a class of its own, kept at the top as the page
  // scrolls so it's there to explain the tabs that went.
  function render() {
    let bar = document.querySelector('.offline-notice');
    if (!off || dismissed) {
      bar?.remove();
      return;
    }
    if (bar || !document.body) return;
    bar = document.createElement('div');
    bar.className = 'offline-notice';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', 'Offline');
    bar.innerHTML = `
      <div class="update-notice-inner">
        <p>You&rsquo;re offline. Timings and alerts come back when you reconnect.</p>
        <button type="button" class="iconBtn">OK</button>
      </div>
    `;
    bar.querySelector('button').addEventListener('click', () => {
      dismissed = true;
      render();
    });
    document.body.prepend(bar);
  }

  // Whether the network's needed and not there: offline, the bar comes back (or nudges) to
  // say so, and the caller does nothing.
  function blocked() {
    if (!off) return false;
    dismissed = false;
    render();
    const bar = document.querySelector('.offline-notice');
    bar.classList.remove('nudge');
    void bar.offsetWidth;
    bar.classList.add('nudge');
    return true;
  }

  if (off) probeTimer = setInterval(probe, PROBE_MS);
  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render, { once: true });

  window.Offline = {
    on: () => off,
    onChange: (cb) => listeners.push(cb),
    blocked,
  };
})();
