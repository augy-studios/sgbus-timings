// The MRT and LRT tracks (the site's js/rail-tracks.js), so the live map draws a train ride along
// the rails rather than straight from one station to the next, and Explorer draws every line.
//
// RailTracks.path(route, points): the track from a train leg's first station to its last,
// through each between, as (path, stops), stops the index in path of each station. Null when
// the tracks can't be had or the line has none.
// RailTracks.lines(): every line's track as it is, [(line, points)], for Explorer.
//
// From /data/rail-tracks.json, kept for offline. Each stretch between two stations is cut from
// the part of the line that passes both; the LRT loops and the Circle Line's are rings, cut the
// short way round. A stretch the track can't be matched to stays a straight line.
import 'dart:math' as math;

import 'geo.dart';
import 'stations.dart';

class _Part {
  _Part(this.pts) {
    cum = [0];
    for (var k = 1; k < pts.length; k++) {
      cum.add(cum[k - 1] + metresAB(pts[k - 1], pts[k]));
    }
    total = cum.last;
    ring = pts.length > 2 && metresAB(pts.first, pts.last) <= RailTracks._ringM;
  }
  final List<List<double>> pts;
  late final List<double> cum;
  late final double total;
  late final bool ring;
}

typedef _Pass = ({double along, double m, List<double> at});

class RailTracks {
  RailTracks._();
  static const _nearM = 400.0;
  static const _ringM = 30.0;
  static const _detour = 3.0;
  static const _detourM = 1000.0;

  static Map<String, List<_Part>>? _lines;
  static Future<Map<String, List<_Part>>?>? _loading;
  static final Map<String, ({List<List<double>> path, List<int> stops})> _made = {};

  static Future<Map<String, List<_Part>>?> _load() => _loading ??= () async {
        final data = await Stations.siteData('rail-tracks.json', 'app.rail_tracks');
        if (data is! Map || data['lines'] is! Map) {
          _loading = null;
          return null;
        }
        final out = <String, List<_Part>>{};
        (data['lines'] as Map).forEach((code, parts) {
          out['$code'] = [
            for (final part in parts as List)
              _Part([for (final p in part as List) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]]),
          ];
        });
        return _lines = out;
      }();

  static List<_Pass> _passes(_Part part, List<double> p) {
    final kx = 111320 * math.cos(p[0] * math.pi / 180);
    const ky = 110540.0;
    final found = <_Pass>[];
    _Pass? best;
    final pts = part.pts, cum = part.cum;
    for (var k = 0; k < pts.length - 1; k++) {
      final ax = pts[k][1] * kx, ay = pts[k][0] * ky;
      final dx = pts[k + 1][1] * kx - ax, dy = pts[k + 1][0] * ky - ay;
      final px = p[1] * kx - ax, py = p[0] * ky - ay;
      final len2 = dx * dx + dy * dy;
      final t = len2 > 0 ? ((px * dx + py * dy) / len2).clamp(0.0, 1.0) : 0.0;
      final m = math.sqrt(math.pow(px - t * dx, 2) + math.pow(py - t * dy, 2));
      if (m <= _nearM) {
        if (best == null || m < best.m) {
          best = (
            along: cum[k] + t * (cum[k + 1] - cum[k]),
            m: m,
            at: [pts[k][0] + t * (pts[k + 1][0] - pts[k][0]), pts[k][1] + t * (pts[k + 1][1] - pts[k][1])],
          );
        }
      } else if (best != null) {
        found.add(best);
        best = null;
      }
    }
    if (best != null) found.add(best);
    return found;
  }

  static ({List<List<double>> path, double length}) _cut(_Part part, _Pass a, _Pass b) {
    List<List<double>> inner(double from, double to) {
      final out = <List<double>>[];
      if (from <= to) {
        for (var k = 0; k < part.pts.length; k++) {
          if (part.cum[k] > from && part.cum[k] < to) out.add(part.pts[k]);
        }
      } else {
        for (var k = part.pts.length - 1; k >= 0; k--) {
          if (part.cum[k] < from && part.cum[k] > to) out.add(part.pts[k]);
        }
      }
      return out;
    }

    final straight = (b.along - a.along).abs();
    if (!part.ring || straight <= part.total / 2) return (path: [a.at, ...inner(a.along, b.along), b.at], length: straight);
    final path = b.along > a.along
        ? [a.at, ...inner(a.along, -1), ...inner(part.total + 1, b.along), b.at]
        : [a.at, ...inner(a.along, part.total + 1), ...inner(-1, b.along), b.at];
    return (path: path, length: part.total - straight);
  }

  static List<List<double>>? _stretch(List<_Part> parts, List<double> a, List<double> b) {
    ({List<List<double>> path, double length, double score})? best;
    for (final part in parts) {
      final as = _passes(part, a);
      if (as.isEmpty) continue;
      final bs = _passes(part, b);
      for (final pa in as) {
        for (final pb in bs) {
          final c = _cut(part, pa, pb);
          final score = c.length + pa.m + pb.m;
          if (best == null || score < best.score) best = (path: c.path, length: c.length, score: score);
        }
      }
    }
    if (best == null || best.length > metresAB(a, b) * _detour + _detourM) return null;
    return best.path;
  }

  // The Changi Airport branch is drawn with the East West Line's track.
  static String _lineOf(String? route) {
    final code = (route ?? '').toUpperCase();
    return code == 'CG' ? 'EW' : code;
  }

  static Future<({List<List<double>> path, List<int> stops})?> path(String? route, List<List<double>> points) async {
    if (points.length < 2) return null;
    final key = '${_lineOf(route)}|${points.map((p) => p.join(',')).join(';')}';
    if (_made.containsKey(key)) return _made[key];
    final lines = await _load();
    final parts = lines?[_lineOf(route)];
    if (parts == null) return null;
    final ways = [for (var i = 1; i < points.length; i++) _stretch(parts, points[i - 1], points[i])];
    final path = <List<double>>[points.first];
    final stops = <int>[0];
    for (var i = 0; i < ways.length; i++) {
      final way = ways[i];
      if (way != null) path.addAll(way);
      if (way == null || i + 1 >= ways.length || ways[i + 1] == null) path.add(points[i + 1]);
      stops.add(path.length - 1);
    }
    return _made[key] = (path: path, stops: stops);
  }

  static Future<List<({String line, List<List<double>> points})>> lines() async {
    final all = _lines ?? await _load();
    if (all == null) return const [];
    return [
      for (final e in all.entries)
        for (final part in e.value) (line: e.key, points: part.pts),
    ];
  }
}
