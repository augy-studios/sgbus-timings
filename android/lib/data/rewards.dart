// Rides really taken, feats, Easter eggs and uwuCoins (the site's js/rides.js, js/eggs.js and
// js/coins.js), with the same storage keys, so the WebView app's come over as they were.
//
// RideCheck: each bus or train ride on a trip counts once it's shown to be real, by the phone's
// location and the time it took: seen near where it starts and then near where it ends, taking
// at least half the time it's planned to and never faster than a bus or train goes, and on a bus
// with stops between, seen near some of them on the way. Kept by line and by bus (sgbus_rides).
//
// Feats: nine, each done once and worth 100 uwuCoins: every MRT and LRT line ridden; buses 12,
// 34, 56, 78, 90; buses 9, 87, 65, 43, 21; a trip back to where it started by way of a stop well
// away; a trip of over three hours; between two of the old KTM railway's places; on or off a bus
// at 01012 and 99189; 100 rides; off a train at the island's four ends. sgbus_feats.
//
// Eggs: the uwuCoins wheel's prizes, one for each feat (sgbus_eggs). The first egg found
// unlocks Your colours (sgbus_colours_unlocked); each egg but `lines` adds a preset to it.
//
// Coins: a trip taken with the Get Off Alert to the end, with a real ride on it, earns 5, and 1
// for every 2 km ridden (up to 30), 3 a change, 4 for each bus operator and train operator, 2 for
// each line. The wheel: 100 a spin, eight slots alike, one an egg not found yet (80 coins once
// every egg's found). sgbus_coins: { balance, log, spins }.
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'geo.dart';
import 'network.dart';
import 'store.dart';
import 'when.dart';
import 'eggs_data.dart';

/// What the screens hear: a feat done, coins in, a secret unlocked.
class Rewards extends ChangeNotifier {
  Rewards._();
  static final Rewards I = Rewards._();

  /// Says a feat done: the feat window, or for every line ridden, the celebration.
  void Function(String id, {String? team})? onFeat;

  /// A chip floating up: coins in.
  void Function(int n)? onCoins;

  /// Secrets unlocked by eggs found in a browser before the app.
  void Function(List<String> secrets)? onCatchUp;

  void changed() => notifyListeners();
}

// ---------- rides ----------

class RideCheck {
  RideCheck._();
  static const key = 'sgbus_rides';
  static const _startM = 300.0, _endM = 300.0, _alongM = 250.0, _fixM = 150.0;
  static const _minShare = 0.5, _alongShare = 0.25;
  static const _maxKmh = {'bus': 70.0, 'train': 100.0};
  static const _maxTrips = 50;
  static const lines = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK', 'PG'];
  static const sameLine = {'CG': 'EW', 'CE': 'CC', 'SE': 'SK', 'SW': 'SK', 'PE': 'PG', 'PW': 'PG'};
  static const sbsLines = ['NE', 'DT', 'SK', 'PG'];

  static bool isRide(Map leg) => (leg['kind'] == 'bus' || leg['kind'] == 'train') && leg['points'] is List && (leg['points'] as List).length >= 2;
  static List<List<double>> _pts(Map leg) => [for (final p in leg['points'] as List) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]];

  static String lineOf(Map leg) {
    final code = RegExp(r'^[A-Z]{2}').firstMatch('${leg['route'] ?? leg['label'] ?? ''}'.toUpperCase())?.group(0) ?? '';
    return sameLine[code] ?? code;
  }

  static String busOf(Map leg) =>
      leg['shuttle'] != null ? '' : '${leg['service'] ?? leg['route'] ?? '${leg['label'] ?? ''}'.replaceFirst(RegExp(r'^\D+'), '')}'.toUpperCase();

  /// A fix on ride `i`: what's seen of it, on `seen` (the trip's, kept with it).
  static void see(Map leg, Map<String, dynamic> seen, List<double> here, double accuracy) {
    if (!isRide(leg) || accuracy > _fixM || seen['judged'] == true) return;
    final t = When.nowMs();
    final pts = _pts(leg);
    final last = pts.length - 1;
    seen['fixes'] = ((seen['fixes'] as num?) ?? 0) + 1;
    if (seen['endAt'] == null && metresAB(here, pts.first) <= _startM) seen['startAt'] = t;
    if (seen['startAt'] != null && seen['endAt'] == null && metresAB(here, pts[last]) <= _endM && t > (seen['startAt'] as num)) seen['endAt'] = t;
    if (seen['startAt'] != null && seen['endAt'] == null) {
      final along = (seen['along'] as List? ?? []).cast<Object>().toList();
      for (var k = 1; k < last; k++) {
        if (!along.contains(k) && metresAB(here, pts[k]) <= _alongM) along.add(k);
      }
      seen['along'] = along;
    }
  }

  static ({bool ok, String why}) verdict(Map leg, Map? seen) {
    if (!isRide(leg)) return (ok: false, why: 'not a ride');
    if (seen == null || seen['startAt'] == null) return (ok: false, why: 'never seen at the start');
    if (seen['endAt'] == null) return (ok: false, why: 'never seen at the end');
    final ms = (seen['endAt'] as num) - (seen['startAt'] as num);
    final planned = math.max(1, (leg['minutes'] as num?) ?? 1) * 60000;
    if (ms < planned * _minShare) return (ok: false, why: 'too quick for the ride');
    final pts = _pts(leg);
    final km = metresAB(pts.first, pts.last) / 1000;
    if (km / (ms / 3600000) > _maxKmh[leg['kind']]!) return (ok: false, why: 'faster than it goes');
    final between = pts.length - 2;
    if (leg['kind'] == 'bus' && between >= 2) {
      final need = math.max(1, (between * _alongShare).ceil());
      if (((seen['along'] as List?) ?? const []).length < need) return (ok: false, why: 'not seen along the way');
    }
    return (ok: true, why: '');
  }

  static Map<String, dynamic> record() {
    final v = Store.I.map(key);
    return {
      'lines': Map<String, dynamic>.from(v['lines'] as Map? ?? {}),
      'buses': Map<String, dynamic>.from(v['buses'] as Map? ?? {}),
      'trips': List<Object?>.from(v['trips'] as List? ?? const []),
    };
  }

  static void _keep(Map<String, dynamic> rec) => Store.I.putJson(key, rec);

  static bool _unlock(Map rec) => lines.every((l) => (((rec['lines'] as Map)[l] as Map?)?['n'] as num? ?? 0) >= 1);

  static void _checkUnlock(Map<String, dynamic> rec) {
    Feats.rides(rec);
    if (!Feats.done().contains('lines') && _unlock(rec)) Feats.feat('lines');
  }

  /// Ride `i` of the trip is over: judged once, and kept if it was real.
  static bool? done(Map leg, Map<String, dynamic> seen, String tripId) {
    if (!isRide(leg)) return null;
    if (seen['judged'] == true) return seen['ok'] == true;
    final v = verdict(leg, seen);
    seen['judged'] = true;
    seen['ok'] = v.ok;
    seen['why'] = v.why;
    if (!v.ok) return false;
    final rec = record();
    final now = When.nowMs();
    void bump(Map<String, dynamic> map, String k) {
      final was = map[k] as Map?;
      map[k] = {'n': ((was?['n'] as num?) ?? 0) + 1, 'first': was?['first'] ?? now, 'last': now};
    }

    final trips = rec['trips'] as List<Object?>;
    var entry = trips.whereType<Map>().where((t) => t['id'] == tripId).firstOrNull;
    if (entry == null) {
      entry = {'id': tripId, 'at': now, 'lines': <String>[], 'buses': <String>[]};
      trips.insert(0, entry);
      rec['trips'] = trips.take(_maxTrips).toList();
    }
    final mode = leg['kind'] == 'train' ? 'train' : 'bus';
    final line = mode == 'train' ? lineOf(leg) : '';
    final bus = mode == 'bus' ? busOf(leg) : '';
    if (line.isNotEmpty) {
      bump(rec['lines'] as Map<String, dynamic>, line);
      final l = (entry['lines'] as List).cast<Object>();
      if (!l.contains(line)) entry['lines'] = [...l, line];
    }
    if (bus.isNotEmpty) {
      bump(rec['buses'] as Map<String, dynamic>, bus);
      final b = (entry['buses'] as List).cast<Object>();
      if (!b.contains(bus)) entry['buses'] = [...b, bus];
    }
    _keep(rec);
    Feats.rideDone(leg);
    if (line.isNotEmpty || bus.isNotEmpty) Team.ride?.call({'mode': mode, 'line': line, 'bus': bus, ...Feats.rideMarks(leg)});
    _checkUnlock(rec);
    return true;
  }

  /// Trips from before the checks, as Your trips keeps them: each ride they got through kept.
  static int addPast(List<Map> trips) {
    final rec = record();
    final have = {for (final t in (rec['trips'] as List).whereType<Map>()) t['id']};
    var added = 0;
    void bump(Map<String, dynamic> map, String k, int at) {
      final was = map[k] as Map?;
      map[k] = {
        'n': ((was?['n'] as num?) ?? 0) + 1,
        'first': math.min(((was?['first'] as num?) ?? at).toInt(), at),
        'last': math.max(((was?['last'] as num?) ?? at).toInt(), at),
      };
    }

    for (final trip in trips) {
      if (trip['id'] == null || have.contains(trip['id'])) continue;
      final at = (trip['startedAt'] as num?)?.toInt() ?? When.nowMs();
      final entry = {'id': trip['id'], 'at': at, 'lines': <String>[], 'buses': <String>[], 'past': true};
      for (final leg in (trip['legs'] as List? ?? const []).whereType<Map>()) {
        if (leg['done'] != true) continue;
        if (leg['kind'] == 'train') {
          final line = lineOf(leg);
          if (!lines.contains(line)) continue;
          bump(rec['lines'] as Map<String, dynamic>, line, at);
          if (!(entry['lines'] as List).contains(line)) (entry['lines'] as List).add(line);
          added++;
        } else if (leg['kind'] == 'bus') {
          final bus = '${leg['route'] ?? ''}'.trim().toUpperCase();
          if (!RegExp(r'^\d{1,3}[A-Z]{0,2}$').hasMatch(bus)) continue;
          bump(rec['buses'] as Map<String, dynamic>, bus, at);
          if (!(entry['buses'] as List).contains(bus)) (entry['buses'] as List).add(bus);
          added++;
        }
      }
      if ((entry['lines'] as List).isNotEmpty || (entry['buses'] as List).isNotEmpty) {
        (rec['trips'] as List).add(entry);
        have.add(trip['id']);
      }
    }
    if (added == 0) return 0;
    final sorted = (rec['trips'] as List).whereType<Map>().toList()..sort((a, b) => ((b['at'] as num?) ?? 0).compareTo((a['at'] as num?) ?? 0));
    rec['trips'] = sorted.take(_maxTrips).toList();
    _keep(rec);
    _checkUnlock(rec);
    return added;
  }

  static ({List<String> done, List<String> left}) progress() {
    final rec = record();
    bool ridden(String l) => ((((rec['lines'] as Map)[l] as Map?)?['n'] as num?) ?? 0) >= 1;
    return (done: lines.where(ridden).toList(), left: lines.where((l) => !ridden(l)).toList());
  }
}

/// A team run, if you're in one (features/team/): its rides and trips, from this phone.
class Team {
  Team._();
  static void Function(Map<String, Object?> ride)? ride;
  static void Function(Map<String, Object?> trip)? tripDone;
}

// ---------- feats, eggs and secrets ----------

class Feats {
  Feats._();
  static const toldKey = 'sgbus_eggs_told';
  static const teamFeatsKey = 'sgbus_team_feats';
  static const marksKey = 'sgbus_feat_marks';
  static const phoneKey = 'sgbus_phone_colours_unlocked';
  static const materialKey = 'sgbus_material_unlocked';
  static const firstLast = ['01012', '99189'];
  static const hundred = 100;
  static const endsM = 400.0;
  static const ends = {
    'EW33': [1.340429, 103.636961], // Tuas Link
    'TE1': [1.448646, 103.785519], // Woodlands North
    'NE18': [1.415018, 103.910329], // Punggol Coast
    'CG2': [1.357338, 103.988565], // Changi Airport
  };
  static const featCoins = 100;
  static const loopM = 300.0;
  static const loopAwayM = 1000.0;
  static const longMs = 3 * 3600 * 1000;
  static const ktmM = 400.0;
  static const ktm = {
    'woodlands': [1.442783, 103.769356],
    'cantonment': [1.273115, 103.837028],
    'kingAlbertPark': [1.33566, 103.78416],
  };

  static List<String> get ids => [for (final e in EggsData.all) e.id];
  static Map<String, dynamic> _read(String key) {
    final v = Store.I.map(key);
    if (v.isEmpty && Store.I.get(EggsData.eggsKey) == null && Store.I.get(EggsData.featsKey) == null && Store.I.get(EggsData.unlockedKey) != null) {
      return {'lines': int.tryParse(Store.I.get(EggsData.unlockedKey)!) ?? When.nowMs()};
    }
    return v;
  }

  static List<String> done() => EggsData.feats();
  static List<String> eggs() => EggsData.found();

  /// The day a feat was done, Singapore's, as "2026-11-01", or null.
  static String? doneOn(String id) {
    final at = (_read(EggsData.featsKey)[id] as num?)?.toInt();
    return at == null || at <= 0 ? null : When.sgClock(at).ymd;
  }

  static List<String> told() => [for (final v in Store.I.list(toldKey)) '$v'];
  static void tell(String what) => Store.I.putJson(toldKey, {...told(), what}.toList());

  static bool get coloursUnlocked => Store.I.get(EggsData.unlockedKey) != null;

  /// As many secrets unlocked as there are eggs found; the ones unlocked now.
  static List<String> settle() {
    Store.I.put(phoneKey, null);
    Store.I.put(materialKey, null);
    if (!coloursUnlocked && eggs().isNotEmpty) {
      Store.I.put(EggsData.unlockedKey, '${When.nowMs()}');
      Rewards.I.changed();
      return ['colours'];
    }
    return const [];
  }

  /// An egg found, by the wheel: what it brought, or null if it was found already.
  static ({List<String> secrets, EggPreset? preset})? found(String id) {
    final def = EggsData.byId(id);
    if (def == null || _read(EggsData.eggsKey)[id] != null) return null;
    final all = _read(EggsData.eggsKey)..[id] = When.nowMs();
    Store.I.putJson(EggsData.eggsKey, all);
    final secrets = settle();
    secrets.forEach(tell);
    Rewards.I.changed();
    return (secrets: secrets, preset: def.preset);
  }

  static Map<String, dynamic> teamFeats() => Store.I.map(teamFeatsKey);

  static List<String>? _gathered;

  /// A feat done: its coins, and said once.
  static bool feat(String id, {bool quiet = false, String? team}) {
    if (EggsData.byId(id) == null || _read(EggsData.featsKey)[id] != null) return false;
    final all = _read(EggsData.featsKey)..[id] = When.nowMs();
    Store.I.putJson(EggsData.featsKey, all);
    if (team != null) Store.I.putJson(teamFeatsKey, {...teamFeats(), id: {'team': team, 'at': all[id]}});
    if (_gathered != null) {
      _gathered!.add(id);
      tell('feat:$id');
      Coins.add(featCoins, info: {'why': 'feat', 'feat': id, 'past': true}, quiet: true);
      Rewards.I.changed();
      return true;
    }
    if (quiet) tell('feat:$id');
    Coins.add(featCoins, info: {'why': 'feat', 'feat': id, 'team': ?team});
    Rewards.I.changed();
    if (!told().contains('feat:$id')) {
      tell('feat:$id');
      Rewards.I.onFeat?.call(id, team: team);
    }
    return true;
  }

  /// The feats `fn` does, without a window or a coin each, for past trips to say together.
  static List<String> gather(void Function() fn) {
    final got = <String>[];
    _gathered = got;
    try {
      fn();
    } finally {
      _gathered = null;
    }
    return got;
  }

  static int rideCount(Map rec) => [...((rec['lines'] as Map?) ?? {}).values, ...((rec['buses'] as Map?) ?? {}).values]
      .fold<int>(0, (sum, x) => sum + (((x as Map?)?['n'] as num?)?.toInt() ?? 0));

  static void rides(Map rec) {
    for (final id in ['up', 'down']) {
      if (EggsData.byId(id)!.buses!.every((b) => ((((rec['buses'] as Map?)?[b] as Map?)?['n'] as num?) ?? 0) >= 1)) feat(id);
    }
    if (rideCount(rec) >= hundred) feat('hundred');
  }

  static ({Map<String, dynamic> first, Map<String, dynamic> ends}) marks() {
    final v = Store.I.map(marksKey);
    return (first: Map<String, dynamic>.from(v['first'] as Map? ?? {}), ends: Map<String, dynamic>.from(v['ends'] as Map? ?? {}));
  }

  /// What a ride is towards First to last and Ends of the island.
  static Map<String, Object?> rideMarks(Map leg) {
    final first = <String>[];
    String? end;
    if (leg['points'] is List && (leg['points'] as List).length >= 2) {
      if (leg['kind'] == 'bus') {
        final codes = [leg['board'], leg['alight'], (leg['codes'] as List?)?.firstOrNull, (leg['codes'] as List?)?.lastOrNull].whereType<Object>().map((c) => '$c').toList();
        first.addAll(firstLast.where(codes.contains));
      } else if (leg['kind'] == 'train') {
        final p = (leg['points'] as List).last as List;
        final at = [(p[0] as num).toDouble(), (p[1] as num).toDouble()];
        end = ends.entries.where((e) => metresAB(at, e.value) <= endsM).firstOrNull?.key;
      }
    }
    return {'first': first, 'end': end};
  }

  static void rideDone(Map leg) {
    final m = marks();
    final now = When.nowMs();
    var changed = false;
    final got = rideMarks(leg);
    for (final code in (got['first'] as List).cast<String>()) {
      if (m.first[code] == null) {
        m.first[code] = now;
        changed = true;
      }
    }
    final end = got['end'] as String?;
    if (end != null && m.ends[end] == null) {
      m.ends[end] = now;
      changed = true;
    }
    if (changed) Store.I.putJson(marksKey, {'first': m.first, 'ends': m.ends});
    if (firstLast.every((c) => m.first[c] != null)) feat('first');
    if (ends.keys.every((c) => m.ends[c] != null)) feat('ends');
  }

  /// A trip arrived at: the trip feats.
  static void tripDone({required List<double> start, required List<double> end, required int startedAt, List<double>? via, required bool realRide}) {
    if (!realRide) return;
    tripFeats(start, end, When.nowMs() - startedAt, via != null && metresAB(start, via) >= loopAwayM);
    Team.tripDone?.call({'start': start, 'end': end, 'via': via, 'startedAt': startedAt, 'endedAt': When.nowMs()});
  }

  static void tripFeats(List<double> start, List<double> end, int ms, bool away) {
    if (ms >= longMs) feat('long');
    if (away && metresAB(start, end) <= loopM) feat('loop');
    String? near(List<double> p) => ktm.entries.where((e) => metresAB(p, e.value) <= ktmM).firstOrNull?.key;
    final a = near(start), b = near(end);
    if (a != null && b != null && a != b) feat('ktm');
  }

  /// A trip from before uwuCoins, as Your trips keeps it.
  static void pastTrip(Map trip) {
    List<double>? at(Object? p) => p is Map && p['lat'] is num ? [(p['lat'] as num).toDouble(), (p['lng'] as num).toDouble()] : null;
    final start = at(trip['from']), end = at(trip['to']);
    final rides = (trip['legs'] as List? ?? const []).whereType<Map>().where((l) => l['done'] == true && (l['kind'] == 'bus' || l['kind'] == 'train')).toList();
    if (trip['arrived'] != true || rides.isEmpty || start == null || end == null) return;
    final ms = ((trip['endedAt'] as num?) ?? 0).toInt() - ((trip['startedAt'] as num?) ?? 0).toInt();
    tripFeats(start, end, ms, rides.length >= 2);
  }

  /// How far along each feat is.
  static List<({String id, String name, String how, bool done, int have, int need, bool egg, String? team})> progress() {
    final rec = RideCheck.record();
    final doneMap = _read(EggsData.featsKey);
    final eggMap = _read(EggsData.eggsKey);
    final m = marks();
    return [
      for (final e in EggsData.all)
        () {
          final isDone = doneMap[e.id] != null;
          var have = isDone ? 1 : 0;
          var need = 1;
          if (e.id == 'lines') {
            need = RideCheck.lines.length;
            have = isDone ? need : RideCheck.progress().done.length;
          } else if (e.buses != null) {
            need = e.buses!.length;
            have = isDone ? need : e.buses!.where((b) => ((((rec['buses'] as Map)[b] as Map?)?['n'] as num?) ?? 0) >= 1).length;
          } else if (e.id == 'hundred') {
            need = hundred;
            have = isDone ? need : math.min(need, rideCount(rec));
          } else if (e.id == 'first') {
            need = firstLast.length;
            have = isDone ? need : firstLast.where((c) => m.first[c] != null).length;
          } else if (e.id == 'ends') {
            need = ends.length;
            have = isDone ? need : ends.keys.where((c) => m.ends[c] != null).length;
          }
          return (
            id: e.id,
            name: e.name(),
            how: isDone ? e.how() : e.goal(),
            done: isDone,
            have: have,
            need: need,
            egg: eggMap[e.id] != null,
            team: isDone ? ((teamFeats()[e.id] as Map?)?['team'] as String?) : null,
          );
        }(),
    ];
  }
}

// ---------- uwuCoins ----------

class Coins {
  Coins._();
  static const key = 'sgbus_coins';
  static const shownKey = 'sgbus_coins_shown';
  static const popsKey = 'sgbus_coins_pops';
  static const _logMax = 100;
  static const _finish = 5, _kmPerCoin = 2, _kmCoinsMax = 30, _perChange = 3, _perOperator = 4, _perLine = 2;
  static const spinCost = 100;
  static const eggGoneCoins = 80;
  /// Round the wheel, clockwise from the top: null for the egg.
  static const slots = <int?>[null, 20, 50, 30, 70, 40, 150, 60];
  static const _pastKmh = {'bus': 19.0, 'train': 40.0};

  static Map<String, dynamic> _read() {
    final v = Store.I.map(key);
    return {
      'balance': math.max(0, (v['balance'] as num?)?.toInt() ?? 0),
      'log': List<Object?>.from(v['log'] as List? ?? const []),
      'spins': (v['spins'] as num?)?.toInt() ?? 0,
    };
  }

  static void _write(Map<String, dynamic> v) {
    v['log'] = (v['log'] as List).take(_logMax).toList();
    Store.I.putJson(key, v);
    Rewards.I.changed();
  }

  static int get balance => _read()['balance'] as int;
  static int get spins => _read()['spins'] as int;
  static List<Map> get log => (_read()['log'] as List).whereType<Map>().toList();

  static bool get shown => Store.I.get(shownKey) != 'off';
  static bool get pops => Store.I.get(popsKey) != 'off';
  static set shown(bool on) {
    Store.I.put(shownKey, on ? null : 'off');
    Rewards.I.changed();
  }

  static set pops(bool on) {
    Store.I.put(popsKey, on ? null : 'off');
    Rewards.I.changed();
  }

  static void add(int n, {Map<String, Object?> info = const {}, bool quiet = false}) {
    if (n <= 0) return;
    final v = _read();
    v['balance'] = (v['balance'] as int) + n;
    (v['log'] as List).insert(0, {'at': When.nowMs(), 'n': n, ...info});
    _write(v);
    if (!quiet && shown && pops) Rewards.I.onCoins?.call(n);
  }

  static String _lineOf(Map leg) => RideCheck.lineOf(leg);
  static String _busOp(String? no) => no == null || !BusNet.ready ? '' : (BusNet.serviceInfo(no)?.op ?? '');

  static ({int n, Map<String, int> parts})? _sum(List<Map> rides, double km, Set<String> busOps) {
    final lines = {for (final l in rides.where((l) => l['kind'] == 'train')) _lineOf(l)}..remove('');
    final trainOps = {for (final l in lines) RideCheck.sbsLines.contains(l) ? 'SBS' : 'SMRT'};
    final parts = {
      'finish': _finish,
      'km': math.min(_kmCoinsMax, (km / _kmPerCoin).floor()),
      'changes': _perChange * (rides.length - 1),
      'busOps': _perOperator * busOps.length,
      'trainOps': _perOperator * trainOps.length,
      'lines': _perLine * lines.length,
    };
    return (n: parts.values.fold(0, (a, b) => a + b), parts: parts);
  }

  /// A trip's coins, or null for one without a real ride.
  static ({int n, Map<String, int> parts})? forTrip(List<Map> legs, List<Map?> seen) {
    final rides = legs.where(RideCheck.isRide).toList();
    if (rides.isEmpty || !seen.any((s) => s?['ok'] == true)) return null;
    var m = 0.0;
    for (final leg in rides) {
      final pts = RideCheck._pts(leg);
      for (var i = 1; i < pts.length; i++) {
        m += metresAB(pts[i - 1], pts[i]);
      }
    }
    final busOps = {for (final l in rides.where((l) => l['kind'] == 'bus')) _busOp('${l['service'] ?? l['route']}')}..remove('');
    return _sum(rides, m / 1000, busOps);
  }

  /// A trip from before uwuCoins, as Your trips keeps it.
  static ({int n, Map<String, int> parts})? forPast(Map trip) {
    final rides = (trip['legs'] as List? ?? const []).whereType<Map>().where((l) => l['done'] == true && (l['kind'] == 'bus' || l['kind'] == 'train')).toList();
    if (trip['arrived'] != true || rides.isEmpty) return null;
    final km = rides.fold<double>(0, (sum, l) => sum + (((l['rideMin'] as num?) ?? 0) / 60) * _pastKmh[l['kind']]!);
    final known = rides.where((l) => l['kind'] != 'train' || RideCheck.lines.contains(_lineOf(l))).toList();
    final busOps = {for (final l in rides.where((l) => l['kind'] == 'bus')) (l['op'] as String?) ?? _busOp('${l['route']}')}..remove('');
    return _sum(known, km, busOps);
  }

  static Set<String> tripsPaid() => {for (final e in log) if (e['trip'] is String) e['trip'] as String};

  static void tripDone(String tripId, List<Map> legs, List<Map?> seen) {
    if (tripsPaid().contains(tripId)) return;
    final got = forTrip(legs, seen);
    if (got != null) add(got.n, info: {'why': 'trip', 'trip': tripId});
  }

  // ---------- the wheel ----------

  static List<String> eggsLeft() => Feats.ids.where((id) => !Feats.eggs().contains(id)).toList();

  /// A slot as it is now: the egg's coins once every egg's found.
  static int? slotNow(int i) => slots[i] == null && eggsLeft().isEmpty ? eggGoneCoins : slots[i];

  static final _rnd = math.Random();

  /// A spin: the coins taken, a slot picked, and what it won given; null without enough coins.
  static ({int index, int? coins, String? egg, ({List<String> secrets, EggPreset? preset})? got})? spin() {
    final v = _read();
    if ((v['balance'] as int) < spinCost) return null;
    v['balance'] = (v['balance'] as int) - spinCost;
    v['spins'] = (v['spins'] as int) + 1;
    (v['log'] as List).insert(0, {'at': When.nowMs(), 'n': -spinCost, 'why': 'spin'});
    _write(v);
    final index = _rnd.nextInt(slots.length);
    final coins = slotNow(index);
    if (coins == null) {
      final left = eggsLeft();
      final egg = left[_rnd.nextInt(left.length)];
      return (index: index, coins: null, egg: egg, got: Feats.found(egg));
    }
    final w = _read();
    w['balance'] = (w['balance'] as int) + coins;
    (w['log'] as List).insert(0, {'at': When.nowMs(), 'n': coins, 'why': 'wheel'});
    _write(w);
    return (index: index, coins: coins, egg: null, got: null);
  }

  @visibleForTesting
  static void setBalance(int n) {
    final v = _read()..['balance'] = n;
    _write(v);
  }
}

// ---------- past trips ----------

/// Past trips, for uwuCoins and feats (the site's js/retrofit.js): trips taken before uwuCoins
/// get what they'd have earned, once on this phone (sgbus_retrofit). The WebView app's done mark
/// comes over with the rest, so a phone that had it done there isn't given it twice.
class Retrofit {
  Retrofit._();
  static const doneKey = 'sgbus_retrofit';
  static final ridesSince = DateTime.parse('2026-10-27T00:53:11+08:00').millisecondsSinceEpoch;
  static final coinsSince = DateTime.parse('2026-11-02T00:46:08+08:00').millisecondsSinceEpoch;

  static bool _isRide(Map l) => l['kind'] == 'bus' || l['kind'] == 'train';
  static List<Map> _past() => [
        for (final t in Store.I.list('sgbus_trips').whereType<Map>())
          if (((t['startedAt'] as num?) ?? coinsSince) < coinsSince) t,
      ];
  static bool _boarded(Map t) => (t['legs'] as List? ?? const []).whereType<Map>().any(
      (l) => _isRide(l) && l['done'] == true && (l['waitMeasured'] == true || (l['kind'] == 'bus' && l['rideMeasured'] == true)));
  static List<Map> _unjudged() => _past().where((t) => ((t['startedAt'] as num?) ?? 0) < ridesSince && _boarded(t)).toList();

  static List<({Map trip, int coins})> _owed() {
    final paid = Coins.tripsPaid();
    final judged = {for (final t in (RideCheck.record()['trips'] as List).whereType<Map>()) t['id']};
    return [
      for (final t in _past())
        if (t['arrived'] == true &&
            !paid.contains(t['id']) &&
            (t['legs'] as List? ?? const []).whereType<Map>().any((l) => _isRide(l) && l['done'] == true) &&
            (((t['startedAt'] as num?) ?? 0) < ridesSince ? _boarded(t) : judged.contains(t['id'])))
          (trip: t, coins: Coins.forPast(t)?.n ?? 0),
    ].where((x) => x.coins > 0).toList();
  }

  /// Gives what past trips are owed, once: { trips, coins, feats }, or null if it's been done.
  static ({int trips, int coins, List<String> feats})? run() {
    if (Store.I.get(doneKey) != null) return null;
    final due = _owed();
    final coins = due.fold<int>(0, (s, x) => s + x.coins);
    Store.I.putJson(doneKey, {'at': When.nowMs(), 'trips': due.length, 'coins': coins, 'feats': <String>[]});
    final feats = Feats.gather(() {
      RideCheck.addPast(_unjudged());
      for (final d in due) {
        Feats.pastTrip(d.trip);
      }
    });
    if (coins > 0) Coins.add(coins, info: {'why': 'past', 'trips': due.length}, quiet: true);
    Store.I.putJson(doneKey, {'at': When.nowMs(), 'trips': due.length, 'coins': coins, 'feats': feats});
    return (trips: due.length, coins: coins, feats: feats);
  }
}
