// The guide's Android section's screenshots beyond shots_test.dart's: the sheets and the screens
// that need the phone's own parts (NFC, the camera, reminders), with Native.fake standing in for
// them, so each shows what a phone with them shows.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/api/net.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/app/shell.dart';
import 'package:sgbus_timings/data/doors.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/alerts/alerts.dart';
import 'package:sgbus_timings/features/calendar/calendar.dart';
import 'package:sgbus_timings/features/card/card.dart';
import 'package:sgbus_timings/features/coins/coins.dart';
import 'package:sgbus_timings/features/favs/favs_page.dart';
import 'package:sgbus_timings/features/glance/glance_page.dart';
import 'package:sgbus_timings/features/map/live_map.dart';
import 'package:sgbus_timings/features/misc/magic_cup.dart';
import 'package:sgbus_timings/features/misc/misc.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/places/places_page.dart';
import 'package:sgbus_timings/features/planner/planner.dart';
import 'package:sgbus_timings/features/reminders/reminders.dart';
import 'package:sgbus_timings/features/settings/settings_screen.dart';
import 'package:sgbus_timings/features/share/offline_share.dart';
import 'package:sgbus_timings/features/share/share_card.dart';
import 'package:sgbus_timings/features/sync/sync.dart';
import 'package:sgbus_timings/features/team/team.dart';
import 'package:sgbus_timings/features/terminal/terminal.dart';
import 'package:sgbus_timings/features/timings/board_screen.dart';
import 'package:sgbus_timings/features/timings/flag_screen.dart';
import 'package:sgbus_timings/features/timings/make_it.dart';
import 'package:sgbus_timings/features/timings/stop_screen.dart';
import 'package:sgbus_timings/features/timings/timings_page.dart';
import 'package:sgbus_timings/features/tour/tour.dart';
import 'package:sgbus_timings/features/weather/weather.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

import 'harness.dart';

const _t = Timeout(Duration(minutes: 3));

const _sam = {
  'sgbus_name': 'Sam',
  'sgbus_favs_v2': '[{"code":"84009","name":"Bedok Int"},{"code":"84031","name":""},{"code":"03218","name":""}]',
  'sgbus_fav_buses': '["14","196"]',
  'sgbus_fav_stop_buses': '[{"code":"84031","service":"60"}]',
  'sgbus_home': '{"label":"Bedok Mall","lat":1.324736,"lng":103.929256}',
  'sgbus_work': '{"label":"One Raffles Place","lat":1.28435,"lng":103.851073}',
  'sgbus_places': '[{"id":"p1","name":"Gym","label":"Our Tampines Hub","lat":1.3532,"lng":103.9401}]',
  'sgbus_fav_lists': '[{"id":"lwork","name":"Work","items":["stop:03218","bus:196"]}]',
  'sgbus_makeit': 'on',
  'sgbus_nearstops': '["84009"]',
  'sgbus_lastbus': '[{"code":"84009","service":"14","name":"Bedok Int"},{"code":"75009","service":"10","name":"Tampines Int"}]',
  'sgbus_routines': '[{"id":"r1","code":"84009","name":"Bedok Int","buses":["14","60"],"time":"0745","days":[1,2,3,4,5]},{"id":"r2","code":"75009","name":"Tampines Int","buses":[],"time":"1830","days":[6,0]}]',
  // The tours seen, so none opens over a shot.
  'sgbus_tour': 'done',
  'sgbus_tours': '["timings","favs","nav","alerts","trips","places","terminal","explorer"]',
  'sgbus_first_run': 'done',
  'sgbus_recents': '[{"kind":"stop","label":"Bedok Int","sub":"84009","code":"84009","at":1793320000000},{"kind":"bus","label":"Bus 196","code":"196","at":1793310000000},{"kind":"stop","label":"Tampines Int","sub":"75009","code":"75009","at":1793100000000}]',
};

/// What a phone with everything has.
const _features = ['listen', 'scan', 'sticker', 'lastbus', 'routines', 'nearstops', 'leavetime', 'onabus', 'card', 'sharetap', 'sharenearby', 'checkupdate', 'flag', 'update', 'pip'];

final _soon = DateTime.parse('2026-10-30T08:30:00+08:00').millisecondsSinceEpoch;
final _card = <String, dynamic>{
  'balance': 2345,
  'can': '8009123412341234',
  'expiry': DateTime.parse('2029-06-30T00:00:00+08:00').millisecondsSinceEpoch,
  'autoload': 0,
  'autoloadOn': false,
  'history': [
    {'type': 'bus', 'what': '14', 'amount': -119, 'time': _soon - 3600000 * 26},
    {'type': 'train', 'what': '', 'amount': -146, 'time': _soon - 3600000 * 30},
    {'type': 'topup', 'what': '', 'amount': 2000, 'time': _soon - 3600000 * 50},
  ],
};

/// The phone's answers. The card's read waits until it's asked for (`_cardNow`).
var _cardNow = false;
Future<Map<String, dynamic>?> _answer(String plugin, String method, Map<String, dynamic>? options) async {
  switch ('$plugin.$method') {
    case 'SgBus.flag':
      return {'torch': true};
    case 'Card.status':
      return {'nfc': 'on'};
    case 'Card.read':
      if (_cardNow) return _card;
      return Completer<Map<String, dynamic>?>().future;
    case 'OfflineShare.status':
      return {'tap': true, 'nfc': 'on', 'nearby': true, 'allowed': true, 'sticker': true};
    case 'OfflineShare.writeTag':
    case 'OfflineShare.write':
      return Completer<Map<String, dynamic>?>().future;
    case 'Reminders.status':
      return {'notifications': true, 'leaveTime': true, 'onABus': false, 'nearStops': const ['84009'], 'background': true};
  }
  return null;
}

Future<void> _ready(WidgetTester t, [Map<String, String> extra = const {}]) async {
  await t.runAsync(() => stillData(state: {..._sam, ...extra}));
  await t.runAsync(MrtDoors.load);
  Native.fake(_features, _answer);
  addTearDown(() => Native.fake(const [], null));
  MakeIt.hook();
  Reminders.register();
  BugReportEntry.build = (context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.bug_report_outlined),
        title: const Text('Report a bug'),
        subtitle: const Text('Something not working? Tell Augy what happened, and it reaches him on Telegram.'),
      );
  GlancePage.weather = (_) => const WeatherButton();
  NavPage.busOnly = () => const PlannerTab();
  final fakeApi = Api.fake!;
  Api.fake = (path) => path.startsWith('share') ? Future.value({'id': 'a1b2', 'path': '/go/a1b2'}) : fakeApi(path);
}

/// A sheet over a page: [open] with the app's context, once the page is up.
Future<void> Function(WidgetTester) _sheet(void Function(BuildContext c) open) => (t) async {
      open(AppNav.context!);
      await settle(t);
    };

void main() {
  setUpAll(loadFonts);

  testWidgets('guide: first open', timeout: _t, (t) async {
    await _ready(t);
    await shot(t, 'first-run', () => onPage('glance', const GlancePage()), withNav: true, then: _sheet((c) => showDialog<String>(context: c, builder: (_) => firstRunPreview())));
    await shot(t, 'tour', () => onPage('glance', const GlancePage()), withNav: true, then: (t) async {
      Store.I.put('sgbus_tour', null);
      unawaited(Tours.start('glance'));
      await settle(t);
    });
    await shot(t, 'tray-open', () => onPage('glance', const GlancePage()));
    await shot(t, 'glance-pick', () => onPage('glance', const GlancePage()), withNav: true, then: (t) async {
      await t.tap(find.byType(ActionChip).first);
      await settle(t);
    });
    Net.off.value = true;
    await shot(t, 'offline-bar', () => Scaffold(body: Column(children: [const OfflineBar(), Expanded(child: onPage('favs', const FavsPage()))])));
    Net.off.value = false;
    Alerts.bar.value = 'Train disruption on the Circle Line, Bishan to Serangoon';
    await shot(t, 'disruption-bar', () => Scaffold(body: Column(children: [const DisruptionBar(), Expanded(child: onPage('glance', const GlancePage()))])));
    Alerts.bar.value = null;
    AppUpdate.latest.value = {'version': '9.9.9', 'tag': 'android-v9.9.9'};
    await shot(t, 'update-bar', () => Scaffold(body: Column(children: [const AppUpdateBar(), Expanded(child: onPage('glance', const GlancePage()))])));
    AppUpdate.latest.value = null;
  });

  testWidgets('guide: timings', timeout: _t, (t) async {
    await _ready(t);
    await shot(t, 'search', () => onPage('timings', const TimingsPage()), withNav: true, then: (t) async {
      await t.enterText(find.byType(TextField).first, 'orchard');
      await settle(t);
    });
    await shot(t, 'search-recents', () => onPage('timings', const TimingsPage()), withNav: true, then: (t) async {
      await t.tap(find.byType(TextField).first);
      await settle(t);
    });
    await shot(t, 'stop-tools', () => const StopScreen(code: '84031'));
    await shot(t, 'stop-narrowed', () => const StopScreen(code: '84009', service: '14'));
    await shot(t, 'stop-pick', () => const StopScreen(code: '84009'), then: (t) async {
      await t.tap(find.text('Pick a bus'));
      await settle(t);
    });
    await shot(t, 'flag', () => const FlagScreen(no: '14'));
    await shot(t, 'board', () => const BoardScreen(code: '84009'));
    await shot(t, 'favs-list', () => onPage('favs', const FavsPage()), then: (t) async {
      await t.tap(find.text('Work').first);
      await settle(t);
    });
    await shot(t, 'places', () => onPage('places', const PlacesPage()));
  });

  testWidgets('guide: navigate and map', timeout: _t, (t) async {
    await _ready(t);
    final n = NavState.I;
    n.from = const NavEnd('Bedok Mall', 1.324736, 103.929256);
    n.to = const NavEnd('One Raffles Place', 1.28435, 103.851073);
    n.when = null;
    await t.runAsync(n.run);
    await shot(t, 'nav-share', () => onPage('nav', const NavPage()), withNav: true, then: (t) async {
      await t.tap(find.byTooltip('Share'));
      await settle(t);
    });
    n.from = null;
    n.to = null;
    await shot(t, 'nav-empty', () => onPage('nav', const NavPage()));
    await shot(t, 'nav-end', () => onPage('nav', const NavPage()), withNav: true, then: (t) async {
      await t.tap(find.text('From').first);
      await settle(t);
    });
    await shot(t, 'map-layers', () => const LiveMap(MapMode.explore), withNav: true, then: (t) async {
      await t.tap(find.byTooltip('Layers'));
      await settle(t);
    });
    await shot(t, 'map-save', () => const LiveMap(MapMode.explore), withNav: true, then: (t) async {
      await t.tap(find.byTooltip('Save the map for offline'));
      await settle(t);
    });
  });

  testWidgets('guide: settings and reminders', timeout: _t, (t) async {
    await _ready(t);
    await shot(t, 'settings-trips', () => const SettingsGroup(group: 'trips'));
    await shot(t, 'settings-nav', () => const SettingsGroup(group: 'navigate'));
    await shot(t, 'settings-help', () => const SettingsGroup(group: 'help'));
    await shot(t, 'near-stops', () => const NearStopsScreen());
    await shot(t, 'routines', () => const RoutinesScreen());
    await shot(t, 'calendar', () => const CalendarSettings());
  });

  testWidgets('guide: phone extras', timeout: _t, (t) async {
    await _ready(t);
    _cardNow = false;
    await shot(t, 'card-wait', () => onPage('glance', const GlancePage()), withNav: true, then: _sheet((c) => CardSheet.open()));
    _cardNow = true;
    await shot(t, 'card', () => onPage('glance', const GlancePage()), withNav: true, then: _sheet((c) => CardSheet.open()));
    await shot(t, 'share-card', () => onPage('places', const PlacesPage()), withNav: true,
        then: _sheet((c) => ShareCard.place(c, label: 'One Raffles Place', lat: 1.28435, lng: 103.851073)));
    await shot(t, 'offline-share', () => onPage('places', const PlacesPage()), withNav: true, then: (t) async {
      unawaited(OfflineShare.open('send', url: 'https://sgbus.uwuapps.org/go/a1b2', title: 'One Raffles Place'));
      await settle(t);
      Native.fakeEvent('OfflineShare', 'found', {'id': 'p1', 'name': 'Alex'});
      await settle(t);
    });
    await shot(t, 'offline-receive', () => onPage('places', const PlacesPage()), withNav: true, then: _sheet((c) => OfflineShare.open('receive')));
    await shot(t, 'sticker', () => onPage('places', const PlacesPage()), withNav: true,
        then: _sheet((c) => OfflineShare.open('sticker', url: 'https://sgbus.uwuapps.org/#stop/84009', title: 'Bedok Int')));
  });

  testWidgets('guide: more', timeout: _t, (t) async {
    await _ready(t, {'sgbus_coins': '{"balance":250,"log":[],"spins":0}'});
    await shot(t, 'coins', () => const CoinsScreen());
    // GTA VI's colours, not set in time: the wheel's to give.
    When.now = () => DateTime.utc(2026, 11, 25, 16);
    await shot(t, 'coins-gta6', () => const CoinsScreen());
    When.now = () => stillAt;
    final ms = stillAt.millisecondsSinceEpoch;
    const hour = 3600000;
    Store.I.putJson('sgbus_coins', {
      'balance': 250,
      'spins': 2,
      'log': [
        {'at': ms - hour, 'n': 50, 'why': 'wheel'},
        {'at': ms - hour - 5000, 'n': -100, 'why': 'spin'},
        {'at': ms - 3 * hour, 'n': 28, 'why': 'trip', 'trip': 't2', 'name': 'To One Raffles Place', 'parts': {'finish': 5, 'km': 9, 'changes': 3, 'busOps': 4, 'trainOps': 4, 'lines': 3}},
        {'at': ms - 26 * hour, 'n': 0, 'why': 'egg', 'egg': 'ktm'},
        {'at': ms - 26 * hour - 5000, 'n': -100, 'why': 'spin'},
        {'at': ms - 27 * hour, 'n': 100, 'why': 'feat', 'feat': 'ktm'},
        {'at': ms - 50 * hour, 'n': 22, 'why': 'trip', 'trip': 't1', 'name': 'To Bedok Mall', 'parts': {'finish': 5, 'km': 11, 'busOps': 4, 'lines': 2}},
        {'at': ms - 200 * hour, 'n': 250, 'why': 'past', 'trips': 13},
      ],
    });
    await shot(t, 'coins-history', () => const CoinsHistory());
    await t.runAsync(() => MagicCup.warm());
    await shot(t, 'magic-cup', () => const Scaffold(body: Center(child: MagicCupView(value: 0.31, name: 'Bahasa Melayu'))), brightness: Brightness.dark);
    await shot(t, 'achievements', () => const AchievementsScreen());
    await shot(t, 'team', () => const TeamScreen());
    await shot(t, 'sync', () => const SyncScreen());
    await shot(t, 'terminal', () => const TerminalScreen(), then: (t) async {
      await t.enterText(find.byType(TextField).first, '84009');
      await t.testTextInput.receiveAction(TextInputAction.done);
      await settle(t);
    });
    When.now = () => stillAt;
  });
}
