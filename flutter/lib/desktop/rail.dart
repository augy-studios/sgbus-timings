// The desktop app's navigation rail (desktop-features-spec §5): the column of page buttons down
// the main window's left from 720 px wide, in place of the phone's Edge Tray. The pages come
// first, with the one on show picked and Favourites' count on its icon; then the Edge Tray's
// extras that are turned on (SimplyGo, uwuCoins…), then Settings and Theme. Picking a page shows
// it and clears the detail pane, as the Edge Tray does.
//
// How it fits with chrome.dart: chrome.dart lays out the window and puts DeskRail left of the
// content, unless the window is under 720 px wide (the phone layout, app/nav.dart's DeskPanes)
// or full screen. The rail reads the pages from app/pages.dart and the extras from
// app/edge_tray.dart, so it always offers what the Edge Tray would.
import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api/net.dart';
import '../app/edge_tray.dart';
import '../app/nav.dart';
import '../app/pages.dart';
import '../data/favs.dart';
import '../data/store.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';

/// The navigation rail down the window's left, from 720 px wide, in place of the Edge Tray
/// (app/edge_tray.dart): the pages first, the one on show picked, then the Edge Tray's extras
/// that are on, Settings and Theme.
class DeskRail extends StatefulWidget {
  const DeskRail({super.key});

  @override
  State<DeskRail> createState() => _RailState();
}

/// Redraws the rail when the page, the pages on offer or the language change.
class _RailState extends State<DeskRail> {
  StreamSubscription<String>? _changes;

  /// Starts listening for the page, the connection, the language and the settings the rail
  /// shows.
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

  /// Stops listening as the rail goes (the window narrowed, or went full screen).
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

  /// The rail: a destination per page, then the extras, Settings and Theme as round buttons
  /// under a short line, all scrolling together if the window is too short.
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

  /// The button, with its badge if it has one. What a click opens doesn't stack on the detail
  /// pane's screen: the rail isn't in the pane (app/nav.dart's fromPane).
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
