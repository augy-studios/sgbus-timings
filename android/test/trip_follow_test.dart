// How a trip follows you, as the site's js/trip.js does: waiting at the stop isn't riding, a fix that
// has you elsewhere puts it right, and the clock only goes where it can.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

// Stops about 400 m apart along a straight road north.
final _pts = [for (var i = 0; i < 8; i++) [1.30 + i * 0.0036, 103.80]];
final _names = [for (var i = 0; i < 8; i++) 'S$i'];

TripLeg _bus({List<List<double>>? pts, double minutes = 14}) => TripLeg(kind: 'bus', label: 'Bus 14', to: 'End', points: pts ?? _pts, names: _names, minutes: minutes);
TripLeg _train() => TripLeg(kind: 'train', label: 'EW Line', to: 'End', points: _pts, names: _names, minutes: 14);

var _now = DateTime.utc(2026, 10, 30, 1);
void _later(int seconds) => _now = _now.add(Duration(seconds: seconds));

Future<void> _start(List<TripLeg> legs) async {
  Store.memory();
  Native.available = false;
  Locate.fake = Fix(_pts[0][0], _pts[0][1]);
  _now = DateTime.utc(2026, 10, 30, 1);
  When.now = () => _now;
  Trip.I.paceState = null;
  await Trip.I.start(title: 'A trip', legs: legs);
}

void _at(List<double> p, {double accuracy = 10, double? speed, String? pace}) {
  if (pace != null) {
    Trip.I.paceState = pace;
    Trip.I.paceAt = When.nowMs();
  }
  Trip.I.onFix(Fix(p[0], p[1], accuracy: accuracy, speed: speed));
}

void _tick() => Trip.I.debugTick();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => Trip.I.stop());

  group('boarding', () {
    test('waiting at the stop is not riding, however long', () async {
      await _start([_bus()]);
      for (var i = 0; i < 40; i++) {
        _later(60);
        _at([_pts[0][0] + (i.isEven ? 0.0002 : -0.0002), _pts[0][1]]);
        _tick();
      }
      expect(Trip.I.boarded, isFalse);
      expect(Trip.I.pos, 0, reason: 'the clock waits with you');
      expect(Trip.I.alerted, isEmpty);
    });

    test('at a later stop: on board', () async {
      await _start([_bus()]);
      _at(_pts[0]);
      _later(60);
      _at(_pts[1]);
      expect(Trip.I.boarded, isTrue);
      expect(Trip.I.times[0]?.boardAt, isNotNull);
    });

    test('walking past a later stop is not boarding', () async {
      await _start([_bus()]);
      _at(_pts[0], pace: 'walking');
      _later(300);
      _at(_pts[1], pace: 'walking');
      expect(Trip.I.boarded, isFalse);
    });

    test('moving back up the route is something else coming to the stop', () async {
      // Stops 2 km apart, so halfway between two isn't at either, and it goes by the way you're moving.
      final far = [for (var i = 0; i < 8; i++) [1.30 + i * 0.018, 103.80]];
      await _start([_bus(pts: far)]);
      _at([far[3][0] + 0.009, far[3][1]], pace: 'still');
      expect(Trip.I.boarded, isFalse);
      _later(60);
      _at([far[1][0] + 0.009, far[1][1]], pace: 'riding');
      expect(Trip.I.boarded, isFalse);
    });
  });

  group('putting it right', () {
    test('a fix at the first stop after boarding: waiting again', () async {
      await _start([_bus()]);
      _at(_pts[0]);
      _later(30);
      _at(_pts[1]);
      expect(Trip.I.boarded, isTrue);
      _later(30);
      _at(_pts[0], speed: 0);
      expect(Trip.I.boarded, isFalse);
      expect(Trip.I.pos, 0);
      expect(Trip.I.times[0], isNull);
    });

    test('still moving past the first stop is not waiting', () async {
      await _start([_bus()]);
      _at(_pts[0]);
      _later(30);
      _at(_pts[1]);
      _later(30);
      _at(_pts[0], speed: 15);
      expect(Trip.I.boarded, isTrue);
    });

    test('the trip ahead of you: back to where you are, and the alert can go off again', () async {
      await _start([_bus()]);
      _at(_pts[0]);
      _later(30);
      _at(_pts[1]);
      _later(600);
      _at(_pts[6]);
      expect(Trip.I.alerted, contains(0));
      _later(600);
      _at(_pts[2]);
      expect(Trip.I.pos, closeTo(2, 0.1), reason: 'moved back');
      expect(Trip.I.alerted, isEmpty, reason: 'it can go off again');
      expect(Trip.I.realignedAt, When.nowMs());
    });

    test('a rough fix can put it right, but a wobble does not', () async {
      await _start([_bus()]);
      _at(_pts[0]);
      _later(30);
      _at(_pts[1]);
      _later(600);
      _at(_pts[5]);
      _later(30);
      _at(_pts[4], accuracy: 300);
      expect(Trip.I.pos, 5, reason: 'within what a rough fix can be off by');
      _at(_pts[1], accuracy: 300);
      expect(Trip.I.pos, closeTo(1, 0.01), reason: 'nowhere near where the trip had you');
    });
  });

  group('how far you could have got', () {
    test('a stray fix further on than a bus could have gone moves nothing', () async {
      await _start([_bus()]);
      _at(_pts[0]);
      _later(5);
      _at(_pts[1]);
      expect(Trip.I.boarded, isTrue);
      final was = Trip.I.pos;
      _later(5);
      _at(_pts[7]);
      expect(Trip.I.pos, was);
      expect(Trip.I.active, isTrue, reason: 'not arrived on a stray fix');
    });

    test('given the time, the same place counts', () async {
      await _start([_bus()]);
      _at(_pts[0]);
      _later(5);
      _at(_pts[1]);
      _later(300);
      _at(_pts[5]);
      expect(Trip.I.pos, closeTo(5, 0.01));
    });
  });

  group('the clock', () {
    test('a train with no fixes goes by the clock, from the end of its wait', () async {
      await _start([TripLeg(kind: 'train', label: 'EW Line', to: 'End', points: _pts, names: _names, minutes: 14, wait: 2)]);
      _later(60);
      _tick();
      expect(Trip.I.pos, 0, reason: 'still within its wait');
      _later(60 + 4 * 60);
      _tick();
      // 2 minutes a stop: 2 stops, 4 minutes after the wait.
      expect(Trip.I.pos, closeTo(2, 0.05));
      expect(Trip.I.boarded, isTrue);
      expect(Trip.I.alerted, isEmpty);
      _later(6 * 60);
      _tick();
      expect(Trip.I.alerted, contains(0));
    });

    test('a good fix off the leg holds the clock to about where it can be', () async {
      await _start([_train()]);
      _at([1.40, 103.90]);
      expect(Trip.I.pos, 0);
      _later(14 * 60);
      _at([1.40, 103.90]);
      _tick();
      expect(Trip.I.pos, lessThan(3));
      expect(Trip.I.active, isTrue);
    });

    test('a bus not boarded with location on: the clock waits; with none, it runs', () async {
      await _start([_bus()]);
      _later(14 * 60);
      _tick();
      expect(Trip.I.pos, 0);
      Trip.I.noLocation = true;
      _later(4 * 60);
      _tick();
      expect(Trip.I.pos, greaterThan(0));
      expect(Trip.I.boarded, isTrue);
    });
  });

  group('between parts', () {
    final second = [for (var i = 0; i < 6; i++) [1.30 + 7 * 0.0036, 103.80 + i * 0.0036]];
    TripLeg bus2() => TripLeg(kind: 'bus', label: 'Bus 60', to: 'End', points: second, names: const ['a', 'b', 'c', 'd', 'e', 'f'], minutes: 10);

    test('Back puts you where you were, not at the start, and Next where it was', () async {
      await _start([_bus(), bus2()]);
      _at(_pts[0]);
      _later(30);
      _at(_pts[2]);
      _later(60);
      _at([_pts[3][0] + 0.0018, _pts[3][1]]);
      final was = Trip.I.pos;
      Trip.I.step(1);
      expect(Trip.I.leg, 1);
      expect(Trip.I.pos, 0);
      Trip.I.step(-1);
      expect(Trip.I.leg, 0);
      expect(Trip.I.pos, was);
      expect(Trip.I.boarded, isTrue);
    });

    test('back to a part that had finished: from its start, and its alert can go off', () async {
      await _start([_bus(), bus2()]);
      _at(_pts[0]);
      _later(60);
      _at(_pts[1]);
      _later(600);
      _at(_pts[7]);
      expect(Trip.I.leg, 1, reason: 'off at its last stop, by the next first stop');
      Trip.I.step(-1);
      expect(Trip.I.leg, 0);
      expect(Trip.I.pos, 0);
      expect(Trip.I.boarded, isFalse);
      expect(Trip.I.alerted, isEmpty);
    });

    test('off a bus away from the next stop: it waits, and does not move on by itself', () async {
      final far = [for (var i = 0; i < 6; i++) [1.40, 103.80 + i * 0.0036]];
      await _start([_bus(), TripLeg(kind: 'bus', label: 'Bus 60', to: 'End', points: far, names: const ['a', 'b', 'c', 'd', 'e', 'f'], minutes: 10)]);
      _at(_pts[0]);
      _later(60);
      _at(_pts[1]);
      _later(600);
      _at(_pts[7]);
      expect(Trip.I.leg, 0);
      expect(Trip.I.active, isTrue);
    });

    test('a train to a train at an interchange: on by the clock, underground', () async {
      await _start([_train(), TripLeg(kind: 'train', label: 'NS Line', to: 'End', points: second, names: const ['a', 'b', 'c', 'd', 'e', 'f'], minutes: 10)]);
      _later(15 * 60);
      _tick();
      expect(Trip.I.leg, 1);
    });
  });

  group('across the Causeway', () {
    test('one ride becomes three parts, with the clearing as the wait', () async {
      Store.memory({'sgbus_customs': '30'});
      _now = DateTime.utc(2026, 10, 30, 1);
      When.now = () => _now;
      final codes = ['46009', '46101', '46211', '46229'];
      final pts = [for (var i = 0; i < 4; i++) [1.44 + i * 0.01, 103.77]];
      final parts = Trip.acrossTheCauseway([
        TripLeg(kind: 'bus', label: 'Bus 170', to: 'JB', points: pts, names: const ['Woodlands', 'Checkpoint', 'JB Checkpoint', 'JB Sentral'], minutes: 40, codes: codes, service: '170', board: '46009', alight: '46229'),
      ]);
      expect(parts, hasLength(3));
      expect(parts.map((p) => p.to), ['Checkpoint', 'JB Checkpoint', 'JB Sentral']);
      expect(parts[1].label, contains('across the Causeway'));
      expect(parts[1].wait, 15, reason: "half of the clearing, at Singapore's side");
      expect(parts[2].wait, 15, reason: "the other half, at Malaysia's");
      expect(parts.map((p) => p.board), ['46009', '46101', '46211']);
      expect(parts.map((p) => p.alight), ['46101', '46211', '46229']);
    });

    test('a ride that does not cross stays one', () {
      Store.memory();
      final leg = _bus();
      expect(Trip.acrossTheCauseway([leg]).single, same(leg));
    });
  });

  group('along a road', () {
    test('a stop index by distance along it, and null off it', () {
      final road = TripRoad.from([
        [1.30, 103.80],
        [1.31, 103.80],
        [1.31, 103.81],
      ], [0, 1100, 2200], 3)!;
      expect(road.along([1.305, 103.80], 0), closeTo(0.5, 0.05));
      expect(road.along([1.31, 103.805], 0), closeTo(1.5, 0.05));
      expect(road.along([1.40, 103.90], 0), isNull);
    });

    test('a road without one stop each is no use', () {
      expect(TripRoad.from([[1.30, 103.80], [1.31, 103.80]], [0, 1100], 3), isNull);
      expect(TripRoad.from(null, null, 3), isNull);
    });
  });
}
