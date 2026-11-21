// Live Updates (Android 16 and later): the trip's notification promoted to the top of the
// notifications, the lock screen and a chip in the status bar, with its bar of the trip
// (TripService.java, trip_progress.dart). Android leaves it off for most apps until it's turned on
// in the app's notification settings, so the first trip says so, once, with a button to the
// setting (TripPlugin's liveUpdates); Settings, Trips, has the same button for later.
import 'package:material_ui/material_ui.dart';

import '../../app/nav.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';

class LiveUpdates {
  LiveUpdates._();

  /// Set once the first trip has asked.
  static const askedKey = 'sgbus_live_updates_asked';

  /// Whether the trip's notification may be a Live Update: null where Android has none (before 16)
  /// or the app can't say.
  static Future<bool?> allowed() async {
    if (!Native.has('trip')) return null;
    try {
      final s = await Native.call('Trip', 'status');
      return s?['liveUpdates'] as bool?;
    } catch (_) {
      return null;
    }
  }

  /// The app's Live Updates setting.
  static Future<void> open() async {
    try {
      await Native.call('Trip', 'liveUpdates');
    } on NativeError catch (e) {
      AppNav.say(e.message);
    }
  }

  /// On a trip, the first time: if Live Updates is off, a window saying where to turn it on.
  static Future<void> askOnce() async {
    if (Store.I.has(askedKey) || await allowed() != false) return;
    final context = AppNav.context;
    if (context == null || !context.mounted) return;
    Store.I.put(askedKey, '1');
    final go = await showDialog<bool>(context: context, builder: (ctx) => const LiveUpdatesDialog());
    if (go == true) await open();
  }
}

class LiveUpdatesDialog extends StatelessWidget {
  const LiveUpdatesDialog({super.key});

  @override
  Widget build(BuildContext context) => AlertDialog(
        icon: const Icon(Icons.notifications_active_outlined),
        title: Text(tr('liveUpdates.title', 'Turn on Live Updates')),
        content: Text(tr('liveUpdates.text',
            'Your trip can stay at the top of your notifications and on the lock screen, with the stops left and a chip in the status bar. Android keeps this off until you turn it on: App info, then Notifications, then Live Updates.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(tr('liveUpdates.later', 'Not now'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(tr('liveUpdates.open', 'Open settings'))),
        ],
      );
}
