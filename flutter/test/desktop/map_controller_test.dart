// The desktop map's controller (lib/features/map/web/web_map_controller.dart), with the page's
// side played by the test: each call sends its command, and completes, fails or moves the camera
// by the reply that comes back, as the live map's calls do on Android.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:sgbus_timings/features/map/web/web_map_controller.dart';

/// A controller with a pretend page: every script it runs is kept in [sent], decoded. [during],
/// if given, runs while the script is still running (the page answering early), and
/// [replyTimeout] is how long a call waits.
class Rig {
  Rig({void Function(Rig rig)? during, Duration replyTimeout = WebSgMapController.defaultReplyTimeout}) {
    map = WebSgMapController((script) async {
      final args = jsonDecode('[${script.substring('window.sgMap.run('.length, script.length - 1)}]') as List;
      sent.add((command: args.first as Map<String, dynamic>, data: args.length > 1 ? args[1] : null));
      if (during != null) {
        during(this);
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    }, replyTimeout: replyTimeout);
  }

  late final WebSgMapController map;
  final sent = <({Map<String, dynamic> command, Object? data})>[];

  /// The page's reply to the last command sent.
  void reply(Object? result, {Map<String, dynamic>? camera}) =>
      map.receive(jsonEncode({'reply': sent.last.command['id'], 'result': result, 'camera': ?camera}));

  /// The page's error for the last command sent.
  void fail(String code, String message) => map.receive(jsonEncode({'reply': sent.last.command['id'], 'error': message, 'code': code}));
}

const empty = {'type': 'FeatureCollection', 'features': <Object>[]};

void main() {
  test('adding a source sends its GeoJSON, and completes on the reply', () async {
    final r = Rig();
    var done = false;
    final added = r.map.addGeoJsonSource('sg-dot', empty).then((_) => done = true);
    await pumpEventQueue();
    expect(r.sent.single.command, {'id': 1, 'cmd': 'addSource', 'source': 'sg-dot'});
    expect(r.sent.single.data, empty);
    expect(done, isFalse);
    r.reply(null);
    await added;
    expect(done, isTrue);
  });

  test("the same data again isn't sent again, until a new style's empty sources need it", () async {
    final r = Rig();
    final first = r.map.setGeoJsonSource('sg-dot', empty);
    await pumpEventQueue();
    r.reply(null);
    await first;
    await r.map.setGeoJsonSource('sg-dot', empty);
    expect(r.sent, hasLength(1));

    r.map.styleLoaded();
    final again = r.map.setGeoJsonSource('sg-dot', empty);
    await pumpEventQueue();
    expect(r.sent, hasLength(2));
    r.reply(null);
    await again;
  });

  test('a change and a change back while the first is on its way are both sent', () async {
    final r = Rig();
    const one = {
      'type': 'FeatureCollection',
      'features': [
        {'type': 'Feature', 'geometry': null, 'properties': {'i': 1}},
      ],
    };
    final first = r.map.setGeoJsonSource('sg-dot', empty);
    await pumpEventQueue();
    r.reply(null);
    await first;
    // [one] goes out and isn't answered yet; then the data goes back to [empty].
    final second = r.map.setGeoJsonSource('sg-dot', one);
    await pumpEventQueue();
    final third = r.map.setGeoJsonSource('sg-dot', empty);
    await pumpEventQueue();
    expect(r.sent.map((s) => s.data), [empty, one, empty]);
    r.map.receive(jsonEncode({'reply': r.sent[1].command['id'], 'result': null}));
    r.reply(null);
    await Future.wait([second, third]);
  });

  test("a send that failed is forgotten, so the same data's tried again", () async {
    final r = Rig();
    final first = r.map.setGeoJsonSource('sg-dot', empty);
    await pumpEventQueue();
    r.fail('SOURCE_NOT_FOUND', 'No source "sg-dot"');
    await expectLater(first, throwsA(isA<PlatformException>()));
    final again = r.map.setGeoJsonSource('sg-dot', empty);
    await pumpEventQueue();
    expect(r.sent, hasLength(2));
    r.reply(null);
    await again;
  });

  test('a layer goes with its type and properties', () async {
    final r = Rig();
    final added = r.map.addCircleLayer('sg-poi', 'sg-poi-stop', const CircleLayerProperties(circleColor: '#ffffff'), minzoom: 14, filter: ['==', ['get', 'kind'], 'stop'], enableInteraction: false);
    await pumpEventQueue();
    expect(r.sent.single.command, {
      'id': 1,
      'cmd': 'addLayer',
      'type': 'circle',
      'source': 'sg-poi',
      'layer': 'sg-poi-stop',
      'properties': {'circle-color': '#ffffff'},
      'minzoom': 14.0,
      'filter': ['==', ['get', 'kind'], 'stop'],
    });
    r.reply(null);
    await added;
  });

  test("the page's error fails the call as maplibre_gl's would", () async {
    final r = Rig();
    final added = r.map.addLineLayer('nowhere', 'x', const LineLayerProperties());
    await pumpEventQueue();
    r.fail('SOURCE_NOT_FOUND', 'No source "nowhere"');
    await expectLater(added, throwsA(isA<PlatformException>().having((e) => e.code, 'code', 'SOURCE_NOT_FOUND')));
  });

  test('a camera move: whether it arrived, and the camera after it', () async {
    final r = Rig();
    expect(r.map.cameraPosition, isNull);
    final moved = r.map.animateCamera(CameraUpdate.newLatLng(const LatLng(1.3, 103.8)), duration: const Duration(milliseconds: 500));
    await pumpEventQueue();
    expect(r.sent.single.command['animate'], true);
    expect(r.sent.single.command['duration'], 500);
    r.reply({'arrived': false}, camera: {
      'target': [1.31, 103.81],
      'zoom': 16,
      'bearing': 0,
      'tilt': 0,
    });
    expect(await moved, isFalse);
    expect(r.map.cameraPosition?.target, const LatLng(1.31, 103.81));
    expect(r.map.cameraPosition?.zoom, 16);
  });

  test('a negative duration is refused before anything is sent', () {
    final r = Rig();
    expect(() => r.map.animateCamera(CameraUpdate.zoomIn(), duration: const Duration(milliseconds: -1)), throwsArgumentError);
    expect(r.sent, isEmpty);
  });

  test('where a place is on screen', () async {
    final r = Rig();
    final at = r.map.toScreenLocation(const LatLng(1.3, 103.8));
    await pumpEventQueue();
    r.reply({'x': 120.5, 'y': 300});
    final p = await at;
    expect(p.x, 120.5);
    expect(p.y, 300);
  });

  test('what was drawn round a tap comes back as GeoJSON features', () async {
    final r = Rig();
    final hits = r.map.queryRenderedFeaturesInRect(const Rect.fromLTRB(0, 0, 20, 20), ['sg-dot'], null);
    await pumpEventQueue();
    r.reply([
      {
        'type': 'Feature',
        'properties': {'i': 3},
      },
    ]);
    final got = await hits;
    expect((got.single as Map)['properties'], {'i': 3});
  });

  test("tracking your location sends nothing: the desktop's map has no dot of its own", () async {
    final r = Rig();
    await r.map.updateMyLocationTrackingMode(MyLocationTrackingMode.tracking);
    expect(r.sent, isEmpty);
  });

  test('events go to onEvent, a moving camera remembered on the way', () {
    final r = Rig();
    final events = <String>[];
    r.map.onEvent = (name, data) => events.add(name);
    r.map.receive(jsonEncode({
      'event': 'move',
      'camera': {
        'target': [1.29, 103.85],
        'zoom': 14,
        'bearing': 45,
        'tilt': 20,
      },
    }));
    r.map.receive('{"event":"click","x":1,"y":2,"lat":1.3,"lng":103.8}');
    r.map.receive('not json');
    expect(events, ['move', 'click']);
    expect(r.map.cameraPosition, const CameraPosition(target: LatLng(1.29, 103.85), zoom: 14, bearing: 45, tilt: 20));
  });

  test("an error the page sends before the script has finished reaches the caller, and isn't reported unhandled", () async {
    final uncaught = <Object>[];
    await runZonedGuarded(() async {
      final r = Rig(during: (rig) => rig.fail('STYLE_NOT_READY', 'The style has not loaded yet'));
      await expectLater(r.map.addFillLayer('sg-fill', 'sg-fill', const FillLayerProperties()),
          throwsA(isA<PlatformException>().having((e) => e.code, 'code', 'STYLE_NOT_READY')));
      await pumpEventQueue();
    }, (e, _) => uncaught.add(e));
    expect(uncaught, isEmpty);
  });

  test('a call with no reply fails after the reply time', () async {
    final r = Rig(replyTimeout: const Duration(milliseconds: 50));
    await expectLater(r.map.moveCamera(CameraUpdate.zoomTo(12)), throwsA(isA<PlatformException>().having((e) => e.code, 'code', 'NO_REPLY')));
  });

  test('calls still waiting when the map closes are left unanswered, reporting nothing', () async {
    final uncaught = <Object>[];
    var answered = false;
    await runZonedGuarded(() async {
      final r = Rig(replyTimeout: const Duration(milliseconds: 50));
      // As live_map.dart's _keepInView and _push do: not waited for.
      unawaited(r.map.animateCamera(CameraUpdate.zoomTo(12)).then((_) => answered = true));
      unawaited(r.map.setGeoJsonSource('sg-dot', empty).then((_) => answered = true));
      await pumpEventQueue();
      r.map.pageReset(closed: true);
      // Past the reply time: nothing fails, as each one's timer stopped with the map.
      await Future<void>.delayed(const Duration(milliseconds: 120));
    }, (e, _) => uncaught.add(e));
    expect(uncaught, isEmpty);
    expect(answered, isFalse);
  });

  test('a page that reloads leaves its calls unanswered too, and takes new ones', () async {
    final r = Rig();
    unawaited(r.map.moveCamera(CameraUpdate.zoomTo(12)));
    await pumpEventQueue();
    r.map.pageReset();
    final next = r.map.moveCamera(CameraUpdate.zoomTo(13));
    await pumpEventQueue();
    r.reply({'arrived': true});
    expect(await next, isTrue);
  });

  test('a closed map refuses new calls', () async {
    final r = Rig();
    r.map.pageReset(closed: true);
    await expectLater(r.map.moveCamera(CameraUpdate.zoomTo(12)), throwsA(isA<PlatformException>().having((e) => e.code, 'code', 'MAP_CLOSED')));
    expect(r.sent, isEmpty);
  });
}
