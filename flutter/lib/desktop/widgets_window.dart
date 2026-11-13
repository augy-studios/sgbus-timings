// The desktop's Bus timings widgets: each a small frameless window of its own on the desktop,
// showing the next buses at a stop you pick, resizable any way, kept on top if you like (the
// Electron app's widgets.js and the site's widget.html, the same widget as the Android one).
// A Windows app outside the Microsoft Store can't add to Windows 11's Widgets board, so they live
// on the desktop instead.
//
// Added from the tray's menu. Each one's stop, buses, size and place are kept in settings.json
// (the Electron app's `widgets`, so its widgets come back) and it's opened again where it was
// when the app starts. Closing one with its × removes it; quitting the app keeps them all.
//
// Each window runs its own engine (desktop_multi_window), and asks the main window, over the
// 'sgbus/main' channel, for anything kept: the main window alone writes settings.json.
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

const mainChannel = WindowMethodChannel('sgbus/main', mode: ChannelMode.unidirectional);

class DeskWidgets {
  DeskWidgets._();

  static final Map<String, WindowController> _open = {};
  static StreamSubscription<void>? _watch;

  static List<Map<String, dynamic>> list() => [for (final w in (DeskSettings.get<List>('widgets') ?? const [])) if (w is Map) Map<String, dynamic>.from(w)];

  static Map<String, dynamic>? get(String id) => list().where((w) => w['id'] == id).firstOrNull;

  static void update(String id, Map<String, dynamic> changes) {
    final all = list();
    final i = all.indexWhere((w) => w['id'] == id);
    if (i == -1) return;
    all[i] = {...all[i], ...changes};
    DeskSettings.write({'widgets': all});
  }

  static void remove(String id) => DeskSettings.write({'widgets': list().where((w) => w['id'] != id).toList()});

  static String _newId() {
    final r = math.Random.secure();
    String hex(int n) => List.generate(n, (_) => r.nextInt(16).toRadixString(16)).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + r.nextInt(4)).toRadixString(16)}${hex(3)}-${hex(12)}';
  }

  /// From the tray: a new widget, in its setup.
  static Future<void> add() async {
    final w = {'id': _newId(), 'code': null, 'buses': <String>[], 'name': '', 'onTop': false};
    DeskSettings.write({'widgets': [...list(), w]});
    await _openWidget(w);
  }

  /// At start: every widget kept, where it was.
  static Future<void> restore() async {
    for (final w in list()) {
      if (!_open.containsKey(w['id'])) await _openWidget(w);
    }
  }

  static Future<void> _openWidget(Map<String, dynamic> w) async {
    final c = await WindowController.create(WindowConfiguration(hiddenAtLaunch: true, arguments: jsonEncode({'kind': 'widget', 'id': w['id']})));
    _open['${w['id']}'] = c;
    _watch ??= onWindowsChanged.listen((_) async {
      final alive = {for (final x in await WindowController.getAll()) x.windowId};
      _open.removeWhere((_, c) => !alive.contains(c.windowId));
    });
  }

  /// The main window's side of what a widget asks (desktop_main.dart's channel handler).
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

  static bool _dark() {
    final mode = AppLook.I.modePreference;
    if (mode == 'dark') return true;
    if (mode == 'time') return !AppLook.daylight();
    if (mode == 'phone') return WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
    return false;
  }
}

// ---------- the widget's own window ----------

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
    if (saved?['code'] == null) w.focus();
  });
}

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

class WidgetData {
  WidgetData({required this.at, required this.rows, this.error = false});
  final int at;
  final List<({String service, List<int> arrivals})> rows;
  final bool error;
}

class BusWidget extends StatefulWidget {
  const BusWidget({super.key, required this.id, required this.saved, required this.prefs, this.data});
  final String id;
  final Map<String, dynamic> saved;
  final Map<String, Object?> prefs;
  final WidgetData? data;

  @override
  State<BusWidget> createState() => _BusWidgetState();
}

class _BusWidgetState extends State<BusWidget> {
  static const refreshEvery = Duration(seconds: 30);
  static const tickEvery = Duration(seconds: 15);
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
  String? _pickedName;

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

  bool get _clockTimes => _prefs['clock'] == true;
  bool get _dark => _prefs['dark'] == true;

  String _clock(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).add(const Duration(hours: 8));
    return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  String _mins(int ms) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (_clockTimes) return _clock(math.max(ms, now));
    final m = ((ms - now) / 60000).floor();
    return m < 1 ? tr('desktop.glance.arr', 'Arr') : tr('desktop.glance.min', '{n} min', {'n': m});
  }

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

  List<Map<String, String>> get _favs => [for (final f in (_prefs['favs'] as List? ?? const [])) if (f is Map) {'code': '${f['code']}', 'name': '${f['name'] ?? ''}'}];

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
    if (name.isEmpty) {
      try {
        final stops = await Api.get('bus-stops');
        if (stops is List) name = '${stops.whereType<Map>().where((s) => s['c'] == code).firstOrNull?['n'] ?? ''}';
      } catch (_) {}
    }
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

  Future<void> _close() async {
    try {
      await mainChannel.invokeMethod('widget-close', {'id': widget.id});
    } catch (_) {}
    Desktop.window?.close();
  }

  void _pin() {
    final on = !_onTop;
    Desktop.window?.isAlwaysOnTop = on;
    mainChannel.invokeMethod('widget-on-top', {'id': widget.id, 'on': on}).catchError((_) => null);
    setState(() => _onTop = on);
  }

  @override
  Widget build(BuildContext context) {
    final dark = _dark;
    final bg = dark ? const Color(0xFF151B18) : const Color(0xFFF2F7F3);
    final row = dark ? const Color(0xFF1F2924) : const Color(0xFFE2F5E5);
    final ink = dark ? const Color(0xFFEEF2EF) : const Color(0xFF121815);
    final muted = dark ? const Color(0xFF9AA7A0) : const Color(0xFF5B665F);
    final accent = dark ? const Color(0xFFBFF5CF) : const Color(0xFF1F6B3D);
    final border = dark ? const Color(0x1FFFFFFF) : const Color(0x1F121815);
    final error = dark ? const Color(0xFFF87171) : const Color(0xFFB91C1C);

    Widget roundButton(IconData icon, String tip, VoidCallback? onTap, {bool pressed = false}) => Tooltip(
          message: tip,
          child: Semantics(
            button: true,
            label: tip,
            toggled: tip == tr('desktop.widget.pin', 'Keep on top') ? pressed : null,
            child: Material(
              color: pressed ? accent : row,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onTap,
                child: SizedBox(width: 28, height: 28, child: Icon(icon, size: 15, color: pressed ? bg : ink)),
              ),
            ),
          ),
        );

    final header = DragToMoveArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 10, 6),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_setup ? tr('desktop.widget.title', 'Bus timings') : (_name.isNotEmpty ? _name : tr('desktop.widget.stop', 'Bus stop {code}', {'code': _code})),
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: ink)),
              Text(
                _setup
                    ? tr('desktop.widget.pick', 'Pick a stop')
                    : '$_code · ${_buses.isNotEmpty ? tr('desktop.widget.buses', 'Bus {list}', {'list': _buses.join(', ')}) : tr('desktop.widget.every', 'Every bus')}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: muted),
              ),
            ]),
          ),
          const SizedBox(width: 6),
          roundButton(Icons.refresh, tr('desktop.glance.refresh', 'Refresh'), _refreshing || _setup ? null : _refresh),
          const SizedBox(width: 6),
          roundButton(Icons.edit_outlined, tr('desktop.widget.another', 'Pick another stop'), () => _openSetup()),
          const SizedBox(width: 6),
          roundButton(Icons.push_pin_outlined, tr('desktop.widget.pin', 'Keep on top'), _pin, pressed: _onTop),
          const SizedBox(width: 6),
          roundButton(Icons.close, tr('desktop.widget.remove', 'Remove this widget'), _close),
        ]),
      ),
    );

    Widget body;
    if (_setup) {
      final favs = _favs;
      InputDecoration field(String hint) => InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: muted),
            isDense: true,
            filled: true,
            fillColor: bg,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: border)),
          );
      body = ListView(padding: const EdgeInsets.fromLTRB(14, 4, 14, 12), children: [
        Text(favs.isNotEmpty ? tr('desktop.widget.yourFavs', 'Your favourite stops') : tr('desktop.widget.noFavs', 'Stops you save in the app show here to pick from.'), style: TextStyle(color: muted, fontSize: 12)),
        const SizedBox(height: 8),
        for (final f in favs)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Material(
              color: row,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: BorderSide(color: _codeField.text == f['code'] && _pickedName != null ? accent : border, width: _codeField.text == f['code'] && _pickedName != null ? 2 : 1),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => setState(() {
                  _codeField.text = f['code']!;
                  _pickedName = f['name'];
                }),
                child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7), child: Text('${f['name']!.isNotEmpty ? f['name'] : f['code']} · ${f['code']}', style: TextStyle(color: ink, fontSize: 14))),
              ),
            ),
          ),
        const SizedBox(height: 4),
        TextField(controller: _codeField, maxLength: 5, keyboardType: TextInputType.number, style: TextStyle(color: ink, fontSize: 14), decoration: field(tr('desktop.widget.codeHint', 'Bus stop code (5 digits)')).copyWith(counterText: ''), onChanged: (_) => _pickedName = null),
        const SizedBox(height: 8),
        TextField(controller: _busField, style: TextStyle(color: ink, fontSize: 14), decoration: field(tr('desktop.widget.busesHint', 'Just these buses, e.g. 15, 62 (optional)')), onSubmitted: (_) => _save()),
        if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_message, style: TextStyle(color: error, fontSize: 12))),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _save,
          style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: bg, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
          child: Text(tr('desktop.widget.save', 'Save'), style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ]);
    } else if (_data == null) {
      body = Center(child: Text(tr('desktop.widget.getting', 'Getting the timings…'), style: TextStyle(color: muted)));
    } else if (_data!.rows.isEmpty) {
      body = Padding(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: Text(
            _data!.error
                ? tr('desktop.widget.offline', "Couldn't reach LTA. Tap refresh to try again.")
                : _buses.isNotEmpty
                    ? tr('desktop.widget.noneOfThose', 'None of those buses are due here right now.')
                    : tr('desktop.widget.none', 'No buses are due here right now.'),
            textAlign: TextAlign.center,
            style: TextStyle(color: muted),
          ),
        ),
      );
    } else {
      body = ListView(padding: const EdgeInsets.symmetric(horizontal: 10), children: [
        for (final r in _data!.rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Material(
              color: row,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => mainChannel.invokeMethod('open-hash', {'hash': '#$_code,${r.service}'}).catchError((_) => null),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  child: Row(children: [
                    SizedBox(width: 52, child: Text(r.service, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: ink))),
                    for (var i = 0; i < 3; i++)
                      Expanded(
                        child: Text(
                          i < r.arrivals.length ? _mins(r.arrivals[i]) : (i == 0 ? tr('desktop.widget.noEstimate', 'No estimate') : ''),
                          style: TextStyle(
                            fontSize: i == 0 ? 14 : 13,
                            fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w400,
                            color: i == 0 ? accent : (i == 2 ? muted : ink),
                          ),
                        ),
                      ),
                  ]),
                ),
              ),
            ),
          ),
      ]);
    }

    final at = _data?.at ?? 0;
    return Scaffold(
      backgroundColor: bg,
      body: DragToResizeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          header,
          Expanded(child: body),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
            child: Text(
              _setup || at == 0 ? '' : '${_data!.error ? tr('desktop.widget.offlineShort', 'Offline · ') : ''}${tr('desktop.widget.updated', 'Updated {time}', {'time': _clock(at)})}',
              textAlign: TextAlign.right,
              style: TextStyle(fontSize: 11, color: muted),
            ),
          ),
        ]),
      ),
    );
  }
}
