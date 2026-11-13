// The main screen: the page on show (Glance, Bus timings, Favourites, Navigate, Service alerts,
// Your trips or Places), the Edge Tray beside it, and Back: through what's open, then the page
// back to home, and with nothing left, "Press back again to exit" (2.2.7's, backtwice): a second
// press within two seconds sends the app to the background, so a trip carries on.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/net.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'edge_tray.dart';
import 'nav.dart';
import 'pages.dart';

class Shell extends StatefulWidget {
  const Shell({super.key, required this.pages});
  final Map<String, Widget Function()> pages;

  /// What runs along the top of every page: the disruptions bar (features/alerts/) and the trip
  /// bar (features/trips/).
  static final List<Widget Function()> top = [];

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  DateTime? _backAt;
  static const _exitMs = 2000;
  final Map<String, Widget> _built = {};

  @override
  void initState() {
    super.initState();
    AppNav.page.value = Pages.home();
    AppNav.page.addListener(_changed);
    Net.off.addListener(_net);
  }

  // Offline, a page that needs the network gives way to one that doesn't; back online, the
  // tray has them all again.
  void _net() {
    if (!Pages.shows(AppNav.page.value)) AppNav.page.value = Pages.home();
    setState(() {});
  }

  @override
  void dispose() {
    AppNav.page.removeListener(_changed);
    Net.off.removeListener(_net);
    super.dispose();
  }

  void _changed() => setState(() {});

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

  @override
  Widget build(BuildContext context) {
    final id = AppNav.page.value;
    // Each page kept once built, so a page switched away from and back keeps its place.
    final page = _built[id] ??= (widget.pages[id] ?? widget.pages['timings']!)();
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
            child: MediaQuery.removePadding(
              context: context,
              // Under the bar, the page needn't keep clear of the status bar too.
              removeTop: false,
              child: EdgeTray(
                child: IndexedStack(
                  index: _built.keys.toList().indexOf(id),
                  children: [for (final k in _built.keys) KeyedSubtree(key: ValueKey(k), child: k == id ? page : _built[k]!)],
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Offline: a bar at the top that says why pages went, with OK to put it away.
class OfflineBar extends StatelessWidget {
  const OfflineBar({super.key});

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
