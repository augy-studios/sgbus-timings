// The first open's choice and the tours (the site's js/first-run.js and js/tour.js).
//
// First run: someone new (nothing of the app's kept, the WebView app's included) is asked once,
// Simple (Lite) (the essentials only), Normal (most of it) or Advanced Super App (everything on); put away
// without Start is Full. sgbus_first_run: "ask" until asked, "done" after.
//
// Tours: a few steps over a page, each a spotlight on the real thing with a line saying what it
// does; Next moves on, Skip ends it. Glance's is the welcome, the first time the app opens; every
// other page's the first time it's shown; Explorer's the first time it opens. Settings, Show me
// around, has each again. A step whose thing isn't on screen is left out. A thing is marked with
// TourTarget(id: 'glance.hero', child: ...). Seen: sgbus_tour ("done", Glance's) and sgbus_tours
// (the others' ids), as the site keeps them.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/edge_tray.dart';
import '../../app/nav.dart';
import '../../app/pages.dart';
import '../../data/rewards.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';

/// Marks a widget as what a tour's step lights up.
class TourTarget extends StatefulWidget {
  const TourTarget({super.key, required this.id, required this.child});
  final String id;
  final Widget child;

  static final Map<String, GlobalKey> _keys = {};
  static Rect? rectOf(String id) {
    final box = _keys[id]?.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.attached || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  @override
  State<TourTarget> createState() => _TourTargetState();
}

class _TourTargetState extends State<TourTarget> {
  final _key = GlobalKey();

  @override
  void initState() {
    super.initState();
    TourTarget._keys[widget.id] = _key;
  }

  @override
  void dispose() {
    if (TourTarget._keys[widget.id] == _key) TourTarget._keys.remove(widget.id);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => KeyedSubtree(key: _key, child: widget.child);
}

typedef TourStep = ({String target, String Function() text});

class Tours {
  Tours._();
  static const key = 'sgbus_tour';
  static const pagesKey = 'sgbus_tours';
  static const firstRunKey = 'sgbus_first_run';
  static bool _running = false;
  static bool get running => _running;

  static String _pageList() => Pages.tabs().map((p) => p.label()).join(', ');

  static final Map<String, List<TourStep>> steps = {
    'glance': [
      (target: 'glance.hero', text: () => tr('tour.glance.1', 'Your next bus, big enough to read on the move. Tap it for all its times.')),
      (target: 'glance.source', text: () => tr('tour.glance.2', 'Pick whose buses: your saved stops, the ones nearby, or the ones near Home or Work.')),
      (target: 'glance.weather', text: () => tr('tour.timings.5', 'Today’s weather and air, before you head out.')),
      (target: 'glance.stops', text: () => tr('tour.glance.3', 'Each bus on one line, with its next three times. Tap one for the full timings, and the star there saves the stop. Star a bus, and only your buses show here.')),
      (target: 'tray.pages', text: () => tr('tour.glance.4', 'Each page has its button at the top of the Edge Tray: {pages}. Press and hold a button to see what it does.', {'pages': _pageList()})),
      (target: 'tray.settings', text: () => tr('tour.glance.5', 'In Settings, Pages and Edge Tray has Custom home, the page the app opens on, and Help and extras has Show me around, for any page’s tour again.')),
    ],
    'timings': [
      (target: 'timings.search', text: () => tr('tour.timings.1', 'Look up any stop by its name or 5-digit code, the stops near an address by its postal code, or a bus by its number for its route.')),
      (target: 'timings.voice', text: () => tr('tour.timings.2', 'Or say it: a stop, a road or a bus number.')),
      (target: 'timings.scan', text: () => tr('tour.timings.3', 'Or scan the code on a bus stop’s pole with the camera.')),
      (target: 'timings.near', text: () => tr('tour.timings.4', 'The stops around you, nearest first. Tap one for its timings.')),
    ],
    'favs': [
      (target: 'favs.list', text: () => tr('tour.favs.1', 'Every stop you’ve starred. Tap one for its timings.')),
      (target: 'favs.buses', text: () => tr('tour.favs.2', 'Buses you’ve starred. Glance shows only these at your stops.')),
      (target: 'favs.navs', text: () => tr('tour.favs.3', 'Journeys you’ve saved in Navigate, ready to plan again in a tap.')),
      (target: 'favs.empty', text: () => tr('tour.favs.4', 'Nothing here yet. Tap the star on a stop, a bus or a journey in Navigate, and it shows here.')),
    ],
    'nav': [
      (target: 'nav.modes', text: () => tr('tour.nav.1', 'Bus and train plans with the MRT too; Bus only keeps to buses, stop to stop.')),
      (target: 'nav.fields', text: () => tr('tour.nav.2', 'Where from and where to: a place, an address, a stop, a postal code. Home, Work and your places are a tap away under each box.')),
      (target: 'nav.when', text: () => tr('tour.nav.3', 'Leave now, leave at a time, or arrive by one.')),
      (target: 'nav.save', text: () => tr('tour.nav.5', 'Save the journey to Favourites, and Share sends it to someone.')),
      (target: 'nav.ways', text: () => tr('tour.nav.4', 'Your ways, quickest first. Open one for every part of it, which train door to stand at, and Start trip to be told when to get off.')),
    ],
    'alerts': [
      (target: 'alerts.modes', text: () => tr('tour.alerts.1', 'Be told about MRT and LRT disruptions and road incidents, even with the app closed: every update, disruptions only, or off.')),
      (target: 'alerts.body', text: () => tr('tour.alerts.2', 'What’s going on right now, on the trains and the roads.')),
    ],
    'trips': [
      (target: 'trips.empty', text: () => tr('tour.trips.1', 'Each trip you take with Start trip shows here. Start one from a way in Navigate, or a bus’s route.')),
      (target: 'trips.since', text: () => tr('tour.trips.2', 'How many trips and rides you’ve taken, and how long on the move.')),
      (target: 'trips.stats', text: () => tr('tour.trips.3', 'How your time splits between walking, waiting and riding, and the buses and lines you ride most.')),
      (target: 'trips.list', text: () => tr('tour.trips.4', 'Each trip, by week. Tap one for its rides and times, to take it again or share it.')),
    ],
    'places': [
      (target: 'places.add', text: () => tr('tour.places.3', 'Add a place: the gym, school, a friend’s. Each one shows under From and To in Navigate, and on Glance.')),
      (target: 'places.list', text: () => tr('tour.places.1', 'Home, Work and your own places. Tap one for the way there from where you are.')),
      (target: 'places.more', text: () => tr('tour.places.2', 'The dots edit, share or delete it.')),
    ],
    'terminal': [
      (target: 'terminal.prompt', text: () => tr('tour.terminal.1', 'Type a command, as on the Linux command line: a stop like 84009, a stop’s name, nav home work, favs. Tab finishes a word, and Up brings back the last one.')),
      (target: 'terminal.screen', text: () => tr('tour.terminal.2app', 'The answers show here. ^C stops one that keeps updating, or clears the line; press and hold to select text and copy it.')),
      (target: 'terminal.close', text: () => tr('tour.terminal.3app', 'exit, Back or this closes it. Settings, Help and extras opens it again.')),
    ],
    'explorer': [
      (target: 'map.ground', text: () => tr('tour.explorer.1', 'Stops are white dots ringed in green, stations dots in their line’s colour, interchanges pills in all of theirs. Zoom in for the stops.')),
      (target: 'map.ground', text: () => tr('tour.explorer.2', 'Tap a dot for its card: a stop’s buses, green while running, red down to their last three, grey when not; a station’s doors to stand at on each platform. Every card has Directions.')),
      (target: 'map.compass', text: () => tr('tour.explorer.3', 'The compass turns the map with you, the way your phone points up.')),
      (target: 'map.layers', text: () => tr('tour.explorer.4', 'Layers picks what the map shows: bus stops, MRT and LRT stations and lines, and shuttle buses’ routes and stops. Tap one to turn it off or on.')),
      (target: 'map.close', text: () => tr('tour.explorer.5', 'Back closes Explorer. Its button in the Edge Tray can be turned off in Settings.')),
    ],
  };

  static bool seen(String id) =>
      id == 'glance' ? Store.I.get(key) == 'done' : [for (final v in Store.I.list(pagesKey)) '$v'].contains(id);

  static void _markSeen(String id) {
    if (id == 'glance') {
      Store.I.put(key, 'done');
    } else {
      Store.I.putJson(pagesKey, {...[for (final v in Store.I.list(pagesKey)) '$v'], id}.toList());
    }
  }

  /// A page's, or a view's, the first time.
  static void first(String id) {
    if (seen(id) || _running || !steps.containsKey(id)) return;
    Timer(const Duration(milliseconds: 600), () => start(id));
  }

  static Future<void> start(String id) async {
    final context = AppNav.context;
    final list = steps[id];
    if (context == null || list == null || _running) return;
    if (Pages.ids.contains(id) && AppNav.page.value != id) {
      AppNav.showPage(id);
      await Future<void>.delayed(const Duration(milliseconds: 400));
    }
    final shown = [for (final s in list) if (TourTarget.rectOf(s.target) != null) s];
    _markSeen(id);
    if (shown.isEmpty || !context.mounted) return;
    _running = true;
    await Navigator.of(context, rootNavigator: true).push(PageRouteBuilder<void>(
      opaque: false,
      pageBuilder: (_, _, _) => _TourOverlay(steps: shown),
      transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
    ));
    _running = false;
  }

  /// As the app opens, before anything's kept: whether this is someone new. Someone who's used
  /// the app before, here or in the WebView app (its data migrated), is never asked.
  static void decide() {
    if (Store.I.get(firstRunKey) != null) return;
    Store.I.put(firstRunKey, Store.I.keys.any((k) => k.startsWith('sgbus') && k != firstRunKey) ? 'done' : 'ask');
  }

  /// Once the first screen's up: first run's choice for someone new, then the welcome.
  static void begin({bool opened = false}) {
    if (opened) return; // a link opened something: that came first
    Timer(const Duration(milliseconds: 900), () async {
      if (Store.I.get(firstRunKey) == 'ask') await _askFirstRun();
      first('glance');
    });
    AppNav.page.addListener(() => first(AppNav.page.value));
  }

  static Future<void> _askFirstRun() async {
    final context = AppNav.context;
    if (context == null) return;
    final pick = await showDialog<String>(context: context, builder: (_) => const _FirstRun());
    if (pick == 'minimal') {
      for (final id in Pages.canHide) {
        Pages.setOn(id, false);
      }
      for (final e in EdgeTray.extras) {
        EdgeTray.setExtra(e.id, false);
      }
      Coins.pops = false;
    } else if (pick == 'standard') {
      for (final id in const ['coins', 'coffee', 'receive', 'telegram', 'card']) {
        EdgeTray.setExtra(id, false);
      }
      Coins.pops = false;
    }
    Store.I.put(firstRunKey, 'done');
  }
}

/// For screenshots: the first open's choice.
Widget firstRunPreview() => const _FirstRun();

class _FirstRun extends StatefulWidget {
  const _FirstRun();

  @override
  State<_FirstRun> createState() => _FirstRunState();
}

class _FirstRunState extends State<_FirstRun> {
  String _pick = 'standard';

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    Widget option(String id, String name, String what) => RadioListTile<String>(
          value: id,
          contentPadding: EdgeInsets.zero,
          title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(what),
        );
    return AlertDialog(
      title: Text(tr('html.welcome_to_sg_bus_timings', 'Welcome to SG Bus Timings')),
      content: SingleChildScrollView(
        child: RadioGroup<String>(
          groupValue: _pick,
          onChanged: (v) => setState(() => _pick = v ?? _pick),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tr('html.start_with_how_much', 'Start with everything, most of it, or just the essentials?')),
            option('minimal', tr('html.minimal', 'Simple (Lite)'), tr('html.just_bus_timings_favourites_navigate', 'Just Bus timings, Favourites, Navigate and Places. The rest is switched off.')),
            option('standard', tr('html.standard', 'Normal'),
                tr('html.standard_what', 'Everything but a few extras: no uwuCoins, Buy Augy a Coffee, Receive nearby, Telegram bot or Card value buttons in the Edge Tray.')),
            option('full', tr('html.full_2', 'Advanced Super App'), tr('html.everything_on_glance_service_alerts', 'Everything on: Glance, Service alerts, Your trips and every Edge Tray button too.')),
            Text(tr('html.you_can_change_this_any', 'You can change this any time in Settings, Edge Tray buttons.'), style: TextStyle(color: sg.muted, fontSize: 13)),
          ]),
        ),
      ),
      actions: [FilledButton(onPressed: () => Navigator.pop(context, _pick), child: Text(tr('planner.start', 'Start')))],
    );
  }
}

class _TourOverlay extends StatefulWidget {
  const _TourOverlay({required this.steps});
  final List<TourStep> steps;

  @override
  State<_TourOverlay> createState() => _TourOverlayState();
}

class _TourOverlayState extends State<_TourOverlay> {
  int _i = 0;

  @override
  Widget build(BuildContext context) {
    final s = widget.steps[_i];
    final size = MediaQuery.sizeOf(context);
    final rect = (TourTarget.rectOf(s.target) ?? Rect.fromCenter(center: size.center(Offset.zero), width: 0, height: 0)).inflate(8);
    final last = _i == widget.steps.length - 1;
    final below = rect.center.dy < size.height / 2;
    final sg = context.sg;
    return Material(
      type: MaterialType.transparency,
      child: Stack(children: [
        Positioned.fill(child: CustomPaint(painter: _Spot(rect))),
        Positioned(
          left: 16,
          right: 16,
          top: below ? (rect.bottom + 16).clamp(0, size.height - 220) : null,
          bottom: below ? null : (size.height - rect.top + 16).clamp(0, size.height - 220),
          child: Semantics(
            liveRegion: true,
            child: Material(
              color: sg.surfaceStrong,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 8, 8),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(s.text(), style: const TextStyle(fontSize: 16)),
                  Row(children: [
                    Text('${_i + 1} / ${widget.steps.length}', style: TextStyle(color: sg.muted)),
                    const Spacer(),
                    if (!last) TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('tour.skip', 'Skip'))),
                    FilledButton(
                      onPressed: () => last ? Navigator.pop(context) : setState(() => _i++),
                      child: Text(last ? tr('common.done', 'Done') : tr('trip.next', 'Next')),
                    ),
                  ]),
                ]),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

class _Spot extends CustomPainter {
  _Spot(this.hole);
  final Rect hole;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRRect(RRect.fromRectAndRadius(hole, const Radius.circular(14)));
    canvas.drawPath(path, Paint()..color = Colors.black.withValues(alpha: 0.6));
    canvas.drawRRect(RRect.fromRectAndRadius(hole, const Radius.circular(14)), Paint()
      ..color = const Color(0xFFF2B31B)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3);
  }

  @override
  bool shouldRepaint(_Spot old) => old.hole != hole;
}

/// Settings, Show me around: each page's tour again.
List<Widget> tourButtons(BuildContext context) => [
      for (final p in Pages.all)
        if (Pages.shows(p.id) && Tours.steps.containsKey(p.id))
          ListTile(contentPadding: EdgeInsets.zero, leading: Icon(p.icon), title: Text(p.label()), onTap: () {
            Navigator.of(context).popUntil((r) => r.isFirst);
            Tours.start(p.id);
          }),
      ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.terminal), title: Text(tr('tour.terminal', 'sgbus terminal')), onTap: () {
        Navigator.of(context).popUntil((r) => r.isFirst);
        Store.I.putJson(Tours.pagesKey, [for (final v in Store.I.list(Tours.pagesKey)) if (v != 'terminal') v]);
        AppNav.open('terminal');
      }),
      ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.explore_outlined), title: Text(tr('tour.explorer', 'Explorer')), onTap: () {
        Navigator.of(context).popUntil((r) => r.isFirst);
        Store.I.putJson(Tours.pagesKey, [for (final v in Store.I.list(Tours.pagesKey)) if (v != 'explorer') v]);
        AppNav.open('explorer');
      }),
    ];
