// Team runs (the site's js/team.js): the feats speedrun as a team. One of you starts a team run
// with a name, the rest join with its code or link (#team/<code>), up to eight at once, and the
// rides and trips any of you take count for the whole team. Each member's phone gets every feat
// the team does since they joined, with its uwuCoins (Feats.feat(id, team: name)).
//
// What counts is what counts in your own Achievements, from your phone: a ride judged real
// (RideCheck), sent as its line or bus and what it's towards First to last and Ends of the
// island, and a trip taken with the Get Off Alert to the end with a real ride on it. Each goes to
// /api/team once, through an outbox (sgbus_team_outbox) kept until it's taken.
//
// Every phone works the team's feats out from the same rides and trips (fold): each line, bus,
// stop or station by any of you; 100 rides between you; and a trip, or trips handed on (a
// teammate's starting within 400 m of where another's ended, from 5 minutes before it ended to
// 30 after), for the long way round, there and back again, and the old railway.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../data/eggs_data.dart';
import '../../data/geo.dart';
import '../../data/rewards.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../nav/nav_page.dart';

class TeamRun {
  TeamRun._();
  static const key = 'sgbus_team';
  static const outboxKey = 'sgbus_team_outbox';
  static const cacheKey = 'sgbus_team_cache';
  static const handoffM = 400.0;
  static const handoffEarlyMs = 5 * 60 * 1000;
  static const handoffGapMs = 30 * 60 * 1000;
  static const _outboxMax = 500;
  static const _sendMax = 50;
  static final codeRe = RegExp(r'^[a-z0-9]{10}$');
  static final changes = ValueNotifier<int>(0);
  static String message = '';

  static Map<String, dynamic>? mine() {
    final v = Store.I.map(key);
    final member = v['member'] as Map?;
    return v['id'] is String && codeRe.hasMatch(v['id'] as String) && member?['id'] != null && member?['secret'] != null ? v : null;
  }

  static List<Map> outbox() => Store.I.list(outboxKey).whereType<Map>().toList();
  static Map<String, dynamic>? cached() {
    final v = Store.I.map(cacheKey);
    return v.isNotEmpty && v['id'] == mine()?['id'] ? v : null;
  }

  static void _changed() => changes.value++;

  static Future<Map<String, dynamic>> _api(Map<String, Object?>? body, [Map<String, Object?>? query]) async {
    final r = body == null ? await Api.get('team', query: query) : await Api.post('team', body);
    return r is Map<String, dynamic> ? r : <String, dynamic>{};
  }

  // ---------- what this phone sends ----------

  static void _queue(String kind, Map<String, Object?> data) {
    final me = mine();
    if (me == null) return;
    final eid = '${(me['member'] as Map)['id']}-${When.nowMs().toRadixString(36)}${math.Random().nextInt(1 << 30).toRadixString(36)}';
    final box = [...outbox(), {'eid': eid, 'kind': kind, 'data': data}];
    Store.I.putJson(outboxKey, box.skip(math.max(0, box.length - _outboxMax)).toList());
    refresh();
  }

  static void ride(Map<String, Object?> r) {
    if (r['mode'] != 'bus' && r['mode'] != 'train') return;
    _queue('ride', {'mode': r['mode'], 'line': r['line'] ?? '', 'bus': r['bus'] ?? '', 'first': r['first'] ?? const [], 'end': r['end'] ?? ''});
  }

  static void tripDone(Map<String, Object?> t) {
    if (t['start'] == null || t['end'] == null) return;
    _queue('trip', {'start': t['start'], 'end': t['end'], 'via': t['via'], 'startedAt': t['startedAt'], 'endedAt': t['endedAt']});
  }

  static Future<bool> _flush(Map me) async {
    final member = me['member'] as Map;
    for (var box = outbox(); box.isNotEmpty; box = outbox()) {
      final batch = box.take(_sendMax).toList();
      try {
        await _api({'action': 'add', 'id': me['id'], 'member': member['id'], 'secret': member['secret'], 'events': batch});
      } on ApiError catch (e) {
        if (e.status == 404) {
          _gone();
          return false;
        }
        if (e.status == 400) {
          // Each on its own, the refused dropped.
          for (final ev in batch) {
            try {
              await _api({'action': 'add', 'id': me['id'], 'member': member['id'], 'secret': member['secret'], 'events': [ev]});
            } on ApiError catch (err) {
              if (err.status != 400) return true;
            }
            Store.I.putJson(outboxKey, outbox().where((x) => x['eid'] != ev['eid']).toList());
          }
          continue;
        }
        return true;
      } catch (_) {
        return true;
      }
      final sent = {for (final e in batch) e['eid']};
      Store.I.putJson(outboxKey, outbox().where((e) => !sent.contains(e['eid'])).toList());
    }
    return true;
  }

  static void _gone() {
    final was = mine();
    Store.I.put(key, null);
    Store.I.put(outboxKey, null);
    Store.I.put(cacheKey, null);
    if (was != null) message = tr('team.ended', 'Your team run, {team}, has ended.', {'team': was['name']});
    _changed();
  }

  // ---------- the team's feats ----------

  static List<double>? _pt(Object? p) => p is List && p.length >= 2 ? [(p[0] as num).toDouble(), (p[1] as num).toDouble()] : null;

  /// What the team has done: done { id: when }, have { id: (have, need) }, the longest trip,
  /// the rides between you, and the latest trip that can still be handed on.
  static ({Map<String, int> done, Map<String, (int, int)> have, int longest, int rides, Map? handoff}) fold(Map team) {
    final firsts = <String, Map<String, int>>{'lines': {}, 'buses': {}, 'first': {}, 'ends': {}};
    final done = <String, int>{};
    var rides = 0;
    void keep(Map<String, int> map, Object? k, int at) {
      if (k is String && k.isNotEmpty && !map.containsKey(k)) map[k] = at;
    }

    final events = (team['events'] as List? ?? const []).whereType<Map>().toList();
    for (final e in events) {
      if (e['kind'] != 'ride') continue;
      final d = (e['data'] as Map?) ?? const {};
      final at = (e['at'] as num?)?.toInt() ?? 0;
      rides++;
      if (rides == Feats.hundred) done['hundred'] = at;
      keep(firsts['lines']!, d['line'], at);
      keep(firsts['buses']!, d['bus'], at);
      for (final c in (d['first'] as List? ?? const [])) {
        keep(firsts['first']!, '$c', at);
      }
      keep(firsts['ends']!, d['end'], at);
    }
    final sets = <String, (String, List<String>)>{
      'lines': ('lines', RideCheck.lines),
      'up': ('buses', EggsData.byId('up')!.buses!),
      'down': ('buses', EggsData.byId('down')!.buses!),
      'first': ('first', Feats.firstLast),
      'ends': ('ends', Feats.ends.keys.toList()),
    };
    final have = <String, (int, int)>{'hundred': (math.min(rides, Feats.hundred), Feats.hundred)};
    sets.forEach((id, s) {
      final got = s.$2.where((k) => firsts[s.$1]![k] != null).toList();
      have[id] = (got.length, s.$2.length);
      if (got.length == s.$2.length) done[id] = s.$2.map((k) => firsts[s.$1]![k]!).reduce(math.max);
    });

    final trips = [
      for (final e in events)
        if (e['kind'] == 'trip' && e['data'] is Map && _pt((e['data'] as Map)['start']) != null && _pt((e['data'] as Map)['end']) != null)
          {
            'start': _pt((e['data'] as Map)['start'])!,
            'end': _pt((e['data'] as Map)['end'])!,
            'via': _pt((e['data'] as Map)['via']),
            'startedAt': (((e['data'] as Map)['startedAt'] as num?) ?? 0).toInt(),
            'endedAt': (((e['data'] as Map)['endedAt'] as num?) ?? 0).toInt(),
            'by': e['member'],
            'at': (e['at'] as num?)?.toInt() ?? 0,
          },
    ]..sort((a, b) => (a['startedAt'] as int) - (b['startedAt'] as int));
    final next = [
      for (final t in trips)
        [
          for (final u in trips)
            if (!identical(u, t) &&
                u['by'] != t['by'] &&
                (u['startedAt'] as int) > (t['startedAt'] as int) &&
                (u['startedAt'] as int) >= (t['endedAt'] as int) - handoffEarlyMs &&
                (u['startedAt'] as int) <= (t['endedAt'] as int) + handoffGapMs &&
                metresAB(t['end'] as List<double>, u['start'] as List<double>) <= handoffM)
              trips.indexOf(u),
        ],
    ];
    String? ktmAt(List<double> p) => Feats.ktm.entries.where((e) => metresAB(p, e.value) <= Feats.ktmM).firstOrNull?.key;
    void soonest(String id, int at) {
      if (done[id] == null || at < done[id]!) done[id] = at;
    }

    var longest = 0;
    for (var i = 0; i < trips.length; i++) {
      final s = trips[i];
      final sStart = s['start'] as List<double>;
      bool away(Map t) => [t['start'], t['end'], t['via']].whereType<List<double>>().any((p) => metresAB(p, sStart) >= Feats.loopAwayM);
      final from = ktmAt(sStart);
      final seen = <String>{};
      final todo = <(int, bool)>[(i, away(s))];
      while (todo.isNotEmpty) {
        final (j, far) = todo.removeLast();
        if (!seen.add('$j:$far')) continue;
        final t = trips[j];
        final at = math.max(s['at'] as int, t['at'] as int);
        final ms = (t['endedAt'] as int) - (s['startedAt'] as int);
        if (ms > longest) longest = ms;
        if (ms >= Feats.longMs) soonest('long', at);
        if (far && metresAB(t['end'] as List<double>, sStart) <= Feats.loopM) soonest('loop', at);
        final to = ktmAt(t['end'] as List<double>);
        if (from != null && to != null && from != to) soonest('ktm', at);
        for (final u in next[j]) {
          todo.add((u, far || away(trips[u])));
        }
      }
    }
    have['long'] = (math.min(longest, Feats.longMs), Feats.longMs);
    for (final id in ['loop', 'ktm']) {
      have[id] = (done[id] != null ? 1 : 0, 1);
    }
    Map? last;
    for (final t in trips) {
      if (last == null || (t['endedAt'] as int) > (last['endedAt'] as int)) last = t;
    }
    final handoff = last != null && When.nowMs() - (last['endedAt'] as int) <= handoffGapMs ? last : null;
    return (done: done, have: have, longest: longest, rides: rides, handoff: handoff);
  }

  static void _award(Map team, Map<String, int> done) {
    final me = mine();
    final member = (team['members'] as List? ?? const []).whereType<Map>().where((x) => x['id'] == (me?['member'] as Map?)?['id']).firstOrNull;
    if (member == null || member['left'] == true) return;
    final have = Feats.done().toSet();
    final joined = (member['joinedAt'] as num?)?.toInt() ?? 0;
    for (final id in Feats.ids) {
      final at = done[id];
      if (at != null && at >= joined && !have.contains(id)) Feats.feat(id, team: '${team['name']}');
    }
  }

  // ---------- fetching ----------

  static Future<void>? _busy;
  static Future<void>? _queued;

  static Future<void> refresh() {
    if (_busy != null) {
      return _queued ??= _busy!.then((_) {
        _queued = null;
        return refresh();
      });
    }
    return _busy = _run().catchError((_) {}).whenComplete(() => _busy = null);
  }

  static Future<void> _run() async {
    final me = mine();
    if (me == null) return;
    if (!await _flush(me)) return;
    Map<String, dynamic> team;
    try {
      team = await _api(null, {'id': me['id']});
    } on ApiError catch (e) {
      if (e.status == 404) _gone();
      return;
    }
    if (mine()?['id'] != me['id']) return;
    final memberId = (me['member'] as Map)['id'];
    if (!(team['members'] as List? ?? const []).whereType<Map>().any((x) => x['id'] == memberId && x['left'] != true)) {
      _gone();
      return;
    }
    Store.I.putJson(cacheKey, team);
    _award(team, fold(team).done);
    _changed();
  }

  // ---------- joining, starting, leaving ----------

  static Future<String?> start(Future<Map<String, dynamic>> Function() call, String you) async {
    if (mine() != null) return null;
    try {
      final got = await call();
      Store.I.putJson(key, {
        'id': got['id'],
        'name': got['name'],
        'member': {...?(got['member'] as Map?)?.cast<String, Object?>(), 'name': you},
        'joinedAt': When.nowMs(),
      });
      Store.I.put(outboxKey, null);
      message = '';
      _changed();
      await refresh();
      return null;
    } on ApiError catch (e) {
      return e.message;
    } catch (_) {
      return tr('share.wentWrong', 'Something went wrong. Please try again.');
    }
  }

  static Future<String?> create(String you, String team) =>
      start(() => _api({'action': 'create', 'team': team, 'name': you}), you);
  static Future<String?> join(String code, String you) => start(() => _api({'action': 'join', 'id': code, 'name': you}), you);

  static Future<String?> leave() async {
    final me = mine();
    if (me == null) return null;
    final member = me['member'] as Map;
    try {
      await _api({'action': 'leave', 'id': me['id'], 'member': member['id'], 'secret': member['secret']});
    } on ApiError catch (e) {
      if (e.status != 404) return e.message;
    }
    Store.I.put(key, null);
    Store.I.put(outboxKey, null);
    Store.I.put(cacheKey, null);
    message = tr('team.left', 'You’ve left {team}.', {'team': me['name']});
    _changed();
    return null;
  }

  static Timer? _timer;

  static void register() {
    Team.ride = ride;
    Team.tripDone = tripDone;
    AppNav.register('team', (a) => TeamScreen.open(code: a['code'] as String?));
    if (mine() != null) Timer(const Duration(seconds: 2), refresh);
    _timer ??= Timer.periodic(const Duration(seconds: 90), (_) {
      if (mine() != null && WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) refresh();
    });
  }
}

/// Achievements' Team run, as a screen of its own.
class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key, this.code});
  final String? code;

  static Future<void> open({String? code}) => AppNav.push(TeamScreen(code: code), name: 'team', address: code == null ? null : '#team/$code');

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> with WidgetsBindingObserver {
  late final _you = TextEditingController(text: Store.I.get('sgbus_name') ?? '');
  final _name = TextEditingController();
  late final _code = TextEditingController(text: widget.code ?? '');
  bool _busy = false;
  String _say = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final me = TeamRun.mine();
    if (widget.code != null) {
      if (me?['id'] == widget.code) {
        TeamRun.refresh();
      } else if (me != null) {
        _say = tr('team.inAnother', 'You’re in {team} already. Leave it to join another.', {'team': me['name']});
      } else {
        _say = tr('team.joinAsk', 'Put in your name and tap Join to join this team run.');
      }
    } else {
      TeamRun.refresh();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && TeamRun.mine() != null) TeamRun.refresh();
  }

  Future<void> _go(Future<String?> Function() call) async {
    setState(() {
      _busy = true;
      _say = tr('team.working', 'One moment…');
    });
    final err = await call();
    if (mounted) {
      setState(() {
        _busy = false;
        _say = err ?? '';
      });
    }
  }

  Future<void> _invite(Map me) async {
    final url = '${Api.site}/#team/${me['id']}';
    final text = tr('team.inviteText', 'Join my team run, {team}, in SG Bus Timings, to speedrun the feats together. Team code: {code}', {'team': me['name'], 'code': me['id']});
    try {
      await Native.call('SgBus', 'share', {'title': me['name'], 'text': text, 'url': url});
    } catch (_) {
      setState(() => _say = url);
    }
  }

  String _hm(int ms) {
    final mins = ms ~/ 60000;
    return tr('team.hm', '{h} h {m} min', {'h': mins ~/ 60, 'm': mins % 60});
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
        valueListenable: TeamRun.changes,
        builder: (context, _, _) {
          final sg = context.sg;
          final me = TeamRun.mine();
          final note = _say.isNotEmpty ? _say : TeamRun.message;
          final children = <Widget>[
            Text(
                tr('team.about',
                    'Speedrun the feats with friends. Rides and trips any of you take count for the whole team, and everyone gets each feat the team does, with its 100 uwuCoins. Hand a trip on by starting yours where a teammate’s ended, within 30 minutes.'),
                style: TextStyle(color: sg.muted)),
            if (note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(note, style: TextStyle(color: sg.brandInk, fontWeight: FontWeight.w600))),
            const SizedBox(height: 12),
          ];
          if (me == null) {
            children.addAll([
              TextField(controller: _you, maxLength: 30, decoration: InputDecoration(labelText: tr('team.yourName', 'Your name in the team'))),
              SectionLabel(tr('team.name', 'Start a team run')),
              Row(children: [
                Expanded(child: TextField(controller: _name, maxLength: 30, decoration: InputDecoration(hintText: tr('team.namePlaceholder', 'Team name, such as Night Owls')))),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () {
                          final you = _you.text.trim(), team = _name.text.trim();
                          if (you.isEmpty) return setState(() => _say = tr('team.needYou', 'Put in your name first, for your team to see.'));
                          if (team.isEmpty) return setState(() => _say = tr('team.needName', 'Give the team a name first.'));
                          _go(() => TeamRun.create(you, team));
                        },
                  child: Text(tr('team.create', 'Start')),
                ),
              ]),
              SectionLabel(tr('team.code', 'Or join one with its code')),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _code,
                    maxLength: 10,
                    autocorrect: false,
                    decoration: const InputDecoration(hintText: 'abcde12345'),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () {
                          final code = _code.text.trim().toLowerCase(), you = _you.text.trim();
                          if (!TeamRun.codeRe.hasMatch(code)) return setState(() => _say = tr('team.badCode', 'A team code is ten letters and numbers, such as abcde12345.'));
                          if (you.isEmpty) return setState(() => _say = tr('team.needYou', 'Put in your name first, for your team to see.'));
                          _go(() => TeamRun.join(code, you));
                        },
                  child: Text(tr('team.join', 'Join')),
                ),
              ]),
            ]);
          } else {
            final team = TeamRun.cached();
            children.add(Text.rich(TextSpan(children: [
              TextSpan(text: '${me['name']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
              TextSpan(text: ' · ${tr('team.codeIs', 'Code {code}', {'code': me['id']})}'),
            ])));
            if (team == null) {
              children.add(Text(tr('team.loading', 'Getting the team’s progress…'), style: TextStyle(color: sg.muted)));
            } else {
              final f = TeamRun.fold(team);
              final memberId = (me['member'] as Map)['id'];
              final names = [
                for (final x in (team['members'] as List? ?? const []).whereType<Map>())
                  if (x['left'] != true) x['id'] == memberId ? tr('team.you', '{name} (you)', {'name': x['name']}) : '${x['name']}',
              ];
              children.addAll([
                Text(tr('team.members', 'In the team: {names}', {'names': names.join(', ')}), style: TextStyle(color: sg.muted)),
                Text(
                    tr('team.summary', 'The team: {n} of {all} feats done, {rides} rides between you',
                        {'n': Feats.ids.where((id) => f.done[id] != null).length, 'all': Feats.ids.length, 'rides': f.rides}),
                    style: TextStyle(color: sg.muted)),
                const SizedBox(height: 8),
                for (final id in Feats.ids)
                  () {
                    final isDone = f.done[id] != null;
                    final (have, need) = f.have[id] ?? (0, 1);
                    final state = isDone
                        ? tr('achievements.done', 'Done')
                        : id == 'long'
                            ? (have > 0 ? _hm(have) : tr('achievements.notYet', 'Not yet'))
                            : need > 1
                                ? tr('achievements.of', '{have} of {need}', {'have': have, 'need': need})
                                : tr('achievements.notYet', 'Not yet');
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: SgCard(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(EggsData.byId(id)!.name(), style: const TextStyle(fontWeight: FontWeight.w700))),
                            Text(state, style: TextStyle(color: isDone ? sg.ok : sg.muted)),
                          ]),
                          if (!isDone) Text(EggsData.byId(id)!.goal(), style: TextStyle(color: sg.muted, fontSize: 13)),
                          const SizedBox(height: 6),
                          LinearProgressIndicator(value: isDone ? 1 : have / need, minHeight: 6, color: isDone ? sg.ok : sg.brandInk, backgroundColor: sg.surfaceStrong),
                        ]),
                      ),
                    );
                  }(),
              ]);
              final h = f.handoff;
              if (h != null) {
                final who = (team['members'] as List? ?? const []).whereType<Map>().where((x) => x['id'] == h['by']).firstOrNull?['name'] ?? '?';
                final ago = ((When.nowMs() - (h['endedAt'] as int)) / 60000).round();
                final left = math.max(0, (((h['endedAt'] as int) + TeamRun.handoffGapMs - When.nowMs()) / 60000).ceil());
                final mineToo = h['by'] == memberId;
                children.add(SgCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(mineToo
                        ? tr('team.handoffYours', 'Your trip ended {m} min ago. A teammate can carry it on from where you got to, for {left} min more.', {'m': ago, 'left': left})
                        : tr('team.handoff', '{name}’s trip ended {m} min ago. Carry it on from where they got to within {left} min, and it counts as the one trip.', {'name': who, 'm': ago, 'left': left})),
                    if (!mineToo)
                      TextButton.icon(
                        onPressed: () {
                          final end = h['end'] as List<double>;
                          openNav(from: NavEnd(tr('team.handoffPlace', 'Where {name} got to', {'name': who}), end[0], end[1]));
                        },
                        icon: const Icon(Icons.directions),
                        label: Text(tr('team.continue', 'Continue from there')),
                      ),
                  ]),
                ));
              }
            }
            children.addAll([
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.tonalIcon(onPressed: () => _invite(me), icon: const Icon(Icons.person_add_alt), label: Text(tr('team.invite', 'Invite to the team'))),
                // The same team in the Telegram bot (telegram-bot/src/teams.py).
                FilledButton.tonalIcon(
                  key: const ValueKey('teamTelegram'),
                  onPressed: () => Native.call('SgBus', 'openLink', {'url': 'https://t.me/sgbus_app?start=team_${me['id']}'}).catchError((_) => null),
                  icon: const Icon(Icons.send_outlined),
                  label: Text(tr('team.telegram', 'Join in Telegram')),
                ),
                TextButton.icon(
                  onPressed: () async {
                    final yes = await showDialog<bool>(
                      context: context,
                      builder: (c) => AlertDialog(
                        content: Text(tr('team.leaveConfirm', 'Leave {team}? The feats you’ve had from it stay yours.', {'team': me['name']})),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('places.cancel', 'Cancel'))),
                          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('team.leave', 'Leave the team run'))),
                        ],
                      ),
                    );
                    if (yes == true) _go(TeamRun.leave);
                  },
                  icon: const Icon(Icons.logout),
                  label: Text(tr('team.leave', 'Leave the team run')),
                ),
              ]),
            ]);
          }
          children.addAll([
            const SizedBox(height: 12),
            Text(tr('team.rules', 'Only rides your phone’s location shows you took count, as in your own Achievements. A team run ends 14 days after its last ride.'),
                style: TextStyle(color: sg.muted, fontSize: 13)),
          ]);
          return SgScaffold(
            title: tr('team.title', 'Team run'),
            body: RefreshIndicator(
              onRefresh: TeamRun.refresh,
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: children),
            ),
          );
        },
      );
}
