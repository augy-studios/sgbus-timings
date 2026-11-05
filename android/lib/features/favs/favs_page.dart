// Favourites (the site's favourites, script.js's renderFavs): every favourite stop, bus, bus at a
// stop, bus-only route and nav, each a chip that opens it and has an x to take it out. Lists you
// make (help desk #6) each group some of them: a tab each beside Favourites, with Choose what's
// in it, Rename and Delete list; in a list, a chip's x takes it out of the list only. The list on
// show is the one Glance shows too.
import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/favs.dart';
import '../../data/network.dart';
import '../../data/stops.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../timings/bus_screen.dart';
import '../timings/stop_screen.dart';

class FavsPage extends StatefulWidget {
  const FavsPage({super.key});

  @override
  State<FavsPage> createState() => _FavsPageState();
}

class _FavsPageState extends State<FavsPage> {
  bool _picking = false;

  @override
  void initState() {
    super.initState();
    Favs.I.addListener(_redraw);
    Stops.load().then((_) => BusNet.load()).then((_) => _redraw()).catchError((_) {});
  }

  @override
  void dispose() {
    Favs.I.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() {
    if (mounted) setState(() {});
  }

  FavList? get _list {
    final id = Favs.I.listOn();
    return Favs.I.lists().where((l) => l.id == id).firstOrNull;
  }

  String? _nameError(String name, [String? id]) {
    if (name.isEmpty) return tr('favs.lists.error.empty', 'Give the list a name.');
    if (name.length > Favs.listNameMax) return tr('favs.lists.error.long', 'At most {max} letters.', {'max': Favs.listNameMax});
    final lower = name.toLowerCase();
    if (lower == 'favourites' || lower == 'favorites' || lower == tr('favs.title', 'Favourites').toLowerCase()) {
      return tr('favs.lists.error.favourites', 'Favourites is already there: it has every favourite.');
    }
    if (Favs.I.lists().any((l) => l.id != id && l.name.toLowerCase() == lower)) return tr('favs.lists.error.taken', 'There’s a list with that name already.');
    return null;
  }

  Future<String?> _askName(String title, [String initial = '', String? id]) async {
    final c = TextEditingController(text: initial);
    String? error;
    return showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text(title),
          content: TextField(
            controller: c,
            autofocus: true,
            maxLength: Favs.listNameMax,
            decoration: InputDecoration(hintText: tr('favs.lists.name.placeholder', 'Work, School, Weekends…'), errorText: error),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('common.cancel', 'Cancel'))),
            FilledButton(
              onPressed: () {
                final e = _nameError(c.text.trim(), id);
                if (e != null) {
                  set(() => error = e);
                } else {
                  Navigator.pop(ctx, c.text.trim());
                }
              },
              child: Text(tr('common.done', 'Done')),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _newList() async {
    final name = await _askName(tr('favs.lists.name.new', 'Name the new list'));
    if (name == null) return;
    final l = FavList(Favs.I.newListId(), name, []);
    Favs.I.setLists([...Favs.I.lists(), l]);
    Favs.I.setListOn(l.id);
    setState(() => _picking = true);
  }

  Future<void> _rename(FavList list) async {
    final name = await _askName(tr('favs.lists.name.rename', 'Rename {name}', {'name': list.name}), list.name, list.id);
    if (name == null) return;
    Favs.I.setLists([for (final l in Favs.I.lists()) l.id == list.id ? FavList(l.id, name, l.items) : l]);
  }

  Future<void> _delete(FavList list) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(tr('favs.lists.delete.confirm', 'Delete the list “{name}”? What’s in it stays in Favourites.', {'name': list.name})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(tr('common.cancel', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('favs.lists.delete', 'Delete list'))),
        ],
      ),
    );
    if (ok != true) return;
    Favs.I.setLists(Favs.I.lists().where((l) => l.id != list.id).toList());
    Favs.I.setListOn(null);
  }

  void _listOut(FavList list, List<String> keys) =>
      Favs.I.setLists([for (final l in Favs.I.lists()) l.id == list.id ? FavList(l.id, l.name, l.items.where((k) => !keys.contains(k)).toList()) : l]);

  void _toggleIn(FavList list, String key, bool on) => Favs.I.setLists([
        for (final l in Favs.I.lists())
          l.id == list.id ? FavList(l.id, l.name, on ? [...l.items.where((k) => k != key), key] : l.items.where((k) => k != key).toList()) : l
      ]);

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final list = _list;
    bool inList(String key) => list == null || list.items.contains(key);
    final favs = Favs.I.stops().where((f) => inList('stop:${f.code}')).toList();
    final buses = Favs.I.buses().where((no) => inList('bus:$no')).toList();
    final groups = <String, List<String>>{};
    for (final b in Favs.I.stopBuses()) {
      if (inList('stopbus:${b.code}/${b.service}')) (groups[b.code] ??= []).add(b.service);
    }
    final routes = list == null ? Favs.I.routes() : const <Map<String, dynamic>>[];
    final navs = list == null ? Favs.I.navs() : const <Map<String, dynamic>>[];
    final removeLabel = list != null ? tr('favs.removeFromList', 'Remove from {name}', {'name': list.name}) : tr('favs.remove', 'Remove from favourites');
    final lists = Favs.I.lists();
    final shown = favs.length + buses.length + groups.length + routes.length + navs.length;
    String stopName(String code) => Stops.nameOf(code).isNotEmpty ? Stops.nameOf(code) : tr('favs.stopNoName', 'Bus stop');

    Widget chip({String? code, required String name, String buses = '', required VoidCallback onOpen, required VoidCallback onRemove}) => InputChip(
          label: Text.rich(TextSpan(children: [
            if (code != null) TextSpan(text: '$code ', style: TextStyle(fontWeight: FontWeight.w700, color: sg.brandInk)),
            TextSpan(text: name),
            if (buses.isNotEmpty) TextSpan(text: ' · $buses', style: const TextStyle(fontWeight: FontWeight.w700)),
          ])),
          onPressed: onOpen,
          onDeleted: onRemove,
          deleteButtonTooltipMessage: removeLabel,
        );

    Widget group(String label, List<Widget> chips) => chips.isEmpty
        ? const SizedBox.shrink()
        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SectionLabel(label),
            Wrap(spacing: 8, runSpacing: 8, children: chips),
          ]);

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text(tr('favs.title', 'Favourites'), style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 10),
          // ---- the lists' tabs ----
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              Pill(
                label: tr('favs.title', 'Favourites'),
                on: list == null,
                onTap: () {
                  Favs.I.setListOn(null);
                  setState(() => _picking = false);
                },
              ),
              for (final l in lists)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Pill(
                    label: l.name,
                    on: list?.id == l.id,
                    onTap: () {
                      Favs.I.setListOn(l.id);
                      setState(() => _picking = false);
                    },
                  ),
                ),
              if (lists.length < Favs.listsMax)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Pill(icon: Icons.add, label: tr('favs.lists.new', 'New list'), tooltip: tr('favs.lists.new.title', 'Make a list of some of your favourites'), onTap: _newList),
                ),
            ]),
          ),
          if (list != null) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              Pill(icon: Icons.check, label: tr('favs.lists.pick', 'Choose what’s in it'), on: _picking, onTap: () => setState(() => _picking = !_picking)),
              Pill(icon: Icons.edit_outlined, label: tr('favs.lists.rename', 'Rename'), onTap: () => _rename(list)),
              Pill(icon: Icons.delete_outline, label: tr('favs.lists.delete', 'Delete list'), onTap: () => _delete(list)),
            ]),
          ],
          if (list != null && _picking) ...[
            const SizedBox(height: 8),
            _Picker(list: list, onToggle: (k, on) => _toggleIn(list, k, on), onDone: () => setState(() => _picking = false)),
          ] else ...[
            group(tr('favs.group.stops', 'Bus stops'), [
              for (final f in favs)
                chip(
                  code: f.code,
                  name: f.name.isNotEmpty ? f.name : stopName(f.code),
                  onOpen: () => StopScreen.open(f.code),
                  onRemove: () => list != null ? _listOut(list, ['stop:${f.code}']) : Favs.I.removeStop(f.code),
                ),
            ]),
            group(tr('favs.group.buses', 'Buses'), [
              for (final no in buses)
                chip(
                  code: no,
                  name: BusNet.endsText(no),
                  onOpen: () => BusScreen.open(no),
                  onRemove: () => list != null ? _listOut(list, ['bus:$no']) : Favs.I.toggleBus(no),
                ),
            ]),
            group(tr('favs.group.stopBuses', 'Buses at stops'), [
              for (final e in groups.entries)
                chip(
                  code: e.key,
                  name: stopName(e.key),
                  buses: e.value.join(', '),
                  onOpen: () => StopScreen.open(e.key, service: e.value.join(',')),
                  onRemove: () => list != null
                      ? _listOut(list, [for (final no in e.value) 'stopbus:${e.key}/$no'])
                      : [for (final no in e.value) Favs.I.toggleStopBus(e.key, no)],
                ),
            ]),
            group(tr('favs.group.routes', 'Bus-only routes'), [
              for (var i = 0; i < routes.length; i++)
                chip(
                  name: '${Stops.nameOf('${routes[i]['start']}').isNotEmpty ? Stops.nameOf('${routes[i]['start']}') : routes[i]['startName']} → '
                      '${Stops.nameOf('${routes[i]['end']}').isNotEmpty ? Stops.nameOf('${routes[i]['end']}') : routes[i]['endName']}',
                  onOpen: () => AppNav.open('planner', {'start': routes[i]['start'], 'end': routes[i]['end']}),
                  onRemove: () => Favs.I.setRoutes([...routes]..removeAt(i)),
                ),
            ]),
            group(tr('favs.group.navs', 'Navs'), [
              for (var i = 0; i < navs.length; i++)
                chip(
                  name: navLabel(navs[i]),
                  onOpen: () => AppNav.open('navSaved', {'nav': navs[i]}),
                  onRemove: () => Favs.I.setNavs([...navs]..removeAt(i)),
                ),
            ]),
            if (shown == 0)
              EmptyNote(
                list != null
                    ? tr('favs.lists.empty', 'Nothing in {name} yet. Choose what’s in it from your favourites.', {'name': list.name})
                    : tr('favs.empty', 'No favourites yet. Star a stop’s timings, a bus at a stop or on its route, or a nav (bus and train, or bus only).'),
                icon: Icons.star_outline_rounded,
              ),
          ],
        ],
      ),
    );
  }
}

/// A saved nav's label, with its stop on the way: Home → Gym → Work.
String navLabel(Map<String, dynamic> n) {
  String l(Object? p) => p is Map ? '${p['label'] ?? ''}' : '';
  final via = l(n['via']);
  return via.isNotEmpty ? '${l(n['from'])} → $via → ${l(n['to'])}' : '${l(n['from'])} → ${l(n['to'])}';
}

// Choose what's in it: every stop, bus and bus at a stop in Favourites, ticked if it's in.
class _Picker extends StatelessWidget {
  const _Picker({required this.list, required this.onToggle, required this.onDone});
  final FavList list;
  final void Function(String key, bool on) onToggle;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final has = list.items.toSet();
    String stopText(String code) => tr('favs.stop', 'Bus stop {code}', {'code': code});
    Widget row(String key, String name, String sub) => CheckboxListTile(
          value: has.contains(key),
          onChanged: (v) => onToggle(key, v == true),
          title: Text(name),
          subtitle: sub.isEmpty ? null : Text(sub),
          contentPadding: EdgeInsets.zero,
        );
    final stops = [
      for (final f in Favs.I.stops())
        row('stop:${f.code}', f.name.isNotEmpty ? f.name : (Stops.nameOf(f.code).isNotEmpty ? Stops.nameOf(f.code) : tr('favs.stopNoName', 'Bus stop')), stopText(f.code))
    ];
    final buses = [for (final no in Favs.I.buses()) row('bus:$no', tr('favs.bus', 'Bus {no}', {'no': no}), BusNet.endsText(no))];
    final at = [
      for (final b in Favs.I.stopBuses())
        row('stopbus:${b.code}/${b.service}', tr('favs.busAt', 'Bus {no} at {stop}', {'no': b.service, 'stop': Stops.nameOf(b.code).isEmpty ? b.code : Stops.nameOf(b.code)}),
            stopText(b.code))
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (stops.isEmpty && buses.isEmpty && at.isEmpty)
        EmptyNote(tr('favs.lists.pick.none', 'Nothing in Favourites to choose from yet. Star a stop, a bus, or a bus at a stop first.')),
      if (stops.isNotEmpty) ...[SectionLabel(tr('favs.group.stops', 'Bus stops')), ...stops],
      if (buses.isNotEmpty) ...[SectionLabel(tr('favs.group.buses', 'Buses')), ...buses],
      if (at.isNotEmpty) ...[SectionLabel(tr('favs.group.stopBuses', 'Buses at stops')), ...at],
      const SizedBox(height: 8),
      FilledButton(onPressed: onDone, child: Text(tr('common.done', 'Done'))),
    ]);
  }
}

/// For tests: the stop name with the code.
String stopLabel(String code) => '${Stops.nameOf(code)} ($code)';

/// The number of favourites, for the Edge Tray's star.
int favCount() => Favs.I.stops().length + Favs.I.buses().length + Favs.I.stopBuses().length + Favs.I.routes().length + Favs.I.navs().length;

/// "Bus 174 at Bedok Int (84009)", as a chip's title says it.
String busAtStopTitle(String code, List<String> nos) => nos.length == 1
    ? tr('favs.busAtStop', 'Bus {no} at {stop} ({code})', {'no': nos.first, 'stop': Stops.nameOf(code), 'code': code})
    : tr('favs.busesAtStop', 'Buses {list} at {stop} ({code})', {'list': listText(nos), 'stop': Stops.nameOf(code), 'code': code});
