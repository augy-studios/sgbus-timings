// The desktop's answers to the bridge's calls (native/native_bridge.dart; flutter-desktop-app-spec
// §3), the ones a phone's Java plugins give: so the shared screens open links, share, notify, keep
// "New versions of the app", bring the old app's data across and the rest, with no desktop
// branches of their own. Anything not here is a phone's alone (NFC, the camera, the Get Off Alert
// with the screen off, widgets on a home screen...): it fails as 'unavailable', and the screen's
// plain path runs, as it does on the website.
import 'dart:io';

import 'package:flutter/services.dart';

import '../app/links.dart';
import '../app/version.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'desktop.dart';
import 'glance.dart';
import 'leveldb.dart';
import 'notify.dart';
import 'settings.dart';

/// Answers the shared screens' plugin calls on Windows, macOS and Linux.
class DesktopHost implements NativeHost {
  /// What the desktop can do, as SgBus.info's features. 'push': Service alerts can be turned on
  /// (they're checked here every minute, as the server checks for a phone: alerts_poll.dart).
  /// 'notify': notifications for the trip and the rest. 'releases': "New versions of the app"
  /// (updater.dart says so itself). Never a phone-only feature, such as Android's own updater.
  @override
  List<String> get features => const ['push', 'notify', 'releases', 'desktop'];

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
