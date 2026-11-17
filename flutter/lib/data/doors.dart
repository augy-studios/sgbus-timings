// Where to stand on a train (the site's js/mrt-doors.js): the doors that stop nearest the
// escalators, lift and stairs where you get off, or that it's a change across the platform to
// your next train. From /api/mrt-doors, which has some stations and not yet others: a ride
// ending at one it hasn't says nothing.
//
// - The way a train's going is found from the platforms' `order` (o), how many stops into its
//   direction (d) each is: the direction in which where you get off comes after where you board.
// - Doors are counted from the front of the train, all along it, and said as just that number,
//   the one on each platform screen door.
// - A facility's `to` is where it leads, split by "/": "exit", the directions of the lines it's
//   the way to ("DT-11"), and places ("Jewel", "T2").
// - station(codes) is every platform at a station, one for each way a train goes from it, for
//   the live map's station card (features/map/map_card.dart).
import '../api/api.dart';
import '../i18n/i18n.dart';
import 'mrt.dart';

class DoorRow {
  const DoorRow(this.type, this.places, this.doors);
  final String type; // escalator, lift, stairs, or what the data says
  final List<String> places; // where it leads, or (a station's platform) its leads
  final List<int> doors;
}

class DoorPlan {
  const DoorPlan({required this.station, this.cross, this.change, this.rows = const [], this.numberAt});
  final String station;
  final String? cross; // the line across the platform, when it's that
  final String? change; // null: getting off; '': changing; else the line changed to
  final List<DoorRow> rows;
  final String? numberAt; // above, corner, post, or null
}

class Platform {
  const Platform({required this.code, required this.line, required this.lineName, required this.towards, this.next, required this.last,
      required this.rows, this.numberAt, required this.cross});
  final String code;
  final String line;
  final String lineName;
  final String towards;
  final String? next;
  final bool last;
  final List<DoorRow> rows;
  final String? numberAt;
  final List<String> cross;
}

class _P {
  _P(Map m)
      : c = '${m['c']}',
        l = '${m['l']}',
        d = '${m['d']}',
        o = (m['o'] as num?)?.toInt() ?? 0,
        x = [for (final v in (m['x'] as List? ?? const [])) '$v'],
        n = '${m['n']}',
        e = (m['e'] as num?)?.toInt(),
        f = [for (final v in (m['f'] as List? ?? const [])) if (v is Map) v];
  final String c, l, d, n;
  final int o;
  final int? e;
  final List<String> x;
  final List<Map> f;
}

class MrtDoors {
  MrtDoors._();

  // Doors along each side of a train: 6 cars of 4 but the Circle and Downtown lines' (3 of 4) and
  // the Thomson-East Coast Line's (4 of 5).
  static const _doorsOf = {'CC': 12, 'DT': 12, 'TE': 20};
  static const _lineOf = {'CG': 'EW'};
  static const order = ['escalator', 'lift', 'stairs'];

  static List<_P>? _platforms;
  static Set<String> _dirs = {};
  static Future<void>? _loading;

  static bool get ready => _platforms != null;

  /// For tests and screenshots.
  static void use(List<Map> platforms) {
    _platforms = [for (final p in platforms) _P(p)];
    _dirs = _platforms!.map((p) => p.d).toSet();
  }

  static Future<void> load() => _loading ??= () async {
        try {
          final d = await Api.map('mrt-doors');
          use([for (final p in (d['platforms'] as List? ?? const [])) if (p is Map) p]);
        } catch (_) {
          _loading = null;
        }
      }();

  static String? _numberAt(_P p) {
    if (p.e == 1) return 'post';
    if (const ['NE', 'CC', 'DT', 'TE'].contains(p.l)) return 'corner';
    if (p.e == 0) return 'above';
    return null;
  }

  static List<String> _ways(Map f) => '${f['to'] ?? ''}'.split('/').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
  static List<String> _places(Map f) => _ways(f).where((w) => w.toLowerCase() != 'exit' && !_dirs.contains(w)).toList();
  static bool _leadsOut(Map f) => _ways(f).isEmpty || _ways(f).any((w) => !_dirs.contains(w));
  static List<int> _doors(Map f, int max) =>
      {for (final n in (f['doors'] as List? ?? const [])) if (n is num && n == n.roundToDouble() && n >= 1 && n <= max) n.toInt()}.toList()..sort();

  static String _norm(String? s) => (s ?? '')
      .toLowerCase()
      .replaceAll(RegExp(r'\b(mrt|lrt)\b'), '')
      .replaceAll(RegExp(r'\bstation\b'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  static List<_P> _at(Map? place, String line) {
    if (_platforms == null || place == null) return const [];
    final codes = '${place['code'] ?? ''}'.toUpperCase().split('/').where((s) => s.isNotEmpty).toList();
    bool onLine(_P p) => p.l == line || p.l == _lineOf[line] || p.c.startsWith(line);
    final byCode = _platforms!.where((p) => onLine(p) && codes.contains(p.c.toUpperCase())).toList();
    if (byCode.isNotEmpty) return byCode;
    final name = _norm(place['name'] as String?);
    return name.isEmpty ? const [] : _platforms!.where((p) => onLine(p) && _norm(p.n) == name).toList();
  }

  static _P? _arrival(Map leg) {
    final line = '${leg['route'] ?? ''}'.toUpperCase();
    final from = _at(leg['from'] as Map?, line);
    for (final a in _at(leg['to'] as Map?, line)) {
      for (final b in from) {
        if (b.d == a.d && a.o > b.o) return a;
      }
    }
    return null;
  }

  static int _rank(String t) => order.contains(t) ? order.indexOf(t) : order.length;

  static List<DoorRow> _rowsOf(List<Map> fs, String line) {
    final max = _doorsOf[line] ?? 24;
    final groups = <String, ({String t, List<int> doors, List<String> places})>{};
    for (final f in fs) {
      final doors = _doors(f, max);
      if (doors.isEmpty) continue;
      final t = '${f['t']}';
      final key = '$t|${doors.join(',')}';
      final g = groups[key] ?? (t: t, doors: doors, places: <String>[]);
      for (final p in _places(f)) {
        if (!g.places.contains(p)) g.places.add(p);
      }
      groups[key] = g;
    }
    final all = groups.values.toList()..sort((a, b) => _rank(a.t) - _rank(b.t));
    final esc = all.where((g) => g.t == 'escalator').expand((g) => g.doors).toSet();
    Set<int> named(String t) => all.where((g) => g.t == t && g.places.isNotEmpty).expand((g) => g.doors).toSet();
    return all
        .map((g) => g.places.isNotEmpty ? g : (t: g.t, doors: g.doors.where((n) => !named(g.t).contains(n)).toList(), places: g.places))
        .map((g) => g.t == 'stairs' ? (t: g.t, doors: g.doors.where((n) => !esc.contains(n)).toList(), places: g.places) : g)
        .where((g) => g.doors.isNotEmpty)
        .map((g) => DoorRow(g.t, g.places, g.doors))
        .toList();
  }

  /// Where to stand for a train ride (Navigate's leg, { mode, route, name, from, to }), or null.
  static DoorPlan? plan(Map leg, [Map? next]) {
    if (_platforms == null || leg['mode'] != 'train') return null;
    final a = _arrival(leg);
    if (a == null) return null;
    String? changeName;
    List<Map>? changeFs;
    if (next != null && next['mode'] == 'train') {
      final nextLine = '${next['route'] ?? ''}'.toUpperCase();
      final onward = _arrival(next);
      if (onward != null && a.x.contains(onward.d)) return DoorPlan(station: a.n, cross: '${next['name'] ?? next['route']}');
      final nf = next['from'] as Map?;
      final here = _at(nf, nextLine).any((p) => p.n == a.n) || _norm(nf?['name'] as String?) == _norm(a.n);
      if (here) {
        final lineOf = {for (final p in _platforms!) p.d: p.l};
        final exact = onward != null ? a.f.where((f) => _ways(f).contains(onward.d)).toList() : <Map>[];
        changeName = '${next['name'] ?? next['route']}';
        changeFs = exact.isNotEmpty ? exact : a.f.where((f) => _ways(f).any((w) => lineOf[w] == (_lineOf[nextLine] ?? nextLine))).toList();
      }
    }
    final rows = changeFs != null && changeFs.isNotEmpty ? _rowsOf(changeFs, a.l) : _rowsOf(a.f.where(_leadsOut).toList(), a.l);
    if (rows.isEmpty) return null;
    return DoorPlan(
      station: a.n,
      change: changeFs == null ? null : (changeFs.isNotEmpty ? changeName : ''),
      rows: rows,
      numberAt: _numberAt(a),
    );
  }

  static String _and(List<String> xs) =>
      xs.length < 2 ? xs.join() : '${xs.sublist(0, xs.length - 1).join(', ')}${tr('trip.and', ' and ')}${xs.last}';

  static String numberAtWords(String? at) => switch (at) {
        'above' => tr('doors.at.above', 'on the panel above the doors'),
        'corner' => tr('doors.at.corner', 'at the top right of each door'),
        'post' => tr('doors.at.post', 'near the top of the post beside each door'),
        _ => '',
      };

  /// The same in words: "Getting off at Changi Airport: door 20 for the escalators to Jewel."
  static String? tip(Map leg, [Map? next]) {
    final p = plan(leg, next);
    if (p == null) return null;
    if (p.cross != null) return tr('doors.tip.cross', 'At {station}, change across the platform to the {line}.', {'station': p.station, 'line': p.cross});
    String what(String t) => switch (t) {
          'escalator' => tr('doors.escalators', 'escalators'),
          'lift' => tr('doors.lift', 'lift'),
          'stairs' => tr('doors.stairs', 'stairs'),
          _ => t,
        };
    final parts = p.rows.map((r) {
      final v = {'doors': r.doors.join(tr('makeIt.or', ' or ')), 'what': what(r.type), 'places': _and(r.places)};
      return r.places.isNotEmpty ? tr('doors.tip.doorTo', 'door {doors} for the {what} to {places}', v) : tr('doors.tip.door', 'door {doors} for the {what}', v);
    });
    final head = p.change != null && p.change!.isNotEmpty
        ? tr('nav.transfer_train.description', 'Changing at {transferStn} for the {transferLine}', {'transferStn': p.station, 'transferLine': p.change})
        : p.change != null
            ? tr('nav.transfer_train.changing', 'Changing at {transferStn}', {'transferStn': p.station})
            : tr('nav.doors.off', 'Getting off at {stn}', {'stn': p.station});
    final at = p.numberAt != null ? ' ${tr('doors.tip.numberAt', 'The door number is {where}.', {'where': numberAtWords(p.numberAt)})}' : '';
    return '$head: ${parts.join('; ')}.$at';
  }

  // ---------- a station's platforms, for the live map's card ----------

  static String lineName(String l) {
    final v = Mrt.lineLabel('${l}L');
    return v == '${l}L' ? '$l Line' : v;
  }

  static Map<String, List<_P>> _directions() {
    final byDir = <String, List<_P>>{};
    for (final p in _platforms!) {
      (byDir[p.d] ??= []).add(p);
    }
    for (final l in byDir.values) {
      l.sort((a, b) => a.o - b.o);
    }
    return byDir;
  }

  static String _towardsFrom(List<_P> list, String here) {
    final end = list.last;
    if (list.first.n != end.n) return end.n;
    final at = list.where((q) => q.n == here).firstOrNull;
    return (at == null ? null : list.where((q) => q.o > at.o).firstOrNull?.n) ?? end.n;
  }

  static List<String> _leadsOf(Map f, Map<String, List<_P>> byDir, String here) {
    final out = <Object>[];
    final lines = <String, List<String>>{};
    for (final w in _ways(f)) {
      if (byDir.containsKey(w)) {
        final l = byDir[w]!.first.l;
        if (!lines.containsKey(l)) out.add((line: l));
        (lines[l] ??= []).add(w);
      } else {
        final text = w.toLowerCase() == 'exit' ? 'Exit' : w;
        if (!out.contains(text)) out.add(text);
      }
    }
    final words = out.map((x) {
      if (x is String) return x;
      final l = (x as ({String line})).line;
      final dirs = lines[l]!;
      if (dirs.length > 1) return lineName(l);
      return '${lineName(l)} towards ${_towardsFrom(byDir[dirs.first]!, here)}';
    }).toList();
    return words.isEmpty ? const ['Exit'] : words;
  }

  static List<Platform> station(List<String> codes) {
    if (_platforms == null) return const [];
    final want = codes.map((c) => c.toUpperCase()).toList();
    final byDir = _directions();
    final list = _platforms!.where((p) => want.contains(p.c.toUpperCase())).toList()
      ..sort((a, b) {
        final w = want.indexOf(a.c.toUpperCase()) - want.indexOf(b.c.toUpperCase());
        if (w != 0) return w;
        final d = a.d.compareTo(b.d);
        return d != 0 ? d : a.o - b.o;
      });
    return [
      for (final p in list)
        () {
          final dir = byDir[p.d] ?? [p];
          final end = dir.last;
          final next = dir.where((q) => q.o > p.o).firstOrNull;
          final max = _doorsOf[p.l] ?? 24;
          final groups = <String, DoorRow>{};
          for (final f in p.f) {
            final doors = _doors(f, max);
            if (doors.isEmpty) continue;
            final leads = _leadsOf(f, byDir, p.n);
            final key = '${f['t']}|${leads.join('/')}';
            final g = groups[key];
            groups[key] = DoorRow('${f['t']}', leads, ({...?g?.doors, ...doors}.toList()..sort()));
          }
          final rows = groups.values.toList()
            ..sort((a, b) {
              final r = _rank(a.type) - _rank(b.type);
              return r != 0 ? r : a.places.join(',').compareTo(b.places.join(','));
            });
          return Platform(
            code: p.c,
            line: p.l,
            lineName: lineName(p.l),
            towards: end.n,
            next: next?.n,
            last: next == null,
            rows: rows,
            numberAt: _numberAt(p),
            cross: [
              for (final d in p.x)
                if (byDir[d] != null) '${lineName(byDir[d]!.first.l)} towards ${_towardsFrom(byDir[d]!, p.n)}',
            ],
          );
        }(),
    ];
  }
}
