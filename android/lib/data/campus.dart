// Shuttle buses: NUS's and NTU's campus shuttles, and the island's other free and paid ones
// (IKEA's, Changi Airport's, SGH's and the rest), from their routes and timetables, as the
// site's js/campus.js has them; keep in step with it. A stop says what the timetable does,
// "Every 8–10 min" while a route runs at a frequency, or the next departures from where it
// starts, and when the next bus is once it's stopped for the day; live where the operator
// shares it (/api/shuttle-live).
//
// The data is the site's: /data/campus/nus.json, ntu.json, config.json (each university's name,
// colours, NUS's term dates and its credit) and shuttles.json (the other shuttles, by group),
// read as they are, and roads.json, each route's road for Explorer. Built against LTA's stops:
// a stop with LTA's code is that stop, one of a university's own is a stop of its own, and one
// within mergeM of an LTA stop is taken as that stop.
//
// A day is Singapore's: a weekday, Saturday, or Sunday and public holidays together. A route
// with times for ph_eve runs them on the day before a public holiday, unless that's a Sunday or
// a holiday itself. NUS's term or vacation is by config.json's dates.
import 'dart:math' as math;

import 'package:flutter/painting.dart';

import '../api/api.dart';
import '../i18n/i18n.dart';
import 'stations.dart';
import 'stops.dart';
import 'store.dart';
import 'when.dart';

class CampusBand {
  const CampusBand(this.from, this.to, this.min, this.max);
  final int from;
  final int to;
  final num min;
  final num max;
}

/// A day's times: frequency bands, or departures from each terminal (minutes into the day).
class CampusSlot {
  List<CampusBand>? bands;
  Map<String, List<int>>? departs;
}

class CampusStop {
  CampusStop({required this.key, required this.lta, required this.uni, required this.id, required this.name, required this.road, required this.lat, required this.lng});
  final String key; // an LTA stop's code, or a campus stop's own id
  final bool lta;
  final String uni;
  final String id;
  final String name;
  final String road;
  final double lat;
  final double lng;
  final List<({CampusRoute route, int i})> routes = [];
}

class CampusRoute {
  CampusRoute({
    required this.key,
    required this.uni,
    required this.code,
    required this.colour,
    required this.ids,
    required this.keys,
    required this.timings,
    required this.name,
    required this.fare,
    required this.fareText,
    required this.access,
    required this.live,
    this.place = const [],
    this.kmh,
  });
  final String key; // "nus:A1"
  final String uni;
  final String code; // what's shown
  final String colour; // #rrggbb
  final List<String> ids; // stop ids in the route's file
  final List<String?> keys; // each stop's key, null where it couldn't be placed
  final Map<String, Map<String, CampusSlot>> timings; // season (term, vacation, all) -> day -> slot
  final String name;
  final String fare; // free, paid
  final String fareText;
  final String access; // public, guests, residents
  final Map? live; // { provider, stops: { id: param } }

  /// A hotel's or a condo's own stops' keys: it's only for ways from or to them (data/nav_core.dart).
  final List<String> place;
  final num? kmh;

  bool get loop => ids.first == ids.last;
  bool get seasonal => timings.containsKey('term') || timings.containsKey('vacation');
  Color get color => Campus.colorOf(colour);
}

/// What the timetable says at a stop of a route at a moment.
class CampusStatus {
  CampusStatus(this.state, {this.season, this.min, this.max, this.last, this.at, this.from, this.here = false, this.end = false, this.times = const [], this.next});
  final String state; // every, first, gap, departs, done, notToday
  final String? season;
  final num? min;
  final num? max;
  final int? last;
  final int? at;
  final String? from;
  final bool here;
  final bool end;
  final List<int> times;
  final ({int inDays, int dow, int at, String? from})? next;
}

class CampusModel {
  CampusModel(this.stops, this.routes, this.problems, this.notes, this.config);
  final Map<String, CampusStop> stops;
  final List<CampusRoute> routes;
  final List<String> problems;
  final List<String> notes;
  final Map<String, dynamic> config;
}

class Campus {
  Campus._();

  static const mergeM = 10.0;
  static const _dayMs = 86400000;
  static const _seasons = ['term', 'vacation'];
  static const _dayKeys = {
    'weekday': 'weekday', 'weekdays': 'weekday', 'mon_fri': 'weekday', 'sat': 'sat', 'saturday': 'sat', 'sun_ph': 'sun_ph',
    'sun': 'sun_ph', 'sunday': 'sun_ph', 'ph': 'sun_ph', 'ph_eve': 'ph_eve', 'eve': 'ph_eve',
  };

  static String _pad(int n) => n.toString().padLeft(2, '0');

  /// "0715" as minutes into the day, 435; null if it isn't a time.
  static int? hhmm(Object? s) {
    final m = RegExp(r'^(\d\d)(\d\d)$').firstMatch('${s ?? ''}');
    if (m == null || int.parse(m[1]!) > 24 || int.parse(m[2]!) > 59) return null;
    return int.parse(m[1]!) * 60 + int.parse(m[2]!);
  }

  static String clock(int min) => '${_pad((min ~/ 60) % 24)}:${_pad(min % 60)}';

  /// "1.2989392, 103.7741488" as [lat, lng], or null; one outside Singapore is a typo.
  static List<double>? parseLoc(Object? loc) {
    final m = RegExp(r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$').firstMatch('${loc ?? ''}');
    if (m == null) return null;
    final lat = double.parse(m[1]!), lng = double.parse(m[2]!);
    if (lat < 1.1 || lat > 1.5 || lng < 103.5 || lng > 104.2) return null;
    return [lat, lng];
  }

  static double metres(List<double> a, List<double> b) {
    double rad(double d) => d * math.pi / 180;
    final h = math.pow(math.sin(rad(b[0] - a[0]) / 2), 2) + math.cos(rad(a[0])) * math.cos(rad(b[0])) * math.pow(math.sin(rad(b[1] - a[1]) / 2), 2);
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
  }

  static Color colorOf(String hex) {
    final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(hex);
    return m == null ? const Color(0xFF7A4FD6) : Color(0xFF000000 | int.parse(m[1]!, radix: 16));
  }

  /// Black or white, whichever reads better on a route's colour.
  static Color inkOn(String hex) {
    final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(hex);
    if (m == null) return const Color(0xFFFFFFFF);
    double lin(int i) {
      final c = int.parse(m[1]!.substring(i, i + 2), radix: 16) / 255;
      return c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
    }

    final l = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
    return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? const Color(0xFF000000) : const Color(0xFFFFFFFF);
  }

  // ---------- reading the timings ----------

  /// A route's `timings`, whatever its shape, as season -> day -> slot. What can't be read goes
  /// in `problems` as words, and is left out.
  static Map<String, Map<String, CampusSlot>> readTimings(Object? timings, List<String> routeStops, String where, List<String> problems) {
    final out = <String, Map<String, CampusSlot>>{};
    CampusSlot slotOf(({String? season, String? day, String? terminal}) ctx) =>
        (out[ctx.season ?? 'all'] ??= {})[ctx.day!] ??= CampusSlot();

    void leaf(List list, ({String? season, String? day, String? terminal}) ctx, String at) {
      if (ctx.day == null) return problems.add('$at: times with no day');
      if (list.every((x) => x is String)) {
        if (ctx.terminal == null) return problems.add('$at: departure times with no stop they leave from');
        final mins = <int>[];
        for (final x in list) {
          final m = hhmm(x);
          if (m == null) {
            problems.add('$at: "$x" isn\'t a time');
          } else {
            mins.add(m);
          }
        }
        final slot = slotOf(ctx);
        if (slot.bands != null) return problems.add('$at: departure times and frequencies on the same day');
        slot.departs ??= {};
        slot.departs![ctx.terminal!] = {...?slot.departs![ctx.terminal!], ...mins}.toList()..sort();
        return;
      }
      if (list.every((x) => x is Map && x.containsKey('start'))) {
        final bands = <CampusBand>[];
        for (final b in list.cast<Map>()) {
          final from = hhmm(b['start']), to = hhmm(b['end']);
          final min = num.tryParse('${b['min']}'), max = num.tryParse('${b['max']}');
          if (from == null || to == null || to < from) {
            problems.add('$at: ${b['start']}-${b['end']} isn\'t a span of time');
          } else if (min == null || !(min > 0) || max == null || !(max >= min)) {
            problems.add('$at: every ${b['min']}-${b['max']} min isn\'t a frequency');
          } else {
            bands.add(CampusBand(from, to, min, max));
          }
        }
        final slot = slotOf(ctx);
        if (slot.departs != null) return problems.add('$at: departure times and frequencies on the same day');
        slot.bands = [...?slot.bands, ...bands]..sort((a, b) => a.from != b.from ? a.from - b.from : a.to - b.to);
        return;
      }
      problems.add("$at: a list that's neither times nor frequencies");
    }

    void walk(Object? node, ({String? season, String? day, String? terminal}) ctx, String at) {
      if (node is List) return leaf(node, ctx, at);
      if (node is! Map) return problems.add('$at: not a list or a group');
      node.forEach((k, v) {
        final here = '$at.$k';
        if (_seasons.contains(k)) {
          if (ctx.season != null) {
            problems.add('$here: a season inside a season');
          } else {
            walk(v, (season: '$k', day: ctx.day, terminal: ctx.terminal), here);
          }
        } else if (_dayKeys.containsKey(k)) {
          if (ctx.day != null) {
            problems.add('$here: a day inside a day');
          } else {
            walk(v, (season: ctx.season, day: _dayKeys[k], terminal: ctx.terminal), here);
          }
        } else if (k == 'daily') {
          if (ctx.day != null) {
            problems.add('$here: a day inside a day');
          } else {
            for (final day in const ['weekday', 'sat', 'sun_ph']) {
              walk(v, (season: ctx.season, day: day, terminal: ctx.terminal), here);
            }
          }
        } else if (routeStops.contains('$k')) {
          if (ctx.terminal != null) {
            problems.add('$here: a stop inside a stop');
          } else {
            walk(v, (season: ctx.season, day: ctx.day, terminal: '$k'), here);
          }
        } else {
          problems.add('$here: "$k" isn\'t a season, a day or a stop on the route');
        }
      });
    }

    walk(timings, (season: null, day: null, terminal: null), where);
    if (out.containsKey('all') && (out.containsKey('term') || out.containsKey('vacation'))) problems.add('$where: some times by term and some not');
    return out;
  }

  // ---------- the stops and routes ----------

  /// The shuttles from the site's files (`raw`: { nus, ntu, config, shuttles }) against LTA's
  /// stops (code -> Stop).
  static CampusModel build(Map raw, Map<String, Stop> lta) {
    final stops = <String, CampusStop>{};
    final routes = <CampusRoute>[];
    final problems = <String>[];
    final notes = <String>[];
    Stop? ltaStop(String id) => RegExp(r'^\d{5}$').hasMatch(id) && lta[id]?.lat != null && lta[id]?.lng != null ? lta[id] : null;
    String? ltaNear(List<double> at) {
      const box = 0.0002;
      for (final s in lta.values) {
        if (s.lat == null || s.lng == null || (s.lat! - at[0]).abs() > box || (s.lng! - at[1]).abs() > box) continue;
        if (metres(at, [s.lat!, s.lng!]) <= mergeM) return s.code;
      }
      return null;
    }

    final groups = raw['shuttles'] is Map && raw['shuttles']['groups'] is Map ? Map<String, dynamic>.from(raw['shuttles']['groups'] as Map) : <String, dynamic>{};
    final rawConfig = raw['config'] is Map ? Map<String, dynamic>.from(raw['config'] as Map) : <String, dynamic>{};
    final sources = [
      for (final uni in const ['nus', 'ntu']) (uni, raw[uni], rawConfig[uni]),
      for (final e in groups.entries) (e.key, e.value, e.value),
    ];
    for (final (uni, data, conf0) in sources) {
      if (data is! Map) continue;
      final conf = conf0 is Map ? conf0 : const {};
      final own = <String, Map>{for (final s in (data['stops'] as List? ?? const [])) if (s is Map) '${s['id']}': s};
      final keyOf = <String, String?>{};

      String? resolve(String id, String where) {
        if (keyOf.containsKey(id)) return keyOf[id];
        final s = own[id];
        final l = ltaStop(id);
        String? key;
        if (l != null) {
          key = id;
          stops.putIfAbsent(key, () => CampusStop(key: id, lta: true, uni: uni, id: id, name: l.name.isNotEmpty ? l.name : '${s?['name'] ?? id}', road: l.road.isNotEmpty ? l.road : '${s?['road'] ?? ''}', lat: l.lat!, lng: l.lng!));
          if (s == null) {
            notes.add("$where: stop $id isn't in $uni.json's stops; LTA's ${l.name.isNotEmpty ? l.name : id}${l.road.isNotEmpty ? ', ${l.road}' : ''}");
          } else if (s['loc'] == null) {
            notes.add("$uni stop $id (${s['name']}) placed by LTA's stops");
          }
        } else if (s != null && parseLoc(s['loc']) != null) {
          final at = parseLoc(s['loc'])!;
          final near = RegExp(r'^\d{5}$').hasMatch(id) ? null : ltaNear(at);
          if (near != null) {
            key = near;
            final n = lta[near]!;
            stops.putIfAbsent(near, () => CampusStop(key: near, lta: true, uni: uni, id: near, name: n.name.isNotEmpty ? n.name : near, road: n.road, lat: n.lat!, lng: n.lng!));
            notes.add("$uni stop $id (${s['name']}) is within ${mergeM.round()} m of LTA's $near, so shown as that stop");
          } else {
            key = id;
            stops.putIfAbsent(id, () => CampusStop(key: id, lta: false, uni: uni, id: id, name: '${s['name'] ?? id}', road: '${s['road'] ?? ''}', lat: at[0], lng: at[1]));
          }
        } else {
          problems.add('$where: stop $id${s != null ? ' (${s['name']})' : ''} has no position${RegExp(r'^\d{5}$').hasMatch(id) ? ', and LTA has no such stop' : ''}');
        }
        keyOf[id] = key;
        return key;
      }

      for (final r in (data['routes'] as List? ?? const [])) {
        if (r is! Map) continue;
        final id = '${r['id'] ?? r['name'] ?? ''}';
        final code = '${(r['badge'] ?? '').toString().isNotEmpty ? r['badge'] : id}';
        final where = '$uni $id';
        final ids = [for (final s in (r['stops'] as List? ?? const [])) '$s'];
        if (code.isEmpty || ids.length < 2) {
          problems.add('$where: a route needs a name and two stops or more');
          continue;
        }
        final keys = [for (final s in ids) resolve(s, where)];
        final timings = readTimings(r['timings'] ?? const {}, ids, where, problems);
        final routeColours = conf['routes'] is Map ? conf['routes'] as Map : const {};
        String str(Object? v) => v == null ? '' : '$v';
        final route = CampusRoute(
          key: '$uni:$id',
          uni: uni,
          code: code,
          colour: str(r['colour']).isNotEmpty ? str(r['colour']) : str(routeColours[code]).isNotEmpty ? str(routeColours[code]) : str(conf['colour']).isNotEmpty ? str(conf['colour']) : '#7a4fd6',
          ids: ids,
          keys: keys,
          timings: timings,
          name: str(r['label']),
          fare: str(r['fare']).isNotEmpty ? str(r['fare']) : str(conf['fare']).isNotEmpty ? str(conf['fare']) : 'free',
          fareText: str(r['fareText']).isNotEmpty ? str(r['fareText']) : str(conf['fareText']),
          access: str(r['access']).isNotEmpty ? str(r['access']) : str(conf['access']).isNotEmpty ? str(conf['access']) : 'public',
          live: r['live'] is Map ? r['live'] as Map : null,
          place: [
            for (final p in ((r['place'] ?? conf['place']) as List? ?? const []))
              if (resolve('$p', where) != null) resolve('$p', where)!,
          ],
          kmh: () {
            final n = num.tryParse('${r['kmh'] ?? ''}');
            return n == null || n == 0 ? null : n;
          }(),
        );
        routes.add(route);
        for (var i = 0; i < keys.length; i++) {
          final stop = keys[i] == null ? null : stops[keys[i]];
          if (stop != null && !stop.routes.any((x) => x.route == route)) stop.routes.add((route: route, i: i));
        }
      }
      for (final id in own.keys) {
        if (!keyOf.containsKey(id)) notes.add("$uni stop $id (${own[id]!['name']}) isn't on any route, so isn't shown");
      }
    }
    final config = {...rawConfig};
    groups.forEach((k, g) {
      if (g is Map) {
        config[k] = {'name': g['name'] ?? k, 'colour': g['colour'], 'routes': g['routes'], 'credit': g['credit'], 'creditUrl': g['creditUrl'], 'fare': g['fare'], 'access': g['access']};
      }
    });
    return CampusModel(stops, routes, problems, notes, config);
  }

  // ---------- what the timetable says now ----------

  static ({String ymd, int dow, int min}) sgDay(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms + 8 * 3600000, isUtc: true);
    return (ymd: '${d.year}-${_pad(d.month)}-${_pad(d.day)}', dow: d.weekday % 7, min: d.hour * 60 + d.minute);
  }

  static String _dayType(String ymd, int dow) => dow == 0 || When.isHoliday(ymd) ? 'sun_ph' : dow == 6 ? 'sat' : 'weekday';

  /// 'term' or 'vacation' on a day, by a university's config.
  static String season(String ymd, Object? conf) {
    final terms = conf is Map ? conf['terms'] : null;
    if (terms is! List) return 'term';
    final covers = (conf as Map)['covers'];
    if (covers is List && covers.length >= 2 && (ymd.compareTo('${covers[0]}') < 0 || ymd.compareTo('${covers[1]}') > 0)) return 'term';
    return terms.any((t) => t is List && t.length >= 2 && ymd.compareTo('${t[0]}') >= 0 && ymd.compareTo('${t[1]}') <= 0) ? 'term' : 'vacation';
  }

  static String _nextYmd(String ymd) {
    final d = DateTime.parse('${ymd}T00:00:00Z').add(const Duration(days: 1));
    return '${d.year}-${_pad(d.month)}-${_pad(d.day)}';
  }

  static ({String? season, String day, CampusSlot? slot}) _slotFor(CampusRoute route, String ymd, int dow, Map config) {
    final s = route.seasonal ? season(ymd, config[route.uni]) : null;
    final days = (s != null ? route.timings[s] ?? route.timings[s == 'term' ? 'vacation' : 'term'] : route.timings['all']) ?? const {};
    var day = _dayType(ymd, dow);
    if (day != 'sun_ph' && days.containsKey('ph_eve') && When.isHoliday(_nextYmd(ymd))) day = 'ph_eve';
    return (season: s, day: day, slot: days[day]);
  }

  static String? _terminalFor(CampusRoute route, int i, CampusSlot slot) {
    final ends = slot.departs?.keys.toSet() ?? const <String>{};
    String? before, last;
    for (var k = 0; k < route.ids.length; k++) {
      final id = route.ids[k];
      if (!ends.contains(id)) continue;
      if (k <= i) before = id;
      last = id;
    }
    return before ?? last;
  }

  static int? _firstOf(CampusRoute route, int i, CampusSlot slot) {
    if (slot.bands != null) return slot.bands!.isEmpty ? null : slot.bands!.first.from;
    final list = slot.departs![_terminalFor(route, i, slot)];
    return list == null || list.isEmpty ? null : list.first;
  }

  static ({int inDays, int dow, int at, String? from})? _nextRun(CampusRoute route, int i, int ms, Map config) {
    for (var d = 1; d <= 7; d++) {
      final day = sgDay(ms + d * _dayMs);
      final slot = _slotFor(route, day.ymd, day.dow, config).slot;
      final at = slot == null ? null : _firstOf(route, i, slot);
      if (at != null) return (inDays: d, dow: day.dow, at: at, from: slot!.departs != null ? _terminalFor(route, i, slot) : null);
    }
    return null;
  }

  /// What the timetable says at the `i`th stop of `route` at the moment `ms`.
  static CampusStatus status(CampusRoute route, int i, int ms, [Map? config]) {
    final conf = config ?? model?.config ?? const {};
    final now = sgDay(ms);
    final today = _slotFor(route, now.ymd, now.dow, conf);
    final slot = today.slot;
    final bands = slot?.bands;
    if (bands != null && bands.isNotEmpty) {
      CampusBand? on;
      for (final b in bands) {
        if (b.from <= now.min && now.min <= b.to) on = b;
      }
      if (on != null) return CampusStatus('every', season: today.season, min: on.min, max: on.max, last: bands.last.to);
      final next = bands.where((b) => b.from > now.min).firstOrNull;
      if (next != null) return CampusStatus(now.min < bands.first.from ? 'first' : 'gap', season: today.season, at: next.from, min: next.min, max: next.max);
    } else if (slot?.departs != null) {
      final from = _terminalFor(route, i, slot!);
      final times = (slot.departs![from] ?? const <int>[]).where((t) => t >= now.min).take(3).toList();
      if (times.isNotEmpty) {
        return CampusStatus('departs', season: today.season, from: from, here: route.ids[i] == from, end: !route.loop && i == route.ids.length - 1, times: times);
      }
    }
    return CampusStatus(slot != null ? 'done' : 'notToday', season: today.season, next: _nextRun(route, i, ms, conf));
  }

  static String _dayName(int dow) => [
        tr('campus.dow.sun', 'Sun'), tr('campus.dow.mon', 'Mon'), tr('campus.dow.tue', 'Tue'), tr('campus.dow.wed', 'Wed'),
        tr('campus.dow.thu', 'Thu'), tr('campus.dow.fri', 'Fri'), tr('campus.dow.sat', 'Sat'),
      ][dow];

  static String _num(num n) => n == n.roundToDouble() ? '${n.round()}' : '$n';
  static String _everyText(num min, num max) =>
      min == max ? tr('campus.everyN', 'Every ~{n} min', {'n': _num(min)}) : tr('campus.every', 'Every {min}–{max} min', {'min': _num(min), 'max': _num(max)});

  static String _nextText(({int inDays, int dow, int at, String? from})? next, String Function(String) nameOf) {
    if (next == null) return tr('campus.noneThisWeek', 'No buses in the next week');
    final time = clock(next.at);
    final from = next.from != null ? nameOf(next.from!) : '';
    if (next.inDays == 1) {
      return from.isNotEmpty
          ? tr('campus.nextTomorrowFrom', 'Next: tomorrow {time} from {stop}', {'time': time, 'stop': from})
          : tr('campus.nextTomorrow', 'Next: tomorrow {time}', {'time': time});
    }
    final day = _dayName(next.dow);
    return from.isNotEmpty
        ? tr('campus.nextDayFrom', 'Next: {day} {time} from {stop}', {'day': day, 'time': time, 'stop': from})
        : tr('campus.nextDay', 'Next: {day} {time}', {'day': day, 'time': time});
  }

  /// A status in words: (main, sub). `nameOf(id)` names a stop by its id in the route's file.
  static ({String main, String sub}) describe(CampusStatus st, [String Function(String)? nameOf]) {
    final name = nameOf ?? (String id) => id;
    switch (st.state) {
      case 'every':
        return (main: _everyText(st.min!, st.max!), sub: tr('campus.till', 'Till {time}', {'time': clock(st.last!)}));
      case 'first':
        return (main: tr('campus.firstAt', 'First bus {time}', {'time': clock(st.at!)}), sub: _everyText(st.min!, st.max!));
      case 'gap':
        return (main: tr('campus.gap', 'No bus till {time}', {'time': clock(st.at!)}), sub: _everyText(st.min!, st.max!));
      case 'departs':
        final times = st.times.map(clock).join(' · ');
        final sub = st.here ? tr('campus.leavesHere', 'Leaves here') : tr('campus.leavesFrom', 'Leaves {stop}', {'stop': name(st.from!)});
        return (main: times, sub: st.end ? '$sub · ${tr('campus.endsHere', 'ends here')}' : sub);
      case 'done':
        return (main: tr('campus.done', 'No more buses today'), sub: _nextText(st.next, name));
      default:
        return (main: tr('campus.notToday', 'Not running today'), sub: _nextText(st.next, name));
    }
  }

  // ---------- the credits ----------

  /// Whether the stretch from a to b is anywhere in the box (Liang and Barsky's clipping).
  static bool _crosses(List<double> a, List<double> b, ({double s, double w, double n, double e}) box) {
    var t0 = 0.0, t1 = 1.0;
    final dLat = b[0] - a[0], dLng = b[1] - a[1];
    for (final (p, q) in [(-dLat, a[0] - box.s), (dLat, box.n - a[0]), (-dLng, a[1] - box.w), (dLng, box.e - a[1])]) {
      if (p == 0) {
        if (q < 0) return false;
        continue;
      }
      final r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
    return true;
  }

  /// The credit of each university with a line of `list` in `view` ([[s, w], [n, e]]), grown
  /// by `pad` of its size each way; every one with a line, without a view.
  static List<({String uni, String text, String url})> creditsIn(Map config, List<({String uni, List<List<double>> points})> list, List<List<double>>? view, [double pad = 0.1]) {
    ({double s, double w, double n, double e})? box;
    if (view != null) {
      final dy = (view[1][0] - view[0][0]) * pad, dx = (view[1][1] - view[0][1]) * pad;
      box = (s: view[0][0] - dy, w: view[0][1] - dx, n: view[1][0] + dy, e: view[1][1] + dx);
    }
    bool shown(List<List<double>> pts) {
      if (box == null) return pts.isNotEmpty;
      if (pts.length == 1) return _crosses(pts[0], pts[0], box);
      for (var i = 1; i < pts.length; i++) {
        if (_crosses(pts[i - 1], pts[i], box)) return true;
      }
      return false;
    }

    final unis = {for (final l in list) if (shown(l.points)) l.uni};
    return [
      for (final u in config.keys)
        if (unis.contains(u) && config[u] is Map && (config[u]['credit'] ?? '').toString().isNotEmpty)
          (uni: '$u', text: '${config[u]['credit']}', url: '${config[u]['creditUrl'] ?? ''}'),
    ];
  }

  // ---------- roads ----------

  /// A route's stops as a short key (FNV-1a of their places to 5 decimals), so a kept road is
  /// used only while the stops it was made for are the route's.
  static String roadKey(List<List<double>> points) {
    final text = points.map((p) => '${p[0].toStringAsFixed(5)},${p[1].toStringAsFixed(5)}').join(';');
    var h = 0x811c9dc5;
    for (final c in text.codeUnits) {
      h = ((h ^ c) * 0x01000193) & 0xffffffff;
    }
    return h.toRadixString(16).padLeft(8, '0');
  }

  // ---------- in the app ----------

  static Map? _files;
  static Map<String, dynamic>? _roads;
  static Future<void>? _fetching;
  static CampusModel? model;
  static Map<String, Stop>? _builtFor;
  static bool get ready => model != null;

  static Future<void> load() async {
    _fetching ??= () async {
      final got = await Future.wait([
        for (final f in const ['nus', 'ntu', 'config', 'shuttles']) Stations.siteData('campus/$f.json', 'sgbus_campus_$f'),
      ]);
      if (got.any((g) => g is! Map)) throw ApiError("Couldn't fetch the shuttle buses.");
      _files = {'nus': got[0], 'ntu': got[1], 'config': got[2], 'shuttles': got[3]};
    }();
    try {
      await _fetching;
    } catch (_) {
      _fetching = null;
      rethrow;
    }
    try {
      await Stops.load();
    } catch (_) {}
    _modelFor(Stops.index);
  }

  /// The files as they came, for the phone's own planning (data/nav_offline.dart).
  static Map? get files => _files;

  /// For tests: the files as given.
  static void use(Map files) {
    _files = files;
    _fetching = Future.value();
    _builtFor = null;
    _modelFor(Stops.index);
  }

  static CampusModel? _modelFor(Map<String, Stop> lta) {
    if (_files == null) return null;
    if (model == null || !identical(_builtFor, lta)) {
      model = build(_files!, lta);
      _builtFor = lta;
    }
    return model;
  }

  static Future<void> loadRoads() async {
    if (_roads != null) return;
    final got = await Stations.siteData('campus/roads.json', 'sgbus_campus_roads');
    _roads = got is Map && got['routes'] is Map ? Map<String, dynamic>.from(got['routes'] as Map) : {};
  }

  /// A route's kept road, or null: none kept, or kept for other stops.
  static List<List<double>>? road(String key, List<List<double>> points) {
    final got = _roads?[key];
    if (got is! Map || got['path'] is! List || (got['path'] as List).length < 2 || got['at'] != roadKey(points)) return null;
    return [for (final p in got['path'] as List) if (p is List && p.length >= 2) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]];
  }

  static CampusStop? at(String key) => model?.stops[key];

  static String uniName(String uni) {
    final c = model?.config[uni];
    return c is Map && c['name'] != null ? '${c['name']}' : uni.toUpperCase();
  }

  static Color uniColour(String uni) {
    final c = model?.config[uni];
    return colorOf(c is Map && c['colour'] != null ? '${c['colour']}' : '#7a4fd6');
  }

  static String Function(String) nameIn(CampusRoute route) => (id) {
        final i = route.ids.indexOf(id);
        final k = i < 0 ? null : route.keys[i];
        return (k != null ? model?.stops[k]?.name : null) ?? id;
      };

  /// Settings' Shuttle buses: paid ones only with Free and paid.
  static bool keep(CampusRoute r) => r.fare != 'paid' || Store.I.get('sgbus_shuttles') == 'paid';

  /// Each route as a line through its stops, for Explorer.
  static List<({String key, String uni, Color color, List<List<double>> points})> lines([bool Function(CampusRoute)? keepIt]) => [
        for (final r in model?.routes ?? const <CampusRoute>[])
          if (keepIt == null || keepIt(r))
            (key: r.key, uni: r.uni, color: r.color, points: [for (final k in r.keys) if (k != null && model!.stops[k] != null) [model!.stops[k]!.lat, model!.stops[k]!.lng]])
      ].where((l) => l.points.length >= 2).toList();

  /// The campus stops LTA hasn't got, for Explorer's dots.
  static List<CampusStop> dots([bool Function(CampusRoute)? keepIt]) => [
        for (final s in model?.stops.values ?? const <CampusStop>[])
          if (!s.lta && (keepIt == null || s.routes.any((x) => keepIt(x.route)))) s
      ];

  /// The credits for the map: those with a line in view.
  static List<({String uni, String text, String url})> credits(List<List<double>>? view, [List<({String uni, List<List<double>> points})>? list]) =>
      model == null ? const [] : creditsIn(model!.config, list ?? [for (final l in lines(keep)) (uni: l.uni, points: l.points)], view);

  // ---------- search (Bus timings' box) ----------

  static String _fold(Object? v) => '${v ?? ''}'.toLowerCase().replaceAll(RegExp('[^a-z0-9]'), '');

  /// The routes and the campus stops LTA hasn't got that match what's typed. Exact first.
  static ({List<CampusRoute> routes, List<CampusStop> stops}) search(String q, [int limit = 4]) {
    final f = _fold(q);
    if (model == null || f.isEmpty) return (routes: const [], stops: const []);
    final routes = model!.routes.where((r) => _fold(r.code) == f || (f.length >= 2 && _fold(r.code).startsWith(f))).toList();
    mergeSort(routes, compare: (a, b) => (_fold(b.code) == f ? 1 : 0) - (_fold(a.code) == f ? 1 : 0));
    int score(CampusStop st) => _fold(st.name) == f ? 0 : _fold(st.name).startsWith(f) ? 1 : _fold(st.name).contains(f) ? 2 : 3;
    final stops = f.length < 2 ? <CampusStop>[] : (model!.stops.values.where((s) => !s.lta && score(s) < 3).toList());
    mergeSort(stops, compare: (a, b) => score(a) != score(b) ? score(a) - score(b) : a.name.compareTo(b.name));
    return (routes: routes.take(limit).toList(), stops: stops.take(limit).toList());
  }

  static CampusRoute? route(String key) => model?.routes.where((r) => r.key == key).firstOrNull;

  /// The next bus seen live at a stop, in minutes (0 arriving), or null: none seen, or none
  /// coming. Only for a route the operator shares.
  static Future<int?> live(CampusRoute route, String key) async {
    final stops = route.live?['stops'];
    final stop = model?.stops[key];
    if (stops is! Map || (stops[stop?.id] == null && stops[key] == null)) return null;
    try {
      final got = await Api.get('shuttle-live', query: {'route': route.key, 'stop': key});
      return got is Map && got['eta'] is num ? (got['eta'] as num).round() : null;
    } catch (_) {
      return null;
    }
  }

  static bool canLive(CampusRoute route, String key) {
    final stops = route.live?['stops'];
    return stops is Map && (stops[model?.stops[key]?.id] != null || stops[key] != null);
  }
}

/// A stable sort, as JS's Array.prototype.sort is.
void mergeSort<T>(List<T> list, {required int Function(T, T) compare}) {
  if (list.length < 2) return;
  final indexed = [for (var i = 0; i < list.length; i++) (i, list[i])];
  indexed.sort((a, b) {
    final c = compare(a.$2, b.$2);
    return c != 0 ? c : a.$1 - b.$1;
  });
  for (var i = 0; i < list.length; i++) {
    list[i] = indexed[i].$2;
  }
}
