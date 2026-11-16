// The command bar in the middle of the desktop app's title bar (desktop-features-spec §5), and
// what it lists. At rest it shows the page's or the screen's title, or the bar's short message
// ("Link copied"). Clicked, or with Ctrl+K, Ctrl+F, Ctrl+L or F6 (⌘ on a Mac), it opens as a
// search box with a list under it: the buses and stops the words match (the same search as Bus
// timings), then the app's commands; or, for a pasted link, the one row that opens it, in the
// app, in the browser or in another UwU app (app/links.dart's Links.read). Up and Down move
// through the list, Enter runs the row picked, and Esc or a click elsewhere closes it.
//
// How it fits with chrome.dart: chrome.dart's DeskChrome holds what the bar shows at rest
// (title, message, address) and opens or closes it from the keys and menus, through
// DeskChrome.barKey; title_bar.dart puts the bar in the middle of the title bar. This file has
// the box and its list (CommandBar), and CommandSearch, which works out the list's rows.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/net.dart';
import '../app/links.dart';
import '../app/nav.dart';
import '../app/pages.dart';
import '../data/network.dart';
import '../data/search.dart';
import '../data/stops.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'chrome.dart';
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

/// What the command bar lists for what's typed, and what opening a pasted address does. Everything
/// is static, as there is one command bar.
class CommandSearch {
  CommandSearch._();

  /// Opens an address from the command bar: in the app, in the browser, or in another UwU app.
  /// "Not found" if the app has no screen for it after all.
  static Future<void> openInput(CommandInput input) async {
    AppNav.fromPane = false;
    switch (input.kind) {
      case InputKind.inApp:
        if (!Links.open(input.text)) DeskChrome.say(tr('desktop.bar.notFound', 'Not found'));
      case InputKind.browser:
        await Desktop.openExternal(input.text);
        DeskChrome.say(tr('desktop.bar.inBrowser', 'Opened in your browser'));
      case InputKind.otherApp:
        if (!DeskLinks.passOn(input.text)) DeskChrome.say(tr('desktop.bar.notFound', 'Not found'));
      case InputKind.empty || InputKind.search:
        DeskChrome.say(tr('desktop.bar.notFound', 'Not found'));
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
      command(Icons.refresh, tr('desktop.cmd.reload', 'Reload'), DeskChrome.reload, keys: DeskMenus.keys('R')),
      command(Icons.link, tr('desktop.cmd.copyLink', 'Copy link'), DeskChrome.copyLink, keys: DeskMenus.keys('C', shift: true)),
      command(Icons.photo_camera_outlined, tr('desktop.cmd.shot', 'Take a screenshot'), () => DeskShot.take(long: false)),
      command(Icons.height, tr('desktop.cmd.longShot', 'Take a long screenshot'), () => DeskShot.take(long: true)),
      command(Icons.fullscreen, tr('desktop.cmd.fullScreen', 'Full screen'), DeskChrome.toggleFullScreen, keys: Desktop.mac ? '⌃⌘F' : 'F11'),
      command(Icons.widgets_outlined, tr('desktop.tray.addWidget', 'Add a Bus timings widget'), DeskWidgets.add),
      command(Icons.auto_awesome_outlined, tr('desktop.tray.makeItYours', 'Make it yours…'), () => Welcome.open()),
      if (ready != null) command(Icons.download, tr('desktop.tray.restart', 'Restart to update to {v}', {'v': ready}), Updater.restartToUpdate),
      if (ready == null) command(Icons.system_update_alt, tr('desktop.tray.check', 'Check for updates…'), Updater.checkNow),
    ];
  }
}

/// The command bar in the middle of the title bar. At rest it shows the page's title (or the
/// bar's message); open, it's a search box with its list below: buses, stops and commands, or
/// the address pasted into it. The title bar's own one has DeskChrome.barKey, so the keys and
/// menus can open and close it ([CommandBarState.open], [CommandBarState.close]).
class CommandBar extends StatefulWidget {
  const CommandBar({super.key, required this.ink});
  final BarColours ink;

  @override
  State<CommandBar> createState() => CommandBarState();
}

/// The command bar's state: open or at rest, what's typed, its list and the row picked.
class CommandBarState extends State<CommandBar> {
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

  /// Starts watching the box's focus, so a click elsewhere closes it.
  @override
  void initState() {
    super.initState();
    _focus.addListener(_focusChanged);
  }

  /// Lets go of the box's text, focus and scrolling as the bar goes.
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
      _hits = CommandSearch.search(typed);
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
      CommandSearch.openInput(input);
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

  /// The bar at rest or open, with its list hung under it in the chrome's overlay. Notes how wide
  /// the bar is, so the list can match it.
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

  /// The rows, each section's heading above its first row, or "Nothing matches" when there are
  /// none; at most 440 px tall, then it scrolls.
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

  /// The row, highlighted while it's the one picked; the mouse over it picks it.
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
