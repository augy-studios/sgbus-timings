// Alarms & reminders on a Google Play build: the first time a reminder that needs exact alarms is
// turned on (Last bus, Time to leave, a routine), a window says where to allow them, as Live Updates
// does for a trip. Only while they're off, only once, and Open settings opens Android's page.
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/reminders/exact_alarms.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

final _calls = <String>[];

Future<void> _app(WidgetTester t, {required bool allowed}) async {
  Store.memory();
  _calls.clear();
  Native.fake(const ['lastbus', 'leavetime', 'routines'], (plugin, method, options) async {
    _calls.add('$plugin.$method');
    if (plugin == 'Reminders' && method == 'status') return {'exactAlarms': allowed};
    return <String, dynamic>{};
  });
  await t.pumpWidget(MaterialApp(navigatorKey: AppNav.navigatorKey, home: const Scaffold(body: SizedBox())));
}

// Asked, and the window drawn if it's coming: not waited for, as it waits for the window to close.
Future<void> _ask(WidgetTester t) async {
  ExactAlarms.askOnce().ignore();
  await t.pumpAndSettle();
}

void main() {
  tearDown(() => Native.fake(const [], null));

  testWidgets('off: the window, and Open settings opens Alarms & reminders', (t) async {
    await _app(t, allowed: false);
    await _ask(t);
    expect(find.text('Allow Alarms & reminders'), findsOneWidget);
    await t.tap(find.text('Open settings'));
    await t.pumpAndSettle();
    expect(find.text('Allow Alarms & reminders'), findsNothing);
    expect(_calls, contains('Reminders.openAlarms'));
  });

  testWidgets('asked once: not again the next time', (t) async {
    await _app(t, allowed: false);
    await _ask(t);
    await t.tap(find.text('Not now'));
    await t.pumpAndSettle();
    await _ask(t);
    expect(find.text('Allow Alarms & reminders'), findsNothing);
    expect(_calls, isNot(contains('Reminders.openAlarms')));
  });

  testWidgets('allowed already (GitHub\'s APK, or turned on): no window', (t) async {
    await _app(t, allowed: true);
    await _ask(t);
    expect(find.text('Allow Alarms & reminders'), findsNothing);
    expect(Store.I.has(ExactAlarms.askedKey), isFalse, reason: 'still asked if they go off later');
  });
}
