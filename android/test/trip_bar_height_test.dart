// The trip bar and the note under it (bug report 20261113-7K2S) keep to a small part of a
// phone's screen, even with a long note, in Malay, and with Android's text made bigger: the
// bar's text in three lines, the note's in two, with the whole note on the trip screen.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/features/trips/trip_watch.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
import 'package:sgbus_timings/theme/theme.dart';

final _a = [for (var i = 0; i < 4; i++) [1.30 + i * 0.0036, 103.80]];
const _note = 'Ditukar ke jalan lain. Bas terakhir Bas 96A dari CLEMENTI INT telah pergi (09:35). '
    'Sekarang: Selepas Laluan EW ke Clementi: Naik Bas 183 dari Clementi Stn Exit B (17179). Bas 183, ~15 min, sampai sebelum 15:56.';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => Trip.I.stop());

  for (final scale in [1.0, 1.3]) {
    testWidgets('a 411 by 914 phone, text x$scale: bar and note under a quarter of it', (t) async {
      t.view.physicalSize = const Size(411 * 2.625, 914 * 2.625);
      t.view.devicePixelRatio = 2.625;
      addTearDown(t.view.reset);
      await t.runAsync(() async {
        Store.memory();
        Native.available = false;
        Locate.fake = Fix(_a[0][0], _a[0][1]);
        await Trip.I.start(title: 'Ke Kerja', legs: [
          for (var i = 0; i < 6; i++)
            TripLeg(kind: i.isEven ? 'walk' : 'bus', label: i.isEven ? 'Berjalan' : 'Bas 222', to: 'BLK 85 (84231)', points: _a, names: const ['a', 'b', 'c', 'd'], minutes: 12),
        ]);
      });
      Trip.I.switchedNote = _note;
      await t.pumpWidget(MediaQuery(
        data: MediaQueryData(size: const Size(411, 914), textScaler: TextScaler.linear(scale)),
        child: MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const Scaffold(body: Align(alignment: Alignment.topCenter, child: TripBar()))),
      ));
      final bar = t.getSize(find.byType(TripBar)).height;
      final note = t.getSize(find.byType(TripNotes)).height;
      // ignore: avoid_print
      print('text x$scale: bar and note ${bar.round()} of 914 (${(bar / 914 * 100).round()}%), the note ${note.round()}');
      expect(bar / 914, lessThan(0.25));
      expect(find.text('Buat asal'), findsNothing, reason: 'Malay is not loaded in tests; the English Undo shows');
      expect(find.text('Undo'), findsOneWidget);
      await t.runAsync(() => Trip.I.stop());
    });
  }
}
