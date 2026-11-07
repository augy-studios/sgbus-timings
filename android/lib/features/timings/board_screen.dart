// The departures board (the site's js/board.js): a stop's buses full screen, as an interchange's
// screens show them. Each bus, where it's going and its next three, how full in their colour; a
// page at a time, turning every 8 seconds when there are more than fit, refreshed every 20, the
// minutes counting down between. Full screen and kept on.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/nav.dart';
import '../../data/arrivals.dart';
import '../../data/stops.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';

class BoardScreen extends StatefulWidget {
  const BoardScreen({super.key, required this.code});
  final String code;

  static void open(String code) {
    if (!RegExp(r'^\d{5}$').hasMatch(code)) return;
    AppNav.push(BoardScreen(code: code), name: 'board');
  }

  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> {
  List<ServiceArrivals> _services = [];
  Map<ServiceArrivals, Way> _ways = {};
  int _fetched = 0;
  int _page = 0;
  bool _stale = false;
  final List<Timer> _timers = [];
  int _perPage = 6;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (Native.available) Native.call('SgBus', 'flag', {'on': true, 'torch': false}).catchError((_) => null);
    _timers
      ..add(Timer.periodic(const Duration(seconds: 20), (_) => _load()))
      ..add(Timer.periodic(const Duration(seconds: 8), (_) => _turn()))
      ..add(Timer.periodic(const Duration(seconds: 1), (_) => setState(() {})));
    _load();
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    if (Native.available) Native.call('SgBus', 'flag', {'on': false}).catchError((_) => null);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await Arrivals.fetch(widget.code);
      final w = Ways.of(d.services);
      if (!mounted) return;
      setState(() {
        _services = [...w.services]..sort((a, b) => (a.next?.etaMs ?? 1 << 40).compareTo(b.next?.etaMs ?? 1 << 40));
        _ways = w.ways;
        _fetched = When.nowMs();
        _stale = false;
      });
    } catch (_) {
      if (mounted) setState(() => _stale = true);
    }
  }

  void _turn() {
    final pages = (_services.length / _perPage).ceil();
    setState(() => _page = pages > 1 ? (_page + 1) % pages : 0);
  }

  String _when(Bus? bus) {
    if (bus?.etaMs == null) return '';
    if (Eta.clockTimes) return When.clock(_fetched + bus!.etaMs!);
    final mins = ((bus!.etaMs! - (When.nowMs() - _fetched)).clamp(0, 1 << 31) / 60000).floor();
    return mins == 0 ? 'Arr' : '$mins';
  }

  Color _loadColour(String? l) => switch ((l ?? '').toUpperCase()) {
        'SEA' => const Color(0xFF4ADE80),
        'SDA' => const Color(0xFFFBBF24),
        'LSD' => const Color(0xFFF87171),
        _ => Colors.white,
      };

  @override
  Widget build(BuildContext context) {
    final now = When.clock(When.nowMs());
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F0D),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: DefaultTextStyle(
            style: const TextStyle(color: Colors.white, fontSize: 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(Stops.nameOf(widget.code).isEmpty ? tr('favs.stopNoName', 'Bus stop') : Stops.nameOf(widget.code),
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700)),
                    Text(widget.code, style: const TextStyle(color: Colors.white70, fontSize: 18)),
                  ]),
                ),
                Text(now, style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w700, fontFeatures: [FontFeature.tabularFigures()])),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close),
                  label: Text(tr('bug.close', 'Close')),
                ),
              ]),
              const SizedBox(height: 16),
              Row(children: [
                const SizedBox(width: 90),
                const Expanded(child: SizedBox()),
                Text(Eta.clockTimes ? tr('board.clock', 'Clock times') : tr('board.minutes', 'Minutes'), style: const TextStyle(color: Colors.white60, fontSize: 16)),
              ]),
              const Divider(color: Colors.white24),
              Expanded(
                child: LayoutBuilder(builder: (context, box) {
                  // Room kept for the page number under the rows.
                  _perPage = ((box.maxHeight - 24) / 64).floor().clamp(3, 100);
                  final pages = (_services.length / _perPage).ceil().clamp(1, 1000);
                  if (_page >= pages) _page = 0;
                  final rows = _services.skip(_page * _perPage).take(_perPage).toList();
                  if (rows.isEmpty) {
                    return Center(child: Text(_fetched != 0 ? tr('board.none', 'No live buses right now.') : tr('board.getting', 'Getting the timings…')));
                  }
                  return Column(children: [
                    for (final s in rows)
                      SizedBox(
                        height: 64,
                        child: Row(children: [
                          SizedBox(width: 90, child: Text(s.serviceNo, style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800))),
                          Expanded(
                            child: Text(
                              _ways[s]?.round == true
                                  ? _ways[s]!.label
                                  : s.next?.dest != null
                                      ? (Stops.nameOf(s.next!.dest!).isEmpty ? s.next!.dest! : Stops.nameOf(s.next!.dest!))
                                      : '',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          for (final b in s.buses)
                            SizedBox(
                              width: Eta.clockTimes ? 96 : 72,
                              child: Text(_when(b), textAlign: TextAlign.end, style: TextStyle(color: _loadColour(b?.load), fontWeight: FontWeight.w700, fontSize: 28)),
                            ),
                        ]),
                      ),
                    const Spacer(),
                    if (pages > 1) Text('${_page + 1} / $pages', style: const TextStyle(color: Colors.white60, fontSize: 16)),
                  ]);
                }),
              ),
              if (_stale) Text(tr('board.stale', 'Couldn’t refresh just now: these are the last timings.'), style: const TextStyle(color: Colors.white70, fontSize: 16)),
            ]),
          ),
        ),
      ),
    );
  }
}
