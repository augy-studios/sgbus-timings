// A second try at your location when the first, asked for at high accuracy, times out or finds
// nothing: once more at ordinary accuracy, taking a fix up to RECENT_MS old. On Android, the
// app's WebView and some phones' browsers read high accuracy as GPS alone, which indoors or
// under a roof often never gets a fix, while Wi-Fi and cell towers would have found you at once.
// Everything that asks for your location once (Stops near me, Navigate, Places, How far's my
// walk?) goes through this; a watch (the live map, a trip) keeps trying by itself.
// Loaded after js/desktop-location.js, whose own errors already say why, and aren't retried.
// Plain script: exports go on window.
(function () {
  var geo = navigator.geolocation;
  if (!geo) return;
  var RECENT_MS = 10 * 60 * 1000;
  var first = geo.getCurrentPosition.bind(geo);

  geo.getCurrentPosition = function (success, error, options) {
    first(success, function (err) {
      var retry = options && options.enableHighAccuracy && err && err.code !== 1 && !err.desktopMessage;
      if (!retry) { if (error) error(err); return; }
      first(success, error, {
        enableHighAccuracy: false,
        timeout: options.timeout || 15000,
        maximumAge: Math.max(options.maximumAge || 0, RECENT_MS),
      });
    }, options);
  };
})();
