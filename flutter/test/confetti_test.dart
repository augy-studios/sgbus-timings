// Confetti ends (bug report 20261108-UZMT): when its time is up, none of it stays on the screen,
// not even the slow pieces that used to stop mid-fall.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/coins/coins.dart';

void main() {
  testWidgets('confetti falls, then is gone', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: SizedBox.expand(child: Confetti(seconds: 2)))));
    final paint = find.descendant(of: find.byType(Confetti), matching: find.byType(CustomPaint));
    await t.pump(const Duration(milliseconds: 800));
    expect(paint, findsOneWidget, reason: 'falling');
    await t.pump(const Duration(milliseconds: 1300));
    await t.pump();
    expect(paint, findsNothing, reason: 'gone once its time is up');
  });
}
