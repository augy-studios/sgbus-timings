// Glance (the site's js/glance.js): one big answer at the top, the next bus from a few stops, and
// under it those stops as short cards, each bus on one line with where it's going and its next
// three times: only your favourite buses, once you have any. A chip picks the stops: your saved
// stops, a list of them, the ones nearby, or the ones near Home, Work or another place, in step
// with the list Favourites is on. Nearby, the big bus is the next one you'd make if you set off
// now, and it says when to leave. Times count down, and fetch again every 30 seconds while
// Glance is on show.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/favs.dart';
import '../../data/location.dart';
import '../../data/places.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../timings/greeting.dart';
import '../timings/stop_screen.dart';
import '../tour/tour.dart';

class GlanceSource {
  GlanceSource(this.key, this.name, this.icon, {this.list, this.place});
  final String key;
  final String name;
  final IconData icon;
  final FavList? list;
  final Place? place;
}

class GlancePage extends StatefulWidget {
  const GlancePage({super.key});

  static const storeKey = 'sgbus_glance';
  static const stopsMax = 4;
  static const chosenMax = 12;
  static const rowsMax = 6;
  static const placeM = 500.0;
  static const mPerMin = 80.0;
  static const detour = 1.25;

  static int walkMins(double m) => (m * detour / mPerMin).round().clamp(1, 1 << 20);

  /// The weather button's place, filled in by features/weather/.
  static Widget Function(BuildContext context)? weather;

  @override
  State<GlancePage> createState() => _GlancePageState();
}

class _GlancePageState extends State<GlancePage> {
  String? _source;
  List<({String code, double? metres})> _stops = [];
  final Map<String, List<ServiceArrivals>> _arrivals = {};
  int _fetchedAt = 0;
  bool _needsLocation = false;
  String? _failed;
  int _token = 0;
  Timer? _tick;
  int _since = 0;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    Favs.I.addListener(_favsChanged);
    AppNav.page.addListener(_pageChanged);
    _tick = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!_showing) return;
      _since += 10;
      if (_since >= 30 || _fetchedAt == 0) {
        _since = 0;
        _refresh();
      } else {
        setState(() {});
      }
    });
    Stops.load().then((_) => _refresh());
  }

  @override
  void dispose() {
    _tick?.cancel();
    Favs.I.removeListener(_favsChanged);
    AppNav.page.removeListener(_pageChanged);
    super.dispose();
  }

  bool get _showing => mounted && AppNav.page.value == 'glance';

  void _pageChanged() {
    if (_showing) _refresh();
  }

  void _favsChanged() {
    final k = _chosen()?.key ?? '';
    // Favourites' tab picked: its list here too, if it has stops to show.
    final on = Favs.I.listOn();
    final follow = on != null ? 'list:$on' : null;
    if (follow != null && follow != k && _sources().any((s) => s.key == follow)) {
      _source = follow;
      Store.I.put(GlancePage.storeKey, follow);
    }
    if (k == 'saved' || k.startsWith('list:') || (_stops.isEmpty && _showing)) {
      _refresh();
    } else if (mounted) {
      setState(() {});
    }
  }

  List<GlanceSource> _sources() {
    final out = <GlanceSource>[];
    if (Favs.I.stops().isNotEmpty || Favs.I.stopBuses().isNotEmpty) {
      out.add(GlanceSource('saved', tr('glance.source.saved', 'Saved stops'), Icons.star_outline_rounded));
    }
    for (final l in Favs.I.lists()) {
      if (l.items.any((k) => RegExp(r'^stop(bus)?:').hasMatch(k))) out.add(GlanceSource('list:${l.id}', l.name, Icons.bookmark_outline, list: l));
    }
    out.add(GlanceSource('near', tr('glance.source.near', 'Nearby'), Icons.my_location));
    for (final p in Places.all()) {
      out.add(GlanceSource('place:${p.key}', p.name, p.icon, place: p));
    }
    return out;
  }

  GlanceSource? _chosen() {
    final all = _sources();
    for (final k in [_source, Store.I.get(GlancePage.storeKey)]) {
      for (final s in all) {
        if (s.key == k) return s;
      }
    }
    return all.isEmpty ? null : all.first;
  }

  Future<List<({String code, double? metres})>?> _stopsOf(GlanceSource? src, {bool ask = false}) async {
    if (src == null) return [];
    if (src.list != null) {
      final codes = <String>{};
      for (final k in src.list!.items) {
        final m = RegExp(r'^stop(?:bus)?:(\d{5})').firstMatch(k);
        if (m != null) codes.add(m[1]!);
      }
      return [for (final c in codes.take(GlancePage.chosenMax)) (code: c, metres: null)];
    }
    if (src.key == 'saved') {
      final codes = {...Favs.I.stops().map((f) => f.code), ...Favs.I.stopBuses().map((b) => b.code)};
      return [for (final c in codes.take(GlancePage.chosenMax)) (code: c, metres: null)];
    }
    await Stops.load();
    if (src.key == 'near') {
      if (!ask && !(Locate.asked || await Locate.allowed())) return null;
      final at = await Locate.here(ask: ask, maxAge: const Duration(minutes: 1));
      return [for (final n in Stops.near(at.lat, at.lng, limit: GlancePage.stopsMax)) (code: n.stop.code, metres: n.metres)];
    }
    final p = src.place!;
    final near = Stops.near(p.lat, p.lng, limit: GlancePage.stopsMax + 1).where((n) => n.metres <= GlancePage.placeM && n.stop.code != p.stop);
    return [
      if (p.stop != null) (code: p.stop!, metres: null),
      for (final n in near) (code: n.stop.code, metres: null),
    ].take(GlancePage.stopsMax).toList();
  }

  Future<void> _refresh({bool ask = false}) async {
    if (!mounted) return;
    final src = _chosen();
    _source = src?.key;
    final mine = ++_token;
    try {
      final got = await _stopsOf(src, ask: ask);
      if (mine != _token) return;
      _needsLocation = got == null;
      _stops = got ?? [];
      _failed = null;
    } on LocationError catch (e) {
      if (mine != _token) return;
      _stops = [];
      _failed = e.message;
    }
    if (mounted) setState(() {});
    final results = await Future.wait(_stops.map((s) => Arrivals.fetch(s.code).then<Arrivals?>((a) => a).catchError((_) => null)));
    if (mine != _token || !mounted) return;
    _arrivals.clear();
    for (var i = 0; i < _stops.length; i++) {
      if (results[i] != null) _arrivals[_stops[i].code] = results[i]!.services;
    }
    _fetchedAt = When.nowMs();
    setState(() {});
  }

  // Each bus at a stop that's still to come, ms from now, soonest first.
  List<({String no, String to, List<int> times})> _rowsOf(String code) {
    final left = When.nowMs() - _fetchedAt;
    final out = <({String no, String to, List<int> times})>[];
    for (final s in _arrivals[code] ?? const <ServiceArrivals>[]) {
      final times = [for (final b in s.buses) if (b?.etaMs != null) (b!.etaMs! - left).clamp(0, 1 << 31)];
      if (times.isEmpty) continue;
      final dest = s.dest;
      out.add((no: s.serviceNo, to: dest == null ? '' : Stops.nameOf(dest), times: times));
    }
    out.sort((a, b) => a.times.first.compareTo(b.times.first));
    return out;
  }

  // The buses a stop's card keeps to, or null for every bus.
  Set<String>? _keepTo(GlanceSource? src, String code) {
    if (src?.list != null) {
      final set = <String>{};
      for (final k in src!.list!.items) {
        final at = RegExp(r'^stopbus:(\d{5})\/(.+)$').firstMatch(k);
        if (at != null && at[1] == code) set.add(at[2]!);
        final bus = RegExp(r'^bus:(.+)$').firstMatch(k);
        if (bus != null) set.add(bus[1]!);
      }
      return set.isEmpty ? null : set;
    }
    final own = Favs.I.busesAt(code);
    if (own.isNotEmpty) return own;
    final favs = Favs.I.buses().toSet();
    return favs.isEmpty ? null : favs;
  }

  ({String no, String to, String code, int ms, int walk})? _nextBus(GlanceSource? src) {
    final all = <({String no, String to, String code, int ms, int walk, bool fav})>[];
    for (final s in _stops) {
      final walk = s.metres != null ? GlancePage.walkMins(s.metres!) * 60000 : 0;
      final keep = _keepTo(src, s.code);
      for (final r in _rowsOf(s.code)) {
        final t = r.times.where((ms) => ms >= walk).firstOrNull;
        if (t != null) all.add((no: r.no, to: r.to, code: s.code, ms: t, walk: walk, fav: keep?.contains(r.no) ?? false));
      }
    }
    final pool = all.any((b) => b.fav) ? all.where((b) => b.fav).toList() : all;
    pool.sort((a, b) => a.ms.compareTo(b.ms));
    final b = pool.firstOrNull;
    return b == null ? null : (no: b.no, to: b.to, code: b.code, ms: b.ms, walk: b.walk);
  }

  void _open(String code, [String? no]) => StopScreen.open(code, service: no);

  Future<void> _pickSource() async {
    final now = _chosen()?.key;
    final pick = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final s in _sources())
            ListTile(
              leading: Icon(s.icon),
              title: Text(s.name),
              selected: s.key == now,
              trailing: s.key == now ? const Icon(Icons.check) : null,
              onTap: () => Navigator.pop(ctx, s.key),
            ),
        ]),
      ),
    );
    if (pick == null) return;
    _source = pick;
    Store.I.put(GlancePage.storeKey, pick);
    _fetchedAt = 0;
    _stops = [];
    Favs.I.setListOn(pick.startsWith('list:') ? pick.substring(5) : null);
    _refresh(ask: pick == 'near');
  }

  String _timeCell(int ms) => Eta.clockTimes ? Eta.clock(ms) : (ms < 60000 ? tr('glance.arr', 'Arr') : '${ms ~/ 60000}');

  Widget _hero(GlanceSource? src) {
    final sg = context.sg;
    final kicker = tr('glance.nextBus', 'Next bus');
    Widget say(String text, {bool locate = false}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(kicker, style: TextStyle(color: sg.muted, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text(text, style: Theme.of(context).textTheme.titleMedium),
          if (locate) ...[
            const SizedBox(height: 10),
            FilledButton.icon(onPressed: () => _refresh(ask: true), icon: const Icon(Icons.my_location), label: Text(tr('glance.useLocation', 'Use my location'))),
          ],
        ]);
    if (_failed != null) return say(_failed!, locate: src?.key == 'near');
    if (_needsLocation) return say(tr('glance.seeAround', 'See the buses at the stops around you.'), locate: true);
    if (src == null || _stops.isEmpty) {
      return say(src?.place != null
          ? tr('glance.noStopsNear', 'No bus stops within {m} m of {place}.', {'m': GlancePage.placeM.round(), 'place': src!.name})
          : tr('glance.saveAStop', 'Save a stop with its star, and its next bus shows here.'));
    }
    if (_fetchedAt == 0) return say(tr('glance.getting', 'Getting the times…'));
    final bus = _nextBus(src);
    if (bus == null) return say(tr('glance.noneDue', 'No buses due at these stops right now.'));
    final m = bus.ms ~/ 60000;
    final when = Eta.clockTimes
        ? tr('glance.atClock', 'at {time}', {'time': Eta.clock(bus.ms)})
        : bus.ms < 60000
            ? tr('glance.arriving', 'Arriving')
            : tr('glance.inMin', 'in {m} min', {'m': m});
    final leave = bus.walk > 0 ? ((bus.ms - bus.walk) ~/ 60000).clamp(0, 1 << 20) : null;
    final walk = bus.walk > 0 ? tr('glance.minWalk', '{m} min walk', {'m': bus.walk ~/ 60000}) : '';
    final where = bus.to.isNotEmpty
        ? tr('glance.toAt', 'to {to}, at {stop}', {'to': bus.to, 'stop': Stops.nameOf(bus.code)})
        : tr('glance.at', 'at {stop}', {'stop': Stops.nameOf(bus.code)});
    return InkWell(
      onTap: () => _open(bus.code, bus.no),
      borderRadius: BorderRadius.circular(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          leave != null
              ? (leave < 1 ? tr('glance.leaveNow', 'Leave now for') : tr('glance.leaveIn', 'Leave in {m} min for', {'m': leave}))
              : kicker,
          style: TextStyle(color: sg.muted, fontWeight: FontWeight.w600),
        ),
        Text(bus.no, style: TextStyle(fontSize: 72, fontWeight: FontWeight.w800, height: 1.05, color: sg.ink)),
        Text(when, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: bus.ms < 60000 ? sg.ok : sg.brandInk)),
        const SizedBox(height: 4),
        Text(walk.isEmpty ? where : '$where · $walk', style: TextStyle(color: sg.muted, fontSize: 15)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final src = _chosen();
    final cards = <Widget>[];
    var only = false;
    if (_fetchedAt != 0) {
      for (final s in _stops) {
        final all = _rowsOf(s.code);
        final keep = _keepTo(src, s.code);
        if (keep != null) only = true;
        final rows = keep != null ? all.where((r) => keep.contains(r.no)).toList() : all;
        if (keep != null && rows.isEmpty) continue;
        cards.add(Padding(
          padding: const EdgeInsets.only(top: 10),
          child: SgCard(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              InkWell(
                onTap: () => _open(s.code),
                child: Row(children: [
                  Expanded(child: Text(Stops.nameOf(s.code).isEmpty ? s.code : Stops.nameOf(s.code), style: Theme.of(context).textTheme.titleMedium)),
                  if (s.metres != null) Text(tr('glance.minWalk', '{m} min walk', {'m': GlancePage.walkMins(s.metres!)}), style: TextStyle(color: sg.muted, fontSize: 13)),
                ]),
              ),
              const SizedBox(height: 4),
              if (rows.isEmpty) Text(tr('glance.noneDueHere', 'No buses due right now.'), style: TextStyle(color: sg.muted)),
              for (final r in rows.take(GlancePage.rowsMax))
                InkWell(
                  onTap: () => _open(s.code, r.no),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(children: [
                      SizedBox(width: 56, child: Text(r.no, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                      Expanded(
                        child: Text(r.to.isEmpty ? '' : tr('glance.to', 'to {to}', {'to': r.to}),
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sg.muted)),
                      ),
                      for (var i = 0; i < 3; i++)
                        SizedBox(
                          width: Eta.clockTimes ? 52 : 36,
                          // Smaller rather than broken in two, where a language's "Arr" is long.
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerRight,
                            child: Text(
                              i < r.times.length ? _timeCell(r.times[i]) : '',
                              textAlign: TextAlign.end,
                              maxLines: 1,
                              softWrap: false,
                              style: TextStyle(
                                fontWeight: i == 0 ? FontWeight.w800 : FontWeight.w500,
                                fontSize: i == 0 ? 17 : 15,
                                color: i < r.times.length && r.times[i] < 60000 ? sg.ok : (i == 0 ? sg.ink : sg.muted),
                              ),
                            ),
                          ),
                        ),
                    ]),
                  ),
                ),
              if (rows.length > GlancePage.rowsMax)
                TextButton(onPressed: () => _open(s.code), child: Text(tr('glance.more', '+{n} more', {'n': rows.length - GlancePage.rowsMax}))),
            ]),
          ),
        ));
      }
    }
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          _since = 0;
          await _refresh();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            const Greeting(),
            const SizedBox(height: 14),
            // The chip and its refresh, and what the times are on the same line if there's room for
            // it, or on the next: squeezed in beside them, it's a letter or two.
            LayoutBuilder(
              builder: (context, box) => Wrap(spacing: 6, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: box.maxWidth - 54),
                  child: TourTarget(id: 'glance.source', child: ActionChip(
                    avatar: Icon(src?.icon ?? Icons.my_location, size: 18),
                    label: Row(mainAxisSize: MainAxisSize.min, children: [
                      Flexible(child: Text(src?.name ?? tr('glance.source.near', 'Nearby'), maxLines: 1, overflow: TextOverflow.ellipsis)),
                      const Icon(Icons.arrow_drop_down, size: 18),
                    ]),
                    onPressed: _pickSource,
                  )),
                ),
                IconButton.filledTonal(
                  tooltip: tr('glance.refresh', 'Refresh'),
                  onPressed: _busy
                      ? null
                      : () async {
                          setState(() => _busy = true);
                          _since = 0;
                          try {
                            await _refresh();
                          } finally {
                            if (mounted) setState(() => _busy = false);
                          }
                        },
                  icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh),
                ),
                if (_fetchedAt != 0)
                  Text(Eta.clockTimes ? tr('glance.byClock', 'Clock times') : tr('glance.inMinutes', 'Times in minutes'), style: TextStyle(color: sg.muted, fontSize: 13)),
              ]),
            ),
            const SizedBox(height: 14),
            TourTarget(id: 'glance.hero', child: SgCard(padding: const EdgeInsets.all(18), child: _hero(src))),
            if (GlancePage.weather != null) Padding(padding: const EdgeInsets.only(top: 10), child: GlancePage.weather!(context)),
            if (cards.isNotEmpty) TourTarget(id: 'glance.stops', child: cards.first),
            ...cards.skip(1),
            if (_fetchedAt != 0 && cards.isEmpty && only)
              EmptyNote(tr('glance.noneOfYours', 'None of your favourite buses are due at these stops right now.')),
          ],
        ),
      ),
    );
  }
}
