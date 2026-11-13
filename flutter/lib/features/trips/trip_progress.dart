// What the trip's notification shows besides its words (TripService.java): a bar of the whole trip,
// a segment for each part in its colour, as long as that part's minutes, with a marker where each
// Get Off Alert still to come will sound, and a few words for Android's status bar chip.
import '../../i18n/i18n.dart';
import 'trip.dart';

class TripProgress {
  TripProgress._();

  /// The bar's length: Android's ProgressStyle counts in whatever units its segments add up to.
  static const total = 1000;

  /// How far it moves at a time, so a fix that barely moves you doesn't post a notification.
  static const _step = 5;

  /// Long enough to see, however short the walk.
  static const _shortest = 40;

  /// Android's limits: it ignores segments past 15 and points past 4 (Notification.ProgressStyle).
  static const _maxSegments = 15;
  static const _maxPoints = 4;

  static const _rideColour = '#3FAE5A';
  static const _walkColour = '#9AA7A0';
  static const _alertColour = '#E0A100';
  static final _hex = RegExp(r'^#[0-9a-fA-F]{6}$');

  /// A part's colour: its line's, or the app's green for a bus, or grey for a walk.
  static String colourOf(TripLeg l) {
    if (!l.ride) return _walkColour;
    final c = l.color;
    return c != null && _hex.hasMatch(c) ? c : _rideColour;
  }

  /// Each part's length along the bar, adding up to [total].
  static List<int> lengths(List<TripLeg> legs) {
    if (legs.isEmpty) return const [];
    final weights = [for (final l in legs) l.minutes < 1 ? 1.0 : l.minutes];
    final sum = weights.fold<double>(0, (a, b) => a + b);
    final out = [for (final w in weights) (w / sum * total).round().clamp(_shortest, total)];
    // What rounding and the shortest length left over goes on the longest part.
    final spare = total - out.fold<int>(0, (a, b) => a + b);
    var longest = 0;
    for (var i = 1; i < out.length; i++) {
      if (out[i] > out[longest]) longest = i;
    }
    out[longest] += spare;
    return out;
  }

  /// The bar, for TripService: { segments: [{ length, color }], points: [{ at, color }], at, tracker }.
  static Map<String, Object?> progress(List<TripLeg> legs, int leg, double pos, {required int alertStops, required bool alerts, Set<int> alerted = const {}}) {
    if (legs.isEmpty || leg < 0 || leg >= legs.length) return const {};
    final sizes = lengths(legs);
    int startOf(int i) => sizes.take(i).fold<int>(0, (a, b) => a + b);
    final stops = legs[leg].points.length - 1;
    final share = stops < 1 ? 1.0 : (pos / stops).clamp(0.0, 1.0);
    final at = (((startOf(leg) + share * sizes[leg]) / _step).round() * _step).clamp(0, total);

    final points = <Map<String, Object?>>[];
    if (alerts) {
      for (var i = leg; i < legs.length && points.length < _maxPoints; i++) {
        final n = legs[i].points.length - 1;
        if (!legs[i].ride || alerted.contains(i) || n <= alertStops) continue;
        final where = startOf(i) + ((n - alertStops) / n * sizes[i]).round();
        if (where > at) points.add({'at': where, 'color': _alertColour});
      }
    }
    return {
      // Too many parts to draw each: one bar, still moving along.
      'segments': legs.length > _maxSegments
          ? [{'length': total, 'color': _rideColour}]
          : [for (final (i, l) in legs.indexed) {'length': sizes[i], 'color': colourOf(l)}],
      'points': points,
      'at': at,
      'tracker': legs[leg].kind,
    };
  }

  /// A few words for the status bar chip: stops left on a ride you're on, else the minutes left.
  /// Empty once you're there.
  static String chip({required TripLeg leg, required bool boarded, required int stopsLeft, required double minutesLeft, required bool last}) {
    if (stopsLeft == 0 && last) return '';
    if (leg.ride && boarded && stopsLeft > 0) {
      return stopsLeft == 1 ? tr('trip.chipStop', '1 stop') : tr('trip.chipStops', '{n} stops', {'n': stopsLeft});
    }
    return tr('trip.chipMin', '{m} min', {'m': minutesLeft < 1 ? 1 : minutesLeft.round()});
  }
}
