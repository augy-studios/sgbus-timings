// Will I make it? (the site's js/make-it.js): under a stop's tools, roughly how long the walk
// there is from where you are, and which buses you'd catch if you set off now; the ones that'd
// leave before you got there are greyed in the timings. The walk is the straight line with a
// quarter more for corners, at 80 m a minute. Where you are is only looked up once you've asked
// ("How far's my walk?", sgbus_makeit), and then each time a stop opens, at most a minute old.
import 'package:flutter/material.dart';

import '../../data/arrivals.dart';
import '../../data/geo.dart';
import '../../data/location.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import 'stop_screen.dart';

class MakeIt {
  MakeIt._();
  static const key = 'sgbus_makeit';
  static const mPerMin = 80.0;
  static const detour = 1.25;
  static const atStopM = 60.0;
  static const tooFarM = 3000.0;

  static ({String code, double? metres, int at})? walk;
  static final changed = ValueNotifier<int>(0);
  static String? _locating;

  static bool get asked => Store.I.get(key) == 'on';

  static void forStop(String code) {
    if (walk?.code == code && DateTime.now().millisecondsSinceEpoch - walk!.at < 60000) return;
    walk = null;
    if (asked) locate(code);
  }

  static Future<void> locate(String code) async {
    if (_locating == code) return;
    _locating = code;
    try {
      final fix = await Locate.here(ask: !asked, maxAge: const Duration(minutes: 1));
      Store.I.put(key, 'on');
      final s = Stops.of(code);
      walk = (code: code, metres: s?.lat == null ? null : metresBetween(fix.lat, fix.lng, s!.lat!, s.lng!), at: DateTime.now().millisecondsSinceEpoch);
    } on LocationError {
      walk = null;
    } finally {
      _locating = null;
      changed.value++;
    }
  }

  static int? walkMs(String code) {
    final w = walk;
    if (w == null || w.code != code || w.metres == null || w.metres! < atStopM || w.metres! > tooFarM) return null;
    return (w.metres! * detour / mPerMin).ceil() * 60000;
  }

  static bool tooSoon(String code, int etaMs) {
    final w = walkMs(code);
    return w != null && etaMs < w;
  }

  static void hook() {
    MakeItHook.tooSoon = tooSoon;
    MakeItLine.build = (context, code, services) => _Line(code: code, services: services);
    MakeItLine.changed = changed;
    MakeItForStop.call = forStop;
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.code, required this.services});
  final String code;
  final List<ServiceArrivals> services;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final w = MakeIt.walk;
    TextStyle style = TextStyle(color: sg.muted);
    if (w == null || w.code != code) {
      return Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: () => MakeIt.locate(code),
          icon: const Icon(Icons.directions_walk),
          label: Text(tr('makeIt.ask', 'How far’s my walk?')),
        ),
      );
    }
    if (w.metres == null) return const SizedBox.shrink();
    if (w.metres! < MakeIt.atStopM) return Text(tr('makeIt.atStop', 'You’re at the stop.'), style: style);
    if (w.metres! > MakeIt.tooFarM) {
      return Text(tr('makeIt.tooFar', 'You’re {km} km away: try Navigate to get here.', {'km': (w.metres! / 1000).toStringAsFixed(1)}), style: style);
    }
    final ms = MakeIt.walkMs(code)!;
    final catchable = <({String no, int min})>[];
    for (final s in services) {
      final bus = s.buses.where((b) => b?.etaMs != null && b!.etaMs! >= ms).firstOrNull;
      if (bus != null) catchable.add((no: s.serviceNo, min: (bus.etaMs! / 60000).round()));
    }
    catchable.sort((a, b) => a.min.compareTo(b.min));
    final list = catchable.take(3).map((c) => tr('makeIt.busIn', 'the {no} in {m} min', {'no': c.no, 'm': c.min})).toList();
    final joined = list.length > 1 ? '${list.sublist(0, list.length - 1).join(', ')}${tr('makeIt.or', ' or ')}${list.last}' : list.join();
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(Icons.directions_walk, size: 18, color: sg.muted),
      const SizedBox(width: 6),
      Expanded(
        child: Text(
          '${tr('makeIt.walk', 'About a {m} min walk from you.', {'m': ms ~/ 60000})} '
          '${list.isEmpty ? tr('makeIt.none', 'Every bus due now would leave before you got there.') : tr('makeIt.leaveNow', 'Leave now for {list}.', {'list': joined})}',
          style: style,
        ),
      ),
    ]);
  }
}
