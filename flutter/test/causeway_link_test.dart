// Causeway Link's cross-border buses (bug report 20261110-W4H2): in Bus timings at the stops they
// serve, from shuttles.json, but kept out of Navigate (`navigate`: false), as the site's are.
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

  setUpAll(() async {
    Store.memory();
    await I18n.I.use('en', remember: false);
    Stops.useRows(jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/bus-stops.json.gz').readAsBytesSync()))) as List);
    Campus.use({for (final f in ['nus', 'ntu', 'config', 'shuttles']) f: _json('../main-site/data/campus/$f.json')});
  });

  test('every CW route both ways, at its Singapore stop, out of Navigate', () {
    final m = Campus.model!;
    final cw = [for (final r in m.routes) if (r.uni == 'causewaylink') r];
    expect(cw.map((r) => r.code).toSet(), {'CW1', 'CW2', 'CW3', 'CW4', 'CW4S', 'CW5', 'CW6', 'CW7'});
    expect(cw, hasLength(16));
    expect(cw.every((r) => !r.navigate && r.fare == 'paid'), isTrue);
    expect(m.routes.where((r) => r.uni != 'causewaylink').every((r) => r.navigate), isTrue, reason: 'the other shuttles stay in Navigate');
    Set<String> at(String key) => {for (final x in m.stops[key]!.routes) x.route.code};
    expect(at('29009'), containsAll(['CW3', 'CW4', 'CW4S']));
    expect(at('45139'), {'CW1'});
    expect(at('01109'), {'CW2'});
    expect(at('25421'), {'CW7'});
    expect(at('cwl-newton'), {'CW5'});
    expect(at('cwl-boonlay'), {'CW6'});
  });
}
