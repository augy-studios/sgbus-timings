// The desktop app's look (theme/theme.dart, desktop/desk_theme.dart): with "Use system accent
// colour" on, the computer's accent colour stands in for the brand colour, with writing that
// reads on it, over the site's own neutral background; Your colours still come first; and with it
// off (always, on Android) nothing changes. The desktop's controls are compact. And the title
// bar's writing (BarColours) reads at WCAG AA (4.5:1) on every bar colour there can be.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/theme/colours.dart';
import 'package:sgbus_timings/theme/theme.dart';

void main() {
  /// A colour as Colours' "#rrggbb".
  String hex(Color c) => hexOf(c);

  setUp(() {
    Store.memory({AppLook.lookKey: 'usual'});
    AppLook.I.accentOverride = null;
    AppLook.I.compact = false;
  });
  tearDown(() {
    AppLook.I.accentOverride = null;
    AppLook.I.compact = false;
  });

  test('without an accent colour, the brand colour is the swatch, as on Android', () {
    final sg = AppLook.I.theme(Brightness.light).extension<SgColors>()!;
    expect(sg.brand, const Color(0xFFCCFFCC));
  });

  for (final b in Brightness.values) {
    test('a blue accent colour is the brand colour, readable, in ${b.name}', () {
      final plain = AppLook.I.theme(b).extension<SgColors>()!;
      AppLook.I.accentOverride = const Color(0xFF007AFF);
      final sg = AppLook.I.theme(b).extension<SgColors>()!;
      expect(sg.brand, isNot(const Color(0xFFCCFFCC)));
      expect(Colours.contrast(hex(sg.onBrand), hex(sg.brand)), greaterThanOrEqualTo(Colours.aa), reason: 'the writing on the bar reads');
      expect(sg.bg, plain.bg, reason: "the site's own background stays");
      expect(sg.ink, plain.ink);
    });
  }

  test('GTA VI gives way to the accent colour', () {
    Store.I.put(AppLook.colorKey, AppLook.gta6);
    AppLook.I.accentOverride = const Color(0xFF007AFF);
    expect(AppLook.I.isGta6, isFalse);
  });

  test('Your colours come before the accent colour', () {
    Store.I.putJson(AppLook.coloursKey, Colours.keep('#ff8800', null));
    AppLook.I.accentOverride = const Color(0xFF007AFF);
    expect(AppLook.I.brand, const Color(0xFFFF8800));
  });

  test("the desktop's controls are compact, a phone's aren't", () {
    expect(AppLook.I.theme(Brightness.light).visualDensity, VisualDensity.standard);
    AppLook.I.compact = true;
    expect(AppLook.I.theme(Brightness.light).visualDensity, VisualDensity.compact);
    expect(AppLook.I.theme(Brightness.dark).visualDensity, VisualDensity.compact);
  });

  group("the title bar's writing reads", () {
    /// Checks the bar's writing against the bar, and against the command bar's field over it;
    /// a button's hover tint keeps an icon's 3:1.
    void reads(String what) {
      AppLook.I.compact = true; // the desktop's
      for (final b in Brightness.values) {
        for (final contrast in [false, true]) {
          final bar = BarColours.of(AppLook.I.theme(b, contrast: contrast).extension<SgColors>()!);
          final where = '$what, ${b.name}${contrast ? ', high contrast' : ''}';
          expect(Colours.contrast(hex(bar.fg), hex(bar.background)), greaterThanOrEqualTo(Colours.aa), reason: '$where: on the bar');
          expect(Colours.contrast(hex(bar.fg), hex(Color.alphaBlend(bar.field, bar.background))), greaterThanOrEqualTo(Colours.aa), reason: '$where: on the field');
          expect(Colours.contrast(hex(bar.fg), hex(Color.alphaBlend(bar.hover, bar.background))), greaterThanOrEqualTo(3.0), reason: '$where: under the pointer');
        }
      }
    }

    // macOS's accents (blue, purple, pink, red, orange, yellow, green, graphite), Windows' blue,
    // and the extremes.
    const accents = [0xFF007AFF, 0xFFAF52DE, 0xFFFF2D55, 0xFFFF3B30, 0xFFFF9500, 0xFFFFCC00, 0xFF34C759, 0xFF8E8E93, 0xFF0078D4, 0xFF000000, 0xFFFFFFFF];
    for (final a in accents) {
      test('on the accent colour ${a.toRadixString(16)}', () {
        AppLook.I.accentOverride = Color(a);
        reads('accent ${a.toRadixString(16)}');
      });
    }

    for (final swatch in AppLook.swatches) {
      test('on the ${swatch.id} brand colour', () {
        // GTA VI as someone who set it in time has it, whatever today's date.
        Store.memory({AppLook.lookKey: 'usual', AppLook.colorKey: swatch.id, Gta6.key: '{"at":1,"how":"set"}'});
        reads(swatch.id);
      });
    }

    test('in Material You', () {
      AppLook.I.materialYou = true;
      reads('Material You');
    });

    test('on a dark colour of your own', () {
      Store.I.putJson(AppLook.coloursKey, Colours.keep('#1b2a80', null));
      reads('your colours');
    });

    test("Android's high contrast keeps black on the brand colour", () {
      Store.I.putJson(AppLook.coloursKey, Colours.keep('#1b2a80', null));
      final sg = AppLook.I.theme(Brightness.light, contrast: true).extension<SgColors>()!;
      expect(sg.onBrand, Colors.black);
    });
  });
}
