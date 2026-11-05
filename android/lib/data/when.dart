// When a journey is for, in Navigate and the route planner: Leave now, Leave at a time, or
// Arrive by one, picked up to a week ahead. A picked time is (mode: 'leave' | 'arrive', at)
// with `at` Singapore's own clock, "2026-10-09T08:30"; Leave now is null. Also whether a bus or
// train is running at a moment. Ported from the site's js/when.js; keep in step with it,
// api/_nav/when.js and the bot's when.py.
import 'package:intl/intl.dart';

import '../i18n/i18n.dart';

class WhenPick {
  const WhenPick(this.mode, this.at);
  final String mode; // 'leave' | 'arrive'
  final String at; // "2026-10-09T08:30", Singapore's clock

  Map<String, String> toJson() => {'mode': mode, 'at': at};
  static WhenPick? fromJson(Object? j) =>
      j is Map && j['mode'] is String && j['at'] is String ? WhenPick(j['mode'] as String, j['at'] as String) : null;
}

class SgClock {
  SgClock(this.ymd, this.min, this.dow, this.day, this.month, this.year);
  final String ymd;
  final int min; // minute of the day
  final int dow; // 0 Sunday .. 6 Saturday, as JS's getDay
  final int day;
  final int month; // 0 .. 11
  final int year;
}

class When {
  When._();

  /// For tests and screenshots: the clock stopped at a moment.
  static DateTime Function() now = DateTime.now;
  static int nowMs() => now().millisecondsSinceEpoch;

  static const holidays = {
    '2026-01-01', '2026-02-17', '2026-02-18', '2026-03-21', '2026-04-03', '2026-05-01',
    '2026-05-27', '2026-06-01', '2026-08-10', '2026-11-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-08', '2027-03-10', '2027-03-26', '2027-05-01',
    '2027-05-17', '2027-05-20', '2027-08-09', '2027-10-28', '2027-12-25',
  };

  static const _trainFirstMin = {'wd': 330, 'sat': 330, 'sun': 360};
  static const _trainLastMin = 1440;
  static const _firstBusGraceMin = 10;
  static const busWaitMin = 5;
  static const _liveWindowMin = 30;
  static const daysAhead = 7;
  static const stepMin = 5;
  static const _behindMs = 2 * 60000;
  static const _sgOffsetMs = 8 * 3600 * 1000;
  static final _atRe = RegExp(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$');
  static String _pad(int n) => n.toString().padLeft(2, '0');
  static const _dayOffset = {'wd': 0, 'sat': 8, 'sun': 16};
  static const _dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  static bool isHoliday(String ymd) => holidays.contains(ymd);

  static int? atToMs(String? at) {
    final m = _atRe.firstMatch(at ?? '');
    if (m == null) return null;
    return DateTime.utc(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!), int.parse(m[4]!), int.parse(m[5]!))
            .millisecondsSinceEpoch -
        _sgOffsetMs;
  }

  static SgClock sgClock(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms + _sgOffsetMs, isUtc: true);
    return SgClock('${d.year}-${_pad(d.month)}-${_pad(d.day)}', d.hour * 60 + d.minute, d.weekday % 7, d.day, d.month - 1, d.year);
  }

  static String msToAt(int ms) {
    final c = sgClock(ms);
    return '${c.ymd}T${_pad(c.min ~/ 60)}:${_pad(c.min % 60)}';
  }

  static String dayType(String ymd, int dow) {
    if (dow == 0 || holidays.contains(ymd)) return 'sun';
    return dow == 6 ? 'sat' : 'wd';
  }

  static int? _hhmm(String s) => RegExp(r'^\d{4}$').hasMatch(s) ? int.parse(s.substring(0, 2)) * 60 + int.parse(s.substring(2)) : null;

  static bool _inWindow(String times, String type, int min) {
    final o = _dayOffset[type]!;
    if (times.length < o + 8) return false;
    final first = _hhmm(times.substring(o, o + 4));
    var last = _hhmm(times.substring(o + 4, o + 8));
    if (first == null || last == null) return false;
    if (last < first) last += 1440;
    return min >= first - _firstBusGraceMin && min <= last;
  }

  /// Whether a bus is running at a stop at a moment, from its 24-character first/last string.
  static bool busRunsAt(String? times, int ms) {
    if (times == null || times.length < 24) return true;
    final today = sgClock(ms);
    final before = sgClock(ms - 86400000);
    return _inWindow(times, dayType(today.ymd, today.dow), today.min) ||
        _inWindow(times, dayType(before.ymd, before.dow), today.min + 1440);
  }

  static bool trainRunsAt(int ms) {
    final c = sgClock(ms);
    return c.min >= _trainFirstMin[dayType(c.ymd, c.dow)]! && c.min < _trainLastMin;
  }

  static const _customsMin = {'quiet': 15, 'edge': 30, 'rush': 60};
  static const _customsRush = {
    'out': {'wd': [[1020, 1260]], 'fri': [[960, 1440]], 'sat': [[360, 720]], 'sun': <List<int>>[]},
    'in': {'wd': [[300, 540]], 'fri': [[300, 540]], 'sat': <List<int>>[], 'sun': [[900, 1440]]},
  };

  /// Minutes to clear immigration across the Causeway, 'out' or 'in', at a moment.
  static int customsMin(String dir, int ms) {
    final c = sgClock(ms);
    final type = dayType(c.ymd, c.dow);
    var edge = false;
    for (final r in _customsRush[dir]![type == 'wd' && c.dow == 5 ? 'fri' : type]!) {
      if (c.min >= r[0] && c.min < r[1]) return _customsMin['rush']!;
      if (c.min >= r[0] - 60 && c.min < r[1] + 60) edge = true;
    }
    return edge ? _customsMin['edge']! : _customsMin['quiet']!;
  }

  static int msOf(WhenPick? when) => when == null ? nowMs() : (atToMs(when.at) ?? nowMs());

  /// Why a picked time can't be planned for, or null when it can.
  static String? problem(WhenPick? when) {
    if (when == null) return null;
    final ms = atToMs(when.at);
    if (ms == null) return tr('when.pick', 'Pick a day and a time.');
    if (ms < nowMs() - _behindMs) return tr('when.passed', 'That time has already passed. Pick a later one, or Leave now.');
    if (ms > nowMs() + (daysAhead + 1) * 86400000) return tr('when.tooFar', 'Pick a time within the next week.');
    return null;
  }

  static ({int leave, int arrive}) span(WhenPick? when, num minutes) {
    final ms = msOf(when);
    final d = (minutes * 60000).round();
    return when?.mode == 'arrive' ? (leave: ms - d, arrive: ms) : (leave: ms, arrive: ms + d);
  }

  static double? liveLead(int leaveMs) {
    final lead = (leaveMs - nowMs()) / 60000;
    return lead >= -1 && lead <= _liveWindowMin ? (lead < 0 ? 0 : lead) : null;
  }

  /// "14:32", Singapore's clock.
  static String clock(int ms) {
    final c = sgClock(ms);
    return '${_pad(c.min ~/ 60)}:${_pad(c.min % 60)}';
  }

  /// "today", "tomorrow" or "Sat 10 Oct", by Singapore's calendar.
  static String dayLabel(int ms) {
    final c = sgClock(ms);
    if (c.ymd == sgClock(nowMs()).ymd) return tr('when.today', 'today');
    if (c.ymd == sgClock(nowMs() + 86400000).ymd) return tr('when.tomorrow', 'tomorrow');
    if (I18n.I.lang != 'en') {
      final d = DateTime.utc(c.year, c.month + 1, c.day);
      return DateFormat('EEE d MMM', I18n.I.current.locale.toLanguageTag()).format(d);
    }
    return '${_dow[c.dow]} ${c.day} ${_months[c.month]}';
  }

  static String clockDay(int ms) =>
      sgClock(ms).ymd == sgClock(nowMs()).ymd ? clock(ms) : tr('when.clockDay', '{time} {day}', {'time': clock(ms), 'day': dayLabel(ms)});

  static String describe(WhenPick? when) {
    if (when == null) return tr('nav.leave_now', 'Leave now');
    final ms = atToMs(when.at) ?? nowMs();
    return when.mode == 'arrive'
        ? tr('when.arriveBy', 'Arrive by {time}', {'time': clockDay(ms)})
        : tr('when.leaveAt', 'Leave at {time}', {'time': clockDay(ms)});
  }

  static String hashPart(WhenPick? when) => when == null ? '' : '/${when.mode}/${when.at}';
  static const hashReSource = r'(?:\/(leave|arrive)\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}))?';
  static WhenPick? fromHash(String? mode, String? at) => mode != null && at != null && atToMs(at) != null ? WhenPick(mode, at) : null;

  /// The first time a pick starts on: the next five minutes, or half an hour on for Arrive by.
  static int firstPick(String mode) {
    const step = stepMin * 60000;
    return ((nowMs() + (mode == 'arrive' ? 30 * 60000 : 0)) / step).ceil() * step;
  }
}
