// Navigate's Bus and train planned on the phone, with no connection: the same graph and router as
// /api/nav and the site's offline planning (main-site/js/nav-core/: network.js, router.js, plan.js,
// via.js and campus.js), so it finds the same ways. Keep in step with them;
// test/nav_core_test.dart checks the two against each other (tool/nav_core_expected.mjs).
//
// Nodes are bus stops and stations. A run is one vehicle's path, a bus service's direction or a
// train's way along a line, with the minutes ridden to each node. Walks link nodes a short way
// apart. LTA publishes no journey or train times, so every time is an estimate: buses at ~15 km/h,
// trains from straight-line distance between stations, plus a wait to board and the walk from an
// exit to the platform.
//
// The search goes round by round, one vehicle per round (RAPTOR, in outline), keeping the best
// arrival at each node per "mix", the modes ridden so far ("T", "BT", "TTB"), so the 2 trains + 1
// bus way is still there when 1 train + 2 buses is a minute quicker.
//
// What the server adds and this can't is left out: OneMap's check, the traffic right now, last bus
// warnings, walking, cycling or driving the whole way, and LTA's train disruptions.
import 'dart:math' as math;

import 'campus.dart';
import 'stops.dart';
import 'when.dart';

const walkMPerMin = 60.0;
const _busMPerMin = 250.0;
const _mrtMPerMin = 650.0;
const _lrtMPerMin = 375.0;
const _trainDwellMin = 0.4;
const _trackFactor = 1.1;
const _stopWalkM = 200.0;
const _stationWalkM = 300.0;
const _hubWalkM = 400.0;
const stationAccessMin = 2.0;
const _changeWalkMin = 1.0;
const _lrtLines = {'BP', 'SK', 'PG'};
const _cellDeg = 0.003;

// Stops behind a checkpoint, for authorised people only: no way gets on or off at these, and where
// `through` is false, none rides through them either. Unless Restricted areas is on.
const _restricted = <String, bool>{
  '95141': false, '95061': false, '95051': false, '95041': false,
  '95039': false, '95049': false, '95069': false, '95149': false,
  '43721': true, '43719': true,
};

// The two hops across the Causeway, where everyone gets off to clear immigration and on again.
const _crossings = {'46101>46211': 'out', '46219>46109': 'in'};

final _hubRe = RegExp(r'^(.*?)\s*\b(?:bus\s+)?(?:int|ter|stn)\b', caseSensitive: false);
final _notAStationRe = RegExp(r'\b(?:police|fire|pumping|power|petrol|radio|coast\s*guard|civil\s*defence|bus|caltex|shell|esso|spc|sinopec|mobil)\s+stn\b', caseSensitive: false);
final _sidePrefixRe = RegExp(r'^(?:opp|aft|bef|bet|opposite)\s+', caseSensitive: false);

double haversine(double lat1, double lng1, double lat2, double lng2) {
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
}

class NavNode {
  NavNode({required this.kind, required this.code, required this.name, this.road = '', required this.lat, required this.lng, this.exits = const [], this.exitNames = const []});
  final String kind; // stop, station
  final String code;
  final String name;
  final String road;
  final double lat;
  final double lng;
  final List<List<double>> exits;
  final List<String> exitNames;
  bool get station => kind == 'station';
  Map<String, Object?> get ref => {'kind': kind, 'code': code, 'name': name, 'lat': lat, 'lng': lng};
}

class NavRun {
  NavRun({required this.mode, required this.key, required this.route, required this.towards, required this.nodes, required this.cum, this.cross = const [], this.times, this.dir, this.name, this.color, this.lrt, this.campus, this.at, this.shuttle});
  final String mode; // B, T
  final String key;
  final String route;
  final String towards;
  final List<int> nodes;
  final List<double> cum;
  final List<(int, String)> cross;
  final List<String>? times;
  final int? dir;
  final String? name;
  final String? color;
  final bool? lrt;
  final Map<String, Object?>? campus;
  final List<int>? at;
  final CampusRoute? shuttle;
}

/// A bus service as the graph needs it, whether from /api/bus-routes as it came or BusNet's copy.
class RouteRun {
  const RouteRun(this.stops, this.times);
  final List<String> stops;
  final List<String> times;
}

class RouteService {
  const RouteService(this.firstEnds, this.loop, this.runs);

  /// Its first direction's first and last stops.
  final List<String> firstEnds;
  final bool loop;
  final Map<int, RouteRun> runs;
}

class NavGraph {
  NavGraph(this.nodes, this.runs, this.at, this.walks, this.grid, this.campusConfig);
  final List<NavNode> nodes;
  final List<NavRun> runs;
  final List<List<(int, int)>> at;
  final List<List<(int, double, double)>> walks;
  final Map<String, List<int>> grid;
  final Map<String, dynamic>? campusConfig;
}

double metresTo(NavNode n, double lat, double lng) {
  if (n.station && n.exits.isNotEmpty) {
    var best = double.infinity;
    for (final e in n.exits) {
      best = math.min(best, haversine(lat, lng, e[0], e[1]));
    }
    return best;
  }
  return haversine(lat, lng, n.lat, n.lng);
}

String? _hubOf(NavNode n) {
  if (n.station) return n.name.trim().toLowerCase();
  final m = _hubRe.firstMatch(n.name.replaceAll(_notAStationRe, '').replaceFirst(_sidePrefixRe, '').trim());
  final hub = m?[1]?.trim().toLowerCase();
  return hub == null || hub.isEmpty ? null : hub;
}

// As an object's keys come in JavaScript: whole numbers in order, then the rest as they came.
List<String> jsOrder(Iterable<String> keys) {
  final whole = RegExp(r'^(0|[1-9]\d*)$');
  final nums = keys.where(whole.hasMatch).toList()..sort((a, b) => int.parse(a).compareTo(int.parse(b)));
  return [...nums, ...keys.where((k) => !whole.hasMatch(k))];
}

List<({String key, String label, List<String> codes})> _railSequences(Map line) {
  final code = '${line['code']}';
  final codes = [for (final c in line['codes'] as List) '$c'];
  int numOf(String c) => int.parse(c.replaceFirst(RegExp(r'^\D+'), ''));
  String pre(String c) => c.replaceFirst(RegExp(r'\d+$'), '');
  List<String> sorted(String p) {
    final out = codes.where((c) => pre(c) == p).toList();
    final order = {for (final (i, c) in out.indexed) c: i};
    out.sort((a, b) {
      final d = numOf(a).compareTo(numOf(b));
      return d != 0 ? d : order[a]!.compareTo(order[b]!);
    });
    return out;
  }

  ({String key, String label, List<String> codes}) one(String key, List<String> c, [String? label]) => (key: key, label: label ?? code, codes: c);
  switch (code) {
    case 'EW':
      return [one('EW', sorted('EW')), one('CG', [...sorted('CG').reversed, 'EW4'], 'CG')];
    case 'CC':
      final cc = sorted('CC');
      return [one('CC', cc.where((c) => numOf(c) <= 29).toList()), one('CC6', [...cc.where((c) => numOf(c) >= 29), 'CC4'])];
    case 'BP':
      return [one('BP', [...sorted('BP'), 'BP6'])];
    case 'SK':
      return [one('SKE', ['STC', ...sorted('SE'), 'STC']), one('SKW', ['STC', ...sorted('SW'), 'STC'])];
    case 'PG':
      return [one('PGE', ['PTC', ...sorted('PE'), 'PTC']), one('PGW', ['PTC', ...sorted('PW'), 'PTC'])];
    default:
      return [one(code, sorted(pre(codes.first)))];
  }
}

List<NavRun> _railRuns(Map rail, List<NavNode> nodes, List<int> stationNode) {
  final runs = <NavRun>[];
  for (final line in (rail['lines'] as List).cast<Map>()) {
    final code = '${line['code']}';
    final lrt = _lrtLines.contains(code);
    final speed = lrt ? _lrtMPerMin : _mrtMPerMin;
    final lineCodes = [for (final c in line['codes'] as List) '$c'];
    final lineStops = line['stops'] as List;
    for (final s in _railSequences(line)) {
      final ids = [
        for (final c in s.codes)
          () {
            final i = lineCodes.indexOf(c);
            if (i == -1) throw StateError('rail.json: $code has no station $c');
            return stationNode[(lineStops[i] as num).toInt()];
          }(),
      ];
      for (final path in [ids, ids.reversed.toList()]) {
        final cum = <double>[0];
        for (var i = 1; i < path.length; i++) {
          final a = nodes[path[i - 1]], b = nodes[path[i]];
          cum.add(cum[i - 1] + haversine(a.lat, a.lng, b.lat, b.lng) * _trackFactor / speed + _trainDwellMin);
        }
        runs.add(NavRun(
          mode: 'T',
          key: 'T:${s.key}',
          route: s.label,
          name: s.label == 'CG' ? 'East-West Line (Changi Airport branch)' : '${line['name']}',
          color: line['color'] as String?,
          lrt: lrt,
          towards: nodes[path.last].name,
          nodes: path,
          cum: cum,
        ));
      }
    }
  }
  return runs;
}

List<NavRun> _busRuns(List<NavNode> nodes, Map<String, int> busNode, Map<String, RouteService> services, bool open) {
  final runs = <NavRun>[];
  for (final no in jsOrder(services.keys)) {
    final info = services[no]!;
    final origin = info.firstEnds.isNotEmpty ? info.firstEnds.first : null;
    final dest = info.firstEnds.length > 1 ? info.firstEnds[1] : null;
    final loopOrigin = origin != null && (info.loop || origin == dest) ? origin : null;
    final dirs = info.runs.keys.toList()..sort();
    for (final dir in dirs) {
      final run = info.runs[dir]!;
      final codes = [...run.stops];
      // A loop ends where it started, but the route list keeps one row per stop.
      if (loopOrigin != null && codes.isNotEmpty && codes.first == loopOrigin && codes.last != loopOrigin) codes.add(loopOrigin);
      final parts = <List<(int, String)>>[[]];
      for (final (k, c) in codes.indexed) {
        final through = open ? null : _restricted[c];
        if (through != null) {
          if (!through && parts.last.isNotEmpty) parts.add([]);
          continue;
        }
        final id = busNode[c];
        if (id != null) parts.last.add((id, k < run.times.length ? run.times[k] : (run.times.isNotEmpty ? run.times.first : '')));
      }
      if (codes.isEmpty) continue;
      final end = busNode[codes.last];
      for (final kept in parts) {
        if (kept.length < 2) continue;
        final path = [for (final p in kept) p.$1];
        final cum = <double>[0];
        final cross = <(int, String)>[];
        for (var i = 1; i < path.length; i++) {
          final a = nodes[path[i - 1]], b = nodes[path[i]];
          cum.add(cum[i - 1] + haversine(a.lat, a.lng, b.lat, b.lng) / _busMPerMin);
          final way = _crossings['${a.code}>${b.code}'];
          if (way != null) cross.add((i, way));
        }
        runs.add(NavRun(mode: 'B', key: 'B:$no', route: no, dir: dir, towards: nodes[end ?? path.last].name, nodes: path, cum: cum, cross: cross, times: [for (final p in kept) p.$2]));
      }
    }
  }
  return runs;
}

({List<NavRun> runs, Map<String, dynamic>? config}) _campusRuns(Map? files, List<NavNode> nodes, Map<String, int> busNode) {
  if (files == null || (files['nus'] == null && files['ntu'] == null)) return (runs: const [], config: null);
  final lta = <String, Stop>{
    for (final e in busNode.entries) e.key: Stop(e.key, nodes[e.value].name, nodes[e.value].road, nodes[e.value].lat, nodes[e.value].lng),
  };
  final model = Campus.build(files, lta);
  final nodeOf = <String, int?>{};
  int? node(String? key) {
    if (key == null) return null;
    if (nodeOf.containsKey(key)) return nodeOf[key];
    final s = model.stops[key];
    var id = s != null && s.lta ? busNode[key] : null;
    if (id == null && s != null) {
      id = nodes.length;
      nodes.add(NavNode(kind: 'stop', code: key, name: s.name, road: s.road, lat: s.lat, lng: s.lng));
    }
    return nodeOf[key] = id;
  }

  final runs = <NavRun>[];
  for (final route in model.routes) {
    // Kept out of Navigate (shuttles.json's `navigate`: false), as the site's nav-core does.
    if (!route.navigate) continue;
    final stops = <(int, int)>[];
    for (final (i, k) in route.keys.indexed) {
      final id = node(k);
      if (id != null) stops.add((id, i));
    }
    if (stops.length < 2) continue;
    final path = [for (final s in stops) s.$1];
    final speed = route.kmh != null ? route.kmh! * 1000 / 60 : _busMPerMin;
    final cum = <double>[0];
    final cross = <(int, String)>[];
    for (var i = 1; i < path.length; i++) {
      final a = nodes[path[i - 1]], b = nodes[path[i]];
      cum.add(cum[i - 1] + haversine(a.lat, a.lng, b.lat, b.lng) / speed);
      final way = _crossings['${a.code}>${b.code}'];
      if (way != null) cross.add((i, way));
    }
    final conf = model.config[route.uni];
    final name = conf is Map && conf['name'] != null && '${conf['name']}'.isNotEmpty ? '${conf['name']}' : route.uni.toUpperCase();
    runs.add(NavRun(
      mode: 'B',
      key: 'C:${route.key}',
      route: route.code,
      campus: {
        'uni': route.uni,
        'name': name,
        'colour': route.colour,
        'label': route.name,
        'fare': route.fare,
        'fareText': route.fareText,
        'access': route.access,
        'place': [
          for (final k in route.place)
            if (model.stops[k] != null) {'lat': model.stops[k]!.lat, 'lng': model.stops[k]!.lng},
        ],
      },
      towards: nodes[path.last].name,
      nodes: path,
      cum: cum,
      cross: cross,
      at: [for (final s in stops) s.$2],
      shuttle: route,
    ));
  }
  return (runs: runs, config: model.config);
}

String _cellKey(int x, int y) => '$x,$y';

/// `stops` as /api/bus-stops lists them; `rail` is rail.json; `campus`, data/campus/'s files.
NavGraph buildGraph(Map rail, List<Stop> stops, Map<String, RouteService> services, {bool open = false, Map? campus}) {
  final nodes = <NavNode>[];
  final busNode = <String, int>{};
  for (final s in stops) {
    if (s.lat == null || s.lng == null) continue;
    busNode[s.code] = nodes.length;
    nodes.add(NavNode(kind: 'stop', code: s.code, name: s.name, road: s.road, lat: s.lat!, lng: s.lng!));
  }
  final stationNode = <int>[];
  for (final s in (rail['stations'] as List).cast<Map>()) {
    final codes = [for (final c in s['codes'] as List) '$c'];
    nodes.add(NavNode(
      kind: 'station',
      code: codes.join('/'),
      name: '${s['name']}',
      lat: (s['lat'] as num).toDouble(),
      lng: (s['lng'] as num).toDouble(),
      exits: [for (final e in (s['exits'] as List? ?? const [])) [((e as List)[0] as num).toDouble(), (e[1] as num).toDouble()]],
      exitNames: [for (final n in (s['exitNames'] as List? ?? const [])) '${n ?? ''}'],
    ));
    stationNode.add(nodes.length - 1);
  }

  final shuttles = _campusRuns(campus, nodes, busNode);
  final runs = [..._railRuns(rail, nodes, stationNode), ..._busRuns(nodes, busNode, services, open), ...shuttles.runs];
  final at = [for (final _ in nodes) <(int, int)>[]];
  for (final (r, run) in runs.indexed) {
    for (final (i, n) in run.nodes.indexed) {
      at[n].add((r, i));
    }
  }

  final grid = <String, List<int>>{};
  for (final (i, n) in nodes.indexed) {
    (grid[_cellKey((n.lat / _cellDeg).floor(), (n.lng / _cellDeg).floor())] ??= []).add(i);
  }

  // Walks: [node, minutes, metres], from every node to those a short way off.
  final walks = [for (final _ in nodes) <(int, double, double)>[]];
  (int, double, double)? walkBetween(int i, int j, [double? limit]) {
    final a = nodes[i], b = nodes[j];
    if (a.station && b.station) return null;
    final station = a.station ? a : (b.station ? b : null);
    final metres = station != null
        ? (identical(station, a) ? metresTo(a, b.lat, b.lng) : metresTo(b, a.lat, a.lng))
        : haversine(a.lat, a.lng, b.lat, b.lng);
    if (metres > (limit ?? (station != null ? _stationWalkM : _stopWalkM))) return null;
    return (j, metres / walkMPerMin + (station != null ? stationAccessMin : _changeWalkMin), metres);
  }

  for (final (i, a) in nodes.indexed) {
    final cx = (a.lat / _cellDeg).floor(), cy = (a.lng / _cellDeg).floor();
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        for (final j in grid[_cellKey(cx + dx, cy + dy)] ?? const <int>[]) {
          if (j == i) continue;
          final w = walkBetween(i, j);
          if (w != null) walks[i].add(w);
        }
      }
    }
  }

  // Across a hub, further than an ordinary walk. Walks only follow a ride, so this lengthens
  // changes and never the walk to the first stop or from the last.
  final hubs = <String, List<int>>{};
  for (final (i, n) in nodes.indexed) {
    final hub = _hubOf(n);
    if (hub != null) (hubs[hub] ??= []).add(i);
  }
  for (final members in hubs.values) {
    for (final i in members) {
      final already = {for (final w in walks[i]) w.$1};
      for (final j in members) {
        if (j == i || already.contains(j)) continue;
        final w = walkBetween(i, j, _hubWalkM);
        if (w != null) walks[i].add(w);
      }
    }
  }
  return NavGraph(nodes, runs, at, walks, grid, shuttles.config);
}

/// Every node within `metres` of a point, nearest first, as (node, metres).
List<(int, double)> nodesNear(NavGraph g, double lat, double lng, double metres) {
  final reach = (metres / 330).ceil() + 1;
  final cx = (lat / _cellDeg).floor(), cy = (lng / _cellDeg).floor();
  final found = <(int, double)>[];
  for (var dx = -reach; dx <= reach; dx++) {
    for (var dy = -reach; dy <= reach; dy++) {
      for (final i in g.grid[_cellKey(cx + dx, cy + dy)] ?? const <int>[]) {
        final d = metresTo(g.nodes[i], lat, lng);
        if (d <= metres) found.add((i, d));
      }
    }
  }
  return _stable(found, (a, b) => a.$2.compareTo(b.$2));
}

// Dart's sort isn't stable, and JavaScript's is: equals stay in the order they came.
List<T> _stable<T>(List<T> list, int Function(T, T) compare) {
  final indexed = [for (final (i, x) in list.indexed) (i, x)];
  indexed.sort((a, b) {
    final d = compare(a.$2, b.$2);
    return d != 0 ? d : a.$1.compareTo(b.$1);
  });
  return [for (final x in indexed) x.$2];
}

// ---------- the shuttles' rules ----------

const _placeM = 300.0;
const _startGraceMin = 15;

/// Whether `run` may be ridden on a way from `from` to `to`: anything but a shuttle; a paid shuttle
/// only with `paid`; a hotel's or a condo's only from or to it.
bool rideable(NavRun run, NavPoint from, NavPoint to, {bool paid = false}) {
  final c = run.campus;
  if (c == null) return true;
  if (c['fare'] == 'paid' && !paid) return false;
  if (c['access'] != null && c['access'] != '' && c['access'] != 'public') {
    return (c['place'] as List).cast<Map>().any((p) {
      final lat = p['lat'] as double, lng = p['lng'] as double;
      return haversine(lat, lng, from.lat, from.lng) <= _placeM || haversine(lat, lng, to.lat, to.lng) <= _placeM;
    });
  }
  return true;
}

/// The mean wait to board a shuttle at its i-th node at a moment, or null when it isn't running.
double? meanWait(NavRun run, int i, int ms, Map<String, dynamic>? config) {
  final st = Campus.status(run.shuttle!, run.at![i], ms, config ?? const {});
  if (st.state == 'every') return (st.min! + st.max!) / 4;
  if (st.state == 'departs') {
    final gaps = <int>[];
    for (var k = 1; k < st.times.length; k++) {
      gaps.add(st.times[k] - st.times[k - 1]);
    }
    if (gaps.isEmpty) return math.max(0, st.times.first - Campus.sgDay(ms).min).toDouble();
    return gaps.reduce((a, b) => a + b) / gaps.length / 2;
  }
  if (st.state == 'first' || st.state == 'gap') {
    final until = st.at! - Campus.sgDay(ms).min;
    return until <= _startGraceMin ? until + (st.min! + st.max!) / 4 : null;
  }
  return null;
}

// ---------- the router ----------

const _maxVehicles = 4;
const _waitMin = {'B': 5.0, 'T': 3.0};
const _interchangeMin = 3.0;
const _accessM = 900.0;
const _accessStops = 30;
const _accessStations = 5;
const _farAccessM = 3000.0;
const _farAccessStops = 3;
const _farAccessStations = 1;
const _keepFactor = 1.6;
const _keepExtraMin = 12.0;
const _maxOptions = 8;
const _detourMin = 5;
const _walkSavingM = 150;

class NavPoint {
  const NavPoint(this.lat, this.lng);
  final double lat;
  final double lng;
}

class _Crossed {
  const _Crossed(this.c, this.way, this.minutes);
  final int c;
  final String way;
  final num minutes;
}

class _Label {
  _Label(this.t, this.mix, this.node, this.kind, {this.metres = 0, this.run = 0, this.from = 0, this.to = 0, this.prev, this.crossed, this.waited, this.walkFrom = 0});
  final double t;
  final String mix;
  final int node;
  final String kind; // access, ride, walk
  final double metres;
  final int run, from, to;
  final _Label? prev;
  final List<_Crossed>? crossed;
  final double? waited;
  final int walkFrom;
}

class _Onboard {
  _Onboard(this.base, this.from, this.label, this.waited);
  final double base;
  final int from;
  final _Label label;
  final double waited;
}

List<(int, double, double)> _access(NavGraph g, double lat, double lng, void Function(int?) saidFar) {
  var near = nodesNear(g, lat, lng, _accessM);
  final far = near.isEmpty;
  if (far) near = nodesNear(g, lat, lng, _farAccessM);
  final maxStops = far ? _farAccessStops : _accessStops;
  final maxStations = far ? _farAccessStations : _accessStations;
  var stops = 0, stations = 0;
  final out = <(int, double, double)>[];
  for (final (node, metres) in near) {
    final station = g.nodes[node].station;
    if (station ? stations++ >= maxStations : stops++ >= maxStops) continue;
    out.add((node, metres / walkMPerMin + (station ? stationAccessMin : 0), metres));
  }
  saidFar(far && out.isNotEmpty ? out.map((o) => o.$3).reduce(math.min).round() : null);
  return out;
}

Map<String, Object?> _exit(NavNode n, int i) => {'name': i < n.exitNames.length ? n.exitNames[i] : '', 'lat': n.exits[i][0], 'lng': n.exits[i][1]};

/// The exits for a walk from `a` to `b`, each a node or a place.
Map<String, Object?> walkExits(Object? a, Object? b) {
  double latOf(Object? p) => p is NavNode ? p.lat : (p as NavPoint).lat;
  double lngOf(Object? p) => p is NavNode ? p.lng : (p as NavPoint).lng;
  bool has(Object? p) => p is NavNode && p.station && p.exits.isNotEmpty;
  int nearest(NavNode n, double lat, double lng) {
    var best = 0;
    var bestM = double.infinity;
    for (final (i, e) in n.exits.indexed) {
      final m = haversine(e[0], e[1], lat, lng);
      if (m < bestM) {
        best = i;
        bestM = m;
      }
    }
    return best;
  }

  if (has(a) && has(b)) {
    final x = a as NavNode, y = b as NavNode;
    var pair = (0, 0);
    var bestM = double.infinity;
    for (final (i, e) in x.exits.indexed) {
      for (final (j, f) in y.exits.indexed) {
        final m = haversine(e[0], e[1], f[0], f[1]);
        if (m < bestM) {
          pair = (i, j);
          bestM = m;
        }
      }
    }
    return {'fromExit': _exit(x, pair.$1), 'toExit': _exit(y, pair.$2)};
  }
  return {
    if (has(a) && b != null) 'fromExit': _exit(a as NavNode, nearest(a, latOf(b), lngOf(b))),
    if (has(b) && a != null) 'toExit': _exit(b as NavNode, nearest(b, latOf(a), lngOf(a))),
  };
}

// Each option's rides as (run, board index, minutes in when boarded), for runsThroughout.
final _ridesOf = Expando<List<(NavRun, int, double)>>();

typedef OpenCheck = bool Function(NavRun run, int i, double t);

/// Whether every ride on an option is running when it's boarded.
bool runsThroughout(Map<String, dynamic> option, OpenCheck open) => (_ridesOf[option] ?? const []).every((r) => open(r.$1, r.$2, r.$3));

/// The ways from `from` to `to`, at most eight.
List<Map<String, dynamic>> plan(
  NavGraph g,
  NavPoint from,
  NavPoint to, {
  OpenCheck? open,
  num Function(String way, double t)? customs,
  double? Function(NavRun run, int i, double t)? wait,
  bool Function(NavRun run)? ride,
}) {
  List<_Crossed>? held(NavRun run, int fromIndex, int i, double base) {
    if (customs == null || run.cross.isEmpty) return null;
    final passed = run.cross.where((c) => c.$1 > fromIndex && c.$1 <= i).toList();
    if (passed.isEmpty) return null;
    return [for (final c in passed) _Crossed(c.$1, c.$2, customs(c.$2, base + run.cum[c.$1 - 1]))];
  }

  double heldMin(List<_Crossed>? h) => h == null ? 0 : h.fold<double>(0, (a, x) => a + x.minutes);
  int? farFrom, farTo;
  final starts = _access(g, from.lat, from.lng, (f) => farFrom = f);
  final ends = _access(g, to.lat, to.lng, (f) => farTo = f);
  final endAt = <int, (double, double)>{for (final e in ends) e.$1: (e.$2, e.$3)};

  final best = <int, Map<String, _Label>>{};
  bool keep(int node, _Label label) {
    final byMix = best[node] ??= {};
    final old = byMix[label.mix];
    if (old != null && old.t <= label.t) return false;
    byMix[label.mix] = label;
    return true;
  }

  var bound = double.infinity;
  void arrived(int node, _Label label) {
    final end = endAt[node];
    if (end != null) bound = math.min(bound, label.t + end.$1);
  }

  bool worthIt(double t) => t <= bound * _keepFactor + _keepExtraMin;

  Set<String> ridden(_Label label) {
    final keys = <String>{};
    for (_Label? l = label; l != null; l = l.prev) {
      if (l.kind == 'ride') keys.add(g.runs[l.run].key);
    }
    return keys;
  }

  NavRun? lastRide(_Label label) {
    for (_Label? l = label; l != null; l = l.prev) {
      if (l.kind == 'ride') return g.runs[l.run];
    }
    return null;
  }

  var frontier = <int, List<_Label>>{};
  for (final (node, min, metres) in starts) {
    final label = _Label(min, '', node, 'access', metres: metres);
    keep(node, label);
    frontier[node] = [label];
  }

  for (var round = 1; round <= _maxVehicles && frontier.isNotEmpty; round++) {
    final reached = <int, Map<String, _Label>>{};
    final runFrom = <int, int>{};
    for (final node in frontier.keys) {
      for (final (r, i) in g.at[node]) {
        if (!runFrom.containsKey(r) || i < runFrom[r]!) runFrom[r] = i;
      }
    }
    for (final e in runFrom.entries) {
      final r = e.key;
      final run = g.runs[r];
      final onboard = <String, _Onboard>{};
      for (var i = e.value; i < run.nodes.length; i++) {
        final node = run.nodes[i];
        // Getting off here.
        onboard.forEach((mix, on) {
          final crossed = held(run, on.from, i, on.base);
          final t = on.base + run.cum[i] + heldMin(crossed);
          if (!worthIt(t)) return;
          final label = _Label(t, mix + run.mode, node, 'ride', run: r, from: on.from, to: i, prev: on.label, crossed: crossed, waited: on.waited);
          final byMix = reached[node] ??= {};
          final old = byMix[label.mix];
          final known = best[node]?[label.mix];
          if ((old == null || t < old.t) && (known == null || t < known.t)) byMix[label.mix] = label;
        });
        // Getting on here.
        for (final label in frontier[node] ?? const <_Label>[]) {
          if (ridden(label).contains(run.key)) continue;
          if (ride != null && !ride(run)) continue;
          final last = lastRide(label);
          final waited = run.campus != null && wait != null ? wait(run, i, label.t) : _waitMin[run.mode];
          if (waited == null) continue;
          var t = label.t + waited;
          if (last != null && last.mode == 'T' && run.mode == 'T') t += _interchangeMin;
          if (open != null && !open(run, i, t)) continue;
          final base = t - run.cum[i];
          final on = onboard[label.mix];
          if (on == null || base < on.base) onboard[label.mix] = _Onboard(base, i, label, waited);
        }
      }
    }

    final next = <int, List<_Label>>{};
    void add(int node, _Label label) {
      if (!keep(node, label)) return;
      arrived(node, label);
      (next[node] ??= []).add(label);
    }

    reached.forEach((node, byMix) {
      for (final label in byMix.values) {
        add(node, label);
      }
    });
    // The nodes reached by a ride so far. A walk that adds to one of these is walked on from in
    // its turn, as the site's does: the labels are read by index, as they grow.
    for (final (node, labels) in [for (final e in next.entries) (e.key, e.value)]) {
      for (var n = 0; n < labels.length; n++) {
        final label = labels[n];
        for (final (other, min, metres) in g.walks[node]) {
          final t = label.t + min;
          if (worthIt(t)) add(other, _Label(t, label.mix, other, 'walk', walkFrom: node, metres: metres, prev: label));
        }
      }
    }
    frontier = next;
  }

  final byMix = <String, ({double total, _Label label, (double, double) end})>{};
  endAt.forEach((node, end) {
    (best[node] ?? const <String, _Label>{}).forEach((mix, label) {
      if (mix.isEmpty) return;
      final total = label.t + end.$1;
      final old = byMix[mix];
      if (old == null || total < old.total) byMix[mix] = (total: total, label: label, end: end);
    });
  });

  final options = [for (final o in byMix.values) _toOption(g, o.total, o.label, o.end, from, to)];
  if (farFrom != null || farTo != null) {
    final far = {'from': ?farFrom, 'to': ?farTo};
    for (final o in options) {
      o['far'] = far;
    }
  }
  return _choose(options, haversine(from.lat, from.lng, to.lat, to.lng));
}

Map<String, dynamic> _toOption(NavGraph g, double total, _Label label, (double, double) end, NavPoint from, NavPoint to) {
  final chain = <_Label>[];
  for (_Label? l = label; l != null; l = l.prev) {
    chain.insert(0, l);
  }
  final legs = <Map<String, dynamic>>[];
  final rides = <(NavRun, int, double)>[];
  for (final l in chain) {
    final node = g.nodes[l.node];
    if (l.kind == 'access') {
      legs.add({'mode': 'walk', 'metres': l.metres.round(), 'minutes': l.t, 'to': node.ref, ...walkExits(from, node)});
    } else if (l.kind == 'walk') {
      final was = g.nodes[l.walkFrom];
      legs.add({'mode': 'walk', 'metres': l.metres.round(), 'minutes': l.t - l.prev!.t, 'from': was.ref, 'to': node.ref, ...walkExits(was, node)});
    } else {
      final run = g.runs[l.run];
      final minutes = run.cum[l.to] - run.cum[l.from] + (l.crossed ?? const <_Crossed>[]).fold<double>(0, (a, x) => a + x.minutes);
      final path = run.nodes.sublist(l.from, l.to + 1);
      final leg = <String, dynamic>{
        'mode': run.mode == 'B' ? 'bus' : 'train',
        'route': run.route,
        'towards': run.towards,
        'from': g.nodes[run.nodes[l.from]].ref,
        'to': g.nodes[run.nodes[l.to]].ref,
        'stops': l.to - l.from,
        'minutes': minutes,
        'wait': (l.waited ?? _waitMin[run.mode]!).round(),
        'board': l.t - minutes,
        if (l.crossed != null)
          'customs': [
            for (final x in l.crossed!) {'way': x.way, 'from': g.nodes[run.nodes[x.c - 1]].code, 'to': g.nodes[run.nodes[x.c]].code, 'minutes': x.minutes},
          ],
        'path': [for (final n in path) [g.nodes[n].lat, g.nodes[n].lng]],
        'names': [for (final n in path) g.nodes[n].name],
      };
      if (run.mode == 'B') {
        leg['dir'] = run.dir;
        leg['codes'] = [for (final n in path) g.nodes[n].code];
      }
      if (run.campus != null) {
        leg['campus'] = run.campus;
      } else {
        leg['name'] = run.name;
        leg['color'] = run.color;
        leg['lrt'] = run.lrt;
      }
      legs.add(leg);
      rides.add((run, l.from, (leg['board'] as double)));
    }
  }
  legs.add({'mode': 'walk', 'metres': end.$2.round(), 'minutes': end.$1, 'to': {'kind': 'place'}, ...walkExits(g.nodes[label.node], to)});

  final kept = legs.where((l) => l['mode'] != 'walk' || (l['metres'] as int) >= 20).toList();
  final riddenLegs = kept.where((l) => l['mode'] != 'walk').toList();
  final option = <String, dynamic>{
    'minutes': total.round(),
    'mix': riddenLegs.map((l) => l['mode'] == 'bus' ? 'B' : 'T').join(),
    'routes': [for (final l in riddenLegs) l['route']],
    'legs': kept,
  };
  _ridesOf[option] = rides;
  return option;
}

int _walkOf(Map<String, dynamic> o) => (o['legs'] as List).cast<Map>().where((l) => l['mode'] == 'walk').fold(0, (a, l) => a + ((l['metres'] as int?) ?? 0));

List<Map<String, dynamic>> _choose(List<Map<String, dynamic>> options, double walkMetres) {
  final walkMin = (walkMetres / walkMPerMin).round();
  final walk = walkMetres <= 2000
      ? <String, dynamic>{
          'minutes': walkMin,
          'mix': '',
          'routes': <String>[],
          'walkOnly': true,
          'legs': [
            {'mode': 'walk', 'metres': walkMetres.round(), 'minutes': walkMin, 'to': {'kind': 'place'}},
          ],
        }
      : null;
  final all = _stable(walk != null ? [...options, walk] : options, (a, b) => (a['minutes'] as int).compareTo(b['minutes'] as int));
  if (all.isEmpty) return all;
  final fastest = all.first['minutes'] as int;
  final limit = walk != null && identical(walk, all.first) ? walkMin + 10.0 : fastest * _keepFactor + _keepExtraMin;
  final shown = all.where((o) => (o['minutes'] as int) <= limit).toList();
  String kind(Map<String, dynamic> o) {
    if (o['walkOnly'] == true) return 'walk';
    final mix = o['mix'] as String;
    return RegExp(r'^T+$').hasMatch(mix) ? 'train' : RegExp(r'^B+$').hasMatch(mix) ? 'bus' : 'mixed';
  }

  int changes(Map<String, dynamic> o) => math.max(0, (o['routes'] as List).length - 1);
  bool detour(Map<String, dynamic> o) => shown.any((p) {
        if (identical(p, o) || kind(p) != kind(o)) return false;
        return (p['minutes'] as int) + _detourMin <= (o['minutes'] as int) && changes(p) <= changes(o) && _walkOf(p) <= _walkOf(o) + _walkSavingM;
      });
  return shown.where((o) => !detour(o)).take(_maxOptions).toList();
}

// ---------- for a time ----------

const _guessMin = 60;

OpenCheck _openFrom(int startMs, Map<String, dynamic>? config) => (run, i, t) {
      final ms = (startMs + t * 60000).truncate();
      if (run.campus != null) return meanWait(run, i, ms, config) != null;
      return run.mode == 'T' ? When.trainRunsAt(ms) : When.busRunsAt(run.times != null && i < run.times!.length ? run.times![i] : null, ms);
    };

double? Function(NavRun, int, double) _waitFrom(int startMs, Map<String, dynamic>? config) => (run, i, t) => meanWait(run, i, (startMs + t * 60000).truncate(), config);

num Function(String, double) _customsFrom(int startMs, int? own) => (way, t) => own ?? When.customsMin(way, (startMs + t * 60000).truncate());

class NavAt {
  const NavAt(this.mode, this.ms);
  final String mode; // now, leave, arrive
  final int ms;
}

({List<Map<String, dynamic>> options, int setOff}) planFor(NavGraph g, NavPoint from, NavPoint to, NavAt when, int? own, {bool paid = false}) {
  final c = g.campusConfig;
  bool ride(NavRun run) => rideable(run, from, to, paid: paid);
  if (when.mode != 'arrive') {
    return (options: plan(g, from, to, open: _openFrom(when.ms, c), customs: _customsFrom(when.ms, own), wait: _waitFrom(when.ms, c), ride: ride), setOff: when.ms);
  }
  final guess = when.ms - _guessMin * 60000;
  final first = plan(g, from, to, customs: _customsFrom(guess, own), wait: _waitFrom(guess, c), ride: ride);
  final lead = first.isEmpty ? _guessMin : first.first['minutes'] as int;
  final start = when.ms - lead * 60000;
  final options = plan(g, from, to, open: _openFrom(start, c), customs: _customsFrom(start, own), wait: _waitFrom(start, c), ride: ride)
      .where((o) => runsThroughout(o, _openFrom(when.ms - (o['minutes'] as int) * 60000, c)))
      .toList();
  return (options: options, setOff: when.ms - (options.isEmpty ? lead : options.first['minutes'] as int) * 60000);
}

List<Map<String, dynamic>> _joinWays(List<Map<String, dynamic>> firsts, List<Map<String, dynamic>> seconds, NavPoint via, bool Function(Map<String, dynamic>, Map<String, dynamic>) fits) {
  const each = 3;
  final joined = <Map<String, dynamic>>[];
  for (final a in firsts.take(each)) {
    for (final b in seconds.take(each)) {
      if (fits(a, b)) joined.add(_join(a, b, via));
    }
  }
  final sorted = _stable(joined, (a, b) => (a['minutes'] as int).compareTo(b['minutes'] as int));
  if (sorted.isEmpty) return sorted;
  final fastest = sorted.first['minutes'] as int;
  return sorted.where((o) => (o['minutes'] as int) <= fastest * _keepFactor + _keepExtraMin).take(_maxOptions).toList();
}

Map<String, dynamic> _join(Map<String, dynamic> a, Map<String, dynamic> b, NavPoint via) {
  final at = <String, Object?>{'kind': 'place', 'via': true, 'lat': via.lat, 'lng': via.lng};
  final first = [for (final l in (a['legs'] as List).cast<Map<String, dynamic>>()) Map<String, dynamic>.of(l)];
  final second = [
    for (final l in (b['legs'] as List).cast<Map<String, dynamic>>())
      l['board'] == null ? Map<String, dynamic>.of(l) : {...l, 'board': (l['board'] as num) + (a['minutes'] as int)},
  ];
  if (first.isNotEmpty && first.last['mode'] == 'walk') first.last['to'] = at;
  if (second.isNotEmpty && second.first['mode'] == 'walk' && second.first['from'] == null) second.first['from'] = at;
  final option = <String, dynamic>{
    'minutes': (a['minutes'] as int) + (b['minutes'] as int),
    'mix': '${a['mix']}${b['mix']}',
    'routes': [...a['routes'] as List, ...b['routes'] as List],
    'legs': [...first, ...second],
    'via': {'leg': first.length, 'minutes': a['minutes']},
  };
  if (a['walkOnly'] == true && b['walkOnly'] == true) option['walkOnly'] = true;
  final farFrom = (a['far'] as Map?)?['from'], farTo = (b['far'] as Map?)?['to'];
  if (farFrom != null || farTo != null) option['far'] = {'from': ?farFrom, 'to': ?farTo};
  return option;
}

/// The ways in the shape /api/nav answers them, each marked `offline`.
List<Map<String, dynamic>> planOnPhone(NavGraph g, NavPoint from, NavPoint to, {NavPoint? via, required NavAt when, int? customs, bool paid = false}) {
  final own = const [15, 30, 45, 60].contains(customs) ? customs : null;
  List<Map<String, dynamic>> options;
  if (via == null) {
    options = planFor(g, from, to, when, own, paid: paid).options;
  } else if (when.mode != 'arrive') {
    final first = planFor(g, from, via, when, own, paid: paid);
    final lead = first.options.isEmpty ? 0 : first.options.first['minutes'] as int;
    final second = planFor(g, via, to, NavAt('leave', when.ms + lead * 60000), own, paid: paid);
    options = _joinWays(first.options, second.options, via, (a, b) => runsThroughout(b, _openFrom(when.ms + (a['minutes'] as int) * 60000, g.campusConfig)));
  } else {
    final second = planFor(g, via, to, when, own, paid: paid);
    final first = planFor(g, from, via, NavAt('arrive', second.setOff), own, paid: paid);
    options = _joinWays(first.options, second.options, via, (a, b) {
      final am = a['minutes'] as int, bm = b['minutes'] as int;
      return runsThroughout(a, _openFrom(when.ms - (am + bm) * 60000, g.campusConfig)) && runsThroughout(b, _openFrom(when.ms - bm * 60000, g.campusConfig));
    });
  }
  for (final o in options) {
    o['offline'] = true;
  }
  return options;
}
