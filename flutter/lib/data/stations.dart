// MRT and LRT stations and their exits, so a search for "Bedok MRT" lists the bus stops at the
// station, and the rail lines for the map and Navigate. From the site's /data/rail.json and
// /data/rail-stations.json (sgraildata), kept once fetched. Ported from js/station-search.js.
import '../api/api.dart';
import 'geo.dart';
import 'stops.dart';
import 'store.dart';

import 'package:http/http.dart' as http;
import 'dart:convert';

class Station {
  Station(this.name, this.codes, this.lat, this.lng, this.exits, this.exitNames);
  final String name;
  final List<String> codes;
  final double lat;
  final double lng;
  final List<List<double>> exits;
  final List<String> exitNames;

  static Station from(Map m) => Station(
        '${m['name']}',
        List<String>.from((m['codes'] as List? ?? const []).map((e) => '$e')),
        (m['lat'] as num).toDouble(),
        (m['lng'] as num).toDouble(),
        [for (final e in (m['exits'] as List? ?? const [])) [(e[0] as num).toDouble(), (e[1] as num).toDouble()]],
        List<String>.from((m['exitNames'] as List? ?? const []).map((e) => '$e')),
      );
}

class Stations {
  Stations._();
  static const _radiusM = 250.0;
  static final _queryRe = RegExp(r'^(.+?)\s+(?:(?:mrt|lrt)(?:\s+(?:station|stn))?|station)\.?$', caseSensitive: false);
  static const lrtPrefixes = ['BP', 'SW', 'SE', 'STC', 'PW', 'PE', 'PTC'];
  static const _cacheKey = 'app.rail_stations';

  static List<Station>? _stations;
  static Future<void>? _loading;
  static final Map<Station, List<({String code, double distance})>> _made = {};

  static List<Station>? get all => _stations;

  /// A JSON file from the site's /data/, kept for offline.
  static Future<Object?> siteData(String name, String cacheKey) async {
    if (Api.fake != null) return Api.fake!('data/$name');
    try {
      final r = await http.get(Uri.parse('${Api.site}/data/$name')).timeout(const Duration(seconds: 20));
      if (r.statusCode == 200) {
        Store.I.put(cacheKey, utf8.decode(r.bodyBytes));
        return jsonDecode(utf8.decode(r.bodyBytes));
      }
    } catch (_) {
      // Offline: the copy kept last time.
    }
    final kept = Store.I.get(cacheKey);
    return kept == null ? null : jsonDecode(kept);
  }

  static Future<void> load() => _loading ??= () async {
        final data = await siteData('rail-stations.json', _cacheKey);
        if (data is Map && data['stations'] is List) {
          _stations = [for (final s in data['stations'] as List) Station.from(s as Map)];
        } else {
          _loading = null;
        }
      }();

  static void use(List<Station> stations) => _stations = stations;

  static String _nameKey(String s) => s.toLowerCase().replaceAll("'", '').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).join(' ');

  static Station? find(String query) {
    final m = _stations == null ? null : _queryRe.firstMatch(query.trim());
    if (m == null) return null;
    final wanted = _nameKey(m[1]!);
    for (final s in _stations!) {
      if (_nameKey(s.name) == wanted) return s;
    }
    final starts = _stations!.where((s) => _nameKey(s.name).startsWith(wanted)).toList();
    return starts.length == 1 ? starts.first : null;
  }

  static String label(Station s) {
    bool isLrt(String c) => lrtPrefixes.any((p) => c.startsWith(p));
    final lrt = s.codes.any(isLrt);
    final mrt = s.codes.any((c) => !isLrt(c));
    return '${s.name} ${lrt && mrt ? 'MRT/LRT' : lrt ? 'LRT' : 'MRT'} station';
  }

  static List<({String code, double distance})> stopsAt(Station station) => _made[station] ??= () {
        final points = station.exits.isNotEmpty ? station.exits : [[station.lat, station.lng]];
        final out = <({String code, double distance})>[];
        Stops.index.forEach((code, s) {
          if (s.lat == null || s.lng == null) return;
          var d = double.infinity;
          for (final p in points) {
            final m = metresBetween(p[0], p[1], s.lat!, s.lng!);
            if (m < d) d = m;
          }
          if (d <= _radiusM) out.add((code: code, distance: d));
        });
        out.sort((a, b) => a.distance.compareTo(b.distance));
        return out;
      }();
}
