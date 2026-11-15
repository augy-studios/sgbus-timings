// Bus times at a glance, outside the window (desktop-features-spec §9; the Electron app's
// glance.js, 2.1.0):
//
// - The tray countdown: a stop picked with its timings' Tray countdown button (and one bus there,
//   if the timings were narrowed to it). Its next buses are fetched every 30 seconds and shown in
//   the tray icon's tooltip on Windows and Linux, as text beside the icon in the macOS menu bar,
//   and on macOS as the next bus's minutes on the Dock icon. The tray's menu says which stop it is,
//   and stops it. Kept in settings.json as trayStop, so it carries on after a restart.
// - Your favourite stops, from the app (data/favs.dart shareWithWidgets, through host.dart): in
//   Windows' Jump List and the taskbar thumbnail's buttons (Refresh, previous and next favourite),
//   and the macOS Dock menu; each opens that stop's timings. Kept as favourites.
//
// The words match the Electron app's. test/desktop/glance_test.dart checks the tooltip.
import 'dart:async';

import 'package:sgbus_desktop/sgbus_desktop.dart';

import '../api/api.dart';
import '../i18n/i18n.dart';
import 'chrome.dart';
import 'desktop.dart';
import 'settings.dart';
import 'tray.dart';

/// The tray countdown and the favourites in the Jump List, thumbnail buttons and Dock menu.
class Glance {
  Glance._();

  /// How often the tray countdown fetches its stop's next buses.
  static const refreshEvery = Duration(seconds: 30);

  /// Windows cuts a tray tooltip off at 127 characters.
  static const tipMax = 127;

  static Timer? _timer;
  static List<Map<String, String>> _favs = const [];

  /// The favourite the thumbnail's buttons last went to, so Previous and Next step on from it.
  static int _favAt = -1;

  /// A bus stop code: five digits.
  static final _stopCode = RegExp(r'^\d{5}$');

  /// The tray countdown's stop: {code, name, service}, or null when there's none.
  static Map<String, dynamic>? get stop => DeskSettings.get<Map<String, dynamic>>('trayStop');

  /// At start: the favourites kept from last time go back on the Jump List and Dock, the
  /// thumbnail buttons and Dock menu are listened to, and the tray countdown starts if one's set.
  static void init() {
    _favs = [
      for (final f in (DeskSettings.get<List>('favourites') ?? const []))
        if (f is Map && _stopCode.hasMatch('${f['code']}')) {'code': '${f['code']}', 'name': '${f['name'] ?? ''}'},
    ];
    _applyFavourites();
    SgbusDesktop.events.listen((e) {
      final (name, data) = e;
      if (name == 'thumb') {
        // The thumbnail's buttons, by the ids thumbButtons gives them.
        final id = data['id'];
        if (id == 0) _goFavourite(-1);
        if (id == 1) DeskChrome.reload();
        if (id == 2) _goFavourite(1);
      } else if (name == 'dock') {
        final i = data['index'];
        if (i is int && i >= 0 && i < _favs.length) Desktop.show('#${_favs[i]['code']}');
      }
    });
    restart();
  }

  // ---------- the tray countdown ----------

  /// From the stop's Tray countdown button: {code, name, service}, or null to stop it. Keeps a
  /// tidied copy (a five-digit code, the name cut to 60 characters, the bus to 5) and returns it,
  /// or null if there's no stop.
  static Map<String, dynamic>? setStop(Map<String, dynamic>? s) {
    final clean = s != null && _stopCode.hasMatch('${s['code']}')
        ? {
            'code': '${s['code']}',
            'name': _cut('${s['name'] ?? ''}', 60),
            'service': (s['service'] is String && (s['service'] as String).isNotEmpty) ? _cut((s['service'] as String).toUpperCase(), 5) : null,
          }
        : null;
    DeskSettings.write({'trayStop': clean});
    restart();
    DeskTray.refresh();
    return clean;
  }

  /// [s] cut to at most [n] characters.
  static String _cut(String s, int n) => s.length > n ? s.substring(0, n) : s;

  /// The stop's name, or its code when it has no name.
  static String _nameOf(Map s) {
    final name = s['name'];
    return name is String && name.isNotEmpty ? name : '${s['code']}';
  }

  /// Starts the countdown again from now (fetching at once, then every 30 seconds), or clears
  /// the tray if there's no stop.
  static void restart() {
    _timer?.cancel();
    _timer = null;
    if (stop == null) {
      _clear();
      return;
    }
    update();
    _timer = Timer.periodic(refreshEvery, (_) => update());
  }

  /// No countdown: the tooltip back to the app's name, and the menu-bar text and Dock badge gone.
  static void _clear() {
    DeskTray.tooltip(Desktop.name);
    if (Desktop.mac) {
      DeskTray.title('');
      SgbusDesktop.badge('');
    }
  }

  /// A bus's minutes as the tooltip says them: "Arr" for arriving now, otherwise "5 min".
  static String say(int m) => m == 0 ? tr('desktop.glance.arr', 'Arr') : tr('desktop.glance.min', '{n} min', {'n': m});

  /// Whole minutes until a bus from the arrivals API ({eta_ms: ...}) comes, never below 0; null
  /// if there's no estimate.
  static int? minutes(Object? bus) {
    if (bus is! Map || bus['eta_ms'] is! num) return null;
    final m = ((bus['eta_ms'] as num) / 60000).floor();
    return m < 0 ? 0 : m;
  }

  /// What every surface shows for a stop's arrivals ([services], from /api/bus-arrivals):
  /// - tip: the tooltip, the stop's name then a line a bus ("12: 3 min, 14 min"), soonest first,
  ///   cut to 127 characters with "…";
  /// - title: the macOS menu-bar text (" 12 · 3 min"), null when nothing's due;
  /// - badge: the macOS Dock badge (the soonest bus's minutes, or "Arr"), null when nothing's due.
  static ({String tip, String? title, String? badge}) describe(Map<String, dynamic> s, List services) {
    var list = services.whereType<Map>().toList();
    final only = s['service'];
    if (only is String) list = list.where((x) => '${x['serviceNo']}'.toUpperCase() == only).toList();
    final rows = [
      for (final x in list)
        if (minutes(x['next']) != null) (no: '${x['serviceNo']}', next: minutes(x['next'])!, then: minutes(x['next2'])),
    ]..sort((a, b) => a.next.compareTo(b.next));
    final lines = [for (final r in rows) '${r.no}: ${say(r.next)}${r.then != null ? ', ${say(r.then!)}' : ''}'];
    var tip = [_nameOf(s), ...(lines.isEmpty ? [tr('desktop.glance.none', 'No buses due right now')] : lines)].join('\n');
    if (tip.length > tipMax) tip = '${tip.substring(0, tipMax - 1)}…';
    final first = rows.firstOrNull;
    return (
      tip: tip,
      title: first == null ? null : ' ${first.no} · ${say(first.next)}',
      badge: first == null ? null : (first.next == 0 ? tr('desktop.glance.arr', 'Arr') : '${first.next}'),
    );
  }

  /// The tooltip when the arrivals couldn't be fetched, cut to 127 characters.
  static String failedTip(Map s) => _cut(tr('desktop.glance.failed', "{name}: couldn't get the timings just now", {'name': _nameOf(s)}), tipMax);

  /// Fetches the countdown stop's next buses and shows them on the tray (and the Dock on macOS).
  static Future<void> update() async {
    final s = stop;
    if (s == null) return;
    List services;
    try {
      final d = await Api.map('bus-arrivals', query: {'stop': s['code'], if (s['service'] != null) 'service': s['service']});
      services = (d['services'] as List?) ?? const [];
    } catch (_) {
      DeskTray.tooltip(failedTip(s));
      return;
    }
    // Stopped while the fetch was out: leave the tray as _clear left it.
    if (stop == null) return;
    final d = describe(s, services);
    DeskTray.tooltip(d.tip);
    if (Desktop.mac) {
      DeskTray.title(d.title ?? '');
      SgbusDesktop.badge(d.badge ?? '');
    }
  }

  /// The tray menu's line for the countdown ("Tray countdown: 12 at Opp Blk 123"), or null when
  /// there's none.
  static String? menuLabel() {
    final s = stop;
    if (s == null) return null;
    final name = _nameOf(s);
    return s['service'] != null
        ? tr('desktop.glance.menuBus', 'Tray countdown: {bus} at {stop}', {'bus': s['service'], 'stop': name})
        : tr('desktop.glance.menu', 'Tray countdown: {stop}', {'stop': name});
  }

  /// The tray menu's countdown line, clicked: the stop's timings in the window, narrowed to its
  /// bus if it has one.
  static void openStop() {
    final s = stop;
    if (s != null) Desktop.show('#${s['code']}${s['service'] != null ? ',${s['service']}' : ''}');
  }

  // ---------- favourites ----------

  /// From the app, whenever the favourite stops change: the first 10 with a proper stop code,
  /// kept, and put on the Jump List, thumbnail buttons and Dock menu.
  static void setFavourites(List<Map<String, Object?>> list) {
    _favs = [
      for (final f in list)
        if (_stopCode.hasMatch('${f['code']}')) {'code': '${f['code']}', 'name': _cut('${f['name'] ?? ''}', 60)},
    ].take(10).toList();
    DeskSettings.write({'favourites': _favs});
    _applyFavourites();
  }

  /// A favourite as the Jump List and Dock menu show it: "Name (12345)", or "Stop 12345".
  static String label(Map<String, String> f) => f['name']!.isNotEmpty ? '${f['name']} (${f['code']})' : tr('desktop.glance.stop', 'Stop {code}', {'code': f['code']});

  /// Puts the favourites on Windows' Jump List and thumbnail buttons, or the macOS Dock menu.
  static void _applyFavourites() {
    if (Desktop.windows) {
      // Each a uwu://sgbus/ link to the app itself, which the running copy is handed. Only from an
      // installed copy: run from source, there's no program to point them at.
      if (!Desktop.fromSource) {
        SgbusDesktop.jumpList([
          for (final f in _favs) (title: label(f), description: tr('desktop.glance.jump', 'Bus timings at {stop}', {'stop': label(f)}), args: '${Desktop.scheme}://${Desktop.linkHost}/${f['code']}'),
        ]);
      }
      thumbButtons();
    }
    if (Desktop.mac) {
      SgbusDesktop.dockMenu(_favs.isEmpty ? [(title: tr('desktop.glance.starOne', 'Star a stop to see it here'), enabled: false)] : [for (final f in _favs) (title: label(f), enabled: true)]);
    }
  }

  /// Windows' thumbnail buttons: Previous and Next favourite (greyed out with fewer than two) and
  /// Refresh. Set again each time the window's shown, as they only take once it's on the taskbar.
  static void thumbButtons() {
    if (!Desktop.windows) return;
    final many = _favs.length > 1;
    SgbusDesktop.thumbButtons([
      {'id': 0, 'tooltip': tr('desktop.glance.prev', 'Previous favourite stop'), 'icon': 'prev', 'enabled': many},
      {'id': 1, 'tooltip': tr('desktop.glance.refresh', 'Refresh'), 'icon': 'refresh', 'enabled': true},
      {'id': 2, 'tooltip': tr('desktop.glance.next', 'Next favourite stop'), 'icon': 'next', 'enabled': many},
    ]);
  }

  /// Previous (-1) or Next (1) favourite from the thumbnail: its timings in the window, going
  /// round the list.
  static void _goFavourite(int step) {
    if (_favs.isEmpty) return;
    _favAt = (_favAt + step + _favs.length) % _favs.length;
    Desktop.show('#${_favs[_favAt]['code']}');
  }
}
