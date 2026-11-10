// Tuas Checkpoint's stop (25269) says it's for vehicles only, with the Causeway Link buses to take
// instead (bug report 20261110-76MH), as the site's does (main-site/js/network.js, TUAS).
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/network.dart';

void main() {
  test('Tuas Checkpoint: a vehicle checkpoint, and where to cross instead', () {
    final b = BusNet.crossBorder('25269')!;
    expect(b.vehicles, isTrue);
    expect(b.abroad, isFalse);
    expect(b.label(), 'Vehicle checkpoint');
    for (final w in ['on foot', 'CW3', 'Jurong East', 'CW4', 'Boon Lay', 'CW7', 'Tuas Link']) {
      expect(b.note(), contains(w));
    }
    expect(b.short(), 'Vehicle checkpoint: no crossing on foot');
  });

  test('Woodlands Checkpoint still needs a passport', () {
    expect(BusNet.crossBorder('46101')!.short(), 'Immigration checkpoint: passport needed');
  });
}
