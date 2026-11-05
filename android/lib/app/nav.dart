// Where the app goes: a page of the Edge Tray, or a screen over it (a stop's timings, a bus's
// route, Navigate to somewhere). Every feature asks here, so links (app/links.dart), the tray,
// notifications and shortcuts all land the same way.
import 'package:flutter/material.dart';

class AppNav {
  AppNav._();
  static final navigatorKey = GlobalKey<NavigatorState>();
  static final shotKey = GlobalKey();
  static final messengerKey = GlobalKey<ScaffoldMessengerState>();

  static NavigatorState? get nav => navigatorKey.currentState;
  static BuildContext? get context => navigatorKey.currentContext;

  /// The Edge Tray's page on show, and how to change it (set by the shell).
  static final page = ValueNotifier<String>('glance');

  static void showPage(String id) {
    nav?.popUntil((r) => r.isFirst);
    page.value = id;
  }

  static Future<T?> push<T>(Widget screen, {String? name}) =>
      nav!.push<T>(MaterialPageRoute(builder: (_) => screen, settings: RouteSettings(name: name)));

  static void say(String text, {SnackBarAction? action}) {
    messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text), action: action, behavior: SnackBarBehavior.floating));
  }

  // Each feature registers how it opens: (args) -> open. Kept as functions so this file
  // doesn't import every screen.
  static final Map<String, void Function(Map<String, Object?> args)> _openers = {};
  static void register(String what, void Function(Map<String, Object?> args) open) => _openers[what] = open;
  static bool open(String what, [Map<String, Object?> args = const {}]) {
    final o = _openers[what];
    if (o == null) return false;
    o(args);
    return true;
  }
}
