// Picture-in-picture, in the Android app (2.0.1 and later): while a trip runs (js/trip.js) or
// the live map is open (js/map.js), leaving the app shrinks it into a small window over other
// apps instead of hiding it. The app does the shrinking (MainActivity, SgBusPlugin.pip); this
// tells it when that's wanted and in what shape, and while it's small, html[data-pip] shows
// only the map or the trip (style.css, "picture-in-picture").
//
// Checked every CHECK_MS rather than hooked into each way a trip or the map can start and
// stop: it's one cheap call, and only made when the answer changes.
//
// Settings' Picture-in-picture turns it off (OFF_KEY): then it's never wanted, and the app goes
// to the background as any other app does. Shown only in an app that has it.
// Plain script: this project does not use ES modules.
(function () {
  const CHECK_MS = 1500;
  const OFF_KEY = 'sgbus_pip';
  // The shapes, as [width, height]: tall for the map, wide for the trip's line of text.
  const MAP_SHAPE = [3, 4];
  const TRIP_SHAPE = [16, 9];

  // The page's zoom is held at 1 while it's small, and until the window has grown back.
  // A window that small makes the WebView zoom out to fit, and growing back it kept some of
  // that zoom, more each time: the page came back zoomed in, the tray cut off, and it
  // scrolled every way. The app's WebView may ignore the viewport tag, so if the zoom is
  // still off once the window has settled, the page reloads, which starts it at 1. A trip
  // carries on through a reload (js/trip.js).
  const SETTLE_MS = 500;
  const viewport = document.querySelector('meta[name="viewport"]');
  const VIEWPORT = viewport?.content;
  const HELD = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1';
  // At most one reload a minute, should a reload not put it right.
  const RELOADED_KEY = 'sgbus-pip-reloaded';
  const RELOAD_GAP_MS = 60000;

  let sent = null;
  let scrollY = 0;
  let settle = null;

  function zoomedOff() {
    const scale = window.visualViewport?.scale ?? 1;
    return Math.abs(scale - 1) > 0.02
      || Math.abs(window.innerWidth - document.documentElement.clientWidth) > 2;
  }

  // After the last resize of the window growing back: back to where it was at zoom 1, then
  // let it be zoomed again.
  function settled() {
    window.removeEventListener('resize', growing);
    settle = null;
    if (document.documentElement.hasAttribute('data-pip')) return;
    window.scrollTo(0, scrollY);
    if (viewport) viewport.content = VIEWPORT;
    if (!zoomedOff()) return;
    try {
      if (Date.now() - Number(sessionStorage.getItem(RELOADED_KEY) || 0) < RELOAD_GAP_MS) return;
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch {}
    location.reload();
  }

  function growing() {
    clearTimeout(settle);
    settle = setTimeout(settled, SETTLE_MS);
  }

  function setPip(active) {
    const root = document.documentElement;
    if (active === root.hasAttribute('data-pip')) return;
    if (active) {
      clearTimeout(settle);
      window.removeEventListener('resize', growing);
      scrollY = window.scrollY;
    }
    if (viewport) viewport.content = HELD;
    root.toggleAttribute('data-pip', active);
    if (!active) {
      window.addEventListener('resize', growing);
      growing();
    }
    // The map redraws for its new size.
    window.dispatchEvent(new Event('resize'));
  }

  const enabled = () => { try { return localStorage.getItem(OFF_KEY) !== 'off'; } catch { return true; } };
  let available = false;

  function syncButtons() {
    document.querySelectorAll('[data-pip-pref]').forEach((btn) => {
      const on = (btn.dataset.pipPref === 'on') === enabled();
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function setEnabled(on) {
    try {
      if (on) localStorage.removeItem(OFF_KEY);
      else localStorage.setItem(OFF_KEY, 'off');
    } catch { /* this visit only */ }
    syncButtons();
    if (available) check();
  }

  window.Pip = { enabled, setEnabled, available: () => available };
  document.querySelectorAll('[data-pip-pref]').forEach((btn) => btn.addEventListener('click', () => setEnabled(btn.dataset.pipPref === 'on')));
  syncButtons();

  function wanted() {
    if (!enabled()) return { auto: false };
    if (window.LiveMap?.isOpen()) return { auto: true, ratio: MAP_SHAPE };
    if (window.Trip?.active()) return { auto: true, ratio: TRIP_SHAPE };
    return { auto: false };
  }

  function check() {
    const w = wanted();
    const key = JSON.stringify(w);
    if (key === sent) return;
    sent = key;
    AppBridge.call('SgBus', 'pip', w).catch(() => { sent = null; });
  }

  if (!window.AppBridge?.native) return;
  AppBridge.ready(5000).then((inApp) => {
    if (!inApp || !AppBridge.has('pip')) return;
    available = true;
    document.getElementById('pipSetting').hidden = false;
    check();
    setInterval(check, CHECK_MS);
    AppBridge.on('SgBus', 'pip', ({ active }) => setPip(!!active));
  });
})();
