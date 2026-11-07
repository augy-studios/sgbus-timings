// Places (the site's js/places.js): Home and Work under their own keys (sgbus_home, sgbus_work,
// { label, lat, lng, stop? }), and the rest one list, sgbus_places, [{ id, name, label, lat,
// lng, stop? }], `name` empty for none.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'geo.dart';
import 'store.dart';

class Place {
  Place({required this.key, required this.name, required this.label, required this.lat, required this.lng, this.stop, this.id, this.icon = Icons.place_outlined, this.unset = false});
  final String key; // home, work, p:<id>
  final String name;
  final String label;
  final double lat;
  final double lng;
  final String? stop;
  final String? id;
  final IconData icon;
  final bool unset;

  Map<String, Object?> point() => {'label': label, 'lat': lat, 'lng': lng, if (stop != null) 'stop': stop};
}

class Places {
  Places._();
  static const key = 'sgbus_places';
  static const maxPlaces = 100;

  static bool _isPoint(Map p) => p['lat'] is num && p['lng'] is num;

  static Map<String, dynamic>? fixed(String kind) {
    final v = Store.I.json<Map>(kind == 'work' ? 'sgbus_work' : 'sgbus_home', const {});
    return v['label'] is String && _isPoint(v) ? Map<String, dynamic>.from(v) : null;
  }

  static void setFixed(String kind, Map<String, Object?>? place) {
    Store.I.putJson(kind == 'work' ? 'sgbus_work' : 'sgbus_home', place);
    sendPlaces();
  }

  static List<Map<String, dynamic>> custom() => [
        for (final p in Store.I.list(key))
          if (p is Map && p['id'] is String && p['label'] is String && _isPoint(p)) Map<String, dynamic>.from(p)
      ];

  static void setCustom(List<Map<String, dynamic>> list) => Store.I.putJson(key, list.take(maxPlaces).toList());

  static String newId() => '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}${math.Random().nextInt(1 << 24).toRadixString(36)}';

  /// The name of the saved place within [within] metres of a point, nearest first, or null.
  static String? nameNear(Object? point, {double within = 150}) {
    if (point is! Map || !_isPoint(point)) return null;
    final at = [(point['lat'] as num).toDouble(), (point['lng'] as num).toDouble()];
    String? best;
    var bestM = within;
    for (final p in all()) {
      final m = metresAB(at, [p.lat, p.lng]);
      if (m <= bestM) {
        best = p.name;
        bestM = m;
      }
    }
    return best;
  }

  /// Home, Work and the rest, in that order; with `unset`, Home and Work even while they aren't set.
  static List<Place> all({bool unset = false}) {
    final out = <Place>[];
    for (final (kind, name, icon) in [('home', tr('places.home', 'Home'), Icons.home_outlined), ('work', tr('places.work', 'Work'), Icons.work_outline)]) {
      final p = fixed(kind);
      if (p != null) {
        out.add(Place(key: kind, name: name, label: p['label'] as String, lat: (p['lat'] as num).toDouble(), lng: (p['lng'] as num).toDouble(), stop: p['stop'] as String?, icon: icon));
      } else if (unset) {
        out.add(Place(key: kind, name: name, label: '', lat: 0, lng: 0, icon: icon, unset: true));
      }
    }
    for (final p in custom()) {
      final n = '${p['name'] ?? ''}';
      out.add(Place(
        key: 'p:${p['id']}',
        name: n.isNotEmpty ? n : p['label'] as String,
        label: p['label'] as String,
        lat: (p['lat'] as num).toDouble(),
        lng: (p['lng'] as num).toDouble(),
        stop: p['stop'] as String?,
        id: p['id'] as String,
      ));
    }
    return out;
  }

  /// Bus home and Bus to work: the launcher shortcuts and Quick Settings tiles (SgBusPlugin.setPlaces).
  static void sendPlaces() {
    if (!Native.available) return;
    Map<String, Object?>? of(String kind) {
      final p = fixed(kind);
      if (p == null) return null;
      return {...p, 'url': 'https://sgbus.uwuapps.org/#nav/here/${(p['lat'] as num).toStringAsFixed(5)},${(p['lng'] as num).toStringAsFixed(5)}~${Uri.encodeComponent(p['label'] as String)}'};
    }

    Native.call('SgBus', 'setPlaces', {'home': of('home'), 'work': of('work')}).catchError((_) => null);
  }
}
