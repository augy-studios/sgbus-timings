// Switching language and back: a location message already on the page follows it, rather than
// staying in the language it happened in (bug report 20261107-NQCT).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/timings/timings_page.dart';
import 'package:sgbus_timings/i18n/i18n.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

const _state = {'sgbus_tour': 'done', 'sgbus_first_run': 'done', 'sgbus_glance_near': '1'};
const _zh = '无法获取您的位置';

void main() {
  setUpAll(loadFonts);
  tearDown(() {
    Locate.fakeError = null;
    Locate.fake = null;
  });

  test('the message is worded as it’s shown', () async {
    await stillData(state: _state, lang: 'zh-SG');
    final e = LocationError.noFix();
    expect(e.message, contains(_zh));
    await I18n.I.use('en', remember: false);
    expect(e.message, startsWith("Couldn't get your location"));
    expect(e.toString(), e.message);
    await I18n.I.use('zh-SG', remember: false);
    expect(e.message, contains(_zh));
  });

  test('what it’s for goes with it', () async {
    await stillData(state: _state, lang: 'en');
    final e = LocationError(() => tr('glance.locationBlocked', 'x {toDo}', {'toDo': tr('location.toFindStops', 'to find stops near you')}), denied: true);
    final en = e.message;
    expect(en, contains('to find stops near you'));
    await I18n.I.use('ms', remember: false);
    expect(e.message, isNot(en));
    expect(e.message, isNot(contains('to find stops near you')));
    expect(e.denied, isTrue);
  });

  testWidgets('Bus timings: Near me’s message follows, as in the report', (t) async {
    await t.runAsync(() => stillData(state: _state, lang: 'zh-SG'));
    Locate.fake = null;
    Locate.fakeError = LocationError.noFix();
    t.view.physicalSize = const Size(412, 892) * 3;
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(ListenableBuilder(
      listenable: I18n.I,
      builder: (_, _) => MaterialApp(theme: AppLook.I.theme(Brightness.dark), home: onPage('timings', const TimingsPage())),
    ));
    for (var i = 0; i < 4; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
      await settle(t);
    }
    expect(find.textContaining(_zh), findsOneWidget);

    await t.runAsync(() => I18n.I.use('ms', remember: false));
    await settle(t);
    expect(find.textContaining(_zh), findsNothing);
    expect(find.textContaining('Lokasi anda tidak dapat diperoleh'), findsOneWidget);

    await t.runAsync(() => I18n.I.use('zh-SG', remember: false));
    await settle(t);
    expect(find.textContaining(_zh), findsOneWidget);
    await t.runAsync(() => I18n.I.use('ms', remember: false));
    await settle(t);
    expect(find.textContaining(_zh), findsNothing);
  });

  test('Navigate: its message follows too', () async {
    await stillData(state: _state, lang: 'zh-SG');
    Locate.fake = null;
    Locate.fakeError = LocationError.noFix();
    final n = NavState.I
      ..from = const NavEnd('Your location', 0, 0, here: true)
      ..to = const NavEnd('Bedok Mall', 1.324736, 103.929256)
      ..when = null;
    await n.run();
    expect(n.error, contains(_zh));
    await I18n.I.use('en', remember: false);
    expect(n.error, startsWith("Couldn't get your location"));
    n.from = null;
    await n.run();
  });
}
