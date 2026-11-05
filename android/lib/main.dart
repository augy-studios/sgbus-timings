// SG Bus Timings for Android, 2.4.0: the app's own screens in Flutter, where 2.0.0 to 2.3.1 were
// the site in a WebView. The site's features, words, data and API are the same; the native parts
// (trips with the screen off, the widget, the card reader, reminders, Offline Sharing, Wear OS)
// are the Java plugins they always were (native/native_bridge.dart). README.md has the map.
import 'package:flutter/material.dart';

import 'app/app.dart';
import 'data/migrate.dart';
import 'data/network.dart';
import 'data/stations.dart';
import 'data/stops.dart';
import 'data/store.dart';
import 'features/registry.dart';
import 'i18n/i18n.dart';
import 'native/native_bridge.dart';
import 'theme/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await Store.open();
  await Native.start();
  // Everything the WebView app kept, the first time (data/migrate.dart).
  final migrated = await Migrate.run(store);
  await I18n.I.load();
  await AppLook.I.readPhone();
  BusNet.setOpenAccess(store.get('sgbus_restricted') == 'on');
  // The stop list and routes, shared by every screen, started now so they're usually in by the
  // time anything wants them.
  Stops.load().then((_) => BusNet.load()).catchError((_) {});
  Stations.load();
  registerFeatures();
  runApp(SgBusApp(pages: pages()));
  if (migrated > 0) {
    WidgetsBinding.instance.addPostFrameCallback((_) => startupNote(tr('migrate.done', 'Your favourites, places and settings are here from before.')));
  }
}
