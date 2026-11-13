import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/settings/settings_find.dart';
import 'package:sgbus_timings/features/trips/trips_page.dart';

void main() {
  setUp(() => Store.memory({}));

  group('Your trips', () {
    test('a week starts on Monday, in Singapore', () {
      // Sunday 8 November 2026, 23:30 in Singapore.
      final sunday = DateTime.parse('2026-11-08T23:30:00+08:00').millisecondsSinceEpoch;
      final monday = DateTime.parse('2026-11-02T00:00:00+08:00').millisecondsSinceEpoch;
      expect(TripsPage.weekStart(sunday), monday);
      // Monday 00:30 in Singapore is still Sunday in UTC, and starts a new week.
      final next = DateTime.parse('2026-11-09T00:30:00+08:00').millisecondsSinceEpoch;
      expect(TripsPage.weekStart(next), DateTime.parse('2026-11-09T00:00:00+08:00').millisecondsSinceEpoch);
    });

    test('rides count by operator and by MRT or LRT, most first', () {
      final modes = TripsPage.modes([
        {
          'legs': [
            {'kind': 'bus', 'op': 'SBST'},
            {'kind': 'train', 'lrt': false},
            {'kind': 'bus', 'op': 'SBST'},
          ],
        },
        {
          'legs': [
            {'kind': 'train', 'lrt': true},
          ],
        },
      ]);
      expect(modes.first.key, 'SBS Transit');
      expect(modes.first.value, 2);
      expect(modes.map((m) => m.key), containsAll(['MRT', 'LRT']));
    });
  });

  group('Find a setting', () {
    String group(String id) => id;

    test('by its name or the words kept with it', () {
      expect(SettingsFind.find('morse', group).map((s) => s.label()), contains('Get Off Alert on a trip'));
      expect(SettingsFind.find('Birthday', group).map((s) => s.label()), contains('Birthday confetti'));
      expect(SettingsFind.find('bahasa', group).map((s) => s.label()), contains('Language'));
    });

    test('every word typed must be there, and nothing typed lists nothing', () {
      expect(SettingsFind.find('', group), isEmpty);
      expect(SettingsFind.find('morse tamil', group), isEmpty);
      expect(SettingsFind.find('zzzz', group), isEmpty);
    });
  });
}
