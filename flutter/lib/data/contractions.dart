// LTA's shortened words in stop and road names ("W'lands Checkpt", "Bt Batok", "Opp Blk 10"),
// so a search finds a stop however the word is typed. Ported from the site's js/contractions.js
// (the same as the Telegram bot's contractions.py): keep the groups in step.
class Contractions {
  Contractions._();

  static const groups = [
    ['Woodlands', "W'lands"], ['Serangoon', "S'goon"], ['Singapore', "S'pore"],
    ['Commonwealth', "C'wealth"], ['Aerospace', "A'space"],
    ['Choa Chu Kang', 'Chua Chu Kang', 'CCK'], ['Holland Village', 'Holland V'],
    ['Bukit', 'Bt'], ['Jalan', 'Jln'], ['Tanjong', 'Tanjung', 'Tg'], ['Kampong', 'Kampung', 'Kg'],
    ['Sungei', 'Sg'], ['Upper', 'Upp'], ['North', 'Nth'], ['South', 'Sth'],
    ['Avenue', 'Ave'], ['Street', 'St'], ['Saint', 'St'], ['Road', 'Rd'], ['Drive', 'Dr'],
    ['Crescent', 'Cres'], ['Place', 'Pl'], ['Walk', 'Wk'], ['Close', 'Cl'], ['Court', 'Ct'],
    ['Terrace', 'Terr'], ['Square', 'Sq'], ['Park', 'Pk'], ['Mount', 'Mt'],
    ['Garden', 'Gdn'], ['Gardens', 'Gdns'], ['Reservoir', 'Resvr'],
    ['After', 'Aft'], ['Before', 'Bef'], ['Opposite', 'Opp'], ['Block', 'Blk'],
    ['Interchange', 'Int'], ['Terminal', 'Ter'], ['Station', 'Stn'], ['Checkpoint', 'Checkpt'],
    ['Carpark', 'Car Park', 'Car-park', 'Parking', 'CP'], ['Playground', 'P/G'],
    ['Centre', 'Center', 'Central', 'Ctr', 'Ctrl'], ['Market', 'Mkt'], ['Food Court', 'FC'],
    ['Shopping', 'Shop'], ['Complex', 'Cplx'], ['Building', 'Bldg'], ['Tower', 'Twr'],
    ['House', 'Hse'], ['Warehouse', 'Warehse'], ['Library', 'Lib'], ['Post Office', 'PO'],
    ['Cemetery', 'Cemy'], ['Hospital', 'Hosp'], ['Rehabilitation', 'Rehab', 'Reh'], ['Release', 'Rel'],
    ['School', 'Sch'], ['Primary', 'Pr'], ['Secondary', 'Sec'], ['College', 'Coll'],
    ['Polytechnic', 'Poly'], ['Institute', 'Inst'], ['Institution', 'Instn'], ['Academy', 'Acad'],
    ['Aviation Academy', 'Aviation Ac'], ['Methodist', 'Meth'], ['Church', 'Ch'], ['Temple', 'Tp'],
    ['Mosque', 'Masjid', 'Mque', 'Mjd'],
    ['Industrial', 'Industry', 'Ind'], ['Technology', 'Tech'], ['Science', 'Sci'],
    ['Engineering', 'Engrg'], ['Manufacturing', 'Mfg'], ['Processing', 'Proc'], ['Facility', 'Fty'],
    ['Service', 'Svc'], ['Services', 'Svcs'], ['Business', 'Biz'], ['Corporation', 'Corp'],
    ['Group', 'Grp'], ['Limited', 'Ltd'], ['Private', 'Pte'], ['General', 'Gen'],
    ['National', 'Natl'], ['International', 'Intl'],
  ];
  static const _maxWords = 3;

  static String _key(String s) => s.toLowerCase().replaceAll("'", '').replaceFirst(RegExp(r'\.$'), '');
  static String _escape(String s) => s.replaceAllMapped(RegExp(r'[.*+?^${}()|[\]\\/]'), (m) => '\\${m[0]}');
  static String _pattern(String form) =>
      form.toLowerCase().split(RegExp(r'[ -]+')).map((w) => _escape(w).replaceAll("'", "'?")).join('[ -]+');

  static final Map<String, List<String>> _forms = () {
    final m = <String, List<String>>{};
    for (final g in groups) {
      for (final f in g) {
        final k = _key(f);
        m[k] = {...?m[k], ...g}.toList();
      }
    }
    return m;
  }();

  static const _end = r'(?![a-z0-9])\.?';
  static const _start = r'(?:^|[^a-z0-9])';

  static ContractionMatcher? matcher(String query) {
    final words = query.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return null;
    final parts = <({String? literal, String? typed, List<String>? forms})>[];
    var swapped = false;
    for (var i = 0; i < words.length;) {
      var n = (_maxWords < words.length - i) ? _maxWords : words.length - i;
      while (n > 0 && !_forms.containsKey(_key(words.sublist(i, i + n).join(' ')))) {
        n--;
      }
      if (n > 0) {
        final typed = words.sublist(i, i + n).join(' ');
        parts.add((literal: null, typed: typed, forms: _forms[_key(typed)]));
        swapped = true;
        i += n;
      } else {
        parts.add((literal: words[i].toLowerCase(), typed: null, forms: null));
        i++;
      }
    }
    String forms(List<String> f) => '(?:${f.map(_pattern).join('|')})$_end';
    final whole = swapped
        ? RegExp([
            for (var i = 0; i < parts.length; i++)
              parts[i].literal != null ? _escape(parts[i].literal!) : '${i == 0 ? _start : ''}${forms(parts[i].forms!)}'
          ].join(' +'))
        : null;
    final each = parts.length > 1
        ? [
            for (var i = 0; i < parts.length; i++)
              RegExp(_start +
                  (parts[i].literal != null ? _escape(parts[i].literal!) + (i < parts.length - 1 ? _end : '') : forms(parts[i].forms!)))
          ]
        : null;
    return ContractionMatcher._(whole, each, parts);
  }
}

class ContractionMatcher {
  ContractionMatcher._(this._whole, this._each, this._parts);
  final RegExp? _whole;
  final List<RegExp>? _each;
  final List<({String? literal, String? typed, List<String>? forms})> _parts;

  bool test(String text) => _whole?.hasMatch(text) ?? false;
  bool words(String text) => _each?.every((re) => re.hasMatch(text)) ?? false;

  String note(List<String> texts) {
    final found = <String>[];
    for (final p in _parts) {
      if (p.forms == null) continue;
      final others = p.forms!
          .where((f) =>
              Contractions._key(f) != Contractions._key(p.typed!) &&
              texts.any((t) => RegExp('${Contractions._start}${Contractions._pattern(f)}${Contractions._end}').hasMatch(t)))
          .toList();
      final typed = p.forms!.firstWhere((f) => Contractions._key(f) == Contractions._key(p.typed!), orElse: () => p.typed!);
      if (others.isNotEmpty) found.add('${others.join(', ')} for $typed');
    }
    return found.isEmpty ? '' : 'Also searched ${found.join('; ')}';
  }
}
