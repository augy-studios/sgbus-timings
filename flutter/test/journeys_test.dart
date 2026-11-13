// The route planner's journeys (data/journeys.dart) against the real network: the same answers
// the site's js/journeys.js and the bot give for a few routes.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/journeys.dart';
import 'package:sgbus_timings/data/network.dart';
import 'package:sgbus_timings/data/stops.dart';

Object? _gz(String name) => jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/$name.json.gz').readAsBytesSync())));

void main() {
  setUpAll(() {
    Stops.useRows(_gz('bus-stops') as List);
    BusNet.index(Map<String, dynamic>.from(_gz('bus-routes') as Map));
  });

  test('a direct bus from Bedok Int', () {
    final d = Journeys.directServices('84009', '17009');
    expect(d, contains('14'));
  });

  test('the same journeys as the site', () {
    _site.forEach((route, want) {
      final [a, b] = route.split('>');
      expect(Journeys.findJourneys(a, b).map((l) => l.map((x) => x.bus).join('>')).join(', '), want, reason: route);
    });
  });

  test('journeys with changes, best first', () {
    final sw = Stopwatch()..start();
    final js = Journeys.findJourneys('84009', '28009');
    expect(js, isNotEmpty);
    for (final legs in js) {
      expect(legs, isNotEmpty);
      expect(Journeys.journeyMinutes(legs, '84009', '28009'), isNotNull);
    }
    expect(js.map((l) => l.map((x) => x.bus).join('>')).join(', '), _site['84009>28009'], reason: 'as the site finds them');
    expect(sw.elapsedMilliseconds, lessThan(5000));
  });
}

// The site's js/journeys.js on the same network, run under Node (the parity check in the commit
// that ported it), found these.
const _site = {
  '84009>28009': '67>41, 7>197, 7A>197, 2>197, 7>99>333',
  '84009>17009': '7, 30e>7, 7>282, 7A>7, 30>7',
  '46009>75009': '168>127, 168A>127, 168>68, 168A>68, 168>72',
};
