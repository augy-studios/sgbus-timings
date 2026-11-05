// The Get Off Alert's core (features/trips/trip.dart): fixes along a bus ride board it, the alert
// comes two stops before getting off, and the trip ends at the last stop, kept for Your trips.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
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
}
