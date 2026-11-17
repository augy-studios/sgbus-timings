// The guide's screenshots of the Windows, Mac and Linux app (docs-site/public/screenshots/desktop/,
// shown by docs-site/content/desktop/), drawn by Flutter's own test renderer from the same fixed
// data as the Android app's (harness.dart: the clock stopped at STILL_AT, the stops and routes
// from test/fixtures/, made-up timings): Make it yours, the update window, the main window with a
// stop in its detail pane, the command bar open, a right-click menu, a dialog and a side panel,
// and a Bus timings widget.
//
// The desktop's paths are turned on as the app turns them on: the bridge says 'desktop' (and the
// desktop host's other features, Native.fake), the site's look with compact controls (as
// desk_theme.dart sets them), the title bar, rail and panes around the shell (DeskChrome.wrap,
// as app/app.dart does), and Flutter told it's on this computer's system, not Android
// (TargetPlatformVariant), for its paddings and fonts. Make it yours, the update window and the
// widget are their own windows' screens, drawn with the fixed state their screenshot options
// take.
//
// What the operating system draws (the Mac's menu bar and traffic lights, the tray and its menu,
// the Jump List, the Dock, notifications) isn't Flutter's, so it can't be drawn here. On a Mac
// the title bar leaves the traffic lights' room empty, as the app does, and shows ⌘ shortcuts;
// on Windows and Linux it draws its own Minimise, Maximise and Close and shows Ctrl. The current
// set was rendered on a Mac; for the final set, run this file on Windows (window buttons on the
// right, Ctrl shortcuts, and Segoe UI for the windows without a font of their own).
//
//   flutter test test/shots/desktop_shots_test.dart                   every shot
//   SHOTS=window,menu flutter test test/shots/desktop_shots_test.dart   only those
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/app/pages.dart';
import 'package:sgbus_timings/app/shell.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/desktop/adaptive.dart';
import 'package:sgbus_timings/desktop/chrome.dart';
import 'package:sgbus_timings/desktop/command_bar.dart';
import 'package:sgbus_timings/desktop/desktop.dart';
import 'package:sgbus_timings/desktop/splash.dart';
import 'package:sgbus_timings/desktop/updater.dart';
import 'package:sgbus_timings/desktop/welcome.dart';
import 'package:sgbus_timings/desktop/widgets_window.dart';
import 'package:sgbus_timings/features/glance/glance_page.dart';
import 'package:sgbus_timings/features/registry.dart';
import 'package:sgbus_timings/features/timings/stop_screen.dart';
import 'package:sgbus_timings/features/weather/weather.dart';
import 'package:sgbus_timings/i18n/i18n.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'harness.dart';

const _t = Timeout(Duration(minutes: 3));

/// Where the desktop's shots go, beside the Android app's.
final _out = Directory('../docs-site/public/screenshots/desktop');

/// A computer's screen at twice its size, as a high-resolution one draws it.
const _ratio = 2.0;

/// The main window's size in the shots: a laptop's maximised window, wide enough for the list
/// and the detail pane side by side (desktop-features-spec §5), and tall enough for the whole
/// rail, Theme at its foot included.
const _windowSize = Size(1280, 860);

/// Flutter's idea of the system: the one this computer runs, as the desktop app's would be, so
/// the title bar (which asks the computer itself, desktop.dart's Desktop.mac) and the rest agree.
final _platform = Platform.isMacOS
    ? TargetPlatform.macOS
    : Platform.isLinux
        ? TargetPlatform.linux
        : TargetPlatform.windows;

/// Runs each test as on that system, and puts Flutter's own back afterwards.
final _onDesktop = TargetPlatformVariant.only(_platform);

/// What the desktop's bridge host says it can do (desktop/host.dart's features).
const _features = ['push', 'notify', 'releases', 'glance', 'widgets', 'desktop'];

/// Sam's computer: the same saved stops, buses, places and lists as the Android shots, with the
/// tours seen so none opens over a shot.
const _sam = {
  'sgbus_name': 'Sam',
  'sgbus_favs_v2': '[{"code":"84009","name":"Bedok Int"},{"code":"84031","name":""},{"code":"03218","name":""}]',
  'sgbus_fav_buses': '["14","196"]',
  'sgbus_fav_stop_buses': '[{"code":"84031","service":"60"}]',
  'sgbus_home': '{"label":"Bedok Mall","lat":1.324736,"lng":103.929256}',
  'sgbus_work': '{"label":"One Raffles Place","lat":1.28435,"lng":103.851073}',
  'sgbus_places': '[{"id":"p1","name":"Gym","label":"Our Tampines Hub","lat":1.3532,"lng":103.9401}]',
  'sgbus_fav_lists': '[{"id":"lwork","name":"Work","items":["stop:03218","bus:196"]}]',
  'sgbus_tour': 'done',
  'sgbus_tours': '["timings","favs","nav","alerts","trips","places","terminal","explorer"]',
  'sgbus_first_run': 'done',
  'sgbus_recents': '[{"kind":"stop","label":"Bedok Int","sub":"84009","code":"84009","at":1793320000000},{"kind":"bus","label":"Bus 196","code":"196","at":1793310000000}]',
};

/// Windows' own blue, the accent colour a new Windows computer has, for Make it yours' System
/// accent swatch.
const _windowsBlue = 0xFF0078D4;

/// The system's own font, by the name Flutter asks for it on each system, and its files on this
/// computer: Segoe UI on Windows, San Francisco on a Mac, Roboto on Linux (the harness loads it).
final (String, List<String>) _systemFont = switch (_platform) {
  TargetPlatform.windows => ('Segoe UI', ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/seguisb.ttf', 'C:/Windows/Fonts/segoeuib.ttf']),
  TargetPlatform.macOS => ('.AppleSystemUIFont', ['/System/Library/Fonts/SFNS.ttf']),
  _ => ('Roboto', const <String>[]),
};

/// Loads the fonts: the Android shots' (harness.dart), and the system's own font, which the
/// update window, Make it yours and the widgets use (they have no font of their own, so Flutter
/// asks for the system's by name). Where its files aren't there, Roboto stands in.
Future<void> _loadFonts() async {
  await loadFonts();
  final (family, files) = _systemFont;
  var there = files.where((f) => File(f).existsSync()).toList();
  if (family == 'Roboto') return;
  if (there.isEmpty) {
    final fonts = '${Platform.environment['FLUTTER_ROOT'] ?? '/opt/sdk/flutter'}/bin/cache/artifacts/material_fonts';
    there = ['$fonts/Roboto-Regular.ttf', '$fonts/Roboto-Medium.ttf', '$fonts/Roboto-Bold.ttf'];
  }
  final loader = FontLoader(family);
  for (final f in there) {
    loader.addFont(Future.value(ByteData.sublistView(File(f).readAsBytesSync())));
  }
  await loader.load();
}

/// The still data, with the desktop's bridge and look: the site's look in the Classic brand
/// colour (not Material You), with the desktop's compact controls.
Future<void> _ready(WidgetTester t) async {
  await t.runAsync(() => stillData(state: _sam));
  Native.fake(_features, (plugin, method, options) async => <String, dynamic>{});
  addTearDown(() => Native.fake(const [], null));
  AppLook.I.materialYou = false;
  AppLook.I.compact = true;
  AppLook.I.accentOverride = null;
  addTearDown(() => AppLook.I.compact = false);
  GlancePage.weather = (_) => const WeatherButton();
}

/// Whether the title bar has started following the app (DeskChrome.init runs once, as in the app).
bool _chromeStarted = false;

/// The main window as the desktop app draws it (app/app.dart's MaterialApp, with the desktop's
/// chrome around the shell): the title bar, the rail, and the page's list and detail pane.
Widget _mainWindow(Brightness brightness) {
  if (!_chromeStarted) {
    DeskChrome.init();
    _chromeStarted = true;
  }
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    navigatorKey: AppNav.navigatorKey,
    navigatorObservers: [DeskChrome.observer],
    scaffoldMessengerKey: AppNav.messengerKey,
    // Windows and Linux scroll as theirs do; a Mac keeps Flutter's own (app/app.dart).
    scrollBehavior: Desktop.mac ? null : const DeskScrollBehavior(),
    theme: AppLook.I.theme(Brightness.light),
    darkTheme: AppLook.I.theme(Brightness.dark),
    themeMode: brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
    builder: (context, child) => DeskTooltips(child: DeskChrome.wrap(context, child!)),
    home: Shell(pages: pages()),
  );
}

/// Takes one shot of a desktop window [size] logical pixels big: [build] draws it, [then] does
/// anything to it (open a stop, a menu) before the picture's taken, and [crop] keeps only that
/// part of the window (logical pixels), where the whole would be too small to read in the guide.
Future<void> _shot(WidgetTester t, String name, Widget Function() build, {required Size size, Future<void> Function(WidgetTester t)? then, Rect? crop}) async {
  if (!want(name)) return;
  // Tests draw shadows as solid blocks (steadier for comparing pictures); the guide wants them
  // soft, as on screen, under the command bar's list, a menu or a side panel. Put back after.
  final solidShadows = debugDisableShadows;
  debugDisableShadows = false;
  try {
    await _draw(t, name, build, size: size, then: then, crop: crop);
  } finally {
    debugDisableShadows = solidShadows;
  }
}

/// [_shot]'s drawing, with soft shadows on: the window, what's done to it, and its picture.
Future<void> _draw(WidgetTester t, String name, Widget Function() build, {required Size size, Future<void> Function(WidgetTester t)? then, Rect? crop}) async {
  t.view.physicalSize = size * _ratio;
  t.view.devicePixelRatio = _ratio;
  addTearDown(t.view.reset);
  final key = GlobalKey();
  // Nothing kept from the shot before: its screens would still be on the title bar's watchers.
  await t.pumpWidget(const SizedBox.shrink());
  DeskChrome.observer.reset();
  DeskPanes.observer.reset();
  AppNav.fromPane = false;
  // The home page, as the app starts on: the shell picks it as it's built, and the title bar,
  // already listening, mustn't hear a change in the middle of that build.
  AppNav.page.value = Pages.home();
  await t.pumpWidget(RepaintBoundary(
    key: key,
    child: MediaQuery(data: MediaQueryData(size: size, devicePixelRatio: _ratio), child: build()),
  ));
  await settle(t);
  if (then != null) await then(t);
  await settle(t);
  // Pictures read from the app's assets (the app's icon), which a test's frames don't wait for.
  await t.runAsync(() async {
    for (final e in find.byType(Image).evaluate()) {
      await precacheImage((e.widget as Image).image, e);
    }
  });
  await settle(t);
  final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  _systemFontForUnnamed(boundary);
  await t.pump();
  final bytes = await t.runAsync(() => _png(boundary, crop));
  _out.createSync(recursive: true);
  File('${_out.path}/$name.png').writeAsBytesSync(bytes!);
}

/// Writing whose style names no font (the update window's lines, Make it yours' drop-downs) is
/// drawn by a computer in its own font, but by the test renderer as blank boxes, and no font
/// loaded can change that. So each such piece of writing under [root] is given the system's font
/// by name, as the computer would draw it; writing that names a font keeps it. Done to what's
/// already laid out, just before the picture, so nothing rebuilds it first.
void _systemFontForUnnamed(RenderObject root) {
  final family = _systemFont.$1;
  void visit(RenderObject o) {
    if (o is RenderParagraph) {
      final span = o.text;
      if (span.style?.fontFamily == null) {
        // The writing as it was, inside a span that only names the font, so the rest of its
        // style (and any part with a font of its own) stays.
        o.text = TextSpan(style: TextStyle(fontFamily: family), children: [span]);
      }
    }
    o.visitChildren(visit);
  }

  visit(root);
}

/// The picture as a PNG, cut down to [crop] if it's given.
Future<Uint8List> _png(RenderRepaintBoundary boundary, Rect? crop) async {
  var image = await boundary.toImage(pixelRatio: _ratio);
  if (crop != null) {
    final part = Rect.fromLTRB(crop.left * _ratio, crop.top * _ratio, crop.right * _ratio, crop.bottom * _ratio);
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawImageRect(image, part, Offset.zero & part.size, Paint());
    final cut = await recorder.endRecording().toImage(part.width.round(), part.height.round());
    image.dispose();
    image = cut;
  }
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}

/// Bus timings in the list, with Bedok Int open in the detail pane beside it, as a click on it
/// in the list opens it.
Future<void> _bedokInPane(WidgetTester t) async {
  AppNav.showPage('timings');
  await settle(t);
  AppNav.fromPane = false;
  StopScreen.open('84009');
  await settle(t);
}

/// A right-click with the mouse at [at] (or, with [bottomLeft], near its bottom-left corner),
/// as on a stop in a list.
Future<void> _rightClick(WidgetTester t, Finder at, {bool bottomLeft = false}) async {
  // Just inside the corner, so the menu (which opens down and right from the pointer) leaves
  // what was clicked in view.
  final where = bottomLeft ? t.getBottomLeft(at) + const Offset(16, -6) : t.getCenter(at);
  final mouse = await t.startGesture(where, kind: PointerDeviceKind.mouse, buttons: kSecondaryMouseButton);
  await mouse.up();
  addTearDown(mouse.removePointer);
  await settle(t);
}

/// Make it yours' brand colours, as the main window sends them (welcome.dart's Welcome.current):
/// GTA VI only while it can be picked.
List<WelcomeColour> _colours() => [
      for (final s in AppLook.swatches)
        if (s.id != AppLook.gta6 || Gta6.canPick)
          WelcomeColour(s.id, s.label(), s.hex, dot: s.dot?.map((c) => c.toARGB32()).toList(), locked: s.id == AppLook.gta6 && !Gta6.canPick),
    ];

/// The update window's "Downloading update", 31 of 85 MB along, with Later (updater.dart's
/// words for it).
SplashStatus _downloading() => SplashStatus(
      tr('desktop.update.downloadingShort', 'Downloading update'),
      detail: tr('desktop.update.megabytes', '{got} of {total} MB', {'got': '31', 'total': '85'}),
      percent: 36,
      later: true,
    );

/// A Bus timings widget's timings for Bedok Int: the same made-up buses as its stop's screen,
/// fetched at STILL_AT. The widget counts minutes from the computer's own clock, so they're
/// measured from now (with five seconds over, for the time the shot takes to draw, so each reads
/// as the stop's screen has it).
WidgetData _widgetTimes() {
  final now = DateTime.now().millisecondsSinceEpoch + 5000;
  final services = (stillArrivals('84009')['services'] as List).cast<Map<String, dynamic>>();
  int? eta(Object? bus) => bus is Map && bus['eta_ms'] is num ? (bus['eta_ms'] as num).toInt() : null;
  return WidgetData(at: When.nowMs(), rows: [
    for (final s in services)
      (
        service: '${s['serviceNo']}',
        arrivals: [
          for (final b in [s['next'], s['next2'], s['next3']])
            if (eta(b) != null) now + eta(b)!,
        ],
      ),
  ]);
}

void main() {
  setUpAll(_loadFonts);

  testWidgets('desktop: Make it yours and the update window', variant: _onDesktop, timeout: _t, (t) async {
    await _ready(t);
    const welcome = Size(940, 660);
    // Light, Classic picked, the computer's accent colour offered after the brand colours.
    await _shot(t, 'setup', size: welcome, () => WelcomeApp(
          state: WelcomeState(mode: 'light', colours: _colours(), systemColour: _windowsBlue),
          brightness: Brightness.light,
          onFinish: (_) async {},
        ));
    // Dark, with System accent picked: the welcome panel and Get started in Windows' blue.
    await _shot(t, 'setup-dark', size: welcome, () => WelcomeApp(
          state: WelcomeState(mode: 'dark', colours: _colours(), systemColour: _windowsBlue, systemAccent: true),
          brightness: Brightness.dark,
          onFinish: (_) async {},
        ));
    const update = Size(300, 360);
    for (final b in Brightness.values) {
      await _shot(t, b == Brightness.dark ? 'update-dark' : 'update', size: update,
          () => MaterialApp(debugShowCheckedModeBanner: false, home: Scaffold(body: SplashScreen(status: _downloading(), brightness: b))));
    }
  });

  testWidgets('desktop: the main window', variant: _onDesktop, timeout: _t, (t) async {
    await _ready(t);
    for (final b in Brightness.values) {
      final dark = b == Brightness.dark;
      await _shot(t, dark ? 'window-dark' : 'window', size: _windowSize, () => _mainWindow(b), then: _bedokInPane);
      // The command bar open over the window's top: in light, "14" typed (the buses, then the
      // stops whose code starts with it); in dark, nothing typed yet (every command).
      await _shot(t, dark ? 'command-bar-dark' : 'command-bar', size: _windowSize, () => _mainWindow(b), crop: const Rect.fromLTWH(0, 0, 1280, 540), then: (t) async {
        await _bedokInPane(t);
        DeskChrome.openCommandBar();
        await settle(t);
        if (!dark) await t.enterText(find.descendant(of: find.byType(CommandBar), matching: find.byType(TextField)), '14');
        await settle(t);
      });
    }
  });

  testWidgets('desktop: right-click menus, dialogs and panels', variant: _onDesktop, timeout: _t, (t) async {
    await _ready(t);
    // A right-click on a stop near you, at the foot of its row in Bus timings' list. Only the
    // rail and the list are kept: below the title bar, and up to the line before the detail
    // pane (84 px of rail and the 400 px list, DeskPanes.listWidth), so nothing's cut mid-word.
    await _shot(t, 'menu', size: _windowSize, () => _mainWindow(Brightness.light), crop: const Rect.fromLTRB(0, 40, 484, 860), then: (t) async {
      await _bedokInPane(t);
      final row = find.ancestor(of: find.text('Bedok Stn Exit A'), matching: find.byType(DeskContextMenu)).first;
      await _rightClick(t, row, bottomLeft: true);
    });
    // Pick a bus, from the stop in the detail pane: a dialog over the whole content area.
    await _shot(t, 'dialog', size: _windowSize, () => _mainWindow(Brightness.light), then: (t) async {
      await _bedokInPane(t);
      await t.tap(find.text('Pick a bus'));
      await settle(t);
    });
    // Today's weather, from Glance: a panel from the window's right.
    await _shot(t, 'panel-dark', size: _windowSize, () => _mainWindow(Brightness.dark), then: (t) async {
      AppNav.showPage('glance');
      await settle(t);
      await t.tap(find.byType(WeatherButton));
      await settle(t);
    });
  });

  testWidgets('desktop: a Bus timings widget', variant: _onDesktop, timeout: _t, (t) async {
    await _ready(t);
    // Its own window, at the size a new one opens (widgets_window.dart).
    const size = Size(320, 300);
    for (final b in Brightness.values) {
      final dark = b == Brightness.dark;
      await _shot(t, dark ? 'widget-dark' : 'widget', size: size, () => WidgetApp(
            id: 'w1',
            saved: const {'code': '84009', 'name': 'Bedok Int', 'buses': <String>[]},
            prefs: {'dark': dark},
            data: _widgetTimes(),
          ));
    }
  });
}
