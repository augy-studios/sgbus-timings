// What a search box shows until you type (the site's Recents.attach, js/recents.js): your recent
// searches, the last 24 hours then earlier, each with a menu to save it as a place, share it or
// remove it, and Clear all; and a tab for your saved places, or, on Bus timings, your favourite
// stops and buses.
import 'package:flutter/material.dart';

import '../data/favs.dart';
import '../data/network.dart';
import '../data/places.dart';
import '../data/recents.dart';
import '../data/stops.dart';
import '../data/when.dart';
import '../features/calendar/calendar.dart';
import '../features/nav/doors.dart' show lineColour;
import '../features/share/share_card.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'common.dart';

class RecentsPanel extends StatefulWidget {
  const RecentsPanel({super.key, required this.accepts, required this.onPick, this.favs = false, this.onPlace, this.onFavStop, this.onFavBus, this.onEditPlaces, this.onEvent});
  final bool Function(Recent r) accepts;
  final void Function(Recent r) onPick;
  final bool favs; // the Saved tab: favourite stops and buses, not places
  final void Function(Place p)? onPlace;
  final void Function(String code)? onFavStop;
  final void Function(String no)? onFavBus;
  final VoidCallback? onEditPlaces;
  final void Function(EventPick pick)? onEvent; // a Calendar tab, for Navigate's ends

  @override
  State<RecentsPanel> createState() => _RecentsPanelState();
}

class _RecentsPanelState extends State<RecentsPanel> {
  String _tab = 'recent';

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final rows = <Widget>[];
    if (_tab == 'recent') {
      final list = Recents.all().where(widget.accepts).toList();
      if (list.isEmpty) {
        rows.add(EmptyNote(tr('recents.empty', 'Your searches show here, so you can find them again with a tap.')));
      } else {
        final cut = When.nowMs() - Recents.dayMs;
        final day = list.where((r) => r.at >= cut).toList();
        final earlier = list.where((r) => r.at < cut).toList();
        if (day.isNotEmpty) rows.add(_head(tr('recents.day', '24 hours')));
        rows.addAll(day.map(_row));
        if (earlier.isNotEmpty) rows.add(_head(tr('recents.earlier', 'Earlier')));
        rows.addAll(earlier.map(_row));
        rows.add(Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton(
            onPressed: () async {
              final yes = await showDialog<bool>(
                context: context,
                builder: (c) => AlertDialog(
                  content: Text(tr('recents.clearConfirm', 'Clear all your past searches?')),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('places.cancel', 'Cancel'))),
                    FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('recents.clearAll', 'Clear all'))),
                  ],
                ),
              );
              if (yes == true) setState(Recents.clear);
            },
            child: Text(tr('recents.clearAll', 'Clear all')),
          ),
        ));
      }
    } else if (_tab == 'calendar') {
      rows.add(CalendarTab(onPick: widget.onEvent!));
    } else if (widget.favs) {
      final stops = Favs.I.stops();
      final buses = Favs.I.buses();
      if (stops.isEmpty && buses.isEmpty) rows.add(EmptyNote(tr('recents.noFavs', 'Star a stop or a bus to see it here.')));
      for (final f in stops) {
        rows.add(ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.star_outline),
          title: Text(f.name.isNotEmpty ? f.name : (Stops.nameOf(f.code).isNotEmpty ? Stops.nameOf(f.code) : f.code)),
          subtitle: Text(tr('favs.stop', 'Bus stop {code}', {'code': f.code})),
          onTap: () => widget.onFavStop?.call(f.code),
        ));
      }
      for (final no in buses) {
        rows.add(ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.directions_bus_outlined),
          title: Text(tr('favs.bus', 'Bus {no}', {'no': no})),
          subtitle: Text(BusNet.endsText(no)),
          onTap: () => widget.onFavBus?.call(no),
        ));
      }
    } else {
      final places = Places.all();
      if (places.isEmpty) rows.add(EmptyNote(tr('recents.noPlaces', 'Save places in Places, in the Edge Tray.')));
      for (final p in places) {
        rows.add(ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(p.icon),
          title: Text(p.name),
          subtitle: p.name != p.label ? Text(p.label) : null,
          onTap: () => widget.onPlace?.call(p),
        ));
      }
      if (widget.onEditPlaces != null) {
        rows.add(Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton(onPressed: widget.onEditPlaces, child: Text(tr('recents.editPlaces', 'Edit places'))),
        ));
      }
    }
    Widget tab(String id, IconData icon, String label) => Tooltip(
          message: label,
          child: Semantics(
            selected: _tab == id,
            button: true,
            label: label,
            child: IconButton(
              isSelected: _tab == id,
              style: IconButton.styleFrom(backgroundColor: _tab == id ? sg.tray : null, foregroundColor: _tab == id ? sg.onTray : sg.muted),
              onPressed: () => setState(() => _tab = id),
              icon: Icon(icon),
            ),
          ),
        );
    return SgCard(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          tab('recent', Icons.history, tr('recents.recent', 'Recent')),
          const SizedBox(width: 4),
          tab('saved', Icons.star_outline, tr('stop.saved', 'Saved')),
          if (widget.onEvent != null) ...[
            const SizedBox(width: 4),
            tab('calendar', Icons.calendar_month_outlined, tr('settings.calendar', 'Calendar')),
          ],
        ]),
        ...rows,
      ]),
    );
  }

  Widget _head(String text) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 2),
        child: Text(text, style: TextStyle(color: context.sg.muted, fontSize: 12, fontWeight: FontWeight.w700)),
      );

  Widget _row(Recent r) {
    final sg = context.sg;
    final icon = r.kind == 'station' ? Icons.train_outlined : (r.kind == 'stop' || r.kind == 'bus') ? Icons.directions_bus_outlined : Icons.history;
    Widget? sub;
    if (r.kind == 'station') {
      sub = Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text(tr('recents.station', 'Station'), style: TextStyle(color: sg.muted)),
        for (final c in (r.code ?? '').split(RegExp(r'\s*/\s*')).where((c) => c.isNotEmpty))
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: lineColour(c), shape: BoxShape.circle)),
            const SizedBox(width: 3),
            Text(c, style: TextStyle(color: sg.muted, fontSize: 12)),
          ]),
      ]);
    } else if (r.sub.isNotEmpty) {
      sub = Text(r.sub, maxLines: 1, overflow: TextOverflow.ellipsis);
    }
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon),
      title: Text(r.label),
      subtitle: sub,
      onTap: () {
        Recents.add(r);
        widget.onPick(r);
      },
      trailing: PopupMenuButton<String>(
        tooltip: tr('cal.moreFor', 'More for {title}', {'title': r.label}),
        onSelected: (v) {
          if (v == 'remove') {
            setState(() => Recents.remove(r.key));
          } else if (v == 'save') {
            final list = Places.custom()..add({'id': Places.newId(), 'name': '', 'label': r.label, 'lat': r.lat, 'lng': r.lng, if (r.kind == 'stop' && r.code != null) 'stop': r.code});
            Places.setCustom(list);
            setState(() {});
            ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(tr('places.saving', 'Saving: {place}', {'place': r.label}))));
          } else if (v == 'share') {
            ShareCard.place(context, label: r.label, lat: r.lat!, lng: r.lng!);
          }
        },
        itemBuilder: (_) => [
          if (r.hasPoint) PopupMenuItem(value: 'save', child: ListTile(leading: const Icon(Icons.push_pin_outlined), title: Text(tr('cal.saveAsPlace', 'Save as place')))),
          if (r.hasPoint) PopupMenuItem(value: 'share', child: ListTile(leading: const Icon(Icons.share_outlined), title: Text(tr('history.share', 'Share')))),
          PopupMenuItem(value: 'remove', child: ListTile(leading: const Icon(Icons.delete_outline), title: Text(tr('mapSave.remove', 'Remove')))),
        ],
      ),
    );
  }
}
