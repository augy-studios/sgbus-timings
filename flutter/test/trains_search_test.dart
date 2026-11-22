// A station search's Train times, tapped on a phone or clicked with a mouse on the desktop, opens
// the station's train times (trains_screen.dart). On a computer a mouse button going down outside
// the search box took its focus, which hid the suggestions before the button came up, so the
// click did nothing: these click as a person does, with frames drawn in between.
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/app/shell.dart';
import 'package:sgbus_timings/data/stations.dart';
import 'package:sgbus_timings/features/timings/timings_page.dart';
import 'package:sgbus_timings/features/timings/trains_screen.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

const _state = {'sgbus_tour': 'done', 'sgbus_first_run': 'done', 'sgbus_start': 'timings'};

/// Searches for Bedok MRT and taps or clicks its Train times, slowly enough for frames between.
Future<void> _searchAndPick(WidgetTester t, PointerDeviceKind kind) async {
  await t.tap(find.byType(TextField).first);
  await t.enterText(find.byType(TextField).first, 'bedok mrt');
  await settle(t);
  final item = find.text('Next trains at Bedok MRT station');
  expect(item, findsOneWidget);
  final press = await t.startGesture(t.getCenter(item), kind: kind);
  await t.pump(const Duration(milliseconds: 60));
  await t.pump(const Duration(milliseconds: 60));
  await press.up();
  await settle(t);
}

void main() {
  setUp(() => Stations.use([Station('Bedok', const ['EW5'], 1.324, 103.93, const [], const [])]));

  testWidgets('a phone: Train times opens the station’s trains', (t) async {
    await t.runAsync(() => stillData(state: _state));
    t.view.physicalSize = const Size(412, 892);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      navigatorKey: AppNav.navigatorKey,
      theme: AppLook.I.theme(Brightness.dark),
      home: onPage('timings', const TimingsPage()),
    ));
    await settle(t);
    await _searchAndPick(t, PointerDeviceKind.touch);
    expect(find.byType(TrainsScreen), findsOneWidget);
  });

  for (final (layout, width) in [(DeskLayout.phone, 600.0), (DeskLayout.rail, 900.0), (DeskLayout.split, 1200.0)]) {
    testWidgets('the desktop (${layout.name}): a click on Train times opens the station’s trains', (t) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      await t.runAsync(() => stillData(state: _state));
      t.view.physicalSize = Size(width, 800);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        navigatorKey: AppNav.navigatorKey,
        theme: AppLook.I.theme(Brightness.dark),
        home: DeskLayoutScope(layout: layout, child: Shell(pages: {'timings': () => const TimingsPage()})),
      ));
      await settle(t);
      await _searchAndPick(t, PointerDeviceKind.mouse);
      expect(find.byType(TrainsScreen), findsOneWidget);
    });
  }
}
