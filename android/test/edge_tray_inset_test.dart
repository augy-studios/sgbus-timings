// A phone on its side, with the navigation bar or the camera's cutout down the tray's side (bug
// report 20261108-7CMX): the tray sits inside it, not under it, and the page keeps clear of both.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/edge_tray.dart';
import 'package:sgbus_timings/features/glance/glance_page.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

void main() {
  setUpAll(loadFonts);

  for (final (name, side) in [('right', 'right'), ('left', 'left')]) {
    testWidgets('the Edge Tray keeps clear of an inset on the $name', (t) async {
      await t.runAsync(() => stillData(state: {
            'sgbus_tour': 'done',
            'sgbus_first_run': 'done',
            if (side == 'left') EdgeTray.sideKey: 'left',
          }));
      const size = Size(800, 360);
      const inset = 48.0;
      final pad = side == 'left' ? const EdgeInsets.only(left: inset) : const EdgeInsets.only(right: inset);
      t.view.physicalSize = size * 3;
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MediaQuery(
        data: const MediaQueryData(size: size, devicePixelRatio: 3).copyWith(padding: pad, viewPadding: pad),
        child: MaterialApp(theme: AppLook.I.theme(Brightness.light), home: onPage('glance', const GlancePage())),
      ));
      for (var i = 0; i < 4; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await settle(t);
      }
      expect(t.takeException(), isNull);

      final settings = t.getRect(find.byTooltip('Settings').first);
      final page = t.getRect(find.byType(GlancePage));
      if (side == 'left') {
        expect(settings.left, greaterThanOrEqualTo(inset), reason: 'the buttons stay clear of the inset');
        expect(page.left, greaterThanOrEqualTo(settings.right), reason: 'the page stays clear of the tray');
      } else {
        expect(settings.right, lessThanOrEqualTo(size.width - inset), reason: 'the buttons stay clear of the inset');
        expect(page.right, lessThanOrEqualTo(settings.left), reason: 'the page stays clear of the tray');
      }
    });
  }
}
