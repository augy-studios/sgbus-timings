// The bars along the top and the notes under them: the page under a bar doesn't leave the status
// bar's height empty again, nor does a second bar under the first (bug report 20261113-7K2S); a
// note with two buttons keeps its words readable on a narrow phone (bug report 20261117-5YJ4);
// and Pick a bus pins the favourite buses with a star (bug report 20261113-V6FE).
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/app/shell.dart';
import 'package:sgbus_timings/data/favs.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/alerts/alerts.dart';
import 'package:sgbus_timings/features/timings/stop_screen.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/features/trips/trip_watch.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
import 'package:sgbus_timings/theme/theme.dart';
import 'package:sgbus_timings/widgets/common.dart';

import 'shots/harness.dart';

final _a = [for (var i = 0; i < 4; i++) [1.30 + i * 0.0036, 103.80]];
const _status = 30.0;

/// The page's own top padding, as it reads it.
class _Page extends StatelessWidget {
  const _Page();
  @override
  Widget build(BuildContext context) => Center(child: Text('top ${MediaQuery.paddingOf(context).top}'));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('the status bar, once', () {
    setUp(() {
      Store.memory({'sgbus_tour': 'done', 'sgbus_first_run': 'done', 'sgbus_start': 'timings'});
      Native.available = false;
      Locate.fake = Fix(_a[0][0], _a[0][1]);
      AppNav.page.value = 'timings';
      Shell.top
        ..clear()
        ..add(DisruptionBar.top)
        ..add(TripBar.top);
    });
    tearDown(() {
      Alerts.bar.value = null;
      Shell.top.clear();
    });

    Future<void> shell(WidgetTester t) async {
      t.view.physicalSize = const Size(411 * 2.625, 914 * 2.625);
      t.view.devicePixelRatio = 2.625;
      t.view.padding = const FakeViewPadding(top: _status * 2.625);
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: Shell(pages: {'timings': () => const _Page()})));
      await t.pump();
    }

    Future<void> startTrip(WidgetTester t) => t.runAsync(() => Trip.I.start(title: 'Ke Kerja', legs: [
          TripLeg(kind: 'walk', label: 'Berjalan', to: 'BLK 85 (84231)', points: _a, names: const ['a', 'b', 'c', 'd'], minutes: 4),
          TripLeg(kind: 'bus', label: 'Bas 222', to: 'BEDOK STN EXIT A', points: _a, names: const ['a', 'b', 'c', 'd'], minutes: 10),
        ]));

    testWidgets('with no bar, the page keeps clear of the status bar', (t) async {
      await shell(t);
      expect(find.text('top $_status'), findsOneWidget);
    });

    testWidgets('under the trip bar, the page needn\'t', (t) async {
      await startTrip(t);
      addTearDown(() => t.runAsync(() => Trip.I.stop()));
      await shell(t);
      expect(find.text('top 0.0'), findsOneWidget);
      // The bar keeps clear of it itself.
      expect(t.getTopLeft(find.text('Ke Kerja')).dy, greaterThanOrEqualTo(_status));
    });

    testWidgets('a second bar under the first doesn\'t leave the status bar\'s room again', (t) async {
      await startTrip(t);
      addTearDown(() => t.runAsync(() => Trip.I.stop()));
      await shell(t);
      final alone = t.getSize(find.byType(TripBar)).height;
      Alerts.bar.value = 'Train service disrupted on the East-West Line.';
      await t.pump();
      expect(t.getSize(find.byType(TripBar)).height, alone - _status, reason: 'the disruptions bar above keeps clear of it');
      expect(find.text('top 0.0'), findsOneWidget);
    });
  });

  group('a note with two buttons (20261117-5YJ4)', () {
    const words = 'Bas 147 ~2 min lebih perlahan daripada biasa: trafik sesak di bukit merah lane 3 dan queensway.';
    final note = TripNote(words, action: 'Tukar laluan', onAction: () {}, second: 'Kekalkan jalan saya', onSecond: () {});

    // A narrow phone for the trip screen; under the trip bar, a usual one.
    Future<void> row(WidgetTester t, {required bool compact}) async {
      final width = compact ? 411.0 : 320.0;
      t.view.physicalSize = Size(width * 3, 800 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MediaQuery(
        data: MediaQueryData(size: Size(width, 800), textScaler: const TextScaler.linear(1.3)),
        child: MaterialApp(theme: AppLook.I.theme(Brightness.light), home: Scaffold(body: Align(alignment: Alignment.topCenter, child: TripNoteRow(note, compact: compact)))),
      ));
    }

    testWidgets('on the trip screen, the buttons go under the words, which keep the width', (t) async {
      await row(t, compact: false);
      final text = t.getRect(find.text(words));
      expect(text.width, greaterThan(250), reason: 'not squeezed into a column beside the buttons');
      expect(t.getRect(find.text('Tukar laluan')).top, greaterThanOrEqualTo(text.bottom));
      expect(find.text('Kekalkan jalan saya'), findsOneWidget);
    });

    testWidgets('under the trip bar, only the main button, beside the words', (t) async {
      await row(t, compact: true);
      expect(find.text('Tukar laluan'), findsOneWidget);
      expect(find.text('Kekalkan jalan saya'), findsNothing);
      expect(t.getRect(find.text(words)).width, greaterThan(180));
    });
  });

  group('Pick a bus (20261113-V6FE)', () {
    // The app's real fonts, as the stop screen is laid out for them.
    setUpAll(loadFonts);

    for (final pin in ['top', 'bottom']) {
      testWidgets('favourite buses pinned to the $pin, with a star', (t) async {
        await t.runAsync(() => stillData(state: {Favs.busKey: '["854","30"]', Favs.pinKey: '{"bus":"$pin"}'}));
        t.view.physicalSize = const Size(412, 892) * 3;
        t.view.devicePixelRatio = 3;
        addTearDown(t.view.reset);
        AppLook.I.materialYou = true;
        await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const StopScreen(code: '84009')));
        await settle(t);
        await t.tap(find.text('Pick a bus'));
        await settle(t);
        final pills = t.widgetList<Pill>(find.descendant(of: find.byType(BottomSheet), matching: find.byType(Pill))).toList();
        final labels = [for (final p in pills) p.label];
        expect(labels.length, greaterThan(4));
        final favs = pin == 'top' ? labels.take(2) : labels.skip(labels.length - 2);
        expect(favs, ['30', '854'], reason: 'in number order among themselves');
        for (final p in pills) {
          expect(p.icon, ['30', '854'].contains(p.label) ? Icons.star : null, reason: p.label);
        }
      });
    }
  });
}
