import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:sgbus_timings/features/map/orbit_handle.dart';

void main() {
  const from = CameraPosition(target: LatLng(1.28, 103.85), zoom: 15, tilt: 30, bearing: 10);

  test('up tilts further and down flattens, over the same spot', () {
    final up = orbited(from, const Offset(0, -20));
    expect(up.tilt, 40);
    expect(up.bearing, 10);
    expect(up.target, from.target);
    expect(up.zoom, 15);
    expect(orbited(from, const Offset(0, 20)).tilt, 20);
  });

  test('sideways turns without tilting', () {
    final right = orbited(from, const Offset(10, 0));
    expect(right.bearing, 18);
    expect(right.tilt, 30);
    expect(orbited(from, const Offset(-10, 0)).bearing, 2);
  });

  test('the tilt stops at flat and at 60, and the bearing goes round', () {
    expect(orbited(from, const Offset(0, -500)).tilt, 60);
    expect(orbited(from, const Offset(0, 500)).tilt, 0);
    expect(orbited(from, const Offset(-50, 0)).bearing, 330);
  });

  testWidgets('a drag reports all its way and its end; a tap only says what it is', (tester) async {
    var dragged = Offset.zero;
    var started = 0;
    var ended = 0;
    var tapped = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: OrbitHandle(
            label: 'Handle',
            builder: (held) => const SizedBox(width: 48, height: 48),
            onStart: () => started++,
            onDrag: (d) => dragged += d,
            onEnd: () => ended++,
            onTap: () => tapped++,
          ),
        ),
      ),
    ));

    await tester.tap(find.byType(OrbitHandle));
    expect(tapped, 1);
    expect(started, 0);

    final g = await tester.startGesture(tester.getCenter(find.byType(OrbitHandle)));
    await g.moveBy(const Offset(0, -30));
    await tester.pump();
    await g.moveBy(const Offset(200, 0));
    await tester.pump();
    expect(started, 1);
    expect(dragged, const Offset(200, -30));
    expect(ended, 0);

    await g.up();
    await tester.pump();
    expect(ended, 1);
  });
}
