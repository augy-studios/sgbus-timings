// The guide's screenshots of the Android app (docs-site/public/screenshots/android/), rendered by
// Flutter's own test renderer at 3x with the app's real fonts, from fixed data: the clock stopped
// at STILL_AT, the stops and routes from test/fixtures/ (saved from /api/bus-stops and
// /api/bus-routes), and each stop's timings made up for the buses its routes have (stillArrivals),
// so a shot comes out the same whenever it's taken, as the site's screenshots/shots.cjs's STILL=1.
//
//   flutter test test/shots/            every shot
//   SHOTS=glance,stop flutter test test/shots/   only those
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/data/network.dart';
import 'package:sgbus_timings/data/stations.dart';
import 'package:sgbus_timings/data/stops.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/i18n/i18n.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
import 'package:sgbus_timings/theme/theme.dart';

/// A Friday morning in an NUS term, as the site's shots.
final stillAt = DateTime.parse('2026-10-30T08:30:00+08:00');
const shotSize = Size(412, 892);
const shotRatio = 3.0;
final outDir = Directory('../docs-site/public/screenshots/android');

Object? _gz(String name) => jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/$name.json.gz').readAsBytesSync())));
Object? _json(String name) => jsonDecode(File('test/fixtures/$name.json').readAsStringSync());

bool want(String name) {
  final only = Platform.environment['SHOTS'];
  return only == null || only.isEmpty || only.split(',').contains(name);
}

Future<void> _font(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    loader.addFont(Future.value(ByteData.sublistView(File(f).readAsBytesSync())));
  }
  await loader.load();
}

/// The fonts as on a phone: Jua for the usual look, Roboto (Android's) for Material You, and
/// the Material icons.
Future<void> loadFonts() async {
  final root = Platform.environment['FLUTTER_ROOT'] ?? '/opt/sdk/flutter';
  final mf = '$root/bin/cache/artifacts/material_fonts';
  await _font('Jua', ['assets/fonts/Jua-Regular.ttf']);
  await _font('Roboto', ['$mf/Roboto-Regular.ttf', '$mf/Roboto-Medium.ttf', '$mf/Roboto-Bold.ttf', '$mf/Roboto-Light.ttf']);
  await _font('MaterialIcons', ['$mf/MaterialIcons-Regular.otf']);
}

/// A seeded random, so made-up timings are the same every time.
int _seed(String s) => s.codeUnits.fold(7, (a, c) => (a * 31 + c) & 0x7fffffff);

/// Made-up timings for every bus a stop's routes have running at STILL_AT.
Map<String, dynamic> stillArrivals(String code, {String? only}) {
  final services = BusNet.servicesAtStop(code).where((no) => only == null || no == only).toList();
  final rnd = math.Random(_seed(code));
  const loads = ['SEA', 'SEA', 'SEA', 'SDA', 'SDA', 'LSD'];
  const decks = ['Double', 'Double', 'Single', 'Bendy'];
  final stop = Stops.of(code);
  Map<String, dynamic> bus(String no, int eta, int dir) {
    final run = BusNet.runStops(no, dir);
    final i = run.indexOf(code);
    final from = i > 2 ? Stops.of(run[i - 2]) : null;
    final rough = rnd.nextInt(9) == 0;
    return {
      'eta_ms': eta,
      'load': loads[rnd.nextInt(loads.length)],
      'wheelchair': rnd.nextInt(6) != 0,
      'deck': decks[rnd.nextInt(decks.length)],
      // Somewhere back along its way: a stop or two before, or out from an interchange.
      'lat': rough ? null : (from?.lat ?? (stop?.lat == null ? null : stop!.lat! + eta / 1e8)),
      'lng': rough ? null : (from?.lng ?? (stop?.lng == null ? null : stop!.lng! - eta / 1.4e8)),
      'rough': rough,
      'origin': run.isEmpty ? null : run.first,
      'dest': run.isEmpty ? null : run.last,
      'visit': 1,
    };
  }

  return {
    'busStopCode': code,
    'services': [
      for (final no in services.take(14))
        () {
          final dir = BusNet.directionAt(no, code) ?? 1;
          final first = 20 + rnd.nextInt(9 * 60);
          final gap = 6 + rnd.nextInt(9);
          return {
            'serviceNo': no,
            'operator': BusNet.serviceInfo(no)?.op ?? 'SBST',
            'next': bus(no, first * 1000, dir),
            'next2': bus(no, (first + gap * 60) * 1000, dir),
            'next3': bus(no, (first + gap * 120 + rnd.nextInt(90)) * 1000, dir),
          };
        }(),
    ],
  };
}

/// Everything the app reads, made still: the store, the clock, the stop list and routes, and
/// the API answering from the fixtures.
Future<void> stillData({Map<String, String> state = const {}, String lang = 'en'}) async {
  Store.memory({...state});
  When.now = () => stillAt;
  Native.available = false;
  Stops.useRows(_gz('bus-stops') as List);
  BusNet.index(Map<String, dynamic>.from(_gz('bus-routes') as Map));
  final rail = File('../main-site/data/rail-stations.json');
  if (rail.existsSync()) {
    Stations.use([for (final s in (jsonDecode(rail.readAsStringSync())['stations'] as List)) Station.from(s as Map)]);
  }
  Api.fake = (path) async {
    final u = Uri.parse('/$path');
    switch (u.path) {
      case '/bus-arrivals':
        return stillArrivals(u.queryParameters['stop']!, only: u.queryParameters['service']);
      case '/service-alerts':
        return _json('service-alerts');
      case '/weather':
        return _json('weather');
      case '/notices':
        return _json('notices');
    }
    throw ApiError('No fixture for $path');
  };
  await I18n.I.use(lang, remember: false);
}

/// Lets futures and animations finish: a few frames, never waiting on one that never ends.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

/// Takes one shot of a widget as the app would show it, in a look and mode.
Future<void> shot(WidgetTester tester, String name, Widget Function() build,
    {bool material = true, Brightness brightness = Brightness.light, Future<void> Function(WidgetTester t)? then, Size size = shotSize}) async {
  if (!want(name)) return;
  AppLook.I.materialYou = material;
  // Material You's colours from a wallpaper of the site's green, as a phone would have them.
  AppLook.I.phoneLight = ColorScheme.fromSeed(seedColor: const Color(0xFF3F7D4B));
  AppLook.I.phoneDark = ColorScheme.fromSeed(seedColor: const Color(0xFF3F7D4B), brightness: Brightness.dark);
  tester.view.physicalSize = size * shotRatio;
  tester.view.devicePixelRatio = shotRatio;
  addTearDown(tester.view.reset);
  final key = GlobalKey();
  await tester.pumpWidget(RepaintBoundary(
    key: key,
    child: MediaQuery(
      data: MediaQueryData(size: size, devicePixelRatio: shotRatio, padding: const EdgeInsets.only(top: 24, bottom: 16)),
      child: Theme(
        data: AppLook.I.theme(brightness),
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppLook.I.theme(Brightness.light),
          darkTheme: AppLook.I.theme(Brightness.dark),
          themeMode: brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
          home: build(),
        ),
      ),
    ),
  ));
  await settle(tester);
  if (then != null) await then(tester);
  await settle(tester);
  final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final bytes = await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: shotRatio);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  });
  outDir.createSync(recursive: true);
  File('${outDir.path}/$name.png').writeAsBytesSync(bytes!);
}
