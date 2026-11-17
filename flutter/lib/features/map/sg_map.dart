// The live map's engine, behind one interface, so live_map.dart is the same code on every
// platform. On Android the map is MapLibre's own (the maplibre_gl plugin, native_map.dart); on
// Windows, macOS and Linux, where that plugin has no build, it is MapLibre GL JS, the same
// engine's JavaScript build, in a WebView (web/web_map_view.dart).
//
// SgMap is the widget live_map.dart puts on screen: it builds whichever engine this platform has,
// with the same options and callbacks MapLibreMap takes. SgMapController is the handle it gets
// back in onMapCreated: the calls live_map.dart makes on the map (sources, layers, the camera,
// taps), with maplibre_gl's own types, so nothing in live_map.dart needs to know which engine
// answers.
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import 'native_map.dart';
import 'web/web_map_view.dart';

/// The calls the live map makes on its map, answered by MapLibre's own controller on Android
/// (NativeSgMapController) and by the WebView's on the desktop (WebSgMapController). Each one
/// means what maplibre_gl's MapLibreMapController method of the same name means; the layer
/// calls' enableInteraction matters on Android only, and is ignored on the desktop.
abstract class SgMapController {
  /// Where the camera is now (centre, zoom, tilt and turn), as last reported by the map. Null
  /// until the map has said.
  CameraPosition? get cameraPosition;

  /// Adds a GeoJSON source called [sourceId] holding [geojson], for layers to draw from.
  Future<void> addGeoJsonSource(String sourceId, Map<String, dynamic> geojson, {String? promoteId});

  /// Replaces what the GeoJSON source [sourceId] holds with [geojson].
  Future<void> setGeoJsonSource(String sourceId, Map<String, dynamic> geojson);

  /// Adds a layer drawing lines from the source [sourceId].
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
  });

  /// Adds a layer drawing circles (dots) from the source [sourceId].
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
  });

  /// Adds a layer filling the shapes (such as accuracy rings) from the source [sourceId].
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
  });

  /// Moves the camera smoothly by [cameraUpdate], over [duration] if given. Completes when the
  /// move ends: true if it got there, false if something (another move, a drag) cut it short.
  Future<bool?> animateCamera(CameraUpdate cameraUpdate, {Duration? duration});

  /// Moves the camera by [cameraUpdate] at once, with no animation.
  Future<bool?> moveCamera(CameraUpdate cameraUpdate);

  /// Where on the map's widget, in logical pixels from its top left, [latLng] is drawn now.
  Future<math.Point<num>> toScreenLocation(LatLng latLng);

  /// The features drawn inside [rect] (logical pixels on the map's widget) by the layers
  /// [layerIds] (every layer when empty), each as a GeoJSON Feature map.
  Future<List<dynamic>> queryRenderedFeaturesInRect(Rect rect, List<String> layerIds, String? filter);

  /// How MapLibre's own location dot moves the camera: following you, turning with you, or not.
  /// The desktop has no such dot (the live map draws yours), so there it does nothing.
  Future<void> updateMyLocationTrackingMode(MyLocationTrackingMode myLocationTrackingMode);
}

/// The live map's map widget: MapLibre's own on Android, MapLibre GL JS in a WebView on the
/// desktop. It takes MapLibreMap's options and callbacks under the same names; the ones only
/// Android's map has (MapLibre's own location dot, tracking the camera's every move) are passed
/// to it unchanged and ignored on the desktop.
class SgMap extends StatelessWidget {
  /// Builds the map with MapLibreMap's options (see maplibre_gl for each one).
  const SgMap({
    super.key,
    required this.styleString,
    required this.initialCameraPosition,
    this.minMaxZoomPreference = MinMaxZoomPreference.unbounded,
    this.cameraTargetBounds = CameraTargetBounds.unbounded,
    this.trackCameraPosition = false,
    this.tiltGesturesEnabled = true,
    this.compassEnabled = true,
    this.compassViewPosition,
    this.compassViewMargins,
    this.myLocationEnabled = false,
    this.myLocationRenderMode = MyLocationRenderMode.normal,
    this.attributionButtonPosition = AttributionButtonPosition.bottomRight,
    this.onMapCreated,
    this.onStyleLoadedCallback,
    this.onMapClick,
    this.onCameraMove,
    this.onCameraIdle,
    this.onCameraTrackingDismissed,
  });

  /// Whether this platform's map is MapLibre GL JS in a WebView: the desktop apps. The same test
  /// as Desktop.on (desktop/desktop.dart), which the map can't import: its window packages don't
  /// compile under flutter test, and the map's tests import this file.
  static final bool inWebView =
      !kIsWeb && (Platform.isWindows || Platform.isMacOS || Platform.isLinux) && !Platform.environment.containsKey('FLUTTER_TEST');

  /// Whether the map draws your location dot itself (MapLibre's own, with its compass arrow).
  /// The desktop's doesn't, so the live map draws it, as MapPreview's is.
  static bool get drawsLocation => !inWebView;

  /// Whether there's a compass to turn the map with the way you face. A computer has none.
  static bool get hasCompass => !inWebView;

  /// Whether the phone's motion sensors (sensors_plus) can be asked, for the estimate of where
  /// you are with no GPS: sensors_plus has no desktop build, and asking fails there.
  static bool get hasMotionSensors => !inWebView;

  /// The map's style address: OpenFreeMap's Liberty (light) or Dark.
  final String styleString;
  final CameraPosition initialCameraPosition;
  final MinMaxZoomPreference minMaxZoomPreference;

  /// The box the camera's centre is kept inside.
  final CameraTargetBounds cameraTargetBounds;
  final bool trackCameraPosition;
  final bool tiltGesturesEnabled;
  final bool compassEnabled;
  final CompassViewPosition? compassViewPosition;
  final math.Point<num>? compassViewMargins;
  final bool myLocationEnabled;
  final MyLocationRenderMode myLocationRenderMode;
  final AttributionButtonPosition attributionButtonPosition;

  /// Called once the map is made, with its controller.
  final void Function(SgMapController controller)? onMapCreated;

  /// Called each time a style has loaded (at first, and after the light or dark style is
  /// swapped), when sources and layers can be added.
  final VoidCallback? onStyleLoadedCallback;
  final OnMapClickCallback? onMapClick;
  final OnCameraMoveCallback? onCameraMove;
  final VoidCallback? onCameraIdle;

  /// Called when a drag on the map ends MapLibre's tracking of you (on the desktop: whenever a
  /// drag, scroll or pinch moves the map).
  final VoidCallback? onCameraTrackingDismissed;

  /// Builds the WebView's map on the desktop and MapLibre's own on Android, the latter with
  /// exactly the options live_map.dart gave it before this interface existed.
  @override
  Widget build(BuildContext context) {
    if (inWebView) {
      return WebMapView(
        styleString: styleString,
        initialCameraPosition: initialCameraPosition,
        minMaxZoomPreference: minMaxZoomPreference,
        cameraTargetBounds: cameraTargetBounds,
        tiltGesturesEnabled: tiltGesturesEnabled,
        compassEnabled: compassEnabled,
        compassViewMargins: compassViewMargins,
        attributionButtonPosition: attributionButtonPosition,
        onMapCreated: onMapCreated,
        onStyleLoadedCallback: onStyleLoadedCallback,
        onMapClick: onMapClick,
        onCameraMove: onCameraMove,
        onCameraIdle: onCameraIdle,
        onCameraTrackingDismissed: onCameraTrackingDismissed,
      );
    }
    final created = onMapCreated;
    final styled = onStyleLoadedCallback;
    final idle = onCameraIdle;
    final dismissed = onCameraTrackingDismissed;
    return MapLibreMap(
      styleString: styleString,
      initialCameraPosition: initialCameraPosition,
      minMaxZoomPreference: minMaxZoomPreference,
      cameraTargetBounds: cameraTargetBounds,
      trackCameraPosition: trackCameraPosition,
      tiltGesturesEnabled: tiltGesturesEnabled,
      compassEnabled: compassEnabled,
      compassViewPosition: compassViewPosition,
      compassViewMargins: compassViewMargins,
      myLocationEnabled: myLocationEnabled,
      myLocationRenderMode: myLocationRenderMode,
      onCameraTrackingDismissed: dismissed == null ? null : () => dismissed(),
      attributionButtonPosition: attributionButtonPosition,
      onMapCreated: created == null ? null : (c) => created(NativeSgMapController(c)),
      onStyleLoadedCallback: styled == null ? null : () => styled(),
      onMapClick: onMapClick,
      onCameraMove: onCameraMove,
      onCameraIdle: idle == null ? null : () => idle(),
    );
  }
}
