// Train times at an MRT or LRT station, from the site's /api/trains: LTA's timetable, with a
// disruption's cancellations and delays over it when LTA's feed has any (main-site/api/trains.js).
// LTA publishes no live train times otherwise, so these are the timetable's, and say so.
//
// Offline, as the site: each station's answer is kept for the rest of its service day, and every
// station's usual weekday, Saturday and Sunday trains (/api/trains-all) are kept in a file, fetched
// once a day, so a station never opened online still has its trains.
//
// Ported from main-site/js/trains.js; keep in step with it and telegram-bot/src/trains.py.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../api/api.dart';
import 'store.dart';
import 'when.dart';

/// One train at a platform: when it reaches it, where it's going, the station codes it calls at
/// after this one, and [state]: 0 the timetable's, 1 changed by a disruption, 2 cancelled or not
/// stopping here.
class Train {
  const Train(this.ms, this.head, this.way, this.state);
  final int ms;
  final String head;
  final List<String> way;
  final int state;
}

class TrainPlatform {
  TrainPlatform(this.id, this.code, this.line, this.colour, this.platform, this.heads, this.ways, this.trains, this.first, {this.parent = ''});
  final String id;
  final String code;
  final String? line;
  final String? colour;
  final String platform;
  final List<String> heads;
  final List<List<String>> ways;

  /// As the answer has them: [t, head, way, state], `t` seconds after the day's midnight.
  final List<List<int>> trains;

  /// The next day's first train, [t, head], or null.
  final List<int>? first;
  final String parent;

  static TrainPlatform from(Map m) => TrainPlatform(
        '${m['id']}',
        '${m['code']}',
        m['line'] as String?,
        m['colour'] as String?,
        '${m['platform'] ?? ''}',
        [for (final h in (m['heads'] as List? ?? const [])) '$h'],
        [for (final w in (m['ways'] as List? ?? const [])) [for (final c in w as List) '$c']],
        [for (final t in (m['trains'] as List? ?? const [])) [for (final x in t as List) (x as num).toInt()]],
        m['first'] == null ? null : [for (final x in m['first'] as List) (x as num).toInt()],
        parent: '${m['parent'] ?? ''}',
      );

  Map<String, Object?> toJson() => {
        'id': id, 'code': code, 'line': line, 'colour': colour, 'platform': platform, 'heads': heads, 'ways': ways,
        'trains': trains, 'first': first, if (parent.isNotEmpty) 'parent': parent,
      };
}

/// A station's trains, as /api/trains answers, plus [offline] for a kept copy and [usual] for one
/// worked out from every station's usual timetable.
class TrainsData {
  TrainsData(this.day, this.start, this.live, this.platforms, {this.offline = false, this.usual = false});
  final String day;
  final int start;
  final bool live;
  final List<TrainPlatform> platforms;
  final bool offline;
  final bool usual;

  static TrainsData from(Map m, {bool offline = false}) => TrainsData(
        '${m['day']}',
        (m['start'] as num).toInt(),
        m['live'] == true,
        [for (final p in (m['platforms'] as List? ?? const [])) TrainPlatform.from(p as Map)],
        offline: offline,
      );

  Map<String, Object?> toJson() => {'day': day, 'start': start, 'live': live, 'platforms': [for (final p in platforms) p.toJson()]};

  /// A platform's trains from [ms] on (a train at the platform still counts), cancelled ones
  /// kept, to say so.
  List<Train> trainsFrom(TrainPlatform p, int ms) {
    final after = (ms - start) / 1000 - Trains.nowS;
    return [
      for (final x in p.trains)
        if (x[0] >= after) Train(start + x[0] * 1000, p.heads[x[1]], p.ways[x[2]], x[3]),
    ];
  }
}

class Trains {
  Trains._();

  /// A train this close is "Now": at the platform or pulling in.
  static const nowS = 30;
  static const nextN = 3;
  static const _keepN = 12;
  static const _freshMs = 30 * 1000;
  static const _key = 'sgbus_trains';
  static const _allKey = 'sgbus_trains_all';
  // After midnight is the day before's, until 3am (api/_trains/gtfs.js).
  static const _dayEndsHour = 3;
  static const _sgMs = 8 * 3600 * 1000;

  static String codesKey(Iterable<String> codes) {
    final s = {for (final c in codes) if (c.trim().isNotEmpty) c.trim().toUpperCase()}.toList()..sort();
    return s.join(',');
  }

  /// "EW2/DT32", as Navigate's station places have it, as codes.
  static List<String> codesOf(String s) => s.split('/').where((c) => c.isNotEmpty).toList();

  static final _fresh = <String, ({int at, TrainsData data})>{};
  static final _asking = <String, Future<TrainsData?>>{};

  /// A station's trains, or a kept copy (offline), or null when there are none to be had.
  static Future<TrainsData?> load(List<String> codes, {bool force = false}) {
    final key = codesKey(codes);
    if (key.isEmpty) return Future.value();
    final f = _fresh[key];
    if (!force && f != null && When.nowMs() - f.at < _freshMs) return Future.value(f.data);
    return _asking[key] ??= () async {
      try {
        final got = await Api.get('trains', query: {'codes': key});
        if (got is! Map) throw const FormatException('trains');
        final data = TrainsData.from(got);
        _fresh[key] = (at: When.nowMs(), data: data);
        _keep(key, data);
        return data;
      } catch (_) {
        return _kept(key) ?? await fromNetwork(codes);
      } finally {
        // Always after the first await, so after it's been put there.
        _asking.remove(key);
      }
    }();
  }

  static Map<String, dynamic> _readAll() {
    try {
      return Map<String, dynamic>.from(jsonDecode(Store.I.get(_key) ?? '{}') as Map);
    } catch (_) {
      return {};
    }
  }

  static void _keep(String key, TrainsData data) {
    final all = _readAll();
    all[key] = {...data.toJson(), 'savedAt': When.nowMs()};
    final keys = all.keys.toList()..sort((a, b) => ((all[b] as Map)['savedAt'] as num? ?? 0).compareTo((all[a] as Map)['savedAt'] as num? ?? 0));
    for (final k in keys.skip(_keepN)) {
      all.remove(k);
    }
    Store.I.put(_key, jsonEncode(all));
  }

  // A kept answer still of use: its service day isn't over.
  static TrainsData? _kept(String key) {
    final d = _readAll()[key];
    if (d is! Map) return null;
    final data = TrainsData.from(d, offline: true);
    return When.nowMs() < data.start + (24 + _dayEndsHour) * 3600 * 1000 ? data : null;
  }

  // ---------- every station, for offline ----------

  static Future<File?> _allFile() async {
    try {
      final dir = await getApplicationSupportDirectory();
      return File('${dir.path}/trains-all.json');
    } catch (_) {
      return null; // Tests and screenshots.
    }
  }

  static Map<String, dynamic>? _network;

  /// The service day of a moment: its date, its midnight, and its day of the week (0 Sunday).
  static ({String day, int start, int dow}) serviceDay(int ms) {
    var d = DateTime.fromMillisecondsSinceEpoch(ms + _sgMs, isUtc: true);
    if (d.hour < _dayEndsHour) d = d.subtract(const Duration(days: 1));
    final day = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    return (day: day, start: DateTime.utc(d.year, d.month, d.day).millisecondsSinceEpoch - _sgMs, dow: d.weekday % 7);
  }

  // Sunday's trains on a public holiday, as LTA runs them.
  static String _kindOf(String day, int dow) => dow == 0 || When.isHoliday(day) ? 'sun' : dow == 6 ? 'sat' : 'wd';

  /// Every station's usual trains, once a day while online, kept in a file.
  static Future<void> warm() async {
    final today = serviceDay(When.nowMs()).day;
    if (Store.I.get(_allKey) == today) return;
    try {
      final got = await Api.get('trains-all', timeout: const Duration(seconds: 60));
      if (got is! Map) return;
      _network = Map<String, dynamic>.from(got);
      if (Api.fake == null) await (await _allFile())?.writeAsString(jsonEncode(got));
      Store.I.put(_allKey, today);
    } catch (_) {
      // Offline or the site's busy: next time.
    }
  }

  static Future<Map<String, dynamic>?> _networkCopy() async {
    if (_network != null) return _network;
    if (Api.fake != null) {
      final got = await Api.fake!('trains-all');
      return _network = got is Map ? Map<String, dynamic>.from(got) : null;
    }
    try {
      final f = await _allFile();
      if (f == null || !await f.exists()) return null;
      return _network = Map<String, dynamic>.from(jsonDecode(await f.readAsString()) as Map);
    } catch (_) {
      return null;
    }
  }

  /// A station's trains worked out from every station's usual timetable, or null without a copy.
  static Future<TrainsData?> fromNetwork(List<String> codes, [int? ms]) async {
    final all = await _networkCopy();
    if (all == null || all['platforms'] is! List) return null;
    final now = ms ?? When.nowMs();
    final want = {for (final c in codes) c.toUpperCase()};
    final parents = {...want};
    final list = [for (final p in all['platforms'] as List) p as Map];
    for (final p in list) {
      if (want.contains(p['code']) || want.contains(p['parent'])) parents.add('${p['parent']}');
    }
    final sd = serviceDay(now);
    final kind = _kindOf(sd.day, sd.dow);
    final next = serviceDay(sd.start + 36 * 3600 * 1000);
    final nextKind = _kindOf(next.day, next.dow);
    final nowS = (now - sd.start) / 1000;
    final platforms = <TrainPlatform>[];
    for (final p in list) {
      if (!parents.contains(p['parent']) && !parents.contains(p['code'])) continue;
      final byKind = Map<String, dynamic>.from(p['trains'] as Map);
      final flat = [for (final x in (byKind[kind] as List? ?? const [])) (x as num).toInt()];
      final tomorrow = [for (final x in (byKind[nextKind] as List? ?? const [])) (x as num).toInt()];
      final trains = <List<int>>[
        for (var i = 0; i + 2 < flat.length; i += 3)
          if (flat[i] >= nowS - 60) [flat[i], flat[i + 1], flat[i + 2], 0],
      ];
      if (trains.isEmpty && tomorrow.isEmpty) continue;
      platforms.add(TrainPlatform.from({...p, 'trains': trains, 'first': tomorrow.isEmpty ? null : [tomorrow[0], tomorrow[1]]}));
    }
    if (platforms.isEmpty) return null;
    return TrainsData(sd.day, sd.start, false, platforms, offline: true, usual: true);
  }

  // ---------- Navigate ----------

  /// The next trains on a Navigate ride: from its boarding station, those calling at its stop
  /// ([toCode], "NS24/NE6/CC1" for an interchange), from [ms] (when you're on the platform).
  /// Null when no train from there goes there.
  static ({List<Train> trains, bool live, bool offline, int lastMs, int? rank})? forLeg(TrainsData? data, String toCode, int ms) {
    if (data == null) return null;
    final want = {for (final c in codesOf(toCode)) c.toUpperCase()};
    final trains = <Train>[
      for (final p in data.platforms)
        for (final x in data.trainsFrom(p, ms))
          if (x.way.any(want.contains)) x,
    ]..sort((a, b) => a.ms.compareTo(b.ms));
    final running = trains.where((x) => x.state != 2).toList();
    final out = running.take(nextN).toList();
    if (out.isEmpty) return null;
    // The day's last train there, and how far from the last the next one is: 1 the last, 2 and 3
    // the two before it (the bus card's "last 3 buses of the day").
    return (
      trains: out,
      live: trains.any((x) => x.state != 0),
      offline: data.offline,
      lastMs: running.last.ms,
      rank: running.length <= 3 ? running.length : null,
    );
  }

  // ---------- the last trains ----------

  /// A platform's last three trains of the day that run, each its rank from the last: their
  /// times (seconds after the day's midnight) to 1, 2 or 3. The answer lists the whole rest of
  /// the day, so its end is the day's end.
  static Map<int, int> lastRanks(TrainPlatform p) {
    final runs = p.trains.where((x) => x[3] != 2).toList();
    final three = runs.reversed.take(3).toList();
    return {for (var i = 0; i < three.length; i++) three[i][0]: i + 1};
  }

  /// The platform's last train today, or null when none is left.
  static int? lastTrainMs(TrainsData data, TrainPlatform p) {
    final runs = p.trains.where((x) => x[3] != 2);
    return runs.isEmpty ? null : data.start + runs.last[0] * 1000;
  }

  /// How many of the platform's trains that run are still to come from [ms].
  static int left(TrainsData data, TrainPlatform p, int ms) => data.trainsFrom(p, ms).where((x) => x.state != 2).length;
}
