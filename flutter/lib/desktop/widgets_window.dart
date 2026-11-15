// The desktop's Bus timings widgets (desktop-features-spec §8): each a small frameless window of
// its own on the desktop, showing the next buses at a stop you pick, resizable any way, kept on
// top if you like (the Electron app's widgets.js and the site's widget.html, the same widget as
// the Android one). A Windows app outside the Microsoft Store can't add to Windows 11's Widgets
// board, so they live on the desktop instead.
//
// Added from the tray's menu. Each one's stop, buses, size and place are kept in settings.json
// (the Electron app's `widgets`, so its widgets come back) and it's opened again where it was
// when the app starts. Closing one with its × removes it; quitting the app keeps them all.
//
// Each window runs its own engine (desktop_multi_window), and asks the main window, over the
// 'sgbus/main' channel, for anything kept: the main window alone writes settings.json. So this
// file has two halves: [DeskWidgets], in the main window, and [runBusWidget] and the screen it
// draws, in each widget's own window.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../api/api.dart';
import '../data/favs.dart';
import '../data/stops.dart';
import '../data/store.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'desktop.dart';
import 'settings.dart';

/// The channel the other windows use to ask the main window things (desktop_main.dart answers).
const mainChannel = WindowMethodChannel('sgbus/main', mode: ChannelMode.unidirectional);

/// The main window's side: the kept list of widgets, opening their windows, and answering them.
class DeskWidgets {
  DeskWidgets._();

  /// The widget windows open now, by widget id.
  static final Map<String, WindowController> _open = {};
  static StreamSubscription<void>? _watch;

  /// Every widget kept in settings.json: {id, code, name, buses, onTop, bounds}.
  static List<Map<String, dynamic>> list() => [for (final w in (DeskSettings.get<List>('widgets') ?? const [])) if (w is Map) Map<String, dynamic>.from(w)];

  /// One kept widget, or null if there's none with that id.
  static Map<String, dynamic>? get(String id) => list().where((w) => w['id'] == id).firstOrNull;

  /// Writes [changes] over one kept widget's settings.
  static void update(String id, Map<String, dynamic> changes) {
    final all = list();
    final i = all.indexWhere((w) => w['id'] == id);
    if (i == -1) return;
    all[i] = {...all[i], ...changes};
    DeskSettings.write({'widgets': all});
  }

  /// Forgets a widget.
  static void remove(String id) => DeskSettings.write({'widgets': list().where((w) => w['id'] != id).toList()});

  /// A new widget's id: a random UUID (version 4), as the Electron app's crypto.randomUUID made.
  static String _newId() {
    final r = math.Random.secure();
    String hex(int n) => List.generate(n, (_) => r.nextInt(16).toRadixString(16)).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + r.nextInt(4)).toRadixString(16)}${hex(3)}-${hex(12)}';
  }

  /// A new widget, kept, and opened. From the tray it opens in its setup; given a stop [code]
  /// (for "Pin to Desktop Widget" on a stop's right-click menu, desktop-features-spec §8) it
  /// opens straight on that stop's timings, narrowed to [buses] if any are given.
  static Future<void> add({String? code, String name = '', List<String> buses = const []}) async {
    final stop = code != null && RegExp(r'^\d{5}$').hasMatch(code) ? code : null;
    final w = {
      'id': _newId(),
      'code': stop,
      'buses': stop == null ? <String>[] : [for (final b in buses) if (RegExp(r'^[0-9A-Z]{1,4}$').hasMatch(b.toUpperCase())) b.toUpperCase()].take(20).toList(),
      'name': stop == null ? '' : (name.length > 80 ? name.substring(0, 80) : name),
      'onTop': false,
    };
    DeskSettings.write({'widgets': [...list(), w]});
    await _openWidget(w);
  }

  /// At start: every widget kept, where it was.
  static Future<void> restore() async {
    for (final w in list()) {
      if (!_open.containsKey(w['id'])) await _openWidget(w);
    }
  }

  /// Opens a widget's window, its own engine, which starts in [runBusWidget] with the widget's id.
  /// Windows closed any way (the × or the system) drop out of [_open] as they go.
  static Future<void> _openWidget(Map<String, dynamic> w) async {
    final c = await WindowController.create(WindowConfiguration(hiddenAtLaunch: true, arguments: jsonEncode({'kind': 'widget', 'id': w['id']})));
    _open['${w['id']}'] = c;
    _watch ??= onWindowsChanged.listen((_) async {
      final alive = {for (final x in await WindowController.getAll()) x.windowId};
      _open.removeWhere((_, c) => !alive.contains(c.windowId));
    });
  }

  /// The main window's side of what a widget asks (desktop_main.dart's channel handler): its
  /// settings, saving its stop, its pin, its place, closing, and the app's settings it follows.
  /// What's sent is checked here, as the Electron app checked it, since it's kept.
  static Future<Object?> handle(String method, Map<String, Object?> a) async {
    final id = '${a['id']}';
    switch (method) {
      case 'widget-get':
        return get(id);
      case 'widget-save':
        final code = '${a['code']}';
        if (!RegExp(r'^\d{5}$').hasMatch(code)) return false;
        final buses = [for (final b in (a['buses'] as List? ?? const [])) if (RegExp(r'^[0-9A-Z]{1,4}$').hasMatch('$b')) '$b'].take(20).toList();
        final name = '${a['name'] ?? ''}';
        update(id, {'code': code, 'name': name.length > 80 ? name.substring(0, 80) : name, 'buses': buses});
        return true;
      case 'widget-on-top':
        update(id, {'onTop': a['on'] == true});
        return a['on'] == true;
      case 'widget-bounds':
        if (a['bounds'] is Map) update(id, {'bounds': a['bounds']});
        return true;
      case 'widget-close':
        remove(id);
        _open.remove(id);
        return true;
      case 'widget-prefs':
        return {
          'clock': Store.I.get('sgbus_times') == 'clock',
          'dark': _dark(),
          'lang': I18n.I.lang,
          'favs': [for (final f in Favs.I.stops()) {'code': f.code, 'name': f.name.isNotEmpty ? f.name : Stops.nameOf(f.code)}],
        };
    }
    return null;
  }

  /// Whether the app is dark now, by its Theme setting (light, dark, time-based or the computer's).
  static bool _dark() {
    final mode = AppLook.I.modePreference;
    if (mode == 'dark') return true;
    if (mode == 'time') return !AppLook.daylight();
    if (mode == 'phone') return WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
    return false;
  }
}

// ---------- the widget's own window ----------

/// A widget window's engine starts here: it asks the main window for the widget's settings and
/// the app's, draws the widget, then sets its window up (frameless, off the taskbar, its kept
/// size and place) and keeps its place as it's moved or resized.
Future<void> runBusWidget(Map<String, Object?> args) async {
  final id = '${args['id']}';
  Map<String, dynamic>? saved;
  Map<String, Object?> prefs = const {};
  try {
    saved = Map<String, dynamic>.from((await mainChannel.invokeMethod<Map>('widget-get', {'id': id})) ?? const {});
    prefs = Map<String, Object?>.from((await mainChannel.invokeMethod<Map>('widget-prefs', {'id': id})) ?? const {});
  } catch (_) {}
  if (prefs['lang'] is String) {
    try {
      await I18n.I.use(prefs['lang'] as String, remember: false);
    } catch (_) {}
  }
  runApp(WidgetApp(id: id, saved: saved ?? const {}, prefs: prefs));
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    final w = await Desktop.findWindow();
    if (w == null) return;
    w.title = tr('desktop.widget.title', 'Bus timings');
    w.setFrameless(true);
    w.isVisibleInTaskbar = false;
    w.minimumSize = const Size(200, 110).toNative();
    w.isAlwaysOnTop = saved?['onTop'] == true;
    final b = saved?['bounds'];
    if (b is Map && b['width'] is num) {
      w.bounds = Rect.fromLTWH((b['x'] as num? ?? 60).toDouble(), (b['y'] as num? ?? 60).toDouble(), (b['width'] as num).toDouble(), (b['height'] as num).toDouble()).toNative();
    } else {
      w.setSize(const Size(320, 300).toNative(), false);
      w.center();
    }
    // Its place is sent half a second after it stops moving, not on every step of a drag.
    Timer? keep;
    w.addListener((e) {
      if (e is WindowMovedEvent || e is WindowResizedEvent) {
        keep?.cancel();
        keep = Timer(const Duration(milliseconds: 500), () {
          final r = w.bounds.toRect();
          mainChannel.invokeMethod('widget-bounds', {
            'id': id,
            'bounds': {'x': r.left.round(), 'y': r.top.round(), 'width': r.width.round(), 'height': r.height.round()},
          }).catchError((_) => null);
        });
      }
    });
    w.show();
    // A new widget takes the focus, so its stop code can be typed straight away.
    if (saved?['code'] == null) w.focus();
  });
}

/// The widget window's app: just the widget.
class WidgetApp extends StatelessWidget {
  const WidgetApp({super.key, required this.id, required this.saved, required this.prefs, this.data});
  final String id;
  final Map<String, dynamic> saved;
  final Map<String, Object?> prefs;

  /// For the guide's screenshots: timings to show, not fetched.
  final WidgetData? data;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(useMaterial3: true),
        home: BusWidget(id: id, saved: saved, prefs: prefs, data: data),
      );
}

/// The widget's timings: when they were fetched ([at], ms), a row per bus with up to three
/// arrival times (ms), and whether the last fetch failed (the rows are then the ones before).
class WidgetData {
  WidgetData({required this.at, required this.rows, this.error = false});
  final int at;
  final List<({String service, List<int> arrivals})> rows;
  final bool error;
}

/// The widget itself: its setup (pick a stop) or its timings, with its buttons along the top.
class BusWidget extends StatefulWidget {
  const BusWidget({super.key, required this.id, required this.saved, required this.prefs, this.data});
  final String id;
  final Map<String, dynamic> saved;
  final Map<String, Object?> prefs;
  final WidgetData? data;

  @override
  State<BusWidget> createState() => _BusWidgetState();
}

/// The widget's colours, light or dark, as the site's widget.html has them.
class _Palette {
  _Palette(bool dark)
      : bg = dark ? const Color(0xFF151B18) : const Color(0xFFF2F7F3),
        row = dark ? const Color(0xFF1F2924) : const Color(0xFFE2F5E5),
        ink = dark ? const Color(0xFFEEF2EF) : const Color(0xFF121815),
        muted = dark ? const Color(0xFF9AA7A0) : const Color(0xFF5B665F),
        accent = dark ? const Color(0xFFBFF5CF) : const Color(0xFF1F6B3D),
        border = dark ? const Color(0x1FFFFFFF) : const Color(0x1F121815),
        error = dark ? const Color(0xFFF87171) : const Color(0xFFB91C1C);
  final Color bg, row, ink, muted, accent, border, error;
}

class _BusWidgetState extends State<BusWidget> {
  /// How often the timings are fetched again.
  static const refreshEvery = Duration(seconds: 30);

  /// How often the times on screen count down between fetches.
  static const tickEvery = Duration(seconds: 15);

  /// The most buses it lists.
  static const maxRows = 30;

  String? _code;
  String _name = '';
  List<String> _buses = [];
  bool _onTop = false;
  WidgetData? _data;
  bool _refreshing = false;
  bool _setup = false;
  String _message = '';
  late Map<String, Object?> _prefs = widget.prefs;
  Timer? _timer;
  int _ticks = 0;
  final _codeField = TextEditingController();
  final _busField = TextEditingController();

  /// The favourite picked in the setup, whose name is kept with its code; null once the code's
  /// typed over.
  String? _pickedName;

  /// Starts on its timings if it has a stop, or in its setup if it's new.
  @override
  void initState() {
    super.initState();
    final s = widget.saved;
    _onTop = s['onTop'] == true;
    if (s['code'] is String && RegExp(r'^\d{5}$').hasMatch(s['code'] as String)) {
      _code = s['code'] as String;
      _name = '${s['name'] ?? ''}';
      _buses = [for (final b in (s['buses'] as List? ?? const [])) '$b'];
      if (widget.data != null) {
        _data = widget.data;
      } else {
        _start();
      }
    } else {
      _setup = true;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeField.dispose();
    _busField.dispose();
    super.dispose();
  }

  /// Settings' Bus times: clock times (14:05) rather than minutes.
  bool get _clockTimes => _prefs['clock'] == true;

  /// Whether the app is dark now.
  bool get _dark => _prefs['dark'] == true;

  /// A time (ms) as Singapore's clock shows it, whatever the computer's time zone: "14:05".
  String _clock(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).add(const Duration(hours: 8));
    return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  /// When a bus comes (ms), as the row shows it: "Arr", "5 min", or a clock time.
  String _mins(int ms) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (_clockTimes) return _clock(math.max(ms, now));
    final m = ((ms - now) / 60000).floor();
    return m < 1 ? tr('desktop.glance.arr', 'Arr') : tr('desktop.glance.min', '{n} min', {'n': m});
  }

  /// Fetches now, then ticks every 15 seconds: a redraw to count down, and a fetch every 30.
  void _start() {
    _data = null;
    _refresh();
    _timer?.cancel();
    _ticks = 0;
    _timer = Timer.periodic(tickEvery, (_) {
      _ticks += tickEvery.inSeconds;
      if (_ticks >= refreshEvery.inSeconds) {
        _ticks = 0;
        _refresh();
      } else if (mounted) {
        setState(() {});
      }
    });
  }

  /// Fetches the stop's next buses (and the app's settings again, in case they changed). Offline,
  /// it keeps the rows it had and says so.
  Future<void> _refresh() async {
    final code = _code;
    if (code == null || _refreshing) return;
    setState(() => _refreshing = true);
    try {
      final p = await mainChannel.invokeMethod<Map>('widget-prefs', {'id': widget.id});
      if (p != null) _prefs = Map<String, Object?>.from(p);
    } catch (_) {}
    try {
      final d = await Api.map('bus-arrivals', query: {'stop': code});
      final now = DateTime.now().millisecondsSinceEpoch;
      final services = ((d['services'] as List?) ?? const []).whereType<Map>();
      final wanted = _buses.isEmpty ? services : services.where((s) => _buses.contains('${s['serviceNo']}'.toUpperCase()));
      _data = WidgetData(at: now, rows: [
        for (final s in wanted.take(maxRows))
          (
            service: '${s['serviceNo']}',
            arrivals: [
              for (final b in [s['next'], s['next2'], s['next3']])
                if (b is Map && b['eta_ms'] is num) now + (b['eta_ms'] as num).toInt(),
            ],
          ),
      ]);
    } catch (_) {
      _data = WidgetData(at: _data?.at ?? 0, rows: _data?.rows ?? const [], error: true);
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  /// The app's favourite stops, to pick from in the setup.
  List<Map<String, String>> get _favs => [for (final f in (_prefs['favs'] as List? ?? const [])) if (f is Map) {'code': '${f['code']}', 'name': '${f['name'] ?? ''}'}];

  /// Back to the setup ("Pick another stop"), with what it shows now filled in.
  void _openSetup([String message = '']) {
    _timer?.cancel();
    _codeField.text = _code ?? '';
    _busField.text = _buses.join(', ');
    _pickedName = null;
    setState(() {
      _setup = true;
      _message = message;
    });
  }

  /// The setup's Save: checks the stop code and buses, finds the stop's name, has the main
  /// window keep it, and shows its timings.
  Future<void> _save() async {
    final code = _codeField.text.trim();
    final buses = <String>{for (final b in _busField.text.toUpperCase().split(RegExp(r'[\s,]+'))) if (b.isNotEmpty) b}.toList();
    if (!RegExp(r'^\d{5}$').hasMatch(code)) {
      setState(() => _message = tr('desktop.widget.needCode', 'Pick a favourite, or type a 5-digit stop code.'));
      return;
    }
    if (buses.any((b) => !RegExp(r'^[0-9A-Z]{1,4}$').hasMatch(b))) {
      setState(() => _message = tr('desktop.widget.badBus', 'Bus numbers are like 21 or NR7, separated by commas.'));
      return;
    }
    var name = _pickedName ?? _favs.where((f) => f['code'] == code).firstOrNull?['name'] ?? '';
    if (name.isEmpty) name = await _stopName(code);
    try {
      await mainChannel.invokeMethod('widget-save', {'id': widget.id, 'code': code, 'name': name, 'buses': buses});
    } catch (_) {}
    setState(() {
      _code = code;
      _name = name;
      _buses = buses;
      _setup = false;
    });
    _start();
  }

  /// A typed stop code's name, from the site's list of stops, or '' if it can't be found.
  Future<String> _stopName(String code) async {
    try {
      final stops = await Api.get('bus-stops');
      if (stops is List) return '${stops.whereType<Map>().where((s) => s['c'] == code).firstOrNull?['n'] ?? ''}';
    } catch (_) {}
    return '';
  }

  /// The × button: the widget's forgotten, and its window closes.
  Future<void> _close() async {
    try {
      await mainChannel.invokeMethod('widget-close', {'id': widget.id});
    } catch (_) {}
    Desktop.window?.close();
  }

  /// The pin button: kept on top of other windows, or not.
  void _pin() {
    final on = !_onTop;
    Desktop.window?.isAlwaysOnTop = on;
    mainChannel.invokeMethod('widget-on-top', {'id': widget.id, 'on': on}).catchError((_) => null);
    setState(() => _onTop = on);
  }

  @override
  Widget build(BuildContext context) {
    final c = _Palette(_dark);
    return Scaffold(
      backgroundColor: c.bg,
      body: DragToResizeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _header(c),
          Expanded(child: _setup ? _setupBody(c) : _timesBody(c)),
          _footer(c),
        ]),
      ),
    );
  }

  /// One of the round buttons along the top. [toggled] for one that stays pressed (the pin).
  Widget _roundButton(_Palette c, IconData icon, String tip, VoidCallback? onTap, {bool? toggled}) {
    final pressed = toggled == true;
    return Tooltip(
      message: tip,
      child: Semantics(
        button: true,
        label: tip,
        toggled: toggled,
        child: Material(
          color: pressed ? c.accent : c.row,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(width: 28, height: 28, child: Icon(icon, size: 15, color: pressed ? c.bg : c.ink)),
          ),
        ),
      ),
    );
  }

  /// The top: the stop's name and what it shows (dragging it moves the window), then refresh,
  /// pick another stop, keep on top and remove.
  Widget _header(_Palette c) {
    final title = _setup ? tr('desktop.widget.title', 'Bus timings') : (_name.isNotEmpty ? _name : tr('desktop.widget.stop', 'Bus stop {code}', {'code': _code}));
    final which = _buses.isNotEmpty ? tr('desktop.widget.buses', 'Bus {list}', {'list': _buses.join(', ')}) : tr('desktop.widget.every', 'Every bus');
    final sub = _setup ? tr('desktop.widget.pick', 'Pick a stop') : '$_code · $which';
    return DragToMoveArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 10, 6),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.ink)),
              Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.muted)),
            ]),
          ),
          const SizedBox(width: 6),
          _roundButton(c, Icons.refresh, tr('desktop.glance.refresh', 'Refresh'), _refreshing || _setup ? null : _refresh),
          const SizedBox(width: 6),
          _roundButton(c, Icons.edit_outlined, tr('desktop.widget.another', 'Pick another stop'), () => _openSetup()),
          const SizedBox(width: 6),
          _roundButton(c, Icons.push_pin_outlined, tr('desktop.widget.pin', 'Keep on top'), _pin, toggled: _onTop),
          const SizedBox(width: 6),
          _roundButton(c, Icons.close, tr('desktop.widget.remove', 'Remove this widget'), _close),
        ]),
      ),
    );
  }

  /// The setup: the favourite stops to pick from, or a stop code to type, the buses to narrow it
  /// to, and Save.
  Widget _setupBody(_Palette c) {
    final favs = _favs;
    InputDecoration field(String hint) => InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: c.muted),
          isDense: true,
          filled: true,
          fillColor: c.bg,
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.border)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.border)),
        );
    return ListView(padding: const EdgeInsets.fromLTRB(14, 4, 14, 12), children: [
      Text(favs.isNotEmpty ? tr('desktop.widget.yourFavs', 'Your favourite stops') : tr('desktop.widget.noFavs', 'Stops you save in the app show here to pick from.'), style: TextStyle(color: c.muted, fontSize: 12)),
      const SizedBox(height: 8),
      for (final f in favs) _favourite(c, f),
      const SizedBox(height: 4),
      TextField(controller: _codeField, maxLength: 5, keyboardType: TextInputType.number, style: TextStyle(color: c.ink, fontSize: 14), decoration: field(tr('desktop.widget.codeHint', 'Bus stop code (5 digits)')).copyWith(counterText: ''), onChanged: (_) => _pickedName = null),
      const SizedBox(height: 8),
      TextField(controller: _busField, style: TextStyle(color: c.ink, fontSize: 14), decoration: field(tr('desktop.widget.busesHint', 'Just these buses, e.g. 15, 62 (optional)')), onSubmitted: (_) => _save()),
      if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_message, style: TextStyle(color: c.error, fontSize: 12))),
      const SizedBox(height: 8),
      FilledButton(
        onPressed: _save,
        style: FilledButton.styleFrom(backgroundColor: c.accent, foregroundColor: c.bg, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
        child: Text(tr('desktop.widget.save', 'Save'), style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    ]);
  }

  /// A favourite stop in the setup, outlined once it's picked.
  Widget _favourite(_Palette c, Map<String, String> f) {
    final picked = _codeField.text == f['code'] && _pickedName != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: c.row,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: picked ? c.accent : c.border, width: picked ? 2 : 1)),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => setState(() {
            _codeField.text = f['code']!;
            _pickedName = f['name'];
          }),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            child: Text('${f['name']!.isNotEmpty ? f['name'] : f['code']} · ${f['code']}', style: TextStyle(color: c.ink, fontSize: 14)),
          ),
        ),
      ),
    );
  }

  /// The timings: "Getting the timings…" at first, a note when nothing's due (or it's offline),
  /// otherwise a row per bus.
  Widget _timesBody(_Palette c) {
    final data = _data;
    if (data == null) return Center(child: Text(tr('desktop.widget.getting', 'Getting the timings…'), style: TextStyle(color: c.muted)));
    if (data.rows.isNotEmpty) {
      return ListView(padding: const EdgeInsets.symmetric(horizontal: 10), children: [for (final r in data.rows) _row(c, r)]);
    }
    final String note;
    if (data.error) {
      note = tr('desktop.widget.offline', "Couldn't reach LTA. Tap refresh to try again.");
    } else if (_buses.isNotEmpty) {
      note = tr('desktop.widget.noneOfThose', 'None of those buses are due here right now.');
    } else {
      note = tr('desktop.widget.none', 'No buses are due here right now.');
    }
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Center(child: Text(note, textAlign: TextAlign.center, style: TextStyle(color: c.muted))),
    );
  }

  /// One bus: its number and next three times, the first in bold. Clicking it opens that bus at
  /// the stop in the main window.
  Widget _row(_Palette c, ({String service, List<int> arrivals}) r) {
    String time(int i) => i < r.arrivals.length ? _mins(r.arrivals[i]) : (i == 0 ? tr('desktop.widget.noEstimate', 'No estimate') : '');
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: c.row,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => mainChannel.invokeMethod('open-hash', {'hash': '#$_code,${r.service}'}).catchError((_) => null),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(children: [
              SizedBox(width: 52, child: Text(r.service, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: c.ink))),
              for (var i = 0; i < 3; i++)
                Expanded(
                  child: Text(
                    time(i),
                    style: TextStyle(
                      fontSize: i == 0 ? 14 : 13,
                      fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w400,
                      color: i == 0 ? c.accent : (i == 2 ? c.muted : c.ink),
                    ),
                  ),
                ),
            ]),
          ),
        ),
      ),
    );
  }

  /// The bottom line: when the timings were fetched, and "Offline" if the last fetch failed.
  Widget _footer(_Palette c) {
    final at = _data?.at ?? 0;
    final offline = _data?.error == true ? tr('desktop.widget.offlineShort', 'Offline · ') : '';
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
      child: Text(
        _setup || at == 0 ? '' : '$offline${tr('desktop.widget.updated', 'Updated {time}', {'time': _clock(at)})}',
        textAlign: TextAlign.right,
        style: TextStyle(fontSize: 11, color: c.muted),
      ),
    );
  }
}
