// What the Get Off Alert keeps an eye on while a trip runs (the site's js/trip.js), each on the
// trip's tick, saying so on the bar and the trip's screen:
//
//   Get ready to board  while you wait for a bus leg's bus, its live timing at your stop, every
//                       30 s (15 s once it's within 3 min); about a minute away, you're told once,
//                       a notification and a buzz.
//   Last bus soon       each bus leg still to board, once a minute: down to its last three buses,
//                       due before you'd get there, or gone. One you'll miss has the trip find
//                       another way to where it ends without that bus, from where the last ride
//                       before it ends if there's one, and switch to it by itself, with Undo. With
//                       none, it says so, with Navigate from here or See all ways.
//   Traffic             every 5 minutes, each bus leg still ahead, by LTA's live speeds: one
//                       slowed by 2 min or more, or with an incident, says so; tapped, the live
//                       map shows its road.
//   A faster way        every 3 minutes, planned again from where you are, or from the next stop on
//                       a ride, with its first bus by its live timing; one that gets you in at least
//                       5 min and 15% sooner is suggested, walking or cycling the rest too, and says
//                       why: Reroute takes it, Keep my way puts it away for a while.
//   The server          the trip sent to /api/push/trips/<device>, at the start, at each change
//                       and as the app goes into the background, so it follows the bus from LTA's
//                       live positions and pushes the alert itself; its answer says how far it's
//                       got. A push that arrives here (tripPush) is taken as an alert given.
//   MyICA               a trip to Tuas or Woodlands Checkpoint has its button, for ICA's app.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/network.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../alerts/alerts.dart';
import '../map/live_map.dart';
import '../nav/nav_page.dart';
import 'trip.dart';

class TripNote {
  const TripNote(this.text, {this.tone = 'info', this.action, this.onAction, this.second, this.onSecond, this.onTap});
  final String text;
  final String tone; // info, warn, error
  final String? action;
  final VoidCallback? onAction;
  final String? second;
  final VoidCallback? onSecond;
  final VoidCallback? onTap;
}

class TripWatch extends ChangeNotifier with WidgetsBindingObserver {
  TripWatch._();
  static final TripWatch I = TripWatch._();

  static const _boardEvery = 30000, _boardNearEvery = 15000, _boardNear = 3 * 60000, _boardMs = 75000, _boardGone = -30000;
  static const _lastEvery = 60000, _lastMin = 30;
  static const _trafficEvery = 5 * 60000, _trafficSay = 2;
  static const _fasterEvery = 3 * 60000, _fasterMin = 5, _fasterShare = 0.15, _keepFor = 15 * 60000;
  static const _liveSync = 60000;

  Timer? _tick;
  String? _tripId;
  int _boardAt = 0, _lastAt = 0, _trafficAt = 0, _fasterAt = 0, _syncedAt = 0;
  int? _boardEta;
  final Map<int, ({String kind, String text})> _lastHeard = {};
  final Set<int> _lastWarned = {};
  final Map<int, Map> _traffic = {};
  final Set<int> readied = {};
  String? boardText;
  Map<String, Object?>? _push;

  void start() {
    WidgetsBinding.instance.addObserver(this);
    Trip.I.addListener(_changed);
    AppNav.register('tripPush', (a) => _pushed('${a['type']}', '${a['tripId']}', (a['leg'] as num?)?.toInt(), '${a['text'] ?? ''}'));
    _changed();
  }

  int _lastLeg = -1;
  void _changed() {
    final t = Trip.I;
    if (!t.active) {
      if (_tripId != null) _unsync();
      _tick?.cancel();
      _tick = null;
      _tripId = null;
      _reset();
      notifyListeners();
      return;
    }
    if (_tripId != t.id) {
      _tripId = t.id;
      _reset();
      _tick?.cancel();
      _tick = Timer.periodic(const Duration(seconds: 15), (_) => _onTick());
      _lastLeg = t.leg;
      _sync();
      _onTick();
    } else if (_lastLeg != t.leg) {
      _lastLeg = t.leg;
      boardText = null;
      _boardEta = null;
      _sync();
    }
    notifyListeners();
  }

  void _reset() {
    _boardAt = _lastAt = _trafficAt = _fasterAt = _syncedAt = 0;
    _boardEta = null;
    _lastHeard.clear();
    _lastWarned.clear();
    _traffic.clear();
    _faster = null;
    _fasterKept = null;
    _fasterSaid = null;
    _another = null;
    _keptWay = null;
    _switchKey = null;
    readied.clear();
    boardText = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (Trip.I.active && (state == AppLifecycleState.paused || state == AppLifecycleState.resumed)) _sync();
  }

  Future<void> _onTick() async {
    final t = Trip.I;
    if (!t.active) return;
    await Future.wait([_watchBoard(), _watchLastBus(), _watchTraffic(), _watchFaster()]);
    if (t.lastFixAt > 0 && When.nowMs() - t.lastFixAt < 60000 && When.nowMs() - _syncedAt >= _liveSync) _sync();
    notifyListeners();
  }

  // ---------- get ready to board ----------

  bool get _waiting {
    final t = Trip.I;
    final l = t.current;
    return l != null && l.kind == 'bus' && l.service != null && l.board != null && !t.boarded && !readied.contains(t.leg);
  }

  Future<void> _watchBoard() async {
    if (!_waiting) return;
    final every = _boardEta != null && _boardEta! <= _boardNear ? _boardNearEvery : _boardEvery;
    if (When.nowMs() - _boardAt < every - 7500) return;
    _boardAt = When.nowMs();
    final t = Trip.I;
    final leg = t.current!;
    final at = t.leg;
    try {
      final a = await Arrivals.fetch(leg.board!, leg.service);
      final svc = a.services.where((s) => s.serviceNo.toUpperCase() == leg.service!.toUpperCase()).firstOrNull;
      final eta = svc?.next?.etaMs;
      _boardEta = eta;
      if (Trip.I.leg != at || eta == null || !_waiting) return;
      if (eta <= _boardMs && eta > _boardGone) {
        final where = leg.names.isNotEmpty ? leg.names.first : Stops.nameOf(leg.board!);
        boardText = eta <= 20000
            ? tr('trip.boardArriving', '{ride} is arriving at {stop}. Get ready to board.', {'ride': leg.label, 'stop': where})
            : tr('trip.boardOneMin', '{ride} is 1 min away from {stop}. Get ready to board.', {'ride': leg.label, 'stop': where});
        readied.add(at);
        _notify(tr('trip.getReady', 'Get ready to board'), boardText!, 'board');
        _sync();
      }
    } catch (_) {}
  }

  void _notify(String title, String body, String channel) {
    if (Native.has('trip')) {
      Native.call('Trip', 'buzz', {'what': channel}).catchError((_) => null);
    } else {
      HapticFeedback.heavyImpact();
    }
    if (Native.has('notify')) {
      Native.call('SgBus', 'notify', {'channel': channel, 'title': title, 'body': body}).catchError((_) => null);
    } else {
      AppNav.say(body);
    }
  }

  // ---------- last bus soon ----------

  /// A bus's last bus at a stop on today's service day: minutes from now and "00:18".
  static ({double left, String text})? lastBusAt(String service, String code) {
    final times = BusNet.lastBuses(service, code);
    if (times == null) return null;
    final sgNow = When.nowMs() + 8 * 3600000;
    const day = 86400000;
    final dayStart = ((sgNow - 3 * 3600000) ~/ day) * day;
    final weekday = DateTime.fromMillisecondsSinceEpoch(dayStart, isUtc: true).weekday % 7;
    final t = weekday == 6 ? times['sat'] : weekday == 0 ? times['sun'] : times['wd'];
    if (t == null || !RegExp(r'^\d{4}$').hasMatch(t)) return null;
    var m = int.parse(t.substring(0, 2)) * 60 + int.parse(t.substring(2));
    if (m < 3 * 60) m += 24 * 60;
    return (left: (dayStart + m * 60000 - sgNow) / 60000, text: '${(int.parse(t.substring(0, 2)) % 24).toString().padLeft(2, '0')}:${t.substring(2)}');
  }

  double _minutesTo(int i) {
    final t = Trip.I;
    var m = 0.0;
    for (var k = t.leg; k < i && k < t.legs.length; k++) {
      final l = t.legs[k];
      m += k == t.leg && l.points.length > 1 ? l.minutes * (1 - (t.pos / (l.points.length - 1)).clamp(0.0, 1.0)) : l.minutes + l.wait;
    }
    return m;
  }

  Future<void> _watchLastBus() async {
    final t = Trip.I;
    if (!BusNet.ready || When.nowMs() - _lastAt < _lastEvery - 7500) return;
    _lastAt = When.nowMs();
    final id = t.id;
    final heard = <int, ({String kind, String text})>{};
    await Future.wait([
      for (final (i, leg) in t.legs.indexed)
        if (i >= t.leg && leg.kind == 'bus' && leg.service != null && leg.board != null && !(i == t.leg && t.boarded))
          () async {
            final last = lastBusAt(leg.service!, leg.board!);
            final reach = _minutesTo(i);
            if (last == null || last.left > reach + 120) return;
            try {
              final a = await Arrivals.fetch(leg.board!, leg.service);
              final svc = a.services.where((s) => s.serviceNo.toUpperCase() == leg.service!.toUpperCase()).firstOrNull;
              final etas = [for (final b in svc?.buses ?? const <Bus?>[]) if (b?.etaMs != null && b!.etaMs! > _boardGone) b.etaMs! / 60000];
              final where = leg.names.isNotEmpty ? leg.names.first : Stops.nameOf(leg.board!);
              final bus = leg.label;
              if (etas.isEmpty && last.left < 0) {
                heard[i] = (kind: 'gone', text: tr('trip.lastGone', "{bus}'s last bus from {stop} has gone ({time}).", {'bus': bus, 'stop': where, 'time': last.text}));
              } else if (last.left < reach && !etas.any((e) => e >= reach)) {
                heard[i] = (kind: 'miss', text: tr('trip.lastMiss', "{bus}'s last bus from {stop} is at {time}, before you'll get there.", {'bus': bus, 'stop': where, 'time': last.text}));
              } else if (etas.length >= 3 ? last.left <= etas[2] + 1 : last.left <= _lastMin) {
                heard[i] = (kind: 'soon', text: tr('trip.lastSoonText', "Last bus soon: {bus}'s last from {stop} is at {time}.", {'bus': bus, 'stop': where, 'time': last.text}));
              }
            } catch (_) {}
          }(),
    ]);
    if (Trip.I.id != id) return;
    _lastHeard
      ..clear()
      ..addAll(heard);
    final lost = heard.entries.where((e) => e.value.kind != 'soon').toList();
    if (lost.isNotEmpty) {
      await _findAnother([for (final e in lost) e.key]);
      if (Trip.I.id != id) return;
      final found = _another;
      // Undoing a switch made by itself: not switched again for the same lost bus.
      if (found?.way != null && t.switchedNote == null && _keptWay != found!.key) {
        _autoSwitch(found, lost.map((e) => e.value.text).join(' '));
        return;
      }
    } else {
      _another = null;
    }
    for (final e in heard.entries) {
      if (!_lastWarned.add(e.key)) continue;
      final instead = e.value.kind != 'soon' && _another != null ? ' ${_anotherText()}' : '';
      _notify(e.value.kind == 'soon' ? tr('trip.lastSoon', 'Last bus soon') : tr('settings.short.last_bus', 'Last bus'), '${e.value.text}$instead', 'board');
    }
  }

  // ---------- planning again ----------

  /// Where you are: a recent fix, or where the trip has you (the next stop, on a ride).
  NavEnd _whereNow() {
    final t = Trip.I;
    final label = tr('trip.whereYouAre', 'Where you are');
    if (t.here != null && When.nowMs() - t.lastFixAt < 120000) return NavEnd(label, t.here!.lat, t.here!.lng);
    final leg = t.current!;
    final i = math.min(leg.points.length - 1, t.pos.ceil());
    return NavEnd(label, leg.points[i][0], leg.points[i][1]);
  }

  /// Where the trip ends.
  NavEnd _tripEnd() {
    final t = Trip.I;
    final to = t.to;
    if (to != null && to['lat'] is num) return NavEnd('${to['label'] ?? ''}', (to['lat'] as num).toDouble(), (to['lng'] as num).toDouble());
    final last = t.legs.last;
    return NavEnd(last.to, last.points.last[0], last.points.last[1]);
  }

  /// Where another way goes: the trip's stop on the way while it's still ahead, or else where the
  /// trip ends. `upTo` is the part the trip goes on with from there.
  ({NavEnd to, int upTo, bool via}) _goal() {
    final t = Trip.I;
    for (var i = t.leg + 1; i < t.legs.length; i++) {
      final v = t.legs[i].afterVia;
      if (v != null) return (to: NavEnd('${v['label'] ?? ''}', (v['lat'] as num).toDouble(), (v['lng'] as num).toDouble()), upTo: i, via: true);
    }
    return (to: _tripEnd(), upTo: t.legs.length, via: false);
  }

  List<TripLeg> _withRest(List<TripLeg> legs, int upTo) => [...legs, ...Trip.I.legs.skip(upTo)];

  /// A way's rides, "Bus 12 → NE Line".
  static String _ridesText(Map o) => (o['legs'] as List).cast<Map>().where((l) => l['mode'] != 'walk').map((l) {
        final route = '${l['route']}';
        return l['mode'] == 'bus' ? tr('trip.bus', 'Bus {no}', {'no': route}) : l['lrt'] == true ? tr('trip.lrt', '{line} LRT', {'line': route}) : tr('trip.line', '{line} Line', {'line': route});
      }).join(' → ');

  /// When you'd get in, setting off `after` minutes from now.
  static String _byClock(num minutes, [num after = 0]) => tr('trip.thereBy', ', there by {time}', {'time': When.clock(When.nowMs() + ((after + minutes) * 60000).round())});

  /// What to do first on a way, in words: "Walk 3 min to Opp Blk 5, take Bus 12 there".
  static String _firstStep(Map o) {
    final legs = (o['legs'] as List).cast<Map>();
    final ride = legs.where((l) => l['mode'] != 'walk').firstOrNull;
    if (ride == null) return tr('trip.walkRest', 'Walk the rest of the way');
    final route = '${ride['route']}';
    final what = ride['mode'] == 'bus'
        ? tr('trip.bus', 'Bus {no}', {'no': route})
        : ride['lrt'] == true
            ? tr('trip.theLrt', 'the {line} LRT', {'line': route})
            : tr('trip.theLine', 'the {line} Line', {'line': route});
    final first = legs.first;
    final walked = first['mode'] == 'walk' && ((first['metres'] as num?) ?? 100) >= 60;
    return walked
        ? tr('trip.walkThenTake', 'Walk {m} min to {stop}, take {ride} there', {'m': math.max(1, ((first['minutes'] as num?) ?? 1).round()), 'stop': placeName(ride['from']), 'ride': what})
        : tr('trip.takeFrom', 'Take {ride} from {stop}', {'ride': what, 'stop': placeName(ride['from'])});
  }

  // ---------- another way, when a last bus is lost ----------

  static const _anotherEvery = 5 * 60000;

  /// The quickest way found to where the trip's going without the lost buses (`way` null if there's
  /// none): from the end of the last ride before them (`via` it, and `reach` the minutes till you're
  /// there), or from where you are (`k` null).
  ({NavEnd from, NavEnd to, int j, int? k, String? via, double reach, int upTo, Map<String, dynamic>? way, int at, String key, bool failed})? _another;
  String? _keptWay;
  String? _switchKey;

  static String _rideKey(String route, String? code) => 'bus:${route.toUpperCase()}@${code ?? ''}';

  Future<void> _findAnother(List<int> lostAt) async {
    final t = Trip.I;
    final id = t.id;
    final key = lostAt.map((i) => _rideKey(t.legs[i].service ?? '', t.legs[i].board)).join('>');
    if (_another?.key == key && When.nowMs() - _another!.at < _anotherEvery) return;
    final g = _goal();
    final skip = key.split('>').toSet();
    Map<String, dynamic>? pick(Map<String, dynamic> data) {
      final options = (data['options'] as List? ?? const []).whereType<Map>().map((o) => Map<String, dynamic>.from(o)).toList();
      return options.where((o) => o['walkOnly'] != true && !(o['legs'] as List).cast<Map>().any((l) => l['mode'] == 'bus' && skip.contains(_rideKey('${l['route']}', (l['from'] as Map?)?['code'] as String?)))).firstOrNull ??
          options.where((o) => o['walkOnly'] == true).firstOrNull;
    }

    // The waypoint: where the last ride before the first lost bus ends, if there's one from here on.
    final tries = <({NavEnd from, int j, int? k, String? via, double reach})>[];
    final firstLost = lostAt.reduce(math.min);
    for (var r = firstLost - 1; r >= t.leg; r--) {
      final leg = t.legs[r];
      if (!leg.ride) continue;
      final last = leg.points.length - 1;
      tries.add((from: NavEnd(leg.names.length > last ? leg.names[last] : leg.to, leg.points[last][0], leg.points[last][1]), j: r, k: last, via: leg.label, reach: _minutesTo(r + 1)));
      break;
    }
    tries.add((from: _whereNow(), j: t.leg, k: null, via: null, reach: 0));
    var failed = 0;
    for (final x in tries) {
      // For when you'd be there, as the buses running then aren't the ones running now.
      final when = x.reach >= 1 ? WhenPick('leave', When.msToAt(When.nowMs() + (x.reach * 60000).round())) : null;
      try {
        final data = await fetchWays(x.from, g.to, when: when);
        if (Trip.I.id != id) return;
        final way = pick(data);
        if (way != null || identical(x, tries.last)) {
          _another = (from: x.from, to: g.to, j: x.j, k: x.k, via: x.via, reach: x.reach, upTo: g.upTo, way: way, at: When.nowMs(), key: key, failed: false);
          return;
        }
      } catch (_) {
        failed++;
      }
    }
    if (Trip.I.id != id) return;
    // Not asked again for a minute, rather than on every check.
    if (failed > 0) {
      final x = tries.first;
      _another = (from: x.from, to: g.to, j: x.j, k: x.k, via: x.via, reach: x.reach, upTo: g.upTo, way: null, at: When.nowMs() - _anotherEvery + 60000, key: key, failed: true);
    }
  }

  /// The way found, in a line: "Instead: walk 3 min to Opp Blk 5, take Bus 12 there. Bus 12 → NE
  /// Line, ~35 min, there by 01:20." `lead` false leaves off "Instead: ", for after "Now: ".
  String _anotherText({bool lead = true}) {
    final a = _another;
    final o = a?.way;
    if (a == null || o == null) {
      return a?.failed == true ? tr('trip.anotherFailed', "Couldn't look for another way just now. It'll try again in a minute.") : tr('trip.anotherNone', 'No other way by bus or train is running now.');
    }
    final by = _byClock(o['minutes'] as num, a.reach);
    final way = o['walkOnly'] == true
        ? tr('trip.walkRestAbout', 'Walk the rest of the way, ~{m} min{by}.', {'m': o['minutes'], 'by': by})
        : tr('trip.stepThenRides', '{step}. {rides}, ~{m} min{by}.', {'step': _firstStep(o), 'rides': _ridesText(o), 'm': o['minutes'], 'by': by});
    if (a.via != null) return tr('trip.afterVia', 'After {via} to {stop}: {way}', {'via': a.via, 'stop': a.from.label, 'way': way});
    return lead ? tr('trip.instead', 'Instead: {way}', {'way': way}) : way;
  }

  void _switchToAnother(String note) {
    final a = _another;
    final made = a?.way == null ? null : tripFromNav(a!.way!, a.from, a.to);
    if (a == null || made == null || made.legs.isEmpty) return;
    Trip.I.replanAt(a.j, a.k, _withRest(made.legs, a.upTo), note: note);
    _another = null;
    _faster = null;
    notifyListeners();
  }

  void _autoSwitch(({NavEnd from, NavEnd to, int j, int? k, String? via, double reach, int upTo, Map<String, dynamic>? way, int at, String key, bool failed}) found, String reason) {
    final now = _anotherText(lead: false);
    _switchKey = found.key;
    _switchToAnother('${tr('trip.switched', 'Switched to another way.')} $reason ${tr('trip.now', 'Now: {now}', {'now': now})}');
    _notify(tr('trip.switchedTitle', 'Switched to another way'), '$reason ${tr('trip.now', 'Now: {now}', {'now': now})}', 'board');
  }

  void _undoSwitch() {
    if (_switchKey != null) _keptWay = _switchKey;
    _switchKey = null;
    Trip.I.undo();
    _lastAt = 0;
    notifyListeners();
  }

  // ---------- traffic ----------

  Future<void> _watchTraffic() async {
    final t = Trip.I;
    if (When.nowMs() - _trafficAt < _trafficEvery - 7500) return;
    _trafficAt = When.nowMs();
    final id = t.id;
    final heard = <int, Map>{};
    await Future.wait([
      for (final (i, leg) in t.legs.indexed)
        if (i >= t.leg && leg.kind == 'bus' && leg.points.length >= 2 && leg.points.length <= 120)
          () async {
            try {
              final r = await Api.map('traffic', query: {'points': leg.points.map((p) => '${p[0].toStringAsFixed(5)},${p[1].toStringAsFixed(5)}').join(';')});
              if (r['at'] != null) heard[i] = r;
            } catch (_) {}
          }(),
    ]);
    if (Trip.I.id != id) return;
    _traffic
      ..clear()
      ..addAll(heard);
  }

  ({int i, int extra, String text})? _trafficNote() {
    final t = Trip.I;
    for (var i = t.leg; i < t.legs.length; i++) {
      final tr0 = _traffic[i];
      final leg = t.legs[i];
      if (tr0 == null || leg.kind != 'bus') continue;
      final last = math.max(1, leg.points.length - 1);
      final pos = i == t.leg ? t.pos : 0.0;
      if (pos >= last) continue;
      final factors = [for (final f in (tr0['factors'] as List? ?? const [])) (f as num).toDouble()];
      final from = pos.floor().clamp(0, math.max(0, factors.length - 1)).toInt();
      final ahead = factors.length > from ? factors.sublist(from) : const <double>[];
      final avg = ahead.isEmpty ? 1.0 : ahead.reduce((a, b) => a + b) / ahead.length;
      final extra = (leg.minutes * (1 - pos / last) * (avg - 1)).round();
      final incidents = [
        for (final inc in (tr0['incidents'] as List? ?? const []).whereType<Map>())
          () {
            final m = '${inc['message'] ?? ''}'.replaceFirst(RegExp(r'^\(\d+/\d+\)\d+:\d+\s*'), '');
            final type = '${inc['type'] ?? ''}';
            return m.toLowerCase().startsWith(type.toLowerCase()) ? m : '$type: $m';
          }(),
      ];
      if (extra < _trafficSay && incidents.isEmpty) continue;
      final roads = [for (final r in (tr0['roads'] as List? ?? const [])) '$r'].join(tr('trip.and', ' and '));
      final slow = extra >= _trafficSay
          ? (roads.isNotEmpty
              ? tr('trip.slowerRoads', '{ride} ~{m} min slower than usual: heavy traffic on {roads}.', {'ride': leg.label, 'm': extra, 'roads': roads})
              : tr('trip.slower', '{ride} ~{m} min slower than usual.', {'ride': leg.label, 'm': extra}))
          : '${leg.label}:';
      return (i: i, extra: extra, text: [slow, ...incidents].join(' '));
    }
    return null;
  }

  // ---------- a faster way ----------

  static const _fasterFromMin = 10;

  /// Getting a bike out and parking it again.
  static const _bikeExtraMin = 2;

  ({NavEnd from, NavEnd to, int j, int? k, double reach, String kind, Map<String, dynamic>? way, int minutes, int saves, String why, int upTo, bool via})? _faster;
  ({int at, int saves})? _fasterKept;
  String? _fasterSaid;

  static String _rideKeyOf(String mode, String? route) => '$mode:${(route ?? '').toUpperCase()}';

  /// A way's minutes with its first bus by its live timing at the stop, catchable after the walk
  /// there; null if none comes in time.
  Future<double?> _liveMinutes(Map<String, dynamic> o) async {
    final legs = (o['legs'] as List).cast<Map>();
    final k = legs.indexWhere((l) => l['mode'] != 'walk');
    final minutes = (o['minutes'] as num).toDouble();
    if (k == -1) return minutes;
    final ride = legs[k];
    final code = (ride['from'] as Map?)?['code'];
    if (ride['mode'] != 'bus' || code == null) return minutes;
    final walk = legs.take(k).fold<double>(0, (a, l) => a + ((l['minutes'] as num?) ?? 0));
    try {
      final a = await Arrivals.fetch('$code', '${ride['route']}');
      final svc = a.services.where((s) => s.serviceNo.toUpperCase() == '${ride['route']}'.toUpperCase()).firstOrNull;
      if (svc == null) return minutes;
      final due = [for (final b in svc.buses) if (b?.etaMs != null) b!.etaMs! / 60000].where((m) => m >= walk).firstOrNull;
      return due == null ? null : minutes - ((ride['wait'] as num?) ?? 0) + (due - walk);
    } catch (_) {
      return minutes;
    }
  }

  /// Why another way's quicker, as far as the trip can tell: traffic, or a long wait.
  String _whyFaster() {
    final t = Trip.I;
    final note = _trafficNote();
    if (note != null && note.extra >= _trafficSay) {
      final leg = t.legs[note.i];
      final roads = [for (final r in (_traffic[note.i]?['roads'] as List? ?? const [])) '$r'].join(tr('trip.and', ' and '));
      return roads.isNotEmpty ? tr('trip.slowedOn', '{ride} is slowed by traffic on {roads}', {'ride': leg.label, 'roads': roads}) : tr('trip.slowed', '{ride} is slowed by traffic', {'ride': leg.label});
    }
    final leg = t.current;
    if (leg != null && leg.kind == 'bus' && !t.boarded && _boardEta != null) {
      final wait = (_boardEta! / 60000).round();
      if (wait >= 8) return tr('trip.notDueFor', "{ride} isn't due for {m} min", {'ride': leg.label, 'm': wait});
    }
    return '';
  }

  String _fasterText() {
    final f = _faster!;
    final why = f.why.isEmpty ? '' : tr('trip.fasterWhy', ', as {why}', {'why': f.why});
    final by = _byClock(f.minutes);
    final v = {'stop': f.from.label, 'm': f.minutes, 'by': by, 'saves': f.saves, 'why': why};
    final String words;
    if (f.kind == 'walk') {
      words = f.k != null ? tr('trip.fasterWalkFrom', 'Faster to walk from {stop}: ~{m} min{by}. Saves {saves} min{why}.', v) : tr('trip.fasterWalk', 'Faster to walk: ~{m} min{by}. Saves {saves} min{why}.', v);
    } else if (f.kind == 'cycle') {
      words = f.k != null ? tr('trip.fasterBikeFrom', 'Faster by bike from {stop}: ~{m} min{by}. Saves {saves} min{why}.', v) : tr('trip.fasterBike', 'Faster by bike: ~{m} min{by}. Saves {saves} min{why}.', v);
    } else {
      final head = tr('trip.fasterWay', 'Faster: {rides}, ~{m} min{by}. Saves {saves} min{why}.', {...v, 'rides': _ridesText(f.way!)});
      final step = _firstStep(f.way!);
      words = '$head ${f.k != null ? tr('trip.getOffThen', 'Get off at {stop}, then: {step}.', {'stop': f.from.label, 'step': step}) : '$step.'}';
    }
    // To the trip's stop on the way, not its end: said so, as the rest of the trip stands.
    return f.via ? '$words ${tr('trip.fasterThenStop', "That's to {place}, then on as planned.", {'place': f.to.label})}' : words;
  }

  Future<void> _watchFaster() async {
    if (When.nowMs() - _fasterAt < _fasterEvery - 7500) return;
    // A lost last bus comes first, and a switch just made stands.
    final t = Trip.I;
    if (_lastHeard.values.any((w) => w.kind != 'soon') || t.switchedNote != null) return;
    final g = _goal();
    final left = _minutesTo(g.upTo);
    if (left < _fasterFromMin) return;
    _fasterAt = When.nowMs();
    final id = t.id;
    final legs = t.legs;
    final leg = t.current;
    if (leg == null) return;
    final last = leg.points.length - 1;
    // On a ride: from its next stop, getting off there. Otherwise from where you are.
    final NavEnd from;
    int? k;
    var reach = 0.0;
    if (leg.ride && t.boarded) {
      final next = math.min(last, t.pos.floor() + 1);
      if (next >= last) return;
      k = next;
      from = NavEnd(next < leg.names.length ? leg.names[next] : leg.to, leg.points[next][0], leg.points[next][1]);
      reach = math.max(0, leg.minutes * (next - t.pos) / math.max(1, last));
    } else {
      from = _whereNow();
    }
    final Map<String, dynamic> data;
    try {
      final when = reach >= 1 ? WhenPick('leave', When.msToAt(When.nowMs() + (reach * 60000).round())) : null;
      data = await fetchWays(from, g.to, when: when);
    } catch (_) {
      return;
    }
    if (Trip.I.id != id || !identical(Trip.I.legs, legs)) return;
    // Your own way from there, which isn't another.
    final mine = legs
        .sublist(k == null ? t.leg : t.leg + 1, g.upTo)
        .where((l) => l.ride)
        .map((l) => _rideKeyOf(l.kind, l.kind == 'bus' ? l.service : (l.route ?? l.label.split(' ').first)))
        .join('>');
    final picks = <({String kind, Map<String, dynamic>? way, double minutes})>[];
    final options = (data['options'] as List? ?? const []).whereType<Map>().map((o) => Map<String, dynamic>.from(o));
    final others = options
        .where((o) => o['walkOnly'] != true && (o['legs'] as List).cast<Map>().where((l) => l['mode'] != 'walk').map((l) => _rideKeyOf('${l['mode']}', '${l['route']}')).join('>') != mine)
        .take(2);
    for (final o in others) {
      final m = await _liveMinutes(o);
      if (m != null) picks.add((kind: 'way', way: o, minutes: reach + m));
    }
    final byFoot = data['others'] as Map?;
    final walk = ((byFoot?['walk'] as Map?)?['minutes'] as num?)?.toDouble();
    final cycle = ((byFoot?['cycle'] as Map?)?['minutes'] as num?)?.toDouble();
    if (walk != null) picks.add((kind: 'walk', way: null, minutes: reach + walk));
    if (cycle != null && Store.I.get('sgbus_bike') == 'on') picks.add((kind: 'cycle', way: null, minutes: reach + cycle + _bikeExtraMin));
    if (Trip.I.id != id || !identical(Trip.I.legs, legs)) return;
    picks.sort((a, b) => a.minutes.compareTo(b.minutes));
    final best = picks.firstOrNull;
    final saves = best == null ? 0 : (left - best.minutes).round();
    final kept = _fasterKept != null && When.nowMs() - _fasterKept!.at < _keepFor && saves < _fasterKept!.saves + _fasterMin;
    if (best != null && saves >= math.max(_fasterMin, left * _fasterShare) && !kept) {
      _faster = (from: from, to: g.to, j: t.leg, k: k, reach: reach, kind: best.kind, way: best.way, minutes: best.minutes.round(), saves: saves, why: _whyFaster(), upTo: g.upTo, via: g.via);
      final said = '${best.kind}:${best.way == null ? '' : (best.way!['legs'] as List).cast<Map>().map((l) => l['route'] ?? l['mode']).join('>')}';
      if (said != _fasterSaid) {
        _fasterSaid = said;
        _notify(tr('trip.fasterTitle', 'A faster way: saves {m} min', {'m': saves}), _fasterText(), 'board');
      }
    } else {
      _faster = null;
    }
    notifyListeners();
  }

  void _takeFaster() {
    final f = _faster;
    if (f == null) return;
    final m = f.minutes - f.reach.round();
    final List<TripLeg> legs;
    if (f.kind == 'way') {
      legs = tripFromNav(f.way!, f.from, f.to)?.legs ?? const [];
    } else {
      legs = [
        TripLeg(
          kind: 'walk',
          label: f.kind == 'cycle' ? tr('trip.foot.cycle', 'Cycle') : tr('trip.walk', 'Walk'),
          to: f.to.label,
          points: [[f.from.lat, f.from.lng], [f.to.lat, f.to.lng]],
          names: [f.from.label, f.to.label],
          minutes: math.max(1, m).toDouble(),
          foot: f.kind,
        ),
      ];
    }
    if (legs.isEmpty) return;
    final now = f.kind == 'way'
        ? '${_firstStep(f.way!)}.'
        : f.via
            ? (f.kind == 'cycle' ? tr('trip.cycleToStop', 'Cycle to {place}, ~{m} min.', {'place': f.to.label, 'm': m}) : tr('trip.walkToStop', 'Walk to {place}, ~{m} min.', {'place': f.to.label, 'm': m}))
            : (f.kind == 'cycle' ? tr('trip.cycleRest', 'Cycle the rest of the way, ~{m} min.', {'m': m}) : tr('trip.walkRestMin', 'Walk the rest of the way, ~{m} min.', {'m': m}));
    final title = f.k != null ? tr('trip.changedFaster', 'Changed at {stop} for a faster way.', {'stop': f.from.label}) : tr('trip.reroutedFaster', 'Rerouted to a faster way.');
    _faster = null;
    _switchKey = null;
    Trip.I.replanAt(f.j, f.k, _withRest(legs, f.upTo), note: '$title ${tr('trip.now', 'Now: {now}', {'now': now})}');
    notifyListeners();
  }

  // ---------- the server ----------

  Map<String, String> _words() => {
        'lang': I18n.I.lang,
        'alertTitle': tr('route.get_off_alert', 'Get Off Alert'),
        'boardTitle': tr('trip.getReady', 'Get ready to board'),
        'getOffNow': tr('trip.getOffNow', 'Get off now at {stop}.'),
        'getOffOne': tr('trip.getOffOne', 'Get off in 1 stop, at {stop}.'),
        'getOffOneChange': tr('trip.getOffOneChange', 'Get off in 1 stop, at {stop}, to change.'),
        'getOffMany': tr('trip.getOffMany', 'Get off in {n} stops, at {stop}.'),
        'getOffManyChange': tr('trip.getOffManyChange', 'Get off in {n} stops, at {stop}, to change.'),
        'boardArriving': tr('trip.boardArriving', '{ride} is arriving at {stop}. Get ready to board.'),
        'boardOneMin': tr('trip.boardOneMin', '{ride} is 1 min away from {stop}. Get ready to board.'),
      };

  Future<void> _sync() async {
    final t = Trip.I;
    if (!t.active || !Trip.enabled) return;
    try {
      _push ??= await Alerts.pushTarget();
    } catch (_) {}
    final push = _push;
    if (push == null || !t.active) return;
    _syncedAt = When.nowMs();
    final body = jsonEncode({
      'tripId': t.id,
      'subscription': push['subscription'],
      'legs': [
        for (final l in t.legs)
          {
            'kind': l.kind, 'to': l.to, 'points': l.points, 'minutes': l.minutes, 'wait': l.wait, 'service': l.service, 'alight': l.alight, 'label': l.label,
            'walkAfter': 0, 'board': l.board, if (l.kind == 'bus') 'boardName': l.names.isNotEmpty ? l.names.first : '',
          },
      ],
      'share': null,
      'leg': t.leg,
      'at': t.pos,
      'pos': t.pos,
      'legStartedAt': t.legStartedAt,
      'seenAt': t.lastFixAt > 0 ? t.lastFixAt : t.legStartedAt,
      'anchor': null,
      'realignedAt': 0,
      'movedAt': t.movedAt,
      'clockRuns': t.current?.kind != 'bus' || t.boarded,
      'fixAt': t.lastFixAt,
      'alerted': [for (var i = 0; i < t.legs.length; i++) t.alerted.contains(i)],
      'readied': [for (var i = 0; i < t.legs.length; i++) readied.contains(i)],
      'quiet': const ['true', 'on'].contains(Store.I.get('sgbus_getoff_earphones')),
      'words': _words(),
    });
    try {
      final r = await http.put(Api.uri('push/trips/${push['deviceId']}'), headers: {'Content-Type': 'application/json'}, body: body).timeout(const Duration(seconds: 15));
      if (r.statusCode != 200) return;
      _adopt(jsonDecode(r.body) as Map);
    } catch (_) {}
  }

  void _adopt(Map state) {
    final t = Trip.I;
    if (!t.active || state['tripId'] != t.id) return;
    final following = t.lastFixAt > 0 && When.nowMs() - t.lastFixAt <= 60000;
    final leg = (state['leg'] as num?)?.toInt() ?? t.leg;
    final ahead = leg > t.leg && following;
    for (final (i, a) in (state['alerted'] as List? ?? const []).indexed) {
      if (a == true && !(ahead && i >= t.leg)) t.alerted.add(i);
    }
    for (final (i, r) in (state['readied'] as List? ?? const []).indexed) {
      if (r == true) readied.add(i);
    }
    if (!ahead && leg > t.leg && leg < t.legs.length) t.moveTo(leg, (state['legStartedAt'] as num?)?.toInt());
  }

  void _unsync() {
    final push = _push;
    if (push != null) http.delete(Api.uri('push/trips/${push['deviceId']}')).catchError((_) => http.Response('', 0));
  }

  /// A push from the server, the app open: an alert it gave for this trip.
  void _pushed(String type, String tripId, int? leg, String text) {
    final t = Trip.I;
    if (!t.active || tripId != t.id || leg == null) return;
    if (type == 'board') {
      readied.add(leg);
      if (leg == t.leg) boardText = text;
    } else if (!t.alerted.contains(leg)) {
      // Android shows nothing for a push with the app in front: sounded here, as if found here.
      t.alerted.add(leg);
      if (leg == t.leg) t.soundAlert(text);
    }
    notifyListeners();
  }

  // ---------- what's said ----------

  bool get _toCheckpoint {
    final t = Trip.I;
    if (t.legs.isEmpty) return false;
    final last = t.legs.last;
    return (last.alight != null && BusNet.isCheckpoint(last.alight!)) || BusNet.nearCheckpoint(last.points.last);
  }

  List<TripNote> notes() {
    final t = Trip.I;
    if (!t.active) return const [];
    final out = <TripNote>[];
    // Without a good fix, going by the clock: said, so that a dot standing still makes sense.
    final current = t.current;
    if (current != null && current.ride) {
      final age = When.nowMs() - t.lastFixAt;
      if (t.lastFixAt == 0 || age > 120000) {
        out.add(TripNote(tr('trip.noLocation', 'No location: going by the clock.'), tone: 'info'));
      } else if (age > 60000 || (t.here?.accuracy ?? 0) > 500) {
        out.add(TripNote(tr('trip.weakLocation', 'Location weak: going by the clock.'), tone: 'info'));
      }
      // The other buses that go straight there, while you wait for yours.
      if (!t.boarded) {
        final also = Trip.directBuses(current);
        if (also.isNotEmpty) out.add(TripNote('${tr('nav.alternate_buses', 'Also direct:')} ${also.join(', ')}', tone: 'info'));
      }
    }
    if (t.switchedNote != null) {
      out.add(TripNote(t.switchedNote!, tone: 'warn', action: tr('trip.undo', 'Undo'), onAction: _undoSwitch));
    }
    if (boardText != null && !t.boarded) out.add(TripNote(boardText!, tone: 'info'));
    for (final e in _lastHeard.entries) {
      // Once it's been switched for that, the note above says so.
      if (e.key >= t.leg && t.switchedNote != e.value.text) out.add(TripNote(e.value.text, tone: e.value.kind == 'soon' ? 'warn' : 'error'));
    }
    // A last bus lost: the way found, to take; or none, with Navigate to look for yourself.
    if (t.switchedNote == null && _lastHeard.entries.any((e) => e.key >= t.leg && e.value.kind != 'soon')) {
      final a = _another;
      final located = t.here != null && When.nowMs() - t.lastFixAt < 120000;
      if (a == null) {
        out.add(TripNote(tr('trip.findingAnother', 'Finding another way…'), tone: 'info'));
      } else {
        out.add(TripNote(
          _anotherText(),
          tone: 'info',
          action: a.way == null ? null : tr('trip.reroute', 'Reroute'),
          onAction: a.way == null ? null : () => _switchToAnother('${tr('trip.rerouted', 'Rerouted.')} ${tr('trip.now', 'Now: {now}', {'now': _anotherText(lead: false)})}'),
          second: located ? tr('trip.navFromHere', 'Navigate from here') : tr('trip.seeAllWays', 'See all ways'),
          onSecond: () => located ? openNav(from: NavEnd(tr('nav.yourLocation', 'Your location'), 0, 0, here: true), to: a.to) : openNav(from: a.from, to: a.to),
        ));
      }
    }
    final tn = _trafficNote();
    if (tn != null) {
      final leg = t.legs[tn.i];
      out.add(TripNote(
        '${tn.text} ${tr('trip.seeOnMap', 'See it on the map')}',
        tone: 'warn',
        onTap: () => LiveMap.traffic(leg.points, names: leg.names, title: tr('trip.busTo', 'Bus {no} to {stop}', {'no': leg.service ?? leg.label, 'stop': leg.to})),
      ));
    }
    final f = _faster;
    if (f != null) {
      out.add(TripNote(
        _fasterText(),
        tone: 'info',
        action: tr('trip.reroute', 'Reroute'),
        onAction: _takeFaster,
        second: tr('trip.keepMyWay', 'Keep my way'),
        onSecond: () {
          _fasterKept = (at: When.nowMs(), saves: f.saves);
          _faster = null;
          notifyListeners();
        },
      ));
    }
    if (_toCheckpoint) {
      out.add(TripNote(
        tr('app.myicaNote', 'Have your MyICA QR code ready for immigration.'),
        action: tr('trip.myica', 'MyICA'),
        onAction: () => Native.call('SgBus', 'openApp', {'name': 'myica'}).catchError((_) => null),
      ));
    }
    return out;
  }
}

/// The notes, as a column of rows for the trip's screen and bar.
class TripNotes extends StatelessWidget {
  const TripNotes({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: TripWatch.I,
        builder: (context, _) {
          final notes = TripWatch.I.notes();
          if (notes.isEmpty) return const SizedBox.shrink();
          final scheme = Theme.of(context).colorScheme;
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final n in compact ? notes.take(1) : notes)
              Material(
                color: switch (n.tone) {
                  'error' => scheme.errorContainer,
                  'warn' => const Color(0xFFFFE0B2),
                  _ => scheme.secondaryContainer,
                },
                child: InkWell(
                  onTap: n.onTap,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
                    child: Row(children: [
                      Expanded(
                        child: Text(n.text,
                            style: TextStyle(color: n.tone == 'error' ? scheme.onErrorContainer : n.tone == 'warn' ? const Color(0xFF4E2A00) : scheme.onSecondaryContainer, fontSize: 13)),
                      ),
                      if (n.second != null) TextButton(onPressed: n.onSecond, child: Text(n.second!)),
                      if (n.action != null) FilledButton.tonal(onPressed: n.onAction, child: Text(n.action!)),
                    ]),
                  ),
                ),
              ),
          ]);
        },
      );
}
