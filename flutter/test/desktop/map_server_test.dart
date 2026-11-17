// The desktop map's local server (lib/features/map/web/map_server.dart): the page's files under
// its key, only for this computer's own address, and OpenFreeMap's files through the cache: the
// styles from the network first, the tiles from the cache first, and an older week's tile when
// this week's can't be had.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sgbus_timings/features/map/web/map_server.dart';
import 'package:sgbus_timings/features/map/web/tile_cache.dart';

void main() {
  late Directory root;
  late TileCache cache;
  late MapServer server;
  // What the pretend OpenFreeMap answers: a body for a path (as sent, percent-encoded), or null
  // for no connection.
  late Map<String, String?> openFreeMap;
  late List<String> asked;
  // While set, OpenFreeMap holds its answers until it completes.
  Completer<void>? hold;

  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    // flutter_test refuses every real HTTP request; this test's go to its own server only.
    HttpOverrides.global = null;
  });

  setUp(() async {
    root = Directory.systemTemp.createTempSync('map_server_test');
    cache = TileCache(seenDir: '${root.path}/seen', savedDir: '${root.path}/saved');
    openFreeMap = {};
    asked = [];
    hold = null;
    server = MapServer.withCache(cache, client: MockClient((request) async {
      asked.add(request.url.path);
      await hold?.future;
      if (!openFreeMap.containsKey(request.url.path)) return http.Response('', 404);
      final body = openFreeMap[request.url.path];
      if (body == null) throw const SocketException('No connection');
      return http.Response(body, 200);
    }));
    await server.start();
  });

  tearDown(() async {
    await server.close();
    root.deleteSync(recursive: true);
  });

  /// GETs [uri] from the server, with [host] as its Host header if given.
  Future<({int status, String body, String? type})> get(Uri uri, {String? host}) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(uri);
      if (host != null) request.headers.host = host;
      final response = await request.close();
      return (status: response.statusCode, body: await response.transform(utf8.decoder).join(), type: response.headers.contentType?.mimeType);
    } finally {
      client.close(force: true);
    }
  }

  Uri ofm(String path) => server.base.resolve('ofm/$path');

  test('the page and its scripts, from the assets', () async {
    final page = await get(server.pageUri);
    expect(page.status, 200);
    expect(page.type, 'text/html');
    expect(page.body, contains('maplibre-gl.js'));
    final script = await get(server.base.resolve('map.js'));
    expect(script.status, 200);
    expect(script.body, contains('window.sgMap'));
  });

  test('nothing without the key, nothing else beside the page, and not for another host', () async {
    final noKey = Uri.parse('http://127.0.0.1:${server.base.port}/map.html');
    expect((await get(noKey)).status, 404);
    expect((await get(server.base.resolve('pubspec.yaml'))).status, 404);
    expect((await get(server.pageUri, host: 'evil.example')).status, 404);
  });

  test('a tile: fetched once, then from the cache', () async {
    openFreeMap['/planet/w2/14/12930/8130.pbf'] = 'tile';
    final first = await get(ofm('planet/w2/14/12930/8130.pbf'));
    expect(first.status, 200);
    expect(first.body, 'tile');
    expect(first.type, 'application/x-protobuf');
    openFreeMap['/planet/w2/14/12930/8130.pbf'] = 'newer';
    expect((await get(ofm('planet/w2/14/12930/8130.pbf'))).body, 'tile');
    expect(asked, hasLength(1));
  });

  test('a style: from the network first, the copy kept when offline', () async {
    openFreeMap['/styles/liberty'] = '{"v":1}';
    expect((await get(ofm('styles/liberty'))).body, '{"v":1}');
    openFreeMap['/styles/liberty'] = '{"v":2}';
    expect((await get(ofm('styles/liberty'))).body, '{"v":2}');
    openFreeMap['/styles/liberty'] = null;
    final offline = await get(ofm('styles/liberty'));
    expect(offline.status, 200);
    expect(offline.body, '{"v":2}');
  });

  test("a font stack's spaces reach OpenFreeMap encoded, and are kept under a safe name", () async {
    openFreeMap['/fonts/Noto%20Sans%20Regular/0-255.pbf'] = 'glyphs';
    final got = await get(ofm('fonts/Noto%20Sans%20Regular/0-255.pbf'));
    expect(got.body, 'glyphs');
    expect(asked, ['/fonts/Noto%20Sans%20Regular/0-255.pbf']);
    expect(File('${root.path}/seen/fonts/Noto~20Sans~20Regular/0-255.pbf.cached').existsSync(), isTrue);
  });

  test("offline, a tile missing this week comes from an older week's", () async {
    await cache.write(['planet', 'w1', '14', '1', '2.pbf'], utf8.encode('old'), saved: true);
    openFreeMap['/planet/w2/14/1/2.pbf'] = null;
    final got = await get(ofm('planet/w2/14/1/2.pbf'));
    expect(got.status, 200);
    expect(got.body, 'old');
  });

  /// The status line's code for a request sent with [path] exactly as written (Dart's Uri would
  /// tidy a %2E%2E away before it was sent).
  Future<int> rawGet(String path) async {
    final socket = await Socket.connect(InternetAddress.loopbackIPv4, server.base.port);
    socket.write('GET $path HTTP/1.1\r\nHost: 127.0.0.1:${server.base.port}\r\nConnection: close\r\n\r\n');
    await socket.flush();
    final reply = await socket.cast<List<int>>().transform(utf8.decoder).join();
    socket.destroy();
    return int.parse(reply.split(' ')[1]);
  }

  test("OpenFreeMap's own answers pass through", () async {
    expect((await get(ofm('planet/w2/0/0/9.pbf'))).status, 404);
    expect(asked, ['/planet/w2/0/0/9.pbf']);
  });

  test("a path that tries to climb out of the cache gets nowhere, and OpenFreeMap isn't asked", () async {
    final key = server.base.pathSegments.first;
    expect(await rawGet('/$key/ofm/%2E%2E/%2E%2E/x.pbf'), 404);
    expect(await rawGet('/$key/ofm/planet/%2E%2E/%2E%2E/%2E%2E/x'), 404);
    expect(await rawGet('/$key/ofm/fonts/a%2F..%2F..%2Fb/0-255.pbf'), 404);
    expect(await rawGet('/$key/ofm/fonts/..%5C..%5Cx/0-255.pbf'), 404);
    expect(asked, isEmpty);
  });

  test('two asks at once for a tile not kept yet: OpenFreeMap is asked once, and both are answered', () async {
    openFreeMap['/planet/w2/14/5/6.pbf'] = 'tile';
    hold = Completer<void>();
    final both = Future.wait([get(ofm('planet/w2/14/5/6.pbf')), get(ofm('planet/w2/14/5/6.pbf'))]);
    // Both requests reach the server while OpenFreeMap is still holding its answer.
    for (var i = 0; i < 100 && asked.isEmpty; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    await Future<void>.delayed(const Duration(milliseconds: 100));
    hold!.complete();
    final answers = await both.timeout(const Duration(seconds: 5));
    expect(answers.map((a) => a.body), ['tile', 'tile']);
    expect(asked, ['/planet/w2/14/5/6.pbf']);
  });
}
