// Every bus route in Singapore, held in memory once /api/bus-routes has loaded: which stops
// each service calls at, in order, per direction, with first/last bus times. The route view,
// the bus picker, the route planner and the first/last bus lines all read from here. Ported
// from the site's js/network.js (BusNet), itself from the Telegram bot's bus_routes.py.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import '../api/api.dart';
import '../i18n/i18n.dart';
import 'geo.dart';
import 'stops.dart';
import 'package:path_provider/path_provider.dart';
import 'nav_core.dart' show RouteRun, RouteService;

class ServiceInfo {
  ServiceInfo(this.op, this.cat, this.loop, this.dirs);
  final String op;
  final String cat;
  final String loop;
  final Map<int, List<String>> dirs; // 1 -> [originCode, destCode]
}

class Run {
  Run(this.stops, this.times, this.dist, this.again);
  final List<String> stops;
  final List<String> times; // 24-char strings: weekday, Sat, Sun first/last as HHMM
  final List<double?>? dist; // km along the run, per stop
  final Map<String, double> again; // a stop passed twice: code -> km the second time
}

class Terminals {
  Terminals(this.origin, this.dest, this.directions, this.loop);
  final String? origin;
  final String? dest;
  final int directions;
  final String loop;
}

class FirstLast {
  FirstLast(this.label, this.first, this.last);
  final String label; // Weekday, Sat, Sun
  final String first;
  final String last;
}

class Restricted {
  const Restricted(this.place, this.through);
  final String Function() place;
  final bool through;
}

class CrossBorder {
  const CrossBorder(this.label, this.note, {this.abroad = false, this.vehicles = false});
  final String Function() label;
  final String Function() note;
  final bool abroad;

  /// A checkpoint for vehicles only (Tuas): not a way across on foot, and no passport to say.
  final bool vehicles;

  /// In a route list: a passport needed, or at Tuas Checkpoint, no crossing on foot.
  String short() => vehicles
      ? tr('stop.noFootCrossing', '{place}: no crossing on foot', {'place': label()})
      : tr('stop.passport', '{place}: passport needed', {'place': label()});
}

/// One run of one service as the planner rides it, restricted stops cut out.
class GraphRun {
  GraphRun(this.bus, this.dir, this.stops, this.cum, this.cross, this.times);
  final String bus;
  final int dir;
  final List<String> stops;
  final List<double> cum; // metres ridden to each stop
  final List<(int, String)> cross; // where the run crosses the Causeway: (index, 'out' | 'in')
  final List<String> times;
}

class Graph {
  Graph(this.coords, this.roads, this.runs, this.at, this.byBus, this.wholeByBus, this.hubMates);
  final Map<String, List<double>> coords;
  final Map<String, String> roads;
  final List<GraphRun> runs;
  final Map<String, List<(int, int)>> at; // stop -> (run index, stop index)
  final Map<String, List<GraphRun>> byBus;
  final Map<String, List<({int dir, List<String> stops})>> wholeByBus;
  final Map<String, List<(String, double)>> hubMates;
}

int byNumber(String a, String b) {
  // As localeCompare with numeric: digits compared as numbers, then the rest.
  final ra = RegExp(r'^(\d*)(.*)$').firstMatch(a)!;
  final rb = RegExp(r'^(\d*)(.*)$').firstMatch(b)!;
  final na = int.tryParse(ra[1]!);
  final nb = int.tryParse(rb[1]!);
  if (na != null && nb != null && na != nb) return na.compareTo(nb);
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  return ra[2]!.compareTo(rb[2]!);
}

class BusNet {
  BusNet._();

  static Map<String, ServiceInfo> _services = {};
  static Map<String, Map<int, Run>> _runs = {};
  static Map<String, Set<String>> _atStop = {};
  static Future<void>? _loading;
  static bool ready = false;
  static Graph? _graph;

  static void index(Map<String, dynamic> payload) {
    final services = <String, ServiceInfo>{};
    (payload['services'] as Map? ?? const {}).forEach((no, v) {
      if (v is! Map) return;
      final dirs = <int, List<String>>{};
      (v['dirs'] as Map? ?? const {}).forEach((d, ends) => dirs[int.parse('$d')] = List<String>.from((ends as List).map((e) => '$e')));
      services['$no'] = ServiceInfo('${v['op'] ?? ''}', '${v['cat'] ?? ''}', '${v['loop'] ?? ''}', dirs);
    });
    final runs = <String, Map<int, Run>>{};
    (payload['runs'] as Map? ?? const {}).forEach((no, dirs) {
      final m = <int, Run>{};
      (dirs as Map).forEach((d, run) {
        final r = run as Map;
        final again = <String, double>{};
        (r['again'] as Map? ?? const {}).forEach((k, v) => again['$k'] = (v as num).toDouble());
        m[int.parse('$d')] = Run(
          List<String>.from((r['stops'] as List).map((e) => '$e')),
          List<String>.from(((r['times'] as List?) ?? const []).map((e) => '$e')),
          (r['dist'] as List?)?.map((e) => (e as num?)?.toDouble()).toList(),
          again,
        );
      });
      runs['$no'] = m;
    });
    _services = services;
    _runs = runs;
    _atStop = {};
    runs.forEach((no, dirs) {
      for (final run in dirs.values) {
        for (final code in run.stops) {
          (_atStop[code] ??= <String>{}).add(no);
        }
      }
    });
    _graph = null;
    ready = true;
  }

  // The bus routes kept on the phone as they came, so that the planners work with no connection.
  // In a file: they're megabytes, too much to load with the app's settings each time it opens.
  static Future<File?> _keptFile() async {
    try {
      final dir = await getApplicationSupportDirectory();
      return File('${dir.path}/bus-routes.json');
    } catch (_) {
      return null; // Tests and screenshots.
    }
  }

  static Future<void> load() => ready ? Future.value() : _loading ??= () async {
        try {
          final payload = await Api.get('bus-routes');
          if (payload is! Map) throw const FormatException('bus-routes');
          index(Map<String, dynamic>.from(payload));
          if (Api.fake == null) {
            unawaited(() async {
              final f = await _keptFile();
              await f?.writeAsString(jsonEncode(payload));
            }().catchError((_) {}));
          }
        } catch (e) {
          // Not reached: the copy kept last time.
          final kept = await _keptFile();
          if (kept != null && await kept.exists()) {
            try {
              index(Map<String, dynamic>.from(jsonDecode(await kept.readAsString()) as Map));
              return;
            } catch (_) {
              // Not readable: as if there were none.
            }
          }
          _loading = null;
          rethrow;
        }
      }();

  /// What's needed to plan on the phone (data/nav_core.dart).
  static Map<String, RouteService> forGraph() => {
        for (final e in _runs.entries)
          e.key: () {
            final info = _services[e.key];
            final dirs = info?.dirs.keys.toList() ?? <int>[];
            dirs.sort((a, b) => '$a'.compareTo('$b'));
            return RouteService(
              dirs.isEmpty ? const [] : info!.dirs[dirs.first]!,
              (info?.loop ?? '').isNotEmpty,
              {for (final d in e.value.entries) d.key: RouteRun(d.value.stops, d.value.times)},
            );
          }(),
      };

  static String stopName(String code) => Stops.of(code)?.name ?? code;
  static String stopLabel(String code) => Stops.of(code) != null ? '${Stops.of(code)!.name} ($code)' : code;
  static bool hasService(String no) => _runs.containsKey(no);
  static Iterable<String> get allServices => _runs.keys;

  /// Services whose number starts with what's been typed, in bus-number order.
  static List<String> matchServices(String query, [int limit = 6]) {
    final q = query.trim().toUpperCase();
    if (q.isEmpty || !RegExp(r'^[0-9A-Z]{1,4}$').hasMatch(q)) return const [];
    final out = _runs.keys.where((no) => no.startsWith(q)).toList()..sort(byNumber);
    return out.take(limit).toList();
  }

  static ServiceInfo? serviceInfo(String no) => _services[no];

  static List<int> directions(String no) => (_runs[no]?.keys.toList() ?? <int>[])..sort();

  static List<String> runStops(String no, int dir) => _runs[no]?[dir]?.stops ?? const [];

  static Run? run(String no, int dir) => _runs[no]?[dir];

  /// Every service that calls at a stop, from the route list rather than live arrivals.
  static List<String> servicesAtStop(String code) => (_atStop[code]?.toList() ?? <String>[])..sort(byNumber);

  /// The stops a service still calls at from a stop, that stop first, following one direction;
  /// the other direction if the stop isn't on the first one tried.
  static ({List<String> stops, int? dir}) onwardFrom(String no, String code, [int? preferDir]) {
    final dirs = directions(no);
    final order = preferDir != null ? [preferDir, ...dirs.where((d) => d != preferDir)] : dirs;
    for (final dir in order) {
      final list = runStops(no, dir);
      final i = list.indexOf(code);
      if (i != -1) return (stops: list.sublist(i), dir: dir);
    }
    return (stops: const <String>[], dir: preferDir ?? (dirs.isEmpty ? null : dirs.first));
  }

  /// The direction a stop sits on, preferring the first.
  static int? directionAt(String no, String code) {
    final dirs = directions(no);
    for (final d in dirs) {
      if (runStops(no, d).contains(code)) return d;
    }
    return dirs.isEmpty ? null : dirs.first;
  }

  /// A service's start and end terminals, in the order the given direction runs.
  static Terminals terminals(String no, [int? dir]) {
    final dirs = directions(no);
    final info = _services[no];
    final first = dirs.isEmpty ? null : dirs.first;
    final fromInfo = first == null ? const <String>[] : (info?.dirs[first] ?? const <String>[]);
    final run = first == null ? const <String>[] : runStops(no, first);
    String? origin = fromInfo.isNotEmpty ? fromInfo[0] : (run.isNotEmpty ? run.first : null);
    String? dest = fromInfo.length > 1 ? fromInfo[1] : (run.isNotEmpty ? run.last : null);
    if (dir != null && dir != first) {
      final t = origin;
      origin = dest;
      dest = t;
    }
    return Terminals(origin, dest, dirs.length, info?.loop ?? '');
  }

  /// "Origin → Destination", or where a loop service starts and ends.
  static String endsText(String no) {
    if (!ready || !hasService(no)) return '';
    final t = terminals(no);
    if (t.origin == null || t.dest == null) return '';
    String n(String c) => Stops.nameOf(c).isNotEmpty ? Stops.nameOf(c) : c;
    if (t.loop.isNotEmpty || t.origin == t.dest) return tr('route.loopFrom', 'Loop from {stop}', {'stop': n(t.origin!)});
    return '${n(t.origin!)} → ${n(t.dest!)}';
  }

  // ---- Landmarks ----

  static final _landmarkRe = RegExp(r'\b(?:Int|Ter|Stn|Hosp)\b', caseSensitive: false);
  static final _notAStationRe = RegExp(
      r'\b(?:police|fire|pumping|power|petrol|radio|coast\s*guard|civil\s*defence|bus|caltex|shell|esso|spc|sinopec|mobil)\s+stn\b',
      caseSensitive: false);
  static final _roadNameRe = RegExp(r'\bhosp\s+(?:dr|rd|ave|st|cres|blvd|ln|way|link|walk|cl|pl)\b', caseSensitive: false);
  static final _sidePrefixRe = RegExp(r'^(?:opp|aft|bef|bet|opposite)\s+', caseSensitive: false);
  static const _maxLandmarks = 10;

  static String _withoutFalse(String name) => name.replaceAll(_notAStationRe, '').replaceAll(_roadNameRe, '');

  static String landmarkName(String name) {
    final stripped = _withoutFalse(name.replaceFirst(_sidePrefixRe, '')).trim();
    final m = _landmarkRe.firstMatch(stripped);
    return m != null ? stripped.substring(0, m.end) : stripped;
  }

  static List<T> _thin<T>(List<T> items, int limit) {
    if (items.length <= limit) return items;
    final step = (items.length - 1) / (limit - 1);
    return List.generate(limit, (i) => items[(i * step).round()]);
  }

  /// The landmarks a run of stops passes, in travel order, at most ten, keeping both ends.
  static List<String> landmarks(List<String> codes) {
    final found = <String>[];
    for (final code in codes) {
      final name = Stops.of(code)?.name;
      if (name == null || !_landmarkRe.hasMatch(_withoutFalse(name))) continue;
      final l = landmarkName(name);
      if (found.isNotEmpty && found.last.toLowerCase() == l.toLowerCase()) continue;
      found.add(l);
    }
    final thinned = _thin(found, _maxLandmarks);
    return thinned.length >= 2 ? thinned : const [];
  }

  // ---- First and last bus ----

  static const _dayTypes = [('Weekday', 0), ('Sat', 8), ('Sun', 16)];

  /// Singapore's day of the week, "Mon" .. "Sun".
  static String singaporeWeekday([DateTime? now]) {
    final sg = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 8));
    return const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][sg.weekday - 1];
  }

  static String clockOf(String s) => '${(int.parse(s.substring(0, 2)) % 24).toString().padLeft(2, '0')}:${s.substring(2)}';

  /// Today's first and last bus for a service at a stop, by Singapore's day of the week.
  static FirstLast? firstLast(String no, String code, [int? want]) {
    final dirs = directions(no);
    final order = dirs.contains(want) ? [want!, ...dirs.where((d) => d != want)] : dirs;
    for (final dir in order) {
      final run = _runs[no]![dir]!;
      final i = run.stops.indexOf(code);
      if (i == -1) continue;
      final day = singaporeWeekday();
      final type = day == 'Sat' ? _dayTypes[1] : day == 'Sun' ? _dayTypes[2] : _dayTypes[0];
      final t = i < run.times.length ? run.times[i] : '';
      String fmt(String s) => RegExp(r'^\d{4}$').hasMatch(s) ? clockOf(s) : '-';
      String part(int from) => t.length >= from + 4 ? t.substring(from, from + 4) : '';
      return FirstLast(type.$1, fmt(part(type.$2)), fmt(part(type.$2 + 4)));
    }
    return null;
  }

  /// A service's last bus at a stop on each day type, as LTA gives it ("HHMM", or "-").
  static Map<String, String>? lastBuses(String no, String code) {
    for (final dir in directions(no)) {
      final run = _runs[no]![dir]!;
      final i = run.stops.indexOf(code);
      if (i == -1) continue;
      final t = i < run.times.length ? run.times[i] : '';
      String at(int offset) {
        final s = t.length >= offset + 8 ? t.substring(offset + 4, offset + 8) : '';
        return RegExp(r'^\d{4}$').hasMatch(s) ? s : '-';
      }

      return {'wd': at(0), 'sat': at(8), 'sun': at(16)};
    }
    return null;
  }

  // ---- Hubs ----

  static final _hubRe = RegExp(r'^(.*?)\s*\b(?:bus\s+)?(?:int|ter|stn)\b', caseSensitive: false);

  static String? hubOf(String? name) {
    if (name == null || name.isEmpty) return null;
    final m = _hubRe.firstMatch(name.replaceAll(_notAStationRe, '').replaceFirst(_sidePrefixRe, '').trim());
    final h = m?[1]?.trim().toLowerCase();
    return h == null || h.isEmpty ? null : h;
  }

  static const hubWalkM = 400.0;
  static const walkLimitM = 200.0;

  // ---- Stops the public can't use ----

  static final _cargo = Restricted(() => tr('network.cargo', "Changi Airport's cargo area"), false);
  static final _mindef = Restricted(() => 'MINDEF', true);
  static final Map<String, Restricted> _restricted = {
    '95141': _cargo, '95061': _cargo, '95051': _cargo, '95041': _cargo,
    '95039': _cargo, '95049': _cargo, '95069': _cargo, '95149': _cargo,
    '43721': _mindef, '43719': _mindef,
  };

  static Restricted? restricted(String code) => _restricted[code];

  static bool _openAccess = false;
  static bool get openAccess => _openAccess;
  static void setOpenAccess(bool on) {
    if (on == _openAccess) return;
    _openAccess = on;
    _graph = null;
  }

  static final _checkpoint = CrossBorder(() => tr('network.checkpoint', 'Immigration checkpoint'), () => tr('network.checkpointNote', 'Passport needed to go on.'));
  static final _malaysia = CrossBorder(() => tr('network.malaysia', 'In Malaysia'), () => tr('network.malaysiaNote', 'Passport needed.'), abroad: true);
  // Tuas Checkpoint's stop, the site's TUAS (main-site/js/network.js).
  static final _tuas = CrossBorder(
    () => tr('network.tuas', 'Vehicle checkpoint'),
    () => tr('network.tuasNote',
        'Not for crossing to Malaysia: this checkpoint can’t be crossed on foot. For a bus across, take Causeway Link CW3 from Jurong East, CW4 from Boon Lay or CW7 from Tuas Link.'),
    vehicles: true,
  );
  static final Map<String, CrossBorder> _crossBorder = {
    '25269': _tuas,
    '46101': _checkpoint, '46109': _checkpoint,
    '46211': _malaysia, '46219': _malaysia, '46239': _malaysia, '47711': _malaysia,
  };

  static CrossBorder? crossBorder(String code) => _crossBorder[code];

  static const _crossings = {'46101>46211': 'out', '46219>46109': 'in'};
  static String? crossing(String from, String to) => _crossings['$from>$to'];
  static final Map<String, int> customs = {'out': 30, 'in': 30};
  static void setCustoms(int out, int inbound) {
    customs['out'] = out;
    customs['in'] = inbound;
  }

  static const icaCheckpoints = {
    '25269': [1.347772, 103.637469], // Tuas Checkpt
    '46101': [1.446160, 103.768541], '46109': [1.445706, 103.768683], // W'lands Checkpt
    '46069': [1.442783, 103.769356], // W'lands Train Checkpt
  };
  static const checkpointM = 150.0;
  static bool isCheckpoint(String code) => icaCheckpoints.containsKey(code);
  static bool nearCheckpoint(List<double>? p) =>
      p != null && p.length == 2 && icaCheckpoints.values.any((at) => metresAB(p, at) <= checkpointM);

  static List<List<int>> _publicParts(List<String> seq) {
    if (_openAccess) {
      return seq.length >= 2 ? [List.generate(seq.length, (i) => i)] : [];
    }
    final parts = <List<int>>[[]];
    for (var i = 0; i < seq.length; i++) {
      final r = _restricted[seq[i]];
      if (r == null) {
        parts.last.add(i);
      } else if (!r.through && parts.last.isNotEmpty) {
        parts.add([]);
      }
    }
    return parts.where((p) => p.length >= 2).toList();
  }

  // ---- Graph, for the journey planner and stop counts ----

  static Graph graph() {
    if (_graph != null) return _graph!;
    final coords = <String, List<double>>{};
    final roads = <String, String>{};
    final hubs = <String, List<String>>{};
    Stops.index.forEach((code, s) {
      if (s.lat == null || s.lng == null) return;
      coords[code] = [s.lat!, s.lng!];
      if (s.road.isNotEmpty) roads[code] = s.road.trim().toLowerCase();
      final hub = hubOf(s.name);
      if (hub != null) (hubs[hub] ??= []).add(code);
    });
    final hubMates = <String, List<(String, double)>>{};
    for (final codes in hubs.values) {
      for (final a in codes) {
        for (final b in codes) {
          if (a == b) continue;
          final m = metresAB(coords[a]!, coords[b]!);
          if (m > walkLimitM && m <= hubWalkM) (hubMates[a] ??= []).add((b, m));
        }
      }
    }
    final list = <GraphRun>[];
    final wholeByBus = <String, List<({int dir, List<String> stops})>>{};
    final nos = _runs.keys.toList()..sort();
    for (final no in nos) {
      final dirs = _runs[no]!;
      final info = _services[no];
      final firstDir = info == null || info.dirs.isEmpty ? null : (info.dirs.keys.toList()..sort()).first;
      final ends = firstDir == null ? const <String>[] : info!.dirs[firstDir]!;
      final origin = ends.isNotEmpty ? ends[0] : null;
      final dest = ends.length > 1 ? ends[1] : null;
      final loopOrigin = origin != null && ((info?.loop ?? '').isNotEmpty || origin == dest) ? origin : null;
      for (final dir in dirs.keys.toList()..sort()) {
        final seq = [...dirs[dir]!.stops];
        if (loopOrigin != null && seq.isNotEmpty && seq.first == loopOrigin && seq.last != loopOrigin) seq.add(loopOrigin);
        final own = dirs[dir]!.times;
        final allTimes = List.generate(seq.length, (i) => i < own.length ? own[i] : (own.isNotEmpty ? own[0] : ''));
        (wholeByBus[no] ??= []).add((dir: dir, stops: seq));
        for (final part in _publicParts(seq)) {
          final stops = part.map((i) => seq[i]).toList();
          final cum = <double>[0];
          var total = 0.0;
          for (var i = 1; i < stops.length; i++) {
            final a = coords[stops[i - 1]];
            final b = coords[stops[i]];
            if (a != null && b != null) total += metresAB(a, b);
            cum.add(total);
          }
          final cross = <(int, String)>[];
          for (var i = 1; i < stops.length; i++) {
            final way = crossing(stops[i - 1], stops[i]);
            if (way != null) cross.add((i, way));
          }
          list.add(GraphRun(no, dir, stops, cum, cross, part.map((i) => allTimes[i]).toList()));
        }
      }
    }
    final at = <String, List<(int, int)>>{};
    for (var r = 0; r < list.length; r++) {
      final run = list[r];
      for (var i = 0; i < run.stops.length; i++) {
        (at[run.stops[i]] ??= []).add((r, i));
      }
    }
    final byBus = <String, List<GraphRun>>{};
    for (final run in list) {
      (byBus[run.bus] ??= []).add(run);
    }
    return _graph = Graph(coords, roads, list, at, byBus, wholeByBus, hubMates);
  }

  /// How many stops a bus rides from one stop to another, forwards on one run if it can,
  /// failing that out to the terminus and back along the other direction.
  static ({int stops, String? via})? stopsTo(String no, String from, String to) {
    final own = graph().wholeByBus[no] ?? const [];
    for (final r in own) {
      final i = r.stops.indexOf(from);
      if (i != -1 && r.stops.indexOf(to, i + 1) != -1) return (stops: r.stops.indexOf(to, i + 1) - i, via: null);
    }
    for (final out in own) {
      for (final back in own) {
        if (!identical(out, back) && out.stops.contains(from) && back.stops.contains(to)) {
          final i = out.stops.indexOf(from);
          return (stops: out.stops.length - 1 - i + back.stops.indexOf(to), via: out.stops.last);
        }
      }
    }
    return null;
  }

  // ---- How far a live bus has to come, along its route ----

  static const _onRouteM = 250.0;
  static const _bendShare = 0.3;
  static const _laterByM = 15.0;
  static const _tieM = 60.0;
  static const _busMPerMin = 250.0;

  /// A run as the bus rides it, (code, km) per stop, with a stop it passes twice in it twice.
  static List<(String, double?)>? rideOf(Run? run) {
    final dist = run?.dist;
    if (run == null || dist == null || dist.length != run.stops.length) return null;
    final ride = <(String, double?)>[for (var i = 0; i < run.stops.length; i++) (run.stops[i], dist[i])];
    run.again.forEach((code, km) {
      final at = ride.indexWhere((e) => e.$2 != null && e.$2! > km);
      ride.insert(at == -1 ? ride.length : at, (code, km));
    });
    return ride;
  }

  /// How far a bus at `here` has still to ride to the target-th stop of `ride`, in metres.
  static int? metresAlong(List<(String, double?)>? ride, List<double>? Function(String) coordOf, int target, List<double>? here,
      [num? etaMs]) {
    if (ride == null || target < 0 || target >= ride.length || here == null) return null;
    final goal = coordOf(ride[target].$1);
    if (goal == null) return null;
    double? km(int j) => ride[j].$2;
    if (km(target) == null) return null;
    final kx = 111320 * math.cos(here[0] * math.pi / 180);
    const ky = 110540.0;
    final fits = <({double off, double left})>[];
    for (var i = 0; i < target; i++) {
      final a = coordOf(ride[i].$1);
      final b = coordOf(ride[i + 1].$1);
      if (a == null || b == null || km(i) == null || km(i + 1) == null) continue;
      final ax = a[1] * kx, ay = a[0] * ky;
      final dx = b[1] * kx - ax, dy = b[0] * ky - ay;
      final px = here[1] * kx - ax, py = here[0] * ky - ay;
      final len2 = dx * dx + dy * dy;
      final raw = len2 != 0 ? (px * dx + py * dy) / len2 : 0.0;
      final t = raw.clamp(0.0, 1.0);
      final off = math.sqrt(math.pow(px - t * dx, 2) + math.pow(py - t * dy, 2));
      if (off > math.max(_onRouteM, _bendShare * math.sqrt(len2))) continue;
      final done = (km(i)! + t * (km(i + 1)! - km(i)!)) * 1000;
      final left = km(target)! * 1000 - done + (raw < 0 ? off : 0);
      if (left >= 0) fits.add((off: off, left: left));
    }
    if (fits.isEmpty) return null;
    ({double off, double left})? best;
    if (etaMs != null) {
      final nearest = fits.map((f) => f.off).reduce(math.min);
      final expect = math.max(0, etaMs) / 60000 * _busMPerMin;
      for (final f in fits) {
        if (f.off <= nearest + _tieM && (best == null || (f.left - expect).abs() < (best.left - expect).abs())) best = f;
      }
    } else {
      for (final f in fits) {
        if (best == null || f.off < best.off - (best.off <= _onRouteM ? _laterByM : 0)) best = f;
      }
    }
    return math.max(best!.left, metresAB(here, goal)).round();
  }

  static List<double>? coordOf(String code) {
    final s = Stops.of(code);
    return s?.lat != null && s?.lng != null ? [s!.lat!, s.lng!] : null;
  }

  /// How far a live bus has still to ride to a stop along its route, in metres, or null for the
  /// straight line instead.
  static int? busDistance(String no, String code, {double? lat, double? lng, String? dest, int? visit, num? etaMs}) {
    if (!ready || lat == null || lng == null || coordOf(code) == null) return null;
    final v = visit == 2 ? 2 : 1;
    final picks = <({List<(String, double?)> ride, int target, bool heading})>[];
    for (final dir in directions(no)) {
      final ride = rideOf(_runs[no]![dir]);
      if (ride == null) continue;
      final hits = [for (var i = 0; i < ride.length; i++) if (ride[i].$1 == code) i];
      if (hits.length < v) continue;
      final target = hits[v - 1];
      var heading = false;
      if (dest != null) {
        for (var i = target + 1; i < ride.length; i++) {
          if (ride[i].$1 == dest) heading = true;
        }
      }
      picks.add((ride: ride, target: target, heading: heading));
    }
    final heading = picks.where((p) => p.heading).toList();
    final pick = heading.length == 1 ? heading.first : picks.length == 1 ? picks.first : null;
    return pick == null ? null : metresAlong(pick.ride, coordOf, pick.target, [lat, lng], etaMs);
  }
}
