// The phone's planner (lib/data/nav_core.dart) against the site's own (main-site/js/nav-core/): the
// same graph and the same ways from the same data, for every kind of journey: buses and trains, the
// Causeway, shuttles, Leave at, Arrive by, a stop on the way, and in the night when nothing's running.
// test/fixtures/nav-core-expected.json is what the site's says: node tool/nav_core_expected.mjs.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/nav_core.dart';
import 'package:sgbus_timings/data/nav_offline.dart';
import 'package:sgbus_timings/data/stops.dart';

Object? _gz(String name) => jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/$name.json.gz').readAsBytesSync())));
Object? _site(String name) => jsonDecode(File('../main-site/data/$name.json').readAsStringSync());

double _round(num n) => (n * 1000).round() / 1000;

// Two buses over the same stops in the same minutes are a true tie, settled by rounding in the last
// digit of a sine, which differs between Node and a phone's maths library. Either's right: the bus
// number and what goes with it are taken from the site's, and everything else must still match.
Object? _sameBarTies(List got, List want) {
  final out = jsonDecode(jsonEncode(got)) as List;
  for (var i = 0; i < out.length && i < want.length; i++) {
    final a = out[i] as Map, b = want[i] as Map;
    final al = a['legs'] as List, bl = b['legs'] as List;
    for (var k = 0; k < al.length && k < bl.length; k++) {
      final x = al[k] as Map, y = bl[k] as Map;
      const same = ['mode', 'from', 'to', 'stops', 'minutes', 'board', 'wait'];
      if (x['mode'] == 'bus' && x['route'] != y['route'] && same.every((f) => x[f] == y[f])) {
        for (final f in const ['route', 'towards', 'codes', 'names']) {
          x[f] = y[f];
        }
      }
    }
    a['routes'] = [for (final l in al.cast<Map>()) if (l['mode'] != 'walk') l['route']];
  }
  return out;
}

Map<String, Object?> _shape(Map<String, dynamic> o) => {
      'minutes': o['minutes'],
      'mix': o['mix'],
      'routes': o['routes'],
      'walkOnly': o['walkOnly'] == true,
      'far': o['far'],
      'via': o['via'] == null ? null : {'leg': (o['via'] as Map)['leg'], 'minutes': (o['via'] as Map)['minutes']},
      'legs': [
        for (final l in (o['legs'] as List).cast<Map>())
          {
            'mode': l['mode'],
            'route': l['route'],
            'metres': l['metres'],
            'minutes': _round(l['minutes'] as num),
            'board': l['board'] == null ? null : _round(l['board'] as num),
            'wait': l['wait'],
            'stops': l['stops'],
            'towards': l['towards'],
            'from': (l['from'] as Map?)?['code'],
            'to': (l['to'] as Map?)?['code'],
            'fromExit': (l['fromExit'] as Map?)?['name'],
            'toExit': (l['toExit'] as Map?)?['name'],
            'codes': l['codes'],
            'names': (l['names'] as List?)?.length,
            'customs': l['customs'],
            'campus': (l['campus'] as Map?)?['name'],
          },
      ],
    };

void main() {
  final want = jsonDecode(File('test/fixtures/nav-core-expected.json').readAsStringSync()) as Map;
  final points = want['points'] as Map;
  NavPoint p(String name) => NavPoint(((points[name] as Map)['lat'] as num).toDouble(), ((points[name] as Map)['lng'] as num).toDouble());
  int ms(String at) => DateTime.parse('$at:00+08:00').millisecondsSinceEpoch;

  late NavGraph graph;
  late List<Stop> stops;
  late Map<String, RouteService> routes;
  late Map rail;
  late Map campus;

  setUpAll(() {
    stops = [
      for (final r in (_gz('bus-stops') as List).cast<Map>())
        Stop('${r['c']}', '${r['n']}', '${r['r'] ?? ''}', (r['la'] as num?)?.toDouble(), (r['lo'] as num?)?.toDouble()),
    ];
    routes = NavOffline.servicesOf((_gz('bus-routes') as Map).cast<String, dynamic>());
    rail = _site('rail') as Map;
    campus = {for (final f in ['nus', 'ntu', 'config', 'shuttles']) f: _site('campus/$f')};
    graph = buildGraph(rail, stops, routes, campus: campus);
  });

  test('the same graph', () {
    final g = want['graph'] as Map;
    expect(graph.nodes.length, g['nodes']);
    expect(graph.runs.length, g['runs']);
    expect(graph.walks.fold<int>(0, (n, w) => n + w.length), g['walks']);
  });

  test('the same graph with Restricted areas on', () {
    final open = buildGraph(rail, stops, routes, campus: campus, open: true);
    expect(open.nodes.length, (want['openGraph'] as Map)['nodes']);
    expect(open.runs.length, (want['openGraph'] as Map)['runs']);
  });

  for (final c in (want['cases'] as List).cast<Map>()) {
    test('${c['from']} to ${c['to']}, ${c['mode']} ${c['at']}', () {
      final got = planFor(graph, p('${c['from']}'), p('${c['to']}'), NavAt('${c['mode']}', ms('${c['at']}')), null).options.map(_shape).toList();
      expect(_sameBarTies(got, c['options'] as List), c['options']);
    });
  }

  test('paid shuttles, with Free and paid on', () {
    final got = planFor(graph, p('nus'), p('ntu'), NavAt('now', ms('2026-10-30T10:00')), null, paid: true).options.map(_shape).toList();
    expect(_sameBarTies(got, want['paid'] as List), want['paid']);
  });

  test('your own immigration time', () {
    final got = planFor(graph, p('woodlands'), p('jb'), NavAt('now', ms('2026-10-30T18:30')), 45).options.map(_shape).toList();
    expect(_sameBarTies(got, want['ownCustoms'] as List), want['ownCustoms']);
  });

  for (final c in (want['via'] as List).cast<Map>()) {
    test('${c['from']} by ${c['via']} to ${c['to']}, ${c['mode']} ${c['at']}', () {
      final got = planOnPhone(graph, p('${c['from']}'), p('${c['to']}'), via: p('${c['via']}'), when: NavAt('${c['mode']}', ms('${c['at']}'))).map(_shape).toList();
      expect(_sameBarTies(got, c['options'] as List), c['options']);
    });
  }

  test('every way is marked as planned offline', () {
    final got = planOnPhone(graph, p('bedok'), p('raffles'), when: NavAt('now', ms('2026-10-30T08:30')));
    expect(got, isNotEmpty);
    expect(got.every((o) => o['offline'] == true), isTrue);
  });

  test('it plans in the time a phone can wait', () {
    final clock = Stopwatch()..start();
    buildGraph(rail, stops, routes, campus: campus);
    final built = clock.elapsedMilliseconds;
    clock.reset();
    planOnPhone(graph, p('jurong'), p('punggol'), when: NavAt('now', ms('2026-10-30T18:15')));
    // ignore: avoid_print
    print('graph built in ${built}ms, planned in ${clock.elapsedMilliseconds}ms');
    expect(clock.elapsedMilliseconds, lessThan(5000));
  });
}
