// Glance with the Edge Tray out, on a narrow phone, in Bahasa Melayu (bug report 20261107-T2G5): the
// weather button stays inside the page, and "Tiba" on one line. With the real fonts: a layout that
// doesn't fit is what's being looked for.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/features/glance/glance_page.dart';
import 'package:sgbus_timings/features/weather/weather.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

const _state = {
  'sgbus_favs_v2': '[{"code":"84009","name":"Bedok Int"}]',
  'sgbus_tour': 'done',
  'sgbus_first_run': 'done',
};

void main() {
  setUpAll(loadFonts);

  for (final (name, size, scale) in [('a narrow phone', const Size(360, 800), 1.0), ('larger text', const Size(390, 844), 1.3)]) {
    testWidgets('Glance fits on $name', (t) async {
      await t.runAsync(() => stillData(state: _state, lang: 'ms'));
      GlancePage.weather = (_) => const WeatherButton();
      final answer = Api.fake!;
      // A bus under a minute away, for "Tiba".
      Api.fake = (path) async {
        final got = await answer(path);
        if (!path.startsWith('bus-arrivals')) return got;
        for (final s in ((got as Map)['services'] as List)) {
          (s['next'] as Map)['eta_ms'] = 30000;
        }
        return got;
      };
      await t.runAsync(Weather.load);
      AppLook.I.materialYou = true;
      t.view.physicalSize = size * 3;
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MediaQuery(
        data: MediaQueryData(size: size, devicePixelRatio: 3, textScaler: TextScaler.linear(scale)),
        child: MaterialApp(theme: AppLook.I.theme(Brightness.light), home: onPage('glance', const GlancePage())),
      ));
      for (var i = 0; i < 6; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await settle(t);
      }

      // A layout that overflows fails the test by itself; this says where the button ended up.
      expect(t.takeException(), isNull);
      final page = t.getRect(find.byType(GlancePage));
      final button = t.getRect(find.byType(WeatherButton));
      final label = t.getRect(find.textContaining('PSI').first);
      expect(label.right, lessThanOrEqualTo(button.right + 0.5), reason: 'the words stay in the button');
      expect(button.right, lessThanOrEqualTo(page.right + 0.5), reason: 'the button stays on the page');

      final tiba = find.text('Tiba');
      expect(tiba, findsWidgets);
      for (final e in tiba.evaluate()) {
        final style = (e.widget as Text).style;
        final box = e.findRenderObject()! as RenderBox;
        final oneLine = (style?.fontSize ?? 14) * scale * 1.6;
        expect(box.size.height, lessThanOrEqualTo(oneLine), reason: '"Tiba" on one line');
      }
    });
  }
}
