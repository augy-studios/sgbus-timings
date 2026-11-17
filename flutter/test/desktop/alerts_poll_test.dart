// Service Alerts on the desktop (lib/desktop/alerts_poll.dart), by the server's rules
// (main-site/api/_push/alerts.js) as the site's desktop polling applies them: the first look only
// notes how things are; after that, only what changed, by each kind's choice. Then the looking
// itself: what it fetches, and starting afresh when the choice changes.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/api/api.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/desktop/alerts_poll.dart';
import 'package:sgbus_timings/features/alerts/alerts.dart';

const _all = {'train': 'all', 'traffic': 'all', 'newsfeed': 'all'};
const _disruptions = {'train': 'disruptions', 'traffic': 'disruptions', 'newsfeed': 'disruptions'};
const _normal = {'Status': 1, 'AffectedSegments': [], 'Message': []};
const _disrupted = {
  'Status': 2,
  'AffectedSegments': [
    {'Line': 'EWL', 'Direction': 'Both', 'Stations': 'EW1,EW2,EW3'},
  ],
  'Message': [],
};
const _hour = 60 * 60 * 1000;

/// An LTA traffic incident.
Map<String, String> _incident(String type, String message) => {'type': type, 'message': message};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(AlertsPoll.reset);
  tearDown(() {
    AlertsPoll.reset();
    Api.fake = null;
  });

  group('trains', () {
    test('the first look only notes how they are, even mid-disruption', () {
      expect(AlertsPoll.check({'train': _disrupted}, _all, 0), isNull);
      expect(AlertsPoll.check({'train': _disrupted}, _all, 60000), isNull);
    });

    test('a change is heard, titled by whether a disruption is on', () {
      AlertsPoll.check({'train': _normal}, _all, 0);
      expect(AlertsPoll.check({'train': _disrupted}, _all, 1), ('Train disruption', Alerts.disruptionText(_disrupted)));
      expect(AlertsPoll.check({'train': _normal}, _all, 2), ('Train service update', 'All train services are running normally again.'));
    });

    test('"disruptions" hears changes while one is on, and when it clears, but not others', () {
      const notice = {'Status': 1, 'AffectedSegments': [], 'Message': [{'Content': 'Track works this weekend'}]};
      AlertsPoll.check({'train': _normal}, _disruptions, 0);
      expect(AlertsPoll.check({'train': notice}, _disruptions, 1), isNull);
      expect(AlertsPoll.check({'train': _disrupted}, _disruptions, 2)?.$1, 'Train disruption');
      expect(AlertsPoll.check({'train': notice}, _disruptions, 3)?.$1, 'Train service update');
    });

    test('"all" hears a change of notice too', () {
      const notice = {'Status': 1, 'AffectedSegments': [], 'Message': [{'Content': 'Track works this weekend'}]};
      AlertsPoll.check({'train': _normal}, _all, 0);
      expect(AlertsPoll.check({'train': notice}, _all, 1), ('Train service update', 'All train services are running normally again.'));
    });

    test('"off" hears nothing about the trains', () {
      const off = {'train': 'off', 'traffic': 'all', 'newsfeed': 'off'};
      AlertsPoll.check({'train': _normal}, off, 0);
      expect(AlertsPoll.check({'train': _disrupted}, off, 1), isNull);
    });

    test('a status of 0, or none, counts as running normally (1)', () {
      AlertsPoll.check({'train': _normal}, _all, 0);
      expect(AlertsPoll.check({'train': {..._normal, 'Status': 0}}, _all, 1), isNull);
      expect(AlertsPoll.check({'train': {'AffectedSegments': [], 'Message': []}}, _all, 2), isNull);
    });
  });

  group('traffic', () {
    final crash = _incident('Accident', 'Accident on PIE (towards Changi) after Adam Rd.');
    final works = _incident('Roadwork', 'Roadworks on Bukit Timah Rd.');
    final breakdown = _incident('Vehicle breakdown', 'Vehicle breakdown on CTE.');

    test('the first look only notes what is listed', () {
      expect(AlertsPoll.check({'traffic': [crash]}, _all, 0), isNull);
      expect(AlertsPoll.check({'traffic': [crash]}, _all, 60000), isNull);
    });

    test('each new incident is heard once', () {
      AlertsPoll.check({'traffic': [works]}, _all, 0);
      expect(AlertsPoll.check({'traffic': [works, crash]}, _all, 1), ('New accident', crash['message']));
      expect(AlertsPoll.check({'traffic': [works, crash]}, _all, 2), isNull);
    });

    test('several new ones are summed up under the first', () {
      AlertsPoll.check({'traffic': []}, _all, 0);
      expect(AlertsPoll.check({'traffic': [crash, works]}, _all, 1), ('2 new traffic incidents', '${crash['message']}\nAnd 1 more traffic incident.'));
      final three = [_incident('Accident', 'a'), _incident('Accident', 'b'), _incident('Accident', 'c')];
      expect(AlertsPoll.check({'traffic': three}, _all, 2), ('3 new traffic incidents', 'a\nAnd 2 more traffic incidents.'));
    });

    test('one listed again within six hours is not new; after six hours unseen it is', () {
      AlertsPoll.check({'traffic': [crash]}, _all, 0);
      expect(AlertsPoll.check({'traffic': []}, _all, _hour), isNull);
      expect(AlertsPoll.check({'traffic': [crash]}, _all, 2 * _hour), isNull);
      expect(AlertsPoll.check({'traffic': []}, _all, 3 * _hour), isNull);
      expect(AlertsPoll.check({'traffic': [crash]}, _all, 8 * _hour + 1)?.$1, 'New accident');
    });

    test('"disruptions" hears only incidents that can block or reroute a bus', () {
      AlertsPoll.check({'traffic': []}, _disruptions, 0);
      expect(AlertsPoll.check({'traffic': [works, breakdown]}, _disruptions, 1), ('New vehicle breakdown', breakdown['message']));
      expect(AlertsPoll.check({'traffic': [works, breakdown, _incident('Roadwork', 'More roadworks.')]}, _disruptions, 2), isNull);
    });
  });

  test('trains and traffic together make one notification, titled Service Alerts', () {
    final crash = _incident('Accident', 'Accident on PIE.');
    AlertsPoll.check({'train': _normal, 'traffic': []}, _all, 0);
    final out = AlertsPoll.check({'train': _disrupted, 'traffic': [crash]}, _all, 1);
    expect(out, ('Service Alerts', '${Alerts.disruptionText(_disrupted)}\nAccident on PIE.'));
  });

  test('nothing to read (offline) changes nothing', () {
    AlertsPoll.check({'train': _normal, 'traffic': []}, _all, 0);
    expect(AlertsPoll.check({}, _all, 1), isNull);
    expect(AlertsPoll.check({'train': _disrupted}, _all, 2)?.$1, 'Train disruption');
  });

  group('newsfeed', () {
    const sources = {'sbst': 'SBS Transit', 'smrt': 'SMRT'};
    Map<String, dynamic> feed(List<Map<String, String>> items) => {'items': items, 'sources': sources};
    const old = {'id': '1', 'source': 'sbst', 'title': 'Service 12 diverted'};
    const lta = {'id': '2', 'source': 'lta', 'title': 'Fare review results'};
    const fares = {'id': '3', 'source': 'smrt', 'title': 'New fare cards on sale'};
    const route = {'id': '4', 'source': 'smrt', 'title': 'Bus service 190 extended to Tuas'};

    test('the first look only notes what is there', () {
      expect(AlertsPoll.news(feed([old]), 'all'), isNull);
      expect(AlertsPoll.news(feed([old]), 'all'), isNull);
    });

    test('one new notice is titled by who it is from', () {
      AlertsPoll.news(feed([old]), 'all');
      expect(AlertsPoll.news(feed([old, fares]), 'all'), ('Newsfeed: SMRT', 'New fare cards on sale'));
    });

    test('"disruptions" hears only LTA\'s own and service changes, not fares and the like', () {
      AlertsPoll.news(feed([old]), 'disruptions');
      expect(AlertsPoll.news(feed([old, lta, fares, route]), 'disruptions'), ('Newsfeed: 2 new notices', 'LTA: Fare review results\nSMRT: Bus service 190 extended to Tuas'));
    });

    test('at most three titles are listed', () {
      AlertsPoll.news(feed([]), 'all');
      final many = [for (var i = 0; i < 5; i++) {'id': 'n$i', 'source': 'sbst', 'title': 'Notice $i'}];
      final out = AlertsPoll.news(feed(many), 'all');
      expect(out?.$1, 'Newsfeed: 5 new notices');
      expect(out?.$2.split('\n'), ['SBS Transit: Notice 0', 'SBS Transit: Notice 1', 'SBS Transit: Notice 2']);
    });
  });

  test('the newsfeed rules match the site\'s words', () {
    expect(AlertsPoll.changes.hasMatch('Last bus timings amended'), isTrue);
    expect(AlertsPoll.notChanges.hasMatch('Bus Captain of the Year award winner'), isTrue);
  });

  group('looking', () {
    test('with only the newsfeed on, the service alerts are still fetched, for the disruptions bar', () async {
      Store.memory({Alerts.modesKey: '{"train":"off","traffic":"off","newsfeed":"all"}'});
      final asked = <String>[];
      Api.fake = (path) async {
        asked.add(path);
        return path.startsWith('service-alerts') ? {'train': _disrupted, 'traffic': []} : {'items': [], 'sources': {}};
      };
      Alerts.bar.value = null;
      await AlertsPoll.poll();
      expect(asked.where((p) => p.startsWith('service-alerts')), hasLength(1));
      expect(asked.where((p) => p.startsWith('notices')), hasLength(1));
      expect(Alerts.bar.value, Alerts.disruptionText(_disrupted));
    });

    test('with everything off, nothing is fetched', () async {
      Store.memory({});
      var asked = 0;
      Api.fake = (path) async {
        asked++;
        return {};
      };
      await AlertsPoll.poll();
      expect(asked, 0);
    });

    test('a look that started before the choice changed drops its answer when it comes', () async {
      Store.memory({Alerts.modesKey: '{"train":"all","traffic":"all","newsfeed":"off"}'});
      final late = Completer<Object?>();
      var n = 0;
      Api.fake = (path) {
        n++;
        return n == 1 ? late.future : Future.value({'train': _normal, 'traffic': []});
      };
      final stale = AlertsPoll.poll();
      const now = {'train': 'disruptions', 'traffic': 'all', 'newsfeed': 'off'};
      Store.I.putJson(Alerts.modesKey, now);
      await AlertsPoll.poll();
      Alerts.bar.value = 'untouched';
      late.complete({'train': _disrupted, 'traffic': []});
      await stale;
      expect(Alerts.bar.value, 'untouched');
      // The new choice's look noted the trains running normally, so a disruption is news.
      expect(AlertsPoll.check({'train': _disrupted}, now, 1)?.$1, 'Train disruption');
    });

    test('changing the choice looks again at once, once, though saving it writes two keys', () async {
      Store.memory({Alerts.modeKey: 'all'});
      var n = 0;
      Api.fake = (path) async {
        if (path.startsWith('service-alerts')) n++;
        return {'train': _normal, 'traffic': [], 'items': []};
      };
      AlertsPoll.start();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(n, 1);
      Alerts.storeModes({'train': 'disruptions', 'traffic': 'off', 'newsfeed': 'off'});
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(n, 2);
    });

    test('a look on its way when the choice changes is dropped, even before the next look starts', () async {
      Store.memory({Alerts.modesKey: '{"train":"all","traffic":"all","newsfeed":"off"}'});
      final late = Completer<Object?>();
      var n = 0;
      Api.fake = (path) {
        n++;
        return n == 1 ? late.future : Future.value({'train': _normal, 'traffic': []});
      };
      AlertsPoll.start();
      await Future<void>.delayed(Duration.zero);
      Alerts.storeModes({'train': 'disruptions', 'traffic': 'all', 'newsfeed': 'off'});
      Alerts.bar.value = 'untouched';
      // The old look's answer comes back while the change is still on its way to a new look.
      late.complete({'train': _disrupted, 'traffic': []});
      await Future<void>.delayed(Duration.zero);
      expect(Alerts.bar.value, 'untouched');
    });
  });
}
