// The small window's previous and next buttons on a trip, and Next never ending one.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/misc/extras.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
import 'package:sgbus_timings/theme/theme.dart';

final _a = [for (var i = 0; i < 4; i++) [1.30 + i * 0.0036, 103.80]];
final _b = [for (var i = 0; i < 4; i++) [1.33, 103.80 + i * 0.0036]];
TripLeg _bus(List<List<double>> pts) => TripLeg(kind: 'bus', label: 'Bus 14', to: 'End', points: pts, names: const ['a', 'b', 'c', 'd'], minutes: 8);
TripLeg _walk() => TripLeg(kind: 'walk', label: 'Walk', to: 'End', points: [_a[0], _b[0]], names: const ['a', 'b'], minutes: 5);

Future<void> _start(List<TripLeg> legs) async {
  Store.memory();
  Native.available = false;
  Locate.fake = Fix(_a[0][0], _a[0][1]);
  await Trip.I.start(title: 'A trip', legs: legs);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => Trip.I.stop());

  group('which buttons', () {
    test('first part: next only; middle: both; last: previous only', () async {
      await _start([_walk(), _bus(_a), _bus(_b)]);
      expect(Pip.parts()?['prev'], isFalse);
      expect(Pip.parts()?['next'], isTrue);
      Pip.act('next');
      expect(Trip.I.leg, 1);
      expect(Pip.parts()?['prev'], isTrue);
      expect(Pip.parts()?['next'], isTrue);
      Pip.act('next');
      expect(Trip.I.leg, 2);
      expect(Pip.parts()?['prev'], isTrue);
      expect(Pip.parts()?['next'], isFalse);
    });

    test('a trip of one part has none', () async {
      await _start([_bus(_a)]);
      expect(Pip.parts(), isNull);
      expect(Pip.wanted()['parts'], isNull);
      expect(Pip.wanted()['auto'], isTrue, reason: 'still shrinks');
    });

    test('with no bus or train has none', () async {
      await _start([_walk(), TripLeg(kind: 'walk', label: 'Drive', to: 'End', points: [_b[0], _b[3]], names: const ['a', 'b'], minutes: 5, foot: 'drive')]);
      expect(Pip.parts(), isNull);
    });

    test('with no trip, and with the setting off, there are none', () async {
      Store.memory();
      expect(Trip.I.active, isFalse);
      expect(Pip.parts(), isNull);
      await _start([_bus(_a), _bus(_b)]);
      expect(Pip.wanted()['parts'], isNotNull);
      Store.I.put(Pip.offKey, 'off');
      expect(Pip.wanted()['parts'], isNull);
      expect(Pip.wanted()['auto'], isFalse);
    });

    test('each has its words, for a screen reader', () async {
      await _start([_bus(_a), _bus(_b)]);
      expect(Pip.parts()?['prevLabel'], 'Back to the part before');
      expect(Pip.parts()?['nextLabel'], 'On to the next part');
    });
  });

  group('what they do', () {
    test('Previous puts you back where you were', () async {
      await _start([_bus(_a), _bus(_b)]);
      Trip.I.pos = 1.5;
      Trip.I.boarded = true;
      Pip.act('next');
      expect(Trip.I.leg, 1);
      Pip.act('prev');
      expect(Trip.I.leg, 0);
      expect(Trip.I.pos, 1.5);
      expect(Trip.I.boarded, isTrue);
    });

    test('Next on the last part does not end the trip', () async {
      await _start([_bus(_a), _bus(_b)]);
      Pip.act('next');
      Pip.act('next');
      Pip.act('next');
      expect(Trip.I.active, isTrue);
      expect(Trip.I.leg, 1);
      expect(Trip.I.arrived, isFalse);
    });

    test('Previous on the first part does nothing', () async {
      await _start([_bus(_a), _bus(_b)]);
      final moved = Trip.I.movedAt;
      Pip.act('prev');
      expect(Trip.I.leg, 0);
      expect(Trip.I.movedAt, moved, reason: 'the server is not told of a move that did not happen');
    });

    test('something else is ignored', () async {
      await _start([_bus(_a), _bus(_b)]);
      Pip.act('nonsense');
      expect(Trip.I.leg, 0);
    });
  });

  testWidgets('the trip bar: Next greyed on the last part', (t) async {
    await t.runAsync(() => _start([_bus(_a), _bus(_b)]));
    await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const Scaffold(body: TripBar())));
    IconButton next() => t.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.skip_next));
    IconButton prev() => t.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.skip_previous));
    expect(next().onPressed, isNotNull);
    expect(prev().onPressed, isNull);
    Trip.I.step(1);
    await t.pump();
    expect(next().onPressed, isNull);
    expect(prev().onPressed, isNotNull);
    await t.runAsync(() => Trip.I.stop());
  });
}
