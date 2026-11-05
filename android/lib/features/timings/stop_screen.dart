// A stop's live timings (the site's result card, script.js's loadStop and renderArrivals): its
// code, name and road with Save; the Incoming buses bar, soonest first; then each bus with its
// next three, each in its load's colour (seats, standing, limited standing), italic when LTA
// has no live GPS for it, with its deck, wheelchair access and how far it has to come, and
// today's first and last bus. A bus at a stop it calls at both ways, or twice round a loop, is
// two entries, each with where it's heading in a tone of its own.
//
// Narrowed to some buses (a link's "84009,174" or Pick a bus), Show all services widens it and
// Only ... narrows it back; Route from here opens the bus's onward stops. Each bus has its
// Route, a star for that bus at this stop (Favourites), Flag (full screen, to flag it down)
// and its own refresh.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/links.dart';
import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/favs.dart';
import '../../data/geo.dart';
import '../../data/network.dart';
import '../../data/stops.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/share.dart';

/// Where a stop was opened from, for its Back and the stops-left note.
class StopContext {
  const StopContext(this.kind, {this.service, this.dir, this.label});
  final String kind; // route, journey, service, nearby, nav
  final String? service;
  final int? dir;
  final String? label;

  String back() => switch (kind) {
        'route' => tr('stop.back.route', 'Back to route'),
        'journey' => tr('stop.back.journey', 'Back to journey'),
        'service' => tr('stop.back.service', 'Back to bus {no}', {'no': service}),
        'nearby' => tr('stop.back.nearby', 'Back to nearby stops'),
        'nav' => tr('stop.back.nav', 'Back to Navigate'),
        _ => tr('stop.back', 'Back'),
      };
}

class StopScreen extends StatefulWidget {
  const StopScreen({super.key, required this.code, this.service, this.ctx, this.dir});
  final String code;
  final String? service;
  final StopContext? ctx;
  final int? dir;

  static void open(String code, {String? service, StopContext? ctx, int? dir}) =>
      AppNav.push(StopScreen(code: code, service: BusFilter.parse(service), ctx: ctx, dir: dir), name: 'stop');

  @override
  State<StopScreen> createState() => _StopScreenState();
}

class _StopScreenState extends State<StopScreen> {
  Arrivals? _data;
  String? _error;
  bool _loading = true;
  late String? _service = widget.service;
  bool _expanded = false;
  final Set<String> _refreshing = {};
  int _seq = 0;

  String get code => widget.code;

  @override
  void initState() {
    super.initState();
    Favs.I.addListener(_redraw);
    if (!BusNet.ready) BusNet.load().then((_) => _redraw()).catchError((_) {});
    _load();
  }

  @override
  void dispose() {
    Favs.I.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() {
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    final seq = ++_seq;
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final d = await Arrivals.fetch(code);
      if (seq != _seq || !mounted) return;
      setState(() {
        _data = d;
        _loading = false;
      });
    } catch (_) {
      if (seq != _seq || !mounted) return;
      setState(() {
        _error = tr('stop.failed', 'Could not load arrivals. Please try again.');
        _loading = false;
      });
    }
  }

  // One bus's times fetched again, put in place of the ones it had.
  Future<void> _refreshService(String no) async {
    if (_refreshing.contains(no) || _data == null) return;
    setState(() => _refreshing.add(no));
    try {
      final fresh = (await Arrivals.fetch(code, no)).services.where((s) => s.serviceNo.toUpperCase() == no.toUpperCase()).toList();
      final services = _data!.services;
      final at = services.indexWhere((s) => s.serviceNo.toUpperCase() == no.toUpperCase());
      final rest = services.where((s) => s.serviceNo.toUpperCase() != no.toUpperCase()).toList();
      rest.insertAll(at == -1 ? rest.length : at, fresh);
      if (mounted) setState(() => _data = Arrivals(code, rest, _data!.at));
    } catch (_) {
      // The times it had stay.
    } finally {
      if (mounted) setState(() => _refreshing.remove(no));
    }
  }

  // A stop with the same name as another this close is the same place under two codes.
  List<String> _samePlace() {
    final here = Stops.of(code);
    if (here == null || here.name.isEmpty || here.lat == null) return const [];
    final name = here.name.toLowerCase();
    return [
      for (final s in Stops.all)
        if (s.code != code && s.name.toLowerCase() == name && s.lat != null && metresBetween(here.lat!, here.lng!, s.lat!, s.lng!) <= 250) s.code
    ];
  }

  Future<void> _pickBus() async {
    final live = _data?.services.map((s) => s.serviceNo).toSet() ?? <String>{};
    final all = {...live, ...BusNet.servicesAtStop(code)}.toList()..sort(byNumber);
    final pick = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tr('stop.tool.pick', 'Pick a bus'), style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (all.isEmpty) EmptyNote(tr('stop.noLive', 'No live buses right now.')),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final no in all)
                Pill(label: no, on: _service == no, onTap: () => Navigator.pop(ctx, no)),
            ]),
          ]),
        ),
      ),
    );
    if (pick != null) {
      setState(() {
        _service = pick;
        _expanded = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final stop = Stops.of(code);
    final name = stop?.name.isNotEmpty == true ? stop!.name : tr('favs.stopNoName', 'Bus stop');
    final saved = Favs.I.isStop(code);
    final here = Favs.I.busesAt(code);
    final favBuses = {...Favs.I.buses(), ...here};
    final ways = Ways.of(_data?.services ?? const []);
    var svcs = [...ways.services]..sort((a, b) => byNumber(a.serviceNo, b.serviceNo));
    final narrowed = _service != null && !_expanded;
    if (narrowed) svcs = svcs.where((s) => BusFilter.has(_service!, s.serviceNo)).toList();
    svcs = Favs.pinned(svcs, favBuses, Favs.I.pin('bus'), (s) => s.serviceNo);

    final restricted = BusNet.restricted(code);
    final border = BusNet.crossBorder(code);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.ctx?.back() ?? name, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: tr('stop.refresh', 'Refresh'),
            onPressed: _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: tr('nav.share', 'Share'),
            onPressed: () => shareLink(context, Links.stop(code) + (narrowed ? ',$_service' : ''), name),
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          children: [
            // ---- the stop ----
            SgCard(
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(code, style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: 1)),
                    const SizedBox(height: 2),
                    Text(name, style: Theme.of(context).textTheme.headlineSmall),
                    if ((stop?.road ?? '').isNotEmpty) Text(stop!.road, style: TextStyle(color: sg.muted)),
                  ]),
                ),
                FilledButton.tonalIcon(
                  onPressed: () => Favs.I.toggleStop(code),
                  icon: Icon(saved ? Icons.star_rounded : Icons.star_outline_rounded),
                  label: Text(saved ? tr('stop.saved', 'Saved') : tr('stop.save', 'Save')),
                ),
              ]),
            ),
            const SizedBox(height: 10),
            // ---- its tools ----
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (_service != null)
                _expanded
                    ? Pill(icon: Icons.directions_bus_outlined, label: tr('stop.tool.collapse', 'Only {buses}', {'buses': BusFilter.text(_service!)}), onTap: () => setState(() => _expanded = false))
                    : Pill(label: tr('stop.tool.expand', 'Show all services'), onTap: () => setState(() => _expanded = true)),
              if (narrowed && BusFilter.one(_service) != null)
                Pill(
                  icon: Icons.route_outlined,
                  label: tr('stop.tool.onward', 'Route from here'),
                  onTap: () => AppNav.open('bus', {'no': _service, 'fromStop': code, 'onward': true, 'dir': widget.dir}),
                ),
              Pill(icon: Icons.directions_bus_outlined, label: tr('stop.tool.pick', 'Pick a bus'), onTap: _pickBus),
              if (stop?.lat != null)
                Pill(icon: Icons.directions_walk, label: tr('stop.tool.directions', 'Directions'), onTap: () => AppNav.open('walkTo', {'code': code})),
              Pill(icon: Icons.schedule, label: tr('stop.tool.board', 'Board'), onTap: () => AppNav.open('board', {'code': code})),
              if (Native.has('sticker'))
                Pill(icon: Icons.nfc, label: 'NFC sticker', onTap: () => AppNav.open('sticker', {'url': Links.stop(code), 'label': name})),
            ]),
            // ---- notes about the stop ----
            if (restricted != null)
              _Aside(
                bold: tr('stop.restricted', 'Authorised personnel only.'),
                text: restricted.through
                    ? tr('stop.restrictedAt', "This stop is at {place}: the public can't get on or off here, but can ride past.", {'place': restricted.place()})
                    : tr('stop.restrictedIn', "This stop is inside {place}: the public can't get on or off here, or ride through.", {'place': restricted.place()}),
              ),
            if (border != null) _Aside(bold: '${border.label()}.', text: border.note()),
            for (final note in AppNotes.forStop(code)) _Aside(bold: note.$1, text: note.$2),
            for (final other in _samePlace())
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Pill(
                    icon: Icons.directions_bus_outlined,
                    tooltip: tr('stop.samePlace.title', 'Some buses here only stop at the other code'),
                    label: tr('stop.samePlace', 'Also {stop} ({code})', {'stop': Stops.nameOf(other).isEmpty ? other : Stops.nameOf(other), 'code': other}),
                    onTap: () => StopScreen.open(other),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            // ---- the buses ----
            if (_loading) Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(tr('stop.loading', 'Loading live arrivals…')))),
            if (_error != null) EmptyNote(_error!, icon: Icons.cloud_off),
            if (!_loading && _error == null && svcs.isEmpty)
              EmptyNote(narrowed
                  ? tr('stop.noLiveFor', 'No live arrivals for {buses} right now.', {'buses': BusFilter.text(_service!)}) +
                      (BusFilter.one(_service) != null && firstLastText(_service!, code).isNotEmpty ? ' ${firstLastText(_service!, code)}.' : '')
                  : tr('stop.noLive', 'No live buses right now.')),
            if (svcs.isNotEmpty) _IncomingBar(svcs: svcs, ways: ways.ways),
            for (final s in svcs)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: ServiceCard(
                  code: code,
                  s: s,
                  way: ways.ways[s],
                  fav: favBuses.contains(s.serviceNo),
                  starredHere: here.contains(s.serviceNo),
                  refreshing: _refreshing.contains(s.serviceNo),
                  onRefresh: () => _refreshService(s.serviceNo),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Notes about a stop from elsewhere (the newsfeed's buses skipping it): (bold, text) pairs,
/// filled in by Service alerts once its notices are in.
class AppNotes {
  AppNotes._();
  static List<(String, String)> Function(String code) forStop = (_) => const [];
}

class _Aside extends StatelessWidget {
  const _Aside({required this.bold, required this.text});
  final String bold;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.warning_amber_rounded, size: 20, color: context.sg.warn),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: '$bold ', style: const TextStyle(fontWeight: FontWeight.w700)),
              TextSpan(text: text),
            ])),
          ),
        ]),
      );
}

// The Incoming buses bar: every bus's next one, soonest first.
class _IncomingBar extends StatelessWidget {
  const _IncomingBar({required this.svcs, required this.ways});
  final List<ServiceArrivals> svcs;
  final Map<ServiceArrivals, Way> ways;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final items = [for (final s in svcs) if (s.next?.etaMs != null) s]..sort((a, b) => a.next!.etaMs!.compareTo(b.next!.etaMs!));
    if (items.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 84,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final s = items[i];
          final way = ways[s];
          final ms = s.next!.etaMs!;
          final secs = (ms / 1000).round();
          final label = Eta.clockTimes ? Eta.clock(ms) : (secs >= 60 ? '${secs ~/ 60} min' : '${secs}s');
          final tone = way == null ? null : sg.tones[way.tone];
          return Semantics(
            label: '${s.serviceNo}, $label${Eta.loadWords(s.next!.load).isEmpty ? '' : ', ${Eta.loadWords(s.next!.load)}'}',
            child: Container(
              width: 84,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              decoration: BoxDecoration(
                color: context.materialYou ? Theme.of(context).colorScheme.surfaceContainerHigh : sg.surfaceStrong,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: tone ?? sg.border, width: tone == null ? 1 : 2),
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(label, style: TextStyle(color: sg.load(s.next!.load), fontWeight: FontWeight.w700)),
                Text(s.serviceNo, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                if (way != null) Text(way.short, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: tone)),
              ]),
            ),
          );
        },
      ),
    );
  }
}

class ServiceCard extends StatelessWidget {
  const ServiceCard({
    super.key,
    required this.code,
    required this.s,
    required this.way,
    required this.fav,
    required this.starredHere,
    required this.refreshing,
    required this.onRefresh,
  });
  final String code;
  final ServiceArrivals s;
  final Way? way;
  final bool fav;
  final bool starredHere;
  final bool refreshing;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final no = s.serviceNo;
    final tone = way == null ? null : sg.tones[way!.tone];
    final fl = firstLastText(no, code, way?.dir);
    final stop = Stops.of(code);

    Widget piece(Bus? bus) {
      if (bus == null || bus.etaMs == null) {
        return const Expanded(child: Text('-', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)));
      }
      final have = bus.lat != null && bus.lng != null && stop?.lat != null;
      final along = have && BusNet.ready ? BusNet.busDistance(no, code, lat: bus.lat, lng: bus.lng, dest: bus.dest, visit: bus.visit, etaMs: bus.etaMs) : null;
      final dist = have ? (along ?? metresBetween(bus.lat!, bus.lng!, stop!.lat!, stop.lng!).round()) : null;
      final late = MakeItHook.tooSoon(code, bus.etaMs!);
      final words = [Eta.loadWords(bus.load), if (bus.rough) tr('stop.estimated', 'estimated'), if (late) tr('stop.tooSoon', 'leaves before you could get there')]
          .where((w) => w.isNotEmpty)
          .join(', ');
      return Expanded(
        child: Opacity(
          opacity: late ? 0.45 : 1,
          child: Semantics(
            label: '${Eta.text(bus.etaMs)}${words.isEmpty ? '' : ', $words'}',
            excludeSemantics: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(Eta.text(bus.etaMs),
                  style: TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w700, color: sg.load(bus.load), fontStyle: bus.rough ? FontStyle.italic : FontStyle.normal)),
              const SizedBox(height: 4),
              Wrap(spacing: 4, runSpacing: 4, children: [
                if (bus.wheelchair) _Badge(icon: Icons.accessible, text: tr('stop.wheelchair', 'Wheelchair')),
                if (bus.deck.isNotEmpty) _Badge(text: bus.deck),
                _Badge(
                  text: dist != null ? '~ ${dist}m' : tr('stop.dist.noGps', 'no GPS'),
                  tooltip: dist == null
                      ? tr('stop.dist.unknown', 'distance not known')
                      : along != null
                          ? tr('stop.dist.along', 'Along its route')
                          : tr('stop.dist.straight', 'In a straight line'),
                ),
              ]),
            ]),
          ),
        ),
      );
    }

    return SgCard(
      border: tone,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          BusBadge(no, fav: fav, size: 24),
          if (way != null) ...[
            const SizedBox(width: 8),
            Flexible(
              child: Tooltip(
                message: tr('stop.svc.way.title', 'Bus {no}: {way}', {'no': no, 'way': way!.label}),
                child: Text(way!.short, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: tone, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
          if (s.operator != null) ...[const SizedBox(width: 8), Text(s.operator!, style: TextStyle(color: sg.muted, fontSize: 12))],
          const Spacer(),
          IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: tr('stop.svc.route.title', 'Bus {no}’s route and stops', {'no': no}),
            icon: const Icon(Icons.route_outlined),
            onPressed: () => AppNav.open('bus', {'no': no, 'fromStop': code, 'dir': way?.dir}),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            isSelected: starredHere,
            tooltip: starredHere
                ? tr('stop.svc.starOn.title', 'Bus {no} at this stop is in Favourites. Tap to take it out', {'no': no})
                : tr('stop.svc.starOff.title', 'Save bus {no} at this stop to Favourites', {'no': no}),
            icon: Icon(starredHere ? Icons.star_rounded : Icons.star_outline_rounded, color: starredHere ? sg.warn : null),
            onPressed: () => Favs.I.toggleStopBus(code, no),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: tr('stop.svc.flag.title', 'Show {no} full screen, to flag the bus down', {'no': no}),
            icon: const Icon(Icons.front_hand_outlined),
            onPressed: () => AppNav.open('flag', {'no': no}),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: tr('stop.svc.refresh.title', 'Refresh bus {no}’s times', {'no': no}),
            icon: refreshing ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.sync),
            onPressed: onRefresh,
          ),
        ]),
        const SizedBox(height: 6),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final b in s.buses) piece(b)]),
        if (fl.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: Text(fl, style: TextStyle(color: sg.muted, fontSize: 13))),
            ?LastBusBell.build?.call(context, no, code),
          ]),
        ],
      ]),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, this.icon, this.tooltip});
  final String text;
  final IconData? icon;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final b = Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: context.materialYou ? Theme.of(context).colorScheme.surfaceContainerHighest : sg.surfaceStrong,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) Icon(icon, size: 12, color: sg.muted),
        Text(text, style: TextStyle(fontSize: 11, color: sg.muted)),
      ]),
    );
    return tooltip == null ? b : Tooltip(message: tooltip!, child: b);
  }
}

/// Will I make it? (features/timings/make_it.dart) greys a bus gone before you could walk there.
class MakeItHook {
  MakeItHook._();
  static bool Function(String code, int etaMs) tooSoon = (_, _) => false;
}

/// The Android app's last bus reminder bell beside the first and last bus (features/reminders/).
class LastBusBell {
  LastBusBell._();
  static Widget? Function(BuildContext context, String no, String code)? build;
}

/// Ticks a widget every [period] while it's on screen.
mixin Ticker<T extends StatefulWidget> on State<T> {
  Timer? _tick;
  void startTicking(Duration period) => _tick = Timer.periodic(period, (_) {
        if (mounted) setState(() {});
      });
  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }
}
