// Where the phone is, for Near me, Glance's Nearby, Navigate's "here" and the live map: Android's
// own location permission and the phone's Location switch, with Play services' one-tap "Turn on
// location" when it's off (SgBusPlugin.turnOnLocation), as the WebView app did (js/geo-retry.js).
import 'package:geolocator/geolocator.dart';

import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'store.dart';

/// Worded as it's shown, not as it happens: a page keeps showing it, and it has to follow the language
/// (bug report 20261107-NQCT).
class LocationError implements Exception {
  LocationError(this._words, {this.denied = false});
  LocationError.noFix() : this(() => tr('glance.locationRetrievalFail', "Couldn't get your location. Check that Location is turned on for this device, then try again."));
  final String Function() _words;
  final bool denied;
  String get message => _words();
  @override
  String toString() => message;
}

class Fix {
  const Fix(this.lat, this.lng, {this.accuracy, this.heading, this.speed});
  final double lat;
  final double lng;
  final double? accuracy;
  final double? heading;
  final double? speed;
}

class Locate {
  Locate._();

  /// For tests and screenshots: where the phone is.
  static Fix? fake;
  static LocationError? fakeError;
  static Fix? last;
  static int lastAt = 0;

  /// Glance's and Near me's one yes (js/glance.js's ASKED_KEY).
  static const askedKey = 'sgbus_glance_near';
  static bool get asked => Store.I.get(askedKey) == '1';

  /// The desktop on Linux, where the system may have no location service: finds it itself
  /// (desktop/location.dart), when the system's own can't.
  static Future<Fix> Function()? fallback;

  static Future<bool> allowed() async {
    if (fake != null || fakeError != null || fallback != null) return true;
    final p = await Geolocator.checkPermission();
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  /// Where the phone is. `ask` is a tap's: it may ask for the permission and to turn Location on;
  /// otherwise it only looks if both are already so. `toDo` ends the sentence on what it's for.
  static Future<Fix> here({bool ask = true, String Function()? toDo, Duration maxAge = const Duration(seconds: 30)}) async {
    if (fakeError != null) throw fakeError!;
    if (fake != null) return fake!;
    if (last != null && DateTime.now().millisecondsSinceEpoch - lastAt < maxAge.inMilliseconds) return last!;
    final why = toDo ?? () => tr('location.toFindStops', 'to find stops near you');
    if (fallback != null) {
      try {
        return await _system(ask: ask, why: why);
      } catch (_) {
        last = await fallback!();
        lastAt = DateTime.now().millisecondsSinceEpoch;
        Store.I.put(askedKey, '1');
        return last!;
      }
    }
    return _system(ask: ask, why: why);
  }

  static Future<Fix> _system({required bool ask, required String Function() why}) async {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied && ask) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      if (perm == LocationPermission.deniedForever && ask) {
        // Android won't ask again: its settings are the only way.
        Native.call('SgBus', 'openSettings', {'what': 'app'}).catchError((_) => null);
      }
      throw LocationError(() => tr('glance.locationBlocked', 'Location access is turned off for this site. Allow it in your browser {toDo}.', {'toDo': why()}), denied: true);
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      var on = false;
      if (ask && Native.available) {
        try {
          on = (await Native.call('SgBus', 'turnOnLocation'))?['on'] == true;
        } on NativeError {
          on = false;
        }
      }
      if (!on) throw LocationError.noFix();
    }
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
      );
      Store.I.put(askedKey, '1');
      last = Fix(p.latitude, p.longitude, accuracy: p.accuracy, heading: p.heading, speed: p.speed);
      lastAt = DateTime.now().millisecondsSinceEpoch;
      return last!;
    } catch (_) {
      throw LocationError.noFix();
    }
  }

  /// Fixes as the phone moves, while the screen listens.
  static Stream<Fix> watch() {
    if (fake != null) return Stream.value(fake!);
    if (fallback != null) {
      // Wi-Fi gives no stream: asked again every ten seconds while the screen listens.
      return Stream<void>.periodic(const Duration(seconds: 10)).asyncMap((_) => here(ask: false, maxAge: const Duration(seconds: 4))).handleError((_) {});
    }
    return Geolocator.getPositionStream(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 5))
        .map((p) => last = Fix(p.latitude, p.longitude, accuracy: p.accuracy, heading: p.heading, speed: p.speed));
  }
}
