// The live map's card for a stop or station tapped on it (the site's js/map-card.js): Explorer's
// dots, and the stops and stations drawn on a trip or a walk. It opens out of the dot like a chat
// bubble, its tail on the dot, and stays there as the map moves.
//
//   A bus stop   its number and name, and every bus that calls there as a pill to tap, for that
//                bus's timings at the stop: green while it's running, grey while it isn't
//                (outside today's first and last bus), red once its last three buses of the day
//                are all that's left.
//   A station    its name, its codes in their lines' colours, and a page for each platform, a
//                direction each, with arrows at the sides (or a swipe): the doors nearest the
//                escalators, lifts and stairs, and where each leads (data/doors.dart).
//
// Both end with Directions: Navigate's Bus and train, from where you are. A stop's has Show bus
// timings above it.
import 'package:flutter/material.dart';

import '../../api/net.dart';
import '../../data/campus.dart';
import '../../data/arrivals.dart';
import '../../data/doors.dart';
import '../../data/network.dart';
import '../../data/stops.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../nav/doors.dart';
import '../timings/campus_ui.dart';
import 'live_map.dart';

class MapCardBubble extends StatefulWidget {
  const MapCardBubble({
    super.key,
    required this.pick,
    required this.at,
    required this.area,
    required this.topLimit,
    required this.onClose,
    required this.onTimings,
    required this.onDirections,
  });
  final MapPick pick;
  final Offset at; // the dot, on the screen
  final Size area;
  final double topLimit;
  final VoidCallback onClose;
  final void Function(String code, String? service) onTimings;
  final void Function(String label, double lat, double lng) onDirections;

  @override
  State<MapCardBubble> createState() => _MapCardBubbleState();
}

class _MapCardBubbleState extends State<MapCardBubble> {
  static const _lastMin = 30;
  final _key = GlobalKey();
  Size _size = const Size(300, 200);
  Map<String, List<double>>? _etas;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    if (widget.pick.kind == 'stop') {
      if (!BusNet.ready) BusNet.load().then((_) => mounted ? setState(() {}) : null).catchError((_) {});
      Arrivals.fetch(widget.pick.code!).then((a) {
        final etas = <String, List<double>>{};
        for (final s in a.services) {
          for (final b in s.buses) {
            if (b?.etaMs != null) (etas[s.serviceNo] ??= []).add(b!.etaMs! / 60000);
          }
        }
        for (final l in etas.values) {
          l.sort();
        }
        if (mounted) setState(() => _etas = etas);
      }).catchError((_) {});
    } else if (widget.pick.kind == 'campus') {
      // Nothing to fetch: the shuttles' times come from the timetable.
    } else if (!MrtDoors.ready) {
      MrtDoors.load().then((_) => mounted ? setState(() {}) : null);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  void _measure() {
    final s = _key.currentContext?.size;
    if (s != null && s != _size && mounted) setState(() => _size = s);
  }

  static int? _toMin(String s) => RegExp(r'^\d\d:\d\d$').hasMatch(s) ? int.parse(s.substring(0, 2)) * 60 + int.parse(s.substring(3)) : null;

  /// 'on', 'last' or 'off' for a bus at a stop.
  String _state(String no, String code, List<double>? etas) {
    final fl = BusNet.ready ? BusNet.firstLast(no, code) : null;
    final first = fl == null ? null : _toMin(fl.first);
    final last = fl == null ? null : _toMin(fl.last);
    final sg = DateTime.now().toUtc().add(const Duration(hours: 8));
    final now = sg.hour * 60 + sg.minute;
    var running = false;
    int? left;
    if (first != null && last != null) {
      if (last >= first) {
        running = now >= first && now <= last;
        left = last - now;
      } else {
        running = now >= first || now <= last;
        left = (now >= first ? last + 1440 : last) - now;
      }
    }
    if (etas != null && etas.isNotEmpty) running = true;
    if (!running) return 'off';
    if (left != null && left >= 0 && ((etas?.length ?? 0) >= 3 ? left <= etas![2] + 1 : left <= _lastMin)) return 'last';
    return 'on';
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    final sg = context.sg;
    final w = (widget.area.width - 32).clamp(240.0, 380.0);
    const gap = 16.0;
    final below = widget.at.dy - gap - _size.height < widget.topLimit;
    final x = (widget.at.dx - w / 2).clamp(8.0, widget.area.width - w - 8);
    final y = below ? (widget.at.dy + gap).clamp(0.0, widget.area.height - _size.height - 8) : widget.at.dy - gap - _size.height;
    final tail = (widget.at.dx - x).clamp(20.0, w - 20);
    final off = widget.at.dx < -20 || widget.at.dy < -20 || widget.at.dx > widget.area.width + 20 || widget.at.dy > widget.area.height + 20;
    return Positioned(
      left: x,
      top: y,
      width: w,
      child: Visibility(
        visible: !off,
        maintainState: true,
        maintainSize: true,
        maintainAnimation: true,
        child: CustomPaint(
          painter: _Tail(tail, below, sg.surfaceStrong),
          child: Material(
            key: _key,
            color: sg.surfaceStrong,
            elevation: LiveMap.preview ? 0 : 6,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: LiveMap.preview ? BorderSide(color: sg.border) : BorderSide.none),
            child: Semantics(
              scopesRoute: true,
              explicitChildNodes: true,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 8, 12),
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: widget.area.height * 0.55),
                  child: SingleChildScrollView(child: switch (widget.pick.kind) { 'stop' => _stop(), 'campus' => _campus(), _ => _station() }),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _head(List<Widget> children) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ...children,
        IconButton(visualDensity: VisualDensity.compact, tooltip: tr('common.close', 'Close'), onPressed: widget.onClose, icon: const Icon(Icons.close, size: 20)),
      ]);

  Widget _button(IconData icon, String label, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(top: 8, right: 6),
        child: SizedBox(width: double.infinity, child: FilledButton.tonalIcon(onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label))),
      );

  Widget _stop() {
    final sg = context.sg;
    final code = widget.pick.code!;
    final s = Stops.of(code);
    final buses = BusNet.ready ? BusNet.servicesAtStop(code) : const <String>[];
    const colours = {'on': Color(0xFF1F9D55), 'last': Color(0xFFD1242F), 'off': Color(0xFF8A9590)};
    Widget key(String st, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: colours[st], shape: BoxShape.circle)),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 12, color: sg.muted)),
          const SizedBox(width: 10),
        ]);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _head([
        Container(
          margin: const EdgeInsets.only(top: 8, right: 10),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: sg.badge, borderRadius: BorderRadius.circular(8)),
          child: Text(code, style: TextStyle(color: sg.onBadge, fontWeight: FontWeight.w700)),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s?.name.isNotEmpty == true ? s!.name : tr('favs.stopNoName', 'Bus stop'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              if (s?.road.isNotEmpty == true) Text(s!.road, style: TextStyle(color: sg.muted, fontSize: 13)),
            ]),
          ),
        ),
      ]),
      const SizedBox(height: 6),
      if (buses.isEmpty)
        Text(tr('mapCard.noBuses', 'No buses call here.'), style: TextStyle(color: sg.muted))
      else
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final no in buses)
            () {
              final st = _state(no, code, _etas == null ? null : (_etas![no] ?? const []));
              final what = switch (st) {
                'on' => tr('mapCard.running', 'running'),
                'last' => tr('mapCard.lastThree', 'last 3 buses of the day'),
                _ => tr('mapCard.notRunning', 'not running now'),
              };
              return Tooltip(
                message: tr('mapCard.pillTitle', 'Bus {no}: {what}. Its timings here', {'no': no, 'what': what}),
                child: Material(
                  color: colours[st],
                  shape: const StadiumBorder(),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: () => widget.onTimings(code, no),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: Text(no, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              );
            }(),
        ]),
      if (buses.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(runSpacing: 4, children: [
            key('on', tr('mapCard.keyRunning', 'Running')),
            key('last', tr('mapCard.keyLast', 'Last 3 buses')),
            key('off', tr('mapCard.keyOff', 'Not running now')),
          ]),
        ),
      // Shuttle buses here too, live where they're seen.
      CampusList(stopKey: code, card: false),
      // Offline, Bus timings is away.
      if (!Net.off.value) _button(Icons.schedule, tr('mapCard.showTimings', 'Show bus timings'), () => widget.onTimings(code, null)),
      if (s?.lat != null) _button(Icons.directions, tr('stop.tool.directions', 'Directions'), () => widget.onDirections(s!.name, s.lat!, s.lng!)),
    ]);
  }

  // A shuttle bus stop LTA hasn't got: its university, name and road, its shuttles' times.
  Widget _campus() {
    final sg = context.sg;
    final s = Campus.at(widget.pick.code!);
    if (s == null) return _head([const Expanded(child: SizedBox())]);
    final uni = Campus.uniName(s.uni);
    final colour = Campus.uniColour(s.uni);
    // A code worth showing: the postcode a campus stop goes by, not a made-up id.
    final code = RegExp(r'^\d+$').hasMatch(s.id) ? ' ${s.id}' : '';
    return Semantics(
      label: tr('campus.card', '{uni} shuttle stop {name}', {'uni': uni, 'name': s.name}),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _head([
          Container(
            margin: const EdgeInsets.only(top: 8, right: 10),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: colour, borderRadius: BorderRadius.circular(8)),
            child: Text(uni, style: TextStyle(color: colour.computeLuminance() > 0.45 ? Colors.black : Colors.white, fontWeight: FontWeight.w700)),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                if (s.road.isNotEmpty || code.isNotEmpty) Text('${s.road}$code', style: TextStyle(color: sg.muted, fontSize: 13)),
              ]),
            ),
          ),
        ]),
        CampusList(stopKey: s.key, card: false),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(tr('campus.timetableNote', 'Shuttle times are from the timetable, and live where the operator shares them.'), style: TextStyle(color: sg.muted, fontSize: 12)),
        ),
        _button(Icons.directions, tr('stop.tool.directions', 'Directions'), () => widget.onDirections(s.name, s.lat, s.lng)),
      ]),
    );
  }

  String _lead(String x) {
    if (x == 'Exit') return tr('mapCard.theExit', 'the exit');
    final toward = RegExp(r'^(.*\b(?:Line|LRT)) towards (.+)$').firstMatch(x);
    if (toward != null) return tr('mapCard.lineTowards', 'the {line} towards {to}', {'line': toward[1], 'to': toward[2]});
    return RegExp(r'\b(Line|LRT)$').hasMatch(x) ? tr('mapCard.theLine', 'the {line}', {'line': x}) : x;
  }

  String _and(List<String> xs) => xs.length < 2 ? xs.join() : '${xs.sublist(0, xs.length - 1).join(', ')}${tr('trip.and', ' and ')}${xs.last}';

  Widget _station() {
    final sg = context.sg;
    final p = widget.pick;
    final name = tr('mapCard.station', '{name} station', {'name': p.name});
    final slides = MrtDoors.ready ? MrtDoors.station(p.codes) : const <Platform>[];
    Widget body;
    if (!MrtDoors.ready) {
      body = Text(tr('mapCard.findingDoors', 'Finding the doors…'), style: TextStyle(color: sg.muted));
    } else if (slides.isEmpty) {
      body = Text(tr('mapCard.noDoorsStation', 'No door details for this station yet.'), style: TextStyle(color: sg.muted));
    } else {
      final i = _page % slides.length;
      final s = slides[i];
      final line = lineColour(s.code);
      final page = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _code(s.code),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.last ? tr('mapCard.endHere', 'Trains end here') : tr('mapCard.towards', 'Towards {to}', {'to': s.towards}), style: const TextStyle(fontWeight: FontWeight.w700)),
              if (s.next != null) Text(tr('mapCard.next', 'Next: {stn}', {'stn': s.next}), style: TextStyle(color: sg.muted, fontSize: 13)),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        if (s.rows.isEmpty)
          Text(tr('mapCard.noDoorsPlatform', 'No door details for this platform yet.'), style: TextStyle(color: sg.muted))
        else ...[
          for (final r in s.rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: DoorRowView(
                icon: doorIcon(r.type),
                doors: r.doors,
                where: tr('mapCard.typeTo', '{type} to {places}', {'type': doorType(r.type), 'places': _and(r.places.map(_lead).toList())}),
                line: line,
              ),
            ),
          DoorFoot(s.numberAt, line: line),
        ],
        if (s.cross.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(children: [
              Icon(Icons.swap_horiz, size: 18, color: sg.muted),
              const SizedBox(width: 4),
              Expanded(child: Text(tr('mapCard.across', 'Across the platform: {lines}', {'lines': _and(s.cross)}), style: TextStyle(color: sg.muted, fontSize: 13))),
            ]),
          ),
      ]);
      body = Column(children: [
        GestureDetector(
          onHorizontalDragEnd: (d) {
            final v = d.primaryVelocity ?? 0;
            if (v.abs() > 200 && slides.length > 1) setState(() => _page += v < 0 ? 1 : -1 + slides.length);
          },
          child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            if (slides.length > 1)
              IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Previous direction',
                  onPressed: () => setState(() => _page = (_page - 1 + slides.length) % slides.length),
                  icon: const Icon(Icons.chevron_left)),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: KeyedSubtree(key: ValueKey(i), child: Semantics(liveRegion: true, child: page)),
              ),
            ),
            if (slides.length > 1)
              IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Next direction',
                  onPressed: () => setState(() => _page = (_page + 1) % slides.length),
                  icon: const Icon(Icons.chevron_right)),
          ]),
        ),
        if (slides.length > 1) Text('${i + 1} of ${slides.length}', style: TextStyle(color: sg.muted, fontSize: 12)),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _head([
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.name!, semanticsLabel: name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 4),
              Wrap(spacing: 4, runSpacing: 4, children: [for (final c in p.codes) _code(c)]),
            ]),
          ),
        ),
      ]),
      const SizedBox(height: 8),
      body,
      _button(Icons.directions, tr('stop.tool.directions', 'Directions'), () => widget.onDirections(name, p.lat!, p.lng!)),
    ]);
  }

  Widget _code(String c) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(color: lineColour(c), borderRadius: BorderRadius.circular(6)),
        child: Text(c, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
      );
}

/// The bubble's tail, on the dot: under the card, or over it when the card's below the dot.
class _Tail extends CustomPainter {
  _Tail(this.x, this.below, this.colour);
  final double x;
  final bool below;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Path();
    if (below) {
      p
        ..moveTo(x - 10, 1)
        ..lineTo(x, -12)
        ..lineTo(x + 10, 1);
    } else {
      p
        ..moveTo(x - 10, size.height - 1)
        ..lineTo(x, size.height + 12)
        ..lineTo(x + 10, size.height - 1);
    }
    canvas.drawPath(p, Paint()..color = colour);
  }

  @override
  bool shouldRepaint(_Tail old) => old.x != x || old.below != below || old.colour != colour;
}
