// A trip from Navigate keeps its first walk when it starts at Your location (bug report
// 20261110-N63R): it started at the first ride, so the Get Off Alert came early.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/trips/trip.dart';

import 'shots/harness.dart';

const _raffles = NavEnd('One Raffles Place', 1.28435, 103.851073);
const _here = Fix(1.324736, 103.929256, accuracy: 8);

/// A way as the router gives one: a walk from where you set off to a stop, a bus, a walk to the end.
Map<String, dynamic> _way() => {
      'minutes': 30,
      'legs': [
        {'mode': 'walk', 'metres': 648, 'minutes': 9, 'to': {'kind': 'stop', 'code': '84031', 'name': 'Bedok Int', 'lat': 1.3249, 'lng': 103.9285}},
        {
          'mode': 'bus',
          'route': '14',
          'minutes': 18,
          'from': {'kind': 'stop', 'code': '84031', 'name': 'Bedok Int', 'lat': 1.3249, 'lng': 103.9285},
          'to': {'kind': 'stop', 'code': '03019', 'name': 'Raffles Pl', 'lat': 1.2846, 'lng': 103.8516},
          'path': [
            [1.3249, 103.9285],
            [1.2846, 103.8516],
          ],
          'names': ['Bedok Int', 'Raffles Pl'],
        },
        {'mode': 'walk', 'metres': 120, 'minutes': 2, 'to': {'kind': 'place'}},
      ],
    };

void main() {
  group('tripFromNav', () {
    test('from Your location, once found, the first part is the walk from there', () {
      final t = tripFromNav(_way(), NavEnd('Your location', _here.lat, _here.lng, here: true), _raffles)!;
      expect(t.legs.map((l) => l.kind), ['walk', 'bus', 'walk']);
      expect(t.legs.first.points.first, [_here.lat, _here.lng]);
      expect(t.legs.first.points.last, [1.3249, 103.9285]);
    });

    test('to Your location, once found, the last part is the walk there', () {
      final t = tripFromNav(_way(), const NavEnd('Bedok Mall', 1.324736, 103.929256), NavEnd('Your location', 1.28435, 103.851073, here: true))!;
      expect(t.legs.map((l) => l.kind), ['walk', 'bus', 'walk']);
    });

    test('Your location not yet found has no point to walk from', () {
      final t = tripFromNav(_way(), NavEnd.parse('here'), _raffles)!;
      expect(t.legs.first.kind, 'bus');
    });
  });

  testWidgets('Navigate keeps where Your location was when it planned, for Start trip', (t) async {
    await t.runAsync(() => stillData(state: const {'sgbus_tour': 'done', 'sgbus_tours': '["nav"]'}));
    Locate.fake = _here;
    final n = NavState.I
      ..from = NavEnd.parse('here')
      ..to = _raffles
      ..via = null
      ..when = null;
    await t.runAsync(n.run);
    expect(n.options, isNotEmpty);
    expect(n.from!.lat, 0, reason: 'Navigate keeps Your location as that, not a point');
    expect(n.plannedFrom!.here, isTrue);
    expect([n.plannedFrom!.lat, n.plannedFrom!.lng], [_here.lat, _here.lng]);
    // Every way that starts with a walk long enough to follow starts the trip with it.
    var walks = 0;
    for (final o in n.options) {
      final first = (o['legs'] as List).first as Map;
      if (first['mode'] != 'walk' || ((first['metres'] as num?) ?? 100) < 50) continue;
      final trip = tripFromNav(o, n.plannedFrom ?? n.from, n.plannedTo ?? n.to)!;
      expect(trip.legs.first.kind, 'walk');
      expect(trip.legs.first.points.first, [_here.lat, _here.lng]);
      walks++;
    }
    expect(walks, greaterThan(0), reason: 'the plan has a way that starts with a walk');
  });
}
