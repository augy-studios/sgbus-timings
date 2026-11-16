// The site's addresses, as the app opens them: what a shared link, a notification, a widget,
// a launcher shortcut, a uwu://sgbus/ link or a QR code points at, by the site's own hash
// routes (script.js's routeFromHash). MainActivity hands each over as the site's address
// (SgBusPlugin "open" events).
//
// And what's typed or pasted into the desktop app's command bar (desktop/chrome.dart): an
// address to open in the app, another site's to open in the browser, another UwU app's link, or
// words to search for (read), as the Electron app's address bar had it (desktop/main.js).
import 'package:flutter/foundation.dart';

import '../data/when.dart';
import 'nav.dart';

/// What the desktop's command bar makes of what's typed or pasted into it.
enum InputKind {
  /// Nothing typed.
  empty,

  /// One of the app's own addresses (the site's, a path on it, a uwu://sgbus/ link), opened in
  /// the app.
  inApp,

  /// Another site's address (or a page of the site the app has no screen for), opened in the
  /// browser.
  browser,

  /// Another UwU app's uwu:// link, handed to that app (desktop/links.dart).
  otherApp,

  /// Anything else: words to search for.
  search,
}

/// The command bar's reading of its text: what kind it is, and the address to open (or the
/// words to search for).
@immutable
class CommandInput {
  const CommandInput(this.kind, this.text);
  final InputKind kind;
  final String text;

  @override
  bool operator ==(Object other) => other is CommandInput && other.kind == kind && other.text == text;

  @override
  int get hashCode => Object.hash(kind, text);

  @override
  String toString() => 'CommandInput($kind, $text)';
}

/// The site's addresses: opening them on their screens, reading typed ones, and making them to
/// share. Everything is static.
class Links {
  Links._();
  static const site = 'https://sgbus.uwuapps.org';

  /// The app's links: uwu://sgbus/… (desktop-features-spec §10).
  static const scheme = 'uwu';
  static const linkHost = 'sgbus';
  static final _routeRe = RegExp('^route\\/(\\d{5}|-)\\/(\\d{5}|-)${When.hashReSource}\$');
  static const _navEnd = r'(-|here|-?[\d.]+,-?[\d.]+(?:~[^/]*)?)';
  static const _navVia = r'(?:\/via\/(-?[\d.]+,-?[\d.]+(?:~[^/]*)?))?';
  static final _navRe = RegExp('^nav\\/$_navEnd\\/$_navEnd$_navVia${When.hashReSource}\$');

  /// Opens one of the site's addresses on its screen. False if it isn't one of the app's.
  static bool open(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    if (u.host.isNotEmpty && u.host != 'sgbus.uwuapps.org') return false;
    final short = RegExp(r'^/(?:go|trip|eta|feat|egg)/([a-z0-9]{10})$').firstMatch(u.path);
    if (short != null) return AppNav.open('share', {'id': short[1]});
    // Something shared into the app: Navigate's To.
    final shared = ['title', 'text', 'url'].map((k) => u.queryParameters[k]?.trim()).whereType<String>().where((s) => s.isNotEmpty).toList();
    if (shared.isNotEmpty) return AppNav.open('navShared', {'text': shared.join('\n')});
    final raw = u.fragment;
    if (raw.isEmpty) return AppNav.open('home');
    return openHash(raw);
  }

  /// Opens a # address of the site (84009, bus/22, nav/…) on its screen. False if the app has
  /// no screen for it.
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

  // ---------- typed or pasted addresses ----------

  /// uwu://sgbus/ links, to the site's address they name, as the Android app maps them: the
  /// site's short links by their path (uwu://sgbus/go/k3v9q2x7ma), anything else as the site's
  /// # address (uwu://sgbus/84009, uwu://sgbus/bus/22, uwu://sgbus/nav, uwu://sgbus/map/84009),
  /// and uwu://sgbus/ alone the home page. Null for another host, or anything not a plain address.
  static String? fromAppLink(String link) {
    final Uri url;
    try {
      url = Uri.parse(link);
    } catch (_) {
      return null;
    }
    if (url.scheme.toLowerCase() != scheme || url.host.toLowerCase() != linkHost) return null;
    final rest = url.path.replaceAll(RegExp(r'^/+|/+$'), '');
    if (!RegExp(r'^[\w\-./,~%]*$').hasMatch(rest)) return null;
    if (rest.isEmpty) return '$site/';
    if (RegExp(r'^(go|trip|eta)/[a-z0-9]{10}$').hasMatch(rest)) return '$site/$rest';
    return '$site/#$rest';
  }

  /// An address typed in: the site's own (sgbus.uwuapps.org/#84009), another site's
  /// (example.com, https://…), a path or # address on the site (/#bus/22, #84009), or a
  /// uwu://sgbus/ link, as a whole address. Null for anything else.
  static String? typedAddress(String text) {
    final typed = text.trim();
    if (typed.isEmpty) return null;
    if (typed.toLowerCase().startsWith('$scheme://')) return fromAppLink(typed);
    if (RegExp(r'^[#/]').hasMatch(typed)) return Uri.parse('$site/').resolve(typed).toString();
    final hasScheme = RegExp(r'^[a-z][a-z0-9+.-]*://', caseSensitive: false).hasMatch(typed);
    // A space in the site's name (before the first /) makes it words, not an address
    // ("example.com with words"), as a browser's address bar refuses it.
    final afterScheme = hasScheme ? typed.substring(typed.indexOf('://') + 3) : typed;
    if (RegExp(r'\s').hasMatch(afterScheme.split(RegExp(r'[/?#]')).first)) return null;
    // A word, or a number, is not an address (84009 would be taken as an IP address).
    if (!hasScheme && !RegExp(r'^[^\s/?#]+\.[^\s/?#]+').hasMatch(typed)) return null;
    final Uri url;
    try {
      url = Uri.parse(hasScheme ? typed : 'https://$typed');
    } catch (_) {
      return null;
    }
    if ((url.scheme != 'http' && url.scheme != 'https') || url.host.isEmpty) return null;
    return _couldBeHost(url.host) ? url.toString() : null;
  }

  /// Whether a site's name could be one: its last part has a letter (a top-level domain such as
  /// .sg), or it's a whole IP address (an IPv6 one has colons; Uri drops its brackets). "1.5"
  /// and "1.3521,103.8198" are numbers, not sites.
  static bool _couldBeHost(String host) {
    if (RegExp(r'^\d{1,3}(\.\d{1,3}){3}$').hasMatch(host) || host.contains(':')) return true;
    return RegExp(r'[a-z]', caseSensitive: false).hasMatch(host.split('.').last);
  }

  /// Whether an address is the site's own: https:// on the site's host only, as the Electron app
  /// trusted (its origin check). Links that come from pages or the server must pass this; a plain
  /// http:// one isn't trusted. (What someone types in the command bar is upgraded first: read.)
  static bool isSite(String url) {
    final u = Uri.tryParse(url);
    return u != null && u.scheme == 'https' && u.host == Uri.parse(site).host;
  }

  /// A typed http:// address on the site's host, as https:// (the site only serves https), so
  /// typing "http://sgbus.uwuapps.org/#84009" opens it in the app. Anything else is unchanged.
  static String _upgradeTypedSite(String url) {
    final u = Uri.tryParse(url);
    if (u == null || u.scheme != 'http' || u.host != Uri.parse(site).host) return url;
    return u.replace(scheme: 'https', port: 443).toString();
  }

  /// Whether the app has a screen for a site address: the home page (with or without a #
  /// address or something shared into it), or one of the site's short links.
  static bool appHas(Uri url) {
    const home = {'', '/', '/index.html'};
    return home.contains(url.path) || RegExp(r'^/(?:go|trip|eta|feat|egg)/[a-z0-9]{10}$').hasMatch(url.path);
  }

  /// What the desktop's command bar makes of [typed]: an address to open in the app or in the
  /// browser, another UwU app's link, or words to search for. A site address opens in the app
  /// only if the app has a screen for it (appHas).
  static CommandInput read(String typed) {
    final text = typed.trim();
    if (text.isEmpty) return const CommandInput(InputKind.empty, '');
    if (text.toLowerCase().startsWith('$scheme://')) return _readAppLink(text);
    final typed0 = typedAddress(text);
    if (typed0 == null) return CommandInput(InputKind.search, text);
    final url = _upgradeTypedSite(typed0);
    if (isSite(url) && appHas(Uri.parse(url))) return CommandInput(InputKind.inApp, url);
    return CommandInput(InputKind.browser, url);
  }

  /// A uwu:// link typed in: this app's opens here; another UwU app's goes to it; a broken one
  /// is searched for (and isn't found).
  static CommandInput _readAppLink(String text) {
    final target = fromAppLink(text);
    if (target != null) return CommandInput(InputKind.inApp, target);
    // Another app's name: plain letters, digits, dots and dashes (no spaces).
    final host = text.substring('$scheme://'.length).split(RegExp(r'[/?#]')).first.toLowerCase();
    if (RegExp(r'^[a-z0-9][a-z0-9.-]*$').hasMatch(host) && host != linkHost) return CommandInput(InputKind.otherApp, text);
    return CommandInput(InputKind.search, text);
  }

  // ---------- addresses to share ----------

  /// A stop's address on the site.
  static String stop(String code) => '$site/#$code';

  /// Directions in Citymapper: its app where it's installed, its website otherwise. It has no mode in
  /// its links, and offers walking among its own. Without [from], from where you are.
  static String citymapper(double lat, double lng, String name, {String? road, ({double lat, double lng})? from}) => 'https://citymapper.com/directions?endcoord=$lat%2C$lng&endname=${Uri.encodeComponent(name)}'
      '${road != null && road.isNotEmpty ? '&endaddress=${Uri.encodeComponent(road)}' : ''}'
      '${from != null ? '&startcoord=${from.lat}%2C${from.lng}' : ''}';

  /// Navigate's Bus only, with what's set of it.
  static String route(String? start, String? end, WhenPick? when) => start == null && end == null && when == null ? '$site/#route' : '$site/#route/${start ?? '-'}/${end ?? '-'}${When.hashPart(when)}';
  /// A bus's route on the site.
  static String bus(String no) => '$site/#bus/$no';
}
