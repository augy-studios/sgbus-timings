import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/alerts/alerts.dart';
import 'package:sgbus_timings/features/favs/favs_page.dart';
import 'package:sgbus_timings/features/weather/weather.dart';
import 'package:sgbus_timings/features/glance/glance_page.dart';
import 'package:sgbus_timings/features/map/live_map.dart';
import 'package:sgbus_timings/features/misc/misc.dart';
import 'package:sgbus_timings/data/doors.dart';
import 'dart:convert';
import 'dart:io';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/planner/planner.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/features/trips/trips_page.dart';
import 'package:sgbus_timings/app/shell.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/settings/settings_screen.dart';
import 'package:sgbus_timings/features/settings/theme_screen.dart';
import 'package:sgbus_timings/features/timings/bus_screen.dart';
import 'package:sgbus_timings/features/timings/stop_screen.dart';
import 'package:sgbus_timings/features/timings/timings_page.dart';

import 'harness.dart';

const _t = Timeout(Duration(minutes: 3));

/// Sam's phone, as the site's shots have it: a few saved stops and buses, Home and Work.
const sam = {
  'sgbus_name': 'Sam',
  'sgbus_favs_v2': '[{"code":"84009","name":"Bedok Int"},{"code":"84031","name":""},{"code":"03218","name":""}]',
  'sgbus_fav_buses': '["14","196"]',
  'sgbus_fav_stop_buses': '[{"code":"84031","service":"60"}]',
  'sgbus_home': '{"label":"Bedok Mall","lat":1.324736,"lng":103.929256}',
  'sgbus_work': '{"label":"One Raffles Place","lat":1.28435,"lng":103.851073}',
  'sgbus_fav_lists': '[{"id":"lwork","name":"Work","items":["stop:03218","bus:196"]}]',
};

void main() {
  setUpAll(loadFonts);

  testWidgets('stop', timeout: _t, (t) async {
    await t.runAsync(() => stillData(state: sam));
    await shot(t, 'stop', () => const StopScreen(code: '84009'));
    await shot(t, 'stop-usual', () => const StopScreen(code: '84009'), material: false);
    await shot(t, 'stop-dark', () => const StopScreen(code: '84009'), brightness: Brightness.dark);
  });

  testWidgets('pages', timeout: _t, (t) async {
    await t.runAsync(() => stillData(state: sam));
    GlancePage.weather = (_) => const WeatherButton();
    await shot(t, 'glance', () => onPage('glance', const GlancePage()));
    await shot(t, 'glance-usual', () => onPage('glance', const GlancePage()), material: false);
    await shot(t, 'timings', () => onPage('timings', const TimingsPage()));
    await shot(t, 'favs', () => onPage('favs', const FavsPage()));
    await shot(t, 'bus', () => const BusScreen(no: '14', fromStop: '84009'));
    await shot(t, 'alerts', () => onPage('alerts', const AlertsPage()));
    await shot(t, 'weather', () => const Scaffold(body: WeatherSheet()));
  });

  testWidgets('settings', timeout: _t, (t) async {
    await t.runAsync(() => stillData(state: {...sam, 'sgbus_colours_unlocked': '1', 'sgbus_eggs': '{"loop":1,"ktm":2}'}));
    await shot(t, 'theme', () => const ThemeScreen());
    await shot(t, 'theme-usual', () => const ThemeScreen(), material: false);
    await shot(t, 'theme-dark', () => const ThemeScreen(), brightness: Brightness.dark);
    await shot(t, 'settings', () => const SettingsScreen());
    await shot(t, 'settings-pages', () => const SettingsGroup(group: 'pages'));
    await shot(t, 'settings-you', () => const SettingsGroup(group: 'you'));
    await shot(t, 'settings-find', () => const SettingsScreen(), then: (t) async {
      await t.enterText(find.byType(TextField).first, 'alert');
      await settle(t);
    });
    await shot(t, 'bug', () => const BugReport());
    await shot(t, 'tray-wide', () => onPage('glance', const GlancePage()), size: const Size(900, 1200));
  });

  testWidgets('navigate', timeout: _t, (t) async {
    await t.runAsync(() => stillData(state: sam));
    final n = NavState.I;
    n.from = const NavEnd('Bedok Mall', 1.324736, 103.929256);
    n.to = const NavEnd('One Raffles Place', 1.28435, 103.851073);
    n.when = const WhenPick('leave', '2026-10-30T08:35');
    await t.runAsync(n.run);
    await shot(t, 'nav', () => onPage('nav', const NavPage()));
    await t.runAsync(() => n.open(n.options[1]));
    await shot(t, 'nav-way', () => onPage('nav', const NavPage()));
    NavPage.busOnly = () => const PlannerTab();
    Store.I.put('sgbus_nav_mode', 'bus');
    final p = PlannerState.I
      ..start = '84009'
      ..end = '53009';
    await t.runAsync(p.search);
    await shot(t, 'planner', () => onPage('nav', const NavPage()));
    Store.I.put('sgbus_nav_mode', null);
  });

  testWidgets('trip', timeout: _t, (t) async {
    await t.runAsync(() => stillData(state: sam));
    final n = NavState.I;
    n.from = const NavEnd('Bedok Mall', 1.324736, 103.929256);
    n.to = const NavEnd('One Raffles Place', 1.28435, 103.851073);
    n.when = null;
    await t.runAsync(n.run);
    final way = tripFromNav(n.options[1], n.from, n.to)!;
    await t.runAsync(() => Trip.I.start(title: way.title, legs: way.legs, from: n.from!.toJson(), to: n.to!.toJson()));
    // On bus 9 at Bedok Int, the walk there done.
    Trip.I.step(1);
    Trip.I.onFix(Fix(Trip.I.current!.points.first[0], Trip.I.current!.points.first[1], accuracy: 8));
    Shell.top
      ..clear()
      ..add(() => const TripBar());
    await shot(t, 'trip-bar', () => Scaffold(body: Column(children: [for (final b in Shell.top) b(), Expanded(child: onPage('glance', const GlancePage()))])));
    await shot(t, 'trip', () => const TripScreen());
    await t.runAsync(() => Trip.I.stop());
    await shot(t, 'trips', () => onPage('trips', const TripsPage()));
  });

  testWidgets('map', timeout: _t, (t) async {
    await t.runAsync(() async {
      await stillData(state: sam);
      await MrtDoors.load();
    });
    // Explorer round Bedok, the station's card open on its doors.
    await shot(t, 'explorer', () => const LiveMap(MapMode.explore), then: (t) async {
      for (var i = 0; i < 6; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await t.pump(const Duration(milliseconds: 100));
      }
      openMapCard(const MapPick.station('Bedok', ['EW5'], 1.323935, 103.929995));
    });
    await shot(t, 'explorer-stop', () => const LiveMap(MapMode.explore), then: (t) async {
      for (var i = 0; i < 6; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await t.pump(const Duration(milliseconds: 100));
      }
      openMapCard(const MapPick.stop('84031'));
    });
    // Walking to a stop, turn by turn.
    await shot(t, 'map-walk', () => const LiveMap(MapMode.walk, place: (lat: 1.32432719820227, lng: 103.93471220144858, label: 'Blk 27', code: '84049')),
        then: (t) async {
      for (var i = 0; i < 6; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await t.pump(const Duration(milliseconds: 100));
      }
      // The whole walk at once, as Overview shows it.
      await t.tap(find.byTooltip('Show the whole route'));
    });
    // The traffic on bus 14's way out of Bedok.
    final way = jsonDecode(File('test/fixtures/traffic-way.json').readAsStringSync()) as Map;
    await shot(
      t,
      'map-traffic',
      () => LiveMap(MapMode.traffic,
          trafficPts: [for (final p in way['points'] as List) [(p[0] as num).toDouble(), (p[1] as num).toDouble()]],
          trafficNames: [for (final n in way['names'] as List) '$n'],
          trafficTitle: 'Bus 14 to Clementi Int'),
      then: (t) async {
        for (var i = 0; i < 6; i++) {
          await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
          await t.pump(const Duration(milliseconds: 100));
        }
      },
    );
  });
}
