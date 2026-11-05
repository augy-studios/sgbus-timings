// A stop's live arrivals, as /api/bus-arrivals gives them, and the site's ways of reading them
// (script.js): which way each bus is going at a stop it calls at both ways (busWays), the
// buses a stop's narrowed to (busFilter), and each time as Settings' Bus times has it.
import '../api/api.dart';
import '../i18n/i18n.dart';
import 'network.dart';
import 'stops.dart';
import 'store.dart';
import 'when.dart';

class Bus {
  Bus(this.etaMs, this.load, this.wheelchair, this.deck, this.lat, this.lng, this.rough, this.origin, this.dest, this.visit,
      {required this.fetchedAt});
  final int? etaMs; // at fetchedAt
  final String? load;
  final bool wheelchair;
  final String deck;
  final double? lat;
  final double? lng;
  final bool rough; // no live GPS: timed by the schedule
  final String? origin;
  final String? dest;
  final int? visit;
  final int fetchedAt;

  /// How long till it comes now, counting down since it was fetched.
  int? get etaNow => etaMs == null ? null : (etaMs! - (When.nowMs() - fetchedAt)).clamp(0, 1 << 31);

  static Bus? from(Object? j, int at) {
    if (j is! Map) return null;
    return Bus((j['eta_ms'] as num?)?.round(), j['load'] as String?, j['wheelchair'] == true, '${j['deck'] ?? ''}',
        (j['lat'] as num?)?.toDouble(), (j['lng'] as num?)?.toDouble(), j['rough'] == true, j['origin'] as String?,
        j['dest'] as String?, (j['visit'] as num?)?.toInt(),
        fetchedAt: at);
  }
}

class ServiceArrivals {
  ServiceArrivals(this.serviceNo, this.operator, this.buses);
  final String serviceNo;
  final String? operator;
  final List<Bus?> buses; // next, next2, next3

  Bus? get next => buses.isEmpty ? null : buses[0];
  String? get dest => buses.firstWhere((b) => b?.dest != null, orElse: () => null)?.dest;
}

class Arrivals {
  Arrivals(this.code, this.services, this.at);
  final String code;
  final List<ServiceArrivals> services;
  final int at;

  static Arrivals from(Map<String, dynamic> j, String code) {
    final at = When.nowMs();
    return Arrivals(code, [
      for (final s in (j['services'] as List? ?? const []))
        if (s is Map)
          ServiceArrivals('${s['serviceNo'] ?? '?'}', s['operator'] as String?, [Bus.from(s['next'], at), Bus.from(s['next2'], at), Bus.from(s['next3'], at)])
    ], at);
  }

  static Future<Arrivals> fetch(String code, [String? service]) async =>
      from(await Api.map('bus-arrivals', query: {'stop': code, 'service': service}), code);
}

/// Which way an entry is going, at a stop its bus calls at both ways or twice.
class Way {
  Way(this.label, this.short, this.tone, this.dir, {this.round = false});
  final String label;
  final String short;
  final int tone;
  final int? dir;
  final bool round;
}

class Ways {
  Ways._();

  static int? _dirEndingAt(String no, String dest) {
    final dirs = BusNet.ready ? BusNet.serviceInfo(no)?.dirs : null;
    if (dirs == null) return null;
    for (final e in dirs.entries) {
      if (e.value.length > 1 && e.value[1] == dest) return e.key;
    }
    return null;
  }

  static Way _timeRound(String no, Bus bus) {
    final loop = BusNet.ready ? (BusNet.serviceInfo(no)?.loop ?? '') : '';
    final isLoop = loop.isNotEmpty || (bus.origin != null && bus.origin == bus.dest);
    final home = Stops.nameOf(bus.dest ?? '').isNotEmpty ? Stops.nameOf(bus.dest!) : (bus.dest ?? '');
    if (bus.visit == 2) {
      return isLoop
          ? Way(tr('stop.way.backTo', 'Back to {stop}', {'stop': home}), '↩ $home', 1, null, round: true)
          : Way(tr('stop.way.second', 'Second time past here'), tr('stop.way.secondShort', '2nd time'), 1, null, round: true);
    }
    return isLoop
        ? Way(loop.isNotEmpty ? tr('stop.way.outTo', 'Out to {stop}', {'stop': loop}) : tr('stop.way.out', 'On its way out'),
            '→ ${loop.isNotEmpty ? loop : tr('stop.way.outShort', 'Out')}', 0, null,
            round: true)
        : Way(tr('stop.way.first', 'First time past here'), tr('stop.way.firstShort', '1st time'), 0, null, round: true);
  }

  /// The services at a stop with each way apart: a service passing twice split into an entry
  /// per time round, and each entry going one of two ways given its Way.
  static ({List<ServiceArrivals> services, Map<ServiceArrivals, Way> ways}) of(List<ServiceArrivals> services) {
    final byNo = <String, List<ServiceArrivals>>{};
    for (final s in services) {
      (byNo[s.serviceNo] ??= []).add(s);
    }
    final headings = <ServiceArrivals, ({String to, int? dir, int tone})>{};
    byNo.forEach((no, group) {
      if (group.length < 2) return;
      final dests = group.map((s) => s.dest).toList();
      if (dests.any((d) => d == null) || dests.toSet().length < group.length) return;
      final order = [...dests.cast<String>()]..sort();
      for (var i = 0; i < group.length; i++) {
        headings[group[i]] = (to: dests[i]!, dir: _dirEndingAt(no, dests[i]!), tone: order.indexOf(dests[i]!) % 3);
      }
    });
    final out = <ServiceArrivals>[];
    final ways = <ServiceArrivals, Way>{};
    for (final s in services) {
      final h = headings[s];
      if (h != null) {
        final to = Stops.nameOf(h.to).isNotEmpty ? Stops.nameOf(h.to) : h.to;
        ways[s] = Way(tr('trip.to', 'To {to}', {'to': to}), '→ $to', h.tone, h.dir);
        out.add(s);
        continue;
      }
      final buses = s.buses.whereType<Bus>().toList();
      if (!buses.any((b) => b.visit == 2)) {
        out.add(s);
        continue;
      }
      for (final visit in const [1, 2]) {
        final these = buses.where((b) => (b.visit == 2 ? 2 : 1) == visit).toList();
        if (these.isEmpty) continue;
        final entry = ServiceArrivals(s.serviceNo, s.operator, [for (var i = 0; i < 3; i++) i < these.length ? these[i] : null]);
        ways[entry] = _timeRound(s.serviceNo, these.first);
        out.add(entry);
      }
    }
    return (services: out, ways: ways);
  }
}

class BusFilter {
  BusFilter._();

  /// "174", "174,175" or "22*", or null if it isn't a list of buses.
  static String? parse(String? text) {
    final parts = (text ?? '').toUpperCase().split(RegExp(r'[\s,]+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty || !parts.every((p) => RegExp(r'^[0-9A-Z]{1,4}$|^[0-9A-Z]{1,3}\*$').hasMatch(p))) return null;
    return parts.toSet().join(',');
  }

  static bool has(String filter, String no) {
    final n = no.toUpperCase();
    return filter.split(',').any((p) => p.endsWith('*') ? n.startsWith(p.substring(0, p.length - 1)) : n == p);
  }

  static String? one(String? filter) => filter != null && RegExp(r'^[0-9A-Z]{1,4}$').hasMatch(filter) ? filter : null;

  static String text(String filter) {
    final parts = filter.split(',');
    return parts.length == 1 && !parts[0].endsWith('*')
        ? tr('stop.filter.one', 'bus {no}', {'no': parts[0]})
        : tr('stop.filter.many', 'buses {list}', {'list': listText(parts)});
  }
}

/// "a, b and c", in the language on show.
String listText(List<String> items) {
  if (items.length <= 1) return items.join();
  return '${items.sublist(0, items.length - 1).join(', ')}${tr('trip.and', ' and ')}${items.last}';
}

class Eta {
  Eta._();
  static bool get clockTimes => Store.I.get('sgbus_times') == 'clock';

  /// "3 mins 20s", "45s", or "-".
  static String mins(num? ms) {
    if (ms == null) return '-';
    final sec = (ms / 1000).round().clamp(0, 1 << 31);
    final m = sec ~/ 60, s = sec % 60;
    if (m > 0) {
      return (m > 1 ? tr('time.mins', '{m} mins', {'m': m}) : tr('time.min', '{m} min', {'m': m})) +
          (s != 0 ? ' ${tr('time.secs', '{s}s', {'s': s})}' : '');
    }
    return tr('time.secs', '{s}s', {'s': s});
  }

  static String clock(num ms) => When.clock(When.nowMs() + ms.round().clamp(0, 1 << 31));

  /// As Settings' Bus times has it: the clock time, or how long till it comes.
  static String text(num? ms) => ms == null ? '-' : (clockTimes ? clock(ms) : mins(ms));

  /// Whole minutes, as Glance and the board count: "Arr" under a minute.
  static String short(num? ms) {
    if (ms == null) return '-';
    if (clockTimes) return clock(ms);
    final m = (ms / 60000).floor();
    return m <= 0 ? tr('glance.arr', 'Arr') : '$m';
  }

  static String loadWords(String? load) => switch ((load ?? '').toUpperCase()) {
        'SEA' => tr('load.sea', 'seats available'),
        'SDA' => tr('load.sda', 'standing room'),
        'LSD' => tr('load.lsd', 'limited standing'),
        _ => '',
      };
}

/// Today's first and last bus at a stop, in words.
String firstLastText(String no, String code, [int? dir]) {
  final fl = BusNet.ready ? BusNet.firstLast(no, code, dir) : null;
  if (fl == null) return '';
  final day = {'Weekday': tr('day.weekday', 'Weekday'), 'Sat': tr('day.sat', 'Sat'), 'Sun': tr('day.sun', 'Sun')}[fl.label] ?? fl.label;
  if (fl.first == '-' && fl.last == '-') {
    return fl.label == 'Weekday'
        ? tr('stop.noService.weekday', 'No weekday service at this stop')
        : fl.label == 'Sat'
            ? tr('stop.noService.sat', 'No Saturday service at this stop')
            : tr('stop.noService.sun', 'No Sunday service at this stop');
  }
  return tr('stop.firstLast', '{day}: first bus {first} · last bus {last}', {'day': day, 'first': fl.first, 'last': fl.last});
}
