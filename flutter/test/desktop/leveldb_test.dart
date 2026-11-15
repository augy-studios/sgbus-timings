// The reader that brings the Electron app's data across (lib/desktop/leveldb.dart), against a
// localStorage database a real Chromium wrote (test/fixtures/desktop/leveldb/, made by
// tool/leveldb_fixture.mjs): it must find every key Chromium itself reads back
// (leveldb_expected.json), and nothing else.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/leveldb.dart';

const _fixture = 'test/fixtures/desktop/leveldb';
const _site = 'https://sgbus.uwuapps.org';

/// The fixture's file whose name ends with [ending].
File _file(String ending) => Directory(_fixture).listSync().whereType<File>().firstWhere((f) => f.path.endsWith(ending));

void main() {
  final dir = Directory(_fixture);
  final expected = Map<String, String>.from(jsonDecode(File('test/fixtures/desktop/leveldb_expected.json').readAsStringSync()) as Map);

  test('reads every key Chromium kept for the site, exactly as Chromium reads them back', () {
    expect(ChromiumLocalStorage.read(dir, _site), expected);
  });

  test('the fixture has a table and a log, so both readers are tested', () {
    expect(LevelDb.readTable(_file('.ldb').readAsBytesSync()), isNotEmpty);
    expect(LevelDb.readLog(_file('.log').readAsBytesSync()), isNotEmpty);
  });

  test('a deletion in the log hides the value in the table, and the newest write wins', () {
    final inTable = LevelDb.readTable(_file('.ldb').readAsBytesSync()).map((e) => latin1.decode(e.key));
    expect(inTable.where((k) => k.endsWith('sgbus.later-gone')), isNotEmpty, reason: 'the first sitting wrote it to the table');
    final got = ChromiumLocalStorage.read(dir, _site);
    expect(got.containsKey('sgbus.later-gone'), isFalse);
    expect(got.containsKey('sgbus.gone'), isFalse);
    expect(got['sgbus.changed'], 'second');
  });

  test('text that is not Latin-1, in keys and values, an empty value and one bigger than a log block', () {
    final got = ChromiumLocalStorage.read(dir, _site);
    expect(got['巴士'], 'a key in Chinese');
    expect(got['sgbus.name.zh'], '勿洛巴士转换站');
    expect(got['sgbus.name.ta'], 'பேருந்து நிலையம்');
    expect(got['sgbus.emoji'], '🚌 on its way');
    expect(got['sgbus.cafe'], 'Café au lait');
    expect(got['sgbus.empty'], '');
    expect(got['sgbus.big'], 'x' * 40000);
  });

  test("another origin's keys are in the database but left out", () {
    expect(LevelDb.readAll(dir).keys.any((k) => k.startsWith('_https://example.org\u0000')), isTrue);
    expect(ChromiumLocalStorage.read(dir, _site).containsKey('sgbus.elsewhere'), isFalse);
    expect(ChromiumLocalStorage.read(dir, 'https://example.org'), {'sgbus.elsewhere': 'another origin'});
  });

  test('no folder is nothing to bring across, not an error', () {
    expect(ChromiumLocalStorage.read(Directory('$_fixture/not-there'), _site), isEmpty);
  });

  test('a damaged file is skipped, and what the others hold still counts', () {
    final copy = Directory.systemTemp.createTempSync('sgbus-leveldb-');
    addTearDown(() => copy.deleteSync(recursive: true));
    for (final f in dir.listSync().whereType<File>()) {
      f.copySync('${copy.path}/${f.uri.pathSegments.last}');
    }
    final table = File('${copy.path}/${_file('.ldb').uri.pathSegments.last}');
    table.writeAsBytesSync(List.filled(100, 7));
    final got = ChromiumLocalStorage.read(copy, _site);
    expect(got['sgbus.second'], 'from the second sitting');
    expect(got.containsKey('sgbus.favs'), isFalse);
  });

  test('a log cut off part-way keeps the writes before the cut', () {
    final log = _file('.log').readAsBytesSync();
    final whole = LevelDb.readLog(log);
    final cut = LevelDb.readLog(Uint8List.sublistView(log, 0, log.length - 100));
    expect(cut.length, lessThan(whole.length));
    expect(cut.map((e) => e.sequence), whole.take(cut.length).map((e) => e.sequence));
  });

  test('a file that is not a table says so', () {
    expect(() => LevelDb.readTable(Uint8List(64)), throwsFormatException);
  });

  group('Snappy', () {
    test('a literal, then a copy that overlaps what it writes', () {
      // 12 bytes long: the literal "abc", then 9 bytes copied from 3 back.
      final src = Uint8List.fromList([12, 2 << 2, 0x61, 0x62, 0x63, ((9 - 4) << 2) | 1, 3]);
      expect(utf8.decode(Snappy.decode(src)), 'abcabcabcabc');
    });

    test('a copy from before the start is refused', () {
      expect(() => Snappy.decode(Uint8List.fromList([4, (0 << 2) | 1, 5])), throwsFormatException);
    });
  });

  group("Chromium's strings", () {
    test('1 then Latin-1, 0 then UTF-16 (little-endian)', () {
      expect(ChromiumLocalStorage.decode(Uint8List.fromList([1, 0x43, 0x61, 0x66, 0xe9])), 'Café');
      expect(ChromiumLocalStorage.decode(Uint8List.fromList([0, 0xf4, 0x5d, 0xeb, 0x58])), '巴士');
    });

    test('anything else is not a string', () {
      expect(ChromiumLocalStorage.decode(Uint8List(0)), isNull);
      expect(ChromiumLocalStorage.decode(Uint8List.fromList([2, 0x41])), isNull);
    });
  });
}
