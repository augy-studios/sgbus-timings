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
                style: Theme.of(context).textTheme.titleSmall?.copyWith(color: context.sg.muted, fontWeight: FontWeight.w600)),
          ),
          ?trailing,
        ]),
      );
}

class Pill extends StatelessWidget {
  const Pill({super.key, required this.label, this.icon, this.onTap, this.on = false, this.tooltip});
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool on;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final btn = Material(
      color: on ? sg.brand : (context.materialYou ? Theme.of(context).colorScheme.surfaceContainerHigh : sg.surfaceStrong),
      shape: StadiumBorder(side: context.materialYou ? BorderSide.none : BorderSide(color: sg.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 18, color: on ? sg.onBrand : sg.ink), const SizedBox(width: 6)],
            Text(label, style: TextStyle(color: on ? sg.onBrand : sg.ink, fontSize: 14)),
          ]),
        ),
      ),
    );
    return tooltip == null ? btn : Tooltip(message: tooltip!, child: btn);
  }
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
      Text(no, style: TextStyle(fontSize: size, fontWeight: FontWeight.w700, color: tone ?? sg.ink, height: 1.1)),
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
        body: body,
      );
}
