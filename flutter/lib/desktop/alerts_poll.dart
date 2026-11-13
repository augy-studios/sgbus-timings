// Service Alerts on the desktop, as the site's js/alerts.js does them in the desktop app: there's
// no push to a computer, so while the app runs (open or in the tray) it checks every minute by
// the server's own rules (main-site/api/_push/alerts.js: diffTrain, diffTraffic, updateFor): the
// first look only notes how things are; after that, a train update when anything about the
// trains changes ("disruptions": only while one's on, and as it clears), and each traffic incident
// not seen in the last six hours ("disruptions": only those that can block a bus). The newsfeed:
// what's new since the last look, all of it or only LTA's and the service changes.
import 'dart:async';
import 'dart:convert';

import '../api/api.dart';
import '../features/alerts/alerts.dart';
import '../i18n/i18n.dart';
import 'notify.dart';

class AlertsPoll {
  AlertsPoll._();

  static const every = Duration(minutes: 1);
  static const seenFor = Duration(hours: 6);
  static Timer? _timer;

  // How things were at the last look; null until the first.
  static ({String key, bool disrupted})? _train;
  static Map<String, int>? _seen;
  static Set<String>? _news;
  static String? _modesKey;

  static void start() {
    Alerts.polled = true;
    _timer ??= Timer.periodic(every, (_) => poll());
    poll();
  }

  /// The newsfeed's rules, as the site's CHANGES_RE and NOT_CHANGES_RE.
  static final changes = RegExp(r'divers|clos|skip|servic|stop|route|berth|shuttle|disrupt|extend|extension|operating hours|last (bus|train)|relocat|amend|adjust|new (bus|short|peak|service)|interchange|terminal', caseSensitive: false);
  static final notChanges = RegExp(r'fare|award|recruit|career|contract|campaign|trial|winner|appoint', caseSensitive: false);

  static Future<void> poll() async {
    final modes = Alerts.modes();
    final key = jsonEncode(modes);
    // A change of choice starts afresh, as the site's desktopWatch does.
    if (key != _modesKey) {
      _modesKey = key;
      _train = null;
      _seen = null;
      _news = null;
    }
    if (!Alerts.anyOn(modes)) return;
    if (modes['train'] != 'off' || modes['traffic'] != 'off') {
      Map<String, dynamic> data;
      try {
        data = await Api.map('service-alerts');
      } catch (_) {
        data = const {};
      }
      final out = check(data, modes, DateTime.now().millisecondsSinceEpoch);
      if (out != null) await DeskNotify.show(title: out.$1, body: out.$2, url: '/#alerts');
      final train = data['train'];
      if (train is Map) Alerts.bar.value = Alerts.disruptionText(train);
    }
    if ((modes['newsfeed'] ?? 'off') != 'off') await _newsfeed(modes['newsfeed']!);
  }

  /// What to say for this look, if anything: (title, body). Updates what's been seen.
  static (String, String)? check(Map<String, dynamic> data, Map<String, String> modes, int now) {
    final parts = <String>[];
    final serviceAlerts = tr('alerts.title', 'Service Alerts');
    var title = serviceAlerts;

    final train = data['train'];
    if (train is Map) {
      final status = (train['Status'] is num) ? (train['Status'] as num).toInt() : int.tryParse('${train['Status']}') ?? 1;
      final segments = train['AffectedSegments'] is List ? train['AffectedSegments'] as List : const [];
      final key = jsonEncode([status == 0 ? 1 : status, segments, train['Message'] ?? []]);
      final disrupted = status > 1 || segments.isNotEmpty;
      final was = _train;
      if (was != null && was.key != key && (modes['train'] == 'all' || (modes['train'] == 'disruptions' && (disrupted || was.disrupted)))) {
        parts.add(Alerts.disruptionText(train) ?? tr('alerts.trainsOkAgain', 'All train services are running normally again.'));
        title = disrupted ? tr('alerts.trainDisruption', 'Train disruption') : tr('alerts.trainUpdate', 'Train service update');
      }
      _train = (key: key, disrupted: disrupted);
    }

    final traffic = data['traffic'];
    if (traffic is List) {
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
      final heard = modes['traffic'] == 'all'
          ? fresh
          : modes['traffic'] == 'disruptions'
              ? fresh.where((i) => Alerts.blocking.contains('${i['type']}'.trim().toLowerCase())).toList()
              : const <Map>[];
      if (heard.isNotEmpty) {
        final more = heard.length > 2
            ? '\n${tr('alerts.moreIncidents', 'And {n} more traffic incidents.', {'n': heard.length - 1})}'
            : heard.length > 1
                ? '\n${tr('alerts.oneMoreIncident', 'And 1 more traffic incident.')}'
                : '';
        parts.add('${heard.first['message']}$more');
        if (title == serviceAlerts && parts.length == 1) {
          title = heard.length == 1
              ? tr('alerts.newIncident', 'New {type}', {'type': '${heard.first['type']}'.toLowerCase()})
              : tr('alerts.newIncidents', '{n} new traffic incidents', {'n': heard.length});
        }
        if (parts.length > 1) title = serviceAlerts;
      }
    }
    return parts.isEmpty ? null : (title, parts.join('\n'));
  }

  static Future<void> _newsfeed(String mode) async {
    Map<String, dynamic>? data;
    try {
      data = await Alerts.loadNotices(fresh: true);
    } catch (_) {
      return;
    }
    if (data == null) return;
    final out = news(data, mode);
    if (out != null) await DeskNotify.show(title: out.$1, body: out.$2, url: '/#alerts');
  }

  /// The newsfeed's notification for this look, if anything new is worth it.
  static (String, String)? news(Map<String, dynamic> data, String mode) {
    final items = ((data['items'] as List?) ?? const []).whereType<Map>().toList();
    final ids = {for (final n in items) '${n['id']}'};
    final fresh = _news == null ? const <Map>[] : items.where((n) => !_news!.contains('${n['id']}')).toList();
    _news = ids;
    final heard = mode == 'all' ? fresh : fresh.where((n) => n['source'] == 'lta' || (changes.hasMatch('${n['title']}') && !notChanges.hasMatch('${n['title']}'))).toList();
    if (heard.isEmpty) return null;
    final sources = (data['sources'] as Map?) ?? const {};
    String from(Map n) => n['source'] == 'lta' ? 'LTA' : '${sources[n['source']] ?? n['source']}';
    return (
      heard.length == 1 ? tr('alerts.newsFrom', 'Newsfeed: {from}', {'from': from(heard.first)}) : tr('alerts.newsMany', 'Newsfeed: {n} new notices', {'n': heard.length}),
      heard.take(3).map((n) => heard.length == 1 ? '${n['title']}' : '${from(n)}: ${n['title']}').join('\n'),
    );
  }

  /// For tests: forget what's been seen.
  static void reset() {
    _train = null;
    _seen = null;
    _news = null;
    _modesKey = null;
  }
}
