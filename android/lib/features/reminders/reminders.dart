// The app's reminders (the site's js/reminders.js), run by the app itself with the app closed
// (RemindersPlugin):
//
//   Timings near a stop  the favourite stops you pick, watched by geofence (NearStops.java);
//                        its own Edge Tray button
//   Time to leave        for the phone's calendar events with a place (LeaveTime.java)
//   "On a bus?"          offers a trip when you seem to be riding (OnABus.java)
//   Last bus             a bell by a bus's last bus time at a stop (LastBus.java)
//   Routines             a stop's next buses at a time, on the days picked (Routines.java);
//                        its own Edge Tray button
//
// Kept as the site kept them (sgbus_lastbus, sgbus_nearstops, sgbus_routines), and handed to the
// app again as the app opens, after an update or a clear of its data.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/favs.dart';
import '../../data/network.dart';
import '../../data/stops.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../settings/settings_screen.dart';
import '../timings/stop_screen.dart';

class Reminders {
  Reminders._();
  static const lastKey = 'sgbus_lastbus';
  static const nearKey = 'sgbus_nearstops';
  static const routineKey = 'sgbus_routines';
  static const maxNear = 20;
  static const maxRoutines = 20;
  static final changes = ValueNotifier<int>(0);
  static Map<String, dynamic>? status;

  static Future<Map<String, dynamic>?> _call(String method, [Map<String, dynamic>? options]) => Native.call('Reminders', method, options);

  static List<Map> lastList() => Store.I.list(lastKey).whereType<Map>().toList();
  static bool isLast(String code, String service) => lastList().any((r) => r['code'] == code && r['service'] == service);
  static List<Map> routines() => Store.I.list(routineKey).whereType<Map>().toList();
  static List<String> near() => [for (final c in Store.I.list(nearKey)) '$c'];

  static Future<void> refresh() async {
    if (!Native.has('lastbus')) return;
    status = await _call('status').catchError((_) => null);
    changes.value++;
  }

  static String needText(String? need) => switch (need) {
        'location' => tr('reminders.needLocation', 'Location isn’t allowed for SG Bus Timings, so it can’t tell when you’re near a stop.'),
        'background' => tr('reminders.needBackground', 'To watch your stops with the app closed, allow location “All the time” for SG Bus Timings.'),
        'calendar' => tr('reminders.needCalendar', 'Time to leave needs to read this phone’s calendar: allow Calendar for SG Bus Timings.'),
        'activity' => tr('reminders.needActivity', '“On a bus?” needs Physical activity: allow it for SG Bus Timings.'),
        _ => '',
      };

  /// What went wrong, in words, and whether Android's settings would fix it.
  static ({String text, bool settings}) failed(Object e) {
    if (e is NativeError) {
      final need = e.data?['need'] as String?;
      if (e.code == 'permission' && needText(need).isNotEmpty) return (text: needText(need), settings: true);
      return (text: e.message, settings: false);
    }
    return (text: tr('reminders.failed', 'Couldn’t set that up. Try again.'), settings: false);
  }

  static Future<String?> setSwitch(String method, bool on) async {
    try {
      await _call(method, {'on': on});
      await refresh();
      return null;
    } catch (e) {
      await refresh();
      return failed(e).text;
    }
  }

  // ---------- last bus ----------

  static Future<void> toggleLast(String service, String code) async {
    var list = lastList();
    if (isLast(code, service)) {
      list = list.where((r) => !(r['code'] == code && r['service'] == service)).toList();
    } else {
      final times = BusNet.lastBuses(service, code);
      if (times == null) return;
      list = [...list, {'code': code, 'name': Stops.nameOf(code).isNotEmpty ? Stops.nameOf(code) : code, 'service': service, ...times}];
      list = list.skip(math.max(0, list.length - 20)).toList();
    }
    Store.I.putJson(lastKey, list);
    await _call('lastBus', {'list': list}).catchError((_) => null);
    changes.value++;
  }

  static Future<void> removeLast(int i) async {
    final list = lastList()..removeAt(i);
    Store.I.putJson(lastKey, list);
    await _call('lastBus', {'list': list}).catchError((_) => null);
    changes.value++;
  }

  // ---------- routines ----------

  static Future<String?> saveRoutines(List<Map> list) async {
    Store.I.putJson(routineKey, list.take(maxRoutines).toList());
    changes.value++;
    try {
      await _call('routines', {'list': list});
      await refresh();
      return null;
    } catch (e) {
      return failed(e).text;
    }
  }

  static String daysText(List<int> days) {
    final set = ([...days]..sort()).join(',');
    if (set == '1,2,3,4,5,6,7') return tr('routine.days.every_day', 'Every day');
    if (set == '1,2,3,4,5') return tr('routine.days.weekdays', 'Weekdays');
    if (set == '6,7') return tr('routine.days.weekends', 'Weekends');
    return days.map(dayName).join(', ');
  }

  static String dayName(int d) => switch (d) {
        1 => tr('campus.dow.mon', 'Mon'),
        2 => tr('campus.dow.tue', 'Tue'),
        3 => tr('campus.dow.wed', 'Wed'),
        4 => tr('campus.dow.thu', 'Thu'),
        5 => tr('campus.dow.fri', 'Fri'),
        6 => tr('campus.dow.sat', 'Sat'),
        _ => tr('campus.dow.sun', 'Sun'),
      };

  static String clockText(String hhmm) => '${(int.parse(hhmm.substring(0, 2)) % 24).toString().padLeft(2, '0')}:${hhmm.substring(2)}';

  // ---------- Sync ----------

  static String _routineKey(Map r) =>
      '${r['code']}@${r['time']}/${([...(r['days'] as List)]..sort((a, b) => (a as num).compareTo(b as num))).join()}/${([...(r['buses'] as List)].map((e) => '$e').toList()..sort()).join(',')}';

  static List<Map> syncRoutines() =>
      Native.has('routines') ? [for (final r in routines()) {'code': r['code'], 'name': r['name'], 'buses': r['buses'], 'time': r['time'], 'days': r['days']}] : const [];
  static List<Map> syncLastBus() => Native.has('lastbus') ? lastList() : const [];

  static int mergeRoutines(List<Map> list) {
    if (!Native.has('routines')) return 0;
    final have = {for (final r in routines()) _routineKey(r)};
    final fresh = list.where((r) => have.add(_routineKey(r))).toList();
    final room = math.max(0, maxRoutines - routines().length);
    final added = [
      for (final (i, r) in fresh.take(room).indexed)
        {'id': '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}$i${math.Random().nextInt(1 << 20).toRadixString(36)}', ...r, 'name': Stops.nameOf('${r['code']}').isNotEmpty ? Stops.nameOf('${r['code']}') : r['name'] ?? r['code']},
    ];
    if (added.isNotEmpty) saveRoutines([...routines(), ...added]);
    return added.length;
  }

  static int mergeLastBus(List<Map> list) {
    if (!Native.has('lastbus')) return 0;
    final added = [
      for (final r in list)
        if (!isLast('${r['code']}', '${r['service']}')) {...r, 'name': Stops.nameOf('${r['code']}').isNotEmpty ? Stops.nameOf('${r['code']}') : r['name'] ?? r['code']},
    ];
    if (added.isEmpty) return 0;
    final next = [...lastList(), ...added];
    final kept = next.skip(math.max(0, next.length - 20)).toList();
    Store.I.putJson(lastKey, kept);
    _call('lastBus', {'list': kept}).catchError((_) => null);
    changes.value++;
    return added.length;
  }

  static void register() {
    AppNav.register('nearStopsReminder', (_) => AppNav.push(const NearStopsScreen(), name: 'nearstops'));
    AppNav.register('routines', (_) => AppNav.push(const RoutinesScreen(), name: 'routines'));
    RemindersSettings.build = (context) => const _RemindersSettings();
    LastBusBell.build = (context, no, code) => _Bell(no: no, code: code);
    // The app's copies, after an update or a clear of its data.
    if (Native.has('lastbus') && lastList().isNotEmpty) _call('lastBus', {'list': lastList()}).catchError((_) => null);
    if (Native.has('routines') && routines().isNotEmpty) _call('routines', {'list': routines()}).catchError((_) => null);
  }
}

/// A note under a reminder: what went wrong, with Open settings where Android's settings fix it.
class _Note extends StatelessWidget {
  const _Note(this.text, {this.settings = false});
  final String text;
  final bool settings;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        Expanded(child: Text(text, style: TextStyle(color: context.sg.error))),
        if (settings)
          TextButton.icon(
            onPressed: () => Native.call('SgBus', 'openSettings', {'what': 'app'}).catchError((_) => null),
            icon: const Icon(Icons.settings_outlined),
            label: Text(tr('offline.openSettings', 'Open settings')),
          ),
      ]),
    );
  }
}

class _Bell extends StatelessWidget {
  const _Bell({required this.no, required this.code});
  final String no;
  final String code;

  @override
  Widget build(BuildContext context) {
    if (!Native.has('lastbus') || !BusNet.ready) return const SizedBox.shrink();
    final times = BusNet.lastBuses(no, code);
    if (times == null || !times.values.any((t) => RegExp(r'^\d{4}$').hasMatch(t))) return const SizedBox.shrink();
    return ValueListenableBuilder(
      valueListenable: Reminders.changes,
      builder: (context, _, _) {
        final on = Reminders.isLast(code, no);
        return IconButton(
          visualDensity: VisualDensity.compact,
          isSelected: on,
          tooltip: on
              ? tr('reminders.lastOff', 'Stop reminding me of the last {no} here', {'no': no})
              : tr('reminders.lastOn', 'Remind me 20 minutes before the last {no} here', {'no': no}),
          onPressed: () => Reminders.toggleLast(no, code),
          icon: Icon(on ? Icons.notifications_active : Icons.notifications_none, color: on ? context.sg.brandInk : context.sg.muted, size: 20),
        );
      },
    );
  }
}

class _RemindersSettings extends StatefulWidget {
  const _RemindersSettings();

  @override
  State<_RemindersSettings> createState() => _RemindersSettingsState();
}

class _RemindersSettingsState extends State<_RemindersSettings> with WidgetsBindingObserver {
  String _error = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Reminders.refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) Reminders.refresh();
  }

  @override
  Widget build(BuildContext context) {
    if (!Native.has('lastbus')) return const SizedBox.shrink();
    return ValueListenableBuilder(
      valueListenable: Reminders.changes,
      builder: (context, _, _) {
        final sg = context.sg;
        final s = Reminders.status;
        final off = s != null && s['notifications'] == false;
        final list = Reminders.lastList();
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SectionLabel(tr('app.reminders', 'Reminders')),
          if (off && (list.isNotEmpty || s['leaveTime'] == true || s['onABus'] == true))
            _Note(tr('reminders.noNotifications', 'Notifications are off for SG Bus Timings, so these reminders can’t show.'), settings: true),
          _Note(_error),
          if (Native.has('leavetime'))
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: s?['leaveTime'] == true,
              title: Text(tr('settings.time_to_leave', 'Time to leave')),
              subtitle: Text(tr('settings.for_events_in_this_phones', "For events in this phone's calendar with a place: a notification when it's time to set off by bus and train, from where you are, or from Home.")),
              onChanged: (v) async {
                final e = await Reminders.setSwitch('leaveTime', v);
                if (mounted) setState(() => _error = e ?? '');
              },
            ),
          if (Native.has('onabus'))
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: s?['onABus'] == true,
              title: Text(tr('settings.on_a_bus', '“On a bus?”')),
              subtitle: Text(tr('settings.when_you_seem_to_be', 'When you seem to be riding with no trip running, a quiet notification offers to start one, for the Get Off Alert. Needs Physical activity.')),
              onChanged: (v) async {
                final e = await Reminders.setSwitch('onABus', v);
                if (mounted) setState(() => _error = e ?? '');
              },
            ),
          Text(tr('settings.last_bus_reminders', 'Last bus reminders'), style: Theme.of(context).textTheme.titleSmall),
          if (list.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(tr('settings.last_bus_reminders.no_buses', 'None yet.'), style: TextStyle(color: sg.muted)))
          else
            for (final (i, r) in list.indexed)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text.rich(TextSpan(children: [TextSpan(text: '${r['service']}', style: const TextStyle(fontWeight: FontWeight.w700)), TextSpan(text: ' at ${r['name']}')])),
                subtitle: Text('${r['code']}'),
                trailing: IconButton(tooltip: tr('mapSave.remove', 'Remove'), onPressed: () => Reminders.removeLast(i), icon: const Icon(Icons.close)),
              ),
          Text(tr('settings.last_bus_reminders.description', "Tap the bell by a bus's last bus time at a stop: a reminder 20 minutes before it, every day it runs."),
              style: TextStyle(color: sg.muted, fontSize: 13)),
        ]);
      },
    );
  }
}

/// Timings near a stop: the favourite stops to watch.
class NearStopsScreen extends StatefulWidget {
  const NearStopsScreen({super.key});

  @override
  State<NearStopsScreen> createState() => _NearStopsScreenState();
}

class _NearStopsScreenState extends State<NearStopsScreen> {
  late final Set<String> _picked = Reminders.near().toSet();
  ({String text, bool settings})? _note;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    Stops.load().then((_) => mounted ? setState(() {}) : null);
    Reminders.refresh().then((_) {
      final s = Reminders.status;
      if (!mounted || s == null) return;
      if (s['notifications'] == false && (s['nearStops'] as List? ?? const []).isNotEmpty) {
        setState(() => _note = (text: tr('reminders.noNotifications', 'Notifications are off for SG Bus Timings, so these reminders can’t show.'), settings: true));
      } else if ((s['nearStops'] as List? ?? const []).isNotEmpty && s['background'] != true) {
        setState(() => _note = (text: Reminders.needText('background'), settings: true));
      }
    });
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _note = null;
    });
    final stops = [
      for (final code in _picked.take(Reminders.maxNear))
        if (Stops.of(code)?.lat != null) {'code': code, 'name': Stops.nameOf(code).isNotEmpty ? Stops.nameOf(code) : code, 'lat': Stops.of(code)!.lat, 'lng': Stops.of(code)!.lng},
    ];
    try {
      await Native.call('Reminders', 'nearStops', {'stops': stops});
      Store.I.putJson(Reminders.nearKey, [for (final s in stops) s['code']]);
      if (mounted) Navigator.of(context).maybePop();
    } catch (e) {
      // Turned off rather than left half set up.
      Store.I.putJson(Reminders.nearKey, const []);
      Native.call('Reminders', 'nearStops', {'stops': const []}).catchError((_) => null);
      _picked.clear();
      if (mounted) setState(() => _note = Reminders.failed(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final favs = Favs.I.stops();
    return SgScaffold(
      title: tr('settings.timings_near_a_stop', 'Timings near a stop'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        Text(tr('html.as_you_walk_up_to', 'As you walk up to a favourite stop you pick, a quiet notification shows its next buses.'), style: TextStyle(color: sg.muted)),
        if (_note != null) _Note(_note!.text, settings: _note!.settings),
        const SizedBox(height: 8),
        if (favs.isEmpty)
          EmptyNote(tr('reminders.noFavs', 'Save some stops to your favourites first, with the star on a stop’s timings.'))
        else ...[
          for (final f in favs)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _picked.contains(f.code),
              onChanged: Stops.of(f.code)?.lat == null ? null : (v) => setState(() => v == true ? _picked.add(f.code) : _picked.remove(f.code)),
              title: Text(f.name.isNotEmpty ? f.name : (Stops.nameOf(f.code).isNotEmpty ? Stops.nameOf(f.code) : tr('favs.stopNoName', 'Bus stop'))),
              subtitle: Text(f.code),
            ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _busy ? null : _save, child: Text(tr('common.save', 'Save'))),
        ],
      ]),
    );
  }
}

/// Routines: a stop's next buses as a notification at a time, on the days picked.
class RoutinesScreen extends StatefulWidget {
  const RoutinesScreen({super.key});

  @override
  State<RoutinesScreen> createState() => _RoutinesScreenState();
}

class _RoutinesScreenState extends State<RoutinesScreen> {
  String? _editing;
  String? _code;
  final _buses = TextEditingController();
  TimeOfDay _time = const TimeOfDay(hour: 8, minute: 0);
  Set<int> _days = {1, 2, 3, 4, 5};
  String _error = '';
  String _note = '';

  @override
  void initState() {
    super.initState();
    _reset();
    Reminders.refresh().then((_) {
      final s = Reminders.status;
      if (mounted && s?['notifications'] == false && ((s?['routines'] as num?) ?? 0) > 0) {
        setState(() => _note = tr('reminders.noNotifications', 'Notifications are off for SG Bus Timings, so these reminders can’t show.'));
      }
    });
  }

  List<({String code, String name})> _options(Map? r) {
    final out = <({String code, String name})>[];
    if (r != null) out.add((code: '${r['code']}', name: '${r['name'] ?? r['code']}'));
    for (final f in Favs.I.stops()) {
      if (!out.any((o) => o.code == f.code)) out.add((code: f.code, name: f.name.isNotEmpty ? f.name : (Stops.nameOf(f.code).isNotEmpty ? Stops.nameOf(f.code) : f.code)));
    }
    return out;
  }

  void _reset([Map? r]) {
    _editing = r?['id'] as String?;
    final opts = _options(r);
    _code = opts.isEmpty ? null : opts.first.code;
    _buses.text = r != null ? (r['buses'] as List).join(', ') : '';
    if (r != null) {
      final t = '${r['time']}';
      _time = TimeOfDay(hour: int.parse(t.substring(0, 2)) % 24, minute: int.parse(t.substring(2)));
    }
    _days = r != null ? {for (final d in r['days'] as List) (d as num).toInt()} : {1, 2, 3, 4, 5};
    _error = '';
  }

  Future<void> _add() async {
    final code = _code ?? '';
    final time = '${_time.hour.toString().padLeft(2, '0')}${_time.minute.toString().padLeft(2, '0')}';
    final buses = {
      for (final b in _buses.text.toUpperCase().split(RegExp(r'[\s,]+')))
        if (RegExp(r'^[0-9A-Z]{1,5}$|^[0-9A-Z]{1,3}\*$').hasMatch(b)) b,
    }.toList();
    final why = !RegExp(r'^\d{5}$').hasMatch(code)
        ? tr('routine.pickStop', 'Pick a stop.')
        : _days.isEmpty
            ? tr('routine.pickDay', 'Pick at least one day.')
            : '';
    if (why.isNotEmpty) return setState(() => _error = why);
    final fields = {'code': code, 'name': Stops.nameOf(code).isNotEmpty ? Stops.nameOf(code) : code, 'buses': buses, 'time': time, 'days': (_days.toList()..sort())};
    final list = Reminders.routines().map((r) => Map<String, Object?>.from(r)).toList();
    final at = _editing != null ? list.indexWhere((r) => r['id'] == _editing) : -1;
    if (at != -1) {
      list[at] = {...list[at], ...fields};
    } else {
      list.add({'id': '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}${math.Random().nextInt(1 << 20).toRadixString(36)}', ...fields});
    }
    setState(_reset);
    final err = await Reminders.saveRoutines(list);
    if (mounted) setState(() => _note = err ?? '');
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
        valueListenable: Reminders.changes,
        builder: (context, _, _) {
          final sg = context.sg;
          final list = Reminders.routines();
          final opts = _options(_editing == null ? null : list.where((r) => r['id'] == _editing).firstOrNull);
          return SgScaffold(
            title: tr('settings.routines', 'Routines'),
            body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
              Text(tr('routine.description', 'A stop’s next buses as a notification at a time you set, on the days you pick: your stop at 7:45 on weekdays, say.'), style: TextStyle(color: sg.muted)),
              if (_note.isNotEmpty) _Note(_note, settings: true),
              const SizedBox(height: 8),
              if (list.isEmpty) EmptyNote(tr('settings.last_bus_reminders.no_buses', 'None yet.')),
              for (final (i, r) in list.indexed)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  selected: r['id'] == _editing,
                  title: Text.rich(TextSpan(children: [
                    TextSpan(text: Reminders.clockText('${r['time']}'), style: const TextStyle(fontWeight: FontWeight.w700)),
                    TextSpan(text: ' ${Reminders.daysText([for (final d in r['days'] as List) (d as num).toInt()])} · ${r['name']}'),
                  ])),
                  subtitle: Text('${r['code']}${(r['buses'] as List).isNotEmpty ? ' · ${(r['buses'] as List).join(', ')}' : ''}'),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    IconButton(tooltip: tr('routine.edit', 'Edit routine'), onPressed: () => setState(() => _reset(r)), icon: const Icon(Icons.edit_outlined)),
                    IconButton(
                      tooltip: tr('mapSave.remove', 'Remove'),
                      onPressed: () {
                        if (r['id'] == _editing) setState(_reset);
                        Reminders.saveRoutines([for (final (j, x) in list.indexed) if (j != i) x]);
                      },
                      icon: const Icon(Icons.close),
                    ),
                  ]),
                ),
              if (list.length < Reminders.maxRoutines || _editing != null)
                SgCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text(_editing != null ? tr('routine.edit', 'Edit routine') : tr('routine.add', 'Add a routine'), style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (opts.isEmpty)
                      Text(tr('routine.new.stop_required', 'Open a stop or save a favourite first'), style: TextStyle(color: sg.muted))
                    else
                      DropdownButtonFormField<String>(
                        initialValue: _code,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: tr('settings.stop', 'Stop')),
                        items: [for (final o in opts) DropdownMenuItem(value: o.code, child: Text('${o.name} (${o.code})', overflow: TextOverflow.ellipsis))],
                        onChanged: (v) => setState(() => _code = v),
                      ),
                    const SizedBox(height: 8),
                    TextField(controller: _buses, decoration: InputDecoration(labelText: tr('favs.group.buses', 'Buses'), hintText: tr('routine.new.buses', 'All of them, or some: 22, 222, or 22* for every 22'))),
                    const SizedBox(height: 8),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.schedule),
                      title: Text(_time.format(context)),
                      onTap: () async {
                        final t = await showTimePicker(context: context, initialTime: _time);
                        if (t != null) setState(() => _time = t);
                      },
                    ),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (var d = 1; d <= 7; d++)
                        FilterChip(
                          label: Text(Reminders.dayName(d)),
                          selected: _days.contains(d),
                          onSelected: (on) => setState(() => on ? _days.add(d) : _days.remove(d)),
                        ),
                    ]),
                    if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_error, style: TextStyle(color: sg.error))),
                    const SizedBox(height: 10),
                    Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                      if (_editing != null) TextButton(onPressed: () => setState(_reset), child: Text(tr('places.cancel', 'Cancel'))),
                      FilledButton(onPressed: opts.isEmpty ? null : _add, child: Text(_editing != null ? tr('common.save', 'Save') : tr('routine.addButton', 'Add'))),
                    ]),
                  ]),
                ),
            ]),
          );
        },
      );
}
