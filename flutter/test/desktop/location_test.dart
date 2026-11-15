// Location on Linux where the system can't give it (lib/desktop/location.dart,
// desktop-features-spec §12): nmcli's Wi-Fi listing read as BeaconDB takes it (no "_nomap"
// networks, each once, strongest 40, signal as dBm), and nothing rougher than 3 km accepted.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/location.dart';

void main() {
  group("nmcli's terse output", () {
    test('fields split on ":", with "\\:" kept as a colon', () {
      expect(DeskLocation.fields(r'Home:AA\:BB\:CC\:DD\:EE\:FF:70:2437 MHz'), ['Home', 'AA:BB:CC:DD:EE:FF', '70', '2437 MHz']);
      expect(DeskLocation.fields(r'Cafe\: Free:11\:22\:33\:44\:55\:66:40:5180 MHz'), ['Cafe: Free', '11:22:33:44:55:66', '40', '5180 MHz']);
      expect(DeskLocation.fields(r':AA\:BB\:CC\:DD\:EE\:FF:50:'), ['', 'AA:BB:CC:DD:EE:FF', '50', '']);
    });

    test('networks as BeaconDB takes them, strongest first', () {
      const listing = 'Home:AA\\:BB\\:CC\\:DD\\:EE\\:FF:70:2437 MHz\n'
          'Shop:11\\:22\\:33\\:44\\:55\\:66:90:5180 MHz\n'
          ':77\\:88\\:99\\:AA\\:BB\\:CC:20:\n';
      expect(DeskLocation.parse(listing), [
        {'macAddress': '11:22:33:44:55:66', 'signalStrength': -55, 'frequency': 5180},
        {'macAddress': 'aa:bb:cc:dd:ee:ff', 'signalStrength': -65, 'frequency': 2437},
        {'macAddress': '77:88:99:aa:bb:cc', 'signalStrength': -90},
      ]);
    });

    test('a "_nomap" network, a repeat, a bad address and a short line are left out', () {
      const listing = 'Private_nomap:AA\\:BB\\:CC\\:DD\\:EE\\:01:90:2437 MHz\n'
          'PRIVATE_NOMAP:AA\\:BB\\:CC\\:DD\\:EE\\:02:90:2437 MHz\n'
          'Home:AA\\:BB\\:CC\\:DD\\:EE\\:03:70:2437 MHz\n'
          'Home again:aa\\:bb\\:cc\\:dd\\:ee\\:03:60:2437 MHz\n'
          'Broken:not-an-address:70:2437 MHz\n'
          'Short:AA\\:BB\n'
          '\n';
      final aps = DeskLocation.parse(listing);
      expect(aps.map((a) => a['macAddress']), ['aa:bb:cc:dd:ee:03']);
      expect(aps.single['signalStrength'], -65);
    });

    test('no more than the strongest 40', () {
      String hex(int n) => n.toRadixString(16).padLeft(2, '0');
      final listing = [for (var i = 0; i < 50; i++) 'N$i:AA\\:BB\\:CC\\:DD\\:EE\\:${hex(i)}:${i * 2}:2437 MHz'].join('\n');
      final aps = DeskLocation.parse(listing);
      expect(aps, hasLength(DeskLocation.maxNetworks));
      expect(aps.first['macAddress'], 'aa:bb:cc:dd:ee:${hex(49)}');
      expect(aps.last['macAddress'], 'aa:bb:cc:dd:ee:${hex(10)}');
    });

    test("signal 0 to 100 as dBm, rounded as the Electron app's JavaScript did", () {
      expect(DeskLocation.dbm(0), -100);
      expect(DeskLocation.dbm(100), -50);
      expect(DeskLocation.dbm(51), -74);
      expect(DeskLocation.dbm(49), -75);
    });
  });

  group("BeaconDB's answer", () {
    test('within 3 km: a fix', () {
      final fix = DeskLocation.fixFrom({'location': {'lat': 1.3245, 'lng': 103.9302}, 'accuracy': 42});
      expect(fix?.lat, 1.3245);
      expect(fix?.lng, 103.9302);
      expect(fix?.accuracy, 42);
      expect(DeskLocation.fixFrom({'location': {'lat': 1, 'lng': 103}, 'accuracy': 3000}), isNotNull);
    });

    test('rougher than 3 km (a guess from the internet address): no fix', () {
      expect(DeskLocation.fixFrom({'location': {'lat': 1.3, 'lng': 103.8}, 'accuracy': 3001}), isNull);
      expect(DeskLocation.fixFrom({'location': {'lat': 1.3, 'lng': 103.8}, 'accuracy': 25000}), isNull);
    });

    test('anything missing or not an answer: no fix', () {
      expect(DeskLocation.fixFrom(null), isNull);
      expect(DeskLocation.fixFrom('nope'), isNull);
      expect(DeskLocation.fixFrom({'location': {'lat': 1.3}, 'accuracy': 10}), isNull);
      expect(DeskLocation.fixFrom({'location': {'lat': 1.3, 'lng': 103.8}}), isNull);
      expect(DeskLocation.fixFrom({'error': {'code': 404, 'message': 'Not found'}}), isNull);
    });
  });
}
