// A phone on its side (bug report 20261108-9RCW): the language sheet scrolls, so every language
// can be reached and tapped, not just the ones that fit in the screen's height.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/features/settings/settings_screen.dart';
import 'package:sgbus_timings/i18n/i18n.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

void main() {
  setUpAll(loadFonts);

  testWidgets('every language can be reached on a phone on its side', (t) async {
    await t.runAsync(() => stillData(state: {'sgbus_tour': 'done', 'sgbus_first_run': 'done'}, lang: 'ms'));
    const size = Size(800, 360);
    t.view.physicalSize = size * 3;
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(MediaQuery(
      data: const MediaQueryData(size: size, devicePixelRatio: 3),
      child: MaterialApp(navigatorKey: AppNav.navigatorKey, theme: AppLook.I.theme(Brightness.dark), home: const Scaffold(body: SettingsScreen())),
    ));
    await settle(t);

    // Settings > You > Language.
    await t.tap(find.text(tr('settings.you', 'You')).first);
    await settle(t);
    await t.tap(find.text(tr('settings.language', 'Language')).first);
    await settle(t);
    expect(t.takeException(), isNull);

    final sheet = find.byType(BottomSheet);
    expect(sheet, findsOneWidget);
    for (final l in I18n.langs) {
      final name = find.descendant(of: sheet, matching: find.text(l.name));
      expect(name, findsOneWidget, reason: l.name);
      await t.ensureVisible(name);
      await settle(t);
      // Tappable: on the screen, not under its edge.
      final at = t.getRect(name);
      expect(at.top, greaterThanOrEqualTo(0), reason: l.name);
      expect(at.bottom, lessThanOrEqualTo(size.height), reason: l.name);
      expect(name.hitTestable(), findsOneWidget, reason: l.name);
    }
  });
}
