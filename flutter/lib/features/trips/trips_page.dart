// Your trips (the site's js/history.js), as Citymapper's Go Trips: every trip taken with the Get Off
// Alert, newest first and grouped by week. Tapped, a trip shows its rides: how long you waited and
// rode, measured or as planned, with Plan again, Share and Delete. Then the stats over all of them:
// Trip Mix, the time spent walking, waiting and riding, and Trip Modes, the rides by operator and
// MRT or LRT. Kept under sgbus_trips, as on the site, so trips from before the Flutter app are here.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../data/places.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../nav/nav_page.dart';
import '../share/share_card.dart';
import '../tour/tour.dart';
import 'trip.dart';

class TripsPage extends StatefulWidget {
  const TripsPage({super.key});

  static const recent = 10;
  static const _sgOffsetMs = 8 * 3600 * 1000;
  static const _dayMs = 24 * 3600 * 1000;
  static const _operators = {'SBST': 'SBS Transit', 'SMRT': 'SMRT', 'TTS': 'Tower Transit', 'GAS': 'Go-Ahead Singapore'};

  /// Monday of the week a moment falls in, Singapore's, as a moment.
  static int weekStart(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms + _sgOffsetMs, isUtc: true);
    final midnight = DateTime.utc(d.year, d.month, d.day).millisecondsSinceEpoch - _sgOffsetMs;
    return midnight - (d.weekday - 1) * _dayMs;
  }

  /// A ride's way of going, for Trip Modes.
  static String modeOf(Map leg) {
    if (leg['kind'] == 'train') return leg['lrt'] == true ? 'LRT' : 'MRT';
    final op = '${leg['op'] ?? ''}';
    return _operators[op] ?? (op.isEmpty ? tr('history.bus', 'Bus') : op);
  }

  /// Each way of going, by how many rides, most first.
  static List<MapEntry<String, int>> modes(List<Map> trips) {
    final out = <String, int>{};
    for (final t in trips) {
      for (final l in ((t['legs'] as List?) ?? const []).whereType<Map>()) {
        out.update(modeOf(l), (n) => n + 1, ifAbsent: () => 1);
      }
    }
    return out.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  }

  @override
  State<TripsPage> createState() => _TripsPageState();
}

class _TripsPageState extends State<TripsPage> {
  bool _all = false;
  String? _open;
  StreamSubscription<String>? _changes;

  @override
  void initState() {
    super.initState();
    _changes = Store.I.changes.listen((k) {
      if (k == Trip.tripsKey && mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _changes?.cancel();
    super.dispose();
  }

  static double _num(Object? v) => (v as num?)?.toDouble() ?? 0;

  String _dur(double min) {
    final m = min.round();
    if (m < 60) return tr('time.min', '{m} min', {'m': m});
    final h = (m / 60).round();
    return h == 1 ? tr('history.oneHour', '1 hour') : tr('history.hours', '{h} hours', {'h': h});
  }

  String _day(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).add(const Duration(hours: 8));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
  }

  String _trips(int n) => n == 1 ? tr('history.oneTrip', '1 trip') : tr('history.trips', '{n} trips', {'n': n});
  String _rides(int n) => n == 1 ? tr('history.oneRide', '1 ride') : tr('history.rides', '{n} rides', {'n': n});
  static String _pct(double part, double whole) => '${whole > 0 ? (part / whole * 100).round() : 0}%';

  List<Map> _load() => Store.I.list(Trip.tripsKey).whereType<Map>().toList()..sort((a, b) => _num(b['startedAt']).compareTo(_num(a['startedAt'])));

  void _remove(Map trip) {
    final kept = Store.I.list(Trip.tripsKey).whereType<Map>().where((t) => t['id'] != trip['id']).toList();
    Store.I.putJson(Trip.tripsKey, kept);
  }

  Future<bool> _sure(String words, String yes) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          content: Text(words),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('common.cancel', 'Cancel'))),
            TextButton(onPressed: () => Navigator.pop(c, true), child: Text(yes)),
          ],
        ),
      ) ==
      true;

  void _share(Map trip) {
    final legs = ((trip['legs'] as List?) ?? const []).whereType<Map>().map((l) => l['kind'] == 'bus' ? tr('favs.bus', 'Bus {no}', {'no': l['route']}) : '${l['route']}').join(', ');
    final from = trip['from'] as Map?, to = trip['to'] as Map?;
    if (to == null) return;
    final summary = tr('history.taken', '{legs}, taken {day}', {'legs': legs, 'day': _day(_num(trip['startedAt']).toInt())});
    ShareCard.show(
      context,
      ShareCard(
        heading: tr('share.thisTrip', 'Share this trip'),
        name: from == null ? tr('trip.to', 'To {to}', {'to': to['label']}) : tr('planner.fromTo', '{from} to {to}', {'from': from['label'], 'to': to['label']}),
        sub: summary,
        kind: 'directions',
        data: {'from': from ?? 'here', 'to': to, 'when': null, 'way': null, 'summary': summary},
        text: tr('share.howToGetToPlace', 'How to get to {place}', {'place': to['label']}),
      ),
    );
  }

  Widget _chip(Map l) {
    final sg = context.sg;
    final train = l['kind'] == 'train';
    final colour = train && '${l['color'] ?? ''}'.startsWith('#') ? Color(int.tryParse('FF${'${l['color']}'.substring(1)}', radix: 16) ?? 0xFF888888) : null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: sg.surfaceStrong, borderRadius: BorderRadius.circular(10), border: Border.all(color: sg.border)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (colour != null)
          Container(width: 10, height: 10, margin: const EdgeInsets.only(right: 5), decoration: BoxDecoration(color: colour, shape: BoxShape.circle))
        else
          Padding(padding: const EdgeInsets.only(right: 4), child: Icon(train ? Icons.directions_subway_filled : Icons.directions_bus, size: 14, color: sg.ink)),
        Text('${l['route'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      ]),
    );
  }

  String _planned(Object? measured) => measured == true ? '' : ' ${tr('history.planned', '(planned)')}';

  Widget _details(Map t) {
    final sg = context.sg;
    final legs = ((t['legs'] as List?) ?? const []).whereType<Map>().toList();
    final walk = _num(t['walkMin']);
    final total = walk + legs.fold<double>(0, (a, l) => a + _num(l['waitMin']) + _num(l['rideMin']));
    final started = _num(t['startedAt']).toInt();
    final small = TextStyle(color: sg.muted, fontSize: 13);
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final l in legs)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _chip(l),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    '${'${l['from'] ?? ''}'.isNotEmpty ? tr('planner.fromTo', '{from} to {to}', {'from': l['from'], 'to': l['to']}) : tr('trip.to', 'To {to}', {'to': l['to']})}'
                    '${l['done'] == true ? '' : ' ${tr('history.partway', '(ended partway)')}'}',
                  ),
                  Text(
                    '${tr('history.waited', 'Waited {d}', {'d': _dur(_num(l['waitMin']))})}${_planned(l['waitMeasured'])} · '
                    '${tr('history.rode', 'Rode {d}', {'d': _dur(_num(l['rideMin']))})}${_planned(l['rideMeasured'])}',
                    style: small,
                  ),
                ]),
              ),
            ]),
          ),
        if (walk > 0) Text('${tr('history.walked', 'Walked {d}', {'d': _dur(walk)})}${_planned(false)}', style: small),
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            t['arrived'] == true
                ? tr('history.inAll', 'About {d} in all, from {time}.', {'d': _dur(total), 'time': When.clock(started)})
                : tr('history.inAllEnded', 'About {d} in all, from {time}. Ended before getting there.', {'d': _dur(total), 'time': When.clock(started)}),
            style: small,
          ),
        ),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 4, children: [
          Pill(icon: Icons.directions, label: tr('history.planAgain', 'Plan again'), onTap: () => openNav(from: NavEnd.from(t['from']), to: NavEnd.from(t['to']))),
          if (t['to'] is Map) Pill(icon: Icons.share_outlined, label: tr('history.share', 'Share'), onTap: () => _share(t)),
          Pill(
            icon: Icons.delete_outline,
            label: tr('history.delete', 'Delete'),
            onTap: () async {
              if (await _sure(tr('history.deleteConfirm', 'Delete this trip from Your trips?'), tr('history.delete', 'Delete'))) _remove(t);
            },
          ),
        ]),
      ]),
    );
  }

  Widget _row(Map t) {
    final sg = context.sg;
    final id = '${t['id']}';
    final open = _open == id;
    final started = _num(t['startedAt']).toInt();
    final legs = ((t['legs'] as List?) ?? const []).whereType<Map>().toList();
    // A trip that ended at Home, Work or one of your places says so.
    final to = Places.nameNear(t['to']) ?? (t['to'] as Map?)?['label'] ?? (legs.isEmpty ? '' : legs.last['to']);
    return InkWell(
      onTap: () => setState(() => _open = open ? null : id),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('${_day(started)} · ${When.clock(started)}', style: TextStyle(color: sg.muted, fontSize: 13))),
            Icon(open ? Icons.expand_less : Icons.expand_more, size: 20, color: sg.muted),
          ]),
          const SizedBox(height: 4),
          Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
            for (final l in legs) _chip(l),
            Text(tr('trip.to', 'To {to}', {'to': to})),
          ]),
          if (open) _details(t),
        ]),
      ),
    );
  }

  List<Widget> _weeks(List<Map> trips) {
    final groups = <(int, List<Map>)>[];
    for (final t in trips) {
      final start = TripsPage.weekStart(_num(t['startedAt']).toInt());
      if (groups.isEmpty || groups.last.$1 != start) groups.add((start, []));
      groups.last.$2.add(t);
    }
    return [
      for (final g in groups)
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: SgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('${_day(g.$1)} - ${_day(g.$1 + 6 * TripsPage._dayMs)}', style: Theme.of(context).textTheme.titleSmall),
              for (final (i, t) in g.$2.indexed) ...[
                if (i > 0) Divider(height: 1, color: context.sg.border),
                _row(t),
              ],
            ]),
          ),
        ),
    ];
  }

  Widget _stat(IconData? icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          if (icon != null) Padding(padding: const EdgeInsets.only(right: 8), child: Icon(icon, size: 18, color: context.sg.muted)),
          Expanded(child: Text(label)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final trips = _load();
    final shown = _all ? trips : trips.take(TripsPage.recent).toList();
    var walk = 0.0, wait = 0.0, ride = 0.0, rides = 0;
    for (final t in trips) {
      walk += _num(t['walkMin']);
      for (final l in ((t['legs'] as List?) ?? const []).whereType<Map>()) {
        wait += _num(l['waitMin']);
        ride += _num(l['rideMin']);
        rides++;
      }
    }
    final total = walk + wait + ride;
    return SafeArea(
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Text(tr('panel.trips', 'Your trips'), style: Theme.of(context).textTheme.headlineMedium),
        if (Trip.I.active) Padding(padding: const EdgeInsets.only(top: 8), child: SgCard(child: Text('${tr('trip.trip_in_progress', 'Trip in progress')}: ${Trip.I.barText()}'))),
        if (trips.isEmpty) TourTarget(id: 'trips.empty', child: EmptyNote(tr('history.empty', "No trips yet. Start a trip from Navigate (Bus and train or Bus only) or a bus's route (Get Off Alert), and each one you take shows here, with your stats."), icon: Icons.history)),
        ..._weeks(shown),
        if (trips.length > TripsPage.recent)
          TextButton(onPressed: () => setState(() => _all = !_all), child: Text(_all ? tr('history.fewer', 'Fewer trips') : tr('history.all', 'All trips ({n})', {'n': trips.length}))),
        if (trips.isNotEmpty) ...[
          SectionLabel(tr('history.stats', 'Stats')),
          TourTarget(id: 'trips.since', child: Text(
            tr('history.since', '{trips} and {rides} since {date}, about {d} on the move.', {'trips': _trips(trips.length), 'rides': _rides(rides), 'date': _day(_num(trips.last['startedAt']).toInt()), 'd': _dur(total)}),
            style: TextStyle(color: sg.muted),
          )),
          TourTarget(id: 'trips.stats', child: SectionLabel(tr('history.mix', 'Trip Mix'))),
          SgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (total > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Row(children: [
                      if (walk > 0) Expanded(flex: (walk * 10).round().clamp(1, 1 << 30), child: Container(height: 14, color: sg.tones[0])),
                      if (wait > 0) Expanded(flex: (wait * 10).round().clamp(1, 1 << 30), child: Container(height: 14, color: sg.warn)),
                      if (ride > 0) Expanded(flex: (ride * 10).round().clamp(1, 1 << 30), child: Container(height: 14, color: sg.ok)),
                    ]),
                  ),
                ),
              _stat(Icons.directions_walk, tr('history.walking', 'Walking - {d}', {'d': _dur(walk)}), _pct(walk, total)),
              _stat(Icons.schedule, tr('history.waiting', 'Waiting - {d}', {'d': _dur(wait)}), _pct(wait, total)),
              _stat(Icons.directions, tr('history.riding', 'Riding - {d}', {'d': _dur(ride)}), _pct(ride, total)),
            ]),
          ),
          SectionLabel(tr('history.modes', 'Trip Modes')),
          SgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final m in TripsPage.modes(trips)) _stat(null, '${m.key} (${_rides(m.value)})', _pct(m.value.toDouble(), rides.toDouble())),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              tr('history.statsNote', "Waiting and riding are measured on the trip where your location showed when you got on; otherwise, and for walking, they're the planned times."),
              style: TextStyle(color: sg.muted, fontSize: 13),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Pill(
                icon: Icons.delete_outline,
                label: tr('history.clear', 'Clear Your trips'),
                onTap: () async {
                  if (await _sure(tr('history.clearConfirm', 'Clear every trip from Your trips on this device? Your stats go with them.'), tr('history.clear', 'Clear Your trips'))) {
                    Store.I.put(Trip.tripsKey, null);
                  }
                },
              ),
            ),
          ),
        ],
      ]),
    );
  }
}
