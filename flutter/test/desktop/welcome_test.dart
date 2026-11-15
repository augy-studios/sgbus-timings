// Make it yours (lib/desktop/welcome.dart, desktop-features-spec §1): the choices it sends back on
// Get started, the Theme it goes back to when Follow system theme is turned off, the System accent
// swatch, the brand colours hiding while Your colours are on, and its own words per language.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/welcome.dart';

const _colours = [
  WelcomeColour('classic', 'Classic', 0xFFCCFFCC),
  WelcomeColour('not-green-1', 'Not green 1', 0xFFFFCCCC),
  WelcomeColour('gta-6', 'GTA VI', 0xFFFF2B90, dot: [0xFF2B60DA, 0xFFFF2B90, 0xFFE6953E], locked: true),
];

void main() {
  /// Draws the window at its usual size, and gives back what Get started sends.
  Future<List<Map<String, Object?>>> open(WidgetTester tester, WelcomeState state) async {
    tester.view.physicalSize = const Size(940, 660);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final sent = <Map<String, Object?>>[];
    await tester.pumpWidget(WelcomeApp(key: UniqueKey(), state: state, onFinish: (picked) async => sent.add(picked), brightness: Brightness.light));
    await tester.pumpAndSettle();
    return sent;
  }

  Future<void> getStarted(WidgetTester tester) async {
    await tester.tap(find.text('Get started'));
    await tester.pumpAndSettle();
  }

  testWidgets('Get started sends every choice, once', (tester) async {
    final sent = await open(tester, WelcomeState(colours: _colours));
    await tester.tap(find.byTooltip('Not green 1'));
    await tester.pumpAndSettle();
    await getStarted(tester);
    await getStarted(tester);
    expect(sent, [
      {'lang': 'auto', 'mode': 'light', 'color': 'not-green-1', 'start': true, 'systemAccent': false},
    ]);
  });

  testWidgets('a locked colour cannot be picked', (tester) async {
    final sent = await open(tester, WelcomeState(colours: _colours));
    await tester.tap(find.byTooltip('GTA VI'));
    await tester.pumpAndSettle();
    await getStarted(tester);
    expect(sent.single['color'], 'classic');
  });

  testWidgets('turning Follow system theme off goes back to the Theme picked before', (tester) async {
    final sent = await open(tester, WelcomeState(mode: 'dark', colours: _colours));
    final follow = find.byType(Switch).at(1);
    await tester.tap(follow);
    await tester.pumpAndSettle();
    await tester.tap(follow);
    await tester.pumpAndSettle();
    await getStarted(tester);
    expect(sent.single['mode'], 'dark');
  });

  testWidgets('following the system theme sends "phone"', (tester) async {
    final sent = await open(tester, WelcomeState(colours: _colours));
    await tester.tap(find.byType(Switch).at(1));
    await tester.pumpAndSettle();
    await getStarted(tester);
    expect(sent.single['mode'], 'phone');
  });

  group('System accent', () {
    testWidgets('offered when the computer has an accent colour, and sent when picked', (tester) async {
      final sent = await open(tester, WelcomeState(colours: _colours, systemColour: 0xFF0078D4));
      await tester.tap(find.byTooltip('System accent'));
      await tester.pumpAndSettle();
      expect(find.text('Your computer’s own accent colour'), findsOneWidget);
      await getStarted(tester);
      expect(sent.single['systemAccent'], isTrue);
    });

    testWidgets('picking a brand colour turns it off again', (tester) async {
      final sent = await open(tester, WelcomeState(colours: _colours, systemColour: 0xFF0078D4, systemAccent: true));
      await tester.tap(find.byTooltip('Classic'));
      await tester.pumpAndSettle();
      await getStarted(tester);
      expect(sent.single['systemAccent'], isFalse);
      expect(sent.single['color'], 'classic');
    });

    testWidgets("not offered when the computer can't say its colour", (tester) async {
      await open(tester, WelcomeState(colours: _colours));
      expect(find.byTooltip('System accent'), findsNothing);
    });
  });

  testWidgets('with Your colours on, the swatches hide and a note says why', (tester) async {
    await open(tester, WelcomeState(colours: _colours, yours: true, systemColour: 0xFF0078D4));
    expect(find.byTooltip('Classic'), findsNothing);
    expect(find.byTooltip('System accent'), findsNothing);
    expect(find.text('Your colours are on, so the brand colours wait until you turn them off.'), findsOneWidget);
  });

  testWidgets('its words follow the language picked, or the computer\'s for Automatic', (tester) async {
    await open(tester, WelcomeState(lang: 'zh-SG', colours: _colours));
    expect(find.text('开始使用'), findsOneWidget);
    await open(tester, WelcomeState(systemLang: 'ms', colours: _colours));
    expect(find.text('Mulakan'), findsOneWidget);
  });

  test('every language has every word', () {
    final english = welcomeWords['en']!.keys.toSet();
    for (final MapEntry(:key, :value) in welcomeWords.entries) {
      expect(value.keys.toSet(), english, reason: key);
    }
  });

  test('what the window opens with comes through its arguments whole', () {
    final state = WelcomeState(lang: 'ta', mode: 'time', color: 'gta-6', start: false, yours: true, colours: _colours, systemLang: 'ms', systemAccent: true, systemColour: 0xFF0078D4);
    final back = WelcomeState.fromJson(state.toJson());
    expect(back.toJson(), state.toJson());
    expect(back.colours[2].locked, isTrue);
    expect(WelcomeState.fromJson({}).toJson(), WelcomeState().toJson());
  });
}
