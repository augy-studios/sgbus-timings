// The desktop's answers to the bridge's calls (native/native_bridge.dart; flutter-desktop-app-spec
// §3), the ones a phone's Java plugins give: so the shared screens open links, share, notify, keep
// "New versions of the app", bring the old app's data across and the rest, with no desktop
// branches of their own. Anything not here is a phone's alone (NFC, the camera, the Get Off Alert
// with the screen off, widgets on a home screen...): it fails as 'unavailable', and the screen's
// plain path runs, as it does on the website.
//
// Three calls are the desktop's own, from the shared screens' desktop manners (adaptive.dart, the
// stop's buttons, the departures board): SgBus.setTrayStop (the tray countdown, glance.dart),
// SgBus.addWidget (a Bus timings widget, widgets_window.dart) and SgBus.setFullScreen (chrome.dart).
// What they're sent is checked here first, and a call that isn't the right shape fails as
// 'invalid' without changing anything.
import 'dart:io';

import 'package:flutter/services.dart';

import '../app/links.dart';
import '../app/version.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'chrome.dart';
import 'desktop.dart';
import 'glance.dart';
import 'leveldb.dart';
import 'notify.dart';
import 'settings.dart';
import 'widgets_window.dart';

/// Answers the shared screens' plugin calls on Windows, macOS and Linux.
class DesktopHost implements NativeHost {
  /// What the desktop can do, as SgBus.info's features. 'push': Service alerts can be turned on
  /// (they're checked here every minute, as the server checks for a phone: alerts_poll.dart).
  /// 'notify': notifications for the trip and the rest. 'releases': "New versions of the app"
  /// (updater.dart says so itself). 'glance': the tray countdown, and 'widgets': Bus timings
  /// widgets on the desktop, which a stop's buttons and right-click menu offer (adaptive.dart's
  /// DeskActions), only while [DeskWidgets.enabled]. Never a phone-only feature, such as
  /// Android's own updater.
  @override
  List<String> get features => const ['push', 'notify', 'releases', 'glance', if (DeskWidgets.enabled) 'widgets', 'desktop'];

  /// The full screen the departures board and the flag screen ask for, which remembers how the
  /// window was before they asked.
  final fullScreen = PageFullScreen(isOn: () => DeskChrome.fullScreen.value, turn: DeskChrome.setFullScreen);

  /// SgBus.info's other answers: the app's version, the computer's system, and 'desktop' for bug
  /// reports.
  @override
  Map<String, dynamic> get info => {
        'version': appVersion,
        'device': '${Platform.operatingSystem} ${Platform.operatingSystemVersion}'.trim(),
        'platform': 'desktop',
      };

  /// What every call the desktop doesn't answer throws, as an absent plugin would.
  static Never _no() => throw NativeError('Not on a computer', code: 'unavailable');

  /// What a call that isn't the right shape throws, saying [why], before it changes anything.
  static Never _invalid(String why) => throw NativeError(why, code: 'invalid');

  /// One plugin call from a shared screen, by "Plugin.method".
  @override
  Future<Map<String, dynamic>?> call(String plugin, String method, Map<String, dynamic>? o) async {
    final options = o ?? const {};
    switch ('$plugin.$method') {
      case 'SgBus.info':
        return {...info, 'features': features};
      case 'SgBus.openLink':
        await _openLink('${options['url'] ?? ''}');
        return {};
      case 'SgBus.share':
        return _share(options);
      case 'SgBus.notify':
        await DeskNotify.show(
          title: '${options['title'] ?? Desktop.name}',
          body: '${options['body'] ?? ''}',
          url: options['url'] is String ? options['url'] as String : null,
        );
        return {};
      case 'SgBus.background':
        Desktop.hide();
        return {};
      case 'SgBus.releases':
        // Missing means on, as the Electron app kept it.
        return {'on': DeskSettings.get<bool>('updateNotices') != false};
      case 'SgBus.setReleases':
        final on = options['on'] == true;
        DeskSettings.write({'updateNotices': on});
        return {'on': on};
      case 'SgBus.setFavourites':
        final stops = (options['stops'] as List?) ?? const [];
        Glance.setFavourites([for (final s in stops) if (s is Map) Map<String, Object?>.from(s)]);
        return {};
      case 'SgBus.setTrayStop':
        final stop = trayStopFrom(options) ?? _invalid('Not a bus stop');
        return {'stop': Glance.setStop(stop)};
      case 'SgBus.addWidget':
        final widget = widgetFrom(options) ?? _invalid('Not a bus stop');
        await DeskWidgets.add(code: widget.code, name: widget.name, buses: widget.buses);
        return {};
      case 'SgBus.setFullScreen':
        final on = options['on'];
        if (on is! bool) _invalid('Say on: true or false');
        fullScreen.ask(on);
        return {};
      case 'SgBus.openSettings':
      case 'SgBus.turnOnLocation':
        await _systemSettings('${options['what'] ?? 'location'}');
        // The system's page is open; whether it's on now isn't known until the screen asks again.
        return {'on': false};
      case 'SgBus.openApp':
        return _no();
      case 'PushNotifications.checkPermissions':
      case 'PushNotifications.requestPermissions':
        return {'receive': await DeskNotify.allowed(ask: method == 'requestPermissions') ? 'granted' : 'denied'};
      case 'Migrate.read':
        return {'items': _oldStorage()};
    }
    return _no();
  }

  /// A bus stop code: five digits.
  static final _stopCode = RegExp(r'^\d{5}$');

  /// A bus number, as Favourites and the widgets keep it: one to four digits and capital letters.
  static final _busNo = RegExp(r'^[0-9A-Z]{1,4}$');

  /// The most buses a widget is narrowed to, as widgets_window.dart keeps them.
  static const widgetBusMax = 20;

  /// SgBus.setTrayStop's options, checked, for Glance.setStop: {code, name, service}, with a
  /// five-digit code, a name that's text (or none), and one bus number (or none, for every bus at
  /// the stop). Null if any of it is the wrong shape, so a bad call never clears the countdown
  /// that's already in the tray.
  static Map<String, dynamic>? trayStopFrom(Map<String, dynamic> o) {
    final code = o['code'];
    final name = o['name'] ?? '';
    final service = o['service'] ?? '';
    if (code is! String || !_stopCode.hasMatch(code) || name is! String || service is! String) return null;
    final bus = service.trim().toUpperCase();
    if (bus.isNotEmpty && !_busNo.hasMatch(bus)) return null;
    return {'code': code, 'name': name, 'service': bus.isEmpty ? null : bus};
  }

  /// SgBus.addWidget's options, checked, for DeskWidgets.add: a five-digit code, a name that's
  /// text (or none), and a list of buses (or none, for every bus at the stop). Buses that aren't
  /// bus numbers are left out, each is kept once, and at most [widgetBusMax] of them. Null if the
  /// code, the name or the list is the wrong shape, so no widget opens on a stop that isn't one.
  static ({String code, String name, List<String> buses})? widgetFrom(Map<String, dynamic> o) {
    final code = o['code'];
    final name = o['name'] ?? '';
    final buses = o['buses'] ?? const [];
    if (code is! String || !_stopCode.hasMatch(code) || name is! String || buses is! List) return null;
    final kept = <String>[];
    for (final b in buses) {
      final no = b is String ? b.trim().toUpperCase() : '';
      if (_busNo.hasMatch(no) && !kept.contains(no)) kept.add(no);
      if (kept.length == widgetBusMax) break;
    }
    return (code: code, name: name, buses: kept);
  }

  /// A link from a shared screen (desktop-features-spec §11): the site's own pages open in the
  /// window; other web pages in the person's browser, and mailto: in their mail app. Anything
  /// else (a file, a script, a value starting with "-") is ignored, as the Electron app did, since
  /// some links come from the server (newsfeed notices, the releases page).
  Future<void> _openLink(String url) async {
    if (opensInApp(url)) {
      final fragment = Uri.parse(url).fragment;
      if (fragment.isNotEmpty) {
        Desktop.show('#$fragment');
      } else {
        Links.open(url);
        Desktop.show();
      }
    } else if (opensOutside(url)) {
      await Desktop.openExternal(url);
    }
  }

  /// Whether a link is one of the site's own pages the app shows itself: a # address, or a short
  /// link such as /go/k3v9q2x7ma.
  static bool opensInApp(String url) {
    final u = Uri.tryParse(url);
    if (u == null || !Desktop.isSite(url)) return false;
    return u.fragment.isNotEmpty || RegExp(r'^/(?:go|trip|eta|feat|egg)/[a-z0-9]{10}$').hasMatch(u.path);
  }

  /// Whether a link may go to the browser or mail app: http or https with a host, or mailto.
  static bool opensOutside(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    return ((u.scheme == 'http' || u.scheme == 'https') && u.host.isNotEmpty) || (u.scheme == 'mailto' && u.path.isNotEmpty);
  }

  /// Sharing on a computer: the link on the clipboard (as the site does without a share sheet),
  /// with "Link copied". When Telegram or WhatsApp was picked, it answers {sent: false}, as a
  /// phone without that app does, and the share card (features/share/share_card.dart) opens
  /// the app's own web share page through openLink instead.
  Future<Map<String, dynamic>> _share(Map<String, dynamic> o) async {
    final url = '${o['url'] ?? ''}';
    final text = '${o['text'] ?? ''}';
    final app = o['app'];
    if (app == 'telegram' || app == 'whatsapp') return {'sent': false};
    final all = [text, url].where((s) => s.isNotEmpty).join('\n');
    await Clipboard.setData(ClipboardData(text: all.isEmpty ? '${o['title'] ?? ''}' : all));
    DeskNotify.say(tr('share.linkCopied', 'Link copied'));
    return {'sent': true, 'copied': true};
  }

  /// The system's own settings page for [what] ('notifications', or location otherwise), where
  /// there is one: Windows' ms-settings pages, macOS's System Settings, GNOME's Settings.
  Future<void> _systemSettings(String what) async {
    if (Desktop.windows) {
      final page = switch (what) {
        'notifications' => 'ms-settings:notifications',
        _ => 'ms-settings:privacy-location',
      };
      await Desktop.openExternal(page);
    } else if (Desktop.mac) {
      final page = switch (what) {
        'notifications' => 'x-apple.systempreferences:com.apple.preference.notifications',
        _ => 'x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices',
      };
      await Desktop.openExternal(page);
    } else {
      try {
        await Process.start('gnome-control-center', [what == 'notifications' ? 'notifications' : 'privacy'], mode: ProcessStartMode.detached);
      } catch (_) {
        // Not GNOME: there's no one settings app to open.
      }
    }
  }

  /// Everything the Electron app (2.0.0 to 2.4.x) kept for the site, from Chromium's storage in
  /// the same settings folder, for data/migrate.dart to bring across once. Empty if there's none
  /// or it can't be read.
  static Map<String, String> _oldStorage() {
    final sep = Platform.pathSeparator;
    final dir = Directory('${DeskSettings.dir}${sep}Local Storage${sep}leveldb');
    try {
      return ChromiumLocalStorage.read(dir, Desktop.site);
    } catch (_) {
      return const {};
    }
  }
}

/// The full screen a page asks for as it opens and lets go of as it closes: the departures board
/// and the flag screen, through SgBus.setFullScreen (desktop-features-spec §5, Full screen).
/// It remembers whether the window was already full screen (F11, or the green button on a Mac)
/// before the first page asked, so closing the page puts the window back as it was, instead of
/// always leaving full screen.
class PageFullScreen {
  /// [isOn] says whether the window is full screen now; [turn] turns it on or off (DeskChrome's,
  /// in the app; a test's own in tests).
  PageFullScreen({required this.isOn, required this.turn});

  /// Whether the window is full screen now.
  final bool Function() isOn;

  /// Turns the window's full screen on or off.
  final void Function(bool on) turn;

  /// How many open pages have asked and not yet let go. It can be two for a moment: a new board
  /// opened in place of another starts before the old one has closed.
  int _asking = 0;

  /// Whether the window was full screen before the first page asked.
  bool _wasOn = false;

  /// A page asks for full screen ([on] true) as it opens, or lets go of it as it closes. The
  /// window leaves full screen only once every page has let go, and only if the pages put it
  /// there: if it was full screen before, it stays so.
  void ask(bool on) {
    if (on) {
      if (_asking == 0) _wasOn = isOn();
      _asking++;
      turn(true);
      return;
    }
    // Letting go without having asked (nothing open asked) changes nothing.
    if (_asking == 0) return;
    _asking--;
    if (_asking == 0 && !_wasOn) turn(false);
  }
}
