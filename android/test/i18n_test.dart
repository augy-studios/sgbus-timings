// Every word the app says by a key is one the site has (assets/i18n/, copied from
// main-site/i18n/ by tool/sync_i18n.dart) or the app's own (assets/i18n_app/), and the copies
// are the site's as they are now.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _read(String path) => jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;

void main() {
  test('every key used is in the words', () {
    final known = {..._read('assets/i18n/en.json').keys, ..._read('assets/i18n_app/en.json').keys};
    final missing = <String>{};
    final re = RegExp(r"""\btr\(\s*'([a-zA-Z0-9_.]+)'""");
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      for (final m in re.allMatches(f.readAsStringSync())) {
        if (!known.contains(m[1])) missing.add('${m[1]}  (${f.path})');
      }
    }
    expect(missing.toList()..sort(), isEmpty, reason: 'keys not in assets/i18n/en.json or assets/i18n_app/en.json');
  });

  test("the words are the site's", () {
    for (final f in Directory('../main-site/i18n').listSync().whereType<File>()) {
      final name = f.uri.pathSegments.last;
      expect(File('assets/i18n/$name').readAsStringSync(), f.readAsStringSync(), reason: 'run dart run tool/sync_i18n.dart');
    }
  });

  test("the app's own words are in every language", () {
    final en = _read('assets/i18n_app/en.json').keys.toSet();
    for (final lang in ['ms', 'ta', 'zh-SG']) {
      expect(_read('assets/i18n_app/$lang.json').keys.toSet(), en, reason: lang);
    }
  });
}
