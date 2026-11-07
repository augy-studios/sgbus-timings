// Service alerts (the site's js/alerts.js): LTA's train service alerts and traffic incidents right
// now (/api/service-alerts), the Newsfeed of what LTA and the operators announce ahead
// (/api/notices), and notifications for each of the three, even with the app closed, through
// Firebase Cloud Messaging (PushNotificationsPlugin): the server is told this phone's token and
// what it wants (PUT /api/push/devices/<id>, { subscription: { fcm }, train, traffic, newsfeed }),
// and pushes as LTA's feeds change (main-site/api/push/poll.js). New versions of the app are a
// fourth switch (SgBusPlugin.setReleases).
//
// The disruptions bar runs along the top of the main screen while a train line is disrupted or
// delayed, with Details and Hide, checked every two minutes while the app's in front.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/favs.dart';
import '../../data/mrt.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../timings/stop_screen.dart';
import '../tour/tour.dart';

class Alerts {
  Alerts._();
  static const modesKey = 'sgbus.alertModes';
  static const modeKey = 'sgbus.alertMode';
  static const deviceKey = 'sgbus.pushDeviceId';
  static const syncedKey = 'sgbus.alertSynced';
  static const blocking = {'accident', 'vehicle breakdown', 'road block', 'diversion', 'obstacle', 'fire', 'plant failure'};

  static Map<String, dynamic>? notices;
  static int noticesAt = 0;
  static final bar = ValueNotifier<String?>(null);
  static String? barPutAway;

  static List<String> split(Object? v) => v == null ? const [] : '$v'.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
  static String station(String code) => Mrt.stationName(code) ?? code;

  static Future<Map<String, dynamic>?> loadNotices({bool fresh = false}) async {
    if (!fresh && notices != null && DateTime.now().millisecondsSinceEpoch - noticesAt < 15 * 60000) return notices;
    notices = await Api.map('notices');
    noticesAt = DateTime.now().millisecondsSinceEpoch;
    return notices;
  }

  static String sgDate([int offset = 0]) {
    final d = DateTime.now().toUtc().add(Duration(hours: 8, days: offset));
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  static bool onDate(Map n, String date) => n['days'] is List
      ? (n['days'] as List).contains(date)
      : n['from'] is String && (n['from'] as String).compareTo(date) <= 0 && (n['to'] == null || date.compareTo(n['to'] as String) <= 0);

  /// The disruptions bar's words, or null while the trains run normally.
  static String? disruptionText(Map train) {
    final status = int.tryParse('${train['Status']}') ?? 1;
    final segments = (train['AffectedSegments'] as List?) ?? const [];
    if (status <= 1 && segments.isEmpty) return null;
    final parts = [
      for (final seg in segments.cast<Map>())
        () {
          final stations = split(seg['Stations']).map(station).toList();
          final where = stations.length > 1
              ? tr('alerts.fromTo', ', {from} to {to}', {'from': stations.first, 'to': stations.last})
              : stations.isNotEmpty
                  ? tr('alerts.atStation', ', at {station}', {'station': stations.first})
                  : '';
          final dir = '${seg['Direction'] ?? ''}';
          final towards = dir.isNotEmpty && !RegExp('both', caseSensitive: false).hasMatch(dir) ? tr('alerts.towards', ', towards {to}', {'to': dir}) : '';
          return '${Mrt.lineLabel('${seg['Line'] ?? '?'}')}$where$towards';
        }()
    ];
    final what = status > 1 ? tr('alerts.trainDisruption', 'Train disruption') : tr('alerts.trainDelay', 'Train delay');
    if (parts.isNotEmpty) return '$what: ${parts.join('; ')}';
    final notice = ((train['Message'] as List?) ?? const []).map((n) => '${(n as Map)['Content'] ?? ''}'.trim()).where((s) => s.isNotEmpty).firstOrNull;
    return notice ?? tr('alerts.onMrtLrt', '{what} on the MRT or LRT', {'what': what});
  }

  static Timer? _barTimer;

  static void startBar() {
    refreshBar();
    _barTimer ??= Timer.periodic(const Duration(minutes: 2), (_) => refreshBar());
  }

  static Future<void> refreshBar() async {
    try {
      final d = await Api.map('service-alerts');
      final train = d['train'];
      if (train is Map) bar.value = disruptionText(train);
    } catch (_) {
      // LTA's feed down: whatever's shown stays.
    }
  }

  // A stop's notes from the newsfeed: its buses skipping it, or a notice naming it, today or
  // tomorrow (shown under the stop's name on its timings).
  static List<(String, String)> stopNotes(String code) {
    final data = notices;
    if (data == null) return const [];
    final notes = <(String, String)>[];
    for (final (offset, word) in [(0, tr('alerts.today', 'Today')), (1, tr('alerts.tomorrow', 'Tomorrow'))]) {
      final date = sgDate(offset);
      for (final n in ((data['items'] as List?) ?? const []).cast<Map>()) {
        final stops = n['stops'] as Map?;
        if (n['source'] != 'lta' || !onDate(n, date) || !(stops?[code] != null || ((n['codes'] as List?) ?? const []).contains(code))) continue;
        final here = stops?[code] as Map?;
        final services = ((here?['services'] as List?) ?? const []).cast<String>();
        final what = here != null
            ? '${services.length == 1 ? tr('alerts.skipsOne', '{list} skips this stop', {'list': services.join(', ')}) : tr('alerts.skipsMany', '{list} skip this stop', {'list': services.join(', ')})}${here['when'] != null ? ', ${here['when']}' : ''}'
            : tr('alerts.stopAffected', 'this stop is affected');
        notes.add(('$word:', '$what. ${n['title']}.'));
      }
      if (notes.isNotEmpty) break;
    }
    return notes;
  }

  // ---------- notifications ----------

  static Map<String, String> modes() {
    final saved = Store.I.map(modesKey);
    const all = ['all', 'disruptions', 'off'];
    if (all.contains(saved['train']) && all.contains(saved['traffic'])) {
      return {'train': saved['train'] as String, 'traffic': saved['traffic'] as String, 'newsfeed': all.contains(saved['newsfeed']) ? saved['newsfeed'] as String : 'off'};
    }
    final old = Store.I.get(modeKey);
    if (all.contains(old)) return {'train': old!, 'traffic': old, 'newsfeed': 'off'};
    return {'train': 'off', 'traffic': 'off', 'newsfeed': 'off'};
  }

  static bool anyOn(Map<String, String> m) => m['train'] != 'off' || m['traffic'] != 'off' || (m['newsfeed'] ?? 'off') != 'off';

  static void storeModes(Map<String, String> m) {
    Store.I.remove(modeKey);
    Store.I.putJson(modesKey, anyOn(m) ? m : null);
  }

  static String deviceId() {
    var id = Store.I.get(deviceKey);
    if (id == null) {
      final r = math.Random.secure();
      final b = List<int>.generate(16, (_) => r.nextInt(256));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
      id = '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
      Store.I.put(deviceKey, id);
    }
    return id;
  }

  static String? _token;

  /// The phone's FCM token: PushNotifications.register()'s answer comes as an event.
  static Future<String> token() async {
    if (_token != null) return _token!;
    final done = Completer<String>();
    late NativeListener ok, bad;
    ok = Native.on('PushNotifications', 'registration', (d) {
      ok.cancel();
      bad.cancel();
      if (!done.isCompleted) done.complete(_token = '${d['value']}');
    });
    bad = Native.on('PushNotifications', 'registrationError', (d) {
      ok.cancel();
      bad.cancel();
      if (!done.isCompleted) done.completeError(Exception('${d['error'] ?? 'FCM registration failed'}'));
    });
    Native.call('PushNotifications', 'register').catchError((Object e) {
      if (!done.isCompleted) done.completeError(e);
      return null;
    });
    return done.future.timeout(const Duration(seconds: 20));
  }

  /// "granted", "denied" or "prompt".
  static Future<String> permission({bool ask = false}) async {
    final now = '${(await Native.call('PushNotifications', 'checkPermissions'))?['receive']}';
    if (now == 'granted' || !ask) return now;
    return '${(await Native.call('PushNotifications', 'requestPermissions'))?['receive']}';
  }

  /// This phone's id and push target, for the Get Off Alert's background half too.
  static Future<Map<String, Object>?> pushTarget() async {
    if (!Native.has('push') || await permission() != 'granted') return null;
    return {'deviceId': deviceId(), 'subscription': {'fcm': await token()}};
  }

  static Future<void> subscribe(Map<String, String> m) async {
    final fcm = await token();
    await _put('push/devices/${deviceId()}', {'subscription': {'fcm': fcm}, 'train': m['train'], 'traffic': m['traffic'], 'newsfeed': m['newsfeed'] ?? 'off'});
  }

  static Future<void> _put(String path, Object body) async {
    final r = await Api.client.put(Api.uri(path), headers: const {'content-type': 'application/json'}, body: jsonEncode(body));
    if (r.statusCode >= 400) throw ApiError('alerts server replied ${r.statusCode}', status: r.statusCode);
  }

  static Future<void> unsubscribe() async {
    try {
      await Api.client.delete(Api.uri('push/devices/${deviceId()}'));
    } catch (_) {
      // The server drops the device the first time a push to it fails.
    }
  }

  /// Sent again once a day, or as the choice or token changes, so the server keeps it.
  static Future<void> resync() async {
    final m = modes();
    if (!anyOn(m) || !Native.has('push')) return;
    String perm;
    try {
      perm = await permission();
    } catch (_) {
      perm = 'prompt';
    }
    if (perm != 'granted') {
      storeModes({'train': 'off', 'traffic': 'off', 'newsfeed': 'off'});
      return;
    }
    try {
      final key = '${Store.I.get(modesKey)}${await token()}';
      final last = Store.I.map(syncedKey);
      if (last['key'] == key && DateTime.now().millisecondsSinceEpoch - ((last['at'] as num?) ?? 0) < 86400000) return;
      await subscribe(m);
      Store.I.putJson(syncedKey, {'key': key, 'at': DateTime.now().millisecondsSinceEpoch});
    } catch (_) {
      // Tried again next time.
    }
  }

  /// A push that came while the app's in front, which FCM leaves to the app to show; and a
  /// tapped one. The Get Off Alert's and Get ready to board's go to the trip.
  static void listen() {
    Native.on('PushNotifications', 'pushNotificationReceived', (n) {
      final d = {...((n['data'] as Map?) ?? const {}), 'title': n['title'] ?? (n['data'] as Map?)?['title'], 'body': n['body'] ?? (n['data'] as Map?)?['body']};
      final type = d['type'];
      if (type == 'service-alert') {
        Native.call('SgBus', 'notify', {
          'channel': 'alerts',
          'tag': 'service-alert',
          'title': d['title'] ?? tr('alerts.title', 'Service Alerts'),
          'body': d['body'] ?? '',
          'url': 'https://sgbus.uwuapps.org${d['url'] ?? '/#alerts'}',
        }).catchError((_) => null);
      } else if (type == 'get-off' || type == 'board') {
        AppNav.open('tripPush', {'type': type, 'tripId': d['tripId'], 'leg': int.tryParse('${d['leg']}'), 'text': d['body']});
      } else if (type == 'release') {
        AppNav.open('appUpdate', {'version': d['version']});
      }
    });
    Native.on('PushNotifications', 'pushNotificationActionPerformed', (a) {
      final data = ((a['notification'] as Map?)?['data'] as Map?) ?? const {};
      if (data['type'] == 'service-alert') AppNav.showPage('alerts');
    });
  }
}

/// The disruptions bar, over the main screen while a line's disrupted.
class DisruptionBar extends StatelessWidget {
  const DisruptionBar({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<String?>(
        valueListenable: Alerts.bar,
        builder: (context, text, _) {
          if (text == null || text == Alerts.barPutAway) return const SizedBox.shrink();
          final sg = context.sg;
          return Material(
            color: sg.error.withValues(alpha: 0.14),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                child: Row(children: [
                  Icon(Icons.warning_amber_rounded, color: sg.error),
                  const SizedBox(width: 8),
                  Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
                  TextButton(onPressed: () => AppNav.showPage('alerts'), child: Text(tr('alerts.details', 'Details'))),
                  TextButton(
                    onPressed: () {
                      Alerts.barPutAway = text;
                      Alerts.bar.value = null;
                      Alerts.bar.value = text;
                    },
                    child: Text(tr('alerts.hide', 'Hide')),
                  ),
                ]),
              ),
            ),
          );
        },
      );
}

class AlertsPage extends StatefulWidget {
  const AlertsPage({super.key});

  @override
  State<AlertsPage> createState() => _AlertsPageState();
}

class _AlertsPageState extends State<AlertsPage> {
  Map<String, dynamic>? _data;
  Map<String, dynamic>? _news;
  bool _failed = false;
  bool _busy = false;
  String? _problem;
  bool _showOthers = false;
  late Map<String, String> _modes = Alerts.modes();
  bool? _releases;

  @override
  void initState() {
    super.initState();
    AppNav.page.addListener(_page);
    _load();
    if (Native.has('releases')) {
      Native.call('SgBus', 'releases').then((r) {
        if (mounted) setState(() => _releases = r?['on'] == true);
      }).catchError((_) {});
    }
  }

  @override
  void dispose() {
    AppNav.page.removeListener(_page);
    super.dispose();
  }

  void _page() {
    if (AppNav.page.value == 'alerts') _load();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final results = await Future.wait([Api.map('service-alerts'), Alerts.loadNotices(fresh: true).then<Map<String, dynamic>?>((v) => v).catchError((_) => null)]);
      final d = results[0]!;
      if (d['train'] is Map) Alerts.bar.value = Alerts.disruptionText(d['train'] as Map);
      if (mounted) {
        setState(() {
          _data = d;
          _news = results[1];
          _failed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _note(Map<String, String> m) {
    final trains = {
      'all': tr('alerts.note.trainAll', 'every change to MRT and LRT services, including service notices'),
      'disruptions': tr('alerts.note.trainDis', 'train disruptions starting, changing or clearing'),
    };
    final traffic = {
      'all': tr('alerts.note.trafficAll', 'every new traffic incident in Singapore'),
      'disruptions': tr('alerts.note.trafficDis', 'accidents, breakdowns, road blocks and diversions'),
    };
    final news = {
      'all': tr('alerts.note.newsAll', 'every new notice and piece of news from LTA and the bus and train operators'),
      'disruptions': tr('alerts.note.newsDis', 'new notices that change a bus or train service'),
    };
    final parts = [trains[m['train']], traffic[m['traffic']], news[m['newsfeed']]].whereType<String>().toList();
    if (parts.isEmpty) return tr('alerts.notesOff', "Notifications are off. This window still shows what's happening now.");
    return tr('alerts.notesOn', "You'll be notified of {list}.", {'list': parts.join(tr('alerts.andOf', ', and of '))});
  }

  Future<void> _setMode(String kind, String mode) async {
    final previous = _modes;
    final next = {..._modes, kind: mode};
    if (!Alerts.anyOn(next)) {
      Alerts.storeModes(next);
      setState(() {
        _modes = next;
        _problem = null;
      });
      await Alerts.unsubscribe();
      return;
    }
    if (!Native.has('push')) {
      setState(() => _problem = tr('alerts.problem.appUnsupported', "This copy of the app can't get notifications from the server yet. Update it when an update's offered, or use the website."));
      return;
    }
    String perm;
    try {
      perm = await Alerts.permission(ask: true);
    } catch (_) {
      perm = 'denied';
    }
    if (perm != 'granted') {
      setState(() => _problem = tr('alerts.problem.appDenied', "Notifications are off for SG Bus Timings. Turn them on in Android's settings for the app, then pick again."));
      return;
    }
    setState(() {
      _modes = next;
      _problem = null;
    });
    try {
      await Alerts.subscribe(next);
      Alerts.storeModes(next);
    } catch (_) {
      setState(() {
        _modes = previous;
        _problem = tr('alerts.problem.failed', "Couldn't reach the alerts server. Try again in a minute.");
      });
    }
  }

  Future<void> _setReleases(bool on) async {
    try {
      if (on && await Alerts.permission(ask: true) != 'granted') {
        setState(() => _problem = tr('alerts.problem.appDenied', "Notifications are off for SG Bus Timings. Turn them on in Android's settings for the app, then pick again."));
        return;
      }
      final r = await Native.call('SgBus', 'setReleases', {'on': on});
      setState(() => _releases = r?['on'] == true);
    } on NativeError catch (e) {
      setState(() => _problem = e.message);
    }
  }

  Widget _head(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 6),
        child: Row(children: [Icon(icon, size: 20), const SizedBox(width: 8), Text(text, style: Theme.of(context).textTheme.titleMedium)]),
      );

  Widget _line(String text, {Color? dot}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (dot != null) Padding(padding: const EdgeInsets.only(top: 5, right: 8), child: Icon(Icons.circle, size: 10, color: dot)),
          Expanded(child: Text(text)),
        ]),
      );

  List<Widget> _train(Object? value) {
    final sg = context.sg;
    final out = [_head(Icons.train_outlined, tr('alerts.trains', 'Trains'))];
    if (value is! Map) return [...out, _line(tr('alerts.trainsFailed', 'Couldn’t reach LTA for train alerts.'))];
    final status = int.tryParse('${value['Status']}') ?? 1;
    final segments = ((value['AffectedSegments'] as List?) ?? const []).cast<Map>();
    if (status <= 1 && segments.isEmpty) {
      out.add(_line(tr('alerts.trainsOk', 'All train services are running normally.'), dot: sg.ok));
    }
    for (final seg in segments) {
      final disrupted = (int.tryParse('${seg['Status'] ?? status}') ?? status) > 1;
      final stations = Alerts.split(seg['Stations']).map(Alerts.station).toList();
      final bus = Alerts.split(seg['FreePublicBus']).map(Alerts.station).toList();
      final shuttle = Alerts.split(seg['FreeMRTShuttle']).map(Alerts.station).toList();
      final dir = '${seg['Direction'] ?? ''}';
      out.add(SgCard(
        border: disrupted ? sg.error : sg.warn,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _line(
            '${Mrt.lineLabel('${seg['Line'] ?? '?'}')} ${disrupted ? tr('alerts.disrupted', 'disrupted') : tr('alerts.minorDelay', 'minor delay')}'
            '${dir.isEmpty ? '' : RegExp('both', caseSensitive: false).hasMatch(dir) ? tr('alerts.bothWays', ', both directions') : tr('alerts.towards', ', towards {to}', {'to': dir})}',
            dot: disrupted ? sg.error : sg.warn,
          ),
          if (stations.isNotEmpty) Text(tr('alerts.affects', 'Affects {list}', {'list': stations.join(', ')}), style: TextStyle(color: sg.muted)),
          if (bus.isNotEmpty) Text(tr('alerts.freeBuses', 'Free buses at {list}', {'list': bus.join(', ')}), style: TextStyle(color: sg.muted)),
          if (shuttle.isNotEmpty)
            Text('${tr('alerts.freeShuttle', 'Free shuttle at {list}', {'list': shuttle.join(', ')})}${seg['MRTShuttleDirection'] != null ? ' (${seg['MRTShuttleDirection']})' : ''}',
                style: TextStyle(color: sg.muted)),
        ]),
      ));
    }
    for (final m in ((value['Message'] as List?) ?? const []).cast<Map>()) {
      final c = '${m['Content'] ?? ''}'.trim();
      if (c.isNotEmpty) out.add(_line('• $c'));
    }
    return out;
  }

  List<Widget> _traffic(Object? incidents) {
    final sg = context.sg;
    final out = [_head(Icons.traffic_outlined, tr('alerts.roads', 'Roads'))];
    if (incidents is! List) return [...out, _line(tr('alerts.roadsFailed', 'Couldn’t reach LTA for traffic incidents.'))];
    if (incidents.isEmpty) return [...out, _line(tr('alerts.roadsOk', 'No traffic incidents reported.'), dot: sg.ok)];
    final all = incidents.cast<Map>();
    bool isBlocking(Map i) => Alerts.blocking.contains('${i['type']}'.trim().toLowerCase());
    final blocking = all.where(isBlocking).toList();
    final others = all.where((i) => !isBlocking(i)).toList();
    out.add(_line(all.length == 1
        ? tr('alerts.incidentsOne', '1 incident across Singapore, {b} of them able to block or reroute a bus.', {'b': blocking.length})
        : tr('alerts.incidentsMany', '{n} incidents across Singapore, {b} of them able to block or reroute a bus.', {'n': all.length, 'b': blocking.length})));
    for (final i in blocking) {
      out.add(_line('• ${i['message']}'));
    }
    if (others.isNotEmpty) {
      final counts = <String, int>{};
      for (final i in others) {
        counts['${i['type']}'] = (counts['${i['type']}'] ?? 0) + 1;
      }
      final summary = (counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value))).map((e) => '${e.value} ${e.key.toLowerCase()}').join(', ');
      out.add(Text(tr('alerts.alsoReported', 'Also reported: {list}.', {'list': summary}), style: TextStyle(color: sg.muted)));
      out.add(Align(
        alignment: Alignment.centerLeft,
        child: TextButton(
          onPressed: () => setState(() => _showOthers = !_showOthers),
          child: Text(_showOthers ? tr('alerts.hideThem', 'Hide them') : tr('alerts.showOthers', 'Show the other {n}', {'n': others.length})),
        ),
      ));
      if (_showOthers) {
        for (final i in others) {
          out.add(_line('• ${i['message']}'));
        }
      }
    }
    return out;
  }

  ({List<String> stops, List<String> buses}) _yours(Map n) {
    final at = Favs.I.stopBuses();
    final stops = {...Favs.I.stops().map((s) => s.code), ...at.map((b) => b.code)};
    final buses = {...Favs.I.buses(), ...at.map((b) => b.service)}.map((b) => b.toUpperCase()).toSet();
    final named = {...((n['codes'] as List?) ?? const []).cast<String>(), ...((n['stops'] as Map?)?.keys.cast<String>() ?? const <String>[])};
    return (stops: named.where(stops.contains).toList(), buses: ((n['services'] as List?) ?? const []).cast<String>().where(buses.contains).toList());
  }

  String _dayText(String date) {
    final d = DateTime.parse(date);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
  }

  String _whenText(Map n) {
    final today = Alerts.sgDate();
    if (Alerts.onDate(n, today)) {
      return n['to'] != null && n['to'] != today ? tr('alerts.todayTill', 'Today, till {day}', {'day': _dayText(n['to'] as String)}) : tr('alerts.today', 'Today');
    }
    if (Alerts.onDate(n, Alerts.sgDate(1))) return tr('alerts.tomorrow', 'Tomorrow');
    return '${n['dates'] ?? (n['from'] is String ? _dayText(n['from'] as String) : '')}';
  }

  void _open(String url) => Native.call('SgBus', 'openLink', {'url': url}).catchError((_) => null);

  List<Widget> _newsfeed(Map<String, dynamic>? data) {
    final sg = context.sg;
    final out = [_head(Icons.newspaper_outlined, tr('alerts.newsfeed', 'Newsfeed'))];
    if (data == null || data['at'] == null) return [...out, _line(tr('alerts.newsFailed', 'Couldn’t get the newsfeed just now. Tap Refresh in a minute.'))];
    final today = Alerts.sgDate();
    final ahead = Alerts.sgDate(14);
    final items = ((data['items'] as List?) ?? const []).cast<Map>();
    final sources = (data['sources'] as Map?) ?? const {};
    bool mine(Map n) => _yours(n).stops.isNotEmpty || _yours(n).buses.isNotEmpty;
    final coming = items.where((n) {
      if (n['source'] != 'lta') return false;
      if (n['days'] is List) return (n['days'] as List).cast<String>().any((d) => d.compareTo(today) >= 0 && d.compareTo(ahead) <= 0);
      final from = n['from'] as String?;
      if (from == null || from.compareTo(ahead) > 0) return false;
      return n['to'] == null ? from.compareTo(Alerts.sgDate(-7)) >= 0 : (n['to'] as String).compareTo(today) >= 0;
    }).toList()
      ..sort((a, b) {
        final m = (mine(b) ? 1 : 0) - (mine(a) ? 1 : 0);
        return m != 0 ? m : '${a['from'] ?? ''}'.compareTo('${b['from'] ?? ''}');
      });
    final news = items.where((n) => n['kind'] == 'news').toList()..sort((a, b) => '${b['published'] ?? ''}'.compareTo('${a['published'] ?? ''}'));
    if (coming.isEmpty) {
      out.add(_line(tr('alerts.noChanges', 'No bus or train changes announced for the next two weeks.'), dot: sg.ok));
    } else {
      out.add(Text(tr('alerts.nextTwoWeeks', 'Today and the next two weeks'), style: TextStyle(color: sg.muted)));
      for (final n in coming) {
        final y = _yours(n);
        final services = ((n['services'] as List?) ?? const []).cast<String>();
        final yourWords = [
          if (y.stops.isNotEmpty)
            y.stops.length > 1
                ? tr('alerts.yourStops', 'your stops {list}', {'list': y.stops.map((c) => Stops.nameOf(c).isEmpty ? c : Stops.nameOf(c)).join(', ')})
                : tr('alerts.yourStop', 'your stop {list}', {'list': y.stops.map((c) => Stops.nameOf(c).isEmpty ? c : Stops.nameOf(c)).join(', ')}),
          if (y.buses.isNotEmpty)
            y.buses.length > 1 ? tr('alerts.yourBuses', 'your buses {list}', {'list': y.buses.join(', ')}) : tr('alerts.yourBus', 'your bus {list}', {'list': y.buses.join(', ')}),
        ];
        out.add(Padding(
          padding: const EdgeInsets.only(top: 8),
          child: SgCard(
            border: yourWords.isNotEmpty ? sg.warn : null,
            onTap: () => _open('${n['url']}'),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${n['title']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('${_whenText(n)} · ${n['source'] == 'lta' ? 'LTA' : sources[n['source']] ?? n['source']}', style: TextStyle(color: sg.muted, fontSize: 13)),
              if (services.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Wrap(spacing: 4, runSpacing: 4, children: [
                    for (final s in services.take(14)) Chip(label: Text(s), visualDensity: VisualDensity.compact, padding: EdgeInsets.zero),
                    if (services.length > 14) Text('+${services.length - 14}'),
                  ]),
                ),
              if (yourWords.isNotEmpty)
                Row(children: [
                  Icon(Icons.star_rounded, size: 16, color: sg.warn),
                  const SizedBox(width: 4),
                  Expanded(child: Text(tr('alerts.affects', 'Affects {list}', {'list': yourWords.join(tr('trip.and', ' and '))}))),
                ]),
            ]),
          ),
        ));
      }
    }
    if (news.isNotEmpty) {
      out.add(Padding(padding: const EdgeInsets.only(top: 12), child: Text(tr('alerts.fromOperators', 'From the operators'), style: TextStyle(color: sg.muted))));
      for (final n in news.take(8)) {
        out.add(ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text('${n['title']}'),
          subtitle: Text('${n['published'] is String ? _dayText(n['published'] as String) : ''} · ${sources[n['source']] ?? n['source']}'),
          onTap: () => _open('${n['url']}'),
        ));
      }
    }
    return out;
  }

  Widget _modeRow(String label, String kind, List<(String, String)> options) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: FitSegments<String>(options: options, selected: _modes[kind] ?? 'off', onChanged: (v) => _setMode(kind, v)),
          ),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final d = _data;
    final off = tr('alerts.off', 'Off');
    final at = d?['fetchedAt'] is num ? DateTime.fromMillisecondsSinceEpoch((d!['fetchedAt'] as num).toInt(), isUtc: true).add(const Duration(hours: 8)) : null;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Row(children: [
            Expanded(child: Text(tr('panel.alerts', 'Service alerts'), style: Theme.of(context).textTheme.headlineMedium)),
            IconButton(
              tooltip: tr('alerts.refresh', 'Refresh'),
              onPressed: _busy ? null : _load,
              icon: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh),
            ),
          ]),
          if (d == null && !_failed) EmptyNote(tr('alerts.loading', 'Loading service alerts…')),
          if (_failed && d == null) EmptyNote(tr('alerts.loadFailed', 'Couldn’t reach LTA for service alerts. Check your connection, then tap Refresh.'), icon: Icons.cloud_off),
          if (d != null) ...[
            TourTarget(id: 'alerts.body', child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _train(d['train']))),
            ..._traffic(d['traffic']),
            if (at != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  tr('alerts.updated', 'From LTA, updated {time}', {'time': '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}'}),
                  style: TextStyle(color: sg.muted, fontSize: 12),
                ),
              ),
            ..._newsfeed(_news),
          ],
          SectionLabel(tr('alerts.notify_me_even_with_the', 'Notify me, even with the app closed:')),
          SgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TourTarget(id: 'alerts.modes', child: _modeRow(tr('html.train_service_alerts_mrt_and', 'Train service alerts (MRT and LRT)'), 'train',
                  [('off', off), ('all', tr('alerts.all_updates', 'All updates')), ('disruptions', tr('alerts.disruptions_only', 'Disruptions only'))])),
              _modeRow(tr('html.traffic_alerts_roads_and_buses', 'Traffic alerts (roads and buses)'), 'traffic',
                  [('off', off), ('all', tr('alerts.all_updates', 'All updates')), ('disruptions', tr('alerts.disruptions_only', 'Disruptions only'))]),
              _modeRow(tr('html.newsfeed_lta_and_the_operators', 'Newsfeed (LTA and the operators)'), 'newsfeed',
                  [('off', off), ('all', tr('alerts.all_news', 'All news')), ('disruptions', tr('alerts.service_changes_only', 'Service changes only'))]),
              if (_releases != null)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _releases!,
                  onChanged: _setReleases,
                  title: Text(tr('html.new_versions_of_the_app', 'New versions of the app')),
                ),
              const SizedBox(height: 8),
              Text(_problem ?? _note(_modes), style: TextStyle(color: _problem != null ? sg.error : sg.muted, fontSize: 13)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// The stop timings' notes from the newsfeed, once it's in.
void hookAlertsIntoStops() {
  AppNotes.forStop = Alerts.stopNotes;
  Alerts.loadNotices().catchError((_) => null);
}

/// Opens a stop from an alert.
void openStopFromAlert(String code) => StopScreen.open(code);
