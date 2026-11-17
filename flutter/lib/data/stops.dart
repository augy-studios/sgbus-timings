// Every bus stop in Singapore, code -> { n, road, lat, lng }, as the site keeps it
// (script.js's ensureStopsIndex, sgbus_stops_v3): fetched once from /api/bus-stops and kept.
import '../api/api.dart';
import 'geo.dart';
import 'store.dart';

class Stop {
  const Stop(this.code, this.name, this.road, this.lat, this.lng);
  final String code;
  final String name;
  final String road;
  final double? lat;
  final double? lng;

  String get find => '$name\n$road'.toLowerCase();
}

class Stops {
  Stops._();
  static const cacheKey = 'sgbus_stops_v3';

  static Map<String, Stop> _index = {};
  static Future<Map<String, Stop>>? _loading;
  static List<Stop> _list = const [];

  static Map<String, Stop> get index => _index;
  static List<Stop> get all => _list;
  static bool get ready => _index.isNotEmpty;

  static Stop? of(String code) => _index[code];
  static String nameOf(String code) => _index[code]?.name ?? '';

  static void _take(Map<String, dynamic> raw) {
    final out = <String, Stop>{};
    raw.forEach((code, v) {
      if (v is! Map) return;
      out[code] = Stop(code, '${v['n'] ?? ''}', '${v['road'] ?? ''}', (v['lat'] as num?)?.toDouble(), (v['lng'] as num?)?.toDouble());
    });
    _index = out;
    _list = out.values.toList();
  }

  static Future<Map<String, Stop>> load() {
    if (ready) return Future.value(_index);
    return _loading ??= () async {
      final cached = Store.I.json<Map>(cacheKey, const {});
      if (cached.isNotEmpty) {
        _take(Map<String, dynamic>.from(cached));
        return _index;
      }
      try {
        final rows = await Api.get('bus-stops');
        final map = <String, dynamic>{};
        for (final r in (rows as List? ?? const [])) {
          if (r is! Map) continue;
          map['${r['c']}'] = {'n': r['n'], 'road': r['r'], 'lat': r['la'], 'lng': r['lo']};
        }
        Store.I.putJson(cacheKey, map);
        _take(map);
      } catch (_) {
        _loading = null;
      }
      return _index;
    }();
  }

  /// For tests and screenshots: the stops as /api/bus-stops lists them.
  static void useRows(List<dynamic> rows) {
    final map = <String, dynamic>{};
    for (final r in rows) {
      if (r is Map) map['${r['c']}'] = {'n': r['n'], 'road': r['r'], 'lat': r['la'], 'lng': r['lo']};
    }
    _take(map);
  }

  /// The stops nearest a point, nearest first, each with its distance.
  static List<({Stop stop, double metres})> near(double lat, double lng, {int limit = 8}) {
    final out = <({Stop stop, double metres})>[];
    for (final s in _list) {
      if (s.lat == null || s.lng == null) continue;
      out.add((stop: s, metres: metresBetween(lat, lng, s.lat!, s.lng!)));
    }
    out.sort((a, b) => a.metres.compareTo(b.metres));
    return out.take(limit).toList();
  }
}
