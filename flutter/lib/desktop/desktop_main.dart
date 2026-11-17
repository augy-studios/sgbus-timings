// The desktop app's start, in the order the Electron app had it (main.js): a copy started only to
// hand another UwU app's link on does that and quits; then the update window (which may install
// an update and restart before anything else opens), then the app, hidden, with Make it yours in
// front of it the first time; the tray, the widgets and the checks that run while it's open.
// main.dart calls each part around its own start.
//
// The main window stays hidden until the app's first frame is drawn, so it never flashes white
// (desktop-features-spec §5).
import 'dart:async';
import 'dart:io';

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:sgbus_desktop/sgbus_desktop.dart';
import 'package:window_manager/window_manager.dart';

import '../app/links.dart';
import '../app/nav.dart';
import '../data/favs.dart';
import '../data/store.dart';
import '../theme/theme.dart';
import 'alerts_poll.dart';
import 'chrome.dart';
import 'desk_theme.dart';
import 'desktop.dart';
import 'glance.dart';
import 'links.dart';
import 'location.dart';
import 'notify.dart';
import 'splash.dart';
import 'tray.dart';
import 'updater.dart';
import 'welcome.dart';
import 'widgets_window.dart';

/// The desktop app's start-up, in order: the window, the update window, then everything around
/// the app once it's drawn.
class DeskStart {
  DeskStart._();

  /// Set once the desktop's first look has been chosen, so it's chosen only once.
  static const _lookKey = 'desktop.look';

  /// Before the app's drawn: a copy started only to hand another UwU app's link on quits here
  /// ([_handOffOnly]); otherwise the window is found and set up, and the desktop's look chosen for
  /// the app: the site's (not Material You's, as the website and the Electron app had it), chosen
  /// once, with the computer's accent colour if "Use system accent colour" is on (desk_theme.dart).
  static Future<void> window() async {
    await _handOffOnly();
    await Desktop.findWindow();
    Desktop.setUpMain();
    DeskLocation.init();
    if (Store.I.get(_lookKey) == null) {
      Store.I.put(_lookKey, '1');
      if (Store.I.get(AppLook.lookKey) == null) AppLook.I.materialYou = false;
    }
    await DeskTheme.init();
  }

  /// Started only to carry another UwU app's link (desktop-features-spec §10): a uwu:// link for
  /// another app's host, which reached this app because it holds uwu:// for every UwU app. The
  /// link is handed to the app that held uwu:// before (links.dart), and this copy quits at once,
  /// before the update window, the main window or the tray, as the Electron app did. A link of
  /// this app's own, or one with nobody to hand it to, carries on into the app as usual.
  static Future<void> _handOffOnly() async {
    final link = await _startLink();
    if (link == null || Desktop.fromAppLink(link) != null) return;
    // Waits for the other app to start, then Desktop.quit ends this one: nothing after it runs.
    await DeskLinks.handOffAndQuit(link, Desktop.quit);
  }

  /// The uwu:// link the app was started with, or null. Windows and Linux put it in the command
  /// line. macOS sends it as an Apple event instead, which the native side keeps: asked for here,
  /// before anything listens to SgbusDesktop.events (after that it comes only as an 'open' event,
  /// which afterApp's listener opens).
  static Future<String?> _startLink() async {
    final fromMac = Platform.isMacOS ? await SgbusDesktop.startLink() : null;
    return fromMac ?? Desktop.linkIn(Desktop.launchArgs);
  }

  /// The update window, as the app opens: small, frameless, in the middle of the screen. Completes
  /// when the app should open.
  static Future<void> splash() async {
    final w = Desktop.window;
    if (w == null) return;
    // From source there's nothing to update, unless SGBUS_SPLASH_DEMO=1 shows the steps.
    if (Desktop.fromSource && Platform.environment['SGBUS_SPLASH_DEMO'] != '1') return;
    _splashLook(w);
    runApp(const _SplashApp());
    w.show();
    await Updater.startup();
    // Hidden again: the app's window comes back at its own size, after Make it yours if it's due.
    w.hide();
  }

  /// The window shaped for the update window: small, frameless, fixed, in the middle.
  static void _splashLook(Window w) {
    w.setFrameless(true);
    w.isResizable = false;
    w.isMaximizable = false;
    w.minimumSize = const Size(300, 360).toNative();
    w.setSize(const Size(300, 360).toNative(), false);
    w.center();
  }

  /// Once the app's drawn: everything around it.
  static Future<void> afterApp() async {
    Updater.showSplash = () {
      final w = Desktop.window;
      if (w == null) return;
      if (w.isFullScreen) w.isFullScreen = false;
      if (w.isMaximized) w.unmaximize();
      _splashLook(w);
      runApp(const _SplashApp());
      w.show();
      w.focus();
    };
    DeskChrome.init();
    const WindowMethodChannel('sgbus/main', mode: ChannelMode.unidirectional).setMethodCallHandler(_fromWindows);
    await DeskNotify.init();
    // Opening a page needs the app's navigator, made with its first frame. It's almost always
    // there by now; if not, the first frame is waited for (at most 2 s, as below).
    if (AppNav.nav == null) await WidgetsBinding.instance.endOfFrame.timeout(const Duration(seconds: 2), onTimeout: () {});
    // The page a uwu://sgbus/ link in the command line names (Windows and Linux), opened before
    // the native side's events are listened to. A link a second copy handed over while this one
    // was starting is held until then, so it opens after this one, and wins: it's the newer.
    final page = Desktop.startPage();
    if (page != null) Links.open(page);
    // The first listener tells the native side Dart is ready, so it sends what it held back: a
    // second copy's link, or on macOS the link that started the app.
    SgbusDesktop.events.listen(_nativeEvent);
    // macOS: ⌘Q, the app menu's Quit and the Dock's Quit go through Desktop.quit, as the tray's
    // Quit does, so the window's place is kept and a downloaded update installs.
    if (Platform.isMacOS) SgbusDesktop.setQuitHandler(Desktop.quit);
    unawaited(DeskLinks.init());
    await Desktop.startAtLoginFirstRun();
    await Welcome.applyPending();
    Glance.init();
    await DeskTray.init();
    Desktop.onShown.add(Glance.thumbButtons);
    Updater.start();
    AlertsPoll.start();
    Favs.I.shareWithWidgets();
    // The first launch offline: "No connection" in place of the app (chrome.dart).
    unawaited(DeskChrome.checkFirstLaunch());
    // Shown only once the app's first frame is drawn, so the window never flashes white.
    // At most 2 s: a window that draws nothing (no screen, say) still shows.
    await WidgetsBinding.instance.endOfFrame.timeout(const Duration(seconds: 2), onTimeout: () {});
    if (Welcome.due) {
      // Make it yours comes first, the once; the window then, unless a link's brought it up.
      await Welcome.open(() {
        if (!Desktop.shown) Desktop.firstShow();
      });
    } else {
      Desktop.firstShow();
    }
    await DeskWidgets.restore();
  }

  /// One event from the native side (sgbus_desktop's events): a link (a second copy's command
  /// line on Windows and Linux, a uwu:// link on macOS) opens its page, or is handed on to the
  /// UwU app it's for; a second copy started with no link, or the Dock icon clicked (macOS),
  /// brings the window forward. Glance listens for the thumbnail buttons and the Dock menu.
  static void _nativeEvent((String, Map<String, Object?>) e) {
    final (name, data) = e;
    if (name == 'open') {
      final args = [for (final a in (data['args'] as List? ?? const [])) '$a', if (data['url'] is String) data['url'] as String];
      final link = Desktop.linkIn(args);
      if (link != null) {
        Desktop.openLink(link, passOn: DeskLinks.passOn);
      } else {
        Desktop.show();
      }
    } else if (name == 'activate') {
      Desktop.show();
    }
  }

  /// What the other windows (Make it yours, the widgets) ask the main window over the
  /// `sgbus/main` channel.
  static Future<Object?> _fromWindows(MethodCall call) async {
    final a = call.arguments is Map ? Map<String, Object?>.from(call.arguments as Map) : <String, Object?>{};
    if (call.method.startsWith('widget-')) return DeskWidgets.handle(call.method, a);
    switch (call.method) {
      case 'open-hash':
        final hash = '${a['hash'] ?? ''}';
        if (RegExp(r'^#[\w/.,~-]*$').hasMatch(hash)) Desktop.show(hash);
        return true;
      case 'welcome-finish':
        await Welcome.finish(a);
        return true;
    }
    return null;
  }
}

/// The update window's whole app, run in the main window's engine before the app itself.
class _SplashApp extends StatelessWidget {
  const _SplashApp();

  /// The update window's screen, alone in an app of its own.
  @override
  Widget build(BuildContext context) => const MaterialApp(debugShowCheckedModeBanner: false, home: Scaffold(body: SplashScreen()));
}
