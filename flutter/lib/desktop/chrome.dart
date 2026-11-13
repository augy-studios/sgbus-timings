// The app window's own title bar, as the Electron app's titlebar.html had it, in the app's brand
// colour (the site's theme-color): back, forward, reload, the page's address (typed over with
// Ctrl+L or F6, and its button copies the link), screenshot and long screenshot, a green update
// button once an update's downloaded, and on Windows and Linux its own minimise, maximise and
// close (close keeps it in the tray). macOS keeps its traffic lights over the bar's left. It
// hides while the app's full screen (the departures board).
//
// History is the app's own: each screen pushed with the site's address for it (app/nav.dart's
// push(address:)), the page in front for the rest. Back pops a screen, or goes back a page;
// Forward opens the address last gone back from. Reload finds the screen's pull-to-refresh and
// runs it.
//
// Below the bar, a window wider than the site's own column (1000 px) keeps its pages in a
// centred column of that width, as the site does; the live map and the board use all of it.
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';

import '../app/links.dart';
import '../app/nav.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'desktop.dart';
import 'screenshot.dart';
import 'updater.dart';

class DeskChrome {
  DeskChrome._();

  static const barHeight = 40.0;
  static const column = 1000.0;

  /// The address on show, and Back's and Forward's.
  static final address = ValueNotifier<String>('${Desktop.site}/');
  static final canBack = ValueNotifier<bool>(false);
  static final canForward = ValueNotifier<bool>(false);
  static final loading = ValueNotifier<bool>(false);
  static final fullScreen = ValueNotifier<bool>(false);
  static final maximized = ValueNotifier<bool>(false);
  static final _forward = <String>[];
  static final _pages = <String>[];
  static bool _goingForward = false;
  static final observer = _Observer();
  static final _editKey = GlobalKey<_AddressState>();

  /// Screens that use the whole window, not the column: the live map, the board.
  static const fullWidth = {'map', 'board', 'flag'};

  static void init() {
    AppNav.page.addListener(_pageChanged);
    _pages.add(AppNav.page.value);
    Desktop.onWindowChange.add(_windowChanged);
    Desktop.onShown.add(_windowChanged);
    _refresh();
  }

  static void _windowChanged() {
    final w = Desktop.window;
    if (w == null) return;
    fullScreen.value = w.isFullScreen;
    maximized.value = w.isMaximized;
  }

  static String _pageAddress(String id) => switch (id) {
        'alerts' => '#alerts',
        'nav' => '#nav',
        _ => '',
      };

  static void _pageChanged() {
    final id = AppNav.page.value;
    if (_pages.isEmpty || _pages.last != id) _pages.add(id);
    if (_pages.length > 50) _pages.removeAt(0);
    if (!_goingForward) _forward.clear();
    _refresh();
  }

  static void _refresh() {
    final top = observer.top;
    final a = top?.settings.arguments;
    final own = a is Map ? a['address'] as String? : null;
    final hash = own ?? (observer.depth <= 1 ? _pageAddress(AppNav.page.value) : null);
    if (hash != null) address.value = hash.startsWith('/') ? '${Desktop.site}$hash' : '${Desktop.site}/$hash';
    canBack.value = observer.depth > 1 || _pages.length > 1;
    canForward.value = _forward.isNotEmpty;
  }

  static void back() {
    final nav = AppNav.nav;
    final from = address.value;
    if (nav != null && nav.canPop()) {
      nav.maybePop();
    } else if (_pages.length > 1) {
      _pages.removeLast();
      final to = _pages.removeLast();
      AppNav.page.value = to;
    } else {
      return;
    }
    _forward.add(from);
    _refresh();
  }

  static void forward() {
    if (_forward.isEmpty) return;
    final url = _forward.removeLast();
    _goingForward = true;
    Links.open(url);
    _goingForward = false;
    _refresh();
  }

  /// Runs the screen's own pull-to-refresh, the one showing in the route in front.
  static Future<void> reload() async {
    loading.value = true;
    try {
      final top = observer.top;
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
    } finally {
      loading.value = false;
    }
  }

  /// Ctrl+L or F6: to the address, to type over it.
  static void editAddress() => _editKey.currentState?.edit();

  /// The window's own buttons.
  static void minimize() => Desktop.window?.minimize();
  static void maximizeOrRestore() {
    final w = Desktop.window;
    if (w == null) return;
    w.isMaximized ? w.unmaximize() : w.maximize();
    Future<void>.delayed(const Duration(milliseconds: 50), _windowChanged);
  }

  static void close() => Desktop.window?.close();

  /// For the board: the window full screen, and back.
  static void setFullScreen(bool on) {
    final w = Desktop.window;
    if (w == null) return;
    w.isFullScreen = on;
    fullScreen.value = on;
  }

  /// Everything below the bar, wrapped: the title bar, the keys, the column.
  static Widget wrap(BuildContext context, Widget child) => _Frame(child: child);
}

class _Observer extends NavigatorObserver {
  final List<Route<dynamic>> _stack = [];
  Route<dynamic>? get top => _stack.lastOrNull;
  int get depth => _stack.length;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is! PageRoute) return;
    _stack.add(route);
    if (!DeskChrome._goingForward && _stack.length > 1) DeskChrome._forward.clear();
    _later();
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _stack.remove(route);
    _later();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _stack.remove(route);
    _later();
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    final i = oldRoute == null ? -1 : _stack.indexOf(oldRoute);
    if (i >= 0 && newRoute is PageRoute) {
      _stack[i] = newRoute;
    } else if (oldRoute != null) {
      _stack.remove(oldRoute);
    }
    _later();
  }

  void _later() => scheduleMicrotask(DeskChrome._refresh);
}

class _Frame extends StatelessWidget {
  const _Frame({required this.child});
  final Widget child;

  bool get _mac => Desktop.mac;

  @override
  Widget build(BuildContext context) {
    final keys = <ShortcutActivator, VoidCallback>{
      const SingleActivator(LogicalKeyboardKey.f5): DeskChrome.reload,
      SingleActivator(LogicalKeyboardKey.keyR, control: !_mac, meta: _mac): DeskChrome.reload,
      const SingleActivator(LogicalKeyboardKey.f6): DeskChrome.editAddress,
      SingleActivator(LogicalKeyboardKey.keyL, control: !_mac, meta: _mac): DeskChrome.editAddress,
      const SingleActivator(LogicalKeyboardKey.arrowLeft, alt: true): DeskChrome.back,
      const SingleActivator(LogicalKeyboardKey.arrowRight, alt: true): DeskChrome.forward,
      if (_mac) const SingleActivator(LogicalKeyboardKey.bracketLeft, meta: true): DeskChrome.back,
      if (_mac) const SingleActivator(LogicalKeyboardKey.bracketRight, meta: true): DeskChrome.forward,
    };
    return CallbackShortcuts(
      bindings: keys,
      child: ValueListenableBuilder<bool>(
        valueListenable: DeskChrome.fullScreen,
        builder: (context, full, _) => Column(children: [
          if (!full) const TitleBar(),
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: RepaintBoundary(key: DeskShot.key, child: _Column(child: child)),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Pages in the site's 1000 px column on a wide window; full-width screens use all of it.
class _Column extends StatelessWidget {
  const _Column({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<String>(
        valueListenable: DeskChrome.address,
        builder: (context, _, _) {
          final name = DeskChrome.observer.top?.settings.name;
          final wide = MediaQuery.sizeOf(context).width > DeskChrome.column;
          if (!wide || DeskChrome.fullWidth.contains(name)) return child;
          final sg = context.sg;
          return ColoredBox(
            color: Color.lerp(sg.bg, sg.brand, .18)!,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: DeskChrome.column),
                child: MediaQuery(data: MediaQuery.of(context).copyWith(size: Size(DeskChrome.column, MediaQuery.sizeOf(context).height)), child: child),
              ),
            ),
          );
        },
      );
}

class TitleBar extends StatelessWidget {
  const TitleBar({super.key, this.preview = false});

  /// For the guide's screenshots: drawn as on Windows, without a window.
  final bool preview;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final bg = sg.brand;
    final dark = ThemeData.estimateBrightnessForColor(bg) == Brightness.dark;
    final fg = dark ? const Color(0xFFF2FFF2) : const Color(0xFF0C100E);
    final hover = dark ? const Color(0x29FFFFFF) : const Color(0x1A000000);
    final field = dark ? const Color(0x24FFFFFF) : const Color(0x14000000);
    final mac = Desktop.mac && !preview;
    final controls = !mac;
    Widget nav(IconData icon, String tip, VoidCallback? onTap, {ValueListenable<bool>? enabled, bool on = true, Widget? child}) {
      Widget button(bool on) => Tooltip(
            message: tip,
            child: Semantics(
              button: true,
              enabled: on,
              label: tip,
              child: SizedBox(
                width: 30,
                height: 28,
                child: Material(
                  type: MaterialType.transparency,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(6),
                    hoverColor: hover,
                    onTap: on ? onTap : null,
                    child: Opacity(opacity: on ? 1 : .35, child: child ?? Icon(icon, size: 18, color: fg)),
                  ),
                ),
              ),
            ),
          );
      return enabled == null ? button(on) : ValueListenableBuilder<bool>(valueListenable: enabled, builder: (_, on, _) => button(on));
    }

    return Material(
      color: bg,
      child: SizedBox(
        height: DeskChrome.barHeight,
        child: DragToMoveArea(
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onDoubleTap: DeskChrome.maximizeOrRestore,
            child: ValueListenableBuilder<bool>(
              valueListenable: DeskChrome.fullScreen,
              builder: (context, full, _) => Padding(
                padding: EdgeInsets.only(left: mac && !full ? 78 : 8, right: controls ? 0 : 8),
                child: Row(children: [
                  nav(Icons.arrow_back, tr('desktop.bar.back', 'Back (Alt+Left)'), DeskChrome.back, enabled: DeskChrome.canBack),
                  nav(Icons.arrow_forward, tr('desktop.bar.forward', 'Forward (Alt+Right)'), DeskChrome.forward, enabled: DeskChrome.canForward),
                  ValueListenableBuilder<bool>(
                    valueListenable: DeskChrome.loading,
                    builder: (_, busy, _) => nav(Icons.refresh, tr('desktop.bar.reload', 'Reload (F5)'), DeskChrome.reload,
                        child: busy ? Padding(padding: const EdgeInsets.all(6), child: CircularProgressIndicator(strokeWidth: 2, color: fg)) : null),
                  ),
                  const SizedBox(width: 6),
                  Expanded(child: _Address(key: DeskChrome._editKey, fg: fg, field: field, hover: hover)),
                  const SizedBox(width: 4),
                  ValueListenableBuilder<bool>(
                    valueListenable: DeskShot.busy,
                    builder: (_, busy, _) => Row(children: [
                      nav(Icons.photo_camera_outlined, tr('desktop.bar.shot', 'Screenshot: copies it, and saves it in Downloads'), () => DeskShot.take(long: false), on: !busy),
                      nav(Icons.vertical_align_bottom, tr('desktop.bar.longShot', 'Long screenshot: the whole page, top to bottom; copies it, and saves it in Downloads'), () => DeskShot.take(long: true), on: !busy),
                    ]),
                  ),
                  ValueListenableBuilder<String?>(
                    valueListenable: Updater.ready,
                    builder: (_, v, _) => v == null
                        ? const SizedBox.shrink()
                        : Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: Tooltip(
                              message: tr('desktop.tray.restart', 'Restart to update to {v}', {'v': v}),
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
                  ),
                  if (controls && !full) ...[
                    const SizedBox(width: 8),
                    _WindowButton(icon: _Glyph.minimize, tip: tr('desktop.bar.minimise', 'Minimise'), fg: fg, hover: hover, onTap: DeskChrome.minimize),
                    ValueListenableBuilder<bool>(
                      valueListenable: DeskChrome.maximized,
                      builder: (_, max, _) => _WindowButton(
                        icon: max ? _Glyph.restore : _Glyph.maximize,
                        tip: max ? tr('desktop.bar.restore', 'Restore') : tr('desktop.bar.maximise', 'Maximise'),
                        fg: fg,
                        hover: hover,
                        onTap: DeskChrome.maximizeOrRestore,
                      ),
                    ),
                    _WindowButton(icon: _Glyph.close, tip: tr('desktop.bar.close', 'Close (keeps running in the tray)'), fg: fg, hover: const Color(0xFFC42B1C), hoverFg: Colors.white, onTap: DeskChrome.close),
                  ],
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Address extends StatefulWidget {
  const _Address({super.key, required this.fg, required this.field, required this.hover});
  final Color fg, field, hover;

  @override
  State<_Address> createState() => _AddressState();
}

class _AddressState extends State<_Address> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  String? _said;
  Timer? _sayTimer;

  @override
  void initState() {
    super.initState();
    DeskChrome.address.addListener(_show);
    _focus.addListener(_focusChanged);
    _show();
  }

  @override
  void dispose() {
    DeskChrome.address.removeListener(_show);
    _focus.dispose();
    _text.dispose();
    _sayTimer?.cancel();
    super.dispose();
  }

  void _show() {
    if (_focus.hasFocus) return;
    _text.text = Desktop.displayAddress(DeskChrome.address.value);
  }

  void _focusChanged() {
    if (_focus.hasFocus) {
      _text.text = DeskChrome.address.value;
      _text.selection = TextSelection(baseOffset: 0, extentOffset: _text.text.length);
    } else {
      _show();
    }
  }

  void edit() => _focus.requestFocus();

  void say(String text) {
    _sayTimer?.cancel();
    setState(() => _said = text);
    _sayTimer = Timer(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _said = null);
    });
  }

  Future<void> _go(String typed) async {
    final url = Desktop.typedAddress(typed);
    if (url == null) {
      say(tr('desktop.bar.notAddress', 'Not an address'));
      return;
    }
    _focus.unfocus();
    if (Desktop.isSite(url)) {
      Links.open(url);
    } else {
      await Desktop.openExternal(url);
      say(tr('desktop.bar.inBrowser', 'Opened in your browser'));
    }
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: DeskChrome.address.value));
    say(tr('desktop.linkCopied', 'Link copied'));
  }

  @override
  Widget build(BuildContext context) {
    DeskShot.say = say;
    final style = TextStyle(color: widget.fg, fontSize: 13);
    return Container(
      height: 28,
      padding: const EdgeInsets.only(left: 10, right: 3),
      decoration: BoxDecoration(
        color: widget.field,
        borderRadius: BorderRadius.circular(14),
        border: _focus.hasFocus ? Border.all(color: widget.fg, width: 2) : null,
      ),
      child: Row(children: [
        Icon(Icons.lock_outline, size: 13, color: widget.fg.withValues(alpha: .7)),
        const SizedBox(width: 6),
        Expanded(
          child: Opacity(
            opacity: _said == null ? 1 : .45,
            child: Semantics(
              label: tr('desktop.bar.address', 'Address'),
              textField: true,
              child: Tooltip(
                message: tr('desktop.bar.typeAddress', 'Type an address and press Enter (Ctrl+L)'),
                waitDuration: const Duration(seconds: 1),
                child: CallbackShortcuts(
                  bindings: {const SingleActivator(LogicalKeyboardKey.escape): () => _focus.unfocus()},
                  child: TextField(
                    controller: _text,
                    focusNode: _focus,
                    style: style,
                    cursorColor: widget.fg,
                    maxLines: 1,
                    decoration: const InputDecoration(isCollapsed: true, border: InputBorder.none, contentPadding: EdgeInsets.symmetric(vertical: 6)),
                    onSubmitted: _go,
                  ),
                ),
              ),
            ),
          ),
        ),
        if (_said != null)
          Padding(padding: const EdgeInsets.only(right: 7), child: Text(_said!, style: style.copyWith(fontWeight: FontWeight.w600)))
        else
          Tooltip(
            message: tr('desktop.bar.copy', 'Copy the link'),
            child: SizedBox(
              width: 24,
              height: 22,
              child: Material(
                type: MaterialType.transparency,
                child: InkWell(borderRadius: BorderRadius.circular(11), hoverColor: widget.hover, onTap: _copy, child: Icon(Icons.copy_outlined, size: 14, color: widget.fg)),
              ),
            ),
          ),
      ]),
    );
  }
}

enum _Glyph { minimize, maximize, restore, close }

class _WindowButton extends StatefulWidget {
  const _WindowButton({required this.icon, required this.tip, required this.fg, required this.hover, required this.onTap, this.hoverFg});
  final _Glyph icon;
  final String tip;
  final Color fg, hover;
  final Color? hoverFg;
  final VoidCallback onTap;

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

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
                child: CustomPaint(painter: _GlyphPainter(widget.icon, _over && widget.hoverFg != null ? widget.hoverFg! : widget.fg)),
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
        canvas.drawPath(Path()
          ..moveTo(2.5, 2.5)
          ..lineTo(2.5, .5)
          ..lineTo(9.5, .5)
          ..lineTo(9.5, 7.5)
          ..lineTo(7.5, 7.5), p);
      case _Glyph.close:
        canvas.drawLine(Offset.zero, const Offset(10, 10), p);
        canvas.drawLine(const Offset(10, 0), const Offset(0, 10), p);
    }
  }

  @override
  bool shouldRepaint(_GlyphPainter old) => old.glyph != glyph || old.color != color;
}
