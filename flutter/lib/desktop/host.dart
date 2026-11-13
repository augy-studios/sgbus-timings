// The desktop's answers to the bridge's calls (native/native_bridge.dart), the ones a phone's
// Java plugins give: so the shared screens open links, share, notify, keep "New versions of the
// app", bring the old app's data across and the rest, with no desktop branches of their own.
// Anything not here is a phone's alone (NFC, the camera, the Get Off Alert with the screen off,
// widgets on a home screen...): it fails as 'unavailable', and the screen's plain path runs, as
// it does on the website.
import 'dart:io';

import 'package:flutter/services.dart';

import '../app/version.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'desktop.dart';
import 'glance.dart';
import 'leveldb.dart';
import 'notify.dart';
import 'settings.dart';

class DesktopHost implements NativeHost {
  // 'push': Service alerts can be turned on (they're checked here every minute, as the server
  // checks for a phone: alerts_poll.dart). 'notify': notifications for the trip and the rest.
  // 'releases': "New versions of the app" (updater.dart says so itself).
  @override
  List<String> get features => const ['push', 'notify', 'releases', 'desktop'];

  @override
  Map<String, dynamic> get info => {
        'version': appVersion,
        'device': '${Platform.operatingSystem} ${Platform.operatingSystemVersion}'.trim(),
        'platform': 'desktop',
      };

  static Never _no() => throw NativeError('Not on a computer', code: 'unavailable');

  @override
  Future<Map<String, dynamic>?> call(String plugin, String method, Map<String, dynamic>? o) async {
    final options = o ?? const {};
    switch ('$plugin.$method') {
      case 'SgBus.info':
        return {...info, 'features': features};
      case 'SgBus.openLink':
        final url = '${options['url'] ?? ''}';
        if (Desktop.isSite(url) && Uri.parse(url).fragment.isNotEmpty) {
          Desktop.show('#${Uri.parse(url).fragment}');
        } else if (url.isNotEmpty) {
          await Desktop.openExternal(url);
        }
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

  // Sharing on a computer: the link on the clipboard (as the site does without a share sheet),
  // and Telegram's or WhatsApp's own web share page when one of those was picked.
  Future<Map<String, dynamic>> _share(Map<String, dynamic> o) async {
    final url = '${o['url'] ?? ''}';
    final text = '${o['text'] ?? ''}';
    final app = o['app'];
    if (app == 'telegram' || app == 'whatsapp') return {'sent': false};
    final all = [text, url].where((s) => s.isNotEmpty).join('\n');
    await Clipboard.setData(ClipboardData(text: all.isEmpty ? '${o['title'] ?? ''}' : all));
    DeskNotify.say(tr('desktop.linkCopied', 'Link copied'));
    return {'sent': true, 'copied': true};
  }

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
      } catch (_) {}
    }
  }

  /// Everything the Electron app (2.0.0 to 2.4.x) kept for the site, from Chromium's storage in
  /// the same settings folder, for data/migrate.dart to bring across once.
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
