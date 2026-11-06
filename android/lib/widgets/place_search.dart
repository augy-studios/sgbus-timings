// A search box for a place (the site's attachPlaceSearch, js/nav.js): /api/places, which finds
// addresses and buildings (OneMap), bus stops and stations, two letters on; and above the
// results, Use where I am, then past searches and your places while nothing's typed
// (widgets/recents_panel.dart).
import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api.dart';
import '../api/net.dart';
import '../data/location.dart';
import '../data/recents.dart';
import '../data/when.dart';
import '../data/stations.dart';
import '../data/search.dart';
import '../data/stops.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'common.dart';
import 'recents_panel.dart';

class PlacePick {
  const PlacePick({required this.label, required this.lat, required this.lng, this.kind = 'place', this.sub = '', this.code, this.arriveBy});
  final String label;
  final double lat;
  final double lng;
  final String kind; // place, stop, station, here
  final String sub;
  final String? code;
  final int? arriveBy; // a calendar event's start, for Navigate's To

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
Future<PlacePick?> pickPlace(BuildContext context, {String? title, bool here = true, bool saved = true, bool calendar = false, String? query}) =>
    showModalBottomSheet<PlacePick>(context: context, isScrollControlled: true, builder: (_) => _PlaceSheet(title: title, here: here, saved: saved, calendar: calendar, query: query));

class _PlaceSheet extends StatefulWidget {
  const _PlaceSheet({this.title, required this.here, required this.saved, this.calendar = false, this.query});
  final String? title;
  final bool here;
  final bool saved;
  final bool calendar;
  final String? query; // something shared into the app, searched for at once

  @override
  State<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<_PlaceSheet> {
  static final _mapsLink = RegExp(r'https?://(maps\.app\.goo\.gl|goo\.gl/maps|(www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+)', caseSensitive: false);

  late final _q = TextEditingController(text: widget.query ?? '');

  @override
  void initState() {
    super.initState();
    if (widget.query != null) _search(widget.query!);
  }
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
    // A Google Maps link is pasted whole, so it's read at once and, once placed, picked.
    final link = _mapsLink.hasMatch(q);
    // Offline, only what the phone has: stations and bus stops.
    if (Net.off.value && !link) {
      _token++;
      _onPhone(q);
      return;
    }
    if (link) {
      setState(() {
        _found = [];
        _note = Net.off.value
            ? tr('nav.gmapsOffline', 'Reading a Google Maps link needs a connection. Pick a stop, a station or one of your places.')
            : tr('nav.gmapsReading', 'Reading the Google Maps link…');
      });
      if (Net.off.value) return;
    }
    _timer = Timer(link ? Duration.zero : const Duration(milliseconds: 250), () async {
      final mine = ++_token;
      try {
        final r = await Api.get('places', query: {'q': q});
        if (mine != _token || !mounted) return;
        final found = [for (final p in (r as List? ?? const [])) if (p is Map) PlacePick.from(p)];
        if (link && found.length == 1) {
          Navigator.pop(context, found.first);
          return;
        }
        setState(() {
          _found = found;
          _note = '';
        });
      } on ApiError catch (e) {
        // Coordinates or a plus code outside Singapore: said, rather than an empty list.
        if (mine != _token || !mounted) return;
        setState(() {
          _found = [];
          _note = link ? (e.message.isNotEmpty ? e.message : tr('nav.gmapsFailed', "Couldn't read that Google Maps link. Please try again.")) : (e.status == 422 ? e.message : '');
        });
      } catch (_) {
        if (mine != _token || !mounted) return;
        if (link) {
          setState(() {
            _found = [];
            _note = tr('nav.gmapsOfflineTry', "Couldn't read that Google Maps link. Check your connection and try again.");
          });
        } else {
          // Not reached: what the phone has, as offline.
          _onPhone(q);
        }
      }
    });
  }

  // Places with no /api/places to ask: MRT and LRT stations and bus stops, as it lists them, an exact
  // stop code first. No addresses or buildings, which are OneMap's.
  Future<void> _onPhone(String q) async {
    await Stops.load();
    await Stations.load().catchError((_) {});
    if (!mounted) return;
    final lower = q.toLowerCase();
    final stations = (Stations.all ?? const <Station>[])
        .where((s) => s.name.toLowerCase().contains(lower) || s.codes.any((c) => c.toLowerCase() == lower))
        .take(4)
        .map((s) => PlacePick(label: '${s.name} station', lat: s.lat, lng: s.lng, kind: 'station', sub: s.codes.join(' / '), code: s.codes.join('/')));
    final stops = StopSearch.match(q, limit: 6).stops.map((h) => h.stop).where((s) => s.lat != null && s.lng != null).map((s) => PlacePick(
          label: s.name.isEmpty ? s.code : s.name,
          lat: s.lat!,
          lng: s.lng!,
          kind: 'stop',
          sub: '${tr('favs.stop', 'Bus stop {code}', {'code': s.code})}${s.road.isEmpty ? '' : ' · ${s.road}'}',
          code: s.code,
        ));
    final exact = stops.where((s) => s.code == lower);
    setState(() {
      _found = [...exact, ...stations, ...stops.where((s) => s.code != lower)];
      _note = '';
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
          // Until something's typed: past searches, and a tab for your places.
          if (_q.text.trim().isEmpty)
            RecentsPanel(
              accepts: (r) => r.hasPoint,
              onPick: (r) => Navigator.pop(context, PlacePick(label: r.label, lat: r.lat!, lng: r.lng!, kind: r.kind == 'stop' || r.kind == 'station' ? r.kind : 'place', sub: r.sub, code: r.code)),
              onPlace: (p) => Navigator.pop(context, PlacePick(label: p.name, lat: p.lat, lng: p.lng, code: p.stop, kind: p.stop != null ? 'stop' : 'saved')),
              // An event: the way to its place, arriving by its start; or, its location matching
              // nothing, the location in the box to pick the place by hand.
              onEvent: widget.calendar
                  ? (e) {
                      final place = e.place;
                      if (place == null) {
                        _q.text = e.event.location;
                        _search(e.event.location);
                        setState(() {});
                        return;
                      }
                      final soon = !e.event.allDay && e.event.start > When.nowMs();
                      Navigator.pop(context, PlacePick(label: place.label, lat: place.lat, lng: place.lng, kind: 'event', arriveBy: soon ? e.event.start : null));
                    }
                  : null,
            ),
          if (_note.isNotEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(_note, style: TextStyle(color: sg.muted))),
          for (final p in _found)
            ListTile(
              leading: Icon(p.kind == 'station' ? Icons.train_outlined : p.kind == 'stop' ? Icons.directions_bus_outlined : Icons.place_outlined),
              title: Text(p.label),
              subtitle: p.sub.isNotEmpty ? Text(p.sub) : null,
              onTap: () {
                Recents.add(Recents.place(kind: p.kind, label: p.label, sub: p.sub, code: p.code, lat: p.lat, lng: p.lng));
                Navigator.pop(context, p);
              },
            ),
          if (_found.isEmpty && _q.text.trim().length == 1 && !widget.here) EmptyNote(tr('places.searchOrHere', 'Search for the place, or use where you are.')),
        ]),
      ),
    );
  }
}
