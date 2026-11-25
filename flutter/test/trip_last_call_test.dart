// The Get Off Alert's last call and the trip's end, as the site's js/trip.js has them: a stop before
// the end of a ride, "Ring the bell NOW" on a bus or "Get off at the next station" on a train,
// buzzing "NOW" in Morse code (TripPlugin.alert's kind "now"); and as you arrive, "Trip ended",
// buzzing "END" (kind "end"). The last call stands for the Get Off Alert on a short ride, and
// neither comes while you wait at the stop.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/location.dart';
import 'package:sgbus_timings/data/rewards.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';
import 'package:sgbus_timings/features/trips/trip.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

// Stops about 400 m apart along a straight road north.
final _pts = [for (var i = 0; i < 6; i++) [1.30 + i * 0.0036, 103.80]];
final _names = [for (var i = 0; i < 6; i++) 'S$i'];

TripLeg _bus(int stops) => TripLeg(kind: 'bus', label: 'Bus 65', to: 'S$stops', points: _pts.sublist(0, stops + 1), names: _names.sublist(0, stops + 1), minutes: 2.0 * stops);
TripLeg _train() => TripLeg(kind: 'train', label: 'DT Line', to: 'S5', points: _pts, names: _names, minutes: 10);

var _now = DateTime.utc(2026, 10, 30, 1);
void _later(int seconds) => _now = _now.add(Duration(seconds: seconds));

/// Each Trip.alert the app asked for, as [kind, title, body]: kind 'off' for the Get Off Alert.
final _alerts = <List<String>>[];

Future<void> _start(List<TripLeg> legs) async {
  Store.memory();
  _alerts.clear();
  Native.fake(const ['trip'], (plugin, method, options) async {
    if (plugin == 'Trip' && method == 'alert') _alerts.add(['${options?['kind'] ?? 'off'}', '${options?['title']}', '${options?['body']}']);
    return <String, dynamic>{};
  });
  Locate.fake = Fix(_pts[0][0], _pts[0][1]);
  _now = DateTime.utc(2026, 10, 30, 1);
  When.now = () => _now;
  Trip.I.paceState = null;
  await Trip.I.start(title: 'A trip', legs: legs);
}

void _at(int stop) => Trip.I.onFix(Fix(_pts[stop][0], _pts[stop][1], accuracy: 10));

List<String> get _kinds => [for (final a in _alerts) a[0]];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() {
    Trip.I.stop();
    Native.fake(const [], null);
    When.now = DateTime.now;
  });

  test('a bus: OFF two stops before, NOW a stop before, END as you arrive', () async {
    await _start([_bus(5)]);
    _at(0);
    for (final s in [1, 2, 3]) {
      _later(60);
      _at(s);
    }
    expect(_kinds, ['off']);
    _later(60);
    _at(4);
    expect(_kinds, ['off', 'now']);
    expect(_alerts.last.sublist(1), ['Ring the bell NOW', 'Next stop: S5.']);
    expect(Trip.I.nowAlerted, contains(0));
    _later(60);
    _at(5);
    expect(_kinds, ['off', 'now', 'end']);
    expect(_alerts.last[1], 'Trip ended');
    // Five stops of about 400 m, with the fare's allowance for bends: about 2.3 km, an adult
    // card fare's first band; and the coins it earned, its ride seen on the way.
    final lines = _alerts.last[2].split('\n');
    expect(lines.first, "You've arrived at S5.");
    expect(lines.last, matches(RegExp(r'^About S\$\d+\.\d\d in fares · 2\.\d km travelled · \d+ uwuCoins earned$')));
  });

  test("the trip's end leaves out what it hasn't: no coins while they're hidden", () async {
    await _start([_bus(5)]);
    Store.I.put(Coins.shownKey, 'off');
    _at(0);
    for (final s in [1, 2, 3, 4, 5]) {
      _later(60);
      _at(s);
    }
    expect(_alerts.last[2], isNot(contains('uwuCoins')));
    expect(_alerts.last[2], contains('in fares'));
  });

  test('a train, by the clock underground: Get off at the next station', () async {
    await _start([_train()]);
    // Ten minutes for five stations: two a station, with no fixes.
    _later(7 * 60);
    Trip.I.debugTick();
    expect(_kinds, ['off']);
    _later(90);
    Trip.I.debugTick();
    expect(_kinds, ['off', 'now']);
    expect(_alerts.last.sublist(1), ['Get off at the next station', 'Next station: S5.']);
  });

  test('a one-stop ride: no NOW while you wait, then NOW alone once on board', () async {
    await _start([_bus(1), TripLeg(kind: 'walk', label: 'Walk', to: 'End', points: [_pts[1], [1.3045, 103.80]], names: const ['S1', 'End'], minutes: 3)]);
    _at(0);
    _later(60);
    _at(0);
    expect(_kinds, isEmpty, reason: 'waiting at the stop');
    // On board: moving down the road, half way to the stop.
    for (final f in [0.2, 0.4, 0.6]) {
      _later(20);
      Trip.I.onFix(Fix(1.30 + f * 0.0036, 103.80, accuracy: 10));
    }
    expect(_kinds, ['now'], reason: 'the last call stands for the Get Off Alert');
  });

  test('with the Get Off Alert off in Settings, none of them', () async {
    await _start([_bus(5)]);
    Store.I.put(Trip.settingKey, 'off');
    _at(0);
    for (final s in [1, 2, 3, 4, 5]) {
      _later(60);
      _at(s);
    }
    expect(_alerts, isEmpty);
  });
}
