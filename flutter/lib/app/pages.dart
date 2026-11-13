// The app's pages, as the site's (js/main-screen.js): each a tab in the Edge Tray, in this order
// after the home (Settings' Custom home, sgbus_start). Glance, Service alerts and Your trips can
// be turned off in Settings (sgbus_glance_off, sgbus_pages_off), which takes their tabs away;
// a home that's off opens Bus timings instead.
import 'package:flutter/material.dart';

import '../api/net.dart';
import '../data/store.dart';
import '../i18n/i18n.dart';

class PageDef {
  const PageDef(this.id, this.icon, this.label);
  final String id;
  final IconData icon;
  final String Function() label;
}

class Pages {
  Pages._();
  static const homeKey = 'sgbus_start';
  static const offKey = 'sgbus_pages_off';
  static const glanceOffKey = 'sgbus_glance_off';
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

  static bool glanceOn() => Store.I.get(glanceOffKey) == null;

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

  static bool shows(String id) => !off().contains(id) && !(Net.off.value && needNet.contains(id));

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
