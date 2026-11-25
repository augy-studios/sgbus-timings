// Alarms & reminders (Android 12 and later): what lets Last bus, Time to leave and routines go off
// on time to the minute (LastBus.java, LeaveTime.java, Routines.java). The Google Play build has to
// ask for it (app/src/play/AndroidManifest.xml), and Android keeps it off until it's turned on in
// the app's settings, so the first time one of them is turned on, a window says so, once, with a
// button to the setting, as Live Updates does for a trip (trips/live_updates.dart). The reminders
// page keeps a note with the same button for later (_AlarmsNote). GitHub's APK has exact alarms
// from install, so it's never asked.
import 'package:material_ui/material_ui.dart';

import '../../app/nav.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import 'reminders.dart';

class ExactAlarms {
  ExactAlarms._();

  /// Set once the window has been shown.
  static const askedKey = 'sgbus_exact_alarms_asked';

  /// Android's Alarms & reminders for the app.
  static Future<void> open() async {
    try {
      await Native.call('Reminders', 'openAlarms');
    } on NativeError catch (e) {
      AppNav.say(e.message);
    }
  }

  /// A reminder that needs exact alarms was just turned on: if they're off, the window, the first
  /// time only.
  static Future<void> askOnce() async {
    if (Store.I.has(askedKey)) return;
    await Reminders.refresh();
    if (Reminders.status?['exactAlarms'] != false) return;
    final context = AppNav.context;
    if (context == null || !context.mounted) return;
    Store.I.put(askedKey, '1');
    final go = await showDialog<bool>(context: context, builder: (ctx) => const ExactAlarmsDialog());
    if (go == true) await open();
  }
}

class ExactAlarmsDialog extends StatelessWidget {
  const ExactAlarmsDialog({super.key});

  @override
  Widget build(BuildContext context) => AlertDialog(
        icon: const Icon(Icons.alarm_on_outlined),
        title: Text(tr('exactAlarms.title', 'Allow Alarms & reminders')),
        content: Text(tr('exactAlarms.text',
            'Last bus, Time to leave and routines come on time to the minute with Alarms & reminders allowed. Without it, Android can hold them back. Android keeps this off until you turn it on: Alarms & reminders, then Allow setting alarms and reminders.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(tr('liveUpdates.later', 'Not now'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(tr('liveUpdates.open', 'Open settings'))),
        ],
      );
}
