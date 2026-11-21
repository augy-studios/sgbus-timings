// Navigate's list of ways (the site's js/ways.js, in step with it): the order the sort over the list
// picks, each way's tags (Fastest, Least walking, Fewest changes, Your bus), your preferred buses,
// and what the way should cost, roughly.
//
// Preferred buses come from two lists, under the site's keys: one in Settings, for going anywhere
// (sgbus_pref_buses), and one on each saved place (sgbus_place_buses, by its point), which counts
// only when going to within [nearPlaceM] of it.
//
// The fare is the distance fare of PTC's table, January 2026: one fare for the whole way by its
// distance on buses and trains, however many changes, as a card pays it. The distance is along the
// stops and stations ridden, a little more for the roads and tracks between them. Ways across the
// Causeway have no fare here.
import 'dart:convert';
import 'dart:math' as math;

import '../../data/geo.dart';
import '../../data/places.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';

class NavWays {
  NavWays._();

  static const sortKey = 'sgbus_nav_sort';
  static const prefKey = 'sgbus_pref_buses';
  static const placeBusesKey = 'sgbus_place_buses';
  static const fareKey = 'sgbus_fare_type';
  static const sorts = ['best', 'fastest', 'walk', 'changes'];
  static const fareTypes = ['adult', 'student', 'senior', 'workfare'];
  static const walkWeight = 1.5;
  static const nearPlaceM = 400.0;
  static const _maxBuses = 20;
  static const _roadFactor = 1.15;
  static const _trackFactor = 1.1;
  static const _expressExtra = 100;

  /// Cents, by distance: up to 3.2 km, then each kilometre to 40.2 km, then over. Concession tables
  /// stop at over 7.2 km. Senior citizens and persons with disabilities pay the same.
  static const fares = <String, List<int>>{
    'adult': [128, 138, 149, 159, 168, 175, 182, 186, 190, 194, 198, 202, 207, 211, 215, 220, 224, 227, 230, 233, 236, 238, 240, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257],
    'student': [52, 60, 66, 71, 74, 78],
    'senior': [69, 79, 87, 94, 100, 107],
    'workfare': [78, 89, 98, 106, 113, 120, 126, 129, 132, 135, 138, 141, 144, 147, 150, 153, 156, 159, 162, 165, 168, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187],
  };

  static void _write(String key, Object? value) => Store.I.put(key, value == null ? null : jsonEncode(value));

  // ---------- the sort ----------

  static String get sort {
    final v = Store.I.json<Object?>(sortKey, 'best');
    return sorts.contains(v) ? v as String : 'best';
  }

  static set sort(String v) => _write(sortKey, sorts.contains(v) && v != 'best' ? v : null);

  // ---------- preferred buses ----------

  /// Bus numbers typed in a box, as a list: "228, 69 225w" is ["228", "69", "225W"].
  static List<String> parseBuses(String text) {
    final out = <String>[];
    for (final w in text.toUpperCase().split(RegExp(r'[\s,;/]+'))) {
      if (RegExp(r'^[A-Z0-9]{1,5}$').hasMatch(w) && !out.contains(w)) out.add(w);
    }
    return out.take(_maxBuses).toList();
  }

  static List<String> _clean(Object? v) => v is List ? parseBuses(v.map((e) => '$e').join(' ')) : const [];

  static List<String> get preferred => _clean(Store.I.json<Object?>(prefKey, const []));
  static set preferred(List<String> list) => _write(prefKey, _clean(list).isEmpty ? null : _clean(list));

  static String _pointKey(double lat, double lng) => '${lat.toStringAsFixed(5)},${lng.toStringAsFixed(5)}';
  static Map<String, dynamic> _placeMap() {
    final v = Store.I.json<Object?>(placeBusesKey, const {});
    return v is Map ? Map<String, dynamic>.from(v) : {};
  }

  static List<String> placeBuses(double lat, double lng) => _clean(_placeMap()[_pointKey(lat, lng)]);

  static void setPlaceBuses(double lat, double lng, List<String> list) {
    final all = _placeMap();
    final buses = _clean(list);
    if (buses.isEmpty) {
      all.remove(_pointKey(lat, lng));
    } else {
      all[_pointKey(lat, lng)] = buses;
    }
    _write(placeBusesKey, all.isEmpty ? null : all);
  }

  /// The buses you'd rather take going to the point: Settings' list and that of every saved place
  /// near it.
  static Set<String> preferredFor(double? lat, double? lng, {List<Place>? places}) {
    final out = {...preferred};
    if (lat == null || lng == null) return out;
    final map = _placeMap();
    for (final p in places ?? Places.all()) {
      if (metresBetween(p.lat, p.lng, lat, lng) > nearPlaceM) continue;
      out.addAll(_clean(map[_pointKey(p.lat, p.lng)]));
    }
    return out;
  }

  // ---------- facts, order and tags ----------

  static List<Map> _legs(Map o) => ((o['legs'] as List?) ?? const []).cast<Map>();
  static List<Map> _rides(Map o) => _legs(o).where((l) => l['mode'] != 'walk').toList();

  /// Minutes, metres and minutes walked, and changes (getting off at a stop on the way isn't one).
  static ({num minutes, num walkM, num walkMin, int changes}) facts(Map o) {
    final legs = _legs(o);
    final walks = legs.where((l) => l['mode'] == 'walk');
    final v = o['via'] as Map?;
    final halves = v == null ? [legs] : [legs.sublist(0, (v['leg'] as num).toInt()), legs.sublist((v['leg'] as num).toInt())];
    return (
      minutes: (o['minutes'] as num?) ?? 0,
      walkM: walks.fold<num>(0, (s, l) => s + ((l['metres'] as num?) ?? 0)),
      walkMin: walks.fold<num>(0, (s, l) => s + ((l['minutes'] as num?) ?? 0)),
      changes: halves.fold<int>(0, (s, h) => s + math.max(0, h.where((l) => l['mode'] != 'walk').length - 1)),
    );
  }

  static bool ridesPreferred(Map o, Set<String> buses) =>
      buses.isNotEmpty && _rides(o).any((l) => l['mode'] == 'bus' && buses.contains('${l['route']}'.toUpperCase()));

  /// The ways in the order of [by]: Best, your buses first, then by minutes with walking counted at
  /// [walkWeight]. Least walking and Fewest changes leave walking all the way last. Stable.
  static List<T> order<T extends Map>(List<T> options, {String? by, Set<String> buses = const {}}) {
    final f = {for (final o in options) o: facts(o)};
    num score(T o) => f[o]!.minutes + (walkWeight - 1) * f[o]!.walkMin;
    int walkOnly(T o) => o['walkOnly'] == true ? 1 : 0;
    int pref(T o) => ridesPreferred(o, buses) ? 1 : 0;
    int cmp(num a, num b) => a.compareTo(b);
    final s = sorts.contains(by) ? by! : sort;
    int compare(T a, T b) => switch (s) {
          'fastest' => cmp(f[a]!.minutes, f[b]!.minutes),
          'walk' => cmp(walkOnly(a), walkOnly(b)).let((c) => c != 0 ? c : cmp(f[a]!.walkM, f[b]!.walkM)).let((c) => c != 0 ? c : cmp(f[a]!.minutes, f[b]!.minutes)),
          'changes' => cmp(walkOnly(a), walkOnly(b)).let((c) => c != 0 ? c : cmp(f[a]!.changes, f[b]!.changes)).let((c) => c != 0 ? c : cmp(f[a]!.minutes, f[b]!.minutes)),
          _ => cmp(pref(b), pref(a)).let((c) => c != 0 ? c : cmp(score(a), score(b))).let((c) => c != 0 ? c : cmp(f[a]!.minutes, f[b]!.minutes)),
        };
    final indexed = options.indexed.toList()..sort((a, b) => compare(a.$2, b.$2).let((c) => c != 0 ? c : a.$1.compareTo(b.$1)));
    return [for (final (_, o) in indexed) o];
  }

  /// Each way's tags, 'fastest', 'walk', 'changes' and 'mine': the best at each among the ways by bus
  /// and train, where that's better than some other way, the first such in order of minutes; and
  /// every way riding one of your buses.
  static Map<Map, List<String>> tags(List<Map> options, {Set<String> buses = const {}}) {
    final out = {for (final o in options) o: <String>[]};
    final ways = options.where((o) => o['walkOnly'] != true).indexed.toList()
      ..sort((a, b) => ((a.$2['minutes'] as num?) ?? 0).compareTo((b.$2['minutes'] as num?) ?? 0).let((c) => c != 0 ? c : a.$1.compareTo(b.$1)));
    if (ways.length > 1) {
      final f = {for (final (_, o) in ways) o: facts(o)};
      for (final (tag, num Function(Map) of) in [
        ('fastest', (Map o) => f[o]!.minutes),
        ('walk', (Map o) => f[o]!.walkM),
        ('changes', (Map o) => f[o]!.changes),
      ]) {
        final values = [for (final (_, o) in ways) of(o)];
        final least = values.reduce(math.min);
        if (least == values.reduce(math.max)) continue;
        out[ways[values.indexOf(least)].$2]!.add(tag);
      }
    }
    for (final o in options) {
      if (ridesPreferred(o, buses)) out[o]!.add('mine');
    }
    return out;
  }

  // ---------- the fare ----------

  static String get fareType {
    final v = Store.I.json<Object?>(fareKey, 'adult');
    return fareTypes.contains(v) ? v as String : 'adult';
  }

  static set fareType(String v) => _write(fareKey, fareTypes.contains(v) && v != 'adult' ? v : null);

  static double _rideMetres(Map leg) {
    final path = (leg['path'] as List?) ?? const [];
    var m = 0.0;
    for (var i = 1; i < path.length; i++) {
      final a = path[i - 1] as List, b = path[i] as List;
      m += metresBetween((a[0] as num).toDouble(), (a[1] as num).toDouble(), (b[0] as num).toDouble(), (b[1] as num).toDouble());
    }
    return m * (leg['mode'] == 'train' ? _trackFactor : _roadFactor);
  }

  /// The band of a table for a distance in kilometres, counted to the tenth as the fare is.
  static int band(double km, List<int> table) {
    final tenths = (km * 10).round() / 10;
    final i = tenths <= 3.2 ? 0 : (((tenths - 3.2) * 10).round() / 10).ceil();
    return table[math.min(i, table.length - 1)];
  }

  /// What a way should cost by card, or null with nothing to pay for (walking all the way, or only
  /// shuttles) or no fare known (across the Causeway). [category] is a bus's LTA category, for the
  /// express fare.
  static ({int cents, double km})? fare(Map o, {String? type, String? Function(String no)? category}) {
    final paid = _rides(o).where((l) => l['campus'] == null).toList();
    if (paid.isEmpty || paid.any((l) => ((l['customs'] as List?) ?? const []).isNotEmpty || ((l['path'] as List?) ?? const []).isEmpty)) return null;
    final km = paid.fold<double>(0, (s, l) => s + _rideMetres(l)) / 1000;
    final t = fareTypes.contains(type) ? type! : fareType;
    var cents = band(km, fares[t]!);
    if (t == 'adult' && category != null && paid.any((l) => l['mode'] == 'bus' && category('${l['route']}') == 'EXPRESS')) cents += _expressExtra;
    return (cents: cents, km: (km * 10).round() / 10);
  }

  static String fareText(int cents) => 'S\$${(cents / 100).toStringAsFixed(2)}';
}

/// A fare type in words, as Settings has it.
String fareTypeName(String type) => switch (type) {
      'student' => tr('fare.student', 'Student'),
      'senior' => tr('fare.senior', 'Senior citizen or PwD'),
      'workfare' => tr('fare.workfare', 'Workfare'),
      _ => tr('fare.adult', 'Adult'),
    };

extension _Let<T> on T {
  R let<R>(R Function(T it) fn) => fn(this);
}
