// The live map's controller on the desktop: the SgMapController (sg_map.dart) whose calls go to
// MapLibre GL JS in the map's WebView (web_map_view.dart). Each call is sent as a numbered command
// (map_commands.dart) and its Future completes when the page posts the reply with that number,
// so `await addLineLayer(…)` means the layer is there, as on Android. The page's events (taps,
// camera moves, a style loaded) come in on the same channel and are handed to the view.
//
// It remembers the camera from the page's every move, so cameraPosition can answer at once, and
// the GeoJSON last sent to each source, so the live map's redraws (every second on a walk) don't
// send Explorer's 5,000 stops again when only your dot has moved.
//
// Calls still waiting when the page goes (the map closed, or the WebView reloaded) are left
// unanswered, as Android's are when its map goes: the live map makes many calls it doesn't wait
// for (its redraws, keeping you in view), and failing those would only report errors nobody can
// act on.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../sg_map.dart';
import 'map_commands.dart';

/// The desktop's SgMapController: MapLibre GL JS in a WebView, spoken to in JSON. The layer
/// calls' enableInteraction is Android's alone (which taps go to onMapClick there); the desktop's
/// map sends every click to onMapClick, as the live map wants.
class WebSgMapController implements SgMapController {
  /// A controller whose commands are run by [runJavaScript] (the WebView's, or a test's), each
  /// failing if it has no reply within [replyTimeout].
  WebSgMapController(this._runJavaScript, {this.replyTimeout = defaultReplyTimeout});

  final Future<void> Function(String script) _runJavaScript;

  /// The page's events other than replies (click, move, idle, style, gesture, link, longpress,
  /// error, ready), with what came with each; web_map_view.dart turns them into the map's
  /// callbacks.
  void Function(String event, Map<String, dynamic> data)? onEvent;

  /// How long a command may wait for its reply before it fails: far longer than any camera
  /// move the live map makes, so only a page that's stopped answering runs into it.
  static const defaultReplyTimeout = Duration(seconds: 30);
  final Duration replyTimeout;

  /// The commands sent and not yet answered, by number: each one's reply to complete, and the
  /// timer that fails it if no reply comes.
  final Map<int, ({Completer<Object?> reply, Timer timer})> _waiting = {};
  int _lastId = 0;
  CameraPosition? _camera;
  bool _closed = false;

  /// Each GeoJSON source's data as last sent (answered or not yet), as JSON, so the same again
  /// isn't re-sent.
  final Map<String, String> _sent = {};

  @override
  CameraPosition? get cameraPosition => _camera;

  /// Sends [command] to the page (with [data], already JSON, as its second argument) and waits
  /// for its reply: the reply's result, or a PlatformException with the page's error code, as
  /// maplibre_gl's own calls fail. After the map has closed, a call fails at once (MAP_CLOSED).
  @visibleForTesting
  Future<Object?> send(Map<String, Object?> command, {String? data}) async {
    if (_closed) throw PlatformException(code: 'MAP_CLOSED', message: 'The map has closed.');
    final id = ++_lastId;
    final reply = Completer<Object?>();
    final timer = Timer(replyTimeout, () {
      if (_waiting.remove(id) == null) return;
      reply.completeError(PlatformException(code: 'NO_REPLY', message: 'The map did not answer ${command['cmd']}.'));
    });
    _waiting[id] = (reply: reply, timer: timer);
    // The page can answer (with an error too) while runJavaScript is still under way, before the
    // caller is waiting: listened to from the start, so that isn't reported as an unhandled
    // error. The caller still gets it.
    unawaited(reply.future.then<void>((_) {}, onError: (Object _) {}));
    try {
      await _runJavaScript(MapCommands.script(id, command, data: data));
    } catch (e) {
      _waiting.remove(id)?.timer.cancel();
      throw PlatformException(code: 'SCRIPT_FAILED', message: '$e');
    }
    return reply.future;
  }

  /// Takes one message the page posted on its channel: a reply completes its command's Future,
  /// a camera that comes with it or with an event is remembered, and an event goes to [onEvent].
  void receive(String message) {
    final m = MapCommands.decode(message);
    if (m == null) return;
    final camera = MapCommands.cameraFrom(m['camera']);
    if (camera != null) _camera = camera;
    final id = m['reply'];
    if (id is num) {
      final waiting = _waiting.remove(id.toInt());
      if (waiting == null) return;
      waiting.timer.cancel();
      final reply = waiting.reply;
      if (m.containsKey('error')) {
        reply.completeError(PlatformException(code: '${m['code'] ?? 'ERROR'}', message: '${m['error']}'));
      } else {
        reply.complete(m['result']);
      }
      return;
    }
    final event = m['event'];
    if (event is String) onEvent?.call(event, m);
  }

  /// A style has loaded: its sources are new and empty, so every source's data must be sent in
  /// full again.
  void styleLoaded() => _sent.clear();

  /// The page has loaded afresh, or (with [closed]) the map has closed: the commands still
  /// waiting will never be answered, and are left so (their timers stopped), as Android leaves
  /// its calls when its map goes. After closing, new calls fail with MAP_CLOSED.
  void pageReset({bool closed = false}) {
    _closed = closed;
    _sent.clear();
    for (final waiting in _waiting.values) {
      waiting.timer.cancel();
    }
    _waiting.clear();
  }

  /// Sends the first set-up (MapCommands.init), and remembers its camera as the camera so far.
  Future<void> init(Map<String, Object?> command) async {
    _camera ??= MapCommands.cameraFrom(command['camera']);
    await send(command);
  }

  /// Swaps the style for the light or dark one, with [ground] behind it.
  Future<void> setStyle(String style, Color ground) => send(MapCommands.setStyle(style, ground));

  @override
  Future<void> addGeoJsonSource(String sourceId, Map<String, dynamic> geojson, {String? promoteId}) async {
    final data = jsonEncode(geojson);
    await _sendData(sourceId, data, MapCommands.addSource(sourceId, promoteId: promoteId));
  }

  /// Replaces the source's data, unless it's exactly what was sent last time.
  @override
  Future<void> setGeoJsonSource(String sourceId, Map<String, dynamic> geojson) async {
    final data = jsonEncode(geojson);
    if (_sent[sourceId] == data) return;
    await _sendData(sourceId, data, MapCommands.setSource(sourceId));
  }

  /// Sends a source's [data] with [command], remembered as sent from the moment it goes, so a
  /// change and a change back made while it's on its way are both sent. If it fails, it's
  /// forgotten again, so the next try sends it.
  Future<void> _sendData(String sourceId, String data, Map<String, Object?> command) async {
    _sent[sourceId] = data;
    try {
      await send(command, data: data);
    } catch (_) {
      if (_sent[sourceId] == data) _sent.remove(sourceId);
      rethrow;
    }
  }

  @override
  Future<void> addLineLayer(
    String sourceId,
    String layerId,
    LineLayerProperties properties, {
    String? belowLayerId,
    String? sourceLayer,
    double? minzoom,
    double? maxzoom,
    dynamic filter,
    bool enableInteraction = true,
  }) =>
      send(MapCommands.addLayer('line', sourceId, layerId, properties,
          belowLayerId: belowLayerId, sourceLayer: sourceLayer, minzoom: minzoom, maxzoom: maxzoom, filter: filter));

  @override
  Future<void> addCircleLayer(
    String sourceId,
    String layerId,
    CircleLayerProperties properties, {
    String? belowLayerId,
    String? sourceLayer,
    double? minzoom,
    double? maxzoom,
    dynamic filter,
    bool enableInteraction = true,
  }) =>
      send(MapCommands.addLayer('circle', sourceId, layerId, properties,
          belowLayerId: belowLayerId, sourceLayer: sourceLayer, minzoom: minzoom, maxzoom: maxzoom, filter: filter));

  @override
  Future<void> addFillLayer(
    String sourceId,
    String layerId,
    FillLayerProperties properties, {
    String? belowLayerId,
    String? sourceLayer,
    double? minzoom,
    double? maxzoom,
    dynamic filter,
    bool enableInteraction = true,
  }) =>
      send(MapCommands.addLayer('fill', sourceId, layerId, properties,
          belowLayerId: belowLayerId, sourceLayer: sourceLayer, minzoom: minzoom, maxzoom: maxzoom, filter: filter));

  /// Moves the camera smoothly; the page answers when the move ends, whether it arrived.
  @override
  Future<bool?> animateCamera(CameraUpdate cameraUpdate, {Duration? duration}) async {
    if (duration != null && duration.isNegative) throw ArgumentError.value(duration, 'duration', 'must not be negative');
    return _arrived(await send(MapCommands.camera(cameraUpdate, animate: true, duration: duration)));
  }

  /// Moves the camera at once.
  @override
  Future<bool?> moveCamera(CameraUpdate cameraUpdate) async => _arrived(await send(MapCommands.camera(cameraUpdate, animate: false)));

  /// A camera reply's "arrived", true unless the page said otherwise.
  bool _arrived(Object? result) => result is Map ? result['arrived'] != false : true;

  @override
  Future<math.Point<num>> toScreenLocation(LatLng latLng) async {
    final r = await send(MapCommands.project(latLng));
    if (r is! Map || r['x'] is! num || r['y'] is! num) throw PlatformException(code: 'BAD_REPLY', message: 'No point for $latLng.');
    return math.Point<double>((r['x'] as num).toDouble(), (r['y'] as num).toDouble());
  }

  @override
  Future<List<dynamic>> queryRenderedFeaturesInRect(Rect rect, List<String> layerIds, String? filter) async {
    final r = await send(MapCommands.query(rect, layerIds, filter));
    return r is List ? r : const [];
  }

  /// Nothing to do: the desktop's map has no location dot of its own to track (the live map
  /// draws yours and keeps it in view itself).
  @override
  Future<void> updateMyLocationTrackingMode(MyLocationTrackingMode myLocationTrackingMode) async {}
}
