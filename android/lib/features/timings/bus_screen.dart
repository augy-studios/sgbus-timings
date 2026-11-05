// A bus's route (the site's bus service window, script.js's openService): where it runs and
// via which landmarks, its operator and category, each direction as a tab, and every stop in
// order, your favourite stops first in a section of their own. Opened from a stop on its route,
// From <stop> shows the stops still ahead, "Here", "+1", "+2"..., and the stop it came from is
// picked out in the full list.
import 'package:flutter/material.dart';

import '../../app/links.dart';
import '../../app/nav.dart';
import '../../data/favs.dart';
import '../../data/network.dart';
import '../../data/stops.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/share.dart';
import 'stop_screen.dart';

class BusScreen extends StatefulWidget {
  const BusScreen({super.key, required this.no, this.fromStop, this.onward = false, this.dir});
  final String no;
  final String? fromStop;
  final bool onward;
  final int? dir;

  static Future<void> open(String no, {String? fromStop, bool onward = false, int? dir}) async {
    no = no.toUpperCase();
    try {
      await Stops.load();
      await BusNet.load();
    } catch (_) {
      AppNav.say(tr('route.loadFailed', 'Could not load route information.'));
      return;
    }
    if (!BusNet.hasService(no)) {
      AppNav.say('No route found for bus $no.');
      return;
    }
    AppNav.push(BusScreen(no: no, fromStop: fromStop, onward: onward, dir: dir), name: 'bus');
  }

  @override
  State<BusScreen> createState() => _BusScreenState();
}

class _BusScreenState extends State<BusScreen> {
  late String? _from;
  late bool _onward;
  late int _dir;

  String get no => widget.no;

  @override
  void initState() {
    super.initState();
    final dirs = BusNet.directions(no);
    final onRoute = widget.fromStop != null && dirs.any((d) => BusNet.runStops(no, d).contains(widget.fromStop));
    final fits = widget.dir != null && dirs.contains(widget.dir) && (!onRoute || BusNet.runStops(no, widget.dir!).contains(widget.fromStop));
    _from = onRoute ? widget.fromStop : null;
    _onward = widget.onward && onRoute;
    _dir = fits ? widget.dir! : (onRoute ? BusNet.directionAt(no, widget.fromStop!)! : (dirs.isEmpty ? 1 : dirs.first));
    Favs.I.addListener(_redraw);
  }

  @override
  void dispose() {
    Favs.I.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() => setState(() {});

  String _name(String c) => Stops.nameOf(c).isEmpty ? c : Stops.nameOf(c);
  String _label(String? c) => c == null ? '-' : '${_name(c)} ($c)';

  String _dirLabel(int d) {
    final stops = BusNet.runStops(no, d);
    final ends = BusNet.serviceInfo(no)?.dirs[d] ?? const [];
    final o = ends.isNotEmpty ? ends[0] : (stops.isEmpty ? '' : stops.first);
    final e = ends.length > 1 ? ends[1] : (stops.isEmpty ? '' : stops.last);
    return '${_name(o)} → ${_name(e)}';
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final dirs = BusNet.directions(no);
    final info = BusNet.serviceInfo(no);
    final t = BusNet.terminals(no);
    final isLoop = t.loop.isNotEmpty || (t.origin != null && t.origin == t.dest);
    List<String> codes;
    if (_onward) {
      final found = BusNet.onwardFrom(no, _from!, _dir);
      _dir = found.dir ?? _dir;
      codes = found.stops;
    } else {
      codes = BusNet.runStops(no, _dir);
    }
    final summary = isLoop
        ? (t.loop.isNotEmpty
            ? tr('route.loopAt', 'Loop service, starting and ending at {stop} (loops at {loop})', {'stop': _label(t.origin), 'loop': t.loop})
            : tr('route.loop', 'Loop service, starting and ending at {stop}', {'stop': _label(t.origin)}))
        : '${_label(t.origin)} → ${_label(t.dest)}${t.directions > 1 ? tr('route.andBack', ' (and back)') : ''}';
    final via = BusNet.landmarks(codes);
    final favs = Favs.I.stops().map((f) => f.code).toSet();
    final saved = Favs.I.isBus(no);

    Widget row(String code, String seq) {
      final me = code == _from && !_onward;
      final border = BusNet.crossBorder(code);
      return Material(
        color: me ? sg.brand.withValues(alpha: 0.55) : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => StopScreen.open(code, service: no, ctx: StopContext('service', service: no, dir: _dir), dir: _dir),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            child: Row(children: [
              SizedBox(width: 44, child: Text(seq, style: TextStyle(color: sg.muted, fontWeight: FontWeight.w600))),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    if (favs.contains(code)) Icon(Icons.star_rounded, size: 16, color: sg.warn),
                    Flexible(child: Text(_name(code), style: const TextStyle(fontSize: 16))),
                  ]),
                  if (BusNet.restricted(code) != null)
                    Text(tr('stop.restrictedShort', 'Authorised personnel only'), style: TextStyle(color: sg.muted, fontSize: 12)),
                  if (border != null)
                    Text(tr('stop.passport', '{place}: passport needed', {'place': border.label()}), style: TextStyle(color: sg.muted, fontSize: 12)),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: sg.surfaceStrong, borderRadius: BorderRadius.circular(10), border: Border.all(color: sg.border)),
                child: Text(code, style: TextStyle(fontSize: 12, color: sg.muted)),
              ),
            ]),
          ),
        ),
      );
    }

    final rows = <Widget>[];
    if (_onward) {
      for (var i = 0; i < codes.length; i++) {
        rows.add(row(codes[i], i == 0 ? tr('route.here', 'Here') : '+$i'));
      }
    } else {
      final all = [for (var i = 0; i < codes.length; i++) row(codes[i], '${i + 1}')];
      final favCodes = codes.where(favs.contains).toList();
      if (favCodes.isNotEmpty) {
        final favPart = [
          SectionLabel(tr('route.favsOn', 'Your favourite stops on {no}', {'no': no})),
          for (final c in favCodes) row(c, '${codes.indexOf(c) + 1}'),
        ];
        final allPart = [SectionLabel(tr('route.allStops', 'All stops')), ...all];
        rows.addAll(Favs.I.pin('stop') == 'bottom' ? [...allPart, ...favPart] : [...favPart, ...allPart]);
      } else {
        rows.addAll(all);
      }
    }

    final toGo = codes.length - 1;
    return Scaffold(
      appBar: AppBar(
        title: Text(tr('favs.bus', 'Bus {no}', {'no': no})),
        actions: [
          IconButton(
            tooltip: tr('nav.share', 'Share'),
            icon: const Icon(Icons.share_outlined),
            onPressed: () => shareLink(context, Links.bus(no), tr('favs.bus', 'Bus {no}', {'no': no})),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          SgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: BusBadge(no, size: 34)),
                FilledButton.tonalIcon(
                  onPressed: () => Favs.I.toggleBus(no),
                  icon: Icon(saved ? Icons.star_rounded : Icons.star_outline_rounded),
                  label: Text(saved ? tr('stop.saved', 'Saved') : tr('route.save_bus', 'Save bus')),
                ),
              ]),
              const SizedBox(height: 10),
              _Meta(tr('route.meta.route', 'Route:'), summary),
              if (via.isNotEmpty) _Meta(tr('route.meta.via', 'Via:'), via.join(' → ')),
              _Meta(tr('route.meta.operator', 'Operator:'), (info?.op ?? '').isEmpty ? '-' : info!.op),
              if ((info?.cat ?? '').isNotEmpty) _Meta(tr('route.meta.category', 'Category:'), info!.cat),
            ]),
          ),
          const SizedBox(height: 12),
          if (_from != null)
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: false, label: Text(tr('route.whole_route', 'Whole route'))),
                ButtonSegment(value: true, label: Text(tr('route.from', 'From {stop}', {'stop': _name(_from!)}), overflow: TextOverflow.ellipsis)),
              ],
              selected: {_onward},
              onSelectionChanged: (s) => setState(() => _onward = s.first),
            ),
          if (!_onward && dirs.length > 1) ...[
            const SizedBox(height: 8),
            for (final d in dirs)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Pill(label: _dirLabel(d), on: d == _dir, onTap: () => setState(() => _dir = d)),
              ),
          ],
          if (_onward)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                toGo > 0
                    ? (toGo == 1
                        ? tr('route.oneToGo', '1 stop to go, ending at {stop}', {'stop': _label(codes.last)})
                        : tr('route.manyToGo', '{n} stops to go, ending at {stop}', {'n': toGo, 'stop': _label(codes.last)}))
                    : tr('route.lastStop', "This is the last stop on bus {no}'s route; there's nothing further to go.", {'no': no}),
                style: TextStyle(color: sg.muted),
              ),
            ),
          const SizedBox(height: 8),
          if (rows.isEmpty) EmptyNote(tr('route.noData', 'No route data.')) else ...rows,
        ],
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta(this.label, this.text);
  final String label;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 3),
        child: Text.rich(TextSpan(children: [
          TextSpan(text: '$label ', style: const TextStyle(fontWeight: FontWeight.w700)),
          TextSpan(text: text),
        ])),
      );
}
