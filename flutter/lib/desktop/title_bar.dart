// The desktop app's own title bar (desktop-features-spec §5), drawn in place of the system's: 40 px
// tall, in the brand colour with light or dark writing to suit it (theme/theme.dart's
// BarColours). Dragging it moves the window and a double-click maximises it. Left to right: Back,
// Forward and Reload; the command bar in the middle (command_bar.dart); Copy link, the two
// screenshots (screenshot.dart) and the green Restart to update (updater.dart); and on Windows
// and Linux the window's own Minimise, Maximise and Close, drawn as Windows draws them. On a Mac
// the bar leaves room on its left for the traffic lights instead. In a phone-sized window (under
// 720 px) Copy link and the two screenshots fold into one More menu, so the command bar keeps
// its room.
//
// How it fits with chrome.dart: this file only draws the bar. Every button does what
// chrome.dart's DeskChrome says (back, forward, reload, copyLink, minimize, close…) and greys
// out or spins by DeskChrome's notifiers (canBack, canForward, loading, maximized). chrome.dart
// puts the bar along the window's top, and hides it in full screen.
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../app/nav.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'chrome.dart';
import 'command_bar.dart';
import 'desktop.dart';
import 'menubar.dart';
import 'screenshot.dart';
import 'updater.dart';

/// The window's own title bar (desktop-features-spec §5's table, left to right).
class TitleBar extends StatelessWidget {
  const TitleBar({super.key, this.preview = false});

  /// For the guide's screenshots: drawn as on Windows, without a window.
  final bool preview;

  /// Narrower than this (where the window takes the phone layout, app/nav.dart), Copy link and
  /// the two screenshots fold into one More menu ([_MoreButton]).
  static const compactUnder = DeskPanes.railFrom;

  /// The bar: its drag area underneath, and the buttons and command bar in a row over it.
  @override
  Widget build(BuildContext context) {
    final ink = BarColours.of(context.sg);
    final mac = Desktop.mac && !preview;
    return Material(
      color: ink.background,
      child: SizedBox(
        height: DeskChrome.barHeight,
        child: LayoutBuilder(builder: (context, box) => _bar(ink, mac, compact: box.maxWidth < compactUnder)),
      ),
    );
  }

  /// The bar's drag area, with its buttons and the command bar over it; [compact] in a narrow
  /// window.
  Widget _bar(BarColours ink, bool mac, {required bool compact}) => Stack(children: [
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
                    child: CommandBar(key: preview ? null : DeskChrome.barKey, ink: ink),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (compact)
                _MoreButton(ink: ink)
              else ...[
                _BarButton(ink: ink, icon: Icons.link, tip: tr('desktop.bar.copyLink', 'Copy link ({keys})', {'keys': DeskMenus.keys('C', shift: true)}), onTap: DeskChrome.copyLink),
                _ShotButtons(ink: ink),
              ],
              _UpdateButton(),
              if (!mac) _WindowButtons(ink: ink, full: full),
            ]),
          ),
        ),
      ]);
}

/// One of the bar's small buttons: an icon (or [child]) with a tooltip, dimmed while it can't
/// be used ([enabled] false, or [on] false).
class _BarButton extends StatelessWidget {
  const _BarButton({required this.ink, required this.icon, required this.tip, required this.onTap, this.enabled, this.on = true, this.child, this.focusNode});
  final BarColours ink;
  final IconData icon;
  final String tip;
  final VoidCallback onTap;
  final ValueListenable<bool>? enabled;
  final bool on;
  final Widget? child;

  /// Its focus, for a button that's given focus (More, as its menu opens).
  final FocusNode? focusNode;

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
                focusNode: focusNode,
                borderRadius: BorderRadius.circular(6),
                hoverColor: ink.hover,
                onTap: usable ? onTap : null,
                child: Opacity(opacity: usable ? 1 : .35, child: child ?? Icon(icon, size: 18, color: ink.fg)),
              ),
            ),
          ),
        ),
      );

  /// The button, following [enabled] when it's given.
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

  /// Reload's button, with a small spinner in place of its icon while the screen refreshes.
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

  /// The two buttons side by side, dimmed together while a screenshot is under way.
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

/// In a narrow window, one More button for Copy link and the two screenshots, as a menu, so the
/// command bar keeps its room (TitleBar.compactUnder).
class _MoreButton extends StatefulWidget {
  const _MoreButton({required this.ink});
  final BarColours ink;

  @override
  State<_MoreButton> createState() => _MoreButtonState();
}

/// The More button's focus, which its menu takes as it opens, so Esc closes it even when it was
/// opened with the mouse (the menu listens for Esc from its button or its items).
class _MoreButtonState extends State<_MoreButton> {
  final _focus = FocusNode(debugLabel: 'More');

  /// Lets go of the button's focus as the bar goes.
  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  /// The button, opening and closing its menu; the screenshots are greyed out while one's taken.
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
        valueListenable: DeskShot.busy,
        builder: (_, busy, _) => MenuAnchor(
          childFocusNode: _focus,
          menuChildren: [
            MenuItemButton(leadingIcon: const Icon(Icons.link, size: 18), onPressed: DeskChrome.copyLink, child: Text(tr('desktop.cmd.copyLink', 'Copy link'))),
            MenuItemButton(
              leadingIcon: const Icon(Icons.photo_camera_outlined, size: 18),
              onPressed: busy ? null : () => DeskShot.take(long: false),
              child: Text(tr('desktop.cmd.shot', 'Take a screenshot')),
            ),
            MenuItemButton(
              leadingIcon: const Icon(Icons.height, size: 18),
              onPressed: busy ? null : () => DeskShot.take(long: true),
              child: Text(tr('desktop.cmd.longShot', 'Take a long screenshot')),
            ),
          ],
          builder: (_, menu, _) => _BarButton(
            ink: widget.ink,
            icon: Icons.more_horiz,
            tip: tr('html.more', 'More'),
            focusNode: _focus,
            onTap: () => menu.isOpen ? menu.close() : menu.open(),
          ),
        ),
      );
}

/// The green Restart to update, only while an update's downloaded (updater.dart).
class _UpdateButton extends StatelessWidget {
  /// The green button while an update waits to be installed; nothing otherwise.
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

// ---------- the window's buttons ----------

/// Minimise, Maximise (or Restore) and Close, drawn as Windows draws its own (Windows and
/// Linux). Gone in full screen.
class _WindowButtons extends StatelessWidget {
  const _WindowButtons({required this.ink, required this.full});
  final BarColours ink;
  final bool full;

  /// The three buttons in a row; Maximise turns into Restore while the window is maximised.
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

  /// The button, tinted (and Close turned red) while the pointer is over it.
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

  /// Draws the glyph in the button's middle, 1 px lines; only Close's diagonals are smoothed.
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

  /// Draws again only when the glyph or its colour changes.
  @override
  bool shouldRepaint(_GlyphPainter old) => old.glyph != glyph || old.color != color;
}
