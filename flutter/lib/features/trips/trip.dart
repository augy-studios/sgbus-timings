// The Get Off Alert (the site's js/trip.js, its core): while you're on a trip, the app follows your
// live location along each bus or train ride and alerts you about two stops before you get off,
// at a change or at the end. On by default; Settings turns it off (sgbus.getOffAlert).
//
// The trip's followed by the app's own service (TripPlugin): your location keeps coming with the
// screen off, the trip shows in a notification (its End trip ends it here too), and the alert
// sounds over the lock screen, in earphones only if Settings says so. Underground, where GPS
// gives out, it goes by the time each ride should take. Here it works out where you are: along
// a leg by the stop you're nearest past, along its road where that's known, a walk done once you're
// at its end, and on to a later ride as soon as a fix shows you already on it, though it never saw
// you get to the end of this part (_rideAhead).
//
// A bus is boarded once the fixes show you moving down its route (_noteMove), so waiting at the stop
// never counts as riding, and the clock waits with it. If the fixes then have you standing at the
// first stop after all, you're waiting again (_backAtStop). A fix that has you clearly not where the
// trip does moves it there, backwards if need be (_realign), and no fix moves you further than a bus
// or train could have gone (_reach). With no good fix on the leg for a minute the clock moves you on
// (_clockPos), no further than a fresh fix shows (_seenCap), and while you wait for a bus at the first
// stop it holds until that bus is due (_holdForBus). A ride across the Causeway is followed in parts,
// getting off at each checkpoint (acrossTheCauseway).
//
// Trips come from Navigate (tripFromNav) and the route planner, and end as you arrive or with End
// trip; each is kept for Your trips under sgbus_trips, as the site keeps them.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/geo.dart';
import '../../data/journeys.dart';
import '../../data/location.dart';
import '../../data/network.dart';
import '../../data/stops.dart';
import '../../data/rewards.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../nav/nav_page.dart';
import 'trip_change.dart';
import 'trip_progress.dart';
import 'trip_timeline.dart';
import 'trip_watch.dart';

class TripLeg {
  TripLeg({required this.kind, required this.label, required this.to, required this.points, required this.names, required this.minutes,
      this.wait = 0, this.service, this.board, this.alight, this.codes, this.route, this.color, this.lrt = false, this.foot = 'walk', this.afterVia});
  final String kind; // bus, train, walk
  final String label;
  final String to;
  final List<List<double>> points;
  final List<String> names;
  final double minutes;
  final double wait;
  final String? service;
  final String? board;
  final String? alight;
  final List<String>? codes;
  final String? route;
  final String? color;
  final bool lrt;
  /// A walk's way of going: walk, or cycle or drive (Are you walking?).
  final String foot;

  /// Navigate's stop on the way, on the part just after it: { label, lat, lng }.
  final Map<String, Object?>? afterVia;

  bool get ride => kind != 'walk';

  /// The ride cut short at its `k`th stop, for getting off there and going on another way.
  TripLeg cutAt(int k) {
    final n = points.length;
    if (k <= 0 || k >= n - 1) return this;
    return TripLeg(
      kind: kind,
      label: label,
      to: k < names.length && names[k].isNotEmpty ? names[k] : to,
      points: points.sublist(0, k + 1),
      names: names.length > k ? names.sublist(0, k + 1) : names,
      minutes: math.max(1, minutes * k / (n - 1)),
      wait: wait,
      service: service,
      board: board,
      alight: codes != null && k < codes!.length ? codes![k] : alight,
      codes: codes != null && codes!.length > k ? codes!.sublist(0, k + 1) : codes,
      route: route,
      color: color,
      lrt: lrt,
      afterVia: afterVia,
    );
  }

  Map<String, Object?> toJson() => {
        'kind': kind, 'label': label, 'to': to, 'points': points, 'names': names, 'minutes': minutes, 'wait': wait,
        'service': service, 'board': board, 'alight': alight, 'codes': codes, 'route': route, 'color': color, 'lrt': lrt,
        if (foot != 'walk') 'foot': foot,
        'afterVia': ?afterVia,
      };

  static TripLeg from(Map j) => TripLeg(
        kind: '${j['kind']}',
        label: '${j['label']}',
        to: '${j['to'] ?? ''}',
        points: [for (final p in (j['points'] as List)) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]],
        names: [for (final n in (j['names'] as List? ?? const [])) '$n'],
        minutes: ((j['minutes'] as num?) ?? 1).toDouble(),
        wait: ((j['wait'] as num?) ?? 0).toDouble(),
        service: j['service'] as String?,
        board: j['board'] as String?,
        alight: j['alight'] as String?,
        codes: (j['codes'] as List?)?.map((e) => '$e').toList(),
        route: j['route'] as String?,
        color: j['color'] as String?,
        lrt: j['lrt'] == true,
        foot: j['foot'] as String? ?? 'walk',
        afterVia: (j['afterVia'] as Map?)?.cast<String, Object?>(),
      );
}

/// A bus leg's road: its path, how far along it each stop is, and how far along it each of its points
/// is, for following you along it.
class TripRoad {
  TripRoad(this.path, this.stops, this.cum);
  final List<List<double>> path;
  final List<double> stops;
  final List<double> cum;

  static TripRoad? from(Object? path, Object? stops, int count) {
    if (path is! List || stops is! List || path.length < 2 || stops.length != count) return null;
    final pts = [for (final p in path) if (p is List && p.length >= 2) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]];
    final cum = <double>[0];
    for (var k = 1; k < pts.length; k++) {
      cum.add(cum[k - 1] + metresAB(pts[k - 1], pts[k]));
    }
    // The stops as measured on the server, scaled to this measure of the path.
    final end = (stops.last as num).toDouble();
    final scale = end > 0 ? cum.last / end : 1.0;
    return TripRoad(pts, [for (final s in stops) (s as num).toDouble() * scale], cum);
  }

  /// The nearest point on it within Trip.onRoadM, from the stop before [from] on, as a stop index with
  /// a fraction by distance along the road. Null when you're off it.
  double? along(List<double> p, int from) {
    final kx = 111320 * math.cos(p[0] * math.pi / 180);
    const ky = 110540.0;
    final after = stops[math.max(0, math.min(stops.length - 1, from - 1))];
    var k0 = 0;
    while (k0 < path.length - 2 && cum[k0 + 1] <= after) {
      k0++;
    }
    double? bestD;
    var bestM = double.infinity;
    for (var k = k0; k < path.length - 1; k++) {
      final ax = path[k][1] * kx, ay = path[k][0] * ky;
      final dx = path[k + 1][1] * kx - ax, dy = path[k + 1][0] * ky - ay;
      final px = p[1] * kx - ax, py = p[0] * ky - ay;
      final len2 = dx * dx + dy * dy;
      final t = len2 == 0 ? 0.0 : ((px * dx + py * dy) / len2).clamp(0.0, 1.0);
      final m = math.sqrt(math.pow(px - t * dx, 2) + math.pow(py - t * dy, 2));
      // A later stretch has to be clearly nearer to win, where the road comes back along itself.
      if (m < bestM - (bestM <= Trip.onRoadM ? 15 : 0)) {
        bestD = cum[k] + t * (cum[k + 1] - cum[k]);
        bestM = m;
      }
    }
    if (bestD == null || bestM > Trip.onRoadM) return null;
    final last = stops.length - 1;
    var i = 0;
    while (i < last - 1 && stops[i + 1] <= bestD) {
      i++;
    }
    final span = stops[i + 1] - stops[i];
    return i + (span > 0 ? ((bestD - stops[i]) / span).clamp(0.0, 1.0) : 0.0);
  }
}

class Trip extends ChangeNotifier {
  Trip._();
  static final Trip I = Trip._();

  static const settingKey = 'sgbus.getOffAlert';
  static const savedKey = 'sgbus.trip';
  static const tripsKey = 'sgbus_trips';
  static const alertStops = 2;
  static const goodFixM = 150.0;
  static const walkArriveM = 40.0;

  // Already on a later ride (_rideAhead): this far from its first stop, and this far down it.
  static const leftStopM = 150.0;
  static const moveStops = 0.5;
  // Near enough to a stop on a leg to say you're there, and as much of the straight line between
  // two stops as the road may bend away from it.
  static const onRouteM = 250.0;
  static const bendShare = 0.3;
  // From a walk: how much further from its end than you've been, once your pace says you've
  // stopped walking, and with nothing to say so.
  static const walkLeftM = 100.0;
  static const walkLeftUnsureM = 300.0;
  // Which way along a ride: this much further on than a fix from this long ago, up to the last.
  static const moveM = 150.0;
  // Near enough to a bus's road to be on it.
  static const onRoadM = 100.0;
  static const _moveWindowMs = 10 * 60000;
  static const _moveSampleMs = 3000;
  // Rough fixes are good enough to tell you're nowhere near where the trip has you, not to move on.
  static const roughFixM = 500.0;
  static const realignM = 400.0;
  // With no good fix on the leg for this long, it goes by the clock.
  static const fixStaleMs = 60000;
  static const _holdCheckMs = 30000;
  // The fastest a bus or a train goes, for how far you could have got, with room for the GPS.
  static const _maxKmh = {'bus': 80.0, 'train': 100.0};
  static const _reachSlackM = 400.0;
  // A ride's parts across the Causeway are timed from their distance, metres a minute.
  static const _hopMPerMin = 250.0;
  static const _headingMinMs = 10000;
  static const _recentKeepMs = 180000;
  static const _recentSampleMs = 3000;
  // Your pace (Pace.java) goes by after this with no word from it.
  static const _paceFreshMs = 10000;
  // Going at a bus or train's speed, by the fix's own speed, km/h.
  static const _notWalkingKmh = 8.0;

  static bool get enabled => Store.I.get(settingKey) != 'off';

  String? id;
  String title = '';
  List<TripLeg> legs = [];
  Map<String, Object?>? from;
  Map<String, Object?>? to;
  int leg = 0;
  double pos = 0; // stops along the leg, fractional
  bool boarded = false;
  final Set<int> alerted = {};
  int startedAt = 0;
  int legStartedAt = 0;
  /// When the trip was last moved by hand (Back or Next), for the server.
  int movedAt = 0;
  /// The Get Off Alert's words, kept on the bar until you pass another stop.
  String? _alertText;
  int _alertLeft = -1;
  /// A change the trip made to itself, said on the bar with Undo (trip_watch.dart).
  String? switchedNote;
  Map<String, Object?>? _before;
  int lastFixAt = 0;
  /// When a good fix last put you on the leg: without one for fixStaleMs, the clock moves you on.
  int onLegAt = 0;
  /// When a fix last moved the trip back to where you really are, for the server.
  int realignedAt = 0;
  /// Location refused: the clock's all there is.
  bool noLocation = false;
  /// Where the clock goes on from: the last place it was sure of, and when.
  ({double pos, int t})? anchor;
  /// A fresh good fix, for how far the clock can go.
  ({List<double> p, double acc, int t})? _me;
  List<({double along, double m, int t})> _moves = [];
  /// Where you'd got to on each part left, for going back to it.
  final Map<int, ({double pos, ({double pos, int t})? anchor, bool boarded, int legStartedAt})> _left = {};
  final Map<int, ({int? boardAt, int? offAt})> times = {};
  bool arrived = false;
  Fix? here;
  /// What the location's seen of each ride (data/rewards.dart, RideCheck), kept with the trip.
  List<Map<String, dynamic>?> seen = [];
  /// The Navigate screen it was started from, for Back to Navigate: { kind: "nav", from, to, via }
  /// or { kind: "route", start, end }. Kept through every change to the trip.
  Map<String, Object?>? origin;
  /// Navigate's stop on the way, for There and back again.
  Map<String, Object?>? via;
  /// Are you walking? is asked once a trip (trip_change.dart).
  bool paceAsked = false;
  /// The app's last word on your pace (Pace.java): walking, riding or still, and when.
  String? paceState;
  int paceAt = 0;
  /// Asks Are you walking? (trip_change.dart), going at `kmh` on a walk.
  static void Function(double kmh)? askPace;

  NativeListener? _loc;
  NativeListener? _end;
  StreamSubscription<Fix>? _watch;
  Timer? _tick;

  bool get active => id != null;
  TripLeg? get current => active && leg < legs.length ? legs[leg] : null;

  // ---------- starting and stopping ----------

  Future<void> start({required String title, required List<TripLeg> legs, Map<String, Object?>? from, Map<String, Object?>? to, Map<String, Object?>? via, Map<String, Object?>? origin}) async {
    _recent.clear();
    _nearLeg = null;
    _nearEnd = double.infinity;
    if (legs.isEmpty) return;
    if (active) await stop(record: true);
    legs = acrossTheCauseway(legs);
    this.origin = origin;
    _alertText = null;
    id = '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}${math.Random().nextInt(1 << 30).toRadixString(36)}';
    this.title = title;
    this.legs = legs;
    this.from = from ?? {'label': legs.first.names.isNotEmpty ? legs.first.names.first : '', 'lat': legs.first.points.first[0], 'lng': legs.first.points.first[1]};
    this.to = to ?? {'label': legs.last.to, 'lat': legs.last.points.last[0], 'lng': legs.last.points.last[1]};
    leg = 0;
    pos = 0;
    boarded = false;
    _resetLeg();
    onLegAt = 0;
    realignedAt = 0;
    _me = null;
    _left.clear();
    alerted.clear();
    times.clear();
    arrived = false;
    seen = List.filled(legs.length, null);
    this.via = via;
    paceAsked = false;
    _paceFixes.clear();
    startedAt = legStartedAt = When.nowMs();
    _save();
    await _follow();
    notifyListeners();
  }

  Future<void> _follow() async {
    _fetchRoads();
    noLocation = !await Locate.allowed().catchError((_) => false);
    if (!active) return;
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 15), (_) => _onTick());
    if (Native.has('trip')) {
      _loc?.cancel();
      _end?.cancel();
      _loc = Native.on('Trip', 'location', (d) {
        if (d['lat'] is num && d['lng'] is num) {
          paceState = d['pace'] as String?;
          paceAt = When.nowMs();
          onFix(Fix((d['lat'] as num).toDouble(), (d['lng'] as num).toDouble(), accuracy: (d['accuracy'] as num?)?.toDouble(), speed: (d['speed'] as num?)?.toDouble()));
        }
      });
      _end = Native.on('Trip', 'end', (_) => stop(record: true));
      try {
        final note = _note();
        _noteSaid = jsonEncode(note);
        await Native.call('Trip', 'start', note);
      } on NativeError catch (e) {
        AppNav.say(e.message);
      }
    } else {
      _watch?.cancel();
      _watch = Locate.watch().listen(onFix, onError: (_) {});
    }
  }

  Future<void> stop({bool record = true}) async {
    if (!active) return;
    // The ride you're on is judged as the trip ends; a trip that got there earns its feats and
    // coins (data/rewards.dart).
    _judge(leg);
    if (arrived) _rewards();
    if (record) _record();
    _tick?.cancel();
    _loc?.cancel();
    _end?.cancel();
    await _watch?.cancel();
    if (Native.has('trip')) await Native.call('Trip', 'stop').catchError((_) => null);
    id = null;
    legs = [];
    Store.I.remove(savedKey);
    notifyListeners();
  }

  /// A trip running when the app was closed: picked up where it was.
  Future<void> resume() async {
    final s = Store.I.map(savedKey);
    if (s['id'] is! String || s['legs'] is! List) return;
    if (When.nowMs() - ((s['startedAt'] as num?) ?? 0) > 6 * 3600000) {
      Store.I.remove(savedKey);
      return;
    }
    id = s['id'] as String;
    title = '${s['title'] ?? ''}';
    legs = [for (final l in s['legs'] as List) TripLeg.from(l as Map)];
    from = (s['from'] as Map?)?.cast<String, Object?>();
    to = (s['to'] as Map?)?.cast<String, Object?>();
    leg = (s['leg'] as num?)?.toInt() ?? 0;
    pos = ((s['pos'] as num?) ?? 0).toDouble();
    boarded = s['boarded'] == true;
    startedAt = (s['startedAt'] as num?)?.toInt() ?? When.nowMs();
    legStartedAt = (s['legStartedAt'] as num?)?.toInt() ?? startedAt;
    alerted.addAll(((s['alerted'] as List?) ?? const []).map((e) => (e as num).toInt()));
    seen = [for (var i = 0; i < legs.length; i++) i < ((s['seen'] as List?)?.length ?? 0) ? ((s['seen'] as List)[i] as Map?)?.cast<String, dynamic>() : null];
    via = (s['via'] as Map?)?.cast<String, Object?>();
    origin = (s['origin'] as Map?)?.cast<String, Object?>();
    paceAsked = s['paceAsked'] == true;
    onLegAt = (s['onLegAt'] as num?)?.toInt() ?? 0;
    realignedAt = (s['realignedAt'] as num?)?.toInt() ?? 0;
    final a = s['anchor'];
    anchor = a is Map && a['pos'] is num && a['t'] is num ? (pos: (a['pos'] as num).toDouble(), t: (a['t'] as num).toInt()) : null;
    await _follow();
    notifyListeners();
  }

  void _save() => Store.I.putJson(savedKey, {
        'id': id, 'title': title, 'legs': [for (final l in legs) l.toJson()], 'from': from, 'to': to, 'origin': origin, 'leg': leg, 'pos': pos,
        'boarded': boarded, 'startedAt': startedAt, 'legStartedAt': legStartedAt, 'alerted': alerted.toList(),
        'seen': seen, 'via': via, 'paceAsked': paceAsked, 'onLegAt': onLegAt, 'realignedAt': realignedAt,
        if (anchor != null) 'anchor': {'pos': anchor!.pos, 't': anchor!.t},
      });

  Map<String, dynamic> _seenOf(int i) {
    while (seen.length < legs.length) {
      seen.add(null);
    }
    return seen[i] ??= {'fixes': 0, 'startAt': null, 'endAt': null, 'along': <int>[]};
  }

  void _judge(int i) {
    if (i < 0 || i >= legs.length || !legs[i].ride || id == null) return;
    RideCheck.done(legs[i].toJson(), _seenOf(i), id!);
  }

  void _rewards() {
    final legsJson = [for (final l in legs) l.toJson()];
    Coins.tripDone(id!, legsJson, seen, name: title);
    final last = legs.last.points.last;
    final v = via;
    Feats.tripDone(
      start: legs.first.points.first,
      end: last,
      startedAt: startedAt,
      via: v != null && v['lat'] is num ? [(v['lat'] as num).toDouble(), (v['lng'] as num).toDouble()] : null,
      realRide: seen.any((x) => x?['ok'] == true),
    );
  }

  // ---------- where you are ----------

  /// How far along a leg's points a point is, as a fractional index, and how far off it.
  static ({double along, double off}) project(List<List<double>> pts, List<double> p) {
    var best = (along: 0.0, off: double.infinity);
    final kx = 111320 * math.cos(p[0] * math.pi / 180);
    const ky = 110540.0;
    for (var i = 0; i < pts.length - 1; i++) {
      final ax = pts[i][1] * kx, ay = pts[i][0] * ky;
      final dx = pts[i + 1][1] * kx - ax, dy = pts[i + 1][0] * ky - ay;
      final px = p[1] * kx - ax, py = p[0] * ky - ay;
      final len2 = dx * dx + dy * dy;
      final t = len2 == 0 ? 0.0 : ((px * dx + py * dy) / len2).clamp(0.0, 1.0);
      final off = math.sqrt(math.pow(px - t * dx, 2) + math.pow(py - t * dy, 2));
      if (off < best.off) best = (along: i + t, off: off);
    }
    return best;
  }

  void onFix(Fix f) {
    if (!active) return;
    final acc = f.accuracy ?? 0;
    here = f;
    if (acc > roughFixM) return;
    var cur = current;
    if (cur == null) return;
    final p = [f.lat, f.lng];
    final now = When.nowMs();
    final good = acc <= goodFixM;
    if (good) _me = (p: p, acc: acc, t: now);
    if (good) {
      // Already on a later ride: on to it, on board.
      final ahead = _rideAhead(p, cur);
      _keepFix(p);
      if (ahead != -1) {
        while (leg < ahead) {
          _next();
        }
        cur = current!;
        _boardedNow(_along(cur, p, 0) ?? 0, cur);
      }
    }
    final l = cur;
    if (!l.ride) return _onWalkFix(f, p, l);
    RideCheck.see(l.toJson(), _seenOf(leg), p, f.accuracy ?? 999);
    _save();
    if (_realign(p, acc, l)) return;
    if (!good) return;
    if (_backAtStop(p, acc, l, f)) return;
    lastFixAt = now;
    noLocation = false;
    // Alerted well before the stop, by the server about another bus: it can go off again.
    if (alerted.contains(leg) && _wellShort()) {
      alerted.remove(leg);
      _alertText = null;
      realignedAt = now;
    }

    // Not yet on the bus for sure: you stay at the first stop, and the clock waits, until the fixes
    // show you moving along its route.
    if (!_underWay(l) && !_noteMove(p, _along(l, p, 0), acc, l)) {
      anchor = (pos: 0, t: now);
      _changed();
      return;
    }

    final far = _reach(l);
    // The nearest stop on this leg at or past the last one, so a fix that wobbles behind can't send
    // you back; _realign deals with one that's really somewhere else.
    final near = _roadOf(l) != null ? onRoadM : onRouteM;
    var best = -1;
    var bestM = double.infinity;
    for (var i = math.max(0, pos.floor() - 1); i < l.points.length; i++) {
      final m = metresAB(p, l.points[i]);
      if (m < bestM) {
        best = i;
        bestM = m;
      }
    }
    final tooFar = best != -1 && bestM <= near && best > far;
    if (best != -1 && bestM <= near && !tooFar) pos = math.max(pos, best.toDouble());
    // How far between stops, for the timeline's dot.
    final along = _along(l, p, pos.floor());
    if (along != null && along <= far) {
      pos = math.max(pos, along);
      onLegAt = now;
    }
    // Ahead of anywhere you could be: no move, and the clock's anchor kept as it was.
    if (tooFar || (along != null && along > far)) {
      _changed();
      return;
    }
    // The clock goes on from here if the fixes stop.
    anchor = (pos: pos, t: now);

    // Off the bus: walking, by your pace, near its last stop, once you're nearly there.
    final last = (l.points.length - 1).toDouble();
    if (l.kind == 'bus' && pos.floor() >= last - 1 && _pace == 'walking' && metresAB(p, l.points.last) <= onRouteM) pos = last;

    // Off at the end of this leg and already near the next one's first stop: on to it. Off a train
    // once it's stopped: the clock can have it at the station while it's still coming in, past the
    // stops of a bus from there.
    final after = leg + 1 < legs.length ? legs[leg + 1] : null;
    if (after != null && pos.floor() >= last && metresAB(p, after.points.first) <= onRouteM && !(l.kind == 'train' && _atSpeed(f))) return _next();
    _check();
  }

  // On a walk: how far along by how much nearer its end you are than its start, and there once
  // you're near it. Never back, so a wobbling fix doesn't undo the way walked.
  void _onWalkFix(Fix f, List<double> p, TripLeg l) {
    final acc = f.accuracy ?? 0;
    if (acc > goodFixM) return;
    final now = When.nowMs();
    lastFixAt = now;
    noLocation = false;
    if (!identical(_nearLeg, l)) {
      _nearLeg = l;
      _nearEnd = double.infinity;
    }
    final left = metresAB(p, l.points.last);
    _nearEnd = math.min(_nearEnd, left);
    final whole = metresAB(l.points.first, l.points.last);
    pos = math.max(pos, whole <= 0 ? 1.0 : (1 - left / whole).clamp(0.0, 1.0));
    anchor = (pos: pos, t: now);
    onLegAt = now;
    _watchPace(p, f.accuracy ?? 999, l);
    if (left <= walkArriveM + math.min(acc, 40)) pos = (l.points.length - 1).toDouble();
    _check();
  }

  /// Whether this leg is under way for sure: a bus once the fixes have shown you moving along its
  /// route. A train goes by the clock from the start, as GPS gives out underground, and so does any
  /// leg with location off.
  bool _underWay(TripLeg l) => boarded || l.kind != 'bus' || noLocation;

  bool get _stale => When.nowMs() - onLegAt > fixStaleMs;

  /// Good fixes along the leg before boarding, one every _moveSampleMs. Boarded once you're really
  /// moving down the route, not a fix wobbling about the stop you wait at: leftStopM from the stop and
  /// moveM further down than a fix in the last while; or at or past the second stop and half a stop
  /// on from such a fix; or at any stop after the first, within onRoadM of it, or onRouteM of it and
  /// leftStopM from the stop. Says whether you're now on board.
  bool _noteMove(List<double> p, double? alongNow, double acc, TripLeg l) {
    final now = When.nowMs();
    // On foot: walking to the stop, or about it, not riding.
    if (_pace == 'walking') {
      _moves = [];
      return false;
    }
    // A rough fix can be leftStopM out on its own.
    final fromStop = metresAB(p, l.points.first) - math.max(0.0, acc - 50);
    // A stop by the one you got on at (across the road, on a route that comes back) doesn't count.
    var near = -1;
    var nearM = double.infinity;
    for (var i = 1; i < l.points.length; i++) {
      final d = metresAB(p, l.points[i]);
      if (d < nearM && metresAB(l.points[i], l.points.first) >= leftStopM) {
        near = i;
        nearM = d;
      }
    }
    final atStop = near != -1 && (nearM <= onRoadM || (fromStop >= leftStopM && nearM <= onRouteM));
    final along = alongNow ?? (atStop ? near.toDouble() : null);
    if (along == null) return false;
    final m = _metresAlong(l, along);
    final span = math.max(_moveWindowMs, (l.minutes * 60000).round());
    final moves = _moves.where((x) => now - x.t <= span).toList();
    final moved = atStop ||
        (fromStop >= leftStopM && moves.any((x) => m - x.m >= moveM)) ||
        (fromStop >= leftStopM && m >= moveM && _pace == 'riding') ||
        (along >= 1 && fromStop > onRoadM && moves.any((x) => along - x.along >= moveStops));
    final lastT = moves.isEmpty ? 0 : moves.last.t;
    _moves = now - lastT >= _moveSampleMs ? [...moves.skip(math.max(0, moves.length - 240)), (along: along, m: m, t: now)] : moves;
    // Going back up the route, towards the stop you get on at: on something else coming to it (a
    // train into the station there), not on board.
    if (!moved || _headingAlong(l, p) == -1) return false;
    _boardedNow(along, l, moves: moves);
    return true;
  }

  /// A fix has you clearly not where the trip does: it moves to the stop you're at, backwards if
  /// need be, for a clock that ran on while you waited somewhere GPS can't reach, or a stray fix that
  /// sent it ahead. Wobbles of a stop or two never set it off. Rough fixes count too. Says if it moved.
  bool _realign(List<double> p, double acc, TripLeg l) {
    if (l.points.length < 2) return false;
    final last = l.points.length - 1;
    final believed = math.min(last.toDouble(), _target(l));
    final i = believed.floor();
    final j = math.min(last, i + 1);
    final f = believed - i;
    final shownAt = [l.points[i][0] + (l.points[j][0] - l.points[i][0]) * f, l.points[i][1] + (l.points[j][1] - l.points[i][1]) * f];
    if (metresAB(p, shownAt) <= acc + realignM) return false;
    var best = -1;
    var bestM = double.infinity;
    for (var k = 0; k < l.points.length; k++) {
      final m = metresAB(p, l.points[k]);
      if (m < bestM) {
        best = k;
        bestM = m;
      }
    }
    if (best == -1 || bestM > acc + onRouteM) return false;
    // Ahead only once you're on board for sure, and not past where you could be by now; before that
    // only back to the first stop.
    if (best > believed && (!_underWay(l) || best > _reach(l))) return false;
    final now = When.nowMs();
    final good = acc <= goodFixM;
    pos = (good ? _along(l, p, 0) : null) ?? best.toDouble();
    anchor = (pos: pos, t: now);
    realignedAt = now;
    if (good) lastFixAt = onLegAt = now;
    noLocation = false;
    // Back at the first stop: you're waiting for the bus, not on it.
    if (best == 0) {
      boarded = false;
      _moves = [];
      times.remove(leg);
    }
    // Moved back before the alert stop: the alert that went off too early can go off again.
    if (pos.floor() < last - alertStops && alerted.contains(leg)) {
      alerted.remove(leg);
      _alertText = null;
    }
    _changed();
    _check();
    return true;
  }

  /// On a bus taken as boarded, a stop or more on, but a good fix has you standing at the stop you get
  /// on at: you never got on (a train running beside its route set it off), and you're waiting again.
  /// Only in the first part of the ride, so a route that comes back near where it began isn't sent
  /// back. Says whether it moved you.
  bool _backAtStop(List<double> p, double acc, TripLeg l, Fix f) {
    if (l.kind != 'bus' || !boarded || noLocation) return false;
    final last = l.points.length - 1;
    final believed = _target(l);
    if (believed < 1 || believed > math.max(2.0, last * 0.6)) return false;
    final fromStop = metresAB(p, l.points.first);
    if (fromStop > onRoadM / 2 + math.min(acc, onRoadM / 2)) return false;
    for (var k = 1; k < l.points.length; k++) {
      if (metresAB(p, l.points[k]) < fromStop) return false;
    }
    if (_atSpeed(f)) return false;
    final now = When.nowMs();
    pos = 0;
    anchor = (pos: 0, t: now);
    boarded = false;
    _moves = [];
    realignedAt = lastFixAt = onLegAt = now;
    times.remove(leg);
    if (alerted.remove(leg)) _alertText = null;
    _changed();
    return true;
  }

  /// Alerted, but well before where it goes off: an alert from the server, which follows a bus rather
  /// than you, was about the wrong one, and your place here stands.
  bool _wellShort() => current?.ride == true && lastFixAt > 0 && When.nowMs() - lastFixAt <= fixStaleMs && stopsLeft() > alertStops + 1;

  // ---------- already on a later ride ----------

  final List<({List<double> p, int t})> _recent = [];
  TripLeg? _nearLeg; // the walk _nearEnd is for
  double _nearEnd = double.infinity; // the nearest you've been to its end

  /// Your pace, while the app's word on it is fresh.
  String? get _pace => paceState != null && When.nowMs() - paceAt <= _paceFreshMs ? paceState : null;

  bool _atSpeed(Fix f) => _pace == 'riding' || (f.speed ?? 0) * 3.6 > _notWalkingKmh;

  void _keepFix(List<double> p) {
    final now = When.nowMs();
    if (_recent.isNotEmpty && now - _recent.last.t < _recentSampleMs) return;
    _recent.removeWhere((f) => now - f.t > _recentKeepMs);
    _recent.add((p: p, t: now));
  }

  /// Where a point is along a leg, as a stop index with a fraction, from the stop before [from] on:
  /// on the nearest stretch between two stops, allowing for the road to bend away from the straight
  /// line. Null when it isn't on the leg.
  static double? alongLeg(List<List<double>> pts, List<double> p, int from) {
    final kx = 111320 * math.cos(p[0] * math.pi / 180);
    const ky = 110540.0;
    double? best;
    var bestM = double.infinity;
    for (var i = math.max(0, from - 1); i < pts.length - 1; i++) {
      final ax = pts[i][1] * kx, ay = pts[i][0] * ky;
      final dx = pts[i + 1][1] * kx - ax, dy = pts[i + 1][0] * ky - ay;
      final px = p[1] * kx - ax, py = p[0] * ky - ay;
      final len2 = dx * dx + dy * dy;
      final t = len2 == 0 ? 0.0 : ((px * dx + py * dy) / len2).clamp(0.0, 1.0);
      final m = math.sqrt(math.pow(px - t * dx, 2) + math.pow(py - t * dy, 2));
      if (m <= math.max(onRouteM, bendShare * math.sqrt(len2)) && m < bestM) {
        best = i + t;
        bestM = m;
      }
    }
    return best;
  }

  // ---------- a bus's road ----------

  final Expando<TripRoad> _roads = Expando();

  TripRoad? _roadOf(TripLeg l) => _roads[l];

  /// Each bus leg's road, for following it along the road it takes rather than a straight line from
  /// stop to stop. Without one, or until it's in, the straight lines do.
  void _fetchRoads() {
    final asked = id;
    for (final l in legs) {
      if (l.kind != 'bus' || l.points.length < 2 || _roads[l] != null) continue;
      Api.map('road', query: {'points': l.points.map((p) => '${p[0].toStringAsFixed(5)},${p[1].toStringAsFixed(5)}').join(';')}).then((r) {
        if (id != asked) return;
        final road = TripRoad.from(r['path'], r['stops'], l.points.length);
        if (road != null) _roads[l] = road;
      }).catchError((_) {});
    }
  }

  /// Where a point is along a leg, on its road if it has one and the road hasn't lost you.
  double? _along(TripLeg l, List<double> p, int from) => _roadOf(l)?.along(p, from) ?? alongLeg(l.points, p, from);

  double _metresAlong(TripLeg l, double along) {
    final pts = l.points;
    final i = math.min(pts.length - 1, along.floor());
    final j = math.min(pts.length - 1, i + 1);
    final road = _roadOf(l);
    if (road != null) return road.stops[i] + (road.stops[j] - road.stops[i]) * (along - i);
    var m = 0.0;
    for (var k = 0; k < i; k++) {
      m += metresAB(pts[k], pts[k + 1]);
    }
    return m + metresAB(pts[i], pts[j]) * (along - i);
  }

  double _posAtMetres(TripLeg l, double m) {
    final last = l.points.length - 1;
    var prev = 0.0;
    for (var i = 1; i <= last; i++) {
      final at = _metresAlong(l, i.toDouble());
      if (at >= m) return i - 1 + (at > prev ? (m - prev) / (at - prev) : 1);
      prev = at;
    }
    return last.toDouble();
  }

  /// The furthest along the leg you could be by now, from the last place the trip was sure of, at the
  /// fastest a bus or train goes. A stray fix further on than that doesn't move you.
  double _reach(TripLeg l) {
    final a = anchor;
    final kmh = _maxKmh[l.kind];
    if (a == null || kmh == null) return double.infinity;
    final last = (l.points.length - 1).toDouble();
    return _posAtMetres(l, _metresAlong(l, math.min(last, a.pos)) + math.max(0, When.nowMs() - a.t) / 1000 * (kmh / 3.6) + _reachSlackM);
  }

  // ---------- the clock ----------

  /// Where the trip has you: the last fix's place along the leg, or, without a recent good one, how
  /// far the ride should have got by the clock, whichever is further.
  double _target(TripLeg l) {
    final last = (l.points.length - 1).toDouble();
    var at = pos;
    if (_stale && _underWay(l)) at = math.max(at, _clockPos(l) ?? 0);
    return math.min(last, at);
  }

  /// How far the ride should have got by the clock, from the last place it was sure of (or the leg's
  /// start, once its wait is over). Null for a leg with no time to go by.
  double? _clockPos(TripLeg l) {
    if (l.minutes <= 0) return null;
    final last = l.points.length - 1;
    final from = anchor ?? (pos: 0.0, t: legStartedAt + (l.wait * 60000).round());
    final perStop = l.minutes / math.max(1, last);
    return math.min(math.min(last.toDouble(), _seenCap(l)), from.pos + math.max(0, When.nowMs() - from.t) / 60000 / perStop);
  }

  /// With a fresh good fix, however it fits the leg, the clock goes no further than it shows: on a
  /// walk, not to the end till you're near it; on a ride, half a stop past where it is along it, or a
  /// stop past where the trip was last sure of, if it's off the leg. No limit with no fresh fix:
  /// underground, the clock's all there is.
  double _seenCap(TripLeg l) {
    final me = _me;
    if (me == null || When.nowMs() - me.t > fixStaleMs) return double.infinity;
    final last = l.points.length - 1;
    if (!l.ride) {
      final left = metresAB(me.p, l.points.last);
      if (left <= walkArriveM + math.min(me.acc, 40)) return last.toDouble();
      return math.min(0.95, math.max(pos, 1 - left / math.max(1, metresAB(l.points.first, l.points.last))) + 0.1);
    }
    final from = (anchor?.pos ?? pos).floor();
    final along = _along(l, me.p, from);
    return along != null ? along + 0.5 : math.max(pos, anchor?.pos ?? 0) + 1;
  }

  int _holdCheckedAt = 0;

  /// Waiting at the first stop with no good fix, the clock holds until your bus is due, by its live
  /// timing there. Only before the clock has you halfway to the second stop, so a ride that has begun
  /// isn't pulled back by the next bus's timing.
  Future<void> _holdForBus(TripLeg l) async {
    final service = l.service, board = l.board;
    if (l.kind != 'bus' || service == null || board == null) return;
    if (math.max(pos, _clockPos(l) ?? 0) >= 0.5) return;
    final now = When.nowMs();
    if (now - _holdCheckedAt < _holdCheckMs) return;
    _holdCheckedAt = now;
    final asked = id;
    try {
      final a = await Arrivals.fetch(board, service);
      final s = a.services.where((s) => s.serviceNo.toUpperCase() == service.toUpperCase()).firstOrNull;
      final eta = s?.next?.etaMs;
      if (id != asked || !identical(current, l) || eta == null || eta <= 60000) return;
      anchor = (pos: 0, t: When.nowMs() + eta.round());
      pos = 0;
      _changed();
    } catch (_) {
      // No timing to go by: the clock carries on.
    }
  }

  /// Which way you've gone along a leg lately: 1 down it, -1 back up it towards its start, 0 for
  /// neither, or without a fix on it to go by.
  int _headingAlong(TripLeg l, List<double> p) {
    final at = _along(l, p, 0);
    if (at == null) return 0;
    final now = When.nowMs();
    final m = _metresAlong(l, at);
    var way = 0;
    for (final f in _recent) {
      if (now - f.t < _headingMinMs) continue;
      final was = _along(l, f.p, 0);
      if (was == null) continue;
      final d = m - _metresAlong(l, was);
      if (d >= moveM) {
        way = 1;
      } else if (d <= -moveM) {
        way = -1;
      }
    }
    return way;
  }

  /// The next ride after this part, past any walk before it, if a good fix shows you already on it:
  /// [leftStopM] from its first stop and half a stop down its route. Then this part's over, though
  /// it never saw you get to its end: a walk whose end is off from where you waited, or a ride the
  /// fixes lost. From a walk, never while your pace says you're walking, and only once you're well
  /// further from its end than you've been, so walking to your stop past a later one isn't riding.
  /// From a ride, only once the fix isn't on it any more, so a ride that carries on along the same
  /// road doesn't end early, and only once the fixes have gone down the next one: a train beside
  /// its route, or coming the other way into the station it starts at, is still the train. The
  /// index of that ride, or -1.
  int _rideAhead(List<double> p, TripLeg l) {
    if (!l.ride) {
      final pace = _pace;
      if (pace == 'walking') return -1;
      final need = pace == 'still' || pace == 'riding' ? walkLeftM : walkLeftUnsureM;
      final near = identical(_nearLeg, l) ? _nearEnd : double.infinity;
      if (!(metresAB(p, l.points.last) - near >= need)) return -1;
    } else if (_along(l, p, pos.floor()) != null) {
      return -1;
    }
    var k = -1;
    for (var i = leg + 1; i < legs.length; i++) {
      if (legs[i].ride) {
        k = i;
        break;
      }
    }
    if (k == -1) return -1;
    final ride = legs[k];
    if (ride.points.length < 2 || metresAB(p, ride.points.first) < leftStopM) return -1;
    if ((_along(ride, p, 0) ?? 0) < moveStops) return -1;
    return !l.ride || _headingAlong(ride, p) == 1 ? k : -1;
  }

  /// On board for sure, this far along the part you're on: about as long ago as riding this far
  /// takes, by its own time per stop, though not before the last fix that still had you at the stop,
  /// nor before the part began.
  void _boardedNow(double along, TripLeg l, {List<({double along, double m, int t})> moves = const []}) {
    final now = When.nowMs();
    boarded = true;
    _moves = [];
    pos = math.max(pos, along);
    anchor = (pos: pos, t: now);
    final perStopMs = l.minutes / math.max(1, l.points.length - 1) * 60000;
    var board = math.max(legStartedAt, now - (along * perStopMs).round());
    for (final x in moves) {
      if (x.along < 0.25 && x.t > board) board = x.t;
    }
    times[leg] = (boardAt: math.min(now, board), offAt: null);
  }

  /// A ride across the Causeway as parts: to the checkpoint, across to the other, and on, as everyone
  /// gets off at each for immigration, so the alert says to. The time to clear (Settings' Immigration
  /// time, or by the time of day) is the wait before getting on again, half at each. Each part's
  /// minutes are from its own distance.
  static List<TripLeg> acrossTheCauseway(List<TripLeg> legs) {
    final out = <TripLeg>[];
    for (final l in legs) {
      final codes = l.kind == 'bus' && l.codes != null && l.codes!.length == l.points.length ? l.codes! : null;
      final crossings = <(int, String)>[];
      if (codes != null) {
        for (var k = 1; k < codes.length; k++) {
          final way = BusNet.crossing(codes[k - 1], codes[k]);
          if (way != null) crossings.add((k, way));
        }
      }
      if (crossings.isEmpty) {
        out.add(l);
        continue;
      }
      final own = int.tryParse(Store.I.get('sgbus_customs') ?? '');
      int clearing(String way) => own ?? When.customsMin(way, When.nowMs());
      final cuts = [0, for (final c in crossings) ...[c.$1 - 1, c.$1], codes!.length - 1];
      for (var p = 1; p < cuts.length; p++) {
        final a = cuts[p - 1], b = cuts[p];
        if (b <= a) continue;
        final pts = l.points.sublist(a, b + 1);
        var m = 0.0;
        for (var i = 1; i < pts.length; i++) {
          m += metresAB(pts[i - 1], pts[i]);
        }
        final crossing = crossings.where((c) => c.$1 == b && a == c.$1 - 1).firstOrNull;
        final after = crossings.where((c) => c.$1 == a).firstOrNull;
        final wait = crossing != null ? (clearing(crossing.$2) / 2).ceil().toDouble() : after != null ? (clearing(after.$2) / 2).floor().toDouble() : l.wait;
        out.add(TripLeg(
          kind: l.kind,
          label: crossing != null ? tr('trip.acrossCauseway', '{ride} across the Causeway', {'ride': l.label}) : l.label,
          to: b < l.names.length && l.names[b].isNotEmpty ? l.names[b] : l.to,
          points: pts,
          names: l.names.length > b ? l.names.sublist(a, b + 1) : l.names,
          minutes: m / _hopMPerMin,
          wait: wait,
          service: l.service,
          board: codes[a],
          alight: codes[b],
          codes: codes.sublist(a, b + 1),
          route: l.route,
          color: l.color,
          lrt: l.lrt,
          afterVia: a == 0 ? l.afterVia : null,
        ));
      }
    }
    return out;
  }

  // ---------- are you walking? ----------

  // Walking is about 5 km/h in Singapore; over notWalkingKmh for a minute or so of good fixes,
  // past even the fastest walkers with room for the GPS, isn't, unless the app's own word on
  // your pace says walking (a run for the bus). Not along the next ride (on it already), nor
  // this near the walk's end.
  static const notWalkingKmh = 8.0;
  static const _paceFixM = 50.0;
  static const _paceSampleMs = 3000;
  static const _paceSpanMs = 45000;
  static const _paceKeepMs = 90000;
  static const _paceNearEndM = 200.0;
  static const _paceStaleMs = 10000;
  final List<({List<double> p, double acc, int t})> _paceFixes = [];
  TripLeg? _paceLeg;

  void _watchPace(List<double> here, double accuracy, TripLeg l) {
    if (!identical(_paceLeg, l)) {
      _paceLeg = l;
      _paceFixes.clear();
    }
    if (paceAsked || accuracy > _paceFixM || l.foot != 'walk') return;
    final now = When.nowMs();
    if (_paceFixes.isEmpty || now - _paceFixes.last.t >= _paceSampleMs) {
      _paceFixes.removeWhere((f) => now - f.t > _paceKeepMs);
      _paceFixes.add((p: here, acc: accuracy, t: now));
    }
    final first = _paceFixes.first;
    if (now - first.t < _paceSpanMs) return;
    final kmh = math.max(0, metresAB(first.p, here) - (first.acc + accuracy) / 2) / ((now - first.t) / 1000) * 3.6;
    if (kmh <= notWalkingKmh) return;
    if (paceState == 'walking' && now - paceAt <= _paceStaleMs) return;
    final next = legs.indexed.where((e) => e.$1 > leg && e.$2.ride).firstOrNull?.$2;
    if (next != null && project(next.points, here).off <= math.max(80.0, accuracy)) return;
    if (metresAB(here, l.points.last) <= _paceNearEndM) return;
    // Not while the app's out of sight, where it'd go unseen.
    final shown = WidgetsBinding.instance.lifecycleState;
    if (askPace == null || (shown != null && shown != AppLifecycleState.resumed)) return;
    paceAsked = true;
    _save();
    askPace!(kmh.toDouble());
  }

  // Without a good fix on the leg for a minute, the clock moves you on: underground, and when GPS is off.
  /// For tests: the trip's tick, as its timer does it.
  @visibleForTesting
  void debugTick() => _onTick();

  void _onTick() {
    final l = current;
    if (l == null || !_stale || !_underWay(l)) return;
    _holdForBus(l);
    final guess = _clockPos(l);
    if (guess == null) return;
    pos = math.max(pos, guess);
    // Past the wait, on the clock: a train you can't be seen on, or with no location at all.
    if (l.ride && !boarded && guess > 0) {
      boarded = true;
      times[leg] = (boardAt: When.nowMs(), offAt: null);
    }
    _check();
  }

  /// The alert, and on to the next part when this one's done: at the end of a walk, off a ride with a
  /// walk next, or from one train line to the next, where underground nothing but the clock can say
  /// you've changed. Otherwise a ride waits for a fix near the next one's first stop. At the last stop
  /// of the last part, the trip's done.
  void _check() {
    _checkAlert();
    if (!active) return;
    final l = current;
    if (l == null) return;
    if (stopsLeft() == 0) {
      final after = leg + 1 < legs.length ? legs[leg + 1] : null;
      if (after == null || !l.ride || !after.ride || (l.kind == 'train' && after.kind == 'train')) return _next();
    }
    _changed();
  }

  int stopsLeft() {
    final l = current;
    if (l == null) return 0;
    return math.max(0, (l.points.length - 1) - pos.floor());
  }

  void _checkAlert() {
    final l = current;
    if (l == null || !l.ride || !boarded || alerted.contains(leg) || !enabled) return;
    final left = (l.points.length - 1) - pos;
    if (left > alertStops + 0.1) return;
    alerted.add(leg);
    final change = leg < legs.length - 1;
    // To the nearest stop: it's said as you come up to the stop two before the end.
    final n = left.round();
    final stop = l.names.isNotEmpty ? l.names.last : l.to;
    final body = n == 0
        ? tr('trip.getOffNow', 'Get off now at {stop}.', {'stop': stop})
        : n == 1
            ? (change ? tr('trip.getOffOneChange', 'Get off in 1 stop, at {stop}, to change.', {'stop': stop}) : tr('trip.getOffOne', 'Get off in 1 stop, at {stop}.', {'stop': stop}))
            : (change ? tr('trip.getOffManyChange', 'Get off in {n} stops, at {stop}, to change.', {'n': n, 'stop': stop}) : tr('trip.getOffMany', 'Get off in {n} stops, at {stop}.', {'n': n, 'stop': stop}));
    soundAlert(body);
    // The bar keeps saying so until you pass another stop.
    _alertText = body;
    _alertLeft = n;
  }

  /// The alert's buzz ("OFF" in Morse code), sound and notification, over the lock screen, in
  /// earphones only if Settings says so (TripPlugin.alert).
  void soundAlert(String body) {
    if (Native.has('trip')) {
      Native.call('Trip', 'alert', {
        'title': tr('route.get_off_alert', 'Get Off Alert'),
        'body': body,
        'quiet': const ['true', 'on'].contains(Store.I.get('sgbus_getoff_earphones')),
      }).catchError((_) => null);
    } else {
      HapticFeedback.heavyImpact();
      AppNav.say(body);
    }
  }

  void _next() {
    _judge(leg);
    final t = times[leg];
    if (current?.ride == true) times[leg] = (boardAt: t?.boardAt, offAt: When.nowMs());
    if (leg >= legs.length - 1) {
      arrived = true;
      AppNav.say(tr('trip.arrived', "You've arrived."));
      stop(record: true);
      return;
    }
    _left[leg] = (pos: pos, anchor: anchor, boarded: boarded, legStartedAt: legStartedAt);
    leg++;
    pos = 0;
    boarded = false;
    _resetLeg();
    legStartedAt = When.nowMs();
    _changed();
  }

  /// What goes with the part you're on, at a change of part.
  void _resetLeg() {
    anchor = null;
    _moves = [];
    _nearLeg = null;
    _nearEnd = double.infinity;
    _alertText = null;
    onLegAt = When.nowMs() - fixStaleMs + 1000;
  }

  /// Back and Next on the bar: the part before, or on to the next. Back has it on again where you'd
  /// got to on it, or from its start if you'd finished it (the move on was wrong, so you hadn't), and
  /// your location takes it from there. Its alert, if you're back before its stop, and every alert
  /// after it, can go off again.
  void step(int by) {
    if (!active) return;
    // Next on the last part would end the trip, and that's what End the trip is for.
    if (by > 0 && leg >= legs.length - 1) return;
    if (by < 0 && leg == 0) return;
    movedAt = When.nowMs();
    if (by > 0) return _next();
    times.remove(leg);
    leg--;
    // Back on a ride judged not taken (moved on from too soon): it can be taken yet.
    final s = leg < seen.length ? seen[leg] : null;
    if (s != null && s['ok'] != true) s['judged'] = false;
    final l = legs[leg];
    final last = l.points.length - 1;
    final was = _left[leg];
    final t = times[leg];
    if (was != null && was.pos.floor() < last) {
      pos = was.pos;
      boarded = was.boarded;
      legStartedAt = was.legStartedAt;
      _resetLeg();
      anchor = was.anchor;
      times[leg] = (boardAt: t?.boardAt, offAt: null);
    } else {
      pos = 0;
      boarded = false;
      legStartedAt = When.nowMs();
      _resetLeg();
      times.remove(leg);
    }
    _left.removeWhere((i, _) => i >= leg);
    onLegAt = 0;
    arrived = false;
    alerted.removeWhere((i) => i > leg || (i == leg && pos.floor() < last - alertStops));
    _changed();
  }

  /// Another way from here on, in place of the rest of this one: the trip as it was is kept
  /// for Undo.
  void replan(List<TripLeg> next, {String? note}) {
    if (!active || next.isEmpty) return;
    _before = {'legs': legs, 'leg': leg, 'pos': pos, 'boarded': boarded, 'alerted': alerted.toList(), 'seen': List.of(seen)};
    next = acrossTheCauseway(next);
    legs = [...legs.take(leg), ...next];
    seen = [...seen.take(leg), ...List<Map<String, dynamic>?>.filled(next.length, null)];
    pos = 0;
    boarded = false;
    _resetLeg();
    _fetchRoads();
    alerted.removeWhere((i) => i >= leg);
    legStartedAt = When.nowMs();
    switchedNote = note;
    _changed();
  }

  /// Another way on from leg `j`'s `k`th stop (Change here), the ride cut short there; or with
  /// `k` null, from leg `j` as it starts. The trip as it was is kept for Undo.
  void replanAt(int j, int? k, List<TripLeg> next, {String? note}) {
    if (!active || next.isEmpty || j < leg || j >= legs.length) return;
    final cut = k != null && k > 0 && (j > leg || k > pos) ? legs[j].cutAt(k) : null;
    if (cut == null && j == leg) return replan(next, note: note);
    _before = {'legs': legs, 'leg': leg, 'pos': pos, 'boarded': boarded, 'alerted': alerted.toList(), 'seen': List.of(seen)};
    next = acrossTheCauseway(next);
    legs = [...legs.take(j), ?cut, ...next];
    _fetchRoads();
    seen = [...seen.take(j), if (cut != null) j < seen.length ? seen[j] : null, ...List<Map<String, dynamic>?>.filled(next.length, null)];
    alerted.removeWhere((i) => i >= j);
    switchedNote = note;
    _changed();
  }

  void undo() {
    final b = _before;
    if (!active || b == null) return;
    legs = (b['legs'] as List).cast<TripLeg>();
    leg = b['leg'] as int;
    pos = b['pos'] as double;
    boarded = b['boarded'] as bool;
    alerted
      ..clear()
      ..addAll((b['alerted'] as List).cast<int>());
    seen = (b['seen'] as List).cast<Map<String, dynamic>?>();
    _before = null;
    switchedNote = null;
    _changed();
  }

  /// Moved on by the server while the app was away.
  void moveTo(int to, int? startedAt) {
    if (!active || to <= leg || to >= legs.length) return;
    _judge(leg);
    leg = to;
    pos = 0;
    boarded = false;
    _resetLeg();
    legStartedAt = startedAt ?? When.nowMs();
    _changed();
  }

  void _changed() {
    _save();
    if (Native.has('trip')) {
      // Only when it says something new: fixes come many times a second.
      final note = _note();
      final said = jsonEncode(note);
      if (said != _noteSaid) {
        _noteSaid = said;
        Native.call('Trip', 'update', note).catchError((_) => null);
      }
    }
    notifyListeners();
  }

  /// What the trip's notification last said.
  String? _noteSaid;

  /// The trip's notification (TripService.java): its words, what you're on, and its bar (trip_progress.dart).
  Map<String, Object?> _note() {
    final l = current;
    if (l == null) return {'title': title, 'text': _barText()};
    return {
      'title': title,
      'text': _barText(),
      'icon': l.kind,
      'color': TripProgress.colourOf(l),
      'sub': l.ride ? _rideName(l) : '',
      'chip': TripProgress.chip(leg: l, boarded: boarded, stopsLeft: stopsLeft(), minutesLeft: minutesLeft(), last: leg == legs.length - 1),
      'progress': jsonEncode(TripProgress.progress(legs, leg, pos, alertStops: alertStops, alerts: enabled, alerted: alerted)),
    };
  }

  String _barText() {
    final l = current;
    if (l == null) return '';
    final n = stopsLeft();
    final arriving = n == 0 && leg == legs.length - 1;
    // Not on a walk that's the whole trip, which says its minutes already.
    final togo = arriving || (legs.length == 1 && !l.ride) ? '' : ' · ${tr('trip.minLeft', '~{m} min left', {'m': math.max(1, minutesLeft().round())})}';
    if (_alertText != null && n >= _alertLeft) return '$_alertText$togo';
    final share = l.points.length < 2 ? 1.0 : pos / (l.points.length - 1);
    final m = math.max(1, (l.minutes * (1 - share)).round());
    final ride = _rideName(l);
    final where = !l.ride
        ? (n == 0
            ? (l.foot == 'drive' ? tr('trip.driveThere', 'Drive to {to}: there', {'to': l.to}) : l.foot == 'cycle' ? tr('trip.cycleThere', 'Cycle to {to}: there', {'to': l.to}) : tr('trip.walkThere', 'Walk to {to}: there', {'to': l.to}))
            : (l.foot == 'drive' ? tr('trip.driveAbout', 'Drive to {to}, about {m} min', {'to': l.to, 'm': m}) : l.foot == 'cycle' ? tr('trip.cycleAbout', 'Cycle to {to}, about {m} min', {'to': l.to, 'm': m}) : tr('trip.walkAbout', 'Walk to {to}, about {m} min', {'to': l.to, 'm': m})))
        : n == 0
            ? tr('trip.atStop', '{ride}: at {to}', {'ride': ride, 'to': l.to})
            : n == 1
                ? tr('trip.oneStop', '{ride}: 1 stop to {to}', {'ride': ride, 'to': l.to})
                : tr('trip.stops', '{ride}: {n} stops to {to}', {'ride': ride, 'n': n, 'to': l.to});
    final part = legs.length > 1 ? ' · ${tr('trip.part', 'part {n} of {of}', {'n': leg + 1, 'of': legs.length})}' : '';
    return '$where$part$togo';
  }

  /// The minutes to the end of the whole trip: what's left of this part, and the rest.
  double minutesLeft() {
    final l = current;
    if (l == null) return 0;
    final share = l.points.length < 2 ? 1.0 : pos / (l.points.length - 1);
    var m = l.minutes * (1 - share) + (l.ride && !boarded ? l.wait : 0);
    for (final after in legs.skip(leg + 1)) {
      m += after.minutes + after.wait;
    }
    return m;
  }

  /// A ride's name, with which way round on the Circle Line: "CC Line (clockwise)".
  static String _rideName(TripLeg l) {
    final way = loopWay(l);
    if (way == null) return l.label;
    return way == 'cw' ? tr('trip.rideCw', '{ride} (clockwise)', {'ride': l.label}) : tr('trip.rideAcw', '{ride} (anticlockwise)', {'ride': l.label});
  }

  /// Which way a Circle Line ride goes round the loop, as the map has it, north up, by how its
  /// stations turn about the loop's middle: "cw", "acw", or null for any other ride.
  static String? loopWay(TripLeg l) {
    if (l.kind != 'train' || !RegExp(r'^C[CE]', caseSensitive: false).hasMatch(l.route ?? l.label)) return null;
    const middle = [1.3047, 103.8411];
    var turn = 0.0;
    for (var i = 1; i < l.points.length; i++) {
      final y1 = l.points[i - 1][0] - middle[0], x1 = l.points[i - 1][1] - middle[1];
      final y2 = l.points[i][0] - middle[0], x2 = l.points[i][1] - middle[1];
      turn += x1 * y2 - x2 * y1;
    }
    if (turn.abs() < 1e-6) return null;
    return turn > 0 ? 'acw' : 'cw';
  }

  /// The buses that also go straight from a bus leg's first stop to its last.
  static List<String> directBuses(TripLeg l) => directBusesOf(l);

  String barText() => _barText();

  // ---------- Your trips ----------

  void _record() {
    if (!legs.any((l) => l.ride) || times.isEmpty) return;
    final rides = <Map<String, Object?>>[];
    for (var k = 0; k < legs.length; k++) {
      final l = legs[k];
      if (!l.ride) continue;
      final t = times[k];
      final rideMs = t?.boardAt != null && t?.offAt != null ? t!.offAt! - t.boardAt! : null;
      rides.add({
        'kind': l.kind,
        'route': l.kind == 'bus' ? (l.service ?? l.label) : (l.route ?? l.label),
        if (l.kind == 'train') 'color': l.color ?? '',
        if (l.kind == 'train') 'lrt': l.lrt,
        if (l.kind == 'bus') 'op': BusNet.serviceInfo(l.service ?? '')?.op ?? '',
        'from': l.names.isNotEmpty ? l.names.first : '',
        'to': l.to,
        'waitMin': l.wait,
        'rideMin': rideMs != null ? rideMs / 60000 : l.minutes,
        'waitMeasured': false,
        'rideMeasured': rideMs != null,
        'done': t?.offAt != null,
      });
    }
    final kept = Store.I.list(tripsKey).whereType<Map>().where((t) => t['id'] != id).toList();
    kept.add({
      'id': id,
      'startedAt': startedAt,
      'endedAt': When.nowMs(),
      'title': title,
      'from': from,
      'to': to,
      'legs': rides,
      'arrived': arrived,
      'walkMin': legs.where((l) => !l.ride).fold<double>(0, (a, l) => a + l.minutes),
    });
    Store.I.putJson(tripsKey, kept.length > 1000 ? kept.sublist(kept.length - 1000) : kept);
    TripDone.hook?.call(kept.last.cast<String, Object?>());
  }
}

/// Feats and rides (features/coins/) hear of each trip as it's kept.
class TripDone {
  TripDone._();
  static void Function(Map<String, Object?> trip)? hook;
}

// ---------- trips from Navigate and the planner ----------

/// A way from Navigate as a trip (the site's tripFromNav).
({String title, List<TripLeg> legs})? tripFromNav(Map<String, dynamic> o, NavEnd? from, NavEnd? to) {
  final legs = <TripLeg>[];
  final ways = (o['legs'] as List).cast<Map>();
  // The stop on the way (Navigate's Add a stop): marked on the first part after it.
  final viaAt = (o['via'] as Map?)?['leg'] as int?;
  final viaLabel = (o['via'] as Map?)?['label'];
  Map<String, Object?>? viaPoint() {
    if (viaAt == null) return null;
    for (final l in ways) {
      for (final p in [l['to'], l['from']]) {
        if (p is Map && p['via'] == true && p['lat'] is num) return {'label': viaLabel ?? NavState.I.via?.label ?? '', 'lat': p['lat'], 'lng': p['lng']};
      }
    }
    final v = NavState.I.via;
    return v == null ? null : {'label': viaLabel ?? v.label, 'lat': v.lat, 'lng': v.lng};
  }

  var viaPending = viaPoint();
  Map<String, Object?>? takeVia(int k) {
    if (viaPending == null || viaAt == null || k < viaAt) return null;
    final v = viaPending;
    viaPending = null;
    return v;
  }

  List<double>? at(Object? p) => p is Map && p['lat'] is num && p['lng'] is num ? [(p['lat'] as num).toDouble(), (p['lng'] as num).toDouble()] : null;
  // An end as a point: Your location once it's been found (Navigate's plannedFrom), as the
  // site's is. Not yet found, it's 0,0 and there's no point to walk from or to.
  List<double>? point(NavEnd? e) => e == null || (e.here && e.lat == 0 && e.lng == 0) ? null : [e.lat, e.lng];
  for (var k = 0; k < ways.length; k++) {
    final l = ways[k];
    if (l['mode'] == 'walk') {
      final last = k == ways.length - 1;
      final start = k == 0 ? point(from) : at(l['fromExit']) ?? at(l['from']) ?? at(ways[k - 1]['to']);
      final end = last ? point(to) : at(l['toExit']) ?? at(l['to']);
      if (start != null && end != null && ((l['metres'] as num?) ?? 100) >= 50) {
        legs.add(TripLeg(
          kind: 'walk',
          label: tr('trip.walk', 'Walk'),
          to: last ? (to?.label ?? '') : placeName(l['to']),
          points: [start, end],
          names: [k == 0 ? (from?.label ?? '') : placeName(l['from'] ?? ways[k - 1]['to']), last ? (to?.label ?? '') : placeName(l['to'])],
          minutes: math.max(1, ((l['minutes'] as num?) ?? 1).toDouble()),
          afterVia: takeVia(k),
        ));
      }
      continue;
    }
    final path = (l['path'] as List?) ?? const [];
    if (path.length < 2) continue;
    final route = '${l['route']}';
    legs.add(TripLeg(
      kind: '${l['mode']}',
      label: l['mode'] == 'bus'
          ? tr('trip.bus', 'Bus {no}', {'no': route})
          : l['lrt'] == true
              ? tr('trip.lrt', '{line} LRT', {'line': route})
              : tr('trip.line', '{line} Line', {'line': route}),
      to: placeName(l['to']),
      points: [for (final p in path) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]],
      names: [for (final n in (l['names'] as List? ?? const [])) l['mode'] == 'train' ? stationName('$n') : '$n'],
      minutes: ((l['minutes'] as num?) ?? 1).toDouble(),
      wait: ((l['wait'] as num?) ?? 0).toDouble(),
      service: l['mode'] == 'bus' ? route : null,
      board: l['mode'] == 'bus' ? ((l['from'] as Map?)?['code'] as String?) : null,
      alight: l['mode'] == 'bus' ? ((l['to'] as Map?)?['code'] as String?) : null,
      codes: (l['codes'] as List?)?.map((e) => '$e').toList(),
      route: l['mode'] == 'train' ? route : null,
      color: l['color'] as String?,
      lrt: l['lrt'] == true,
      afterVia: takeVia(k),
    ));
  }
  if (legs.isEmpty) return null;
  return (title: to != null ? tr('trip.to', 'To {to}', {'to': to.label}) : tr('trip.toYourStop', 'To your stop'), legs: legs);
}

/// A journey from the route planner as a trip: each bus from its stop to the next change.
List<TripLeg> tripFromLegs(List<Leg> legs) => [
      for (final leg in legs)
        () {
          final stops = BusNet.runStops(leg.bus, leg.dir);
          final i = stops.indexOf(leg.from);
          final j = stops.indexOf(leg.to, i + 1);
          final codes = i == -1 || j == -1 ? [leg.from, leg.to] : stops.sublist(i, j + 1);
          return TripLeg(
            kind: 'bus',
            label: tr('trip.bus', 'Bus {no}', {'no': leg.bus}),
            to: Stops.nameOf(leg.to),
            points: [for (final c in codes) if (Stops.of(c)?.lat != null) [Stops.of(c)!.lat!, Stops.of(c)!.lng!]],
            names: [for (final c in codes) Stops.nameOf(c)],
            minutes: Journeys.legDetails(leg)?.minutes ?? 10,
            wait: When.busWaitMin.toDouble(),
            service: leg.bus,
            board: leg.from,
            alight: leg.to,
            codes: codes,
          );
        }()
    ];

// ---------- the trip bar and the timeline ----------

class TripBar extends StatelessWidget {
  const TripBar({super.key});

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Trip.I,
        builder: (context, _) {
          final t = Trip.I;
          if (!t.active) return const SizedBox.shrink();
          final sg = context.sg;
          return Material(
            color: sg.bar,
            child: InkWell(
              onTap: () => AppNav.push(const TripScreen(), name: 'trip'),
              child: SafeArea(bottom: false, child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 4, 6),
                child: Row(children: [
                  Icon(t.current?.kind == 'train' ? Icons.directions_subway_filled : t.current?.kind == 'walk' ? Icons.directions_walk : Icons.directions_bus, color: sg.onBar),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      // A line for where to and two for the part you're on, so on a phone,
                      // beside the tray, the bar doesn't take a third of the screen; the
                      // whole of it is a tap away on the trip screen.
                      Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sg.onBar, fontWeight: FontWeight.w700)),
                      Text(t.barText(), maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: sg.onBar, fontSize: 13)),
                    ]),
                  ),
                  Tooltip(message: tr('trip.show_the_stops_ahead', 'Show the stops ahead'), child: Icon(Icons.expand_more, color: sg.onBar)),
                  if (t.legs.length > 1) ...[
                    IconButton(visualDensity: VisualDensity.compact, tooltip: tr('trip.back_to_the_part_before', 'Back to the part before'), onPressed: t.leg == 0 ? null : () => t.step(-1), icon: Icon(Icons.skip_previous, color: t.leg == 0 ? sg.onBar.withValues(alpha: .4) : sg.onBar)),
                    IconButton(visualDensity: VisualDensity.compact, tooltip: tr('trip.on_to_the_next_part', 'On to the next part'), onPressed: t.leg >= t.legs.length - 1 ? null : () => t.step(1), icon: Icon(Icons.skip_next, color: t.leg >= t.legs.length - 1 ? sg.onBar.withValues(alpha: .4) : sg.onBar)),
                  ],
                  IconButton(visualDensity: VisualDensity.compact, tooltip: tr('trip.end_the_trip', 'End the trip'), onPressed: () => t.stop(), icon: Icon(Icons.close, color: sg.onBar)),
                ]),
              )),
            ),
          ).let((bar) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [bar, TripNotes(compact: true, onMore: () => AppNav.push(const TripScreen(), name: 'trip'))]));
        },
      );
}

class TripScreen extends StatefulWidget {
  const TripScreen({super.key});

  @override
  State<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<TripScreen> {
  // Change my way: a Change here by every stop still ahead on a ride.
  bool changing = false;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Trip.I,
        builder: (context, _) {
          final t = Trip.I;
          final sg = context.sg;
          if (!t.active) return SgScaffold(title: tr('trip.trip_in_progress', 'Trip in progress'), body: EmptyNote(tr('trip.arrived', "You've arrived.")));
          return SgScaffold(
            title: t.title,
            actions: [
              IconButton(tooltip: tr('trip.live_map', 'Live map'), onPressed: () => AppNav.open('tripMap'), icon: const Icon(Icons.map_outlined)),
              IconButton(tooltip: tr('share.liveProgress', 'Share live progress'), onPressed: () => AppNav.open('tripShare'), icon: const Icon(Icons.share_outlined)),
              IconButton(tooltip: tr('trip.end_trip', 'End trip'), onPressed: () {
              t.stop();
              Navigator.of(context).maybePop();
            }, icon: const Icon(Icons.stop_circle_outlined)),
            ],
            body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
              SgCard(child: Text(t.barText(), style: Theme.of(context).textTheme.titleMedium)),
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(spacing: 8, runSpacing: 6, children: [
                  if (t.legs.skip(t.leg).any((l) => l.ride))
                    Pill(icon: Icons.alt_route, label: tr('nav.change_current_route', 'Change my way'), on: changing, onTap: () => setState(() => changing = !changing)),
                  if (t.origin != null)
                    Pill(icon: Icons.directions, label: tr('stop.back.nav', 'Back to Navigate'), onTap: () => AppNav.open('tripOrigin', {'origin': t.origin})),
                ]),
              ),
              const Padding(padding: EdgeInsets.only(top: 8), child: ClipRRect(borderRadius: BorderRadius.all(Radius.circular(12)), child: TripNotes())),
              if (!Trip.enabled) Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr('trip.alertOff', 'Get Off Alert is off in Settings.'), style: TextStyle(color: sg.warn))),
              if (changing) Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr('trip.tapChangeHere', 'Tap Change here by the stop to get off at.'), style: TextStyle(color: sg.muted))),
              TripTimeline(
                changing: changing,
                onChangeAt: (k, i) {
                  setState(() => changing = false);
                  TripChange.changeAt(context, k, i);
                },
              ),
            ]),
          );
        },
      );
}

extension _Let<T> on T {
  R let<R>(R Function(T it) fn) => fn(this);
}
