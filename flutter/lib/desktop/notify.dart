// The desktop's notifications (flutter_local_notifications): Service Alerts and the newsfeed
// (alerts_poll.dart), the trip's alerts and anything else the shared screens notify through the
// bridge (host.dart), new versions (updater.dart), screenshots (screenshot.dart), and "still
// running" the first time the window's closed. Clicking one brings the window forward on the page
// it names, or runs what it was given.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../app/nav.dart';
import '../i18n/i18n.dart';
import 'desktop.dart';

class DeskNotify {
  DeskNotify._();

  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;
  static int _id = 0;
  static final Map<String, void Function()> _actions = {};

  // The GUID Windows calls back on a click: this app's, fixed for good.
  static const _guid = '6b0f5a2e-3c5d-4f0a-9f0b-5c9e1f2a7d41';

  static Future<void> init() async {
    if (_ready) return;
    final sep = Platform.pathSeparator;
    final dir = File(Platform.resolvedExecutable).parent.path;
    final icon = '$dir${sep}data${sep}flutter_assets${sep}assets${sep}desktop${sep}icon.png';
    try {
      await _plugin.initialize(
        settings: InitializationSettings(
          windows: WindowsInitializationSettings(appName: Desktop.name, appUserModelId: Desktop.appId, guid: _guid, iconPath: File(icon).existsSync() ? icon : null),
          macOS: const DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
          linux: LinuxInitializationSettings(defaultActionName: tr('desktop.open', 'Open'), defaultIcon: File(icon).existsSync() ? FilePathLinuxIcon(icon) : null),
        ),
        onDidReceiveNotificationResponse: (r) => _clicked(r.payload),
      );
      _ready = true;
      final launch = await _plugin.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true) _clicked(launch!.notificationResponse?.payload);
    } catch (_) {
      // No notification service (a Linux desktop without one): the rest of the app carries on.
    }
    Desktop.stillRunning = () => show(
          title: tr('desktop.stillRunning', '{app} is still running', {'app': Desktop.name}),
          body: Desktop.mac
              ? tr('desktop.stillRunningMac', 'It keeps checking for Service Alerts from the menu bar. Quit it from the menu bar icon, or with ⌘Q.')
              : tr('desktop.stillRunningTray', 'It keeps checking for Service Alerts from the tray. Quit it from the tray icon.'),
        );
  }

  /// Whether notifications may show: always on Windows and Linux; macOS asks once.
  static Future<bool> allowed({bool ask = false}) async {
    if (!Desktop.mac) return true;
    final mac = _plugin.resolvePlatformSpecificImplementation<MacOSFlutterLocalNotificationsPlugin>();
    if (mac == null) return true;
    final now = await mac.checkPermissions();
    if (now?.isEnabled == true) return true;
    if (!ask) return false;
    return await mac.requestPermissions(alert: true, badge: true, sound: true) ?? false;
  }

  /// A notification. [url] is a #address on the site (or the site's link) to open on a click;
  /// [onClick] runs instead, if given.
  static Future<void> show({required String title, String body = '', String? url, void Function()? onClick}) async {
    if (!_ready) await init();
    if (!_ready) return;
    if (Desktop.mac && !await allowed(ask: true)) return;
    final id = ++_id;
    String? action;
    if (onClick != null) {
      action = 'a$id';
      _actions[action] = onClick;
    }
    final payload = jsonEncode({'url': ?url, 'action': ?action});
    try {
      await _plugin.show(
        id: id,
        title: title.length > 120 ? title.substring(0, 120) : title,
        body: body.length > 500 ? body.substring(0, 500) : body,
        payload: payload,
        notificationDetails: const NotificationDetails(
          windows: WindowsNotificationDetails(),
          macOS: DarwinNotificationDetails(),
          linux: LinuxNotificationDetails(),
        ),
      );
    } catch (_) {}
  }

  static void _clicked(String? payload) {
    Map<String, Object?> p = const {};
    try {
      p = Map<String, Object?>.from(jsonDecode(payload ?? '{}') as Map);
    } catch (_) {}
    final action = p['action'];
    if (action is String && _actions.containsKey(action)) {
      _actions.remove(action)!();
      return;
    }
    final url = p['url'];
    if (url is String && url.isNotEmpty) {
      final hash = url.contains('#') ? '#${url.split('#').last}' : null;
      Desktop.show(hash);
    } else {
      Desktop.show();
    }
  }

  /// A word in the window, for a moment.
  static void say(String text) => AppNav.say(text);
}
