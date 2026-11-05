// Past searches (the site's js/recents.js), as Citymapper's "Where to?": tap into a search box
// and, until you type, it drops down your recent searches (the last 24 hours, then earlier), with
// a tab for your saved places (or favourite stops and buses, on Bus timings).
//
// One list for every box: Bus timings' stop search, Navigate's From and To, and Places' search.
// A box records what's picked in it and shows only what it can use. Picking Your location or a
// saved place isn't a search, so isn't kept. Kept as sgbus_recents, newest first, up to 50, the
// site's shape: { kind: stop | station | place | bus | postal, label, sub, code?, lat?, lng?, at }.
// Sync can copy them to another device: syncList, clean and merge.
import 'network.dart';
import 'stops.dart';
import 'store.dart';
import 'when.dart';
import '../i18n/i18n.dart';

class Recent {
  const Recent({required this.kind, required this.label, this.sub = '', this.code, this.lat, this.lng, required this.at});
  final String kind;
  final String label;
  final String sub;
  final String? code;
  final double? lat;
  final double? lng;
  final int at;

  bool get hasPoint => lat != null && lng != null && lat!.isFinite && lng!.isFinite;

  String get key => kind == 'bus' || kind == 'postal' || (kind == 'stop' && code != null)
      ? '$kind:$code'
      : hasPoint
          ? '$kind:${lat!.toStringAsFixed(5)},${lng!.toStringAsFixed(5)}'
          : '$kind:$label';

  Map<String, Object?> toJson() => {
        'kind': kind,
        'label': label,
        'sub': sub,
        if (code != null) 'code': code,
        if (hasPoint) 'lat': lat,
        if (hasPoint) 'lng': lng,
        'at': at,
      };

  static Recent? from(Object? raw) {
    if (raw is! Map || raw['label'] is! String || raw['kind'] is! String) return null;
    return Recent(
      kind: raw['kind'] as String,
      label: raw['label'] as String,
      sub: raw['sub'] is String ? raw['sub'] as String : '',
      code: raw['code'] is String ? raw['code'] as String : null,
      lat: (raw['lat'] as num?)?.toDouble(),
      lng: (raw['lng'] as num?)?.toDouble(),
      at: (raw['at'] as num?)?.toInt() ?? 0,
    );
  }
}

class Recents {
  Recents._();
  static const key = 'sgbus_recents';
  static const max = 50;
  static const dayMs = 24 * 3600 * 1000;
  static const kinds = ['stop', 'station', 'place', 'bus', 'postal'];

  static List<Recent> all() => [for (final r in Store.I.list(key)) ?Recent.from(r)];

  static void _store(List<Recent> list) => Store.I.putJson(key, [for (final r in list.take(max)) r.toJson()]);

  static void add(Recent r) {
    if (r.label.isEmpty) return;
    final entry = Recent(
      kind: r.kind,
      label: r.label.length > 120 ? r.label.substring(0, 120) : r.label,
      sub: r.sub.length > 160 ? r.sub.substring(0, 160) : r.sub,
      code: r.code,
      lat: r.hasPoint ? r.lat : null,
      lng: r.hasPoint ? r.lng : null,
      at: When.nowMs(),
    );
    _store([entry, ...all().where((x) => x.key != entry.key)]);
  }

  static void remove(String k) => _store(all().where((r) => r.key != k).toList());
  static void clear() => _store(const []);

  // ---------- the kinds of search ----------

  static Recent stop(String code) {
    final s = Stops.of(code);
    return Recent(
      kind: 'stop',
      label: s?.name.isNotEmpty == true ? s!.name : code,
      sub: '${tr('favs.stop', 'Bus stop {code}', {'code': code})}${s?.road.isNotEmpty == true ? ' · ${s!.road}' : ''}',
      code: code,
      lat: s?.lat,
      lng: s?.lng,
      at: 0,
    );
  }

  static Recent bus(String no) => Recent(kind: 'bus', label: tr('favs.bus', 'Bus {no}', {'no': no}), sub: BusNet.endsText(no), code: no, at: 0);
  static Recent postal(String code) => Recent(kind: 'postal', label: code, sub: tr('search.nearPostal', 'Bus stops near this postal code'), code: code, at: 0);
  static Recent place({required String kind, required String label, String sub = '', String? code, required double lat, required double lng}) =>
      Recent(kind: kind == 'station' || kind == 'stop' ? kind : 'place', label: label, sub: sub, code: code, lat: lat, lng: lng, at: 0);

  // ---------- sync ----------

  /// A search from another device, checked field by field, or null.
  static Recent? clean(Object? raw) {
    if (raw is! Map || !kinds.contains(raw['kind']) || raw['label'] is! String || (raw['label'] as String).trim().isEmpty) return null;
    if (raw['at'] is! num) return null;
    final lat = (raw['lat'] as num?)?.toDouble(), lng = (raw['lng'] as num?)?.toDouble();
    final point = lat != null && lng != null && lat > 1.15 && lat < 1.5 && lng > 103.55 && lng < 104.1;
    final code = raw['code'];
    final label = raw['label'] as String;
    final sub = raw['sub'] is String ? raw['sub'] as String : '';
    return Recent(
      kind: raw['kind'] as String,
      label: label.length > 120 ? label.substring(0, 120) : label,
      sub: sub.length > 160 ? sub.substring(0, 160) : sub,
      code: code is String && RegExp(r'^[0-9A-Za-z]{1,6}$').hasMatch(code) ? code : null,
      lat: point ? lat : null,
      lng: point ? lng : null,
      at: (raw['at'] as num).toInt().clamp(0, When.nowMs()),
    );
  }

  /// Adds the ones this phone hasn't searched for, each in its place by when, keeping the newest
  /// [max]. Says how many it took.
  static int merge(List<Recent> list) {
    final have = all();
    final keys = have.map((r) => r.key).toSet();
    final fresh = list.where((r) => !keys.contains(r.key)).toList();
    if (fresh.isEmpty) return 0;
    final merged = [...have, ...fresh]..sort((a, b) => b.at - a.at);
    final kept = merged.take(max).toList();
    _store(kept);
    final keptKeys = kept.map((r) => r.key).toSet();
    return fresh.where((r) => keptKeys.contains(r.key)).length;
  }
}
