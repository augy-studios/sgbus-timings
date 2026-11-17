// What the shared screens leave out or change in the desktop app, where a phone's parts can't
// work: the Edge Tray's and the rail's extras (lib/app/edge_tray.dart: no SimplyGo, no phone-only
// extras in Settings' Edge Tray buttons, and the guide's desktop page), and Explorer's tour without
// its compass step (lib/features/tour/tour.dart), as a computer has no compass.
// `Native.fake(['desktop'], ...)` stands in for the desktop app's bridge host.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/edge_tray.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/tour/tour.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

/// The extra with this id.
TrayExtra _extra(String id) => EdgeTray.extras.firstWhere((e) => e.id == id);

/// Stands in for the desktop app's bridge host, with only the features it lists.
void _desktop() => Native.fake(['push', 'notify', 'releases', 'glance', 'widgets', 'desktop'], (plugin, method, options) async => <String, dynamic>{});

/// Stands in for a phone with every phone-only extra's feature.
void _phone() => Native.fake(['nearstops', 'routines', 'card', 'sharenearby'], (plugin, method, options) async => <String, dynamic>{});

void main() {
  setUp(() => Store.memory({}));
  tearDown(() => Native.fake(const [], null));

  group('the Edge Tray and the rail', () {
    test("SimplyGo shows on a phone, but not on the desktop, where there's no SimplyGo app", () {
      _phone();
      expect(_extra('simplygo').when!(), isTrue);
      _desktop();
      expect(_extra('simplygo').when!(), isFalse);
    });

    test("the phone-only extras don't show on the desktop", () {
      _desktop();
      for (final id in EdgeTray.phoneFeature.keys) {
        expect(_extra(id).when!(), isFalse, reason: id);
      }
    });

    test("the Guide opens the guide's desktop page on the desktop, and its Android overview on a phone", () {
      _phone();
      expect(EdgeTray.guideUrl, 'https://guide.sgbus.uwuapps.org/android/overview');
      _desktop();
      expect(EdgeTray.guideUrl, 'https://guide.sgbus.uwuapps.org/desktop/overview');
    });
  });

  group("Settings' Edge Tray buttons", () {
    test('on a phone, every extra is offered, as before', () {
      Native.fake(const [], null);
      for (final e in EdgeTray.extras) {
        expect(EdgeTray.offered(e.id), isTrue, reason: e.id);
      }
    });

    test('on the desktop, not SimplyGo nor the phone-only extras; the rest are', () {
      _desktop();
      for (final id in ['simplygo', 'nearstops', 'routines', 'card', 'receive']) {
        expect(EdgeTray.offered(id), isFalse, reason: id);
      }
      for (final id in ['explorer', 'coins', 'telegram', 'coffee', 'guide']) {
        expect(EdgeTray.offered(id), isTrue, reason: id);
      }
    });
  });

  group("Explorer's tour", () {
    final compass = Tours.steps['explorer']!.firstWhere((s) => s.target == 'map.compass');
    final layers = Tours.steps['explorer']!.firstWhere((s) => s.target == 'map.layers');

    test('without a compass (a computer), its compass step is left out, and only that', () {
      expect(Tours.applies(compass, hasCompass: false), isFalse);
      expect(Tours.applies(layers, hasCompass: false), isTrue);
    });

    test('with a compass (a phone), it stays', () {
      expect(Tours.applies(compass, hasCompass: true), isTrue);
    });
  });
}
