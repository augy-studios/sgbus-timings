// Bus timings, the page (the site's main page): the greeting, the search box, and under it the
// stops around you, nearest first (help desk #13), once you've let it look. The search finds a
// stop by its code or name (LTA's shortened words matched in every form, a station's stops for
// "Bedok MRT"), a bus by its number, and the stops near a six-digit postal code. With the
// Android app's speech screen and camera, it takes a stop said aloud or read off its pole.
import 'package:material_ui/material_ui.dart';

import '../../data/campus.dart';
import 'campus_ui.dart';
import 'trains_screen.dart';
import '../../data/stations.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/location.dart';
import '../../data/network.dart';
import '../../data/search.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../desktop/adaptive.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../data/recents.dart';
import '../../widgets/common.dart';
import '../../widgets/recents_panel.dart';
import '../../widgets/stop_rows.dart';
import 'bus_screen.dart';
import 'greeting.dart';
import 'stop_screen.dart';
import '../tour/tour.dart';

class TimingsPage extends StatefulWidget {
  const TimingsPage({super.key});

  static final focusSearch = ValueNotifier<int>(0);
  /// A #near link: the stops near you, asking for your location.
  static final askNear = ValueNotifier<int>(0);

  @override
  State<TimingsPage> createState() => _TimingsPageState();
}

class _TimingsPageState extends State<TimingsPage> {
  final _q = TextEditingController();
  final _focus = FocusNode();
  List<StopRowItem>? _near;
  LocationError? _nearError;
  bool _nearBusy = false;
  int _nearAt = 0;
  int _nearSeq = 0;

  @override
  void initState() {
    super.initState();
    _q.addListener(() => setState(() {}));
    _focus.addListener(() => setState(() {}));
    TimingsPage.focusSearch.addListener(() => _focus.requestFocus());
    TimingsPage.askNear.addListener(() => _showNear(ask: true));
    Stops.load().then((_) {
      if (mounted) setState(() {});
      _showNear();
    });
    AppNav.register('near', (_) {
      AppNav.showPage('timings');
      _showNear(ask: true);
    });
  }

  @override
  void dispose() {
    _q.dispose();
    _focus.dispose();
    super.dispose();
  }

  // Looks for the stops near you: `ask` is a tap's, which may ask for your location; otherwise
  // only if it's allowed already, and only when what's kept is a minute old.
  Future<void> _showNear({bool ask = false}) async {
    if (!ask && (_nearBusy || (_near != null && DateTime.now().millisecondsSinceEpoch - _nearAt < 60000))) return;
    if (!ask && !(Locate.asked || await Locate.allowed())) return;
    final seq = ++_nearSeq;
    setState(() {
      _nearBusy = true;
      _nearError = null;
    });
    try {
      await Stops.load();
      final fix = await Locate.here(ask: ask, toDo: () => tr('location.toFindStops', 'to find stops near you'));
      if (seq != _nearSeq) return;
      _near = [for (final n in Stops.near(fix.lat, fix.lng)) StopRowItem(n.stop.code, distance: n.metres)];
      _nearAt = DateTime.now().millisecondsSinceEpoch;
    } on LocationError catch (e) {
      if (seq == _nearSeq) _nearError = e;
    } finally {
      if (seq == _nearSeq && mounted) setState(() => _nearBusy = false);
    }
  }

  void _openStop(String code, {String? service}) {
    _focus.unfocus();
    Recents.add(Recents.stop(code));
    StopScreen.open(code, service: service);
  }

  Future<void> _postal(String code) async {
    _focus.unfocus();
    Recents.add(Recents.postal(code));
    try {
      await Stops.load();
      final place = await Api.map('postal-code', query: {'code': code});
      final title = tr('search.stopsNear', 'Stops near {place} ({code})', {'place': place['address'], 'code': code});
      final stops = [
        for (final n in Stops.near((place['lat'] as num).toDouble(), (place['lng'] as num).toDouble())) StopRowItem(n.stop.code, distance: n.metres)
      ];
      if (!mounted) return;
      await showStopList(context, title, stops, onPick: _openStop);
    } on ApiError catch (e) {
      AppNav.say(e.status == 404
          ? tr('search.noPostal', 'No address has the postal code {code}.', {'code': code})
          : tr('search.postalFailed', "Couldn't look up that postal code. Please try again."));
    } catch (_) {
      AppNav.say(tr('search.postalFailed', "Couldn't look up that postal code. Please try again."));
    }
  }

  // Enter: the stop typed, or the first match; a postal code's stops; "84009 174" narrowed.
  void _submit(String text) {
    final v = text.trim();
    if (v.isEmpty) return;
    if (StopSearch.isPostal(v)) {
      _postal(v);
      return;
    }
    final code = RegExp(r'\b\d{5}\b').firstMatch(v)?[0];
    if (code != null && Stops.of(code) != null) {
      final rest = v.replaceFirst(code, '').trim();
      _openStop(code, service: rest.isEmpty ? null : rest);
      return;
    }
    final hits = StopSearch.match(v).stops;
    if (hits.isNotEmpty) {
      _openStop(hits.first.stop.code);
    } else if (BusNet.hasService(v.toUpperCase())) {
      BusScreen.open(v.toUpperCase());
    } else {
      AppNav.say(tr('search.noMatch', 'No bus stops matched that. Try a bus stop number or part of its name.'));
    }
  }

  Future<void> _listen() async {
    try {
      final r = await Native.call('SgBus', 'listen', {'prompt': tr('voice.prompt', 'Say a stop, its code, or a bus')});
      final text = r?['text'] as String?;
      if (text == null) return;
      _q.text = text;
      _focus.requestFocus();
    } on NativeError catch (e) {
      if (e.code != 'cancelled') AppNav.say(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final q = _q.text;
    final searching = _focus.hasFocus && q.trim().isNotEmpty;
    final match = searching ? StopSearch.match(q) : null;
    final services = searching ? BusNet.matchServices(q, 4) : const <String>[];
    final postal = searching && StopSearch.isPostal(q) ? q.trim() : null;
    // The shuttle buses' routes and the campus stops LTA hasn't got, fetched the first time.
    if (searching && !Campus.ready) Campus.load().then((_) => mounted ? setState(() {}) : null).catchError((_) => null);
    final campus = searching && Campus.ready ? Campus.search(q) : null;
    // A station search: its train times first (trains_screen.dart).
    final station = searching ? Stations.find(q.trim().toLowerCase()) : null;

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          const Greeting(),
          const SizedBox(height: 16),
          TourTarget(id: 'timings.search', child: TextField(
            controller: _q,
            focusNode: _focus,
            textInputAction: TextInputAction.search,
            onSubmitted: _submit,
            decoration: InputDecoration(
              hintText: tr('timings.search_by_name_or_code', 'Search by name or code (e.g. Bedok Interchange or 84009)'),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: Row(mainAxisSize: MainAxisSize.min, children: [
                if (q.isNotEmpty) IconButton(tooltip: tr('settings.clear', 'Clear'), icon: const Icon(Icons.close), onPressed: _q.clear),
                if (Native.has('listen')) TourTarget(id: 'timings.voice', child: IconButton(tooltip: tr('timings.search_by_voice', 'Search by voice'), icon: const Icon(Icons.mic_none), onPressed: _listen)),
                if (Native.has('scan'))
                  TourTarget(id: 'timings.scan', child: IconButton(tooltip: tr('timings.scan_a_stops_code', "Scan a stop's code"), icon: const Icon(Icons.photo_camera_outlined), onPressed: () => AppNav.open('scan'))),
              ]),
            ),
          )),
          if (searching) ...[
            const SizedBox(height: 8),
            // Part of the search box for a click: on a computer, a mouse button going down outside
            // the box takes its focus, which hid the list before the button came up, so a click
            // on a suggestion did nothing. Each suggestion lets go of the focus itself.
            TextFieldTapRegion(child: SgCard(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (station != null)
                  _Suggestion(
                    icon: Icons.train_outlined,
                    code: tr('trains.title', 'Train times'),
                    name: tr('trains.searchItem', 'Next trains at {station}', {'station': Stations.label(station)}),
                    onTap: () {
                      _focus.unfocus();
                      TrainsScreen.open(station);
                    },
                  ),
                if (match!.note.isNotEmpty) Padding(padding: const EdgeInsets.all(6), child: Text(match.note, style: TextStyle(color: sg.muted, fontSize: 13))),
                if (postal != null)
                  _Suggestion(icon: Icons.place_outlined, code: postal, name: tr('search.nearPostal', 'Bus stops near this postal code'), onTap: () => _postal(postal)),
                for (final no in services)
                  _Suggestion(
                    icon: Icons.directions_bus_outlined,
                    code: tr('favs.bus', 'Bus {no}', {'no': no}),
                    name: BusNet.endsText(no),
                    menu: DeskTarget.bus(no),
                    onTap: () {
                      _focus.unfocus();
                      Recents.add(Recents.bus(no));
                      BusScreen.open(no);
                    },
                  ),
                for (final r in campus?.routes ?? const <CampusRoute>[])
                  _Suggestion(
                    icon: Icons.airport_shuttle_outlined,
                    code: r.code,
                    // One that has ended is still found, and says so.
                    name: [
                      tr('campus.routeTitle', '{uni} shuttle {route}', {'uni': Campus.uniName(r.uni), 'route': r.code}),
                      if (Campus.ended(r)) tr('campus.discontinued', 'Discontinued'),
                    ].join(' · '),
                    onTap: () {
                      _focus.unfocus();
                      CampusRouteScreen.open(r.key);
                    },
                  ),
                for (final h in match.stops)
                  _Suggestion(
                    code: h.stop.code,
                    name: h.stop.name,
                    road: [
                      if (h.stop.road.isNotEmpty) h.stop.road,
                      if (h.distance != null) '${h.distance!.round()} m',
                      if (BusNet.crossBorder(h.stop.code) != null) BusNet.crossBorder(h.stop.code)!.label(),
                    ].join(' · '),
                    menu: DeskTarget.stop(h.stop.code),
                    onTap: () => _openStop(h.stop.code),
                  ),
                for (final c in campus?.stops ?? const <CampusStop>[])
                  _Suggestion(
                    code: Campus.uniName(c.uni),
                    name: c.name,
                    road: tr('campus.shuttleStop', 'Shuttle buses only'),
                    onTap: () {
                      _focus.unfocus();
                      CampusStopScreen.open(c.key);
                    },
                  ),
                if (match.stops.isEmpty && services.isEmpty && postal == null && station == null && (campus == null || (campus.routes.isEmpty && campus.stops.isEmpty)))
                  EmptyNote(tr('search.noMatch', 'No bus stops matched that. Try a bus stop number or part of its name.')),
              ]),
            )),
          ] else if (_focus.hasFocus) ...[
            const SizedBox(height: 8),
            // As the suggestions: a click on a recent search mustn't hide the panel first.
            TextFieldTapRegion(child: RecentsPanel(
              favs: true,
              accepts: (r) => r.kind == 'stop' || r.kind == 'bus' || r.kind == 'postal',
              onPick: (r) {
                if (r.kind == 'stop') {
                  _openStop(r.code!);
                } else if (r.kind == 'bus') {
                  _focus.unfocus();
                  BusScreen.open(r.code!);
                } else {
                  _postal(r.code!);
                }
              },
              onFavStop: _openStop,
              onFavBus: (no) {
                _focus.unfocus();
                BusScreen.open(no);
              },
            )),
          ] else ...[
            const SizedBox(height: 8),
            TourTarget(id: 'timings.near', child: SectionLabel(
              tr('timings.stops_near_me', 'Stops near me'),
              trailing: (_near != null || _nearError != null)
                  ? IconButton(
                      tooltip: tr('glance.refresh', 'Refresh'),
                      icon: _nearBusy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.my_location),
                      onPressed: () => _showNear(ask: true),
                    )
                  : null,
            )),
            SgCard(
              child: _nearBusy && _near == null
                  ? EmptyNote(tr('timings.finding_stops_near_you', 'Finding stops near you…'))
                  : _nearError != null
                      ? Column(children: [
                          Text(_nearError!.message, style: TextStyle(color: sg.muted)),
                          const SizedBox(height: 10),
                          FilledButton.icon(onPressed: () => _showNear(ask: true), icon: const Icon(Icons.my_location), label: Text(tr('common.tryAgain', 'Try again'))),
                        ])
                      : _near != null
                          ? StopRows(stops: _near!, onPick: _openStop)
                          : Column(children: [
                              Text(tr('timings.the_bus_stops_around_you', 'The bus stops around you, nearest first.'), style: TextStyle(color: sg.muted)),
                              const SizedBox(height: 10),
                              FilledButton.icon(
                                onPressed: () => _showNear(ask: true),
                                icon: const Icon(Icons.my_location),
                                label: Text(tr('timings.show_stops_near_me', 'Show stops near me')),
                              ),
                            ]),
            ),
          ],
        ],
      ),
    );
  }
}

/// One of the search's suggestions: a stop, a bus, a postal code or a shuttle, by its code and
/// name. A stop or a bus has the desktop's right-click menu ([menu]).
class _Suggestion extends StatelessWidget {
  const _Suggestion({required this.code, required this.name, this.road = '', this.icon, required this.onTap, this.menu});
  final String code;
  final String name;
  final String road;
  final IconData? icon;
  final VoidCallback onTap;
  final DeskTarget? menu;

  /// The row: its code (with an icon) on the left, its name and road beside it. The codes take at
  /// least 92 px, so the names line up; a longer one ("Train times") takes what it needs, on one
  /// line, with a gap before its name.
  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final row = InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 9),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 92),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 16, color: sg.brandInk), const SizedBox(width: 4)],
              Text(code, softWrap: false, style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w700)),
            ]),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: name),
              if (road.isNotEmpty) TextSpan(text: ' · $road', style: TextStyle(color: sg.muted)),
            ])),
          ),
        ]),
      ),
    );
    return menu == null ? row : DeskContextMenu(target: menu!, child: row);
  }
}

/// A list of stops in a sheet (a side panel on the desktop), to pick one from.
Future<void> showStopList(BuildContext context, String title, List<StopRowItem> stops,
    {required void Function(String code) onPick, bool pin = true, Map<String, List<String>>? direct, String note = ''}) {
  return AppSheet.show<void>(
    context: context,
    desktop: DeskSheet.panel,
    isScrollControlled: true,
    builder: (ctx) => AppSheet.draggable(
      expand: false,
      initialChildSize: 0.7,
      builder: (ctx, scroll) => ListView(controller: scroll, padding: EdgeInsets.fromLTRB(16, 0, 16, 24 + MediaQuery.paddingOf(ctx).bottom), children: [
        Text(title, style: Theme.of(ctx).textTheme.titleLarge),
        if (note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(note)),
        const SizedBox(height: 8),
        StopRows(stops: stops, pin: pin, direct: direct, onPick: (c) {
          Navigator.pop(ctx);
          onPick(c);
        }),
      ]),
    ),
  );
}

/// For other features: the store, read in a widget.
String? storeValue(String key) => Store.I.get(key);
