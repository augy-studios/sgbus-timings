// High contrast's writing on the brand colour (theme/theme.dart), in the Android app and the desktop
// app alike: black wherever black reads (4.5:1), as on every brand swatch and GTA VI, and white on
// a brand colour too dark for black, such as a dark colour of Your colours.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/theme/colours.dart';
import 'package:sgbus_timings/theme/theme.dart';

/// High contrast's colours in [b].
SgColors _contrast(Brightness b) => AppLook.I.theme(b, contrast: true).extension<SgColors>()!;

/// How well [ink] reads on [on] (WCAG's ratio, 1 to 21).
double _ratio(Color ink, Color on) => Colours.contrast(hexOf(ink), hexOf(on));

void main() {
  tearDown(() => AppLook.I.compact = false);

  for (final desktop in [false, true]) {
    final app = desktop ? 'the desktop app' : 'the Android app';
    group('in $app', () {
      setUp(() {
        Store.memory({AppLook.lookKey: 'usual'});
        // The desktop's compact controls are what told the two apart before.
        AppLook.I.compact = desktop;
      });

      for (final swatch in AppLook.swatches) {
        for (final b in Brightness.values) {
          test('black on the ${swatch.id} brand colour, ${b.name}', () {
            // GTA VI as someone who set it in time has it, whatever today's date.
            Store.memory({AppLook.lookKey: 'usual', AppLook.colorKey: swatch.id, Gta6.key: '{"at":1,"how":"set"}'});
            final sg = _contrast(b);
            expect(sg.onBrand, Colors.black);
            expect(_ratio(sg.onBrand, sg.brand), greaterThanOrEqualTo(Colours.aa));
          });
        }
      }

      for (final b in Brightness.values) {
        test('white on a dark colour of your own, ${b.name}', () {
          Store.I.putJson(AppLook.coloursKey, Colours.keep('#1b2a80', null));
          final sg = _contrast(b);
          expect(sg.onBrand, Colors.white);
          expect(_ratio(sg.onBrand, sg.brand), greaterThanOrEqualTo(Colours.aa));
        });

        test('black on a light colour of your own, ${b.name}', () {
          Store.I.putJson(AppLook.coloursKey, Colours.keep('#ff8800', null));
          expect(_contrast(b).onBrand, Colors.black);
        });
      }
    });
  }
}
