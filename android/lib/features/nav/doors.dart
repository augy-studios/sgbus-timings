// Where to stand on a train, drawn (the site's js/nav.js doorsPanel and doorNumberAt): each row
// an icon, its doors as little platform doors (a band in the line's colour saying Door, over
// glass split down the middle with the number on it, as on the real one) and where it leads;
// at the foot a drawing of that kind of platform door with the number's spot ringed, and the
// words. Navigate's panel folds to its heading; the live map's station card shows its rows open.
import 'package:flutter/material.dart';

import '../../data/doors.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import 'nav_page.dart';

/// Each line's colour, as the site's map has them; the LRT and anything else grey.
Color lineColour(String code) {
  const colours = {
    'EW': 0xFF009645, 'CG': 0xFF009645, 'NS': 0xFFD42E12, 'NE': 0xFF9900AA, 'CC': 0xFFFA9E0D, 'CE': 0xFFFA9E0D,
    'DT': 0xFF005EC4, 'TE': 0xFF9D5B25, 'JS': 0xFF0099AA, 'JE': 0xFF0099AA, 'JW': 0xFF0099AA, 'CR': 0xFF97C616, 'CP': 0xFF97C616,
  };
  final m = RegExp(r'^[A-Z]+').firstMatch(code.toUpperCase())?.group(0) ?? '';
  final two = m.length >= 2 ? m.substring(0, 2) : m;
  return Color(colours[two] ?? 0xFF748477);
}

String doorType(String t) => switch (t) {
      'escalator' => tr('nav.transfer_method.escalator', 'Escalator'),
      'lift' => tr('nav.transfer_method.lift', 'Lift'),
      'stairs' => tr('nav.transfer_method.stairs', 'Stairs'),
      _ => t,
    };

IconData doorIcon(String t) => switch (t) {
      'escalator' => Icons.escalator,
      'lift' => Icons.elevator_outlined,
      'stairs' => Icons.stairs_outlined,
      _ => Icons.train_outlined,
    };

/// "Door number: at the top right of each door", or where it isn't known, to look for it.
String numberAtText(String? at) => switch (at) {
      'above' => tr('nav.transfer_train.platform_doors_above', 'Door number: on the panel above the doors'),
      'corner' => tr('nav.transfer_train.platform_doors_top_right', 'Door number: at the top right of each door'),
      'post' => tr('nav.transfer_train.platform_doors_post', 'Door number: near the top of the post beside each door'),
      _ => tr('nav.transfer_train.platform_doors', 'Look for the number on each platform door'),
    };

/// A little platform door with its number.
class DoorChip extends StatelessWidget {
  const DoorChip(this.n, {super.key, required this.line});
  final int n;
  final Color line;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final glass = Color.alphaBlend(sg.brand.withValues(alpha: 0.25), sg.surfaceStrong);
    return Container(
      constraints: const BoxConstraints(minWidth: 50),
      decoration: BoxDecoration(
        color: glass,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(7), bottom: Radius.circular(3)),
        border: Border.all(color: sg.ink.withValues(alpha: 0.7), width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicWidth(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            color: line,
            padding: const EdgeInsets.fromLTRB(6, 1, 6, 2),
            child: Text(tr('doors.door', 'Door').toUpperCase(),
                textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.6)),
          ),
          Stack(alignment: Alignment.center, children: [
            Positioned.fill(child: Center(child: Container(width: 2, color: sg.ink.withValues(alpha: 0.22)))),
            Container(
              margin: const EdgeInsets.fromLTRB(5, 5, 5, 7),
              padding: const EdgeInsets.fromLTRB(8, 1, 8, 3),
              decoration: BoxDecoration(color: sg.surfaceStrong, borderRadius: BorderRadius.circular(5)),
              child: Text('$n', style: TextStyle(color: sg.ink, fontSize: 20, height: 1.15, fontWeight: FontWeight.w700)),
            ),
          ]),
        ]),
      ),
    );
  }
}

/// Where on the platform door its number is: full-height doors with a panel over them in the
/// line's colour, or half-height ones between posts, the spot ringed.
class DoorNumberAt extends StatelessWidget {
  const DoorNumberAt(this.at, {super.key, required this.line});
  final String at;
  final Color line;

  @override
  Widget build(BuildContext context) => SizedBox(width: 50, height: 40, child: CustomPaint(painter: _DoorPainter(at, line, context.sg)));
}

class _DoorPainter extends CustomPainter {
  _DoorPainter(this.at, this.line, this.sg);
  final String at;
  final Color line;
  final SgColors sg;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 40, size.height / 32);
    final frame = Paint()..color = sg.surfaceStrong;
    final edge = Paint()
      ..color = sg.ink.withValues(alpha: 0.7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final band = Paint()..color = line;
    final glass = Paint()..color = Color.alphaBlend(sg.brand.withValues(alpha: 0.25), sg.surfaceStrong);
    final glassEdge = Paint()
      ..color = sg.ink.withValues(alpha: 0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    void rect(Rect r, Paint fill, [Paint? stroke, double radius = 0]) {
      final rr = RRect.fromRectAndRadius(r, Radius.circular(radius));
      canvas.drawRRect(rr, fill);
      if (stroke != null) canvas.drawRRect(rr, stroke);
    }

    if (at == 'post') {
      for (final x in [2.0, 32.0]) {
        rect(Rect.fromLTWH(x, 5, 6, 24), frame, edge, 1);
        rect(Rect.fromLTWH(x, 5, 6, 3), band);
      }
      rect(const Rect.fromLTWH(9, 14, 10.5, 15), glass, glassEdge);
      rect(const Rect.fromLTWH(20.5, 14, 10.5, 15), glass, glassEdge);
    } else {
      rect(const Rect.fromLTWH(3, 2, 34, 27), frame, edge, 1.5);
      rect(const Rect.fromLTWH(3, 2, 34, 6), band);
      rect(const Rect.fromLTWH(7, 10, 12.5, 19), glass, glassEdge);
      rect(const Rect.fromLTWH(20.5, 10, 12.5, 19), glass, glassEdge);
    }
    final spot = const {'above': Offset(20, 5), 'corner': Offset(31, 11.5), 'post': Offset(35, 11)}[at]!;
    const gold = Color(0xFFF2B31B);
    canvas.drawCircle(spot, 4.2, Paint()
      ..color = gold
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2);
    canvas.drawCircle(spot, 1.6, Paint()..color = gold);
  }

  @override
  bool shouldRepaint(_DoorPainter old) => old.at != at || old.line != line || old.sg != sg;
}

/// One row: the icon, its doors, then what it is and where to.
class DoorRowView extends StatelessWidget {
  const DoorRowView({super.key, required this.icon, required this.doors, required this.where, required this.line});
  final IconData icon;
  final List<int> doors;
  final String where;
  final Color line;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    // A Wrap in a Row is offered unbounded width and never wraps, so the doors would run off the
    // panel's edge; cap it at what's left after the icon and room for the words (the site's grid
    // does the same with its auto column), but never narrower than one door.
    return LayoutBuilder(builder: (context, box) {
      final room = box.maxWidth.isFinite ? box.maxWidth - 24 - 10 - 10 - 72 : double.infinity;
      return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Icon(icon, size: 24, color: sg.brandInk),
        const SizedBox(width: 10),
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: room < 54 ? 54 : room),
          child: Wrap(spacing: 8, runSpacing: 8, children: [for (final n in doors) DoorChip(n, line: line)]),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(where, style: TextStyle(fontSize: 13, color: sg.muted))),
      ]);
    });
  }
}

class DoorFoot extends StatelessWidget {
  const DoorFoot(this.at, {super.key, required this.line});
  final String? at;
  final Color line;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final words = numberAtText(at);
    final colon = RegExp(r'^([^:：]+[:：])\s*').firstMatch(words);
    return Row(children: [
      if (at != null) ...[DoorNumberAt(at!, line: line), const SizedBox(width: 8)],
      Expanded(
        child: Text.rich(
          at != null && colon != null
              ? TextSpan(children: [
                  TextSpan(text: '${colon.group(1)} ', style: const TextStyle(fontWeight: FontWeight.w700)),
                  TextSpan(text: words.substring(colon.end)),
                ])
              : TextSpan(text: words),
          style: TextStyle(fontSize: 12, color: sg.muted),
        ),
      ),
    ]);
  }
}

/// Navigate's panel for a train ride, folded to its heading until opened.
class DoorsPanel extends StatefulWidget {
  const DoorsPanel({super.key, required this.plan, required this.line, required this.text});
  final DoorPlan plan;
  final Color line;
  final String text;

  static final Set<String> opened = {};

  @override
  State<DoorsPanel> createState() => _DoorsPanelState();
}

class _DoorsPanelState extends State<DoorsPanel> {
  String get _key => '${widget.plan.station}|${widget.plan.change}|${widget.plan.cross}';

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final p = widget.plan;
    final open = DoorsPanel.opened.contains(_key);
    final head = p.cross != null
        ? tr('nav.doors.at', 'At {stn}', {'stn': p.station})
        : p.change != null && p.change!.isNotEmpty
            ? tr('nav.transfer_train.description', 'Changing at {transferStn} for the {transferLine}', {'transferStn': p.station, 'transferLine': p.change})
            : p.change != null
                ? tr('nav.transfer_train.changing', 'Changing at {transferStn}', {'transferStn': p.station})
                : tr('nav.doors.off', 'Getting off at {stn}', {'stn': p.station});
    return Container(
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(color: sg.surfaceStrong, borderRadius: BorderRadius.circular(12), border: Border.all(color: sg.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Semantics(
          button: true,
          expanded: open,
          label: widget.text,
          excludeSemantics: true,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => open ? DoorsPanel.opened.remove(_key) : DoorsPanel.opened.add(_key)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              child: Row(children: [
                Icon(Icons.train_outlined, size: 18, color: sg.muted),
                const SizedBox(width: 6),
                Expanded(child: Text(head, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
                AnimatedRotation(turns: open ? 0 : 0.5, duration: const Duration(milliseconds: 200), child: Icon(Icons.expand_less, color: sg.muted)),
              ]),
            ),
          ),
        ),
        if (open)
          ExcludeSemantics(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (p.cross != null)
                  DoorRowView(
                      icon: Icons.swap_horiz,
                      doors: const [],
                      where: tr('nav.doors.cross', 'Change across the platform to the {line}', {'line': p.cross}),
                      line: widget.line)
                else ...[
                  for (final r in p.rows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: DoorRowView(
                        icon: doorIcon(r.type),
                        doors: r.doors,
                        where: r.places.isNotEmpty
                            ? tr('mapCard.typeTo', '{type} to {places}', {'type': doorType(r.type), 'places': r.places.join(', ')})
                            : doorType(r.type),
                        line: widget.line,
                      ),
                    ),
                  DoorFoot(p.numberAt, line: widget.line),
                ],
              ]),
            ),
          ),
      ]),
    );
  }
}

/// Plugs the panel into Navigate's train rides, the doors fetched the first time one's drawn.
void hookDoors() {
  TrainDoors.build = (context, leg, next) {
    if (!MrtDoors.ready) {
      MrtDoors.load().then((_) => NavState.I.changed());
      return null;
    }
    final plan = MrtDoors.plan(leg, next);
    if (plan == null) return null;
    final colour = leg['color'] is String ? hexColor(leg['color'] as String) : lineColour('${leg['route']}');
    return DoorsPanel(plan: plan, line: colour, text: MrtDoors.tip(leg, next) ?? '');
  };
}
