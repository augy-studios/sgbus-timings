// The app's pages, as the site's (js/main-screen.js): each a tab in the Edge Tray, in this order
// after the home (Settings' Custom home, sgbus_start). Glance, Service alerts and Your trips can
// be turned off in Settings (sgbus_glance_off, sgbus_pages_off), which takes their tabs away;
// a home that's off opens Bus timings instead.
import 'package:material_ui/material_ui.dart';

import '../api/net.dart';
import '../data/store.dart';
import '../i18n/i18n.dart';

/// One of the app's pages: its id (glance, timings, favs…), its icon in the Edge Tray and the
/// desktop's rail, and its name in the language on show.
class PageDef {
  const PageDef(this.id, this.icon, this.label);
  final String id;
  final IconData icon;
  final String Function() label;
}

/// The app's pages, which of them are on, and which is the home page. Everything is static.
class Pages {
  Pages._();

  /// Settings' Custom home: the id of the page the app opens on.
  static const homeKey = 'sgbus_start';

  /// The pages turned off in Settings, as ids with spaces between (Glance has its own key).
  static const offKey = 'sgbus_pages_off';

  /// Set when Glance is turned off in Settings.
  static const glanceOffKey = 'sgbus_glance_off';

  /// The pages Settings can turn off.
  static const canHide = ['glance', 'alerts', 'trips'];

  static final all = [
    PageDef('glance', Icons.visibility_outlined, () => tr('tour.page.glance', 'Glance')),
    PageDef('timings', Icons.schedule, () => tr('tray.timings', 'Bus timings')),
    PageDef('favs', Icons.star_outline, () => tr('favs.title', 'Favourites')),
    PageDef('nav', Icons.directions, () => tr('tray.navigate', 'Navigate')),
    PageDef('alerts', Icons.warning_amber_rounded, () => tr('tray.alerts', 'Service alerts')),
    PageDef('trips', Icons.history, () => tr('mainScreen.trips', 'Your trips')),
    PageDef('places', Icons.place_outlined, () => tr('tray.places', 'Places')),
  ];
  static final ids = all.map((p) => p.id).toList();

  /// Whether Glance is on (it is unless Settings turned it off).
  static bool glanceOn() => Store.I.get(glanceOffKey) == null;

  /// The pages turned off in Settings: Service alerts or Your trips from [offKey], and Glance if
  /// it's off.
  static Set<String> off() {
    final out = <String>{};
    for (final n in (Store.I.get(offKey) ?? '').split(' ')) {
      if (n != 'glance' && canHide.contains(n)) out.add(n);
    }
    if (!glanceOn()) out.add('glance');
    return out;
  }

  /// The pages that need the network, which go while offline (api/net.dart).
  static const needNet = ['glance', 'timings', 'alerts'];

  /// Whether a page has its tab: it's on in Settings and, while offline, doesn't need the network.
  static bool shows(String id) => !off().contains(id) && !(Net.off.value && needNet.contains(id));

  /// Turns a page on or off, as Settings does: Glance by its own key, the others in [offKey].
  static void setOn(String id, bool on) {
    if (id == 'glance') {
      Store.I.put(glanceOffKey, on ? null : '1');
      return;
    }
    final now = off()..remove('glance');
    if (on) {
      now.remove(id);
    } else {
      now.add(id);
    }
    Store.I.put(offKey, now.isEmpty ? null : now.join(' '));
  }

  /// The page the app opens on: Settings' Custom home (Glance if none is set), or Bus timings if
  /// that page isn't showing, or Favourites if Bus timings isn't either.
  static String home() {
    var v = Store.I.get(homeKey);
    if (!ids.contains(v)) v = 'glance';
    return shows(v!) ? v : shows('timings') ? 'timings' : 'favs';
  }

  /// In the tray's order: the home first, then the rest that are on.
  static List<PageDef> tabs() {
    final h = home();
    return [all.firstWhere((p) => p.id == h), ...all.where((p) => p.id != h && shows(p.id))];
  }
}
