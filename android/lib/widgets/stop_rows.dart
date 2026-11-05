// A list of stops to pick one from, as the site's stopRows: each with its name, road, distance
// and code, favourites starred (and pinned, per Settings), and a stop with a bus straight to
// where the route planner's going marked Direct.
import 'package:flutter/material.dart';

import '../data/favs.dart';
import '../data/geo.dart';
import '../data/network.dart';
import '../data/stops.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'common.dart';

class StopRowItem {
  const StopRowItem(this.code, {this.distance});
  final String code;
  final double? distance;
}

class StopRows extends StatelessWidget {
  const StopRows({super.key, required this.stops, required this.onPick, this.pin = true, this.direct});
  final List<StopRowItem> stops;
  final void Function(String code) onPick;
  final bool pin;
  final Map<String, List<String>>? direct;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final favs = Favs.I.stops().map((f) => f.code).toSet();
    var list = pin ? Favs.pinned(stops, favs, Favs.I.pin('stop'), (s) => s.code) : stops;
    if (direct != null && direct!.isNotEmpty) {
      list = [...list.where((s) => direct!.containsKey(s.code)), ...list.where((s) => !direct!.containsKey(s.code))];
    }
    if (list.isEmpty) return EmptyNote(tr('near.none', 'No bus stops found nearby.'));
    return Column(children: [
      for (final s in list)
        InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => onPick(s.code),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    if (favs.contains(s.code)) Icon(Icons.star_rounded, size: 16, color: sg.warn),
                    Flexible(child: Text(Stops.nameOf(s.code).isEmpty ? s.code : Stops.nameOf(s.code), style: const TextStyle(fontSize: 16))),
                  ]),
                  if ((Stops.of(s.code)?.road ?? '').isNotEmpty) Text(Stops.of(s.code)!.road, style: TextStyle(color: sg.muted, fontSize: 13)),
                  if (BusNet.crossBorder(s.code) != null)
                    Text(tr('stop.passport', '{place}: passport needed', {'place': BusNet.crossBorder(s.code)!.label()}), style: TextStyle(color: sg.muted, fontSize: 13)),
                  if (direct?[s.code] != null)
                    Text(tr('near.direct', 'Direct: {list}', {'list': direct![s.code]!.join(', ')}), style: TextStyle(color: sg.brandInk, fontSize: 13)),
                ]),
              ),
              if (s.distance != null) Padding(padding: const EdgeInsets.only(right: 8), child: Text(formatDistance(s.distance), style: TextStyle(color: sg.muted))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: sg.surfaceStrong, borderRadius: BorderRadius.circular(10), border: Border.all(color: sg.border)),
                child: Text(s.code, style: TextStyle(fontSize: 12, color: sg.muted)),
              ),
            ]),
          ),
        ),
    ]);
  }
}
