// The route planner, Navigate's Bus only tab (the site's js/planner.js, from the bot's /route):
// pick a start and an end stop and see every bus that links them without a change, or, when
// none does, the quickest journeys with a short walk or a change of bus (data/journeys.dart,
// worked out on the phone), each openable leg by leg with live timings: the buses due before
// you'd get to a stop struck through, the one you'd catch picked out. A stop picked on the wrong
// side of the road is pointed out, with the one across to use instead.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/favs.dart';
import '../../data/journeys.dart';
import '../../data/location.dart';
import '../../data/network.dart';
import '../../data/places.dart';
import '../../data/search.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/stop_rows.dart';
import '../nav/when_picker.dart';
import '../timings/stop_screen.dart';

class PlannerState extends ChangeNotifier {
  PlannerState._();
  static final PlannerState I = PlannerState._();

  String? start;
  String? end;
  WhenPick? when;
  List<Leg>? journey;
  List<List<Leg>> journeys = [];
  Map<String, ({String code, double metres})> fixes = {};
  bool searching = false;
  int _token = 0;

  void changed() => notifyListeners();

  ({String mode, int ms}) timing() => (mode: when?.mode ?? 'leave', ms: when == null ? When.nowMs() : (When.atToMs(when!.at) ?? When.nowMs()));

  void setCustoms() {
    final own = Store.I.get('sgbus_customs');
    final t = timing();
    final crossMs = t.ms + (t.mode == 'arrive' ? -1 : 1) * 45 * 60000;
    int pick(String way) => ['15', '30', '45', '60'].contains(own) ? int.parse(own!) : When.customsMin(way, crossMs);
    BusNet.setCustoms(pick('out'), pick('in'));
  }

  Future<void> search() async {
    journeys = [];
    fixes = {};
    if (start == null || end == null || start == end) return notifyListeners();
    final token = ++_token;
    searching = true;
    notifyListeners();
    await Stops.load();
    await BusNet.load();
    setCustoms();
    // A frame first, so "Looking for journeys…" shows before the search holds the screen.
    await Future<void>.delayed(const Duration(milliseconds: 16));
    if (token != _token) return;
    final t = timing();
    if (Journeys.directRides(start!, end!, t).every((r) => !r.running)) {
      journeys = Journeys.findJourneys(start!, end!, timing: t);
      fixes = journeys.isEmpty ? {} : Journeys.wrongSideEnds(start!, end!);
    }
    searching = false;
    notifyListeners();
  }

  bool isFav() => start != null && end != null && Favs.I.routes().any((r) => r['start'] == start && r['end'] == end);
  void toggleFav() {
    if (start == null || end == null) return;
    final r = Favs.I.routes();
    Favs.I.setRoutes(isFav()
        ? r.where((x) => !(x['start'] == start && x['end'] == end)).toList()
        : [...r, {'start': start, 'startName': Stops.nameOf(start!), 'end': end, 'endName': Stops.nameOf(end!)}]);
    notifyListeners();
  }
}

String _stopText(String code) => Stops.nameOf(code).isEmpty ? code : '${Stops.nameOf(code)} ($code)';
String _changes(int n) => n == 1 ? tr('planner.oneChange', '1 change') : tr('planner.changes', '{n} changes', {'n': n});
String _stops(int n) => n == 1 ? tr('planner.oneStop', '1 stop') : tr('planner.stops', '{n} stops', {'n': n});
String _minutes(double? m) => m != null ? tr('planner.aboutMin', '~{m} min', {'m': m.round()}) : tr('planner.timeUnknown', 'time unknown');
String _list(List<String> xs) => xs.length > 1 ? '${xs.sublist(0, xs.length - 1).join(', ')}${tr('trip.and', ' and ')}${xs.last}' : (xs.isEmpty ? '' : xs.first);
String _range(int a, int b) => When.clock(a) == When.clock(b) ? When.clock(a) : tr('planner.clockRange', '{a} to {b}', {'a': When.clock(a), 'b': When.clock(b)});

class PlannerTab extends StatefulWidget {
  const PlannerTab({super.key});

  @override
  State<PlannerTab> createState() => _PlannerTabState();
}

class _PlannerTabState extends State<PlannerTab> {
  PlannerState get p => PlannerState.I;
  List<Map<String, dynamic>?>? _live; // per leg, the bus's timings at its stop

  @override
  void initState() {
    super.initState();
    p.addListener(_redraw);
  }

  @override
  void dispose() {
    p.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() {
    if (mounted) setState(() {});
  }

  // The buses straight between a stop and the other end already set, which mark it Direct.
  Map<String, List<String>>? _directFor(String field, Iterable<String> codes) {
    final other = field == 'start' ? p.end : p.start;
    if (other == null || !BusNet.ready) return null;
    final out = <String, List<String>>{};
    for (final c in codes) {
      final buses = field == 'start' ? Journeys.directServices(c, other) : Journeys.directServices(other, c);
      if (buses.isNotEmpty) out[c] = buses;
    }
    return out;
  }

  String _directWay(String field) {
    final other = field == 'start' ? p.end! : p.start!;
    final name = Stops.nameOf(other).isEmpty ? other : Stops.nameOf(other);
    return field == 'start' ? tr('planner.straightTo', 'straight to {stop}', {'stop': name}) : tr('planner.straightFrom', 'straight from {stop}', {'stop': name});
  }

  // Those with a direct bus first; otherwise in the order they came.
  static List<String> _directFirst(List<String> codes, Map<String, List<String>>? direct) =>
      direct == null ? codes : [...codes.where(direct.containsKey), ...codes.where((c) => !direct.containsKey(c))];

  Future<void> _pickStop(String field) async {
    final q = TextEditingController();
    // Stops near you or a place, to pick from: the pin, or a saved place that isn't a stop.
    String? nearTitle;
    List<({Stop stop, double metres})> near = const [];
    String nearNote = '';
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(builder: (ctx, set) {
        final v = q.text.trim();
        final hits = v.isEmpty ? <StopHit>[] : StopSearch.match(v, limit: 30).stops;
        final hitCodes = [for (final h in hits) h.stop.code];
        final direct = _directFor(field, hitCodes);
        final sorted = _directFirst(hitCodes, direct);
        final nearDirect = _directFor(field, near.map((n) => n.stop.code));
        final nearCodes = _directFirst([for (final n in near) n.stop.code], nearDirect);

        void offer(String title, double lat, double lng) {
          near = Stops.near(lat, lng);
          final d = _directFor(field, near.map((n) => n.stop.code));
          nearNote = d == null
              ? ''
              : d.isEmpty
                  ? tr('planner.theseNone', 'None of these has a bus {way}, so the planner will look for journeys with a change.', {'way': _directWay(field)})
                  : d.length == 1
                      ? tr('planner.theseOne', 'One of these has a bus {way}, listed first.', {'way': _directWay(field)})
                      : tr('planner.theseMany', '{n} of these have a bus {way}, listed first.', {'n': d.length, 'way': _directWay(field)});
          set(() => nearTitle = title);
        }

        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.8,
            builder: (ctx, scroll) => ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
              TextField(
                controller: q,
                autofocus: true,
                onChanged: (_) => set(() {}),
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: tr('timings.search_by_name_or_code', 'Search by name or code (e.g. Bedok Interchange or 84009)')),
              ),
              if (v.isEmpty) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Wrap(spacing: 8, runSpacing: 6, children: [
                    Pill(
                      icon: Icons.my_location,
                      label: field == 'start' ? tr('planner.pick_a_start_stop_near', 'Pick a start stop near me') : tr('planner.pick_an_end_stop_near', 'Pick an end stop near me'),
                      onTap: () async {
                        try {
                          final fix = await Locate.here(toDo: tr('location.toFindStops', 'to find stops near you'));
                          await Stops.load();
                          offer(field == 'start' ? tr('planner.nearYouStart', 'Stops near you: pick the start') : tr('planner.nearYouEnd', 'Stops near you: pick the end'), fix.lat, fix.lng);
                        } on LocationError catch (e) {
                          AppNav.say(e.message);
                        }
                      },
                    ),
                    for (final place in Places.all())
                      Pill(
                        icon: place.icon,
                        label: place.name,
                        onTap: () {
                          if (place.stop != null) return Navigator.pop(ctx, place.stop);
                          offer(field == 'start' ? tr('planner.nearPlaceStart', 'Stops near {place}: pick the start', {'place': place.name}) : tr('planner.nearPlaceEnd', 'Stops near {place}: pick the end', {'place': place.name}), place.lat, place.lng);
                        },
                      ),
                  ]),
                ),
                if (nearTitle != null) ...[
                  SectionLabel(nearTitle!),
                  if (nearNote.isNotEmpty) Text(nearNote, style: TextStyle(color: context.sg.muted, fontSize: 13)),
                  StopRows(
                    stops: [for (final c in nearCodes) StopRowItem(c, distance: near.firstWhere((n) => n.stop.code == c).metres)],
                    pin: false,
                    direct: nearDirect,
                    onPick: (c) => Navigator.pop(ctx, c),
                  ),
                ] else if (Favs.I.stops().isNotEmpty)
                  StopRows(stops: [for (final f in Favs.I.stops()) StopRowItem(f.code)], direct: _directFor(field, Favs.I.stops().map((f) => f.code)), onPick: (c) => Navigator.pop(ctx, c)),
              ],
              if (direct != null && direct.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    direct.length == 1
                        ? tr('planner.directOne', 'One has a bus {way}, listed first.', {'way': _directWay(field)})
                        : tr('planner.directMany', '{n} have a bus {way}, listed first.', {'n': direct.length, 'way': _directWay(field)}),
                    style: TextStyle(color: context.sg.muted, fontSize: 13),
                  ),
                ),
              if (v.isNotEmpty) StopRows(stops: [for (final c in sorted) StopRowItem(c)], pin: false, direct: direct, onPick: (c) => Navigator.pop(ctx, c)),
            ]),
          ),
        );
      }),
    );
    if (code == null) return;
    if (field == 'start') {
      p.start = code;
    } else {
      p.end = code;
    }
    p.journey = null;
    p.search();
  }

  Future<void> _openJourney(List<Leg> legs) async {
    p.journey = legs;
    _live = null;
    p.changed();
    final clock = Journeys.journeyClock(legs, p.start!, p.end!);
    final leaveMs = p.when != null && clock != null ? When.span(p.when, clock.total).leave : When.nowMs();
    if (p.when != null && When.liveLead(leaveMs) == null) return;
    final results = await Future.wait(legs.map((l) => Arrivals.fetch(l.from, l.bus).then<Arrivals?>((a) => a).catchError((_) => null)));
    if (!mounted || p.journey != legs) return;
    setState(() => _live = [
          for (var k = 0; k < legs.length; k++)
            () {
              final s = results[k]?.services.where((s) => s.serviceNo == legs[k].bus).firstOrNull;
              return s == null ? null : {'etas': [for (final b in s.buses) if (b?.etaMs != null) b!.etaMs! / 60000]};
            }()
        ]);
  }

  Widget _endField(String field) {
    final sg = context.sg;
    final code = field == 'start' ? p.start : p.end;
    return SgCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      onTap: () => _pickStop(field),
      child: Row(children: [
        SizedBox(width: 44, child: Text(field == 'start' ? tr('nav.from', 'From') : tr('nav.to', 'To'), style: TextStyle(color: sg.muted, fontWeight: FontWeight.w600))),
        Expanded(child: Text(code == null ? tr('timings.search_by_name_or_code', 'Search by name or code (e.g. Bedok Interchange or 84009)') : _stopText(code), style: TextStyle(color: code == null ? sg.muted : sg.ink))),
      ]),
    );
  }

  List<Widget> _route() {
    final sg = context.sg;
    final s = p.start, e = p.end;
    if (s == null || e == null) {
      return [EmptyNote(tr('planner.setBoth', 'Set both ends to see the buses that run between them. You can type a stop, or use the pin to pick one near you.'))];
    }
    if (s == e) return [EmptyNote(tr('planner.sameStop', 'A route needs two different bus stops.'))];
    final late = When.problem(p.when);
    if (late != null) return [EmptyNote(late)];
    if (!BusNet.ready) return [EmptyNote(tr('planner.loadingRoutes', 'Loading bus routes…'))];
    p.setCustoms();
    final t = p.timing();
    final when = p.when;
    final then = when != null ? tr('planner.atThatTime', 'at that time') : tr('planner.rightNow', 'right now');
    final rides = Journeys.directRides(s, e, t);
    final running = rides.where((r) => r.running).toList();
    final idle = rides.where((r) => !r.running).map((r) => r.bus).toList();
    final idleNote = idle.isEmpty ? null : Text(tr('planner.notRunning', 'Not running {then}: {list}.', {'then': then, 'list': _list(idle)}), style: TextStyle(color: sg.muted, fontSize: 12));
    bool abroad(String c) => BusNet.crossBorder(c)?.abroad ?? false;
    final customsLine = abroad(s) == abroad(e)
        ? null
        : Text(
            tr('planner.customsLine', 'Times count ~{m} min to clear immigration at both checkpoints{byTime}. Your own time can be set in Settings.', {
              'm': BusNet.customs[abroad(e) ? 'out' : 'in'],
              'byTime': Store.I.get('sgbus_customs') == null ? tr('planner.byTimeOfDay', ', by the time of day') : '',
            }),
            style: TextStyle(color: sg.muted, fontSize: 12),
          );
    if (running.isNotEmpty) {
      final favs = Favs.I.buses().toSet();
      final list = Favs.pinned(running.map((r) => r.bus).toList(), favs, Favs.I.pin('bus'), (x) => x);
      final n = running.length;
      String? clockText;
      if (when != null) {
        final ms = When.atToMs(when.at)!;
        final totals = running.map((r) => ((r.minutes + When.busWaitMin) * 60000).round()).toList();
        final q = totals.reduce((a, b) => a < b ? a : b), sl = totals.reduce((a, b) => a > b ? a : b);
        clockText = when.mode == 'leave'
            ? tr('planner.leaveAt', "Leave at {time} and you'd get in around {range}, counting an average wait for the bus.", {'time': When.clockDay(ms), 'range': _range(ms + q, ms + sl)})
            : ms - q < When.nowMs()
                ? tr('planner.tooLate', "To arrive by {time} you'd have had to leave by about {leave}.", {'time': When.clock(ms), 'leave': When.clock(ms - q)})
                : tr('planner.arriveBy', 'To arrive by {time}, leave around {range}, counting an average wait for the bus.', {'time': When.clockDay(ms), 'range': _range(ms - sl, ms - q)});
      }
      return [
        Text(n == 1
            ? (when != null ? tr('planner.runsOneThen', '1 bus runs between these stops at that time. Pick one to see its timings at the start.') : tr('planner.runsOne', '1 bus runs between these stops. Pick one to see its timings at the start.'))
            : (when != null
                ? tr('planner.runsManyThen', '{n} buses run between these stops at that time. Pick one to see its timings at the start.', {'n': n})
                : tr('planner.runsMany', '{n} buses run between these stops. Pick one to see its timings at the start.', {'n': n}))),
        if (clockText != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(clockText, style: TextStyle(color: sg.muted))),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final no in list) Pill(label: no, icon: favs.contains(no) ? Icons.star_rounded : null, onTap: () => StopScreen.open(s, service: no, ctx: StopContext('route', note: _routeNote(s, e, no)))),
        ]),
        ?idleNote,
        ?customsLine,
      ];
    }
    final none = idle.isNotEmpty ? tr('planner.noneThen', 'No bus runs straight between these stops {then}.', {'then': then}) : tr('planner.noneAtAll', 'No single bus links these two stops.');
    if (p.searching) return [Text('$none ${tr('planner.looking', 'Looking for journeys with a change…')}'), const LinearProgressIndicator()];
    if (p.journeys.isEmpty) {
      return [Text('$none ${tr('planner.noJourney', 'No journey with up to three changes runs {then} either. Try another time, or other stops.', {'then': then})}'), ?idleNote];
    }
    final fixes = p.fixes;
    final fixed = (start: fixes['start']?.code ?? s, end: fixes['end']?.code ?? e);
    final hasFix = (fixes['start'] != null || fixes['end'] != null) && fixed.start != fixed.end;
    return [
      if (hasFix)
        SgCard(
          border: sg.warn,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final field in ['start', 'end'])
              if (fixes[field] != null)
                Text.rich(TextSpan(children: [
                  TextSpan(text: '${tr('planner.wrongSide', 'Wrong side of the road?')} ', style: const TextStyle(fontWeight: FontWeight.w700)),
                  TextSpan(
                    text: field == 'start'
                        ? tr('planner.wrongSideStart', 'The quickest buses for this trip leave from {stop}, across the road from your start, ~{m} m away.',
                            {'stop': _stopText(fixes[field]!.code), 'm': fixes[field]!.metres.round()})
                        : tr('planner.wrongSideEnd', 'The quickest buses for this trip stop at {stop}, across the road from your end, ~{m} m away.',
                            {'stop': _stopText(fixes[field]!.code), 'm': fixes[field]!.metres.round()}),
                  ),
                ])),
            TextButton.icon(
              onPressed: () {
                p.start = fixed.start;
                p.end = fixed.end;
                p.search();
              },
              icon: const Icon(Icons.swap_horiz),
              label: Text(fixes['start'] != null && fixes['end'] != null
                  ? tr('planner.useAcross', 'Use the stops across the road')
                  : tr('planner.useInstead', 'Use {stop} instead', {'stop': Stops.nameOf((fixes['start'] ?? fixes['end'])!.code)})),
            ),
          ]),
        ),
      Text('$none ${tr('planner.butThese', 'These journeys get there with a short walk or a change:')}'),
      const SizedBox(height: 8),
      for (final legs in p.journeys) Padding(padding: const EdgeInsets.only(bottom: 8), child: _journeyItem(legs)),
      ?idleNote,
      ?customsLine,
      Text(when != null ? tr('planner.clockNote', 'Times are rough estimates from distance. Clock times count an average wait for each bus.') : Journeys.estimateNote(),
          style: TextStyle(color: sg.muted, fontSize: 12)),
    ];
  }

  Widget _journeyItem(List<Leg> legs) {
    final sg = context.sg;
    final s = p.start!, e = p.end!;
    final when = p.when;
    String timeText;
    int? leave;
    if (when == null) {
      timeText = _minutes(Journeys.journeyMinutes(legs, s, e));
    } else {
      final clock = Journeys.journeyClock(legs, s, e);
      if (clock == null) {
        timeText = tr('planner.timeUnknown', 'time unknown');
      } else {
        final span = When.span(when, clock.total);
        leave = span.leave;
        timeText = '${When.clock(span.leave)} → ${When.clock(span.arrive)}';
      }
    }
    final parts = <String>[
      if (legs.first.from != s) tr('route.from', 'From {stop}', {'stop': Stops.nameOf(legs.first.from)}),
      if (legs.length > 1) tr('planner.changeAt', 'Change at {places}', {'places': _list(legs.sublist(0, legs.length - 1).map((l) => Stops.nameOf(l.to)).toList())}),
      if (legs.last.to != e) tr('planner.offAt', 'Off at {stop}', {'stop': Stops.nameOf(legs.last.to)}),
    ];
    return SgCard(
      onTap: () => _openJourney(legs),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          for (var i = 0; i < legs.length; i++) ...[
            if (i > 0) Icon(Icons.chevron_right, size: 16, color: sg.muted),
            Chip(avatar: const Icon(Icons.directions_bus, size: 16), label: Text(legs[i].bus), visualDensity: VisualDensity.compact),
          ],
        ]),
        Text('$timeText · ${_changes(legs.length - 1)}', style: Theme.of(context).textTheme.titleMedium),
        Text(parts.isEmpty ? tr('planner.walkToStop', 'Walk to a stop nearby') : parts.join(' · '), style: TextStyle(color: sg.muted)),
        if (when?.mode == 'arrive' && leave != null && leave < When.nowMs())
          Text(tr('planner.tooLateBy', "Too late: you'd have had to leave by {time}", {'time': When.clock(leave)}), style: TextStyle(color: sg.error)),
      ]),
    );
  }

  // How far a bus opened off a route still has to go.
  String? _routeNote(String start, String end, String bus) {
    final count = BusNet.stopsTo(bus, start, end);
    if (count == null) return null;
    final text = tr('planner.busStopsTo', 'Bus {no}: {stops} to {stop}', {'no': bus, 'stops': _stops(count.stops), 'stop': _stopText(end)});
    final via = count.via;
    return via == null ? text : tr('planner.viaTerminus', '{text}, going round via its terminus at {stop}', {'text': text, 'stop': Stops.nameOf(via).isEmpty ? via : Stops.nameOf(via)});
  }

  // And off a journey: the stops to where you get off, and what comes after that.
  String? _journeyNote(List<Leg> legs, int index, String end) {
    final details = legs.skip(index).map(Journeys.legDetails).toList();
    if (details.any((d) => d == null)) return null;
    final leg = legs[index];
    final first = tr('planner.busStopsTo', 'Bus {no}: {stops} to {stop}', {'no': leg.bus, 'stops': _stops(details.first!.stops), 'stop': _stopText(leg.to)});
    if (index + 1 < legs.length) {
      final left = details.fold<int>(0, (a, d) => a + d!.stops);
      return tr('planner.thenChange', '{first}, then change to {bus} · {stops} left in the journey', {'first': first, 'bus': legs[index + 1].bus, 'stops': _stops(left)});
    }
    if (leg.to != end) return tr('planner.thenWalk', '{first}, then a short walk to {stop}', {'first': first, 'stop': _stopText(end)});
    return tr('planner.theEnd', '{first}, the end of your journey', {'first': first});
  }

  List<Widget> _journey(List<Leg> legs) {
    final sg = context.sg;
    final s = p.start!, e = p.end!;
    final details = legs.map(Journeys.legDetails).toList();
    final back = Row(children: [
      TextButton.icon(onPressed: () {
        p.journey = null;
        p.changed();
      }, icon: const Icon(Icons.arrow_back), label: Text(tr('planner.backToRoute', 'Back to route'))),
      const Spacer(),
      TextButton(onPressed: () => _openJourney(legs), child: Text(tr('nav.refresh', 'Refresh'))),
      FilledButton.icon(
        onPressed: () => AppNav.open('startTripLegs', {'legs': legs, 'start': s, 'end': e}),
        icon: const Icon(Icons.notifications_active_outlined),
        label: Text(tr('planner.startTrip', 'Start trip')),
      ),
    ]);
    if (details.any((d) => d == null)) return [back, EmptyNote(tr('planner.journeyGone', "This journey no longer runs the way it did. Go back to the route for today's options."))];
    final when = p.when;
    final clock = Journeys.journeyClock(legs, s, e)!;
    final leaveMs = when != null ? When.span(when, clock.total).leave : When.nowMs();
    final lead = when != null ? When.liveLead(leaveMs) : 0.0;
    final live = lead != null;
    if (live && _live == null) return [back, EmptyNote(tr('planner.loadingLive', 'Loading live timings…'))];
    final steps = <Widget>[];
    double? t = live ? lead : null;
    var here = s;
    Widget step(IconData icon, Widget body) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            CircleAvatar(radius: 17, backgroundColor: sg.brand, child: Icon(icon, size: 18, color: sg.onBrand)),
            const SizedBox(width: 10),
            Expanded(child: SgCard(padding: const EdgeInsets.all(12), child: body)),
          ]),
        );
    for (var k = 0; k < legs.length; k++) {
      final leg = legs[k];
      final walk = Journeys.walkDetails(here, leg.from);
      if (walk != null) {
        steps.add(step(Icons.directions_walk, Text(tr('planner.walkTo', 'Walk ~{metres} m to {stop}, ~{m} min', {'metres': walk.metres.round(), 'stop': _stopText(leg.from), 'm': walk.minutes.round()}))));
        if (t != null) t += walk.minutes;
      }
      final d = details[k]!;
      final etas = live ? ((_live![k]?['etas'] as List?)?.cast<double>() ?? const <double>[]) : const <double>[];
      final catchAt = t != null ? etas.where((x) => x >= t!).firstOrNull : null;
      steps.add(step(
        Icons.directions_bus,
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Chip(label: Text(leg.bus), visualDensity: VisualDensity.compact),
            const SizedBox(width: 6),
            Text('${_stops(d.stops)} · ${_minutes(d.minutes)}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
          Text(tr('planner.legRide', 'From {from} to {to}', {'from': _stopText(leg.from), 'to': _stopText(leg.to)})),
          if (!live)
            Text(tr('planner.boardAround', 'Board around {time}, after an average wait.', {'time': When.clock(leaveMs + (clock.boards[k] * 60000).round())}), style: TextStyle(color: sg.muted)),
          if (live && t != null && t >= 1)
            Text(tr('planner.reach', "You'd get to this stop in ~{m} min, around {time}.", {'m': t.round(), 'time': When.clock(When.nowMs() + (t * 60000).round())}), style: TextStyle(color: sg.muted)),
          if (live && etas.isNotEmpty)
            Text.rich(TextSpan(children: [
              TextSpan(text: '${tr('planner.nextBus', 'Next {bus}:', {'bus': leg.bus})} '),
              for (var i = 0; i < etas.length; i++) ...[
                if (i > 0) const TextSpan(text: ' · '),
                TextSpan(
                  text: Eta.text(etas[i] * 60000),
                  semanticsLabel: t != null && etas[i] < t ? '${Eta.text(etas[i] * 60000)}, ${tr('planner.gone', 'Gone by the time you get there')}' : etas[i] == catchAt ? '${Eta.text(etas[i] * 60000)}, ${tr('planner.yours', "The one you'd catch")}' : null,
                  style: TextStyle(
                    decoration: t != null && etas[i] < t ? TextDecoration.lineThrough : null,
                    fontWeight: etas[i] == catchAt ? FontWeight.w800 : null,
                    color: etas[i] == catchAt ? sg.brandInk : null,
                  ),
                ),
              ],
            ])),
          if (live && etas.isNotEmpty && t != null && catchAt == null)
            Text(tr('planner.allEarlier', "Every bus listed comes before you'd get here; yours is a later one."), style: TextStyle(color: sg.muted)),
          if (live && etas.isEmpty) Text(tr('planner.noLive', 'No live timings for this bus right now.'), style: TextStyle(color: sg.muted)),
          TextButton.icon(
            onPressed: () => StopScreen.open(leg.from, service: leg.bus, ctx: StopContext('journey', note: _journeyNote(legs, k, e))),
            icon: const Icon(Icons.directions_bus_outlined),
            label: Text(tr('planner.timingsAt', '{bus} timings at {stop}', {'bus': leg.bus, 'stop': Stops.nameOf(leg.from)})),
          ),
        ]),
      ));
      for (final c in Journeys.legCrossings(leg)) {
        final v = {'from': _stopText(c.from), 'to': _stopText(c.to), 'm': c.minutes, 'byTime': Store.I.get('sgbus_customs') == null ? tr('planner.byTimeOfDay', ', by the time of day') : ''};
        steps.add(step(
          Icons.flag_outlined,
          Text(c.way == 'out'
              ? tr('planner.crossOut', "Get off at {from} and clear Singapore's immigration, ride any bus across to {to} and clear Malaysia's, then get on again: ~{m} min for both{byTime}.", v)
              : tr('planner.crossIn', "Get off at {from} and clear Malaysia's immigration, ride any bus across to {to} and clear Singapore's, then get on again: ~{m} min for both{byTime}.", v)),
        ));
      }
      t = live ? (catchAt != null ? catchAt + d.minutes : null) : null;
      here = leg.to;
    }
    final lastWalk = Journeys.walkDetails(here, e);
    if (lastWalk != null) {
      steps.add(step(Icons.directions_walk, Text(tr('planner.walkTo', 'Walk ~{metres} m to {stop}, ~{m} min', {'metres': lastWalk.metres.round(), 'stop': _stopText(e), 'm': lastWalk.minutes.round()}))));
      if (t != null) t += lastWalk.minutes;
    }
    if (t != null) {
      steps.add(step(Icons.flag, Text(tr('planner.arriveLive', 'Arrive around {time}, in ~{m} min, catching the first bus you can.', {'time': When.clock(When.nowMs() + (t * 60000).round()), 'm': t.round()}))));
    } else if (!live) {
      steps.add(step(Icons.flag, Text(tr('planner.arriveClock', 'Arrive around {time}, counting an average wait for each bus.', {'time': When.clockDay(leaveMs + (clock.total * 60000).round())}))));
    }
    final totalStops = details.fold<int>(0, (a, d) => a + d!.stops);
    return [
      back,
      Text('${tr('planner.onTheMove', '{m} on the move', {'m': _minutes(Journeys.journeyMinutes(legs, s, e))})} · ${_changes(legs.length - 1)} · ${_stops(totalStops)}',
          style: Theme.of(context).textTheme.titleMedium),
      if (when != null)
        Text(
          leaveMs < When.nowMs() - 60000
              ? tr('planner.tooLateLeave', "To arrive by {time} you'd have had to leave by {leave}.", {'time': When.clock(When.atToMs(when.at)!), 'leave': When.clock(leaveMs)})
              : when.mode == 'arrive'
                  ? tr('planner.setOffArrive', 'Set off around {time} to arrive by {by}.', {'time': When.clockDay(leaveMs), 'by': When.clock(When.atToMs(when.at)!)})
                  : tr('planner.setOff', 'Set off around {time}.', {'time': When.clockDay(leaveMs)}),
          style: TextStyle(color: sg.muted),
        ),
      const SizedBox(height: 8),
      ...steps,
      if (live) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(tr('planner.updated', 'Updated {time}', {'time': When.clock(When.nowMs())}), style: TextStyle(color: sg.muted, fontSize: 12))),
      Text(live ? Journeys.estimateNote() : '${tr('planner.clockNote', 'Times are rough estimates from distance. Clock times count an average wait for each bus.')} ${tr('planner.liveFrom', 'Live timings show here from half an hour before you set off.')}',
          style: TextStyle(color: sg.muted, fontSize: 12)),
    ];
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        if (p.journey != null)
          ..._journey(p.journey!)
        else ...[
          Row(children: [
            Expanded(child: Column(children: [_endField('start'), const SizedBox(height: 8), _endField('end')])),
            Column(children: [
              IconButton(
                tooltip: tr('nav.swap_start_and_end', 'Swap start and end'),
                icon: const Icon(Icons.swap_vert),
                onPressed: () {
                  final t = p.start;
                  p.start = p.end;
                  p.end = t;
                  p.search();
                },
              ),
              if (p.start != null && p.end != null && p.start != p.end)
                IconButton(
                  tooltip: p.isFav() ? tr('stop.saved', 'Saved') : tr('planner.saveRoute', 'Save route'),
                  icon: Icon(p.isFav() ? Icons.star_rounded : Icons.star_outline_rounded),
                  onPressed: p.toggleFav,
                ),
            ]),
          ]),
          const SizedBox(height: 10),
          WhenPicker(value: p.when, onChanged: (w) {
            p.when = w;
            p.search();
          }),
          const SizedBox(height: 12),
          ..._route(),
        ],
      ]);
}

/// Opens Bus only with its ends, from a link or a saved route.
void openPlanner({String? start, String? end, WhenPick? when}) {
  final p = PlannerState.I;
  p.start = start;
  p.end = end;
  p.when = when;
  p.journey = null;
  Store.I.put('sgbus_nav_mode', 'bus');
  AppNav.showPage('nav');
  unawaited(p.search());
}
