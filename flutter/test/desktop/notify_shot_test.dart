// Two small rules: where a notification click goes (lib/desktop/notify.dart), and what a screenshot
// is called (lib/desktop/screenshot.dart, as the Electron app named them).
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/notify.dart';
import 'package:sgbus_timings/desktop/screenshot.dart';

void main() {
  test("a notification's address: the # part, or none", () {
    expect(DeskNotify.hashOf('/#alerts'), '#alerts');
    expect(DeskNotify.hashOf('https://sgbus.uwuapps.org/#84009,12'), '#84009,12');
    expect(DeskNotify.hashOf('https://sgbus.uwuapps.org/#nav/here/1.3,103.8#x'), '#nav/here/1.3,103.8#x');
    expect(DeskNotify.hashOf('https://sgbus.uwuapps.org/'), isNull);
    expect(DeskNotify.hashOf('/#'), isNull);
  });

  test("a screenshot's file name", () {
    final at = DateTime(2026, 11, 6, 9, 5, 3);
    expect(DeskShot.fileName(at, long: false), 'SG Bus Timings 2026-11-06 09.05.03.png');
    expect(DeskShot.fileName(at, long: true), 'SG Bus Timings 2026-11-06 09.05.03 (long).png');
  });
}
