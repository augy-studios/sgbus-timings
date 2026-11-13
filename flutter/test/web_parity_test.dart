// What the website has that the app came to have too: Citymapper, Bus only's link, your ends going
// with you between Navigate's tabs, a trip's place by its name, and setting Home from Navigate.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/links.dart';
import 'package:sgbus_timings/data/places.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/planner/planner.dart';
import 'package:sgbus_timings/features/registry.dart';
import 'package:sgbus_timings/features/timings/stop_screen.dart';
import 'package:sgbus_timings/features/tour/tour.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

void main() {
  setUpAll(loadFonts);

  group('links', () {
    test('Citymapper, as the site sends you', () {
      expect(Links.citymapper(1.3, 103.8, 'Bedok Int'), 'https://citymapper.com/directions?endcoord=1.3%2C103.8&endname=Bedok%20Int');
      expect(Links.citymapper(1.3, 103.8, 'A', road: 'Bedok Nth Dr'), contains('&endaddress=Bedok%20Nth%20Dr'));
      expect(Links.citymapper(1.3, 103.8, 'A', from: (lat: 1.2, lng: 103.7)), contains('&startcoord=1.2%2C103.7'));
    });

    test("Bus only's link opens what's set", () {
      expect(Links.route(null, null, null), 'https://sgbus.uwuapps.org/#route');
      expect(Links.route('84009', '53009', null), 'https://sgbus.uwuapps.org/#route/84009/53009');
      expect(Links.route('84009', null, const WhenPick('leave', '2026-10-30T08:35')), 'https://sgbus.uwuapps.org/#route/84009/-/leave/2026-10-30T08:35');
    });
  });

  group("Navigate's tabs", () {
    testWidgets('places become the stops at them, and the time comes too', (t) async {
      await t.runAsync(() => stillData());
      final n = NavState.I
        ..from = const NavEnd('Bedok Mall', 1.324736, 103.929256)
        ..to = const NavEnd('Nowhere near a stop', 1.20, 103.60)
        ..when = const WhenPick('leave', '2026-10-30T08:35');
      final p = PlannerState.I
        ..start = null
        ..end = '53009'
        ..when = null;
      expect(stopNearPlace(n.from), isNotNull);
      expect(stopNearPlace(n.to), isNull);
      switchNavMode('bus');
      expect(p.start, stopNearPlace(n.from));
      expect(p.end, '53009', reason: "an end that can't come leaves what the tab had");
      expect(p.when?.at, '2026-10-30T08:35');
      // The search's frame, so it's not left waiting.
      for (var i = 0; i < 3; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
        await t.pump(const Duration(milliseconds: 50));
      }
    });

    testWidgets('and back: stops become places, by name', (t) async {
      await t.runAsync(() => stillData());
      final p = PlannerState.I
        ..start = '84009'
        ..end = '53009'
        ..when = null;
      final n = NavState.I
        ..from = null
        ..to = null
        ..when = null;
      switchNavMode('all');
      expect(n.from?.label, 'Bedok Int');
      expect(n.to?.label, 'Bishan Int');
      expect(p.start, '84009');
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    });

    test('Your location has no stop to become', () {
      expect(stopNearPlace(const NavEnd('Your location', 0, 0, here: true)), isNull);
    });
  });

  group('places', () {
    test("a place's name by where it is", () {
      Store.memory({'sgbus_home': '{"label":"Bedok Mall","lat":1.324736,"lng":103.929256}'});
      expect(Places.nameNear({'lat': 1.3248, 'lng': 103.9293}), 'Home');
      expect(Places.nameNear({'lat': 1.40, 'lng': 103.80}), isNull);
      expect(Places.nameNear(null), isNull);
    });

    test('Home and Work always, unset when they are', () {
      Store.memory();
      expect(Places.all(), isEmpty);
      final all = Places.all(unset: true);
      expect(all.map((p) => p.key), ['home', 'work']);
      expect(all.every((p) => p.unset), isTrue);
    });
  });

  testWidgets('the first open’s choice has the website’s names', (t) async {
    await t.runAsync(() => stillData());
    t.view.physicalSize = const Size(412, 892) * 3;
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: Scaffold(body: firstRunPreview())));
    await t.pump();
    for (final name in ['Simple (Lite)', 'Normal', 'Advanced Super App']) {
      expect(find.text(name), findsOneWidget, reason: name);
    }
    for (final old in ['Minimal', 'Standard', 'Full']) {
      expect(find.text(old), findsNothing, reason: old);
    }
  });

  testWidgets('a stop: Directions opens into the live map and Citymapper, and the bar has its note', (t) async {
    await t.runAsync(() => stillData());
    t.view.physicalSize = const Size(412, 892) * 3;
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    AppLook.I.materialYou = true;
    await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const StopScreen(code: '84009')));
    await settle(t);
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await settle(t);
    expect(find.text('Citymapper'), findsNothing);
    await t.tap(find.text('Directions'));
    await t.pump();
    expect(find.text('Citymapper'), findsOneWidget);
    expect(find.text('Live map'), findsOneWidget);
    expect(find.text('Directions'), findsNothing);
    expect(find.text('*buses might not arrive in exact order'), findsOneWidget);
    expect(find.text('INCOMING BUSES'), findsOneWidget);
  });
}
