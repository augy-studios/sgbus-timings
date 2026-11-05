// A search box for a place (the site's attachPlaceSearch, js/nav.js): /api/places, which finds
// addresses and buildings (OneMap), bus stops and stations, two letters on; and above the
// results, Use where I am, then your places and past searches while nothing's typed.
import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api.dart';
import '../data/location.dart';
import '../data/places.dart';
import '../data/stops.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'common.dart';

class PlacePick {
  const PlacePick({required this.label, required this.lat, required this.lng, this.kind = 'place', this.sub = '', this.code});
  final String label;
  final double lat;
  final double lng;
  final String kind; // place, stop, station, here
  final String sub;
  final String? code;

  Map<String, Object?> toJson() => {'label': label, 'lat': lat, 'lng': lng, if (kind == 'stop' && code != null) 'stop': code};

  static PlacePick from(Map m) => PlacePick(
        label: '${m['label']}',
        lat: (m['lat'] as num).toDouble(),
        lng: (m['lng'] as num).toDouble(),
        kind: '${m['kind'] ?? 'place'}',
        sub: '${m['sub'] ?? ''}',
        code: (m['code'] ?? m['stop']) as String?,
      );
}

/// Searches for a place in a sheet, and gives back the one picked.
Future<PlacePick?> pickPlace(BuildContext context, {String? title, bool here = true, bool saved = true}) =>
    showModalBottomSheet<PlacePick>(context: context, isScrollControlled: true, builder: (_) => _PlaceSheet(title: title, here: here, saved: saved));

class _PlaceSheet extends StatefulWidget {
  const _PlaceSheet({this.title, required this.here, required this.saved});
  final String? title;
  final bool here;
  final bool saved;

  @override
  State<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<_PlaceSheet> {
  final _q = TextEditingController();
  Timer? _timer;
  int _token = 0;
  List<PlacePick> _found = [];
  String _note = '';
  bool _locating = false;

  void _search(String v) {
    _timer?.cancel();
    final q = v.trim();
    if (q.length < 2) {
      setState(() {
        _found = [];
        _note = '';
      });
      return;
    }
    _timer = Timer(const Duration(milliseconds: 250), () async {
      final mine = ++_token;
      try {
        final r = await Api.get('places', query: {'q': q});
        if (mine != _token || !mounted) return;
        setState(() {
          _found = [for (final p in (r as List? ?? const [])) if (p is Map) PlacePick.from(p)];
          _note = '';
        });
      } catch (_) {
        // Offline or the search down: nothing listed, as on the site.
        if (mine == _token && mounted) setState(() => _found = []);
      }
    });
  }

  Future<void> _useHere() async {
    setState(() => _locating = true);
    try {
      final fix = await Locate.here(toDo: tr('location.toSaveHere', 'to save where you are'));
      await Stops.load();
      final near = Stops.near(fix.lat, fix.lng, limit: 1);
      final label = near.isEmpty ? tr('map.pinned', 'Pinned place') : tr('history.near', 'Near {stop}', {'stop': near.first.stop.name});
      if (mounted) Navigator.pop(context, PlacePick(label: label, lat: fix.lat, lng: fix.lng, kind: 'here'));
    } on LocationError catch (e) {
      if (mounted) setState(() => _note = e.message);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final places = widget.saved && _q.text.trim().isEmpty ? Places.all() : const <Place>[];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        builder: (ctx, scroll) => ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
          if (widget.title != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(widget.title!, style: Theme.of(context).textTheme.titleLarge)),
          TextField(
            controller: _q,
            autofocus: true,
            onChanged: _search,
            decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: tr('places.where', 'Where')),
          ),
          const SizedBox(height: 8),
          if (widget.here)
            ListTile(
              leading: _locating ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.my_location),
              title: Text(tr('glance.useLocation', 'Use my location')),
              onTap: _locating ? null : _useHere,
            ),
          for (final p in places)
            ListTile(
              leading: Icon(p.icon),
              title: Text(p.name),
              subtitle: p.name != p.label ? Text(p.label) : null,
              onTap: () => Navigator.pop(context, PlacePick(label: p.name, lat: p.lat, lng: p.lng, code: p.stop, kind: p.stop != null ? 'stop' : 'place')),
            ),
          if (_note.isNotEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(_note, style: TextStyle(color: sg.muted))),
          for (final p in _found)
            ListTile(
              leading: Icon(p.kind == 'station' ? Icons.train_outlined : p.kind == 'stop' ? Icons.directions_bus_outlined : Icons.place_outlined),
              title: Text(p.label),
              subtitle: p.sub.isNotEmpty ? Text(p.sub) : null,
              onTap: () => Navigator.pop(context, p),
            ),
          if (_found.isEmpty && _q.text.trim().length < 2 && places.isEmpty && !widget.here) EmptyNote(tr('places.searchOrHere', 'Search for the place, or use where you are.')),
        ]),
      ),
    );
  }
}
