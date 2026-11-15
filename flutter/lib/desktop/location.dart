// Your location on Linux (desktop-features-spec §12), for Near me, Navigate's "where I am", the
// live map and a trip, when the system's own location service (GeoClue, through geolocator) can't
// say: none installed, no agent, or turned away. Windows and macOS always use the system's.
//
// As the Electron app's location.js did: it scans the Wi-Fi networks around with NetworkManager
// (nmcli, on nearly every Linux desktop) and asks BeaconDB (https://beacondb.net, an open database
// of where Wi-Fi networks are, the one GeoClue itself now uses) where they are. What's sent is the
// networks' hardware addresses and strengths, never their names or anything of yours; networks
// that ask not to be mapped (a name ending "_nomap") are left out. GNOME's own Location Services
// switch is respected: off, and nothing is looked up.
//
// Without Wi-Fi, BeaconDB can only go by the internet address, which is a town's width out, no use
// for the stops near you: anything rougher than 3 km is turned down.
// test/desktop/location_test.dart checks the rules. Linux only, so unbuilt on a Mac.
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../data/location.dart';
import '../i18n/i18n.dart';
import 'desktop.dart';

/// Finds where a Linux computer is from the Wi-Fi around it, when the system can't say.
class DeskLocation {
  DeskLocation._();

  /// BeaconDB's lookup, which takes the same request as Google's and Mozilla's did.
  static const geolocate = 'https://api.beacondb.net/v1/geolocate';

  /// The roughest answer that's any use, in metres.
  static const maxAccuracyM = 3000.0;

  /// One answer is kept this long, so a trip's steady asking doesn't scan and ask every time.
  static const keep = Duration(seconds: 4);

  /// At most this many networks are sent: the strongest.
  static const maxNetworks = 40;

  static Fix? _last;
  static DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);
  static Future<Fix>? _asking;

  /// On Linux, makes this the shared location code's fallback (data/location.dart), for when
  /// the system's own location fails.
  static void init() {
    if (Platform.isLinux) Locate.fallback = locate;
  }

  /// Runs a command and gives its output, or null if it isn't there, fails or takes too long.
  /// LC_ALL=C keeps the output in English, so it reads the same on every computer.
  static Future<String?> _run(String cmd, List<String> args, {Duration timeout = const Duration(seconds: 12)}) async {
    try {
      final r = await Process.run(cmd, args, environment: {'LC_ALL': 'C'}).timeout(timeout);
      return r.exitCode == 0 ? '${r.stdout}' : null;
    } catch (_) {
      return null;
    }
  }

  /// Whether GNOME's Settings > Privacy > Location Services is on. Elsewhere (KDE and others), or
  /// without gsettings, there's no such switch to go by, so it counts as on.
  static Future<bool> _systemAllows() async {
    final out = await _run('gsettings', ['get', 'org.gnome.system.location', 'enabled'], timeout: const Duration(seconds: 3));
    return out == null || out.trim() != 'false';
  }

  /// One line of nmcli's terse (-t) output, split into its fields. Fields are separated by ":",
  /// and a ":" inside a field (every BSSID has five) is written "\:".
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

  /// nmcli's 0 to 100 signal score as dBm (about -100 to -50), rounded as JavaScript's
  /// Math.round did in the Electron app (halves up), so both send the same numbers.
  static int dbm(num signal) => (signal / 2 - 100 + .5).floor();

  /// The Wi-Fi networks in nmcli's listing (SSID, BSSID, SIGNAL, FREQ per line), as BeaconDB
  /// takes them: each hardware address once, none whose name ends "_nomap", the strongest 40.
  static List<Map<String, Object>> parse(String listing) {
    final seen = <String>{};
    final out = <Map<String, Object>>[];
    final bssid = RegExp(r'^([0-9a-f]{2}:){5}[0-9a-f]{2}$');
    final noMap = RegExp(r'_nomap$', caseSensitive: false);
    for (final line in listing.split('\n')) {
      final f = fields(line);
      if (f.length < 4) continue;
      final ssid = f[0], mac = f[1].toLowerCase(), signal = f[2], freq = f[3];
      if (!bssid.hasMatch(mac) || seen.contains(mac) || noMap.hasMatch(ssid)) continue;
      seen.add(mac);
      // FREQ reads like "2437 MHz".
      final mhz = int.tryParse(freq.split(' ').first);
      out.add({'macAddress': mac, 'signalStrength': dbm(num.tryParse(signal) ?? 0), 'frequency': ?mhz});
    }
    out.sort((a, b) => (b['signalStrength'] as int).compareTo(a['signalStrength'] as int));
    return out.take(maxNetworks).toList();
  }

  /// BeaconDB's answer ({location: {lat, lng}, accuracy}) as a fix, or null if it's missing,
  /// unreadable, or rougher than [maxAccuracyM] (a guess from the internet address).
  static Fix? fixFrom(Object? data) {
    if (data is! Map) return null;
    final loc = data['location'];
    final lat = loc is Map ? loc['lat'] : null, lng = loc is Map ? loc['lng'] : null;
    final accuracy = data['accuracy'];
    if (lat is! num || lng is! num || accuracy is! num || accuracy > maxAccuracyM) return null;
    return Fix(lat.toDouble(), lng.toDouble(), accuracy: accuracy.toDouble());
  }

  /// One fresh look-up: the GNOME switch, a Wi-Fi scan, then BeaconDB. Throws a [LocationError]
  /// with words for the person when it can't tell.
  static Future<Fix> _lookUp() async {
    if (!await _systemAllows()) {
      throw LocationError(() => tr('desktop.location.off', "Location Services are off on this computer. Turn them on in your system's Settings, under Privacy, to use your location."), denied: true);
    }
    // A fresh scan if NetworkManager allows one (it refuses more than one every few seconds, and
    // then lists what it last saw).
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
    Object? data;
    try {
      data = res.statusCode == 200 ? jsonDecode(res.body) : null;
    } catch (_) {}
    final fix = fixFrom(data);
    if (fix != null) return fix;
    throw LocationError(() => aps.isNotEmpty
        ? tr('desktop.location.unknownWifi', "Couldn't work out where this computer is from the Wi-Fi around it. Search for a stop, address or postal code instead.")
        : tr('desktop.location.noWifi', "Couldn't work out where this computer is: on Linux it goes by the Wi-Fi networks around, so it needs Wi-Fi turned on. Or search for a stop, address or postal code instead."));
  }

  /// Where you are: an answer from the last few seconds, or a fresh one. Two callers asking at
  /// once share the same look-up.
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
