// BinaryPack as js-binarypack packs it (PeerJS's default), byte for byte for the kinds Sync sends.
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/sync/binarypack.dart';

void main() {
  List<int> p(Object? v) => BinaryPack.pack(v).toList();

  test('numbers in js-binarypack’s order', () {
    expect(p(5), [0x05]);
    expect(p(-5), [0xfb]);
    expect(p(200), [0xcc, 200]);
    expect(p(-100), [0xd0, 0x9c]);
    expect(p(70000), [0xce, 0x00, 0x01, 0x11, 0x70]);
    expect(p(-300), [0xd1, 0xfe, 0xd4]);
    // A time in ms is past 32 bits: int64.
    expect(p(1793917851104), [0xd3, 0x00, 0x00, 0x01, 0xa1, 0xad, 0xd6, 0x15, 0xe0]);
    expect(p(1.25), [0xcb, 0x3f, 0xf4, 0, 0, 0, 0, 0, 0]);
  });

  test('strings, arrays and maps', () {
    expect(p('hi'), [0xb2, 0x68, 0x69]);
    expect(p(null), [0xc0]);
    expect(p(true), [0xc3]);
    expect(p([1, 2]), [0x92, 1, 2]);
    expect(p({'type': 'bye'}), [0x81, 0xb4, ...'type'.codeUnits, 0xb3, ...'bye'.codeUnits]);
    final long = 'x' * 20;
    expect(p(long).take(3), [0xd8, 0x00, 20]);
  });

  test('a Sync message there and back, chunk and all', () {
    final msg = {
      'type': 'favs',
      'favs': {
        'stops': [{'code': '84009', 'name': 'Bedok Int'}],
        'trips': [{'id': 'abc12345', 'startedAt': 1793917851104, 'legs': [{'kind': 'bus', 'rideMin': 12.5}]}],
      },
      'kinds': ['stop', 'setting:bus.times'],
      's': 'ç中文 and a string over fifteen bytes',
    };
    expect(BinaryPack.unpack(BinaryPack.pack(msg)), msg);
    final chunk = {'__peerData': 3, 'n': 0, 'total': 2, 'data': Uint8List.fromList([1, 2, 3])};
    final back = BinaryPack.unpack(BinaryPack.pack(chunk)) as Map;
    expect(back['data'], [1, 2, 3]);
    expect(back['total'], 2);
  });
}
