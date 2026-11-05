// Every feature's way in: the Edge Tray's pages, and what each of the app's links and buttons
// opens (app/nav.dart's AppNav.open), so a link from anywhere lands the same way.
import 'package:flutter/material.dart';

import '../app/nav.dart';
import '../i18n/i18n.dart';
import '../widgets/common.dart';
import 'timings/bus_screen.dart';
import 'timings/stop_screen.dart';
import 'timings/timings_page.dart';

/// The Edge Tray's pages, by id (app/pages.dart).
Map<String, Widget Function()> pages() => {
      'glance': () => _Soon(tr('tour.page.glance', 'Glance')),
      'timings': () => const TimingsPage(),
      'favs': () => _Soon(tr('favs.title', 'Favourites')),
      'nav': () => _Soon(tr('tray.navigate', 'Navigate')),
      'alerts': () => _Soon(tr('tray.alerts', 'Service alerts')),
      'trips': () => _Soon(tr('mainScreen.trips', 'Your trips')),
      'places': () => _Soon(tr('tray.places', 'Places')),
    };

void registerFeatures() {
  AppNav.register('home', (_) => AppNav.showPage('glance'));
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
