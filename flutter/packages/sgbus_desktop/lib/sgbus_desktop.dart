// The desktop apps' own native parts (see pubspec.yaml), called from Dart: each window's native
// handle, Windows' Jump List, taskbar thumbnail buttons and start at sign-in, the macOS Dock and
// login items, and the links and events each platform sends back. The native sides are in
// windows/, macos/ and linux/ beside this folder; lib/desktop/ in the app is what calls them.
//
// Every call fails quietly where a platform hasn't the thing (it answers null): a missing Jump
// List is no reason to stop the app.
import 'dart:async';

import 'package:flutter/services.dart';

/// SG Bus Timings' own calls to the computer, for what no package on pub.dev does. All static:
/// each window's engine has its own channel to its own copy of the native plugin.
class SgbusDesktop {
  SgbusDesktop._();

  static const _channel = MethodChannel('org.uwuapps.sgbus/desktop');
  static final _events = StreamController<(String, Map<String, Object?>)>.broadcast(onListen: _sayReady);
  static bool _takingCalls = false;
  static bool _readySent = false;
  static Future<void> Function()? _quitHandler;

  /// Events from the native side, each a name and its details:
  /// - ('open', {args: [...]}): a second copy's command line, handed to this one (Windows,
  ///   Linux); ('open', {url}): a uwu:// link (macOS);
  /// - ('thumb', {id}): a taskbar thumbnail button pressed (Windows);
  /// - ('dock', {index}): a Dock menu item picked (macOS);
  /// - ('activate', {}): the Dock icon clicked (macOS).
  ///
  /// The first listener tells the native side Dart's listening ("ready"), so it sends what it
  /// kept until then: a link handed over during the update window, or the link that started the
  /// app on macOS.
  static Stream<(String, Map<String, Object?>)> get events => _events.stream;

  /// macOS: [handler] runs when the person quits with ⌘Q, the app menu's Quit or the Dock's Quit,
  /// instead of the app quitting at once, so it can tidy up first (keep the window's place,
  /// install a downloaded update). The handler must end the app itself, as `Desktop.quit` does.
  /// Without one, or with null, those quit at once. macOS logging out or shutting down always
  /// quits at once. Setting it doesn't start [events].
  static void setQuitHandler(Future<void> Function()? handler) {
    _quitHandler = handler;
    _takeCalls();
    _invoke('quitHandler', {'on': handler != null});
  }

  /// macOS: the uwu:// link the app was started with, asked before anything listens to [events]
  /// (null if it wasn't started by a link). For handing another UwU app's link on and quitting
  /// before the window opens (desktop-features-spec §10). The link still arrives as an 'open'
  /// event once [events] has a listener. Null on Windows and Linux, where the link is in the
  /// command line.
  static Future<String?> startLink() => _invoke<String>('startLink');

  /// Starts taking messages from the native side, once.
  static void _takeCalls() {
    if (_takingCalls) return;
    _takingCalls = true;
    _channel.setMethodCallHandler(_fromNative);
  }

  /// The first listener to [events]: takes messages from the native side and tells it Dart's
  /// listening ("ready", once), so it sends what it kept until now.
  static void _sayReady() {
    _takeCalls();
    if (_readySent) return;
    _readySent = true;
    _invoke('ready');
  }

  /// One message from the native side. A quit (macOS) is answered: true when a quit handler
  /// takes it, false for the native side to quit as usual. Anything else goes to [events].
  static Future<Object?> _fromNative(MethodCall call) async {
    if (call.method == 'quit') {
      final handler = _quitHandler;
      if (handler == null) return false;
      unawaited(handler());
      return true;
    }
    final raw = call.arguments;
    final args = raw is Map ? Map<String, Object?>.from(raw) : <String, Object?>{};
    _events.add((call.method, args));
    return null;
  }

  /// Calls [method] on the native side, giving null if it fails or the platform hasn't got it.
  static Future<T?> _invoke<T>(String method, [Object? args]) async {
    try {
      return await _channel.invokeMethod<T>(method, args);
    } catch (_) {
      return null;
    }
  }

  /// The address of this engine's own window (an HWND on Windows, an NSWindow* on macOS, a
  /// GtkWindow* on Linux), for nativeapi's `Window.createWithNativeWindow`. Null if it has none.
  static Future<int?> handle() => _invoke<int>('handle');

  /// Windows: the Jump List's tasks (right-click the taskbar icon), each a title, a tooltip and
  /// the arguments the app's started with (a uwu://sgbus/ link).
  static Future<void> jumpList(List<({String title, String description, String args})> tasks) =>
      _invoke('jumpList', {
        'tasks': [
          for (final t in tasks) {'title': t.title, 'description': t.description, 'args': t.args},
        ],
      });

  /// Windows: the taskbar thumbnail's buttons, each {id, tooltip, icon: prev|next|refresh,
  /// enabled}. A pressed button comes back as a 'thumb' event with its id.
  static Future<void> thumbButtons(List<Map<String, Object>> buttons) => _invoke('thumbButtons', {'buttons': buttons});

  /// macOS: the Dock menu's items (right-click the Dock icon); [] for none. A picked item comes
  /// back as a 'dock' event with its place in the list.
  static Future<void> dockMenu(List<({String title, bool enabled})> items) => _invoke('dockMenu', {
        'items': [
          for (final i in items) {'title': i.title, 'enabled': i.enabled},
        ],
      });

  /// macOS: the Dock icon's badge (the tray countdown's soonest minutes); '' for none.
  static Future<void> badge(String text) => _invoke('badge', {'text': text});

  /// Windows and macOS: whether the app starts when the person signs in. Null on Linux, where
  /// lib/desktop/desktop.dart does it with a file instead.
  static Future<bool?> startsAtLogin() => _invoke<bool>('getLogin');

  /// Windows and macOS: starts the app when the person signs in, or stops it. Both use the
  /// running app's own path, so [exe] isn't needed today; it's kept for a platform that might.
  static Future<void> setStartAtLogin(bool on, {String? exe}) => _invoke('setLogin', {'on': on, 'exe': exe});

  /// Brings the app's window in front of other apps, after a link or a second copy brought it up
  /// (Windows: the window; macOS: the app; Linux: the window).
  static Future<void> bringToFront() => _invoke('front');
}
