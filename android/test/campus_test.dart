// The shuttle buses (data/campus.dart) against the site's own js/campus.js: the same stops and
// routes from the same files, and the same words at every stop of every route at moments that
// cover term and vacation, weekdays, weekends, a public holiday and its eve, before the first
// bus and after the last. test/fixtures/campus-expected.json is what campus.js says, made in
// Node from main-site/js/campus.js and js/when.js with the same stop list.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/campus.dart';
import 'package:sgbus_timings/data/stops.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/i18n/i18n.dart';

Object? _json(String path) => jsonDecode(File(path).readAsStringSync());

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final want = _json('test/fixtures/campus-expected.json') as Map;

  setUpAll(() async {
    Store.memory();
    await I18n.I.use('en', remember: false);
    Stops.useRows(jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/bus-stops.json.gz').readAsBytesSync()))) as List);
    Campus.use({for (final f in ['nus', 'ntu', 'config', 'shuttles']) f: _json('../main-site/data/campus/$f.json')});
  });

  test('the same stops and routes', () {
    final m = Campus.model!;
    expect(m.problems, isEmpty);
    expect(m.stops.keys.toList()..sort(), want['stops']);
    expect([for (final s in m.stops.values) if (s.lta) s.key]..sort(), want['lta']);
    expect([for (final r in m.routes) r.key], want['routes']);
  });

  test('the same words, at every stop at every moment', () {
    final says = Map<String, Object?>.from(want['says'] as Map);
    var n = 0;
    says.forEach((k, v) {
      final [at, key, i] = k.split('|');
      final ms = DateTime.parse('$at:00+08:00').millisecondsSinceEpoch;
      final r = Campus.route(key)!;
      final d = Campus.describe(Campus.status(r, int.parse(i), ms), Campus.nameIn(r));
      expect('${d.main} / ${d.sub}', v, reason: k);
      n++;
    });
    expect(n, greaterThan(1000));
  });

  test('search and roads', () {
    (want['search'] as Map).forEach((q, v) {
      final s = Campus.search('$q');
      expect([...s.routes.map((r) => r.key), ...s.stops.map((x) => x.key)], v, reason: '$q');
    });
    (want['roadKeys'] as Map).forEach((key, v) {
      final l = Campus.lines().firstWhere((l) => l.key == key);
      expect(Campus.roadKey(l.points), v, reason: '$key');
    });
  });
}
