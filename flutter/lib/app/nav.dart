// Where the app goes: a page of the Edge Tray, or a screen over it (a stop's timings, a bus's
// route, Navigate to somewhere). Every feature asks here, so links (app/links.dart), the tray,
// notifications and shortcuts all land the same way.
import 'package:flutter/material.dart';

class AppNav {
  AppNav._();
  static final navigatorKey = GlobalKey<NavigatorState>();
  static final shotKey = GlobalKey();

  /// A bug report's Screenshot a page under way: the app's yours to go to the page you want, with
  /// a button over it for taking it (features/misc/misc.dart).
  static final shooting = ValueNotifier<bool>(false);
  static Widget Function()? shotBar;
  static final messengerKey = GlobalKey<ScaffoldMessengerState>();

  static NavigatorState? get nav => navigatorKey.currentState;
  static BuildContext? get context => navigatorKey.currentContext;

  /// Whether the app's shrunk into picture-in-picture (features/misc/extras.dart): the live map
  /// shows only the map, and a trip only its line of text.
  static final pip = ValueNotifier<bool>(false);

  /// What the app shows over everything while it's small: set by the trip, null for the screen
  /// as it is.
  static Widget? Function()? pipView;

  /// The Edge Tray's page on show, and how to change it (set by the shell).
  static final page = ValueNotifier<String>('glance');

  static void showPage(String id) {
    _dropKeyboard();
    nav?.popUntil((r) => r.isFirst);
    page.value = id;
  }

  /// [address]: the site's own address for the screen (#84009, #bus/22), which the desktop
  /// apps' title bar shows and copies (desktop/chrome.dart).
  static Future<T?> push<T>(Widget screen, {String? name, String? address}) {
    _dropKeyboard();
    return nav!.push<T>(MaterialPageRoute(builder: (_) => screen, settings: RouteSettings(name: name, arguments: address == null ? null : {'address': address})));
  }

  /// A search box left focused on the page behind (the Edge Tray opens screens without taking
  /// focus) keeps the keyboard up over the next screen, and brings it back on Back. Let it go
  /// first; a screen that wants the keyboard (autofocus) still takes it once it's built.
  static void _dropKeyboard() => FocusManager.instance.primaryFocus?.unfocus();

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
