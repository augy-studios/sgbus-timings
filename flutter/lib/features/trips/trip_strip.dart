// The trip bar's strip (the site's tripStrip in js/trip.js, in step with it): the part you're on as
// a line from where it starts to where you get off, a dot for each stop or station, filled as
// you pass them, a ring where you are and a dark dot where you get off; over it, the stops left,
// the minutes and the distance to there, and an icon for every part of the trip, the one you're
// on picked out. So where you are is on the bar, without opening the trip.
import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../../data/geo.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import 'trip.dart';
import 'trip_progress.dart';

/// Stops left, minutes and metres to the end of the part you're on.
({int stops, double minutes, double metres}) partLeft(Trip t) {
  final l = t.current;
  if (l == null) return (stops: 0, minutes: 0, metres: 0);
  final n = l.points.length;
  final pos = t.pos.clamp(0, math.max(0, n - 1)).toDouble();
  var metres = 0.0;
  if (n >= 2) {
    final i = pos.floor().clamp(0, n - 2);
    metres += metresAB(l.points[i], l.points[i + 1]) * (1 - (pos - i));
    for (var k = i + 1; k < n - 1; k++) {
      metres += metresAB(l.points[k], l.points[k + 1]);
    }
  }
  final share = n < 2 ? 1.0 : pos / (n - 1);
  final minutes = l.minutes * (1 - share) + (l.ride && !t.boarded ? l.wait : 0);
  return (stops: t.stopsLeft(), minutes: minutes, metres: metres);
}

IconData tripLegIcon(TripLeg l) => l.kind == 'train'
    ? Icons.directions_subway_filled
    : l.kind == 'bus'
        ? Icons.directions_bus
        : l.foot == 'cycle'
            ? Icons.pedal_bike
            : l.foot == 'drive'
                ? Icons.directions_car
                : Icons.directions_walk;

class TripStrip extends StatelessWidget {
  const TripStrip({super.key, required this.trip, required this.ink});
  final Trip trip;

  /// The colour of the words, the bar's own.
  final Color ink;

  @override
  Widget build(BuildContext context) {
    final l = trip.current;
    if (l == null) return const SizedBox.shrink();
    final left = partLeft(trip);
    final colour = hexColor(TripProgress.colourOf(l), context.sg.ok);
    final stats = [
      if (l.ride) left.stops == 1 ? tr('trip.chipStop', '1 stop') : tr('trip.chipStops', '{n} stops', {'n': left.stops}),
      tr('trip.chipMin', '{m} min', {'m': math.max(1, left.minutes.round())}),
      formatDistance(left.metres),
    ];
    final small = TextStyle(color: ink.withValues(alpha: .85), fontSize: 11);
    final names = l.names.where((n) => n.isNotEmpty).toList();
    final start = names.isNotEmpty ? names.first : '';
    final end = l.to;
    return Semantics(
      label: tr('trip.stripSays', '{stats} to {to}', {'stats': stats.join(', '), 'to': end}),
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Expanded(
              child: Text(stats.join('  ·  '),
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: ink, fontWeight: FontWeight.w700, fontSize: 13)),
            ),
            if (trip.legs.length > 1 && trip.legs.length <= 8)
              for (final (i, part) in trip.legs.indexed) ...[
                if (i > 0) Icon(Icons.chevron_right, size: 12, color: ink.withValues(alpha: .5)),
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: i == trip.leg ? BoxDecoration(color: ink, borderRadius: BorderRadius.circular(5)) : null,
                  child: Icon(tripLegIcon(part), size: 14, color: i == trip.leg ? hexColor(TripProgress.colourOf(part), context.sg.ok) : ink.withValues(alpha: i < trip.leg ? .45 : .8)),
                ),
              ],
          ]),
          SizedBox(
            height: 16,
            child: CustomPaint(painter: _StripPainter(stops: l.points.length, pos: trip.pos, colour: colour, ride: l.ride, waiting: l.ride && !trip.boarded, ink: ink)),
          ),
          Row(children: [
            Expanded(child: Text(start, maxLines: 1, overflow: TextOverflow.ellipsis, style: small)),
            const SizedBox(width: 8),
            Flexible(child: Text(end, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.end, style: small.copyWith(fontWeight: FontWeight.w700))),
          ]),
        ]),
      ),
    );
  }
}

class _StripPainter extends CustomPainter {
  _StripPainter({required this.stops, required this.pos, required this.colour, required this.ride, required this.waiting, required this.ink});
  final int stops;
  final double pos;
  final Color colour;
  final bool ride;
  final bool waiting;
  final Color ink;

  // Past this many stops, they're too close together for a dot each.
  static const _maxDots = 60;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 7.0;
    final y = size.height / 2;
    final w = size.width - pad * 2;
    final n = math.max(2, stops);
    final at = (waiting ? 0.0 : pos).clamp(0, n - 1) / (n - 1);
    double x(double share) => pad + share * w;
    final line = Paint()
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    if (ride) {
      canvas.drawLine(Offset(x(0), y), Offset(x(1), y), line..color = colour.withValues(alpha: .3));
      canvas.drawLine(Offset(x(0), y), Offset(x(at), y), line..color = colour);
    } else {
      // A walk: dots along the way, as the timeline draws one.
      final dot = Paint()..color = ink.withValues(alpha: .55);
      for (var d = 0.0; d <= w; d += 7) {
        canvas.drawCircle(Offset(pad + d, y), 1.6, dot);
      }
      canvas.drawLine(Offset(x(0), y), Offset(x(at), y), line..color = colour);
    }
    if (ride && stops <= _maxDots) {
      for (var i = 1; i < n - 1; i++) {
        final share = i / (n - 1);
        final passed = share <= at;
        canvas.drawCircle(Offset(x(share), y), 3.2, Paint()..color = passed ? colour : Colors.white);
        canvas.drawCircle(Offset(x(share), y), 3.2, Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.4
          ..color = colour);
      }
    }
    // Where it starts, and where you get off: a dark dot ringed in white.
    canvas.drawCircle(Offset(x(0), y), 4.5, Paint()..color = colour);
    canvas.drawCircle(Offset(x(1), y), 6, Paint()..color = Colors.white);
    canvas.drawCircle(Offset(x(1), y), 4.5, Paint()..color = const Color(0xFF14213D));
    // You.
    canvas.drawCircle(Offset(x(at), y), 7, Paint()..color = Colors.white);
    canvas.drawCircle(Offset(x(at), y), 7, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = colour);
    canvas.drawCircle(Offset(x(at), y), 2.5, Paint()..color = colour);
  }

  @override
  bool shouldRepaint(_StripPainter old) =>
      old.stops != stops || old.pos != pos || old.colour != colour || old.ride != ride || old.waiting != waiting || old.ink != ink;
}
