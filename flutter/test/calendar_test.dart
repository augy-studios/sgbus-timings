// The calendar's events, read and expanded as the site's js/calendar.js does them: the same
// .ics through both gives the same events at the same moments (test/fixtures/calendar-expected.json
// is the site's answer, at 08:30 on 30 October 2026 in Singapore).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/data/calendar.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/data/when.dart';

void main() {
  test('repeating events, time zones, exceptions and changes, as the site', () {
    Store.memory({});
    When.now = () => DateTime.utc(2026, 10, 30, 0, 30);
    final events = Calendar.parseIcs(File('test/fixtures/calendar.ics').readAsStringSync());
    final got = [for (final e in Calendar.upcoming(events)) [e.title, e.start, e.end, e.allDay]];
    final want = jsonDecode(File('test/fixtures/calendar-expected.json').readAsStringSync());
    expect(jsonEncode(got), jsonEncode(want));
  });
}
