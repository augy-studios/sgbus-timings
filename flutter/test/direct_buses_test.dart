// A bus leg's stop timings are for every bus that goes straight to where it's left, not only the
// leg's own: from Navigate's "65 timings at …" button (directAlong) and from a stop tapped on the
// trip's timeline (busesAt, the site's in js/trip.js). The case from the report: 65 from Opp
// Mattar Stn Exit B (70231) to Bef Siemens Ctr (60219), which 61 and 154 also go straight to.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/network.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/features/trips/trip_timeline.dart';

Object? _gz(String n) => jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/$n.json.gz').readAsBytesSync())));

List<String> _run(String no, String from, String to) {
  for (final dir in BusNet.directions(no)) {
    final stops = BusNet.runStops(no, dir);
    final i = stops.indexOf(from);
    final j = i == -1 ? -1 : stops.indexOf(to, i + 1);
    if (j != -1) return stops.sublist(i, j + 1);
  }
  return const [];
}

void main() {
  setUpAll(() => BusNet.index(Map<String, dynamic>.from(_gz('bus-routes') as Map)));

  const from = '70231', to = '60219';
  late final codes = _run('65', from, to);
  TripLeg leg() => TripLeg(kind: 'bus', label: 'Bus 65', to: 'Bef Siemens Ctr', points: [for (final _ in codes) [1.3, 103.8]], names: codes,
      minutes: 9, service: '65', board: from, alight: to, codes: codes);

  test("the report's 65 rides from 70231 to 60219", () {
    expect(codes.length, greaterThan(2));
  });

  test("Navigate's timings button: the leg's own bus first, then every other direct one", () {
    final buses = directAlong({'route': '65', 'from': {'code': from}, 'to': {'code': to}});
    expect(buses.first, '65');
    expect(buses, containsAll(['61', '154']));
  });

  test("the timeline's boarding stop: the same buses", () {
    final at = busesAt(leg(), from).split(',');
    expect(at.first, '65');
    expect(at.toSet(), {'65', ...Trip.directBuses(leg())});
    expect(at, containsAll(['61', '154']));
  });

  test('a stop further along: only the direct buses that call there', () {
    for (final code in codes.skip(1)) {
      final at = busesAt(leg(), code).split(',');
      expect(at.first, '65', reason: code);
      for (final no in at.skip(1)) {
        expect(_run(no, code, to).isNotEmpty || code == to, isTrue, reason: '$no at $code');
      }
    }
  });

  test('a leg without its stops is just its own bus', () {
    final bare = TripLeg(kind: 'bus', label: 'Bus 65', to: 'x', points: const [], names: const [], minutes: 9, service: '65');
    expect(busesAt(bare, from), '65');
  });
}
