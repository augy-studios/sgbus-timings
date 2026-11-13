// SG Bus Timings for Windows, macOS and Linux (2.5.0): the Android app's own screens, in Flutter,
// with the desktop's extras around them, as the Electron app (2.0.0 to 2.4.x) had them around the
// site (docs/desktop-features-spec.md lists each one):
//
// - the update window at launch, and updating itself (splash.dart, updater.dart);
// - Make it yours, the first window, and from the tray's menu after that (welcome.dart);
// - a tray icon (the menu bar on macOS): closing the window keeps the app running there, so
//   Service Alerts still come, checked every minute (alerts_poll.dart, notify.dart);
// - its own title bar: back, forward, reload, the address, copy, screenshots, the update button and
//   the window's buttons (chrome.dart, screenshot.dart);
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
import 'dart:ui' as ui;

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:sgbus_desktop/sgbus_desktop.dart';
import 'package:window_manager/window_manager.dart';

import '../app/links.dart';
import '../app/nav.dart';
import '../app/version.dart';
import 'settings.dart';

class Desktop {
  Desktop._();

  /// Whether this is the desktop app: Windows, macOS or Linux, and not a test.
  static bool get on => !kIsWeb && (Platform.isWindows || Platform.isMacOS || Platform.isLinux) && !_testing;
  static final bool _testing = !kIsWeb && Platform.environment.containsKey('FLUTTER_TEST');

  /// For the guide's screenshots and tests: draw the desktop's parts without being on one.
  static bool drawAnyway = false;
  static bool get looks => on || drawAnyway;

  static const site = 'https://sgbus.uwuapps.org';
  static const appId = 'org.uwuapps.sgbus';
  static const name = 'SG Bus Timings';
  static const scheme = 'uwu';
  static const linkHost = 'sgbus';
  static const releases = 'https://github.com/augy-studios/sgbus-timings/releases/latest';
  static String get userAgent => 'SGBusTimingsDesktop/$appVersion (+$site)';

  /// What this engine's window is: 'main', 'widget' or 'welcome', with its arguments.
  static String kind = 'main';
  static Map<String, Object?> windowArgs = const {};
  static WindowController? controller;

  /// This engine's own window.
  static Window? window;

  /// The command line the app was started with.
  static List<String> launchArgs = const [];

  /// Quitting for real: closing the window then lets it go.
  static bool quitting = false;

  /// The main window's been shown once (after the update window and Make it yours).
  static bool shown = false;

  static bool get mac => Platform.isMacOS;
  static bool get windows => Platform.isWindows;
  static bool get linux => Platform.isLinux;

  /// Running from a build made with `flutter run`, not an installed copy.
  static bool get fromSource => !kReleaseMode;

  /// Which window this engine draws, from desktop_multi_window's arguments.
  static Future<void> identify() async {
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

  static const minSize = Size(360, 520);
  static const defaultSize = Size(480, 880);
  static Rect? _normal; // the un-maximised bounds, kept as they change
  static Timer? _keepTimer;

  /// The main window's set up, still hidden: its own title bar, its least size, and its close
  /// button keeping the app in the tray.
  static void setUpMain() {
    final w = window;
    if (w == null) return;
    w.title = name;
    w.titleBarStyle = TitleBarStyle.hidden;
    w.minimumSize = minSize.toNative();
    w.addListener(_mainEvent);
  }

  static final List<void Function()> onWindowChange = [];

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

  static void _keepBounds({bool now = false}) {
    final w = window;
    if (w == null || !shown) return;
    try {
      if (!w.isMaximized && !w.isFullScreen && !w.isMinimized) _normal = w.bounds.toRect();
    } catch (_) {}
    _keepTimer?.cancel();
    void write() {
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
      final rect = Rect.fromLTWH((b['x'] as num? ?? 40).toDouble(), (b['y'] as num? ?? 40).toDouble(), (b['width'] as num).toDouble(), (b['height'] as num).toDouble());
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
    w.show();
    w.focus();
    for (final f in List.of(onShown)) {
      f();
    }
  }

  static final List<void Function()> onShown = [];

  static bool _onAScreen(Rect r) {
    try {
      for (final view in ui.PlatformDispatcher.instance.displays) {
        final size = view.size / view.devicePixelRatio;
        // Bounds are in logical pixels across every screen; one that overlaps the primary
        // screen's area or sits near it is taken as on a screen.
        if (r.overlaps(Rect.fromLTWH(-size.width, -size.height, size.width * 3, size.height * 3))) return true;
      }
    } catch (_) {}
    return false;
  }

  /// The window, forward, on [hash] (a #address on the site) if there's one.
  static void show([String? hash]) {
    if (hash != null && hash.isNotEmpty) Links.open('$site/${hash.startsWith('#') ? hash : '#$hash'}');
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

  static final List<Future<void> Function()> beforeQuit = [];

  // ---------- links ----------

  /// uwu://sgbus/ links, to the site's address they name, as the Android app maps them: the
  /// site's short links by their path (uwu://sgbus/go/k3v9q2x7ma), anything else as the site's
  /// # address (uwu://sgbus/84009, uwu://sgbus/bus/22, uwu://sgbus/nav, uwu://sgbus/map/84009),
  /// and uwu://sgbus/ alone the home page. Null for another host, or anything not a plain address.
  static String? fromAppLink(String link) {
    final Uri url;
    try {
      url = Uri.parse(link);
    } catch (_) {
      return null;
    }
    if (url.scheme.toLowerCase() != scheme || url.host.toLowerCase() != linkHost) return null;
    final rest = url.path.replaceAll(RegExp(r'^/+|/+$'), '');
    if (!RegExp(r'^[\w\-./,~%]*$').hasMatch(rest)) return null;
    if (rest.isEmpty) return '$site/';
    if (RegExp(r'^(go|trip|eta)/[a-z0-9]{10}$').hasMatch(rest)) return '$site/$rest';
    return '$site/#$rest';
  }

  /// A uwu:// link among a command line's arguments.
  static String? linkIn(List<String> args) => args.where((a) => a.toLowerCase().startsWith('$scheme://')).firstOrNull;

  /// Typed in the title bar's address: the site's own (sgbus.uwuapps.org/#84009), another site's
  /// (example.com, https://…), a path or # address on the site (/#bus/22, #84009), or a uwu://sgbus/
  /// link. Null for anything else.
  static String? typedAddress(String text) {
    final typed = text.trim();
    if (typed.isEmpty) return null;
    if (typed.toLowerCase().startsWith('$scheme://')) return fromAppLink(typed);
    if (RegExp(r'^[#/]').hasMatch(typed)) return Uri.parse('$site/').resolve(typed).toString();
    final hasScheme = RegExp(r'^[a-z][a-z0-9+.-]*://', caseSensitive: false).hasMatch(typed);
    // A word, or a number, is not an address (84009 would be taken as an IP address).
    if (!hasScheme && !RegExp(r'^[^\s/?#]+\.[^\s/?#]+').hasMatch(typed)) return null;
    final Uri url;
    try {
      url = Uri.parse(hasScheme ? typed : 'https://$typed');
    } catch (_) {
      return null;
    }
    return (url.scheme == 'http' || url.scheme == 'https') && url.host.isNotEmpty ? url.toString() : null;
  }

  /// Whether an address is the site's own.
  static bool isSite(String url) {
    final u = Uri.tryParse(url);
    return u != null && u.scheme == 'https' && u.host == Uri.parse(site).host;
  }

  /// A link while the app's open: the page it names. Another UwU app's link is handed on to it.
  static void openLink(String link, {bool Function(String)? passOn}) {
    final target = fromAppLink(link);
    if (target == null && passOn != null && passOn(link)) return;
    if (target == null) {
      show();
      return;
    }
    show();
    Links.open(target);
  }

  /// The page a launch should open on, from its command line.
  static String? startPage() {
    final link = linkIn(launchArgs);
    return link == null ? null : fromAppLink(link);
  }

  // ---------- starting when you sign in ----------

  static File get _autostart => File('${Platform.environment['XDG_CONFIG_HOME'] ?? '${Platform.environment['HOME']}/.config'}/autostart/sgbus-timings.desktop');

  static Future<bool> startsAtLogin() async {
    if (linux) return _autostart.existsSync();
    return await SgbusDesktop.startsAtLogin() ?? false;
  }

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
