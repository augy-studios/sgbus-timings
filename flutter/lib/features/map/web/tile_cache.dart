// The desktop map's disk cache of OpenFreeMap's files: its styles, TileJSON, vector tiles, label
// fonts (glyphs) and sprites, kept as files under two folders (the phone's map has MapLibre's own
// database instead):
//
//   seen   what the map has shown, kept as it's looked at. Trimmed once each time the map's
//          server starts, if it's past seenLimit: the files written longest ago go first. In the
//          system's cache folder.
//   saved  Save the map for offline's download (map_prefetch.dart), never trimmed; Remove deletes
//          it. In the app's own folder.
//
// A file is found by its path on tiles.openfreemap.org: `planet/20261101_080013_pt/14/12930/8130.pbf`
// is kept as `<folder>/planet/20261101_080013_pt/14/12930/8130.pbf.cached`. Each part of the path
// keeps its letters and digits; anything a file name can't hold on Windows, macOS or Linux is
// written as ~ and two hex digits (keyFor). map_server.dart reads and writes it; the map's page
// never sees it.
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import '../../../app/version.dart';
import '../../../desktop/settings.dart';

/// The folders the desktop map keeps OpenFreeMap's files in, and the rules for finding one.
class TileCache {
  /// A cache with its two folders given: [seenDir] for what's been looked at, [savedDir] for
  /// the offline download (tests give temporary folders).
  TileCache({required this.seenDir, required this.savedDir});

  /// The cache in this computer's usual places (foldersFor).
  factory TileCache.forThisComputer() {
    final dirs = foldersFor(os: Platform.operatingSystem, env: Platform.environment, settingsDir: DeskSettings.dir);
    return TileCache(seenDir: dirs.seen, savedDir: dirs.saved);
  }

  /// The user agent OpenFreeMap is asked with: the desktop app's own, as Desktop.userAgent
  /// (desktop/desktop.dart, which the map's code can't import under flutter test).
  static const userAgent = 'SGBusTimingsDesktop/$appVersion (+https://sgbus.uwuapps.org)';

  /// The address every file is fetched from.
  static const host = 'tiles.openfreemap.org';
  static const origin = 'https://$host/';

  /// How big the seen folder may grow before trimSeen takes the oldest out, and what it's taken
  /// down to then (so it isn't trimmed again at the next start).
  static const seenLimit = 150 * 1024 * 1024;
  static const seenTrimTo = 120 * 1024 * 1024;

  /// Every file's name ends in this, so a file's name never matches a folder's ("planet", the
  /// TileJSON, beside "planet/", its tiles' folder).
  static const suffix = '.cached';

  final String seenDir;
  final String savedDir;

  /// The two folders on [os] ('windows', 'macos' or 'linux'), from its environment [env] and the
  /// app's settings folder [settingsDir]:
  /// - Windows: both under %LOCALAPPDATA%\SG Bus Timings\Map (local, so a roaming profile doesn't
  ///   carry tens of megabytes of map about).
  /// - macOS: seen in ~/Library/Caches/SG Bus Timings/Map, saved in the settings folder.
  /// - Linux: seen in $XDG_CACHE_HOME (or ~/.cache)/SG Bus Timings/Map, saved in the settings folder.
  static ({String seen, String saved}) foldersFor({required String os, required Map<String, String> env, required String settingsDir}) {
    const name = DeskSettings.folderName;
    if (os == 'windows') {
      final local = env['LOCALAPPDATA'] ?? '${env['USERPROFILE'] ?? ''}\\AppData\\Local';
      return (seen: '$local\\$name\\Map\\seen', saved: '$local\\$name\\Map\\saved');
    }
    final home = env['HOME'] ?? '';
    if (os == 'macos') return (seen: '$home/Library/Caches/$name/Map', saved: '$settingsDir/Saved map');
    final cache = env['XDG_CACHE_HOME'] ?? '$home/.cache';
    return (seen: '$cache/$name/Map', saved: '$settingsDir/Saved map');
  }

  // ---------- names ----------

  /// The parts of a file's path on tiles.openfreemap.org, from a full address (https://tiles…/a/b)
  /// or the path alone (a/b), each part decoded from %20 and the like. Null if it isn't one of
  /// OpenFreeMap's addresses.
  static List<String>? segmentsOf(String urlOrPath) {
    var path = urlOrPath;
    if (path.startsWith('https://') || path.startsWith('http://')) {
      if (!path.startsWith(origin)) return null;
      path = path.substring(origin.length);
    }
    // A query or a fragment never names a different file on OpenFreeMap.
    path = path.split(RegExp(r'[?#]')).first;
    return [for (final part in path.split('/')) _decoded(part)];
  }

  /// [part] with its %20s and the like decoded, or as it is if it isn't percent-encoded after
  /// all (a lone %).
  static String _decoded(String part) {
    try {
      return Uri.decodeComponent(part);
    } catch (_) {
      return part;
    }
  }

  /// The cache's name for the file at path [segments] on OpenFreeMap: the parts joined by '/',
  /// each made safe for a file name, ending in [suffix]. Null for a path that could climb out
  /// of the cache or isn't one of OpenFreeMap's: empty, an empty part, '.' or '..', or a part
  /// holding a slash or backslash (an encoded %2F or %5C) or a NUL.
  static String? keyFor(List<String> segments) {
    if (segments.isEmpty) return null;
    for (final s in segments) {
      if (s.isEmpty || s == '.' || s == '..' || s.contains('/') || s.contains(r'\') || s.contains(String.fromCharCode(0))) return null;
    }
    return '${segments.map(_safePart).join('/')}$suffix';
  }

  /// One part of a path, made safe as a file or folder name everywhere: letters, digits and
  /// . _ - , @ + = kept, every other byte of its UTF-8 (spaces, slashes, colons, ~ itself) written
  /// as ~ and two hex digits. A trailing dot is written that way too, as Windows drops one from a
  /// name.
  static String _safePart(String part) {
    final bytes = utf8.encode(part);
    final out = StringBuffer();
    for (var i = 0; i < bytes.length; i++) {
      final c = bytes[i];
      final trailingDot = c == 0x2E && i == bytes.length - 1;
      if (_plain(c) && !trailingDot) {
        out.writeCharCode(c);
      } else {
        out.write('~${c.toRadixString(16).padLeft(2, '0').toUpperCase()}');
      }
    }
    return out.toString();
  }

  /// Whether the byte [c] is kept as it is in a file name: an ASCII letter or digit, or one of
  /// . _ - , @ +  =
  static bool _plain(int c) =>
      (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || '._-,@+='.codeUnits.contains(c);

  /// Whether OpenFreeMap changes the file at [segments] in place, so the network's copy is asked
  /// for first and the cache's used only offline: the styles, and the TileJSON (`planet`), which
  /// names a new week's tiles every week. Everything else (tiles, fonts, sprites) is at an
  /// address of its own for good, so the cache's copy is used first.
  static bool isMutable(List<String> segments) => (segments.length == 1 && segments.first == 'planet') || (segments.isNotEmpty && segments.first == 'styles');

  /// A vector tile's week and place, if [segments] is one (`planet/<week>/<z>/<x>/<y>.pbf`).
  static ({String week, int z, int x, int y})? tileOf(List<String> segments) {
    if (segments.length != 5 || segments[0] != 'planet') return null;
    final m = RegExp(r'^(\d+)\.pbf$').firstMatch(segments[4]);
    final z = int.tryParse(segments[2]), x = int.tryParse(segments[3]);
    if (m == null || z == null || x == null) return null;
    return (week: segments[1], z: z, x: x, y: int.parse(m[1]!));
  }

  /// The type a file is served with, by its name: protobuf for tiles and fonts, PNG for sprites
  /// and the world overview, JSON for the rest (styles, TileJSON, sprite indexes).
  static String contentTypeFor(List<String> segments) {
    final name = segments.isEmpty ? '' : segments.last.toLowerCase();
    if (name.endsWith('.pbf') || name.endsWith('.mvt')) return 'application/x-protobuf';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'application/json';
  }

  /// OpenFreeMap's address for the file at [segments], each part percent-encoded again (a font
  /// stack's spaces as %20).
  static Uri remoteUri(List<String> segments) => Uri(scheme: 'https', host: host, pathSegments: segments);

  /// The file for [key] under [root], with this system's separators.
  static File fileFor(String root, String key) => File([root, ...key.split('/')].join(Platform.pathSeparator));

  // ---------- reading and writing ----------

  /// The kept copy of the file at [segments]. A mutable one (a style, the TileJSON) is looked for
  /// in the seen folder first, as it's written there on every look online and so is the newer;
  /// anything else in the saved folder first. Null if neither has it.
  Future<Uint8List?> read(List<String> segments) async {
    final key = keyFor(segments);
    if (key == null) return null;
    final order = isMutable(segments) ? [seenDir, savedDir] : [savedDir, seenDir];
    for (final root in order) {
      final f = fileFor(root, key);
      try {
        if (await f.exists()) return await f.readAsBytes();
      } catch (_) {
        // Unreadable (being replaced, or a disk error): the next folder, or the network.
      }
    }
    return null;
  }

  /// Whether the saved folder already has the file at [segments], and its size if so.
  Future<int?> savedSize(List<String> segments) async {
    final key = keyFor(segments);
    if (key == null) return null;
    final f = fileFor(savedDir, key);
    try {
      return await f.exists() ? await f.length() : null;
    } catch (_) {
      return null;
    }
  }

  /// The same tile from any week the cache has (newest first), for when this week's can't be
  /// fetched: offline, the TileJSON kept may name a newer week than the tiles saved, and a
  /// week-old street is better than none (as the site's service worker does).
  Future<Uint8List?> readAnyWeek(List<String> segments) async {
    final tile = tileOf(segments);
    if (tile == null) return null;
    for (final root in [savedDir, seenDir]) {
      final planet = Directory([root, 'planet'].join(Platform.pathSeparator));
      List<String> weeks;
      try {
        if (!await planet.exists()) continue;
        weeks = [await for (final e in planet.list()) if (e is Directory) e.uri.pathSegments.where((s) => s.isNotEmpty).last]..sort((a, b) => b.compareTo(a));
      } catch (_) {
        continue;
      }
      for (final week in weeks) {
        final got = await read(['planet', week, '${tile.z}', '${tile.x}', '${tile.y}.pbf']);
        if (got != null) return got;
      }
    }
    return null;
  }

  /// Keeps [bytes] as the file at [segments], in the saved folder if [saved], else the seen one.
  /// Written beside it first and renamed over it, so a reader never sees half a file. A failed
  /// write is ignored: the map still has what it fetched.
  Future<void> write(List<String> segments, List<int> bytes, {bool saved = false}) async {
    final key = keyFor(segments);
    if (key == null) return;
    final f = fileFor(saved ? savedDir : seenDir, key);
    final part = File('${f.path}.${math.Random().nextInt(1 << 32).toRadixString(36)}.part');
    try {
      await f.parent.create(recursive: true);
      await part.writeAsBytes(bytes, flush: true);
      await part.rename(f.path);
    } catch (_) {
      try {
        if (await part.exists()) await part.delete();
      } catch (_) {}
    }
  }

  /// Copies the seen folder's copy of the file at [segments] into the saved folder, for the
  /// offline download, without asking OpenFreeMap again. Its size, or null if there's none.
  Future<int?> saveFromSeen(List<String> segments) async {
    final key = keyFor(segments);
    if (key == null || isMutable(segments)) return null;
    final from = fileFor(seenDir, key);
    try {
      if (!await from.exists()) return null;
      final bytes = await from.readAsBytes();
      await write(segments, bytes, saved: true);
      return bytes.length;
    } catch (_) {
      return null;
    }
  }

  // ---------- tidying ----------

  /// Deletes the whole offline download (Remove, or a first download cancelled).
  Future<void> clearSaved() async {
    try {
      final d = Directory(savedDir);
      if (await d.exists()) await d.delete(recursive: true);
    } catch (_) {}
  }

  /// After an update's download: deletes the saved tiles of every week but [week] (the folder
  /// name in the TileJSON's address, such as 20261101_080013_pt), so only the new map stays.
  Future<void> keepSavedWeek(String week) async {
    final planet = Directory([savedDir, 'planet'].join(Platform.pathSeparator));
    try {
      if (!await planet.exists()) return;
      await for (final e in planet.list()) {
        if (e is Directory && e.uri.pathSegments.where((s) => s.isNotEmpty).last != week) await e.delete(recursive: true);
      }
    } catch (_) {}
  }

  /// Keeps the seen folder under [seenLimit]: past it, deletes the files written longest ago
  /// (oldest written first, not least recently looked at: a read doesn't touch a file) until it's
  /// down to [seenTrimTo]. Run once as the map's server starts; the saved folder is never
  /// trimmed.
  Future<void> trimSeen({int limit = seenLimit, int trimTo = seenTrimTo}) async {
    final files = <({File file, int size, DateTime at})>[];
    var total = 0;
    try {
      final d = Directory(seenDir);
      if (!await d.exists()) return;
      await for (final e in d.list(recursive: true)) {
        if (e is! File) continue;
        final s = await e.stat();
        files.add((file: e, size: s.size, at: s.modified));
        total += s.size;
      }
    } catch (_) {
      return;
    }
    if (total <= limit) return;
    files.sort((a, b) => a.at.compareTo(b.at));
    for (final f in files) {
      if (total <= trimTo) break;
      try {
        await f.file.delete();
        total -= f.size;
      } catch (_) {}
    }
  }
}
