// GTA VI's colours: a swatch that carries a whole theme and a choice in Material You, every colour of
// the logo with its text readable on it, set in time to keep or won on the wheel, and offered once.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/eggs_data.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/rewards.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/misc/extras.dart';
import 'package:sgbus_timings/features/settings/theme_screen.dart';
import 'package:sgbus_timings/theme/theme.dart';

double _contrast(Color a, Color b) {
  final x = a.computeLuminance(), y = b.computeLuminance();
  return (x > y ? x + .05 : y + .05) / (x > y ? y + .05 : x + .05);
}

SgColors _sg(Brightness b) => AppLook.I.theme(b).extension<SgColors>()!;
final _before = DateTime.utc(2026, 11, 25, 15, 59);
final _after = DateTime.utc(2026, 11, 25, 16);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    Store.memory();
    When.now = () => _before;
  });
  tearDown(() => When.now = DateTime.now);

  group('as a brand colour', () {
    setUp(() {
      AppLook.I.materialYou = false;
      AppLook.I.swatchId = AppLook.gta6;
    });

    test('is the logo pink, with a pale page by day and its violet by night', () {
      expect(_sg(Brightness.light).brand, const Color(0xFFFF2B90));
      expect(_sg(Brightness.light).bg, const Color(0xFFFFF0F7));
      expect(_sg(Brightness.dark).brand, const Color(0xFFFF2B90));
      expect(_sg(Brightness.dark).bg, const Color(0xFF1D0030));
    });

    for (final b in Brightness.values) {
      test('reads clearly in $b', () {
        final sg = _sg(b);
        expect(_contrast(sg.onBrand, sg.brand), greaterThanOrEqualTo(4.5), reason: 'text on a button');
        expect(_contrast(sg.ink, sg.bg), greaterThanOrEqualTo(7), reason: 'text on the page');
        expect(_contrast(sg.muted, sg.bg), greaterThanOrEqualTo(4.5), reason: 'softer text');
        expect(_contrast(sg.brandInk, sg.bg), greaterThanOrEqualTo(4.5), reason: 'links and headings');
      });
    }

    test('the others are as they were', () {
      AppLook.I.swatchId = 'not-green-1';
      expect(_sg(Brightness.dark).bg, const Color(0xFF0C100E));
      expect(_sg(Brightness.dark).brand, const Color(0xFFFFCCCC));
    });

    test('Your colours still come first', () {
      Store.I.putJson(AppLook.coloursKey, {
        'kind': 'base',
        'base': '#123456',
        'light': {'--bg': '#010203', '--brand': '#123456'},
        'dark': {'--bg': '#010203', '--brand': '#123456'},
      });
      expect(_sg(Brightness.light).bg, const Color(0xFF010203));
      expect(_sg(Brightness.light).brand, const Color(0xFF123456));
      expect(_sg(Brightness.light).accents, isNull);
    });

    test('High contrast keeps its own page and text', () {
      final sg = AppLook.I.theme(Brightness.dark, contrast: true).extension<SgColors>()!;
      expect(sg.bg, Colors.black);
      expect(sg.ink, Colors.white);
      expect(sg.onBrand, Colors.black);
      expect(sg.accents, isNull);
    });
  });

  group('every colour of the logo', () {
    for (final material in [true, false]) {
      for (final b in Brightness.values) {
        group('${material ? 'Material You' : 'UwU Apps'} $b', () {
          setUp(() {
            AppLook.I.materialYou = material;
            if (material) {
              AppLook.I.youColours = AppLook.gta6;
            } else {
              AppLook.I.swatchId = AppLook.gta6;
            }
          });

          test('a different colour to each kind of thing', () {
            final sg = _sg(b);
            expect({sg.brand, sg.pick, sg.tray, sg.bar, sg.badge}.length, 5);
            expect({for (final no in ['14', '15', '16', '17', '7', '196']) sg.busInk(no)}.length, greaterThanOrEqualTo(3));
            expect(sg.busInk('14'), sg.busInk('14'), reason: 'the same bus is always the same colour');
          });

          test('each with its text readable on it', () {
            final sg = _sg(b);
            for (final (name, fill, on) in [('brand', sg.brand, sg.onBrand), ('pick', sg.pick, sg.onPick), ('tray', sg.tray, sg.onTray), ('bar', sg.bar, sg.onBar), ('badge', sg.badge, sg.onBadge)]) {
              expect(_contrast(fill, on), greaterThanOrEqualTo(4.5), reason: name);
            }
            for (var i = 0; i < 5; i++) {
              final (fill, on) = sg.slice(i)!;
              expect(_contrast(fill, on), greaterThanOrEqualTo(4.5), reason: 'slice $i');
            }
          });

          test('its inks read on the page and its cards', () {
            final t = AppLook.I.theme(b);
            final sg = t.extension<SgColors>()!;
            final card = Color.alphaBlend(sg.surfaceStrong, sg.bg);
            for (final ink in [...sg.accents!.inks, sg.heading, t.colorScheme.secondary, t.colorScheme.tertiary, t.colorScheme.primary]) {
              expect(_contrast(ink, sg.bg), greaterThanOrEqualTo(4.5), reason: '$ink on the page');
              expect(_contrast(ink, card), greaterThanOrEqualTo(4.5), reason: '$ink on a card');
            }
          });

          test('a picked choice is orange, and the status colours keep their meaning', () {
            final t = AppLook.I.theme(b);
            expect(t.colorScheme.secondaryContainer, const Color(0xFFE6953E));
            expect(_contrast(t.colorScheme.onSecondaryContainer, t.colorScheme.secondaryContainer), greaterThanOrEqualTo(4.5));
            final plain = (() {
              AppLook.I.youColours = 'phone';
              AppLook.I.swatchId = 'classic';
              return _sg(b);
            })();
            AppLook.I.youColours = AppLook.gta6;
            AppLook.I.swatchId = AppLook.gta6;
            expect(_sg(b).ok, plain.ok);
            expect(_sg(b).warn, plain.warn);
            expect(_sg(b).tones, plain.tones);
          });
        });
      }
    }

    test('any other theme has the one colour', () {
      AppLook.I.materialYou = false;
      AppLook.I.swatchId = 'not-green-2';
      final sg = _sg(Brightness.light);
      expect(sg.accents, isNull);
      expect({sg.brand, sg.pick, sg.tray, sg.bar, sg.badge}.length, 1);
      expect(sg.busInk('14'), sg.ink);
      expect(sg.heading, sg.muted);
      expect(sg.slice(1), isNull);
    });

    test('Material You on the phone’s colours is untouched', () {
      AppLook.I.materialYou = true;
      expect(_sg(Brightness.light).accents, isNull);
    });
  });

  group('in Material You', () {
    test('picked under Colours, in the pink and the violet', () {
      AppLook.I.materialYou = true;
      expect(AppLook.I.youColours, 'phone');
      AppLook.I.youColours = AppLook.gta6;
      expect(AppLook.I.youColours, AppLook.gta6);
      expect(AppLook.I.theme(Brightness.dark).colorScheme.surface, const Color(0xFF1D0030));
    });

    test('back to the phone clears it, and it stays theirs', () {
      AppLook.I.youColours = AppLook.gta6;
      AppLook.I.youColours = 'phone';
      expect(Store.I.get(AppLook.youColoursKey), isNull);
      expect(Gta6.owned, isTrue);
    });

    test('Your colours, picked and then removed, fall back to the phone', () {
      Store.I.put(AppLook.youColoursKey, 'yours');
      expect(AppLook.I.youColours, 'phone');
    });
  });

  group('kept if set before 26 November', () {
    test('the last minute of the 25th in Singapore is in time, and midnight is not', () {
      expect(Gta6.open, isTrue);
      When.now = () => _after;
      expect(Gta6.open, isFalse);
      expect(Gta6.until, DateTime.parse('2026-11-26T00:00:00+08:00').millisecondsSinceEpoch);
    });

    test('set once in time, it can be set again long after', () {
      AppLook.I.swatchId = AppLook.gta6;
      AppLook.I.swatchId = 'classic';
      When.now = () => DateTime.utc(2030);
      expect(Gta6.owned, isTrue);
      AppLook.I.swatchId = AppLook.gta6;
      expect(AppLook.I.swatchId, AppLook.gta6);
    });

    test('still showing after the day, it stays', () {
      AppLook.I.swatchId = AppLook.gta6;
      When.now = () => _after;
      expect(AppLook.I.swatchId, AppLook.gta6);
    });

    test('never set in time, it can’t be set, as a brand colour or in Material You', () {
      When.now = () => _after;
      AppLook.I.swatchId = AppLook.gta6;
      expect(AppLook.I.swatchId, 'classic');
      AppLook.I.youColours = AppLook.gta6;
      expect(AppLook.I.youColours, 'phone');
      expect(Gta6.owned, isFalse);
      expect(Gta6.due, isTrue);
    });

    test('brought by Sync onto a phone without it, afterwards: Classic', () {
      When.now = () => _after;
      Store.I.put(AppLook.colorKey, AppLook.gta6);
      expect(AppLook.I.swatchId, 'classic');
    });
  });

  group('or won on the wheel', () {
    ({int index, int? coins, String? egg, ({List<String> secrets, EggPreset? preset})? got, bool gta6}) spinToEggSlice() {
      Coins.setBalance(100000);
      for (var i = 0; i < 2000; i++) {
        final r = Coins.spin()!;
        if (r.coins == null) return r;
      }
      fail('never landed on the egg slice');
    }

    test('in time, the wheel has nothing to do with it', () {
      expect(Gta6.due, isFalse);
      final r = spinToEggSlice();
      expect(r.gta6, isFalse);
      expect(r.egg, isNotNull);
      expect(Gta6.owned, isFalse);
    });

    test('afterwards, the egg slice gives it first, then eggs again', () {
      When.now = () => _after;
      final won = spinToEggSlice();
      expect(won.gta6, isTrue);
      expect(won.egg, isNull);
      expect(Feats.eggs(), isEmpty);
      expect(Gta6.owned, isTrue);
      expect(Gta6.due, isFalse);
      AppLook.I.swatchId = AppLook.gta6;
      expect(AppLook.I.swatchId, AppLook.gta6);
      expect(spinToEggSlice().egg, isNotNull);
    });

    test('with every egg found, the slice stays its prize until it’s won, then goes to coins', () {
      Store.I.putJson('sgbus_eggs', {for (final id in Feats.ids) id: 1});
      expect(Coins.slotNow(0), Coins.eggGoneCoins, reason: 'in time: coins, as ever');
      When.now = () => _after;
      expect(Coins.slotNow(0), isNull);
      expect(spinToEggSlice().gta6, isTrue);
      expect(Coins.slotNow(0), Coins.eggGoneCoins);
    });

    test('already theirs: it never comes up', () {
      Gta6.claim('set');
      When.now = () => _after;
      expect(spinToEggSlice().gta6, isFalse);
    });
  });

  group('offered once', () {
    test('until it’s offered, it’s theirs, or the day’s gone', () {
      expect(Gta6Offer.due, isTrue);
      Store.I.put(Gta6.offerKey, '1');
      expect(Gta6Offer.due, isFalse);
      Store.memory();
      Gta6.claim('set');
      expect(Gta6Offer.due, isFalse);
      Store.memory();
      When.now = () => _after;
      expect(Gta6Offer.due, isFalse);
    });

    test('not over first open’s choice', () {
      Store.I.put('sgbus_first_run', 'ask');
      expect(Gta6Offer.quiet(), isFalse);
    });

    test('Set it, in Material You: its choice, and Your colours kept', () {
      AppLook.I.materialYou = true;
      Store.I.putJson(AppLook.coloursKey, {'kind': 'base', 'base': '#123456'});
      Gta6Offer.set();
      expect(AppLook.I.youColours, AppLook.gta6);
      expect(AppLook.I.yourColours, isNotNull);
      expect(Gta6.owned, isTrue);
    });

    test('Set it, in the UwU Apps theme: its brand colour, in place of Your colours', () {
      AppLook.I.materialYou = false;
      Store.I.putJson(AppLook.coloursKey, {'kind': 'base', 'base': '#123456'});
      Gta6Offer.set();
      expect(AppLook.I.swatchId, AppLook.gta6);
      expect(AppLook.I.yourColours, isNull);
      expect(AppLook.I.isGta6, isTrue);
    });

    testWidgets('the window says what happens to Your colours only when it would', (t) async {
      AppLook.I.materialYou = false;
      Future<void> show() => t.pumpWidget(MaterialApp(key: UniqueKey(), theme: AppLook.I.theme(Brightness.light), home: const Scaffold(body: Gta6Window())));
      await show();
      expect(find.textContaining('This replaces Your colours'), findsNothing);
      expect(find.text('Set it'), findsOneWidget);
      expect(find.text('Not now'), findsOneWidget);
      Store.I.putJson(AppLook.coloursKey, {'kind': 'base', 'base': '#123456'});
      await show();
      expect(find.textContaining('This replaces Your colours'), findsOneWidget);
    });
  });

  group('Theme', () {
    Future<void> screen(WidgetTester t) async {
      t.view.physicalSize = const Size(412, 892) * 3;
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(key: UniqueKey(), theme: AppLook.I.theme(Brightness.light), home: const ThemeScreen()));
      await t.pump();
    }

    testWidgets('offers it in both looks, and says to set it in time', (t) async {
      AppLook.I.materialYou = true;
      await screen(t);
      expect(find.textContaining('before 26 November'), findsOneWidget);
      await t.tap(find.text('GTA VI'));
      await t.pump();
      expect(AppLook.I.youColours, AppLook.gta6);
      expect(find.textContaining('before 26 November'), findsNothing, reason: 'it’s theirs now');
    });

    testWidgets('as a swatch', (t) async {
      AppLook.I.materialYou = false;
      await screen(t);
      await t.tap(find.byTooltip('GTA VI'));
      await t.pump();
      expect(AppLook.I.swatchId, AppLook.gta6);
    });

    testWidgets('locked: no choice in Material You, and where to win it', (t) async {
      When.now = () => _after;
      AppLook.I.materialYou = true;
      await screen(t);
      expect(find.text('GTA VI'), findsNothing);
      expect(find.textContaining('uwuCoins wheel'), findsOneWidget);
    });

    testWidgets('locked swatch: padlocked, and gone with uwuCoins hidden', (t) async {
      When.now = () => _after;
      AppLook.I.materialYou = false;
      await screen(t);
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
      Coins.shown = false;
      await screen(t);
      expect(find.byTooltip('GTA VI'), findsNothing);
      expect(find.textContaining('uwuCoins wheel'), findsNothing);
    });
  });
}
