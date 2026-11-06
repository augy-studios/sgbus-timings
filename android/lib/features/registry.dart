// Every feature's way in: the Edge Tray's pages, and what each of the app's links and buttons
// opens (app/nav.dart's AppNav.open), so a link from anywhere lands the same way.
import 'package:flutter/material.dart';

import '../app/nav.dart';
import '../app/shell.dart';
import 'alerts/alerts.dart';
import '../i18n/i18n.dart';
import 'favs/favs_page.dart';
import 'glance/glance_page.dart';
import 'calendar/calendar.dart';
import 'coins/coins.dart';
import 'team/team.dart';
import 'reminders/reminders.dart';
import 'share/offline_share.dart';
import 'card/card.dart';
import 'share/shared.dart';
import 'misc/misc.dart';
import 'sync/sync.dart';
import 'terminal/terminal.dart';
import 'tour/tour.dart';
import '../widgets/common.dart';
import 'map/live_map.dart';
import 'nav/doors.dart';
import 'nav/nav_page.dart';
import 'places/places_page.dart';
import 'planner/planner.dart';
import 'trips/trip.dart';
import 'trips/trip_watch.dart';
import 'trips/trips_page.dart';
import '../data/stops.dart';
import 'settings/settings_screen.dart';
import 'settings/theme_screen.dart';
import 'timings/board_screen.dart';
import 'timings/campus_ui.dart';
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
      'favs': () => const TourTarget(id: 'favs.list', child: FavsPage()),
      'nav': () => const NavPage(),
      'alerts': () => const AlertsPage(),
      'trips': () => const TourTarget(id: 'trips.list', child: TripsPage()),
      'places': () => const TourTarget(id: 'places.list', child: PlacesPage()),
    };

void registerFeatures() {
  LiveMap.register();
  AppNav.register('calendarSettings', (_) => CalendarSettings.open());
  hookDoors();
  registerCoins();
  TeamRun.register();
  Reminders.register();
  registerOfflineShare();
  registerCard();
  registerShared();
  registerMisc();
  SyncScreen.register();
  TerminalScreen.register();
  registerCampus();
  AppNav.register('tours', (_) => AppNav.push(Builder(builder: (c) => SgScaffold(
        title: tr('settings.show_me_around', 'Show me around'),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: tourButtons(c)),
      )), name: 'tours'));
  WidgetsBinding.instance.addPostFrameCallback((_) => Tours.begin());
  NavPage.busOnly = () => const PlannerTab();
  AppNav.register('planner', (a) => openPlanner(start: a['start'] as String?, end: a['end'] as String?, when: a['when'] as dynamic));
  Shell.top
    ..clear()
    ..add(() => const DisruptionBar())
    ..add(() => const TripBar());
  Trip.I.resume();
  TripWatch.I.start();
  AppNav.register('startTrip', (a) {
    final n = NavState.I;
    final t = tripFromNav(a['option'] as Map<String, dynamic>, n.from, n.to);
    if (t != null) Trip.I.start(title: t.title, legs: t.legs, from: n.from?.here == false ? n.from!.toJson() : null, to: n.to?.here == false ? n.to!.toJson() : null, via: n.via?.toJson());
  });
  AppNav.register('startTripLegs', (a) {
    final end = a['end'] as String;
    Trip.I.start(title: tr('trip.to', 'To {to}', {'to': Stops.nameOf(end)}), legs: tripFromLegs((a['legs'] as List).cast()));
  });
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
  AppNav.register('nav', (_) => AppNav.showPage('nav'));
  AppNav.register('navHash', (a) => openNav(
        from: NavEnd.parse(a['from'] as String?),
        to: NavEnd.parse(a['to'] as String?),
        via: NavEnd.parse(a['via'] as String?),
        when: a['when'] as dynamic,
      ));
  AppNav.register('navAt', (a) => openNav(
        from: a['from'] == 'here' ? NavEnd.parse('here') : NavEnd.from(a['from']),
        to: a['to'] == 'here' ? NavEnd.parse('here') : NavEnd.from(a['to']),
      ));
  AppNav.register('navSaved', (a) {
    final n = a['nav'] as Map;
    openNav(from: NavEnd.from(n['from']), to: NavEnd.from(n['to']), via: NavEnd.from(n['via']));
  });
  AppNav.register('stop', (a) => StopScreen.open(a['code'] as String, service: a['service'] as String?));
  AppNav.register('bus', (a) => BusScreen.open(a['no'] as String, fromStop: a['fromStop'] as String?, onward: a['onward'] == true, dir: a['dir'] as int?));
}

/// A note shown once the first screen is up.
void startupNote(String text) => AppNav.say(text);
