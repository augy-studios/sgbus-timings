// A Navigate train ride's next trains that reach its stop (data/trains.dart), from when you're on
// the platform: LTA's timetable, or a disruption's changes to it. Nothing until they're in, or
// when no train from there goes there. As the site's legTrainsHtml (main-site/js/nav.js).
import 'package:material_ui/material_ui.dart';

import '../../data/trains.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../timings/trains_screen.dart';

/// A way's card line for a train ride whose train is one of the day's last three there: which of
/// them, and when the last leaves, from the plan (main-site/api/_nav/last-trains.js). Null for any
/// other ride. As the site's lastTrainText (main-site/js/nav.js); keep in step.
String? lastTrainCardText(Map leg, String Function(Object? place) placeName) {
  final time = leg['lastTrain'];
  if (time is! String) return null;
  final words = {'to': placeName(leg['to']), 'from': placeName(leg['from']), 'time': time};
  return switch (leg['lastTrainRank']) {
    3 => tr('nav.lastTrain3From', '3rd last train to {to} from {from}. The last is at {time}', words),
    2 => tr('nav.lastTrain2From', '2nd last train to {to} from {from}. The last is at {time}', words),
    _ => tr('nav.lastTrainFrom', 'Last train to {to} from {from} at {time}', words),
  };
}

/// The ride's own warning, from the plan, until its trains are in or with none to be had.
String? lastTrainRideText(Map leg) {
  final time = leg['lastTrain'];
  if (time is! String) return null;
  final stop = '${(leg['to'] as Map?)?['name'] ?? tr('nav.itsStop', 'its stop')}';
  final rank = leg['lastTrainRank'];
  return rank is int && rank > 1
      ? tr('nav.lastTrains', 'Only the last {n} trains to {stop} are left today. The last is at {time}.', {'n': '$rank', 'stop': stop, 'time': time})
      : tr('nav.lastTrain', 'Last train to {stop} from here today is at {time}. Don’t miss it.', {'stop': stop, 'time': time});
}

/// A warning line in the warning colour, as the rides' others.
Widget lastTrainWarning(BuildContext context, String text) {
  final sg = context.sg;
  return Padding(
    padding: const EdgeInsets.only(top: 2),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(Icons.warning_amber_rounded, size: 16, color: sg.warn),
      const SizedBox(width: 4),
      Expanded(child: Text(text, style: TextStyle(color: sg.warn, fontWeight: FontWeight.w600))),
    ]),
  );
}

class LegTrains extends StatelessWidget {
  const LegTrains({super.key, required this.leg, required this.reachMs});
  final Map leg;
  final int reachMs;

  @override
  Widget build(BuildContext context) {
    final from = (leg['from'] as Map?)?['code'];
    final to = leg['to'] as Map?;
    if (from is! String || to?['code'] is! String) return const SizedBox.shrink();
    return FutureBuilder<TrainsData?>(
      future: Trains.load(Trains.codesOf(from)),
      builder: (context, snap) {
        final next = Trains.forLeg(snap.data, to!['code'] as String, reachMs);
        if (next == null) {
          final plan = lastTrainRideText(leg);
          return plan == null ? const SizedBox.shrink() : lastTrainWarning(context, plan);
        }
        final sg = context.sg;
        final head = next.live
            ? tr('nav.trainsLive', 'Trains to {stop}, with LTA’s disruption changes:', {'stop': '${to['name']}'})
            : tr('nav.trainsTimetable', 'Trains to {stop} by the timetable:', {'stop': '${to['name']}'});
        // The day's last train there, as the bus rides' last bus: a warning once the one you'd
        // catch is one of the last three, else said plainly.
        final stop = '${to['name']}';
        final lastAt = When.clock(next.lastMs);
        final rank = next.rank;
        return Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: 10, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.schedule, size: 16, color: sg.muted),
                const SizedBox(width: 4),
                Flexible(child: Text(head, style: TextStyle(color: sg.muted))),
              ]),
              for (final (i, t) in next.trains.indexed)
                Text(
                    // A new time from the disruption feed, in words too (WCAG 1.4.1).
                    t.state == 1 ? '${When.clock(t.ms)} ${tr('trains.changedShort', '(new time)')}' : When.clock(t.ms),
                    style: TextStyle(fontWeight: FontWeight.w700, color: t.state == 1 ? sg.warn : rank != null && i < rank ? lastRedText(context) : sg.muted)),
            ]),
            if (rank != null)
              lastTrainWarning(
                context,
                rank == 1
                    ? tr('nav.lastTrain', 'Last train to {stop} from here today is at {time}. Don’t miss it.', {'stop': stop, 'time': lastAt})
                    : tr('nav.lastTrains', 'Only the last {n} trains to {stop} are left today. The last is at {time}.', {'n': '$rank', 'stop': stop, 'time': lastAt}),
              )
            else
              Text(tr('nav.lastTrainAt', 'Last train there today at {time}.', {'time': lastAt}), style: TextStyle(color: sg.muted)),
          ]),
        );
      },
    );
  }
}
