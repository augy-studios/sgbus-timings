// The app's words in English, Malay, Tamil and Chinese: the site's own (assets/i18n/, from
// main-site/i18n/), by the same keys, so a screen says exactly what the site's said.
//
//   t('timings.title', 'Bus timings')            the words for the key, or the English given
//   t('eggs.count', '{n} of {all}', {'n': 3})    with {vars} filled in
//
// The language is the page's sgbus_lang ("en", "ms", "ta", "zh-SG"), or the phone's when it
// isn't set, and the app's own (Android's per-app languages) follows it (SgBusPlugin).
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../data/store.dart';

class Lang {
  const Lang(this.code, this.name, this.locale);
  final String code;
  final String name;
  final ui.Locale locale;
}

class I18n extends ChangeNotifier {
  I18n._();
  static final I18n I = I18n._();

  static const langs = [
    Lang('en', 'English', ui.Locale('en', 'SG')),
    Lang('ms', 'Bahasa Melayu', ui.Locale('ms')),
    Lang('ta', 'தமிழ்', ui.Locale('ta')),
    Lang('zh-SG', '中文', ui.Locale('zh', 'SG')),
  ];
  static const key = 'sgbus_lang';

  String _lang = 'en';
  Map<String, String> _words = const {};

  String get lang => _lang;
  Lang get current => langs.firstWhere((l) => l.code == _lang, orElse: () => langs.first);

  /// The language picked in Settings, or null when it follows the phone's.
  String? get chosen => Store.I.get(key);

  /// The closest of ours to a language tag ("ms-MY" is "ms", "zh-Hans-SG" is "zh-SG").
  static String? match(String tag) {
    final t = tag.toLowerCase();
    if (t.startsWith('zh')) return 'zh-SG';
    for (final l in langs) {
      if (t == l.code.toLowerCase() || t.startsWith('${l.code.toLowerCase()}-')) return l.code;
    }
    return null;
  }

  Future<void> load() async {
    final phone = ui.PlatformDispatcher.instance.locale.toLanguageTag();
    await use(chosen ?? match(phone) ?? 'en', remember: false);
  }

  Future<void> use(String code, {bool remember = true}) async {
    if (remember) Store.I.put(key, code);
    _lang = code;
    _words = code == 'en' ? await _read('en') : {...await _read('en'), ...await _read(code)};
    notifyListeners();
  }

  /// Back to the phone's language.
  Future<void> unset() async {
    Store.I.remove(key);
    await load();
  }

  static final Map<String, Map<String, String>> _cache = {};

  static Future<Map<String, String>> _read(String code) async {
    if (_cache[code] != null) return _cache[code]!;
    final out = <String, String>{};
    // The site's words, then the app's own (assets/i18n_app/): the few only the app says.
    for (final dir in const ['i18n', 'i18n_app']) {
      try {
        final raw = await rootBundle.loadString('assets/$dir/$code.json');
        out.addAll(Map<String, String>.from(jsonDecode(raw) as Map));
      } catch (_) {
        // None in this language: English stands in.
      }
    }
    return _cache[code] = out;
  }

  String t(String key, String en, [Map<String, Object?>? vars]) => fill(_words[key] ?? en, vars);

  static String fill(String s, Map<String, Object?>? vars) =>
      vars == null ? s : s.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => vars.containsKey(m[1]) ? '${vars[m[1]]}' : m[0]!);
}

/// The words for key, as the site's tr(key, en, vars).
String tr(String key, String en, [Map<String, Object?>? vars]) => I18n.I.t(key, en, vars);
