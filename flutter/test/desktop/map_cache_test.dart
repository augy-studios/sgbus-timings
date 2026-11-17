// The desktop map's disk cache (lib/features/map/web/tile_cache.dart): how an OpenFreeMap address
// becomes a file's name, which files are asked of the network first, where the folders are on
// each system, and reading, writing and tidying them.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/map/web/tile_cache.dart';

void main() {
  group('names', () {
    test("an address's path, decoded, from a full address or the path alone", () {
      expect(TileCache.segmentsOf('https://tiles.openfreemap.org/planet/20261101_080013_pt/14/12930/8130.pbf'), ['planet', '20261101_080013_pt', '14', '12930', '8130.pbf']);
      expect(TileCache.segmentsOf('fonts/Noto%20Sans%20Regular/0-255.pbf'), ['fonts', 'Noto Sans Regular', '0-255.pbf']);
      expect(TileCache.segmentsOf('https://tiles.openfreemap.org/fonts/Noto Sans Bold/256-511.pbf'), ['fonts', 'Noto Sans Bold', '256-511.pbf']);
      expect(TileCache.segmentsOf('styles/liberty?v=2'), ['styles', 'liberty']);
    });

    test("only OpenFreeMap's addresses", () {
      expect(TileCache.segmentsOf('https://example.com/planet'), isNull);
      expect(TileCache.segmentsOf('http://tiles.openfreemap.org/planet'), isNull);
    });

    test("a tile's file keeps its path, ending in .cached", () {
      expect(TileCache.keyFor(['planet', '20261101_080013_pt', '14', '12930', '8130.pbf']), 'planet/20261101_080013_pt/14/12930/8130.pbf.cached');
      expect(TileCache.keyFor(['planet']), 'planet.cached');
      expect(TileCache.keyFor(['sprites', 'ofm_f384', 'ofm@2x.png']), 'sprites/ofm_f384/ofm@2x.png.cached');
    });

    test('a font stack: spaces written as ~20, commas kept', () {
      expect(TileCache.keyFor(['fonts', 'Noto Sans Regular,Noto Sans Bold', '0-255.pbf']), 'fonts/Noto~20Sans~20Regular,Noto~20Sans~20Bold/0-255.pbf.cached');
    });

    test("what a file name can't hold, and ~ itself, as ~ and hex", () {
      expect(TileCache.keyFor(['a:b', 'e~f']), 'a~3Ab/e~7Ef.cached');
      expect(TileCache.keyFor(['café']), 'caf~C3~A9.cached');
      expect(TileCache.keyFor(['dot.']), 'dot~2E.cached');
    });

    test('nothing that could climb out of the cache', () {
      expect(TileCache.keyFor(['planet', '..', 'x']), isNull);
      expect(TileCache.keyFor(['.']), isNull);
      expect(TileCache.keyFor(['a', '', 'b']), isNull);
      expect(TileCache.keyFor([]), isNull);
      expect(TileCache.keyFor(TileCache.segmentsOf('fonts/%2E%2E/x')!), isNull);
      // An encoded slash or backslash inside a part: never one of OpenFreeMap's.
      expect(TileCache.keyFor(TileCache.segmentsOf('fonts/a%2F..%2F..%2Fb/x')!), isNull);
      expect(TileCache.keyFor(['fonts', 'a\\b']), isNull);
    });

    test('the styles and the TileJSON are asked of the network first; the rest of the cache', () {
      expect(TileCache.isMutable(['planet']), isTrue);
      expect(TileCache.isMutable(['styles', 'liberty']), isTrue);
      expect(TileCache.isMutable(['styles', 'dark']), isTrue);
      expect(TileCache.isMutable(['planet', '20261101_080013_pt', '9', '403', '253.pbf']), isFalse);
      expect(TileCache.isMutable(['fonts', 'Noto Sans Regular', '0-255.pbf']), isFalse);
      expect(TileCache.isMutable(['sprites', 'ofm_f384', 'ofm.json']), isFalse);
    });

    test("a vector tile's week and place", () {
      expect(TileCache.tileOf(['planet', 'w1', '14', '12930', '8130.pbf']), (week: 'w1', z: 14, x: 12930, y: 8130));
      expect(TileCache.tileOf(['planet']), isNull);
      expect(TileCache.tileOf(['natural_earth', 'ne2sr', '6', '50', '31.png']), isNull);
    });

    test('the type each is served with', () {
      expect(TileCache.contentTypeFor(['planet', 'w', '1', '2', '3.pbf']), 'application/x-protobuf');
      expect(TileCache.contentTypeFor(['sprites', 'ofm_f384', 'ofm.png']), 'image/png');
      expect(TileCache.contentTypeFor(['styles', 'liberty']), 'application/json');
      expect(TileCache.contentTypeFor(['planet']), 'application/json');
    });

    test('the address it is fetched from, encoded again', () {
      expect(TileCache.remoteUri(['fonts', 'Noto Sans Regular', '0-255.pbf']).toString(), 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf');
    });
  });

  group('folders', () {
    test('Windows: both under LOCALAPPDATA, so a roaming profile leaves them', () {
      final d = TileCache.foldersFor(os: 'windows', env: {'LOCALAPPDATA': r'C:\Users\a\AppData\Local'}, settingsDir: r'C:\Users\a\AppData\Roaming\SG Bus Timings');
      expect(d.seen, r'C:\Users\a\AppData\Local\SG Bus Timings\Map\seen');
      expect(d.saved, r'C:\Users\a\AppData\Local\SG Bus Timings\Map\saved');
    });

    test("macOS: seen in Caches, saved in the app's folder", () {
      final d = TileCache.foldersFor(os: 'macos', env: {'HOME': '/Users/a'}, settingsDir: '/Users/a/Library/Application Support/SG Bus Timings');
      expect(d.seen, '/Users/a/Library/Caches/SG Bus Timings/Map');
      expect(d.saved, '/Users/a/Library/Application Support/SG Bus Timings/Saved map');
    });

    test("Linux: seen in the XDG cache folder, saved in the app's folder", () {
      final settings = '/home/a/.config/SG Bus Timings';
      expect(TileCache.foldersFor(os: 'linux', env: {'HOME': '/home/a'}, settingsDir: settings).seen, '/home/a/.cache/SG Bus Timings/Map');
      expect(TileCache.foldersFor(os: 'linux', env: {'HOME': '/home/a', 'XDG_CACHE_HOME': '/tmp/c'}, settingsDir: settings).seen, '/tmp/c/SG Bus Timings/Map');
      expect(TileCache.foldersFor(os: 'linux', env: {'HOME': '/home/a'}, settingsDir: settings).saved, '/home/a/.config/SG Bus Timings/Saved map');
    });
  });

  group('on disk', () {
    late Directory root;
    late TileCache cache;
    setUp(() {
      root = Directory.systemTemp.createTempSync('map_cache_test');
      cache = TileCache(seenDir: '${root.path}/seen', savedDir: '${root.path}/saved');
    });
    tearDown(() => root.deleteSync(recursive: true));

    const tile = ['planet', 'w2', '14', '12930', '8130.pbf'];

    test('a file written is read back, and nothing is left half-written beside it', () async {
      await cache.write(tile, [1, 2, 3]);
      expect(await cache.read(tile), [1, 2, 3]);
      expect(File('${root.path}/seen/planet/w2/14/12930/8130.pbf.cached').existsSync(), isTrue);
      final leftovers = Directory('${root.path}/seen').listSync(recursive: true).where((e) => e.path.endsWith('.part'));
      expect(leftovers, isEmpty);
    });

    test('a tile: the saved copy first; a style: the seen copy, written on every look online', () async {
      await cache.write(tile, [1], saved: true);
      await cache.write(tile, [2]);
      expect(await cache.read(tile), [1]);
      await cache.write(['styles', 'liberty'], [3], saved: true);
      await cache.write(['styles', 'liberty'], [4]);
      expect(await cache.read(['styles', 'liberty']), [4]);
    });

    test('offline, a tile missing this week is taken from the newest week kept', () async {
      await cache.write(['planet', 'w1', '14', '12930', '8130.pbf'], [1], saved: true);
      await cache.write(['planet', 'w0', '14', '12930', '8130.pbf'], [0], saved: true);
      expect(await cache.read(tile), isNull);
      expect(await cache.readAnyWeek(tile), [1]);
      expect(await cache.readAnyWeek(['planet', 'w2', '14', '1', '1.pbf']), isNull);
    });

    test('a seen file copied into the saved folder, but never a style', () async {
      await cache.write(tile, [5, 6]);
      expect(await cache.saveFromSeen(tile), 2);
      expect(await cache.savedSize(tile), 2);
      await cache.write(['styles', 'dark'], [7]);
      expect(await cache.saveFromSeen(['styles', 'dark']), isNull);
    });

    test("an update keeps only its own week's tiles; Remove keeps nothing", () async {
      await cache.write(['planet', 'w1', '9', '403', '253.pbf'], [1], saved: true);
      await cache.write(['planet', 'w2', '9', '403', '253.pbf'], [2], saved: true);
      await cache.write(['planet'], [3], saved: true);
      await cache.keepSavedWeek('w2');
      expect(await cache.savedSize(['planet', 'w1', '9', '403', '253.pbf']), isNull);
      expect(await cache.savedSize(['planet', 'w2', '9', '403', '253.pbf']), 1);
      expect(await cache.savedSize(['planet']), 1);
      await cache.clearSaved();
      expect(Directory('${root.path}/saved').existsSync(), isFalse);
    });

    test('the seen folder is trimmed, oldest first, once it passes its limit', () async {
      for (var i = 0; i < 5; i++) {
        await cache.write(['planet', 'w', '14', '$i', '0.pbf'], List.filled(100, i));
        final f = TileCache.fileFor(cache.seenDir, TileCache.keyFor(['planet', 'w', '14', '$i', '0.pbf'])!);
        f.setLastModifiedSync(DateTime(2026, 1, 1 + i));
      }
      await cache.trimSeen(limit: 450, trimTo: 300);
      final left = [for (var i = 0; i < 5; i++) await cache.read(['planet', 'w', '14', '$i', '0.pbf']) != null];
      expect(left, [false, false, true, true, true]);
      await cache.trimSeen(limit: 450, trimTo: 300);
      expect(await cache.read(['planet', 'w', '14', '2', '0.pbf']), isNotNull);
    });
  });
}
