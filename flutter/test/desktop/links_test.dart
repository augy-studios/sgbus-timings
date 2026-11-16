// uwu:// links on the desktop: which page a uwu://sgbus/ link opens (Desktop.fromAppLink in
// lib/desktop/desktop.dart, as the Electron app and Android's MainActivity map them), and how a
// link for another UwU app is handed on to it (lib/desktop/links.dart, as links.js does), and a
// copy started only to hand one on quitting only once the other app has been started.
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/desktop.dart';
import 'package:sgbus_timings/desktop/links.dart';
import 'package:sgbus_timings/desktop/settings.dart';

const _site = 'https://sgbus.uwuapps.org';

void main() {
  group('uwu://sgbus/ links to the page they name', () {
    test('the home page', () {
      expect(Desktop.fromAppLink('uwu://sgbus/'), '$_site/');
      expect(Desktop.fromAppLink('uwu://sgbus'), '$_site/');
    });

    test("the site's short links by their path", () {
      expect(Desktop.fromAppLink('uwu://sgbus/go/k3v9q2x7ma'), '$_site/go/k3v9q2x7ma');
      expect(Desktop.fromAppLink('uwu://sgbus/trip/abcdefghij'), '$_site/trip/abcdefghij');
      expect(Desktop.fromAppLink('uwu://sgbus/eta/0123456789'), '$_site/eta/0123456789');
    });

    test("anything else as the site's # address", () {
      expect(Desktop.fromAppLink('uwu://sgbus/84009'), '$_site/#84009');
      expect(Desktop.fromAppLink('uwu://sgbus/84009,12'), '$_site/#84009,12');
      expect(Desktop.fromAppLink('uwu://sgbus/bus/22'), '$_site/#bus/22');
      expect(Desktop.fromAppLink('uwu://sgbus/map/84009/'), '$_site/#map/84009');
      expect(Desktop.fromAppLink('uwu://sgbus/nav'), '$_site/#nav');
      // A short link's path with the wrong length is just an address.
      expect(Desktop.fromAppLink('uwu://sgbus/go/short'), '$_site/#go/short');
    });

    test('the scheme and host in any case', () {
      expect(Desktop.fromAppLink('UWU://SGBus/nav'), '$_site/#nav');
    });

    test("another app's host, another scheme, or not a plain address: none", () {
      expect(Desktop.fromAppLink('uwu://promptr/84009'), isNull);
      expect(Desktop.fromAppLink('https://sgbus/84009'), isNull);
      expect(Desktop.fromAppLink('uwu://sgbus/84009!'), isNull);
      expect(Desktop.fromAppLink("uwu://sgbus/stop'(1)"), isNull);
    });

    test('a link among the command line, in any case', () {
      expect(Desktop.linkIn(['--hidden', 'UWU://sgbus/84009']), 'UWU://sgbus/84009');
      expect(Desktop.linkIn(['--hidden']), isNull);
    });

    test('typed in the title bar, a uwu:// link opens the same page', () {
      expect(Desktop.typedAddress('  uwu://sgbus/bus/22 '), '$_site/#bus/22');
    });
  });

  group('handing another app its link', () {
    test('a command line split on spaces, quoted parts whole', () {
      expect(DeskLinks.split(r'"C:\Program Files\UwU Promptr\UwU Promptr.exe" "%1"'), [r'C:\Program Files\UwU Promptr\UwU Promptr.exe', '%1']);
      expect(DeskLinks.split(r'"/opt/a \"b\"/app" %u', escapes: true), ['/opt/a "b"/app', '%u']);
    });

    test("Windows: the link in place of %1, or on the end if there's none", () {
      const link = 'uwu://promptr/x';
      expect(DeskLinks.windowsCommand(r'"C:\Apps\Promptr.exe" "%1"', link), [r'C:\Apps\Promptr.exe', link]);
      expect(DeskLinks.windowsCommand(r'"C:\Apps\Promptr.exe" --open=%L', link), [r'C:\Apps\Promptr.exe', '--open=$link']);
      expect(DeskLinks.windowsCommand(r'C:\Apps\Promptr.exe', link), [r'C:\Apps\Promptr.exe', link]);
    });

    test('Linux: the link for %u, other field codes dropped, %% made %', () {
      const link = 'uwu://promptr/x';
      expect(DeskLinks.linuxCommand('env A=1 "/opt/UwU Promptr/promptr" --open %u %i %%done', link), ['env', 'A=1', '/opt/UwU Promptr/promptr', '--open', link, '%done']);
      expect(DeskLinks.linuxCommand('promptr %U', link), ['promptr', link]);
      expect(DeskLinks.linuxCommand('promptr', link), ['promptr', link]);
    });

    test("a .desktop file's Exec line, from its Desktop Entry, not an action's", () {
      const file = '[Desktop Action new]\nExec=promptr --new\n\n[Desktop Entry]\nName=UwU Promptr\nExec=promptr %u\nMimeType=x-scheme-handler/uwu;\n';
      expect(DeskLinks.execOf(file), 'promptr %u');
      expect(DeskLinks.execOf('[Desktop Entry]\nName=No exec\n'), isNull);
    });

    test('any copy of this app is this app, another UwU app is not', () {
      expect(DeskLinks.isThisApp({'desktop': 'sgbus-timings.desktop'}), isTrue);
      expect(DeskLinks.isThisApp({'app': '/Applications/SG Bus Timings.app'}), isTrue);
      expect(DeskLinks.isThisApp({'command': r'"C:\Users\a\AppData\Local\Programs\SG Bus Timings\SG Bus Timings.exe" "%1"'}), isTrue);
      expect(DeskLinks.isThisApp({'command': r'"C:\Apps\UwU Promptr.exe" "%1"'}), isFalse);
      expect(DeskLinks.isThisApp({'desktop': 'uwupromptr.desktop'}), isFalse);
    });

    group('with settings.json', () {
      late Directory dir;
      setUp(() {
        dir = Directory.systemTemp.createTempSync('sgbus-links-');
        DeskSettings.override = dir.path;
      });
      tearDown(() {
        DeskSettings.override = null;
        dir.deleteSync(recursive: true);
      });

      test("nobody noted, or only this app: there's nobody to hand it to", () {
        expect(DeskLinks.passOn('uwu://promptr/x'), isFalse);
        expect(DeskLinks.handOn('uwu://promptr/x'), isNull);
        DeskSettings.write({'linkHandoff': {'desktop': 'sgbus-timings.desktop', 'app': '/Applications/SG Bus Timings.app', 'command': '"SG Bus Timings.exe" "%1"'}});
        expect(DeskLinks.passOn('uwu://promptr/x'), isFalse);
        expect(DeskLinks.handOn('uwu://promptr/x'), isNull);
      });
    });
  });

  // A copy started only to carry another app's link (desktop_main.dart's start-up hand-off): the
  // other app is started a moment after it's asked for, so quitting first would stop it.
  group('a copy started only to hand a link on', () {
    test('quits only once the other app has been started', () async {
      final start = Completer<void>();
      final steps = <String>[];
      final done = DeskLinks.handOffAndQuit('uwu://promptr/x', () async => steps.add('quit'), handOn: (link) {
        steps.add('hand on $link');
        return start.future;
      });
      await Future<void>.delayed(Duration.zero);
      expect(steps, ['hand on uwu://promptr/x'], reason: 'not quit while the other app is starting');
      start.complete();
      expect(await done, isTrue);
      expect(steps, ['hand on uwu://promptr/x', 'quit']);
    });

    test('a start that fails (the app was uninstalled) still quits', () async {
      var quit = false;
      final done = DeskLinks.handOffAndQuit('uwu://promptr/x', () async => quit = true, handOn: (_) => Future<void>.error(const ProcessException('/nowhere', [])));
      expect(await done, isTrue);
      expect(quit, isTrue);
    });

    testWidgets('a start that never finishes still quits, after handOffWait', (t) async {
      var quit = false;
      final done = DeskLinks.handOffAndQuit('uwu://promptr/x', () async => quit = true, handOn: (_) => Completer<void>().future);
      await t.pump(DeskLinks.handOffWait - const Duration(milliseconds: 10));
      expect(quit, isFalse);
      await t.pump(const Duration(milliseconds: 20));
      expect(quit, isTrue);
      expect(await done, isTrue);
    });

    test("with nobody to hand it to, it doesn't quit: the app opens as usual", () async {
      var quit = false;
      expect(await DeskLinks.handOffAndQuit('uwu://promptr/x', () async => quit = true, handOn: (_) => null), isFalse);
      expect(quit, isFalse);
    });
  });
}
