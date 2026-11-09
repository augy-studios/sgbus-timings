// Sync (the site's js/sync.js): favourites, and everything else of yours, with another device or
// the Telegram bot. With another device, one shows a code (with a link and a QR code of it) and
// the other enters it; PeerJS's broker introduces the two, then everything goes straight between
// them over a WebRTC data channel, STUN only (sync/peer.dart), so both have to be on the same
// network. With the bot, this phone shows a code and the bot's /sync takes it, through the site's
// relay. Once connected, each side sees the other's and ticks which to import or send. Copying
// only adds, except where there's only one of a thing (your name, your calendar's link, a
// setting): taking the other's replaces this one's. Nothing is ever removed.
//
// The wire, on top of the peers' hello and bye:
//   { type: 'favs', favs, kinds }  all of the sender's, on connecting and whenever they change,
//                                  and the kinds it can keep
//   { type: 'add', id, favs }      add these to yours
//   { type: 'added', id, count }   the answer, with how many were new
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../app/pages.dart';
import '../../data/calendar.dart';
import '../../data/rewards.dart';
import '../../data/favs.dart';
import '../../data/network.dart';
import '../../data/places.dart';
import '../../data/recents.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../sync/peer.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../reminders/reminders.dart';

const _hostKey = 'sgbus_sync_host_code';
const _lastKey = 'sgbus_sync_last_code';
const _maxItems = 500;

// ---------- what's synced ----------

class _Kind {
  const _Kind(this.kind, this.list, this.label, this.key);
  final String kind;
  final String list;
  final String Function() label;
  final String Function(Object? item) key;
}

String _pt(Map p) => '${(p['lat'] as num).toStringAsFixed(5)},${(p['lng'] as num).toStringAsFixed(5)}';
String _navKey(Object? n) {
  final m = n as Map;
  return 'nav:${_pt(m['from'] as Map)}>${_pt(m['to'] as Map)}${m['via'] is Map ? '/via/${_pt(m['via'] as Map)}' : ''}';
}

String _placeKey(Object? p) {
  final m = p as Map;
  return m['key'] == 'home' || m['key'] == 'work' ? '${m['key']}' : 'place:${_pt(m)}';
}

String _routineKey(Object? r) {
  final m = r as Map;
  final days = [for (final d in m['days'] as List) (d as num).toInt()]..sort();
  final buses = [for (final b in m['buses'] as List) '$b']..sort();
  return 'routine:${m['code']}@${m['time']}/${days.join()}/${buses.join(',')}';
}

final _kinds = <_Kind>[
  _Kind('profile', 'profile', () => tr('settings.you', 'You'), (p) => 'profile:${(p as Map)['field']}=${p['value']}'),
  _Kind('stop', 'stops', () => tr('favs.group.stops', 'Bus stops'), (s) => 'stop:${(s as Map)['code']}'),
  _Kind('bus', 'buses', () => tr('favs.group.buses', 'Buses'), (b) => 'bus:$b'),
  _Kind('route', 'routes', () => tr('sync.kind.routes', 'Routes'), (r) => 'route:${(r as Map)['start']}>${r['end']}'),
  _Kind('stopbus', 'stopBuses', () => tr('favs.group.stopBuses', 'Buses at stops'), (b) => 'stopbus:${(b as Map)['code']}/${b['service']}'),
  _Kind('favlist', 'favLists', () => tr('sync.kind.lists', 'Lists'),
      (l) => 'favlist:${'${(l as Map)['name']}'.toLowerCase()}=${([for (final i in l['items'] as List) '$i']..sort()).join(',')}'),
  _Kind('nav', 'navs', () => tr('favs.group.navs', 'Navs'), _navKey),
  _Kind('place', 'places', () => tr('settings.places', 'Places'), _placeKey),
  _Kind('trip', 'trips', () => tr('sync.kind.trips', 'Trips'), (t) => 'trip:${(t as Map)['id']}'),
  _Kind('search', 'searches', () => tr('sync.kind.searches', 'Past searches'), (r) => 'search:${Recent.from(r)?.key ?? ''}'),
  _Kind('routine', 'routines', () => tr('settings.routines', 'Routines'), _routineKey),
  _Kind('lastbus', 'lastbus', () => tr('settings.last_bus_reminders', 'Last bus reminders'), (r) => 'lastbus:${(r as Map)['code']}/${r['service']}'),
  _Kind('calendar', 'calendar', () => tr('settings.calendar', 'Calendar'),
      (c) => 'calendar:${'${(c as Map)['url']}'.replaceFirst(RegExp(r'^webcals?://', caseSensitive: false), 'https://')}'),
  _Kind('setting', 'settings', () => tr('settings.settings', 'Settings'), (s) => 'setting:${(s as Map)['field']}=${s['value']}'),
  // uwuCoins: this phone's balance, as { id, balance }; taking it adds it to yours, as on the web
  // (js/sync.js, kind coins) and in the bot's /sync.
  _Kind('coins', 'coins', () => tr('sync.kind.coins', 'uwuCoins'), (c) => 'coins:${(c as Map)['id']}=${c['balance']}'),
];

const _legacyKinds = ['profile', 'stop', 'bus', 'route', 'nav', 'place', 'trip', 'search'];

/// The settings that sync, each read from and put in the store as the site keeps it.
class _Setting {
  const _Setting(this.label, this.start, this.get, this.set, {this.values, this.text, this.ok, this.here});
  final String Function() label;
  final String start;
  final String Function() get;
  final void Function(String v) set;
  final List<String> Function()? values;
  final String Function(String v)? text;
  final bool Function(String v)? ok;
  final bool Function()? here;
}

String _onOff(String v) => v == 'on' ? tr('settings.on', 'On') : tr('settings.off', 'Off');
String _pin(String kind) => (Store.I.map(Favs.pinKey)[kind]) == 'bottom' ? 'bottom' : 'top';
void _setPin(String kind, String v) => Store.I.putJson(Favs.pinKey, {...Store.I.map(Favs.pinKey), kind: v});
const _trayExtras = ['explorer', 'simplygo', 'telegram', 'coffee', 'guide', 'nearstops', 'routines', 'card', 'receive', 'coins'];

final _settings = <String, _Setting>{
  'pin.stop': _Setting(() => tr('settings.pin_favourite_stops_in_lists', 'Pin favourite stops in lists'), 'top', () => _pin('stop'), (v) => _setPin('stop', v),
      values: () => const ['top', 'bottom'], text: (v) => v == 'bottom' ? tr('settings.bottom', 'Bottom') : tr('settings.top', 'Top')),
  'pin.bus': _Setting(() => tr('sync.set.pinBus', 'Pin favourite buses at a stop'), 'top', () => _pin('bus'), (v) => _setPin('bus', v),
      values: () => const ['top', 'bottom'], text: (v) => v == 'bottom' ? tr('settings.bottom', 'Bottom') : tr('settings.top', 'Top')),
  'bus.times': _Setting(() => tr('settings.bus_times', 'Bus times'), 'mins', () => Store.I.get('sgbus_times') == 'clock' ? 'clock' : 'mins',
      (v) => Store.I.put('sgbus_times', v == 'clock' ? 'clock' : null),
      values: () => const ['mins', 'clock'], text: (v) => v == 'clock' ? tr('settings.clock_time', 'Clock time') : tr('settings.minutes_and_seconds', 'Minutes and seconds')),
  'theme.mode': _Setting(() => tr('sync.set.mode', 'Light or dark'), 'light', () => AppLook.I.modePreference, (v) => AppLook.I.modePreference = v,
      values: () => const ['light', 'dark', 'time', 'phone'],
      text: (v) => switch (v) {
            'light' => tr('theme.light', 'Light'),
            'dark' => tr('theme.dark', 'Dark'),
            'time' => tr('sync.set.modeTime', 'By the time of day'),
            _ => tr('theme.contrast.auto', 'Phone’s setting'),
          }),
  'theme.colour': _Setting(() => tr('sync.set.colour', 'Colour'), 'classic', () => AppLook.I.swatchId, (v) => AppLook.I.swatchId = v,
      values: () => [for (final s in AppLook.swatches) s.id]),
  'getoff': _Setting(() => tr('settings.get_off_alert_on_a', 'Get Off Alert on a trip'), 'on', () => Store.I.get('sgbus.getOffAlert') == 'off' ? 'off' : 'on',
      (v) => Store.I.put('sgbus.getOffAlert', v == 'off' ? 'off' : null), values: () => const ['on', 'off'], text: _onOff),
  'earphones': _Setting(() => tr('settings.get_off_alerts_sound', "Get Off Alert's sound"), 'off',
      () => const ['true', 'on'].contains(Store.I.get('sgbus_getoff_earphones')) ? 'on' : 'off', (v) => Store.I.put('sgbus_getoff_earphones', v == 'on' ? 'true' : 'false'),
      values: () => const ['on', 'off'], text: (v) => v == 'on' ? tr('settings.earphones_only', 'Earphones only') : tr('settings.out_loud', 'Out loud'), here: () => Native.has('earphones')),
  'pip': _Setting(() => tr('settings.pictureinpicture', 'Picture-in-picture'), 'on', () => Store.I.get('sgbus_pip') == 'off' ? 'off' : 'on',
      (v) => Store.I.put('sgbus_pip', v == 'off' ? 'off' : null), values: () => const ['on', 'off'], text: _onOff, here: () => Native.has('pip')),
  'shake': _Setting(() => tr('settings.shake_to_refresh', 'Shake to refresh'), 'on', () => Store.I.get('sgbus_shake') == 'off' ? 'off' : 'on',
      (v) => Store.I.put('sgbus_shake', v), values: () => const ['on', 'off'], text: _onOff),
  'confetti': _Setting(() => tr('settings.birthday_confetti', 'Birthday confetti'), 'on', () => Store.I.get('sgbus_confetti') == 'off' ? 'off' : 'on',
      (v) => Store.I.put('sgbus_confetti', v == 'off' ? 'off' : null), values: () => const ['on', 'off'], text: _onOff),
  'tray.side': _Setting(() => tr('settings.edge_tray_side', 'Edge Tray side'), 'right', () => Store.I.get('sgbus_tray_side') == 'left' ? 'left' : 'right',
      (v) => Store.I.put('sgbus_tray_side', v == 'left' ? 'left' : null),
      values: () => const ['left', 'right'], text: (v) => v == 'left' ? tr('settings.left', 'Left') : tr('settings.right', 'Right')),
  'tray.hide': _Setting(() => tr('sync.set.trayHide', 'Edge Tray buttons turned off'), '',
      () => ((Store.I.get('sgbus_tray_hide') ?? '').split(' ').where((s) => s.isNotEmpty).toList()..sort()).join(' '),
      (v) => Store.I.put('sgbus_tray_hide', v.trim().isEmpty ? null : v.trim()),
      ok: (v) => v.split(' ').where((s) => s.isNotEmpty).every(_trayExtras.contains), text: (v) => v.trim().isEmpty ? tr('sync.set.none', 'None') : v.split(' ').join(', ')),
  'restricted': _Setting(() => tr('settings.restricted_areas', 'Restricted areas'), 'off', () => Store.I.get('sgbus_restricted') == 'on' ? 'on' : 'off', (v) {
    Store.I.put('sgbus_restricted', v == 'on' ? 'on' : null);
    BusNet.setOpenAccess(v == 'on');
  }, values: () => const ['on', 'off'], text: (v) => v == 'on' ? tr('settings.i_have_a_pass', 'I have a pass') : tr('settings.keep_out', 'Keep out')),
  'customs': _Setting(() => tr('settings.immigration_time', 'Immigration time'), 'auto',
      () => const ['15', '30', '45', '60'].contains(Store.I.get('sgbus_customs')) ? Store.I.get('sgbus_customs')! : 'auto',
      (v) => Store.I.put('sgbus_customs', v == 'auto' ? null : v), values: () => const ['auto', '15', '30', '45', '60'],
      text: (v) => v == 'auto' ? tr('settings.by_the_time', 'By the time') : v == '60' ? tr('settings.1_hr', '1 hr') : tr('time.min', '{m} min', {'m': v})),
  'bike': _Setting(() => tr('settings.cycling', 'Cycling'), 'off', () => Store.I.get('sgbus_bike') == 'on' ? 'on' : 'off', (v) => Store.I.put('sgbus_bike', v == 'on' ? 'on' : null),
      values: () => const ['off', 'on'], text: (v) => v == 'on' ? tr('settings.i_have_a_bike', 'I have a bike') : tr('settings.no_bike', 'No bike')),
  'glance': _Setting(() => tr('sync.set.glance', 'Next bus at a glance'), 'on', () => Pages.glanceOn() ? 'on' : 'off', (v) => Pages.setOn('glance', v == 'on'),
      values: () => const ['on', 'off'], text: _onOff),
  'pages.off': _Setting(() => tr('sync.set.pagesOff', 'Pages turned off'), '',
      () => (Pages.off().where((n) => n != 'glance').toList()..sort()).join(' '),
      (v) {
        final off = v.split(' ');
        for (final n in Pages.canHide.where((n) => n != 'glance')) {
          Pages.setOn(n, !off.contains(n));
        }
      },
      ok: (v) => v.split(' ').where((s) => s.isNotEmpty).every((n) => Pages.canHide.contains(n) && n != 'glance'),
      text: (v) => v.trim().isEmpty ? tr('sync.set.none', 'None') : v.split(' ').join(', ')),
  'start': _Setting(() => tr('settings.custom_home', 'Custom home'), 'stop', () => Pages.home() == 'glance' ? 'stop' : Pages.home(),
      (v) => Store.I.put(Pages.homeKey, v == 'stop' ? null : v), values: () => ['stop', ...Pages.ids.where((n) => n != 'glance')]),
  'nav.mode': _Setting(() => tr('sync.set.navMode', 'Navigate opens on'), 'all', () => Store.I.get('sgbus_nav_mode') == 'bus' ? 'bus' : 'all',
      (v) => Store.I.put('sgbus_nav_mode', v), values: () => const ['all', 'bus'],
      text: (v) => v == 'bus' ? tr('nav.bus_only', 'Bus only') : tr('nav.bus_and_train', 'Bus and train')),
};

bool _settingOk(Object? field, Object? value) {
  final s = _settings[field];
  if (s == null || value is! String || value.length > 100) return false;
  return s.ok != null ? s.ok!(value) : (s.values?.call() ?? const []).contains(value);
}

bool _here(String field) => _settings[field]!.here?.call() ?? true;

List<Map<String, String>> _ownSettings() => [
      for (final e in _settings.entries)
        if (_here(e.key) && e.value.get() != e.value.start) {'field': e.key, 'value': e.value.get()},
    ];

List<String> _ownKinds() => [
      ..._legacyKinds, 'calendar', 'stopbus', 'favlist', 'coins',
      if (Native.has('routines')) 'routine',
      if (Native.has('lastbus')) 'lastbus',
      for (final f in _settings.keys) if (_here(f)) 'setting:$f',
    ];

bool _keeps(List<String> kinds, String kind, Object? item) => kinds.contains(kind == 'setting' ? 'setting:${(item as Map)['field']}' : kind);

final _birthday = RegExp(r'^\d{4}-\d{2}-\d{2}$');

Map<String, List<Object?>> ownFavs() {
  final f = Favs.I;
  final name = (Store.I.get('sgbus_name') ?? '').trim();
  final birthday = Store.I.get('sgbus_birthday') ?? '';
  return {
    'profile': [if (name.isNotEmpty) {'field': 'name', 'value': name}, if (_birthday.hasMatch(birthday)) {'field': 'birthday', 'value': birthday}],
    'stops': [for (final s in f.stops()) s.toJson()],
    'buses': f.buses(),
    'routes': f.routes(),
    'navs': f.navs(),
    'stopBuses': [for (final b in f.stopBuses()) {'code': b.code, 'service': b.service}],
    'favLists': [for (final l in f.lists()) {'name': l.name, 'items': l.items}],
    'places': [
      for (final p in Places.all())
        {
          'key': p.key == 'home' || p.key == 'work' ? p.key : 'place',
          'name': p.key == 'home' || p.key == 'work' || p.name == p.label ? '' : p.name,
          'label': p.label,
          'lat': p.lat,
          'lng': p.lng,
          'stop': ?p.stop,
        },
    ],
    'trips': Store.I.list('sgbus_trips').take(_maxItems).toList(),
    'searches': [for (final r in Recents.all()) r.toJson()],
    'routines': Reminders.syncRoutines(),
    'lastbus': Reminders.syncLastBus(),
    'calendar': Calendar.syncList(),
    'settings': _ownSettings(),
    'coins': Coins.syncList(),
  };
}

List<({String key, String kind, Object? item})> _items(Map<String, List<Object?>> favs) => [
      for (final k in _kinds)
        for (final item in favs[k.list] ?? const []) (key: k.key(item), kind: k.kind, item: item),
    ];

/// Favourites from the other device, checked field by field: anything malformed is dropped.
Map<String, List<Object?>>? cleanFavs(Object? raw) {
  if (raw is! Map) return null;
  List<Object?> list(Object? v) => v is List ? v.take(_maxItems).toList() : const [];
  bool stop(Object? v) => v is String && RegExp(r'^\d{5}$').hasMatch(v);
  String text(Object? v, [int max = 80]) => v is String ? (v.length > max ? v.substring(0, max) : v) : '';
  final seen = <String>{};
  bool once(String k) => seen.add(k);
  bool place(Object? p) => p is Map && p['lat'] is num && p['lng'] is num && (p['lat'] as num) > 1.15 && (p['lat'] as num) < 1.5 && (p['lng'] as num) > 103.55 && (p['lng'] as num) < 104.1;
  Map<String, Object?> pl(Map p) => {'label': text(p['label']).isNotEmpty ? text(p['label']) : 'Place', 'lat': p['lat'], 'lng': p['lng']};
  final busRe = RegExp(r'^[0-9A-Z]{1,5}$');
  return {
    'profile': [
      for (final p in list(raw['profile']).whereType<Map>())
        if (((p['field'] == 'name' && p['value'] is String && (p['value'] as String).trim().isNotEmpty && (p['value'] as String).length <= 64) ||
                (p['field'] == 'birthday' && p['value'] is String && _birthday.hasMatch(p['value'] as String))) &&
            once('profile:${p['field']}'))
          {'field': p['field'], 'value': (p['value'] as String).trim()},
    ],
    'stops': [
      for (final s in list(raw['stops']).whereType<Map>())
        if (stop(s['code']) && once('stop:${s['code']}')) {'code': s['code'], 'name': text(s['name'])},
    ],
    'buses': [for (final b in list(raw['buses'])) if (b is String && busRe.hasMatch(b) && once('bus:$b')) b],
    'stopBuses': [
      for (final b in list(raw['stopBuses']).whereType<Map>())
        if (stop(b['code']) && b['service'] is String && busRe.hasMatch(b['service'] as String) && once('stopbus:${b['code']}/${b['service']}'))
          {'code': b['code'], 'service': b['service']},
    ],
    'favLists': [
      for (final l in list(raw['favLists']).whereType<Map>())
        if (l['name'] is String && (l['name'] as String).trim().isNotEmpty && l['items'] is List)
          () {
            final name = (l['name'] as String).trim();
            final items = {
              for (final k in l['items'] as List)
                if (k is String && RegExp(r'^(stop:\d{5}|bus:[0-9A-Z]{1,5}|stopbus:\d{5}/[0-9A-Z]{1,5})$').hasMatch(k)) k,
            }.take(_maxItems).toList();
            return {'name': name.length > 40 ? name.substring(0, 40) : name, 'items': items};
          }(),
    ].where((l) => !RegExp(r'^favou?rites$', caseSensitive: false).hasMatch('${l['name']}') && once(_kinds[5].key(l))).take(20).toList(),
    'routes': [
      for (final r in list(raw['routes']).whereType<Map>())
        if (stop(r['start']) && stop(r['end']) && once('route:${r['start']}>${r['end']}'))
          {'start': r['start'], 'startName': text(r['startName']), 'end': r['end'], 'endName': text(r['endName'])},
    ],
    'navs': [
      for (final n in list(raw['navs']).whereType<Map>())
        if (place(n['from']) && place(n['to']))
          {'from': pl(n['from'] as Map), 'to': pl(n['to'] as Map), if (place(n['via'])) 'via': pl(n['via'] as Map)},
    ].where((n) => once(_navKey(n))).toList(),
    'places': [
      for (final p in list(raw['places']).whereType<Map>())
        if (place(p) && text(p['label'], 120).trim().isNotEmpty)
          {
            'key': p['key'] == 'home' || p['key'] == 'work' ? p['key'] : 'place',
            'name': p['key'] == 'home' || p['key'] == 'work' ? '' : text(p['name'], 40).trim(),
            'label': text(p['label'], 120).trim(),
            'lat': p['lat'],
            'lng': p['lng'],
            if (stop(p['stop'])) 'stop': p['stop'],
          },
    ].where((p) => once(_placeKey(p))).toList(),
    'trips': [for (final t in list(raw['trips'])) ?_cleanTrip(t)].where((t) => once('trip:${t['id']}')).toList(),
    'searches': [for (final r in list(raw['searches'])) ?Recents.clean(r)].where((r) => once('search:${r.key}')).map((r) => r.toJson()).toList(),
    'routines': [
      for (final r in list(raw['routines']).whereType<Map>())
        if (stop(r['code']) &&
            r['time'] is String &&
            RegExp(r'^([01]\d|2[0-3])[0-5]\d$').hasMatch(r['time'] as String) &&
            r['days'] is List &&
            (r['days'] as List).isNotEmpty &&
            (r['days'] as List).every((d) => d is int && d >= 1 && d <= 7) &&
            r['buses'] is List &&
            (r['buses'] as List).length <= 20 &&
            (r['buses'] as List).every((b) => b is String && RegExp(r'^[0-9A-Z]{1,5}$|^[0-9A-Z]{1,3}\*$').hasMatch(b)))
          {
            'code': r['code'],
            'name': text(r['name']),
            'buses': {...(r['buses'] as List)}.toList(),
            'time': r['time'],
            'days': ({...(r['days'] as List).cast<int>()}.toList()..sort()),
          },
    ].where((r) => once(_routineKey(r))).take(Reminders.maxRoutines).toList(),
    'lastbus': [
      for (final r in list(raw['lastbus']).whereType<Map>())
        if (stop(r['code']) &&
            r['service'] is String &&
            busRe.hasMatch(r['service'] as String) &&
            ['wd', 'sat', 'sun'].every((d) => r[d] is String && RegExp(r'^(\d{4}|-)$').hasMatch(r[d] as String)) &&
            once('lastbus:${r['code']}/${r['service']}'))
          {'code': r['code'], 'name': text(r['name']), 'service': r['service'], 'wd': r['wd'], 'sat': r['sat'], 'sun': r['sun']},
    ].take(20).toList(),
    'calendar': [
      for (final c in list(raw['calendar']).whereType<Map>())
        if (c['url'] is String && (c['url'] as String).length <= 2000 && RegExp(r'^(https|webcal)://\S+$', caseSensitive: false).hasMatch(c['url'] as String)) {'url': c['url']},
    ].take(1).toList(),
    'settings': [
      for (final s in list(raw['settings']).whereType<Map>())
        if (_settingOk(s['field'], s['value']) && once('setting:${s['field']}')) {'field': s['field'], 'value': s['value']},
    ],
    'coins': [
      for (final c in list(raw['coins']).whereType<Map>())
        if (c['id'] is String && RegExp(r'^[\w-]{4,40}$').hasMatch(c['id'] as String) && c['balance'] is int && (c['balance'] as int) > 0 && (c['balance'] as int) <= 10000000)
          {'id': c['id'], 'balance': c['balance']},
    ].take(1).toList(),
  };
}

Map<String, Object?>? _cleanTrip(Object? raw) {
  if (raw is! Map || raw['id'] is! String || !RegExp(r'^[\w-]{8,64}$').hasMatch(raw['id'] as String)) return null;
  bool point(Object? p) => p is Map && p['lat'] is num && p['lng'] is num;
  if (raw['startedAt'] is! num || !point(raw['from']) || !point(raw['to']) || raw['legs'] is! List || (raw['legs'] as List).isEmpty) return null;
  String text(Object? v, [int max = 80]) => v is String ? (v.trim().length > max ? v.trim().substring(0, max) : v.trim()) : '';
  num n(Object? v, num max) => v is num && v.isFinite && v >= 0 ? (v > max ? max : v) : 0;
  final legs = [
    for (final l in (raw['legs'] as List).take(20).whereType<Map>())
      if (l['kind'] == 'bus' || l['kind'] == 'train')
        {
          'kind': l['kind'],
          'route': text(l['route'], 12),
          if (l['kind'] == 'train') ...{'color': RegExp(r'^#[0-9a-f]{3,8}$', caseSensitive: false).hasMatch('${l['color'] ?? ''}') ? l['color'] : '', 'lrt': l['lrt'] == true},
          if (l['kind'] == 'bus') 'op': text(l['op'], 8),
          'from': text(l['from']),
          'to': text(l['to']),
          'waitMin': n(l['waitMin'], 600),
          'rideMin': n(l['rideMin'], 600),
          'waitMeasured': l['waitMeasured'] == true,
          'rideMeasured': l['rideMeasured'] == true,
          'done': l['done'] == true,
        },
  ];
  if (legs.isEmpty) return null;
  final from = raw['from'] as Map, to = raw['to'] as Map;
  return {
    'id': raw['id'],
    'startedAt': raw['startedAt'],
    'endedAt': raw['endedAt'] is num ? raw['endedAt'] : raw['startedAt'],
    'title': text(raw['title']),
    'from': {'label': text(from['label']).isNotEmpty ? text(from['label']) : tr('nav.start', 'Start'), 'lat': from['lat'], 'lng': from['lng']},
    'to': {'label': text(to['label']).isNotEmpty ? text(to['label']) : tr('nav.end', 'End'), 'lat': to['lat'], 'lng': to['lng']},
    'arrived': raw['arrived'] == true,
    'walkMin': n(raw['walkMin'], 600),
    'legs': legs,
  };
}

/// Adds whichever of `favs` this phone doesn't have yet, and says how many that was.
int mergeFavs(Map<String, List<Object?>> favs) {
  final have = {for (final f in _items(ownFavs())) f.key};
  final f = Favs.I;
  final stops = f.stops();
  final buses = f.buses();
  final routes = f.routes();
  final navs = f.navs();
  final stopBuses = <Map<String, Object?>>[for (final b in f.stopBuses()) {'code': b.code, 'service': b.service}];
  final lists = f.lists();
  var listsChanged = false;
  final places = <Map>[], trips = <Map>[], searches = <Recent>[], routines = <Map>[], lastbus = <Map>[];
  final kinds = _ownKinds();
  var added = 0;
  for (final it in _items(favs)) {
    if (have.contains(it.key) || !_keeps(kinds, it.kind, it.item)) continue;
    have.add(it.key);
    final item = it.item;
    switch (it.kind) {
      case 'routine':
        routines.add(item as Map);
      case 'lastbus':
        lastbus.add(item as Map);
      case 'calendar':
        added += Calendar.mergeSync('${(item as Map)['url']}');
      case 'coins':
        if ((item as Map)['id'] != Coins.syncId) {
          Coins.add(item['balance'] as int, info: {'why': 'sync'});
          added++;
        }
      case 'setting':
        _settings['${(item as Map)['field']}']!.set('${item['value']}');
        added++;
      case 'profile':
        Store.I.put((item as Map)['field'] == 'name' ? 'sgbus_name' : 'sgbus_birthday', '${item['value']}');
        added++;
      case 'place':
        places.add(item as Map);
      case 'favlist':
        final m = item as Map;
        final at = lists.indexWhere((l) => l.name.toLowerCase() == '${m['name']}'.toLowerCase());
        if (at != -1) {
          final same = lists[at];
          lists[at] = FavList(same.id, same.name, {...same.items, ...[for (final i in m['items'] as List) '$i']}.toList());
        } else if (lists.length < Favs.listsMax) {
          lists.add(FavList(f.newListId(), '${m['name']}', [for (final i in m['items'] as List) '$i']));
        } else {
          continue;
        }
        listsChanged = true;
        added++;
      case 'stopbus':
        stopBuses.add(Map<String, Object?>.from(item as Map));
        added++;
      case 'trip':
        trips.add(item as Map);
      case 'search':
        final r = Recent.from(item);
        if (r != null) searches.add(r);
      case 'stop':
        final code = '${(item as Map)['code']}';
        stops.add(FavStop(code, Stops.nameOf(code).isNotEmpty ? Stops.nameOf(code) : '${item['name'] ?? ''}'));
        added++;
      case 'bus':
        buses.add('$item');
        added++;
      case 'nav':
        navs.add(Map<String, dynamic>.from(item as Map));
        added++;
      case 'route':
        final m = item as Map;
        String name(Object? c, Object? given) => Stops.nameOf('$c').isNotEmpty ? Stops.nameOf('$c') : ('$given'.isNotEmpty && given != null ? '$given' : '$c');
        routes.add({'start': m['start'], 'startName': name(m['start'], m['startName']), 'end': m['end'], 'endName': name(m['end'], m['endName'])});
        added++;
    }
  }
  if (added > 0) {
    f.setStops(stops);
    Store.I.putJson(Favs.busKey, buses);
    f.setRoutes(routes);
    f.setNavs(navs);
    Store.I.putJson(Favs.stopBusKey, stopBuses);
    if (listsChanged) f.setLists(lists);
    AppLook.I.changed();
  }
  if (places.isNotEmpty) {
    final haveP = {for (final p in Places.all()) p.key == 'home' || p.key == 'work' ? p.key : 'place:${_pt({'lat': p.lat, 'lng': p.lng})}'};
    final list = Places.custom();
    for (final p in places) {
      if (p['key'] == 'home' || p['key'] == 'work') {
        if (Places.fixed('${p['key']}') != null) continue;
        Places.setFixed('${p['key']}', {'label': p['label'], 'lat': p['lat'], 'lng': p['lng'], 'stop': ?p['stop']});
        added++;
      } else if (haveP.add('place:${_pt(p)}')) {
        list.add({'id': Places.newId(), 'name': p['name'], 'label': p['label'], 'lat': p['lat'], 'lng': p['lng'], 'stop': ?p['stop']});
        added++;
      }
    }
    Places.setCustom(list);
  }
  if (trips.isNotEmpty) {
    final have = Store.I.list('sgbus_trips').whereType<Map>().toList();
    final ids = {for (final t in have) t['id']};
    final fresh = trips.where((t) => !ids.contains(t['id'])).toList();
    if (fresh.isNotEmpty) Store.I.putJson('sgbus_trips', [...have, ...fresh].take(1000).toList());
    added += fresh.length;
  }
  if (searches.isNotEmpty) added += Recents.merge(searches);
  if (routines.isNotEmpty) added += Reminders.mergeRoutines(routines);
  if (lastbus.isNotEmpty) added += Reminders.mergeLastBus(lastbus);
  return added;
}

// ---------- the screen ----------

class SyncScreen extends StatefulWidget {
  const SyncScreen({super.key, this.code});
  final String? code;

  static void register() => AppNav.register('sync', (a) => AppNav.push(SyncScreen(code: a['code'] as String?), name: 'sync'));

  @override
  State<SyncScreen> createState() => _SyncScreenState();
}

class _SyncScreenState extends State<SyncScreen> {
  String? _role; // host, guest, bot
  String _status = 'idle';
  String _statusText = '';
  String _tone = 'busy';
  String _note = '';
  bool _noteError = false;
  String _code = '';
  late final _input = TextEditingController(text: widget.code != null ? P2P.normalise(widget.code!) : (Store.I.get(_lastKey) ?? ''));
  PeerHost? _host;
  PeerGuest? _guest;
  BotRelay? _bot;
  Map<String, List<Object?>>? _theirs;
  List<String> _theirKinds = _legacyKinds;
  String _tab = 'import';
  final Map<String, Set<String>> _picked = {'import': {}, 'export': {}};
  final Map<int, Timer> _pending = {};
  int _lastId = 0;
  bool _retriedTaken = false;

  @override
  void initState() {
    super.initState();
    if (widget.code != null) {
      _statusText = tr('sync.tapConnect', 'Tap Connect to sync with the device showing this code.');
    }
  }

  @override
  void dispose() {
    _end(bye: true, quiet: true);
    _input.dispose();
    super.dispose();
  }

  void _say(String text, [String tone = 'busy']) => setState(() {
        _statusText = text;
        _tone = tone;
      });

  void _noteSay(String text, {bool error = false}) => setState(() {
        _note = text;
        _noteError = error;
      });

  void _begin(String role) {
    _role = role;
    _status = 'connecting';
    _theirs = null;
    _theirKinds = _legacyKinds;
    _tab = 'import';
    _picked['import']!.clear();
    _picked['export']!.clear();
    _note = '';
  }

  void _end({bool bye = false, String text = '', String tone = 'busy', bool quiet = false}) {
    final host = _host, guest = _guest, bot = _bot;
    _host = null;
    _guest = null;
    _bot = null;
    host?.close();
    if (bye && _role == 'guest') {
      guest?.leave();
    } else {
      guest?.hangUp();
    }
    bot?.close();
    for (final t in _pending.values) {
      t.cancel();
    }
    _pending.clear();
    _role = null;
    _status = 'idle';
    _theirs = null;
    if (!quiet && mounted) _say(text, tone);
  }

  Future<void> _startHosting() async {
    if (_role != null) return;
    final stored = Store.I.get(_hostKey) ?? '';
    final code = P2P.isValid(stored) ? stored : P2P.generateCode();
    Store.I.put(_hostKey, code);
    setState(() {
      _begin('host');
      _code = code;
    });
    final host = PeerHost((status, {message, taken = false}) {
      if (!mounted || _host == null) return;
      if (taken && !_retriedTaken) {
        _retriedTaken = true;
        _newCode();
        return;
      }
      if (status == 'error') {
        if (taken) Store.I.put(_hostKey, null);
        setState(() => _end(text: message ?? '', tone: 'error'));
        return;
      }
      if (status == 'waiting') _retriedTaken = false;
      _onStatus(status);
    }, _onMessage);
    _host = host;
    _render();
    await host.start(code);
  }

  Future<void> _startBot() async {
    if (_role != null) return;
    final code = P2P.generateCode();
    setState(() {
      _begin('bot');
      _code = code;
    });
    final relay = BotRelay((status, {message}) {
      if (!mounted || _bot == null) return;
      if (status == 'ended') {
        setState(() => _end(text: message ?? '', tone: 'warn'));
      } else if (status == 'error') {
        setState(() => _end(text: message ?? '', tone: 'error'));
      } else {
        _onStatus(status);
      }
    }, _onMessage);
    _bot = relay;
    _render();
    await relay.start(code);
  }

  Future<void> _newCode([String note = '']) async {
    setState(() => _end());
    Store.I.put(_hostKey, null);
    await _startHosting();
    if (note.isNotEmpty) _noteSay(note);
  }

  Future<void> _join() async {
    final code = P2P.normalise(_input.text);
    if (!P2P.isValid(code)) {
      _say(tr('sync.codeIs', "The code is the {n} letters and numbers on the other device's screen.", {'n': P2P.codeLength}), 'error');
      return;
    }
    if (_role != null) _end();
    setState(() => _begin('guest'));
    Store.I.put(_lastKey, code);
    _input.text = code;
    final guest = PeerGuest((status, {message, taken = false}) {
      if (!mounted || _guest == null) return;
      if (status == 'dropped') {
        setState(() => _end(text: tr('sync.lost', 'Lost the connection to the other device. Tap Connect to try again.'), tone: 'warn'));
      } else if (status == 'unreachable') {
        setState(() => _end(
            text: tr('sync.unreachable',
                'Could not reach the other device. Both have to be on the same network: join the same wifi, or turn on a hotspot on one and join it from the other. Check the code is still the one on screen.'),
            tone: 'error'));
      } else if (status == 'error') {
        setState(() => _end(text: message ?? '', tone: 'error'));
      } else {
        _onStatus(status);
      }
    }, _onMessage);
    _guest = guest;
    _render();
    await guest.connect(code);
  }

  void _onStatus(String status) {
    final was = _status;
    _status = status;
    if (status != 'connected') {
      _theirs = null;
    } else if (was != 'connected' && _role != 'host') {
      _sendFavs();
    }
    _render();
  }

  void _send(Map<String, Object?> m) {
    _host?.send(m);
    _guest?.send(m);
    _bot?.send(m);
  }

  void _sendFavs() => _send({'type': 'favs', 'favs': ownFavs(), 'kinds': _ownKinds()});

  String get _other => _role == 'bot' ? tr('sync.theBot', 'the Telegram bot') : tr('sync.theDevice', 'the other device');
  String get _otherCap => _role == 'bot' ? tr('sync.TheBot', 'The Telegram bot') : tr('sync.TheDevice', 'The other device');

  void _onMessage(Map<String, dynamic> m) {
    if (!mounted) return;
    switch (m['type']) {
      case 'hello':
        if (_role == 'host') _sendFavs();
      case 'favs':
        final favs = cleanFavs(m['favs']);
        if (favs == null) return;
        final known = {for (final k in _kinds) k.kind, for (final f in _settings.keys) 'setting:$f'};
        setState(() {
          _theirs = favs;
          _theirKinds = m['kinds'] is List ? [for (final k in m['kinds'] as List) if (k is String && known.contains(k)) k] : _legacyKinds;
        });
      case 'add':
        final favs = cleanFavs(m['favs']);
        if (favs == null || m['id'] is! int) return;
        final added = mergeFavs(favs);
        _send({'type': 'added', 'id': m['id'], 'count': added});
        if (added > 0) _sendFavs();
        _noteSay(added > 0
            ? (added == 1 ? tr('sync.gotOne', '{who} sent 1 thing, now saved here.', {'who': _otherCap}) : tr('sync.gotMany', '{who} sent {n} things, now saved here.', {'who': _otherCap, 'n': added}))
            : tr('sync.gotNone', '{who} sent things this device already has.', {'who': _otherCap}));
      case 'added':
        final t = _pending.remove(m['id']);
        if (t == null) return;
        t.cancel();
        final count = ((m['count'] as num?) ?? 0).toInt().clamp(0, 100000);
        _noteSay(count > 0
            ? (count == 1 ? tr('sync.sentOne', 'Sent. {who} saved 1 new thing.', {'who': _otherCap}) : tr('sync.sentMany', 'Sent. {who} saved {n} new things.', {'who': _otherCap, 'n': count}))
            : tr('sync.sentNone', 'Sent. {who} already had all of those.', {'who': _otherCap}));
      case 'bye':
        if (_role == 'host') _newCode(tr('sync.guestLeft', 'The other device disconnected. The old code no longer works; this is a new one.'));
    }
  }

  void _render() {
    if (!mounted) return;
    final hosting = _role == 'host' || _role == 'bot';
    if (_role == 'host' && _status == 'waiting') {
      _say(tr('sync.waitDevice', 'Waiting for the other device. In its Settings, Sync, enter this code, or scan the QR code with its camera.'), 'warn');
    } else if (_role == 'bot' && _status == 'waiting') {
      _say(tr('sync.waitBot', 'Waiting for the Telegram bot. Tap Open the bot, or send it the command below. On a computer, scan the QR code with your phone.'), 'warn');
    } else if (_role != null && _status == 'connecting') {
      _say(hosting ? tr('sync.gettingCode', 'Getting the code ready…') : tr('sync.connecting', 'Connecting to the other device…'));
    } else if (_status == 'connected') {
      _say(_role == 'bot' ? tr('sync.connectedBot', 'Connected to the Telegram bot.') : tr('sync.connectedDevice', 'Connected to the other device.'), 'ok');
    } else {
      setState(() {});
    }
  }

  // ---------- copying ----------

  Map<String, List<Object?>>? get _source => _tab == 'import' ? _theirs : ownFavs();
  List<String> get _destKinds => _tab == 'import' ? _ownKinds() : _theirKinds;

  List<({String key, String kind, Object? item})> _listed() {
    final s = _source;
    if (s == null) return const [];
    final kinds = _destKinds;
    return _items(s).where((f) => _keeps(kinds, f.kind, f.item)).toList();
  }

  Set<String> _available() {
    final dest = _tab == 'import' ? ownFavs() : _theirs;
    if (_source == null || dest == null) return {};
    final there = {for (final f in _items(dest)) f.key};
    return {for (final f in _listed()) if (!there.contains(f.key)) f.key};
  }

  Map<String, List<Object?>> _pick(Map<String, List<Object?>> favs, Set<String> keys) => {
        for (final k in _kinds) k.list: [for (final item in favs[k.list] ?? const []) if (keys.contains(k.key(item))) item],
      };

  void _copy() {
    final picked = _picked[_tab]!;
    final source = _source;
    if (picked.isEmpty || source == null) return;
    final chosen = _pick(source, picked);
    final count = picked.length;
    picked.clear();
    if (_tab == 'import') {
      final added = mergeFavs(chosen);
      if (added > 0) _sendFavs();
      _noteSay(added == 1 ? tr('sync.importedOne', 'Imported 1 thing to this device.') : tr('sync.importedMany', 'Imported {n} things to this device.', {'n': added}));
    } else {
      final id = ++_lastId;
      _send({'type': 'add', 'id': id, 'favs': chosen});
      _pending[id] = Timer(Duration(seconds: _role == 'bot' ? 15 : 5), () {
        _pending.remove(id);
        if (mounted) _noteSay(tr('sync.noAnswer', 'No answer from {who}. Check it still says connected, then try again.', {'who': _other}), error: true);
      });
      _noteSay(count == 1 ? tr('sync.sendingOne', 'Sending 1 thing…') : tr('sync.sendingMany', 'Sending {n} things…', {'n': count}));
    }
  }

  String _title(String kind, Object? item) {
    final m = item is Map ? item : const {};
    String nameOf(Object? c, [Object? given]) => Stops.nameOf('$c').isNotEmpty ? Stops.nameOf('$c') : ('${given ?? ''}'.isNotEmpty ? '$given' : '$c');
    return switch (kind) {
      'profile' => m['field'] == 'name' ? tr('sync.yourName', 'Your name') : tr('sync.yourBirthday', 'Your birthday'),
      'stop' => nameOf(m['code'], m['name']),
      'bus' => tr('favs.bus', 'Bus {no}', {'no': item}),
      'stopbus' => tr('sync.busAt', 'Bus {no} at {stop}', {'no': m['service'], 'stop': nameOf(m['code'])}),
      'favlist' => '${m['name']}',
      'nav' => '${(m['from'] as Map)['label']} → ${(m['to'] as Map)['label']}',
      'place' => m['key'] == 'home' ? tr('places.home', 'Home') : m['key'] == 'work' ? tr('places.work', 'Work') : ('${m['name']}'.isNotEmpty ? '${m['name']}' : '${m['label']}'),
      'trip' => tr('sync.tripTo', 'To {place}', {'place': (m['to'] as Map?)?['label'] ?? ''}),
      'search' => '${m['label']}',
      'routine' => tr('sync.routineAt', '{time} at {stop}', {'time': '${'${m['time']}'.substring(0, 2)}:${'${m['time']}'.substring(2)}', 'stop': nameOf(m['code'], m['name'])}),
      'lastbus' => tr('sync.lastAt', 'Last {no} at {stop}', {'no': m['service'], 'stop': nameOf(m['code'], m['name'])}),
      'calendar' => tr('sync.calendarLink', 'Your calendar’s link'),
      'coins' => tr('sync.coinsN', '{n} uwuCoins', {'n': m['balance']}),
      'setting' => _settings['${m['field']}']?.label() ?? '${m['field']}',
      _ => '${nameOf(m['start'], m['startName'])} → ${nameOf(m['end'], m['endName'])}',
    };
  }

  String _sub(String kind, Object? item) {
    final m = item is Map ? item : const {};
    return switch (kind) {
      'profile' => '${m['value']}',
      'stop' => Stops.of('${m['code']}')?.road.isNotEmpty == true ? '${m['code']} · ${Stops.of('${m['code']}')!.road}' : '${m['code']}',
      'bus' => BusNet.endsText('$item'),
      'stopbus' => tr('favs.stop', 'Bus stop {code}', {'code': m['code']}),
      'favlist' => (m['items'] as List).isEmpty
          ? tr('sync.empty', 'Empty')
          : (m['items'] as List).length == 1
              ? tr('sync.oneFav', '1 favourite')
              : tr('sync.manyFavs', '{n} favourites', {'n': (m['items'] as List).length}),
      'nav' => tr('sync.byBusTrain', 'By bus and train'),
      'place' => '${m['label']}',
      'search' => '${m['sub'] ?? ''}',
      'trip' => [for (final l in (m['legs'] as List? ?? const []).whereType<Map>()) l['kind'] == 'bus' ? tr('favs.bus', 'Bus {no}', {'no': l['route']}) : '${l['route']}'].join(', '),
      'routine' => '${Reminders.daysText([for (final d in m['days'] as List) (d as num).toInt()])} · ${(m['buses'] as List).isNotEmpty ? tr('favs.bus', 'Bus {no}', {'no': (m['buses'] as List).join(', ')}) : tr('sync.everyBus', 'Every bus')}',
      'lastbus' => '${m['code']}',
      'calendar' => '${m['url']}'.replaceFirst(RegExp(r'^(\w+://[^/]+).*$'), r'$1/…'),
      'coins' => tr('sync.coinsSub', 'Taking them adds them to yours'),
      'setting' => _settings['${m['field']}']?.text?.call('${m['value']}') ?? '${m['value']}',
      _ => '${m['start']} → ${m['end']}',
    };
  }

  // ---------- drawing ----------

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final connected = _status == 'connected';
    final hosting = _role == 'host' || _role == 'bot';
    final link = _role == 'bot' ? 'https://t.me/sgbus_app?start=sync_$_code' : '${Api.site}/#sync/$_code';
    final dot = switch (_tone) { 'ok' => sg.ok, 'warn' => sg.warn, 'error' => sg.error, _ => sg.muted };
    return SgScaffold(
      title: tr('settings.sync', 'Sync'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        Text(
            tr('settings.favourites_places_routines_your_calendar',
                'Favourites, places, routines, your calendar, settings and more. Show a code on one device and enter it on the other. Both need to be on the same wifi, or one joined to the other’s hotspot. Closing Settings ends the sync.'),
            style: TextStyle(color: sg.muted)),
        const SizedBox(height: 12),
        if (_statusText.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              Container(width: 10, height: 10, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Expanded(child: Text(_statusText)),
            ]),
          ),
        if (_role == null) ...[
          FilledButton.icon(onPressed: _startHosting, icon: const Icon(Icons.qr_code_2), label: Text(tr('settings.show_a_code_on_this', 'Show a code on this device'))),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _input,
                textCapitalization: TextCapitalization.characters,
                maxLength: P2P.codeLength,
                onSubmitted: (_) => _join(),
                decoration: InputDecoration(hintText: tr('settings.or_enter_the_other_devices', 'Or enter the other device’s code'), counterText: ''),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(onPressed: _join, child: Text(tr('settings.connect', 'Connect'))),
          ]),
          const SizedBox(height: 16),
          OutlinedButton.icon(onPressed: _startBot, icon: const Icon(Icons.send_outlined), label: Text(tr('settings.sync_with_the_telegram_bot', 'Sync with the Telegram bot'))),
          const SizedBox(height: 6),
          Text(
              tr('settings.with_the_bot_what_you',
                  'With the bot, what you sync passes through this site’s server, kept for 10 minutes at most. Between two devices, it goes straight from one to the other.'),
              style: TextStyle(color: sg.muted, fontSize: 13)),
        ],
        if (hosting && !connected && _code.isNotEmpty)
          SgCard(
            child: Column(children: [
              Tooltip(
                message: tr('settings.tap_to_copy_the_link', 'Tap to copy the link'),
                child: InkWell(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: link));
                    _noteSay(tr('sync.linkCopied', 'Link copied.'));
                  },
                  child: Text(_code, style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: 6)),
                ),
              ),
              const SizedBox(height: 8),
              Container(color: Colors.white, padding: const EdgeInsets.all(8), child: QrImageView(data: link, size: 180, backgroundColor: Colors.white)),
              const SizedBox(height: 6),
              SelectableText(link, style: TextStyle(color: sg.muted, fontSize: 12), textAlign: TextAlign.center),
              if (_role == 'bot') ...[
                const SizedBox(height: 8),
                FilledButton.tonal(
                  onPressed: () => Native.call('SgBus', 'openLink', {'url': link}).catchError((_) => null),
                  child: Text(tr('settings.open_the_bot', 'Open the bot')),
                ),
                TextButton(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: '/sync $_code'));
                    _noteSay(tr('sync.commandCopied', 'Command copied. Paste it to the bot.'));
                  },
                  child: Text('${tr('html.or_send_it', 'Or send it')} /sync $_code'),
                ),
              ],
            ]),
          ),
        if (_role != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(spacing: 8, children: [
              if (_role == 'host' && !connected) TextButton(onPressed: () => _newCode(), child: Text(tr('settings.new_code', 'New code'))),
              OutlinedButton(
                onPressed: () => setState(() => _end(bye: true)),
                child: Text(connected ? tr('sync.disconnect', 'Disconnect') : hosting ? tr('settings.stop', 'Stop') : tr('common.cancel', 'Cancel')),
              ),
            ]),
          ),
        if (_note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_note, style: TextStyle(color: _noteError ? sg.error : sg.brandInk))),
        if (connected) ..._list(),
      ]),
    );
  }

  List<Widget> _list() {
    final sg = context.sg;
    final importing = _tab == 'import';
    final picked = _picked[_tab]!;
    final out = <Widget>[
      const SizedBox(height: 12),
      FitSegments<String>(
        showSelectedIcon: true,
        options: [('import', tr('settings.import', 'Import')), ('export', tr('settings.export', 'Export'))],
        selected: _tab,
        onChanged: (v) => setState(() => _tab = v),
      ),
      const SizedBox(height: 8),
      Text(
        importing
            ? (_role == 'bot' ? tr('sync.noteImportBot', 'The Telegram bot’s favourites, places and more. Tick the ones to add to this device.') : tr('sync.noteImportDevice', 'The other device’s favourites, places and more. Tick the ones to add to this device.'))
            : (_role == 'bot' ? tr('sync.noteSendBot', 'This device’s favourites, places and more that the bot keeps. Tick the ones to add to the Telegram bot.') : tr('sync.noteSendDevice', 'This device’s favourites, places and more. Tick the ones to add to the other device.')),
        style: TextStyle(color: sg.muted),
      ),
    ];
    if (_source == null || _theirs == null) {
      return [...out, EmptyNote(tr('sync.waitingFor', 'Waiting for {who}…', {'who': _other}))];
    }
    final available = _available();
    picked.removeWhere((k) => !available.contains(k));
    final listed = _listed();
    if (listed.isEmpty) {
      return [...out, EmptyNote(importing ? tr('sync.theyHaveNothing', '{who} has nothing to share yet.', {'who': _otherCap}) : tr('sync.weHaveNothing', 'This device has nothing to share yet.'))];
    }
    out.add(CheckboxListTile(
      contentPadding: EdgeInsets.zero,
      tristate: true,
      value: picked.isEmpty ? false : (picked.length == available.length ? true : null),
      onChanged: available.isEmpty ? null : (v) => setState(() => picked.length == available.length ? picked.clear() : picked.addAll(available)),
      title: Text(tr('settings.select_all', 'Select all')),
    ));
    for (final k in _kinds) {
      final rows = listed.where((f) => f.kind == k.kind).toList();
      if (rows.isEmpty) continue;
      out.add(SectionLabel(k.label()));
      final free = [for (final f in rows) if (available.contains(f.key)) f.key];
      if (free.length > 1) {
        final all = free.every(picked.contains);
        out.add(CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          tristate: true,
          value: all ? true : (free.any(picked.contains) ? null : false),
          onChanged: (v) => setState(() => all ? picked.removeAll(free) : picked.addAll(free)),
          title: Text(tr('sync.selectAllOf', 'Select all: {kind}', {'kind': k.label()})),
        ));
      }
      for (final f in rows) {
        final done = !available.contains(f.key);
        final sub = _sub(f.kind, f.item);
        out.add(CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: done || picked.contains(f.key),
          onChanged: done ? null : (v) => setState(() => v == true ? picked.add(f.key) : picked.remove(f.key)),
          title: Text(_title(f.kind, f.item)),
          subtitle: Text([if (sub.isNotEmpty) sub, if (done) importing ? tr('sync.alreadyHere', 'Already here') : tr('sync.alreadyThere', 'Already there')].join(' · ')),
        ));
      }
    }
    final n = picked.length;
    out.add(Padding(
      padding: const EdgeInsets.only(top: 12),
      child: FilledButton(
        onPressed: n == 0 ? null : _copy,
        child: Text(n == 0
            ? (importing ? tr('sync.tickImport', 'Tick what to import') : tr('sync.tickSend', 'Tick what to send'))
            : importing
                ? (n == 1 ? tr('sync.importOne', 'Import 1 thing to this device') : tr('sync.importMany', 'Import {n} things to this device', {'n': n}))
                : (n == 1 ? tr('sync.sendOne', 'Send 1 thing to {who}', {'who': _other}) : tr('sync.sendMany', 'Send {n} things to {who}', {'n': n, 'who': _other}))),
      ),
    ));
    return out;
  }
}
