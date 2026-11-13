// A trip moving on by itself to a later ride a fix shows you already on (Trip._rideAhead, the site's
// rideAhead in js/trip.js), and not when you aren't on it.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

// Stops about 400 m apart, north up one road, and then east along another.
final _north = [for (var i = 0; i < 6; i++) [1.30 + i * 0.0036, 103.80]];
final _east = [for (var i = 0; i < 6; i++) [1.30 + 5 * 0.0036, 103.80 + i * 0.0036]];
// Away from both: where a walk ends that you never got to.
final _elsewhere = [1.30, 103.83];

TripLeg _bus(List<List<double>> pts, String no) => TripLeg(kind: 'bus', label: 'Bus $no', to: 'End', points: pts, names: [for (var i = 0; i < pts.length; i++) 'S$i'], minutes: 10);
TripLeg _train(List<List<double>> pts) => TripLeg(kind: 'train', label: 'EW Line', to: 'End', points: pts, names: [for (var i = 0; i < pts.length; i++) 'S$i'], minutes: 10);
TripLeg _walk(List<double> a, List<double> b) => TripLeg(kind: 'walk', label: 'Walk', to: 'End', points: [a, b], names: const ['a', 'b'], minutes: 5);

var _now = DateTime.utc(2026, 10, 30, 1);

void _later(int seconds) => _now = _now.add(Duration(seconds: seconds));

void _at(List<double> p, {String? pace, double accuracy = 10, double? speed}) {
  final t = Trip.I;
  if (pace != null) {
    t.paceState = pace;
    t.paceAt = When.nowMs();
  }
  t.onFix(Fix(p[0], p[1], accuracy: accuracy, speed: speed));
}

Future<void> _start(List<TripLeg> legs) async {
  Store.memory();
  Native.available = false;
  Locate.fake = Fix(_north[0][0], _north[0][1]);
  _now = DateTime.utc(2026, 10, 30, 1);
  When.now = () => _now;
  Trip.I.paceState = null;
  await Trip.I.start(title: 'A trip', legs: legs);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => Trip.I.stop());

  group('from a walk', () {
    test('on the bus already: on to it, on board, though the walk never got to its end', () async {
      await _start([_walk(_north[0], _elsewhere), _bus(_north, '14')]);
      _at(_north[0], pace: 'still');
      expect(Trip.I.leg, 0);
      _later(60);
      _at(_north[4], pace: 'riding');
      expect(Trip.I.leg, 1, reason: 'half a stop and more down its route');
      expect(Trip.I.boarded, isTrue);
      expect(Trip.I.pos, closeTo(4, 0.1));
      expect(Trip.I.times[1]?.boardAt, isNotNull);
    });

    test('still walking: not on it, past a later stop or not', () async {
      await _start([_walk(_north[0], _elsewhere), _bus(_north, '14')]);
      _at(_north[0], pace: 'walking');
      _later(120);
      _at(_north[2], pace: 'walking');
      expect(Trip.I.leg, 0);
      expect(Trip.I.boarded, isFalse);
    });

    test("with no word on your pace, it takes being much further from the walk's end", () async {
      await _start([_walk(_north[1], _elsewhere), _bus(_north, '14')]);
      _at(_north[1]);
      _later(60);
      // Past a later stop, about 400 m on, but barely further from the walk's end than you were.
      final barely = [_north[1][0] + 0.0005, _north[1][1]];
      _at(barely);
      expect(Trip.I.leg, 0);
      _later(60);
      _at(_north[5]);
      expect(Trip.I.leg, 1);
    });

    test('at the first stop, waiting: not on it yet', () async {
      await _start([_walk(_elsewhere, _north[0]), _bus(_north, '14')]);
      _at(_north[0], pace: 'still');
      expect(Trip.I.leg, 1, reason: "the walk's over, by reaching its end");
      expect(Trip.I.boarded, isFalse);
    });

    test('a rough fix moves nothing', () async {
      await _start([_walk(_north[0], _elsewhere), _bus(_north, '14')]);
      _at(_north[0], pace: 'still');
      _later(60);
      _at(_north[2], pace: 'riding', accuracy: 200);
      expect(Trip.I.leg, 0);
    });
  });

  group('from a ride', () {
    test('off it and going down the next: on to that one', () async {
      await _start([_bus(_north, '14'), _train(_east)]);
      _at(_north[3]);
      expect(Trip.I.boarded, isTrue);
      _later(60);
      _at(_east[1]);
      _later(30);
      expect(Trip.I.leg, 0, reason: 'not yet: one fix on it could be anything');
      _at(_east[3]);
      expect(Trip.I.leg, 1);
      expect(Trip.I.boarded, isTrue);
      expect(Trip.I.pos, closeTo(3, 0.1));
    });

    test('still on the ride, where the two run together: stays on it', () async {
      final shared = [for (var i = 0; i < 6; i++) [1.30 + i * 0.0036, 103.8001]];
      await _start([_bus(_north, '14'), _train(shared)]);
      _at(_north[1]);
      _later(60);
      _at(_north[3]);
      expect(Trip.I.leg, 0);
    });

    test('coming the other way into where the next one starts: still the first', () async {
      await _start([_train(_north), _bus(_east, '60')]);
      _at(_north[1]);
      _later(60);
      // Off the train's line, but going back up the bus's route, towards its first stop.
      _at(_east[4]);
      _later(30);
      _at(_east[2]);
      expect(Trip.I.leg, 0);
    });

    test('past a walk, on to the ride after it', () async {
      await _start([_bus(_north, '14'), _walk(_north[5], _east[0]), _train(_east)]);
      _at(_north[3]);
      _later(60);
      _at(_east[1]);
      _later(30);
      _at(_east[3]);
      expect(Trip.I.leg, 2);
      expect(Trip.I.boarded, isTrue);
    });
  });

  group('at the end of a ride', () {
    // Its last stop, and the next ride's first, 200 m apart.
    final next = [for (var i = 0; i < 6; i++) [1.30 + 5 * 0.0036 + 0.0018, 103.80 + i * 0.0036]];

    test('off a bus near the next first stop: on to it, waiting', () async {
      await _start([_bus(_north, '14'), _bus(next, '60')]);
      _at(_north[3]);
      _at(_north[5]);
    });

    test('a train at speed past there stays the train', () async {
      await _start([_train(_north), _bus(next, '60')]);
      _at(_north[4]);
      final short = [_north[5][0] - 0.001, _north[5][1]];
      _at(short, speed: 20);
      expect(Trip.I.leg, 0);
    });

    test('off a train, stopped, near the next first stop: on to it', () async {
      await _start([_train(_north), _bus(next, '60')]);
      _at(_north[4]);
      final short = [_north[5][0] - 0.0012, _north[5][1]];
      _at(short, speed: 0);
      expect(Trip.I.pos, greaterThanOrEqualTo(4));
    });
  });

  test('a trip with one ride goes on as before', () async {
    await _start([_bus(_north, '14')]);
    _at(_north[1]);
    _later(60);
    _at(_elsewhere);
    expect(Trip.I.leg, 0);
    expect(Trip.I.active, isTrue);
  });

  test('alongLeg', () {
    expect(Trip.alongLeg(_north, _north[2], 0), closeTo(2, 0.01));
    expect(Trip.alongLeg(_north, [_north[2][0] + 0.0018, 103.80], 0), closeTo(2.5, 0.01));
    expect(Trip.alongLeg(_north, _elsewhere, 0), isNull);
  });
}
