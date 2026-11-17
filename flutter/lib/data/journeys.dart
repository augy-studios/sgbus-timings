// The buses that run from one stop to another, and journeys for route ends that no single bus
// links: up to three changes of bus, with a short walk allowed at either end and between buses.
// Ported from the site's js/journeys.js (itself from the Telegram bot's journeys.py), so all
// three find the same journeys. Every bus travels forwards, boarding before alighting on one run.
// Times are estimates from straight-line distance between stops.
import '../i18n/i18n.dart';
import 'geo.dart';
import 'network.dart';
import 'when.dart';

class Leg {
  const Leg(this.bus, this.dir, this.from, this.to);
  final String bus;
  final int dir;
  final String from;
  final String to;

  Map<String, Object> toJson() => {'bus': bus, 'dir': dir, 'from': from, 'to': to};
  static Leg? fromJson(Object? j) => j is Map && j['bus'] != null && j['from'] != null && j['to'] != null
      ? Leg('${j['bus']}', (j['dir'] as num?)?.toInt() ?? 1, '${j['from']}', '${j['to']}')
      : null;
}

class _Part {
  _Part(this.run, this.i, this.j);
  final GraphRun run;
  int i;
  int j;
  _Part copy() => _Part(run, i, j);
}

class _Label {
  _Label(this.cost, this.parts);
  final double cost;
  final List<_Part> parts;
}

class _Entry {
  _Entry(this.stop, this.r, this.cost, this.i, this.j);
  final String stop;
  final int r;
  final double cost;
  final int i;
  final int j;
}

class Journeys {
  Journeys._();

  static const walkLimitM = 200.0;
  static const busMPerMin = 250.0;
  static const walkMPerMin = 60.0;
  static const changePenaltyMin = 6.0;
  static const changeWalkMin = 1.0;
  static const maxChanges = 3;
  static const maxJourneys = 5;
  static const acrossRoadM = 100.0;
  static const wrongSideMin = 5.0;
  static const rideNearerMin = 2.0;
  static const _cellDeg = 0.002;

  static String estimateNote() => tr('journeys.estimate', 'Times are rough estimates for riding and walking, not counting the wait for a bus.');

  static Graph? _gridFor;
  static Map<String, List<String>> _grid = {};
  static Map<String, List<(String, double)>> _nearCache = {};

  static String _cell(double lat, double lng) => '${(lat / _cellDeg).floor()},${(lng / _cellDeg).floor()}';

  static void _ensureGrid(Graph g) {
    if (identical(_gridFor, g)) return;
    _gridFor = g;
    _grid = {};
    _nearCache = {};
    g.coords.forEach((code, c) => (_grid[_cell(c[0], c[1])] ??= []).add(code));
  }

  static List<(String, double)> _near(Graph g, String code) => _nearCache[code] ??= () {
        final found = <(String, double)>[];
        final here = g.coords[code];
        if (here != null) {
          final cx = (here[0] / _cellDeg).floor();
          final cy = (here[1] / _cellDeg).floor();
          for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
              for (final other in _grid['${cx + dx},${cy + dy}'] ?? const <String>[]) {
                if (other == code) continue;
                final m = metresAB(here, g.coords[other]!);
                if (m <= walkLimitM) found.add((other, m));
              }
            }
          }
        }
        return found;
      }();

  static List<(String, double)> _withNear(Graph g, String code) => [(code, 0), ..._near(g, code)];
  static List<(String, double)> _changeNear(Graph g, String code) => [..._withNear(g, code), ...?g.hubMates[code]];

  static double _at(GraphRun run, int i) {
    var t = run.cum[i] / busMPerMin;
    for (final (c, way) in run.cross) {
      if (c <= i) t += BusNet.customs[way]!;
    }
    return t;
  }

  static double _rideMin(GraphRun run, int i, int j) => _at(run, j) - _at(run, i);
  static double _walkMin(double m) => m / walkMPerMin;
  static double _changeWalk(double m) => m > 0 ? _walkMin(m) + changeWalkMin : 0;
  static Leg _toLeg(_Part p) => Leg(p.run.bus, p.run.dir, p.run.stops[p.i], p.run.stops[p.j]);

  static int _compareBuses(List<String> x, List<String> y) {
    for (var i = 0; i < x.length && i < y.length; i++) {
      final c = byNumber(x[i], y[i]);
      if (c != 0) return c;
    }
    return x.length - y.length;
  }

  /// Every bus from one stop to the other without a change, heading the right way.
  static List<String> directServices(String start, String end) {
    final g = BusNet.graph();
    final found = <String>{};
    for (final (r, i) in g.at[start] ?? const <(int, int)>[]) {
      if (g.runs[r].stops.indexOf(end, i + 1) != -1) found.add(g.runs[r].bus);
    }
    return found.toList()..sort(byNumber);
  }

  /// The buses straight from one stop to the other, with the minutes each rides and whether
  /// it's running when boarded for (mode, ms).
  static List<({String bus, double minutes, bool running})> directRides(String start, String end, ({String mode, int ms}) timing) {
    final g = BusNet.graph();
    final byBus = <String, ({String bus, double minutes, bool running})>{};
    for (final (r, i) in g.at[start] ?? const <(int, int)>[]) {
      final run = g.runs[r];
      final j = run.stops.indexOf(end, i + 1);
      if (j == -1) continue;
      final minutes = _rideMin(run, i, j);
      final boardMs = timing.mode == 'arrive' ? timing.ms - (minutes * 60000).round() : timing.ms + When.busWaitMin * 60000;
      final ride = (bus: run.bus, minutes: minutes, running: When.busRunsAt(run.times[i], boardMs));
      final old = byBus[run.bus];
      if (old == null || (ride.running && !old.running) || (ride.running == old.running && ride.minutes < old.minutes)) byBus[run.bus] = ride;
    }
    return byBus.values.toList()..sort((a, b) => byNumber(a.bus, b.bus));
  }

  /// The quickest few ways from one stop to another, best first, one per sequence of buses.
  static List<List<Leg>> findJourneys(String start, String end, {int limit = maxJourneys, ({String mode, int ms})? timing}) {
    final found = <List<Leg>>[];
    for (final r in _ranked(start, end)) {
      if (found.length >= limit) break;
      if (timing == null || _journeyRuns(r.legs, start, end, timing)) found.add(r.legs);
    }
    return found;
  }

  static ({List<double> boards, double total})? journeyClock(List<Leg> legs, String start, String end) {
    final boards = <double>[];
    var t = 0.0;
    var here = start;
    for (final leg in legs) {
      final d = legDetails(leg);
      if (d == null) return null;
      t += (walkDetails(here, leg.from)?.minutes ?? 0) + When.busWaitMin;
      boards.add(t);
      t += d.minutes;
      here = leg.to;
    }
    return (boards: boards, total: t + (walkDetails(here, end)?.minutes ?? 0));
  }

  static bool _journeyRuns(List<Leg> legs, String start, String end, ({String mode, int ms}) timing) {
    final clock = journeyClock(legs, start, end);
    if (clock == null) return false;
    final leaveMs = timing.mode == 'arrive' ? timing.ms - (clock.total * 60000).round() : timing.ms;
    for (var k = 0; k < legs.length; k++) {
      final run = _runOf(legs[k]);
      if (run == null) return false;
      final i = run.stops.indexOf(legs[k].from);
      if (!When.busRunsAt(i < 0 ? null : run.times[i], leaveMs + (clock.boards[k] * 60000).round())) return false;
    }
    return true;
  }

  static GraphRun? _runOf(Leg leg) {
    final runs = (BusNet.graph().byBus[leg.bus] ?? const <GraphRun>[]).where((r) => r.dir == leg.dir).toList();
    for (final r in runs) {
      final i = r.stops.indexOf(leg.from);
      if (i != -1 && r.stops.indexOf(leg.to, i + 1) != -1) return r;
    }
    return runs.isEmpty ? null : runs.first;
  }

  static Graph? _rankedFor;
  static final Map<String, List<({double cost, List<Leg> legs})>> _rankedCache = {};

  static List<({double cost, List<Leg> legs})> _ranked(String start, String end, {bool walkStart = true, bool walkEnd = true}) {
    final g = BusNet.graph();
    if (!identical(_rankedFor, g)) {
      _rankedFor = g;
      _rankedCache.clear();
    }
    final key = '$start|$end|$walkStart|$walkEnd|${BusNet.customs['out']}|${BusNet.customs['in']}';
    if (!_rankedCache.containsKey(key)) {
      if (_rankedCache.length >= 6) _rankedCache.remove(_rankedCache.keys.first);
      _rankedCache[key] = _search(g, start, end, walkStart, walkEnd);
    }
    return _rankedCache[key]!;
  }

  static Map<String, List<_Entry>> _groupByStop(Iterable<_Entry> entries) {
    final out = <String, List<_Entry>>{};
    for (final e in entries) {
      (out[e.stop] ??= []).add(e);
    }
    return out;
  }

  static List<({double cost, List<Leg> legs})> _search(Graph g, String start, String end, bool walkStart, bool walkEnd) {
    _ensureGrid(g);
    final starts = walkStart ? _withNear(g, start) : [(start, 0.0)];
    final ends = walkEnd ? _withNear(g, end) : [(end, 0.0)];

    final onward = <String, _Entry>{};
    for (final (board, walkM) in starts) {
      for (final (r, i) in g.at[board] ?? const <(int, int)>[]) {
        final run = g.runs[r];
        for (var j = i + 1; j < run.stops.length; j++) {
          final cost = _walkMin(walkM) + _rideMin(run, i, j);
          final key = '${run.stops[j]}|$r';
          final prev = onward[key];
          if (prev == null || cost < prev.cost) onward[key] = _Entry(run.stops[j], r, cost, i, j);
        }
      }
    }
    final inward = <String, _Entry>{};
    for (final (alight, walkM) in ends) {
      for (final (r, j) in g.at[alight] ?? const <(int, int)>[]) {
        final run = g.runs[r];
        for (var i = 0; i < j; i++) {
          final cost = _rideMin(run, i, j) + _walkMin(walkM);
          final key = '${run.stops[i]}|$r';
          final prev = inward[key];
          if (prev == null || cost < prev.cost) inward[key] = _Entry(run.stops[i], r, cost, i, j);
        }
      }
    }
    final inwardAt = _groupByStop(inward.values);

    final best = <String, ({double cost, List<String> buses, List<_Part> parts})>{};
    void offer(double cost, List<_Part> parts) {
      final buses = parts.map((p) => p.run.bus).toList();
      if (buses.toSet().length < buses.length) return;
      final key = buses.join('>');
      final prev = best[key];
      if (prev == null || cost < prev.cost) best[key] = (cost: cost, buses: buses, parts: parts);
    }

    final endWalk = {for (final (s, m) in ends) s: m};
    for (final e in onward.values) {
      final w = endWalk[e.stop];
      if (w != null) offer(e.cost + _walkMin(w), [_Part(g.runs[e.r], e.i, e.j)]);
    }
    for (final e1 in onward.values) {
      final run1 = g.runs[e1.r];
      for (final (board, walkM) in _changeNear(g, e1.stop)) {
        for (final e2 in inwardAt[board] ?? const <_Entry>[]) {
          final run2 = g.runs[e2.r];
          if (run2.bus == run1.bus) continue;
          offer(e1.cost + _changeWalk(walkM) + changePenaltyMin + e2.cost, [_Part(run1, e1.i, e1.j), _Part(run2, e2.i, e2.j)]);
        }
      }
    }

    Map<String, _Label> oneBus(Map<String, List<_Entry>> at) => {
          for (final e in at.entries)
            e.key: () {
              final c = e.value.reduce((a, b) => b.cost < a.cost ? b : a);
              return _Label(c.cost, [_Part(g.runs[c.r], c.i, c.j)]);
            }()
        };
    final reach = <Map<String, _Label>?>[null, _changeAt(g, oneBus(_groupByStop(onward.values)))];
    final finish = <Map<String, _Label>?>[null, _changeAt(g, oneBus(inwardAt))];
    for (var k = 2; k < maxChanges; k++) {
      reach.add(_changeAt(g, _rideOn(g, reach[k - 1]!)));
      finish.add(_changeAt(g, _rideBack(g, finish[k - 1]!)));
    }
    for (final run in g.runs) {
      for (var before = 1; before < maxChanges; before++) {
        _scanOn(reach[before]!, run, (index, cost, board, parts) {
          for (var after = 1; after <= maxChanges - before; after++) {
            final tail = finish[after]!.get(run.stops[index]);
            if (tail != null) offer(cost + tail.cost, [...parts, _Part(run, board, index), ...tail.parts]);
          }
        });
      }
    }
    final list = best.values.toList()
      ..sort((a, b) {
        final c = a.cost.compareTo(b.cost);
        return c != 0 ? c : _compareBuses(a.buses, b.buses);
      });
    return [for (final item in list) (cost: item.cost, legs: _rideNearer(g, item.parts, start, end).map(_toLeg).toList())];
  }

  static List<_Part> _rideNearer(Graph g, List<_Part> parts, String start, String end) {
    final out = parts.map((p) => p.copy()).toList();
    double walkTo(String code, String e) => code == e ? 0 : (g.coords[code] != null && g.coords[e] != null ? metresAB(g.coords[code]!, g.coords[e]!) : double.infinity);
    final first = out.first;
    final i1 = first.i;
    for (var k = i1 - 1; k >= 0 && _rideMin(first.run, k, i1) <= rideNearerMin; k--) {
      if (walkTo(first.run.stops[k], start) < walkTo(first.run.stops[first.i], start)) first.i = k;
    }
    final last = out.last;
    final j2 = last.j;
    for (var k = j2 + 1; k < last.run.stops.length && _rideMin(last.run, j2, k) <= rideNearerMin; k++) {
      if (walkTo(last.run.stops[k], end) < walkTo(last.run.stops[last.j], end)) last.j = k;
    }
    return out;
  }

  static void _scanOn(Map<String, _Label> reach, GraphRun run, void Function(int index, double cost, int board, List<_Part> parts) visit) {
    ({double cost, int board, List<_Part> parts})? bestOn;
    for (var index = 0; index < run.stops.length; index++) {
      if (bestOn != null) visit(index, bestOn.cost + _at(run, index), bestOn.board, bestOn.parts);
      final label = reach[run.stops[index]];
      if (label != null && label.parts.every((p) => p.run.bus != run.bus)) {
        final onCost = label.cost - _at(run, index);
        if (bestOn == null || onCost < bestOn.cost) bestOn = (cost: onCost, board: index, parts: label.parts);
      }
    }
  }

  static Map<String, _Label> _rideOn(Graph g, Map<String, _Label> reach) {
    final off = <String, _Label>{};
    for (final run in g.runs) {
      _scanOn(reach, run, (index, cost, board, parts) {
        final stop = run.stops[index];
        if (!off.containsKey(stop) || cost < off[stop]!.cost) off[stop] = _Label(cost, [...parts, _Part(run, board, index)]);
      });
    }
    return off;
  }

  static Map<String, _Label> _rideBack(Graph g, Map<String, _Label> finish) {
    final on = <String, _Label>{};
    for (final run in g.runs) {
      ({double cost, int alight, List<_Part> parts})? bestOff;
      for (var index = run.stops.length - 1; index >= 0; index--) {
        final stop = run.stops[index];
        if (bestOff != null) {
          final cost = bestOff.cost - _at(run, index);
          if (!on.containsKey(stop) || cost < on[stop]!.cost) on[stop] = _Label(cost, [_Part(run, index, bestOff.alight), ...bestOff.parts]);
        }
        final label = finish[stop];
        if (label != null && label.parts.every((p) => p.run.bus != run.bus)) {
          final offCost = label.cost + _at(run, index);
          if (bestOff == null || offCost < bestOff.cost) bestOff = (cost: offCost, alight: index, parts: label.parts);
        }
      }
    }
    return on;
  }

  static Map<String, _Label> _changeAt(Graph g, Map<String, _Label> at) {
    final out = <String, _Label>{};
    at.forEach((stop, l) {
      for (final (other, walkM) in _changeNear(g, stop)) {
        final total = l.cost + _changeWalk(walkM) + changePenaltyMin;
        if (!out.containsKey(other) || total < out[other]!.cost) out[other] = _Label(total, l.parts);
      }
    });
    return out;
  }

  static List<(String, double)> acrossTheRoad(String code) {
    final g = BusNet.graph();
    _ensureGrid(g);
    final road = g.roads[code];
    if (road == null) return const [];
    return _near(g, code).where((e) => e.$2 <= acrossRoadM && g.roads[e.$1] == road).toList()..sort((a, b) => a.$2.compareTo(b.$2));
  }

  /// The stop across the road that each end was most likely meant to be.
  static Map<String, ({String code, double metres})> wrongSideEnds(String start, String end) {
    final ranked = _ranked(start, end);
    if (ranked.isEmpty) return const {};
    final bestCost = ranked.first.cost;
    final best = ranked.first.legs;
    final fixes = <String, ({String code, double metres})>{};
    for (final (field, code, used, walkStart, walkEnd) in [
      ('start', start, best.first.from, false, true),
      ('end', end, best.last.to, true, false),
    ]) {
      final across = acrossTheRoad(code).where((e) => e.$1 == used).firstOrNull;
      if (across == null) continue;
      final own = _ranked(start, end, walkStart: walkStart, walkEnd: walkEnd);
      if (own.isNotEmpty && own.first.cost - bestCost < wrongSideMin) continue;
      fixes[field] = (code: used, metres: across.$2);
    }
    return fixes;
  }

  static ({int stops, double minutes})? legDetails(Leg leg) {
    final run = _runOf(leg);
    if (run == null) return null;
    final i = run.stops.indexOf(leg.from);
    final j = i == -1 ? -1 : run.stops.indexOf(leg.to, i + 1);
    if (j == -1) return null;
    return (stops: j - i, minutes: _rideMin(run, i, j));
  }

  static List<({String way, String from, String to, int minutes})> legCrossings(Leg leg) {
    final run = _runOf(leg);
    if (run == null) return const [];
    final i = run.stops.indexOf(leg.from);
    final j = run.stops.indexOf(leg.to, i + 1);
    return [
      for (final (c, way) in run.cross)
        if (c > i && c <= j) (way: way, from: run.stops[c - 1], to: run.stops[c], minutes: BusNet.customs[way]!)
    ];
  }

  static ({double metres, double minutes})? walkDetails(String from, String to) {
    if (from == to) return null;
    final c = BusNet.graph().coords;
    final m = c[from] != null && c[to] != null ? metresAB(c[from]!, c[to]!) : 0.0;
    return (metres: m, minutes: _walkMin(m));
  }

  static double? journeyMinutes(List<Leg> legs, String start, String end) {
    var total = 0.0;
    var here = start;
    for (final leg in legs) {
      final d = legDetails(leg);
      if (d == null) return null;
      total += d.minutes + (walkDetails(here, leg.from)?.minutes ?? 0);
      here = leg.to;
    }
    return total + (walkDetails(here, end)?.minutes ?? 0);
  }
}

extension on Map<String, _Label> {
  _Label? get(String key) => this[key];
}
