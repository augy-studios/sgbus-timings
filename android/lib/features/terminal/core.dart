// sgbus's commands, as the site's js/sgbus-core.js has them (the same file the Linux command
// line runs), over the app's own data: a stop's timings, search, a bus's route, the route
// planner, Navigate, favourites, places, routines, service alerts, the weather, your calendar
// and settings, read from the words typed and printed as lines of text, so the app's terminal
// says what the site's and the command line's say. In English, as they are.
//
// Colours are marked with two private-use characters (mark), and the screen draws them as
// styled text; every other control character is taken out of what's printed first, so a
// stop's name, an alert or a calendar event's title can't fake anything but a colour.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import '../../api/api.dart';
import '../../data/arrivals.dart';
import '../../data/calendar.dart';
import '../../data/favs.dart';
import '../../data/journeys.dart';
import '../../data/mrt.dart';
import '../../data/network.dart';
import '../../data/places.dart';
import '../../data/search.dart';
import '../../data/stations.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../native/native_bridge.dart';
import '../reminders/reminders.dart';

class Fail implements Exception {
  Fail(this.message);
  final String message;
  @override
  String toString() => message;
}

/// What a command was given: its words, and its options.
typedef Opts = Map<String, Object>;

class SgbusCore {
  SgbusCore({required this.out, required this.clear, required this.version});

  final void Function(String text) out;
  final void Function() clear;
  final String version;

  static const bot = '@sgbus_app';
  static const site = 'sgbus.uwuapps.org';
  static const maxRoutines = 20;
  static const nearby = 8;
  static const savedIn = "this phone, as the app's own favourites, places and settings";
  static const stopKey = 'Stop';

  // ---------- the screen ----------

  static const open = '\u{E000}';
  static const shut = '\u{E001}';
  static String Function(Object) paint(String code) => (s) => '$open$code$shut$s${open}0$shut';
  static final bold = paint('1');
  static final dim = paint('2');
  static final green = paint('32');
  static final yellow = paint('33');
  static final red = paint('31');
  static final blue = paint('34');
  static final magenta = paint('35');
  static final cyan = paint('36');
  static final _marks = RegExp('$open[0-9;]*$shut');
  static String visible(String s) => s.replaceAll(_marks, '');
  static String pad(String s, int n) => s + ' ' * math.max(0, n - visible(s).length);
  // Every control character but a new line and a tab, the ones that turn text around, and the
  // marks themselves, which only the commands put in.
  static final _controls = RegExp('[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]');
  static String clean(Object? s) => '$s'.replaceAll(_controls, '').replaceAll(open, '').replaceAll(shut, '');

  void _out(List<String> lines) => out(lines.join('\n'));
  void note(String text) => out(text);
  static String plural(int n, String word, [String? many]) => '$n ${n == 1 ? word : (many ?? '${word}s')}';
  static String listText(List<String> items) =>
      items.length > 1 ? '${items.sublist(0, items.length - 1).join(', ')} and ${items.last}' : (items.isEmpty ? '' : items.first);

  // ---------- the site ----------

  static Future<Object?> get(String path, {Map<String, Object?>? query, int timeout = 20000}) async {
    try {
      return await Api.get(path, query: query, timeout: Duration(milliseconds: timeout));
    } on ApiError catch (e) {
      throw Fail(e.message);
    } catch (_) {
      throw Fail("Couldn't reach $site. Check your connection, then try again.");
    }
  }

  static Future<void> _stops() async {
    try {
      await Stops.load();
    } catch (_) {
      throw Fail("Couldn't reach $site. Check your connection, then try again.");
    }
  }

  static String? nameOf(String code) {
    final n = Stops.nameOf(code);
    return n.isEmpty ? null : clean(n);
  }

  static String stopText(String code) => nameOf(code) != null ? '${nameOf(code)} ($code)' : code;

  static bool get _restricted => Store.I.get('sgbus_restricted') == 'on';
  static String get _customs {
    final v = Store.I.get('sgbus_customs');
    return const ['15', '30', '45', '60'].contains(v) ? v! : 'auto';
  }

  /// The bus network, for routes, the planner and first and last buses, with Settings'
  /// Restricted areas.
  static Future<void> network() async {
    await _stops();
    try {
      await BusNet.load();
    } catch (_) {
      throw Fail("Couldn't reach $site. Check your connection, then try again.");
    }
    BusNet.setOpenAccess(_restricted);
  }

  // ---------- a stop's timings ----------

  static String? busFilter(String text) {
    final parts = text.toUpperCase().split(RegExp(r'[\s,]+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty || !parts.every((p) => RegExp(r'^[0-9A-Z]{1,4}$|^[0-9A-Z]{1,3}\*$').hasMatch(p))) return null;
    return {...parts}.join(',');
  }

  static bool busFilterHas(String filter, String no) =>
      filter.split(',').any((p) => p.endsWith('*') ? no.startsWith(p.substring(0, p.length - 1)) : no == p);
  static String? oneBus(String? filter) => filter != null && RegExp(r'^[0-9A-Z]{1,4}$').hasMatch(filter) ? filter : null;

  static final _tones = [blue, magenta, cyan];

  static String etaCell(Bus? bus) {
    final eta = bus?.etaNow;
    if (bus == null || eta == null) return dim(pad('-', 7));
    final min = eta ~/ 60000;
    final text = pad(min < 1 ? 'Arr' : '$min min', 7);
    final load = (bus.load ?? '').toUpperCase();
    return load == 'LSD' ? red(text) : load == 'SDA' ? yellow(text) : green(text);
  }

  static String firstLastText(String no, String code) {
    final fl = BusNet.ready ? BusNet.firstLast(no, code) : null;
    if (fl == null) return '';
    if (fl.first == '-' && fl.last == '-') return 'no ${fl.label == 'Weekday' ? 'weekday' : fl.label == 'Sat' ? 'Saturday' : 'Sunday'} service';
    return '${fl.label}: first ${fl.first} · last ${fl.last}';
  }

  static const _decks = {'Single': 'single', 'Double': 'double', 'Bendy': 'bendy', 'SD': 'single', 'DD': 'double', 'BD': 'bendy'};

  /// The stop's lines, ready to print, or its data with --json.
  Future<List<String>> stopTimings(String code, String? filter, Opts opts) async {
    await _stops();
    final raw = await get('bus-arrivals', query: {'stop': code});
    final data = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    try {
      await network();
    } catch (_) {
      // First and last buses are left out.
    }
    final split = Ways.of(Arrivals.from(data, code).services);
    final ways = split.ways;
    final favBuses = Favs.I.buses().toSet();
    var services = [...split.services]..sort((a, b) => byNumber(a.serviceNo, b.serviceNo));
    if (filter != null) services = services.where((s) => busFilterHas(filter, s.serviceNo)).toList();
    services = Favs.pinned(services, favBuses, Favs.I.pin('bus'), (s) => s.serviceNo);
    final where = Stops.of(code);
    if (opts['json'] != null) {
      final rawServices = [for (final s in (data['services'] as List? ?? const [])) if (s is Map && (filter == null || busFilterHas(filter, '${s['serviceNo']}'))) s];
      return [const JsonEncoder.withIndent('  ').convert({'stop': code, 'name': where?.name, 'road': where?.road ?? '', 'services': rawServices})];
    }

    final lines = <String>[];
    lines.add('${bold(clean(where?.name ?? 'Bus stop'))} ${dim('($code)')}${(where?.road ?? '').isNotEmpty ? '  ${dim(clean(where!.road))}' : ''}'
        '${filter != null ? '  ${cyan(filter.split(',').join(', '))}' : ''}');
    final restricted = BusNet.ready ? BusNet.restricted(code) : null;
    if (restricted != null) {
      lines.add(yellow('Authorised personnel only: ${restricted.through ? "at ${restricted.place()}, the public can't get on or off here" : "inside ${restricted.place()}, the public can't get on, off or ride through"}.'));
    }
    final border = BusNet.crossBorder(code);
    if (border != null) lines.add(yellow('${border.label()}. ${border.note()}'));
    if (services.isEmpty) {
      lines.add(dim(filter != null
          ? 'No live arrivals for ${filter.contains(',') || filter.contains('*') ? 'buses $filter' : 'bus $filter'} right now.'
          : 'No live buses right now.'));
      final one = oneBus(filter);
      if (one != null) {
        final fl = firstLastText(one, code);
        if (fl.isNotEmpty) lines.add(dim(fl));
      }
      return lines;
    }
    final width = services.map((s) => s.serviceNo.length).reduce(math.max) + 2;
    for (final s in services) {
      final way = ways[s];
      final no = '${favBuses.contains(s.serviceNo) ? yellow('*') : ' '}${bold(pad(s.serviceNo, width))}';
      final etas = [for (var i = 0; i < 3; i++) etaCell(i < s.buses.length ? s.buses[i] : null)].join(' ');
      lines.add('$no$etas${way != null ? '  ${_tones[way.tone % 3](clean(way.short))}' : ''}');
      if (opts['details'] != null) {
        final decks = [for (final b in s.buses.whereType<Bus>()) _decks[b.deck] ?? (b.deck.isEmpty ? '?' : b.deck)];
        final fl = firstLastText(s.serviceNo, code);
        lines.add(dim('${' ' * (width + 1)}${[s.operator ?? '', decks.join(', '), fl].where((x) => x.isNotEmpty).join(' · ')}'));
      }
    }
    return lines;
  }

  Future<void> showStop(String code, String? filter, Opts opts) async {
    if (opts['watch'] == null) return _out(await stopTimings(code, filter, opts));
    return watch(() => stopTimings(code, filter, opts), opts['watch']);
  }

  // -w: lines drawn afresh every so often, until stopped.
  void Function()? _stopWatching;
  bool get watching => _stopWatching != null;
  void stopWatching() => _stopWatching?.call();

  Future<void> watch(Future<List<String>> Function() draw, Object? seconds) async {
    final every = math.max(10, int.tryParse('$seconds') ?? 30);
    var stopped = false;
    Completer<void>? wake;
    _stopWatching = () {
      stopped = true;
      if (wake != null && !wake.isCompleted) wake.complete();
    };
    try {
      while (!stopped) {
        List<String> lines;
        try {
          lines = await draw();
        } on Fail catch (e) {
          lines = [red(e.message)];
        } catch (e) {
          lines = [red('$e')];
        }
        if (stopped) break;
        clear();
        _out([...lines, '', dim('Updated ${When.clock(When.nowMs())}. Every ${every}s; $stopKey to stop.')]);
        final w = wake = Completer<void>();
        final t = Timer(Duration(seconds: every), () {
          if (!w.isCompleted) w.complete();
        });
        await w.future;
        t.cancel();
      }
    } finally {
      _stopWatching = null;
    }
  }

  // ---------- finding stops ----------

  static Future<({List<({String code, String name, String road, double? distance})> stops, String note})> matchStops(String q,
      [int limit = 20]) async {
    await _stops();
    try {
      await Stations.load();
    } catch (_) {
      // Stations' stops are left out.
    }
    final found = StopSearch.match(q, limit: limit);
    return (
      stops: [for (final h in found.stops) (code: h.stop.code, name: clean(h.stop.name), road: clean(h.stop.road), distance: h.distance)],
      note: found.note,
    );
  }

  static List<({String code, String name, String road, double? distance})> nearestStops(double lat, double lng, [int limit = nearby]) => [
        for (final n in Stops.near(lat, lng, limit: limit)) (code: n.stop.code, name: clean(n.stop.name), road: clean(n.stop.road), distance: n.metres)
      ];

  static List<String> stopListLines(String title, List<({String code, String name, String road, double? distance})> list, [String extra = '']) {
    final favs = {for (final f in Favs.I.stops()) f.code};
    final ordered = list.any((s) => s.distance != null) ? list : Favs.pinned(list, favs, Favs.I.pin('stop'), (s) => s.code);
    return [
      bold(title),
      if (extra.isNotEmpty) dim(extra),
      for (final s in ordered)
        '${favs.contains(s.code) ? yellow('*') : ' '}${cyan(s.code)}  ${pad(s.name, 28)} ${dim(s.road)}${s.distance != null ? dim('  ${s.distance!.round()} m') : ''}',
    ];
  }

  static Future<({String address, double lat, double lng})> postalPlace(String code) async {
    final p = await get('postal-code', query: {'code': code});
    if (p is! Map || p['lat'] is! num || p['lng'] is! num) throw Fail('No address has the postal code $code.');
    return (address: clean(p['address'] ?? code), lat: (p['lat'] as num).toDouble(), lng: (p['lng'] as num).toDouble());
  }

  static final _latLng = RegExp(r'^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$');

  /// A saved place by its name: Home, Work, or one of your own.
  static Map<String, dynamic>? savedPlace(String text) {
    final t = text.trim().toLowerCase();
    if (t == 'home' || t == 'work') {
      final p = Places.fixed(t);
      return p == null ? null : {...p, 'label': p['label'] ?? t};
    }
    for (final p in Places.custom()) {
      if ('${p['name'] ?? ''}'.toLowerCase() == t) return p;
    }
    return null;
  }

  /// One stop for the route planner's ends: a code, a saved place's stop (or the nearest), the
  /// stop nearest a postal code, or the best match for what's typed. Says which it picked.
  Future<String> resolveStop(String text, String field) async {
    await _stops();
    final t = text.trim();
    if (RegExp(r'^\d{5}$').hasMatch(t)) {
      if (Stops.of(t) == null) throw Fail("There's no bus stop $t.");
      return t;
    }
    final saved = savedPlace(t);
    if (saved != null) {
      if (saved['stop'] is String) return saved['stop'] as String;
      final near = nearestStops((saved['lat'] as num).toDouble(), (saved['lng'] as num).toDouble(), 1);
      if (near.isNotEmpty) return near.first.code;
    }
    if (RegExp(r'^\d{6}$').hasMatch(t)) {
      final p = await postalPlace(t);
      final near = nearestStops(p.lat, p.lng, 1);
      if (near.isEmpty) throw Fail('No stop near ${p.address}.');
      note(dim('$field: ${stopText(near.first.code)}, the nearest stop to ${p.address}'));
      return near.first.code;
    }
    final found = (await matchStops(t, 5)).stops;
    if (found.isEmpty) throw Fail('No stop matched "${clean(t)}" for the ${field.toLowerCase()}.');
    if (found.length > 1) note(dim('$field: ${stopText(found.first.code)}. Others: ${found.skip(1).map((s) => stopText(s.code)).join(', ')}'));
    return found.first.code;
  }

  // ---------- a bus's route ----------

  Future<void> showBus(String raw, Opts opts) async {
    await network();
    final no = raw.toUpperCase();
    if (!BusNet.hasService(no)) throw Fail('No route found for bus ${clean(no)}.');
    final dirs = BusNet.directions(no);
    final from = opts['from'] != null ? await resolveStop('${opts['from']}', 'From') : null;
    final dir = opts['dir'] != null ? (int.tryParse('${opts['dir']}') ?? -1) : (from != null ? (BusNet.directionAt(no, from) ?? dirs.first) : dirs.first);
    if (!dirs.contains(dir)) throw Fail('Bus $no runs ${dirs.length == 1 ? 'one way' : 'directions ${dirs.join(' and ')}'}.');
    var codes = BusNet.runStops(no, dir);
    if (from != null) codes = BusNet.onwardFrom(no, from, dir).stops;
    final info = BusNet.serviceInfo(no);
    final t = BusNet.terminals(no, dir);
    if (opts['json'] != null) {
      return out(const JsonEncoder.withIndent('  ').convert({
        'bus': no,
        'dir': dir,
        'operator': info?.op,
        'stops': [for (final c in codes) {'code': c, 'name': nameOf(c)}],
      }));
    }
    String n(String? c) => c == null ? '?' : (nameOf(c) ?? c);
    final ends = t.loop.isNotEmpty || t.origin == t.dest ? 'Loop from ${n(t.origin)}${t.loop.isNotEmpty ? ', round ${clean(t.loop)}' : ''}' : '${n(t.origin)} → ${n(t.dest)}';
    final lines = ['${bold('Bus $no')} ${dim(info?.op ?? '')}  $ends${dirs.length > 1 ? dim('  (direction $dir of ${dirs.length}; --dir to switch)') : ''}'];
    final marks = BusNet.landmarks(codes);
    if (marks.isNotEmpty) lines.add(dim('Via ${marks.map(clean).join(' · ')}'));
    if (from != null) lines.add(dim('From ${stopText(from)} on, ${plural(codes.length - 1, 'stop')}:'));
    for (var i = 0; i < codes.length; i++) {
      final c = codes[i];
      final r = BusNet.restricted(c);
      final b = BusNet.crossBorder(c);
      lines.add('${dim('${i + 1}'.padLeft(3))}  ${cyan(c)}  ${pad(nameOf(c) ?? '?', 28)} ${dim(clean(Stops.of(c)?.road ?? ''))}'
          '${r != null ? yellow('  authorised only') : b != null ? yellow('  ${b.label().toLowerCase()}') : ''}');
    }
    _out(lines);
  }

  // ---------- times ----------

  static const _weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  static String _ymd(DateTime d) => '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';

  /// Leave at or arrive by a time, as the site has it, in Singapore's time, or null for now.
  static WhenPick? parseWhen(Opts opts) {
    final mode = opts['arrive'] != null ? 'arrive' : opts['leave'] != null ? 'leave' : null;
    if (mode == null) return null;
    final m = RegExp(r'^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$').firstMatch('${opts[mode]}'.trim().toLowerCase());
    if (m == null) throw Fail('--$mode wants a time, like 08:30 or 6:45pm.');
    var h = int.parse(m[1]!);
    final min = int.parse(m[2] ?? '0');
    if (m[3] == 'pm' && h < 12) h += 12;
    if (m[3] == 'am' && h == 12) h = 0;
    if (h > 23 || min > 59) throw Fail("${clean(opts[mode])} isn't a time.");
    final sgNow = DateTime.fromMillisecondsSinceEpoch(When.nowMs() + 8 * 3600000, isUtc: true);
    var day = DateTime.utc(sgNow.year, sgNow.month, sgNow.day);
    final d = '${opts['day'] ?? ''}'.toLowerCase();
    if (d == 'tomorrow') {
      day = day.add(const Duration(days: 1));
    } else if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(d)) {
      final parsed = DateTime.tryParse('${d}T00:00:00Z');
      if (parsed == null) throw Fail('--day wants today, tomorrow, a weekday or a date like 2026-10-24.');
      day = parsed;
    } else if (d.length >= 3 && _weekdays.contains(d.substring(0, 3))) {
      final ahead = (_weekdays.indexOf(d.substring(0, 3)) - day.weekday % 7 + 7) % 7;
      day = day.add(Duration(days: ahead));
    } else if (d.isNotEmpty && d != 'today') {
      throw Fail('--day wants today, tomorrow, a weekday or a date like 2026-10-24.');
    }
    final clock = '${'$h'.padLeft(2, '0')}:${'$min'.padLeft(2, '0')}';
    final at = '${_ymd(day)}T$clock';
    // A time gone today, with no day given: tomorrow's.
    if (d.isEmpty && (When.atToMs(at) ?? 0) < When.nowMs() - 2 * 60000) {
      return WhenPick(mode, '${_ymd(day.add(const Duration(days: 1)))}T$clock');
    }
    return WhenPick(mode, at);
  }

  // ---------- the route planner: bus only, stop to stop ----------

  Future<void> routePlan(String a, String b, Opts opts) async {
    await network();
    final start = await resolveStop(a, 'Start');
    final end = await resolveStop(b, 'End');
    if (start == end) throw Fail('A route needs two different bus stops.');
    final when = parseWhen(opts);
    final late = When.problem(when);
    if (late != null) throw Fail(late);
    final timing = (mode: when?.mode ?? 'leave', ms: when != null ? When.atToMs(when.at)! : When.nowMs());
    final then = when != null ? 'at that time' : 'right now';
    final own = _customs;
    final crossMs = timing.ms + (timing.mode == 'arrive' ? -1 : 1) * 45 * 60000;
    BusNet.setCustoms(own == 'auto' ? When.customsMin('out', crossMs) : int.parse(own), own == 'auto' ? When.customsMin('in', crossMs) : int.parse(own));
    bool abroad(String code) => BusNet.crossBorder(code)?.abroad ?? false;
    final customsLine = abroad(start) == abroad(end)
        ? <String>[]
        : [dim('Counts ~${BusNet.customs[abroad(end) ? 'out' : 'in']} min to clear immigration at both checkpoints${own == 'auto' ? ', by the time of day' : ''} (sgbus settings customs).')];

    if (opts['save'] != null) {
      final routes = Favs.I.routes();
      if (!routes.any((r) => r['start'] == start && r['end'] == end)) {
        Favs.I.setRoutes([...routes, {'start': start, 'startName': nameOf(start) ?? start, 'end': end, 'endName': nameOf(end) ?? end}]);
      }
      note(dim('Saved: sgbus routes lists it.'));
    }

    final head = '${bold(stopText(start))} → ${bold(stopText(end))}  ${dim(When.describe(when))}';
    final rides = Journeys.directRides(start, end, timing);
    final running = rides.where((r) => r.running).toList();
    final idle = [for (final r in rides) if (!r.running) r.bus];
    final idleLine = idle.isNotEmpty ? [dim('Not running $then: ${listText(idle)}.')] : <String>[];

    if (running.isNotEmpty) {
      if (opts['json'] != null) {
        return out(const JsonEncoder.withIndent('  ').convert({
          'start': start,
          'end': end,
          'when': when?.toJson(),
          'direct': [for (final r in running) {'bus': r.bus, 'minutes': r.minutes, 'running': r.running}],
        }));
      }
      final lines = [head, '${plural(running.length, 'bus', 'buses')} ${running.length == 1 ? 'runs' : 'run'} straight between these stops${when != null ? ' at that time' : ''}:'];
      Arrivals? live;
      if (when == null) {
        try {
          final raw = await get('bus-arrivals', query: {'stop': start});
          if (raw is Map) live = Arrivals.from(Map<String, dynamic>.from(raw), start);
        } catch (_) {}
      }
      final favs = Favs.I.buses().toSet();
      for (final r in Favs.pinned(running, favs, Favs.I.pin('bus'), (x) => x.bus)) {
        final svc = live?.services.where((s) => s.serviceNo == r.bus).firstOrNull;
        final etas = svc != null ? [for (var i = 0; i < 3; i++) etaCell(i < svc.buses.length ? svc.buses[i] : null)].join(' ') : '';
        lines.add('  ${bold(pad(r.bus, 5))} ~${r.minutes.round()} min ride  $etas');
      }
      if (when != null) {
        final ms = When.atToMs(when.at)!;
        final totals = [for (final r in running) ((r.minutes + When.busWaitMin) * 60000).round()];
        final fast = totals.reduce(math.min), slow = totals.reduce(math.max);
        lines.add(when.mode == 'leave'
            ? "Leave at ${When.clockDay(ms)} and you'd get in around ${When.clock(ms + fast)}${fast != slow ? ' to ${When.clock(ms + slow)}' : ''}, counting an average wait."
            : 'To arrive by ${When.clockDay(ms)}, leave around ${When.clock(ms - slow)}${fast != slow ? ' to ${When.clock(ms - fast)}' : ''}, counting an average wait.');
      }
      return _out([...lines, ...idleLine, ...customsLine]);
    }

    final none = idle.isNotEmpty ? 'No bus runs straight between these stops $then.' : 'No single bus links these two stops.';
    final journeys = Journeys.findJourneys(start, end, timing: timing);
    if (opts['json'] != null) {
      return out(const JsonEncoder.withIndent('  ').convert({
        'start': start,
        'end': end,
        'when': when?.toJson(),
        'journeys': [for (final j in journeys) [for (final l in j) l.toJson()]],
      }));
    }
    if (journeys.isEmpty) return _out([head, '$none No journey with up to three changes runs $then either. Try another time, or other stops.', ...idleLine]);
    final lines = [head];
    final fixes = Journeys.wrongSideEnds(start, end);
    for (final (field, verb) in const [('start', 'leave from'), ('end', 'stop at')]) {
      final f = fixes[field];
      if (f != null) {
        lines.add(yellow('Wrong side of the road? The quickest buses $verb ${stopText(f.code)}, across the road from your $field, ~${f.metres.round()} m away.'));
      }
    }
    lines.add('${none.replaceFirst(RegExp(r'\.$'), '')}, but these get there with a short walk or a change:');
    for (var i = 0; i < journeys.length; i++) {
      final legs = journeys[i];
      final clock = Journeys.journeyClock(legs, start, end);
      var time = '~${(Journeys.journeyMinutes(legs, start, end) ?? 0).round()} min';
      if (when != null && clock != null) {
        final span = When.span(when, clock.total);
        time = '${When.clock(span.leave)} → ${When.clock(span.arrive)}';
      }
      lines.add('${dim('${i + 1}.')} ${legs.map((l) => bold(l.bus)).join(dim(' → '))}  $time · ${plural(legs.length - 1, 'change')}');
      lines.add(dim('   ${journeyDetail(legs, start, end)}'));
    }
    lines.addAll([...idleLine, ...customsLine, dim(when != null ? 'Times are rough estimates from distance, counting an average wait for each bus.' : Journeys.estimateNote())]);
    final show = int.tryParse('${opts['show'] ?? 0}') ?? 0;
    if (show != 0) {
      lines.addAll(['', ...await journeySteps(show >= 1 && show <= journeys.length ? journeys[show - 1] : null, start, end, when)]);
    } else {
      lines.add(dim('--show N for a journey step by step.'));
    }
    _out(lines);
  }

  static String journeyDetail(List<Leg> legs, String start, String end) {
    final parts = <String>[];
    if (legs.first.from != start) parts.add('From ${nameOf(legs.first.from) ?? legs.first.from}');
    final changes = [for (final l in legs.sublist(0, legs.length - 1)) nameOf(l.to) ?? l.to];
    if (changes.isNotEmpty) parts.add('change${changes.length > 1 ? 's' : ''} at ${listText(changes)}');
    if (legs.last.to != end) parts.add('off at ${nameOf(legs.last.to) ?? legs.last.to}');
    final text = parts.join(', ');
    return text.isNotEmpty ? text[0].toUpperCase() + text.substring(1) : 'Walk to a stop nearby';
  }

  /// A crossing of the Causeway on a ride: off, through both checkpoints, and on again.
  static String crossingLine(({String way, String from, String to, int minutes}) c) {
    final (first, second) = c.way == 'out' ? ("Singapore's", "Malaysia's") : ("Malaysia's", "Singapore's");
    return yellow('  Get off at ${stopText(c.from)} and clear $first immigration, ride any bus across to ${stopText(c.to)} and clear $second, then get on again: ~${c.minutes} min for both');
  }

  static Future<Arrivals?> _arrivals(String code) async {
    try {
      final raw = await get('bus-arrivals', query: {'stop': code});
      return raw is Map ? Arrivals.from(Map<String, dynamic>.from(raw), code) : null;
    } catch (_) {
      return null;
    }
  }

  static String _next(ServiceArrivals s) => [for (var i = 0; i < 3; i++) etaCell(i < s.buses.length ? s.buses[i] : null)].join(' ');

  /// One journey leg by leg, with each bus's live timings where you set off now.
  Future<List<String>> journeySteps(List<Leg>? legs, String start, String end, WhenPick? when) async {
    if (legs == null) throw Fail('There is no journey with that number.');
    final clock = Journeys.journeyClock(legs, start, end);
    if (clock == null) throw Fail('There is no journey with that number.');
    final leaveMs = when != null ? When.span(when, clock.total).leave : When.nowMs();
    final live = when == null || When.liveLead(leaveMs) != null;
    final arrivals = live ? await Future.wait(legs.map((l) => _arrivals(l.from))) : <Arrivals?>[];
    final lines = <String>[];
    if (when != null) lines.add('Set off around ${When.clockDay(leaveMs)}${when.mode == 'arrive' ? ' to arrive by ${When.clock(When.atToMs(when.at)!)}' : ''}.');
    var here = start;
    for (var k = 0; k < legs.length; k++) {
      final leg = legs[k];
      final walk = Journeys.walkDetails(here, leg.from);
      if (walk != null) lines.add('  Walk ~${walk.metres.round()} m to ${stopText(leg.from)}, ~${walk.minutes.round()} min');
      final d = Journeys.legDetails(leg);
      lines.add('  ${bold('Bus ${leg.bus}')} from ${stopText(leg.from)} to ${stopText(leg.to)}, ${plural(d?.stops ?? 0, 'stop')}, ~${(d?.minutes ?? 0).round()} min');
      if (live) {
        final svc = arrivals[k]?.services.where((s) => s.serviceNo == leg.bus).firstOrNull;
        lines.add(svc != null ? '    Next: ${_next(svc)}' : dim('    No live timings for this bus right now.'));
      } else {
        lines.add(dim('    Board around ${When.clock(leaveMs + (clock.boards[k] * 60000).round())}, after an average wait.'));
      }
      lines.addAll(Journeys.legCrossings(leg).map(crossingLine));
      here = leg.to;
    }
    final last = Journeys.walkDetails(here, end);
    if (last != null) lines.add('  Walk ~${last.metres.round()} m to ${stopText(end)}, ~${last.minutes.round()} min');
    lines.add('  Arrive around ${bold(When.clockDay(leaveMs + (clock.total * 60000).round()))}, counting an average wait for each bus.');
    return lines;
  }

  // ---------- Navigate: anywhere to anywhere, by bus and train ----------

  /// A place for Navigate's ends: a saved place, a point, a stop's code, a postal code, or the
  /// best of /api/places for what's typed.
  Future<({String label, double lat, double lng, String? stop})> resolvePlace(String text, String field) async {
    final t = text.trim();
    final saved = savedPlace(t);
    if (saved != null) {
      return (
        label: clean(saved['name'] ?? saved['label'] ?? t),
        lat: (saved['lat'] as num).toDouble(),
        lng: (saved['lng'] as num).toDouble(),
        stop: null,
      );
    }
    final ll = _latLng.firstMatch(t);
    if (ll != null) return (label: '${ll[1]},${ll[2]}', lat: double.parse(ll[1]!), lng: double.parse(ll[2]!), stop: null);
    if (RegExp(r'^\d{5}$').hasMatch(t)) {
      await _stops();
      final s = Stops.of(t);
      if (s == null || s.lat == null || s.lng == null) throw Fail("There's no bus stop $t.");
      return (label: clean(s.name), lat: s.lat!, lng: s.lng!, stop: t);
    }
    if (RegExp(r'^\d{6}$').hasMatch(t)) {
      final p = await postalPlace(t);
      return (label: p.address, lat: p.lat, lng: p.lng, stop: null);
    }
    final found = await get('places', query: {'q': t});
    final list = found is List ? [for (final f in found) if (f is Map && f['lat'] is num && f['lng'] is num) f] : const <Map>[];
    if (list.isEmpty) {
      throw Fail('Nothing matched "${clean(t)}" for ${field.toLowerCase()}. Try an address, a building, a postal code, a station, a stop, coordinates or a plus code.');
    }
    final f = list.first;
    if (list.length > 1) note(dim('$field: ${clean(f['label'])}${f['sub'] != null && '${f['sub']}'.isNotEmpty ? ', ${clean(f['sub'])}' : ''}'));
    return (
      label: clean(f['label'] ?? t),
      lat: (f['lat'] as num).toDouble(),
      lng: (f['lng'] as num).toDouble(),
      stop: f['kind'] == 'stop' ? '${f['code']}' : null,
    );
  }

  static String coord(({String label, double lat, double lng, String? stop}) p) => '${p.lat.toStringAsFixed(6)},${p.lng.toStringAsFixed(6)}';
  static String _coordOf(Map p) => '${(p['lat'] as num).toStringAsFixed(6)},${(p['lng'] as num).toStringAsFixed(6)}';

  Future<void> navPlan(String fromText, String toText, Opts opts) async {
    final from = await resolvePlace(fromText, 'From');
    final to = await resolvePlace(toText, 'To');
    final via = opts['via'] != null ? await resolvePlace('${opts['via']}', 'Via') : null;
    final when = parseWhen(opts);
    final late = When.problem(when);
    if (late != null) throw Fail(late);
    if (opts['save'] != null) {
      final navs = Favs.I.navs();
      Map<String, Object> end(({String label, double lat, double lng, String? stop}) p) => {'label': p.label, 'lat': p.lat, 'lng': p.lng};
      bool same(Object? a, ({String label, double lat, double lng, String? stop})? b) =>
          a is Map && b != null ? _coordOf(a) == coord(b) : a == null && b == null;
      if (!navs.any((n) => same(n['from'], from) && same(n['to'], to) && same(n['via'], via))) {
        Favs.I.setNavs([...navs, {'from': end(from), 'to': end(to), if (via != null) 'via': end(via)}]);
      }
      note(dim('Saved: sgbus navs lists it.'));
    }
    final own = _customs;
    final raw = await get('nav', query: {
      'from': coord(from),
      'to': coord(to),
      if (via != null) 'via': coord(via),
      if (when != null) 'when': when.mode,
      if (when != null) 'at': when.at,
      if (_restricted) 'restricted': '1',
      if (own != 'auto') 'customs': own,
    }, timeout: 60000);
    final data = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    if (opts['json'] != null) {
      Map<String, Object?> p(({String label, double lat, double lng, String? stop}) x) => {'label': x.label, 'lat': x.lat, 'lng': x.lng, if (x.stop != null) 'stop': x.stop};
      return out(const JsonEncoder.withIndent('  ').convert({'from': p(from), 'to': p(to), if (via != null) 'via': p(via), ...data}));
    }
    final options = [for (final o in (data['options'] as List? ?? const [])) if (o is Map) Map<String, dynamic>.from(o)];
    final lines = ['${bold(from.label)} → ${via != null ? '${bold(via.label)} → ' : ''}${bold(to.label)}  ${dim(When.describe(when))}'];
    if (options.isEmpty) return _out([...lines, 'No way by bus or train found between those two. Try a time when buses are running, or somewhere nearer a stop.']);
    final alertLines = (data['alerts'] is Map ? (data['alerts']['lines'] as List?) : null) ?? const [];
    if (alertLines.isNotEmpty) lines.add(red('Train trouble now on ${alertLines.map(clean).join(', ')}: see sgbus alerts.'));
    lines.add('${plural(options.length, 'way')} to get there, quickest first:');
    final whenMs = (data['when'] is Map ? (data['when']['ms'] as num?)?.toInt() : null) ?? When.nowMs();
    for (var i = 0; i < options.length; i++) {
      final o = options[i];
      final legs = [for (final l in (o['legs'] as List? ?? const [])) if (l is Map) l];
      final rides = legs.where((l) => l['mode'] != 'walk').toList();
      final walked = legs.where((l) => l['mode'] == 'walk').fold<num>(0, (sum, l) => sum + ((l['metres'] as num?) ?? 0));
      final walkOnly = o['walkOnly'] == true;
      final chips = walkOnly ? 'Walk' : rides.map((l) => l['mode'] == 'train' ? lineChip(l) : bold(clean(l['route']))).join(dim(' → '));
      final minutes = ((o['minutes'] as num?) ?? 0).toDouble();
      String time;
      if (when != null) {
        final leave = when.mode == 'arrive' ? whenMs - (minutes * 60000).round() : whenMs;
        time = '${When.clock(leave)} → ${When.clock(leave + (minutes * 60000).round())}';
      } else {
        time = '~${minutes.round()} min';
      }
      final changes = math.max(0, rides.length - 1);
      lines.add('${dim('${i + 1}.')} $chips  $time · ${walkOnly ? '${walked.round()} m' : '${changes != 0 ? plural(changes, 'change') : 'No change'} · ${walked.round()} m walk'}'
          '${o['disrupted'] == true ? red('  disrupted') : ''}${o['onemapMinutes'] != null ? dim('  OneMap ~${o['onemapMinutes']} min') : ''}');
    }
    final pick = math.min(options.length, math.max(1, int.tryParse('${opts['way'] ?? 1}') ?? 1));
    lines.addAll(['', bold('Way $pick:'), ...await waySteps(options[pick - 1], when, to.label, via?.label)]);
    if (options.length > 1) lines.add(dim('--way N for another one step by step.'));
    _out(lines);
  }

  static final Map<String, String Function(Object)> _lineColours = {
    'EW': green, 'CG': green, 'NS': red, 'NE': magenta, 'CC': yellow, 'DT': blue, 'TE': paint('33;2'),
  };
  static String lineChip(Map l) => (_lineColours['${l['route']}'] ?? cyan)(bold(clean(l['route'])));

  // OneMap's ways name things in capitals: "PASIR RIS MRT STATION".
  static String tidyName(Object? raw) {
    final name = clean(raw ?? '');
    if (RegExp('[a-z]').hasMatch(name)) return name;
    return name
        .toLowerCase()
        .replaceAllMapped(RegExp(r'\b[a-z]'), (m) => m[0]!.toUpperCase())
        .replaceAllMapped(RegExp(r'\b(Mrt|Lrt)\b'), (m) => m[0]!.toUpperCase());
  }

  static String placeLabel(Object? p) {
    if (p is! Map) return '';
    final code = p['code'] as String?;
    if (code != null && Stops.of(code) != null) return stopText(code);
    final name = tidyName(p['name']);
    return code != null && p['kind'] != 'place' ? '$name (${clean(code)})' : name;
  }

  Future<List<String>> waySteps(Map o, WhenPick? when, String endLabel, [String? viaLabel]) async {
    try {
      await _stops();
    } catch (_) {}
    final lines = <String>[];
    final legs = [for (final l in (o['legs'] as List? ?? const [])) if (l is Map) l];
    final buses = [for (final l in legs) if (l['mode'] == 'bus' && l['from'] is Map && l['from']['code'] != null) l];
    final live = when != null ? <Arrivals?>[] : await Future.wait(buses.map((l) => _arrivals('${l['from']['code']}')));
    for (var i = 0; i < legs.length; i++) {
      final l = legs[i];
      final minutes = ((l['minutes'] as num?) ?? 0).round();
      if (l['mode'] == 'walk') {
        final metres = (l['metres'] as num?) ?? 0;
        if (metres < 20) continue;
        final next = i + 1 < legs.length ? legs[i + 1] : null;
        final toMap = l['to'] is Map ? l['to'] as Map : null;
        final to = toMap?['via'] == true
            ? (viaLabel ?? 'your stop')
            : toMap != null && toMap['kind'] != 'place'
                ? placeLabel(toMap)
                : next != null
                    ? placeLabel(next['from'])
                    : endLabel;
        final fromExit = l['fromExit'] is Map ? l['fromExit']['name'] : null;
        final toExit = l['toExit'] is Map ? l['toExit']['name'] : null;
        if (fromExit != null) {
          final left = placeLabel(l['from'] ?? (i > 0 ? legs[i - 1]['to'] : null));
          lines.add('  Leave ${left.isNotEmpty ? left : 'the station'} by Exit ${clean(fromExit)}');
        }
        lines.add('  Walk ${metres.round()} m to $to${toExit != null && toMap?['kind'] == 'station' ? ', Exit ${clean(toExit)}' : ''}, ~$minutes min');
      } else if (l['mode'] == 'train') {
        lines.add('  ${lineChip(l)} ${clean(l['name'] ?? '')}${l['towards'] != null ? ' towards ${clean(l['towards'])}' : ''}: ${placeLabel(l['from'])} to ${placeLabel(l['to'])}, '
            '${plural(((l['stops'] as num?) ?? 0).toInt(), 'stop')}, ~$minutes min${l['disrupted'] == true ? red('  disrupted') : ''}');
      } else {
        lines.add('  ${bold('Bus ${clean(l['route'])}')}${l['towards'] != null ? dim(' towards ${clean(l['towards'])}') : ''}: ${placeLabel(l['from'])} to ${placeLabel(l['to'])}, '
            '${plural(((l['stops'] as num?) ?? 0).toInt(), 'stop')}, ~$minutes min');
        final k = buses.indexOf(l);
        final svc = k >= 0 && k < live.length ? live[k]?.services.where((s) => s.serviceNo == '${l['route']}').firstOrNull : null;
        if (when == null) lines.add(svc != null ? '    Next: ${_next(svc)}' : dim('    No live timings for this bus right now.'));
        for (final c in (l['customs'] as List? ?? const [])) {
          if (c is Map) {
            lines.add(crossingLine((way: '${c['way']}', from: '${c['from']}', to: '${c['to']}', minutes: ((c['minutes'] as num?) ?? 0).round())));
          }
        }
      }
    }
    return lines;
  }

  // ---------- favourites ----------

  Future<void> favCommand(List<String> args) async {
    final what = args.isEmpty ? null : args.first;
    final rest = args.skip(1).toList();
    if (what == null || what == 'list') return favList();
    if (what == 'bus' || what == 'buses') {
      final op = rest.isEmpty ? null : rest.first;
      final nos = rest.skip(1).toList();
      if (!(op == 'add' || op == 'rm') || nos.isEmpty) throw Fail('sgbus fav bus add|rm <bus> [...]');
      for (final raw in nos.join(' ').split(RegExp(r'[\s,]+')).where((x) => x.isNotEmpty)) {
        final no = raw.toUpperCase();
        if ((op == 'add') != Favs.I.isBus(no)) Favs.I.toggleBus(no);
      }
      final buses = Favs.I.buses();
      return out('Favourite buses: ${buses.isEmpty ? 'none' : buses.join(', ')}');
    }
    if (what == 'add' || what == 'rm') {
      if (rest.isEmpty) throw Fail('sgbus fav $what <stop> [...]');
      for (final t in rest) {
        final code = await resolveStop(t, 'Stop');
        if (what == 'add' && !Favs.I.isStop(code)) Favs.I.addStop(code);
        if (what == 'rm' && Favs.I.isStop(code)) Favs.I.removeStop(code);
        out('${what == 'add' ? 'Saved' : 'Removed'} ${stopText(code)}');
      }
      return;
    }
    throw Fail('Unknown: sgbus fav ${clean(what)}. See sgbus help.');
  }

  static String _routeText(Map r) => '${clean(r['startName'])} (${clean(r['start'])}) → ${clean(r['endName'])} (${clean(r['end'])})';
  static String _navText(Map n) =>
      '${clean((n['from'] as Map?)?['label'])} → ${n['via'] is Map ? '${clean(n['via']['label'])} → ' : ''}${clean((n['to'] as Map?)?['label'])}';

  void favList() {
    final favs = Favs.I.stops();
    final buses = Favs.I.buses();
    final routes = Favs.I.routes();
    final navs = Favs.I.navs();
    _out([
      bold('Favourite stops'),
      if (favs.isEmpty) dim('  none: sgbus fav add <stop>') else for (final f in favs) '  ${cyan(f.code)}  ${clean(f.name.isNotEmpty ? f.name : (nameOf(f.code) ?? ''))}',
      bold('Favourite buses'),
      '  ${buses.isNotEmpty ? buses.map(clean).join(', ') : dim('none: sgbus fav bus add <bus>')}',
      bold('Routes'),
      if (routes.isEmpty) dim('  none: sgbus route <start> <end> --save') else for (var i = 0; i < routes.length; i++) '  ${i + 1}. ${_routeText(routes[i])}',
      bold('Navs'),
      if (navs.isEmpty) dim('  none: sgbus nav <from> <to> --save') else for (var i = 0; i < navs.length; i++) '  ${i + 1}. ${_navText(navs[i])}',
    ]);
  }

  /// Every favourite stop's timings, as the bot's /favs does.
  Future<void> favsTimings(Opts opts) async {
    final favs = Favs.I.stops();
    if (favs.isEmpty) throw Fail('No favourite stops yet: sgbus fav add <stop>.');
    Future<List<String>> once() async {
      final blocks = await Future.wait(favs.map((f) async {
        try {
          return await stopTimings(f.code, null, opts);
        } on Fail catch (e) {
          return [red('${clean(f.name.isNotEmpty ? f.name : f.code)} (${f.code}): ${e.message}')];
        }
      }));
      return [for (var i = 0; i < blocks.length; i++) ...[if (i > 0) '', ...blocks[i]]];
    }

    if (opts['watch'] == null) return _out(await once());
    return watch(once, opts['watch']);
  }

  /// `sgbus routes` / `sgbus navs`: the saved ones, one run by its number, or removed.
  Future<void> savedCommand(String kind, List<String> args, Opts opts) async {
    final list = kind == 'routes' ? Favs.I.routes() : Favs.I.navs();
    final first = args.isEmpty ? null : args.first;
    final second = args.length > 1 ? args[1] : null;
    final one = kind.substring(0, kind.length - 1);
    if (first == null) {
      if (list.isEmpty) return out(dim(kind == 'routes' ? 'No saved routes: sgbus route <start> <end> --save' : 'No saved navs: sgbus nav <from> <to> --save'));
      return _out([for (var i = 0; i < list.length; i++) '${i + 1}. ${kind == 'routes' ? _routeText(list[i]) : _navText(list[i])}']);
    }
    if (first == 'rm') {
      final i = (int.tryParse(second ?? '') ?? 0) - 1;
      if (i < 0 || i >= list.length) throw Fail("There's no $one ${clean(second ?? '')}.");
      list.removeAt(i);
      kind == 'routes' ? Favs.I.setRoutes(list) : Favs.I.setNavs(list);
      return out('Removed.');
    }
    final i = (int.tryParse(first) ?? 0) - 1;
    if (i < 0 || i >= list.length) throw Fail("There's no $one ${clean(first)}.");
    final x = list[i];
    if (kind == 'routes') return routePlan('${x['start']}', '${x['end']}', opts);
    final via = x['via'] is Map ? x['via'] as Map : null;
    return navPlan('${x['from']['lat']},${x['from']['lng']}', '${x['to']['lat']},${x['to']['lng']}', {...opts, if (via != null) 'via': '${via['lat']},${via['lng']}'});
  }

  // ---------- places ----------

  Future<void> placeCommand(List<String> args) async {
    final op = args.isEmpty ? null : args.first;
    final name = args.length > 1 ? args[1] : null;
    final rest = args.length > 2 ? args.sublist(2) : const <String>[];
    if (op == null || op == 'list') {
      String row(String label, Map? p) =>
          '  ${pad(bold(clean(label)), 12)} ${p != null ? '${clean(p['label'])}${p['stop'] != null ? dim(' (${clean(p['stop'])})') : ''}' : dim('not set')}';
      return _out([
        bold('Places'),
        row('Home', Places.fixed('home')),
        row('Work', Places.fixed('work')),
        for (final p in Places.custom()) row('${p['name'] ?? p['label']}', p),
        dim('Use one by its name in nav and route: sgbus nav home work'),
      ]);
    }
    if (op == 'set') {
      if (name == null || rest.isEmpty) throw Fail('sgbus place set <home|work|name> <address, postal code, stop, station, lat,lng or plus code>');
      final where = await resolvePlace(rest.join(' '), 'Place');
      final p = <String, Object>{'label': where.label, 'lat': where.lat, 'lng': where.lng, if (where.stop != null) 'stop': where.stop!};
      final key = name.toLowerCase();
      if (key == 'home' || key == 'work') {
        Places.setFixed(key, p);
      } else {
        // Moved, it keeps its id.
        final others = Places.custom();
        final was = others.where((o) => '${o['name'] ?? ''}'.toLowerCase() == key).firstOrNull;
        Places.setCustom([
          for (final o in others) if (o != was) o,
          {'id': was?['id'] ?? Places.newId(), 'name': clean(name), ...p},
        ]);
        Places.sendPlaces();
      }
      return out('${clean(name)}: ${where.label}');
    }
    if (op == 'rm') {
      final key = (name ?? '').toLowerCase();
      if (key == 'home' || key == 'work') {
        Places.setFixed(key, null);
      } else {
        Places.setCustom([for (final o in Places.custom()) if ('${o['name'] ?? ''}'.toLowerCase() != key) o]);
        Places.sendPlaces();
      }
      return out('Removed.');
    }
    throw Fail('Unknown: sgbus place ${clean(op)}. See sgbus help.');
  }

  // ---------- routines ----------

  static const _dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  static List<int> parseDays(Object? text) {
    final t = '${text ?? 'weekdays'}'.toLowerCase();
    if (t == 'weekdays') return [1, 2, 3, 4, 5];
    if (t == 'weekends') return [6, 7];
    if (t == 'daily' || t == 'every' || t == 'everyday') return [1, 2, 3, 4, 5, 6, 7];
    final days = [
      for (final d in t.split(RegExp(r'[\s,]+')).where((x) => x.isNotEmpty))
        _dayNames.indexWhere((n) => n.isNotEmpty && d.length >= 3 && n.toLowerCase() == d.substring(0, 3))
    ];
    if (days.isEmpty || days.any((d) => d < 1)) throw Fail('--days wants weekdays, weekends, daily, or days like mon,wed,fri.');
    return days.toSet().toList()..sort();
  }

  static String daysText(List<int> days) {
    final set = ([...days]..sort()).join(',');
    if (set == '1,2,3,4,5,6,7') return 'every day';
    if (set == '1,2,3,4,5') return 'weekdays';
    if (set == '6,7') return 'weekends';
    return days.map((d) => d >= 1 && d <= 7 ? _dayNames[d] : '?').join(', ');
  }

  static String parseHHMM(Object? text) {
    final m = RegExp(r'^(\d{1,2})[:.]?(\d{2})$').firstMatch('${text ?? ''}');
    if (m == null || int.parse(m[1]!) > 23 || int.parse(m[2]!) > 59) throw Fail('A routine wants a time like 07:45.');
    return '${m[1]!.padLeft(2, '0')}${m[2]}';
  }

  static List<String> busesOf(Object? text) => {
        for (final b in '${text ?? ''}'.toUpperCase().split(RegExp(r'[\s,]+')))
          if (RegExp(r'^[0-9A-Z]{1,5}$|^[0-9A-Z]{1,3}[*]$').hasMatch(b)) b
      }.toList();

  static String? get routinesNote => Native.has('routines')
      ? null
      : "Routines need the app's notifications, which this phone can't send yet. They're also in the Linux app's sgbus.";

  Future<void> routineCommand(List<String> args, Opts opts) async {
    final why = routinesNote;
    if (why != null) throw Fail(why);
    final list = [for (final r in Reminders.routines()) Map<String, dynamic>.from(r)];
    final op = args.isEmpty ? null : args.first;
    final rest = args.skip(1).toList();
    void show() => _out(list.isEmpty
        ? [dim('No routines yet: sgbus routine add <stop> <HH:MM> [--days weekdays] [--buses 14,60]')]
        : [
            for (var i = 0; i < list.length; i++)
              () {
                final r = list[i];
                final time = '${r['time'] ?? '0000'}';
                final buses = [for (final b in (r['buses'] as List? ?? const [])) clean(b)];
                final days = [for (final d in (r['days'] as List? ?? const [])) if (d is num) d.toInt()];
                return '${dim('${i + 1}.')} ${bold('${time.substring(0, 2)}:${time.substring(2)}')} ${daysText(days)} · ${clean(r['name'])} ${dim(clean(r['code']))}'
                    '${buses.isNotEmpty ? ' · ${buses.join(', ')}' : ''}';
              }()
          ]);
    Future<void> save() async {
      final failed = await Reminders.saveRoutines(list);
      if (failed != null) note(yellow(clean(failed)));
    }

    if (op == null || op == 'list') return show();
    if (op == 'add') {
      if (rest.length < 2) throw Fail('sgbus routine add <stop> <HH:MM> [--days weekdays] [--buses 14,60]');
      if (list.length >= maxRoutines) throw Fail('Up to $maxRoutines routines.');
      final code = await resolveStop(rest[0], 'Stop');
      final id = '${When.nowMs().toRadixString(36)}${math.Random().nextInt(1 << 20).toRadixString(36)}';
      list.add({'id': id, 'code': code, 'name': nameOf(code) ?? code, 'buses': busesOf(opts['buses']), 'time': parseHHMM(rest[1]), 'days': parseDays(opts['days'])});
      await save();
      return show();
    }
    if (op == 'edit') {
      final i = (int.tryParse(rest.isEmpty ? '' : rest[0]) ?? 0) - 1;
      if (i < 0 || i >= list.length) throw Fail("There's no routine ${clean(rest.isEmpty ? '' : rest[0])}. sgbus routines lists them.");
      final r = list[i];
      if (opts['stop'] != null) {
        r['code'] = await resolveStop('${opts['stop']}', 'Stop');
        r['name'] = nameOf(r['code'] as String) ?? r['code'];
      }
      if (opts['time'] != null) r['time'] = parseHHMM(opts['time']);
      if (opts['days'] != null) r['days'] = parseDays(opts['days']);
      if (opts['buses'] != null) r['buses'] = busesOf(opts['buses'] == true ? '' : opts['buses']);
      await save();
      return show();
    }
    if (op == 'rm') {
      final i = (int.tryParse(rest.isEmpty ? '' : rest[0]) ?? 0) - 1;
      if (i < 0 || i >= list.length) throw Fail("There's no routine ${clean(rest.isEmpty ? '' : rest[0])}.");
      list.removeAt(i);
      await save();
      return show();
    }
    if (op == 'run') throw Fail('The Android app sends your routines by itself, at their times.');
    throw Fail('Unknown: sgbus routine ${clean(op)}. See sgbus help.');
  }

  // ---------- service alerts ----------

  Future<void> alerts(Opts opts) async {
    final raw = await get('service-alerts');
    if (opts['json'] != null) return out(const JsonEncoder.withIndent('  ').convert(raw));
    final data = raw is Map ? raw : const {};
    List<String> split(Object? v) => v == null ? const [] : '$v'.split(',').map((x) => x.trim()).where((x) => x.isNotEmpty).toList();
    String station(String code) => clean(Mrt.stationName(code) ?? code);
    final lines = [bold('Trains')];
    final train = data['train'];
    if (train is! Map) {
      lines.add(dim("Couldn't reach LTA for train alerts."));
    } else {
      final status = int.tryParse('${train['Status'] ?? 1}') ?? 1;
      final segments = train['AffectedSegments'] is List ? [for (final s in train['AffectedSegments'] as List) if (s is Map) s] : const <Map>[];
      if (status <= 1 && segments.isEmpty) lines.add(green('All train services are running normally.'));
      for (final seg in segments) {
        final disrupted = (int.tryParse('${seg['Status'] ?? status}') ?? status) > 1;
        final d = seg['Direction'];
        final dir = d != null && '$d'.isNotEmpty ? (RegExp('both', caseSensitive: false).hasMatch('$d') ? ', both directions' : ', towards ${clean(d)}') : '';
        lines.add((disrupted ? red : yellow)('${clean(Mrt.lineLabel('${seg['Line'] ?? '?'}'))} ${disrupted ? 'disrupted' : 'minor delay'}$dir'));
        final at = split(seg['Stations']).map(station).toList();
        if (at.isNotEmpty) lines.add('  Affects ${at.join(', ')}');
        final bus = split(seg['FreePublicBus']).map(station).toList();
        if (bus.isNotEmpty) lines.add('  Free buses at ${bus.join(', ')}');
        final shuttle = split(seg['FreeMRTShuttle']).map(station).toList();
        if (shuttle.isNotEmpty) {
          lines.add('  Free shuttle at ${shuttle.join(', ')}${seg['MRTShuttleDirection'] != null && '${seg['MRTShuttleDirection']}'.isNotEmpty ? ' (${clean(seg['MRTShuttleDirection'])})' : ''}');
        }
      }
      for (final m in (train['Message'] as List? ?? const [])) {
        final content = m is Map ? '${m['Content'] ?? ''}'.trim() : '';
        if (content.isNotEmpty) lines.add(dim('  ${clean(content)}'));
      }
    }
    lines.addAll(['', bold('Traffic')]);
    final traffic = data['traffic'];
    if (traffic is! List) {
      lines.add(dim("Couldn't reach LTA for traffic alerts."));
    } else if (traffic.isEmpty) {
      lines.add(green('No traffic incidents reported.'));
    } else {
      final shown = opts['all'] != null ? traffic : traffic.take(15).toList();
      for (final i in shown) {
        if (i is Map) lines.add('  ${yellow(clean(i['type']))}  ${clean(i['message'])}');
      }
      if (shown.length < traffic.length) lines.add(dim('  and ${traffic.length - shown.length} more: --all for every one.'));
    }
    _out(lines);
  }

  // ---------- weather ----------

  static const _wmo = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers',
    82: 'Violent rain showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm',
    96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
  };
  static String _wmoText(Object? code) => _wmo[code is num ? code.toInt() : -1] ?? 'Not reported';
  // NEA's PSI bands.
  static String psiBand(num v) =>
      v <= 50 ? green('good') : v <= 100 ? yellow('moderate') : v <= 200 ? red('unhealthy') : v <= 300 ? red('very unhealthy') : red('hazardous');

  Future<void> weather(Opts opts) async {
    final raw = await get('weather');
    if (opts['json'] != null) return out(const JsonEncoder.withIndent('  ').convert(raw));
    final w = raw is Map ? raw : const {};
    String regions(Object? r) => r is Map ? r.entries.map((e) => '${clean(e.key)} ${clean(e.value)}').join(' · ') : '';
    final lines = [bold('Today in Singapore')];
    final temp = w['temp'], now = w['now'], today = w['today'], psi = w['psi'], pm = w['pm25'];
    if (temp is Map) lines.add('  ${clean(temp['min'])}° to ${clean(temp['max'])}° across the island');
    if (now is Map) lines.add('  Now ${clean(now['temp'])}°, feels like ${clean(now['feels'])}° · ${_wmoText(now['code'])} · humidity ${clean(now['humidity'])}%');
    if (today is Map) {
      final rain = today['rain'];
      lines.add('  Today: ${_wmoText(today['code'])}, ${clean(today['rainChance'])}% chance of rain${rain != null && rain != 0 ? ', ${clean(rain)} mm' : ''}');
    }
    if (psi is Map) lines.add('  PSI ${clean(psi['min'])} to ${clean(psi['max'])}, ${psiBand((psi['max'] as num?) ?? 0)}  ${dim(regions(psi['regions']))}');
    if (pm is Map) lines.add('  PM2.5 ${clean(pm['min'])} to ${clean(pm['max'])} µg/m³  ${dim(regions(pm['regions']))}');
    final nowTime = now is Map ? '${now['time'] ?? ''}' : '';
    final from = nowTime.length >= 13 ? nowTime.substring(0, 13) : nowTime;
    final next = [
      for (final h in (w['hours'] as List? ?? const []))
        if (h is Map && '${h['time'] ?? ''}'.compareTo(from) >= 0 && '${h['time']}'.length >= 16) h
    ].take(6).toList();
    if (next.isNotEmpty) {
      lines.add(dim('  Next hours: ${next.map((h) => '${'${h['time']}'.substring(11, 16)} ${((h['temp'] as num?) ?? 0).round()}° ${clean(h['pop'])}%').join(' · ')}'));
    }
    _out(lines);
  }

  // ---------- calendar ----------

  Future<void> calendarCommand(List<String> args, Opts opts) async {
    final op = args.isEmpty ? null : args.first;
    final rest = args.skip(1).toList();
    if (op == 'set') {
      final url = rest.isEmpty ? '' : rest.first;
      if (!RegExp(r'^(https|webcals?):\/\/\S+$', caseSensitive: false).hasMatch(url)) throw Fail("sgbus calendar set <your calendar's private iCal link>");
      try {
        await Calendar.link(url);
      } catch (e) {
        throw Fail(clean(e));
      }
      return out('Calendar linked. sgbus calendar lists your events with a location.');
    }
    if (op == 'rm') {
      Calendar.unlink();
      return out('Calendar unlinked.');
    }
    if (!Calendar.connected) throw Fail('No calendar linked: sgbus calendar set <private iCal link>. Google calls it "Secret address in iCal format".');
    List<CalEvent> events;
    try {
      events = await Calendar.upcomingList(fresh: true);
    } catch (e) {
      throw Fail(clean(e));
    }
    if (op == 'nav') {
      final i = (int.tryParse(rest.isEmpty ? '' : rest.first) ?? 0) - 1;
      if (i < 0 || i >= events.length) throw Fail("There's no event ${clean(rest.isEmpty ? '' : rest.first)}. sgbus calendar lists them.");
      final ev = events[i];
      final postal = RegExp(r'\b\d{6}\b').firstMatch(ev.location)?[0];
      final to = postal ?? ev.location;
      final from = opts['from'] != null ? '${opts['from']}' : (Places.fixed('home') != null ? 'home' : null);
      if (from == null) throw Fail('Where from? --from <place>, or set Home: sgbus place set home <address>.');
      note(dim('${clean(ev.title)}, ${When.clockDay(ev.start)}'));
      final at = When.msToAt(ev.start);
      final timed = !ev.allDay && When.problem(WhenPick('arrive', at)) == null;
      return navPlan(from, to, {...opts, if (timed) 'arrive': at.substring(11), if (timed) 'day': at.substring(0, 10)});
    }
    if (opts['json'] != null) {
      return out(const JsonEncoder.withIndent('  ').convert([
        for (final e in events) {'title': e.title, 'location': e.location, 'start': e.start, 'end': e.end, 'allDay': e.allDay}
      ]));
    }
    if (events.isEmpty) return out(dim('No events with a location in the next two weeks.'));
    _out([
      for (var i = 0; i < events.length; i++)
        '${dim('${'${i + 1}'.padLeft(2)}.')} ${pad(events[i].allDay ? 'all day' : When.clockDay(events[i].start), 18)} ${bold(clean(events[i].title))} ${dim('@ ${clean(events[i].location)}')}',
      dim('sgbus calendar nav N for the way there.'),
    ]);
  }

  // ---------- settings ----------

  void settingsCommand(List<String> args) {
    final field = args.isEmpty ? null : args.first;
    final value = args.length > 1 ? args[1] : null;
    void show() {
      final customs = _customs;
      _out([
        '  pin.stop    ${pad(Favs.I.pin('stop'), 9)}${dim('favourite stops, top or bottom of lists')}',
        '  pin.bus     ${pad(Favs.I.pin('bus'), 9)}${dim("favourite buses, top or bottom of a stop's timings")}',
        '  restricted  ${pad(_restricted ? 'on' : 'off', 9)}${dim("on if you have a pass: Changi Airport's cargo area and MINDEF's stops")}',
        '  customs     ${pad(customs == 'auto' ? 'auto' : '$customs min', 9)}${dim('immigration across the Causeway: auto by the time of day, or 15, 30, 45, 60')}',
        dim('Kept in $savedIn'),
      ]);
    }

    if (field == null) return show();
    if (field == 'customs') {
      if (!const ['auto', '15', '30', '45', '60'].contains(value)) throw Fail('sgbus settings customs auto|15|30|45|60');
      Store.I.put('sgbus_customs', value == 'auto' ? null : value);
      return show();
    }
    if (field == 'pin.stop' || field == 'pin.bus') {
      if (!(value == 'top' || value == 'bottom')) throw Fail('sgbus settings $field top|bottom');
      Favs.I.setPin(field == 'pin.stop' ? 'stop' : 'bus', value!);
    } else if (field == 'restricted') {
      if (!(value == 'on' || value == 'off')) throw Fail('sgbus settings restricted on|off');
      Store.I.put('sgbus_restricted', value == 'on' ? 'on' : null);
      BusNet.setOpenAccess(value == 'on');
    } else {
      throw Fail("There's no setting ${clean(field)}.");
    }
    show();
  }

  // ---------- reading the command line ----------

  static const _valueFlags = {'leave', 'arrive', 'day', 'days', 'buses', 'stop', 'time', 'dir', 'from', 'way', 'show', 'via'};
  static const _switches = {'watch', 'details', 'json', 'help', 'version', 'save', 'all', 'notify'};
  static const _short = {'w': 'watch', 'd': 'details', 'j': 'json', 'h': 'help', 'v': 'version'};

  static ({List<String> args, Opts opts}) parseArgs(List<String> argv) {
    final args = <String>[];
    final opts = <String, Object>{};
    for (var i = 0; i < argv.length; i++) {
      final a = argv[i];
      if (a == '--') {
        args.addAll(argv.sublist(i + 1));
        break;
      }
      final long = RegExp(r'^--([a-z-]+)(?:=(.*))?$').firstMatch(a);
      final short = RegExp(r'^-([a-z])$').firstMatch(a);
      if (long == null && short == null) {
        args.add(a);
        continue;
      }
      final name = long != null ? long[1] : _short[short![1]];
      if (name == null || !(_valueFlags.contains(name) || _switches.contains(name))) throw Fail('Unknown option ${clean(a)}. See sgbus help.');
      if (long?[2] != null) {
        opts[name] = long![2]!;
      } else if (_valueFlags.contains(name)) {
        if (i + 1 >= argv.length) throw Fail('--$name wants a value.');
        opts[name] = argv[++i];
      } else if (name == 'watch' && i + 1 < argv.length && RegExp(r'^\d+$').hasMatch(argv[i + 1])) {
        opts['watch'] = argv[++i];
      } else {
        opts[name] = true;
      }
    }
    return (args: args, opts: opts);
  }

  /// Words, as a shell splits a line: "Bedok Mall" and 'Bedok Mall' are one.
  static List<String> wordsOf(String line) =>
      [for (final m in RegExp(r'''"([^"]*)"|'([^']*)'|(\S+)''').allMatches(line)) m[1] ?? m[2] ?? m[3]!];

  // ---------- help ----------

  String get _helpTitle => 'sgbus $version: Singapore\'s live bus timings in the terminal, from $site';

  List<String> get _helpLines => [
        'Timings and search',
        "  sgbus <stop> [buses]            a stop's timings: sgbus 84009, sgbus 84009 174,175, sgbus 84009 '22*'",
        '    -w, --watch [seconds]         keep them on screen, refreshed (every 30s)',
        '    -d, --details                 operator, decks, first and last bus',
        "  sgbus <name, road or station>   find stops: sgbus bedok int, sgbus 'Bedok MRT'",
        '  sgbus <postal code>             the stops nearest an address: sgbus 519599',
        '  sgbus near <postal | lat,lng>   the same, or from a point',
        "  sgbus bus <bus> [--dir 2] [--from <stop>]   a bus's route; just sgbus 22 works too",
        '',
        'Getting somewhere',
        '  sgbus route <start> <end>       by bus only, stop to stop (the route planner)',
        '    --show N                      journey N step by step, with live timings',
        '  sgbus nav <from> <to>           by bus and train, from anywhere to anywhere (Navigate)',
        '    --way N                       way N step by step (the first, unless picked)',
        '    --via <place>                 by way of a stop on the way, kept with --save too',
        '  Either takes --leave 08:30 or --arrive 6pm, with --day tomorrow, a weekday or a date,',
        '  and --save to keep it. Ends can be stops, places, postal codes, stations, lat,lng or',
        '  plus codes, and your places by name: sgbus nav home work.',
        '',
        'Saved',
        "  sgbus favs [-w]                 every favourite stop's timings",
        '  sgbus fav add|rm <stop>...      favourite stops; sgbus fav bus add|rm <bus>... for buses',
        '  sgbus fav                       everything saved',
        '  sgbus routes [N | rm N]         saved routes: list, plan one, or remove it; sgbus navs the same',
        '  sgbus places                    Home, Work and your own',
        '  sgbus place set <name> <where>  sgbus place set home 519599; sgbus place rm <name>',
        if (routinesNote == null) ...[
          '  sgbus routine add <stop> <HH:MM> [--days weekdays|weekends|daily|mon,wed] [--buses 14,60,22*]',
          '  sgbus routines                  list them; sgbus routine edit N [--time --days --buses --stop],',
          '                                  sgbus routine rm N',
        ],
        '',
        'Around Singapore',
        '  sgbus alerts [--all]            train disruptions and traffic incidents',
        "  sgbus weather                   today's weather, PSI and PM2.5",
        '  sgbus calendar                  your events with a location, the next two weeks',
        '  sgbus calendar set <iCal link>  link your calendar; calendar rm unlinks it',
        '  sgbus calendar nav N [--from <place>]   the way to event N, arriving by its start',
        '',
        '  sgbus settings [pin.stop|pin.bus top|bottom | restricted on|off | customs auto|15|30|45|60]',
        '  --json                          the data rather than the text, for scripts',
        '',
        'Saved in $savedIn. Also on Telegram: $bot. Guide: guide.sgbus.uwuapps.org',
      ];

  String get help => '$_helpTitle\n\n${_helpLines.join('\n')}';

  /// The same at the prompt, with "sgbus" left out of each command and the columns kept.
  String promptHelp() {
    String drop(String s) => s.replaceAll(RegExp(r"\bsgbus (?=[a-z<'\d\[])"), '');
    final body = _helpLines.map((l) {
      final m = RegExp(r'^  sgbus (\S.*?)( {2,})(.*)$').firstMatch(l);
      return m != null ? '  ${m[1]}${m[2]}      ${drop(m[3]!)}' : drop(l);
    });
    return '$_helpTitle\n\n${body.join('\n')}';
  }

  /// What the prompt opens with.
  List<String> intro() => [
        "${bold('sgbus')} $version  Singapore's live bus timings.",
        dim('Type a stop (84009), a stop\'s name, a bus, or a command, without "sgbus": favs, nav home work, alerts.'),
        dim('help lists them all, Tab finishes a word, exit leaves.'),
      ];

  // ---------- one command ----------

  Future<void> run(List<String> argv) async {
    final parsed = parseArgs(argv);
    final args = parsed.args;
    final opts = parsed.opts;
    final cmd = args.isEmpty ? null : args.first;
    final rest = args.skip(1).toList();
    if (opts['version'] != null || cmd == 'version') return out('sgbus $version');
    if (cmd == null || opts['help'] != null || cmd == 'help') return out(help);
    switch (cmd) {
      case 'stop':
        final code = await resolveStop(rest.isEmpty ? '' : rest.first, 'Stop');
        return showStop(code, busFilter(rest.skip(1).join(',')), opts);
      case 'search':
      case 'find':
        final found = await matchStops(rest.join(' '));
        if (opts['json'] != null) return out(_stopsJson(found.stops));
        if (found.stops.isEmpty) throw Fail('No bus stops matched that. Try a stop code, part of its name or road, a station, or a postal code.');
        return _out(stopListLines(found.note.isNotEmpty ? found.note : 'Bus stops', found.stops));
      case 'near':
        await _stops();
        final t = rest.join(' ');
        final ll = _latLng.firstMatch(t);
        final p = ll != null
            ? (address: t, lat: double.parse(ll[1]!), lng: double.parse(ll[2]!))
            : RegExp(r'^\d{6}$').hasMatch(t)
                ? await postalPlace(t)
                : null;
        if (p == null) throw Fail('sgbus near <postal code | lat,lng>');
        final near = nearestStops(p.lat, p.lng);
        if (opts['json'] != null) return out(_stopsJson(near));
        return _out(stopListLines('Bus stops near ${p.address}', near));
      case 'bus':
        return showBus(rest.isEmpty ? '' : rest.first, opts);
      case 'route':
      case 'routeplan':
        if (rest.length < 2) throw Fail('sgbus route <start> <end>');
        return routePlan(rest.first, rest.skip(1).join(' '), opts);
      case 'nav':
      case 'navigate':
        if (rest.length < 2) throw Fail('sgbus nav <from> <to>: quote an end with spaces, sgbus nav "Bedok Mall" home');
        return navPlan(rest.first, rest.skip(1).join(' '), opts);
      case 'favs':
        return favsTimings(opts);
      case 'fav':
        return favCommand(rest);
      case 'routes':
        return savedCommand('routes', rest, opts);
      case 'navs':
        return savedCommand('navs', rest, opts);
      case 'places':
        return placeCommand(const []);
      case 'place':
        return placeCommand(rest);
      case 'routines':
        return routineCommand(const [], opts);
      case 'routine':
        return routineCommand(rest, opts);
      case 'alerts':
        return alerts(opts);
      case 'weather':
        return weather(opts);
      case 'calendar':
        return calendarCommand(rest, opts);
      case 'settings':
        return settingsCommand(rest);
      case 'update':
        throw Fail("The app updates from Settings, About: when there's a new version, a bar at the top offers it too.");
    }
    // As the bot reads a message: a stop's code (and buses), a postal code, a bus, or a search.
    final text = args.join(' ').trim();
    final stop = RegExp(r'^(\d{5})(?:[\s,]+(.+))?$').firstMatch(text);
    if (stop != null) {
      await _stops();
      if (Stops.of(stop[1]!) == null) throw Fail("There's no bus stop ${stop[1]}.");
      final filter = stop[2] != null ? busFilter(stop[2]!) : null;
      if (stop[2] != null && filter == null) throw Fail('"${clean(stop[2])}" isn\'t a list of buses: 174, or 174,175, or 22*.');
      return showStop(stop[1]!, filter, opts);
    }
    if (RegExp(r'^\d{6}$').hasMatch(text)) {
      return run(['near', text, for (final e in opts.entries) e.value == true ? '--${e.key}' : '--${e.key}=${e.value}']);
    }
    if (RegExp(r'^[0-9A-Za-z]{1,4}$').hasMatch(text)) {
      try {
        await network();
        if (BusNet.hasService(text.toUpperCase())) return await showBus(text, opts);
      } on Fail {
        // Searched for as a stop instead.
      }
    }
    final found = await matchStops(text);
    if (found.stops.isEmpty) {
      throw Fail('No bus stops matched that. Try a stop code, part of its name or road, a station, a postal code or a bus. sgbus help lists the rest.');
    }
    if (found.stops.length == 1) return showStop(found.stops.first.code, null, opts);
    if (opts['json'] != null) return out(_stopsJson(found.stops));
    _out(stopListLines(found.note.isNotEmpty ? found.note : 'Did you mean', found.stops));
  }

  static String _stopsJson(List<({String code, String name, String road, double? distance})> list) => const JsonEncoder.withIndent('  ').convert([
        for (final s in list) {'code': s.code, 'name': s.name, 'road': s.road, if (s.distance != null) 'distance': s.distance}
      ]);

  void report(Object e) {
    if (e is Fail) {
      note(red(clean(e.message)));
    } else {
      note(red('Something went wrong: ${clean(e)}'));
    }
  }

  // ---------- the prompt ----------

  List<String> get _commands => [
        'stop', 'search', 'near', 'bus', 'route', 'nav', 'favs', 'fav', 'routes', 'navs', 'places', 'place',
        'routines', 'routine', 'alerts', 'weather', 'calendar', 'settings', 'help', 'clear', 'exit',
      ];

  /// What Tab finishes: a command, home, work or one of your places. (hits, the word finished)
  (List<String>, String) complete(String line) {
    final word = line.split(RegExp(r'\s+')).last.toLowerCase();
    final all = {..._commands, 'home', 'work', for (final p in Places.custom()) '${p['name'] ?? ''}'.toLowerCase()};
    return ([for (final w in all) if (w.isNotEmpty && w.startsWith(word)) w], word);
  }

  /// Whether a typed line goes in the history: not one with your calendar's private link.
  static bool remembered(String line) => !RegExp(r'^\s*(sgbus\s+)?calendar\s+set\b', caseSensitive: false).hasMatch(line);
}
