// uwuCoins' History: every coin in and out and where it came from, kept in the log.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/rewards.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/coins/coins.dart';
import 'package:sgbus_timings/theme/theme.dart';

final _train = {
  'kind': 'train', 'route': 'EW', 'label': 'EW', 'minutes': 4,
  'points': [[1.323935, 103.929995], [1.327262, 103.946513]],
};
final _seen = <String, dynamic>{'ok': true};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    Store.memory({});
    When.now = () => DateTime.utc(2026, 11, 7, 4);
  });
  tearDown(() => When.now = DateTime.now);

  group('what the log keeps', () {
    test('a trip: its name and what made up its coins', () {
      Coins.tripDone('t1', [_train], [_seen], name: 'To Bedok Mall');
      final e = Coins.log.first;
      expect(e['why'], 'trip');
      expect(e['name'], 'To Bedok Mall');
      expect((e['parts'] as Map)['finish'], 5);
      expect(e['n'], (e['parts'] as Map).values.fold<int>(0, (a, b) => a + (b as int)), reason: 'the parts add up to it');
    });

    test('a spin: its cost, then what it won, and nothing but coins moves the balance', () {
      Coins.setBalance(100000);
      for (var i = 0; i < 400; i++) {
        final before = Coins.balance;
        final r = Coins.spin()!;
        final log = Coins.log;
        if (r.coins != null) {
          expect(log[0]['why'], 'wheel');
          expect(log[0]['n'], r.coins);
          expect(log[1]['why'], 'spin');
          expect(log[1]['n'], -Coins.spinCost);
          expect(Coins.balance, before - Coins.spinCost + r.coins!);
        } else {
          expect(log[0]['why'], 'egg');
          expect(log[0]['egg'], r.egg);
          expect(log[0]['n'], 0);
          expect(log[1]['why'], 'spin');
          expect(Coins.balance, before - Coins.spinCost);
        }
      }
    });

    test('GTA VI won on the wheel says so', () {
      When.now = () => DateTime.utc(2026, 12, 1);
      Coins.setBalance(100000);
      for (var i = 0; i < 2000 && !Gta6.owned; i++) {
        Coins.spin();
      }
      expect(Gta6.owned, isTrue);
      expect(Coins.log.first['why'], 'gta6');
      expect(coinEntryWords(Coins.log.first).what, contains('GTA VI'));
    });

    test('it keeps the last 2,000, and a trip paid long ago is still paid', () {
      Coins.tripDone('old', [_train], [_seen]);
      for (var i = 0; i < 1500; i++) {
        Coins.add(1, info: const {'why': 'simulated'}, quiet: true);
      }
      expect(Coins.log.length, 1501);
      Coins.tripDone('old', [_train], [_seen]);
      expect(Coins.log.where((e) => e['trip'] == 'old').length, 1, reason: 'never paid twice');
      for (var i = 0; i < 700; i++) {
        Coins.add(1, info: const {'why': 'simulated'}, quiet: true);
      }
      expect(Coins.log.length, 2000);
    });
  });

  group('what each says', () {
    test('a trip by the name kept', () {
      final w = coinEntryWords({'why': 'trip', 'trip': 't', 'name': 'To Bedok Mall', 'parts': {'finish': 5, 'km': 0, 'lines': 2}});
      expect(w.what, 'Trip: To Bedok Mall');
      expect(w.more, '5 for getting there · 2 for lines', reason: 'not what it got nothing for');
    });

    test('a trip with none kept: from Your trips, while it’s there, else just a trip', () {
      Store.I.putJson('sgbus_trips', [
        {'id': 'a', 'title': 'To Work', 'to': {'label': 'Work'}},
        {'id': 'b', 'to': {'label': 'Home'}},
      ]);
      expect(coinEntryWords({'why': 'trip', 'trip': 'a'}).what, 'Trip: To Work');
      expect(coinEntryWords({'why': 'trip', 'trip': 'b'}).what, 'Trip: Home');
      expect(coinEntryWords({'why': 'trip', 'trip': 'gone'}).what, 'A trip');
    });

    test('a feat, by itself, with a team, and from a past trip', () {
      expect(coinEntryWords({'why': 'feat', 'feat': 'ktm'}).what, 'Feat: Down the old railway');
      expect(coinEntryWords({'why': 'feat', 'feat': 'ktm', 'team': 'Buses'}).more, contains('Buses'));
      expect(coinEntryWords({'why': 'feat', 'feat': 'ktm', 'past': true}).more, 'From a trip before uwuCoins');
    });

    test('everything else, and something it doesn’t know', () {
      expect(coinEntryWords({'why': 'past', 'trips': 13}).more, '13 trips');
      expect(coinEntryWords({'why': 'spin'}).what, 'A spin of the wheel');
      expect(coinEntryWords({'why': 'wheel'}).what, 'Won on the wheel');
      expect(coinEntryWords({'why': 'egg', 'egg': 'ktm'}).what, 'Won on the wheel: Down the old railway');
      expect(coinEntryWords({'why': 'simulated'}).what, 'Added from the console');
      expect(coinEntryWords({'why': 'something new'}).what, 'uwuCoins');
      expect(coinEntryWords({}).what, 'uwuCoins');
    });
  });

  group('the screen', () {
    Future<void> screen(WidgetTester t) async {
      AppLook.I.materialYou = true;
      t.view.physicalSize = const Size(412, 892) * 3;
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const CoinsHistory()));
      await t.pump();
    }

    void seed() {
      final ms = When.nowMs();
      Store.I.putJson('sgbus_coins', {
        'balance': 10,
        'spins': 1,
        'log': [
          {'at': ms, 'n': 50, 'why': 'wheel'},
          {'at': ms - 5000, 'n': -100, 'why': 'spin'},
          {'at': ms - 86400000, 'n': 0, 'why': 'egg', 'egg': 'ktm'},
          {'at': ms - 2 * 86400000, 'n': 60, 'why': 'trip', 'trip': 't', 'name': 'To Work'},
        ],
      });
    }

    testWidgets('nothing yet says how to start', (t) async {
      await screen(t);
      expect(find.textContaining('Nothing yet'), findsOneWidget);
      expect(find.text('Earned 0 · Spent 0'), findsOneWidget);
    });

    testWidgets('each one, what it was, how much and when, under its day', (t) async {
      seed();
      await screen(t);
      expect(t.takeException(), isNull);
      expect(find.text('Earned 110 · Spent 100'), findsOneWidget);
      expect(find.text('Won on the wheel'), findsOneWidget);
      expect(find.text('+50'), findsOneWidget);
      expect(find.text('A spin of the wheel'), findsOneWidget);
      expect(find.text('−100'), findsOneWidget);
      expect(find.text('Trip: To Work'), findsOneWidget);
      expect(find.text('🥚'), findsOneWidget);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text(When.clock(When.nowMs())), findsWidgets);
    });

    testWidgets('Earned and Spent narrow it, the totals staying whole', (t) async {
      seed();
      await screen(t);
      await t.tap(find.text('Spent'));
      await t.pump();
      expect(find.text('A spin of the wheel'), findsOneWidget);
      expect(find.text('Trip: To Work'), findsNothing);
      expect(find.text('Earned 110 · Spent 100'), findsOneWidget);
      await t.tap(find.text('Earned'));
      await t.pump();
      expect(find.text('A spin of the wheel'), findsNothing);
      expect(find.text('Trip: To Work'), findsOneWidget);
      expect(find.textContaining('Won on the wheel: '), findsOneWidget, reason: 'a prize is something earned');
    });

    testWidgets('reached from the wheel’s screen', (t) async {
      AppLook.I.materialYou = true;
      t.view.physicalSize = const Size(412, 1400) * 3;
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const CoinsScreen()));
      await t.pump();
      expect(find.text('History'), findsOneWidget);
    });
  });
}
