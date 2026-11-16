// Where the app goes: a page of the Edge Tray, or a screen over it (a stop's timings, a bus's
// route, Navigate to somewhere). Every feature asks here, so links (app/links.dart), the tray,
// notifications and shortcuts all land the same way.
//
// On a wide desktop window (the rail and split layouts below, DeskPanes) the shell
// (app/shell.dart) has a second navigator, the detail pane: a screen pushed with its site
// address (a stop, a bus, a shared ETA, sync, a team run) opens there instead of over the whole
// window, beside the page's list. On Android, and while something full-screen is open, it's
// pushed over everything as always. The layouts, and the desktop title bar's Back and Forward
// (ViewHistory), are kept here, not under desktop/, so the shell (and their tests) needn't bring
// in the desktop's window packages.
import 'dart:async';

import 'package:flutter/material.dart';

/// Where the app goes, and how it gets there: the navigators, the page on show, and every
/// feature's way in. Everything is static: there is one app.
class AppNav {
  AppNav._();

  /// The app's own navigator: the shell, with every full-screen screen pushed over it.
  static final navigatorKey = GlobalKey<NavigatorState>();

  /// The picture a bug report's Screenshot a page takes (app/app.dart).
  static final shotKey = GlobalKey();

  /// A bug report's Screenshot a page under way: the app's yours to go to the page you want, with
  /// a button over it for taking it (features/misc/misc.dart).
  static final shooting = ValueNotifier<bool>(false);
  static Widget Function()? shotBar;

  /// Shows the app's short messages along the bottom ([say]).
  static final messengerKey = GlobalKey<ScaffoldMessengerState>();

  /// The app's navigator, and its context (for dialogs).
  static NavigatorState? get nav => navigatorKey.currentState;

  /// The app's navigator's context, for opening a dialog or sheet over everything from code that
  /// has no context of its own (a notification, the bridge).
  static BuildContext? get context => navigatorKey.currentContext;

  // ---------- the desktop's detail pane ----------

  /// The detail pane's own navigator, on a wide desktop window only (app/shell.dart puts it
  /// there). Everywhere else, Android included, nothing uses the key, so [pane] is null.
  static final paneKey = GlobalKey<NavigatorState>();

  /// The detail pane's navigator, or null where there's no pane (Android, a narrow window).
  static NavigatorState? get pane => paneKey.currentState;

  /// Screens that always use the whole window, never the pane, though they have an address:
  /// the departures board, which goes full screen.
  static const wholeWindow = {'board'};

  /// Whether the last click was inside the detail pane (set by desktop/chrome.dart). A screen
  /// opened from inside the pane (a bus from a stop's timings) goes on top of what's there, so
  /// Back comes back to it; one opened from anywhere else (the list, the command bar, a link)
  /// replaces what the pane showed.
  static bool fromPane = false;

  /// Whether a point on the window (global coordinates) is over the detail pane.
  static bool paneContains(Offset global) {
    final box = paneKey.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return false;
    return (box.localToGlobal(Offset.zero) & box.size).contains(global);
  }

  /// Whether the detail pane is showing a screen (not just its "pick something" note).
  static bool get paneShowsScreen => pane?.canPop() ?? false;

  /// Whether the app's shrunk into picture-in-picture (features/misc/extras.dart): the live map
  /// shows only the map, and a trip only its line of text.
  static final pip = ValueNotifier<bool>(false);

  /// What the app shows over everything while it's small: set by the trip, null for the screen
  /// as it is.
  static Widget? Function()? pipView;

  /// The Edge Tray's page on show, and how to change it (set by the shell).
  static final page = ValueNotifier<String>('glance');

  /// Shows one of the shell's pages, closing every screen over it (and the desktop's detail
  /// pane), as tapping its button in the Edge Tray or the navigation rail does.
  static void showPage(String id) {
    _dropKeyboard();
    nav?.popUntil((r) => r.isFirst);
    pane?.popUntil((r) => r.isFirst);
    page.value = id;
  }

  /// Opens a screen over the page. [name] says which screen it is; [address] is the site's own
  /// address for it (#84009, #bus/22), which the desktop app's title bar shows and copies
  /// (desktop/chrome.dart). On a wide desktop window a screen with an address opens in the
  /// detail pane instead, unless it wants the whole window or a full-screen screen is open.
  static Future<T?> push<T>(Widget screen, {String? name, String? address}) {
    _dropKeyboard();
    final settings = RouteSettings(name: name, arguments: address == null ? null : {'address': address});
    final pane = AppNav.pane;
    if (pane != null && address != null && !wholeWindow.contains(name) && _panesInFront(pane)) {
      return _pushToPane<T>(pane, screen, settings);
    }
    return nav!.push<T>(MaterialPageRoute(builder: (_) => screen, settings: settings));
  }

  /// Watches the app's navigator, on the desktop (desktop/chrome.dart sets it).
  static RouteWatcher? rootWatcher;

  /// Whether the shell, with its panes, is the screen in front: nothing full-screen (Settings,
  /// the map) is open over it, though a dialog may be. If something is, a new screen goes over
  /// that, as on the phone, so Back still comes back to it.
  static bool _panesInFront(NavigatorState pane) {
    final watcher = rootWatcher;
    if (watcher != null) return watcher.depth <= 1;
    return ModalRoute.of(pane.context)?.isCurrent ?? false;
  }

  /// Opens a screen in the desktop's detail pane, in place (no slide). From inside the pane it
  /// goes on top of what's there; from anywhere else it replaces it ([fromPane]). A dialog, panel
  /// or menu open over the app closes first, and whatever opened it hears null.
  static Future<T?> _pushToPane<T>(NavigatorState pane, Widget screen, RouteSettings settings) {
    // The desktop's dialogs and panels sit on the app's own navigator, over the panes
    // (desktop/adaptive.dart), and the title bar, the rail, a link or the tray can still open a
    // screen while one's up. Left open, it would hide the new screen and still answer for the
    // screen it came from, which may be gone. The shell is the only screen under it here
    // (_panesInFront), so this stops there.
    nav?.popUntil((r) => r is PageRoute);
    final route = PageRouteBuilder<T>(
      settings: settings,
      pageBuilder: (_, _, _) => screen,
      transitionDuration: Duration.zero,
      reverseTransitionDuration: Duration.zero,
    );
    final stack = fromPane;
    // Used once: a screen opened next by the keyboard or a menu, with no click, replaces.
    fromPane = false;
    if (stack) return pane.push<T>(route);
    return pane.pushAndRemoveUntil<T>(route, (r) => r.isFirst);
  }

  /// The site address a screen was opened with ([push]'s address), if it has one.
  static String? addressOf(Route<dynamic>? route) {
    final args = route?.settings.arguments;
    return args is Map ? args['address'] as String? : null;
  }

  /// A search box left focused on the page behind (the Edge Tray opens screens without taking
  /// focus) keeps the keyboard up over the next screen, and brings it back on Back. Let it go
  /// first; a screen that wants the keyboard (autofocus) still takes it once it's built.
  static void _dropKeyboard() => FocusManager.instance.primaryFocus?.unfocus();

  /// A short message along the bottom of the window, replacing any that's showing.
  static void say(String text, {SnackBarAction? action}) {
    messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text), action: action, behavior: SnackBarBehavior.floating));
  }

  // Each feature registers how it opens: (args) -> open. Kept as functions so this file
  // doesn't import every screen.
  static final Map<String, void Function(Map<String, Object?> args)> _openers = {};

  /// Says how a feature opens (features/registry.dart and each feature's own file).
  static void register(String what, void Function(Map<String, Object?> args) open) => _openers[what] = open;

  /// Opens a feature by its name (stop, bus, settings…), with its arguments. False if nothing
  /// by that name is registered.
  static bool open(String what, [Map<String, Object?> args = const {}]) {
    final o = _openers[what];
    if (o == null) return false;
    o(args);
    return true;
  }
}

// ---------- the desktop's layouts ----------

/// How the desktop app's main window lays out its pages, by its width (desktop-features-spec
/// §5).
enum DeskLayout {
  /// Under 720 px: the phone's shell, with the Edge Tray.
  phone,

  /// 720 to 1024 px: the navigation rail and one pane.
  rail,

  /// Above 1024 px: the rail, the page's list, and a detail pane beside it.
  split,
}

/// Hands the window's layout down to the shell. Only the desktop's chrome (desktop/chrome.dart)
/// puts one in, so on Android the shell finds none and stays the phone's.
class DeskLayoutScope extends InheritedWidget {
  const DeskLayoutScope({super.key, required this.layout, required super.child});
  final DeskLayout layout;

  /// The shell is drawn again only when the layout changes (the window crossed 720 or 1024 px),
  /// not on every resize.
  @override
  bool updateShouldNotify(DeskLayoutScope oldWidget) => oldWidget.layout != layout;
}

/// The desktop's panes: where the layout changes, how wide the list is, and what the detail
/// pane shows.
class DeskPanes {
  DeskPanes._();

  /// The widths where the layout changes (desktop-features-spec §5).
  static const railFrom = 720.0;
  static const splitAbove = 1024.0;

  /// The list pane's width in the split layout: 360 to 400 px.
  static const listMin = 360.0;
  static const listMax = 400.0;

  /// The widest a screen in the detail pane goes; in a wider pane it's centred, as the site
  /// keeps its pages in a 1000 px column.
  static const detailMax = 1000.0;

  /// The layout for a window this wide: phone under 720 px, rail to 1024 px, split above.
  static DeskLayout layoutFor(double width) {
    if (width < railFrom) return DeskLayout.phone;
    if (width <= splitAbove) return DeskLayout.rail;
    return DeskLayout.split;
  }

  /// The list pane's width in the split layout, for [area] px of room beside the rail: about a
  /// third of it, kept between 360 and 400 px.
  static double listWidth(double area) => (area * 0.34).clamp(listMin, listMax);

  /// The window's layout as the desktop's chrome hands it down; phone where there's no chrome
  /// (Android, tests).
  static DeskLayout layoutOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<DeskLayoutScope>()?.layout ?? DeskLayout.phone;

  /// Watches the detail pane's navigator (app/shell.dart hands it over).
  static final observer = RouteWatcher()..addListener(_changed);

  /// Whether the detail pane shows a screen; in the rail layout it then covers the list.
  static final open = ValueNotifier<bool>(false);

  /// The pane's screens changed.
  static void _changed() => open.value = AppNav.paneShowsScreen;
}

/// Keeps a list of a navigator's open routes, and says when it changes: the detail pane's
/// (DeskPanes.observer), and the app's own for the desktop's title bar (desktop/chrome.dart).
class RouteWatcher extends NavigatorObserver with ChangeNotifier {
  /// Every route open, dialogs included, bottom first.
  final List<Route<dynamic>> routes = [];

  /// Called when a new screen opens over another (not for dialogs, nor the first screen).
  void Function()? onNewScreen;

  /// The screens open (not dialogs), bottom first.
  Iterable<Route<dynamic>> get screens => routes.whereType<PageRoute<dynamic>>();

  /// How many screens are open: 1 is the shell alone (or the pane's "pick something" note).
  int get depth => screens.length;

  /// The screen in front.
  Route<dynamic>? get ownTop => screens.lastOrNull;

  /// Forgets every route (the navigator went, as the desktop's window narrowed).
  void reset() {
    routes.clear();
    _later();
  }

  /// A route opened: added to the list. A new screen over another (not a dialog, nor the first
  /// screen) also calls [onNewScreen], which clears the title bar's Forward.
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    routes.add(route);
    if (route is PageRoute && depth > 1) onNewScreen?.call();
    _later();
  }

  /// A route closed (Back, a Close button, a dialog answered): taken off the list.
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    routes.remove(route);
    _later();
  }

  /// A route taken away without closing, as when a new screen replaces what the detail pane
  /// showed (AppNav's pushAndRemoveUntil): taken off the list.
  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    routes.remove(route);
    _later();
  }

  /// A route swapped for another: the new one takes the old one's place in the list (or the old
  /// one just goes, if there's no new one or the old one wasn't listed).
  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    final i = oldRoute == null ? -1 : routes.indexOf(oldRoute);
    if (i >= 0 && newRoute != null) {
      routes[i] = newRoute;
    } else if (oldRoute != null) {
      routes.remove(oldRoute);
    }
    _later();
  }

  /// Listeners hear of it once the navigator has finished its change.
  void _later() => scheduleMicrotask(notifyListeners);
}

// ---------- the desktop's Back and Forward ----------

/// The desktop title bar's history (desktop/chrome.dart): the pages visited, for Back once no
/// screen is open, and what Forward can open again. Forward only ever opens what Back left that
/// can be opened again: a screen with its own site address, or a page. A new screen or page,
/// not opened by Back or Forward themselves, clears Forward's list, as in a browser.
class ViewHistory {
  /// What Forward opens, most recent last: a site address, or "page:" and a page's id.
  final List<String> _forward = [];

  /// The pages shown, most recent last.
  final List<String> _pages = [];

  /// True while Back or Forward is moving, so their own moves don't clear Forward's list.
  bool _stepping = false;

  /// The most pages kept for Back.
  static const maxPages = 50;

  /// Whether Forward has something to open.
  bool get canForward => _forward.isNotEmpty;

  /// Whether Back can go to a page before this one.
  bool get hasPageBefore => _pages.length > 1;

  /// A page was shown.
  void pageShown(String id) {
    if (_pages.isEmpty || _pages.last != id) _pages.add(id);
    if (_pages.length > maxPages) _pages.removeAt(0);
    if (!_stepping) _forward.clear();
  }

  /// A new screen opened over another.
  void screenOpened() {
    if (!_stepping) _forward.clear();
  }

  /// Runs [step] as part of Back or Forward, so what it opens doesn't clear Forward's list.
  T stepping<T>(T Function() step) {
    _stepping = true;
    try {
      return step();
    } finally {
      _stepping = false;
    }
  }

  /// Back's first steps: closes the route in front of [nav] (which [watcher] watches) as its own
  /// back button would. Forward can open it again if it had its own site address; otherwise
  /// Forward stays as it was. False if it didn't close (a PopScope kept it open).
  Future<bool> close(NavigatorState nav, RouteWatcher watcher) async {
    final route = watcher.routes.lastOrNull;
    await nav.maybePop();
    // maybePop says true even when a PopScope said no, so look whether it really went.
    if (route == null || watcher.routes.contains(route)) return false;
    final address = AppNav.addressOf(route);
    if (address != null) _forward.add(address);
    return true;
  }

  /// Back once no screen is open: the page before this one (Forward can come back to this one),
  /// or null if there's none.
  String? backAPage() {
    if (_pages.length < 2) return null;
    _forward.add('page:${_pages.removeLast()}');
    // Taken off too: showing it puts it back on the end (pageShown).
    return _pages.removeLast();
  }

  /// What Forward opens next, taken off its list: a site address, or "page:" and an id
  /// ([pageIn]). Null if there's nothing.
  String? takeForward() => _forward.isEmpty ? null : _forward.removeLast();

  /// The page's id in one of Forward's steps, or null if the step is a site address.
  static String? pageIn(String step) => step.startsWith('page:') ? step.substring(5) : null;
}
