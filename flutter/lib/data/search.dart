// The stops a search matches, as the site's matchStops (script.js): a station ("Bedok MRT")
// gives the stops at it, nearest an exit first; otherwise a word LTA shortens matches all its
// forms, and several words match in any order across name and road, after the matches in one
// piece. A postal code (six digits) is its own search, and bus numbers come from BusNet.
import '../i18n/i18n.dart';
import 'contractions.dart';
import 'stations.dart';
import 'stops.dart';

class StopHit {
  StopHit(this.stop, {this.distance});
  final Stop stop;
  final double? distance;
}

class StopSearch {
  StopSearch._();

  static bool isPostal(String v) => RegExp(r'^\d{6}$').hasMatch(v.trim());

  static ({List<StopHit> stops, String note}) match(String query, {int limit = 20}) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return (stops: const <StopHit>[], note: '');

    final station = Stations.find(q);
    if (station != null) {
      final at = Stations.stopsAt(station).take(limit).toList();
      if (at.isNotEmpty) {
        return (
          stops: [
            for (final s in at)
              if (Stops.of(s.code) != null) StopHit(Stops.of(s.code)!, distance: s.distance)
          ],
          note: tr('search.stopsAt', 'Bus stops at {station}', {'station': Stations.label(station)}),
        );
      }
    }

    final isCode = RegExp(r'^\d+$').hasMatch(q);
    final swaps = isCode ? null : Contractions.matcher(q);
    final out = <StopHit>[];
    final loose = <StopHit>[];
    final swappedOnly = <String>[];
    for (final it in Stops.all) {
      final find = it.find;
      final plain = isCode ? it.code.startsWith(q) : find.contains(q);
      if (plain || (swaps?.test(find) ?? false)) {
        out.add(StopHit(it));
        if (!plain) swappedOnly.add(find);
        if (out.length >= limit) break;
      } else if (loose.length < limit && (swaps?.words(find) ?? false)) {
        loose.add(StopHit(it));
      }
    }
    final extra = loose.take(limit - out.length).toList();
    swappedOnly.addAll(extra.map((h) => h.stop.find));
    return (stops: [...out, ...extra], note: swappedOnly.isNotEmpty && swaps != null ? swaps.note(swappedOnly) : '');
  }
}
