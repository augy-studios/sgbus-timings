// The Get Off Alert (the site's js/trip.js, its core): while you're on a trip, the app follows your
// live location along each bus or train ride and alerts you about two stops before you get off,
// at a change or at the end. On by default; Settings turns it off (sgbus.getOffAlert).
//
// The trip's followed by the app's own service (TripPlugin): your location keeps coming with the
// screen off, the trip shows in a notification (its End trip ends it here too), and the alert
// sounds over the lock screen, in earphones only if Settings says so. Underground, where GPS
// gives out, it goes by the time each ride should take. Here it works out where you are: along
// a leg by the stop you're nearest past, a ride boarded once you're well along it, a walk done
// once you're at its end.
//
// Trips come from Navigate (tripFromNav) and the route planner, and end as you arrive or with End
// trip; each is kept for Your trips under sgbus_trips, as the site keeps them.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/nav.dart';
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

class Trip extends ChangeNotifier {
  Trip._();
  static final Trip I = Trip._();

  static const settingKey = 'sgbus.getOffAlert';
  static const savedKey = 'sgbus.trip';
  static const tripsKey = 'sgbus_trips';
  static const alertStops = 2;
  static const goodFixM = 150.0;
  static const walkArriveM = 40.0;
  static const boardM = 150.0;

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
    if (legs.isEmpty) return;
    if (active) await stop(record: true);
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
        await Native.call('Trip', 'start', {'title': title, 'text': _barText()});
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
    await _follow();
    notifyListeners();
  }

  void _save() => Store.I.putJson(savedKey, {
        'id': id, 'title': title, 'legs': [for (final l in legs) l.toJson()], 'from': from, 'to': to, 'origin': origin, 'leg': leg, 'pos': pos,
        'boarded': boarded, 'startedAt': startedAt, 'legStartedAt': legStartedAt, 'alerted': alerted.toList(),
        'seen': seen, 'via': via, 'paceAsked': paceAsked,
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
    Coins.tripDone(id!, legsJson, seen);
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
    here = f;
    lastFixAt = When.nowMs();
    if ((f.accuracy ?? 0) > 500) return;
    final l = current;
    if (l == null) return;
    final p = [f.lat, f.lng];
    if (!l.ride) {
      _watchPace(p, f.accuracy ?? 999, l);
      final toEnd = metresAB(p, l.points.last);
      final whole = metresAB(l.points.first, l.points.last);
      pos = whole <= 0 ? 1 : (1 - toEnd / whole).clamp(pos, 1.0);
      if (toEnd <= walkArriveM) return _next();
      _changed();
      return;
    }
    RideCheck.see(l.toJson(), _seenOf(leg), p, f.accuracy ?? 999);
    _save();
    final at = project(l.points, p);
    final onRoute = at.off <= math.max(250.0, (f.accuracy ?? 0) + 100);
    if (!onRoute) {
      _changed();
      return;
    }
    // On board once you're well along the ride from where it's boarded.
    final metresIn = at.along * _stopGap(l);
    if (!boarded && metresIn >= boardM) {
      boarded = true;
      times[leg] = (boardAt: When.nowMs(), offAt: null);
    }
    if (boarded && at.along > pos) pos = at.along;
    _checkAlert();
    final last = l.points.length - 1;
    if (boarded && pos >= last - 0.15 && metresAB(p, l.points.last) <= 80) return _next();
    _changed();
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

  static double _stopGap(TripLeg l) {
    if (l.points.length < 2) return 1;
    var total = 0.0;
    for (var i = 1; i < l.points.length; i++) {
      total += metresAB(l.points[i - 1], l.points[i]);
    }
    return total / (l.points.length - 1);
  }

  // Without a good fix for a minute, the clock moves you on: underground, and when GPS is off.
  void _onTick() {
    final l = current;
    if (l == null) return;
    if (When.nowMs() - lastFixAt < 60000) return;
    final elapsed = (When.nowMs() - legStartedAt) / 60000 - (l.ride ? l.wait : 0);
    if (elapsed <= 0) return;
    final share = (elapsed / math.max(1, l.minutes)).clamp(0.0, 1.0);
    final next = share * (l.points.length - 1);
    if (l.ride && !boarded) {
      boarded = true;
      times[leg] = (boardAt: When.nowMs(), offAt: null);
    }
    if (next > pos) pos = next;
    _checkAlert();
    if (share >= 1) return _next();
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
    leg++;
    pos = 0;
    boarded = false;
    legStartedAt = When.nowMs();
    _changed();
  }

  /// Back and Next on the bar: the part before, or on to the next.
  void step(int by) {
    if (!active) return;
    movedAt = When.nowMs();
    if (by > 0) return _next();
    if (leg == 0) return;
    leg--;
    pos = 0;
    boarded = false;
    alerted.remove(leg);
    legStartedAt = When.nowMs();
    _changed();
  }

  /// Another way from here on, in place of the rest of this one: the trip as it was is kept
  /// for Undo.
  void replan(List<TripLeg> next, {String? note}) {
    if (!active || next.isEmpty) return;
    _before = {'legs': legs, 'leg': leg, 'pos': pos, 'boarded': boarded, 'alerted': alerted.toList(), 'seen': List.of(seen)};
    legs = [...legs.take(leg), ...next];
    seen = [...seen.take(leg), ...List<Map<String, dynamic>?>.filled(next.length, null)];
    pos = 0;
    boarded = false;
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
    legs = [...legs.take(j), ?cut, ...next];
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
    legStartedAt = startedAt ?? When.nowMs();
    _changed();
  }

  void _changed() {
    _save();
    if (Native.has('trip')) Native.call('Trip', 'update', {'title': title, 'text': _barText()}).catchError((_) => null);
    notifyListeners();
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
  for (var k = 0; k < ways.length; k++) {
    final l = ways[k];
    if (l['mode'] == 'walk') {
      final last = k == ways.length - 1;
      final start = k == 0 ? (from == null || from.here ? null : [from.lat, from.lng]) : at(l['fromExit']) ?? at(l['from']) ?? at(ways[k - 1]['to']);
      final end = last ? (to == null || to.here ? null : [to.lat, to.lng]) : at(l['toExit']) ?? at(l['to']);
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
            color: sg.brand,
            child: InkWell(
              onTap: () => AppNav.push(const TripScreen(), name: 'trip'),
              child: SafeArea(bottom: false, child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                child: Row(children: [
                  Icon(t.current?.kind == 'train' ? Icons.directions_subway_filled : t.current?.kind == 'walk' ? Icons.directions_walk : Icons.directions_bus, color: sg.onBrand),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(t.title, style: TextStyle(color: sg.onBrand, fontWeight: FontWeight.w700)),
                      Text(t.barText(), style: TextStyle(color: sg.onBrand)),
                    ]),
                  ),
                  Tooltip(message: tr('trip.show_the_stops_ahead', 'Show the stops ahead'), child: Icon(Icons.expand_more, color: sg.onBrand)),
                  if (t.legs.length > 1) ...[
                    IconButton(tooltip: tr('trip.back_to_the_part_before', 'Back to the part before'), onPressed: t.leg == 0 ? null : () => t.step(-1), icon: Icon(Icons.skip_previous, color: sg.onBrand)),
                    IconButton(tooltip: tr('trip.on_to_the_next_part', 'On to the next part'), onPressed: () => t.step(1), icon: Icon(Icons.skip_next, color: sg.onBrand)),
                  ],
                  IconButton(tooltip: tr('trip.end_the_trip', 'End the trip'), onPressed: () => t.stop(), icon: Icon(Icons.close, color: sg.onBrand)),
                ]),
              )),
            ),
          ).let((bar) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [bar, const TripNotes(compact: true)]));
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
