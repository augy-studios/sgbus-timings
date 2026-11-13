// Sync's favourites: what one phone sends is checked and merged on the other as the site does.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/sync/sync.dart';
import 'package:sgbus_timings/native/native_bridge.dart';

void main() {
  setUp(() => Native.available = false);

  test('a phone’s favourites, places and settings arrive on another, once', () {
    Store.memory({
      'sgbus_name': 'Sam',
      'sgbus_favs_v2': '[{"code":"84009","name":"Bedok Int"}]',
      'sgbus_fav_buses': '["14"]',
      'sgbus_home': '{"label":"Bedok Mall","lat":1.324736,"lng":103.929256}',
      'sgbus_times': 'clock',
      'sgbus_trips': '[{"id":"trip0001","startedAt":1793917851104,"from":{"label":"A","lat":1.3,"lng":103.9},"to":{"label":"B","lat":1.31,"lng":103.91},"legs":[{"kind":"bus","route":"14","done":true}]}]',
    });
    final sent = jsonDecode(jsonEncode(ownFavs()));
    Store.memory({});
    final clean = cleanFavs(sent)!;
    expect(mergeFavs(clean), 6);
    expect(Store.I.get('sgbus_name'), 'Sam');
    expect(Store.I.get('sgbus_times'), 'clock');
    expect(Store.I.list('sgbus_fav_buses'), ['14']);
    expect(Store.I.list('sgbus_trips').length, 1);
    expect(mergeFavs(clean), 0, reason: 'nothing twice');
  });

  test('what isn’t one of ours is dropped', () {
    final clean = cleanFavs({
      'stops': [{'code': 'abc'}, {'code': '84009'}],
      'buses': ['14', '<script>'],
      'settings': [{'field': 'bus.times', 'value': 'sideways'}, {'field': 'nope', 'value': 'on'}],
      'calendar': [{'url': 'javascript:alert(1)'}],
    })!;
    expect(clean['stops']!.length, 1);
    expect(clean['buses'], ['14']);
    expect(clean['settings'], isEmpty);
    expect(clean['calendar'], isEmpty);
  });
}
