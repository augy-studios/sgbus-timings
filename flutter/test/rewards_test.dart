// Rides, feats and uwuCoins, by the site's rules (js/rides.js, js/eggs.js, js/coins.js).
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/rewards.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';

void main() {
  late int now;
  setUp(() {
    Store.memory({});
    now = DateTime.utc(2026, 11, 5, 1).millisecondsSinceEpoch;
    When.now = () => DateTime.fromMillisecondsSinceEpoch(now, isUtc: true);
  });

  // The East-West Line from Bedok to Tanah Merah, 4 minutes.
  final train = {
    'kind': 'train', 'route': 'EW', 'label': 'EW', 'minutes': 4,
    'points': [[1.323935, 103.929995], [1.327262, 103.946513]],
  };

  test('a ride seen at both ends, in about its time, is real, and earns the trip its coins', () {
    final seen = <String, dynamic>{'fixes': 0, 'startAt': null, 'endAt': null, 'along': <int>[]};
    RideCheck.see(train, seen, [1.3240, 103.9300], 20);
    now += 4 * 60000;
    RideCheck.see(train, seen, [1.3272, 103.9465], 20);
    expect(RideCheck.verdict(train, seen).ok, isTrue);
    expect(RideCheck.done(train, seen, 't1'), isTrue);
    expect(RideCheck.progress().done, ['EW']);
    // 5 to finish, 0 km coins (under 2 km), one train operator (4) and one line (2).
    final got = Coins.forTrip([train], [seen]);
    expect(got?.n, 11);
    Coins.tripDone('t1', [train], [seen]);
    expect(Coins.balance, 11);
    Coins.tripDone('t1', [train], [seen]);
    expect(Coins.balance, 11, reason: 'a trip earns its coins once');
  });

  test('a ride too quick for its time, or never seen at the end, is not', () {
    final quick = <String, dynamic>{'fixes': 0, 'along': <int>[]};
    RideCheck.see(train, quick, [1.3240, 103.9300], 20);
    now += 60000;
    RideCheck.see(train, quick, [1.3272, 103.9465], 20);
    expect(RideCheck.verdict(train, quick).why, 'too quick for the ride');
    final unseen = <String, dynamic>{'fixes': 0, 'along': <int>[]};
    RideCheck.see(train, unseen, [1.3240, 103.9300], 20);
    expect(RideCheck.verdict(train, unseen).why, 'never seen at the end');
  });

  test('every line ridden is a feat, worth 100 coins, said once', () {
    final said = <String>[];
    Rewards.I.onFeat = (id, {team}) => said.add(id);
    Store.I.putJson(RideCheck.key, {
      'lines': {for (final l in RideCheck.lines.where((l) => l != 'PG')) l: {'n': 1}},
      'buses': {},
      'trips': [],
    });
    final pg = {'kind': 'train', 'route': 'PE', 'minutes': 3, 'points': [[1.405255, 103.902354], [1.393876, 103.912643]]};
    final seen = <String, dynamic>{'fixes': 0, 'along': <int>[]};
    RideCheck.see(pg, seen, [1.405255, 103.902354], 10);
    now += 3 * 60000;
    RideCheck.see(pg, seen, [1.393876, 103.912643], 10);
    RideCheck.done(pg, seen, 't2');
    expect(Feats.done(), contains('lines'));
    expect(said, ['lines']);
    expect(Coins.balance, 100);
  });

  test('the wheel takes 100 a spin and always gives something', () {
    Coins.setBalance(300);
    for (var i = 0; i < 3; i++) {
      final r = Coins.spin();
      expect(r, isNotNull);
      expect(r!.coins != null || r.egg != null, isTrue);
    }
    expect(Coins.spins, 3);
  });
}
