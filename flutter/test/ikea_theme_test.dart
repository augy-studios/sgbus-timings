// The IKEA shuttle's colours: an event as GTA VI's is (gta6_theme_test.dart), open until the end of
// 31 December 2026 in Singapore, then only the wheel's to give, after GTA VI's.
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/gta6.dart';
import 'package:sgbus_timings/data/rewards.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/misc/extras.dart';
import 'package:sgbus_timings/theme/colours.dart';
import 'package:sgbus_timings/theme/theme.dart';

final _now = DateTime.utc(2026, 11, 27, 4);
final _lastMinute = DateTime.utc(2026, 12, 31, 15, 59);
final _after = DateTime.utc(2026, 12, 31, 16);

int? _eggSlice() {
  Coins.setBalance(100000);
  for (var i = 0; i < 2000; i++) {
    final r = Coins.spin()!;
    if (r.coins == null) return r.event == null ? null : EventColours.byId(r.event!)!.list;
  }
  fail('never landed on the egg slice');
}

extension on EventColour {
  int get list => EventColours.list.indexOf(this);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    Store.memory();
    When.now = () => _now;
    AppLook.I.materialYou = false;
  });
  tearDown(() => When.now = DateTime.now);

  test('open until the last minute of 31 December in Singapore', () {
    expect(Ikea.open, isTrue);
    When.now = () => _lastMinute;
    expect(Ikea.open, isTrue);
    When.now = () => _after;
    expect(Ikea.open, isFalse);
    expect(Ikea.event.until, DateTime.parse('2027-01-01T00:00:00+08:00').millisecondsSinceEpoch);
  });

  test('set in time, it’s theirs for good', () {
    AppLook.I.swatchId = AppLook.ikea;
    expect(Ikea.owned, isTrue);
    AppLook.I.swatchId = 'classic';
    When.now = () => DateTime.utc(2030);
    AppLook.I.swatchId = AppLook.ikea;
    expect(AppLook.I.swatchId, AppLook.ikea);
  });

  test('never set in time: locked, as a brand colour or in Material You', () {
    When.now = () => _after;
    AppLook.I.swatchId = AppLook.ikea;
    expect(AppLook.I.swatchId, 'classic');
    AppLook.I.youColours = AppLook.ikea;
    expect(AppLook.I.youColours, 'phone');
    expect(Ikea.due, isTrue);
  });

  test('the wheel gives GTA VI’s first, then the IKEA shuttle’s, then eggs', () {
    When.now = () => _after;
    expect(_eggSlice(), 0, reason: 'GTA VI’s');
    expect(_eggSlice(), 1, reason: 'the IKEA shuttle’s');
    expect(Ikea.owned, isTrue);
    expect(_eggSlice(), isNull);
    final log = Coins.log.where((e) => e['n'] == 0).map((e) => e['why']).toList();
    expect(log.take(3), ['egg', 'ikea', 'gta6']);
  });

  test('in December, with GTA VI’s gone but the IKEA shuttle’s still open: only GTA VI’s on the wheel', () {
    When.now = () => DateTime.utc(2026, 12, 20);
    expect(_eggSlice(), 0);
    expect(_eggSlice(), isNull);
    expect(Ikea.owned, isFalse);
  });

  test('a bot’s egg link gives it too, once it’s due', () {
    Gta6.claim('set');
    When.now = () => _after;
    expect(Coins.eggLinkPrize().event, 'ikea');
    expect(Ikea.owned, isTrue);
  });

  test('both count as event colours', () {
    expect(EventColours.all, [AppLook.gta6, AppLook.ikea]);
    EventOffer.ikea.set();
    expect(EventColours.found(), [AppLook.ikea]);
  });

  test('offered once, while it’s open and not theirs', () {
    expect(EventOffer.ikea.due, isTrue);
    Store.I.put(Ikea.event.offerKey, '1');
    expect(EventOffer.ikea.due, isFalse);
    Store.memory();
    When.now = () => _after;
    expect(EventOffer.ikea.due, isFalse);
  });

  test('Set it, in Material You: its choice, in IKEA’s blue', () {
    AppLook.I.materialYou = true;
    EventOffer.ikea.set();
    expect(AppLook.I.youColours, AppLook.ikea);
    expect(AppLook.I.isIkea, isTrue);
    final scheme = AppLook.I.theme(Brightness.light).colorScheme;
    expect(scheme.secondaryContainer, const Color(0xFFFFDB00));
  });

  for (final b in Brightness.values) {
    test('reads clearly in $b', () {
      AppLook.I.swatchId = AppLook.ikea;
      final t = AppLook.I.theme(b);
      final sg = t.extension<SgColors>()!;
      String hex(Color c) => hexOf(Color.alphaBlend(c, sg.bg));
      expect(Colours.contrast(hex(sg.ink), hexOf(sg.bg)), greaterThanOrEqualTo(Colours.aa));
      expect(Colours.contrast(hex(sg.muted), hexOf(sg.bg)), greaterThanOrEqualTo(Colours.aa));
      expect(Colours.contrast(hex(sg.brandInk), hexOf(sg.bg)), greaterThanOrEqualTo(Colours.aa));
      expect(Colours.contrast(hexOf(sg.onBrand), hexOf(sg.brand)), greaterThanOrEqualTo(Colours.aa));
      final button = t.filledButtonTheme.style!;
      expect(Colours.contrast(hexOf(button.foregroundColor!.resolve({})!), hexOf(button.backgroundColor!.resolve({})!)), greaterThanOrEqualTo(Colours.aa));
    });
  }
}
