// Save the map for offline on the desktop (Explorer's button, map_save.dart): every OpenFreeMap
// vector tile over Singapore from zoom 9 to 14, and what the map needs to draw them (both styles,
// the TileJSON, their sprites, the label fonts' ranges and the world overview's tiles over
// Singapore), fetched into the map's cache's saved folder (tile_cache.dart), where the map's
// server (map_server.dart) finds them with no connection. Android keeps the same download as
// MapLibre's offline region instead.
//
// The same as the site's js/map-save.js, within OpenFreeMap's terms for an app's offline download:
// at most maxTiles tiles and 50 MB a download, and four requests at a time. The tiles are counted
// before anything's fetched; a download that comes to the limit stops there and keeps what it has,
// every zoom out first, so only the closest-in of some places is missing. A file the map has
// already seen is copied from the cache rather than asked of OpenFreeMap again, and only what
// does come from OpenFreeMap counts towards its limit.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;

import 'tile_cache.dart';

/// Counts and fetches the offline download of Singapore's map on the desktop.
class MapPrefetch {
  /// A download of the box [box] ([south, west, north, east]) from [minZoom] to [maxZoom], with
  /// the styles at [styles], into [cache], stopping [bytesMargin] short of [maxBytes]
  /// (map_save.dart's limits, the same as Android's).
  MapPrefetch({
    required this.cache,
    required this.styles,
    required this.box,
    required this.minZoom,
    required this.maxZoom,
    required this.maxBytes,
    required this.bytesMargin,
    http.Client? client,
  })  : _client = client ?? http.Client(),
        _ownsClient = client == null;

  final TileCache cache;
  final List<String> styles;
  final List<double> box;
  final int minZoom;
  final int maxZoom;
  final int maxBytes;
  final int bytesMargin;
  final http.Client _client;

  /// Whether [_client] is this download's own, to close when it's done (not one a test gave).
  final bool _ownsClient;

  /// OpenFreeMap's TileJSON: it names this week's tiles.
  static const tileJson = '${TileCache.origin}planet';

  /// OpenFreeMap's most tiles in one download, and how many requests may run at once.
  static const maxTiles = 3000;
  static const parallel = 4;

  /// The label fonts' ranges fetched, as the site's (js/map-save.js): every one a label in
  /// Singapore's tiles has a letter from. MapLibre draws Chinese, Japanese and Korean letters
  /// itself, but not the rest, and offline one label with a letter from a range not saved leaves
  /// the whole tile it's in undrawn. Latin and its accents, Greek, Cyrillic, Arabic, Devanagari
  /// and Bengali, Tamil, Thai, Vietnamese, punctuation, letterlike symbols, CJK punctuation, the
  /// emoji selector and full-width forms.
  static const glyphRanges = [
    '0-255', '256-511', '512-767', '768-1023', '1024-1279', '1536-1791', '2304-2559', '2816-3071', '3584-3839',
    '7680-7935', '8192-8447', '8448-8703', '12288-12543', '65024-65279', '65280-65535',
  ];

  bool _cancelled = false;

  /// Stops the download as soon as the requests under way have finished.
  void cancel() => _cancelled = true;

  // ---------- counting ----------

  /// The column of zoom [z]'s tiles that longitude [lng] is in.
  static int tileX(double lng, int z) => ((lng + 180) / 360 * math.pow(2, z)).floor();

  /// The row of zoom [z]'s tiles that latitude [lat] is in (Web Mercator).
  static int tileY(double lat, int z) {
    final r = lat * math.pi / 180;
    return ((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * math.pow(2, z)).floor();
  }

  /// Every tile's address over [box] at zooms [from] to [to], from a {z}/{x}/{y} [template],
  /// zoomed furthest out first.
  static List<String> tilesFor(String template, int from, int to, List<double> box) {
    final [s, w, n, e] = box;
    return [
      for (var z = from; z <= to; z++)
        for (var x = tileX(w, z); x <= tileX(e, z); x++)
          for (var y = tileY(n, z); y <= tileY(s, z); y++) template.replaceAll('{z}', '$z').replaceAll('{x}', '$x').replaceAll('{y}', '$y'),
    ];
  }

  /// What the styles need besides the vector tiles: each style's sprites (normal and @2x), its
  /// label fonts in every range of [glyphRanges], and the tiles of any raster source (the world
  /// overview) over [box] at the closest zoom it goes, which the map draws closer in from.
  static ({List<String> files, List<String> tiles}) extrasFor(List<Map<String, dynamic>> styleJsons, List<double> box) {
    final files = <String>{};
    final tiles = <String>{};
    for (final s in styleJsons) {
      for (final sprite in _sprites(s['sprite'])) {
        for (final ending in ['.json', '.png', '@2x.json', '@2x.png']) {
          files.add('$sprite$ending');
        }
      }
      final glyphs = s['glyphs'];
      if (glyphs is String) {
        for (final stack in _fontStacks(s['layers'])) {
          for (final range in glyphRanges) {
            files.add(glyphs.replaceAll('{fontstack}', stack).replaceAll('{range}', range));
          }
        }
      }
      for (final src in ((s['sources'] as Map?) ?? const {}).values) {
        if (src is! Map || src['type'] != 'raster' || src['tiles'] is! List || (src['tiles'] as List).isEmpty) continue;
        final z = (src['maxzoom'] as num?)?.toInt() ?? 6;
        tiles.addAll(tilesFor('${(src['tiles'] as List).first}', z, z, box));
      }
    }
    return (files: files.toList(), tiles: tiles.toList());
  }

  /// A style's sprite addresses: one string, or a list of {id, url}.
  static List<String> _sprites(Object? sprite) => switch (sprite) {
        String s => [s],
        List l => [for (final e in l) if (e is Map && e['url'] is String) e['url'] as String],
        _ => const [],
      };

  /// The font stacks a style's labels use ("Noto Sans Regular", or several joined by commas),
  /// from each layer's text-font: a plain list of names, or ['literal', [names]].
  static Set<String> _fontStacks(Object? layers) {
    final stacks = <String>{};
    for (final layer in (layers as List?) ?? const []) {
      if (layer is! Map) continue;
      var font = (layer['layout'] as Map?)?['text-font'];
      if (font is List && font.length == 2 && font.first == 'literal') font = font[1];
      if (font is List && font.isNotEmpty && font.every((f) => f is String)) stacks.add(font.join(','));
    }
    return stacks;
  }

  // ---------- fetching ----------

  /// This week's tiles, from OpenFreeMap's TileJSON: their {z}/{x}/{y} address and the closest
  /// zoom they go. The TileJSON is kept in the saved folder too, so the map finds them offline.
  Future<({String template, int maxzoom})> thisWeek() async {
    final body = await _get(tileJson);
    final tj = jsonDecode(utf8.decode(body)) as Map;
    final tiles = tj['tiles'];
    if (tiles is! List || tiles.isEmpty) throw const FormatException("OpenFreeMap's TileJSON names no tiles");
    await cache.write(TileCache.segmentsOf(tileJson)!, body, saved: true);
    return (template: '${tiles.first}', maxzoom: math.min(maxZoom, (tj['maxzoom'] as num?)?.toInt() ?? maxZoom));
  }

  /// One file from OpenFreeMap, or an error saying what it answered.
  Future<List<int>> _get(String url) async {
    final segments = TileCache.segmentsOf(url);
    if (segments == null) throw ArgumentError.value(url, 'url', "isn't OpenFreeMap's");
    final uri = TileCache.remoteUri(segments);
    final r = await _client.get(uri, headers: {'User-Agent': TileCache.userAgent}).timeout(const Duration(seconds: 30));
    if (r.statusCode != 200) throw http.ClientException('OpenFreeMap replied ${r.statusCode}', uri);
    return r.bodyBytes;
  }

  /// Runs the download: counts it (throwing TooManyTiles past OpenFreeMap's limit), then fetches
  /// [parallel] at a time, telling [onProgress] after each file (how many done, of how many, and
  /// their size so far).
  Future<PrefetchResult> run({void Function(int done, int total, int bytes)? onProgress}) async {
    try {
      return await _run(onProgress);
    } finally {
      if (_ownsClient) _client.close();
    }
  }

  /// The download itself, for [run], which closes the connection after it.
  Future<PrefetchResult> _run(void Function(int done, int total, int bytes)? onProgress) async {
    final week = await thisWeek();
    final styleJsons = <Map<String, dynamic>>[];
    for (final url in styles) {
      final body = await _get(url);
      styleJsons.add(jsonDecode(utf8.decode(body)) as Map<String, dynamic>);
      await cache.write(TileCache.segmentsOf(url)!, body, saved: true);
    }
    final vector = tilesFor(week.template, minZoom, week.maxzoom, box);
    final extras = extrasFor(styleJsons, box);
    final tileCount = vector.length + extras.tiles.length;
    if (tileCount > maxTiles) throw TooManyTiles(tileCount, maxTiles);

    // The sprites and fonts first, then the tiles, furthest out first.
    final jobs = [...extras.files, ...extras.tiles, ...vector];
    final total = jobs.length;
    var next = 0, done = 0, failed = 0, bytes = 0, sent = 0;
    var capped = false;
    onProgress?.call(0, total, 0);

    Future<void> worker() async {
      while (!_cancelled && !capped && next < jobs.length) {
        final url = jobs[next++];
        var got = await _keep(url);
        if (got == null && !_cancelled) got = await _keep(url);
        done++;
        if (got == null) {
          failed++;
        } else {
          bytes += got.bytes;
          sent += got.sent;
        }
        if (sent >= maxBytes - bytesMargin) capped = true;
        onProgress?.call(done, total, bytes);
      }
    }

    await Future.wait([for (var i = 0; i < parallel; i++) worker()]);
    return PrefetchResult(
      week: week.template,
      total: total,
      done: done,
      failed: failed,
      bytes: bytes,
      capped: capped,
      cancelled: _cancelled,
      tileCount: vector.length,
    );
  }

  /// Keeps one file in the saved folder: as it is if it's there already (this week's), copied
  /// from what the map has seen, or fetched. Its size and how much of it came from OpenFreeMap,
  /// or null if it couldn't be had.
  Future<({int bytes, int sent})?> _keep(String url) async {
    final segments = TileCache.segmentsOf(url);
    if (segments == null) return null;
    try {
      final had = await cache.savedSize(segments);
      if (had != null) return (bytes: had, sent: 0);
      final copied = await cache.saveFromSeen(segments);
      if (copied != null) return (bytes: copied, sent: 0);
      final body = await _get(url);
      await cache.write(segments, body, saved: true);
      return (bytes: body.length, sent: body.length);
    } catch (_) {
      return null;
    }
  }
}

/// How a download went.
class PrefetchResult {
  const PrefetchResult({
    required this.week,
    required this.total,
    required this.done,
    required this.failed,
    required this.bytes,
    required this.capped,
    required this.cancelled,
    required this.tileCount,
  });

  /// This week's tiles' {z}/{x}/{y} address (the TileJSON's), kept with the download.
  final String week;
  final int total;
  final int done;
  final int failed;

  /// The size of everything kept.
  final int bytes;

  /// Stopped at OpenFreeMap's limit for one download.
  final bool capped;
  final bool cancelled;

  /// How many vector tiles the download has.
  final int tileCount;

  /// The week's folder name in [week]'s address (such as 20261101_080013_pt), or null.
  String? get weekFolder {
    final segments = TileCache.segmentsOf(week);
    return segments != null && segments.length >= 2 && segments.first == 'planet' ? segments[1] : null;
  }
}

/// More tiles than OpenFreeMap allows in one download.
class TooManyTiles implements Exception {
  const TooManyTiles(this.count, this.max);
  final int count;
  final int max;

  @override
  String toString() => 'That\'s $count tiles, more than the $max OpenFreeMap allows in one download.';
}
