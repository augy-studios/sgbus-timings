// uwuCoins with the Telegram bot (telegram-bot/src/coins.py), as the website has them (js/coins.js,
// js/sync.js, js/share.js): an Easter egg link from the bot's wheel opened here, this phone's
// balance in sync, and taking another's.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/rewards.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/share/shared.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

void main() {
  setUpAll(loadFonts);

  group('an egg link\'s prize', () {
    setUp(() {
      Store.memory({});
      When.now = () => DateTime.utc(2026, 11, 10, 2);
    });

    test('GTA VI\'s colours while they\'re the wheel\'s to give', () {
      if (!Gta6.due) return; // before 26 November they can still be set, and an egg's given
      final r = Coins.eggLinkPrize();
      expect(r.gta6, isTrue);
    });

    test('an egg not found yet, otherwise; coins once every egg is found', () {
      Store.I.putJson(Gta6.key, {'at': When.nowMs(), 'how': 'set'});
      final found = <String>{};
      for (var i = 0; i < Feats.ids.length; i++) {
        final r = Coins.eggLinkPrize();
        expect(r.egg, isNotNull);
        expect(found.add(r.egg!), isTrue, reason: 'never one already found');
      }
      expect(Feats.eggs().length, Feats.ids.length);
      final last = Coins.eggLinkPrize();
      expect(last.coins, Coins.eggGoneCoins);
      expect(Coins.balance, Coins.eggGoneCoins);
      expect(Coins.log.first['why'], 'egglink');
    });
  });

  group('sync', () {
    setUp(() => Store.memory({}));

    test('this phone\'s balance, with its own id, kept', () {
      expect(Coins.syncList(), isEmpty, reason: 'nothing to add with no coins');
      Coins.add(120, info: {'why': 'simulated'}, quiet: true);
      final own = Coins.syncList();
      expect(own, [{'id': Coins.syncId, 'balance': 120}]);
      expect(Coins.syncId, startsWith('a-'));
      expect(Coins.syncId, Coins.syncList().first['id'], reason: 'the same id every time');
    });
  });

  testWidgets('an egg link opened: used up on the server, then its prize said', (t) async {
    await t.runAsync(() => stillData(state: {'sgbus_tour': 'done', 'sgbus_first_run': 'done', Gta6.key: '{"at":1,"how":"set"}'}));
    final asked = <String>[];
    final real = Api.fake;
    Api.fake = (path) async {
      asked.add(path);
      if (path.startsWith('share?')) return {'kind': 'egg', 'data': {'used': false}, 'updatedAt': 1};
      if (path == 'share') return {'ok': true};
      return real?.call(path);
    };
    addTearDown(() => Api.fake = real);
    await t.pumpWidget(MaterialApp(navigatorKey: AppNav.navigatorKey, theme: AppLook.I.theme(Brightness.light), home: const Scaffold()));
    final opening = openShared('egg0000001');
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(asked, ['share?id=egg0000001', 'share']);
    expect(find.byKey(const ValueKey('eggLinkPrize')), findsOneWidget);
    expect(find.textContaining('An Easter egg'), findsOneWidget);
    expect(Feats.eggs().length, 1);
    await t.tap(find.text('Close'));
    await t.pumpAndSettle();
    await opening;
  });
}
