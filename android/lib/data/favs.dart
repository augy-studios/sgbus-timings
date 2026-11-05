// Favourites, as the site keeps them (script.js's LS): stops (sgbus_favs_v2, [{ code, name }]),
// buses everywhere (sgbus_fav_buses), a bus at one stop (sgbus_fav_stop_buses, [{ code,
// service }]), saved routes and Navigate trips, and the lists made of them (sgbus_fav_lists,
// [{ id, name, items }] with items "stop:84009", "bus:174", "stopbus:84009/174"). Where a
// favourite pins in a list, per kind: sgbus_pin_prefs.
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../native/native_bridge.dart';
import 'stops.dart';
import 'store.dart';

class FavStop {
  FavStop(this.code, this.name);
  final String code;
  final String name;
  Map<String, String> toJson() => {'code': code, 'name': name};
}

class FavList {
  FavList(this.id, this.name, this.items);
  final String id;
  final String name;
  final List<String> items;
  Map<String, Object> toJson() => {'id': id, 'name': name, 'items': items};
}

class Favs extends ChangeNotifier {
  Favs._() {
    Store.I.changes.listen((k) {
      if (k.startsWith('sgbus_fav')) notifyListeners();
    });
  }
  static final Favs I = Favs._();

  static const favKey = 'sgbus_favs_v2';
  static const busKey = 'sgbus_fav_buses';
  static const routeKey = 'sgbus_fav_routes';
  static const navKey = 'sgbus_fav_navs';
  static const stopBusKey = 'sgbus_fav_stop_buses';
  static const listsKey = 'sgbus_fav_lists';
  static const listOnKey = 'sgbus_fav_list_on';
  static const pinKey = 'sgbus_pin_prefs';
  static const listsMax = 20;
  static const listNameMax = 40;

  List<FavStop> stops() {
    final raw = Store.I.json<Object?>(favKey, null);
    if (raw is List) {
      return [for (final f in raw) if (f is Map && f['code'] is String) FavStop(f['code'] as String, '${f['name'] ?? ''}')];
    }
    final old = Store.I.list('sgbus_favourites');
    if (old.isNotEmpty) {
      final migrated = [for (final c in old) c is String ? FavStop(c, '') : FavStop('${(c as Map)['code']}', '${c['name'] ?? ''}')];
      setStops(migrated);
      return migrated;
    }
    return [];
  }

  void setStops(List<FavStop> list) {
    Store.I.putJson(favKey, [for (final f in list) f.toJson()]);
    shareWithWidgets();
  }

  bool isStop(String code) => stops().any((f) => f.code == code);

  void addStop(String code) {
    if (isStop(code)) return;
    setStops([...stops(), FavStop(code, Stops.nameOf(code))]);
  }

  void removeStop(String code) {
    setStops(stops().where((f) => f.code != code).toList());
    _prune();
  }

  void toggleStop(String code) => isStop(code) ? removeStop(code) : addStop(code);

  List<String> buses() => Store.I.list(busKey).whereType<String>().toList();
  bool isBus(String no) => buses().contains(no);
  void toggleBus(String no) {
    final b = buses();
    Store.I.putJson(busKey, b.contains(no) ? b.where((x) => x != no).toList() : [...b, no]);
    _prune();
  }

  List<({String code, String service})> stopBuses() => [
        for (final b in Store.I.list(stopBusKey))
          if (b is Map && RegExp(r'^\d{5}$').hasMatch('${b['code']}') && b['service'] is String && (b['service'] as String).isNotEmpty)
            (code: b['code'] as String, service: b['service'] as String)
      ];

  Set<String> busesAt(String code) => {for (final b in stopBuses()) if (b.code == code) b.service};
  bool isStopBus(String code, String no) => busesAt(code).contains(no);
  void toggleStopBus(String code, String no) {
    final list = stopBuses();
    final on = list.any((b) => b.code == code && b.service == no);
    final next = on ? list.where((b) => !(b.code == code && b.service == no)).toList() : [...list, (code: code, service: no)];
    Store.I.putJson(stopBusKey, [for (final b in next) {'code': b.code, 'service': b.service}]);
    _prune();
  }

  List<Map<String, dynamic>> routes() => Store.I.list(routeKey).whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
  void setRoutes(List<Map<String, dynamic>> r) => Store.I.putJson(routeKey, r);
  List<Map<String, dynamic>> navs() => Store.I.list(navKey).whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
  void setNavs(List<Map<String, dynamic>> r) => Store.I.putJson(navKey, r);

  // ---- lists ----

  List<FavList> lists() => [
        for (final l in Store.I.list(listsKey))
          if (l is Map && l['id'] is String && l['name'] is String && l['items'] is List)
            FavList(l['id'] as String, l['name'] as String, List<String>.from((l['items'] as List).whereType<String>()))
      ];

  void setLists(List<FavList> l) => Store.I.putJson(listsKey, l.isEmpty ? null : [for (final x in l) x.toJson()]);

  String? listOn() {
    final id = Store.I.get(listOnKey);
    return lists().any((l) => l.id == id) ? id : null;
  }

  void setListOn(String? id) => Store.I.put(listOnKey, id);

  /// Every favourite's key, as lists hold them.
  Set<String> keysNow() => {
        for (final s in stops()) 'stop:${s.code}',
        for (final b in buses()) 'bus:$b',
        for (final b in stopBuses()) 'stopbus:${b.code}/${b.service}',
      };

  // A list only groups favourites that are there.
  void _prune() {
    final keys = keysNow();
    final now = lists();
    final pruned = [for (final l in now) FavList(l.id, l.name, l.items.where(keys.contains).toList())];
    if (pruned.indexed.any((e) => e.$2.items.length != now[e.$1].items.length)) setLists(pruned);
  }

  String newListId() => 'l${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}${math.Random().nextInt(1 << 20).toRadixString(36)}';

  // ---- where favourites pin ----

  String pin(String kind) => Store.I.map(pinKey)[kind] == 'bottom' ? 'bottom' : 'top';
  void setPin(String kind, String where) {
    final p = Store.I.map(pinKey);
    p[kind] = where;
    Store.I.putJson(pinKey, p);
  }

  /// Stable-partitions items into favourited and not, per the kind's pin.
  static List<T> pinned<T>(List<T> items, Set<String> favs, String where, String Function(T) key) {
    if (favs.isEmpty) return items;
    final fav = items.where((i) => favs.contains(key(i))).toList();
    final rest = items.where((i) => !favs.contains(key(i))).toList();
    return where == 'bottom' ? [...rest, ...fav] : [...fav, ...rest];
  }

  // The widget's setup and the watch get the favourite stops (SgBusPlugin.setFavourites).
  void shareWithWidgets() {
    if (!Native.available) return;
    final list = [
      for (final f in stops())
        {
          'code': f.code,
          'name': f.name.isNotEmpty ? f.name : Stops.nameOf(f.code),
          if (Stops.of(f.code)?.lat != null) 'lat': Stops.of(f.code)!.lat,
          if (Stops.of(f.code)?.lng != null) 'lng': Stops.of(f.code)!.lng,
        }
    ];
    Native.call('SgBus', 'setFavourites', {'stops': list}).catchError((_) => null);
  }
}
