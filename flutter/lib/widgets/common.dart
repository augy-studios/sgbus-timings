// The pieces every screen is made of, in either look (theme/theme.dart): a card (the usual
// look's glass, Material You's tonal card), a section heading, a pill button, an empty note, and
// a bus number badge.
import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/theme.dart';

class SgCard extends StatelessWidget {
  const SgCard({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.onTap, this.color, this.border});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? border;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final radius = BorderRadius.circular(context.materialYou ? 24 : 18);
    final body = Material(
      color: color ?? (context.materialYou ? Theme.of(context).colorScheme.surfaceContainerLow : sg.surface),
      shape: RoundedRectangleBorder(borderRadius: radius, side: context.materialYou && border == null ? BorderSide.none : BorderSide(color: border ?? sg.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
    if (!sg.glass) return body;
    // The UwU Apps theme's glass: what's behind blurred through it.
    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14), child: body),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
        child: Row(children: [
          Expanded(
            child: Text(text,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(color: context.sg.heading, fontWeight: FontWeight.w600)),
          ),
          ?trailing,
        ]),
      );
}

class Pill extends StatelessWidget {
  const Pill({super.key, required this.label, this.icon, this.onTap, this.on = false, this.tooltip, this.wrap = false, this.unset = false});
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool on;
  final String? tooltip;

  /// Long words go onto more lines rather than off the end. Not in a row that scrolls sideways,
  /// where there's no end to wrap at.
  final bool wrap;

  /// Something still to set, such as Home: muted and edged, and tapped, it asks.
  final bool unset;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final ink = on ? sg.onPick : unset ? sg.muted : sg.ink;
    final words = Text(label, style: TextStyle(color: ink, fontSize: 14));
    final btn = Material(
      color: unset ? Colors.transparent : on ? sg.pick : (context.materialYou ? Theme.of(context).colorScheme.surfaceContainerHigh : sg.surfaceStrong),
      shape: StadiumBorder(side: context.materialYou && !unset ? BorderSide.none : BorderSide(color: sg.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 18, color: ink), const SizedBox(width: 6)],
            if (wrap) Flexible(child: words) else words,
          ]),
        ),
      ),
    );
    return tooltip == null ? btn : Tooltip(message: tooltip!, child: btn);
  }
}

/// Choices as a segmented button: side by side while each one's words fit in its share of the row,
/// and one under another where they don't, as in Tamil, rather than broken letter by letter and cut
/// off (bug reports 20261107-RUHF and FYAG).
class FitSegments<T> extends StatelessWidget {
  const FitSegments({super.key, required this.options, required this.selected, required this.onChanged, this.showSelectedIcon = false});
  final List<(T, String)> options;
  final T selected;
  final void Function(T) onChanged;
  final bool showSelectedIcon;

  // A segment's padding and edge, and its tick when it has one.
  static const _edges = 26.0;
  static const _tick = 26.0;
  static const maxLines = 3;

  // What can't be broken across lines: a word, up to a hyphen. Chinese breaks between any two letters.
  static final _unbroken = RegExp(r'[^\s\-\u2E80-\u9FFF\uF900-\uFAFF]+-?');

  /// Whether these words fit side by side in this width: no word wider than its share, nor more
  /// than maxLines lines of them.
  static bool fits(BuildContext context, double width, Iterable<String> labels, {bool tick = false}) {
    final all = labels.toList();
    final room = width / all.length - _edges - (tick ? _tick : 0);
    if (room <= 0) return false;
    final style = DefaultTextStyle.of(context).style.merge(Theme.of(context).textTheme.labelLarge);
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    double widthOf(String words) {
      final p = TextPainter(text: TextSpan(text: words, style: style), textDirection: direction, textScaler: scaler)..layout();
      final w = p.width;
      p.dispose();
      return w;
    }

    for (final label in all) {
      if (_unbroken.allMatches(label).any((m) => widthOf(m[0]!) > room)) return false;
      final p = TextPainter(text: TextSpan(text: label, style: style), textDirection: direction, textScaler: scaler)..layout(maxWidth: room);
      final lines = p.computeLineMetrics().length;
      p.dispose();
      if (lines > maxLines) return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, box) {
          final side = fits(context, box.maxWidth, options.map((o) => o.$2), tick: showSelectedIcon);
          return SegmentedButton<T>(
            direction: side ? Axis.horizontal : Axis.vertical,
            showSelectedIcon: showSelectedIcon,
            segments: [for (final o in options) ButtonSegment(value: o.$1, label: Text(o.$2, textAlign: TextAlign.center))],
            selected: {selected},
            onSelectionChanged: (s) => onChanged(s.first),
          );
        },
      );
}

class EmptyNote extends StatelessWidget {
  const EmptyNote(this.text, {super.key, this.icon});
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 12),
        child: Column(children: [
          if (icon != null) Icon(icon, size: 36, color: context.sg.muted),
          if (icon != null) const SizedBox(height: 8),
          Text(text, textAlign: TextAlign.center, style: TextStyle(color: context.sg.muted)),
        ]),
      );
}

class BusBadge extends StatelessWidget {
  const BusBadge(this.no, {super.key, this.fav = false, this.size = 20, this.tone});
  final String no;
  final bool fav;
  final double size;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      if (fav) Icon(Icons.star_rounded, size: size * 0.8, color: sg.warn),
      Text(no, style: TextStyle(fontSize: size, fontWeight: FontWeight.w700, color: tone ?? sg.busInk(no), height: 1.1)),
    ]);
  }
}

/// A screen's frame: its title and back, over the page's background.
class SgScaffold extends StatelessWidget {
  const SgScaffold({super.key, required this.title, required this.body, this.actions, this.floating});
  final String title;
  final Widget body;
  final List<Widget>? actions;
  final Widget? floating;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title), actions: actions),
        floatingActionButton: floating,
        // Android draws the app behind its navigation bar, and a list given its own padding
        // doesn't leave room for the bar by itself.
        body: SafeArea(top: false, child: body),
      );
}

/// A way's top row: Back on the left, Refresh and the main button (Start trip) on the right. On
/// a phone, where the Edge Tray leaves the page too narrow for all three, the main button has a
/// line of its own the width of the page, as on the site (`.plannerNav`), rather than running
/// off the edge under the tray.
class WayHead extends StatelessWidget {
  const WayHead({super.key, required this.back, required this.refresh, required this.main});
  final Widget back;
  final Widget refresh;
  final Widget main;

  /// Below this wide the main button goes on a line of its own.
  static const narrow = 420.0;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
        if (c.maxWidth >= narrow) return Row(children: [back, const Spacer(), refresh, main]);
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Flexible(child: back),
            const Spacer(),
            refresh,
          ]),
          main,
        ]);
      });
}
