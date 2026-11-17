// A widget's or the welcome window's engine opens at start only once the main window has stopped
// drawing (DeskWidgets.quiet): on Windows two engines starting to draw at once crashed ANGLE's
// shared Direct3D 11 renderer, with a black window, on most launches with a widget kept.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/widgets_window.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('waits for the window to have drawn nothing for a moment, then goes', () async {
    final watch = Stopwatch()..start();
    await DeskWidgets.quiet(still: const Duration(milliseconds: 200), atMost: const Duration(seconds: 5));
    expect(watch.elapsed, greaterThanOrEqualTo(const Duration(milliseconds: 200)));
    expect(watch.elapsed, lessThan(const Duration(seconds: 2)));
  });

  test('drawing puts it off: the moment counts from the last frame', () async {
    final watch = Stopwatch()..start();
    // Drawing for the first 400 ms, then still.
    await DeskWidgets.quiet(still: const Duration(milliseconds: 200), atMost: const Duration(seconds: 5), drawing: () => watch.elapsedMilliseconds < 400);
    // At least the still moment after the last frame seen (checked every 50 ms).
    expect(watch.elapsed, greaterThanOrEqualTo(const Duration(milliseconds: 540)));
    expect(watch.elapsed, lessThan(const Duration(seconds: 2)));
  });

  test('a window that never stops drawing still lets them open, after at most the limit', () async {
    final watch = Stopwatch()..start();
    await DeskWidgets.quiet(still: const Duration(milliseconds: 200), atMost: const Duration(milliseconds: 600), drawing: () => true);
    expect(watch.elapsed, greaterThanOrEqualTo(const Duration(milliseconds: 600)));
    expect(watch.elapsed, lessThan(const Duration(seconds: 2)));
  });
}
