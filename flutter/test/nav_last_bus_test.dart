// Navigate and buses gone for the day (bug report 20261113-M8K5): a way planned while 96A ran
// (weekdays 08:05 to 09:35 from Clementi Int), opened again in the afternoon, says it's finished;
// and going back to Navigate from a trip doesn't fall back to that way.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/network.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/i18n/i18n.dart';

Object? _gz(String n) => jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/$n.json.gz').readAsBytesSync())));

/// The way from the report: 222 to Bedok, the East-West Line to Clementi, then 96A.
Map<String, dynamic> _way() => {
      'minutes': 80,
      'legs': [
        {'mode': 'walk', 'minutes': 4},
        {'mode': 'bus', 'route': '222', 'minutes': 10, 'wait': 3, 'from': {'code': '84231', 'name': 'BLK 85'}, 'to': {'code': '84039', 'name': 'BEDOK STN EXIT A'}},
        {'mode': 'walk', 'minutes': 3},
        {'mode': 'train', 'route': 'EW', 'minutes': 39},
        {'mode': 'walk', 'minutes': 3},
        {'mode': 'bus', 'route': '96A', 'minutes': 8, 'wait': 5, 'from': {'code': '17009', 'name': 'CLEMENTI INT'}, 'to': {'code': '16159', 'name': 'COLL OF DESIGN & ENGRG'}},
        {'mode': 'walk', 'minutes': 7},
      ],
    };

// Singapore's time on a weekday, Thursday 12 November 2026.
int _sg(int h, int m) => DateTime.utc(2026, 11, 12, h - 8, m).millisecondsSinceEpoch;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    Store.memory();
    await I18n.I.use('en', remember: false);
    BusNet.index(Map<String, dynamic>.from(_gz('bus-routes') as Map));
  });
  tearDown(() => When.now = DateTime.now);

  test('in the morning, every bus of the way runs', () {
    // Off at 08:20: Clementi Int reached about 09:22, before 96A's last at 09:35.
    expect(wayStopped(_way(), _sg(8, 20)), isNull);
  });

  test('in the afternoon, 96A has finished, with its last bus there', () {
    final s = wayStopped(_way(), _sg(14, 45))!;
    expect(s.route, '96A');
    expect(s.stop, 'CLEMENTI INT');
    expect(s.last, '09:35');
    expect(wayStoppedText(s), '96A has finished for today: the last one from CLEMENTI INT was at 09:35. Pick another way from All ways.');
  });

  test('reached after its last bus, even on the same morning', () {
    // Off at 08:40: Clementi Int about 09:42, after 09:35.
    expect(wayStopped(_way(), _sg(8, 40))?.route, '96A');
  });

  test('a weekend: 96A runs on weekdays only', () {
    // Saturday 14 November, 08:20.
    expect(wayStopped(_way(), DateTime.utc(2026, 11, 14, 0, 20).millisecondsSinceEpoch)?.route, '96A');
  });

  test('a plan to leave now is stale after ten minutes; one for a picked time never', () {
    final n = NavState.I
      ..when = null
      ..plannedAt = 0;
    When.now = () => DateTime.fromMillisecondsSinceEpoch(_sg(14, 45), isUtc: true);
    expect(n.stale, isFalse, reason: 'nothing planned yet');
    n.plannedAt = _sg(14, 40);
    expect(n.stale, isFalse);
    n.plannedAt = _sg(9, 0);
    expect(n.stale, isTrue);
    n.when = WhenPick.fromJson({'mode': 'leave', 'at': '2026-11-12T09:00'});
    expect(n.stale, isFalse);
    n
      ..when = null
      ..plannedAt = 0;
  });
}
