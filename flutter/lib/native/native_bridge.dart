// The app's native parts, from Dart: the Java plugins in android/app/src/main/java/org/uwuapps/
// sgbus/ (SgBusPlugin, TripPlugin, CardPlugin, ...), over the bridge's method channel
// (bridge/Bridge.java). The same calls and events the site's page made of them when the app was
// a WebView, so the plugins' own docs still say what each does.
//
//   Native.call('SgBus', 'info')                 the plugin's answer, as a map (or null)
//   Native.on('Trip', 'location', (data) {...})  its events, until .cancel()
//   Native.has('card')                           whether this build and phone can (info's features)
import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

/// A plugin call that failed: its message, and the code the plugin gave ("permission",
/// "cancelled", "off", ...), with any data it added.
class NativeError implements Exception {
  NativeError(this.message, {this.code, this.data});
  final String message;
  final String? code;
  final Map<String, dynamic>? data;

  @override
  String toString() => code == null ? message : '$message ($code)';
}

/// Native parts answered in Dart instead of over the channel: the desktop apps' (desktop/host.dart),
/// which answer the same plugin calls a phone's Java does, so the screens need no desktop branches.
abstract class NativeHost {
  /// What this host can do, as info's features.
  List<String> get features;

  /// info's other answers (version, device, ...).
  Map<String, dynamic> get info;

  /// A plugin call. Throw a [NativeError] with code 'unavailable' for what it doesn't do.
  Future<Map<String, dynamic>?> call(String plugin, String method, Map<String, dynamic>? options);
}

/// One listener on a plugin's event.
class NativeListener {
  NativeListener._(this._key, this._fn);
  final String _key;
  final void Function(Map<String, dynamic>) _fn;

  void cancel() => Native._remove(this);
}

/// A Google Play build (build-apk.ps1 -Aab): Play updates it, so it has no updater of its own, and
/// it hasn't the permissions Play keeps for other kinds of app (app/src/play/AndroidManifest.xml):
/// Timings near a stop's background location, and "On a bus?"'s activity recognition.
const playBuild = bool.fromEnvironment('SGBUS_PLAY');
const _notOnPlay = {'update', 'checkupdate', 'releases', 'nearstops', 'onabus'};

class Native {
  Native._();

  static const _channel = MethodChannel('org.uwuapps.sgbus/bridge');
  static final Map<String, List<NativeListener>> _listeners = {};
  static bool _started = false;
  static Map<String, dynamic>? _info;

  /// Whether the native side is there at all: false in tests and screenshots.
  static bool available = true;

  /// The desktop's host, set before [start]. Null on a phone.
  static NativeHost? host;

  static Future<void> start() async {
    if (_started) return;
    _started = true;
    if (host != null) {
      available = true;
      _info = {...host!.info, 'features': host!.features};
      return;
    }
    _channel.setMethodCallHandler((call) async {
      if (call.method != 'event') return null;
      final args = Map<String, dynamic>.from(call.arguments as Map);
      final key = '${args['plugin']}.${args['event']}';
      final data = _decode(args['data'] as String?) ?? <String, dynamic>{};
      for (final l in List.of(_listeners[key] ?? const <NativeListener>[])) {
        try {
          l._fn(data);
        } catch (_) {
          // One listener's trouble isn't the others'.
        }
      }
      return null;
    });
    try {
      await _channel.invokeMethod('hello');
      _info = await call('SgBus', 'info');
    } on MissingPluginException {
      available = false;
    } catch (_) {
      _info = null;
    }
  }

  /// What this build and phone can do, as SgBusPlugin.info lists it.
  static bool has(String feature) => !(playBuild && _notOnPlay.contains(feature)) && ((_info?['features'] as List?) ?? const []).contains(feature);
  static Map<String, dynamic>? get info => _info;

  /// For the guide's screenshots: the features a phone has and the plugins' answers, so the
  /// buttons and sheets that need them can be drawn. Null [answer] puts things back.
  static void fake(List<String> features, Future<Map<String, dynamic>?> Function(String plugin, String method, Map<String, dynamic>? options)? answer) {
    _info = answer == null ? null : {'features': features};
    _fake = answer;
  }

  static Future<Map<String, dynamic>?> Function(String plugin, String method, Map<String, dynamic>? options)? _fake;

  /// One of a plugin's events, from the desktop's host.
  static void emit(String plugin, String event, Map<String, dynamic> data) => fakeEvent(plugin, event, data);

  /// For the guide's screenshots: one of a plugin's events, as if the phone had sent it.
  static void fakeEvent(String plugin, String event, Map<String, dynamic> data) {
    for (final l in List.of(_listeners['$plugin.$event'] ?? const <NativeListener>[])) {
      l._fn(data);
    }
  }

  static Future<Map<String, dynamic>?> call(String plugin, String method, [Map<String, dynamic>? options]) async {
    if (_fake != null) return _fake!(plugin, method, options);
    if (host != null) return host!.call(plugin, method, options);
    if (!available) throw NativeError('Not in the app', code: 'unavailable');
    try {
      final json = await _channel.invokeMethod<String>('call', {
        'plugin': plugin,
        'method': method,
        'options': jsonEncode(options ?? const {}),
      });
      return _decode(json);
    } on PlatformException catch (e) {
      throw NativeError(e.message ?? 'Failed', code: e.code, data: _decode(e.details as String?));
    } on MissingPluginException {
      available = false;
      throw NativeError('Not in the app', code: 'unavailable');
    }
  }

  static NativeListener on(String plugin, String event, void Function(Map<String, dynamic>) fn) {
    final key = '$plugin.$event';
    final l = NativeListener._(key, fn);
    final list = _listeners.putIfAbsent(key, () => []);
    list.add(l);
    if (list.length == 1 && available && host == null) {
      _channel.invokeMethod('listen', {'plugin': plugin, 'event': event}).catchError((_) => null);
    }
    return l;
  }

  static void _remove(NativeListener l) {
    final list = _listeners[l._key];
    if (list == null || !list.remove(l) || list.isNotEmpty || !available || host != null) return;
    final parts = l._key.split('.');
    _channel.invokeMethod('unlisten', {'plugin': parts[0], 'event': parts[1]}).catchError((_) => null);
  }

  /// Asks for one of a plugin's permissions, as Android's own prompt. Once it's been refused for
  /// good, Android won't prompt any more, so this opens the app's settings to turn it on there
  /// instead. Whether it's allowed now.
  static Future<bool> allow(String plugin, String alias) async {
    final now = await call(plugin, 'checkPermissions');
    if (now?[alias] == 'granted') return true;
    if (now?[alias] == 'denied') {
      await call('SgBus', 'openSettings', {'what': 'app'});
      return false;
    }
    final after = await call(plugin, 'requestPermissions', {
      'permissions': [alias],
    });
    return after?[alias] == 'granted';
  }

  static Map<String, dynamic>? _decode(String? json) {
    if (json == null || json.isEmpty) return null;
    final v = jsonDecode(json);
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }
}
