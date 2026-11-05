// Every feature's way in: the Edge Tray's pages, and what each of the app's links and buttons
// opens (app/nav.dart's AppNav.open), so a link from anywhere lands the same way.
import 'package:flutter/material.dart';

import '../app/nav.dart';
import '../app/shell.dart';
import 'alerts/alerts.dart';
import '../i18n/i18n.dart';
import '../widgets/common.dart';
import 'favs/favs_page.dart';
import 'glance/glance_page.dart';
import 'places/places_page.dart';
import 'settings/settings_screen.dart';
import 'settings/theme_screen.dart';
import 'timings/board_screen.dart';
import 'timings/bus_screen.dart';
import 'timings/flag_screen.dart';
import 'timings/make_it.dart';
import 'weather/weather.dart';
import 'timings/stop_screen.dart';
import 'timings/timings_page.dart';

/// The Edge Tray's pages, by id (app/pages.dart).
Map<String, Widget Function()> pages() => {
      'glance': () => const GlancePage(),
      'timings': () => const TimingsPage(),
      'favs': () => const FavsPage(),
      'nav': () => _Soon(tr('tray.navigate', 'Navigate')),
      'alerts': () => const AlertsPage(),
      'trips': () => _Soon(tr('mainScreen.trips', 'Your trips')),
      'places': () => const PlacesPage(),
    };

void registerFeatures() {
  Shell.top = () => const DisruptionBar();
  Alerts.listen();
  Alerts.startBar();
  hookAlertsIntoStops();
  Alerts.resync();
  AppNav.register('alerts', (_) => AppNav.showPage('alerts'));
  GlancePage.weather = (_) => const WeatherButton();
  AppNav.register('home', (_) => AppNav.showPage('glance'));
  AppNav.register('settings', (a) => SettingsScreen.open(a['group'] as String?));
  AppNav.register('theme', (_) => ThemeScreen.open());
  MakeIt.hook();
  AppNav.register('board', (a) => BoardScreen.open(a['code'] as String));
  AppNav.register('flag', (a) => FlagScreen.open(a['no'] as String));
  AppNav.register('stop', (a) => StopScreen.open(a['code'] as String, service: a['service'] as String?));
  AppNav.register('bus', (a) => BusScreen.open(a['no'] as String, fromStop: a['fromStop'] as String?, onward: a['onward'] == true, dir: a['dir'] as int?));
}

/// A note shown once the first screen is up.
void startupNote(String text) => AppNav.say(text);

class _Soon extends StatelessWidget {
  const _Soon(this.title);
  final String title;
  @override
  Widget build(BuildContext context) => SafeArea(child: EmptyNote(title));
}
