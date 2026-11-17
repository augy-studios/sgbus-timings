// What a tap on the map opens, and pages clearing Android's navigation bar.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/map/live_map.dart';
import 'package:sgbus_timings/widgets/common.dart';

void main() {
  const stopNear = MapPick.stop('11111');
  const stopFar = MapPick.stop('22222');
  const campus = MapPick.campus('nus:kv');
  const station = MapPick.station('Bishan', ['NS17'], 1.351, 103.848);
  MapPoi poi(String kind, double lat, MapPick pick) => MapPoi(kind, lat, 103.848, pick: pick);

  group('tappedPick', () {
    test('a dot that says what it is comes first', () {
      final dot = MapDot([1.35, 103.848], fill: Colors.red, pick: stopFar);
      expect(tappedPick([dot], [poi('station', 1.35, station)], 1.35, 103.848), stopFar);
    });

    test('a station comes before a nearer stop', () {
      expect(tappedPick(const [], [poi('stop', 1.35, stopNear), poi('station', 1.3501, station)], 1.35, 103.848), station);
    });

    test('otherwise the stop nearest the tap, an LTA one or a campus one', () {
      expect(tappedPick(const [], [poi('stop', 1.3505, stopFar), poi('campus', 1.3501, campus)], 1.35, 103.848), campus);
      expect(tappedPick(const [], [poi('stop', 1.3501, stopNear), poi('campus', 1.3505, campus)], 1.35, 103.848), stopNear);
    });

    test('a dot with only a label, or nothing, opens no card', () {
      final dot = MapDot([1.35, 103.848], fill: Colors.red, label: 'Stop 3');
      expect(tappedPick([dot], const [], 1.35, 103.848), isNull);
      expect(tappedPick(const [], const [], 1.35, 103.848), isNull);
    });
  });

  testWidgets('a page ends above the navigation bar', (tester) async {
    const bar = 48.0;
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(padding: const EdgeInsets.only(bottom: bar)),
          child: child!,
        ),
        home: SgScaffold(title: 'Settings', body: Container(key: const Key('body'))),
      ),
    );
    final screen = tester.getSize(find.byType(Scaffold));
    expect(tester.getBottomLeft(find.byKey(const Key('body'))).dy, screen.height - bar);
  });
}
