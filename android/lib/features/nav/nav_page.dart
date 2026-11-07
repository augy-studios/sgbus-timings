// Navigate (the site's js/nav.js): from any place to any other by bus and train. The ways come
// from /api/nav, which keeps the best for every mix of buses and trains; the ends from
// /api/places. Each way lists its rides as chips with how long, how many changes and how far
// the walks are; opened, it's step by step, bus legs with their live timings from
// /api/bus-arrivals when you're setting off soon, train legs with where to stand, and Start trip
// for the Get Off Alert. Leave now, Leave at or Arrive by, up to a week ahead; Add a stop on the
// way; walking, cycling or driving the whole way under the ways. Its tab beside Bus only (the
// route planner, features/planner/).
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api/api.dart';
import '../../api/net.dart';
import '../../app/links.dart';
import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/favs.dart';
import '../../data/geo.dart';
import '../../data/location.dart';
import '../../data/nav_core.dart' show NavPoint;
import '../../data/nav_offline.dart';
import '../../data/network.dart';
import '../../data/places.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/place_search.dart';
import '../map/live_map.dart';
import '../share/share_card.dart';
import '../timings/stop_screen.dart';
import '../trips/trip.dart';
import 'when_picker.dart';
import '../tour/tour.dart';

/// An end of a journey: a place with a name, or "here" (wherever you are when it plans).
class NavEnd {
  const NavEnd(this.label, this.lat, this.lng, {this.here = false});
  final String label;
  final double lat;
  final double lng;
  final bool here;

  Map<String, Object?> toJson() => {'label': label, 'lat': lat, 'lng': lng};

  /// As a trip keeps where it was started from: Your location stays that, not a point.
  Map<String, Object?> keepJson() => {...toJson(), if (here) 'here': true};
  static NavEnd? fromKept(Object? j) => j is Map && j['here'] == true ? NavEnd.parse('here') : from(j);
  static NavEnd? from(Object? j) =>
      j is Map && j['lat'] is num && j['lng'] is num ? NavEnd('${j['label'] ?? ''}', (j['lat'] as num).toDouble(), (j['lng'] as num).toDouble()) : null;

  String coord() => '${lat.toStringAsFixed(5)},${lng.toStringAsFixed(5)}';
  String hash() => here ? 'here' : '${coord()}~${Uri.encodeComponent(label)}';

  /// "here", or "lat,lng~label", as the site's #nav links hold an end.
  static NavEnd? parse(String? s) {
    if (s == null || s == '-') return null;
    if (s == 'here') return NavEnd(tr('nav.yourLocation', 'Your location'), 0, 0, here: true);
    final m = RegExp(r'^(-?[\d.]+),(-?[\d.]+)(?:~(.*))?$').firstMatch(s);
    if (m == null) return null;
    String label;
    try {
      label = Uri.decodeComponent(m[3] ?? '');
    } catch (_) {
      label = m[3] ?? '';
    }
    return NavEnd(label.isEmpty ? tr('map.pinned', 'Pinned place') : label, double.parse(m[1]!), double.parse(m[2]!));
  }
}

/// Every way from one place to another: /api/nav's, or with no connection, or when it can't be
/// reached, planned on the phone (data/nav_offline.dart), in the same shape with `offline` set.
Future<Map<String, dynamic>> fetchWays(NavEnd from, NavEnd to, {NavEnd? via, WhenPick? when}) async {
  Future<Map<String, dynamic>> onPhone() => NavOffline.plan(NavPoint(from.lat, from.lng), NavPoint(to.lat, to.lng), via: via == null ? null : NavPoint(via.lat, via.lng), when: when);
  if (Net.off.value && Api.fake == null) return onPhone();
  final customs = Store.I.get('sgbus_customs');
  try {
    return await Api.map(
      'nav',
      query: {
        'from': from.coord(),
        'to': to.coord(),
        if (via != null) 'via': via.coord(),
        if (when != null) 'when': when.mode,
        if (when != null) 'at': when.at,
        if (BusNet.openAccess) 'restricted': 1,
        if (['15', '30', '45', '60'].contains(customs)) 'customs': customs,
        if (Store.I.get('sgbus_bike') == 'on') 'bike': 1,
        if (Store.I.get('sgbus_shuttles') == 'paid') 'shuttles': 'paid',
      },
    );
  } on ApiError {
    rethrow;
  } catch (_) {
    // Not reached at all: planned on the phone.
    if (Api.fake != null) rethrow;
    return onPhone();
  }
}

class NavState extends ChangeNotifier {
  NavState._() {
    Net.off.addListener(_netChanged);
  }

  // Back online, ways planned on the phone are planned again, and a way open opens again from the
  // new plan if it's still one of them. Gone offline, the phone's planner gets ready.
  Future<void> _netChanged() async {
    if (Net.off.value) {
      unawaited(NavOffline.warm());
      return;
    }
    if (!offline || from == null || to == null) return;
    final was = option == null ? null : wayKey(option!);
    await run();
    final again = was == null ? null : options.where((o) => wayKey(o) == was).firstOrNull;
    if (again != null) await open(again);
  }

  /// The ways on show were planned on the phone: their times are estimates.
  bool offline = false;
  static final NavState I = NavState._();

  NavEnd? from;
  NavEnd? to;
  NavEnd? via;
  bool viaOpen = false;
  WhenPick? when;
  List<Map<String, dynamic>> options = [];
  Map<String, dynamic>? option;
  Map<String, dynamic>? others;
  bool traffic = false;
  bool onemap = false;
  bool busy = false;
  // Worded as it's shown, so it follows the language.
  String Function()? _error;
  String? get error => _error?.call();
  int _token = 0;
  final Map<int, List<int>?> timings = {};

  void changed() => notifyListeners();

  String hash() {
    if (from == null && to == null) return '#nav';
    return '#nav/${from?.hash() ?? '-'}/${to?.hash() ?? '-'}${via != null ? '/via/${via!.hash()}' : ''}${When.hashPart(when)}';
  }

  Future<NavEnd> _resolve(NavEnd e) async {
    if (!e.here) return e;
    final fix = await Locate.here(toDo: () => tr('location.toStartHere', 'to start from where you are'));
    return NavEnd(tr('nav.yourLocation', 'Your location'), fix.lat, fix.lng, here: true);
  }

  /// Plans the ways. With [keep], that way stays open while they come in, not the list of them.
  Future<void> run({Map<String, dynamic>? keep}) async {
    option = keep;
    if (from == null || to == null) {
      options = [];
      notifyListeners();
      return;
    }
    final late = When.problem(when);
    if (late != null) {
      _error = () => When.problem(when) ?? late;
      options = [];
      notifyListeners();
      return;
    }
    final token = ++_token;
    busy = true;
    _error = null;
    notifyListeners();
    try {
      final a = await _resolve(from!);
      final b = await _resolve(to!);
      final data = await fetchWays(a, b, via: via, when: when);
      if (token != _token) return;
      offline = data['offline'] == true;
      options = [for (final o in (data['options'] as List? ?? const [])) Map<String, dynamic>.from(o as Map)];
      for (final o in options) {
        if (o['via'] is Map && via != null) (o['via'] as Map)['label'] = via!.label;
      }
      others = (data['others'] as Map?)?.cast<String, dynamic>();
      traffic = data['traffic'] != null;
      onemap = data['onemap'] == true;
    } on LocationError catch (e) {
      if (token == _token) _error = () => e.message;
    } on ApiError catch (e) {
      if (token == _token) _error = () => e.message;
    } catch (_) {
      if (token == _token) _error = () => tr('nav.planFailed', "Couldn't plan that right now.");
    } finally {
      if (token == _token) {
        busy = false;
        notifyListeners();
      }
    }
  }

  Future<void> open(Map<String, dynamic> o) async {
    option = o;
    timings.clear();
    notifyListeners();
    final leaveMs = When.span(when, (o['minutes'] as num?) ?? 0).leave;
    final live = o['offline'] != true && (when == null || When.liveLead(leaveMs) != null);
    if (!live) return;
    final legs = (o['legs'] as List).cast<Map>();
    final token = _token;
    await Future.wait([
      for (var k = 0; k < legs.length; k++)
        if (legs[k]['mode'] == 'bus' && legs[k]['campus'] == null && (legs[k]['from'] as Map?)?['code'] != null)
          () async {
            final l = legs[k];
            try {
              final a = await Arrivals.fetch('${(l['from'] as Map)['code']}', '${l['route']}');
              final s = a.services.where((s) => s.serviceNo == '${l['route']}').firstOrNull;
              timings[k] = s == null
                  ? null
                  : [
                      for (final b in s.buses)
                        if (b?.etaMs != null) b!.etaMs!,
                    ];
            } catch (_) {
              timings[k] = null;
            }
          }(),
    ]);
    if (token == _token && option == o) notifyListeners();
  }

  bool isFav() => Favs.I.navs().any((n) => _same(n['from'], from) && _same(n['to'], to) && (via == null ? n['via'] == null : _same(n['via'], via)));
  bool _same(Object? j, NavEnd? e) =>
      j is Map &&
      e != null &&
      (j['lat'] as num?)?.toStringAsFixed(5) == e.lat.toStringAsFixed(5) &&
      (j['lng'] as num?)?.toStringAsFixed(5) == e.lng.toStringAsFixed(5);

  void toggleFav() {
    if (from == null || to == null || from!.here || to!.here) return;
    final navs = Favs.I.navs();
    if (isFav()) {
      Favs.I.setNavs(navs.where((n) => !(_same(n['from'], from) && _same(n['to'], to))).toList());
    } else {
      Favs.I.setNavs([
        ...navs,
        {'from': from!.toJson(), 'to': to!.toJson(), if (via != null) 'via': via!.toJson()},
      ]);
    }
    notifyListeners();
  }
}

String wayKey(Map o) => o['walkOnly'] == true
    ? 'walk'
    : (o['legs'] as List)
          .cast<Map>()
          .where((l) => l['mode'] != 'walk')
          .map((l) => '${l['mode']}:${l['route']}@${(l['from'] as Map?)?['code'] ?? (l['from'] as Map?)?['name'] ?? ''}')
          .join('>');

List<List<Map>> wayHalves(Map o) {
  final legs = (o['legs'] as List).cast<Map>();
  final v = o['via'] as Map?;
  return v == null ? [legs] : [legs.sublist(0, (v['leg'] as num).toInt()), legs.sublist((v['leg'] as num).toInt())];
}

int walkMetres(Map o) => (o['legs'] as List).cast<Map>().where((l) => l['mode'] == 'walk').fold(0, (s, l) => s + ((l['metres'] as num?) ?? 0).round());

String navMixText(Map o) {
  if (o['walkOnly'] == true) return tr('nav.walkAll', 'Walk all the way');
  final changes = wayHalves(o).fold<int>(0, (s, legs) => s + (legs.where((l) => l['mode'] != 'walk').length - 1).clamp(0, 99));
  return '${changes == 0
          ? tr('nav.noChange', 'No change')
          : changes == 1
          ? tr('nav.oneChange', '1 change')
          : tr('nav.changes', '{n} changes', {'n': changes})} · '
      '${tr('nav.walkDist', '{d} walk', {'d': formatDistance(walkMetres(o))})}';
}

final _stationSuffix = RegExp(r'\s+(?:MRT|LRT)(?:\s+STATION)?(?:\s*\/\s*(?:MRT|LRT)(?:\s+STATION)?)?\s*$', caseSensitive: false);
String stationName(String? name) {
  final s = (name ?? '').replaceAll(_stationSuffix, '').trim();
  return RegExp('[a-z]').hasMatch(s) ? s : s.toLowerCase().replaceAllMapped(RegExp(r'(^|[\s(/-])\S'), (m) => m[0]!.toUpperCase());
}

String placeName(Object? p) {
  if (p is! Map) return '';
  if (p['kind'] == 'station' || _stationSuffix.hasMatch('${p['name'] ?? ''}')) return '${stationName('${p['name']}')} station';
  if (p['name'] != null) return '${p['name']}${p['code'] != null && p['kind'] == 'stop' ? ' (${p['code']})' : ''}';
  return '';
}

String trafficText(Map t) {
  final parts = <String>[];
  final extra = (t['extra'] as num?) ?? 0;
  final roads = ((t['roads'] as List?) ?? const []).cast<String>();
  if (extra >= 1) {
    parts.add(
      roads.isNotEmpty
          ? tr('nav.slowerRoads', '~{m} min slower than usual: heavy traffic on {roads}.', {'m': extra, 'roads': roads.join(tr('trip.and', ' and '))})
          : tr('nav.slower', '~{m} min slower than usual.', {'m': extra}),
    );
  }
  for (final i in ((t['incidents'] as List?) ?? const []).cast<Map>()) {
    final m = '${i['message'] ?? ''}'.replaceFirst(RegExp(r'^\(\d+\/\d+\)\d+:\d+\s*'), '');
    parts.add(m.toLowerCase().startsWith('${i['type']}'.toLowerCase()) ? m : '${i['type']}: $m');
  }
  return parts.join(' ');
}

class NavPage extends StatefulWidget {
  const NavPage({super.key});

  /// The tab beside Bus and train: the route planner (features/planner/).
  static Widget Function()? busOnly;
  /// The tab changed: your ends go with you where they can (features/planner, switchNavMode).
  static void Function(String mode)? switched;
  /// Home or Work tapped while it isn't set: Places' form for it.
  static void Function(BuildContext context, Place place)? setPlace;
  static const modeKey = 'sgbus_nav_mode';

  @override
  State<NavPage> createState() => _NavPageState();
}

class _NavPageState extends State<NavPage> {
  NavState get nav => NavState.I;
  String get _mode => Store.I.get(NavPage.modeKey) == 'bus' && NavPage.busOnly != null ? 'bus' : 'all';

  @override
  void initState() {
    super.initState();
    nav.addListener(_redraw);
    Favs.I.addListener(_redraw);
  }

  @override
  void dispose() {
    nav.removeListener(_redraw);
    Favs.I.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() {
    if (mounted) setState(() {});
  }

  Future<void> _setEnd(String which) async {
    final p = await pickPlace(
      context,
      calendar: true,
      title: which == 'from'
          ? tr('nav.from', 'From')
          : which == 'to'
          ? tr('nav.to', 'To')
          : tr('nav.add_a_stop', 'Add a stop'),
    );
    if (p == null) return;
    final e = p.kind == 'here' ? NavEnd(tr('nav.yourLocation', 'Your location'), p.lat, p.lng, here: true) : NavEnd(p.label, p.lat, p.lng);
    if (which == 'from') nav.from = e;
    if (which == 'to') nav.to = e;
    if (which == 'via') nav.via = e;
    // A calendar event in To: arriving by its start.
    if (which == 'to' && p.arriveBy != null) {
      final w = WhenPick('arrive', When.msToAt(p.arriveBy!));
      if (When.problem(w) == null) nav.when = w;
    }
    nav.run();
  }

  Widget _end(String which, NavEnd? e, String label) {
    final sg = context.sg;
    return SgCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      onTap: () => _setEnd(which),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            child: Text(
              label,
              style: TextStyle(color: sg.muted, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: Text(
              e?.label ?? tr('nav.address_place_postal_code_station', 'Address, place, postal code, station or stop'),
              style: TextStyle(color: e == null ? sg.muted : sg.ink, fontSize: 16),
            ),
          ),
          if (which == 'via')
            IconButton(
              tooltip: tr('nav.remove_the_stop', 'Remove the stop'),
              icon: const Icon(Icons.close),
              onPressed: () {
                final had = nav.via != null;
                nav.via = null;
                nav.viaOpen = false;
                if (had) {
                  nav.run();
                } else {
                  nav.changed();
                }
              },
            ),
        ],
      ),
    );
  }

  Widget _savedPlaces(String which) {
    // Home and Work always, muted while they aren't set: tapped, they ask where.
    final places = Places.all(unset: true);
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            Pill(
              icon: Icons.my_location,
              label: tr('nav.yourLocation', 'Your location'),
              onTap: () {
                final e = NavEnd(tr('nav.yourLocation', 'Your location'), 0, 0, here: true);
                if (which == 'from') {
                  nav.from = e;
                } else {
                  nav.to = e;
                }
                nav.run();
              },
            ),
            for (final p in places)
              Padding(
                padding: const EdgeInsets.only(left: 6),
                child: Pill(
                  icon: p.icon,
                  label: p.name,
                  unset: p.unset,
                  tooltip: p.unset ? tr('nav.setInPlaces', 'Set your {place} in Places', {'place': p.name.toLowerCase()}) : null,
                  onTap: () {
                    if (p.unset) {
                      NavPage.setPlace?.call(context, p);
                      return;
                    }
                    final e = NavEnd(p.name, p.lat, p.lng);
                    if (which == 'from') {
                      nav.from = e;
                    } else {
                      nav.to = e;
                    }
                    nav.run();
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<Widget> _ways() {
    final sg = context.sg;
    if (nav.from == null || nav.to == null) {
      return [
        EmptyNote(
          tr(
            'nav.setEnds',
            'Set where you’re starting and where you’re going: an address, a building, a postal code, a station, a bus stop, a Google Maps link, or your location.',
          ),
        ),
      ];
    }
    if (nav.busy && nav.options.isEmpty) {
      return [
        const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator()),
        ),
        if (Net.off.value) Text(tr('nav.planningOffline', 'Planning by bus and train on your phone…'), textAlign: TextAlign.center, style: TextStyle(color: context.sg.muted)),
      ];
    }
    if (nav.error != null) return [EmptyNote(nav.error!, icon: Icons.error_outline)];
    if (nav.options.isEmpty && Net.off.value) {
      return [EmptyNote(nav.when != null ? tr('nav.noneAtTime', 'No way by bus or train running at that time was found between these two places. Try another time, or somewhere nearby.') : tr('nav.noneNow', 'No way by bus or train running right now was found between these two places. Try another time, or somewhere nearby.'))];
    }
    if (nav.options.isEmpty) {
      return [
        EmptyNote(
          nav.when != null
              ? tr('nav.noneAtTime', 'No way by bus or train running at that time was found between these two places. Try another time, or somewhere nearby.')
              : tr('nav.noneNow', 'No way by bus or train running right now was found between these two places. Try another time, or somewhere nearby.'),
        ),
      ];
    }
    final n = nav.options.length;
    final best = nav.options.where((o) => o['walkOnly'] != true).map((o) => (o['minutes'] as num).toDouble()).fold(double.infinity, (a, b) => a < b ? a : b);
    return [
      if (nav.offline) Padding(padding: const EdgeInsets.only(bottom: 6), child: _warn(tr('nav.plannedOffline', 'Planned offline: times are estimates.'))),
      Text(
        '${n == 1 ? tr('nav.waysOne', '1 way to get there') : tr('nav.waysMany', '{n} ways to get there', {'n': n})}'
        '${nav.when != null ? ', ${When.describe(nav.when).replaceFirstMapped(RegExp(r'^\w'), (m) => m[0]!.toLowerCase())}' : ''}'
        '${tr('nav.waysTail', ', quickest first. Every mix of bus and train is listed, not just the fastest.')}',
        style: TextStyle(color: sg.muted),
      ),
      const SizedBox(height: 8),
      for (final o in nav.options) Padding(padding: const EdgeInsets.only(bottom: 8), child: _wayItem(o)),
      for (final (kind, what, go, icon) in [
        ('walk', tr('nav.walkThere', 'Walk there'), tr('nav.walkIt', 'Walk it'), Icons.directions_walk),
        ('cycle', tr('nav.cycleThere', 'Cycle there'), tr('nav.cycleIt', 'Cycle it'), Icons.pedal_bike),
        ('drive', tr('nav.driveThere', 'Drive there'), tr('nav.driveIt', 'Drive it'), Icons.directions_car_outlined),
      ])
        if (nav.others?[kind] is Map)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(icon),
            title: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: '$what: ',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(
                    text:
                        '~${nav.others![kind]['minutes']} min, ${formatDistance(nav.others![kind]['distance'] as num?)}'
                        '${(nav.others![kind]['minutes'] as num) < best ? ', ${tr('nav.quickerThanAny', 'quicker than any bus or train')}' : ''}',
                  ),
                ],
              ),
            ),
            trailing: TextButton(onPressed: () => AppNav.open('mapGo', {'kind': kind, 'from': nav.from, 'to': nav.to}), child: Text(go)),
          ),
      const SizedBox(height: 8),
      Text(
        [
          nav.traffic
              ? tr(
                  'nav.note.timesTraffic',
                  'Times include walking and an average wait to board, estimated from distance, with buses slowed by the traffic on their way right now, from LTA.',
                )
              : tr('nav.note.times', 'Times include walking and an average wait to board, estimated from distance.'),
          tr('nav.note.running', 'Only buses and trains running at the time are used, going by first and last bus times and train hours.'),
          if (nav.onemap) tr('nav.note.onemap', 'OneMap’s timetable-based estimate is shown where it rides the same way.'),
          if (nav.via != null) tr('nav.note.via', 'No time is counted at your stop: add what you’ll spend there.'),
          if (nav.offline) tr('nav.note.offline', 'Planned on your phone with no connection: walks are straight lines, and there’s no live traffic, last bus warning or train disruption. It plans again when you reconnect.'),
        ].join(' '),
        style: TextStyle(color: sg.muted, fontSize: 12),
      ),
      if (_customsNote() != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_customsNote()!, style: TextStyle(color: sg.muted, fontSize: 12))),
    ];
  }

  // What a shuttle costs and who may ride it, in words: "Free", "S$2.50", "Hotel guests only".
  String _shuttleTerms(Map c) {
    final fare = c['fare'] == 'paid' ? ('${c['fareText'] ?? ''}'.isNotEmpty ? '${c['fareText']}' : tr('nav.shuttle.paid', 'Paid')) : tr('nav.shuttle.free', 'Free');
    final who = c['access'] == 'guests' ? tr('nav.shuttle.guests', 'Hotel guests only') : c['access'] == 'residents' ? tr('nav.shuttle.residents', 'Residents only') : '';
    return who.isEmpty ? fare : '$fare · $who';
  }

  // Ways across the Causeway count this for immigration: said under the ways.
  String? _customsNote() {
    final minutes = [
      for (final o in nav.options)
        for (final l in (o['legs'] as List).cast<Map>())
          for (final c in (l['customs'] as List? ?? const []).cast<Map>()) (c['minutes'] as num).round(),
    ];
    if (minutes.isEmpty) return null;
    final most = minutes.reduce(math.max), least = minutes.reduce(math.min);
    return tr('nav.customsNote', 'Ways across the Causeway count ~{m} min to clear immigration at both checkpoints{byTime}. Your own time can be set in Settings.', {
      'm': least == most ? most : tr('planner.clockRange', '{a} to {b}', {'a': least, 'b': most}),
      'byTime': Store.I.get('sgbus_customs') == null ? tr('nav.byTimeThere', ', by the time of day you’d get there') : '',
    });
  }

  // A bus leg's crossings of the Causeway: get off, through both checkpoints, on again.
  List<Widget> _crossings(Map leg) => [
        for (final c in (leg['customs'] as List? ?? const []).cast<Map>())
          _step(
            Icons.flag_outlined,
            Text(() {
              String stop(Object? code) => Stops.of('$code') != null ? '${Stops.of('$code')!.name} ($code)' : '$code';
              final v = {'from': stop(c['from']), 'to': stop(c['to']), 'm': (c['minutes'] as num).round(), 'byTime': Store.I.get('sgbus_customs') == null ? tr('planner.byTimeOfDay', ', by the time of day') : ''};
              return c['way'] == 'out'
                  ? tr('planner.crossOut', "Get off at {from} and clear Singapore's immigration, ride any bus across to {to} and clear Malaysia's, then get on again: ~{m} min for both{byTime}.", v)
                  : tr('planner.crossIn', "Get off at {from} and clear Malaysia's immigration, ride any bus across to {to} and clear Singapore's, then get on again: ~{m} min for both{byTime}.", v);
            }()),
          ),
      ];

  Widget _chip(Map leg) {
    final sg = context.sg;
    if (leg['campus'] is Map) {
      final colour = hexColor('${(leg['campus'] as Map)['colour'] ?? ''}', sg.brandInk);
      return Chip(avatar: CircleAvatar(backgroundColor: colour, radius: 6), label: Text('${leg['route']}'), visualDensity: VisualDensity.compact);
    }
    if (leg['mode'] == 'bus') {
      return Chip(avatar: const Icon(Icons.directions_bus, size: 16), label: Text('${leg['route']}'), visualDensity: VisualDensity.compact);
    }
    final colour = leg['color'] is String ? hexColor(leg['color'] as String, sg.brandInk) : sg.brandInk;
    return Chip(
      avatar: CircleAvatar(backgroundColor: colour, radius: 6),
      label: Text('${leg['route']}'),
      visualDensity: VisualDensity.compact,
    );
  }

  Widget _wayItem(Map<String, dynamic> o) {
    final sg = context.sg;
    final minutes = o['minutes'] as num;
    final span = When.span(nav.when, minutes);
    final lead = nav.when != null ? '${When.clock(span.leave)} → ${When.clock(span.arrive)}' : tr('planner.aboutMin', '~{m} min', {'m': minutes});
    final notes = [
      if (nav.when != null) tr('planner.aboutMin', '~{m} min', {'m': minutes}),
      navMixText(o),
      if (o['via'] != null) tr('nav.stopAt', 'Stop at {place}', {'place': (o['via'] as Map)['label'] ?? nav.via?.label ?? ''}),
      if (o['onemapMinutes'] != null) tr('nav.onemapMin', 'OneMap ~{m} min', {'m': o['onemapMinutes']}),
      if (o['source'] == 'onemap') tr('nav.foundByOnemap', 'Found by OneMap'),
    ].join(' · ');
    final halves = wayHalves(o);
    final chips = <Widget>[];
    for (var h = 0; h < halves.length; h++) {
      if (h > 0) chips.add(Chip(avatar: const Icon(Icons.place, size: 16), label: Text(tr('settings.stop', 'Stop')), visualDensity: VisualDensity.compact));
      for (final l in halves[h].where((l) => l['mode'] != 'walk')) {
        if (chips.isNotEmpty) chips.add(Icon(Icons.chevron_right, size: 16, color: sg.muted));
        chips.add(_chip(l));
      }
    }
    if (o['walkOnly'] == true) chips.add(Chip(avatar: const Icon(Icons.directions_walk, size: 16), label: Text(tr('trip.walk', 'Walk'))));
    final legs = (o['legs'] as List).cast<Map>();
    final tooLate = nav.when?.mode == 'arrive' && span.leave < When.nowMs() - 60000;
    return SgCard(
      border: o['disrupted'] == true ? sg.error : null,
      onTap: () => nav.open(o),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 2, runSpacing: 4, children: chips),
          const SizedBox(height: 6),
          Text(lead, style: Theme.of(context).textTheme.titleLarge),
          Text(notes, style: TextStyle(color: sg.muted)),
          if (o['disrupted'] == true) _warn(tr('nav.disruptedLine', 'A line on this journey has a disruption')),
          if ((o['far'] as Map?)?['from'] != null)
            _warn(tr('nav.farFrom', 'The nearest stop is {d} from where you’re starting', {'d': formatDistance((o['far'] as Map)['from'] as num)})),
          if ((o['far'] as Map?)?['to'] != null)
            _warn(tr('nav.farTo', 'The nearest stop is {d} from where you’re going', {'d': formatDistance((o['far'] as Map)['to'] as num)})),
          if (tooLate) _warn(tr('planner.tooLateBy', "Too late: you'd have had to leave by {time}", {'time': When.clock(span.leave)})),
          for (final l in legs.where((l) => l['lastBus'] != null))
            _warn(
              tr('nav.lastFrom', 'Last {no} from {stop} at {time}', {
                'no': l['route'],
                'stop': (l['from'] as Map?)?['name'] ?? tr('nav.itsStop', 'its stop'),
                'time': l['lastBus'],
              }),
            ),
          for (final l in legs.where((l) => l['traffic'] is Map))
            _warn(tr('stop.svc.way.title', 'Bus {no}: {way}', {'no': l['route'], 'way': trafficText(l['traffic'] as Map)}), traffic: true),
        ],
      ),
    );
  }

  Widget _warn(String text, {bool traffic = false}) => Padding(
    padding: const EdgeInsets.only(top: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.warning_amber_rounded, size: 16, color: traffic ? context.sg.warn : context.sg.error),
        const SizedBox(width: 6),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
      ],
    ),
  );

  List<Widget> _way(Map<String, dynamic> o) {
    final sg = context.sg;
    final minutes = o['minutes'] as num;
    final span = When.span(nav.when, minutes);
    final leaveMs = span.leave;
    final live = o['offline'] != true && (nav.when == null || When.liveLead(leaveMs) != null);
    final legs = (o['legs'] as List).cast<Map>();
    final via = o['via'] as Map?;
    final steps = <Widget>[];
    for (var k = 0; k < legs.length; k++) {
      final leg = legs[k];
      if (via != null && k == (via['leg'] as num).toInt()) {
        steps.add(
          _step(
            Icons.place,
            Text(
              tr('nav.stopAround', 'Stop at {place}, around {time}', {
                'place': via['label'] ?? nav.via?.label ?? '',
                'time': When.clock(leaveMs + ((via['minutes'] as num?) ?? 0).round() * 60000),
              }),
            ),
          ),
        );
      }
      if (leg['mode'] == 'walk') {
        final last = k == legs.length - 1;
        final to = last ? (nav.to?.label ?? tr('nav.theEnd', 'the end')) : _exitName(leg['to'], leg['toExit']);
        final fromExit = leg['fromExit'] as Map?;
        steps.add(
          _step(
            Icons.directions_walk,
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (fromExit?['name'] != null)
                  Text(
                    tr('nav.leaveByExit', 'Leave {station} by Exit {exit}.', {
                      'station': placeName(leg['from'] ?? (k > 0 ? legs[k - 1]['to'] : null)),
                      'exit': fromExit!['name'],
                    }),
                  ),
                Text(
                  tr('nav.walkStep', 'Walk ~{m} m to {to}, ~{min} min', {
                    'm': ((leg['metres'] as num?) ?? 0).round(),
                    'to': to,
                    'min': ((leg['minutes'] as num?) ?? 1).round().clamp(1, 999),
                  }),
                ),
                // The walk on the live map, from where it starts (the exit nearest it, for a
                // station) to where it ends.
                ?() {
                  Map? point(Object? p, Object? exit) {
                    if (p is! Map) return null;
                    final e = exit is Map && exit['lat'] is num ? exit : null;
                    return e != null ? {...p, 'lat': e['lat'], 'lng': e['lng']} : p;
                  }
                  final end = last
                      ? (nav.to == null || nav.to!.here ? null : {'lat': nav.to!.lat, 'lng': nav.to!.lng})
                      : point(leg['to'], leg['toExit']);
                  final start = point(leg['from'] ?? (k > 0 ? legs[k - 1]['to'] : null), leg['fromExit']) ??
                      (nav.from == null || nav.from!.here ? null : {'lat': nav.from!.lat, 'lng': nav.from!.lng});
                  if (end?['lat'] is! num) return null;
                  final endLat = (end!['lat'] as num).toDouble(), endLng = (end['lng'] as num).toDouble();
                  final startAt = start?['lat'] is num ? (lat: (start!['lat'] as num).toDouble(), lng: (start['lng'] as num).toDouble()) : null;
                  return Wrap(spacing: 4, children: [
                    TextButton.icon(
                      onPressed: () => LiveMap.walkTo(lat: endLat, lng: endLng, label: to, from: startAt),
                      icon: const Icon(Icons.map_outlined),
                      label: Text(tr('trip.live_map', 'Live map')),
                    ),
                    TextButton.icon(
                      onPressed: () => Native.call('SgBus', 'openLink', {'url': Links.citymapper(endLat, endLng, to, from: startAt)}).catchError((_) => null),
                      icon: const Icon(Icons.directions),
                      label: const Text('Citymapper'),
                    ),
                  ]);
                }(),
              ],
            ),
          ),
        );
        continue;
      }
      final stopsMin = leg['stops'] == 1
          ? tr('nav.oneStopMin', '1 stop · ~{min} min', {'min': ((leg['minutes'] as num?) ?? 0).round()})
          : tr('nav.stopsMin', '{n} stops · ~{min} min', {'n': leg['stops'], 'min': ((leg['minutes'] as num?) ?? 0).round()});
      if (leg['mode'] == 'train') {
        steps.add(
          _step(
            Icons.directions_subway_filled,
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _chip(leg),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text('${leg['name'] ?? leg['route']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                Text(
                  leg['towards'] != null
                      ? tr('nav.trainRideTowards', 'From {from}, towards {towards}: {n} stops to {to}, ~{min} min', {
                          'from': placeName(leg['from']),
                          'towards': leg['towards'],
                          'n': leg['stops'],
                          'to': placeName(leg['to']),
                          'min': ((leg['minutes'] as num?) ?? 0).round(),
                        })
                      : tr('nav.trainRide', 'From {from}: {n} stops to {to}, ~{min} min', {
                          'from': placeName(leg['from']),
                          'n': leg['stops'],
                          'to': placeName(leg['to']),
                          'min': ((leg['minutes'] as num?) ?? 0).round(),
                        }),
                ),
                if ((nav.when != null || o['offline'] == true) && leg['board'] != null)
                  Text(
                    tr('nav.boardAround', 'Board around {time}.', {'time': When.clock(leaveMs + ((leg['board'] as num) * 60000).round())}),
                    style: TextStyle(color: sg.muted),
                  ),
                ?TrainDoors.build?.call(context, leg, legs.skip(k + 1).where((l) => l['mode'] != 'walk').firstOrNull),
                if (leg['disrupted'] == true) _warn(tr('nav.disrupted', 'LTA reports a disruption on this line. Check Service alerts.')),
              ],
            ),
          ),
        );
        continue;
      }
      // A shuttle: its timetable's average wait, and what it costs; no LTA timings.
      if (leg['campus'] is Map) {
        final c = leg['campus'] as Map;
        final label = '${c['label'] ?? ''}'.isNotEmpty ? '${c['label']}' : tr('campus.routeTitle', '{uni} shuttle {route}', {'uni': c['name'], 'route': leg['route']});
        final from = leg['from'] as Map?;
        steps.add(
          _step(
            Icons.airport_shuttle_outlined,
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [_chip(leg), const SizedBox(width: 6), Flexible(child: Text(stopsMin, style: const TextStyle(fontWeight: FontWeight.w700)))]),
                Text(tr('nav.busRideTowards', 'From {from} to {to}, towards {towards}', {'from': placeName(from), 'to': placeName(leg['to']), 'towards': leg['towards']})),
                if (leg['board'] != null)
                  Text(tr('nav.shuttle.board', 'Board around {time}, after the timetable’s average wait.', {'time': When.clock(leaveMs + ((leg['board'] as num) * 60000).round())}), style: TextStyle(color: sg.muted)),
                Text('$label · ${_shuttleTerms(c)}', style: TextStyle(color: sg.muted)),
                if (from?['code'] != null)
                  TextButton.icon(
                    onPressed: () => AppNav.open('campusStop', {'key': from?['code']}),
                    icon: const Icon(Icons.schedule),
                    label: Text(tr('nav.shuttle.times', 'Shuttle times at {stop}', {'stop': from?['name']})),
                  ),
              ],
            ),
          ),
        );
        steps.addAll(_crossings(leg));
        continue;
      }
      final t = nav.timings.containsKey(k) ? nav.timings[k] : (live ? const <int>[-1] : null);
      final board = (nav.when != null || o['offline'] == true) && leg['board'] != null
          ? tr('nav.boardAroundWait', 'Board around {time}, after an average wait.', {'time': When.clock(leaveMs + ((leg['board'] as num) * 60000).round())})
          : null;
      final from = leg['from'] as Map?;
      steps.add(
        _step(
          Icons.directions_bus,
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _chip(leg),
                  const SizedBox(width: 6),
                  Text(stopsMin, style: const TextStyle(fontWeight: FontWeight.w700)),
                ],
              ),
              Text(
                leg['towards'] != null
                    ? tr('nav.busRideTowards', 'From {from} to {to}, towards {towards}', {
                        'from': placeName(from),
                        'to': placeName(leg['to']),
                        'towards': leg['towards'],
                      })
                    : tr('nav.busRide', 'From {from} to {to}', {'from': placeName(from), 'to': placeName(leg['to'])}),
              ),
              if (board != null) Text(board, style: TextStyle(color: sg.muted)),
              if (live)
                Text(
                  t != null && t.length == 1 && t.first == -1
                      ? tr('nav.loadingLive', 'Loading live timings…')
                      : t != null && t.isNotEmpty
                      ? '${tr('nav.nextBus', 'Next {no}:', {'no': leg['route']})} ${t.map(Eta.text).join(' · ')}'
                      : tr('nav.noLive', 'No live timings for this bus right now.'),
                  style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w600),
                ),
              if (leg['lastBus'] != null)
                _warn(tr('nav.lastBus', 'Last {no} from here today is at {time}. Don’t miss it.', {'no': leg['route'], 'time': leg['lastBus']})),
              if (leg['traffic'] is Map)
                InkWell(
                  onTap: leg['path'] is List
                      ? () => LiveMap.traffic(LiveMap.pathOf(leg['path']),
                          names: (leg['names'] as List?)?.map((e) => '$e').toList(),
                          title: tr('trip.busTo', 'Bus {no} to {stop}', {'no': leg['route'], 'stop': (leg['to'] as Map?)?['name'] ?? tr('nav.itsStop', 'its stop')}))
                      : null,
                  child: _warn('${trafficText(leg['traffic'] as Map)}${leg['path'] is List ? ' ${tr('trip.seeOnMap', 'See it on the map')}' : ''}', traffic: true),
                ),
              if (from?['code'] != null)
                TextButton.icon(
                  onPressed: () => StopScreen.open('${from['code']}', service: '${leg['route']}', ctx: const StopContext('nav')),
                  icon: const Icon(Icons.directions_bus_outlined),
                  label: Text(tr('planner.timingsAt', '{bus} timings at {stop}', {'bus': leg['route'], 'stop': from!['name']})),
                ),
            ],
          ),
        ),
      );
      steps.addAll(_crossings(leg));
    }
    final tooLate = nav.when?.mode == 'arrive' && span.leave < When.nowMs() - 60000;
    return [
      Row(
        children: [
          TextButton.icon(
            onPressed: () {
              nav.option = null;
              nav.changed();
            },
            icon: const Icon(Icons.arrow_back),
            label: Text(tr('nav.allWays', 'All ways')),
          ),
          const Spacer(),
          TextButton(onPressed: () => nav.open(o), child: Text(tr('nav.refresh', 'Refresh'))),
          FilledButton.icon(
            onPressed: () => AppNav.open('startTrip', {'option': o}),
            icon: const Icon(Icons.notifications_active_outlined),
            label: Text(tr('nav.startTrip', 'Start trip')),
          ),
        ],
      ),
      Text('${tr('planner.aboutMin', '~{m} min', {'m': minutes})} · ${navMixText(o)}', style: Theme.of(context).textTheme.titleMedium),
      if (nav.when != null)
        Text(
          tooLate
              ? tr('planner.tooLateLeave', "To arrive by {time} you'd have had to leave by {leave}.", {
                  'time': When.clock(When.atToMs(nav.when!.at)!),
                  'leave': When.clock(span.leave),
                })
              : tr('nav.setOffArrive', 'Set off around {leave}, arrive around {arrive}.', {
                  'leave': When.clockDay(span.leave),
                  'arrive': When.clock(span.arrive),
                }),
          style: TextStyle(color: sg.muted),
        ),
      if (o['offline'] == true) Padding(padding: const EdgeInsets.only(top: 4), child: _warn(tr('nav.plannedOffline', 'Planned offline: times are estimates.'))),
      const SizedBox(height: 8),
      ...steps,
      const SizedBox(height: 8),
      Text(
        live
            ? tr('nav.estimated_times.description', 'Train times are estimates from distance. Bus timings are live from LTA.')
            : o['offline'] == true
            ? tr('nav.estOffline', 'Times are estimates from distance, with an average wait to board. Live bus timings show here when you reconnect.')
            : tr(
                'nav.estLater',
                'Times are estimates from distance, with an average wait to board. Live bus timings show here from half an hour before you set off.',
              ),
        style: TextStyle(color: sg.muted, fontSize: 12),
      ),
    ];
  }

  String _exitName(Object? p, Object? exit) {
    final name = placeName(p);
    return exit is Map && exit['name'] != null ? tr('nav.stationExit', '{station}, Exit {exit}', {'station': name, 'exit': exit['name']}) : name;
  }

  // Share: your ETA on a trip, these directions, or either end, as the site's menu has them.
  void _shareMenu() {
    final from = nav.from, to = nav.to;
    void directions() {
      ShareCard.show(
        context,
        ShareCard(
          heading: tr('share.directions', 'Share these directions'),
          name: '${tr('planner.fromTo', '{from} to {to}', {'from': from!.label, 'to': to!.label})}${nav.via != null ? tr('share.via', ', via {place}', {'place': nav.via!.label}) : ''}',
          sub: When.describe(nav.when),
          kind: 'directions',
          data: {
            'from': from.here ? 'here' : from.toJson(),
            'to': to.here ? 'here' : to.toJson(),
            'when': nav.when?.toJson(),
            'way': nav.option == null ? null : wayKey(nav.option!),
            'summary': nav.option == null ? '' : '~${nav.option!['minutes']} min · ${navMixText(nav.option!)}',
            'path': null,
            if (nav.via != null) 'via': nav.via!.toJson(),
          },
          text: tr('share.byBusTrain', '{ends}, by bus and train', {
            'ends': tr('planner.fromTo', '{from} to {to}', {'from': from.label, 'to': to.label}),
          }),
        ),
      );
    }

    final items = <(IconData, String, String, VoidCallback)>[
      // Live progress needs a connection all the way, so offline it isn't offered.
      if (Trip.I.active && !Net.off.value) (Icons.schedule, tr('trip.share_my_eta', 'Share my ETA'), tr('share.etaSub', 'Live progress, until you get there'), () => AppNav.open('tripShare')),
      if (from != null && to != null) (Icons.route_outlined, tr('share.directions', 'Share these directions'), tr('planner.fromTo', '{from} to {to}', {'from': from.label, 'to': to.label}), directions),
      if (from != null && !from.here) (Icons.place_outlined, tr('share.start', 'Share start'), from.label, () => ShareCard.place(context, label: from.label, lat: from.lat, lng: from.lng)),
      if (to != null && !to.here) (Icons.flag_outlined, tr('share.end', 'Share end'), to.label, () => ShareCard.place(context, label: to.label, lat: to.lat, lng: to.lng)),
    ];
    if (items.length == 1) return items.first.$4();
    showModalBottomSheet<void>(
      context: context,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final it in items)
            ListTile(
              leading: Icon(it.$1),
              title: Text(it.$2),
              subtitle: Text(it.$3),
              onTap: () {
                Navigator.pop(c);
                it.$4();
              },
            ),
        ]),
      ),
    );
  }

  Widget _step(IconData icon, Widget body) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: context.sg.badge, shape: BoxShape.circle),
          child: Icon(icon, size: 18, color: context.sg.onBadge),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: SgCard(padding: const EdgeInsets.all(12), child: body),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final busOnly = _mode == 'bus';
    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: [
                Expanded(child: Text(tr('tray.navigate', 'Navigate'), style: Theme.of(context).textTheme.headlineMedium)),
                if (!busOnly) ...[
                  TourTarget(id: 'nav.save', child: IconButton(
                    tooltip: nav.isFav() ? tr('stop.saved', 'Saved') : tr('stop.save', 'Save'),
                    isSelected: nav.isFav(),
                    onPressed: nav.from == null || nav.to == null ? null : nav.toggleFav,
                    icon: Icon(nav.isFav() ? Icons.star_rounded : Icons.star_outline_rounded),
                  )),
                  IconButton(
                    tooltip: tr('nav.share', 'Share'),
                    onPressed: nav.from == null && nav.to == null && !Trip.I.active ? null : _shareMenu,
                    icon: const Icon(Icons.share_outlined),
                  ),
                ],
              ],
            ),
          ),
          if (NavPage.busOnly != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(
                width: double.infinity,
                child: TourTarget(id: 'nav.modes', child: FitSegments<String>(
                  showSelectedIcon: true,
                  options: [('all', tr('nav.bus_and_train', 'Bus and train')), ('bus', tr('nav.bus_only', 'Bus only'))],
                  selected: _mode,
                  onChanged: (mode) {
                    setState(() => Store.I.put(NavPage.modeKey, mode));
                    NavPage.switched?.call(mode);
                  },
                )),
              ),
            ),
          Expanded(
            child: busOnly
                ? NavPage.busOnly!()
                : RefreshIndicator(
                    onRefresh: () => nav.option != null ? nav.open(nav.option!) : nav.run(),
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                      children: [
                        if (nav.option == null) ...[
                          // The two ends stack, with the swap button between them and the width
                          // all theirs, as the site's do on a phone.
                          TourTarget(id: 'nav.fields', child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              _end('from', nav.from, tr('nav.from', 'From')),
                              _savedPlaces('from'),
                              if (nav.via != null || nav.viaOpen) ...[const SizedBox(height: 8), _end('via', nav.via, tr('settings.stop', 'Stop'))],
                              Center(
                                child: IconButton(
                                  tooltip: tr('nav.swap_start_and_end', 'Swap start and end'),
                                  icon: const Icon(Icons.swap_vert),
                                  onPressed: () {
                                    final t = nav.from;
                                    nav.from = nav.to;
                                    nav.to = t;
                                    nav.run();
                                  },
                                ),
                              ),
                              _end('to', nav.to, tr('nav.to', 'To')),
                              _savedPlaces('to'),
                            ],
                          )),
                          if (nav.via == null && !nav.viaOpen)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () => _setEnd('via'),
                                icon: const Icon(Icons.add_location_alt_outlined),
                                label: Text(tr('nav.add_a_stop', 'Add a stop')),
                              ),
                            ),
                          TourTarget(id: 'nav.when', child: WhenPicker(
                            value: nav.when,
                            onChanged: (w) {
                              nav.when = w;
                              nav.run();
                            },
                          )),
                          const SizedBox(height: 12),
                          if (nav.options.isNotEmpty) TourTarget(id: 'nav.ways', child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _ways())) else ..._ways(),
                        ] else
                          ..._way(nav.option!),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Where to stand on a train for the way off the platform (features/nav/doors.dart).
class TrainDoors {
  TrainDoors._();
  static Widget? Function(BuildContext context, Map leg, Map? next)? build;
}

/// Navigate as it is, for a trip started from it to come back to (reopenNav): its ends, its stop,
/// its time, and the way open, by its key and as it was in case it's gone from the next plan.
Map<String, Object?> navOrigin(Map<String, dynamic> option) {
  final n = NavState.I;
  Object? kept;
  try {
    kept = jsonDecode(jsonEncode(option));
  } catch (_) {
    // Not a way that can be kept: planned again, by its key.
  }
  return {
    'kind': 'nav',
    'from': n.from?.keepJson(),
    'to': n.to?.keepJson(),
    'via': n.via?.toJson(),
    'when': n.when?.toJson(),
    'way': wayKey(option),
    'option': kept,
  };
}

/// Back to Navigate, from a trip (the site's openTripOrigin, js/nav.js): the way the trip was started
/// from, not the list of ways. If Navigate still has it open, it's as it was left. Otherwise that way
/// opens at once and the ways are planned again behind it, for its live timings if it's still one of
/// them; if it isn't, it stays as you picked it, and All ways has the rest. A time that has passed is
/// left out, so it plans for now. A trip from before it kept its way opens on the list.
void reopenNav(Map o) {
  final n = NavState.I;
  final from = NavEnd.fromKept(o['from']), to = NavEnd.fromKept(o['to']), via = NavEnd.from(o['via']);
  final picked = WhenPick.fromJson(o['when']);
  final way = o['way'] as String?;
  bool same(NavEnd? a, NavEnd? b) => (a == null && b == null) || (a != null && b != null && a.here == b.here && (a.here || (a.label == b.label && a.coord() == b.coord())));
  final open = n.option;
  final kept = way != null && open != null && wayKey(open) == way && same(n.from, from) && same(n.to, to) && same(n.via, via) && n.when?.at == picked?.at && n.when?.mode == picked?.mode;
  Store.I.put(NavPage.modeKey, null);
  AppNav.showPage('nav');
  if (kept) return;
  n.from = from;
  n.to = to;
  n.via = via;
  n.when = picked != null && When.problem(picked) == null ? picked : null;
  final saved = o['option'] is Map ? Map<String, dynamic>.from(o['option'] as Map) : null;
  n.run(keep: saved).then((_) {
    if (way == null || !identical(n.option, saved)) return;
    final again = n.options.where((w) => wayKey(w) == way).firstOrNull ?? saved;
    if (again != null) n.open(again);
  });
}

/// Opens Navigate with its ends, from a link, a place or a saved nav.
void openNav({NavEnd? from, NavEnd? to, NavEnd? via, WhenPick? when, String? way}) {
  final n = NavState.I;
  n.from = from;
  n.to = to;
  n.via = via;
  n.when = when;
  Store.I.put(NavPage.modeKey, null);
  AppNav.showPage('nav');
  n.run().then((_) {
    if (way == null) return;
    final pick = n.options.where((o) => wayKey(o) == way).firstOrNull;
    if (pick != null) n.open(pick);
  });
}
