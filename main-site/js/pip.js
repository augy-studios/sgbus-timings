// Picture-in-picture, in the Android app (2.0.1 and later): while a trip runs (js/trip.js) or
// the live map is open (js/map.js), leaving the app shrinks it into a small window over other
// apps instead of hiding it. The app does the shrinking (MainActivity, SgBusPlugin.pip); this
// tells it when that's wanted and in what shape, and while it's small, html[data-pip] shows
// only the map or the trip (style.css, "picture-in-picture").
//
// Checked every CHECK_MS rather than hooked into each way a trip or the map can start and
// stop: it's one cheap call, and only made when the answer changes.
// Plain script: this project does not use ES modules.
(function () {
  const CHECK_MS = 1500;
  // The shapes, as [width, height]: tall for the map, wide for the trip's line of text.
  const MAP_SHAPE = [3, 4];
  const TRIP_SHAPE = [16, 9];

  let sent = null;

  function wanted() {
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
    check();
    setInterval(check, CHECK_MS);
    AppBridge.on('SgBus', 'pip', ({ active }) => {
      document.documentElement.toggleAttribute('data-pip', !!active);
      // The map redraws for its new size.
      window.dispatchEvent(new Event('resize'));
    });
  });
})();
