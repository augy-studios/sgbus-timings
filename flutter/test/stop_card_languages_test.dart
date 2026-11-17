// A stop's bus card in every language, on narrow phones (bug report 20261107-XPZU): each bus's time
// no more than two lines, broken only between its minutes and seconds, and nothing reaching into the
// next bus's column.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/arrivals.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/timings/stop_screen.dart';
import 'package:sgbus_timings/i18n/i18n.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

const _times = [200000 + 21000, 21 * 60000 + 47000, 38 * 60000 + 59000];

// The longest a card gets: minutes and seconds, a wheelchair, a deck and how far away.
ServiceArrivals _service() => ServiceArrivals('17', 'GAS', [
      for (final ms in _times) Bus(ms, 'SEA', true, 'Double', 1.33, 103.93, false, null, null, 1, fetchedAt: When.nowMs()),
    ]);

void main() {
  setUpAll(() async {
    await loadFonts();
    await loadTamil();
  });

  for (final lang in ['en', 'ms', 'ta', 'zh-SG']) {
    for (final width in [360.0, 320.0]) {
      for (final material in [true, false]) {
        testWidgets('$lang at $width, ${material ? 'Material You' : 'UwU Apps'}', (t) async {
          await t.runAsync(() => stillData(state: const {'sgbus_tour': 'done', 'sgbus_first_run': 'done'}, lang: lang));
          AppLook.I.materialYou = material;
          t.view.physicalSize = Size(width, 800) * 3;
          t.view.devicePixelRatio = 3;
          addTearDown(t.view.reset);
          await t.pumpWidget(MaterialApp(
            theme: withTamil(AppLook.I.theme(Brightness.dark)),
            home: Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: ServiceCard(code: '84009', s: _service(), way: null, fav: false, starredHere: false, refreshing: false, onRefresh: () {}),
              ),
            ),
          ));
          await t.pump();

          // A row that doesn't fit fails the test by itself.
          expect(t.takeException(), isNull);

          final columns = [for (final ms in _times) find.text(Eta.wrapped(ms))];
          final lefts = [for (final c in columns) t.getRect(c).left];
          for (var i = 0; i < columns.length; i++) {
            final rect = t.getRect(columns[i]);
            final words = t.renderObject<RenderParagraph>(find.descendant(of: columns[i], matching: find.byType(RichText)));
            expect(words.getMinIntrinsicWidth(double.infinity), lessThanOrEqualTo(words.size.width + 0.5), reason: 'bus ${i + 1}’s minutes or seconds broken in two');
            expect(t.widget<Text>(columns[i]).style!.fontSize, 17, reason: 'the time at its full size');
            expect(rect.height, lessThanOrEqualTo(17 * 1.7 * 2), reason: 'bus ${i + 1}’s time on two lines at most');
            if (i < columns.length - 1) {
              expect(rect.right, lessThanOrEqualTo(lefts[i + 1] - 4), reason: 'bus ${i + 1}’s time clear of the next');
            }
          }

          final words = find.text(tr('stop.wheelchair', 'Wheelchair'));
          expect(words, findsNWidgets(3));
          for (var i = 0; i < 3; i++) {
            final rect = t.getRect(words.at(i));
            expect(rect.left, greaterThanOrEqualTo(lefts[i] - 0.5));
            if (i < 2) expect(rect.right, lessThanOrEqualTo(lefts[i + 1] - 4), reason: 'bus ${i + 1}’s wheelchair clear of the next');
          }
        });
      }
    }
  }
}
