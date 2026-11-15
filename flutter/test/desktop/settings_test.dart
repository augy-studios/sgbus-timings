// The desktop settings file (lib/desktop/settings.dart, desktop-features-spec §20): read and merged
// on every write, so different keys never undo each other; a failed read is an empty map and a
// failed write is ignored; the Electron app's file reads as it was.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/settings.dart';

void main() {
  late Directory dir;
  late File file;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('sgbus-settings-');
    file = File('${dir.path}/settings.json');
    DeskSettings.override = dir.path;
  });
  tearDown(() {
    DeskSettings.override = null;
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  });

  test('no file yet: nothing kept', () {
    expect(DeskSettings.read(), isEmpty);
    expect(DeskSettings.get<bool>('setupDone'), isNull);
  });

  test('a write is merged over what is there, so other keys stay', () {
    DeskSettings.write({'setupDone': true, 'bounds': {'x': 10, 'y': 20, 'width': 1120, 'height': 760}});
    DeskSettings.write({'maximized': false});
    DeskSettings.write({'setupDone': false});
    expect(DeskSettings.read(), {
      'setupDone': false,
      'bounds': {'x': 10, 'y': 20, 'width': 1120, 'height': 760},
      'maximized': false,
    });
  });

  test('a key written as null stays, as null', () {
    DeskSettings.write({'pendingLook': {'lang': 'ms', 'mode': 'dark', 'color': 'classic'}});
    DeskSettings.write({'pendingLook': null});
    expect(DeskSettings.read().containsKey('pendingLook'), isTrue);
    expect(DeskSettings.get<Map<String, dynamic>>('pendingLook'), isNull);
  });

  test('a value of another type reads as null', () {
    DeskSettings.write({'updateNotices': 'yes', 'widgets': [1, 2]});
    expect(DeskSettings.get<bool>('updateNotices'), isNull);
    expect(DeskSettings.get<List>('widgets'), [1, 2]);
    expect(DeskSettings.get<Map<String, dynamic>>('widgets'), isNull);
  });

  test("the Electron app's file reads as it was", () {
    file.writeAsStringSync(jsonEncode({
      'bounds': {'x': 0, 'y': 0, 'width': 1120, 'height': 760},
      'maximized': true,
      'trayHintShown': true,
      'loginChosen': true,
      'setupDone': true,
      'widgets': [
        {'id': 'a1', 'code': '84009', 'name': 'Bedok Int', 'buses': ['12'], 'onTop': true, 'bounds': {'x': 5, 'y': 6, 'width': 320, 'height': 300}},
      ],
      'trayStop': {'code': '84009', 'name': 'Bedok Int', 'service': null},
      'favourites': [{'code': '84009', 'name': 'Bedok Int'}],
      'linkHandoff': {'command': '"C:\\Apps\\Promptr.exe" "%1"'},
    }));
    expect(DeskSettings.get<bool>('maximized'), isTrue);
    expect(DeskSettings.get<List>('widgets')!.single['buses'], ['12']);
    expect(DeskSettings.get<Map<String, dynamic>>('trayStop')!['code'], '84009');
    expect(DeskSettings.get<Map<String, dynamic>>('linkHandoff'), {'command': '"C:\\Apps\\Promptr.exe" "%1"'});
  });

  test('a damaged file reads as empty, and the next write starts it afresh', () {
    file.writeAsStringSync('{"setupDone": tr');
    expect(DeskSettings.read(), isEmpty);
    DeskSettings.write({'setupDone': true});
    expect(jsonDecode(file.readAsStringSync()), {'setupDone': true});
  });

  test('a file that is not an object reads as empty', () {
    file.writeAsStringSync('[1, 2, 3]');
    expect(DeskSettings.read(), isEmpty);
  });

  test('the folder is made if need be, and no .tmp file is left behind', () {
    dir.deleteSync(recursive: true);
    DeskSettings.write({'trayHintShown': true});
    expect(DeskSettings.get<bool>('trayHintShown'), isTrue);
    expect(dir.listSync().map((f) => f.uri.pathSegments.last), ['settings.json']);
  });

  test('a write that fails is ignored', () {
    // A folder where the file should be: it can't be written.
    Directory(file.path).createSync();
    expect(() => DeskSettings.write({'setupDone': true}), returnsNormally);
    expect(DeskSettings.read(), isEmpty);
  });

  test('the folder is the one the Electron app used, named after the app', () {
    DeskSettings.override = null;
    expect(DeskSettings.dir, endsWith('SG Bus Timings'));
    if (Platform.isMacOS) expect(DeskSettings.dir, endsWith('/Library/Application Support/SG Bus Timings'));
  });
}
