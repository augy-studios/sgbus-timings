// The main screen: the page on show (Glance, Bus timings, Favourites, Navigate, Service alerts,
// Your trips or Places), the Edge Tray beside it, and Back: through what's open, then the page
// back to home, and with nothing left, "Press back again to exit" (2.2.7's, backtwice): a second
// press within two seconds sends the app to the background, so a trip carries on.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
  }

  @override
  void dispose() {
    AppNav.page.removeListener(_changed);
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
