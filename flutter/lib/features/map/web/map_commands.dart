// What the desktop map's Dart side says to its page and how it reads the page's answers: each
// command as a small JSON object, sent as one line of JavaScript (`window.sgMap.run(…)`) that the
// page's map.js carries out, and each message the page posts back (a reply to a command, or an
// event such as a tap) read from JSON. Kept apart from the WebView so the tests can check every
// command without one (test/desktop/map_commands_test.dart).
//
// The values are maplibre_gl's own: a layer's properties are its toJson() (map.js splits them into
// MapLibre GL JS's `paint` and `layout`), a camera move is CameraUpdate.toJson() (such as
// ['newLatLngZoom', [lat, lng], zoom]), and a place is [lat, lng].
import 'dart:convert';
import 'dart:ui' show Color, Rect;

import 'package:maplibre_gl/maplibre_gl.dart';

/// Builds the commands map.js understands, and reads what it posts back.
class MapCommands {
  MapCommands._();

  /// The name of the JavaScript channel the page posts on (`SgMapChannel.postMessage(json)`).
  static const channel = 'SgMapChannel';

  /// The map's first set-up, once the page has loaded: its style, camera, zoom limits, the box
  /// the camera's centre stays in, and its controls. [ground] is the colour shown before the
  /// style draws (the theme's), as #rrggbb.
  static Map<String, Object?> init({
    required String style,
    required CameraPosition camera,
    double? minZoom,
    double? maxZoom,
    LatLngBounds? bounds,
    bool tilt = true,
    bool compass = true,
    List<num>? compassMargins,
    String attribution = 'bottomRight',
    required Color ground,
  }) =>
      {
        'cmd': 'init',
        'style': style,
        'camera': camera.toMap(),
        'minZoom': ?minZoom,
        'maxZoom': ?maxZoom,
        'bounds': ?bounds?.toList(),
        'tilt': tilt,
        'compass': compass,
        'compassMargins': ?compassMargins,
        'attribution': attribution,
        'ground': hex(ground),
      };

  /// Swaps the map's style (light and dark follow the app's theme); the page reports when the new
  /// one has loaded, and the live map adds its sources and layers again.
  static Map<String, Object?> setStyle(String style, Color ground) => {'cmd': 'setStyle', 'style': style, 'ground': hex(ground)};

  /// Adds a GeoJSON source. The GeoJSON itself goes as the run call's second argument (script).
  static Map<String, Object?> addSource(String sourceId, {String? promoteId}) => {'cmd': 'addSource', 'source': sourceId, 'promoteId': ?promoteId};

  /// Replaces a GeoJSON source's data, sent as the run call's second argument (script).
  static Map<String, Object?> setSource(String sourceId) => {'cmd': 'setSource', 'source': sourceId};

  /// Adds an image icons can name: a PNG, sent base64 as the run call's second argument (script),
  /// drawn at [pixelRatio] image pixels to a CSS pixel.
  static Map<String, Object?> addImage(String name, {double pixelRatio = 1}) => {'cmd': 'addImage', 'name': name, 'pixelRatio': pixelRatio};

  /// Adds a layer of [type] ('line', 'circle', 'fill' or 'symbol') drawing from [sourceId], with
  /// [properties] as maplibre_gl serialises them (toJson, nulls left out).
  static Map<String, Object?> addLayer(
    String type,
    String sourceId,
    String layerId,
    LayerProperties properties, {
    String? belowLayerId,
    String? sourceLayer,
    double? minzoom,
    double? maxzoom,
    Object? filter,
  }) =>
      {
        'cmd': 'addLayer',
        'type': type,
        'source': sourceId,
        'layer': layerId,
        'properties': properties.toJson(),
        'below': ?belowLayerId,
        'sourceLayer': ?sourceLayer,
        'minzoom': ?minzoom,
        'maxzoom': ?maxzoom,
        'filter': ?filter,
      };

  /// Moves the camera by [update]: smoothly over [duration] (the page's usual time when null) if
  /// [animate], else at once.
  static Map<String, Object?> camera(CameraUpdate update, {required bool animate, Duration? duration}) => {
        'cmd': 'camera',
        'update': update.toJson(),
        'animate': animate,
        'duration': ?duration?.inMilliseconds,
      };

  /// Asks where [at] is drawn on screen; answered with {x, y}.
  static Map<String, Object?> project(LatLng at) => {'cmd': 'project', 'at': at.toJson()};

  /// Asks for the features drawn in [rect] by [layerIds] (every layer when empty), with an
  /// optional [filter] (a JSON expression, as maplibre_gl takes it); answered with a list of
  /// GeoJSON Features.
  static Map<String, Object?> query(Rect rect, List<String> layerIds, String? filter) => {
        'cmd': 'query',
        'rect': [rect.left, rect.top, rect.right, rect.bottom],
        'layers': layerIds,
        'filter': ?filter,
      };

  /// The line of JavaScript that runs [command] as number [id], with [data] (already JSON: a
  /// source's GeoJSON) as its second argument. U+2028 and U+2029 are escaped as JSON allows but
  /// older JavaScript engines didn't, inside strings.
  static String script(int id, Map<String, Object?> command, {String? data}) {
    final json = jsonEncode({'id': id, ...command});
    final args = data == null ? json : '$json,$data';
    return 'window.sgMap.run(${_escapeSeparators(args)})';
  }

  /// [js] with the line and paragraph separators escaped.
  static String _escapeSeparators(String js) => js.replaceAll(_lineSeparator, r'\u2028').replaceAll(_paragraphSeparator, r'\u2029');

  /// U+2028 and U+2029, made from their numbers so the source holds no invisible characters.
  static final _lineSeparator = String.fromCharCode(0x2028);
  static final _paragraphSeparator = String.fromCharCode(0x2029);

  /// A message the page posted, as a map: a reply ({reply: id, result} or {reply: id, error,
  /// code}) or an event ({event: name, …}). Null for anything else.
  static Map<String, dynamic>? decode(String message) {
    try {
      final m = jsonDecode(message);
      return m is Map<String, dynamic> ? m : null;
    } catch (_) {
      return null;
    }
  }

  /// A camera the page reported ({target: [lat, lng], zoom, bearing, tilt}), or null if it
  /// isn't one.
  static CameraPosition? cameraFrom(Object? json) {
    if (json is! Map) return null;
    final target = json['target'];
    if (target is! List || target.length < 2 || target[0] is! num || target[1] is! num) return null;
    double n(Object? v) => v is num ? v.toDouble() : 0;
    return CameraPosition(
      target: LatLng((target[0] as num).toDouble(), (target[1] as num).toDouble()),
      zoom: n(json['zoom']),
      bearing: n(json['bearing']),
      tilt: n(json['tilt']),
    );
  }

  /// [c] as #rrggbb, as the page's CSS takes it.
  static String hex(Color c) => '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
}
