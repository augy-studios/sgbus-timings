// A narrow main window (desktop-features-spec §5's compact fallback): it goes down to 360 × 520,
// laid out as the phone app under 720 px wide, and a window kept smaller by an older copy opens at
// least that big. The title bar still fits: Copy link and the screenshots fold into a More menu,
// and the command bar's list stays inside the window.
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/desktop/desktop.dart';
import 'package:sgbus_timings/desktop/title_bar.dart';
import 'package:sgbus_timings/desktop/updater.dart';
import 'package:sgbus_timings/theme/theme.dart';

void main() {
  group('the main window', () {
    test('goes down to 360 × 520, and opens at 1120 × 760 the first time', () {
      expect(Desktop.minSize, const Size(360, 520));
      expect(Desktop.defaultSize, const Size(1120, 760));
    });

    test('at its narrowest it has the phone layout, with the Edge Tray', () {
      expect(DeskPanes.layoutFor(Desktop.minSize.width), DeskLayout.phone);
    });

    test('a kept size smaller than that opens at the least size', () {
      expect(Desktop.keptBounds({'x': 10, 'y': 20, 'width': 300, 'height': 400}), const Rect.fromLTWH(10, 20, 360, 520));
    });

    test('a kept size at least that big opens as it was', () {
      expect(Desktop.keptBounds({'x': 10, 'y': 20, 'width': 400, 'height': 600}), const Rect.fromLTWH(10, 20, 400, 600));
      expect(Desktop.keptBounds({'width': 1200, 'height': 800}), const Rect.fromLTWH(40, 40, 1200, 800), reason: 'with no place kept, at 40, 40');
    });
  });

  group('the title bar', () {
    setUp(() => Store.memory({AppLook.lookKey: 'usual'}));
    tearDown(() => Updater.ready.value = null);

    /// The title bar, drawn as on Windows (its own window buttons too), in a window [width] px
    /// wide.
    Future<void> bar(WidgetTester t, double width) async {
      t.view.physicalSize = Size(width, 520);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        theme: AppLook.I.theme(Brightness.light),
        home: const Scaffold(body: Column(children: [TitleBar(preview: true)])),
      ));
      await t.pumpAndSettle();
    }

    testWidgets('at 360 px everything fits, with Copy link and the screenshots under More', (t) async {
      // The green Restart to update too, the most the bar ever has.
      Updater.ready.value = '2.5.1';
      await bar(t, 360);
      expect(t.takeException(), isNull, reason: 'nothing overflows');
      expect(find.byTooltip('More'), findsOneWidget);
      expect(find.byIcon(Icons.link), findsNothing);
      expect(find.byIcon(Icons.photo_camera_outlined), findsNothing);
      expect(find.byIcon(Icons.download), findsOneWidget);

      await t.tap(find.byTooltip('More'));
      await t.pumpAndSettle();
      expect(find.text('Copy link'), findsOneWidget);
      expect(find.text('Take a screenshot'), findsOneWidget);
      expect(find.text('Take a long screenshot'), findsOneWidget);
    });

    testWidgets('Esc closes the More menu opened with the mouse', (t) async {
      t.view.physicalSize = const Size(360, 520);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      // As the desktop's chrome has it: the bar in an Overlay of its own, above the app's
      // navigator.
      await t.pumpWidget(MaterialApp(
        theme: AppLook.I.theme(Brightness.light),
        builder: (_, _) => Overlay(initialEntries: [
          OverlayEntry(builder: (_) => const Material(child: Column(children: [TitleBar(preview: true)]))),
        ]),
        home: const SizedBox(),
      ));
      await t.pumpAndSettle();
      await t.tap(find.byTooltip('More'));
      await t.pumpAndSettle();
      expect(find.text('Copy link'), findsOneWidget);
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
      await t.pumpAndSettle();
      expect(find.text('Copy link'), findsNothing);
    });

    testWidgets("at 360 px the command bar's list stays inside the window", (t) async {
      await bar(t, 360);
      await t.tap(find.byIcon(Icons.search));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      final list = t.getRect(find.byType(ListView));
      expect(list.left, greaterThanOrEqualTo(0));
      expect(list.right, lessThanOrEqualTo(360));
      expect(list.top, greaterThanOrEqualTo(40), reason: 'under the bar');
    });

    testWidgets('from 720 px Copy link and the screenshots are on the bar', (t) async {
      await bar(t, 1120);
      expect(t.takeException(), isNull);
      expect(find.byTooltip('More'), findsNothing);
      expect(find.byIcon(Icons.link), findsOneWidget);
      expect(find.byIcon(Icons.photo_camera_outlined), findsOneWidget);
    });
  });
}
