// Navigate's Bus and train with no connection (data/nav_core.dart), as the site's
// js/nav-core/offline.js and js/nav-worker.js: run away from the screen's thread, as building the
// graph of every stop, station and run takes a moment on a phone. Kept between plans, so it's built
// once per Restricted areas setting. What it needs is kept as it's seen: the stops (data/stops.dart),
// the bus routes (network.dart's copy on disk), rail.json and the shuttle files (Stations.siteData).
import 'dart:async';
import 'dart:isolate';

import '../api/api.dart';
import '../i18n/i18n.dart';
import 'campus.dart';
import 'nav_core.dart';
import 'network.dart';
import 'stations.dart';
import 'stops.dart';
import 'store.dart';
import 'when.dart';

class NavOffline {
  NavOffline._();
  static const _railKey = 'app.rail_json';

  static SendPort? _worker;
  static Future<SendPort>? _starting;
  static int _seq = 0;
  static final Map<int, Completer<Object?>> _waiting = {};
  static bool _sent = false;
  static Map? _rail;

  /// From /api/bus-routes as it comes.
  static Map<String, RouteService> servicesOf(Map<String, dynamic> payload) {
    final services = (payload['services'] as Map?) ?? const {};
    final out = <String, RouteService>{};
    (payload['runs'] as Map? ?? const {}).forEach((no, dirs) {
      final info = services[no];
      final infoDirs = info is Map ? info['dirs'] as Map? : null;
      final first = infoDirs == null || infoDirs.isEmpty ? null : ((infoDirs.keys.map((k) => '$k').toList()..sort()).first);
      final ends = first == null ? const [] : (infoDirs![first] ?? infoDirs[int.tryParse(first)]) as List? ?? const [];
      out['$no'] = RouteService(
        [for (final e in ends) '$e'],
        info is Map && info['loop'] != null && info['loop'] != '' && info['loop'] != false,
        {
          for (final e in (dirs as Map).entries)
            int.parse('${e.key}'): RouteRun(
              [for (final s in (e.value as Map)['stops'] as List) '$s'],
              [for (final t in ((e.value as Map)['times'] as List?) ?? const []) '${t ?? ''}'],
            ),
        },
      );
    });
    return out;
  }

  /// What's needed kept ready while there's a connection, so that it's there when there isn't.
  static Future<void> keepReady() async {
    try {
      await Stops.load();
      await BusNet.load();
      _rail = await _loadRail();
      await Campus.load();
    } catch (_) {
      // Next time.
    }
  }

  static Future<Map?> _loadRail() async {
    final got = await Stations.siteData('rail.json', _railKey);
    return got is Map ? got : null;
  }

  static Future<SendPort> _start() => _starting ??= () async {
        final back = ReceivePort();
        final port = Completer<SendPort>();
        back.listen((m) {
          if (m is SendPort) {
            port.complete(m);
          } else if (m is Map) {
            final w = _waiting.remove(m['id']);
            if (w == null) return;
            if (m['error'] != null) {
              w.completeError(ApiError('${m['error']}'));
            } else {
              w.complete(m['data']);
            }
          }
        });
        await Isolate.spawn(_main, back.sendPort);
        return _worker = await port.future;
      }();

  /// Gets the graph built ahead of the first plan.
  static Future<void> warm() async {
    try {
      await _ask({'warm': true, 'open': BusNet.openAccess});
    } catch (_) {
      // The plan itself says why.
    }
  }

  static Future<Object?> _ask(Map<String, Object?> message) async {
    await Stops.load();
    if (Stops.all.isEmpty) throw ApiError(tr('nav.offlineNoStops', "The bus stops aren't saved on this phone yet. Open the app once with a connection."));
    final rail = _rail ?? await _loadRail();
    _rail = rail;
    try {
      await BusNet.load();
      await Campus.load().catchError((_) {});
    } catch (_) {
      // Said below.
    }
    if (!BusNet.ready || rail == null) {
      throw ApiError(tr('nav.offlineNoRoutes', "The bus routes aren't saved on this phone yet. Open the app once with a connection, then Bus and train plans offline."));
    }
    final worker = _worker ?? await _start();
    final id = ++_seq;
    final done = Completer<Object?>();
    _waiting[id] = done;
    worker.send({
      'id': id,
      ...message,
      if (!_sent) ...{
        'stops': Stops.all,
        'services': BusNet.forGraph(),
        'rail': rail,
        'campus': Campus.files,
      },
    });
    _sent = true;
    return done.future;
  }

  /// The ways, as /api/nav answers them.
  static Future<Map<String, dynamic>> plan(NavPoint from, NavPoint to, {NavPoint? via, WhenPick? when}) async {
    final customs = int.tryParse(Store.I.get('sgbus_customs') ?? '');
    final got = await _ask({
      'from': [from.lat, from.lng],
      'to': [to.lat, to.lng],
      if (via != null) 'via': [via.lat, via.lng],
      'mode': when?.mode ?? 'now',
      'ms': when == null ? When.nowMs() : When.msOf(when),
      'open': BusNet.openAccess,
      'customs': customs,
      'paid': Store.I.get('sgbus_shuttles') == 'paid',
    });
    return {
      'options': got,
      'onemap': false,
      'alerts': {'lines': const []},
      'traffic': null,
      'others': const <String, dynamic>{},
      'offline': true,
    };
  }

  static void _main(SendPort reply) {
    final inbox = ReceivePort();
    reply.send(inbox.sendPort);
    List<Stop>? stops;
    Map<String, RouteService>? services;
    Map? rail;
    Map? campus;
    final graphs = <bool, NavGraph>{};
    NavGraph graphFor(bool open) => graphs[open] ??= buildGraph(rail!, stops!, services!, open: open, campus: campus);
    inbox.listen((m) {
      final a = m as Map;
      try {
        if (a['stops'] != null) {
          stops = (a['stops'] as List).cast<Stop>();
          services = (a['services'] as Map).cast<String, RouteService>();
          rail = a['rail'] as Map;
          campus = a['campus'] as Map?;
          graphs.clear();
        }
        final open = a['open'] == true;
        if (a['warm'] == true) {
          graphFor(open);
          reply.send({'id': a['id'], 'data': true});
          return;
        }
        NavPoint at(Object? p) => NavPoint((p as List)[0] as double, p[1] as double);
        final options = planOnPhone(
          graphFor(open),
          at(a['from']),
          at(a['to']),
          via: a['via'] == null ? null : at(a['via']),
          when: NavAt('${a['mode']}', a['ms'] as int),
          customs: a['customs'] as int?,
          paid: a['paid'] == true,
        );
        reply.send({'id': a['id'], 'data': options});
      } catch (e) {
        reply.send({'id': a['id'], 'error': '$e'});
      }
    });
  }
}
