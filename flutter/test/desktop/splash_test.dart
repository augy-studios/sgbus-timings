// The update window (lib/desktop/splash.dart): its panel fills the whole small window, light or
// dark, however short its line. It sits in a Scaffold, which lets its body be narrower than the
// window, so without filling it the panel was only as wide as "Starting…" and left a strip of
// Flutter's own background beside it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/splash.dart';
import 'package:sgbus_timings/desktop/updater.dart';

/// The update window's size (desktop_main.dart's splash).
const _window = Size(300, 360);

void main() {
  /// Draws the update window as the app does (a Scaffold around it), at its own size, with
  /// [status] and the computer in [brightness].
  Future<void> open(WidgetTester tester, SplashStatus status, Brightness brightness) async {
    tester.view.physicalSize = _window;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SplashScreen(status: status, brightness: brightness))));
    await tester.pump();
  }

  /// The panel: the box painted in the update window's own background colour.
  Finder panel(SplashColors colours) => find.byWidgetPredicate((w) => w is Container && w.decoration is BoxDecoration && (w.decoration! as BoxDecoration).color == colours.bg);

  for (final brightness in Brightness.values) {
    final colours = brightness == Brightness.dark ? SplashColors.dark : SplashColors.light;

    testWidgets('the panel fills the window, ${brightness.name}', (tester) async {
      // "Starting…", the line every launch shows: short in any font, so the widest thing in
      // the panel is the bar's 180 px. (A long line wouldn't do: the test renderer's wide
      // letters wrap it across the whole window, which hides the panel being too narrow.)
      await open(tester, const SplashStatus('Starting…'), brightness);
      expect(tester.getSize(panel(colours)), _window);
    });
  }
}
