// The trip's timeline (the site's js/trip.js, buildTimeline): every part from the one you're on,
// each a column of its stops, with a blue dot where you are, gliding between stops like a progress
// bar as your location moves it, the line behind it filled in and the page keeping up as you pass
// each stop. Only the part you're on has the dot. A bus stop's name opens its timings for the bus.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../data/network.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../timings/stop_screen.dart' show StopScreen;
import 'trip.dart';

class TripTimeline extends StatefulWidget {
  const TripTimeline({super.key, required this.changing, required this.onChangeAt});

  /// Change my way's on: a Change here by every stop still ahead on a ride.
  final bool changing;
  final void Function(int leg, int stop) onChangeAt;

  /// The dot closes this share of the gap to where you are every frameMs, at whatever rate the
  /// screen draws, so it eases rather than jumps when a new fix comes in.
  static const frameMs = 50.0;
  static const ease = 0.15;

  /// The dot's next place, `ms` after this one.
  static double eased(double shown, double goal, double ms) {
    final next = shown + (goal - shown) * (1 - math.pow(1 - ease, ms / frameMs));
    return (goal - next).abs() < 0.002 ? goal : next;
  }

  @override
  State<TripTimeline> createState() => _TripTimelineState();
}

class _TripTimelineState extends State<TripTimeline> with SingleTickerProviderStateMixin {
  late final Ticker _ticker = createTicker(_frame);
  final _shown = ValueNotifier<double>(0);
  final _stopKeys = <int, GlobalKey>{};
  Duration? _lastFrame;
  int _leg = -1;
  int? _stopInView;

  @override
  void initState() {
    super.initState();
    Trip.I.addListener(_moved);
    _leg = Trip.I.leg;
    _shown.value = Trip.I.pos;
    WidgetsBinding.instance.addPostFrameCallback((_) => _keepInView(jump: true));
  }

  @override
  void dispose() {
    Trip.I.removeListener(_moved);
    _ticker.dispose();
    _shown.dispose();
    super.dispose();
  }

  void _moved() {
    if (!mounted) return;
    final t = Trip.I;
    if (!t.active) return;
    if (t.leg != _leg) {
      _leg = t.leg;
      _shown.value = t.pos;
      _stopKeys.clear();
      _stopInView = null;
      _ticker.stop();
      setState(() {});
      WidgetsBinding.instance.addPostFrameCallback((_) => _keepInView());
      return;
    }
    if (_ticker.isActive || (t.pos - _shown.value).abs() < 0.002) return;
    _lastFrame = null;
    _ticker.start();
  }

  void _frame(Duration now) {
    final goal = Trip.I.pos;
    final before = _shown.value.floor();
    final ms = _lastFrame == null ? TripTimeline.frameMs : math.min(200.0, (now - _lastFrame!).inMicroseconds / 1000);
    _lastFrame = now;
    _shown.value = MediaQuery.disableAnimationsOf(context) ? goal : TripTimeline.eased(_shown.value, goal, ms);
    if (_shown.value == goal) _ticker.stop();
    if (_shown.value.floor() != before) {
      setState(() {});
      _keepInView();
    }
  }

  // Keeps the stop you're at in view as you pass each one.
  void _keepInView({bool jump = false}) {
    final i = _shown.value.floor();
    if (_stopInView == i || !mounted) return;
    _stopInView = i;
    final at = _stopKeys[i]?.currentContext;
    if (at == null || !at.mounted) return;
    final still = jump || MediaQuery.disableAnimationsOf(context);
    Scrollable.ensureVisible(at, alignment: 0.33, duration: still ? Duration.zero : const Duration(milliseconds: 400), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final t = Trip.I;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (var k = t.leg; k < t.legs.length; k++)
        _LegColumn(
          key: ValueKey('$k/${t.legs[k].points.length}/${t.legs[k].to}'),
          index: k,
          leg: t.legs[k],
          last: k == t.legs.length - 1,
          shown: k == t.leg ? _shown : null,
          keys: k == t.leg ? _stopKeys : null,
          changing: widget.changing,
          onChangeAt: widget.onChangeAt,
        ),
    ]);
  }
}

class _LegColumn extends StatefulWidget {
  const _LegColumn({super.key, required this.index, required this.leg, required this.last, required this.shown, required this.keys, required this.changing, required this.onChangeAt});
  final int index;
  final TripLeg leg;
  final bool last;

  /// Where the dot is, stops along: only on the part you're on.
  final ValueNotifier<double>? shown;
  final Map<int, GlobalKey>? keys;
  final bool changing;
  final void Function(int leg, int stop) onChangeAt;

  @override
  State<_LegColumn> createState() => _LegColumnState();
}

class _LegColumnState extends State<_LegColumn> {
  static const _railWidth = 34.0;
  final _box = GlobalKey();
  late final List<GlobalKey> _rows = [for (final _ in widget.leg.points) GlobalKey()];
  final _mids = ValueNotifier<List<double>>(const []);

  @override
  void dispose() {
    _mids.dispose();
    super.dispose();
  }

  // Where each stop's middle is, once it's laid out: a name that wraps makes its row taller.
  void _measure() {
    if (!mounted) return;
    final box = _box.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.hasSize) return;
    final mids = <double>[];
    for (final key in _rows) {
      final row = key.currentContext?.findRenderObject();
      if (row is! RenderBox || !row.hasSize) return;
      mids.add(row.localToGlobal(Offset(0, row.size.height / 2), ancestor: box).dy);
    }
    if (!_same(mids, _mids.value)) _mids.value = mids;
  }

  static bool _same(List<double> a, List<double> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if ((a[i] - b[i]).abs() > 0.5) return false;
    }
    return true;
  }

  String _name(int i) {
    final l = widget.leg;
    if (i < l.names.length && l.names[i].isNotEmpty) return l.names[i];
    if (i == l.points.length - 1) return l.to;
    if (i == 0) return l.ride ? tr('trip.whereGotOn', 'Where you got on') : tr('trip.whereSetOff', 'Where you set off');
    return tr('trip.stopN', 'Stop {n}', {'n': i + 1});
  }

  Widget? _tag(int i, SgColors sg) {
    final l = widget.leg;
    final end = l.points.length - 1;
    if (i == end) {
      final word = !l.ride
          ? (widget.last ? tr('trip.tag.arrive', 'Arrive') : tr('trip.tag.board', 'Board'))
          : (widget.last ? tr('trip.tag.getOff', 'Get off') : tr('trip.tag.change', 'Change'));
      return _Tag(icon: Icons.flag_outlined, word: word, colour: sg.brandInk);
    }
    if (l.ride && Trip.enabled && i == end - Trip.alertStops && i > 0) return _Tag(icon: Icons.notifications_outlined, word: tr('trip.tag.alert', 'Alert'), colour: sg.warn);
    return null;
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    final sg = context.sg;
    final l = widget.leg;
    final trip = Trip.I;
    final shown = widget.shown;
    final passed = shown?.value.floor() ?? -1;
    final also = Trip.directBuses(l);
    final way = Trip.loopWay(l);
    final end = l.points.length - 1;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(l.kind == 'train' ? Icons.directions_subway_filled : l.kind == 'walk' ? (l.foot == 'cycle' ? Icons.directions_bike : l.foot == 'drive' ? Icons.directions_car : Icons.directions_walk) : Icons.directions_bus, size: 20, color: sg.ink),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: l.label, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (way != null)
                TextSpan(text: ' (${way == 'cw' ? tr('trip.cwShort', 'CW') : tr('trip.acwShort', 'ACW')})', style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w700), semanticsLabel: way == 'cw' ? tr('trip.clockwise', 'Clockwise') : tr('trip.anticlockwise', 'Anticlockwise')),
              TextSpan(text: '  ${tr('trip.legTo', 'to {to}', {'to': l.to})}', style: TextStyle(color: sg.muted)),
            ])),
          ),
        ]),
        if (also.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('${tr('nav.alternate_buses', 'Also direct:')} ${also.join(', ')}', style: TextStyle(color: sg.muted, fontSize: 13)),
          ),
        const SizedBox(height: 4),
        Stack(key: _box, children: [
          Positioned.fill(
            child: IgnorePointer(
              child: CustomPaint(
                painter: _Rail(mids: _mids, shown: shown, ends: {end}, line: sg.border, done: sg.brandInk, node: sg.muted, fill: sg.bg),
              ),
            ),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (var i = 0; i <= end; i++) ..._row(i, passed, sg, trip),
          ]),
        ]),
      ]),
    );
  }

  List<Widget> _row(int i, int passed, SgColors sg, Trip trip) {
    final l = widget.leg;
    final end = l.points.length - 1;
    final code = l.codes != null && i < l.codes!.length ? l.codes![i] : null;
    final canChange = widget.changing && l.ride && i > 0 && (widget.shown == null || i > trip.pos) && !(i == end && widget.last);
    final past = i < passed;
    final at = i == passed;
    widget.keys?[i] = _rows[i];
    return [
      KeyedSubtree(
        key: _rows[i],
        child: InkWell(
          onTap: code == null || l.service == null ? null : () => StopScreen.open(code, service: l.service),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(_railWidth, 6, 0, 6),
              child: Row(children: [
                Expanded(
                  child: Tooltip(
                    message: code == null ? '' : tr('trip.timingsHere', 'Timings for {which} here', {'which': l.label}),
                    child: Text(
                      _name(i),
                      style: TextStyle(fontWeight: at || i == end ? FontWeight.w700 : null, color: past ? sg.muted : sg.ink),
                    ),
                  ),
                ),
                if (canChange)
                  Tooltip(
                    message: tr('trip.changeHereTitle', 'Get off here and go on another way'),
                    child: OutlinedButton(onPressed: () => widget.onChangeAt(widget.index, i), child: Text(tr('trip.changeHere', 'Change here'))),
                  )
                else
                  ?_tag(i, sg),
              ]),
            ),
          ),
        ),
      ),
    ];
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.word, required this.colour});
  final IconData icon;
  final String word;
  final Color colour;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 8),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 16, color: colour),
          const SizedBox(width: 3),
          Text(word, style: TextStyle(color: colour, fontSize: 13, fontWeight: FontWeight.w600)),
        ]),
      );
}

/// The line down a part's stops: the way done filled in, a node for each stop, and the dot.
class _Rail extends CustomPainter {
  _Rail({required this.mids, required this.shown, required this.ends, required this.line, required this.done, required this.node, required this.fill})
      : super(repaint: Listenable.merge([mids, ?shown]));
  final ValueNotifier<List<double>> mids;
  final ValueNotifier<double>? shown;
  final Set<int> ends;
  final Color line, done, node, fill;

  static const _x = 15.0;
  static const blue = Color(0xFF2F7DFF);

  @override
  void paint(Canvas canvas, Size size) {
    final ys = mids.value;
    if (ys.isEmpty) return;
    final at = shown?.value;
    final rule = Paint()..strokeWidth = 3..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(_x, ys.first), Offset(_x, ys.last), rule..color = line);
    double? y;
    if (at != null) {
      final i = at.floor().clamp(0, ys.length - 1);
      y = i >= ys.length - 1 ? ys[i] : ys[i] + (at - i) * (ys[i + 1] - ys[i]);
      canvas.drawLine(Offset(_x, ys.first), Offset(_x, y), rule..color = done);
    }
    for (var i = 0; i < ys.length; i++) {
      final passed = at != null && i <= at;
      final r = ends.contains(i) ? 6.5 : 4.5;
      canvas.drawCircle(Offset(_x, ys[i]), r, Paint()..color = passed ? done : fill);
      canvas.drawCircle(Offset(_x, ys[i]), r, Paint()..color = passed ? done : node..style = PaintingStyle.stroke..strokeWidth = 2);
    }
    if (y != null) {
      canvas.drawCircle(Offset(_x, y), 13, Paint()..color = blue.withValues(alpha: 0.2));
      canvas.drawCircle(Offset(_x, y), 8, Paint()..color = Colors.white);
      canvas.drawCircle(Offset(_x, y), 6, Paint()..color = blue);
    }
  }

  @override
  bool shouldRepaint(_Rail old) => old.line != line || old.done != done || old.node != node || old.fill != fill || old.shown != shown || old.mids != mids;
}

/// The buses that also go straight from a bus leg's first stop to its last, as BusNet has them.
List<String> directBusesOf(TripLeg leg) {
  if (leg.kind != 'bus' || leg.service == null || leg.board == null || leg.alight == null || !BusNet.ready) return const [];
  final own = leg.service!.toUpperCase();
  return BusNet.servicesAtStop(leg.board!).where((no) {
    if (no.toUpperCase() == own) return false;
    return BusNet.directions(no).any((dir) {
      final stops = BusNet.runStops(no, dir);
      final i = stops.indexOf(leg.board!);
      return i != -1 && stops.indexOf(leg.alight!, i + 1) != -1;
    });
  }).toList();
}
