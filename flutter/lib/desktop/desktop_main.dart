// The desktop app's start, in the order the Electron app had it (main.js): the update window
// first (which may install an update and restart before anything else opens), then the app,
// hidden, with Make it yours in front of it the first time; the tray, the widgets and the checks
// that run while it's open. main.dart calls each part around its own start.
import 'dart:async';
import 'dart:io';

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:sgbus_desktop/sgbus_desktop.dart';
import 'package:window_manager/window_manager.dart';

import '../app/links.dart';
import '../data/favs.dart';
import '../data/store.dart';
import '../theme/theme.dart';
import 'alerts_poll.dart';
import 'chrome.dart';
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

class DeskStart {
  DeskStart._();

  static const _lookKey = 'desktop.look';

  /// Before the app's drawn: the window found and set up, and the computer's own look for the
  /// app (the site's, not Material You's, as the website and the Electron app had it), once.
  static Future<void> window() async {
    await Desktop.findWindow();
    Desktop.setUpMain();
    DeskLocation.init();
    if (Store.I.get(_lookKey) == null) {
      Store.I.put(_lookKey, '1');
      if (Store.I.get(AppLook.lookKey) == null) AppLook.I.materialYou = false;
    }
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
    SgbusDesktop.events.listen((e) {
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
    });
    // Started only to carry another UwU app's link (from a shortcut it can't hand over): hand it
    // over and go, before the window.
    final startLink = Desktop.linkIn(Desktop.launchArgs);
    if (startLink != null && Desktop.fromAppLink(startLink) == null && DeskLinks.passOn(startLink)) {
      await Desktop.quit();
      return;
    }
    unawaited(DeskLinks.init());
    await Desktop.startAtLoginFirstRun();
    await Welcome.applyPending();
    Glance.init();
    await DeskTray.init();
    Desktop.onShown.add(Glance.thumbButtons);
    Updater.start();
    AlertsPoll.start();
    Favs.I.shareWithWidgets();
    final page = Desktop.startPage();
    if (page != null) Links.open(page);
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

class _SplashApp extends StatelessWidget {
  const _SplashApp();

  @override
  Widget build(BuildContext context) => const MaterialApp(debugShowCheckedModeBanner: false, home: Scaffold(body: SplashScreen()));
}
