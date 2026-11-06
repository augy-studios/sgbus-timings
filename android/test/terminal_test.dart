// The sgbus terminal's commands (features/terminal/core.dart) against the screenshots' still
// data: what each says, in the words the site's js/sgbus-core.js uses.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/favs.dart';
import 'package:sgbus_timings/data/places.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/features/terminal/core.dart';

import 'shots/harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final printed = <String>[];
  late SgbusCore core;
  String said() => SgbusCore.visible(printed.join('\n'));

  setUp(() async {
    await stillData();
    printed.clear();
    core = SgbusCore(out: printed.add, clear: printed.clear, version: '2.4.0');
  });

  Future<String> run(String line) async {
    printed.clear();
    try {
      await core.run(SgbusCore.wordsOf(line));
    } catch (e) {
      core.report(e);
    }
    return said();
  }

  test('words and options, as a shell and the site read them', () {
    expect(SgbusCore.wordsOf('nav "Bedok Mall" \'home\' 22*'), ['nav', 'Bedok Mall', 'home', '22*']);
    final p = SgbusCore.parseArgs(['84009', '-w', '15', '--leave=08:30', '--day', 'tomorrow', '-d']);
    expect(p.args, ['84009']);
    expect(p.opts, {'watch': '15', 'leave': '08:30', 'day': 'tomorrow', 'details': true});
    expect(() => SgbusCore.parseArgs(['--nope']), throwsA(isA<Fail>()));
    expect(SgbusCore.busFilter('174, 175 174'), '174,175');
    expect(SgbusCore.busFilter('22*'), '22*');
    expect(SgbusCore.busFilter('hello world'), isNull);
    expect(SgbusCore.parseDays('mon,wed,fri'), [1, 3, 5]);
    expect(SgbusCore.daysText([1, 2, 3, 4, 5]), 'weekdays');
    expect(SgbusCore.parseHHMM('7:45'), '0745');
    expect(SgbusCore.remembered('calendar set https://x'), isFalse);
    expect(SgbusCore.remembered('favs'), isTrue);
  });

  test('colours are marks, and nothing else gets through', () {
    final line = SgbusCore.bold('Bedok\u001b[2J‮Int');
    expect(SgbusCore.visible(SgbusCore.clean('Bedok\u001b[2J‮Int')), 'Bedok[2JInt');
    expect(SgbusCore.visible(line).contains('Bedok'), isTrue);
    expect(SgbusCore.clean('a${SgbusCore.open}31${SgbusCore.shut}b'), 'a31b');
  });

  test("a stop's timings", () async {
    final s = await run('84009');
    expect(s, contains('Bedok Int (84009)'));
    expect(s, matches(RegExp(r'\b14\s+\d+ min|\b14\s+Arr')));
    final one = await run('84009 14');
    expect(one, contains('Bedok Int (84009)'));
    expect(one.split('\n').where((l) => RegExp(r'^\s*\*?\d').hasMatch(l)).every((l) => l.trim().startsWith('14')), isTrue);
    expect(await run('84009 hello world'), contains("isn't a list of buses"));
    expect(await run('99999'), contains("There's no bus stop 99999."));
  });

  test("a bus's route, and search", () async {
    final s = await run('bus 14');
    expect(s, startsWith('Bus 14'));
    expect(s, contains('84009'));
    expect(await run('14'), startsWith('Bus 14'));
    final found = await run('search bedok int');
    expect(found, contains('84009'));
  });

  test('the route planner', () async {
    final s = await run('route 84009 17009');
    expect(s, contains('Bedok Int (84009) → '));
    expect(s, contains('straight between these stops'));
  });

  test('Navigate, from the fixture', () async {
    final s = await run('nav 84009 17009');
    expect(s, contains('quickest first'));
    expect(s, contains('Way 1:'));
  });

  test('favourites, places and settings are the app\'s own', () async {
    expect(await run('fav add 84009'), contains('Saved Bedok Int (84009)'));
    expect(Favs.I.isStop('84009'), isTrue);
    expect(await run('fav bus add 14'), contains('Favourite buses: 14'));
    expect(await run('favs'), contains('Bedok Int (84009)'));
    expect(await run('fav'), contains('Favourite stops'));
    expect(await run('fav rm 84009'), contains('Removed Bedok Int (84009)'));
    expect(Favs.I.isStop('84009'), isFalse);

    expect(await run('place set gym 84009'), contains('gym: Bedok Int'));
    expect(Places.custom().single['name'], 'gym');
    expect(await run('places'), contains('gym'));
    expect(core.complete('nav g').$1, contains('gym'));
    await run('place rm gym');
    expect(Places.custom(), isEmpty);

    expect(await run('settings pin.bus bottom'), contains('pin.bus     bottom'));
    expect(Favs.I.pin('bus'), 'bottom');
    await run('settings customs 45');
    expect(Store.I.get('sgbus_customs'), '45');
    await run('settings customs auto');
    expect(Store.I.get('sgbus_customs'), isNull);
    expect(await run('settings nope on'), contains("There's no setting nope."));
  });

  test('alerts and the weather', () async {
    expect(await run('alerts'), contains('Trains'));
    expect(await run('weather'), contains('Today in Singapore'));
  });

  test('help, at the prompt without "sgbus"', () {
    final h = SgbusCore.visible(core.promptHelp());
    expect(h, startsWith('sgbus 2.4.0'));
    expect(h, contains('  favs [-w]'));
    expect(h, isNot(contains('sgbus favs')));
  });
}
