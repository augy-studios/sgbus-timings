// Shuttle buses in Bus timings and on the map (data/campus.dart), as the site's script.js and
// js/map-card.js show them: a stop's shuttles under its live buses, each route's colour and what
// its timetable says, under a heading that says they're scheduled times, not live, with the
// next bus seen live where the operator shares it; a campus stop LTA hasn't got ("PGP") as a
// stop of its own, with its shuttles and no public buses; and a route's own window, what its
// timetable says now from where it starts and its stops in order. A route that has ended
// (shuttles.json's `ends`) stays, as Discontinued in place of its times, and isn't looked up live.
// ShuttleEndsNotice tops a way or a trip that rides one that's ending.
import 'package:material_ui/material_ui.dart';

import '../../app/nav.dart';
import '../../data/campus.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import 'stop_screen.dart';

void registerCampus() {
  AppNav.register('campusStop', (a) => CampusStopScreen.open('${a['key']}'));
  AppNav.register('campusRoute', (a) => CampusRouteScreen.open('${a['key']}'));
}

/// A route's code on its colour, as the site's .campusNo.
class CampusBadge extends StatelessWidget {
  const CampusBadge(this.route, {super.key, this.size = 13});
  final CampusRoute route;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minWidth: 44),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: route.color, borderRadius: BorderRadius.circular(8)),
        child: Text(route.code, textAlign: TextAlign.center, style: TextStyle(color: Campus.inkOn(route.colour), fontWeight: FontWeight.w800, fontSize: size)),
      );
}

/// At the top of a way or a trip that rides a shuttle service that's ending (Campus.ending): "IKEA's
/// shuttle bus service ends on 31 Dec 2026.", a line for each such service. Nothing when there's
/// none, as after the end, when no way rides it.
class ShuttleEndsNotice extends StatelessWidget {
  const ShuttleEndsNotice(this.ending, {super.key, this.padding = const EdgeInsets.only(top: 8)});
  final List<({String name, String ends})> ending;
  final EdgeInsets padding;

  static String text(({String name, String ends}) e) =>
      tr('nav.shuttle.ends', "{name}'s shuttle bus service ends on {date}.", {'name': e.name, 'date': When.dateYear(e.ends)});

  @override
  Widget build(BuildContext context) {
    if (ending.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: padding,
      child: Semantics(
        container: true,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          decoration: BoxDecoration(color: scheme.secondaryContainer, borderRadius: BorderRadius.circular(12)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.event_busy_outlined, size: 20, color: scheme.onSecondaryContainer),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final e in ending) Text(text(e), style: TextStyle(color: scheme.onSecondaryContainer, fontWeight: FontWeight.w600)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// The shuttle buses at a stop, by its key (an LTA code, or a campus stop's id): nothing when it
/// has none. Loads the shuttles the first time.
class CampusList extends StatefulWidget {
  const CampusList({super.key, required this.stopKey, this.card = true});
  final String stopKey;
  final bool card;

  @override
  State<CampusList> createState() => _CampusListState();
}

class _CampusListState extends State<CampusList> {
  final Map<String, int?> _live = {};

  @override
  void initState() {
    super.initState();
    if (!Campus.ready) {
      Campus.load().then((_) => _then()).catchError((_) {});
    } else {
      _then();
    }
  }

  void _then() {
    if (!mounted) return;
    setState(() {});
    final stop = Campus.at(widget.stopKey);
    for (final x in stop?.routes ?? const <({CampusRoute route, int i})>[]) {
      // Not one that has ended (canLive says so).
      if (!Campus.canLive(x.route, widget.stopKey)) continue;
      Campus.live(x.route, widget.stopKey).then((eta) {
        if (mounted) setState(() => _live[x.route.key] = eta);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final stop = Campus.at(widget.stopKey);
    if (stop == null || stop.routes.isEmpty) return const SizedBox.shrink();
    final sg = context.sg;
    final ms = When.nowMs();
    final seasons = <String>{};
    final rows = <Widget>[];
    for (final x in stop.routes) {
      final r = x.route;
      // Ended: listed still, as Discontinued in place of its times.
      final gone = Campus.ended(r, ms);
      final st = Campus.status(r, x.i, ms);
      if (st.season != null && !gone) seasons.add('${r.uni}:${st.season}');
      final d = gone ? (main: tr('campus.discontinued', 'Discontinued'), sub: '') : Campus.describe(st, Campus.nameIn(r));
      final off = gone || st.state == 'done' || st.state == 'notToday';
      final terms = [
        if (r.fare == 'paid') r.fareText.isNotEmpty ? r.fareText : tr('nav.shuttle.paid', 'Paid'),
        if (r.access == 'guests') tr('nav.shuttle.guests', 'Hotel guests only'),
        if (r.access == 'residents') tr('nav.shuttle.residents', 'Residents only'),
      ];
      final live = gone ? null : _live[r.key];
      rows.add(InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => CampusRouteScreen.open(r.key),
        child: Opacity(
          opacity: off ? 0.6 : 1,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Tooltip(
                message: r.name.isNotEmpty ? r.name : tr('campus.routeTitle', '{uni} shuttle {route}', {'uni': Campus.uniName(r.uni), 'route': r.code}),
                child: CampusBadge(r),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(d.main, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text([Campus.uniName(r.uni), if (d.sub.isNotEmpty) d.sub, ...terms].join(' · '), style: TextStyle(color: sg.muted, fontSize: 13)),
                  if (live != null)
                    Text(live <= 0 ? tr('campus.liveNow', 'Live: arriving') : tr('campus.liveMin', 'Live: {n} min', {'n': '$live'}),
                        style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w600, fontSize: 13)),
                ]),
              ),
            ]),
          ),
        ),
      ));
    }
    if (rows.isEmpty) return const SizedBox.shrink();
    final notes = [
      for (final s in seasons)
        () {
          final [uni, which] = s.split(':');
          final name = Campus.uniName(uni);
          return which == 'term' ? tr('campus.termTimes', '{uni} term timings', {'uni': name}) : tr('campus.vacationTimes', '{uni} vacation timings', {'uni': name});
        }()
    ];
    final body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(Icons.schedule, size: 18, color: sg.muted),
        const SizedBox(width: 6),
        Expanded(
          child: Text.rich(TextSpan(children: [
            TextSpan(text: tr('campus.shuttles', 'Shuttle buses'), style: const TextStyle(fontWeight: FontWeight.w700)),
            TextSpan(text: ' · ${tr('campus.scheduled', 'scheduled times, not live')}', style: TextStyle(color: sg.muted)),
          ])),
        ),
      ]),
      const SizedBox(height: 4),
      ...rows,
      if (notes.isNotEmpty) Text(notes.join(' · '), style: TextStyle(color: sg.muted, fontSize: 12)),
    ]);
    return Padding(padding: const EdgeInsets.only(top: 12), child: widget.card ? SgCard(child: body) : body);
  }
}

/// A campus stop LTA hasn't got, as Bus timings shows a stop: its university, name and road,
/// and its shuttles' scheduled times. No live buses stop there.
class CampusStopScreen extends StatefulWidget {
  const CampusStopScreen({super.key, required this.stopKey});
  final String stopKey;

  static Future<void> open(String key) async {
    if (!Campus.ready) {
      try {
        await Campus.load();
      } catch (_) {}
    }
    final s = Campus.at(key);
    if (s == null) return;
    if (s.lta) return StopScreen.open(key);
    AppNav.push(CampusStopScreen(stopKey: key), name: 'campusStop');
  }

  @override
  State<CampusStopScreen> createState() => _CampusStopScreenState();
}

class _CampusStopScreenState extends State<CampusStopScreen> {
  int _round = 0;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final s = Campus.at(widget.stopKey)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.name, overflow: TextOverflow.ellipsis),
        actions: [IconButton(tooltip: tr('stop.refresh', 'Refresh'), onPressed: () => setState(() => _round++), icon: const Icon(Icons.refresh))],
      ),
      body: ListView(padding: EdgeInsets.fromLTRB(16, 0, 16, 32 + MediaQuery.paddingOf(context).bottom), children: [
        SgCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(Campus.uniName(s.uni), style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: 1)),
            const SizedBox(height: 2),
            Text(s.name, style: Theme.of(context).textTheme.headlineSmall),
            if (s.road.isNotEmpty) Text(s.road, style: TextStyle(color: sg.muted)),
          ]),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          Pill(
            icon: Icons.directions_walk,
            label: tr('stop.tool.directions', 'Directions'),
            onTap: () => AppNav.open('mapPlace', {'place': '${s.lat},${s.lng}~${s.name}'}),
          ),
        ]),
        const SizedBox(height: 4),
        EmptyNote(tr('campus.shuttleStopNote', 'Only shuttle buses stop here, so there are no public buses.')),
        CampusList(key: ValueKey(_round), stopKey: s.key),
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Text(tr('campus.timetableNote', 'Shuttle times are from the timetable, and live where the operator shares them.'), style: TextStyle(color: sg.muted, fontSize: 13)),
        ),
      ]),
    );
  }
}

/// A shuttle's route in a window of its own: what its timetable says now from where it starts,
/// and its stops in order, each opening its times.
class CampusRouteScreen extends StatelessWidget {
  const CampusRouteScreen({super.key, required this.routeKey});
  final String routeKey;

  static Future<void> open(String key) async {
    if (!Campus.ready) {
      try {
        await Campus.load();
      } catch (_) {}
    }
    if (Campus.route(key) == null) return;
    AppNav.push(CampusRouteScreen(routeKey: key), name: 'campusRoute');
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final r = Campus.route(routeKey)!;
    final now = Campus.ended(r)
        ? (main: tr('campus.discontinued', 'Discontinued'), sub: '')
        : Campus.describe(Campus.status(r, 0, When.nowMs()), Campus.nameIn(r));
    return Scaffold(
      appBar: AppBar(title: Text(tr('campus.routeTitle', '{uni} shuttle {route}', {'uni': Campus.uniName(r.uni), 'route': r.code}), overflow: TextOverflow.ellipsis)),
      body: ListView(padding: EdgeInsets.fromLTRB(16, 0, 16, 32 + MediaQuery.paddingOf(context).bottom), children: [
        SgCard(
          child: Row(children: [
            CampusBadge(r, size: 16),
            const SizedBox(width: 12),
            Expanded(
              child: Text.rich(TextSpan(children: [
                TextSpan(text: now.main, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (now.sub.isNotEmpty) TextSpan(text: ' · ${now.sub}', style: TextStyle(color: sg.muted)),
              ])),
            ),
          ]),
        ),
        if (r.name.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(r.name, style: TextStyle(color: sg.muted))),
        const SizedBox(height: 8),
        for (var i = 0; i < r.ids.length; i++)
          () {
            final k = r.keys[i];
            final s = k == null ? null : Campus.at(k);
            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: Container(width: 12, height: 12, decoration: BoxDecoration(color: r.color, shape: BoxShape.circle)),
              title: Text(s?.name ?? r.ids[i]),
              subtitle: (s?.road ?? '').isNotEmpty ? Text(s!.road) : null,
              trailing: s?.lta == true ? Pill(label: s!.key) : null,
              onTap: s == null ? null : () => s.lta ? StopScreen.open(s.key) : CampusStopScreen.open(s.key),
            );
          }(),
        if (r.loop) Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr('campus.loopNote', 'A loop: it ends where it starts.'), style: TextStyle(color: sg.muted))),
      ]),
    );
  }
}
