// Service Alerts on the desktop (desktop-features-spec §7), as the site's js/alerts.js does them in
// the Electron app: there's no push to a computer, so while the app runs (open or in the tray) it
// checks every minute by the server's own rules (main-site/api/_push/alerts.js: diffTrain,
// diffTraffic, updateFor):
//
// - the first look only notes how things are, so starting the app never repeats old news;
// - after that, a train update when anything about the trains changes ("disruptions": only while
//   one's on, and as it clears), and each traffic incident not seen in the last six hours
//   ("disruptions": only those that can block a bus);
// - the newsfeed: what's new since the last look, all of it or only LTA's and the service changes.
//
// Changing the choice in the Service Alerts screen starts afresh at once, as the site's
// desktopWatch does. The disruptions bar on the main window is updated from the same check.
// test/desktop/alerts_poll_test.dart checks the rules.
import 'dart:async';
import 'dart:convert';

import '../api/api.dart';
import '../data/store.dart';
import '../features/alerts/alerts.dart';
import '../i18n/i18n.dart';
import 'notify.dart';

/// Checks Service Alerts and the newsfeed every minute and shows what's new as notifications.
class AlertsPoll {
  AlertsPoll._();

  /// How often it looks, as the site's DESKTOP_POLL_MS.
  static const every = Duration(minutes: 1);

  /// An incident LTA drops and lists again inside this time isn't announced twice.
  static const seenFor = Duration(hours: 6);

  static Timer? _timer;
  static StreamSubscription<String>? _choiceWatch;
  static Timer? _choiceSoon;

  // How things were at the last look; null until the first.
  static ({String key, bool disrupted})? _train;
  static Map<String, int>? _seen;
  static Set<String>? _news;
  static String? _modesKey;

  /// Goes up each time the person's choice changes, so a look that started before the change
  /// drops its answer when it comes back (the site's `desktop !== d`).
  static int _round = 0;

  /// Starts looking: now, every minute after, and at once whenever the person changes what they
  /// want to hear about. Also tells the Service Alerts screen there's no push server to sign up to.
  static void start() {
    Alerts.polled = true;
    _timer ??= Timer.periodic(every, (_) => poll());
    _choiceWatch ??= Store.I.changes.where((k) => k == Alerts.modesKey || k == Alerts.modeKey).listen((_) => _choiceChanged());
    poll();
  }

  /// The choice in the Service Alerts screen changed: look again now and count the minute from
  /// here, as the site does. Saving a choice writes two keys, so the two changes become one look.
  static void _choiceChanged() {
    // A look already on its way was for the old choice: its answer is dropped.
    _round++;
    _choiceSoon?.cancel();
    _choiceSoon = Timer(Duration.zero, () {
      _timer?.cancel();
      _timer = Timer.periodic(every, (_) => poll());
      poll();
    });
  }

  /// The newsfeed's rules, as the site's CHANGES_RE and NOT_CHANGES_RE: a notice whose title
  /// says a service changes, and doesn't say it's about fares, awards, jobs and the like.
  static final changes = RegExp(r'divers|clos|skip|servic|stop|route|berth|shuttle|disrupt|extend|extension|operating hours|last (bus|train)|relocat|amend|adjust|new (bus|short|peak|service)|interchange|terminal', caseSensitive: false);
  static final notChanges = RegExp(r'fare|award|recruit|career|contract|campaign|trial|winner|appoint', caseSensitive: false);

  /// One look: fetches the service alerts (whenever any kind is on, so the disruptions bar stays
  /// current) and the newsfeed (when it's on), and shows a notification for anything new.
  static Future<void> poll() async {
    final modes = Alerts.modes();
    _startAfreshIfChanged(modes);
    if (!Alerts.anyOn(modes)) return;
    final round = _round;
    final data = await _serviceAlerts();
    if (round != _round) return;
    if (data != null) {
      final out = check(data, modes, DateTime.now().millisecondsSinceEpoch);
      if (out != null) await DeskNotify.show(title: out.$1, body: out.$2, url: '/#alerts');
      final train = data['train'];
      if (train is Map) Alerts.bar.value = Alerts.disruptionText(train);
    }
    // The newsfeed comes from its own address, so it's looked at even if the alerts didn't load.
    final newsMode = modes['newsfeed'] ?? 'off';
    if (newsMode != 'off') await _newsfeed(newsMode, round);
  }

  /// A different choice from last time forgets everything seen, so the next look only notes how
  /// things are again.
  static void _startAfreshIfChanged(Map<String, String> modes) {
    final key = jsonEncode(modes);
    if (key == _modesKey) return;
    _modesKey = key;
    _round++;
    _train = null;
    _seen = null;
    _news = null;
  }

  /// The site's /api/service-alerts answer, or null offline.
  static Future<Map<String, dynamic>?> _serviceAlerts() async {
    try {
      return await Api.map('service-alerts');
    } catch (_) {
      return null;
    }
  }

  /// What to say for this look, if anything: (title, body). Notes what's been seen for next time.
  /// One notification sums up the trains and the traffic together, titled "Service Alerts" when
  /// it has both.
  static (String, String)? check(Map<String, dynamic> data, Map<String, String> modes, int now) {
    final train = data['train'];
    final traffic = data['traffic'];
    final trainNews = train is Map ? _trainNews(train, modes['train']) : null;
    final trafficNews = traffic is List ? _trafficNews(traffic, modes['traffic'], now) : null;
    if (trainNews != null && trafficNews != null) {
      return (tr('alerts.title', 'Service Alerts'), '${trainNews.$2}\n${trafficNews.$2}');
    }
    return trainNews ?? trafficNews;
  }

  /// The trains' part of a look: (title, body) when something about them changed and [mode]
  /// wants to hear it. Notes how they are now, for the next look.
  static (String, String)? _trainNews(Map train, String? mode) {
    // As the site's Number(Status) || 1: missing, unreadable or 0 all count as 1, running normally.
    var status = train['Status'] is num ? (train['Status'] as num).toInt() : int.tryParse('${train['Status']}') ?? 1;
    if (status == 0) status = 1;
    final segments = train['AffectedSegments'] is List ? train['AffectedSegments'] as List : const [];
    final key = jsonEncode([status, segments, train['Message'] ?? []]);
    final disrupted = status > 1 || segments.isNotEmpty;
    final was = _train;
    _train = (key: key, disrupted: disrupted);
    if (was == null || was.key == key) return null;
    // "Disruptions" hears a change while a disruption is on either side of it, so it hears when
    // one clears too.
    final wanted = mode == 'all' || (mode == 'disruptions' && (disrupted || was.disrupted));
    if (!wanted) return null;
    return (
      disrupted ? tr('alerts.trainDisruption', 'Train disruption') : tr('alerts.trainUpdate', 'Train service update'),
      Alerts.disruptionText(train) ?? tr('alerts.trainsOkAgain', 'All train services are running normally again.'),
    );
  }

  /// The traffic's part of a look: (title, body) for incidents not seen in the last [seenFor]
  /// that [mode] wants to hear, the first one in full and the rest counted. Notes every incident
  /// listed now, for the next look.
  static (String, String)? _trafficNews(List traffic, String? mode, int now) {
    final first = _seen == null;
    final seen = {
      for (final e in (_seen ?? const <String, int>{}).entries)
        if (now - e.value < seenFor.inMilliseconds) e.key: e.value,
    };
    final fresh = <Map>[];
    for (final i in traffic.whereType<Map>()) {
      final k = '${i['type']}|${i['message']}';
      if (!first && !seen.containsKey(k)) fresh.add(i);
      seen[k] = now;
    }
    _seen = seen;
    final heard = switch (mode) {
      'all' => fresh,
      'disruptions' => fresh.where((i) => Alerts.blocking.contains('${i['type']}'.trim().toLowerCase())).toList(),
      _ => const <Map>[],
    };
    if (heard.isEmpty) return null;
    final more = switch (heard.length) {
      1 => '',
      2 => '\n${tr('alerts.oneMoreIncident', 'And 1 more traffic incident.')}',
      _ => '\n${tr('alerts.moreIncidents', 'And {n} more traffic incidents.', {'n': heard.length - 1})}',
    };
    final title = heard.length == 1
        ? tr('alerts.newIncident', 'New {type}', {'type': '${heard.first['type']}'.toLowerCase()})
        : tr('alerts.newIncidents', '{n} new traffic incidents', {'n': heard.length});
    return (title, '${heard.first['message']}$more');
  }

  /// Fetches the newsfeed and shows what's new in it. [round] drops the answer if the person's
  /// choice changed while it was fetching.
  static Future<void> _newsfeed(String mode, int round) async {
    Map<String, dynamic>? data;
    try {
      data = await Alerts.loadNotices(fresh: true);
    } catch (_) {
      return;
    }
    if (data == null || round != _round) return;
    final out = news(data, mode);
    if (out != null) await DeskNotify.show(title: out.$1, body: out.$2, url: '/#alerts');
  }

  /// The newsfeed's notification for this look, if anything new is worth it: (title, body) with
  /// up to three titles. The first look only notes what's there. [mode] "all" hears every new
  /// notice; otherwise only LTA's own and those about a service changing.
  static (String, String)? news(Map<String, dynamic> data, String mode) {
    final items = ((data['items'] as List?) ?? const []).whereType<Map>().toList();
    final ids = {for (final n in items) '${n['id']}'};
    final fresh = _news == null ? const <Map>[] : items.where((n) => !_news!.contains('${n['id']}')).toList();
    _news = ids;
    final heard = mode == 'all' ? fresh : fresh.where(_aboutAChange).toList();
    if (heard.isEmpty) return null;
    final sources = (data['sources'] as Map?) ?? const {};
    String from(Map n) => n['source'] == 'lta' ? 'LTA' : '${sources[n['source']] ?? n['source']}';
    final title = heard.length == 1 ? tr('alerts.newsFrom', 'Newsfeed: {from}', {'from': from(heard.first)}) : tr('alerts.newsMany', 'Newsfeed: {n} new notices', {'n': heard.length});
    final lines = [for (final n in heard.take(3)) heard.length == 1 ? '${n['title']}' : '${from(n)}: ${n['title']}'];
    return (title, lines.join('\n'));
  }

  /// Whether a notice is worth hearing in "disruptions" mode: LTA's own, or one whose title says
  /// a service changes.
  static bool _aboutAChange(Map n) => n['source'] == 'lta' || (changes.hasMatch('${n['title']}') && !notChanges.hasMatch('${n['title']}'));

  /// For tests: stop looking, and forget what's been seen.
  static void reset() {
    _timer?.cancel();
    _timer = null;
    _choiceWatch?.cancel();
    _choiceWatch = null;
    _choiceSoon?.cancel();
    _choiceSoon = null;
    _train = null;
    _seen = null;
    _news = null;
    _modesKey = null;
  }
}
