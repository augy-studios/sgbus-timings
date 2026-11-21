// SG Bus Timings for Windows, macOS and Linux (2.5.0): the Android app's own screens, in Flutter,
// with the desktop's extras around them, as the Electron app (2.0.0 to 2.4.x) had them around the
// site (docs/desktop-features-spec.md lists each one):
//
// - the update window at launch, and updating itself (splash.dart, updater.dart);
// - Make it yours, the first window, and from the tray's menu after that (welcome.dart);
// - a tray icon (the menu bar on macOS): closing the window keeps the app running there, so
//   Service Alerts still come, checked every minute (alerts_poll.dart, notify.dart);
// - its own title bar: back, forward, reload, the command bar (search and links), copy, screenshots,
//   the update button and the window's buttons; a navigation rail and split panes on a wide
//   window; the macOS menu bar and the keyboard shortcuts (chrome.dart, menubar.dart,
//   screenshot.dart);
// - the product's own look by default, or the computer's accent colour (desk_theme.dart);
// - starting when you sign in, maximised, one copy at a time, uwu:// links (links.dart);
// - Bus timings widgets on the desktop (widgets_window.dart);
// - the tray countdown, the Jump List, the taskbar's thumbnail buttons, the Dock (glance.dart);
// - location on Linux where the system can't give it (location.dart);
// - everything the Electron app kept, brought across once (host.dart's Migrate, leveldb.dart).
//
// The shared screens reach all this through the bridge (native/native_bridge.dart), answered
// here by host.dart, as a phone's Java answers it.
import 'dart:async';
import 'dart:convert';
import 'dart:ffi' as ffi;
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:nativeapi/nativeapi.dart' show DisplayManager;
import 'package:sgbus_desktop/sgbus_desktop.dart';
import 'package:window_manager/window_manager.dart';

import '../app/links.dart';
import '../app/nav.dart';
import '../app/version.dart';
import 'settings.dart';
import 'widget_process.dart';

/// The desktop app's window, links, start at sign-in and small helpers, for every part of the
/// desktop layer. Everything is static: one per engine (each window has its own).
class Desktop {
  Desktop._();

  /// Whether this is the desktop app: Windows, macOS or Linux, and not a test.
  static bool get on => !kIsWeb && (Platform.isWindows || Platform.isMacOS || Platform.isLinux) && !_testing;
  static final bool _testing = !kIsWeb && Platform.environment.containsKey('FLUTTER_TEST');

  /// For the guide's screenshots and tests: draw the desktop's parts without being on one.
  static bool drawAnyway = false;
  /// Whether to draw the desktop's parts: on the desktop, or for a screenshot of them.
  static bool get looks => on || drawAnyway;

  // The app's names and addresses, which never change (desktop-features-spec §5, §10).
  static const site = 'https://sgbus.uwuapps.org';
  static const appId = 'org.uwuapps.sgbus';
  static const name = 'SG Bus Timings';
  static const scheme = 'uwu';
  static const linkHost = 'sgbus';
  static const releases = 'https://github.com/augy-studios/sgbus-timings/releases/latest';
  /// How the app names itself to the servers it asks (BeaconDB, GitHub).
  static String get userAgent => 'SGBusTimingsDesktop/$appVersion (+$site)';

  /// What this engine's window is: 'main', 'widget' or 'welcome', with its arguments.
  static String kind = 'main';
  static Map<String, Object?> windowArgs = const {};

  /// desktop_multi_window's handle on this engine's window.
  static WindowController? controller;

  /// This engine's own window.
  static Window? window;

  /// The command line the app was started with.
  static List<String> launchArgs = const [];

  /// Quitting for real: closing the window then lets it go.
  static bool quitting = false;

  /// The main window's been shown once (after the update window and Make it yours).
  static bool shown = false;

  /// Whether the app is running on a Mac.
  static bool get mac => Platform.isMacOS;

  /// Whether it's running on Windows.
  static bool get windows => Platform.isWindows;

  /// Whether it's running on Linux.
  static bool get linux => Platform.isLinux;

  /// Running from a build made with `flutter run`, not an installed copy.
  static bool get fromSource => !kReleaseMode;

  /// Which window this engine draws: a widget's own copy of the app from its command line
  /// ([args], Windows: widget_process.dart), otherwise from desktop_multi_window's arguments.
  static Future<void> identify([List<String> args = const []]) async {
    final widget = WidgetLink.parse(args);
    if (widget != null) {
      kind = 'widget';
      windowArgs = {'kind': 'widget', 'id': widget.id, 'port': widget.port, 'token': widget.token};
      return;
    }
    try {
      controller = await WindowController.fromCurrentEngine();
      final raw = controller!.arguments;
      if (raw.isNotEmpty) {
        final m = Map<String, Object?>.from(jsonDecode(raw) as Map);
        kind = '${m['kind'] ?? 'main'}';
        windowArgs = m;
      }
    } catch (_) {
      kind = 'main';
    }
  }

  /// This engine's window, through the sgbus_desktop plugin's handle (nativeapi's own idea of
  /// "the current window" is whichever is focused, which won't do with several).
  static Future<Window?> findWindow() async {
    final h = await SgbusDesktop.handle();
    if (h == null || h == 0) return null;
    try {
      return window = Window.createWithNativeWindow(ffi.Pointer<ffi.Void>.fromAddress(h));
    } catch (_) {
      return null;
    }
  }

  // ---------- the main window ----------

  /// The smallest the main window goes: phone-sized, the features spec's compact fallback (§5).
  /// Under 720 px wide it's laid out as the phone app is, with the Edge Tray (app/nav.dart's
  /// DeskPanes).
  static const minSize = Size(360, 520);

  /// The main window's size the first time (or whenever it isn't maximised and has no kept
  /// size), as the features spec's §5 sets it.
  static const defaultSize = Size(1120, 760);
  static Rect? _normal; // the un-maximised bounds, kept as they change
  static Timer? _keepTimer;

  /// The main window's set up, still hidden: its own title bar, its least size, and its close
  /// button keeping the app in the tray. On macOS the traffic lights stay, over the left of the
  /// app's own title bar (title_bar.dart leaves them room).
  static void setUpMain() {
    final w = window;
    if (w == null) return;
    w.title = name;
    w.titleBarStyle = TitleBarStyle.hidden;
    if (mac) w.isWindowControlButtonsVisible = true;
    w.minimumSize = minSize.toNative();
    w.addListener(_mainEvent);
  }

  /// Called whenever the main window is maximised, restored, or goes in or out of full screen
  /// (the title bar redraws its buttons).
  static final List<void Function()> onWindowChange = [];

  /// The main window's own events: close hides it to the tray (unless quitting), and its size,
  /// place and maximised state are kept as they change.
  static void _mainEvent(WindowEvent e) {
    switch (e) {
      case WindowCloseRequestedEvent():
        _keepBounds(now: true);
        if (!quitting) {
          e.request.cancel();
          hide();
        }
      case WindowMovedEvent() || WindowResizedEvent():
        _keepBounds();
      case WindowMaximizedEvent() || WindowRestoredEvent() || WindowEnteredFullScreenEvent() || WindowExitedFullScreenEvent():
        _keepBounds();
        for (final f in List.of(onWindowChange)) {
          f();
        }
      default:
        break;
    }
  }

  /// Writes the window's un-maximised bounds and maximised state to the settings file (`bounds`,
  /// `maximized`), so it opens the same way next time. Moves and resizes come in bursts, so
  /// they're written 600 ms after the last one; closing writes at once ([now]).
  static void _keepBounds({bool now = false}) {
    final w = window;
    if (w == null || !shown) return;
    _keepTimer?.cancel();
    void write() {
      // Read when it's written, not at each event: a Mac sends resizes while it animates into
      // maximised, when the window isn't yet "maximised" but no longer its own size either.
      try {
        if (!w.isMaximized && !w.isFullScreen && !w.isMinimized) _normal = w.bounds.toRect();
      } catch (_) {}
      final b = _normal;
      DeskSettings.write({
        if (b != null) 'bounds': {'x': b.left.round(), 'y': b.top.round(), 'width': b.width.round(), 'height': b.height.round()},
        'maximized': w.isMaximized,
      });
    }

    if (now) {
      write();
    } else {
      _keepTimer = Timer(const Duration(milliseconds: 600), write);
    }
  }

  /// The app's window, the first time: at its kept size and place (if that's still on a screen),
  /// maximised unless it was last closed un-maximised.
  static void firstShow() {
    final w = window;
    if (w == null || shown) return;
    shown = true;
    w.setFrameless(false);
    w.isResizable = true;
    w.isMaximizable = true;
    w.titleBarStyle = TitleBarStyle.hidden;
    w.minimumSize = minSize.toNative();
    final s = DeskSettings.read();
    final b = s['bounds'];
    var placed = false;
    if (b is Map && b['width'] is num && b['height'] is num) {
      final rect = keptBounds(b);
      if (_onAScreen(rect)) {
        w.bounds = rect.toNative();
        placed = true;
      } else {
        w.setSize(Size(rect.width, rect.height).toNative(), false);
      }
    }
    if (!placed) {
      if (b is! Map) w.setSize(defaultSize.toNative(), false);
      w.center();
    }
    _normal = w.bounds.toRect();
    if (s['maximized'] != false) w.maximize();
    if (mac) w.isWindowControlButtonsVisible = true;
    w.show();
    w.focus();
    for (final f in List.of(onShown)) {
      f();
    }
  }

  /// The window's kept bounds (settings.json's `bounds`, with a width and height) as it can
  /// take them: never smaller than [minSize], whatever an older copy kept, and at 40, 40 if their
  /// place is missing.
  static Rect keptBounds(Map<dynamic, dynamic> b) {
    final width = math.max((b['width'] as num).toDouble(), minSize.width);
    final height = math.max((b['height'] as num).toDouble(), minSize.height);
    return Rect.fromLTWH((b['x'] as num? ?? 40).toDouble(), (b['y'] as num? ?? 40).toDouble(), width, height);
  }

  /// Called once the main window has been shown the first time.
  static final List<void Function()> onShown = [];

  /// Whether kept bounds still land on a screen (a monitor may have been unplugged since): at
  /// least a strip of the title bar, 100 by 40 px, on one of the screens' working areas.
  static bool _onAScreen(Rect r) {
    try {
      for (final display in DisplayManager.instance.getAll()) {
        final seen = r.intersect(display.workArea.toRect());
        if (seen.width >= 100 && seen.height >= 40) return true;
      }
      return false;
    } catch (_) {
      return _nearAScreen(r);
    }
  }

  /// The rougher test, if the screens' places can't be read: anywhere near the size of a screen
  /// from the top left counts.
  static bool _nearAScreen(Rect r) {
    try {
      for (final view in ui.PlatformDispatcher.instance.displays) {
        final size = view.size / view.devicePixelRatio;
        if (r.overlaps(Rect.fromLTWH(-size.width, -size.height, size.width * 3, size.height * 3))) return true;
      }
    } catch (_) {}
    return false;
  }

  /// The window, forward, on [hash] (a #address on the site) if there's one.
  static void show([String? hash]) {
    if (hash != null && hash.isNotEmpty) {
      // From the tray, a notification or a widget: a fresh start in the detail pane.
      AppNav.fromPane = false;
      Links.open('$site/${hash.startsWith('#') ? hash : '#$hash'}');
    }
    final w = window;
    if (w == null) return;
    if (!shown) {
      firstShow();
      return;
    }
    if (w.isMinimized) w.restore();
    w.show();
    w.focus();
    SgbusDesktop.bringToFront();
  }

  /// Into the tray. The first time, a notification says it's still running.
  static void hide() {
    window?.hide();
    if (DeskSettings.get<bool>('trayHintShown') == true) return;
    DeskSettings.write({'trayHintShown': true});
    stillRunning?.call();
  }

  /// Set by notify.dart: "SG Bus Timings is still running".
  static void Function()? stillRunning;

  /// Whether the window's in front.
  static bool get inFront {
    final w = window;
    return w != null && w.isVisible && w.isFocused && !w.isMinimized;
  }

  /// Quits: the window lets itself close, every widget is kept for next time, and anything
  /// waiting for the quit (an update to install) runs first.
  static Future<void> quit() async {
    quitting = true;
    _keepBounds(now: true);
    for (final f in List.of(beforeQuit)) {
      try {
        await f();
      } catch (_) {}
    }
    exit(0);
  }

  /// What runs just before the app quits (an update to install, say).
  static final List<Future<void> Function()> beforeQuit = [];

  // ---------- links ----------

  /// uwu://sgbus/ links, to the site's address they name (app/links.dart has the rules); null
  /// for another app's link or anything not a plain address.
  static String? fromAppLink(String link) => Links.fromAppLink(link);

  /// A uwu:// link among a command line's arguments.
  static String? linkIn(List<String> args) => args.where((a) => a.toLowerCase().startsWith('$scheme://')).firstOrNull;

  /// An address typed into the command bar, as a whole address, or null if it isn't one
  /// (app/links.dart has the rules).
  static String? typedAddress(String text) => Links.typedAddress(text);

  /// Whether an address is the site's own: https:// on the site's host only (Links.isSite).
  static bool isSite(String url) => Links.isSite(url);

  /// A link while the app's open: the page it names. Another UwU app's link is handed on to it.
  static void openLink(String link, {bool Function(String)? passOn}) {
    final target = fromAppLink(link);
    if (target == null && passOn != null && passOn(link)) return;
    if (target == null) {
      show();
      return;
    }
    show();
    AppNav.fromPane = false;
    Links.open(target);
  }

  /// The page a launch should open on, from its command line.
  static String? startPage() {
    final link = linkIn(launchArgs);
    return link == null ? null : fromAppLink(link);
  }

  // ---------- the window's background ----------

  static Color? _background;

  /// Paints the window itself in the theme's background colour, so it never flashes white while
  /// it's resized or shown (chrome.dart calls it as the theme changes).
  static void paintBackground(Color colour) {
    final w = window;
    if (w == null || colour == _background) return;
    _background = colour;
    try {
      w.backgroundColor = colour.toNative();
    } catch (_) {}
  }

  // ---------- starting when you sign in ----------

  /// Linux's autostart entry, which starts the app when the person signs in.
  static File get _autostart => File('${Platform.environment['XDG_CONFIG_HOME'] ?? '${Platform.environment['HOME']}/.config'}/autostart/sgbus-timings.desktop');

  /// Whether the app starts when the person signs in to the computer.
  static Future<bool> startsAtLogin() async {
    if (linux) return _autostart.existsSync();
    return await SgbusDesktop.startsAtLogin() ?? false;
  }

  /// Turns starting at sign-in on or off: an autostart entry on Linux, the system's own way on
  /// Windows and macOS (the sgbus_desktop plugin). Not from source, so a developer's computer
  /// doesn't start a test build.
  static Future<void> setStartAtLogin(bool on) async {
    if (fromSource) return;
    if (linux) {
      final f = _autostart;
      if (!on) {
        if (f.existsSync()) f.deleteSync();
        return;
      }
      // An AppImage runs from a temporary mount, so it's started by the file itself.
      final exec = Platform.environment['APPIMAGE'] ?? Platform.resolvedExecutable;
      f.parent.createSync(recursive: true);
      f.writeAsStringSync(['[Desktop Entry]', 'Type=Application', 'Name=$name', 'Exec="$exec"', 'Icon=sgbus-timings', 'X-GNOME-Autostart-enabled=true', ''].join('\n'));
      return;
    }
    await SgbusDesktop.setStartAtLogin(on);
  }

  /// From the first run of an installed copy, the app starts when you sign in, until it's turned
  /// off; once chosen, the choice sticks (loginChosen).
  static Future<void> startAtLoginFirstRun() async {
    if (fromSource || DeskSettings.get<bool>('loginChosen') == true) return;
    await setStartAtLogin(true);
    DeskSettings.write({'loginChosen': true});
  }

  // ---------- small things ----------

  /// The page's address as the title bar shows it.
  static String displayAddress(String url) => url.replaceFirst(RegExp(r'^https?://'), '').replaceFirstMapped(RegExp(r'^([^/]+)/$'), (m) => m[1]!);

  /// Opens a link in the browser (or mail app).
  static Future<void> openExternal(String url) async {
    try {
      if (windows) {
        await Process.start('rundll32', ['url.dll,FileProtocolHandler', url], mode: ProcessStartMode.detached);
      } else if (mac) {
        await Process.start('open', [url], mode: ProcessStartMode.detached);
      } else {
        await Process.start('xdg-open', [url], mode: ProcessStartMode.detached);
      }
    } catch (_) {}
  }

  /// Shows a file in its folder.
  static Future<void> showInFolder(String path) async {
    try {
      if (windows) {
        await Process.start('explorer.exe', ['/select,', path], mode: ProcessStartMode.detached);
      } else if (mac) {
        await Process.start('open', ['-R', path], mode: ProcessStartMode.detached);
      } else {
        await Process.start('xdg-open', [File(path).parent.path], mode: ProcessStartMode.detached);
      }
    } catch (_) {}
  }

  /// The Downloads folder.
  static String get downloads {
    final env = Platform.environment;
    if (windows) return '${env['USERPROFILE']}\\Downloads';
    final home = env['HOME'] ?? '';
    if (linux) {
      try {
        final dirs = File('$home/.config/user-dirs.dirs').readAsStringSync();
        final m = RegExp(r'^XDG_DOWNLOAD_DIR="(.+)"$', multiLine: true).firstMatch(dirs);
        if (m != null) return m[1]!.replaceAll(r'$HOME', home);
      } catch (_) {}
    }
    return '$home/Downloads';
  }

  /// The navigator's context, for dialogs.
  static BuildContext? get context => AppNav.context;
}
