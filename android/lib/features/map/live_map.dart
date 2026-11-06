// The live map (the site's js/map.js and js/map-engine.js): full screen, following where you are,
// drawn by MapLibre over OpenFreeMap's vector tiles (Liberty in light mode, Dark in dark mode),
// the buildings standing up in 3D when it's tilted with two fingers. It takes the place of
// sending you off to Google Maps, in five ways:
//
//   LiveMap.walkTo(place)  walking directions to a stop or place, turn by turn, from where you
//                          are (a stop's Directions, a walk in Navigate, #map/ links), by bike
//                          (cycle) or car (drive) for Navigate's Cycle it and Drive it. The route
//                          is /api/walk's, asked for again if you stray from it.
//   LiveMap.trip()         the trip being followed (features/trips/trip.dart): every ride and
//                          walk on it, the stops, where you get off, and you. A bus ride along its
//                          road (/api/road), a train along its track (data/rail_tracks.dart), a
//                          walk along its streets.
//   LiveMap.follow(data)   someone's shared trip: where they are, the way they're going and
//                          where to, updated as their link is.
//   LiveMap.explore()      Explorer, from its Edge Tray button: every bus stop and MRT and LRT
//                          station as a dot over the lines in their colours, and you. A tap on a
//                          dot opens its card (map_card.dart). Layers turns each off or on
//                          (sgbus_explorer_layers); Save the map keeps Singapore's for offline
//                          (map_save.dart).
//   LiveMap.traffic(...)   the traffic on a bus's way: its road, orange where it's slow and red
//                          where it's jammed, by LTA's live speeds (/api/traffic), its incidents.
//
// It opens at street level on you and keeps following; a drag stops that, Recentre goes back to
// it, Overview shows the whole way. Your dot is MapLibre's own, its arrow turning with the
// phone's compass; Turn the map with the way you face turns the map with it.
//
// Where the platform's map can't be drawn (tests and the guide's screenshots), MapPreview draws
// the same lines and dots on a plain ground, so every panel round it can still be seen.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/campus.dart';
import '../../data/geo.dart';
import '../../data/location.dart';
import '../../data/rail_tracks.dart';
import '../../data/stations.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../nav/doors.dart' show lineColour;
import '../nav/nav_page.dart';
import '../timings/stop_screen.dart';
import '../trips/trip.dart';
import 'map_card.dart';
import '../tour/tour.dart';
import 'map_save.dart';

// ---------- what's drawn ----------

class MapLine {
  MapLine(this.points, {required this.color, this.width = 5, this.opacity = 1, this.dash = false, this.z = 0});
  List<List<double>> points;
  final Color color;
  final double width;
  final double opacity;
  final bool dash;
  final int z;
}

class MapDot {
  MapDot(this.at, {required this.fill, this.stroke = Colors.white, this.radius = 7, this.weight = 3, this.fillOpacity = 1, this.label, this.pick, this.z = 0});
  List<double> at;
  final Color fill;
  final Color stroke;
  final double radius;
  final double weight;
  final double fillOpacity;
  final String? label;
  final MapPick? pick;
  final int z;
}

/// A disc of so many metres round a point, as a fill: an accuracy ring.
class MapDisc {
  MapDisc(this.at, this.metres, {required this.fill, this.opacity = 0.15});
  List<double> at;
  double metres;
  final Color fill;
  final double opacity;
}

/// A stop or station on the map, for Explorer: a dot from its zoom on.
class MapPoi {
  const MapPoi(this.kind, this.lat, this.lng, {required this.pick, this.color, this.colors = const []});
  final String kind; // stop, station, campus
  final double lat;
  final double lng;
  final MapPick pick;
  final Color? color;
  final List<Color> colors; // an interchange's lines
}

/// What a dot is, for its card.
class MapPick {
  const MapPick.stop(this.code)
      : kind = 'stop',
        name = null,
        codes = const [],
        lat = null,
        lng = null;
  const MapPick.station(String this.name, this.codes, double this.lat, double this.lng)
      : kind = 'station',
        code = null;
  /// A shuttle bus stop LTA hasn't got, by its key (data/campus.dart).
  const MapPick.campus(String this.code)
      : kind = 'campus',
        name = null,
        codes = const [],
        lat = null,
        lng = null;
  final String kind;
  final String? code;
  final String? name;
  final List<String> codes;
  final double? lat;
  final double? lng;

  String get key => kind == 'station' ? 'station:${codes.join('/')}' : '$kind:$code';
}

/// Everything over the map, in groups, as js/map-engine.js keeps it.
class MapInk extends ChangeNotifier {
  final Map<String, List<MapLine>> lines = {};
  final Map<String, List<MapDot>> dots = {};
  final Map<String, List<MapDisc>> discs = {};
  List<({Color color, List<List<double>> points})> rails = [];
  List<({String key, String uni, Color color, List<List<double>> points})> shuttles = [];
  List<MapPoi> pois = [];
  Set<String> off = {}; // layers turned off: stops, stations, rails, shuttles, campus

  MapLine line(String group, List<List<double>> pts, {required Color color, double width = 5, double opacity = 1, bool dash = false, int z = 0}) {
    final l = MapLine(pts, color: color, width: width, opacity: opacity, dash: dash, z: z);
    (lines[group] ??= []).add(l);
    notifyListeners();
    return l;
  }

  MapDot dot(String group, List<double> at, {required Color fill, Color stroke = Colors.white, double radius = 7, double weight = 3, double fillOpacity = 1, String? label, MapPick? pick, int z = 0}) {
    final d = MapDot(at, fill: fill, stroke: stroke, radius: radius, weight: weight, fillOpacity: fillOpacity, label: label, pick: pick, z: z);
    (dots[group] ??= []).add(d);
    notifyListeners();
    return d;
  }

  MapDisc disc(String group, List<double> at, double metres, {required Color fill, double opacity = 0.15}) {
    final d = MapDisc(at, metres, fill: fill, opacity: opacity);
    (discs[group] ??= []).add(d);
    notifyListeners();
    return d;
  }

  void clear(String group) {
    lines.remove(group);
    dots.remove(group);
    discs.remove(group);
    notifyListeners();
  }

  void clearAll() {
    lines.clear();
    dots.clear();
    discs.clear();
    rails = [];
    pois = [];
    notifyListeners();
  }

  void changed() => notifyListeners();

  Iterable<MapLine> get allLines => lines.values.expand((l) => l);
  Iterable<MapDot> get allDots => dots.values.expand((l) => l);
  Iterable<MapDisc> get allDiscs => discs.values.expand((l) => l);
}

String _hex(Color c) => '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

List<double> _lngLat(List<double> p) => [p[1], p[0]];

/// A disc as a polygon of 32 points, for MapLibre's fill.
List<List<double>> discRing(List<double> at, double metres) {
  final out = <List<double>>[];
  final dLat = metres / 110540;
  final dLng = metres / (111320 * math.cos(at[0] * math.pi / 180));
  for (var k = 0; k <= 32; k++) {
    final a = k / 32 * 2 * math.pi;
    out.add([at[1] + dLng * math.cos(a), at[0] + dLat * math.sin(a)]);
  }
  return out;
}

// ---------- the live map ----------

enum MapMode { walk, trip, follow, explore, traffic }

class LiveMap extends StatefulWidget {
  const LiveMap(this.mode, {super.key, this.place, this.from, this.cycle = false, this.drive = false, this.followData, this.trafficPts, this.trafficTitle, this.trafficNames, this.title});
  final MapMode mode;
  final ({double lat, double lng, String label, String? code})? place;
  final ({double lat, double lng})? from;
  final bool cycle;
  final bool drive;
  final Map<String, dynamic>? followData;
  final List<List<double>>? trafficPts;
  final String? trafficTitle;
  final List<String>? trafficNames;
  final String? title;

  static const layersKey = 'sgbus_explorer_layers';
  static const streetZoom = 18.0;
  static const exploreZoom = 15.0;
  static const stationZoom = 10.0;
  static const stopZoom = 14.0;
  static const campusZoom = 13.0;
  static const styleLight = 'https://tiles.openfreemap.org/styles/liberty';
  static const styleDark = 'https://tiles.openfreemap.org/styles/dark';

  static const walkColour = Color(0xFF2F7DFF);
  static const cycleColour = Color(0xFF0B8F8A);
  static const driveColour = Color(0xFF5C6B7A);
  static const busColour = Color(0xFF1F9D55);
  static const trainColour = Color(0xFF7A4FD6);
  static const meColour = Color(0xFF2F7DFF);
  static const themColour = Color(0xFFE8590C);
  static const doneColour = Color(0xFF9AA7A0);
  static const flagColour = Color(0xFFD6336C);
  static const jammed = Color(0xFFD1242F);
  static const slow = Color(0xFFF08C00);
  static const clear = Color(0xFF1F9D55);

  /// For tests and screenshots: draw MapPreview in place of the platform's map.
  static bool preview = false;

  /// The live map's screen open now, if any (one at a time).
  static _LiveMapState? _open;
  static bool get isOpen => _open != null;

  static Future<void> _push(LiveMap m) async {
    if (_open != null) Navigator.of(_open!.context).pop();
    await AppNav.push(m, name: 'map');
  }

  static Future<void> walkTo({required double lat, required double lng, String? label, String? code, ({double lat, double lng})? from, bool cycle = false, bool drive = false, String? title}) =>
      _push(LiveMap(MapMode.walk,
          place: (lat: lat, lng: lng, label: label ?? tr('map.destination', 'Your destination'), code: code), from: from, cycle: cycle && !drive, drive: drive, title: title));

  static Future<void> trip() => Trip.I.active ? _push(const LiveMap(MapMode.trip)) : Future.value();
  static Future<void> follow(Map<String, dynamic> data, {String? title}) => _push(LiveMap(MapMode.follow, followData: data, title: title));
  static void updateFollow(Map<String, dynamic> data) => _open?._updateFollow(data);
  static Future<void> explore() => _push(const LiveMap(MapMode.explore));
  static Future<void> traffic(List<List<double>> points, {String? title, List<String>? names}) =>
      points.length < 2 ? Future.value() : _push(LiveMap(MapMode.traffic, trafficPts: points, trafficTitle: title, trafficNames: names));

  static List<List<double>> pathOf(Object? p) => _LiveMapState.pathOf(p);

  /// The app's links and buttons that open it (features/registry.dart).
  static void register() {
    AppNav.register('explorer', (_) => explore());
    AppNav.register('walkTo', (a) {
      final s = Stops.of('${a['code']}');
      if (s?.lat != null) walkTo(lat: s!.lat!, lng: s.lng!, label: s.name, code: s.code);
    });
    AppNav.register('mapStop', (a) {
      final s = Stops.of('${a['code']}');
      if (s?.lat != null) {
        walkTo(lat: s!.lat!, lng: s.lng!, label: s.name, code: s.code);
      } else {
        Stops.load().then((_) {
          final t = Stops.of('${a['code']}');
          if (t?.lat != null) walkTo(lat: t!.lat!, lng: t.lng!, label: t.name, code: t.code);
        });
      }
    });
    AppNav.register('mapPlace', (a) {
      // 1.3245,103.9295~Bedok Mall
      final parts = '${a['place']}'.split('~');
      final ll = parts.first.split(',').map(double.tryParse).toList();
      if (ll.length != 2 || ll.contains(null)) return;
      walkTo(lat: ll[0]!, lng: ll[1]!, label: parts.length > 1 ? Uri.decodeComponent(parts.sublist(1).join('~')) : null);
    });
    AppNav.register('traffic', (a) {
      // 1.3245,103.9295;1.3262,103.9301;...~Bus 21 to Blk 390
      final parts = '${a['points']}'.split('~');
      final pts = [
        for (final p in parts.first.split(';'))
          if (p.split(',').map(double.tryParse).toList() case [final double la, final double lo]) [la, lo],
      ];
      traffic(pts, title: parts.length > 1 ? Uri.decodeComponent(parts.sublist(1).join('~')) : null);
    });
    AppNav.register('mapGo', (a) {
      final to = a['to'] as NavEnd?;
      final from = a['from'] as NavEnd?;
      if (to == null) return;
      final kind = '${a['kind']}';
      walkTo(
        lat: to.lat,
        lng: to.lng,
        label: to.label,
        from: from == null || from.here ? null : (lat: from.lat, lng: from.lng),
        cycle: kind == 'cycle',
        drive: kind == 'drive',
      );
    });
    AppNav.register('tripMap', (_) => trip());
  }

  @override
  State<LiveMap> createState() => _LiveMapState();
}

class _LiveMapState extends State<LiveMap> {
  final ink = MapInk();
  MapLibreMapController? _map;
  bool _styled = false;
  Timer? _flush;

  // The camera, as last known (MapPreview draws by it).
  LatLng _centre = const LatLng(1.3521, 103.8198);
  double _zoom = 11;

  Fix? here;
  StreamSubscription<Fix>? _watch;
  bool following = true;
  bool turning = false;
  bool _located = false; // location allowed, so MapLibre draws your dot

  String title = '';
  String sub = '';
  String step = '';
  String note = '';

  MapPick? card;
  Offset? _cardAt;

  // A walk.
  Map<String, dynamic>? walk; // /api/walk's, and `total`
  int _walkAsked = 0;
  int _offRoute = 0;
  ({double lat, double lng})? _walkFrom;

  // A trip.
  Timer? _tripTimer;
  int _builtLeg = -1;
  List<TripLeg>? _builtLegs;
  ({List<List<double>> path, List<int> stops})? _tripTrack;

  // Someone's shared trip.
  MapLine? _themPath;
  MapDot? _themDot;
  MapDisc? _themRing;
  MapDot? _destMark;

  static const _drawMs = 1000;
  static const _offRouteM = 35.0;
  static const _offRouteFixes = 3;
  static const _rerouteMs = 20000;
  static const _arriveM = 25.0;
  static const _roughM = 200.0;
  int _drawnAt = 0;

  MapMode get mode => widget.mode;

  @override
  void initState() {
    super.initState();
    LiveMap._open = this;
    ink.off = _layersOff();
    ink.addListener(_inkChanged);
    AppNav.pip.addListener(_redrawPip);
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    if (LiveMap._open == this) LiveMap._open = null;
    _watch?.cancel();
    _tripTimer?.cancel();
    _flush?.cancel();
    ink.removeListener(_inkChanged);
    AppNav.pip.removeListener(_redrawPip);
    super.dispose();
  }

  Future<void> _start() async {
    switch (mode) {
      case MapMode.walk:
        final p = widget.place!;
        final where = p.label;
        title = widget.title ??
            (widget.drive
                ? tr('map.driveTo', 'Drive to {place}', {'place': where})
                : widget.cycle
                    ? tr('map.cycleTo', 'Cycle to {place}', {'place': where})
                    : tr('map.walkTo', 'Walk to {place}', {'place': where}));
        _destMark = _flag([p.lat, p.lng], p.label, pick: p.code != null ? MapPick.stop(p.code!) : null);
        _jump(LatLng(p.lat, p.lng), LiveMap.streetZoom - 2);
        step = tr('map.finding', 'Finding where you are…');
        _walkFrom = widget.from;
        _watchMe();
        if (_walkFrom != null) _route(_walkFrom!);
      case MapMode.trip:
        title = Trip.I.title.isEmpty ? tr('map.yourTrip', 'Your trip') : Trip.I.title;
        await Stations.load().catchError((_) {});
        _watchMe();
        _drawTrip(true);
        _tripTimer = Timer.periodic(const Duration(seconds: 5), (_) => _drawTrip(false));
        Trip.I.addListener(_tripChanged);
      case MapMode.follow:
        title = widget.title ??
            (widget.followData?['name'] is String
                ? tr('map.theirTrip', "{name}'s trip", {'name': widget.followData!['name']})
                : tr('map.sharedTrip', 'Shared trip'));
        _updateFollow(widget.followData!, fit: true);
      case MapMode.explore:
        title = tr('tour.explorer', 'Explorer');
        sub = tr('map.tapStop', 'Tap a bus stop or a station');
        _jump(const LatLng(1.3521, 103.8198), 11);
        _watchMe();
        _explore();
        Tours.first('explorer');
      case MapMode.traffic:
        _traffic();
    }
    if (mounted) setState(() {});
  }

  void _tripChanged() {
    if (!Trip.I.active && mounted) _drawTrip(false);
  }

  // ---------- the map ----------

  bool get _dark => Theme.of(context).brightness == Brightness.dark;

  void _jump(LatLng at, double zoom, {bool animate = false}) {
    _centre = at;
    _zoom = zoom;
    final m = _map;
    if (m != null) {
      final u = CameraUpdate.newLatLngZoom(at, zoom);
      animate && !MediaQuery.disableAnimationsOf(context) ? m.animateCamera(u, duration: const Duration(milliseconds: 600)) : m.moveCamera(u);
    }
    if (mounted) setState(() {});
  }

  void _fit(List<List<double>> pts, {double pad = 60}) {
    if (pts.isEmpty) return;
    var s = pts.first[0], n = s, w = pts.first[1], e = w;
    for (final p in pts) {
      s = math.min(s, p[0]);
      n = math.max(n, p[0]);
      w = math.min(w, p[1]);
      e = math.max(e, p[1]);
    }
    _centre = LatLng((s + n) / 2, (w + e) / 2);
    // About the zoom that fits it, for MapPreview: metres per point at zoom z are
    // 40075016 cos(lat) / (512 * 2^z), the bounds padded for the bars above and below.
    final size = MediaQuery.sizeOf(context);
    final ewM = math.max(metresBetween(s, w, s, e), 30.0);
    final nsM = math.max(metresBetween(s, w, n, w), 30.0);
    final world = 40075016 * math.cos(_centre.latitude * math.pi / 180) / 512;
    double zoomFor(double metres, double points) => math.log(world * points / metres) / math.ln2;
    _zoom = math.min(zoomFor(ewM, size.width - 2 * pad - 20), zoomFor(nsM, size.height - 2 * pad - 200)).clamp(10.0, LiveMap.streetZoom);
    _map?.animateCamera(
      CameraUpdate.newLatLngBounds(LatLngBounds(southwest: LatLng(s, w), northeast: LatLng(n, e)), left: pad, right: pad + 20, top: pad + 60, bottom: pad + 140),
    );
    if (mounted) setState(() {});
  }

  void _redrawPip() {
    if (mounted) setState(() {});
  }

  void _inkChanged() {
    if (LiveMap.preview || _map == null) {
      if (mounted) setState(() {});
      return;
    }
    _flush ??= Timer(const Duration(milliseconds: 16), () {
      _flush = null;
      _push();
    });
  }

  Future<void> _onStyle() async {
    final m = _map;
    if (m == null) return;
    _styled = true;
    const empty = {'type': 'FeatureCollection', 'features': <Object>[]};
    for (final s in ['sg-rail', 'sg-shuttle', 'sg-poi', 'sg-fill', 'sg-line', 'sg-dot']) {
      await m.addGeoJsonSource(s, empty);
    }
    final edgeOpacity = _dark ? 0.35 : 0.9;
    List<Object> railWidth(double more) => ['interpolate', ['linear'], ['zoom'], 9, 1.5 + more, 12, 2.5 + more, 15, 4 + more, 18, 7 + more];
    await m.addLineLayer('sg-rail', 'sg-rail-edge', LineLayerProperties(lineColor: '#ffffff', lineWidth: railWidth(2), lineOpacity: edgeOpacity, lineCap: 'round', lineJoin: 'round'),
        enableInteraction: false);
    await m.addLineLayer('sg-rail', 'sg-rail', LineLayerProperties(lineColor: ['get', 'color'], lineWidth: railWidth(0), lineCap: 'round', lineJoin: 'round'), enableInteraction: false);
    // Shuttle buses' routes over the trains' lines, thinner at every zoom.
    List<Object> shuttleWidth(double more) => ['interpolate', ['linear'], ['zoom'], 10, 1 + more, 12, 1.5 + more, 14, 2.5 + more, 18, 4.5 + more];
    await m.addLineLayer('sg-shuttle', 'sg-shuttle-edge', LineLayerProperties(lineColor: '#ffffff', lineWidth: shuttleWidth(2), lineOpacity: edgeOpacity, lineCap: 'round', lineJoin: 'round'),
        enableInteraction: false);
    await m.addLineLayer('sg-shuttle', 'sg-shuttle', LineLayerProperties(lineColor: ['get', 'color'], lineWidth: shuttleWidth(0), lineCap: 'round', lineJoin: 'round'), enableInteraction: false);
    List<Object> grow(double z0, double small, double big) => ['interpolate', ['linear'], ['zoom'], z0, small, 18, big];
    await m.addCircleLayer(
      'sg-poi',
      'sg-poi-stop',
      CircleLayerProperties(circleRadius: grow(LiveMap.stopZoom, 3.5, 7), circleColor: '#ffffff', circleStrokeColor: '#1f9d55', circleStrokeWidth: grow(LiveMap.stopZoom, 2, 3)),
      minzoom: LiveMap.stopZoom,
      filter: ['==', ['get', 'kind'], 'stop'],
    );
    await m.addCircleLayer(
      'sg-poi',
      'sg-poi-campus',
      CircleLayerProperties(
        circleRadius: grow(LiveMap.campusZoom, 3, 7),
        circleColor: '#ffffff',
        circleStrokeColor: ['get', 'color'],
        circleStrokeWidth: grow(LiveMap.campusZoom, 2, 3.5),
      ),
      minzoom: LiveMap.campusZoom,
      filter: ['==', ['get', 'kind'], 'campus'],
    );
    await m.addCircleLayer(
      'sg-poi',
      'sg-poi-station',
      CircleLayerProperties(
        circleRadius: ['interpolate', ['linear'], ['zoom'], LiveMap.stationZoom, 3.5, 14, 6.5, 18, 10],
        circleColor: ['get', 'color'],
        circleStrokeColor: ['get', 'edge'],
        circleStrokeWidth: ['interpolate', ['linear'], ['zoom'], LiveMap.stationZoom, 2, 18, 4],
      ),
      minzoom: LiveMap.stationZoom,
      filter: ['==', ['get', 'kind'], 'station'],
    );
    await m.addFillLayer('sg-fill', 'sg-fill', const FillLayerProperties(fillColor: ['get', 'fill'], fillOpacity: ['get', 'opacity']), enableInteraction: false);
    for (final dash in [false, true]) {
      await m.addLineLayer(
        'sg-line',
        dash ? 'sg-line-dash' : 'sg-line',
        LineLayerProperties(
          lineColor: ['get', 'color'],
          lineWidth: ['get', 'width'],
          lineOpacity: ['get', 'opacity'],
          lineCap: 'round',
          lineJoin: 'round',
          lineSortKey: ['get', 'z'],
          lineDasharray: dash ? [0.4, 2.2] : null,
        ),
        filter: ['==', ['get', 'dash'], dash],
        enableInteraction: false,
      );
    }
    await m.addCircleLayer(
      'sg-dot',
      'sg-dot',
      const CircleLayerProperties(
        circleRadius: ['get', 'radius'],
        circleColor: ['get', 'fill'],
        circleOpacity: ['get', 'fillOpacity'],
        circleStrokeColor: ['get', 'stroke'],
        circleStrokeWidth: ['get', 'weight'],
        circleSortKey: ['get', 'z'],
      ),
    );
    await _push();
  }

  Future<void> _push() async {
    final m = _map;
    if (m == null || !_styled) return;
    Map<String, Object?> feature(Map<String, Object?> geometry, Map<String, Object?> props) => {'type': 'Feature', 'geometry': geometry, 'properties': props};
    Map<String, Object?> collection(Iterable<Object> fs) => {'type': 'FeatureCollection', 'features': fs.toList()};
    final rails = ink.off.contains('rails') ? const <({Color color, List<List<double>> points})>[] : ink.rails;
    await m.setGeoJsonSource('sg-rail', collection([
      for (final r in rails) feature({'type': 'LineString', 'coordinates': r.points.map(_lngLat).toList()}, {'color': _hex(r.color)}),
    ]));
    await m.setGeoJsonSource('sg-shuttle', collection([
      if (!ink.off.contains('shuttles'))
        for (final r in ink.shuttles) feature({'type': 'LineString', 'coordinates': r.points.map(_lngLat).toList()}, {'color': _hex(r.color)}),
    ]));
    await m.setGeoJsonSource('sg-poi', collection([
      for (final (i, p) in ink.pois.indexed)
        if (!ink.off.contains(_poiLayer(p.kind)))
          feature({'type': 'Point', 'coordinates': [p.lng, p.lat]}, {
            'kind': p.kind,
            'i': i,
            'color': _hex(p.color ?? Colors.white),
            // An interchange: its first line's colour, edged in its second's.
            'edge': _hex(p.colors.length > 1 ? p.colors[1] : Colors.white),
          }),
    ]));
    await m.setGeoJsonSource('sg-fill', collection([
      for (final d in ink.allDiscs)
        feature({'type': 'Polygon', 'coordinates': [discRing(d.at, d.metres)]}, {'fill': _hex(d.fill), 'opacity': d.opacity}),
    ]));
    await m.setGeoJsonSource('sg-line', collection([
      for (final l in ink.allLines)
        if (l.points.length >= 2)
          feature({'type': 'LineString', 'coordinates': l.points.map(_lngLat).toList()},
              {'color': _hex(l.color), 'width': l.width, 'opacity': l.opacity, 'dash': l.dash, 'z': l.z}),
    ]));
    final dots = ink.allDots.toList();
    await m.setGeoJsonSource('sg-dot', collection([
      for (final (i, d) in dots.indexed)
        feature({'type': 'Point', 'coordinates': _lngLat(d.at)}, {
          'i': i,
          'fill': _hex(d.fill),
          'stroke': _hex(d.stroke),
          'radius': d.radius,
          'weight': d.weight,
          'fillOpacity': d.fillOpacity,
          'z': d.z,
        }),
    ]));
    _dotsPushed = dots;
  }

  List<MapDot> _dotsPushed = [];

  Future<void> _onTap(math.Point<double> point, LatLng at) async {
    final m = _map;
    if (m == null) return;
    final hits = await m.queryRenderedFeatures(point, ['sg-dot', 'sg-poi-station', 'sg-poi-stop', 'sg-poi-campus'], null);
    for (final h in hits) {
      final layer = '${(h as Map)['layer']?['id'] ?? ''}';
      final props = (h['properties'] as Map?) ?? const {};
      final i = (props['i'] as num?)?.toInt();
      if (i == null) continue;
      if (props.containsKey('kind') || layer.startsWith('sg-poi')) {
        if (i < ink.pois.length) return _openCard(ink.pois[i].pick);
      } else if (i < _dotsPushed.length) {
        final d = _dotsPushed[i];
        if (d.pick != null) return _openCard(d.pick!);
        if (d.label != null) {
          AppNav.say(d.label!);
          return;
        }
      }
    }
    _closeCard();
  }

  void _openCard(MapPick pick) {
    setState(() => card = pick);
    _placeCard();
  }

  void _closeCard() {
    if (card != null) setState(() => card = null);
  }

  Future<void> _placeCard() async {
    final c = card;
    if (c == null) return;
    final at = _cardLatLng(c);
    if (at == null) return;
    Offset? p;
    if (_map != null && !LiveMap.preview) {
      final s = await _map!.toScreenLocation(LatLng(at[0], at[1]));
      if (!mounted) return;
      final ratio = MediaQuery.devicePixelRatioOf(context);
      // Android hands back pixels.
      p = Offset(s.x.toDouble() / ratio, s.y.toDouble() / ratio);
    } else {
      p = MapPreview.toScreen(at, _centre, _zoom, MediaQuery.sizeOf(context));
    }
    if (mounted) setState(() => _cardAt = p);
  }

  List<double>? _cardLatLng(MapPick p) {
    if (p.kind == 'station') return [p.lat!, p.lng!];
    if (p.kind == 'campus') {
      final c = Campus.at(p.code!);
      return c == null ? null : [c.lat, c.lng];
    }
    final s = Stops.of(p.code!);
    return s?.lat == null ? null : [s!.lat!, s.lng!];
  }

  // ---------- you ----------

  Future<void> _watchMe() async {
    try {
      if (!await Locate.allowed()) {
        await Locate.here(toDo: tr('map.locate', 'show where you are on the map'));
      }
    } catch (_) {
      // No location: the map without you.
    }
    if (!mounted) return;
    _located = await Locate.allowed().catchError((_) => false);
    setState(() {});
    _watch = Locate.watch().listen(_onFix, onError: (_) {});
  }

  void _onFix(Fix f) {
    if ((f.accuracy ?? 0) > _roughM && here != null) return;
    final first = here == null;
    here = f;
    final now = When.nowMs();
    if (!first && now - _drawnAt < _drawMs) return;
    _drawnAt = now;
    _drawMe();
    if (first && mode != MapMode.traffic && mode != MapMode.follow) {
      _jump(LatLng(f.lat, f.lng), mode == MapMode.explore ? LiveMap.exploreZoom : LiveMap.streetZoom);
    } else if (following && mode != MapMode.traffic) {
      _keepInView(LatLng(f.lat, f.lng));
    }
    if (mode == MapMode.walk) _onWalkFix();
    if (mode == MapMode.trip) _drawTrip(false);
  }

  // Your own dot where MapLibre can't draw its puck: in MapPreview, or before location's allowed.
  MapDot? _meDot;
  MapDisc? _meRing;
  void _drawMe() {
    final f = here;
    if (f == null) return;
    if (!LiveMap.preview && _located) return; // MapLibre's own, with its compass arrow
    final at = [f.lat, f.lng];
    final ring = math.min(f.accuracy ?? 30, 500).toDouble();
    if (_meDot == null) {
      _meRing = ink.disc('me', at, ring, fill: LiveMap.meColour);
      _meDot = ink.dot('me', at, fill: LiveMap.meColour, radius: 8, z: 9);
    } else {
      _meDot!.at = at;
      _meRing!
        ..at = at
        ..metres = ring;
      ink.changed();
    }
  }

  void _keepInView(LatLng at) {
    // Panned only once you've moved a fair way across, so a fix a second isn't a pan a second.
    final size = MediaQuery.sizeOf(context);
    final p = MapPreview.toScreen([at.latitude, at.longitude], _centre, _zoom, size);
    final dx = (p.dx - size.width / 2).abs() / (size.width / 2);
    final dy = (p.dy - size.height / 2).abs() / (size.height / 2);
    if (dx > 0.25 || dy > 0.25 || LiveMap.preview) {
      _centre = at;
      _map?.animateCamera(CameraUpdate.newLatLng(at), duration: const Duration(milliseconds: 500));
    }
  }

  void _setFollowing(bool on) {
    following = on;
    if (on && here != null) _jump(LatLng(here!.lat, here!.lng), mode == MapMode.explore ? LiveMap.exploreZoom + 1 : LiveMap.streetZoom, animate: true);
    if (!on && turning) _setTurning(false);
    setState(() {});
  }

  void _setTurning(bool on) {
    turning = on;
    if (on) following = true;
    if (!on) _map?.animateCamera(CameraUpdate.bearingTo(0));
    setState(() {});
  }

  MyLocationTrackingMode get _tracking => !_located
      ? MyLocationTrackingMode.none
      : turning
          ? MyLocationTrackingMode.trackingCompass
          : MyLocationTrackingMode.none;

  // ---------- a walk ----------

  static final Map<String, Map<String, dynamic>> _routes = {};

  static String _key(double lat, double lng) => '${lat.toStringAsFixed(5)},${lng.toStringAsFixed(5)}';

  static Future<Map<String, dynamic>> fetchWalk(({double lat, double lng}) from, ({double lat, double lng}) to, {bool cycle = false, bool drive = false}) async {
    final by = drive ? 'drive' : cycle ? 'cycle' : '';
    final k = '${_key(from.lat, from.lng)}>${_key(to.lat, to.lng)}>$by';
    if (_routes.containsKey(k)) return _routes[k]!;
    final r = await Api.map('walk', query: {'from': _key(from.lat, from.lng), 'to': _key(to.lat, to.lng), if (by.isNotEmpty) 'mode': by});
    return _routes[k] = r;
  }

  static List<List<double>> pathOf(Object? p) => [
        for (final pt in (p as List? ?? const []))
          if (pt is List && pt.length >= 2) [(pt[0] as num).toDouble(), (pt[1] as num).toDouble()],
      ];

  static double lengthOf(List<List<double>> path) {
    var m = 0.0;
    for (var k = 1; k < path.length; k++) {
      m += metresAB(path[k - 1], path[k]);
    }
    return m;
  }

  /// The nearest point on a path: how far along it, and how far off.
  static ({double along, double m}) nearestOn(List<List<double>> path, List<double> p) {
    final kx = 111320 * math.cos(p[0] * math.pi / 180);
    const ky = 110540.0;
    var best = (along: 0.0, m: double.infinity);
    var cum = 0.0;
    for (var k = 0; k < path.length - 1; k++) {
      final ax = path[k][1] * kx, ay = path[k][0] * ky;
      final dx = path[k + 1][1] * kx - ax, dy = path[k + 1][0] * ky - ay;
      final px = p[1] * kx - ax, py = p[0] * ky - ay;
      final len2 = dx * dx + dy * dy;
      final t = len2 > 0 ? ((px * dx + py * dy) / len2).clamp(0.0, 1.0) : 0.0;
      final m = math.sqrt(math.pow(px - t * dx, 2) + math.pow(py - t * dy, 2));
      final seg = math.sqrt(len2);
      if (m < best.m) best = (along: cum + t * seg, m: m);
      cum += seg;
    }
    return best;
  }

  static String distText(double m) => m < 950 ? '${math.max(10, (m / 10).round() * 10)} m' : '${(m / 1000).toStringAsFixed(1)} km';

  Future<void> _route(({double lat, double lng}) from) async {
    _walkAsked = When.nowMs();
    final p = widget.place!;
    try {
      final got = await fetchWalk(from, (lat: p.lat, lng: p.lng), cycle: widget.cycle, drive: widget.drive);
      if (!mounted) return;
      final path = pathOf(got['path']);
      walk = {...got, 'path': path, 'total': lengthOf(path)};
      _drawWalk();
      _onWalkFix();
    } on ApiError catch (e) {
      if (mounted) setState(() => note = e.message.isEmpty ? tr('map.noWalk', "Couldn't find a way to walk there.") : e.message);
    } catch (_) {
      if (mounted) setState(() => note = tr('map.noWalk', "Couldn't find a way to walk there."));
    }
  }

  void _drawWalk() {
    ink.clear('lines');
    final w = walk;
    if (w == null) return;
    final path = w['path'] as List<List<double>>;
    final line = w['source'] == 'line';
    ink.line('lines', path, color: Colors.white, width: 9, opacity: 0.9);
    ink.line('lines', path, color: widget.drive ? LiveMap.driveColour : widget.cycle ? LiveMap.cycleColour : LiveMap.walkColour, width: 5, dash: line, z: 1);
    final roadside = (w['roadside'] as num?) ?? 0;
    note = line
        ? (widget.drive
            ? tr('map.lineDrive', "Couldn't find the roads for this drive, so this is the straight line there.")
            : widget.cycle
                ? tr('map.lineRide', "Couldn't find the streets for this ride, so this is the straight line there.")
                : tr('map.lineWalk', "Couldn't find the streets for this walk, so this is the straight line there."))
        : w['expressway'] == true
            ? tr('map.expressway', 'It ends on an expressway, where no one may walk, so the walk stops at the nearest footpath.')
            : roadside >= 20
                ? tr('map.roadside', 'About {m} m of this walk is along the road, with no footpath. Keep to the side and watch for traffic.', {'m': (roadside / 10).round() * 10})
                : '';
    setState(() {});
  }

  void _onWalkFix() {
    final f = here;
    if (f == null) return;
    final me = [f.lat, f.lng];
    final w = walk;
    final p = widget.place!;
    if (w == null) {
      if (_walkFrom == null && When.nowMs() - _walkAsked > 5000) _route((lat: f.lat, lng: f.lng));
      return;
    }
    final path = w['path'] as List<List<double>>;
    final acc = f.accuracy ?? 20;
    final left = metresAB(me, [p.lat, p.lng]);
    if (left <= _arriveM + math.min(acc, 30)) {
      setState(() {
        step = tr('map.arrivedAt', "You've arrived at {place}.", {'place': p.label});
        sub = '';
      });
      return;
    }
    final near = nearestOn(path, me);
    if (near.m > _offRouteM + math.min(acc, 50)) {
      if (++_offRoute >= _offRouteFixes && When.nowMs() - _walkAsked > _rerouteMs && acc < 60) {
        _offRoute = 0;
        _walkFrom = null;
        _route((lat: f.lat, lng: f.lng));
      }
    } else {
      _offRoute = 0;
    }
    final total = (w['total'] as double);
    final remaining = math.max(0.0, total - near.along);
    final mins = math.max(1, (remaining / math.max(1, total) * ((w['minutes'] as num?) ?? 1)).round());
    sub = '${distText(remaining)} · $mins min · ${tr('map.arrive', 'arrive {time}', {'time': When.clock(When.nowMs() + mins * 60000)})}';
    String? next;
    for (final s in (w['steps'] as List? ?? const [])) {
      if (s is! Map || s['at'] is! List) continue;
      final at = nearestOn(path, [(s['at'][0] as num).toDouble(), (s['at'][1] as num).toDouble()]);
      if (at.along > near.along + 5) {
        next = tr('map.inDist', 'In {d}: {step}', {'d': distText(at.along - near.along), 'step': s['text']});
        break;
      }
    }
    step = next ?? tr('map.ahead', '{place} is {d} ahead', {'place': p.label, 'd': distText(left)});
    setState(() {});
  }

  // ---------- a trip ----------

  MapDot _flag(List<double> at, String label, {Color colour = LiveMap.flagColour, MapPick? pick}) =>
      ink.dot('marks', at, radius: 9, fill: colour, label: label, pick: pick, z: 5);

  MapPick? _pickAt(TripLeg leg, int k) {
    if (leg.kind == 'bus' && leg.codes != null && leg.codes!.length == leg.points.length) return MapPick.stop(leg.codes![k]);
    if (leg.kind != 'train') return null;
    final pt = leg.points[k];
    Station? best;
    var bestM = 300.0;
    for (final s in Stations.all ?? const <Station>[]) {
      final m = metresAB(pt, [s.lat, s.lng]);
      if (m < bestM) {
        best = s;
        bestM = m;
      }
    }
    return best == null ? null : MapPick.station(best.name, best.codes, best.lat, best.lng);
  }

  Color _legColour(TripLeg leg, bool done) {
    if (done) return LiveMap.doneColour;
    if (leg.kind == 'walk') return LiveMap.walkColour;
    if (leg.color != null) return hexColor(leg.color!);
    if (leg.kind == 'train') return lineColour(leg.route ?? leg.label.split(' ').first);
    return LiveMap.busColour;
  }

  /// Where the trip has you, along the leg you're on, without a fix of your own.
  List<double> _tripAt() {
    final t = Trip.I;
    final leg = t.current!;
    final pts = _tripTrack != null ? [for (final i in _tripTrack!.stops) _tripTrack!.path[i]] : leg.points;
    final i = t.pos.floor().clamp(0, pts.length - 1);
    final j = math.min(i + 1, pts.length - 1);
    final f = t.pos - i;
    return [pts[i][0] + (pts[j][0] - pts[i][0]) * f, pts[i][1] + (pts[j][1] - pts[i][1]) * f];
  }

  double _minutesLeft() {
    final t = Trip.I;
    var left = 0.0;
    for (var i = t.leg; i < t.legs.length; i++) {
      final l = t.legs[i];
      if (i == t.leg && l.points.length > 1) {
        left += l.minutes * (1 - (t.pos / (l.points.length - 1)).clamp(0.0, 1.0));
      } else {
        left += l.minutes + l.wait;
      }
    }
    return left;
  }

  void _drawTrip(bool fit) {
    final t = Trip.I;
    if (!t.active || t.current == null) {
      _tripTimer?.cancel();
      setState(() {
        step = tr('map.tripEnded', 'The trip has ended.');
        sub = '';
      });
      return;
    }
    if (_builtLeg != t.leg || !identical(_builtLegs, t.legs)) {
      _builtLeg = t.leg;
      _builtLegs = t.legs;
      _tripTrack = null;
      ink
        ..clear('lines')
        ..clear('stops')
        ..clear('marks');
      final built = t.leg;
      for (final (i, leg) in t.legs.indexed) {
        final done = i < t.leg;
        final colour = _legColour(leg, done);
        final line = ink.line('lines', leg.points, color: colour, width: leg.kind == 'walk' ? 4 : 6, opacity: done ? 0.6 : 0.95, dash: leg.kind == 'walk', z: done ? 0 : 1);
        if (leg.kind == 'train') {
          RailTracks.path(leg.route ?? leg.label.split(' ').first, leg.points).then((track) {
            if (track == null || !mounted || _builtLeg != built) return;
            line.points = track.path;
            if (i == built) _tripTrack = track;
            ink.changed();
          });
        }
        if (leg.kind == 'bus') {
          Api.map('road', query: {'points': leg.points.map((p) => '${p[0].toStringAsFixed(5)},${p[1].toStringAsFixed(5)}').join(';')}).then((r) {
            final path = pathOf(r['path']);
            if (path.length < 2 || !mounted || _builtLeg != built) return;
            line.points = path;
            ink.changed();
          }).catchError((_) {});
        }
        if (leg.kind == 'walk') {
          final end = leg.points.last;
          final from = i == t.leg && here != null ? (lat: here!.lat, lng: here!.lng) : (lat: leg.points.first[0], lng: leg.points.first[1]);
          fetchWalk(from, (lat: end[0], lng: end[1])).then((r) {
            final path = pathOf(r['path']);
            if (path.length < 2 || !mounted || _builtLeg != built) return;
            line.points = path;
            ink.changed();
          }).catchError((_) {});
        }
        if (leg.kind != 'walk' && !done) {
          for (var k = 1; k < leg.points.length - 1; k++) {
            ink.dot('stops', leg.points[k],
                radius: 3.5,
                stroke: colour,
                weight: 2,
                fill: Colors.white,
                label: k < leg.names.length ? leg.names[k] : tr('trip.stopN', 'Stop {n}', {'n': k + 1}),
                pick: _pickAt(leg, k),
                z: 2);
          }
        }
        if (!done) {
          final last = i == t.legs.length - 1;
          _flag(
            leg.points.last,
            last ? leg.to : (leg.kind != 'walk' ? tr('map.getOffAt', 'Get off at {place}', {'place': leg.to}) : tr('map.walkTo', 'Walk to {place}', {'place': leg.to})),
            colour: last ? LiveMap.flagColour : colour,
            pick: _pickAt(leg, leg.points.length - 1),
          );
        }
      }
      if (fit && here == null) _jump(LatLng(_tripAt()[0], _tripAt()[1]), LiveMap.streetZoom - 1);
    }
    step = t.barText();
    final mins = math.max(0, _minutesLeft().round());
    sub = t.arrived ? tr('share.view.arrived', 'Arrived') : tr('map.minsLeft', '{m} min left · arrive {time}', {'m': mins, 'time': When.clock(When.nowMs() + mins * 60000)});
    if (here == null) {
      ink.clear('me');
      ink.dot('me', _tripAt(), fill: LiveMap.meColour, fillOpacity: 0.7, z: 9);
    }
    if (mounted) setState(() {});
  }

  // ---------- someone's shared trip ----------

  List<double>? _latLng(Object? p) =>
      p is Map && p['lat'] is num ? [(p['lat'] as num).toDouble(), (p['lng'] as num).toDouble()] : (p is List && p.length >= 2 ? [(p[0] as num).toDouble(), (p[1] as num).toDouble()] : null);

  void _updateFollow(Map<String, dynamic> data, {bool fit = false}) {
    if (mode != MapMode.follow) return;
    final at = _latLng(data['me']) ?? _latLng(data['at']);
    final ring = math.min(((data['me'] as Map?)?['accuracy'] as num?)?.toDouble() ?? 30, 500).toDouble();
    final path = pathOf(data['path']);
    if (path.length >= 2) {
      if (_themPath == null) {
        _themPath = ink.line('lines', path, color: LiveMap.themColour, width: 5, opacity: 0.85);
      } else {
        _themPath!.points = path;
        ink.changed();
      }
    }
    final to = data['to'];
    if (_destMark == null && to is Map && to['lat'] is num) _destMark = _flag([(to['lat'] as num).toDouble(), (to['lng'] as num).toDouble()], '${to['label'] ?? ''}');
    if (at != null) {
      if (_themDot == null) {
        _themRing = ink.disc('them', at, ring, fill: LiveMap.themColour);
        _themDot = ink.dot('them', at, radius: 8, fill: LiveMap.themColour, label: '${data['name'] ?? tr('map.them', 'Them')}', z: 9);
      } else {
        _themDot!.at = at;
        _themRing!
          ..at = at
          ..metres = ring;
        ink.changed();
      }
      if (fit) {
        _jump(LatLng(at[0], at[1]), LiveMap.streetZoom);
      } else if (following) {
        _keepInView(LatLng(at[0], at[1]));
      }
    }
    final leg = data['leg'] as Map?;
    final live = data['ended'] != true && data['stopped'] != true;
    final label = leg?['label'];
    final left = (leg?['stopsLeft'] as num?)?.toInt();
    step = !live
        ? (data['ended'] == true ? tr('share.view.arrived', 'Arrived') : tr('share.view.stopped', 'Sharing stopped'))
        : label == null
            ? ''
            : left == 0
                ? tr('trip.atStop', '{ride}: at {to}', {'ride': label, 'to': leg?['to']})
                : left == 1
                    ? tr('trip.oneStop', '{ride}: 1 stop to {to}', {'ride': label, 'to': leg?['to']})
                    : tr('trip.stops', '{ride}: {n} stops to {to}', {'ride': label, 'n': left, 'to': leg?['to']});
    final arriveAt = (data['arriveAt'] as num?)?.toInt() ?? When.nowMs();
    final mins = math.max(0, ((arriveAt - When.nowMs()) / 60000).round());
    sub = live
        ? (mins > 0 ? tr('map.arrivingIn', 'Arriving in {m} min, around {time}', {'m': mins, 'time': When.clock(arriveAt)}) : tr('map.arrivingNow', 'Arriving now'))
        : tr('share.at', 'at {place}', {'place': (to as Map?)?['label'] ?? ''});
    if (mounted) setState(() {});
  }

  // ---------- Explorer ----------

  Set<String> _layersOff() => {for (final v in Store.I.list(LiveMap.layersKey)) '$v'};

  void _setLayer(String name, bool on) {
    final off = _layersOff();
    on ? off.remove(name) : off.add(name);
    Store.I.putJson(LiveMap.layersKey, off.toList());
    ink.off = off;
    ink.changed();
    setState(() {});
  }

  static const _colourOrder = [0xFF009645, 0xFFD42E12, 0xFF9900AA, 0xFFFA9E0D, 0xFF005EC4, 0xFF9D5B25, 0xFF748477];

  Future<void> _explore() async {
    RailTracks.lines().then((lines) {
      if (!mounted) return;
      ink.rails = [for (final l in lines) (color: lineColour(l.line), points: l.points)];
      ink.changed();
    }).catchError((_) {});
    await Future.wait<void>([Stops.load().then((_) {}).catchError((_) {}), Stations.load().catchError((_) {})]);
    if (!mounted) return;
    final pois = <MapPoi>[
      for (final s in Stops.all)
        if (s.lat != null && s.lng != null) MapPoi('stop', s.lat!, s.lng!, pick: MapPick.stop(s.code)),
    ];
    for (final s in Stations.all ?? const <Station>[]) {
      final colours = {for (final c in s.codes) lineColour(c)}.toList()
        ..sort((a, b) => _colourOrder.indexOf(a.toARGB32()).compareTo(_colourOrder.indexOf(b.toARGB32())));
      pois.add(MapPoi('station', s.lat, s.lng,
          color: colours.isEmpty ? lineColour(s.codes.firstOrNull ?? '') : colours.first, colors: colours, pick: MapPick.station(s.name, s.codes, s.lat, s.lng)));
    }
    ink.pois = pois;
    ink.changed();
    _shuttles();
  }

  static String _poiLayer(String kind) => switch (kind) { 'stop' => 'stops', 'campus' => 'campus', _ => 'stations' };

  // The shuttle buses' routes, each along its road from roads.json, else straight from stop to
  // stop and then along its road once /api/road has it; and the campus stops LTA hasn't got.
  Future<void> _shuttles() async {
    try {
      await Campus.load();
      await Campus.loadRoads();
    } catch (_) {
      return;
    }
    if (!mounted) return;
    final list = Campus.lines(Campus.keep);
    final roads = <String, List<List<double>>>{};
    void draw() {
      ink.shuttles = [for (final l in list) (key: l.key, uni: l.uni, color: l.color, points: roads[l.key] ?? Campus.road(l.key, l.points) ?? l.points)];
      ink.changed();
      if (mounted) setState(() {});
    }

    ink.pois = [
      ...ink.pois.where((p) => p.kind != 'campus'),
      for (final c in Campus.dots(Campus.keep)) MapPoi('campus', c.lat, c.lng, color: Campus.uniColour(c.uni), pick: MapPick.campus(c.key)),
    ];
    draw();
    if (LiveMap.preview) return;
    for (final l in list) {
      if (Campus.road(l.key, l.points) != null) continue;
      Api.map('road', query: {'points': l.points.map((p) => '${p[0].toStringAsFixed(5)},${p[1].toStringAsFixed(5)}').join(';')}).then((r) {
        final path = r['path'];
        if (path is! List || path.length < 2 || !mounted) return;
        roads[l.key] = [for (final q in path) if (q is List && q.length >= 2) [(q[0] as num).toDouble(), (q[1] as num).toDouble()]];
        draw();
      }).catchError((_) {});
    }
  }

  /// The universities' credits while one of their routes is in view.
  List<({String uni, String text, String url})> _shuttleCredits(Size size) {
    if (ink.shuttles.isEmpty || ink.off.contains('shuttles')) return const [];
    final perPx = 360 / (512 * math.pow(2, _zoom));
    final dLng = size.width / 2 * perPx, dLat = size.height / 2 * perPx * math.cos(_centre.latitude * math.pi / 180);
    return Campus.credits([
      [_centre.latitude - dLat, _centre.longitude - dLng],
      [_centre.latitude + dLat, _centre.longitude + dLng],
    ], [for (final l in ink.shuttles) (uni: l.uni, points: l.points)]);
  }

  void _openLayers() {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, set) {
          final off = _layersOff();
          Widget row(String id, String label) => SwitchListTile(
                value: !off.contains(id),
                title: Text(label),
                onChanged: (v) {
                  _setLayer(id, v);
                  set(() {});
                },
              );
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tr('layers.title', 'Layers'), style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(tr('layers.text', 'What Explorer shows on its map. Tap one to turn it off or on.'), style: TextStyle(color: context.sg.muted)),
                row('stops', tr('layers.stops', 'Bus stops')),
                row('stations', tr('layers.stations', 'MRT and LRT stations')),
                row('rails', tr('layers.rails', 'MRT and LRT lines')),
                row('shuttles', tr('layers.shuttles', 'Shuttle bus routes')),
                row('campus', tr('layers.campus', 'Shuttle bus stops')),
              ]),
            ),
          );
        },
      ),
    );
  }

  // ---------- traffic ----------

  Future<void> _traffic() async {
    final points = widget.trafficPts!;
    title = tr('map.trafficOf', 'Traffic: {title}', {'title': widget.trafficTitle ?? tr('map.traffic', 'Traffic')});
    following = false;
    for (final (i, pt) in points.indexed) {
      ink.dot('stops', pt,
          radius: 3.5,
          stroke: LiveMap.clear,
          weight: 2,
          fill: Colors.white,
          label: widget.trafficNames != null && i < widget.trafficNames!.length ? widget.trafficNames![i] : tr('trip.stopN', 'Stop {n}', {'n': i + 1}),
          z: 2);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _fit(points));
    step = tr('map.findingRoad', 'Finding the road and how its traffic is…');
    setState(() {});
    _watchMe();
    String param(List<List<double>> pts) => pts.map((p) => '${p[0].toStringAsFixed(5)},${p[1].toStringAsFixed(5)}').join(';');
    var road = points;
    try {
      final got = pathOf((await Api.map('road', query: {'points': param(points)}))['path']);
      if (got.length >= 2) road = got;
    } catch (_) {}
    final way = thin(road, 120);
    Map<String, dynamic>? t;
    try {
      t = await Api.map('traffic', query: {'points': param(way)});
    } catch (_) {}
    if (!mounted) return;
    ink.clear('lines');
    ink.line('lines', way, color: Colors.white, width: 10, opacity: 0.9);
    if (t?['at'] == null) {
      ink.line('lines', way, color: LiveMap.doneColour, width: 6, z: 1);
      setState(() => step = tr('map.noTraffic', "There's no live traffic from LTA just now, so this is the road without it."));
      return;
    }
    final flows = [for (final f in (t!['flows'] as List? ?? const [])) (f as num).toDouble()];
    String cls(double f) => f < 0.4 ? 'jammed' : f < 0.7 ? 'slow' : 'clear';
    const colours = {'jammed': LiveMap.jammed, 'slow': LiveMap.slow, 'clear': LiveMap.clear};
    var from = 0;
    for (var i = 1; i <= flows.length; i++) {
      if (i < flows.length && cls(flows[i]) == cls(flows[from])) continue;
      ink.line('lines', way.sublist(from, math.min(i + 1, way.length)), color: colours[cls(flows[from])]!, width: 6, z: 1);
      from = i;
    }
    String said(Map inc) {
      final m = '${inc['message'] ?? ''}'.replaceFirst(RegExp(r'^\(\d+/\d+\)\d+:\d+\s*'), '');
      final type = '${inc['type'] ?? ''}';
      return m.toLowerCase().startsWith(type.toLowerCase()) ? m : '$type: $m';
    }

    final incidents = [for (final inc in (t['incidents'] as List? ?? const [])) if (inc is Map) inc];
    for (final inc in incidents) {
      if (inc['lat'] is num) _flag([(inc['lat'] as num).toDouble(), (inc['lng'] as num).toDouble()], said(inc), colour: LiveMap.jammed);
    }
    final ago = math.max(0, ((When.nowMs() - (t['at'] as num)) / 60000).round());
    sub = ago < 1 ? tr('map.trafficNow', "LTA's live traffic, just now") : tr('map.trafficAgo', "LTA's live traffic, {m} min ago", {'m': ago});
    final jammed = flows.where((f) => f < 0.4).length;
    final slow = flows.where((f) => f < 0.7).length;
    final roadsList = [for (final r in (t['roads'] as List? ?? const [])) '$r'];
    final roads = roadsList.join(tr('trip.and', ' and '));
    final what = jammed > 0
        ? (roads.isNotEmpty ? tr('map.jammedOn', 'Jammed in places on {roads}', {'roads': roads}) : tr('map.jammed', 'Jammed in places'))
        : slow > 0
            ? (roads.isNotEmpty ? tr('map.slowOn', 'Slow in places on {roads}', {'roads': roads}) : tr('map.slow', 'Slow in places'))
            : tr('map.clear', 'The roads are clear');
    final words = incidents.map(said).join(' ');
    step = '${tr('map.legend', '{what}. Red is jammed, orange slow, green clear.', {'what': what})}${words.isNotEmpty ? ' $words' : ''}';
    setState(() {});
  }

  static List<List<double>> thin(List<List<double>> path, int n) {
    if (path.length <= n) return path;
    return [for (var i = 0; i < n; i++) path[((path.length - 1) * i / (n - 1)).round()]];
  }

  // ---------- overview ----------

  void _overview() {
    final pts = <List<double>>[
      ...ink.allLines.expand((l) => l.points),
      ...ink.allDots.map((d) => d.at),
      if (here != null) [here!.lat, here!.lng],
    ];
    following = false;
    _fit(pts);
  }

  // ---------- drawing ----------

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final size = MediaQuery.sizeOf(context);
    final map = LiveMap.preview
        ? MapPreview(ink: ink, centre: _centre, zoom: _zoom, here: here)
        : MapLibreMap(
            styleString: _dark ? LiveMap.styleDark : LiveMap.styleLight,
            initialCameraPosition: CameraPosition(target: _centre, zoom: _zoom),
            minMaxZoomPreference: const MinMaxZoomPreference(9, 19),
            cameraTargetBounds: CameraTargetBounds(LatLngBounds(southwest: const LatLng(0.9, 103.2), northeast: const LatLng(1.8, 104.5))),
            trackCameraPosition: true,
            compassEnabled: true,
            compassViewPosition: CompassViewPosition.topRight,
            compassViewMargins: const math.Point(16, 200),
            myLocationEnabled: _located,
            myLocationRenderMode: _located ? MyLocationRenderMode.compass : MyLocationRenderMode.normal,
            myLocationTrackingMode: _tracking,
            onCameraTrackingDismissed: () {
              if (turning) _setTurning(false);
            },
            attributionButtonPosition: AttributionButtonPosition.bottomLeft,
            onMapCreated: (c) => _map = c,
            onStyleLoadedCallback: _onStyle,
            onMapClick: _onTap,
            onCameraMove: (p) {
              _centre = p.target;
              _zoom = p.zoom;
              if (card != null) _placeCard();
            },
            onCameraIdle: () {
              if (card != null) _placeCard();
            },
          );
    final top = MediaQuery.paddingOf(context).top;
    // Shrunk into picture-in-picture: the map alone.
    if (AppNav.pip.value) return Scaffold(body: map);
    return Scaffold(
      body: Stack(children: [
        // A drag stops following you.
        Positioned.fill(
          child: Listener(
            onPointerMove: (e) {
              if (following && e.delta.distance > 2 && mode != MapMode.traffic) _setFollowing(false);
            },
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTapUp: LiveMap.preview ? (d) => _previewTap(d.localPosition, size) : null,
              child: TourTarget(id: 'map.ground', child: map),
            ),
          ),
        ),
        // The top bar: back, the title and how it's going.
        Positioned(
          top: top + 8,
          left: 12,
          right: 12,
          child: Material(
            color: sg.surfaceStrong,
            elevation: _lift,
            shape: _panel(20),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 12, 8),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                TourTarget(id: 'map.close', child: IconButton(
                  tooltip: tr('html.close_the_map', 'Close the map'),
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back),
                )),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700), maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (sub.isNotEmpty) Text(sub, style: TextStyle(color: sg.muted)),
                    ]),
                  ),
                ),
              ]),
            ),
          ),
        ),
        // The shuttle operators' credits, while their routes are in view.
        if (mode == MapMode.explore)
          for (final credits in [_shuttleCredits(size)])
            if (credits.isNotEmpty)
              Positioned(
                left: 48,
                right: 72,
                bottom: MediaQuery.paddingOf(context).bottom + 10,
                child: Align(
                  alignment: Alignment.bottomLeft,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.85), borderRadius: BorderRadius.circular(6)),
                    child: Text(credits.map((c) => c.text).join(' · '), style: TextStyle(fontSize: 11, color: context.sg.muted)),
                  ),
                ),
              ),
        // The buttons down the side.
        Positioned(
          right: 12,
          top: top + 96,
          child: Column(children: [
            if (mode != MapMode.explore && mode != MapMode.traffic)
              _round(Icons.zoom_out_map, tr('html.show_the_whole_route', 'Show the whole route'), _overview),
            if (!following && mode != MapMode.traffic && (here != null || mode == MapMode.follow))
              _round(Icons.my_location, tr('html.back_to_street_level_following', 'Back to street level, following'), () => _setFollowing(true)),
            if (_located && mode != MapMode.follow && !LiveMap.preview)
              _round(turning ? Icons.explore : Icons.explore_outlined, tr('html.turn_the_map_with_the', 'Turn the map with the way you face'), () => _setTurning(!turning), on: turning),
            if (mode == MapMode.explore) ...[
              TourTarget(id: 'map.layers', child: _round(Icons.layers_outlined, tr('tray.layers', 'Layers'), _openLayers)),
              _round(Icons.download_for_offline_outlined, tr('html.save_the_map_for_offline', 'Save the map for offline'), () => MapSave.open(context)),
            ],
          ]),
        ),
        // A stop's or station's card, on its dot.
        if (card != null && _cardAt != null)
          MapCardBubble(
            key: ValueKey(card!.key),
            pick: card!,
            at: _cardAt!,
            area: size,
            topLimit: top + 90,
            onClose: _closeCard,
            onTimings: (code, service) {
              Navigator.of(context).maybePop();
              StopScreen.open(code, service: service);
            },
            onDirections: (label, lat, lng) {
              Navigator.of(context).maybePop();
              openNav(from: NavEnd.parse('here'), to: NavEnd(label, lat, lng));
            },
          ),
        // How it's going, at the foot: the next turn, the trip's status, the traffic.
        if (step.isNotEmpty || note.isNotEmpty)
          Positioned(
            left: 12,
            right: 12,
            bottom: MediaQuery.paddingOf(context).bottom + 28,
            child: Material(
              color: sg.surfaceStrong,
              elevation: _lift,
              shape: _panel(20),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (step.isNotEmpty) Text(step, style: Theme.of(context).textTheme.titleMedium),
                  if (note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(note, style: TextStyle(color: sg.warn))),
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  void _previewTap(Offset at, Size size) {
    double best = 24;
    MapPick? hit;
    for (final p in ink.pois) {
      if (p.kind == 'stop' && _zoom < LiveMap.stopZoom) continue;
      final s = MapPreview.toScreen([p.lat, p.lng], _centre, _zoom, size);
      final d = (s - at).distance;
      if (d < best) {
        best = d;
        hit = p.pick;
      }
    }
    hit == null ? _closeCard() : _openCard(hit);
  }

  /// For screenshots: a card open, as a tap would.
  void openCardFor(MapPick pick) => _openCard(pick);

  // Lifted off the map by a shadow; in MapPreview, which can't draw one, edged instead.
  double get _lift => LiveMap.preview ? 0 : 3;
  ShapeBorder _panel(double r) =>
      RoundedRectangleBorder(borderRadius: BorderRadius.circular(r), side: LiveMap.preview ? BorderSide(color: context.sg.border) : BorderSide.none);

  Widget _round(IconData icon, String label, VoidCallback onTap, {bool on = false}) {
    final sg = context.sg;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Tooltip(
        message: label,
        child: Material(
          color: on ? sg.brand : sg.surfaceStrong,
          elevation: _lift,
          shape: LiveMap.preview ? CircleBorder(side: BorderSide(color: sg.border)) : const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(width: 48, height: 48, child: Icon(icon, color: on ? sg.onBrand : sg.ink, semanticLabel: label)),
          ),
        ),
      ),
    );
  }
}

/// For screenshots: the open map's state.
void openMapCard(MapPick pick) => LiveMap._open?.openCardFor(pick);

/// The live map's lines and dots on a plain ground, in Web Mercator about the camera: where the
/// platform's map can't be drawn (tests and the guide's screenshots).
class MapPreview extends StatelessWidget {
  const MapPreview({super.key, required this.ink, required this.centre, required this.zoom, this.here});
  final MapInk ink;
  final LatLng centre;
  final double zoom;
  final Fix? here;

  static Offset _world(double lat, double lng, double zoom) {
    final scale = 512 * math.pow(2, zoom);
    final x = (lng + 180) / 360 * scale;
    final s = math.sin(lat * math.pi / 180);
    final y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * scale;
    return Offset(x, y.toDouble());
  }

  static Offset toScreen(List<double> p, LatLng centre, double zoom, Size size) =>
      _world(p[0], p[1], zoom) - _world(centre.latitude, centre.longitude, zoom) + Offset(size.width / 2, size.height / 2);

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size.infinite,
        painter: _PreviewPainter(ink, centre, zoom, context.sg, Theme.of(context).brightness == Brightness.dark),
      );
}

class _PreviewPainter extends CustomPainter {
  _PreviewPainter(this.ink, this.centre, this.zoom, this.sg, this.dark) : super(repaint: ink);
  final MapInk ink;
  final LatLng centre;
  final double zoom;
  final SgColors sg;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = dark ? const Color(0xFF1E2326) : const Color(0xFFF2EFE9));
    // A faint street grid, so it reads as a map.
    final grid = Paint()
      ..color = dark ? const Color(0xFF2A3034) : const Color(0xFFFFFFFF)
      ..strokeWidth = 3;
    final step = 512 * math.pow(2, zoom) / math.pow(2, zoom.floor() + 1) * 2;
    final o = MapPreview._world(centre.latitude, centre.longitude, zoom);
    for (var x = -(o.dx % step); x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (var y = -(o.dy % step); y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    Offset at(List<double> p) => MapPreview.toScreen(p, centre, zoom, size);
    void path(List<List<double>> pts, Paint paint, {bool dash = false}) {
      if (pts.length < 2) return;
      if (!dash) {
        final p = Path()..moveTo(at(pts.first).dx, at(pts.first).dy);
        for (final q in pts.skip(1)) {
          p.lineTo(at(q).dx, at(q).dy);
        }
        canvas.drawPath(p, paint);
        return;
      }
      for (var k = 1; k < pts.length; k++) {
        final a = at(pts[k - 1]), b = at(pts[k]);
        final len = (b - a).distance;
        final gap = paint.strokeWidth * 2.6;
        for (var d = 0.0; d < len; d += gap) {
          final t = d / len;
          canvas.drawCircle(Offset.lerp(a, b, t)!, paint.strokeWidth / 2, Paint()..color = paint.color);
        }
      }
    }

    Paint stroke(Color c, double w, [double o = 1]) => Paint()
      ..color = c.withValues(alpha: o)
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    if (!ink.off.contains('rails')) {
      final w = (zoom - 9).clamp(1.5, 7.0);
      for (final r in ink.rails) {
        path(r.points, stroke(Colors.white, w + 2, dark ? 0.35 : 0.9));
      }
      for (final r in ink.rails) {
        path(r.points, stroke(r.color, w));
      }
    }
    if (!ink.off.contains('shuttles')) {
      final w = (zoom - 10).clamp(1.0, 4.5);
      for (final r in ink.shuttles) {
        path(r.points, stroke(Colors.white, w + 2, dark ? 0.35 : 0.9));
      }
      for (final r in ink.shuttles) {
        path(r.points, stroke(r.color, w));
      }
    }
    for (final p in ink.pois) {
      if (p.kind == 'campus') {
        if (zoom < LiveMap.campusZoom || ink.off.contains('campus')) continue;
        final s = at([p.lat, p.lng]);
        final r = 3 + (zoom - LiveMap.campusZoom) / 5 * 4;
        canvas.drawCircle(s, r, Paint()..color = Colors.white);
        canvas.drawCircle(s, r, stroke(p.color ?? Colors.purple, 2 + (zoom - LiveMap.campusZoom) / 5 * 1.5));
        continue;
      }
      if (p.kind == 'stop' && (zoom < LiveMap.stopZoom || ink.off.contains('stops'))) continue;
      if (p.kind == 'station' && (zoom < LiveMap.stationZoom || ink.off.contains('stations'))) continue;
      final s = at([p.lat, p.lng]);
      if (s.dx < -20 || s.dy < -20 || s.dx > size.width + 20 || s.dy > size.height + 20) continue;
      if (p.kind == 'stop') {
        final r = 3.5 + (zoom - LiveMap.stopZoom) / 4 * 3.5;
        canvas.drawCircle(s, r, Paint()..color = Colors.white);
        canvas.drawCircle(s, r, stroke(LiveMap.busColour, 2 + (zoom - LiveMap.stopZoom) / 4));
      } else {
        final r = zoom < 14 ? 3.5 + (zoom - 10) / 4 * 3 : 6.5 + (zoom - 14) / 4 * 3.5;
        canvas.drawCircle(s, r, Paint()..color = p.color ?? Colors.white);
        canvas.drawCircle(s, r, stroke(p.colors.length > 1 ? p.colors[1] : Colors.white, 2.5));
      }
    }
    for (final d in ink.allDiscs) {
      final c = at(d.at);
      final edge = at([d.at[0] + d.metres / 110540, d.at[1]]);
      canvas.drawCircle(c, (c - edge).distance, Paint()..color = d.fill.withValues(alpha: d.opacity));
    }
    final lines = ink.allLines.toList()..sort((a, b) => a.z - b.z);
    for (final l in lines) {
      path(l.points, stroke(l.color, l.width, l.opacity), dash: l.dash);
    }
    final dots = ink.allDots.toList()..sort((a, b) => a.z - b.z);
    for (final d in dots) {
      final c = at(d.at);
      canvas.drawCircle(c, d.radius, Paint()..color = d.fill.withValues(alpha: d.fillOpacity));
      canvas.drawCircle(c, d.radius, stroke(d.stroke, d.weight));
    }
  }

  @override
  bool shouldRepaint(_PreviewPainter old) => old.centre != centre || old.zoom != zoom || old.dark != dark || old.sg != sg;
}

/// Whether the platform can draw the map: not in tests.
bool get platformMap => Native.available;
