// A Google Play build has no updater of its own, as Play updates it, and not what needs the
// permissions Play keeps for other kinds of app; the APK on GitHub has them all. Run both ways:
// flutter test test/play_build_test.dart, and with --dart-define=SGBUS_PLAY=true.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

void main() {
  setUp(() => Native.fake(const ['update', 'checkupdate', 'releases', 'nearstops', 'onabus', 'card', 'pip', 'routines', 'leavetime', 'lastbus'], (_, _, _) async => null));
  tearDown(() => Native.fake(const [], null));

  test('the updater’s features are there only off Play', () {
    for (final feature in ['update', 'checkupdate', 'releases']) {
      expect(Native.has(feature), !playBuild, reason: feature);
    }
  });

  test('Timings near a stop and “On a bus?” are there only off Play', () {
    for (final feature in ['nearstops', 'onabus']) {
      expect(Native.has(feature), !playBuild, reason: feature);
    }
  });

  test('everything else is there either way', () {
    for (final feature in ['card', 'pip', 'routines', 'leavetime', 'lastbus']) {
      expect(Native.has(feature), isTrue, reason: feature);
    }
    expect(Native.has('nothing like it'), isFalse);
  });
}
