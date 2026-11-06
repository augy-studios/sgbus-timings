// What the Get Off Alert keeps an eye on while a trip runs (the site's js/trip.js), each on the
// trip's tick, saying so on the bar and the trip's screen:
//
//   Get ready to board  while you wait for a bus leg's bus, its live timing at your stop, every
//                       30 s (15 s once it's within 3 min); about a minute away, you're told once,
//                       a notification and a buzz.
//   Last bus soon       each bus leg still to board, once a minute: down to its last three buses,
//                       due before you'd get there, or gone. One you'll miss has the trip find
//                       another way to where it ends without that bus, and switch to it by itself,
//                       with Undo.
//   Traffic             every 5 minutes, each bus leg still ahead, by LTA's live speeds: one
//                       slowed by 2 min or more, or with an incident, says so; tapped, the live
//                       map shows its road.
//   A faster way        every 3 minutes, planned again from where you are; one that gets you in
//                       at least 5 min and 15% sooner is suggested: Reroute takes it, Keep my way
//                       puts it away for a while.
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
  static const _icaPlay = 'https://play.google.com/store/apps/details?id=sg.gov.ica.mobile.app';

  Timer? _tick;
  String? _tripId;
  int _boardAt = 0, _lastAt = 0, _trafficAt = 0, _fasterAt = 0, _syncedAt = 0;
  int? _boardEta;
  final Map<int, ({String kind, String text})> _lastHeard = {};
  final Set<int> _lastWarned = {};
  final Map<int, Map> _traffic = {};
  ({Map<String, dynamic> option, int sooner, String why})? _faster;
  int _keptUntil = 0;
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
    HapticFeedback.heavyImpact();
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
      // Another way to where it ends, without the lost buses, and switched to by itself.
      final skip = {for (final e in lost) '${t.legs[e.key].service}@${t.legs[e.key].board}'};
      final other = await _plan(skip: skip);
      if (other != null && Trip.I.id == id) {
        final words = lost.map((e) => e.value.text).join(' ');
        _switchTo(other, words);
        return;
      }
    }
    for (final e in heard.entries) {
      if (!_lastWarned.add(e.key)) continue;
      _notify(e.value.kind == 'soon' ? tr('trip.lastSoon', 'Last bus soon') : tr('settings.short.last_bus', 'Last bus'), e.value.text, 'board');
    }
  }

  // ---------- planning again ----------

  /// Where you are: a recent fix, or where the trip has you (the next stop, on a ride).
  NavEnd _whereNow() {
    final t = Trip.I;
    if (t.here != null && When.nowMs() - t.lastFixAt < 60000) return NavEnd(tr('nav.yourLocation', 'Your location'), t.here!.lat, t.here!.lng, here: true);
    final leg = t.current!;
    final i = math.min(leg.points.length - 1, t.pos.ceil());
    return NavEnd(i < leg.names.length ? leg.names[i] : leg.to, leg.points[i][0], leg.points[i][1]);
  }

  NavEnd? get _end {
    final to = Trip.I.to;
    return to != null && to['lat'] is num ? NavEnd('${to['label'] ?? ''}', (to['lat'] as num).toDouble(), (to['lng'] as num).toDouble()) : null;
  }

  Future<({Map<String, dynamic> option, NavEnd from, NavEnd to})?> _plan({Set<String> skip = const {}}) async {
    final to = _end;
    if (to == null) return null;
    final from = _whereNow();
    try {
      final customs = Store.I.get('sgbus_customs');
      final data = await Api.map('nav', query: {
        'from': from.coord(),
        'to': to.coord(),
        if (BusNet.openAccess) 'restricted': 1,
        if (['15', '30', '45', '60'].contains(customs)) 'customs': customs,
        if (Store.I.get('sgbus_bike') == 'on') 'bike': 1,
      });
      for (final o in (data['options'] as List? ?? const []).whereType<Map>()) {
        if (o['walkOnly'] == true) continue;
        final legs = (o['legs'] as List? ?? const []).whereType<Map>();
        if (legs.any((l) => l['mode'] == 'bus' && skip.contains('${l['route']}@${(l['from'] as Map?)?['code']}'))) continue;
        return (option: Map<String, dynamic>.from(o), from: from, to: to);
      }
    } catch (_) {}
    return null;
  }

  void _switchTo(({Map<String, dynamic> option, NavEnd from, NavEnd to}) way, String why) {
    final made = tripFromNav(way.option, way.from, way.to);
    if (made == null) return;
    Trip.I.replan(made.legs, note: why);
    _faster = null;
    _notify(tr('route.get_off_alert', 'Get Off Alert'), '$why ${tr('trip.switched', 'Switched to another way.')}', 'board');
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

  double _minutesLeft() => _minutesTo(Trip.I.legs.length);

  Future<void> _watchFaster() async {
    if (When.nowMs() - _fasterAt < _fasterEvery - 7500 || When.nowMs() < _keptUntil) return;
    _fasterAt = When.nowMs();
    final id = Trip.I.id;
    final way = await _plan();
    if (way == null || Trip.I.id != id) return;
    final mins = ((way.option['minutes'] as num?) ?? 9999).toDouble();
    final now = _minutesLeft();
    final sooner = (now - mins).round();
    if (sooner >= _fasterMin && sooner >= now * _fasterShare) {
      final rides = [
        for (final l in (way.option['legs'] as List? ?? const []).whereType<Map>())
          if (l['mode'] != 'walk') l['mode'] == 'bus' ? tr('trip.bus', 'Bus {no}', {'no': l['route']}) : '${l['name'] ?? l['route']}',
      ].join(' → ');
      _faster = (option: way.option, sooner: sooner, why: rides);
      _fasterWay = way;
    } else {
      _faster = null;
    }
  }

  ({Map<String, dynamic> option, NavEnd from, NavEnd to})? _fasterWay;

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
      t.alerted.add(leg);
      if (leg == t.leg) AppNav.say(text);
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
    if (t.switchedNote != null) {
      out.add(TripNote(t.switchedNote!, tone: 'warn', action: tr('trip.undo', 'Undo'), onAction: t.undo));
    }
    if (boardText != null && !t.boarded) out.add(TripNote(boardText!, tone: 'info'));
    for (final e in _lastHeard.entries) {
      if (e.key >= t.leg) out.add(TripNote(e.value.text, tone: e.value.kind == 'soon' ? 'warn' : 'error'));
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
    if (f != null && _fasterWay != null) {
      out.add(TripNote(
        tr('trip.fasterWay', 'Faster: {rides}, ~{m} min{by}. Saves {saves} min{why}.', {'rides': f.why, 'm': ((f.option['minutes'] as num?) ?? 0).round(), 'by': '', 'saves': f.sooner, 'why': ''}),
        tone: 'info',
        action: tr('trip.reroute', 'Reroute'),
        onAction: () => _switchTo(_fasterWay!, tr('trip.reroutedFaster', 'Rerouted to a faster way.')),
        second: tr('trip.keepMyWay', 'Keep my way'),
        onSecond: () {
          _faster = null;
          _keptUntil = When.nowMs() + _keepFor;
          notifyListeners();
        },
      ));
    }
    if (_toCheckpoint) {
      out.add(TripNote(
        tr('app.myicaNote', 'Have your MyICA QR code ready for immigration.'),
        action: tr('trip.myica', 'MyICA'),
        onAction: () => Native.call('SgBus', 'openLink', {
          'url': Native.has('myica')
              ? 'intent://open/myica#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;S.browser_fallback_url=${Uri.encodeComponent(_icaPlay)};end'
              : _icaPlay,
        }).catchError((_) => null),
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
