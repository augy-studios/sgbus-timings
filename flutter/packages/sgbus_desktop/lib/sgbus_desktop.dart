// The desktop apps' native parts (README in pubspec.yaml), from Dart. Every call fails quietly
// where a platform hasn't the thing: a missing Jump List is no reason to stop the app.
import 'dart:async';

import 'package:flutter/services.dart';

class SgbusDesktop {
  SgbusDesktop._();

  static const _channel = MethodChannel('org.uwuapps.sgbus/desktop');
  static final _events = StreamController<(String, Map<String, Object?>)>.broadcast();
  static bool _listening = false;

  /// Events from the native side: ('open', {args: [...]}) a second copy's command line or a
  /// link (macOS: {url}); ('thumb', {id}) a taskbar thumbnail button; ('dock', {index}) a Dock
  /// menu item; ('activate', {}) the Dock icon clicked with no window showing.
  static Stream<(String, Map<String, Object?>)> get events {
    if (!_listening) {
      _listening = true;
      _channel.setMethodCallHandler((call) async {
        final args = call.arguments is Map ? Map<String, Object?>.from(call.arguments as Map) : <String, Object?>{};
        _events.add((call.method, args));
        return null;
      });
      // Anything that came before Dart was listening (a link that started the app on macOS).
      _invoke('ready');
    }
    return _events.stream;
  }

  static Future<T?> _invoke<T>(String method, [Object? args]) async {
    try {
      return await _channel.invokeMethod<T>(method, args);
    } catch (_) {
      return null;
    }
  }

  /// The address of this engine's native window: an HWND, an NSWindow* or a GtkWindow*.
  static Future<int?> handle() => _invoke<int>('handle');

  /// Windows: the Jump List's tasks, each [title, description, arguments].
  static Future<void> jumpList(List<({String title, String description, String args})> tasks) =>
      _invoke('jumpList', {'tasks': [for (final t in tasks) {'title': t.title, 'description': t.description, 'args': t.args}]});

  /// Windows: the taskbar thumbnail's buttons, each {id, tooltip, icon: prev|next|refresh, enabled}.
  static Future<void> thumbButtons(List<Map<String, Object>> buttons) => _invoke('thumbButtons', {'buttons': buttons});

  /// macOS: the Dock menu's items ([] for none), and the Dock icon's badge ('' for none).
  static Future<void> dockMenu(List<({String title, bool enabled})> items) =>
      _invoke('dockMenu', {'items': [for (final i in items) {'title': i.title, 'enabled': i.enabled}]});
  static Future<void> badge(String text) => _invoke('badge', {'text': text});

  /// Windows and macOS: starting at sign-in. Null where it's done in Dart (Linux).
  static Future<bool?> startsAtLogin() => _invoke<bool>('getLogin');
  static Future<void> setStartAtLogin(bool on, {String? exe}) => _invoke('setLogin', {'on': on, 'exe': exe});

  /// Windows: lets another process bring its window forward (the one a link's handed to).
  static Future<void> bringToFront() => _invoke('front');
}
