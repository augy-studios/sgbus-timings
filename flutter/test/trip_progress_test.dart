// The trip notification's bar (trip_progress.dart): each part in proportion, you along it, and a marker
// for each Get Off Alert still to come.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/features/trips/trip_progress.dart';

TripLeg _leg(String kind, int stops, double minutes, {String? color}) => TripLeg(
      kind: kind,
      label: kind,
      to: 'There',
      points: [for (var i = 0; i <= stops; i++) [1.3 + i / 1000, 103.8]],
      names: const [],
      minutes: minutes,
      color: color,
    );

void main() {
  final trip = [_leg('walk', 1, 3), _leg('bus', 10, 20), _leg('train', 9, 25, color: '#009645'), _leg('walk', 1, 2)];

  test('the parts add up to the whole bar, each long enough to see', () {
    final sizes = TripProgress.lengths(trip);
    expect(sizes.reduce((a, b) => a + b), TripProgress.total);
    expect(sizes.every((s) => s >= 40), isTrue);
    expect(sizes[2], greaterThan(sizes[1]));
    expect(TripProgress.lengths([_leg('bus', 5, 10)]), [TripProgress.total]);
    expect(TripProgress.lengths(const []), isEmpty);
  });

  test('a very short part among long ones still adds up', () {
    final sizes = TripProgress.lengths([_leg('walk', 1, 0.2), _leg('train', 30, 90), _leg('walk', 1, 0.5)]);
    expect(sizes.reduce((a, b) => a + b), TripProgress.total);
    expect(sizes.first, 40);
  });

  test('colours are the line’s, the app’s green for a bus, grey for a walk', () {
    expect(TripProgress.colourOf(trip[2]), '#009645');
    expect(TripProgress.colourOf(trip[1]), '#3FAE5A');
    expect(TripProgress.colourOf(trip[0]), '#9AA7A0');
    expect(TripProgress.colourOf(_leg('train', 3, 5, color: 'green')), '#3FAE5A');
  });

  test('you move along the bar, part by part', () {
    final sizes = TripProgress.lengths(trip);
    final start = TripProgress.progress(trip, 0, 0, alertStops: 2, alerts: true);
    expect(start['at'], 0);
    expect(start['tracker'], 'walk');
    final onBus = TripProgress.progress(trip, 1, 5, alertStops: 2, alerts: true);
    expect(onBus['tracker'], 'bus');
    expect((onBus['at'] as int) - sizes[0], closeTo(sizes[1] / 2, 5));
    final end = TripProgress.progress(trip, 3, 1, alertStops: 2, alerts: true);
    expect(end['at'], TripProgress.total);
  });

  test('it stays on the bar whatever pos says', () {
    expect(TripProgress.progress(trip, 3, 99, alertStops: 2, alerts: true)['at'], TripProgress.total);
    expect(TripProgress.progress(trip, 0, -3, alertStops: 2, alerts: true)['at'], 0);
    expect(TripProgress.progress(trip, 9, 0, alertStops: 2, alerts: true), isEmpty);
  });

  test('a marker two stops before each ride’s end, for alerts still to come', () {
    final sizes = TripProgress.lengths(trip);
    final points = TripProgress.progress(trip, 0, 0, alertStops: 2, alerts: true)['points'] as List;
    expect(points, hasLength(2));
    expect((points[0] as Map)['at'], sizes[0] + (8 / 10 * sizes[1]).round());
  });

  test('no marker for an alert passed or sounded, a ride too short, or with alerts off', () {
    expect(TripProgress.progress(trip, 0, 0, alertStops: 2, alerts: false)['points'], isEmpty);
    expect(TripProgress.progress(trip, 0, 0, alertStops: 2, alerts: true, alerted: {1})['points'] as List, hasLength(1));
    expect(TripProgress.progress(trip, 1, 9, alertStops: 2, alerts: true)['points'] as List, hasLength(1));
    expect(TripProgress.progress([_leg('bus', 2, 5)], 0, 0, alertStops: 2, alerts: true)['points'], isEmpty);
  });

  test('never more parts or markers than Android draws', () {
    final long = [for (var i = 0; i < 20; i++) _leg('bus', 6, 5)];
    final bar = TripProgress.progress(long, 0, 0, alertStops: 2, alerts: true);
    expect(bar['segments'] as List, hasLength(1));
    expect(bar['points'] as List, hasLength(4));
  });

  test('the chip says stops on a ride, minutes otherwise, nothing once there', () {
    final bus = trip[1], walk = trip[0];
    expect(TripProgress.chip(leg: bus, boarded: true, stopsLeft: 3, minutesLeft: 25, last: false), '3 stops');
    expect(TripProgress.chip(leg: bus, boarded: true, stopsLeft: 1, minutesLeft: 25, last: false), '1 stop');
    expect(TripProgress.chip(leg: bus, boarded: false, stopsLeft: 3, minutesLeft: 25.4, last: false), '25 min');
    expect(TripProgress.chip(leg: walk, boarded: false, stopsLeft: 1, minutesLeft: 0.2, last: false), '1 min');
    expect(TripProgress.chip(leg: walk, boarded: false, stopsLeft: 0, minutesLeft: 0, last: true), '');
  });
}
