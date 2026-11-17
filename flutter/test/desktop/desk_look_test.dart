// The computer's own look, which the desktop offers in Material You's place (theme/theme.dart's
// DeskStyle, desktop/desk_theme.dart): Fluent 2 on Windows, macOS Tahoe, and Deepin's and COSMIC's
// frosted glass on Linux. Its page is see-through for the window's Mica or vibrancy, solid in high
// contrast; Fluent's title bar is plain white in light and plain black in dark; every look's
// writing reads at WCAG AA; its colours are the computer's accent, or GTA VI's or Your colours as
// Material You has them; and Theme shows its switch in Material You's place.
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/desktop/desk_theme.dart';
import 'package:sgbus_timings/desktop/settings.dart';
import 'package:sgbus_timings/features/settings/theme_screen.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
import 'package:sgbus_timings/theme/colours.dart';
import 'package:sgbus_timings/theme/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    Store.memory({Gta6.key: '{"at":1,"how":"set"}'});
    AppLook.I.deskStyle = DeskStyle.fluent;
    AppLook.I.deskLook = true;
    AppLook.I.deskAccent = null;
  });
  tearDown(() {
    AppLook.I.deskStyle = null;
    AppLook.I.deskLook = false;
    AppLook.I.deskAccent = null;
  });

  test('on the desktop Material You is never on; the computer\'s own look takes its place', () {
    expect(AppLook.I.materialYou, isFalse, reason: 'nothing saved would mean Material You on Android');
    expect(AppLook.I.desk, DeskStyle.fluent);
    AppLook.I.deskLook = false;
    expect(AppLook.I.desk, isNull);
    expect(AppLook.I.materialYou, isFalse);
    AppLook.I.deskStyle = null;
    expect(AppLook.I.materialYou, isTrue, reason: 'Android as it was');
  });

  for (final style in DeskStyle.values) {
    for (final b in Brightness.values) {
      test('${style.name} in ${b.name}: see-through, readable, its own corners', () {
        AppLook.I.deskStyle = style;
        final t = AppLook.I.theme(b);
        final sg = t.extension<SgColors>()!;
        expect(t.scaffoldBackgroundColor.a, 0, reason: "the window's effect shows through");
        final card = Color.alphaBlend(sg.surface, sg.bg);
        for (final (name, c) in [('writing', sg.ink), ('quieter writing', sg.muted), ('links', sg.brandInk)]) {
          expect(Colours.contrast(hexOf(c), hexOf(sg.bg)), greaterThanOrEqualTo(Colours.aa), reason: '$name on the background');
          expect(Colours.contrast(hexOf(c), hexOf(card)), greaterThanOrEqualTo(Colours.aa), reason: '$name on a card');
        }
        expect(Colours.contrast(hexOf(sg.onBrand), hexOf(sg.brand)), greaterThanOrEqualTo(Colours.aa), reason: 'writing on a button');
        expect(sg.glass, style != DeskStyle.fluent, reason: "Fluent's cards sit on Mica; the others blur");
        expect(AppLook.I.cardRadius, style.card);
      });

      test('${style.name} in ${b.name}, high contrast: solid', () {
        AppLook.I.deskStyle = style;
        final t = AppLook.I.theme(b, contrast: true);
        final sg = t.extension<SgColors>()!;
        expect(t.scaffoldBackgroundColor.a, 1);
        expect(sg.glass, isFalse);
        expect(Colours.contrast(hexOf(sg.ink), hexOf(sg.bg)), greaterThanOrEqualTo(7));
      });
    }
  }

  test("Fluent 2's title bar is plain white in light and plain black in dark, in every case", () {
    for (final contrast in [false, true]) {
      final light = AppLook.I.deskBar(Brightness.light, contrast: contrast)!;
      final dark = AppLook.I.deskBar(Brightness.dark, contrast: contrast)!;
      expect(light.background, Colors.white);
      expect(dark.background, Colors.black);
      expect(Colours.contrast(hexOf(light.fg), '#ffffff'), greaterThanOrEqualTo(Colours.aa));
      expect(Colours.contrast(hexOf(dark.fg), '#000000'), greaterThanOrEqualTo(Colours.aa));
    }
  });

  test("Tahoe's title bar is the window's own glass; the other looks keep the brand colour's", () {
    AppLook.I.deskStyle = DeskStyle.tahoe;
    expect(AppLook.I.deskBar(Brightness.light)!.background, Colors.transparent);
    AppLook.I.deskLook = false;
    expect(AppLook.I.deskBar(Brightness.light), isNull);
  });

  test("Fluent's pills are 4 px rectangles, Tahoe's and the frosted look's capsules", () {
    expect(AppLook.I.pillShape(), isA<RoundedRectangleBorder>());
    AppLook.I.deskStyle = DeskStyle.tahoe;
    expect(AppLook.I.pillShape(), isA<StadiumBorder>());
    AppLook.I.deskStyle = DeskStyle.frosted;
    expect(AppLook.I.pillShape(), isA<StadiumBorder>());
  });

  test("its colour: the computer's accent, else the look's own, and GTA VI's or Your colours when picked", () {
    Color brand() => AppLook.I.theme(Brightness.light).extension<SgColors>()!.brand;
    final own = brand();
    AppLook.I.deskAccent = const Color(0xFF8E44AD);
    expect(brand(), isNot(own));
    AppLook.I.youColours = AppLook.gta6;
    expect(AppLook.I.isGta6, isTrue);
    Store.I.putJson(AppLook.coloursKey, Colours.keep('#ff8800', null));
    AppLook.I.youColours = 'yours';
    expect(AppLook.I.isGta6, isFalse);
    expect(HSLColor.fromColor(brand()).hue, closeTo(HSLColor.fromColor(const Color(0xFFFF8800)).hue, 6));
  });

  group('Theme', () {
    late Directory dir;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('sgbus-look');
      DeskSettings.override = dir.path;
      Native.fake(['desktop'], (_, _, _) async => <String, dynamic>{});
      DeskTheme.look.value = true;
    });
    tearDown(() {
      DeskSettings.override = null;
      Native.fake(const [], null);
      DeskTheme.look.value = false;
      dir.deleteSync(recursive: true);
    });

    testWidgets("the computer's own look in Material You's place, and its switch kept", (t) async {
      t.view.physicalSize = const Size(900, 1400);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(theme: AppLook.I.theme(Brightness.light), home: const ThemeScreen()));
      expect(find.text('Fluent 2 (Acrylic & Mica)'), findsOneWidget);
      expect(find.text('Material You'), findsNothing);
      expect(find.text('Use system accent colour'), findsNothing, reason: 'the look has the accent colour already');
      expect(find.text("Your computer's"), findsOneWidget, reason: 'its colours, as Material You has them');
      await t.tap(find.text('Fluent 2 (Acrylic & Mica)'));
      await t.pump();
      expect(DeskSettings.get<bool>(DeskTheme.lookKey), isFalse);
      expect(AppLook.I.deskLook, isFalse);
      await t.pump();
      expect(find.text('Use system accent colour'), findsOneWidget);
    });
  });
}
