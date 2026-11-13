// Changing a trip on the way, as the site's js/trip.js has it:
//
// Change here: Change my way, at the top of the timeline, puts a Change here by every stop still
// ahead on a ride (hidden otherwise, so a stray tap on the timeline changes nothing). One plans
// the way on from there to where the trip ends, for getting off somewhere else and changing to
// another bus or train: the ways, quickest first, and the one picked becomes the trip from that
// stop, the ride cut short there.
//
// Are you walking?: on a walk, a pace no walk keeps up (Trip's _watchPace) asks once a trip. I'm
// cycling or I'm driving says to ride safely, and offers each bus or train ride still ahead: one
// picked makes the trip a ride by bike or car to its stop or station, then the trip as it was
// from that ride on; or all the way there. Either is timed by the route there (/api/walk) and
// opens the live map on it; the bar says so, with Undo. Closing it keeps the walk.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/geo.dart';
import '../../data/network.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../nav/nav_page.dart';
import 'trip.dart';

class TripChange {
  TripChange._();

  static const maxWays = 4;
  static const _paceKmh = {'cycle': 15.0, 'drive': 30.0};
  static const _paceDetour = 1.2;
  static const _carKmh = 25.0;

  static void register() => Trip.askPace = askPace;

  static String ridesText(Map o) => [
        for (final l in (o['legs'] as List? ?? const []).whereType<Map>())
          if (l['mode'] != 'walk')
            l['mode'] == 'bus'
                ? tr('trip.bus', 'Bus {no}', {'no': l['route']})
                : l['lrt'] == true
                    ? tr('trip.lrt', '{line} LRT', {'line': l['route']})
                    : tr('trip.line', '{line} Line', {'line': l['route']})
      ].join(' → ');

  static String byClock(Map o) => tr('trip.thereBy', ', there by {time}', {'time': When.clock(When.nowMs() + (((o['minutes'] as num?) ?? 0) * 60000).round())});

  /// What to do first on a way, in words: "Walk 3 min to Opp Blk 5, take Bus 12 there".
  static String firstStep(Map o) {
    final legs = (o['legs'] as List? ?? const []).whereType<Map>().toList();
    final ride = legs.where((l) => l['mode'] != 'walk').firstOrNull;
    if (ride == null) return tr('trip.walkRest', 'Walk the rest of the way');
    final what = ride['mode'] == 'bus'
        ? tr('trip.bus', 'Bus {no}', {'no': ride['route']})
        : ride['lrt'] == true
            ? tr('trip.theLrt', 'the {line} LRT', {'line': ride['route']})
            : tr('trip.theLine', 'the {line} Line', {'line': ride['route']});
    final walk = legs.isNotEmpty && legs.first['mode'] == 'walk' && ((legs.first['metres'] as num?) ?? 100) >= 60 ? legs.first : null;
    return walk != null
        ? tr('trip.walkThenTake', 'Walk {m} min to {stop}, take {ride} there',
            {'m': math.max(1, ((walk['minutes'] as num?) ?? 1).round()), 'stop': placeName(ride['from']), 'ride': what})
        : tr('trip.takeFrom', 'Take {ride} from {stop}', {'ride': what, 'stop': placeName(ride['from'])});
  }

  static String _rideKey(String mode, Object? route, Object? code) => '$mode:${'$route'.toUpperCase()}@${code ?? ''}';

  static NavEnd? get _end {
    final to = Trip.I.to;
    return to != null && to['lat'] is num ? NavEnd('${to['label'] ?? ''}', (to['lat'] as num).toDouble(), (to['lng'] as num).toDouble()) : null;
  }

  /// Change here: the ways on from leg `j`'s `k`th stop to where the trip ends, to pick one.
  static Future<void> changeAt(BuildContext context, int j, int k) async {
    final t = Trip.I;
    final leg = t.legs[j];
    final to = _end;
    if (to == null) return;
    final from = NavEnd(k < leg.names.length && leg.names[k].isNotEmpty ? leg.names[k] : leg.to, leg.points[k][0], leg.points[k][1]);
    final legsAsked = t.legs;
    final ways = ValueNotifier<List<Map<String, dynamic>>?>(null);
    var failed = false;
    () async {
      try {
        final customs = Store.I.get('sgbus_customs');
        final data = await Api.map('nav', query: {
          'from': from.coord(),
          'to': to.coord(),
          if (BusNet.openAccess) 'restricted': 1,
          if (['15', '30', '45', '60'].contains(customs)) 'customs': customs,
          if (Store.I.get('sgbus_bike') == 'on') 'bike': 1,
          if (Store.I.get('sgbus_shuttles') == 'paid') 'shuttles': 'paid',
        });
        // Not staying on the ride you're getting off.
        final code = leg.codes != null && k < leg.codes!.length ? leg.codes![k] : '';
        final same = _rideKey(leg.kind, leg.kind == 'bus' ? leg.service : (leg.route ?? leg.label.split(' ').first), leg.kind == 'bus' ? code : '');
        ways.value = [
          for (final o in (data['options'] as List? ?? const []).whereType<Map>())
            if (() {
              final first = (o['legs'] as List? ?? const []).whereType<Map>().where((l) => l['mode'] != 'walk').firstOrNull;
              if (first == null) return true;
              final from = first['from'];
              final at = first['mode'] == 'bus' && from is Map ? from['code'] : '';
              return _rideKey('${first['mode']}', first['route'], at) != same;
            }())
              Map<String, dynamic>.from(o)
        ].take(maxWays).toList();
      } catch (_) {
        failed = true;
        ways.value = [];
      }
    }();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: ValueListenableBuilder(
            valueListenable: ways,
            builder: (context, list, _) {
              final sg = context.sg;
              return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(tr('trip.changeAt', 'Change at {stop}', {'stop': from.label}), style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                if (list == null)
                  Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text(tr('trip.findingOn', 'Finding the ways on from there…')))
                else if (list.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(failed ? tr('trip.changeFailed', "Couldn't find the ways on just now.") : tr('trip.changeNone', 'No other way on by bus or train is running from there now.')),
                  )
                else
                  for (final o in list)
                    Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(o['walkOnly'] == true ? tr('trip.walkRest', 'Walk the rest of the way') : ridesText(o), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('~${((o['minutes'] as num?) ?? 0).round()} min${byClock(o)}. ${firstStep(o)}.', style: TextStyle(color: sg.muted)),
                        onTap: () {
                          Navigator.of(context).pop();
                          // The trip changed since it was asked: nothing to change.
                          if (!identical(Trip.I.legs, legsAsked) || j < Trip.I.leg) return;
                          final made = tripFromNav(o, from, to);
                          if (made == null) return;
                          Trip.I.replanAt(j, k, made.legs, note: '${tr('trip.changedAt', 'Changed at {stop}.', {'stop': from.label})} ${firstStep(o)}.');
                        },
                      ),
                    ),
              ]);
            },
          ),
        ),
      ),
    );
    ways.dispose();
  }

  // ---------- are you walking? ----------

  static void askPace(double kmh) {
    final context = AppNav.context;
    if (context == null) return;
    final car = kmh >= _carKmh;
    showDialog<void>(
      context: context,
      builder: (context) {
        String? mode;
        return StatefulBuilder(builder: (context, set) {
          final t = Trip.I;
          if (mode == null) {
            return AlertDialog(
              title: Text(tr('pace.title', 'Are you walking?')),
              content: Text(tr('pace.text', 'You’re going faster than walking pace. Pick how you’re getting there for directions the rest of the way.')),
              actions: [
                car
                    ? TextButton(onPressed: () => set(() => mode = 'cycle'), child: Text(tr('pace.cycling', 'I’m cycling')))
                    : FilledButton(onPressed: () => set(() => mode = 'cycle'), child: Text(tr('pace.cycling', 'I’m cycling'))),
                car
                    ? FilledButton(onPressed: () => set(() => mode = 'drive'), child: Text(tr('pace.driving', 'I’m driving')))
                    : TextButton(onPressed: () => set(() => mode = 'drive'), child: Text(tr('pace.driving', 'I’m driving'))),
              ],
            );
          }
          final drive = mode == 'drive';
          final rides = [
            for (var i = t.leg; i < t.legs.length; i++)
              if (t.legs[i].ride && !(i == t.leg && t.boarded)) i
          ];
          return AlertDialog(
            title: Text(drive ? tr('pace.driveSafe', 'Drive safely') : tr('pace.cycleSafe', 'Cycle safely')),
            content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(drive
                    ? tr('pace.driveSafeText', 'Keep your eyes on the road and your phone down while you drive. Pull over first, or have a passenger check the trip.')
                    : tr('pace.cycleSafeText',
                        'Keep to 10 km/h on footpaths and 25 km/h on park connectors and shared paths, give way to people walking, and keep your phone down while you ride.')),
                if (rides.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(tr('pace.nextAsk', 'Change where you’re going next, to get on a bus or train on your way?')),
                  const SizedBox(height: 4),
                  for (final i in rides)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                          drive
                              ? tr('pace.driveToRide', 'Drive to {stop}, then {ride}', {'stop': _boardName(i), 'ride': t.legs[i].label})
                              : tr('pace.cycleToRide', 'Cycle to {stop}, then {ride}', {'stop': _boardName(i), 'ride': t.legs[i].label}),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(tr('pace.rideTo', '{ride} to {to}', {'ride': t.legs[i].label, 'to': t.legs[i].to})),
                      onTap: () {
                        Navigator.of(context).pop();
                        goBy(mode!, i);
                      },
                    ),
                ],
              ]),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(tr('common.close', 'Close'))),
              FilledButton(
                onPressed: () {
                  Navigator.of(context).pop();
                  goBy(mode!);
                },
                child: Text(drive ? tr('pace.driveAllWay', 'Drive all the way there') : tr('pace.cycleAllWay', 'Cycle all the way there')),
              ),
            ],
          );
        });
      },
    );
  }

  // Where leg k is boarded, by name.
  static String _boardName(int k) {
    final legs = Trip.I.legs;
    if (legs[k].names.isNotEmpty && legs[k].names.first.isNotEmpty) return legs[k].names.first;
    return k > 0 ? legs[k - 1].to : legs[k].to;
  }

  static NavEnd _whereNow() {
    final t = Trip.I;
    if (t.here != null) return NavEnd(tr('nav.yourLocation', 'Your location'), t.here!.lat, t.here!.lng, here: true);
    final leg = t.current!;
    final i = math.min(leg.points.length - 1, t.pos.ceil());
    return NavEnd(i < leg.names.length ? leg.names[i] : leg.to, leg.points[i][0], leg.points[i][1]);
  }

  /// I'm cycling or I'm driving: the rest of the trip that way, to where it ends, or with `k` to
  /// leg k's stop or station and the trip as it was from that ride on.
  static Future<void> goBy(String mode, [int? k]) async {
    final t = Trip.I;
    if (!t.active) return;
    final legs = t.legs;
    final ride = k == null ? null : legs[k];
    final from = _whereNow();
    final end = _end;
    final to = ride != null ? NavEnd(_boardName(k!), ride.points.first[0], ride.points.first[1]) : end;
    if (to == null) return;
    double? minutes;
    try {
      final r = await Api.map('walk', query: {'from': '${from.lat.toStringAsFixed(4)},${from.lng.toStringAsFixed(4)}', 'to': '${to.lat.toStringAsFixed(4)},${to.lng.toStringAsFixed(4)}', 'mode': mode});
      minutes = (r['minutes'] as num?)?.toDouble();
    } catch (_) {}
    if (!identical(Trip.I.legs, legs)) return;
    minutes ??= metresAB([from.lat, from.lng], [to.lat, to.lng]) * _paceDetour / (_paceKmh[mode]! * 1000 / 60);
    final m = math.max(1, minutes.round());
    final drive = mode == 'drive';
    final now = ride != null
        ? (drive
            ? tr('trip.driveToRide', 'Drive to {to}, ~{m} min, then {ride}.', {'to': to.label, 'm': m, 'ride': ride.label})
            : tr('trip.cycleToRide', 'Cycle to {to}, ~{m} min, then {ride}.', {'to': to.label, 'm': m, 'ride': ride.label}))
        : drive
            ? tr('trip.driveRest', 'Drive the rest of the way, ~{m} min.', {'m': m})
            : tr('trip.cycleRest', 'Cycle the rest of the way, ~{m} min.', {'m': m});
    final title = drive ? tr('trip.switchedDrive', 'Switched to driving.') : tr('trip.switchedCycle', 'Switched to cycling.');
    final foot = TripLeg(
      kind: 'walk',
      label: drive ? tr('trip.foot.drive', 'Drive') : tr('trip.foot.cycle', 'Cycle'),
      to: to.label,
      points: [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      names: [from.label, to.label],
      minutes: math.max(1, minutes),
      foot: mode,
    );
    t.replanAt(t.leg, null, [foot, if (ride != null) ...legs.sublist(k!)], note: '$title $now');
    // Its way there, from where you are.
    AppNav.open('tripMap');
  }
}
