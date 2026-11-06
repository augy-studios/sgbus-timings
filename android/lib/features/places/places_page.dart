// Places (the site's js/places.js): Home, Work and any other place saved, each with a name of
// your own if you like ("Gym", "Mum's"). Tapping a place plans the way there from where you are
// (Navigate); its menu edits it, shares it as a "How to get to" link, or deletes it (clears Home
// or Work). Every place is also a button under Navigate's ends, and a chip on Glance.
import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/places.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../tour/tour.dart';
import '../../widgets/place_search.dart';
import '../share/share_card.dart';

class PlacesPage extends StatefulWidget {
  const PlacesPage({super.key});

  @override
  State<PlacesPage> createState() => _PlacesPageState();
}

class _PlacesPageState extends State<PlacesPage> {
  @override
  void initState() {
    super.initState();
    Store.I.changes.listen((k) {
      if (mounted && (k == Places.key || k == 'sgbus_home' || k == 'sgbus_work')) setState(() {});
    });
  }

  Future<void> _edit([Place? p]) async {
    final fixed = p != null && (p.key == 'home' || p.key == 'work');
    final result = await showModalBottomSheet<({PlacePick place, String name})>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PlaceForm(place: p, fixed: fixed),
    );
    if (result == null) return;
    final clean = result.place.toJson();
    if (fixed) {
      Places.setFixed(p.key, clean);
    } else {
      final list = Places.custom();
      final id = p?.id;
      final i = list.indexWhere((x) => x['id'] == id);
      final item = {'id': id ?? Places.newId(), 'name': result.name.trim().length > 40 ? result.name.trim().substring(0, 40) : result.name.trim(), ...clean};
      if (i >= 0) {
        list[i] = item;
      } else {
        list.add(item);
      }
      Places.setCustom(list);
    }
    setState(() {});
  }

  Future<void> _delete(Place p) async {
    final fixed = p.key == 'home' || p.key == 'work';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(fixed
            ? tr('places.clearConfirm', 'Clear your {place}?', {'place': p.name.toLowerCase()})
            : tr('places.deleteConfirm', 'Delete {place} from your places?', {'place': p.name})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('places.cancel', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(fixed ? tr('places.clear', 'Clear') : tr('history.delete', 'Delete'))),
        ],
      ),
    );
    if (ok != true) return;
    if (fixed) {
      Places.setFixed(p.key, null);
    } else {
      Places.setCustom(Places.custom().where((x) => 'p:${x['id']}' != p.key).toList());
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final all = Places.all(unset: true);
    return SafeArea(
      bottom: false,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Text(tr('panel.places', 'Places'), style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 6),
        Text(tr('places.tap_a_place_for_the', "Tap a place for the way there from where you are. Each one is also a button under Navigate's From and To."),
            style: TextStyle(color: sg.muted)),
        const SizedBox(height: 12),
        for (final p in all)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SgCard(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              child: ListTile(
                leading: Icon(p.icon, color: sg.brandInk),
                title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: p.unset
                    ? Text(tr('places.notSet', 'Not set yet. Tap to set your {place}.', {'place': p.name.toLowerCase()}))
                    : (p.name != p.label ? Text(p.label) : null),
                onTap: p.unset ? () => _edit(p) : () => AppNav.open('navAt', {'from': 'here', 'to': {'label': p.name, 'lat': p.lat, 'lng': p.lng}}),
                trailing: p.unset
                    ? null
                    : PopupMenuButton<String>(
                        tooltip: tr('cal.moreFor', 'More for {title}', {'title': p.name}),
                        onSelected: (v) {
                          if (v == 'edit') _edit(p);
                          if (v == 'share') ShareCard.place(context, label: p.key == 'home' || p.key == 'work' ? p.label : p.name, lat: p.lat, lng: p.lng, note: tr('places.shareNote', "Anyone with this link can see where this place is. Place links don't expire."));
                          if (v == 'delete') _delete(p);
                        },
                        itemBuilder: (_) {
                          final fixed = p.key == 'home' || p.key == 'work';
                          return [
                            PopupMenuItem(value: 'edit', child: Text(fixed ? tr('places.editName', 'Edit {place}', {'place': p.name}) : tr('places.edit', 'Edit'))),
                            PopupMenuItem(value: 'share', child: Text(fixed ? tr('places.shareName', 'Share {place}', {'place': p.name}) : tr('history.share', 'Share'))),
                            PopupMenuItem(value: 'delete', child: Text(fixed ? tr('places.clear', 'Clear') : tr('history.delete', 'Delete'))),
                          ];
                        },
                      ),
              ),
            ),
          ),
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: TourTarget(id: 'places.add', child: FilledButton.icon(onPressed: () => _edit(), icon: const Icon(Icons.add), label: Text(tr('places.save_a_new_place', 'Save a new place')))),
        ),
        const SizedBox(height: 12),
        Text(tr('places.places_are_kept_on_this', 'Places are kept on this device. Sync with another device, in Settings, copies them to another.'),
            style: TextStyle(color: sg.muted, fontSize: 13)),
      ]),
    );
  }
}

class _PlaceForm extends StatefulWidget {
  const _PlaceForm({this.place, required this.fixed});
  final Place? place;
  final bool fixed;

  @override
  State<_PlaceForm> createState() => _PlaceFormState();
}

class _PlaceFormState extends State<_PlaceForm> {
  PlacePick? _pick;
  late final _name = TextEditingController(text: widget.place != null && !widget.fixed && widget.place!.name != widget.place!.label ? widget.place!.name : '');

  @override
  void initState() {
    super.initState();
    final p = widget.place;
    if (p != null && !p.unset) _pick = PlacePick(label: p.label, lat: p.lat, lng: p.lng, code: p.stop, kind: p.stop != null ? 'stop' : 'place');
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final p = widget.place;
    final title = p != null
        ? tr('places.editName', 'Edit {place}', {'place': p.name})
        : tr('places.saveNew', 'Save a new place');
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Text(tr('places.where', 'Where'), style: Theme.of(context).textTheme.titleSmall),
        OutlinedButton.icon(
          onPressed: () async {
            final got = await pickPlace(context);
            if (got != null) setState(() => _pick = got);
          },
          icon: const Icon(Icons.search),
          label: Text(_pick?.label ?? tr('places.searchOrHere', 'Search for the place, or use where you are.')),
        ),
        if (_pick != null) Text(tr('places.saving', 'Saving: {place}', {'place': _pick!.label}), style: TextStyle(color: sg.muted)),
        if (!widget.fixed) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            maxLength: 40,
            decoration: InputDecoration(
              labelText: tr('places.name_optional', 'Name (optional)'),
              hintText: _pick != null ? tr('places.eg', 'e.g. {place}', {'place': _pick!.label}) : tr('places.egDefault', "e.g. Gym, Mum's place"),
            ),
          ),
        ],
        const SizedBox(height: 12),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('places.cancel', 'Cancel'))),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: _pick == null ? null : () => Navigator.pop(context, (place: _pick!, name: _name.text)),
            child: Text(tr('places.save', 'Save')),
          ),
        ]),
      ]),
    );
  }
}
