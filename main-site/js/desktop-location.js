// In the Linux desktop app (2.0.7 and later), your location comes from the app
// (desktop/location.js, through preload.js's sgbusDesktop.locate), as Chromium there can't
// find it by itself. navigator.geolocation is pointed at it, so everything that asks for your
// location (Stops near me, Navigate, Places, the live map, a trip) works as it does anywhere
// else. Its errors carry the app's own explanation as `desktopMessage` (locationMessage in
// script.js shows it). Anywhere else this does nothing.
// Plain script: exports go on window.
(function () {
  var desktop = window.sgbusDesktop;
  if (!desktop || typeof desktop.locate !== "function" || !navigator.geolocation) return;
  // A watch asks again this often; the app keeps an answer a few seconds, and scans Wi-Fi no
  // more often than NetworkManager lets it.
  var WATCH_MS = 5000;

  function position(found) {
    return {
      coords: {
        latitude: found.lat, longitude: found.lng, accuracy: found.accuracy,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null,
      },
      timestamp: found.at || Date.now(),
    };
  }

  function failure(err) {
    return {
      code: err.code, message: err.message, desktopMessage: err.message,
      PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
    };
  }

  function ask(options, success, error) {
    var maxAge = (options && options.maximumAge) || 0;
    desktop.locate({ maxAge: maxAge }).then(function (found) {
      if (found && found.error) { if (error) error(failure(found.error)); return; }
      success(position(found));
    }, function () {
      if (error) error(failure({ code: 2, message: "Couldn't get your location. Please try again." }));
    });
  }

  var watches = {};
  var nextId = 1;
  var geo = navigator.geolocation;
  geo.getCurrentPosition = function (success, error, options) { ask(options, success, error); };
  geo.watchPosition = function (success, error, options) {
    var id = nextId++;
    var last = null;
    function again() {
      if (!watches[id]) return;
      ask(options, function (pos) {
        if (!watches[id]) return;
        // The same answer as before, kept by the app, isn't news.
        if (!last || last.timestamp !== pos.timestamp) success(pos);
        last = pos;
      }, function (err) { if (watches[id] && error) error(err); });
      watches[id] = setTimeout(again, WATCH_MS);
    }
    watches[id] = -1;
    again();
    return id;
  };
  geo.clearWatch = function (id) {
    clearTimeout(watches[id]);
    delete watches[id];
  };
})();
