// The Edge Tray (the site's docs/edge-tray-spec.md): a column of round buttons down one side
// of the screen (sgbus_tray_side, right unless set to left), the pages' tabs first, the one on
// show in the brand colour, then the extras Settings can hide (sgbus_tray_hide) and Settings
// and Theme. Its tab tucks it away (sgbus_tray_closed), leaving the whole width to the page. On a
// wide screen (a tablet), each button says what it is beside its icon.
import 'package:flutter/material.dart';

import '../api/net.dart';
import '../data/favs.dart';
import '../data/rewards.dart';
import '../data/store.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import '../theme/theme.dart';
import '../widgets/coin_icon.dart';
import 'nav.dart';
import 'pages.dart';
import '../features/map/map_save.dart';
import '../features/tour/tour.dart';

class TrayExtra {
  const TrayExtra(this.id, this.icon, this.label, this.open, {this.when, this.badge, this.short, this.face});
  final String id;
  final IconData icon;
  final String Function() label;
  final void Function() open;
  final bool Function()? when;
  final String? Function()? badge;

  /// What it's called beside its icon on a wide screen, where `label` says too much.
  final String Function()? short;

  /// A picture of its own in place of `icon`, at a button's size.
  final Widget Function(double size)? face;
}

class EdgeTray extends StatefulWidget {
  const EdgeTray({super.key, required this.child});
  final Widget child;

  static const sideKey = 'sgbus_tray_side';
  static const closedKey = 'sgbus_tray_closed';
  static const hideKey = 'sgbus_tray_hide';

  /// From this wide, a button says what it is beside its icon.
  static const wideFrom = 600.0;
  static const wideButton = 196.0;

  static bool left() => Store.I.get(sideKey) == 'left';
  static Set<String> hidden() => (Store.I.get(hideKey) ?? '').split(' ').where((s) => s.isNotEmpty).toSet();
  static void setExtra(String id, bool show) {
    final h = hidden()..remove(id);
    if (!show) h.add(id);
    Store.I.put(hideKey, h.isEmpty ? null : h.join(' '));
  }

  static final extras = <TrayExtra>[
    // Offline, only with Singapore's map saved.
    TrayExtra('explorer', Icons.explore_outlined, () => tr('tray.explorer', 'Explorer'), () => AppNav.open('explorer'), when: () => !Net.off.value || MapSave.saved),
    // Its balance on it; hidden with Show uwuCoins off.
    TrayExtra('coins', Icons.toll_outlined, () => tr('coins.title', 'uwuCoins'), () => AppNav.open('coins'),
        when: () => Coins.shown, badge: () => '${Coins.balance}', face: (size) => CoinIcon(size: size * 0.62)),
    TrayExtra('nearstops', Icons.notifications_active_outlined, () => tr('tray.nearStops', 'Timings near a stop'),
        () => AppNav.open('nearStopsReminder'), when: () => Native.has('nearstops') && !Net.off.value),
    TrayExtra('routines', Icons.repeat, () => tr('tray.routines', 'Routines'), () => AppNav.open('routines'), when: () => Native.has('routines') && !Net.off.value),
    TrayExtra('card', Icons.credit_card, () => tr('tray.card', 'Card value'), () => AppNav.open('card'), when: () => Native.has('card')),
    TrayExtra('receive', Icons.download_for_offline_outlined, () => tr('tray.receive', 'Receive nearby'),
        () => AppNav.open('receive'), when: () => Native.has('sharenearby')),
    TrayExtra('update', Icons.system_update_alt, () => tr('tray.appUpdate', 'Check for app updates'),
        () => AppNav.open('appUpdate'), when: () => Native.has('checkupdate') && !Net.off.value),
    TrayExtra('simplygo', Icons.contactless_outlined, () => tr('html.open_simplygo', 'Open SimplyGo'), () => AppNav.open('simplygo'),
        short: () => tr('settings.simplygo', 'SimplyGo'),
        face: (size) => ClipOval(child: Image.asset('assets/images/simplygo.png', width: size, height: size, fit: BoxFit.cover, excludeFromSemantics: true))),
    TrayExtra('telegram', Icons.send_outlined, () => tr('html.singapore_bus_timings_on_telegram', 'Singapore Bus Timings on Telegram'),
        () => _link('https://t.me/UwUsgbus_bot'), short: () => tr('settings.telegram_bot', 'Telegram bot')),
    TrayExtra('coffee', Icons.coffee_outlined, () => tr('settings.buy_augy_a_coffee', 'Buy Augy a Coffee'),
        () => _link('https://donate.stripe.com/28o2akeAr3hv0DK6oo')),
    TrayExtra('guide', Icons.help_outline, () => tr('html.how_to_use_sg_bus', 'How to use SG Bus Timings'),
        () => _link('https://guide.sgbus.uwuapps.org/android/overview'), short: () => tr('settings.guide', 'Guide')),
  ];

  static void _link(String url) => Native.call('SgBus', 'openLink', {'url': url}).catchError((_) => null);

  @override
  State<EdgeTray> createState() => _EdgeTrayState();
}

class _EdgeTrayState extends State<EdgeTray> {
  bool get _closed => Store.I.get(EdgeTray.closedKey) == '1';

  @override
  void initState() {
    super.initState();
    AppNav.page.addListener(_redraw);
    Rewards.I.addListener(_redraw);
    Net.off.addListener(_redraw);
    Store.I.changes.listen((k) {
      if (mounted && (k.startsWith('sgbus_tray') || k.startsWith('sgbus_fav') || k == Pages.offKey || k == Pages.glanceOffKey || k == Pages.homeKey || k == 'sgbus_lang')) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    AppNav.page.removeListener(_redraw);
    Rewards.I.removeListener(_redraw);
    Net.off.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() => setState(() {});

  static const _time = Duration(milliseconds: 340);
  static const _ease = Cubic(0.2, 0.8, 0.2, 1);

  void _toggle(bool closed) => setState(() => Store.I.put(EdgeTray.closedKey, closed ? null : '1'));

  @override
  Widget build(BuildContext context) {
    final left = EdgeTray.left();
    final closed = _closed;
    final sg = context.sg;
    final you = context.materialYou;
    final tabs = Pages.tabs();
    final hidden = EdgeTray.hidden();
    final extras = EdgeTray.extras.where((e) => !hidden.contains(e.id) && (e.when?.call() ?? true)).toList();
    final pad = MediaQuery.paddingOf(context);
    final still = MediaQuery.disableAnimationsOf(context);
    final time = still ? Duration.zero : _time;
    const button = 48.0, gap = 8.0, edge = 12.0;
    final wide = MediaQuery.sizeOf(context).width >= EdgeTray.wideFrom;
    final favCount = Favs.I.stops().length;
    var index = 0;

    // Each button unrolls on open: it fades in, slides 12px back from the edge and grows from
    // 85%, 18ms after the one above it. On collapse they all go together.
    Widget unroll(Widget child) {
      final delay = still ? 0 : 18 * index++;
      return TweenAnimationBuilder<double>(
        key: ValueKey('$closed$delay'),
        tween: Tween(begin: closed ? 1 : 0, end: closed ? 0 : 1),
        duration: time + Duration(milliseconds: closed ? 0 : delay),
        curve: closed ? _ease : Interval(delay / (340 + delay), 1, curve: _ease),
        builder: (context, t, child) => Opacity(
          opacity: t.clamp(0, 1),
          child: Transform.translate(
            offset: Offset((1 - t) * 12 * (left ? -1 : 1), 0),
            child: Transform.scale(scale: 0.85 + 0.15 * t, child: child),
          ),
        ),
        child: child,
      );
    }

    Widget round(IconData icon, String label, VoidCallback onTap, {bool on = false, String? badge, String? short, Widget Function(double size)? face}) {
      final fill = on ? sg.tray : (you ? Theme.of(context).colorScheme.surfaceContainerHigh : sg.surfaceStrong);
      final ink = on ? sg.onTray : sg.ink;
      final picture = SizedBox(width: button, height: button, child: Center(child: face?.call(button) ?? Icon(icon, size: 22, color: ink)));
      final ShapeBorder shape = you
          ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(on ? 16 : 24))
          : wide
              ? StadiumBorder(side: BorderSide(color: sg.border))
              : CircleBorder(side: BorderSide(color: sg.border));
      final b = Material(
        color: fill,
        shape: shape,
        elevation: you ? 0 : 2,
        shadowColor: Colors.black26,
        child: InkWell(
          customBorder: shape,
          onTap: onTap,
          child: wide
              ? SizedBox(
                  width: EdgeTray.wideButton,
                  height: button,
                  child: Row(children: [
                    picture,
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(right: 14),
                        child: Text(short ?? label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: ink, fontSize: 14, fontWeight: on ? FontWeight.w700 : null)),
                      ),
                    ),
                  ]),
                )
              : picture,
        ),
      );
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: unroll(Tooltip(
          message: label,
          child: Semantics(
            selected: on,
            button: true,
            label: label,
            child: badge == null
                ? b
                : Stack(clipBehavior: Clip.none, children: [
                    b,
                    Positioned(
                      top: -4,
                      right: left ? null : -4,
                      left: left ? -4 : null,
                      child: ExcludeSemantics(
                        child: Container(
                          constraints: const BoxConstraints(minWidth: 20),
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(color: sg.brandInk, borderRadius: BorderRadius.circular(10)),
                          child: Text(badge,
                              textAlign: TextAlign.center,
                              style: TextStyle(color: you ? Theme.of(context).colorScheme.onPrimary : Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ),
                  ]),
          ),
        )),
      );
    }

    Widget rule() => unroll(Container(width: 28, height: 1, margin: const EdgeInsets.symmetric(vertical: 6), color: sg.border));

    final buttons = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TourTarget(
          id: 'tray.pages',
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final p in tabs)
              round(p.icon, p.label(), () => AppNav.showPage(p.id),
                  on: AppNav.page.value == p.id, badge: p.id == 'favs' && favCount > 0 ? '$favCount' : null),
          ]),
        ),
        if (extras.isNotEmpty) rule(),
        for (final e in extras) round(e.icon, e.label(), e.open, badge: e.badge?.call(), short: e.short?.call(), face: e.face),
        rule(),
        TourTarget(id: 'tray.settings', child: round(Icons.settings_outlined, tr('settings.settings', 'Settings'), () => AppNav.open('settings'))),
        round(Icons.palette_outlined, tr('theme.title', 'Theme'), () => AppNav.open('theme')),
      ],
    );

    // The tab: a pill beside the open tray, pointing the way it goes; flush with the edge and
    // flat on that side once the tray is away.
    const r = Radius.circular(12);
    final tab = AnimatedContainer(
      duration: time,
      curve: _ease,
      margin: EdgeInsets.only(left: left && !closed ? gap : 0, right: !left && !closed ? gap : 0),
      decoration: ShapeDecoration(
        color: you ? Theme.of(context).colorScheme.surfaceContainerHighest : sg.surfaceStrong,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.horizontal(
            left: left && closed ? Radius.zero : r,
            right: !left && closed ? Radius.zero : r,
          ),
          side: you ? BorderSide.none : BorderSide(color: sg.border),
        ),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _toggle(closed),
          child: Tooltip(
            message: closed ? tr('tray.showTray', 'Show the Edge Tray') : tr('tray.hideTray', 'Hide the Edge Tray'),
            child: Semantics(
              button: true,
              expanded: !closed,
              child: SizedBox(
                width: 24,
                height: 56,
                child: AnimatedRotation(
                  turns: closed ? 0.5 : 0,
                  duration: time,
                  curve: _ease,
                  child: Icon(left ? Icons.chevron_left : Icons.chevron_right, size: 20, color: sg.muted),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    // The page keeps clear of the open tray (the buttons, the edge and a gap), and follows it in
    // and out at the tray's pace.
    final room = closed ? 0.0 : (wide ? EdgeTray.wideButton : button) + edge + gap;
    return Stack(
      children: [
        Positioned.fill(
          child: AnimatedPadding(
            duration: time,
            curve: _ease,
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
                duration: time,
                curve: _ease,
                child: closed
                    ? const SizedBox(width: 0)
                    : ExcludeFocus(
                        excluding: closed,
                        child: Padding(
                          padding: EdgeInsets.only(left: left ? edge : 0, right: left ? 0 : edge),
                          child: SingleChildScrollView(child: buttons),
                        ),
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
