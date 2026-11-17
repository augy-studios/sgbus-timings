// The desktop map's own small web server, on this computer only (127.0.0.1, a port the system
// picks): it serves the map's page (assets/desktop/map/: map.html, map.js and MapLibre GL JS) to
// the WebView, and stands between the map and OpenFreeMap, so every style, tile, font and sprite
// the map asks for goes through the disk cache (tile_cache.dart). The page sends OpenFreeMap's
// addresses here through MapLibre's transformRequest (map.js): https://tiles.openfreemap.org/x
// becomes http://127.0.0.1:<port>/<key>/ofm/x.
//
// What's asked for:
//   - the styles and the TileJSON: from OpenFreeMap first (they change), else the copy kept;
//   - tiles, fonts and sprites: the copy kept first (they never change at their address), else
//     OpenFreeMap's, kept for next time; offline, a vector tile missing this week is taken from
//     any week kept.
//
// Only this app's WebView should use it: every address starts with a random key made at start-up,
// a request must name 127.0.0.1 and the port as its host (so another site can't reach it by a
// trick of its DNS), and it only ever fetches from OpenFreeMap. It runs until the app quits.
import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;

import 'tile_cache.dart';

/// The map's local server: one for the whole app, started the first time a map opens.
class MapServer {
  /// The app's server, with the cache in this computer's usual places.
  MapServer._() : this.withCache(TileCache.forThisComputer());

  /// A server with its own [cache], fetching with [client] (the tests' pretend OpenFreeMap).
  @visibleForTesting
  MapServer.withCache(this.cache, {http.Client? client}) : _client = client ?? http.Client();

  /// The one server.
  static final MapServer instance = MapServer._();

  /// The page's files, served from the app's assets by their names.
  static const pageFiles = {
    'map.html': 'text/html; charset=utf-8',
    'map.js': 'text/javascript; charset=utf-8',
    'maplibre-gl.js': 'text/javascript; charset=utf-8',
    'maplibre-gl.css': 'text/css; charset=utf-8',
  };
  static const _assets = 'assets/desktop/map';

  /// How long OpenFreeMap has to answer: briefly for a style or the TileJSON, which have a kept
  /// copy to fall back on, longer for a tile, which may have none.
  static const mutableTimeout = Duration(seconds: 6);
  static const fetchTimeout = Duration(seconds: 20);

  /// The cache every file goes through; the offline download (map_prefetch.dart) writes to it too.
  final TileCache cache;

  final String _key = _randomKey();
  HttpServer? _server;
  Future<void>? _starting;
  final http.Client _client;

  /// Files being fetched now, by cache name, so the same tile asked for twice at once is fetched
  /// once.
  final Map<String, Future<_Got>> _fetching = {};

  /// A random key of 32 hex digits for the addresses, so nothing else on this computer can guess
  /// them.
  static String _randomKey() {
    final r = math.Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }

  /// The address the page and its files are under: `http://127.0.0.1:<port>/<key>/`. Only once
  /// [start] has finished.
  Uri get base => Uri.parse('http://127.0.0.1:${_server!.port}/$_key/');

  /// The map page's address, for the WebView to load.
  Uri get pageUri => base.resolve('map.html');

  /// Starts the server if it isn't running yet (once, however many maps ask), and tidies the
  /// cache of what's been seen in the background. If it couldn't start, the next map to open
  /// tries again.
  Future<void> start() => _starting ??= _start().catchError((Object e, StackTrace s) {
        _starting = null;
        Error.throwWithStackTrace(e, s);
      });

  /// Binds to a free port on 127.0.0.1 and starts answering.
  Future<void> _start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.autoCompress = false;
    _server = server;
    server.listen((request) => _answer(request).catchError((Object _) {}));
    unawaited(cache.trimSeen());
  }

  /// Stops the server (the tests'; the app's runs until it quits).
  @visibleForTesting
  Future<void> close() async => _server?.close(force: true);

  /// Answers one request: the page's files, OpenFreeMap's through the cache, or 404.
  Future<void> _answer(HttpRequest request) async {
    final response = request.response;
    response.headers.set('Cache-Control', 'no-store');
    try {
      final parts = request.uri.pathSegments;
      if (!_trusted(request) || parts.isEmpty || parts.first != _key) {
        return await _reply(response, HttpStatus.notFound);
      }
      if (request.method != 'GET' && request.method != 'HEAD') {
        return await _reply(response, HttpStatus.methodNotAllowed);
      }
      if (parts.length == 2 && pageFiles.containsKey(parts[1])) {
        final data = await rootBundle.load('$_assets/${parts[1]}');
        return await _reply(response, HttpStatus.ok, type: pageFiles[parts[1]], body: data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
      }
      if (parts.length > 2 && parts[1] == 'ofm') {
        final got = await _openFreeMap(parts.sublist(2));
        return await _reply(response, got.status, type: got.type, body: got.body);
      }
      await _reply(response, HttpStatus.notFound);
    } catch (e) {
      if (kDebugMode) debugPrint('Map server: ${request.uri.path}: $e');
      try {
        await _reply(response, HttpStatus.internalServerError);
      } catch (_) {}
    }
  }

  /// Whether the request names this server as its host, 127.0.0.1 and its port: a site whose
  /// name was made to point here would name itself instead.
  bool _trusted(HttpRequest request) => request.headers.host == '127.0.0.1' && request.headers.port == _server?.port;

  /// Sends a reply with [status], and [body] of [type] if there is one.
  Future<void> _reply(HttpResponse response, int status, {String? type, Uint8List? body}) async {
    response.statusCode = status;
    if (type != null) response.headers.contentType = ContentType.parse(type);
    if (body != null) {
      response.contentLength = body.length;
      response.add(body);
    }
    await response.close();
  }

  /// The file at [segments] on OpenFreeMap, by the cache's rules (this file's opening comment):
  /// styles and the TileJSON from the network first, the rest from the cache first.
  Future<_Got> _openFreeMap(List<String> segments) async {
    final key = TileCache.keyFor(segments);
    if (key == null) return const _Got(HttpStatus.notFound);
    final type = TileCache.contentTypeFor(segments);
    if (TileCache.isMutable(segments)) {
      final fresh = await _fetchOnce(key, segments, mutableTimeout);
      if (fresh.status == HttpStatus.ok) return fresh;
      final kept = await cache.read(segments);
      return kept != null ? _Got(HttpStatus.ok, type: type, body: kept) : fresh;
    }
    final kept = await cache.read(segments);
    if (kept != null) return _Got(HttpStatus.ok, type: type, body: kept);
    final fresh = await _fetchOnce(key, segments, fetchTimeout);
    if (fresh.status != HttpStatus.gatewayTimeout) return fresh;
    final older = await cache.readAnyWeek(segments);
    return older != null ? _Got(HttpStatus.ok, type: type, body: older) : fresh;
  }

  /// Fetches the file at [segments] from OpenFreeMap, once however many ask at the same time.
  /// (The block braces matter: remove() returns this very Future, and whenComplete would wait
  /// for a Future its callback returned, so it would wait for itself for ever.)
  Future<_Got> _fetchOnce(String key, List<String> segments, Duration timeout) => _fetching[key] ??= _fetch(segments, timeout).whenComplete(() {
        _fetching.remove(key);
      });

  /// Fetches the file at [segments] from OpenFreeMap and keeps a good answer in the seen folder.
  /// No answer at all (offline, or too slow) is a 504, which the caller can fall back from; an
  /// answer OpenFreeMap gave (a 404 past the edge of the world) is passed on as it is.
  Future<_Got> _fetch(List<String> segments, Duration timeout) async {
    final uri = TileCache.remoteUri(segments);
    try {
      final r = await _client.get(uri, headers: {'User-Agent': TileCache.userAgent}).timeout(timeout);
      if (r.statusCode != HttpStatus.ok) return _Got(r.statusCode);
      await cache.write(segments, r.bodyBytes);
      return _Got(HttpStatus.ok, type: TileCache.contentTypeFor(segments), body: r.bodyBytes);
    } catch (_) {
      return const _Got(HttpStatus.gatewayTimeout);
    }
  }
}

/// One answer for the map: its status, and its type and bytes when there are some.
class _Got {
  const _Got(this.status, {this.type, this.body});
  final int status;
  final String? type;
  final Uint8List? body;
}
