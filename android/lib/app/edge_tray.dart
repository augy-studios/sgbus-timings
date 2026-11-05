// The Edge Tray (the site's docs/edge-tray-spec.md): a column of round buttons down one side
// of the screen (sgbus_tray_side, right unless set to left), the pages' tabs first, the one on
// show in the brand colour, then the extras Settings can hide (sgbus_tray_hide) and Settings
// and Theme. Its tab tucks it away (sgbus_tray_closed), leaving the whole width to the page.
import 'package:flutter/material.dart';

import '../data/store.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import '../theme/theme.dart';
import 'nav.dart';
import 'pages.dart';

class TrayExtra {
  const TrayExtra(this.id, this.icon, this.label, this.open, {this.when});
  final String id;
  final IconData icon;
  final String Function() label;
  final void Function() open;
  final bool Function()? when;
}

class EdgeTray extends StatefulWidget {
  const EdgeTray({super.key, required this.child});
  final Widget child;

  static const sideKey = 'sgbus_tray_side';
  static const closedKey = 'sgbus_tray_closed';
  static const hideKey = 'sgbus_tray_hide';

  static bool left() => Store.I.get(sideKey) == 'left';
  static Set<String> hidden() => (Store.I.get(hideKey) ?? '').split(' ').where((s) => s.isNotEmpty).toSet();
  static void setExtra(String id, bool show) {
    final h = hidden()..remove(id);
    if (!show) h.add(id);
    Store.I.put(hideKey, h.isEmpty ? null : h.join(' '));
  }

  static final extras = <TrayExtra>[
    TrayExtra('explorer', Icons.explore_outlined, () => tr('html.explorer', 'Explorer'), () => AppNav.open('explorer')),
    TrayExtra('coins', Icons.toll_outlined, () => tr('coins.title', 'uwuCoins'), () => AppNav.open('coins')),
    TrayExtra('nearstops', Icons.notifications_active_outlined, () => tr('html.timings_near_a_stop', 'Timings near a stop'),
        () => AppNav.open('nearStopsReminder'), when: () => Native.has('nearstops')),
    TrayExtra('routines', Icons.repeat, () => tr('html.routines', 'Routines'), () => AppNav.open('routines'), when: () => Native.has('routines')),
    TrayExtra('card', Icons.credit_card, () => tr('html.card_value', 'Card value'), () => AppNav.open('card'), when: () => Native.has('card')),
    TrayExtra('receive', Icons.download_for_offline_outlined, () => tr('html.receive_nearby', 'Receive nearby'),
        () => AppNav.open('receive'), when: () => Native.has('sharenearby')),
    TrayExtra('update', Icons.system_update_alt, () => tr('html.check_for_app_updates', 'Check for app updates'),
        () => AppNav.open('appUpdate'), when: () => Native.has('checkupdate')),
    TrayExtra('simplygo', Icons.contactless_outlined, () => tr('html.open_simplygo', 'Open SimplyGo'), () => AppNav.open('simplygo')),
  ];

  @override
  State<EdgeTray> createState() => _EdgeTrayState();
}

class _EdgeTrayState extends State<EdgeTray> {
  bool get _closed => Store.I.get(EdgeTray.closedKey) == '1';

  @override
  void initState() {
    super.initState();
    AppNav.page.addListener(_redraw);
    Store.I.changes.listen((k) {
      if (mounted && (k.startsWith('sgbus_tray') || k == Pages.offKey || k == Pages.glanceOffKey || k == Pages.homeKey || k == 'sgbus_lang')) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    AppNav.page.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final left = EdgeTray.left();
    final closed = _closed;
    final sg = context.sg;
    final tabs = Pages.tabs();
    final hidden = EdgeTray.hidden();
    final extras = EdgeTray.extras.where((e) => !hidden.contains(e.id) && (e.when?.call() ?? true)).toList();
    final pad = MediaQuery.paddingOf(context);
    const button = 48.0;

    Widget round(IconData icon, String label, VoidCallback onTap, {bool on = false}) {
      final fill = on ? sg.brand : (context.materialYou ? Theme.of(context).colorScheme.surfaceContainerHigh : sg.surfaceStrong);
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Tooltip(
          message: label,
          child: Semantics(
            selected: on,
            button: true,
            label: label,
            child: Material(
              color: fill,
              shape: context.materialYou
                  ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(on ? 16 : 24))
                  : CircleBorder(side: BorderSide(color: sg.border)),
              elevation: context.materialYou ? 0 : 2,
              shadowColor: Colors.black26,
              child: InkWell(
                customBorder: context.materialYou ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)) : const CircleBorder(),
                onTap: onTap,
                child: SizedBox(width: button, height: button, child: Icon(icon, size: 22, color: on ? sg.onBrand : sg.ink)),
              ),
            ),
          ),
        ),
      );
    }

    final buttons = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final p in tabs) round(p.icon, p.label(), () => AppNav.showPage(p.id), on: AppNav.page.value == p.id),
        const SizedBox(height: 8),
        for (final e in extras) round(e.icon, e.label(), e.open),
        const SizedBox(height: 8),
        round(Icons.settings_outlined, tr('html.settings', 'Settings'), () => AppNav.open('settings')),
        round(Icons.palette_outlined, tr('html.theme', 'Theme'), () => AppNav.open('theme')),
      ],
    );

    final tab = Material(
      color: sg.surfaceStrong,
      borderRadius: BorderRadius.horizontal(
        left: left ? Radius.zero : const Radius.circular(12),
        right: left ? const Radius.circular(12) : Radius.zero,
      ),
      child: InkWell(
        onTap: () => setState(() => Store.I.put(EdgeTray.closedKey, closed ? null : '1')),
        child: Tooltip(
          message: closed ? tr('tray.showTray', 'Show the Edge Tray') : tr('tray.hideTray', 'Hide the Edge Tray'),
          child: SizedBox(
            width: 24,
            height: 56,
            child: Icon(
              (closed ^ left) ? Icons.chevron_left : Icons.chevron_right,
              size: 20,
              color: sg.muted,
            ),
          ),
        ),
      ),
    );

    // The page keeps clear of the open tray: the buttons, and 8px.
    final room = closed ? 0.0 : button + 16 + 8;
    return Stack(
      children: [
        Positioned.fill(
          child: Padding(
            padding: EdgeInsets.only(left: left ? room : 0, right: left ? 0 : room),
            child: widget.child,
          ),
        ),
        Positioned(
          top: pad.top + 12,
          bottom: pad.bottom + 12,
          left: left ? 0 : null,
          right: left ? null : 0,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!left) tab,
              AnimatedSize(
                duration: const Duration(milliseconds: 340),
                curve: const Cubic(0.2, 0.8, 0.2, 1),
                child: closed
                    ? const SizedBox(width: 0)
                    : Padding(
                        padding: EdgeInsets.only(left: left ? 12 : 4, right: left ? 4 : 12),
                        child: SingleChildScrollView(child: buttons),
                      ),
              ),
              if (left) tab,
            ],
          ),
        ),
      ],
    );
  }
}
