// A shuttle bus service that ends (shuttles.json's `ends`, help desk #22: IKEA's, last day
// Thursday 31 December 2026): until then a way or a trip that rides it says so at its top; from
// 1 January it's never ridden, it's listed as Discontinued in place of its times with no live
// lookups, and Explorer has it in Discontinued shuttles, off until it's turned on. Every moment is
// Singapore's, whatever the computer's time zone.
import 'dart:convert';
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/data/campus.dart';
import 'package:sgbus_timings/data/nav_core.dart';
import 'package:sgbus_timings/data/nav_offline.dart';
import 'package:sgbus_timings/data/stations.dart';
import 'package:sgbus_timings/data/stops.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/map/live_map.dart';
import 'package:sgbus_timings/features/nav/nav_page.dart';
import 'package:sgbus_timings/features/terminal/core.dart';
import 'package:sgbus_timings/features/timings/campus_ui.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/i18n/i18n.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

Object? _gz(String name) => jsonDecode(utf8.decode(gzip.decode(File('test/fixtures/$name.json.gz').readAsBytesSync())));
Object? _site(String name) => jsonDecode(File('../main-site/data/$name.json').readAsStringSync());
Map _files() => {for (final f in ['nus', 'ntu', 'config', 'shuttles']) f: _site('campus/$f')};

/// A moment by Singapore's clock, "2026-12-31T18:00".
int _sg(String at) => DateTime.parse('$at:00+08:00').millisecondsSinceEpoch;
void _clock(String at) => When.now = () => DateTime.fromMillisecondsSinceEpoch(_sg(at), isUtc: true);

// The last evening it runs, and the first morning after.
const _lastEvening = '2026-12-31T18:00';
const _firstMorning = '2027-01-01T10:00';
const _ends = "IKEA's shuttle bus service ends on 31 Dec 2026.";
const _notice = '$_ends Buses 296, 460 and 68 from Tampines Interchange stop near IKEA.';
// Campus.ending's answer as words, as a record's list is only equal to itself.
String _said(List<ShuttleEnding> got) => [for (final e in got) '${e.name} ${e.ends} ${e.instead?.buses.join(',')} ${e.instead?.from}'].join('; ');
const _ikeaEnding = 'IKEA 2026-12-31 296,460,68 Tampines Interchange';

const _tampinesB = {'kind': 'stop', 'code': 'ikea-tampines-mrt', 'name': 'Tampines Stn Exit B', 'lat': 1.353289, 'lng': 103.945161};
const _ikea = {'kind': 'stop', 'code': 'ikea-tampines', 'name': 'IKEA Tampines', 'lat': 1.374015, 'lng': 103.932576};

/// A way from Tampines MRT to IKEA on its shuttle, as /api/nav gives it.
Map<String, dynamic> _ikeaWay({bool ends = true, bool instead = true}) => {
      'minutes': 24,
      'mix': 'B',
      'routes': ['IKEA T'],
      'legs': [
        {'mode': 'walk', 'metres': 120, 'minutes': 2, 'to': _tampinesB},
        {
          'mode': 'bus',
          'route': 'IKEA T',
          'towards': 'Tampines Stn Exit B',
          'from': _tampinesB,
          'to': _ikea,
          'stops': 1,
          'minutes': 12,
          'wait': 10,
          'board': 12,
          'path': [
            [1.353289, 103.945161],
            [1.374015, 103.932576],
          ],
          'names': ['Tampines Stn Exit B', 'IKEA Tampines'],
          'codes': ['ikea-tampines-mrt', 'ikea-tampines'],
          'campus': {
            'uni': 'ikea',
            'name': 'IKEA',
            'colour': '#0058a3',
            'label': 'IKEA Tampines shuttle, Tampines MRT',
            'fare': 'free',
            'fareText': '',
            'access': 'public',
            'place': const [],
            if (ends) 'ends': '2026-12-31',
            if (instead) 'instead': {'buses': ['296', '460', '68'], 'from': 'Tampines Interchange'},
          },
        },
        {'mode': 'walk', 'metres': 60, 'minutes': 1, 'to': {'kind': 'place'}},
      ],
    };

bool _ridesIkea(Map o) => (o['legs'] as List).cast<Map>().any((l) => (l['campus'] as Map?)?['uni'] == 'ikea');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => When.now = DateTime.now);

  group('the data', () {
    setUpAll(() async {
      Store.memory();
      // The app has each language's dates from its localisations; a test, from intl's own.
      await initializeDateFormatting();
      await I18n.I.use('en', remember: false);
      Stops.useRows(_gz('bus-stops') as List);
      Campus.use(_files());
    });

    test("IKEA's routes end on 31 December 2026, and no other", () {
      final m = Campus.model!;
      expect(m.problems, isEmpty);
      final ikea = m.routes.where((r) => r.uni == 'ikea').toList();
      expect(ikea.map((r) => r.key), containsAll(['ikea:IKEA T', 'ikea:IKEA S']));
      for (final r in ikea) {
        expect(r.ends, '2026-12-31', reason: r.key);
      }
      expect(m.routes.where((r) => r.uni != 'ikea' && r.ends != null), isEmpty);
    });

    test('and say what to take instead: the buses from Tampines Interchange', () {
      final m = Campus.model!;
      for (final r in m.routes.where((r) => r.uni == 'ikea')) {
        expect(r.instead?.buses, ['296', '460', '68'], reason: r.key);
        expect(r.instead?.from, 'Tampines Interchange', reason: r.key);
        expect(r.insteadJson, {'buses': ['296', '460', '68'], 'from': 'Tampines Interchange'});
      }
      expect(m.routes.where((r) => r.uni != 'ikea' && r.instead != null), isEmpty);
      final files = _files();
      final shuttles = jsonDecode(jsonEncode(files['shuttles'])) as Map;
      (shuttles['groups'] as Map)['ikea']['instead'] = {'buses': '296'};
      final bad = Campus.build({...files, 'shuttles': shuttles}, Stops.index);
      expect(bad.problems.where((p) => p.contains('instead')), isNotEmpty);
      expect(bad.routes.where((r) => r.uni == 'ikea').every((r) => r.instead == null), isTrue);
    });

    test('ended is by Singapore\'s date, the day after the last', () {
      expect(Campus.endedBy('2026-12-31', _sg(_lastEvening)), isFalse);
      expect(Campus.endedBy('2026-12-31', _sg('2026-12-31T23:59')), isFalse);
      expect(Campus.endedBy('2026-12-31', _sg('2027-01-01T00:00')), isTrue);
      expect(Campus.endedBy('2026-12-31', _sg(_firstMorning)), isTrue);
      // 16:30 in London on the 31st is already 1 January in Singapore.
      expect(Campus.endedBy('2026-12-31', DateTime.utc(2026, 12, 31, 16, 30).millisecondsSinceEpoch), isTrue);
      // 23:00 on the 30th in Los Angeles is 15:00 on the 31st in Singapore.
      expect(Campus.endedBy('2026-12-31', DateTime.utc(2026, 12, 31, 7).millisecondsSinceEpoch), isFalse);
      expect(Campus.endedBy(null, _sg(_firstMorning)), isFalse);
      expect(Campus.endedBy('soon', _sg(_firstMorning)), isFalse);
    });

    test("past the end its status is 'ended', said as Discontinued, and no bus is next after its last day", () {
      final r = Campus.route('ikea:IKEA T')!;
      final st = Campus.status(r, 0, _sg(_firstMorning));
      expect(st.state, 'ended');
      expect(st.ends, '2026-12-31');
      expect(st.season, isNull);
      final d = Campus.describe(st);
      expect((d.main, d.sub), ('Discontinued', ''));
      // After the last bus on its last day: no next one.
      final last = Campus.status(r, 0, _sg('2026-12-31T22:00'));
      expect(last.state, 'done');
      expect(last.next, isNull);
      expect(Campus.describe(last).sub, 'No buses in the next week');
      // A week before, the next day's first bus, as ever.
      expect(Campus.status(r, 0, _sg('2026-12-24T22:00')).next, isNotNull);
      // Every other route as it was.
      expect(Campus.status(Campus.route('nus:A1')!, 0, _sg(_firstMorning)).state, isNot('ended'));
    });

    test('a bad end is a problem, and ignored', () {
      final files = _files();
      final shuttles = jsonDecode(jsonEncode(files['shuttles'])) as Map;
      (shuttles['groups'] as Map)['ikea']['ends'] = '31/12/2026';
      final m = Campus.build({...files, 'shuttles': shuttles}, Stops.index);
      expect(m.problems.where((p) => p.contains('ends')), isNotEmpty);
      expect(m.routes.where((r) => r.uni == 'ikea').every((r) => r.ends == null), isTrue);
    });

    test('the date, short with its year, in each language', () async {
      expect(When.dateYear('2026-12-31'), '31 Dec 2026');
      expect(When.dateYear('2027-01-05'), '5 Jan 2027');
      expect(When.dateYear('not a date'), 'not a date');
      // As the site's toLocaleDateString and Intl.ListFormat say them.
      const site = {
        'zh-SG': ('2026年12月31日', '296、460和68'),
        'ms': ('31 Dis 2026', '296, 460 dan 68'),
        'ta': ('31 டிச., 2026', '296, 460 மற்றும் 68'),
      };
      try {
        for (final MapEntry(key: lang, value: (date, list)) in site.entries) {
          await I18n.I.use(lang, remember: false);
          expect(When.dateYear('2026-12-31'), date, reason: lang);
          expect(ShuttleEndsNotice.busList(const ['296', '460', '68']), list, reason: lang);
        }
        // Chinese: no space after its full stop.
        await I18n.I.use('zh-SG', remember: false);
        final zh = ShuttleEndsNotice.text((name: 'IKEA', ends: '2026-12-31', instead: (buses: const ['296', '460', '68'], from: 'Tampines Interchange')));
        expect(zh, contains('。从'));
        expect(zh, contains('296、460和68'));
      } finally {
        await I18n.I.use('en', remember: false);
      }
      expect(ShuttleEndsNotice.busList(const ['296', '460', '68']), '296, 460 and 68');
      expect(ShuttleEndsNotice.busList(const ['296']), '296');
    });

    test('the notice, until the end and not after', () {
      final legs = (_ikeaWay()['legs'] as List).cast<Map>();
      expect(_said(Campus.ending(legs, _sg(_lastEvening))), _ikeaEnding);
      expect(Campus.ending(legs, _sg('2026-11-26T12:00')), hasLength(1));
      expect(Campus.ending(legs, _sg(_firstMorning)), isEmpty);
      expect(ShuttleEndsNotice.text(Campus.ending(legs, _sg(_lastEvening)).single), _notice);
      // Without what to take instead, one sentence.
      expect(ShuttleEndsNotice.text((name: 'IKEA', ends: '2026-12-31', instead: null)), _ends);
      // A leg from before /api/nav carried `instead`: by the route's own.
      expect(_said(Campus.ending((_ikeaWay(instead: false)['legs'] as List).cast<Map>(), _sg(_lastEvening))), _ikeaEnding);
      // Twice on IKEA's shuttles: said once.
      expect(Campus.ending([...legs, ...legs], _sg(_lastEvening)), hasLength(1));
      // A way kept from before /api/nav said `ends`: by the route's own.
      expect(Campus.ending((_ikeaWay(ends: false)['legs'] as List).cast<Map>(), _sg(_lastEvening)), hasLength(1));
      // A ride on any other shuttle, or a bus: nothing.
      expect(Campus.ending([{'mode': 'bus', 'route': '21', 'from': {'code': '84009'}}], _sg(_lastEvening)), isEmpty);
    });

    test('a trip ride from before it kept its shuttle, by the stop it boards at', () {
      final ride = TripLeg(kind: 'bus', label: 'Bus IKEA T', to: 'IKEA Tampines', points: const [[1.353289, 103.945161], [1.374015, 103.932576]], names: const [], minutes: 12, service: 'IKEA T', board: 'ikea-tampines-mrt');
      expect(Campus.ending([ride.asNavLeg], _sg(_lastEvening)), isEmpty, reason: 'only with byStop');
      expect(_said(Campus.ending([ride.asNavLeg], _sg(_lastEvening), byStop: true)), _ikeaEnding);
      expect(Campus.ending([ride.asNavLeg], _sg(_firstMorning), byStop: true), isEmpty);
    });

    test('a trip from Navigate keeps the shuttle and its end', () {
      final made = tripFromNav(_ikeaWay(), const NavEnd('Tampines', 1.3532, 103.9452), const NavEnd('IKEA', 1.3741, 103.9327))!;
      final ride = made.legs.firstWhere((l) => l.ride);
      expect(ride.shuttle, {
        'uni': 'ikea',
        'name': 'IKEA',
        'ends': '2026-12-31',
        'instead': {'buses': ['296', '460', '68'], 'from': 'Tampines Interchange'},
      });
      expect(_said(Campus.ending([ride.asNavLeg], _sg(_lastEvening))), _ikeaEnding);
      expect(TripLeg.from(jsonDecode(jsonEncode(ride.toJson())) as Map).shuttle, ride.shuttle, reason: 'kept through a restart');
      expect(ride.cutAt(1).shuttle, ride.shuttle);
    });

    test('no live lookups once it has ended', () {
      final r = Campus.route('ikea:IKEA T')!;
      expect(r.live, isNotNull, reason: "IKEA's buses are seen live");
      _clock(_lastEvening);
      expect(Campus.canLive(r, 'ikea-tampines-mrt'), isTrue);
      _clock(_firstMorning);
      expect(Campus.canLive(r, 'ikea-tampines-mrt'), isFalse);
    });
  });

  group('Navigate on the phone', () {
    late NavGraph graph;
    late NavRun ikeaT;

    setUpAll(() {
      final stops = [
        for (final r in (_gz('bus-stops') as List).cast<Map>())
          Stop('${r['c']}', '${r['n']}', '${r['r'] ?? ''}', (r['la'] as num?)?.toDouble(), (r['lo'] as num?)?.toDouble()),
      ];
      final routes = NavOffline.servicesOf((_gz('bus-routes') as Map).cast<String, dynamic>());
      graph = buildGraph(_site('rail') as Map, stops, routes, campus: _files());
      ikeaT = graph.runs.firstWhere((r) => r.key == 'C:ikea:IKEA T');
    });

    test('its leg says when it ends, and what to take instead', () {
      expect(ikeaT.campus?['ends'], '2026-12-31');
      expect(ikeaT.campus?['instead'], {'buses': ['296', '460', '68'], 'from': 'Tampines Interchange'});
      final nus = graph.runs.firstWhere((r) => r.key.startsWith('C:nus:')).campus!;
      expect(nus.containsKey('ends'), isFalse);
      expect(nus.containsKey('instead'), isFalse);
    });

    test('boarded on its last day, never the day after', () {
      // Its timetable runs every day from noon, public holidays too (1 January is one).
      expect(meanWait(ikeaT, 0, _sg('2026-12-31T12:30'), graph.campusConfig), isNotNull);
      expect(meanWait(ikeaT, 0, _sg('2026-12-31T19:30'), graph.campusConfig), isNotNull);
      expect(meanWait(ikeaT, 0, _sg('2027-01-01T12:30'), graph.campusConfig), isNull);
      expect(meanWait(ikeaT, 0, _sg('2027-01-02T12:30'), graph.campusConfig), isNull);
    });

    // From Serangoon MRT's Exit E to IKEA, one of the ways is IKEA's own shuttle, IKEA S.
    final serangoon = NavPoint(1.351257, 103.872718);
    final ikea = NavPoint(1.374015, 103.932576);

    test('ways on 31 December ride it; on 1 and 2 January, when its timetable would run, they never do', () {
      for (final at in ['2026-12-31T13:00', _lastEvening]) {
        final ways = planOnPhone(graph, serangoon, ikea, when: NavAt('leave', _sg(at)));
        expect(ways.any(_ridesIkea), isTrue, reason: 'leave $at');
        for (final o in ways.where(_ridesIkea)) {
          expect(_said(Campus.ending((o['legs'] as List).cast<Map>(), _sg(at))), _ikeaEnding);
        }
      }
      // Planned for after the end while it's still December: by the trip's own date.
      _clock('2026-12-31T09:00');
      for (final at in ['2027-01-01T13:00', '2027-01-02T13:00']) {
        expect(planOnPhone(graph, serangoon, ikea, when: NavAt('leave', _sg(at))).any(_ridesIkea), isFalse, reason: 'leave $at');
        expect(planOnPhone(graph, serangoon, ikea, when: NavAt('arrive', _sg(at))).any(_ridesIkea), isFalse, reason: 'arrive by $at');
        expect(planOnPhone(graph, ikea, serangoon, when: NavAt('leave', _sg(at))).any(_ridesIkea), isFalse, reason: 'back, $at');
      }
      expect(planOnPhone(graph, serangoon, ikea, when: NavAt('now', _sg('2027-01-01T13:00'))).any(_ridesIkea), isFalse);
    });
  });

  group('Bus timings', () {
    final asked = <String>[];
    Future<void> pumpStop(WidgetTester t, String key) async {
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: Scaffold(body: CampusList(stopKey: key))));
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
      await t.pump();
    }

    setUp(() async {
      Store.memory();
      await I18n.I.use('en', remember: false);
      Stops.useRows(_gz('bus-stops') as List);
      Campus.use(_files());
      asked.clear();
      Api.fake = (path) async {
        asked.add(path);
        return {'eta': 4};
      };
    });
    tearDown(() => Api.fake = null);

    testWidgets('its last evening: its times, looked up live, and when it ends', (t) async {
      _clock(_lastEvening);
      await pumpStop(t, 'ikea-tampines');
      expect(find.text('Discontinued'), findsNothing);
      expect(find.textContaining('18:'), findsWidgets);
      expect(asked.where((p) => p.startsWith('shuttle-live')), isNotEmpty);
      // Both of IKEA's routes stop there.
      expect(find.text('Ends on 31 Dec 2026'), findsNWidgets(2));
    });

    testWidgets('a route that isn\'t ending says nothing of it', (t) async {
      _clock(_lastEvening);
      final nus = Campus.model!.stops.values.firstWhere((s) => !s.lta && s.uni == 'nus');
      await pumpStop(t, nus.key);
      expect(find.textContaining('Ends on'), findsNothing);
    });

    testWidgets('from 1 January: Discontinued in place of its times, not looked up live', (t) async {
      _clock(_firstMorning);
      await pumpStop(t, 'ikea-tampines');
      // Both of IKEA's routes stop there.
      expect(find.text('Discontinued'), findsNWidgets(2));
      expect(find.textContaining('12:'), findsNothing);
      expect(find.textContaining('Ends on'), findsNothing);
      expect(asked.where((p) => p.startsWith('shuttle-live')), isEmpty);
    });

    testWidgets("its route's own window says so too", (t) async {
      _clock(_firstMorning);
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const CampusRouteScreen(routeKey: 'ikea:IKEA T')));
      expect(find.text('Discontinued'), findsOneWidget);
      expect(find.textContaining('Ends on'), findsNothing);
      _clock(_lastEvening);
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const CampusRouteScreen(routeKey: 'ikea:IKEA S')));
      expect(find.text('Discontinued'), findsNothing);
      expect(find.text('Ends on 31 Dec 2026'), findsOneWidget);
    });
  });

  group('the notice on a way and a trip', () {
    setUpAll(loadFonts);

    Future<void> ready(WidgetTester t, String at, Map<String, dynamic> way) async {
      await t.runAsync(() => stillData(state: const {'sgbus_tour': 'done', 'sgbus_tours': '["nav"]'}));
      _clock(at);
      final real = Api.fake!;
      Api.fake = (path) async {
        if (!path.startsWith('nav')) return real(path);
        final got = Map<String, dynamic>.from(await real(path) as Map);
        return {...got, 'options': [way]};
      };
      Campus.use(_files());
      final n = NavState.I
        ..from = const NavEnd('Tampines MRT', 1.353289, 103.945161)
        ..to = const NavEnd('IKEA Tampines', 1.374015, 103.932576)
        ..via = null
        ..when = null
        ..option = null;
      await t.runAsync(n.run);
    }

    Future<void> pumpNav(WidgetTester t) async {
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const Scaffold(body: NavPage())));
      await settle(t);
    }

    testWidgets("Navigate: on the way's summary, and at the top of its details", (t) async {
      await ready(t, _lastEvening, _ikeaWay());
      final n = NavState.I;
      expect(n.options, hasLength(1));
      await pumpNav(t);
      expect(find.text(_notice), findsOneWidget, reason: 'the summary');
      await t.runAsync(() => n.open(n.options.first));
      await pumpNav(t);
      expect(find.text(_notice), findsOneWidget, reason: 'the details');
      // Above everything else in them but the buttons.
      expect(t.getTopLeft(find.text(_notice)).dy, lessThan(t.getTopLeft(find.textContaining('~24 min').first).dy));
      n.option = null;
    });

    testWidgets('Navigate: not once it has ended', (t) async {
      await ready(t, _firstMorning, _ikeaWay());
      final n = NavState.I;
      await pumpNav(t);
      expect(find.text(_notice), findsNothing);
      await t.runAsync(() => n.open(n.options.first));
      await pumpNav(t);
      expect(find.text(_notice), findsNothing);
      n.option = null;
    });

    testWidgets('the trip you are on', timeout: const Timeout(Duration(minutes: 2)), (t) async {
      await ready(t, _lastEvening, _ikeaWay());
      final made = tripFromNav(_ikeaWay(), NavState.I.from, NavState.I.to)!;
      await t.runAsync(() => Trip.I.start(title: made.title, legs: made.legs));
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const TripScreen()));
      await settle(t);
      expect(find.text(_notice), findsOneWidget);
      _clock(_firstMorning);
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const TripScreen(key: ValueKey('again'))));
      await settle(t);
      expect(find.text(_notice), findsNothing);
      await t.runAsync(() => Trip.I.stop());
      await settle(t);
    });
  });

  group('the command line', () {
    final printed = <String>[];

    Future<String> nav(String at) async {
      await stillData();
      _clock(at);
      final real = Api.fake!;
      Api.fake = (path) async {
        if (!path.startsWith('nav')) return real(path);
        return {...(await real(path) as Map), 'options': [_ikeaWay()]};
      };
      printed.clear();
      final core = SgbusCore(out: printed.add, clear: printed.clear, version: '2.8.0');
      await core.run(SgbusCore.wordsOf('nav 84009 17009'));
      return SgbusCore.visible(printed.join('\n'));
    }

    test('sgbus nav says it under the way and first in its steps, till the end', () async {
      final said = await nav(_lastEvening);
      expect(_notice.allMatches(said), hasLength(2), reason: said);
      final lines = said.split('\n');
      expect(lines[lines.indexWhere((l) => l.contains('Way 1:')) + 1].trim(), _notice);
      expect(SgbusCore.endingLines(_ikeaWay(ends: false)), isEmpty, reason: 'only by the leg it gives');
      expect(SgbusCore.endingLines(_ikeaWay(instead: false)), [_ends]);
    });

    test('and not once it has ended', () async {
      expect(await nav(_firstMorning), isNot(contains('shuttle bus service ends')));
    });
  });

  group('Explorer', () {
    setUpAll(() async {
      await loadFonts();
      // The stations' first load, out here and found: a future one test made, kept and awaited by
      // the next, would wait on the first test's clock forever.
      await stillData();
      final real = Api.fake!;
      Api.fake = (path) async => path == 'data/rail-stations.json' ? _site('rail-stations') : real(path);
      await Stations.load();
    });

    Future<MapInk> open(WidgetTester t, String at, {Map<String, String> state = const {}}) async {
      await t.runAsync(() => stillData(state: {'sgbus_tour': 'done', ...state}));
      _clock(at);
      await t.runAsync(() async => Campus.use(_files()));
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const LiveMap(MapMode.explore)));
      // Until the shuttles are drawn, a few seconds at most.
      for (var i = 0; i < 6 || i < 60 && t.widget<MapPreview>(find.byType(MapPreview)).ink.shuttles.isEmpty; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await t.pump(const Duration(milliseconds: 100));
      }
      return t.widget<MapPreview>(find.byType(MapPreview)).ink;
    }

    Future<void> layers(WidgetTester t) async {
      await t.tap(find.byTooltip('Layers'));
      await settle(t);
    }

    testWidgets('its last evening: in Shuttle bus routes and stops, and no Discontinued shuttles', (t) async {
      final ink = await open(t, _lastEvening);
      expect(ink.shuttles.map((l) => l.key), contains('ikea:IKEA T'));
      expect(ink.gone, isEmpty);
      expect(ink.pois.where((p) => p.kind == 'discontinued'), isEmpty);
      expect(ink.pois.where((p) => p.kind == 'campus' && (p.pick.code ?? '').startsWith('ikea-')), hasLength(3));
      await layers(t);
      expect(find.text('Shuttle bus routes'), findsOneWidget);
      expect(find.text('Discontinued shuttles'), findsNothing);
    });

    testWidgets('from 1 January: in Discontinued shuttles, off until it is turned on', (t) async {
      final ink = await open(t, _firstMorning);
      expect(ink.shuttles.map((l) => l.key), isNot(contains('ikea:IKEA T')));
      expect(ink.shuttles, isNotEmpty, reason: 'the others stay');
      expect(ink.gone.map((l) => l.key).toSet(), {'ikea:IKEA T', 'ikea:IKEA S'});
      expect(ink.pois.where((p) => p.kind == 'campus' && (p.pick.code ?? '').startsWith('ikea-')), isEmpty);
      expect(ink.pois.where((p) => p.kind == 'discontinued').map((p) => p.pick.code).toSet(), {'ikea-tampines', 'ikea-tampines-mrt', 'ikea-serangoon-mrt'});
      expect(ink.off, contains('discontinued'));
      await layers(t);
      final row = find.widgetWithText(SwitchListTile, 'Discontinued shuttles');
      expect(row, findsOneWidget);
      expect(t.widget<SwitchListTile>(row).value, isFalse);
      await t.tap(row);
      await settle(t);
      expect(t.widget<SwitchListTile>(row).value, isTrue);
      expect(ink.off, isNot(contains('discontinued')));
      expect(Store.I.list(LiveMap.layersOnKey), ['discontinued']);
      expect(Store.I.get(LiveMap.layersKey), isNull, reason: "the site's list of layers turned off is left as it was");
      await t.tap(row);
      await settle(t);
      expect(ink.off, contains('discontinued'));
      expect(Store.I.get(LiveMap.layersOnKey), isNull);
    });

    testWidgets('turned on, it stays on; and the other layers still turn off as they did', (t) async {
      final ink = await open(t, _firstMorning, state: {LiveMap.layersOnKey: '["discontinued"]', LiveMap.layersKey: '["campus"]'});
      expect(ink.off, isNot(contains('discontinued')));
      expect(ink.off, contains('campus'));
    });
  });
}
