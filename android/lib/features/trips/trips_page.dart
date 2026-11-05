// Your trips (the site's js/history.js): every trip taken with the Get Off Alert, newest first,
// each with its rides and how long they took, then the stats over all of them: Trip Mix, the time
// spent walking, waiting and riding. Kept under sgbus_trips, as on the site, so trips from before
// the Flutter app are here, and Plan again opens Navigate for one.
import 'package:flutter/material.dart';

import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../nav/nav_page.dart';
import 'trip.dart';

class TripsPage extends StatefulWidget {
  const TripsPage({super.key});

  @override
  State<TripsPage> createState() => _TripsPageState();
}

class _TripsPageState extends State<TripsPage> {
  bool _all = false;

  @override
  void initState() {
    super.initState();
    Store.I.changes.listen((k) {
      if (k == Trip.tripsKey && mounted) setState(() {});
    });
  }

  String _dur(double min) {
    if (min >= 90) {
      final h = (min / 60).round();
      return h == 1 ? tr('history.oneHour', '1 hour') : tr('history.hours', '{h} hours', {'h': h});
    }
    return tr('planner.aboutMin', '~{m} min', {'m': min.round()}).replaceFirst('~', '');
  }

  String _day(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).add(const Duration(hours: 8));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final trips = Store.I.list(Trip.tripsKey).whereType<Map>().toList()..sort((a, b) => ((b['startedAt'] as num?) ?? 0).compareTo((a['startedAt'] as num?) ?? 0));
    final shown = _all ? trips : trips.take(5).toList();
    var walk = 0.0, wait = 0.0, ride = 0.0, rides = 0;
    for (final t in trips) {
      walk += ((t['walkMin'] as num?) ?? 0).toDouble();
      for (final l in ((t['legs'] as List?) ?? const []).cast<Map>()) {
        wait += ((l['waitMin'] as num?) ?? 0).toDouble();
        ride += ((l['rideMin'] as num?) ?? 0).toDouble();
        rides++;
      }
    }
    final total = walk + wait + ride;
    return SafeArea(
      bottom: false,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Text(tr('panel.trips', 'Your trips'), style: Theme.of(context).textTheme.headlineMedium),
        if (Trip.I.active) Padding(padding: const EdgeInsets.only(top: 8), child: SgCard(child: Text('${tr('trip.trip_in_progress', 'Trip in progress')}: ${Trip.I.barText()}'))),
        if (trips.isEmpty) EmptyNote(tr('history.empty', "No trips yet. Start a trip from Navigate (Bus and train or Bus only) or a bus's route (Get Off Alert), and each one you take shows here, with your stats."), icon: Icons.history),
        for (final t in shown)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: SgCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${t['title'] ?? ''}', style: Theme.of(context).textTheme.titleMedium),
                Text(_day(((t['startedAt'] as num?) ?? 0).toInt()), style: TextStyle(color: sg.muted)),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 4, children: [
                  for (final l in ((t['legs'] as List?) ?? const []).cast<Map>())
                    Chip(
                      avatar: Icon(l['kind'] == 'train' ? Icons.directions_subway_filled : Icons.directions_bus, size: 16),
                      label: Text('${l['route']} · ${_dur(((l['rideMin'] as num?) ?? 0).toDouble())}${l['done'] == true ? '' : ' ${tr('history.partway', '(ended partway)')}'}'),
                      visualDensity: VisualDensity.compact,
                    ),
                ]),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => openNav(from: NavEnd.from(t['from']), to: NavEnd.from(t['to'])),
                    child: Text(tr('history.planAgain', 'Plan again')),
                  ),
                ),
              ]),
            ),
          ),
        if (trips.length > 5)
          TextButton(onPressed: () => setState(() => _all = !_all), child: Text(_all ? tr('history.fewer', 'Fewer trips') : tr('history.all', 'All trips ({n})', {'n': trips.length}))),
        if (trips.isNotEmpty) ...[
          SectionLabel(tr('history.stats', 'Stats')),
          SgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tr('history.mix', 'Trip Mix'), style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              if (total > 0)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Row(children: [
                    if (walk > 0) Expanded(flex: (walk * 10).round().clamp(1, 1 << 30), child: Container(height: 14, color: sg.tones[0])),
                    if (wait > 0) Expanded(flex: (wait * 10).round().clamp(1, 1 << 30), child: Container(height: 14, color: sg.warn)),
                    if (ride > 0) Expanded(flex: (ride * 10).round().clamp(1, 1 << 30), child: Container(height: 14, color: sg.ok)),
                  ]),
                ),
              const SizedBox(height: 8),
              Text(tr('history.walking', 'Walking - {d}', {'d': _dur(walk)})),
              Text(tr('history.waiting', 'Waiting - {d}', {'d': _dur(wait)})),
              Text(tr('history.riding', 'Riding - {d}', {'d': _dur(ride)})),
              const SizedBox(height: 6),
              Text('${trips.length == 1 ? tr('history.oneTrip', '1 trip') : tr('history.trips', '{n} trips', {'n': trips.length})}, '
                  '${rides == 1 ? tr('history.oneRide', '1 ride') : tr('history.rides', '{n} rides', {'n': rides})}', style: TextStyle(color: sg.muted)),
            ]),
          ),
        ],
      ]),
    );
  }
}
