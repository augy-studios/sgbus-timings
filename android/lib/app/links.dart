// The site's addresses, as the app opens them: what a shared link, a notification, a widget,
// a launcher shortcut, a uwu://sgbus/ link or a QR code points at, by the site's own hash
// routes (script.js's routeFromHash). MainActivity hands each over as the site's address
// (SgBusPlugin "open" events).
import '../data/when.dart';
import 'nav.dart';

class Links {
  Links._();
  static const site = 'https://sgbus.uwuapps.org';
  static final _routeRe = RegExp('^route\\/(\\d{5}|-)\\/(\\d{5}|-)${When.hashReSource}\$');
  static const _navEnd = r'(-|here|-?[\d.]+,-?[\d.]+(?:~[^/]*)?)';
  static const _navVia = r'(?:\/via\/(-?[\d.]+,-?[\d.]+(?:~[^/]*)?))?';
  static final _navRe = RegExp('^nav\\/$_navEnd\\/$_navEnd$_navVia${When.hashReSource}\$');

  /// Whether the address was one of the app's; it's opened when it is.
  static bool open(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    if (u.host.isNotEmpty && u.host != 'sgbus.uwuapps.org') return false;
    final short = RegExp(r'^/(?:go|trip|eta|feat)/([a-z0-9]{10})$').firstMatch(u.path);
    if (short != null) return AppNav.open('share', {'id': short[1]});
    // Something shared into the app: Navigate's To.
    final shared = ['title', 'text', 'url'].map((k) => u.queryParameters[k]?.trim()).whereType<String>().where((s) => s.isNotEmpty).toList();
    if (shared.isNotEmpty) return AppNav.open('navShared', {'text': shared.join('\n')});
    final raw = u.fragment;
    if (raw.isEmpty) return AppNav.open('home');
    return openHash(raw);
  }

  static bool openHash(String raw) {
    final hash = Uri.decodeComponent(raw);
    String? end(String? c) => c == '-' ? null : c;
    RegExpMatch? m;
    if ((m = RegExp(r'^sync\/([0-9A-Za-z]{6})$').firstMatch(hash)) != null) return AppNav.open('sync', {'code': m![1]});
    if (hash == 'alerts') return AppNav.open('alerts');
    if ((m = RegExp(r'^map\/(\d{5})$').firstMatch(hash)) != null) return AppNav.open('mapStop', {'code': m![1]});
    if ((m = RegExp(r'^map\/(-?[\d.]+,-?[\d.]+(?:~.*)?)$').firstMatch(hash)) != null) return AppNav.open('mapPlace', {'place': m![1]});
    if ((m = RegExp(r'^traffic\/(.+)$').firstMatch(hash)) != null) return AppNav.open('traffic', {'points': m![1]});
    if (hash == 'card') return AppNav.open('card');
    if ((m = RegExp(r'^board\/(\d{5})$').firstMatch(hash)) != null) return AppNav.open('board', {'code': m![1]});
    if ((m = RegExp(r'^share\/([a-z0-9]{10})$').firstMatch(hash)) != null) return AppNav.open('share', {'id': m![1]});
    if ((m = RegExp(r'^team\/([a-z0-9]{10})$').firstMatch(hash)) != null) return AppNav.open('team', {'code': m![1]});
    if (hash == 'near') return AppNav.open('near');
    if (hash == 'nav') return AppNav.open('nav');
    if (hash == 'route') return AppNav.open('planner');
    if ((m = _routeRe.firstMatch(hash)) != null) {
      return AppNav.open('planner', {'start': end(m![1]), 'end': end(m[2]), 'when': When.fromHash(m[3], m[4])});
    }
    if ((m = _navRe.firstMatch(raw) ?? _navRe.firstMatch(hash)) != null) {
      return AppNav.open('navHash', {'from': m![1], 'to': m[2], 'via': m[3], 'when': When.fromHash(m[4], m[5])});
    }
    if ((m = RegExp(r'^bus\/([0-9A-Za-z]{1,4})$').firstMatch(hash)) != null) return AppNav.open('bus', {'no': m![1]!.toUpperCase()});
    final parts = hash.split(',');
    if (RegExp(r'^\d{5}$').hasMatch(parts.first)) {
      return AppNav.open('stop', {'code': parts.first, 'service': parts.skip(1).join(',')});
    }
    return false;
  }

  // ---------- addresses to share ----------

  static String stop(String code) => '$site/#$code';

  /// Directions in Citymapper: its app where it's installed, its website otherwise. It has no mode in
  /// its links, and offers walking among its own. Without [from], from where you are.
  static String citymapper(double lat, double lng, String name, {String? road, ({double lat, double lng})? from}) => 'https://citymapper.com/directions?endcoord=$lat%2C$lng&endname=${Uri.encodeComponent(name)}'
      '${road != null && road.isNotEmpty ? '&endaddress=${Uri.encodeComponent(road)}' : ''}'
      '${from != null ? '&startcoord=${from.lat}%2C${from.lng}' : ''}';

  /// Navigate's Bus only, with what's set of it.
  static String route(String? start, String? end, WhenPick? when) => start == null && end == null && when == null ? '$site/#route' : '$site/#route/${start ?? '-'}/${end ?? '-'}${When.hashPart(when)}';
  static String bus(String no) => '$site/#bus/$no';
}
