// The desktop's answers to the shared screens (lib/desktop/host.dart): where a link goes
// (desktop-features-spec §11: the site's own pages in the app, web pages and mailto: outside it,
// and nothing else at all, as some links come from the server); the tray countdown, a Bus timings
// widget and full screen, each checked before anything changes; and full screen putting the
// window back as it was when the departures board closes.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/desktop/chrome.dart';
import 'package:sgbus_timings/desktop/glance.dart';
import 'package:sgbus_timings/desktop/host.dart';
import 'package:sgbus_timings/desktop/settings.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

/// A NativeError with the code 'invalid', as a call that isn't the right shape throws.
final _invalid = throwsA(isA<NativeError>().having((e) => e.code, 'code', 'invalid'));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test("the site's # addresses and short links open in the app", () {
    expect(DesktopHost.opensInApp('https://sgbus.uwuapps.org/#84009'), isTrue);
    expect(DesktopHost.opensInApp('https://sgbus.uwuapps.org/go/k3v9q2x7ma'), isTrue);
    expect(DesktopHost.opensInApp('https://sgbus.uwuapps.org/'), isFalse);
    expect(DesktopHost.opensInApp('http://sgbus.uwuapps.org/#84009'), isFalse);
    expect(DesktopHost.opensInApp('https://example.org/#84009'), isFalse);
  });

  test('web pages and mailto: may open outside the app', () {
    expect(DesktopHost.opensOutside('https://www.lta.gov.sg/content/ltagov/en/newsroom.html'), isTrue);
    expect(DesktopHost.opensOutside('http://example.org/a?b=c'), isTrue);
    expect(DesktopHost.opensOutside('HTTPS://EXAMPLE.ORG/'), isTrue);
    expect(DesktopHost.opensOutside('mailto:hello@uwuapps.org'), isTrue);
  });

  test('anything else is never handed to the system', () {
    for (final url in [
      '',
      '-a',
      '--help',
      ' https://example.org/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ms-settings:privacy-location',
      'x-apple.systempreferences:com.apple.preference.security',
      'smb://server/share',
      'https:',
      'https:///path-only',
      'mailto:',
      'example.org',
    ]) {
      expect(DesktopHost.opensOutside(url), isFalse, reason: url);
    }
  });

  test('the desktop offers the tray countdown and Bus timings widgets to the shared screens', () {
    final features = DesktopHost().features;
    expect(features, containsAll(['glance', 'widgets', 'desktop']));
  });

  group('the tray countdown (SgBus.setTrayStop)', () {
    late Directory dir;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('sgbus-host-');
      DeskSettings.override = dir.path;
      // The countdown fetches as soon as it's set: answered here, never the network.
      Api.fake = (path) async => {'services': []};
    });
    tearDown(() {
      Glance.setStop(null);
      Api.fake = null;
      DeskSettings.override = null;
      dir.deleteSync(recursive: true);
    });

    test('a stop, and one bus or none, are checked and tidied', () {
      expect(DesktopHost.trayStopFrom({'code': '84009', 'name': 'Bedok Int', 'service': '12e'}), {'code': '84009', 'name': 'Bedok Int', 'service': '12E'});
      expect(DesktopHost.trayStopFrom({'code': '84009'}), {'code': '84009', 'name': '', 'service': null});
      expect(DesktopHost.trayStopFrom({'code': '84009', 'name': 'Bedok Int', 'service': null}), {'code': '84009', 'name': 'Bedok Int', 'service': null});
      expect(DesktopHost.trayStopFrom({'code': '84009', 'service': ''}), {'code': '84009', 'name': '', 'service': null});
    });

    test("anything that isn't a stop, or isn't the right type, is refused", () {
      for (final o in <Map<String, dynamic>>[
        {},
        {'code': 84009},
        {'code': '8400'},
        {'code': '840091'},
        {'code': ' 84009'},
        {'code': '84009', 'name': 12},
        {'code': '84009', 'service': 12},
        {'code': '84009', 'service': '12345'},
        {'code': '84009', 'service': '12,13'},
      ]) {
        expect(DesktopHost.trayStopFrom(o), isNull, reason: '$o');
      }
    });

    test('a good call sets the countdown; a bad one fails and leaves it as it was', () async {
      final host = DesktopHost();
      final answer = await host.call('SgBus', 'setTrayStop', {'code': '84009', 'name': 'Bedok Int', 'service': '12'});
      expect(answer, {'stop': {'code': '84009', 'name': 'Bedok Int', 'service': '12'}});
      expect(Glance.stop?['code'], '84009');
      await expectLater(host.call('SgBus', 'setTrayStop', {'code': 'Bedok'}), _invalid);
      expect(Glance.stop?['code'], '84009');
    });
  });

  group('a Bus timings widget (SgBus.addWidget)', () {
    test('a stop, its name and its buses are checked, each bus kept once', () {
      final w = DesktopHost.widgetFrom({'code': '84009', 'name': 'Bedok Int', 'buses': ['174', '12e', '174', '22*', 5, 'TOOLONG']});
      expect(w?.code, '84009');
      expect(w?.name, 'Bedok Int');
      expect(w?.buses, ['174', '12E']);
      expect(DesktopHost.widgetFrom({'code': '84009'})?.buses, isEmpty);
    });

    test('at most 20 buses', () {
      final w = DesktopHost.widgetFrom({'code': '84009', 'buses': [for (var i = 1; i <= 30; i++) '$i']});
      expect(w?.buses, hasLength(DesktopHost.widgetBusMax));
      expect(w?.buses.last, '20');
    });

    test("anything that isn't a stop, or isn't the right type, is refused", () async {
      for (final o in <Map<String, dynamic>>[
        {},
        {'code': '8400'},
        {'code': 84009},
        {'code': '84009', 'name': ['Bedok']},
        {'code': '84009', 'buses': '174'},
      ]) {
        expect(DesktopHost.widgetFrom(o), isNull, reason: '$o');
      }
      // Refused before any widget window is asked for.
      await expectLater(DesktopHost().call('SgBus', 'addWidget', {'code': 'Bedok', 'buses': []}), _invalid);
    });
  });

  group('full screen for a page (SgBus.setFullScreen)', () {
    late bool on;
    late List<bool> turned;
    late PageFullScreen full;
    setUp(() {
      on = false;
      turned = [];
      full = PageFullScreen(isOn: () => on, turn: (v) {
        on = v;
        turned.add(v);
      });
    });

    test('from a window that was not full screen: on with the board, off after it', () {
      full.ask(true);
      expect(on, isTrue);
      full.ask(false);
      expect(on, isFalse);
    });

    test('from a window already full screen: still full screen after the board closes', () {
      on = true;
      full.ask(true);
      full.ask(false);
      expect(on, isTrue);
      expect(turned, isNot(contains(false)));
    });

    test('a new board opening before the old one closes keeps full screen until both have gone', () {
      full.ask(true);
      full.ask(true);
      full.ask(false);
      expect(on, isTrue);
      full.ask(false);
      expect(on, isFalse);
    });

    test('letting go without having asked changes nothing', () {
      on = true;
      full.ask(false);
      expect(on, isTrue);
      expect(turned, isEmpty);
    });

    test('left by the person while the board was up: it stays as they left it', () {
      on = true;
      full.ask(true);
      on = false; // F11 while the board was showing
      full.ask(false);
      expect(on, isFalse);
      expect(turned, [true]);
    });

    test('the host turns the window full screen and back, and refuses anything but true or false', () async {
      DeskChrome.fullScreen.value = false;
      final host = DesktopHost();
      await host.call('SgBus', 'setFullScreen', {'on': true});
      expect(DeskChrome.fullScreen.value, isTrue);
      await host.call('SgBus', 'setFullScreen', {'on': false});
      expect(DeskChrome.fullScreen.value, isFalse);
      await expectLater(host.call('SgBus', 'setFullScreen', {'on': 'yes'}), _invalid);
      expect(DeskChrome.fullScreen.value, isFalse);
    });
  });
}
