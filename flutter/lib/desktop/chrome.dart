// The desktop app's main window around the shared screens (desktop-features-spec §5,
// flutter-desktop-app-spec §2.3): its own title bar, a navigation rail, and the layout below.
//
// The title bar is 40 px tall, in the brand colour with light or dark writing to suit it,
// dragged to move the window and double-clicked to maximise it. Left to right: Back, Forward and
// Reload; the command bar in the middle, which shows the page's title and, clicked (or Ctrl+K,
// Ctrl+F, Ctrl+L, F6; ⌘ on a Mac), searches stops, buses and the app's commands, or opens a
// pasted link; Copy link, the two screenshots (screenshot.dart), the green Restart to update
// (updater.dart), and on Windows and Linux the window's own buttons (close keeps the app in the
// tray). macOS keeps its traffic lights over the bar's left. The bar's short messages ("Link
// copied") show over the command bar for 1.5 s.
//
// Below it, by the window's width (app/nav.dart's DeskPanes): under 720 px the phone's shell as it is, with the
// Edge Tray; from 720 px a navigation rail on the left takes the Edge Tray's place; above
// 1024 px the shell also splits into the page's list and a detail pane beside it, where a stop,
// a bus or a shared link opens (app/shell.dart, app/nav.dart). Full screen (F11, or a shared
// screen asking through the bridge's SgBus.setFullScreen, which host.dart routes to
// setFullScreen) hides the bar and the rail.
//
// History is the app's own (app/nav.dart's ViewHistory): Back closes the screen in front (a
// full-screen one first, then the detail pane's), or goes back a page; Forward opens again what
// Back left, if it was a page or a screen with its own site address. Reload runs the
// pull-to-refresh of the screen in front.
//
// The first launch with no connection, and no stops kept yet, shows "No connection" with Try
// again in place of the app (§15).
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';

import '../api/net.dart';
import '../app/edge_tray.dart';
import '../app/links.dart';
import '../app/nav.dart';
import '../app/pages.dart';
import '../data/favs.dart';
import '../data/network.dart';
import '../data/search.dart';
import '../data/stops.dart';
import '../data/store.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'desktop.dart';
import 'links.dart';
import 'menubar.dart';
import 'screenshot.dart';
import 'updater.dart';
import 'welcome.dart';
import 'widgets_window.dart';

/// One row in the command bar's list: a bus, a stop, an address or one of the app's commands.
class CommandHit {
  const CommandHit({required this.section, required this.icon, required this.title, this.subtitle = '', this.keys = '', required this.run});

  /// The heading it's listed under (Buses, Bus stops, Commands…).
  final String section;
  final IconData icon;
  final String title;
  final String subtitle;

  /// Its keyboard shortcut, shown at the row's end ("Ctrl+R"), if it has one.
  final String keys;

  /// What choosing it does.
  final VoidCallback run;
}

/// The main window's chrome: what the title bar shows, its history and actions, and the
/// window's own buttons and full screen. Everything is static: there is one main window.
class DeskChrome {
  DeskChrome._();

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

  static final _barKey = GlobalKey<_CommandBarState>();

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
      WidgetsBinding.instance.addPostFrameCallback((_) => _barKey.currentState?.open(withAddress: withAddress));
      return;
    }
    _barKey.currentState?.open(withAddress: withAddress);
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
    final bar = _barKey.currentState;
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

  // ---------- the command bar's reading and search ----------

  /// Opens an address from the command bar: in the app, in the browser, or in another UwU app.
  /// "Not found" if the app has no screen for it after all.
  static Future<void> openInput(CommandInput input) async {
    AppNav.fromPane = false;
    switch (input.kind) {
      case InputKind.inApp:
        if (!Links.open(input.text)) say(tr('desktop.bar.notFound', 'Not found'));
      case InputKind.browser:
        await Desktop.openExternal(input.text);
        say(tr('desktop.bar.inBrowser', 'Opened in your browser'));
      case InputKind.otherApp:
        if (!DeskLinks.passOn(input.text)) say(tr('desktop.bar.notFound', 'Not found'));
      case InputKind.empty || InputKind.search:
        say(tr('desktop.bar.notFound', 'Not found'));
    }
  }

  /// The command bar's list for what's typed: an address to open; or the buses and stops it
  /// matches (the same search as Bus timings, data/search.dart), then the commands whose names
  /// contain it. With nothing typed, every command.
  static List<CommandHit> search(String typed) {
    final input = Links.read(typed);
    if (input.kind == InputKind.inApp || input.kind == InputKind.browser || input.kind == InputKind.otherApp) return [_addressHit(input)];
    final q = input.text;
    return [..._busHits(q), ..._stopHits(q), ..._commandHits(q)];
  }

  /// The one row for a pasted address.
  static CommandHit _addressHit(CommandInput input) {
    final browser = input.kind == InputKind.browser;
    return CommandHit(
      section: tr('desktop.bar.open', 'Open'),
      icon: browser ? Icons.open_in_new : Icons.link,
      title: Desktop.displayAddress(input.text),
      subtitle: browser ? tr('desktop.bar.opensInBrowser', 'Opens in your browser') : tr('desktop.bar.opensInApp', 'Opens in the app'),
      run: () => openInput(input),
    );
  }

  /// Buses whose number starts with what's typed, once the routes are in.
  static List<CommandHit> _busHits(String q) {
    if (q.isEmpty || !BusNet.ready) return const [];
    return [
      for (final no in BusNet.matchServices(q, 4))
        CommandHit(
          section: tr('desktop.bar.buses', 'Buses'),
          icon: Icons.directions_bus_outlined,
          title: tr('desktop.title.bus', 'Bus {no}', {'no': no}),
          subtitle: BusNet.endsText(no),
          run: () => AppNav.open('bus', {'no': no}),
        ),
    ];
  }

  /// Stops the words match, as Bus timings' search finds them, once the stops are in.
  static List<CommandHit> _stopHits(String q) {
    if (q.length < 2 || !Stops.ready) return const [];
    return [
      for (final hit in StopSearch.match(q, limit: 6).stops)
        CommandHit(
          section: tr('desktop.bar.stops', 'Bus stops'),
          icon: Icons.signpost_outlined,
          title: hit.stop.name,
          subtitle: hit.stop.road.isEmpty ? hit.stop.code : '${hit.stop.code} · ${hit.stop.road}',
          run: () => AppNav.open('stop', {'code': hit.stop.code}),
        ),
    ];
  }

  /// The app's commands whose names contain what's typed (all of them with nothing typed;
  /// the first eight otherwise).
  static List<CommandHit> _commandHits(String q) {
    final words = q.toLowerCase();
    final all = _commands();
    if (words.isEmpty) return all;
    return all.where((c) => c.title.toLowerCase().contains(words)).take(8).toList();
  }

  /// Every command the bar offers: the pages, Settings, Theme, the bar's own buttons, and the
  /// tray's extras.
  static List<CommandHit> _commands() {
    final section = tr('desktop.bar.commands', 'Commands');
    // One command, under the Commands heading.
    CommandHit command(IconData icon, String title, VoidCallback run, {String keys = ''}) => CommandHit(section: section, icon: icon, title: title, keys: keys, run: run);
    final ready = Updater.ready.value;
    return [
      for (final p in Pages.tabs()) command(p.icon, p.label(), () => AppNav.showPage(p.id)),
      command(Icons.settings_outlined, tr('settings.settings', 'Settings'), () => AppNav.open('settings'), keys: DeskMenus.keys(','),),
      command(Icons.palette_outlined, tr('theme.title', 'Theme'), () => AppNav.open('theme')),
      if (!Net.off.value) command(Icons.explore_outlined, tr('tray.explorer', 'Explorer'), () => AppNav.open('explorer')),
      if (!Net.off.value) command(Icons.near_me_outlined, tr('desktop.cmd.near', 'Bus stops near me'), () => AppNav.open('near')),
      command(Icons.refresh, tr('desktop.cmd.reload', 'Reload'), reload, keys: DeskMenus.keys('R')),
      command(Icons.link, tr('desktop.cmd.copyLink', 'Copy link'), copyLink, keys: DeskMenus.keys('C', shift: true)),
      command(Icons.photo_camera_outlined, tr('desktop.cmd.shot', 'Take a screenshot'), () => DeskShot.take(long: false)),
      command(Icons.height, tr('desktop.cmd.longShot', 'Take a long screenshot'), () => DeskShot.take(long: true)),
      command(Icons.fullscreen, tr('desktop.cmd.fullScreen', 'Full screen'), toggleFullScreen, keys: Desktop.mac ? '⌃⌘F' : 'F11'),
      command(Icons.widgets_outlined, tr('desktop.tray.addWidget', 'Add a Bus timings widget'), DeskWidgets.add),
      command(Icons.auto_awesome_outlined, tr('desktop.tray.makeItYours', 'Make it yours…'), () => Welcome.open()),
      if (ready != null) command(Icons.download, tr('desktop.tray.restart', 'Restart to update to {v}', {'v': ready}), Updater.restartToUpdate),
      if (ready == null) command(Icons.system_update_alt, tr('desktop.tray.check', 'Check for updates…'), Updater.checkNow),
    ];
  }
}

/// Watches the app's navigator for the title bar, and says which screen is in front of the
/// whole window.
class _Watcher extends RouteWatcher {
  /// The screen in front of the whole window (screenshot.dart's long screenshot scrolls it): a
  /// full-screen screen, else the detail pane's, else the shell.
  Route<dynamic>? get top => DeskChrome._activeRoute();
}

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
                      if (!full && layout != DeskLayout.phone) const _Rail(),
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

// ---------- the title bar ----------

/// The window's own title bar (desktop-features-spec §5's table, left to right).
class TitleBar extends StatelessWidget {
  const TitleBar({super.key, this.preview = false});

  /// For the guide's screenshots: drawn as on Windows, without a window.
  final bool preview;

  @override
  Widget build(BuildContext context) {
    final ink = BarColours.of(context.sg);
    final mac = Desktop.mac && !preview;
    return Material(
      color: ink.background,
      child: SizedBox(
        height: DeskChrome.barHeight,
        child: Stack(children: [
          // Under the buttons, so they answer a click at once: everywhere else drags the
          // window, and a double-click maximises it (or as the Mac is set to).
          if (!preview) Positioned.fill(child: DragToMoveArea(window: Desktop.window, child: const SizedBox.expand())),
          ValueListenableBuilder<bool>(
            valueListenable: DeskChrome.fullScreen,
            builder: (context, full, _) => Padding(
              padding: EdgeInsets.only(left: mac && !full ? DeskChrome.macInset : 6, right: mac ? 8 : 0),
              child: Row(children: [
                _BarButton(ink: ink, icon: Icons.arrow_back, tip: tr('desktop.bar.back', 'Back ({keys})', {'keys': Desktop.mac ? '⌘[' : 'Alt+Left'}), onTap: DeskChrome.back, enabled: DeskChrome.canBack),
                _BarButton(ink: ink, icon: Icons.arrow_forward, tip: tr('desktop.bar.forward', 'Forward ({keys})', {'keys': Desktop.mac ? '⌘]' : 'Alt+Right'}), onTap: DeskChrome.forward, enabled: DeskChrome.canForward),
                _ReloadButton(ink: ink),
                const SizedBox(width: 8),
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 560),
                      child: _CommandBar(key: preview ? null : DeskChrome._barKey, ink: ink),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _BarButton(ink: ink, icon: Icons.link, tip: tr('desktop.bar.copyLink', 'Copy link ({keys})', {'keys': DeskMenus.keys('C', shift: true)}), onTap: DeskChrome.copyLink),
                _ShotButtons(ink: ink),
                _UpdateButton(),
                if (!mac) _WindowButtons(ink: ink, full: full),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

/// One of the bar's small buttons: an icon (or [child]) with a tooltip, dimmed while it can't
/// be used ([enabled] false, or [on] false).
class _BarButton extends StatelessWidget {
  const _BarButton({required this.ink, required this.icon, required this.tip, required this.onTap, this.enabled, this.on = true, this.child});
  final BarColours ink;
  final IconData icon;
  final String tip;
  final VoidCallback onTap;
  final ValueListenable<bool>? enabled;
  final bool on;
  final Widget? child;

  /// The button itself, usable or dimmed.
  Widget _button(bool usable) => Tooltip(
        message: tip,
        child: Semantics(
          button: true,
          enabled: usable,
          label: tip,
          child: SizedBox(
            width: 30,
            height: 28,
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                borderRadius: BorderRadius.circular(6),
                hoverColor: ink.hover,
                onTap: usable ? onTap : null,
                child: Opacity(opacity: usable ? 1 : .35, child: child ?? Icon(icon, size: 18, color: ink.fg)),
              ),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final e = enabled;
    if (e == null) return _button(on);
    return ValueListenableBuilder<bool>(valueListenable: e, builder: (_, usable, _) => _button(usable && on));
  }
}

/// Reload, which spins while the screen refreshes.
class _ReloadButton extends StatelessWidget {
  const _ReloadButton({required this.ink});
  final BarColours ink;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
        valueListenable: DeskChrome.loading,
        builder: (_, busy, _) => _BarButton(
          ink: ink,
          icon: Icons.refresh,
          tip: tr('desktop.bar.reload', 'Reload ({keys})', {'keys': Desktop.mac ? '⌘R' : 'F5'}),
          onTap: DeskChrome.reload,
          child: busy ? Padding(padding: const EdgeInsets.all(6), child: CircularProgressIndicator(strokeWidth: 2, color: ink.fg)) : null,
        ),
      );
}

/// Screenshot and Long screenshot, dimmed while one's being taken.
class _ShotButtons extends StatelessWidget {
  const _ShotButtons({required this.ink});
  final BarColours ink;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
        valueListenable: DeskShot.busy,
        builder: (_, busy, _) => Row(mainAxisSize: MainAxisSize.min, children: [
          _BarButton(ink: ink, icon: Icons.photo_camera_outlined, tip: tr('desktop.bar.shot', 'Screenshot: copies it, and saves it in Downloads'), onTap: () => DeskShot.take(long: false), on: !busy),
          _BarButton(
              ink: ink,
              icon: Icons.height,
              tip: tr('desktop.bar.longShot', 'Long screenshot: the whole page, top to bottom; copies it, and saves it in Downloads'),
              onTap: () => DeskShot.take(long: true),
              on: !busy),
        ]),
      );
}

/// The green Restart to update, only while an update's downloaded (updater.dart).
class _UpdateButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<String?>(
        valueListenable: Updater.ready,
        builder: (_, version, _) {
          if (version == null) return const SizedBox.shrink();
          final tip = tr('desktop.tray.restart', 'Restart to update to {v}', {'v': version});
          return Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Tooltip(
              message: tip,
              child: Semantics(
                button: true,
                label: tip,
                child: Material(
                  color: const Color(0xFF1E9E46),
                  borderRadius: BorderRadius.circular(6),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(6),
                    hoverColor: const Color(0xFF18843A),
                    onTap: Updater.restartToUpdate,
                    child: const SizedBox(width: 30, height: 28, child: Icon(Icons.download, size: 18, color: Colors.white)),
                  ),
                ),
              ),
            ),
          );
        },
      );
}

/// Minimise, Maximise (or Restore) and Close, drawn as Windows draws its own (Windows and
/// Linux). Gone in full screen.
class _WindowButtons extends StatelessWidget {
  const _WindowButtons({required this.ink, required this.full});
  final BarColours ink;
  final bool full;

  @override
  Widget build(BuildContext context) {
    if (full) return const SizedBox.shrink();
    return Row(mainAxisSize: MainAxisSize.min, children: [
      const SizedBox(width: 8),
      _WindowButton(glyph: _Glyph.minimize, tip: tr('desktop.bar.minimise', 'Minimise'), fg: ink.fg, hover: ink.hover, onTap: DeskChrome.minimize),
      ValueListenableBuilder<bool>(
        valueListenable: DeskChrome.maximized,
        builder: (_, max, _) => _WindowButton(
          glyph: max ? _Glyph.restore : _Glyph.maximize,
          tip: max ? tr('desktop.bar.restore', 'Restore') : tr('desktop.bar.maximise', 'Maximise'),
          fg: ink.fg,
          hover: ink.hover,
          onTap: DeskChrome.maximizeOrRestore,
        ),
      ),
      _WindowButton(
          glyph: _Glyph.close, tip: tr('desktop.bar.close', 'Close (keeps running in the tray)'), fg: ink.fg, hover: const Color(0xFFC42B1C), hoverFg: Colors.white, onTap: DeskChrome.close),
    ]);
  }
}

// ---------- the command bar ----------

/// The command bar in the middle of the title bar. At rest it shows the page's title (or the
/// bar's message); open, it's a search box with its list below: buses, stops and commands, or
/// the address pasted into it.
class _CommandBar extends StatefulWidget {
  const _CommandBar({super.key, required this.ink});
  final BarColours ink;

  @override
  State<_CommandBar> createState() => _CommandBarState();
}

/// The command bar's state: open or at rest, what's typed, its list and the row picked.
class _CommandBarState extends State<_CommandBar> {
  final _text = TextEditingController();
  final _focus = FocusNode(debugLabel: 'command bar');
  final _portal = OverlayPortalController();
  final _link = LayerLink();
  final _scroll = ScrollController();

  /// Clicks in the list count as inside the box, so it keeps its focus.
  final _group = Object();
  bool _open = false;
  List<CommandHit> _hits = const [];
  int _selected = 0;
  double _width = 480;

  /// Where focus was before the bar opened, given back when Esc closes it.
  FocusNode? _before;

  @override
  void initState() {
    super.initState();
    _focus.addListener(_focusChanged);
  }

  @override
  void dispose() {
    _focus.dispose();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Whether the box and its list are open.
  bool get isOpen => _open;

  /// Opens the box, empty (or with the address in it, selected), and its list. Already open,
  /// Ctrl+K keeps what's typed and just takes the focus back; Ctrl+L puts the address in.
  void open({bool withAddress = false}) {
    if (_open && !withAddress) {
      _focus.requestFocus();
      return;
    }
    if (!_open) _before = FocusManager.instance.primaryFocus;
    setState(() => _open = true);
    _text.text = withAddress ? DeskChrome.address.value : '';
    _text.selection = TextSelection(baseOffset: 0, extentOffset: _text.text.length);
    _search(_text.text);
    _portal.show();
    _focus.requestFocus();
  }

  /// Closes the box and its list. With [restore], focus goes back where it was (Esc, or after
  /// choosing something); a click elsewhere keeps the focus it took.
  void close({bool restore = true}) {
    if (!_open) return;
    _portal.hide();
    setState(() => _open = false);
    _text.clear();
    if (!restore) return;
    final before = _before;
    if (before != null && before.context != null && before.canRequestFocus) {
      before.requestFocus();
    } else {
      _focus.unfocus();
    }
  }

  /// The box lost its focus (a click elsewhere): it closes.
  void _focusChanged() {
    if (!_focus.hasFocus && _open) close(restore: false);
  }

  /// Fills the list for what's typed, the first row picked.
  void _search(String typed) {
    setState(() {
      _hits = DeskChrome.search(typed);
      _selected = 0;
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  /// Up and Down move through the list, kept in view.
  void _move(int by) {
    if (_hits.isEmpty) return;
    setState(() => _selected = (_selected + by) % _hits.length);
    _keepInView();
  }

  /// Scrolls the list so the picked row shows.
  void _keepInView() {
    if (!_scroll.hasClients) return;
    final (top, bottom) = _Results.rowSpan(_hits, _selected);
    final view = _scroll.position;
    if (top < view.pixels) {
      _scroll.jumpTo(top);
    } else if (bottom > view.pixels + view.viewportDimension) {
      _scroll.jumpTo(math.min(bottom - view.viewportDimension, view.maxScrollExtent));
    }
  }

  /// Enter: an address opens; otherwise the picked row runs; with nothing found, "Not found".
  void _submit(String typed) {
    final input = Links.read(typed);
    if (input.kind == InputKind.inApp || input.kind == InputKind.browser || input.kind == InputKind.otherApp) {
      close();
      DeskChrome.openInput(input);
      return;
    }
    if (_hits.isEmpty) {
      DeskChrome.say(tr('desktop.bar.notFound', 'Not found'));
      return;
    }
    _run(_hits[_selected]);
  }

  /// Runs a row: the bar closes first, so the screen it opens keeps the focus.
  void _run(CommandHit hit) {
    close();
    AppNav.fromPane = false;
    hit.run();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        _width = box.maxWidth;
        return CompositedTransformTarget(
          link: _link,
          child: OverlayPortal(
            controller: _portal,
            overlayChildBuilder: _list,
            child: _open ? _field() : _rest(),
          ),
        );
      });

  /// At rest: the title (or a message), with the shortcut's hint.
  Widget _rest() {
    final ink = widget.ink;
    final hint = tr('desktop.bar.search', 'Search stops, buses and commands');
    return Semantics(
      button: true,
      label: hint,
      child: MouseRegion(
        cursor: SystemMouseCursors.text,
        child: GestureDetector(
          onTap: open,
          child: Tooltip(
            message: '$hint (${DeskMenus.keys('K')})',
            waitDuration: const Duration(seconds: 1),
            child: Container(
              height: 28,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(color: ink.field, borderRadius: BorderRadius.circular(14)),
              child: ListenableBuilder(
                listenable: Listenable.merge([DeskChrome.title, DeskChrome.message]),
                builder: (context, _) {
                  final said = DeskChrome.message.value;
                  return Row(children: [
                    Icon(Icons.search, size: 15, color: ink.fg.withValues(alpha: .75)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        said ?? DeskChrome.title.value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: ink.fg, fontSize: 13, fontWeight: said == null ? FontWeight.w500 : FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(DeskMenus.keys('K'), style: TextStyle(color: ink.fg, fontSize: 11)),
                  ]);
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Open: the search box, with Up, Down and Esc of its own, and a message at its end while one
  /// shows.
  Widget _field() {
    final ink = widget.ink;
    final style = TextStyle(color: ink.fg, fontSize: 13);
    return Container(
      height: 28,
      padding: const EdgeInsets.only(left: 10, right: 8),
      decoration: BoxDecoration(color: ink.field, borderRadius: BorderRadius.circular(14), border: Border.all(color: ink.fg, width: 1.5)),
      child: Row(children: [
        Icon(Icons.search, size: 15, color: ink.fg.withValues(alpha: .75)),
        const SizedBox(width: 6),
        Expanded(
          child: CallbackShortcuts(
            bindings: {
              const SingleActivator(LogicalKeyboardKey.arrowDown): () => _move(1),
              const SingleActivator(LogicalKeyboardKey.arrowUp): () => _move(-1),
              const SingleActivator(LogicalKeyboardKey.escape): close,
            },
            child: TextField(
              controller: _text,
              focusNode: _focus,
              groupId: _group,
              style: style,
              cursorColor: ink.fg,
              maxLines: 1,
              textInputAction: TextInputAction.go,
              decoration: InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
                filled: false,
                contentPadding: const EdgeInsets.symmetric(vertical: 6),
                hintText: tr('desktop.bar.hint', 'Search stops, buses and commands, or paste a link'),
                // Full strength, as the bar's colour may leave little room; it goes as you type.
                hintStyle: style,
              ),
              onChanged: _search,
              onSubmitted: _submit,
              // Enter mustn't take the focus away: "Not found" keeps the box open.
              onEditingComplete: () {},
            ),
          ),
        ),
        ValueListenableBuilder<String?>(
          valueListenable: DeskChrome.message,
          builder: (_, said, _) => said == null ? const SizedBox.shrink() : Text(said, style: style.copyWith(fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }

  /// The list under the open box, in the chrome's overlay, at least 460 px wide.
  Widget _list(BuildContext context) {
    final width = math.min(math.max(_width, 460.0), MediaQuery.sizeOf(context).width - 32);
    return Stack(children: [
      CompositedTransformFollower(
        link: _link,
        showWhenUnlinked: false,
        targetAnchor: Alignment.bottomCenter,
        followerAnchor: Alignment.topCenter,
        offset: const Offset(0, 6),
        child: TapRegion(
          groupId: _group,
          child: SizedBox(
            width: width,
            child: _Results(
              hits: _hits,
              selected: _selected,
              scroll: _scroll,
              onHover: (i) => setState(() => _selected = i),
              onPick: (i) => _run(_hits[i]),
            ),
          ),
        ),
      ),
    ]);
  }
}

/// The command bar's list: rows under their headings, the picked one highlighted.
class _Results extends StatelessWidget {
  const _Results({required this.hits, required this.selected, required this.scroll, required this.onHover, required this.onPick});
  final List<CommandHit> hits;
  final int selected;
  final ScrollController scroll;
  final void Function(int) onHover;
  final void Function(int) onPick;

  static const headingHeight = 28.0;
  static const rowHeight = 44.0;

  /// Where row [index] starts and ends down the list, for keeping it in view (each new section
  /// has a heading above its first row).
  static (double, double) rowSpan(List<CommandHit> hits, int index) {
    var y = 6.0; // the list's top padding
    for (var i = 0; i <= index && i < hits.length; i++) {
      if (i == 0 || hits[i].section != hits[i - 1].section) y += headingHeight;
      if (i < index) y += rowHeight;
    }
    return (y, y + rowHeight);
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final scheme = Theme.of(context).colorScheme;
    final rows = <Widget>[];
    for (var i = 0; i < hits.length; i++) {
      final hit = hits[i];
      if (i == 0 || hit.section != hits[i - 1].section) {
        rows.add(SizedBox(
          height: headingHeight,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: Text(hit.section, style: TextStyle(color: sg.muted, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: .4)),
          ),
        ));
      }
      rows.add(_HitRow(hit: hit, picked: i == selected, onHover: () => onHover(i), onTap: () => onPick(i)));
    }
    return Material(
      elevation: 10,
      shadowColor: Colors.black45,
      color: Color.alphaBlend(sg.surfaceStrong, sg.bg),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: scheme.outlineVariant)),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 440),
        child: hits.isEmpty
            ? Padding(
                padding: const EdgeInsets.all(16),
                child: Text(tr('desktop.bar.nothing', 'Nothing matches. Try a stop’s name or code, or a bus number.'), style: TextStyle(color: sg.muted)),
              )
            : ListView(controller: scroll, shrinkWrap: true, padding: const EdgeInsets.symmetric(vertical: 6), children: rows),
      ),
    );
  }
}

/// One row of the command bar's list: an icon, a title and a line under it, and a shortcut.
class _HitRow extends StatelessWidget {
  const _HitRow({required this.hit, required this.picked, required this.onHover, required this.onTap});
  final CommandHit hit;
  final bool picked;
  final VoidCallback onHover;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final scheme = Theme.of(context).colorScheme;
    return MouseRegion(
      onEnter: (_) => onHover(),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: _Results.rowHeight,
          margin: const EdgeInsets.symmetric(horizontal: 6),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(color: picked ? scheme.secondaryContainer : Colors.transparent, borderRadius: BorderRadius.circular(8)),
          child: Row(children: [
            Icon(hit.icon, size: 18, color: picked ? scheme.onSecondaryContainer : sg.muted),
            const SizedBox(width: 10),
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(hit.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: picked ? scheme.onSecondaryContainer : sg.ink, fontSize: 14)),
                if (hit.subtitle.isNotEmpty)
                  Text(hit.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: picked ? scheme.onSecondaryContainer : sg.muted, fontSize: 12)),
              ]),
            ),
            if (hit.keys.isNotEmpty) Text(hit.keys, style: TextStyle(color: sg.muted, fontSize: 12)),
          ]),
        ),
      ),
    );
  }
}

// ---------- the navigation rail ----------

/// The navigation rail down the window's left, from 720 px wide, in place of the Edge Tray
/// (app/edge_tray.dart): the pages first, the one on show picked, then the Edge Tray's extras
/// that are on, Settings and Theme.
class _Rail extends StatefulWidget {
  const _Rail();

  @override
  State<_Rail> createState() => _RailState();
}

/// Redraws the rail when the page, the pages on offer or the language change.
class _RailState extends State<_Rail> {
  StreamSubscription<String>? _changes;

  @override
  void initState() {
    super.initState();
    AppNav.page.addListener(_redraw);
    Net.off.addListener(_redraw);
    I18n.I.addListener(_redraw);
    // The pages turned on or off, the home page, the extras shown, or the favourites' count.
    _changes = Store.I.changes.listen((k) {
      if (k.startsWith('sgbus_tray') || k.startsWith('sgbus_fav') || k == Pages.offKey || k == Pages.glanceOffKey || k == Pages.homeKey) _redraw();
    });
  }

  @override
  void dispose() {
    AppNav.page.removeListener(_redraw);
    Net.off.removeListener(_redraw);
    I18n.I.removeListener(_redraw);
    _changes?.cancel();
    super.dispose();
  }

  /// Something the rail shows changed.
  void _redraw() {
    if (mounted) setState(() {});
  }

  /// A page picked in the rail: shown, and the detail pane cleared, as the Edge Tray does.
  void _pick(String id) {
    AppNav.fromPane = false;
    AppNav.showPage(id);
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final tabs = Pages.tabs();
    final hidden = EdgeTray.hidden();
    final extras = EdgeTray.extras.where((e) => !hidden.contains(e.id) && (e.when?.call() ?? true)).toList();
    final picked = tabs.indexWhere((p) => p.id == AppNav.page.value);
    final favs = Favs.I.stops().length;
    final background = Color.alphaBlend(sg.surface, sg.bg);
    final rail = NavigationRail(
      backgroundColor: background,
      selectedIndex: picked < 0 ? null : picked,
      labelType: NavigationRailLabelType.all,
      minWidth: 84,
      groupAlignment: -1,
      // The pages and the extras scroll together if the window is too short for them all.
      scrollable: true,
      onDestinationSelected: (i) => _pick(tabs[i].id),
      destinations: [
        for (final p in tabs)
          NavigationRailDestination(
            icon: p.id == 'favs' && favs > 0 ? Badge(label: Text('$favs'), child: Icon(p.icon)) : Icon(p.icon),
            label: Text(p.label(), textAlign: TextAlign.center, maxLines: 2),
          ),
      ],
      trailing: Column(children: [
        if (extras.isNotEmpty) _railRule(sg),
        for (final e in extras) _RailButton(icon: e.icon, face: e.face, label: e.label(), badge: e.badge?.call(), onTap: e.open),
        _railRule(sg),
        _RailButton(icon: Icons.settings_outlined, label: tr('settings.settings', 'Settings'), onTap: () => AppNav.open('settings')),
        _RailButton(icon: Icons.palette_outlined, label: tr('theme.title', 'Theme'), onTap: () => AppNav.open('theme')),
        const SizedBox(height: 8),
      ]),
    );
    return DecoratedBox(
      decoration: BoxDecoration(color: background, border: Border(right: BorderSide(color: sg.border))),
      child: rail,
    );
  }

  /// A short line between the rail's groups.
  Widget _railRule(SgColors sg) => Container(width: 32, height: 1, margin: const EdgeInsets.symmetric(vertical: 8), color: sg.border);
}

/// One of the rail's extras (or Settings, Theme): a round icon button with its name as a tooltip.
class _RailButton extends StatelessWidget {
  const _RailButton({required this.icon, required this.label, required this.onTap, this.face, this.badge});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// A picture of its own in place of the icon (SimplyGo's logo, the uwuCoin).
  final Widget Function(double size)? face;

  /// A number on its corner (the uwuCoins balance).
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final picture = face?.call(32) ?? Icon(icon, size: 20, color: sg.ink);
    final b = badge;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: IconButton(
        tooltip: label,
        onPressed: () {
          AppNav.fromPane = false;
          onTap();
        },
        icon: b == null ? picture : Badge(label: Text(b), child: picture),
      ),
    );
  }
}

// ---------- the first launch offline ----------

/// "No connection" with Try again, in place of the app on a first launch with no connection
/// (desktop-features-spec §15).
class _NoConnection extends StatelessWidget {
  const _NoConnection();

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

// ---------- the window's buttons ----------

/// Which of Windows' caption glyphs a window button draws.
enum _Glyph { minimize, maximize, restore, close }

/// A window button: 46 px wide and the bar's full height, as Windows draws its own; close turns
/// red under the pointer.
class _WindowButton extends StatefulWidget {
  const _WindowButton({required this.glyph, required this.tip, required this.fg, required this.hover, required this.onTap, this.hoverFg});
  final _Glyph glyph;
  final String tip;
  final Color fg, hover;
  final Color? hoverFg;
  final VoidCallback onTap;

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

/// Whether the pointer is over the button.
class _WindowButtonState extends State<_WindowButton> {
  bool _over = false;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: widget.tip,
        child: Semantics(
          button: true,
          label: widget.tip,
          child: MouseRegion(
            onEnter: (_) => setState(() => _over = true),
            onExit: (_) => setState(() => _over = false),
            child: GestureDetector(
              onTap: widget.onTap,
              child: Container(
                width: 46,
                height: DeskChrome.barHeight,
                color: _over ? widget.hover : Colors.transparent,
                child: CustomPaint(painter: _GlyphPainter(widget.glyph, _over && widget.hoverFg != null ? widget.hoverFg! : widget.fg)),
              ),
            ),
          ),
        ),
      );
}

/// Windows' own caption glyphs, 10 px, drawn crisp.
class _GlyphPainter extends CustomPainter {
  _GlyphPainter(this.glyph, this.color);
  final _Glyph glyph;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke
      ..isAntiAlias = glyph == _Glyph.close;
    canvas.translate((size.width - 10) / 2, (size.height - 10) / 2);
    switch (glyph) {
      case _Glyph.minimize:
        canvas.drawLine(const Offset(0, 5.5), const Offset(10, 5.5), p);
      case _Glyph.maximize:
        canvas.drawRect(const Rect.fromLTWH(.5, .5, 9, 9), p);
      case _Glyph.restore:
        canvas.drawRect(const Rect.fromLTWH(.5, 2.5, 7, 7), p);
        canvas.drawPath(
            Path()
              ..moveTo(2.5, 2.5)
              ..lineTo(2.5, .5)
              ..lineTo(9.5, .5)
              ..lineTo(9.5, 7.5)
              ..lineTo(7.5, 7.5),
            p);
      case _Glyph.close:
        canvas.drawLine(Offset.zero, const Offset(10, 10), p);
        canvas.drawLine(const Offset(10, 0), const Offset(0, 10), p);
    }
  }

  @override
  bool shouldRepaint(_GlyphPainter old) => old.glyph != glyph || old.color != color;
}
