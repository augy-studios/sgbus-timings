// Your location on Linux, for Near me, Navigate's "where I am", the live map and a trip, when the
// system's own location service (GeoClue, through geolocator) can't say: none installed, no agent,
// or turned away. As the Electron app's location.js did: it scans the Wi-Fi networks around with
// NetworkManager (nmcli, on nearly every Linux desktop) and asks BeaconDB (https://beacondb.net, an
// open database of where Wi-Fi networks are, the one GeoClue itself now uses) where they are. What's
// sent is the networks' hardware addresses and strengths, never their names or anything of yours;
// networks that ask not to be mapped (a name ending "_nomap") are left out. GNOME's own Location
// Services switch is respected: off, and nothing is looked up.
//
// Without Wi-Fi, BeaconDB can only go by the internet address, which is a town's width out, no use
// for the stops near you: anything rougher than 3 km is turned down.
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../data/location.dart';
import '../i18n/i18n.dart';
import 'desktop.dart';

class DeskLocation {
  DeskLocation._();

  static const geolocate = 'https://api.beacondb.net/v1/geolocate';
  static const maxAccuracyM = 3000.0;
  // One answer is kept this long, so a trip's steady asking doesn't scan and ask every time.
  static const keep = Duration(seconds: 4);

  static Fix? _last;
  static DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);
  static Future<Fix>? _asking;

  static void init() {
    if (Platform.isLinux) Locate.fallback = locate;
  }

  static Future<String?> _run(String cmd, List<String> args, {Duration timeout = const Duration(seconds: 12)}) async {
    try {
      final r = await Process.run(cmd, args, environment: {'LC_ALL': 'C'}).timeout(timeout);
      return r.exitCode == 0 ? '${r.stdout}' : null;
    } catch (_) {
      return null;
    }
  }

  // GNOME's Settings > Privacy > Location Services. Elsewhere (KDE and others), or without
  // gsettings, there's no such switch to go by.
  static Future<bool> _systemAllows() async {
    final out = await _run('gsettings', ['get', 'org.gnome.system.location', 'enabled'], timeout: const Duration(seconds: 3));
    return out == null || out.trim() != 'false';
  }

  /// nmcli's terse output escapes ":" in a field as "\:".
  static List<String> fields(String line) {
    final out = <String>[];
    final cur = StringBuffer();
    for (var i = 0; i < line.length; i++) {
      if (line[i] == r'\' && i + 1 < line.length) {
        cur.write(line[++i]);
      } else if (line[i] == ':') {
        out.add(cur.toString());
        cur.clear();
      } else {
        cur.write(line[i]);
      }
    }
    out.add(cur.toString());
    return out;
  }

  /// The Wi-Fi networks in nmcli's listing, as BeaconDB takes them: the strongest 40.
  static List<Map<String, Object>> parse(String listing) {
    final seen = <String>{};
    final out = <Map<String, Object>>[];
    for (final line in listing.split('\n')) {
      final f = fields(line);
      if (f.length < 4) continue;
      final ssid = f[0], mac = f[1].toLowerCase(), signal = f[2], freq = f[3];
      if (!RegExp(r'^([0-9a-f]{2}:){5}[0-9a-f]{2}$').hasMatch(mac) || seen.contains(mac) || RegExp(r'_nomap$', caseSensitive: false).hasMatch(ssid)) continue;
      seen.add(mac);
      // nmcli's signal is a 0 to 100 score; about -100 to -50 dBm.
      final strength = ((num.tryParse(signal) ?? 0) / 2 - 100).round();
      final mhz = int.tryParse(freq.split(' ').first);
      out.add({'macAddress': mac, 'signalStrength': strength, 'frequency': ?mhz});
    }
    out.sort((a, b) => (b['signalStrength'] as int).compareTo(a['signalStrength'] as int));
    return out.take(40).toList();
  }

  static Future<Fix> _lookUp() async {
    if (!await _systemAllows()) {
      throw LocationError(() => tr('desktop.location.off', "Location Services are off on this computer. Turn them on in your system's Settings, under Privacy, to use your location."), denied: true);
    }
    final listing = await _run('nmcli', ['-t', '-f', 'SSID,BSSID,SIGNAL,FREQ', 'dev', 'wifi', 'list', '--rescan', 'auto']);
    final aps = listing == null ? <Map<String, Object>>[] : parse(listing);
    http.Response res;
    try {
      res = await http
          .post(Uri.parse(geolocate), headers: {'Content-Type': 'application/json', 'User-Agent': Desktop.userAgent}, body: jsonEncode({'considerIp': true, 'wifiAccessPoints': aps}))
          .timeout(const Duration(seconds: 15));
    } catch (_) {
      throw LocationError(() => tr('desktop.location.unreachable', "Couldn't reach the location service. Check you're online, then try again."));
    }
    Map? data;
    try {
      data = res.statusCode == 200 ? jsonDecode(res.body) as Map? : null;
    } catch (_) {}
    final loc = data?['location'];
    final lat = loc is Map ? loc['lat'] : null, lng = loc is Map ? loc['lng'] : null;
    final accuracy = data?['accuracy'];
    if (lat is! num || lng is! num || accuracy is! num || accuracy > maxAccuracyM) {
      throw LocationError(() => aps.isNotEmpty
          ? tr('desktop.location.unknownWifi', "Couldn't work out where this computer is from the Wi-Fi around it. Search for a stop, address or postal code instead.")
          : tr('desktop.location.noWifi', "Couldn't work out where this computer is: on Linux it goes by the Wi-Fi networks around, so it needs Wi-Fi turned on. Or search for a stop, address or postal code instead."));
    }
    return Fix(lat.toDouble(), lng.toDouble(), accuracy: accuracy.toDouble());
  }

  /// Where you are: an answer from the last few seconds, or a fresh one.
  static Future<Fix> locate() async {
    if (_last != null && DateTime.now().difference(_lastAt) <= keep) return _last!;
    final asking = _asking ??= _lookUp().then((f) {
      _last = f;
      _lastAt = DateTime.now();
      return f;
    }).whenComplete(() => _asking = null);
    return asking;
  }
}
