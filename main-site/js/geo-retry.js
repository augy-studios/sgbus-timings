// Finding your location when it's asked for once (Stops near me, Navigate, Places, How far's my
// walk?); a watch (the live map, a trip) keeps trying by itself. Two things on top of the
// browser's own:
//
//   The phone's Location switch, in the Android app (2.2.0 and later): with it off, nothing can
//   find you however the app's allowed, and the page only heard "couldn't get your location".
//   Now the app's own "Turn on location" dialog comes first (SgBusPlugin.turnOnLocation), for
//   what you asked for: only a lookup at high accuracy, as tapping Near me, Navigate or Places
//   asks. How far's my walk? asks by itself as each stop opens, so it never prompts.
//
//   A second try when the first, at high accuracy, times out or finds nothing: once more at
//   ordinary accuracy, taking a fix up to RECENT_MS old. The app's WebView and some phones'
//   browsers read high accuracy as GPS alone, which indoors often never gets a fix, while Wi-Fi
//   and cell towers would have found you at once.
//
// Errors carry `appMessage`, the app's own explanation, as js/desktop-location.js's carry
// `desktopMessage` (locationMessage in script.js shows either). Loaded after
// js/app-bridge.js and js/desktop-location.js, whose errors already say why and aren't retried.
// Plain script: exports go on window.
(function () {
  var geo = navigator.geolocation;
  if (!geo) return;
  var RECENT_MS = 10 * 60 * 1000;
  var first = geo.getCurrentPosition.bind(geo);

  // Whether the phone's Location is on, after offering to turn it on if `ask`. True outside the
  // app, in an app from before 2.2.0, and whenever the app can't say.
  function phoneLocationOn(ask) {
    var app = window.AppBridge;
    if (!app || !app.native) return Promise.resolve(true);
    return app.ready(1500).then(function () {
      if (!app.has('locationon')) return true;
      return app.call('SgBus', 'location').then(function (now) {
        if (now.on) return true;
        if (!ask) return false;
        return app.call('SgBus', 'turnOnLocation').then(function (after) { return Boolean(after.on); });
      });
    }).catch(function () { return true; });
  }

  function lookup(success, error, options) {
    first(success, function (err) {
      var retry = options && options.enableHighAccuracy && err && err.code !== 1 && !err.desktopMessage;
      if (!retry) { if (error) error(err); return; }
      first(success, error, {
        enableHighAccuracy: false,
        timeout: options.timeout || 15000,
        maximumAge: Math.max(options.maximumAge || 0, RECENT_MS),
      });
    }, options);
  }

  geo.getCurrentPosition = function (success, error, options) {
    var asked = Boolean(options && options.enableHighAccuracy);
    phoneLocationOn(asked).then(function (on) {
      if (on) { lookup(success, error, options); return; }
      var message = 'Location is turned off on this phone. Turn it on, then try again.';
      if (error) error({ code: 2, message: message, appMessage: message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
  };
})();
