// The magic cup: under a second, the language changing partway through, and never in the way of it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/misc/magic_cup.dart';
import 'package:sgbus_timings/theme/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(Store.memory);
  // Before any test's fake clock, which a picture's decoding would wait on for ever.
  setUpAll(MagicCup.warm);

  Future<void> app(WidgetTester t, {bool still = false}) async {
    await t.pumpWidget(MaterialApp(
      navigatorKey: AppNav.navigatorKey,
      theme: AppLook.I.theme(Brightness.dark),
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(disableAnimations: still), child: child!),
      home: const Scaffold(body: Text('the app')),
    ));
    await t.pump();
  }

  test('all of it within a second', () {
    expect(MagicCup.ms, lessThanOrEqualTo(1000));
    expect(MagicCup.changeAt, inExclusiveRange(0.1, 0.85), reason: 'while the cup’s in full view');
  });

  testWidgets('the language changes partway, once, and the cup goes', (t) async {
    await app(t);
    var changes = 0;
    var finished = false;
    MagicCup.run(name: 'தமிழ்', change: () async => changes++).then((_) => finished = true);
    await t.pump();
    expect(find.text('தமிழ்'), findsOneWidget);
    await t.pump(const Duration(milliseconds: 300));
    expect(changes, 0, reason: 'not yet');
    await t.pump(const Duration(milliseconds: 200));
    expect(changes, 1, reason: 'by now');
    expect(finished, isFalse);
    await t.pump(const Duration(milliseconds: 420));
    await t.pump();
    expect(changes, 1);
    expect(finished, isTrue);
    expect(find.text('தமிழ்'), findsNothing);
    expect(find.text('the app'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('a language that can’t be had: the cup still goes', (t) async {
    await app(t);
    var finished = false;
    MagicCup.run(change: () async => throw StateError('no words')).then((_) => finished = true);
    await t.pump();
    await t.pump(const Duration(milliseconds: 950));
    await t.pump();
    expect(finished, isTrue);
    expect(find.byType(MagicCupView), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('with animations off, the language just changes', (t) async {
    await app(t, still: true);
    var changes = 0;
    await MagicCup.run(name: 'Bahasa Melayu', change: () async => changes++);
    expect(changes, 1);
    await t.pump();
    expect(find.text('Bahasa Melayu'), findsNothing);
  });

  testWidgets('draws at every point of its spin, with its picture or without', (t) async {
    MagicCup.debugNoPicture();
    await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const Scaffold(body: Center(child: MagicCupView(value: 0)))));
    for (final v in [0.0, 0.13, 0.25, 0.5, 0.77, 1.0]) {
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: Scaffold(body: Center(child: MagicCupView(value: v, name: 'English')))));
      expect(t.takeException(), isNull);
    }
    await t.runAsync(() => MagicCup.warm());
    for (final v in [0.0, 0.37, 1.0]) {
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.dark), home: Scaffold(body: Center(child: MagicCupView(value: v)))));
      expect(t.takeException(), isNull);
    }
  });
}
