// The main screen: the page on show (Glance, Bus timings, Favourites, Navigate, Service alerts,
// Your trips or Places), the Edge Tray beside it, and Back: through what's open, then the page
// back to home, and with nothing left, "Press back again to exit" (2.2.7's, backtwice): a second
// press within two seconds sends the app to the background, so a trip carries on.
//
// In the desktop app, from 720 px wide, the navigation rail (desktop/rail.dart) takes the Edge
// Tray's place, and the page shares the room with a detail pane, a navigator of its own where a
// stop, a bus or a shared link opens (app/nav.dart's push and DeskPanes): above 1024 px the page's list sits in
// a 360-400 px pane on the left with the detail beside it; from 720 to 1024 px the detail covers
// the list while it's open. Under 720 px, and always on Android, the shell is the phone's; a
// window narrowed to it keeps what the detail pane had open, moved over the whole window (once
// any full-screen screen open over the shell, such as Settings, is closed).
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../api/net.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import '../theme/theme.dart';
import 'edge_tray.dart';
import 'nav.dart';
import 'pages.dart';

/// The main screen, around the page on show.
class Shell extends StatefulWidget {
  const Shell({super.key, required this.pages});
  final Map<String, Widget Function()> pages;

  /// What runs along the top of every page: the disruptions bar (features/alerts/) and the trip
  /// bar (features/trips/).
  static final List<Widget Function()> top = [];

  @override
  State<Shell> createState() => _ShellState();
}

/// The page on show, the pages built so far, and Android's Back.
class _ShellState extends State<Shell> {
  DateTime? _backAt;
  static const _exitMs = 2000;
  final Map<String, Widget> _built = {};

  /// Keeps the pages' place (scroll, what's typed) as the desktop's layout changes around them.
  final _pagesKey = GlobalKey();

  /// The desktop's layout when the shell was last drawn; null before the first time.
  DeskLayout? _layout;

  /// The detail pane's screens, waiting to move over the whole window: the window narrowed to
  /// the phone layout while a full-screen screen (Settings, the map) was open, so they wait
  /// under it, and the person stays on what they were looking at.
  List<PaneRoute<dynamic>> _waiting = const [];

  /// The app's navigator's watcher (desktop/chrome.dart's), followed while screens wait.
  RouteWatcher? _watching;

  /// Opens on the home page, and starts following the page picked and the connection.
  @override
  void initState() {
    super.initState();
    AppNav.page.value = Pages.home();
    AppNav.page.addListener(_changed);
    Net.off.addListener(_net);
  }

  /// Offline, a page that needs the network gives way to one that doesn't; back online, the
  /// tray has them all again.
  void _net() {
    if (!Pages.shows(AppNav.page.value)) AppNav.page.value = Pages.home();
    setState(() {});
  }

  /// Stops following the page, the connection and the app's screens as the shell goes.
  @override
  void dispose() {
    AppNav.page.removeListener(_changed);
    Net.off.removeListener(_net);
    _stopWaiting();
    super.dispose();
  }

  /// The page changed: the shell shows it.
  void _changed() => setState(() {});

  /// The desktop's layout changed (the window crossed 720 or 1024 px): narrowed to the phone's,
  /// or widened from it.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final layout = DeskPanes.layoutOf(context);
    final before = _layout;
    _layout = layout;
    if (before == null || before == layout) return;
    if (layout == DeskLayout.phone && before != DeskLayout.phone) _narrowed();
    if (before == DeskLayout.phone && layout != DeskLayout.phone) _widened();
  }

  /// Narrowed to the phone layout: the panes go. The screens the detail pane had open are taken
  /// now, while it still has them, and open over the whole window once this frame is drawn and
  /// the pane is gone (DeskPanes.fold); or, with a full-screen screen open over the shell, once
  /// that's closed.
  void _narrowed() {
    final screens = DeskPanes.screens();
    if (screens.isEmpty) return;
    final watcher = AppNav.rootWatcher;
    if (watcher != null && watcher.depth > 1) {
      _stopWaiting();
      _waiting = screens;
      _watching = watcher..addListener(_rootChanged);
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) DeskPanes.fold(screens);
    });
  }

  /// Widened from the phone layout with screens still waiting: they go back into the new detail
  /// pane, as they were, once this frame has built it (DeskPanes.unfold).
  void _widened() {
    final screens = _stopWaiting();
    if (screens.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) DeskPanes.unfold(screens);
    });
  }

  /// The app's screens changed while the pane's wait: once nothing full-screen is left over the
  /// shell, they move over the whole window.
  void _rootChanged() {
    if ((_watching?.depth ?? 0) > 1) return;
    final screens = _stopWaiting();
    if (mounted) DeskPanes.fold(screens);
  }

  /// Stops waiting and following the app's screens, and hands back what was waiting.
  List<PaneRoute<dynamic>> _stopWaiting() {
    _watching?.removeListener(_rootChanged);
    _watching = null;
    final screens = _waiting;
    _waiting = const [];
    return screens;
  }

  /// Android's Back, with nothing open over the shell: home first, then "Press back again to
  /// exit".
  void _back() {
    final home = Pages.home();
    if (AppNav.page.value != home) {
      AppNav.page.value = home;
      return;
    }
    final now = DateTime.now();
    if (_backAt != null && now.difference(_backAt!).inMilliseconds < _exitMs) {
      _backAt = null;
      AppNav.messengerKey.currentState?.hideCurrentSnackBar();
      if (Native.available) {
        Native.call('SgBus', 'background').catchError((_) => null);
      } else {
        SystemNavigator.pop();
      }
      return;
    }
    _backAt = now;
    AppNav.say(tr('app.exitHint', 'Press back again to exit'));
  }

  /// The offline bar and the top bars, then the page on show: beside the Edge Tray on a phone (and
  /// a desktop window under 720 px), or in the desktop's panes. Back with nothing open over the
  /// shell goes to [_back].
  @override
  Widget build(BuildContext context) {
    final id = AppNav.page.value;
    // Each page kept once built, so a page switched away from and back keeps its place.
    final page = _built[id] ??= (widget.pages[id] ?? widget.pages['timings']!)();
    final pages = KeyedSubtree(
      key: _pagesKey,
      child: IndexedStack(
        index: _built.keys.toList().indexOf(id),
        children: [for (final k in _built.keys) KeyedSubtree(key: ValueKey(k), child: k == id ? page : _built[k]!)],
      ),
    );
    final layout = DeskPanes.layoutOf(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        body: Column(children: [
          const OfflineBar(),
          for (final t in Shell.top) t(),
          Expanded(
            child: layout == DeskLayout.phone
                ? MediaQuery.removePadding(
                    context: context,
                    // Under the bar, the page needn't keep clear of the status bar too.
                    removeTop: false,
                    child: EdgeTray(child: pages),
                  )
                : _Panes(layout: layout, list: pages),
          ),
        ]),
      ),
    );
  }
}

/// The desktop's panes (from 720 px wide): the page as the list, and the detail pane, side by
/// side above 1024 px, or the detail over the list while it's open from 720 to 1024 px. The
/// detail pane's navigator keeps its screens as the layout changes between the two.
class _Panes extends StatefulWidget {
  const _Panes({required this.layout, required this.list});
  final DeskLayout layout;
  final Widget list;

  @override
  State<_Panes> createState() => _PanesState();
}

/// Holds the detail pane's navigator, so it keeps its screens as the layout changes.
class _PanesState extends State<_Panes> {
  /// The detail pane's own navigator, which starts on its "pick something" note.
  late final Widget _detail = Navigator(
    key: AppNav.paneKey,
    observers: [DeskPanes.observer],
    onGenerateRoute: (settings) => PageRouteBuilder<void>(
      settings: const RouteSettings(name: 'pane'),
      pageBuilder: (_, _, _) => const _PaneNote(),
      transitionDuration: Duration.zero,
    ),
  );

  /// The panes are going (the window narrowed to the phone layout), and the detail pane's
  /// screens with them, so its watcher forgets them.
  @override
  void dispose() {
    DeskPanes.observer.reset();
    super.dispose();
  }

  /// [child] told its own size, so a page lays itself out for its pane, not the window.
  Widget _sized(Widget child) => LayoutBuilder(
        builder: (context, box) => MediaQuery(data: MediaQuery.of(context).copyWith(size: box.biggest), child: child),
      );

  /// The detail pane, at most 1000 px wide and centred in a wider pane, as the site's column.
  Widget _detailPane() => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: DeskPanes.detailMax),
          child: _sized(_detail),
        ),
      );

  /// Above 1024 px the list and the detail side by side, with a line between; from 720 to 1024 px
  /// one at a time, the detail covering the list while it shows a screen. Both keep their place
  /// (Offstage, not removed) as they swap.
  @override
  Widget build(BuildContext context) {
    if (widget.layout == DeskLayout.split) {
      return LayoutBuilder(builder: (context, box) {
        final listWidth = DeskPanes.listWidth(box.maxWidth);
        return Row(children: [
          SizedBox(width: listWidth, child: _sized(widget.list)),
          VerticalDivider(width: 1, thickness: 1, color: context.sg.border),
          Expanded(child: _detailPane()),
        ]);
      });
    }
    // 720 to 1024 px: one pane; the detail covers the list while it shows a screen.
    return ValueListenableBuilder<bool>(
      valueListenable: DeskPanes.open,
      builder: (context, open, _) => Stack(children: [
        Positioned.fill(child: Offstage(offstage: open, child: _sized(widget.list))),
        Positioned.fill(child: Offstage(offstage: !open, child: _detailPane())),
      ]),
    );
  }
}

/// The detail pane with nothing open: what to do to fill it.
class _PaneNote extends StatelessWidget {
  const _PaneNote();

  /// The note, centred and greyed: pick a stop or a bus, or search with Ctrl+K (⌘K on a Mac).
  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    return Material(
      type: MaterialType.transparency,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.directions_bus_outlined, size: 56, color: sg.muted.withValues(alpha: .6)),
            const SizedBox(height: 16),
            Text(
              tr('desktop.pane.pick', 'Pick a stop or a bus to see its timings here.'),
              textAlign: TextAlign.center,
              style: TextStyle(color: sg.muted, fontSize: 16),
            ),
            const SizedBox(height: 6),
            Text(
              tr('desktop.pane.search', 'Or search for one with {keys}.', {'keys': Theme.of(context).platform == TargetPlatform.macOS ? '⌘K' : 'Ctrl+K'}),
              textAlign: TextAlign.center,
              style: TextStyle(color: sg.muted.withValues(alpha: .8), fontSize: 14),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Offline: a bar at the top that says why pages went, with OK to put it away.
class OfflineBar extends StatelessWidget {
  const OfflineBar({super.key});

  /// The bar while the app's offline and OK hasn't put it away; nothing otherwise.
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([Net.off, Net.dismissed]),
        builder: (context, _) {
          if (!Net.off.value || Net.dismissed.value) return const SizedBox.shrink();
          final scheme = Theme.of(context).colorScheme;
          return Material(
            color: scheme.inverseSurface,
            child: SafeArea(
              bottom: false,
              child: Semantics(
                liveRegion: true,
                label: tr('offline.offline', 'Offline'),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                  child: Row(children: [
                    Icon(Icons.cloud_off, size: 18, color: scheme.onInverseSurface),
                    const SizedBox(width: 10),
                    Expanded(child: Text(tr('offline.bar', 'You’re offline. Timings and alerts come back when you reconnect.'), style: TextStyle(color: scheme.onInverseSurface))),
                    TextButton(onPressed: () => Net.dismissed.value = true, child: Text(tr('trip.ok', 'OK'), style: TextStyle(color: scheme.inversePrimary))),
                  ]),
                ),
              ),
            ),
          );
        },
      );
}
