// Train times' colours (features/timings/trains_screen.dart, the map card and Navigate's rides)
// meet WCAG 2.2 AA in every look the apps have: Material You, the UwU Apps theme with each of its
// colours, and the desktop's Fluent, Tahoe and frosted looks; light and dark; with High contrast
// and without. Writing 4.5:1 on what it's on (1.4.3): the last trains' red and the quieter grey
// on a card and on the map's bubble, the changed trains' orange on a card (the only place it's
// writing); and the white marks on the last three's red chips and the running trains' green ones.
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/timings/trains_screen.dart';
import 'package:sgbus_timings/theme/colours.dart';
import 'package:sgbus_timings/theme/theme.dart';

double _ratio(Color ink, Color on) => Colours.contrast(hexOf(ink), hexOf(on));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() {
    AppLook.I.deskStyle = null;
    AppLook.I.deskLook = false;
  });

  // Every look, as (what it's called, how to set it).
  final looks = <(String, void Function())>[
    ('Material You', () => Store.memory({Gta6.key: '{"at":1,"how":"set"}'})),
    for (final s in AppLook.swatches)
      ('the UwU Apps theme in ${s.id}', () => Store.memory({AppLook.lookKey: 'usual', AppLook.colorKey: s.id, Gta6.key: '{"at":1,"how":"set"}'})),
    for (final d in DeskStyle.values)
      ('the desktop\'s ${d.name}', () {
        Store.memory({Gta6.key: '{"at":1,"how":"set"}'});
        AppLook.I.deskStyle = d;
        AppLook.I.deskLook = true;
      }),
  ];

  for (final (name, set) in looks) {
    for (final b in Brightness.values) {
      for (final contrast in [false, true]) {
        test('$name, ${b.name}${contrast ? ', high contrast' : ''}', () {
          set();
          final t = AppLook.I.theme(b, contrast: contrast);
          final sg = t.extension<SgColors>()!;
          final card = cardColour(t);
          final bubble = Color.alphaBlend(sg.surfaceStrong, sg.bg);
          for (final (what, on) in [('a card', card), ('the map\'s bubble', bubble)]) {
            expect(_ratio(lastRedOn(on), on), greaterThanOrEqualTo(Colours.aa), reason: 'the last trains\' red on $what (${hexOf(on)})');
            expect(_ratio(sg.muted, on), greaterThanOrEqualTo(Colours.aa), reason: 'the grey on $what (${hexOf(on)})');
          }
          // A changed train's orange is writing on a card only: on the map's bubble it's a chip's
          // edge, its words white on the chip.
          expect(_ratio(sg.warn, card), greaterThanOrEqualTo(Colours.aa), reason: 'a changed train\'s orange on a card (${hexOf(card)})');
          // The chips' and marks' white, on their own colours whatever the theme.
          expect(_ratio(Colors.white, lastRed), greaterThanOrEqualTo(Colours.aa));
          expect(_ratio(Colors.white, const Color(0xFF15803D)), greaterThanOrEqualTo(Colours.aa));
        });
      }
    }
  }
}
