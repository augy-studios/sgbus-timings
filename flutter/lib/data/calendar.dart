// Calendar (the site's js/calendar.js), as Citymapper's: your events with a location, today and
// the next two weeks, on the Calendar tab of Navigate's From, To and Add a stop. Picking one in
// To plans the way there to arrive by its start.
//
// The events come from one of three places:
//   the phone  the phone's own calendar (PhoneCalendarPlugin), already expanded; needs the
//              calendar permission, asked for by Android's own prompt.
//   a link     the calendar's private iCal link (Google's secret address, Outlook's published
//              ICS link, iCloud's public calendar), read through /api/calendar each time the tab
//              opens, at most every ten minutes. Nothing is kept on the server.
//   a file     an .ics file exported from a calendar app, read here and never sent anywhere; a
//              snapshot, so imported again for new events.
// Kept as sgbus_calendar ({ url?, file?: { name, importedAt, events }, phone?: true, hidden }),
// so the WebView app's choice comes over as it was.
//
// Each event's location is free text, matched to a place with Navigate's own search
// (/api/places), the postal code first when it has one; what it matched is remembered
// (sgbus_calendar_places). Online meetings and events with no location are left out.
//
// Repeating events are expanded here (RRULE: daily, weekly, monthly, yearly, with INTERVAL,
// COUNT, UNTIL, BYDAY, BYMONTHDAY and BYMONTH; EXDATE; RECURRENCE-ID changes and cancellations),
// in the time zone each event was set in. An event is listed until it ends.
import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../api/api.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import 'store.dart';
import 'when.dart';

class CalEvent {
  const CalEvent({required this.key, required this.title, required this.location, required this.start, required this.end, required this.allDay});
  final String key;
  final String title;
  final String location;
  final int start;
  final int end;
  final bool allDay;
}

class CalPlace {
  const CalPlace(this.label, this.lat, this.lng);
  final String label;
  final double lat;
  final double lng;
  Map<String, Object?> toJson() => {'label': label, 'lat': lat, 'lng': lng};
}

/// Why the phone's calendar can't be read: 'app' (no plugin) or 'permission'.
class CalError implements Exception {
  CalError(this.message, {this.reason});
  final String message;
  final String? reason;
  @override
  String toString() => message;
}

class IcsDate {
  IcsDate(this.c, this.tz, this.allDay);
  final List<int> c; // y, m, d, h, mi, s
  final String? tz;
  final bool allDay;

  Map<String, Object?> toJson() => {'c': {'y': c[0], 'm': c[1], 'd': c[2], 'h': c[3], 'mi': c[4], 's': c[5]}, 'tz': tz, 'allDay': allDay};
  static IcsDate? from(Object? j) {
    if (j is! Map || j['c'] is! Map) return null;
    final c = j['c'] as Map;
    return IcsDate([for (final k in ['y', 'm', 'd', 'h', 'mi', 's']) (c[k] as num?)?.toInt() ?? 0], j['tz'] as String?, j['allDay'] == true);
  }
}

/// A VEVENT, as the site keeps an imported file's.
class IcsEvent {
  String? uid;
  String? title;
  String? location;
  IcsDate? start;
  IcsDate? end;
  int? duration;
  Map<String, String>? rrule;
  List<int> exdates = [];
  int? recurrenceId;
  bool cancelled = false;

  Map<String, Object?> toJson() => {
        'uid': ?uid,
        'title': ?title,
        'location': ?location,
        'start': start?.toJson(),
        'end': ?end?.toJson(),
        'duration': ?duration,
        'rrule': ?rrule,
        'exdates': exdates,
        'recurrenceId': ?recurrenceId,
        if (cancelled) 'cancelled': true,
      };

  static IcsEvent? from(Object? j) {
    if (j is! Map) return null;
    final e = IcsEvent()
      ..uid = j['uid'] as String?
      ..title = j['title'] as String?
      ..location = j['location'] as String?
      ..start = IcsDate.from(j['start'])
      ..end = IcsDate.from(j['end'])
      ..duration = (j['duration'] as num?)?.toInt()
      ..rrule = (j['rrule'] as Map?)?.map((k, v) => MapEntry('$k', '$v'))
      ..exdates = [for (final x in (j['exdates'] as List? ?? const [])) (x as num).toInt()]
      ..recurrenceId = (j['recurrenceId'] as num?)?.toInt()
      ..cancelled = j['cancelled'] == true;
    return e.start == null ? null : e;
  }
}

class Calendar {
  Calendar._();
  static const key = 'sgbus_calendar';
  static const placesKey = 'sgbus_calendar_places';
  static const days = 14;
  static const _refetchMs = 10 * 60 * 1000;
  static const _maxPlaces = 300;
  static const _maxEvents = 2000;
  static const _maxHidden = 200;
  static const _dayMs = 24 * 3600 * 1000;
  static const _sg = 'Asia/Singapore';
  static final _online = RegExp(r'^(https?:|www\.)|zoom\.us|meet\.google|teams\.microsoft|microsoft teams|webex', caseSensitive: false);

  // ---------- storage ----------

  static Map<String, dynamic> settings() {
    final v = Store.I.map(key);
    return {'hidden': <Object?>[], ...v};
  }

  static void _save(Map<String, Object?> s) => Store.I.putJson(key, s);
  static List<String> get _hidden => [for (final h in (settings()['hidden'] as List? ?? const [])) '$h'];

  static bool get connected {
    final s = settings();
    return s['url'] != null || s['file'] != null || s['phone'] == true;
  }

  static bool get canPhone => Native.has('calendar');

  // ---------- reading iCal ----------

  static List<String> _unfold(String text) => text.replaceAll(RegExp(r'\r\n[ \t]|\n[ \t]'), '').split(RegExp(r'\r?\n'));

  static ({String name, Map<String, String> params, String value}) _line(String line) {
    var i = 0;
    var quoted = false;
    for (; i < line.length; i++) {
      if (line[i] == '"') {
        quoted = !quoted;
      } else if (line[i] == ':' && !quoted) {
        break;
      }
    }
    final head = line.substring(0, math.min(i, line.length)).split(';');
    final params = <String, String>{};
    for (final kv in head.skip(1)) {
      final j = kv.indexOf('=');
      if (j > 0) params[kv.substring(0, j).toUpperCase()] = kv.substring(j + 1).replaceAll(RegExp(r'^"|"$'), '');
    }
    return (name: head.first.toUpperCase(), params: params, value: i < line.length ? line.substring(i + 1) : '');
  }

  static String _text(String v) =>
      v.replaceAll(RegExp(r'\\n', caseSensitive: false), ' ').replaceAllMapped(RegExp(r'\\([,;\\])'), (m) => m[1]!).replaceAll(RegExp(r'\s+'), ' ').trim();

  static IcsDate? _date(String value, [Map<String, String> params = const {}]) {
    final m = RegExp(r'^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$').firstMatch(value.trim());
    if (m == null) return null;
    final allDay = m[4] == null || params['VALUE'] == 'DATE';
    return IcsDate(
      [int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!), allDay ? 0 : int.parse(m[4]!), allDay ? 0 : int.parse(m[5]!), allDay ? 0 : int.parse(m[6] ?? '0')],
      m[7] != null ? 'UTC' : allDay ? _sg : params['TZID'],
      allDay,
    );
  }

  static const _windowsZones = {
    'singapore standard time': _sg, 'malay peninsula standard time': _sg, 'china standard time': 'Asia/Shanghai',
    'taipei standard time': 'Asia/Taipei', 'tokyo standard time': 'Asia/Tokyo', 'korea standard time': 'Asia/Seoul',
    'se asia standard time': 'Asia/Bangkok', 'india standard time': 'Asia/Kolkata', 'aus eastern standard time': 'Australia/Sydney',
    'gmt standard time': 'Europe/London', 'w. europe standard time': 'Europe/Berlin', 'eastern standard time': 'America/New_York',
    'pacific standard time': 'America/Los_Angeles', 'utc': 'UTC',
  };

  static bool _zonesIn = false;
  static final Map<String, tz.Location> _zones = {};

  static tz.Location _zone(String? name) {
    if (!_zonesIn) {
      tzdata.initializeTimeZones();
      _zonesIn = true;
    }
    final n = name ?? _sg; // a floating time is Singapore's
    return _zones[n] ??= () {
      final z = _windowsZones[n.toLowerCase()] ?? RegExp(r'([A-Za-z_]+/[A-Za-z_+-]+)$').firstMatch(n)?.group(1) ?? n;
      try {
        return tz.getLocation(z);
      } catch (_) {
        return tz.getLocation(_sg);
      }
    }();
  }

  /// A wall-clock time in a zone as a moment.
  static int _ms(List<int> c, String? zone) {
    if (zone == 'UTC') return DateTime.utc(c[0], c[1], c[2], c[3], c[4], c[5]).millisecondsSinceEpoch;
    return tz.TZDateTime(_zone(zone), c[0], c[1], c[2], c[3], c[4], c[5]).millisecondsSinceEpoch;
  }

  static int? _duration(String value) {
    final m = RegExp(r'^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$').firstMatch(value.trim());
    if (m == null || m[1] == '-') return null;
    int n(int i) => int.tryParse(m[i] ?? '') ?? 0;
    return ((((n(2) * 7 + n(3)) * 24 + n(4)) * 60 + n(5)) * 60 + n(6)) * 1000;
  }

  static int _lengthOf(IcsEvent ev) {
    final start = _ms(ev.start!.c, ev.start!.tz);
    final end = ev.end != null ? _ms(ev.end!.c, ev.end!.tz ?? ev.start!.tz) - start : null;
    return math.max(0, end ?? ev.duration ?? (ev.start!.allDay ? _dayMs : 0));
  }

  /// Every VEVENT with a location.
  static List<IcsEvent> parseIcs(String text) {
    final events = <IcsEvent>[];
    IcsEvent? ev;
    var nested = 0;
    for (final line in _unfold(text)) {
      if (line.isEmpty) continue;
      final l = _line(line);
      if (l.name == 'BEGIN' && l.value.toUpperCase() == 'VEVENT') {
        ev = IcsEvent();
        nested = 0;
      } else if (l.name == 'BEGIN' && ev != null) {
        nested++;
      } else if (l.name == 'END' && ev != null && nested > 0) {
        nested--;
      } else if (l.name == 'END' && l.value.toUpperCase() == 'VEVENT' && ev != null) {
        if (ev.start != null && ev.location != null && ev.location!.isNotEmpty && !_online.hasMatch(ev.location!)) events.add(ev);
        ev = null;
      } else if (ev != null && nested == 0) {
        switch (l.name) {
          case 'UID':
            ev.uid = l.value.trim();
          case 'SUMMARY':
            ev.title = _text(l.value);
          case 'LOCATION':
            ev.location = _text(l.value);
          case 'DTSTART':
            ev.start = _date(l.value, l.params);
          case 'DTEND':
            ev.end = _date(l.value, l.params);
          case 'DURATION':
            ev.duration = _duration(l.value);
          case 'RRULE':
            ev.rrule = {
              for (final kv in l.value.split(';'))
                if (kv.contains('=')) kv.substring(0, kv.indexOf('=')).toUpperCase(): kv.substring(kv.indexOf('=') + 1),
            };
          case 'EXDATE':
            for (final v in l.value.split(',')) {
              final d = _date(v, l.params);
              if (d != null) ev.exdates.add(_ms(d.c, d.tz));
            }
          case 'RECURRENCE-ID':
            final d = _date(l.value, l.params);
            if (d != null) ev.recurrenceId = _ms(d.c, d.tz);
          case 'STATUS':
            ev.cancelled = l.value.trim().toUpperCase() == 'CANCELLED';
        }
      }
    }
    return events;
  }

  // ---------- repeating events ----------

  static const _weekdays = {'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6};
  static int _dow(int y, int m, int d) => DateTime.utc(y, m, d).weekday % 7; // Sunday 0
  static List<int> _addDays(List<int> c, int n) {
    final d = DateTime.utc(c[0], c[1], c[2] + n);
    return [d.year, d.month, d.day];
  }

  static int _daysIn(int y, int m) => DateTime.utc(y, m + 1, 0).day;
  static bool _before(List<int> a, List<int> b) => a[0] != b[0] ? a[0] < b[0] : a[1] != b[1] ? a[1] < b[1] : a[2] < b[2];

  static List<List<int>> _periodDays(Map<String, String> rule, List<int> c0, int k) {
    final interval = math.max(1, int.tryParse(rule['INTERVAL'] ?? '') ?? 1);
    final byDay = (rule['BYDAY'] ?? '').split(',').where((s) => s.isNotEmpty).toList();
    final byMonthDay = (rule['BYMONTHDAY'] ?? '').split(',').where((s) => s.isNotEmpty).map(int.parse).toList();
    int? wd(String t) => t.length >= 2 ? _weekdays[t.substring(t.length - 2)] : null;
    switch (rule['FREQ']) {
      case 'DAILY':
        final d = _addDays(c0, k * interval);
        return byDay.isEmpty || byDay.any((t) => wd(t) == _dow(d[0], d[1], d[2])) ? [d] : [];
      case 'WEEKLY':
        final monday = _addDays(c0, -((_dow(c0[0], c0[1], c0[2]) + 6) % 7) + k * interval * 7);
        final wanted = byDay.isNotEmpty ? byDay.map(wd).whereType<int>().toSet() : {_dow(c0[0], c0[1], c0[2])};
        return [for (final w in wanted) _addDays(monday, (w + 6) % 7)]..sort((a, b) => _before(a, b) ? -1 : 1);
      case 'MONTHLY':
        final total = c0[1] - 1 + k * interval;
        final y = c0[0] + total ~/ 12;
        final m = total % 12 + 1;
        final n = _daysIn(y, m);
        var days = <int>[];
        if (byDay.isNotEmpty) {
          for (final t in byDay) {
            final w = wd(t);
            final nth = int.tryParse(t.substring(0, t.length - 2)) ?? 0;
            final all = [for (var d = 1; d <= n; d++) if (_dow(y, m, d) == w) d];
            if (nth == 0) {
              days.addAll(all);
            } else {
              final i = nth > 0 ? nth - 1 : all.length + nth;
              if (i >= 0 && i < all.length) days.add(all[i]);
            }
          }
        } else if (byMonthDay.isNotEmpty) {
          days = byMonthDay.map((d) => d < 0 ? n + d + 1 : d).where((d) => d >= 1 && d <= n).toList();
        } else if (c0[2] <= n) {
          days = [c0[2]];
        }
        return [for (final d in (days.toSet().toList()..sort())) [y, m, d]];
      case 'YEARLY':
        final y = c0[0] + k * interval;
        final months = (rule['BYMONTH'] ?? '').split(',').where((s) => s.isNotEmpty).map(int.parse).toList();
        final ds = byMonthDay.isNotEmpty ? byMonthDay : [c0[2]];
        return [
          for (final m in (months.isNotEmpty ? months : [c0[1]]))
            for (final d in ds)
              if (d >= 1 && d <= _daysIn(y, m)) [y, m, d],
        ];
    }
    return [];
  }

  static const _periodLen = {'DAILY': 1, 'WEEKLY': 7, 'MONTHLY': 31, 'YEARLY': 366};

  /// The moments an event starts in [from, to).
  static List<int> occurrences(IcsEvent ev, int from, int to) {
    final s = ev.start!;
    final first = _ms(s.c, s.tz);
    final rule = ev.rrule;
    final slack = s.allDay ? _dayMs : 0;
    if (rule == null || !_periodLen.containsKey(rule['FREQ'])) return first >= from - slack && first < to ? [first] : [];
    final end = rule['UNTIL'] != null ? _date(rule['UNTIL']!) : null;
    final until = end != null ? _ms(end.c, end.tz ?? s.tz) + (end.allDay ? _dayMs - 1 : 0) : 1 << 62;
    final count = rule['COUNT'] != null ? int.tryParse(rule['COUNT']!) ?? (1 << 30) : 1 << 30;
    final exdates = ev.exdates.toSet();
    final interval = math.max(1, int.tryParse(rule['INTERVAL'] ?? '') ?? 1);
    var k = 0;
    if (rule['COUNT'] == null && from > first) k = math.max(0, (from - first) ~/ (_periodLen[rule['FREQ']]! * interval * _dayMs) - 1);
    final out = <int>[];
    var seen = 0;
    for (var steps = 0; steps < 1500; steps++, k++) {
      for (final day in _periodDays(rule, s.c, k)) {
        if (_before(day, s.c)) continue;
        final ms = _ms([...day, s.c[3], s.c[4], s.c[5]], s.tz);
        if (ms > until || ++seen > count || ms >= to) return out;
        if (ms >= from - slack && !exdates.contains(ms)) out.add(ms);
      }
    }
    return out;
  }

  /// Every event not yet over, under way or starting in the next [days], soonest first, without
  /// the ones hidden.
  static List<CalEvent> upcoming(List<IcsEvent> events) {
    final now = When.nowMs();
    final to = now + days * _dayMs;
    final hidden = _hidden.toSet();
    final changed = <String, Set<int>>{};
    for (final ev in events) {
      if (ev.recurrenceId != null && ev.uid != null) (changed[ev.uid!] ??= {}).add(ev.recurrenceId!);
    }
    final out = <CalEvent>[];
    for (final ev in events) {
      if (ev.cancelled) continue;
      final skip = ev.recurrenceId == null ? changed[ev.uid] : null;
      final len = _lengthOf(ev);
      for (final start in occurrences(ev, now - len, to)) {
        if (skip?.contains(start) == true) continue;
        if (len > 0 ? start + len <= now : start < now) continue;
        final k = '${ev.uid ?? ev.title}|$start';
        if (!hidden.contains(k)) {
          out.add(CalEvent(key: k, title: ev.title ?? tr('cal.event', 'Event'), location: ev.location!, start: start, end: start + len, allDay: ev.start!.allDay));
        }
      }
    }
    out.sort((a, b) => a.start - b.start);
    return out.take(100).toList();
  }

  static bool _stillAhead(IcsEvent ev) {
    final first = _ms(ev.start!.c, ev.start!.tz);
    if (ev.rrule == null) return first + math.max(_lengthOf(ev), _dayMs) > When.nowMs();
    final until = ev.rrule!['UNTIL'] != null ? _date(ev.rrule!['UNTIL']!) : null;
    return until == null || _ms(until.c, until.tz) > When.nowMs();
  }

  // ---------- where each event is ----------

  static final Map<String, Future<CalPlace?>> _finding = {};

  /// What's remembered for a location: a place, null for none, or absent when never looked up.
  static ({bool known, CalPlace? place}) knownPlace(String location) {
    final cache = Store.I.map(placesKey);
    if (!cache.containsKey(location)) return (known: false, place: null);
    final p = cache[location];
    return (known: true, place: p is Map && p['lat'] is num ? CalPlace('${p['label']}', (p['lat'] as num).toDouble(), (p['lng'] as num).toDouble()) : null);
  }

  static void _keep(String location, CalPlace? place) {
    final cache = Store.I.map(placesKey);
    cache[location] = place?.toJson();
    final keys = cache.keys.toList();
    for (final k in keys.take(math.max(0, keys.length - _maxPlaces))) {
      cache.remove(k);
    }
    Store.I.putJson(placesKey, cache);
  }

  /// The place a location names, or null; throws when it couldn't be looked up.
  static Future<CalPlace?> placeFor(String location) {
    final k = knownPlace(location);
    if (k.known) return Future.value(k.place);
    return _finding[location] ??= () async {
      try {
        final postal = RegExp(r'\b(\d{6})\b').firstMatch(location)?.group(1);
        final tries = <String>[];
        for (final q in [postal, location.length > 150 ? location.substring(0, 150) : location, location.split(',').first]) {
          if (q != null && q.trim().length >= 2 && !tries.contains(q)) tries.add(q);
        }
        for (final q in tries) {
          final list = await Api.get('places', query: {'q': q});
          if (list is List && list.isNotEmpty && list.first is Map) {
            final f = list.first as Map;
            final own = location.split(',').first.trim();
            final place = CalPlace(own.length >= 3 && own.length <= 80 ? own : '${f['label']}', (f['lat'] as num).toDouble(), (f['lng'] as num).toDouble());
            _keep(location, place);
            return place;
          }
        }
        _keep(location, null);
        return null;
      } finally {
        _finding.remove(location);
      }
    }();
  }

  // ---------- getting the events ----------

  static ({String url, int at, List<IcsEvent> events})? _fetched;

  static Future<List<IcsEvent>> _events({bool fresh = false}) async {
    final s = settings();
    if (s['file'] is Map) return [for (final e in ((s['file'] as Map)['events'] as List? ?? const [])) ?IcsEvent.from(e)];
    final url = s['url'] as String?;
    if (url == null) return [];
    final f = _fetched;
    if (!fresh && f != null && f.url == url && When.nowMs() - f.at < _refetchMs) return f.events;
    String text;
    if (Api.fake != null) {
      text = '${await Api.fake!('calendar')}';
    } else {
      final r = await http
          .post(Api.uri('calendar'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'url': url}))
          .timeout(const Duration(seconds: 25));
      if (r.statusCode != 200) {
        String? why;
        try {
          why = (jsonDecode(r.body) as Map)['error'] as String?;
        } catch (_) {}
        throw CalError(why ?? tr('cal.readFailed', "Couldn't read your calendar right now."));
      }
      text = utf8.decode(r.bodyBytes);
    }
    final list = parseIcs(text);
    _fetched = (url: url, at: When.nowMs(), events: list);
    return list;
  }

  /// The phone's events, as upcoming gives them.
  static Future<List<CalEvent>> phoneEvents() async {
    if (!canPhone) {
      throw CalError(tr('cal.phoneNeedsApp', "Your phone's calendar is read by the SG Bus Timings Android app. Open this there, or pick another calendar in Calendar settings."), reason: 'app');
    }
    Map<String, dynamic>? reply;
    try {
      reply = await Native.call('PhoneCalendar', 'events', {'days': days});
    } on NativeError catch (e) {
      if (e.code == 'permission' || e.message.contains('permission')) {
        throw CalError(tr('cal.allowPhone', 'Allow SG Bus Timings to see your calendar, and your events with a location show here.'), reason: 'permission');
      }
      throw CalError(tr('cal.phoneFailed', "Couldn't read your phone's calendar. Try again."));
    }
    if (reply?['error'] == 'permission') {
      throw CalError(tr('cal.allowPhone', 'Allow SG Bus Timings to see your calendar, and your events with a location show here.'), reason: 'permission');
    }
    if (reply?['events'] is! List) throw CalError(tr('cal.phoneFailed', "Couldn't read your phone's calendar. Try again."));
    final now = When.nowMs();
    final hidden = _hidden.toSet();
    final out = <CalEvent>[];
    for (final ev in reply!['events'] as List) {
      if (ev is! Map || ev['location'] is! String || (ev['location'] as String).trim().isEmpty || ev['start'] is! num) continue;
      final loc = (ev['location'] as String).trim();
      if (_online.hasMatch(loc)) continue;
      final start = (ev['start'] as num).toInt();
      final allDay = ev['allDay'] == true;
      final end = ev['end'] is num && (ev['end'] as num) >= start ? (ev['end'] as num).toInt() : start + (allDay ? _dayMs : 0);
      if (!(end > start ? end > now : start >= now) || start >= now + days * _dayMs) continue;
      final title = '${ev['title'] ?? tr('cal.event', 'Event')}';
      final e = CalEvent(
        key: '${ev['key']}',
        title: title.length > 120 ? title.substring(0, 120) : title,
        location: loc.length > 200 ? loc.substring(0, 200) : loc,
        start: start,
        end: end,
        allDay: allDay,
      );
      if (!hidden.contains(e.key)) out.add(e);
    }
    out.sort((a, b) => a.start - b.start);
    return out.take(100).toList();
  }

  /// The events to list, from whichever calendar is linked.
  static Future<List<CalEvent>> upcomingList({bool fresh = false}) async =>
      settings()['phone'] == true ? phoneEvents() : upcoming(await _events(fresh: fresh));

  // ---------- changing it ----------

  static void hide(String eventKey) {
    final s = settings();
    s['hidden'] = [..._hidden, eventKey].reversed.take(_maxHidden).toList().reversed.toList();
    _save(s);
  }

  static void usePhone() {
    _save({'hidden': _hidden, 'phone': true});
    _fetched = null;
  }

  /// Links an iCal URL and reads it: the events found, or throws.
  static Future<List<CalEvent>> link(String url) async {
    final before = settings();
    _save({'hidden': _hidden, 'url': url});
    try {
      return upcoming(await _events(fresh: true));
    } catch (_) {
      _save(before);
      rethrow;
    }
  }

  /// Imports an .ics file's text.
  static List<CalEvent> importFile(String name, String text) {
    if (!RegExp('BEGIN:VCALENDAR', caseSensitive: false).hasMatch(text.substring(0, math.min(2000, text.length)))) {
      throw CalError(tr('cal.notIcs', "That isn't a calendar file. Pick an .ics file."));
    }
    final kept = parseIcs(text).where(_stillAhead).take(_maxEvents).toList();
    _save({
      'hidden': _hidden,
      'file': {'name': name.length > 80 ? name.substring(0, 80) : name, 'importedAt': When.nowMs(), 'events': [for (final e in kept) e.toJson()]},
    });
    return upcoming(kept);
  }

  static void unlink() {
    _save({'hidden': <String>[]});
    _fetched = null;
    Store.I.put(placesKey, null);
  }

  // ---------- Sync ----------

  static List<Map<String, String>> syncList() {
    final url = settings()['url'] as String?;
    return url == null ? const [] : [{'url': url}];
  }

  static int mergeSync(String url) {
    String same(String? u) => (u ?? '').replaceFirst(RegExp(r'^webcals?://', caseSensitive: false), 'https://');
    if (same(settings()['url'] as String?) == same(url)) return 0;
    _save({'hidden': <String>[], 'url': url});
    return 1;
  }

  // ---------- words ----------

  static String eventsText(int n, {bool yet = false}) => n == 1
      ? tr('cal.oneEvent', '1 event with a location in the next {d} days.', {'d': days})
      : n > 0
          ? tr('cal.manyEvents', '{n} events with a location in the next {d} days.', {'n': n, 'd': days})
          : yet
              ? tr('cal.noEventsYet', 'No events with a location in the next {d} days yet.', {'d': days})
              : tr('cal.noEvents', 'No events with a location in the next {d} days.', {'d': days});

  static String _sgDay(int ms) => DateTime.fromMillisecondsSinceEpoch(ms + 8 * 3600 * 1000, isUtc: true).toIso8601String().substring(0, 10);
  static bool isToday(CalEvent ev) => _sgDay(ev.start) == _sgDay(When.nowMs()) || ev.start <= When.nowMs();

  static String whenText(CalEvent ev) {
    final now = When.nowMs();
    final today = _sgDay(now);
    final d = _sgDay(ev.start);
    final dayText = d == today
        ? tr('alerts.today', 'Today')
        : d == _sgDay(now + _dayMs)
            ? tr('alerts.tomorrow', 'Tomorrow')
            : When.dayShort(ev.start);
    if (!ev.allDay && ev.start <= now && ev.end > now) {
      return tr('cal.onNow', 'On now: until {time}', {'time': '${_sgDay(ev.end) == today ? '' : '${When.dayShort(ev.end)}, '}${When.clock(ev.end)}'});
    }
    return ev.allDay ? tr('cal.allDay', 'All day: {day}', {'day': dayText}) : tr('cal.arrive', 'Arrive: {day}, {time}', {'day': dayText, 'time': When.clock(ev.start)});
  }
}
