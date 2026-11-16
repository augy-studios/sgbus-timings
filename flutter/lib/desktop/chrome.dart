// The desktop app's main window around the shared screens (desktop-features-spec §5,
// flutter-desktop-app-spec §2.3): its own title bar, a navigation rail, and the layout below.
// This file holds the window's state and what its buttons, keys and menus do (DeskChrome), and
// lays the window out. The parts it lays out each have a file of their own:
//
// - title_bar.dart: the title bar, 40 px tall in the brand colour, dragged to move the window and
//   double-clicked to maximise it. Left to right: Back, Forward and Reload; the command bar;
//   Copy link, the two screenshots (screenshot.dart), the green Restart to update (updater.dart),
//   and on Windows and Linux the window's own buttons (close keeps the app in the tray). macOS
//   keeps its traffic lights over the bar's left.
// - command_bar.dart: the command bar in the middle of the title bar, which shows the page's
//   title and, clicked (or Ctrl+K, Ctrl+F, Ctrl+L, F6; ⌘ on a Mac), searches stops, buses and
//   the app's commands, or opens a pasted link. The bar's short messages ("Link copied",
//   DeskChrome.say) show over it for 1.5 s.
// - rail.dart: the navigation rail down the window's left, in the Edge Tray's place.
//
// Below the bar, by the window's width (app/nav.dart's DeskPanes): under 720 px the phone's shell
// as it is, with the Edge Tray; from 720 px the rail takes the Edge Tray's place; above 1024 px
// the shell also splits into the page's list and a detail pane beside it, where a stop, a bus or
// a shared link opens (app/shell.dart, app/nav.dart). Full screen (F11, or a shared screen asking
// through the bridge's SgBus.setFullScreen, which host.dart routes to setFullScreen) hides the
// bar and the rail.
//
// History is the app's own (app/nav.dart's ViewHistory): Back closes the screen in front (a
// full-screen one first, then the detail pane's), or goes back a page; Forward opens again what
// Back left, if it was a page or a screen with its own site address. Reload runs the
// pull-to-refresh of the screen in front.
//
// The first launch with no connection, and no stops kept yet, shows "No connection" with Try
// again in place of the app (§15).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/net.dart';
import '../app/links.dart';
import '../app/nav.dart';
import '../app/pages.dart';
import '../data/network.dart';
import '../data/stops.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'command_bar.dart';
import 'desktop.dart';
import 'menubar.dart';
import 'rail.dart';
import 'screenshot.dart';
import 'title_bar.dart';

/// The main window's chrome: what the title bar shows, its history and actions, and the
/// window's own buttons and full screen. Everything is static: there is one main window.
class DeskChrome {
  DeskChrome._();

  /// The title bar's height (title_bar.dart).
  static const barHeight = 40.0;

  /// Room left on a Mac for its traffic lights, over the bar's left.
  static const macInset = 78.0;

  // ---------- what the bar shows ----------

  /// The site's address for what's on show, which Copy link copies.
  static final address = ValueNotifier<String>('${Desktop.site}/');

  /// What the command bar shows at rest: the page's or the screen's title.
  static final title = ValueNotifier<String>(Desktop.name);
  /// Whether Back and Forward have somewhere to go (greyed out when not).
  static final canBack = ValueNotifier<bool>(false);
  static final canForward = ValueNotifier<bool>(false);

  /// Reload's spinner.
  static final loading = ValueNotifier<bool>(false);

  /// Whether the window is full screen (the bar and rail hide), and whether it's maximised
  /// (the maximise button shows Restore).
  static final fullScreen = ValueNotifier<bool>(false);
  static final maximized = ValueNotifier<bool>(false);

  /// The bar's short message ("Link copied"), or null; each shows for 1.5 s.
  static final message = ValueNotifier<String?>(null);
  static Timer? _messageTimer;

  /// The first launch with no connection and no stops kept: "No connection" is showing.
  static final noConnection = ValueNotifier<bool>(false);
  static final retrying = ValueNotifier<bool>(false);

  /// The title bar's command bar (command_bar.dart), which the keys and menus open
  /// ([openCommandBar]) and Ctrl+W closes ([closePanelOrHide]).
  static final barKey = GlobalKey<CommandBarState>();

  // ---------- history ----------

  /// Back and Forward's history (app/nav.dart).
  static final history = ViewHistory();

  /// Watches the app's navigator (app/app.dart hands it over); the detail pane's is
  /// DeskPanes.observer. screenshot.dart asks [observer]'s `top` for the screen in front.
  static final observer = _Watcher();

  /// Starts following the page, the screens, the window and the language, once the app's drawn
  /// (desktop_main.dart).
  static void init() {
    AppNav.rootWatcher = observer;
    observer.addListener(_refresh);
    DeskPanes.observer.addListener(_refresh);
    observer.onNewScreen = _newScreen;
    DeskPanes.observer.onNewScreen = _newScreen;
    AppNav.page.addListener(_pageChanged);
    history.pageShown(AppNav.page.value);
    I18n.I.addListener(_refresh);
    Desktop.onWindowChange.add(_windowChanged);
    Desktop.onShown.add(_windowChanged);
    DeskShot.say = say;
    _refresh();
  }

  /// The window was maximised, restored, or went in or out of full screen: the bar follows.
  static void _windowChanged() {
    final w = Desktop.window;
    if (w == null) return;
    fullScreen.value = w.isFullScreen;
    maximized.value = w.isMaximized;
  }

  /// A new screen opened: unless Back or Forward opened it, Forward's list no longer applies.
  static void _newScreen() => history.screenOpened();

  /// A page was picked: remembered for Back.
  static void _pageChanged() {
    history.pageShown(AppNav.page.value);
    _refresh();
  }

  /// The screen in front, for the title, Reload and screenshots: a full-screen screen if one's
  /// open, else the detail pane's screen, else the shell (the page).
  static Route<dynamic>? _activeRoute() {
    if (observer.depth > 1) return observer.ownTop;
    if (DeskPanes.observer.depth > 1) return DeskPanes.observer.ownTop;
    return observer.ownTop;
  }

  /// Brings the bar up to date: the address, the title, and whether Back and Forward can go.
  static void _refresh() {
    address.value = _currentAddress();
    title.value = _currentTitle();
    canBack.value = (AppNav.nav?.canPop() ?? false) || AppNav.paneShowsScreen || history.hasPageBefore;
    canForward.value = history.canForward;
  }

  /// A # address or path on the site, as a whole address.
  static String _full(String hashOrPath) => hashOrPath.startsWith('/') ? '${Desktop.site}$hashOrPath' : '${Desktop.site}/$hashOrPath';

  /// The pages the site has an address for.
  static String _pageAddress(String id) => switch (id) {
        'alerts' => '#alerts',
        'nav' => '#nav',
        _ => '',
      };

  /// What's on show, as the site's address: the nearest screen with one (a full-screen screen,
  /// then the detail pane's), or the page's.
  static String _currentAddress() {
    for (final route in observer.routes.reversed) {
      final own = AppNav.addressOf(route);
      if (own != null) return _full(own);
    }
    for (final route in DeskPanes.observer.routes.reversed) {
      final own = AppNav.addressOf(route);
      if (own != null) return _full(own);
    }
    return _full(_pageAddress(AppNav.page.value));
  }

  /// The command bar's words at rest: the screen's title where there's a good one, the page's
  /// name on a page, or else the address.
  static String _currentTitle() {
    final route = _activeRoute();
    final named = _titleFor(route?.settings.name, AppNav.addressOf(route));
    if (named != null) return named;
    if (route == null || route.isFirst) return _pageLabel();
    return Desktop.displayAddress(address.value);
  }

  /// Titles for the screens that have one worth showing; null for the rest.
  static String? _titleFor(String? name, String? own) {
    if (name == null) return null;
    if (name == 'stop') {
      final code = RegExp(r'\d{5}').firstMatch(own ?? '')?[0];
      final stop = code == null ? null : Stops.of(code);
      return stop == null ? null : '${stop.name} ($code)';
    }
    if (name == 'bus' && own != null) return tr('desktop.title.bus', 'Bus {no}', {'no': own.split('/').last});
    if (name == 'board') return tr('desktop.title.board', 'Departures board');
    if (name == 'settings' || name.startsWith('settings/')) return tr('settings.settings', 'Settings');
    if (name == 'theme') return tr('theme.title', 'Theme');
    if (name == 'coins') return tr('coins.title', 'uwuCoins');
    if (name == 'map') return tr('desktop.title.map', 'Map');
    return null;
  }

  /// The page on show's name (Bus timings, Favourites…).
  static String _pageLabel() => Pages.all.where((p) => p.id == AppNav.page.value).firstOrNull?.label() ?? Desktop.name;

  /// Back: closes the screen (or dialog) in front, a full-screen one first, then the detail
  /// pane's, or else goes back a page. Forward can open what it left again if that has an
  /// address of its own, or was a page.
  static Future<void> back() async {
    final nav = AppNav.nav;
    final pane = AppNav.pane;
    if (nav != null && nav.canPop()) {
      await history.close(nav, observer);
    } else if (pane != null && pane.canPop()) {
      await history.close(pane, DeskPanes.observer);
    } else {
      final page = history.backAPage();
      if (page == null) return;
      history.stepping(() => AppNav.page.value = page);
    }
    _refresh();
  }

  /// Forward: opens what Back last left, a page, or a screen on top of what the detail pane
  /// shows (as it was before Back).
  static void forward() {
    final next = history.takeForward();
    if (next == null) return;
    history.stepping(() {
      final page = ViewHistory.pageIn(next);
      if (page != null) {
        AppNav.showPage(page);
      } else {
        AppNav.fromPane = true;
        Links.open(next);
        // A screen that opens later (a bus waits for its routes) replaces, as a click would.
        AppNav.fromPane = false;
      }
    });
    _refresh();
  }

  /// Runs the pull-to-refresh of the screen in front, spinning Reload while it works; a screen
  /// without one just spins a moment.
  static Future<void> reload() async {
    loading.value = true;
    try {
      final top = _activeRoute();
      final ctx = top is ModalRoute ? top.subtreeContext : null;
      RefreshIndicatorState? found;
      // Walks down the screen's widgets to the first pull-to-refresh that's on show (not one on
      // a page kept hidden behind it).
      void look(Element e) {
        if (found != null) return;
        if (e is StatefulElement && e.state is RefreshIndicatorState && TickerMode.valuesOf(e).enabled) {
          found = e.state as RefreshIndicatorState;
          return;
        }
        e.visitChildren(look);
      }

      if (ctx is Element) ctx.visitChildren(look);
      if (found != null) {
        await found!.show();
      } else {
        await Future<void>.delayed(const Duration(milliseconds: 400));
      }
    } catch (_) {
      // A screen gone while it refreshed: nothing to do.
    } finally {
      loading.value = false;
    }
  }

  // ---------- the bar's actions ----------

  /// Opens the command bar (Ctrl+K, Ctrl+F; with the address in it, selected, for Ctrl+L or F6,
  /// as a browser's address bar). In full screen the bar comes back first.
  static void openCommandBar({bool withAddress = false}) {
    if (fullScreen.value) {
      setFullScreen(false);
      WidgetsBinding.instance.addPostFrameCallback((_) => barKey.currentState?.open(withAddress: withAddress));
      return;
    }
    barKey.currentState?.open(withAddress: withAddress);
  }

  /// Shows a short message over the command bar for 1.5 s.
  static void say(String text) {
    _messageTimer?.cancel();
    message.value = text;
    _messageTimer = Timer(const Duration(milliseconds: 1500), () => message.value = null);
  }

  /// Copies what's on show's site address (Ctrl+Shift+C).
  static Future<void> copyLink() async {
    await Clipboard.setData(ClipboardData(text: address.value));
    say(tr('desktop.linkCopied', 'Link copied'));
  }

  /// The window's own buttons (Windows and Linux).
  static void minimize() => Desktop.window?.minimize();

  /// Maximises the window, or restores it if it's maximised.
  static void maximizeOrRestore() {
    final w = Desktop.window;
    if (w == null) return;
    w.isMaximized ? w.unmaximize() : w.maximize();
    Future<void>.delayed(const Duration(milliseconds: 50), _windowChanged);
  }

  /// Close: the window hides to the tray (desktop.dart stops it really closing).
  static void close() => Desktop.window?.close();

  /// Full screen on or off. The shared screens (the departures board) ask for it through the
  /// bridge's SgBus.setFullScreen, which host.dart routes here; F11 (⌃⌘F) toggles it. The bar
  /// and the rail hide while it's on.
  static void setFullScreen(bool on) {
    final w = Desktop.window;
    if (w != null) w.isFullScreen = on;
    fullScreen.value = on;
  }

  /// F11 (⌃⌘F): full screen on, or off.
  static void toggleFullScreen() => setFullScreen(!fullScreen.value);

  /// Closes the dialog, menu or side panel in front, if there is one. False when there's none.
  static bool closeTopPanel() {
    if (_isPanel(observer.routes.lastOrNull)) {
      AppNav.nav?.maybePop();
      return true;
    }
    // The detail pane's own dialogs and panels, while the shell is in front.
    if (observer.routes.length == 1 && _isPanel(DeskPanes.observer.routes.lastOrNull)) {
      AppNav.pane?.maybePop();
      return true;
    }
    return false;
  }

  /// Dialogs, menus, sheets and side panels: routes that sit over a screen rather than being one.
  static bool _isPanel(Route<dynamic>? route) => route is PopupRoute || (route is ModalRoute && !route.opaque && !route.isFirst);

  /// Ctrl+W (⌘W): closes the command bar's list or the dialog or panel in front, or else hides
  /// the window to the tray.
  static void closePanelOrHide() {
    final bar = barKey.currentState;
    if (bar != null && bar.isOpen) {
      bar.close();
      return;
    }
    if (!closeTopPanel()) Desktop.hide();
  }

  /// Esc, once nothing closer has used it: closes the dialog or panel in front, or leaves full
  /// screen. False when it had nothing to do, so the key carries on to the rest of the app.
  static bool escape() {
    if (closeTopPanel()) return true;
    if (!fullScreen.value) return false;
    setFullScreen(false);
    return true;
  }

  /// Everything below the window's edge, wrapped: the title bar, the rail, the keys and the
  /// layout (app/app.dart's MaterialApp.builder).
  static Widget wrap(BuildContext context, Widget child) => _Frame(child: child);

  // ---------- the first launch offline ----------

  /// Once the app's up: if the stops couldn't load and none were kept (the very first launch,
  /// offline), "No connection" shows.
  static Future<void> checkFirstLaunch() async {
    if (Stops.ready) return;
    await Stops.load();
    if (!Stops.ready) noConnection.value = true;
  }

  /// Try again: loads the stops (and then the routes) once more, and the app shows once it can.
  static Future<void> tryAgain() async {
    if (retrying.value) return;
    retrying.value = true;
    try {
      await Stops.load();
      if (Stops.ready) {
        noConnection.value = false;
        Net.reached();
        unawaited(BusNet.load().catchError((_) {}));
      }
    } finally {
      retrying.value = false;
    }
  }
}

/// Watches the app's navigator for the title bar, and says which screen is in front of the
/// whole window.
class _Watcher extends RouteWatcher {
  /// The screen in front of the whole window (screenshot.dart's long screenshot scrolls it): a
  /// full-screen screen, else the detail pane's, else the shell.
  Route<dynamic>? get top => DeskChrome._activeRoute();
}

// ---------- the window's layout ----------

/// The chrome's root. It has an Overlay of its own, as it sits above the app's navigator (whose
/// overlay the screens use), so the bar's tooltips and the command bar's list have one too.
class _Frame extends StatefulWidget {
  const _Frame({required this.child});
  final Widget child;

  @override
  State<_Frame> createState() => _FrameState();
}

/// Holds the chrome's one overlay entry.
class _FrameState extends State<_Frame> {
  // One entry for the whole chrome, made once; it lives as long as the app.
  late final OverlayEntry _entry = OverlayEntry(builder: (_) => _Body(child: widget.child));

  /// The app's rebuilt (a new theme, say): the chrome is drawn again with it.
  @override
  void didUpdateWidget(covariant _Frame oldWidget) {
    super.didUpdateWidget(oldWidget);
    _entry.markNeedsBuild();
  }

  /// The chrome's own overlay, with the window's layout as its one entry.
  @override
  Widget build(BuildContext context) => Overlay(initialEntries: [_entry]);
}

/// The window's layout: the keys and menus, the title bar, the rail and the content, and full
/// screen hiding the first two.
class _Body extends StatelessWidget {
  const _Body({required this.child});
  final Widget child;

  /// Esc, once nothing closer has used it (the command bar has its own): closes the dialog or
  /// panel in front, or leaves full screen. Otherwise it carries on, so menus still close.
  KeyEventResult _keys(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent || event.logicalKey != LogicalKeyboardKey.escape) return KeyEventResult.ignored;
    return DeskChrome.escape() ? KeyEventResult.handled : KeyEventResult.ignored;
  }

  /// The menus and keys around everything, then the title bar over the rail and the content,
  /// laid out for the window's width; the window's own background follows the theme's.
  @override
  Widget build(BuildContext context) {
    final background = Theme.of(context).scaffoldBackgroundColor;
    WidgetsBinding.instance.addPostFrameCallback((_) => Desktop.paintBackground(background));
    return DeskMenus.wrap(
      // Focus lands back here (not above the shortcuts) when something lets it go.
      child: FocusScope(
        autofocus: true,
        child: Focus(
          onKeyEvent: _keys,
          // Every click notes whether it was in the detail pane (app/nav.dart's fromPane).
          child: Listener(
            behavior: HitTestBehavior.translucent,
            onPointerDown: (e) => AppNav.fromPane = AppNav.paneContains(e.position),
            child: ValueListenableBuilder<bool>(
              valueListenable: DeskChrome.fullScreen,
              builder: (context, full, _) => Column(children: [
                if (!full) const TitleBar(),
                Expanded(
                  child: LayoutBuilder(builder: (context, box) {
                    final layout = DeskPanes.layoutFor(box.maxWidth);
                    return Row(children: [
                      if (!full && layout != DeskLayout.phone) const DeskRail(),
                      Expanded(child: _Content(layout: layout, child: child)),
                    ]);
                  }),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// The area beside the rail and under the bar: the app's navigator, told its own size (so a page
/// lays itself out for the room it has, not the window's), with the layout handed down, and "No
/// connection" over it on a first launch offline.
class _Content extends StatelessWidget {
  const _Content({required this.layout, required this.child});
  final DeskLayout layout;
  final Widget child;

  /// The app's navigator in the room it has, with "No connection" over it while that shows. The
  /// navigator is inside screenshot.dart's picture (DeskShot.key); the chrome isn't.
  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return LayoutBuilder(
      builder: (context, box) => MediaQuery(
        // The bar's above, so the page needn't keep clear of the window's top edge.
        data: media.copyWith(size: box.biggest, padding: media.padding.copyWith(top: 0), viewPadding: media.viewPadding.copyWith(top: 0)),
        child: DeskLayoutScope(
          layout: layout,
          child: Stack(children: [
            Positioned.fill(child: RepaintBoundary(key: DeskShot.key, child: child)),
            Positioned.fill(
              child: ValueListenableBuilder<bool>(
                valueListenable: DeskChrome.noConnection,
                builder: (context, off, _) => off ? const _NoConnection() : const SizedBox.shrink(),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

// ---------- the first launch offline ----------

/// "No connection" with Try again, in place of the app on a first launch with no connection
/// (desktop-features-spec §15).
class _NoConnection extends StatelessWidget {
  const _NoConnection();

  /// The message in the middle of the content area, with Try again spinning while it tries.
  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final text = Theme.of(context).textTheme;
    return Material(
      color: sg.bg,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.cloud_off, size: 48, color: sg.muted),
              const SizedBox(height: 16),
              Text(tr('desktop.offline.title', 'No connection'), style: text.titleLarge?.copyWith(color: sg.ink), textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(
                tr('desktop.offline.body', '{app} needs the internet the first time it opens. Check your connection, then try again.', {'app': Desktop.name}),
                style: TextStyle(color: sg.muted, fontSize: 15),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              ValueListenableBuilder<bool>(
                valueListenable: DeskChrome.retrying,
                builder: (_, busy, _) => FilledButton(
                  onPressed: busy ? null : DeskChrome.tryAgain,
                  child: busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(tr('desktop.offline.retry', 'Try again')),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
