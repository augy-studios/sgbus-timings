import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/features/trips/trip_timeline.dart';
import 'package:sgbus_timings/theme/theme.dart';

TripLeg _train(String route, List<List<double>> points) => TripLeg(kind: 'train', label: '$route Line', to: 'There', points: points, names: const [], minutes: 10, route: route);

void main() {
  group('the dot', () {
    test('eases towards where you are, and never past it', () {
      final next = TripTimeline.eased(0, 1, TripTimeline.frameMs);
      expect(next, closeTo(TripTimeline.ease, 0.0001));
      var at = 0.0;
      for (var i = 0; i < 400 && at != 1; i++) {
        at = TripTimeline.eased(at, 1, 16);
        expect(at, lessThanOrEqualTo(1));
      }
      expect(at, 1);
    });

    test('moves the same way at any frame rate', () {
      var slow = 0.0, fast = 0.0;
      for (var i = 0; i < 6; i++) {
        slow = TripTimeline.eased(slow, 1, 100);
      }
      for (var i = 0; i < 60; i++) {
        fast = TripTimeline.eased(fast, 1, 10);
      }
      expect(slow, closeTo(fast, 0.0001));
    });
  });

  group('the Circle Line', () {
    // Round the loop's middle, by way of its north, east and south.
    const clockwise = [[1.35, 103.84], [1.30, 103.89], [1.26, 103.84]];

    test('says which way round', () {
      expect(Trip.loopWay(_train('CC', clockwise)), 'cw');
      expect(Trip.loopWay(_train('CC', clockwise.reversed.toList())), 'acw');
    });

    test('only for the Circle Line', () {
      expect(Trip.loopWay(_train('EW', clockwise)), isNull);
      expect(Trip.loopWay(TripLeg(kind: 'bus', label: 'Bus 21', to: 'There', points: clockwise, names: const [], minutes: 10)), isNull);
    });
  });

  testWidgets('every stop of the part shows, with what happens where', (tester) async {
    Store.memory({});
    final t = Trip.I;
    t.id = 'test';
    t.leg = 0;
    t.pos = 1.5;
    t.legs = [
      TripLeg(
        kind: 'bus',
        label: 'Bus 21',
        to: 'Stop E',
        points: const [[1.30, 103.80], [1.31, 103.80], [1.32, 103.80], [1.33, 103.80], [1.34, 103.80]],
        names: const ['Stop A', 'Stop B', 'Stop C', 'Stop D', 'Stop E'],
        minutes: 10,
      ),
    ];
    addTearDown(() {
      t.id = null;
      t.legs = [];
      t.pos = 0;
    });
    var changedAt = <int>[];
    Future<void> show({required bool changing}) => tester.pumpWidget(MaterialApp(
          theme: AppLook.I.theme(Brightness.light, contrast: false),
          home: Scaffold(
            body: SingleChildScrollView(
              child: TripTimeline(changing: changing, onChangeAt: (k, i) => changedAt = [k, i]),
            ),
          ),
        ));
    await show(changing: false);
    await tester.pump();
    for (final name in ['Stop A', 'Stop B', 'Stop C', 'Stop D', 'Stop E']) {
      expect(find.text(name), findsOneWidget);
    }
    expect(find.text('Alert'), findsOneWidget);
    expect(find.text('Get off'), findsOneWidget);
    expect(find.text('Change here'), findsNothing);

    await show(changing: true);
    await tester.pump();
    // Stops still ahead, short of the end of the trip.
    expect(find.text('Change here'), findsNWidgets(2));
    await tester.tap(find.text('Change here').first);
    expect(changedAt, [0, 2]);
  });
}
