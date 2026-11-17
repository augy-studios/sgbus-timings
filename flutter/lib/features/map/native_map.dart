// The live map's controller on Android: MapLibre's own (the maplibre_gl plugin), passed every call
// unchanged, so the phone's map behaves exactly as it did before the desktop's WebView map was
// added beside it (sg_map.dart).
import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import 'sg_map.dart';

/// The live map's SgMapController on Android: each call goes straight to maplibre_gl's
/// MapLibreMapController, with the same arguments and the same answer.
class NativeSgMapController implements SgMapController {
  /// Wraps MapLibre's own controller [map], as onMapCreated hands it over.
  NativeSgMapController(this.map);

  /// MapLibre's own controller.
  final MapLibreMapController map;

  @override
  CameraPosition? get cameraPosition => map.cameraPosition;

  @override
  Future<void> addGeoJsonSource(String sourceId, Map<String, dynamic> geojson, {String? promoteId}) =>
      map.addGeoJsonSource(sourceId, geojson, promoteId: promoteId);

  @override
  Future<void> setGeoJsonSource(String sourceId, Map<String, dynamic> geojson) => map.setGeoJsonSource(sourceId, geojson);

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
      map.addLineLayer(sourceId, layerId, properties,
          belowLayerId: belowLayerId, sourceLayer: sourceLayer, minzoom: minzoom, maxzoom: maxzoom, filter: filter, enableInteraction: enableInteraction);

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
      map.addCircleLayer(sourceId, layerId, properties,
          belowLayerId: belowLayerId, sourceLayer: sourceLayer, minzoom: minzoom, maxzoom: maxzoom, filter: filter, enableInteraction: enableInteraction);

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
      map.addFillLayer(sourceId, layerId, properties,
          belowLayerId: belowLayerId, sourceLayer: sourceLayer, minzoom: minzoom, maxzoom: maxzoom, filter: filter, enableInteraction: enableInteraction);

  @override
  Future<bool?> animateCamera(CameraUpdate cameraUpdate, {Duration? duration}) => map.animateCamera(cameraUpdate, duration: duration);

  @override
  Future<bool?> moveCamera(CameraUpdate cameraUpdate) => map.moveCamera(cameraUpdate);

  @override
  Future<math.Point<num>> toScreenLocation(LatLng latLng) => map.toScreenLocation(latLng);

  @override
  Future<List<dynamic>> queryRenderedFeaturesInRect(Rect rect, List<String> layerIds, String? filter) =>
      map.queryRenderedFeaturesInRect(rect, layerIds, filter);

  @override
  Future<void> updateMyLocationTrackingMode(MyLocationTrackingMode myLocationTrackingMode) => map.updateMyLocationTrackingMode(myLocationTrackingMode);
}
