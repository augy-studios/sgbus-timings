// The estimate of how far you've gone with no GPS: readings made up as a car, a jam and a walk
// give them, from a seeded random so it comes out the same every time.
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/geo.dart';
import 'package:sgbus_timings/features/map/dead_reckon.dart';

const _forward = [0.0, 0.8, 0.6]; // the phone's forward, on a tilted mount

class _Ride {
  _Ride(this.r);
  final DeadReckon r;
  final _rnd = math.Random(42);
  int at = 1000000;

  /// [secs] of driving, [noise] the vibration, [push] along the phone's forward; GPS speed if given.
  void run(double secs, {double noise = 0.5, double push = 0, double? gps}) {
    final steps = (secs * 16).round();
    for (var k = 0; k < steps; k++) {
      at += 62;
      double n() => (_rnd.nextDouble() - 0.5) * 2 * noise * 1.7;
      r.motion(n() + push * _forward[0], n() + push * _forward[1], n() + push * _forward[2], at);
      if (k % 16 == 15) {
        if (gps != null) r.fix(speed: gps, accuracy: 8, at: at);
        r.advance(at);
      }
    }
  }
}

void main() {
  group('with no fixes', () {
    test('driving on carries on at the speed you were going', () {
      final r = DeadReckon();
      final ride = _Ride(r);
      ride.run(10, gps: 22);
      expect(r.lost, isFalse);
      ride.run(5);
      expect(r.lost, isFalse, reason: 'not yet: one fix missed is nothing');
      ride.run(115);
      expect(r.lost, isTrue);
      // 120 s at 22 m/s is 2640 m.
      expect(r.travelled, closeTo(2640, 150));
      expect(r.speed, closeTo(22, 2));
    });

    test('a jam in the tunnel stops it, and pulling away brings it back', () {
      final r = DeadReckon();
      final ride = _Ride(r);
      ride.run(10, gps: 22);
      ride.run(30);
      expect(r.lost, isTrue);
      ride.run(10, noise: 0.03);
      expect(r.stopped, isTrue);
      expect(r.speed, 0);
      final there = r.travelled;
      ride.run(60, noise: 0.03);
      expect(r.travelled, there, reason: 'sitting in a jam goes nowhere');
      ride.run(30);
      expect(r.stopped, isFalse);
      expect(r.speed, closeTo(22, 2));
      expect(r.travelled, greaterThan(there + 300));
    });

    test('with no accelerometer it carries on at the last speed', () {
      final r = DeadReckon();
      var at = 1000000;
      r.fix(speed: 20, accuracy: 8, at: at);
      for (var k = 0; k < 10; k++) {
        at += 1000;
        r.advance(at);
      }
      expect(r.lost, isTrue);
      expect(r.travelled, closeTo(200, 1));
    });

    test('never past 15 minutes', () {
      final r = DeadReckon();
      var at = 1000000;
      r.fix(speed: 20, accuracy: 8, at: at);
      r.advance(at + 10000);
      expect(r.lost, isTrue);
      r.advance(at + DeadReckon.maxLostMs + 1000);
      expect(r.lost, isFalse);
    });
  });

  group('the fixes', () {
    test('a good one ends the estimate, and a rough one does not', () {
      final r = DeadReckon();
      var at = 1000000;
      r.fix(speed: 20, accuracy: 8, at: at);
      at += 20000;
      r.advance(at);
      expect(r.lost, isTrue);
      r.fix(speed: 20, accuracy: 300, at: at);
      expect(r.lost, isTrue, reason: 'a rough fix in a tunnel is not GPS back');
      expect(r.travelled, greaterThan(0));
      r.fix(speed: 19, accuracy: 10, at: at + 1000);
      expect(r.lost, isFalse);
      expect(r.travelled, 0);
      expect(r.speed, 19);
    });

    test('standing still, when fixes stop as they do, is not losing them', () {
      final r = DeadReckon();
      final ride = _Ride(r);
      ride.run(5, gps: 0);
      ride.run(120, noise: 0.3);
      expect(r.lost, isFalse);
      expect(r.travelled, 0);
    });

    test('a walker who stops, phone in hand, is stopped', () {
      final r = DeadReckon();
      final ride = _Ride(r);
      ride.run(10, noise: 1.5, gps: 1.4);
      ride.run(40, noise: 0.2);
      expect(r.stopped, isTrue);
      expect(r.speed, 0);
    });
  });

  group('braking', () {
    DeadReckon taught(_Ride ride) {
      final r = ride.r;
      // Speeding up and slowing down, the phone pushed along its forward each time.
      var v = 15.0;
      for (var k = 0; k < 6; k++) {
        final push = k.isEven ? 1.5 : -1.5;
        for (var s = 0; s < 3; s++) {
          v += push;
          ride.run(1, noise: 0.1, push: push, gps: v);
        }
      }
      return r;
    }

    test('the fixes teach which way is forward', () {
      final ride = _Ride(DeadReckon());
      expect(ride.r.forward, isNull);
      final r = taught(ride);
      final f = r.forward!;
      expect(f[1], closeTo(_forward[1], 0.15));
      expect(f[2], closeTo(_forward[2], 0.15));
    });

    test('braking with no GPS slows the estimate, and it drifts back', () {
      final ride = _Ride(DeadReckon());
      final r = taught(ride);
      ride.run(5, gps: 20);
      ride.run(8);
      expect(r.lost, isTrue);
      final before = r.speed;
      ride.run(4, noise: 0.2, push: -3);
      expect(r.speed, lessThan(before - 5));
      ride.run(120);
      expect(r.speed, closeTo(r.cruise, 2), reason: 'an error never lasts');
    });

    test('a knock forgets forward, as the phone has been moved', () {
      final ride = _Ride(DeadReckon());
      final r = taught(ride);
      expect(r.forward, isNotNull);
      r.motion(20, 0, 0, ride.at + 62);
      expect(r.forward, isNull);
    });
  });

  test('pointAlong walks a path', () {
    final path = [
      [1.30, 103.80],
      [1.30, 103.81],
      [1.31, 103.81],
    ];
    expect(pointAlong(path, 0, metresAB), path.first);
    expect(pointAlong(path, 1e9, metresAB), path.last);
    final firstLeg = metresAB(path[0], path[1]);
    final mid = pointAlong(path, firstLeg / 2, metresAB);
    expect(mid[0], closeTo(1.30, 1e-9));
    expect(mid[1], closeTo(103.805, 1e-6));
    final past = pointAlong(path, firstLeg + 100, metresAB);
    expect(past[1], closeTo(103.81, 1e-6));
    expect(metresAB(past, path[1]), closeTo(100, 2));
  });
}
