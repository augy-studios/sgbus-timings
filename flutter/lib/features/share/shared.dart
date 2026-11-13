// Links shared between phones (the site's js/share.js), both ways:
//
//   Opening one  a short link (/go/, /trip/, /eta/, /feat/ or #share/<id>), read from /api/share:
//                a place opens Navigate to it from where you are; directions open Navigate with
//                their ends, time and way; someone's live progress opens its view, refreshing
//                every 10 seconds, with their trip on the live map; a feat says what they did.
//   Sharing my live progress  from the trip: a link to /eta/<id>, its progress sent every 10
//                seconds (PATCH /api/share) until the trip ends or sharing's stopped. Kept as
//                sgbus.etaShare, so a trip picked up after the app was closed carries on.
//
// And something shared into the app (a Google Maps place, an address): Navigate's To, searched.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/rewards.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/place_search.dart';
import '../coins/coins.dart';
import '../map/live_map.dart';
import '../nav/nav_page.dart';
import '../trips/trip.dart';
import 'share_card.dart';

void registerShared() {
  AppNav.register('share', (a) => openShared('${a['id']}'));
  AppNav.register('navShared', (a) async {
    final context = AppNav.context;
    if (context == null) return;
    AppNav.showPage('nav');
    final p = await pickPlace(context, title: tr('nav.to', 'To'), query: '${a['text']}', calendar: true);
    if (p == null) return;
    openNav(from: NavState.I.from ?? NavEnd.parse('here'), to: NavEnd(p.label, p.lat, p.lng));
  });
  AppNav.register('tripShare', (_) {
    final context = AppNav.context;
    if (context != null) EtaShare.open(context);
  });
  EtaShare.resume();
}

NavEnd? _end(Object? j) => j == 'here' ? NavEnd.parse('here') : NavEnd.from(j);

Future<void> openShared(String id) async {
  Map<String, dynamic> got;
  try {
    got = await Api.map('share', query: {'id': id});
  } on ApiError catch (e) {
    AppNav.say(e.status == 404 ? tr('share.expired', 'This link has expired, or doesn’t exist.') : e.message);
    return;
  } catch (_) {
    AppNav.say(tr('share.wentWrong', 'Something went wrong. Please try again.'));
    return;
  }
  final data = (got['data'] as Map?)?.cast<String, dynamic>() ?? const {};
  switch (got['kind']) {
    case 'place':
      openNav(from: NavEnd.parse('here'), to: NavEnd.from(data));
    case 'directions':
      openNav(from: _end(data['from']), to: _end(data['to']), via: NavEnd.from(data['via']), when: WhenPick.fromJson(data['when']), way: data['way'] as String?);
    case 'eta':
      AppNav.push(EtaView(id: id, first: data, updatedAt: (got['updatedAt'] as num?)?.toInt() ?? When.nowMs()), name: 'eta', address: '/eta/$id');
    case 'feat':
      showSharedFeat(data);
    case 'egg':
      await _openEgg(id, data);
  }
}

// An Easter egg link from the Telegram bot's uwuCoins wheel (/egg/<id>): used up on the server, once
// for everyone, then the wheel's egg slot's prize here (Coins.eggLinkPrize), said in a window.
Future<void> _openEgg(String id, Map<String, dynamic> data) async {
  final gone = tr('coins.egg.gone', 'This Easter egg link has been used, or doesn’t exist.');
  if (data['used'] == true) {
    AppNav.say(gone);
    return;
  }
  try {
    await Api.post('share', {'action': 'redeem', 'id': id});
  } on ApiError catch (e) {
    AppNav.say(e.status == 409 ? gone : e.message);
    return;
  } catch (_) {
    AppNav.say(tr('share.wentWrong', 'Something went wrong. Please try again.'));
    return;
  }
  final (title, more) = eggLinkWords(Coins.eggLinkPrize());
  final context = AppNav.navigatorKey.currentContext;
  if (context == null || !context.mounted) {
    AppNav.say(title);
    return;
  }
  await showDialog<void>(
    context: context,
    builder: (c) => AlertDialog(
      key: const ValueKey('eggLinkPrize'),
      title: Text(title),
      content: more.isEmpty ? null : Text(more),
      actions: [TextButton(onPressed: () => Navigator.pop(c), child: Text(tr('bug.close', 'Close')))],
    ),
  );
}

// ---------- someone's live progress ----------

// The Telegram bot, which follows a shared trip as a live widget in your own chat with it.
const tripBot = 'sgbus_app';
String telegramLink(String id) => 'https://t.me/$tripBot?start=eta_$id';

class EtaView extends StatefulWidget {
  const EtaView({super.key, required this.id, required this.first, required this.updatedAt});
  final String id;
  final Map<String, dynamic> first;
  final int updatedAt;

  @override
  State<EtaView> createState() => _EtaViewState();
}

class _EtaViewState extends State<EtaView> {
  late Map<String, dynamic> _d = widget.first;
  late int _updatedAt = widget.updatedAt;
  bool _gone = false;
  Timer? _refresh, _tick;

  @override
  void initState() {
    super.initState();
    _refresh = Timer.periodic(const Duration(seconds: 10), (_) => _load());
    _tick = Timer.periodic(const Duration(seconds: 15), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _refresh?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final got = await Api.map('share', query: {'id': widget.id});
      if (!mounted) return;
      setState(() {
        _d = (got['data'] as Map?)?.cast<String, dynamic>() ?? _d;
        _updatedAt = (got['updatedAt'] as num?)?.toInt() ?? _updatedAt;
        _gone = false;
      });
      LiveMap.updateFollow(_d);
    } on ApiError catch (e) {
      if (e.status == 404 && mounted) setState(() => _gone = true);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final d = _d;
    final name = (d['name'] as String?)?.isNotEmpty == true ? d['name'] as String : null;
    final to = (d['to'] as Map?) ?? const {};
    final arriveAt = (d['arriveAt'] as num?)?.toInt() ?? When.nowMs();
    final mins = math.max(0, ((arriveAt - When.nowMs()) / 60000).round());
    final live = d['ended'] != true && d['stopped'] != true && !_gone;
    final head = _gone
        ? tr('share.view.ended', 'This trip has ended')
        : d['stopped'] == true
            ? (name != null ? tr('share.view.stoppedName', '{name} stopped sharing', {'name': name}) : tr('share.view.stopped', 'Sharing stopped'))
            : d['ended'] == true
                ? (name != null ? tr('share.view.arrivedName', '{name} has arrived', {'name': name}) : tr('share.view.arrived', 'Arrived'))
                : mins == 0
                    ? (name != null ? tr('share.view.nowName', '{name} is arriving now', {'name': name}) : tr('share.view.now', "They're arriving now"))
                    : (name != null ? tr('share.view.inName', '{name} will arrive in {m} min', {'name': name, 'm': mins}) : tr('share.view.in', 'Arriving in {m} min', {'m': mins}));
    final sub = live
        ? tr('share.atAround', 'at {place}, around {time}', {'place': to['label'] ?? '', 'time': When.clock(arriveAt)})
        : tr('share.at', 'at {place}', {'place': to['label'] ?? ''});
    final leg = d['leg'] as Map?;
    String? legText;
    if (live && leg?['label'] is String && (leg!['label'] as String).isNotEmpty) {
      final left = (leg['stopsLeft'] as num?)?.toInt() ?? 0;
      legText = leg['kind'] == 'walk'
          ? tr('share.view.walking', 'Walking to {to}', {'to': leg['to']})
          : left == 0
              ? tr('share.view.onAt', 'On {ride}: at {to}', {'ride': leg['label'], 'to': leg['to']})
              : left == 1
                  ? tr('share.view.onOne', 'On {ride}: 1 stop to {to}', {'ride': leg['label'], 'to': leg['to']})
                  : tr('share.view.onMany', 'On {ride}: {n} stops to {to}', {'ride': leg['label'], 'n': left, 'to': leg['to']});
      if (((d['legCount'] as num?) ?? 1) > 1) legText += ' · ${tr('trip.part', 'part {n} of {of}', {'n': ((d['legIndex'] as num?) ?? 0) + 1, 'of': d['legCount']})}';
    }
    final ago = ((When.nowMs() - _updatedAt) / 60000).round();
    final updated = _gone
        ? tr('share.view.expired', 'The link has expired.')
        : !live
            ? tr('share.view.updatedAt', 'Updated {time}.', {'time': When.clock(_updatedAt)})
            : When.nowMs() - _updatedAt > 3 * 60000
                ? tr('share.view.stale', 'Last updated {m} min ago, so the arrival time is the last estimate.', {'m': ago})
                : ago < 1
                    ? tr('share.view.justNow', 'Updated just now. This refreshes by itself.')
                    : tr('share.view.ago', 'Updated {m} min ago. This refreshes by itself.', {'m': ago});
    final timeline = live ? d['timeline'] as Map? : null;
    return SgScaffold(
      title: tr('html.live_progress', 'Live progress'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        Text(head, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        Text(sub, style: TextStyle(color: sg.muted)),
        if (legText != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(legText, style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w600))),
        const SizedBox(height: 12),
        if (!_gone)
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Image.network('${Api.site}/api/share-map?id=${widget.id}&v=$_updatedAt', fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
          ),
        if (!_gone)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: FilledButton.tonalIcon(onPressed: () => LiveMap.follow(_d), icon: const Icon(Icons.map_outlined), label: Text(tr('trip.live_map', 'Live map'))),
          ),
        // Their trip as a live widget in the Telegram bot (telegram-bot/src/bot_trips.py), as the
        // website's Follow in Telegram (js/share.js): until it's over.
        if (live)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: FilledButton.tonalIcon(
              key: const ValueKey('etaTelegram'),
              onPressed: () => Native.call('SgBus', 'openLink', {'url': telegramLink(widget.id)}).catchError((_) => null),
              icon: const Icon(Icons.send_outlined),
              label: Text(tr('html.follow_in_telegram', 'Follow in Telegram')),
            ),
          ),
        if (NavEnd.from(_d['to']) != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: FilledButton.tonalIcon(
              onPressed: () => openNav(from: NavEnd.parse('here'), to: NavEnd.from(_d['to'])),
              icon: const Icon(Icons.directions),
              label: Text(tr('html.directions_there', 'Directions there')),
            ),
          ),
        if (timeline?['legs'] is List)
          for (final (k, l) in (timeline!['legs'] as List).whereType<Map>().indexed) ...[
            SectionLabel('${l['label']} · ${tr('share.view.to', 'to {to}', {'to': l['to']})}'),
            for (final (i, n) in (l['names'] as List? ?? const []).indexed)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  k == 0 && i == ((timeline['pos'] as num?) ?? 0).round() ? Icons.location_on : Icons.circle_outlined,
                  size: k == 0 && i == ((timeline['pos'] as num?) ?? 0).round() ? 22 : 12,
                  color: k == 0 && i <= ((timeline['pos'] as num?) ?? 0).floor() ? sg.muted : sg.brandInk,
                ),
                title: Text('$n'),
              ),
          ],
        const SizedBox(height: 8),
        Text(updated, style: TextStyle(color: sg.muted, fontSize: 13)),
      ]),
    );
  }
}

// ---------- sharing my live progress ----------

class EtaShare {
  EtaShare._();
  static const key = 'sgbus.etaShare';
  static Timer? _timer;
  static Map<String, dynamic>? _last;

  static Map<String, dynamic>? get current {
    final v = Store.I.map(key);
    return v['id'] is String && v['secret'] is String ? v : null;
  }

  static bool get sharing => current != null && current!['tripId'] == Trip.I.id;

  static List<List<double>> _thin(List<List<double>> pts, int max) {
    if (pts.length <= max) return pts;
    final step = (pts.length - 1) / (max - 1);
    return [for (var i = 0; i < max; i++) pts[(i * step).round()]];
  }

  static double _minutesLeft(Trip t) {
    var left = 0.0;
    for (var i = t.leg; i < t.legs.length; i++) {
      final l = t.legs[i];
      left += i == t.leg && l.points.length > 1 ? l.minutes * (1 - (t.pos / (l.points.length - 1)).clamp(0.0, 1.0)) : l.minutes + l.wait;
    }
    return left;
  }

  /// The trip's progress, as /api/share keeps an ETA link's data.
  static Map<String, dynamic>? data({Map<String, Object?> extra = const {}}) {
    final t = Trip.I;
    final leg = t.current;
    if (!t.active || leg == null) return null;
    final i = t.pos.floor().clamp(0, leg.points.length - 1);
    final j = math.min(i + 1, leg.points.length - 1);
    final f = t.pos - i;
    final at = [leg.points[i][0] + (leg.points[j][0] - leg.points[i][0]) * f, leg.points[i][1] + (leg.points[j][1] - leg.points[i][1]) * f];
    final rest = t.legs.skip(t.leg).toList();
    return {
      'name': Store.I.get('sgbus_name') ?? '',
      'to': t.to,
      'arriveAt': When.nowMs() + (_minutesLeft(t) * 60000).round(),
      'leg': {'label': leg.label, 'to': leg.to, 'stopsLeft': t.stopsLeft(), 'kind': leg.kind},
      'legIndex': t.leg,
      'legCount': t.legs.length,
      'at': at,
      'path': _thin([for (final l in rest) ...l.points], 300),
      'trains': [
        for (final (k, l) in t.legs.indexed)
          if (l.kind == 'train' && k >= t.leg) {'leg': k, 'route': l.route ?? l.label.split(' ').first, 'points': l.points},
      ],
      // When the fix was had, too: /api/share takes a location only with its time (js/trip.js's
      // trip.me), and one older than the server allows is left out rather than sent.
      'me': t.here == null || When.nowMs() - t.lastFixAt > 30 * 60000
          ? null
          : {'lat': t.here!.lat, 'lng': t.here!.lng, 'accuracy': t.here!.accuracy, 't': t.lastFixAt},
      'timeline': {
        'legs': [for (final l in rest.where((l) => l.ride || l == leg)) {'label': l.label, 'to': l.to, 'names': l.names, 'kind': l.kind}],
        'pos': t.pos,
      },
      'ended': t.arrived,
      ...extra,
    };
  }

  /// The trip's Share: the card, a new link or the one made already for this trip.
  static Future<void> open(BuildContext context) async {
    final t = Trip.I;
    final d = data();
    if (d == null) return;
    final mine = sharing ? current : null;
    final made = mine != null ? Future.value(mine) : Api.post('share', {'kind': 'eta', 'data': d}).then((b) => Map<String, dynamic>.from(b as Map));
    if (mine == null) {
      made.then((link) {
        Store.I.putJson(key, {'id': link['id'], 'secret': link['secret'], 'path': link['path'], 'tripId': t.id});
        _last = d;
        _run();
      }).catchError((_) {});
    }
    final mins = math.max(0, _minutesLeft(t).round());
    final when = When.clock(When.nowMs() + mins * 60000);
    await ShareCard.show(
      context,
      ShareCard(
        heading: tr('share.liveProgress', 'Share live progress'),
        name: tr('share.willArrive', 'I will arrive in {m} min', {'m': mins}),
        sub: tr('share.atAround', 'at {place}, around {time}', {'place': t.to?['label'] ?? '', 'time': when}),
        kind: 'eta',
        data: d,
        text: tr('share.etaText', "I'm on my way to {place}, arriving around {time}. Follow along live:", {'place': t.to?['label'] ?? '', 'time': when}),
        made: made,
        onStop: () => end(stopped: true),
      ),
    );
  }

  static void _run() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _send());
  }

  static Future<void> _send() async {
    final c = current;
    if (c == null) return _clear();
    if (!Trip.I.active || c['tripId'] != Trip.I.id) return end();
    _last = data();
    if (_last != null) await _patch(c, _last!);
    if (Trip.I.arrived) _clear();
  }

  static Future<void> _patch(Map c, Map<String, dynamic> d) async {
    try {
      final r = await http
          .patch(Api.uri('share', {'id': c['id']}), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'secret': c['secret'], 'data': d}))
          .timeout(const Duration(seconds: 15));
      if (r.statusCode == 404) _clear();
    } catch (_) {
      // The next one carries it.
    }
  }

  /// The trip's over, or sharing's stopped: its last word to the link.
  static void end({bool stopped = false}) {
    final c = current;
    if (c == null) return;
    final last = _last ?? data();
    if (last != null) _patch(c, {...last, 'arriveAt': stopped ? last['arriveAt'] : When.nowMs(), if (stopped) 'stopped': true else 'ended': true});
    _clear();
  }

  static void _clear() {
    _timer?.cancel();
    _timer = null;
    _last = null;
    Store.I.put(key, null);
  }

  /// A trip picked up after the app was closed goes on updating its link.
  static void resume() {
    Trip.I.addListener(() {
      if (!Trip.I.active && current != null) end();
    });
    if (current != null && Trip.I.active && current!['tripId'] == Trip.I.id) {
      _run();
    } else if (current != null && !Trip.I.active) {
      _clear();
    }
  }
}
