// Offline mode, as the site's js/offline.js: with no connection, the pages and buttons that need
// one go (Glance, Bus timings and Service alerts, Explorer unless Singapore's map is saved, a
// stop's timings), and a bar at the top says why. Favourites, Navigate, Your trips and Places
// stay. Back online, it all comes back, on whatever page is on show.
//
// Offline once `fails` requests to the site fail to reach it within `failWindowMs` while the
// app's on show (a phone putting the app away can cut its requests off); online again on any
// answer from the site, or the probe, asked every `probeMs` while offline.
import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

class Net {
  Net._();

  static const fails = 2;
  static const failWindowMs = 10000;
  static const probeMs = 20000;
  static final off = ValueNotifier<bool>(false);
  /// The bar put away with OK, for this time the app's open; blocked() brings it back.
  static final dismissed = ValueNotifier<bool>(false);
  /// Asks the site once, for the probe: any answer means it was reached. Small, and kept at
  /// the site's edge (api/app-release.js).
  static Future<void> Function() probe = () => http.head(Uri.parse('https://sgbus.uwuapps.org/api/app-release')).timeout(const Duration(seconds: 10));

  static final List<int> _fails = [];
  static Timer? _probe;

  static bool get _shown {
    final s = WidgetsBinding.instance.lifecycleState;
    return s == null || s == AppLifecycleState.resumed;
  }

  static void _set(bool now) {
    if (now == off.value) return;
    off.value = now;
    _fails.clear();
    _probe?.cancel();
    if (now) {
      dismissed.value = false;
      _probe = Timer.periodic(const Duration(milliseconds: probeMs), (_) {
        if (!_shown) return;
        probe().then((_) => _set(false)).catchError((_) {});
      });
    }
  }

  /// An answer from the site, of any kind.
  static void reached() => _set(false);

  /// A request that didn't reach the site: no connection, or no internet behind it.
  static void failed(Object e) {
    if (off.value || !_shown) return;
    if (e is! TimeoutException && e is! http.ClientException && !'$e'.contains('SocketException') && !'$e'.contains('Failed host lookup')) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    _fails.removeWhere((t) => now - t >= failWindowMs);
    _fails.add(now);
    if (_fails.length >= fails) _set(true);
  }

  /// Whether the network's needed and not there: offline, the bar comes back to say so, and
  /// the caller does nothing.
  static bool blocked() {
    if (!off.value) return false;
    dismissed.value = false;
    return true;
  }
}
