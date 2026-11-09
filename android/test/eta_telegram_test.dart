// Someone's shared trip has Follow in Telegram while it's live, as on the website (js/share.js):
// it opens their trip as a live widget in the Telegram bot (telegram-bot/src/bot_trips.py).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/share/shared.dart';
import 'package:sgbus_timings/i18n/i18n.dart';
import 'package:sgbus_timings/theme/theme.dart';

import 'shots/harness.dart';

Map<String, dynamic> eta({bool ended = false}) => {
      'name': 'Sam',
      'to': {'label': 'One Raffles Place', 'lat': 1.2842, 'lng': 103.8513},
      'arriveAt': When.nowMs() + 24 * 60000,
      'leg': {'label': 'Bus 28', 'to': 'Paya Lebar Stn Exit D', 'stopsLeft': 6, 'kind': 'bus'},
      'legIndex': 1,
      'legCount': 3,
      'ended': ended,
    };

Future<void> show(WidgetTester t, Map<String, dynamic> data) async {
  await t.pumpWidget(MaterialApp(
    navigatorKey: AppNav.navigatorKey,
    theme: AppLook.I.theme(Brightness.light),
    home: EtaView(id: 'ttzik7wkd6', first: data, updatedAt: When.nowMs()),
  ));
  await t.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(loadFonts);

  test('the link is the bot, with the trip', () {
    expect(telegramLink('ttzik7wkd6'), 'https://t.me/sgbus_app?start=eta_ttzik7wkd6');
  });

  testWidgets('Follow in Telegram while the trip is live, in the site\'s words', (t) async {
    await t.runAsync(() => stillData(state: {'sgbus_tour': 'done', 'sgbus_first_run': 'done'}));
    await show(t, eta());
    final button = find.byKey(const ValueKey('etaTelegram'));
    expect(button, findsOneWidget);
    expect(find.descendant(of: button, matching: find.text(tr('html.follow_in_telegram', '?'))), findsOneWidget);
    expect(tr('html.follow_in_telegram', '?'), 'Follow in Telegram');
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('none once they\'ve arrived', (t) async {
    await t.runAsync(() => stillData(state: {'sgbus_tour': 'done', 'sgbus_first_run': 'done'}));
    await show(t, eta(ended: true));
    expect(find.byKey(const ValueKey('etaTelegram')), findsNothing);
    await t.pumpWidget(const SizedBox());
  });
}
