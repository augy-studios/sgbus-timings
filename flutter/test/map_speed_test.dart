import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/map/live_map.dart';

void main() {
  test("a fix's speed in km/h", () {
    expect(speedKmh(0), 0);
    expect(speedKmh(5), 18);
    expect(speedKmh(13.89), 50);
  });

  test('a fix with no speed has none to show', () {
    expect(speedKmh(null), isNull);
    expect(speedKmh(-1), isNull);
    expect(speedKmh(double.nan), isNull);
  });
}
