// The desktop map's commands to its page and its reading of the page's messages
// (lib/features/map/web/map_commands.dart): what map.js is sent for each call the live map makes.
import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:sgbus_timings/features/map/web/map_commands.dart';

/// The arguments of a `window.sgMap.run(…)` line, as a list: the command, and the data if any.
List<dynamic> runArgs(String script) {
  expect(script, startsWith('window.sgMap.run('));
  expect(script, endsWith(')'));
  return jsonDecode('[${script.substring('window.sgMap.run('.length, script.length - 1)}]') as List;
}

// Places use numbers a double holds exactly (1.375, 103.75): maplibre_gl's LatLng wraps its
// longitude by arithmetic, so 103.8 comes back as 103.80000000000001.
void main() {
  group('layers', () {
    test("a line layer's properties go as maplibre_gl's toJson, layout and paint together", () {
      final c = MapCommands.addLayer(
        'line',
        'sg-line',
        'sg-line-dash',
        const LineLayerProperties(lineColor: ['get', 'color'], lineWidth: 5, lineCap: 'round', lineJoin: 'round', lineDasharray: [0.4, 2.2], lineSortKey: ['get', 'z']),
        filter: ['==', ['get', 'dash'], true],
        minzoom: 14,
      );
      expect(c['cmd'], 'addLayer');
      expect(c['type'], 'line');
      expect(c['source'], 'sg-line');
      expect(c['layer'], 'sg-line-dash');
      expect(c['properties'], {
        'line-color': ['get', 'color'],
        'line-width': 5,
        'line-dasharray': [0.4, 2.2],
        'line-cap': 'round',
        'line-join': 'round',
        'line-sort-key': ['get', 'z'],
      });
      expect(c['filter'], ['==', ['get', 'dash'], true]);
      expect(c['minzoom'], 14);
      expect(c.containsKey('maxzoom'), isFalse);
      expect(c.containsKey('below'), isFalse);
    });

    test('a circle layer leaves out the properties it was not given', () {
      final c = MapCommands.addLayer('circle', 'sg-dot', 'sg-dot', const CircleLayerProperties(circleRadius: ['get', 'radius'], circleColor: '#ffffff'));
      expect(c['properties'], {'circle-radius': ['get', 'radius'], 'circle-color': '#ffffff'});
    });

    test("a fill layer's properties", () {
      final c = MapCommands.addLayer('fill', 'sg-fill', 'sg-fill', const FillLayerProperties(fillColor: ['get', 'fill'], fillOpacity: ['get', 'opacity']));
      expect(c['type'], 'fill');
      expect(c['properties'], {'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'opacity']});
    });
  });

  group('the camera', () {
    test("a move goes as maplibre_gl's CameraUpdate, [lat, lng] and all", () {
      final c = MapCommands.camera(CameraUpdate.newLatLngZoom(const LatLng(1.375, 103.75), 15), animate: true, duration: const Duration(milliseconds: 600));
      expect(c, {
        'cmd': 'camera',
        'update': ['newLatLngZoom', [1.375, 103.75], 15.0],
        'animate': true,
        'duration': 600,
      });
    });

    test('a move at once has no duration', () {
      final c = MapCommands.camera(CameraUpdate.bearingTo(0), animate: false);
      expect(c, {'cmd': 'camera', 'update': ['bearingTo', 0.0], 'animate': false});
    });

    test("a fit to a box keeps maplibre_gl's padding order: left, top, right, bottom", () {
      final u = CameraUpdate.newLatLngBounds(LatLngBounds(southwest: const LatLng(1.25, 103.625), northeast: const LatLng(1.5, 104.0)), left: 60, right: 80, top: 120, bottom: 200);
      expect(MapCommands.camera(u, animate: true)['update'], [
        'newLatLngBounds',
        [
          [1.25, 103.625],
          [1.5, 104.0],
        ],
        60.0,
        120.0,
        80.0,
        200.0,
      ]);
    });

    test('a camera the page reported is read back, and anything else is not', () {
      final c = MapCommands.cameraFrom({
        'target': [1.3, 103.8],
        'zoom': 15,
        'bearing': 90,
        'tilt': 30,
      });
      expect(c, const CameraPosition(target: LatLng(1.3, 103.8), zoom: 15, bearing: 90, tilt: 30));
      expect(MapCommands.cameraFrom(null), isNull);
      expect(MapCommands.cameraFrom({'target': 'here'}), isNull);
      expect(MapCommands.cameraFrom({'zoom': 3}), isNull);
    });
  });

  group('the set-up', () {
    test('style, camera, zoom limits, box, compass and credits', () {
      final c = MapCommands.init(
        style: 'https://tiles.openfreemap.org/styles/liberty',
        camera: const CameraPosition(target: LatLng(1.375, 103.75), zoom: 11),
        minZoom: 9,
        maxZoom: 19,
        bounds: LatLngBounds(southwest: const LatLng(0.875, 103.25), northeast: const LatLng(1.75, 104.5)),
        tilt: false,
        compassMargins: [16, 200],
        attribution: 'bottomLeft',
        ground: const Color(0xFF1E2326),
      );
      expect(c['cmd'], 'init');
      expect(c['style'], 'https://tiles.openfreemap.org/styles/liberty');
      expect(c['camera'], {
        'bearing': 0.0,
        'target': [1.375, 103.75],
        'tilt': 0.0,
        'zoom': 11.0,
      });
      expect(c['minZoom'], 9);
      expect(c['maxZoom'], 19);
      expect(c['bounds'], [
        [0.875, 103.25],
        [1.75, 104.5],
      ]);
      expect(c['tilt'], false);
      expect(c['compassMargins'], [16, 200]);
      expect(c['attribution'], 'bottomLeft');
      expect(c['ground'], '#1e2326');
    });

    test('no zoom limits or box: left out', () {
      final c = MapCommands.init(style: 's', camera: const CameraPosition(target: LatLng(1, 103)), ground: Colors.white);
      expect(c.containsKey('minZoom'), isFalse);
      expect(c.containsKey('bounds'), isFalse);
      expect(c['ground'], '#ffffff');
    });
  });

  group('the line of JavaScript', () {
    test('the command, numbered, then its data', () {
      final script = MapCommands.script(7, MapCommands.setSource('sg-dot'), data: '{"type":"FeatureCollection","features":[]}');
      expect(runArgs(script), [
        {'id': 7, 'cmd': 'setSource', 'source': 'sg-dot'},
        {'type': 'FeatureCollection', 'features': <Object>[]},
      ]);
    });

    test('no data: the command alone', () {
      expect(runArgs(MapCommands.script(1, MapCommands.project(const LatLng(1.25, 103.5)))), [
        {
          'id': 1,
          'cmd': 'project',
          'at': [1.25, 103.5],
        },
      ]);
    });

    test('line and paragraph separators in a name are escaped', () {
      final script = MapCommands.script(2, MapCommands.addSource('a\u2028b\u2029c'));
      expect(script.contains(String.fromCharCode(0x2028)), isFalse);
      expect(script.contains(String.fromCharCode(0x2029)), isFalse);
      expect((runArgs(script).first as Map)['source'], 'a\u2028b\u2029c');
    });

    test('a query: the box as left, top, right, bottom', () {
      final c = MapCommands.query(const Rect.fromLTRB(90, 190, 110, 210), ['sg-dot', 'sg-poi-stop'], null);
      expect(c, {
        'cmd': 'query',
        'rect': [90.0, 190.0, 110.0, 210.0],
        'layers': ['sg-dot', 'sg-poi-stop'],
      });
    });
  });

  test("the page's messages: JSON objects only", () {
    expect(MapCommands.decode('{"reply":3,"result":null}'), {'reply': 3, 'result': null});
    expect(MapCommands.decode('{"event":"style"}'), {'event': 'style'});
    expect(MapCommands.decode('[1,2]'), isNull);
    expect(MapCommands.decode('not json'), isNull);
  });
}
