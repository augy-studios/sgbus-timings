// The tray countdown's words (lib/desktop/glance.dart), as the Electron app's glance.js wrote
// them: the stop's name then a line a bus, soonest first, cut to Windows' 127 characters with
// "…"; the macOS menu-bar text and Dock badge; and the tray menu's line.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/desktop/glance.dart';
import 'package:sgbus_timings/desktop/settings.dart';

/// A bus in /api/bus-arrivals' answer, its next two coming in [next] and [then] minutes.
Map<String, Object?> _bus(String no, double? next, [double? then]) => {
      'serviceNo': no,
      'next': next == null ? null : {'eta_ms': next * 60000},
      'next2': then == null ? null : {'eta_ms': then * 60000},
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const stop = {'code': '84009', 'name': 'Bedok Int', 'service': null};

  test('the name, then a line a bus, soonest first, with "Arr" for one arriving', () {
    final d = Glance.describe(stop, [_bus('12', 14, 25), _bus('2', 3), _bus('65', .5, 9)]);
    expect(d.tip, 'Bedok Int\n65: Arr, 9 min\n2: 3 min\n12: 14 min, 25 min');
    expect(d.title, ' 65 · Arr');
    expect(d.badge, 'Arr');
  });

  test('the Dock badge is the soonest minutes', () {
    final d = Glance.describe(stop, [_bus('12', 14), _bus('2', 3.9)]);
    expect(d.title, ' 2 · 3 min');
    expect(d.badge, '3');
  });

  test('narrowed to one bus, only that bus', () {
    final d = Glance.describe({...stop, 'service': '12'}, [_bus('12', 14), _bus('2', 3)]);
    expect(d.tip, 'Bedok Int\n12: 14 min');
  });

  test('buses with no estimate are left out, and with none due it says so', () {
    final d = Glance.describe(stop, [_bus('12', null), _bus('2', null)]);
    expect(d.tip, 'Bedok Int\nNo buses due right now');
    expect(d.title, isNull);
    expect(d.badge, isNull);
  });

  test('a stop with no name goes by its code', () {
    expect(Glance.describe({'code': '84009', 'name': ''}, const []).tip, '84009\nNo buses due right now');
  });

  test('cut to 127 characters with "…" on Windows', () {
    final many = [for (var i = 1; i <= 20; i++) _bus('$i', i.toDouble(), i + 10.0)];
    final tip = Glance.describe(stop, many).tip;
    expect(tip.length, Glance.tipMax);
    expect(tip, endsWith('…'));
    expect(tip, startsWith('Bedok Int\n1: 1 min, 11 min\n2: 2 min'));
  });

  test('a tooltip that fits is left whole', () {
    final name = 'N' * (Glance.tipMax - '\nNo buses due right now'.length);
    final tip = Glance.describe({'code': '84009', 'name': name}, const []).tip;
    expect(tip.length, Glance.tipMax);
    expect(tip, isNot(endsWith('…')));
  });

  test("couldn't get the timings: said with the stop's name, cut to 127", () {
    expect(Glance.failedTip(stop), "Bedok Int: couldn't get the timings just now");
    expect(Glance.failedTip({'code': '84009', 'name': 'B' * 200}).length, Glance.tipMax);
  });

  test('minutes: whole minutes, never below 0, null with no estimate', () {
    expect(Glance.minutes({'eta_ms': 179999}), 2);
    expect(Glance.minutes({'eta_ms': -30000}), 0);
    expect(Glance.minutes({'eta_ms': null}), isNull);
    expect(Glance.minutes(null), isNull);
  });

  test('a favourite on the Jump List and Dock menu', () {
    expect(Glance.label({'code': '84009', 'name': 'Bedok Int'}), 'Bedok Int (84009)');
    expect(Glance.label({'code': '84009', 'name': ''}), 'Stop 84009');
  });

  group('kept in settings.json', () {
    late Directory dir;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('sgbus-glance-');
      DeskSettings.override = dir.path;
      // The countdown fetches as soon as it's set: answered here, never the network.
      Api.fake = (path) async => {'services': [_bus('12', 4)]};
    });
    tearDown(() {
      Glance.setStop(null);
      Api.fake = null;
      DeskSettings.override = null;
      dir.deleteSync(recursive: true);
    });

    test('the tray menu names the stop, and the bus if it was narrowed to one', () {
      expect(Glance.menuLabel(), isNull);
      DeskSettings.write({'trayStop': stop});
      expect(Glance.menuLabel(), 'Tray countdown: Bedok Int');
      DeskSettings.write({'trayStop': {...stop, 'service': '12'}});
      expect(Glance.menuLabel(), 'Tray countdown: 12 at Bedok Int');
    });

    test("setStop keeps a tidy copy, and nothing for a stop that isn't one", () {
      final kept = Glance.setStop({'code': '84009', 'name': 'B' * 80, 'service': '12e'});
      expect(kept, {'code': '84009', 'name': 'B' * 60, 'service': '12E'});
      expect(DeskSettings.get<Map<String, dynamic>>('trayStop'), kept);
      expect(Glance.setStop({'code': 'Bedok'}), isNull);
      expect(DeskSettings.read()['trayStop'], isNull);
    });

    test('favourites: the first 10 with a proper stop code, kept', () {
      Glance.setFavourites([
        {'code': 'nope', 'name': 'Not a stop'},
        for (var i = 0; i < 12; i++) {'code': '${10000 + i}', 'name': 'Stop $i'},
      ]);
      final kept = DeskSettings.get<List>('favourites')!;
      expect(kept, hasLength(10));
      expect(kept.first, {'code': '10000', 'name': 'Stop 0'});
    });
  });
}
