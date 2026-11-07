// A Google Play build has no updater of its own, as Play updates it; the APK on GitHub has. Run both
// ways: flutter test test/play_build_test.dart, and with --dart-define=SGBUS_PLAY=true.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

void main() {
  setUp(() => Native.fake(const ['update', 'checkupdate', 'releases', 'card', 'pip'], (_, _, _) async => null));
  tearDown(() => Native.fake(const [], null));

  test('the updater’s features are there only off Play', () {
    for (final feature in ['update', 'checkupdate', 'releases']) {
      expect(Native.has(feature), !playBuild, reason: feature);
    }
  });

  test('everything else is there either way', () {
    expect(Native.has('card'), isTrue);
    expect(Native.has('pip'), isTrue);
    expect(Native.has('nothing like it'), isFalse);
  });
}
