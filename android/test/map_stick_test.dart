import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/map/map_stick.dart';

void main() {
  test('the stick goes no further than its reach', () {
    expect(MapStick.held(const Offset(10, 0)), const Offset(10, 0));
    expect(MapStick.held(const Offset(300, 0)), const Offset(MapStick.reach, 0));
    expect(MapStick.held(const Offset(0, -300)), const Offset(0, -MapStick.reach));
    expect(MapStick.held(const Offset(300, 400)).distance, closeTo(MapStick.reach, 0.001));
  });

  test('the map stays put with the stick at rest', () {
    expect(MapStick.speed(Offset.zero), Offset.zero);
    expect(MapStick.speed(const Offset(MapStick.rest, 0)), Offset.zero);
  });

  test('the map goes the way the stick is held', () {
    expect(MapStick.speed(const Offset(0, -30)).dy, lessThan(0));
    expect(MapStick.speed(const Offset(0, -30)).dx, 0);
    expect(MapStick.speed(const Offset(0, 30)).dy, greaterThan(0));
    expect(MapStick.speed(const Offset(-30, 0)).dx, lessThan(0));
    expect(MapStick.speed(const Offset(30, 0)).dx, greaterThan(0));
  });

  test('faster the further it is held, up to its top speed', () {
    final near = MapStick.speed(const Offset(10, 0)).distance;
    final far = MapStick.speed(const Offset(30, 0)).distance;
    expect(far, greaterThan(near));
    expect(MapStick.speed(const Offset(MapStick.reach, 0)).distance, closeTo(MapStick.topSpeed, 0.001));
  });

  testWidgets('the whole drag counts, from where the finger came down', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: MapStick(builder: (held) => const SizedBox(width: 48, height: 48), onStart: () {}, onSlide: (_) {}, onTap: () {}),
        ),
      ),
    ));
    final g = await tester.startGesture(tester.getCenter(find.byType(MapStick)));
    await g.moveBy(const Offset(30, 0));
    await tester.pump();
    final moved = tester.widget<Transform>(find.descendant(of: find.byType(MapStick), matching: find.byType(Transform))).transform.getTranslation().x;
    expect(moved, 30);
    await g.up();
    await tester.pump();
  });

  testWidgets('a drag slides the map and letting go stops it; a tap only says what it is', (tester) async {
    var slid = Offset.zero;
    var started = 0;
    var tapped = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: MapStick(
            builder: (held) => const SizedBox(width: 48, height: 48),
            onStart: () => started++,
            onSlide: (d) => slid += d,
            onTap: () => tapped++,
          ),
        ),
      ),
    ));

    await tester.tap(find.byType(MapStick));
    expect(tapped, 1);
    expect(started, 0);

    await tester.runAsync(() async {
      final g = await tester.startGesture(tester.getCenter(find.byType(MapStick)));
      await g.moveBy(const Offset(0, -40));
      await tester.pump();
      await g.moveBy(const Offset(0, -40));
      await tester.pump();
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(started, 1);
      expect(slid.dy, lessThan(0));
      expect(slid.dx, 0);

      await g.up();
      await tester.pump();
      final atRest = slid;
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(slid, atRest);
    });
  });
}
