// The Get Off Alert's core (features/trips/trip.dart): fixes along a bus ride board it, the alert
// comes two stops before getting off, and the trip ends at the last stop, kept for Your trips.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('a ride, followed to the end', () async {
    Store.memory();
    Native.available = false;
    Locate.fake = const Fix(1.30, 103.80);
    // Six stops, about 400 m apart, along a straight road.
    final pts = [for (var i = 0; i < 6; i++) [1.30 + i * 0.0036, 103.80]];
    await Trip.I.start(title: 'To Stop 6', legs: [
      TripLeg(kind: 'bus', label: 'Bus 14', to: 'Stop 6', points: pts, names: [for (var i = 1; i <= 6; i++) 'Stop $i'], minutes: 12, service: '14'),
    ]);
    expect(Trip.I.active, isTrue);
    expect(Trip.I.stopsLeft(), 5);
    Trip.I.onFix(Fix(pts[1][0], pts[1][1], accuracy: 10));
    expect(Trip.I.boarded, isTrue, reason: 'well along the ride');
    expect(Trip.I.alerted, isEmpty);
    Trip.I.onFix(Fix(pts[3][0] + 0.0004, pts[3][1], accuracy: 10));
    expect(Trip.I.alerted, contains(0), reason: 'two stops before getting off');
    Trip.I.onFix(Fix(pts[5][0], pts[5][1], accuracy: 10));
    await Future<void>.delayed(Duration.zero);
    expect(Trip.I.active, isFalse, reason: 'arrived');
    final kept = Store.I.list(Trip.tripsKey);
    expect(kept, hasLength(1));
    expect((kept.first as Map)['arrived'], isTrue);
  });

  test('Change here: the ride cut short at a stop, then another way, with Undo', () async {
    Store.memory();
    Native.available = false;
    final pts = [for (var i = 0; i < 6; i++) [1.30 + i * 0.0036, 103.80]];
    await Trip.I.start(title: 'To Stop 6', legs: [
      TripLeg(kind: 'bus', label: 'Bus 14', to: 'Stop 6', points: pts, names: [for (var i = 1; i <= 6; i++) 'Stop $i'], minutes: 10, service: '14', codes: [for (var i = 1; i <= 6; i++) '0000$i']),
    ]);
    final cut = Trip.I.legs.first.cutAt(3);
    expect(cut.points, hasLength(4));
    expect(cut.to, 'Stop 4');
    expect(cut.alight, '00004');
    expect(cut.minutes, closeTo(6, 0.01));
    final walk = TripLeg(kind: 'walk', label: 'Walk', to: 'Somewhere', points: [pts[3], [1.31, 103.81]], names: ['Stop 4', 'Somewhere'], minutes: 5);
    Trip.I.replanAt(0, 3, [walk], note: 'Changed at Stop 4.');
    expect(Trip.I.legs.map((l) => l.to), ['Stop 4', 'Somewhere']);
    expect(Trip.I.switchedNote, 'Changed at Stop 4.');
    Trip.I.undo();
    expect(Trip.I.legs.map((l) => l.to), ['Stop 6']);
    await Trip.I.stop();
  });

  test('Are you walking?: asked once, at a pace no walk keeps up', () async {
    Store.memory();
    Native.available = false;
    var now = DateTime.utc(2026, 10, 7, 1);
    When.now = () => now;
    final asked = <double>[];
    Trip.askPace = asked.add;
    // A 3 km walk north.
    await Trip.I.start(title: 'Far', legs: [
      TripLeg(kind: 'walk', label: 'Walk', to: 'Far', points: [[1.30, 103.80], [1.327, 103.80]], names: ['Here', 'Far'], minutes: 36),
    ]);
    // 5 km/h for a minute: walking.
    for (var s = 0; s <= 60; s += 3) {
      now = DateTime.utc(2026, 10, 7, 1, 0, s);
      Trip.I.onFix(Fix(1.30 + s * 5 / 3.6 / 110540, 103.80, accuracy: 5));
    }
    expect(asked, isEmpty);
    // Then 20 km/h for a minute: not.
    final start = 1.30 + 60 * 5 / 3.6 / 110540;
    for (var s = 0; s <= 60; s += 3) {
      now = DateTime.utc(2026, 10, 7, 1, 1, s);
      Trip.I.onFix(Fix(start + s * 20 / 3.6 / 110540, 103.80, accuracy: 5));
    }
    expect(asked, hasLength(1));
    expect(asked.first, greaterThan(8));
    expect(Trip.I.paceAsked, isTrue);
    await Trip.I.stop();
    When.now = DateTime.now;
  });
}
