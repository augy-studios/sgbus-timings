// The live map on the desktop: MapLibre GL JS, the JavaScript build of the engine Android's map
// uses, in a WebView (webview_all: WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux).
// SgMap (../sg_map.dart) builds it in place of MapLibreMap, with the same options and callbacks.
//
// How it starts: the map's local server (map_server.dart) serves the page (assets/desktop/map/
// map.html and map.js); once the page says it's ready, this sends it the map's set-up (style,
// camera, zoom limits), hands the live map its controller (web_map_controller.dart), and from then
// on turns the page's events into the map's callbacks: style loaded, camera moving and idle, a
// click, a long press (a right-click), and a drag that should stop following you.
//
// The WebView may only show the map's page: any other navigation is stopped, a link (the map's
// credits) opens in the browser instead, and the page itself turns off the WebView's own menu.
// The light and dark styles follow the app's theme as LiveMap passes them.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_all/webview_all.dart';

import '../../../i18n/i18n.dart';
import '../sg_map.dart';
import 'map_commands.dart';
import 'map_server.dart';
import 'web_map_controller.dart';

/// MapLibre GL JS in a WebView, with MapLibreMap's options and callbacks (see SgMap).
class WebMapView extends StatefulWidget {
  /// Builds the desktop map with the options SgMap passes on.
  const WebMapView({
    super.key,
    required this.styleString,
    required this.initialCameraPosition,
    this.minMaxZoomPreference = MinMaxZoomPreference.unbounded,
    this.cameraTargetBounds = CameraTargetBounds.unbounded,
    this.tiltGesturesEnabled = true,
    this.compassEnabled = true,
    this.compassViewMargins,
    this.attributionButtonPosition = AttributionButtonPosition.bottomRight,
    this.onMapCreated,
    this.onStyleLoadedCallback,
    this.onMapClick,
    this.onMapLongClick,
    this.onCameraMove,
    this.onCameraIdle,
    this.onCameraTrackingDismissed,
  });

  final String styleString;
  final CameraPosition initialCameraPosition;
  final MinMaxZoomPreference minMaxZoomPreference;
  final CameraTargetBounds cameraTargetBounds;
  final bool tiltGesturesEnabled;
  final bool compassEnabled;
  final math.Point<num>? compassViewMargins;
  final AttributionButtonPosition attributionButtonPosition;
  final void Function(SgMapController controller)? onMapCreated;
  final VoidCallback? onStyleLoadedCallback;
  final OnMapClickCallback? onMapClick;
  final OnMapLongClickCallback? onMapLongClick;
  final OnCameraMoveCallback? onCameraMove;
  final VoidCallback? onCameraIdle;
  final VoidCallback? onCameraTrackingDismissed;

  /// The ground shown before the map's style draws, by the theme: MapPreview's colours, so a dark
  /// map never flashes white.
  static Color groundFor(Brightness b) => b == Brightness.dark ? const Color(0xFF1E2326) : const Color(0xFFF2EFE9);

  @override
  State<WebMapView> createState() => _WebMapViewState();
}

class _WebMapViewState extends State<WebMapView> {
  WebViewController? _web;
  WebSgMapController? _map;
  String? _failed;

  /// The page load the set-up was last sent to (each load says its own random id when ready),
  /// so a reload gets the set-up again and a repeated "ready" doesn't.
  String? _initialisedPage;
  bool _created = false;
  String? _style;
  Color? _ground;

  /// Starts the map's server and the WebView once the first frame has its theme.
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  /// Makes the WebView: JavaScript on, the theme's ground behind it, the page's channel, links
  /// and navigation held, then the page from the local server. The WebView and its controller are
  /// in place before the page loads, so its "ready" always finds them.
  Future<void> _start() async {
    try {
      await MapServer.instance.start();
      if (!mounted) return;
      final ground = _groundNow();
      final web = WebViewController();
      final map = WebSgMapController(web.runJavaScript)..onEvent = _onEvent;
      await web.setJavaScriptMode(JavaScriptMode.unrestricted);
      await _optional(() => web.setBackgroundColor(ground));
      await web.addJavaScriptChannel(MapCommands.channel, onMessageReceived: (m) => map.receive(m.message));
      await web.setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: _onNavigation,
        // In case the page's own "ready" came before the channel was listening.
        onPageFinished: (_) => _optional(() => web.runJavaScript('window.sgMap && window.sgMap.hello()')),
      ));
      if (!mounted) return;
      _ground = ground;
      _style = widget.styleString;
      setState(() {
        _web = web;
        _map = map;
      });
      await web.loadRequest(MapServer.instance.pageUri);
    } catch (e) {
      if (kDebugMode) debugPrint('Map: $e');
      if (mounted) setState(() => _failed = '$e');
    }
  }

  /// Runs a WebView call the map can do without (one a platform may not have, such as a
  /// background colour), ignoring its failure, however it fails.
  static Future<void> _optional(Future<void> Function() call) async {
    try {
      await call();
    } catch (e) {
      if (kDebugMode) debugPrint('Map (carrying on): $e');
    }
  }

  /// The theme's ground colour now.
  Color _groundNow() => WebMapView.groundFor(Theme.of(context).brightness);

  /// Lets the WebView go only to the map's own page and files; a link to anywhere else (the
  /// map's credits) opens in the browser instead.
  NavigationDecision _onNavigation(NavigationRequest request) {
    if (request.url.startsWith(MapServer.instance.base.toString()) || request.url == 'about:blank') return NavigationDecision.navigate;
    _openOutside(request.url);
    return NavigationDecision.prevent;
  }

  /// Opens an http(s) or mailto link in the browser or mail app; anything else is dropped.
  void _openOutside(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null || !const ['https', 'http', 'mailto'].contains(uri.scheme)) return;
    launchUrl(uri, mode: LaunchMode.externalApplication).catchError((Object _) => false);
  }

  /// Turns one of the page's events into the map's callback.
  void _onEvent(String event, Map<String, dynamic> data) {
    if (!mounted) return;
    switch (event) {
      case 'ready':
        _initPage('${data['page']}');
      case 'style':
        _map?.styleLoaded();
        widget.onStyleLoadedCallback?.call();
      case 'move':
        final c = _map?.cameraPosition;
        if (c != null) widget.onCameraMove?.call(c);
      case 'idle':
        widget.onCameraIdle?.call();
      case 'click':
        final at = _pointAndPlace(data);
        if (at != null) widget.onMapClick?.call(at.point, at.place);
      case 'longpress':
        final at = _pointAndPlace(data);
        if (at != null) widget.onMapLongClick?.call(at.point, at.place);
      case 'gesture':
        widget.onCameraTrackingDismissed?.call();
      case 'link':
        _openOutside('${data['url']}');
      case 'error':
        if (kDebugMode) debugPrint('Map page: ${data['message']}');
    }
  }

  /// A tap's point on the map's widget and its place, from the page's {x, y, lat, lng}.
  ({math.Point<double> point, LatLng place})? _pointAndPlace(Map<String, dynamic> data) {
    final [x, y, lat, lng] = [data['x'], data['y'], data['lat'], data['lng']];
    if (x is! num || y is! num || lat is! num || lng is! num) return null;
    return (point: math.Point(x.toDouble(), y.toDouble()), place: LatLng(lat.toDouble(), lng.toDouble()));
  }

  /// Sends a newly loaded page its set-up. The first time, the live map then gets its
  /// controller; after a reload (which the WebView might do by itself), the map comes back where
  /// the camera was, and its style loading again has the live map add its layers again.
  Future<void> _initPage(String page) async {
    final map = _map;
    if (map == null || page == _initialisedPage) return;
    final reload = _initialisedPage != null;
    _initialisedPage = page;
    if (reload) map.pageReset();
    final bounds = widget.cameraTargetBounds.bounds;
    try {
      await map.init(MapCommands.init(
        style: _style ?? widget.styleString,
        camera: map.cameraPosition ?? widget.initialCameraPosition,
        minZoom: widget.minMaxZoomPreference.minZoom,
        maxZoom: widget.minMaxZoomPreference.maxZoom,
        bounds: bounds,
        tilt: widget.tiltGesturesEnabled,
        compass: widget.compassEnabled,
        compassMargins: widget.compassViewMargins == null ? null : [widget.compassViewMargins!.x, widget.compassViewMargins!.y],
        attribution: widget.attributionButtonPosition.name,
        ground: _ground ?? _groundNow(),
      ));
    } catch (e) {
      if (kDebugMode) debugPrint('Map set-up: $e');
      return;
    }
    if (!mounted || _created) return;
    _created = true;
    widget.onMapCreated?.call(map);
  }

  /// Swaps the style when the theme changes (LiveMap passes the light or dark one), with the
  /// WebView's ground to match.
  @override
  void didUpdateWidget(WebMapView old) {
    super.didUpdateWidget(old);
    final map = _map;
    if (map == null || widget.styleString == _style) return;
    _style = widget.styleString;
    final ground = _groundNow();
    _ground = ground;
    final web = _web;
    if (web != null) _optional(() => web.setBackgroundColor(ground));
    if (_initialisedPage != null) map.setStyle(widget.styleString, ground).catchError((Object _) {});
  }

  /// Fails any command still waiting, as the page goes with the widget.
  @override
  void dispose() {
    _map?.pageReset(closed: true);
    super.dispose();
  }

  /// The WebView once it's made (the map's own drags and scrolls go to it), the theme's plain
  /// ground until then, or a short note if the map couldn't start (the reason goes to the debug
  /// log).
  @override
  Widget build(BuildContext context) {
    final web = _web;
    final ground = WebMapView.groundFor(Theme.of(context).brightness);
    if (web == null) {
      return ColoredBox(
        color: ground,
        child: _failed == null ? const SizedBox.expand() : Center(child: Text(tr('desktop.mapFailed', "The map couldn't start."), textAlign: TextAlign.center)),
      );
    }
    return WebViewWidget(
      controller: web,
      // Every drag, scroll and pinch on the map is the map's, not a scrolling page's around it.
      gestureRecognizers: {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())},
    );
  }
}
