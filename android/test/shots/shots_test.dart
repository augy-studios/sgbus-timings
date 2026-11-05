import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/alerts/alerts.dart';
import 'package:sgbus_timings/features/favs/favs_page.dart';
import 'package:sgbus_timings/features/weather/weather.dart';
import 'package:sgbus_timings/features/glance/glance_page.dart';
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
  });
}
