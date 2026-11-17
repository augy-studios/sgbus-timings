// Save the map for offline on the desktop (lib/features/map/web/map_prefetch.dart): which files
// it fetches, OpenFreeMap's limits, and a download run against a pretend OpenFreeMap.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sgbus_timings/features/map/map_save.dart';
import 'package:sgbus_timings/features/map/web/map_prefetch.dart';
import 'package:sgbus_timings/features/map/web/tile_cache.dart';

const template = 'https://tiles.openfreemap.org/planet/20261101_080013_pt/{z}/{x}/{y}.pbf';

/// A style much like OpenFreeMap's Liberty: a sprite, the glyphs, three fonts (one as a literal),
/// the vector source and the world overview's raster.
Map<String, dynamic> style() => {
      'version': 8,
      'sprite': 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
      'glyphs': 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      'sources': {
        'openmaptiles': {'type': 'vector', 'url': 'https://tiles.openfreemap.org/planet'},
        'ne2_shaded': {
          'type': 'raster',
          'maxzoom': 6,
          'tiles': ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
        },
      },
      'layers': [
        {'id': 'bg', 'type': 'background'},
        {
          'id': 'a',
          'type': 'symbol',
          'layout': {
            'text-font': ['Noto Sans Regular'],
          },
        },
        {
          'id': 'b',
          'type': 'symbol',
          'layout': {
            'text-font': ['Noto Sans Bold'],
          },
        },
        {
          'id': 'c',
          'type': 'symbol',
          'layout': {
            'text-font': [
              'literal',
              ['Noto Sans Italic'],
            ],
          },
        },
        {
          'id': 'd',
          'type': 'symbol',
          'layout': {
            'text-font': ['Noto Sans Regular'],
          },
        },
      ],
    };

void main() {
  group('counting', () {
    test("Singapore's box from zoom 9 to 14 is the 616 tiles the sheet says", () {
      expect(MapPrefetch.tilesFor(template, 9, 14, MapSave.box), hasLength(616));
    });

    test('tiles furthest out first, with the address filled in', () {
      final tiles = MapPrefetch.tilesFor(template, 9, 10, MapSave.box);
      expect(tiles.first, 'https://tiles.openfreemap.org/planet/20261101_080013_pt/9/403/253.pbf');
      expect(tiles.take(4).every((t) => t.contains('/9/')), isTrue);
      expect(tiles.last, contains('/10/'));
    });

    test('the tile a place is in, as Web Mercator has it', () {
      expect(MapPrefetch.tileX(103.8198, 14), 12916);
      expect(MapPrefetch.tileY(1.3521, 14), 8130);
    });

    test("a style's sprites, its fonts in every range, and the overview's tiles over Singapore", () {
      final extras = MapPrefetch.extrasFor([style(), style()], MapSave.box);
      final sprites = extras.files.where((f) => f.contains('/sprites/')).toList();
      expect(sprites, [
        'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json',
        'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.png',
        'https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.json',
        'https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png',
      ]);
      final fonts = extras.files.where((f) => f.contains('/fonts/')).toList();
      expect(fonts, hasLength(3 * MapPrefetch.glyphRanges.length));
      expect(fonts, contains('https://tiles.openfreemap.org/fonts/Noto Sans Italic/2816-3071.pbf'));
      expect(extras.tiles, ['https://tiles.openfreemap.org/natural_earth/ne2sr/6/50/31.png']);
    });

    test("the site's 15 font ranges", () {
      expect(MapPrefetch.glyphRanges, hasLength(15));
      expect(MapPrefetch.glyphRanges.first, '0-255');
      expect(MapPrefetch.glyphRanges, contains('2816-3071')); // Tamil
    });
  });

  group('a download', () {
    late Directory root;
    late TileCache cache;
    late List<String> asked;
    setUp(() {
      root = Directory.systemTemp.createTempSync('map_prefetch_test');
      cache = TileCache(seenDir: '${root.path}/seen', savedDir: '${root.path}/saved');
      asked = [];
    });
    tearDown(() => root.deleteSync(recursive: true));

    /// A pretend OpenFreeMap: the TileJSON, the two styles, and [size] bytes for anything else.
    http.Client openFreeMap({int size = 1000, int maxzoom = 14}) => MockClient((request) async {
          asked.add(request.url.toString());
          expect(request.headers['User-Agent'], startsWith('SGBusTimingsDesktop/'));
          final path = request.url.path;
          if (path == '/planet') {
            return http.Response(jsonEncode({'tiles': [template], 'maxzoom': maxzoom}), 200);
          }
          if (path.startsWith('/styles/')) return http.Response(jsonEncode(style()), 200);
          return http.Response.bytes(List.filled(size, 7), 200);
        });

    MapPrefetch download(http.Client client, {List<double> box = MapSave.box, int maxBytes = MapSave.maxBytes}) => MapPrefetch(
          cache: cache,
          styles: const ['https://tiles.openfreemap.org/styles/liberty', 'https://tiles.openfreemap.org/styles/dark'],
          box: box,
          minZoom: 9,
          maxZoom: 14,
          maxBytes: maxBytes,
          bytesMargin: MapSave.bytesMargin,
          client: client,
        );

    test('everything is fetched once and kept in the saved folder, the TileJSON and styles too', () async {
      final progress = <int>[];
      final r = await download(openFreeMap()).run(onProgress: (done, total, bytes) => progress.add(done));
      // 616 vector tiles, 1 overview tile, 4 sprite files, 3 fonts x 15 ranges.
      expect(r.total, 616 + 1 + 4 + 45);
      expect(r.done, r.total);
      expect(r.failed, 0);
      expect(r.capped, isFalse);
      expect(r.cancelled, isFalse);
      expect(r.tileCount, 616);
      expect(r.week, template);
      expect(r.weekFolder, '20261101_080013_pt');
      expect(r.bytes, r.total * 1000);
      expect(progress.last, r.total);
      expect(await cache.savedSize(['planet']), isNotNull);
      expect(await cache.savedSize(['styles', 'dark']), isNotNull);
      expect(await cache.savedSize(['fonts', 'Noto Sans Regular', '0-255.pbf']), 1000);
      expect(asked, contains('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'));
      expect(asked.toSet(), hasLength(asked.length), reason: 'nothing asked for twice');
    });

    test('what the map has already seen is copied, not asked of OpenFreeMap again', () async {
      await cache.write(['planet', '20261101_080013_pt', '9', '403', '253.pbf'], [1, 2, 3]);
      await download(openFreeMap()).run();
      expect(asked, isNot(contains('https://tiles.openfreemap.org/planet/20261101_080013_pt/9/403/253.pbf')));
      expect(await cache.savedSize(['planet', '20261101_080013_pt', '9', '403', '253.pbf']), 3);
    });

    test('a second download fetches only the TileJSON and styles again', () async {
      await download(openFreeMap()).run();
      asked.clear();
      await download(openFreeMap()).run();
      expect(asked, hasLength(3));
    });

    test("it stops near OpenFreeMap's limit and keeps what it has", () async {
      final r = await download(openFreeMap(size: 100 * 1024), maxBytes: 3 * 1024 * 1024).run();
      expect(r.capped, isTrue);
      expect(r.done, lessThan(r.total));
      // Stopped at 2 MB (1 MB short of the limit), give or take the requests under way.
      expect(r.bytes, inInclusiveRange(2 * 1024 * 1024, 2 * 1024 * 1024 + MapPrefetch.parallel * 100 * 1024));
    });

    test("more tiles than OpenFreeMap allows aren't fetched at all", () async {
      final p = download(openFreeMap(), box: const [1.0, 103.0, 2.0, 105.0]);
      await expectLater(p.run(), throwsA(isA<TooManyTiles>()));
      expect(asked.where((u) => u.endsWith('.pbf')), isEmpty);
    });

    test('a download cancelled stops', () async {
      late MapPrefetch p;
      p = download(openFreeMap());
      final r = await p.run(onProgress: (done, total, bytes) {
        if (done == 10) p.cancel();
      });
      expect(r.cancelled, isTrue);
      expect(r.done, lessThan(20));
    });

    test("a file OpenFreeMap can't give is tried twice and counted as failed", () async {
      final client = MockClient((request) async {
        final path = request.url.path;
        if (path == '/planet') return http.Response(jsonEncode({'tiles': [template], 'maxzoom': 14}), 200);
        if (path.startsWith('/styles/')) return http.Response(jsonEncode(style()), 200);
        if (path.endsWith('/9/403/253.pbf')) {
          asked.add(path);
          return http.Response('', 500);
        }
        return http.Response.bytes([1], 200);
      });
      final r = await download(client).run();
      expect(r.failed, 1);
      expect(asked, hasLength(2));
    });
  });
}
