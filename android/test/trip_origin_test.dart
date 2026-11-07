// Back to Navigate, from a trip: the way or journey the trip was started from, not the list.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/data/journeys.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/planner/planner.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

const _mall = NavEnd('Bedok Mall', 1.324736, 103.929256);
const _raffles = NavEnd('One Raffles Place', 1.28435, 103.851073);
const _other = NavEnd('Somewhere else', 1.35, 103.85);

/// As a trip's kept: through JSON, as it comes back after the app's been closed.
Map _kept(Map<String, Object?> origin) => jsonDecode(jsonEncode(origin)) as Map;

Future<void> _pumpNav(WidgetTester t) async {
  await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const Scaffold(body: NavPage())));
  await settle(t);
}

/// Lets a plan under way finish, with the frames it asks for.
Future<void> _planned(WidgetTester t) async {
  for (var i = 0; i < 4; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
    await t.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  setUpAll(loadFonts);

  group('Bus and train', () {
    late NavState n;
    late Map<String, dynamic> picked;

    Future<void> ready(WidgetTester t, {NavEnd from = _mall, WhenPick? when}) async {
      await t.runAsync(() => stillData(state: const {'sgbus_tour': 'done', 'sgbus_tours': '["nav"]'}));
      n = NavState.I
        ..from = from
        ..to = _raffles
        ..via = null
        ..when = when;
      await t.runAsync(n.run);
      picked = n.options[1];
      await t.runAsync(() => n.open(picked));
    }

    testWidgets('after Navigate has moved on, it opens the way picked, not the list', (t) async {
      await ready(t);
      final origin = _kept(navOrigin(picked));
      // Navigate used for something else meanwhile.
      n.from = _other;
      await t.runAsync(n.run);
      expect(n.option, isNull);
      reopenNav(origin);
      expect(wayKey(n.option!), wayKey(picked), reason: 'open at once, before the plan comes in');
      await _pumpNav(t);
      expect(find.text('All ways'), findsOneWidget);
      await _planned(t);
      expect(n.from!.label, 'Bedok Mall');
      expect(wayKey(n.option!), wayKey(picked));
      expect(n.options, isNotEmpty, reason: 'All ways has the rest');
      await _pumpNav(t);
      expect(find.text('All ways'), findsOneWidget);
      expect(find.text('Start trip'), findsOneWidget);
    });

    testWidgets('a way gone from the next plan stays as you picked it', (t) async {
      await ready(t);
      final origin = _kept(navOrigin(picked));
      final real = Api.fake!;
      Api.fake = (path) async {
        final got = await real(path);
        if (!path.startsWith('nav')) return got;
        return {...(got as Map), 'options': [(got['options'] as List).first]};
      };
      n.from = _other;
      await t.runAsync(n.run);
      reopenNav(origin);
      await _planned(t);
      expect(n.options.any((o) => wayKey(o) == wayKey(picked)), isFalse, reason: 'this test is of a way gone');
      expect(n.option, isNotNull);
      expect(wayKey(n.option!), wayKey(picked));
    });

    testWidgets('if Navigate still has it open, it stays as it was left', (t) async {
      await ready(t);
      final origin = _kept(navOrigin(picked));
      var plans = 0;
      final real = Api.fake!;
      Api.fake = (path) {
        if (path.startsWith('nav')) plans++;
        return real(path);
      };
      reopenNav(origin);
      await _planned(t);
      expect(plans, 0, reason: 'not planned afresh');
      expect(identical(n.option, picked), isTrue);
    });

    testWidgets('Your location stays that, not an empty From', (t) async {
      await ready(t, from: NavEnd.parse('here')!);
      final origin = _kept(navOrigin(picked));
      n.from = _other;
      n.option = null;
      reopenNav(origin);
      expect(n.from!.here, isTrue);
      await _planned(t);
      expect(n.error, isNull);
      expect(wayKey(n.option!), wayKey(picked));
    });

    testWidgets('a time that has passed is left out, and one to come is kept', (t) async {
      await ready(t, when: const WhenPick('leave', '2026-10-30T08:35'));
      final origin = _kept(navOrigin(picked));
      reopenNav({...origin, 'way': 'gone', 'when': const WhenPick('leave', '2026-10-30T07:00').toJson()});
      expect(n.when, isNull);
      await _planned(t);
      reopenNav({...origin, 'way': 'gone'});
      expect(n.when?.at, '2026-10-30T08:35');
      await _planned(t);
    });

    testWidgets('a trip from before it kept its way opens on the list', (t) async {
      await ready(t);
      reopenNav(_kept({'kind': 'nav', 'from': _mall.toJson(), 'to': _raffles.toJson(), 'via': null}));
      await _planned(t);
      expect(n.option, isNull);
      expect(n.options, isNotEmpty);
    });
  });

  group('Bus only', () {
    testWidgets('it opens the journey picked, with its live timings', (t) async {
      await t.runAsync(() => stillData(state: const {'sgbus_tour': 'done', 'sgbus_tours': '["nav"]', 'sgbus_nav_mode': 'bus'}));
      final p = PlannerState.I
        ..start = '84009'
        ..end = '53009'
        ..when = null
        ..journey = null;
      await t.runAsync(p.search);
      final legs = p.journeys.first;
      p.journey = legs;
      final origin = _kept(plannerOrigin(legs));
      p.journey = null;
      p.start = '75009';
      reopenPlanner(origin);
      expect(p.start, '84009');
      expect(p.journey!.map((l) => l.toJson()), legs.map((l) => l.toJson()));
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const Scaffold(body: PlannerTab())));
      await settle(t);
      await _planned(t);
      await settle(t);
      expect(find.text('Back to route'), findsOneWidget);
      expect(find.text('Loading live timings…'), findsNothing, reason: 'its timings came, with nothing tapped');
      expect(find.text('Start trip'), findsOneWidget);
      expect(When.now, isNotNull);
    });

    testWidgets('a trip with no journey kept opens on the route', (t) async {
      await t.runAsync(() => stillData(state: const {'sgbus_tour': 'done', 'sgbus_tours': '["nav"]'}));
      reopenPlanner({'kind': 'route', 'start': '84009', 'end': '53009'});
      expect(PlannerState.I.journey, isNull);
      expect(Leg.fromJson(null), isNull);
      await _planned(t);
    });
  });
}
