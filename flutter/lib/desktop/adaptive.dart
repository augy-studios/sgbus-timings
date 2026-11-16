// The shared screens' desktop manners (docs/flutter-desktop-app-spec.md §2.4, desktop-features-spec
// §5): what a phone does with a finger, done as a computer does it with a mouse and keys.
//
// - AppSheet.show: every feature opens its sheets through this, never showModalBottomSheet. On a
//   phone it's the same bottom sheet as ever; on the desktop a centred dialog (pickers, menus,
//   forms) or a panel that slides in from the right (lists and details), closed with Esc, Ctrl+W
//   (Cmd+W on a Mac), its Close button or a click outside it. On the desktop it always opens on
//   the app's own navigator, so a screen in the detail pane (app/nav.dart) gets a dialog that
//   centres in and dims the whole content area, beside the rail and under the title bar, not
//   just the pane. A screen opened in the pane while one's up closes it first (AppNav.push).
// - DeskContextMenu: right-click a stop, a bus or a favourite for Open in split pane, Pin as a
//   desktop widget, Set as tray countdown, Star or Unstar, and Copy link (DeskActions does each).
// - DeskTooltips: tooltips that wait 400 ms under the mouse. DeskHover: a pointer and a highlight,
//   for a clickable row or card that isn't an InkWell, ListTile or chip (those do it themselves;
//   no row needs it yet).
// - DeskScrollBehavior: scrolling as Windows and Linux do it (no Android glow or stretch, a
//   scroll bar, mouse wheel and touchpad), for those two only: macOS keeps its own.
//
// How a screen tells it's the desktop app: `Native.has('desktop')`, the desktop's bridge host
// (host.dart) listing 'desktop' among its features. On Android it's false, so nothing here changes
// the phone app; tests and the guide's screenshots turn it on with `Native.fake(['desktop'], ...)`.
//
// This file, and the shared screens, never import the desktop layer itself (desktop.dart,
// glance.dart, chrome.dart, title_bar.dart, command_bar.dart, rail.dart, widgets_window.dart):
// those bring in the window and tray packages, which a phone build and the screens' tests don't
// need. What only the desktop can do (the tray countdown, a desktop widget, full screen) goes
// through the bridge instead, as Share and Notify do, and host.dart answers it.
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/links.dart';
import '../app/nav.dart';
import '../data/arrivals.dart';
import '../data/favs.dart';
import '../data/stops.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import '../widgets/share.dart';

/// Which desktop surface a sheet becomes: a centred dialog, or a panel along the window's right.
enum DeskSheet { dialog, panel }

/// Sheets that suit the device: a phone's bottom sheet on Android, a dialog or a side panel on the
/// desktop. Features call [AppSheet.show] (and [AppSheet.draggable] for a sheet's long list)
/// instead of Flutter's own bottom sheet calls.
class AppSheet {
  AppSheet._();

  /// Whether this is the desktop app, where sheets become dialogs and panels and rows have a
  /// right-click menu: the bridge's host says so (host.dart's features).
  static bool get onDesktop => Native.has('desktop');

  /// A dialog's width on the desktop, when the window has room.
  static const dialogWidth = 560.0;

  /// A side panel's width on the desktop, when the window has room.
  static const panelWidth = 420.0;

  /// Opens a sheet: on a phone, `showModalBottomSheet` with these same arguments; on the desktop,
  /// a centred dialog or a right-hand panel, as [desktop] says. Choose the dialog for pickers,
  /// short menus, forms and confirmations, and the panel for lists, search and details. Like a
  /// bottom sheet, it completes with what `Navigator.pop` was given, or null.
  ///
  /// On the desktop the dialog or panel always goes on the app's own (root) navigator, so it
  /// covers the whole content area, beside the rail and under the title bar, even when a screen
  /// in the detail pane opens it (desktop-features-spec §5); [useRootNavigator] only applies to
  /// the phone's sheet. So [builder] must close it with the context it's given, never the
  /// caller's: in the pane, the caller's would close the pane's screen instead. A screen opened
  /// in the pane while it's up closes it, and it completes with null; check `mounted` after
  /// awaiting it, as the screen that opened it may have been replaced.
  static Future<T?> show<T>({
    required BuildContext context,
    required WidgetBuilder builder,
    DeskSheet desktop = DeskSheet.dialog,
    bool isScrollControlled = false,
    bool isDismissible = true,
    bool useRootNavigator = false,
  }) {
    if (!AppSheet.onDesktop) {
      return showModalBottomSheet<T>(
        context: context,
        builder: builder,
        isScrollControlled: isScrollControlled,
        isDismissible: isDismissible,
        useRootNavigator: useRootNavigator,
      );
    }
    if (desktop == DeskSheet.panel) return _showPanel<T>(context, builder, isDismissible);
    return showDialog<T>(
      context: context,
      barrierDismissible: isDismissible,
      // Over the whole content area, not just the detail pane a screen there sits in.
      useRootNavigator: true,
      builder: (ctx) => _DeskSurface(panel: false, dismissible: isDismissible, child: Builder(builder: builder)),
    );
  }

  /// The right-hand panel: slides in from the window's right edge over a dimmed page, and back
  /// out as it closes. Like the dialog, on the app's own navigator, so it reaches the window's
  /// right edge and runs the content area's full height (under the title bar) even from a
  /// screen in the detail pane.
  static Future<T?> _showPanel<T>(BuildContext context, WidgetBuilder builder, bool dismissible) {
    // From the right in a left-to-right language; from the left in a right-to-left one.
    final from = Directionality.of(context) == TextDirection.rtl ? -1.0 : 1.0;
    return showGeneralDialog<T>(
      context: context,
      barrierDismissible: dismissible,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: Colors.black54,
      useRootNavigator: true,
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (ctx, _, _) => _DeskSurface(panel: true, dismissible: dismissible, child: Builder(builder: builder)),
      transitionBuilder: (ctx, animation, _, child) => SlideTransition(
        position: Tween(begin: Offset(from, 0), end: Offset.zero).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
        child: child,
      ),
    );
  }

  /// A sheet's scrolling list, in place of `DraggableScrollableSheet` (same arguments). On a phone
  /// it is one: the sheet opens [initialChildSize] tall and drags up and down. On the desktop
  /// there's nothing to drag, so the list simply fills its dialog or panel.
  static Widget draggable({
    double initialChildSize = 0.5,
    double minChildSize = 0.25,
    double maxChildSize = 1.0,
    bool expand = true,
    required ScrollableWidgetBuilder builder,
  }) {
    if (!AppSheet.onDesktop) {
      return DraggableScrollableSheet(
        initialChildSize: initialChildSize,
        minChildSize: minChildSize,
        maxChildSize: maxChildSize,
        expand: expand,
        builder: builder,
      );
    }
    return _DeskScroll(builder: builder);
  }
}

/// A sheet's content on the desktop, framed as a dialog or a panel, with a Close button and the
/// keys that close it.
class _DeskSurface extends StatelessWidget {
  const _DeskSurface({required this.panel, required this.dismissible, required this.child});
  final bool panel;
  final bool dismissible;
  final Widget child;

  /// Closes it, as tapping outside does, unless the sheet asked not to be dismissed.
  void _close(BuildContext context) {
    if (dismissible) Navigator.maybePop(context);
  }

  /// The colour the phone's bottom sheet has in the look on show, so its content reads the same.
  Color _background(BuildContext context) {
    final theme = Theme.of(context);
    return theme.bottomSheetTheme.backgroundColor ?? theme.colorScheme.surfaceContainerLow;
  }

  /// Builds the frame, with Esc and Ctrl+W (Cmd+W on a Mac) closing it.
  @override
  Widget build(BuildContext context) {
    final mac = defaultTargetPlatform == TargetPlatform.macOS;
    final keys = <ShortcutActivator, VoidCallback>{
      const SingleActivator(LogicalKeyboardKey.escape): () => _close(context),
      SingleActivator(LogicalKeyboardKey.keyW, control: !mac, meta: mac): () => _close(context),
    };
    // The keys listen above a focus scope that takes focus as it opens, so they work before
    // anything inside is clicked. A search box inside that asks for focus still gets it: the
    // scope gives way to the first thing within it that wants it.
    return CallbackShortcuts(
      bindings: keys,
      child: FocusScope(autofocus: true, child: panel ? _panel(context) : _dialog(context)),
    );
  }

  /// The centred dialog: a fixed width, as tall as its content up to most of the window.
  Widget _dialog(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return Dialog(
      backgroundColor: _background(context),
      clipBehavior: Clip.antiAlias,
      insetPadding: const EdgeInsets.all(24),
      child: SizedBox(
        width: math.min(AppSheet.dialogWidth, size.width - 48),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: size.height * 0.85),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _closeBar(context),
            Flexible(child: child),
          ]),
        ),
      ),
    );
  }

  /// The panel along the window's right edge, its full height.
  Widget _panel(BuildContext context) {
    final width = math.min(AppSheet.panelWidth, MediaQuery.sizeOf(context).width);
    return Align(
      alignment: AlignmentDirectional.centerEnd,
      child: Material(
        color: _background(context),
        elevation: 8,
        clipBehavior: Clip.antiAlias,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadiusDirectional.horizontal(start: Radius.circular(16))),
        child: SizedBox(
          width: width,
          height: double.infinity,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _closeBar(context),
            Expanded(child: child),
          ]),
        ),
      ),
    );
  }

  /// The Close button along the top, where a phone's sheet has its drag handle. A sheet that asked
  /// not to be dismissed closes itself, so it has no Close button, only the room one would take.
  Widget _closeBar(BuildContext context) {
    if (!dismissible) return const SizedBox(height: 16);
    return Padding(
      padding: const EdgeInsetsDirectional.only(top: 4, end: 4),
      child: Align(
        alignment: AlignmentDirectional.centerEnd,
        child: IconButton(tooltip: tr('common.close', 'Close'), icon: const Icon(Icons.close), onPressed: () => _close(context)),
      ),
    );
  }
}

/// AppSheet.draggable's list on the desktop: its own scroll controller, kept while it's open.
class _DeskScroll extends StatefulWidget {
  const _DeskScroll({required this.builder});
  final ScrollableWidgetBuilder builder;

  @override
  State<_DeskScroll> createState() => _DeskScrollState();
}

/// Keeps the list's scroll controller for as long as the dialog or panel is open.
class _DeskScrollState extends State<_DeskScroll> {
  final _scroll = ScrollController();

  /// Lets go of the scroll controller as the dialog or panel closes.
  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// The sheet's own list, given this controller as a DraggableScrollableSheet would give its own.
  @override
  Widget build(BuildContext context) => widget.builder(context, _scroll);
}

// ---------- right-click menus ----------

/// What a right-click menu acts on: a stop (or some buses at it), or a bus on its own.
class DeskTarget {
  /// A stop, or some of its buses: [buses] is a stop link's filter, such as "174" or "174,175".
  const DeskTarget.stop(String code, {this.buses}) : stop = code;

  /// A bus on its own, as its route.
  const DeskTarget.bus(String no)
      : stop = null,
        buses = no;

  /// The stop's code, or null for a bus on its own.
  final String? stop;

  /// The buses: at the stop (null for all of them), or the bus on its own.
  final String? buses;

  /// The buses one by one, leaving out a group such as 22* (all the 22s), which can't be starred
  /// or put on a widget.
  List<String> get busList => [
        for (final b in (buses ?? '').split(','))
          if (RegExp(r'^[0-9A-Z]{1,4}$').hasMatch(b.trim().toUpperCase())) b.trim().toUpperCase(),
      ];

  /// Its address on the site, as a stop's or a bus's Share button copies it.
  String get link => stop != null ? Links.stop(stop!) + (buses != null ? ',$buses' : '') : Links.bus(buses!);

  /// Its name, for the link's title: the stop's, or "Bus 174".
  String get title {
    final code = stop;
    if (code == null) return tr('favs.bus', 'Bus {no}', {'no': buses});
    return Stops.nameOf(code).isNotEmpty ? Stops.nameOf(code) : code;
  }

  /// Whether Star applies: not to a group such as 22*, which Favourites can't keep.
  bool get canStar => stop == null || buses == null || busList.isNotEmpty;
}

/// What the right-click menu's items do, also used by a stop's own Tray countdown and Desktop
/// widget buttons.
class DeskActions {
  DeskActions._();

  /// Opens it the way any link does (app/nav.dart's push): on a wide window, the shell shows it
  /// beside the list; on a narrow one, over it.
  static void open(DeskTarget t) {
    if (t.stop != null) {
      AppNav.open('stop', {'code': t.stop, 'service': t.buses});
    } else {
      AppNav.open('bus', {'no': t.buses});
    }
  }

  /// Whether this is the desktop app and it has a tray countdown to set (host.dart's 'glance').
  static bool get canTray => AppSheet.onDesktop && Native.has('glance');

  /// Whether this is the desktop app and it can put a Bus timings widget on the desktop
  /// (host.dart's 'widgets'). Asking for the desktop too keeps a phone's own widgets out of it.
  static bool get canWidget => AppSheet.onDesktop && Native.has('widgets');

  /// The tray countdown (desktop/glance.dart, through the bridge): this stop's next buses, or one
  /// bus's if it's narrowed to exactly one, in the tray every 30 seconds. Whether it was set.
  static Future<bool> trayCountdown(DeskTarget t) async {
    final code = t.stop;
    if (code == null) return false;
    try {
      await Native.call('SgBus', 'setTrayStop', {'code': code, 'name': Stops.nameOf(code), 'service': BusFilter.one(t.buses)});
      return true;
    } on NativeError {
      return false;
    }
  }

  /// A new Bus timings widget on the desktop (desktop/widgets_window.dart, through the bridge),
  /// already showing this stop, and only these buses if it's narrowed to some.
  static Future<void> pinWidget(DeskTarget t) async {
    final code = t.stop;
    if (code == null) return;
    await Native.call('SgBus', 'addWidget', {'code': code, 'name': Stops.nameOf(code), 'buses': t.busList}).catchError((_) => null);
  }

  /// Whether it's in Favourites: the stop, every one of these buses at it, or the bus.
  static bool starred(DeskTarget t) {
    final code = t.stop;
    if (code == null) return Favs.I.isBus(t.buses!);
    final buses = t.busList;
    if (t.buses == null || buses.isEmpty) return Favs.I.isStop(code);
    return buses.every((no) => Favs.I.isStopBus(code, no));
  }

  /// Stars it, or takes it out of Favourites if it's in: the stop, these buses at it, or the bus.
  static void toggleStar(DeskTarget t) {
    final code = t.stop;
    if (code == null) return Favs.I.toggleBus(t.buses!);
    final buses = t.busList;
    if (t.buses == null || buses.isEmpty) return Favs.I.toggleStop(code);
    final on = starred(t);
    // All of them in, or all of them out, whichever way they were.
    for (final no in buses) {
      if (Favs.I.isStopBus(code, no) == on) Favs.I.toggleStopBus(code, no);
    }
  }

  /// Copies its site address, as its Share button does on a computer ("Link copied").
  static Future<void> copyLink(BuildContext context, DeskTarget t) => shareLink(context, t.link, t.title);
}

/// The right-click menu's items.
enum _Pick { open, widget, tray, star, copy }

/// Wraps a stop, bus or favourite so a right-click opens its menu (on the desktop only: on a
/// phone it's just [child], and a long press does what it always did).
class DeskContextMenu extends StatelessWidget {
  const DeskContextMenu({super.key, required this.target, required this.child, this.onOpen});
  final DeskTarget target;
  final Widget child;

  /// What Open does, when it isn't opening the stop or bus: in a picker (Bus only's start or end,
  /// a list of stops), the same as clicking the row, so the stop is picked and the picker closes.
  final VoidCallback? onOpen;

  /// Builds [child], listening for a right-click on the desktop.
  @override
  Widget build(BuildContext context) {
    if (!AppSheet.onDesktop) return child;
    return GestureDetector(onSecondaryTapUp: (d) => show(context, d.globalPosition, target, onOpen: onOpen), child: child);
  }

  /// Opens the menu where the mouse was clicked, and does what's picked. [onOpen], if given, is
  /// what Open does instead of opening the stop or bus.
  static Future<void> show(BuildContext context, Offset at, DeskTarget target, {VoidCallback? onOpen}) async {
    final overlay = Overlay.of(context).context.findRenderObject()! as RenderBox;
    final local = overlay.globalToLocal(at);
    // In the split layout (a window wider than DeskPanes.splitAbove, spec §5) what's opened shows
    // beside the list, so Open says so. Asked of the layout the window's chrome hands down, not
    // the width here: a page is told only its own room beside the rail, narrower than the window.
    final wide = DeskPanes.layoutOf(context) == DeskLayout.split;
    final starred = DeskActions.starred(target);
    final picked = await showMenu<_Pick>(
      context: context,
      position: RelativeRect.fromRect(local & Size.zero, Offset.zero & overlay.size),
      items: [
        _item(_Pick.open, wide ? Icons.vertical_split_outlined : Icons.open_in_new,
            wide ? tr('desktop.menu.openSplit', 'Open in split pane') : tr('desktop.menu.open', 'Open')),
        if (target.stop != null && DeskActions.canWidget) _item(_Pick.widget, Icons.widgets_outlined, tr('desktop.menu.pinWidget', 'Pin as a desktop widget')),
        if (target.stop != null && DeskActions.canTray) _item(_Pick.tray, Icons.notifications_outlined, tr('desktop.menu.trayCountdown', 'Set as tray countdown')),
        if (target.canStar)
          _item(_Pick.star, starred ? Icons.star_rounded : Icons.star_outline_rounded,
              starred ? tr('desktop.menu.unstar', 'Unstar') : tr('desktop.menu.star', 'Star')),
        _item(_Pick.copy, Icons.link, tr('share.copyLink', 'Copy link')),
      ],
    );
    switch (picked) {
      case null:
        return;
      case _Pick.open:
        if (onOpen != null) {
          onOpen();
        } else {
          DeskActions.open(target);
        }
      case _Pick.widget:
        await DeskActions.pinWidget(target);
      case _Pick.tray:
        if (await DeskActions.trayCountdown(target)) AppNav.say(tr('stop.tool.inTray', 'In the tray'));
      case _Pick.star:
        DeskActions.toggleStar(target);
      case _Pick.copy:
        if (context.mounted) await DeskActions.copyLink(context, target);
    }
  }

  /// One of the menu's items: its icon and words.
  static PopupMenuItem<_Pick> _item(_Pick value, IconData icon, String label) => PopupMenuItem(
        value: value,
        child: Row(children: [Icon(icon, size: 20), const SizedBox(width: 12), Flexible(child: Text(label))]),
      );
}

// ---------- hover, tooltips, scrolling ----------

/// A row or card that a mouse can click but that isn't an InkWell (which already does this
/// itself): on the desktop, a pointer cursor and a light highlight while the mouse is over it.
/// On a phone, just [child]. The tap itself stays with [child].
class DeskHover extends StatefulWidget {
  const DeskHover({super.key, required this.child, this.radius = 12});
  final Widget child;
  final double radius;

  @override
  State<DeskHover> createState() => _DeskHoverState();
}

/// Remembers whether the mouse is over the row, for its highlight.
class _DeskHoverState extends State<DeskHover> {
  bool _over = false;

  /// Builds [child], highlighted while the mouse is over it on the desktop.
  @override
  Widget build(BuildContext context) {
    if (!AppSheet.onDesktop) return widget.child;
    final tint = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.06);
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _over = true),
      onExit: (_) => setState(() => _over = false),
      child: DecoratedBox(
        decoration: BoxDecoration(color: _over ? tint : Colors.transparent, borderRadius: BorderRadius.circular(widget.radius)),
        child: widget.child,
      ),
    );
  }
}

/// Tooltips that wait 400 ms under the mouse before they show, as a computer's do (a phone shows
/// them on a long press, which this doesn't change). app/app.dart wraps the desktop app in it,
/// window chrome and all.
class DeskTooltips extends StatelessWidget {
  const DeskTooltips({super.key, required this.child});
  final Widget child;

  /// How long the mouse rests on a button before its tooltip shows.
  static const wait = Duration(milliseconds: 400);

  /// Builds [child] with the app's tooltip look, waiting [wait] first.
  @override
  Widget build(BuildContext context) => TooltipTheme(data: TooltipTheme.of(context).copyWith(waitDuration: wait), child: child);
}

/// Scrolling on Windows and Linux: no Android glow or stretch at the ends, no bounce, a desktop
/// scroll bar (it widens under the mouse), and lists scrolled by the mouse wheel, a touchpad or a
/// touch screen, but not dragged with the mouse, as other desktop apps do. For the app's
/// `MaterialApp.scrollBehavior` there; macOS keeps its own.
class DeskScrollBehavior extends MaterialScrollBehavior {
  const DeskScrollBehavior();

  /// What can drag a list: a finger, a pen or a touchpad, not the mouse (it uses the wheel and
  /// the scroll bar).
  @override
  Set<PointerDeviceKind> get dragDevices => const {
        PointerDeviceKind.touch,
        PointerDeviceKind.stylus,
        PointerDeviceKind.invertedStylus,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.unknown,
      };

  /// No glow or stretch at a list's ends.
  @override
  Widget buildOverscrollIndicator(BuildContext context, Widget child, ScrollableDetails details) => child;

  /// A scroll bar on every list that scrolls up and down; one that scrolls sideways has none, as
  /// Flutter's own desktop behaviour has it.
  @override
  Widget buildScrollbar(BuildContext context, Widget child, ScrollableDetails details) {
    if (axisDirectionToAxis(details.direction) == Axis.horizontal || details.controller == null) return child;
    return Scrollbar(controller: details.controller, child: child);
  }

  /// Stops at the ends rather than bouncing past them.
  @override
  ScrollPhysics getScrollPhysics(BuildContext context) => const ClampingScrollPhysics();
}
