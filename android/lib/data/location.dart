// Where the phone is, for Near me, Glance's Nearby, Navigate's "here" and the live map: Android's
// own location permission and the phone's Location switch, with Play services' one-tap "Turn on
// location" when it's off (SgBusPlugin.turnOnLocation), as the WebView app did (js/geo-retry.js).
import 'package:geolocator/geolocator.dart';

import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'store.dart';

class LocationError implements Exception {
  LocationError(this.message, {this.denied = false});
  final String message;
  final bool denied;
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
  static Fix? last;
  static int lastAt = 0;

  /// Glance's and Near me's one yes (js/glance.js's ASKED_KEY).
  static const askedKey = 'sgbus_glance_near';
  static bool get asked => Store.I.get(askedKey) == '1';

  static Future<bool> allowed() async {
    if (fake != null) return true;
    final p = await Geolocator.checkPermission();
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  /// Where the phone is. `ask` is a tap's: it may ask for the permission and to turn Location on;
  /// otherwise it only looks if both are already so. `toDo` ends the sentence on what it's for.
  static Future<Fix> here({bool ask = true, String? toDo, Duration maxAge = const Duration(seconds: 30)}) async {
    if (fake != null) return fake!;
    if (last != null && DateTime.now().millisecondsSinceEpoch - lastAt < maxAge.inMilliseconds) return last!;
    final why = toDo ?? tr('location.toFindStops', 'to find stops near you');
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied && ask) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      if (perm == LocationPermission.deniedForever && ask) {
        // Android won't ask again: its settings are the only way.
        Native.call('SgBus', 'openSettings', {'what': 'app'}).catchError((_) => null);
      }
      throw LocationError(tr('glance.locationBlocked', 'Location access is turned off for this site. Allow it in your browser {toDo}.', {'toDo': why}), denied: true);
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
      if (!on) throw LocationError(tr('glance.locationRetrievalFail', "Couldn't get your location. Check that Location is turned on for this device, then try again."));
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
      throw LocationError(tr('glance.locationRetrievalFail', "Couldn't get your location. Check that Location is turned on for this device, then try again."));
    }
  }

  /// Fixes as the phone moves, while the screen listens.
  static Stream<Fix> watch() {
    if (fake != null) return Stream.value(fake!);
    return Geolocator.getPositionStream(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 5))
        .map((p) => last = Fix(p.latitude, p.longitude, accuracy: p.accuracy, heading: p.heading, speed: p.speed));
  }
}
