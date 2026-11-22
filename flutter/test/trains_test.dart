// The app's train times (lib/data/trains.dart) read /api/trains as the site's js/trains.js does:
// a Navigate ride gets only the trains that reach its stop, and its last train there, a
// platform's last three trains are marked, a disruption's cancellations are left out of them, a kept copy answers offline for its day, and a station never opened works
// offline from every station's usual timetable (/api/trains-all), Sunday's on a public holiday.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/trains.dart';
import 'package:sgbus_timings/data/when.dart';

// 08:30 on Friday 30 October 2026, Singapore time.
final _start = DateTime.utc(2026, 10, 29, 16).millisecondsSinceEpoch;
int _at(int min) => 8 * 3600 + 30 * 60 + min * 60;

Map<String, Object?> _tampines({bool live = false}) => {
      'day': '2026-10-30',
      'start': _start,
      'now': _at(0),
      'live': live,
      'platforms': [
        {
          'id': 'EW2_B', 'code': 'EW2', 'line': 'EW', 'colour': '#189E4A', 'platform': 'B',
          'heads': ['Joo Koon', 'Tuas Link'],
          'ways': [['EW3', 'EW29'], ['EW3', 'EW29', 'EW33']],
          'trains': [[_at(-5), 0, 0, 0], [_at(2), 0, 0, live ? 2 : 0], [_at(4), 1, 1, live ? 1 : 0], [_at(9), 0, 0, 0], [_at(14), 1, 1, 0]],
          'first': [19843, 1],
        },
      ],
    };

// Every station's usual trains: Bedok, every 10 minutes from 6am on weekdays and from 7am on
// Sundays (and public holidays).
Map<String, Object?> _all() {
  List<int> every(int from) => [for (var t = from; t < 24 * 3600; t += 600) ...[t, 0, 0]];
  return {
    'v': 1,
    'platforms': [
      {'id': 'EW5_A', 'code': 'EW5', 'parent': 'EW5', 'line': 'EW', 'platform': 'A', 'heads': ['Pasir Ris'], 'ways': [['EW4', 'EW1']],
        'trains': {'wd': every(6 * 3600), 'sat': every(6 * 3600), 'sun': every(7 * 3600)}},
    ],
  };
}

void main() {
  late bool online;
  setUp(() {
    Store.memory();
    online = true;
    When.now = () => DateTime.fromMillisecondsSinceEpoch(_start + _at(0) * 1000, isUtc: true);
    Api.fake = (path) async {
      if (path.startsWith('trains-all')) return _all();
      if (!online) throw ApiError('offline');
      if (path.startsWith('trains?')) return _tampines();
      return null;
    };
  });
  tearDown(() {
    Api.fake = null;
    When.now = DateTime.now;
  });

  test('a ride gets only the trains that reach its stop', () async {
    final data = await Trains.load(['EW2', 'DT32']);
    final now = When.nowMs();
    final tuas = Trains.forLeg(data, 'EW33', now)!;
    expect(tuas.trains.map((t) => t.head), ['Tuas Link', 'Tuas Link']);
    final joo = Trains.forLeg(data, 'EW29', now)!;
    expect(joo.trains.map((t) => (t.ms - _start) ~/ 1000), [_at(2), _at(4), _at(9)]);
    expect(Trains.forLeg(data, 'NS1', now), isNull);
    // From when you're on the platform: a train gone by then isn't one.
    expect(Trains.forLeg(data, 'EW29', now + 5 * 60000)!.trains.first.ms, _start + _at(9) * 1000);
  });

  test("a platform's last three trains, and a ride's last train there", () async {
    final data = await Trains.load(['EW2']);
    final p = data!.platforms.single;
    // Its trains run at -5, 2, 4, 9 and 14 minutes: the last three are 4, 9 and 14.
    expect(Trains.lastRanks(p), {_at(14): 1, _at(9): 2, _at(4): 3});
    expect(Trains.lastTrainMs(data, p), _start + _at(14) * 1000);
    expect(Trains.left(data, p, When.nowMs()), 4);
    // To Tuas Link, two are left (4 and 14): the next is the 2nd last.
    final tuas = Trains.forLeg(data, 'EW33', When.nowMs())!;
    expect((rank: tuas.rank, last: tuas.lastMs), (rank: 2, last: _start + _at(14) * 1000));
    // To Joo Koon, four are left: no warning yet.
    expect(Trains.forLeg(data, 'EW29', When.nowMs())!.rank, isNull);
  });

  test("an interchange's codes, as Navigate has them, any of which will do", () async {
    final data = await Trains.load(Trains.codesOf('EW2/DT32'));
    expect(Trains.forLeg(data, 'NS24/NE6/EW29', When.nowMs()), isNotNull);
    expect(Trains.codesKey(['dt32', 'EW2', 'EW2']), 'DT32,EW2');
  });

  test("a disruption's cancelled train isn't offered; a changed one is, and says so", () async {
    Api.fake = (path) async => path.startsWith('trains?') ? _tampines(live: true) : null;
    final next = Trains.forLeg(await Trains.load(['EW2'], force: true), 'EW29', When.nowMs())!;
    expect(next.trains.map((t) => (t.ms - _start) ~/ 1000), [_at(4), _at(9), _at(14)]);
    expect(next.live, isTrue);
    expect(next.trains.first.state, 1);
  });

  test('offline, the copy kept today answers', () async {
    await Trains.load(['EW2'], force: true);
    online = false;
    final kept = await Trains.load(['EW2'], force: true);
    expect(kept!.offline, isTrue);
    expect(kept.usual, isFalse);
    expect(kept.platforms.single.id, 'EW2_B');
  });

  test("offline at a station never opened, every station's usual timetable", () async {
    online = false;
    final data = await Trains.load(['EW5'], force: true);
    expect(data!.usual, isTrue);
    final next = data.trainsFrom(data.platforms.single, When.nowMs()).take(2).map((t) => (t.ms - data.start) ~/ 1000);
    expect(next, [8 * 3600 + 30 * 60, 8 * 3600 + 40 * 60]);
    expect(data.platforms.single.first, [6 * 3600, 0]);
  });

  test("a public holiday runs Sunday's trains; after midnight is the day before", () async {
    // Christmas 2026, a Friday, at 06:30.
    final xmas = DateTime.utc(2026, 12, 24, 22, 30).millisecondsSinceEpoch;
    final data = await Trains.fromNetwork(['EW5'], xmas);
    expect(data!.day, '2026-12-25');
    expect((data.trainsFrom(data.platforms.single, xmas).first.ms - data.start) ~/ 1000, 7 * 3600);
    // 00:20 on the 26th is still the 25th's service day.
    expect(Trains.serviceDay(DateTime.utc(2026, 12, 25, 16, 20).millisecondsSinceEpoch).day, '2026-12-25');
  });
}
