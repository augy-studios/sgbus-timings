// uwuCoins, Achievements and the feat window (the site's js/coins.js, js/eggs.js, js/confetti.js
// and js/celebrate.js): the wheel, a spin 100 coins, every spin winning something; each feat with
// how far along it is and its Share once done; the window that says a feat's done, with
// confetti; and for every MRT and LRT line ridden, the celebration: the whole network in its
// lines' colours, tilted and turning slowly, a gold trophy over it and confetti falling.
// The rules and the coins are data/rewards.dart's.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/eggs_data.dart';
import '../../data/gta6.dart';
import '../../data/rail_tracks.dart';
import '../../data/rewards.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/coin_icon.dart';
import '../../widgets/common.dart';
import '../nav/doors.dart' show lineColour;
import '../share/share_card.dart';

String _eggName(String id) => EggsData.byId(id)?.name() ?? id;

/// What an Easter egg link gave, in words (features/share/shared.dart): (title, more).
(String, String) eggLinkWords(({int? coins, String? egg, ({List<String> secrets, EggPreset? preset})? got, bool gta6}) r) {
  if (r.gta6) return (tr('coins.wonGta6', 'GTA VI’s colours!'), tr('coins.wonGta6More', 'They’re yours to keep. Pick them in Theme.'));
  if (r.egg != null) {
    final lines = <String>[];
    if (r.got?.secrets.isNotEmpty == true) {
      lines.add(tr('eggs.unlockedSecret', 'You’ve unlocked a secret: {what}', {'what': tr('eggs.got.colours', 'Your colours: pick one colour, and the app makes the whole theme from it.')}));
    }
    final preset = r.got?.preset;
    if (preset != null) {
      lines.add(Feats.coloursUnlocked
          ? tr('eggs.gotPreset', 'Your colours has a new preset: {name}.', {'name': preset.name()})
          : tr('eggs.presetLater', 'It also comes with a preset, {name}, for when Your colours is unlocked.', {'name': preset.name()}));
    }
    return (tr('coins.wonEgg', 'An Easter egg: {name}!', {'name': _eggName(r.egg!)}), lines.join(' '));
  }
  return (tr('coins.wonCoins', '{n} uwuCoins!', {'n': r.coins}), '');
}

/// The ways in, and the windows the rules ask for.
void registerCoins() {
  AppNav.register('coins', (_) => CoinsScreen.open());
  AppNav.register('achievements', (_) => AchievementsScreen.open());
  Rewards.I.onCoins = (n) => AppNav.say(tr('coins.toast', '+{n} uwuCoins', {'n': n}));
  Rewards.I.onFeat = (id, {team}) => showFeat(id, team: team);
  // Past trips' coins and feats, once, a little after the app opens.
  Timer(const Duration(seconds: 4), () {
    final got = Retrofit.run();
    if (got != null) _tellRetrofit(got);
    final fresh = Feats.settle().where((s) => !Feats.told().contains(s)).toList();
    if (fresh.isNotEmpty) {
      fresh.forEach(Feats.tell);
      _window(
        title: tr('eggs.catchUp.title', 'A secret for your eggs'),
        name: '',
        how: tr('eggs.catchUp.how', 'You’d found more Easter eggs than secrets unlocked.'),
        got: tr('eggs.unlockedSecret', 'You’ve unlocked a secret: {what}', {'what': tr('eggs.got.colours', 'Your colours: pick one colour, and the app makes the whole theme from it.')}),
        count: tr('eggs.count', '{n} of {all} Easter eggs found', {'n': Feats.eggs().length, 'all': EggsData.all.length}),
        go: (tr('eggs.go', 'Open Theme'), () => AppNav.open('theme')),
      );
    }
  });
}

void _tellRetrofit(({int trips, int coins, List<String> feats}) r) {
  final all = r.coins + r.feats.length * Feats.featCoins;
  if (all == 0 || !Coins.shown || !Coins.pops) return;
  final names = r.feats.map(_eggName).join('; ');
  final head = r.trips == 1
      ? tr('retrofit.trip', 'Your trip from before uwuCoins has earned its coins: +{coins} uwuCoins.', {'coins': r.coins})
      : r.trips > 0
          ? tr('retrofit.trips', 'Your {n} trips from before uwuCoins have earned theirs: +{coins} uwuCoins.', {'n': r.trips, 'coins': r.coins})
          : tr('retrofit.ridesOnly', 'Your trips from before uwuCoins count towards the feats.');
  final featText = r.feats.length == 1
      ? tr('retrofit.feat', 'Feat done: {names}, +{n} uwuCoins.', {'names': names, 'n': Feats.featCoins})
      : r.feats.isNotEmpty
          ? tr('retrofit.feats', 'Feats done: {names}, +{n} uwuCoins each.', {'names': names, 'n': Feats.featCoins})
          : '';
  final spin = tr('retrofit.spin', '{n} uwuCoins in all, for a spin of the wheel in Settings.', {'n': all});
  if (r.feats.contains('lines')) {
    Celebration.open('${tr('eggs.lines.text', 'You’ve ridden every MRT and LRT line.')} $head $featText $spin'.replaceAll(RegExp(r'\s+'), ' ').trim());
    return;
  }
  _window(
    title: tr('retrofit.title', 'Coins for your past trips'),
    name: tr('coins.wonCoins', '{n} uwuCoins!', {'n': all}),
    how: head,
    got: [featText, spin].where((s) => s.isNotEmpty).join(' '),
    count: tr('eggs.featCount', '{n} of {all} feats done', {'n': Feats.done().length, 'all': EggsData.all.length}),
    go: (tr('coins.spinGo', 'Spin the wheel'), CoinsScreen.open),
    confetti: true,
  );
}

/// A feat done: said once, in its window, or for every line ridden, the celebration.
void showFeat(String id, {String? team}) {
  final def = EggsData.byId(id);
  if (def == null) return;
  final coins = Coins.shown ? tr('eggs.featCoins', '+{n} uwuCoins, for a spin of the wheel in Settings.', {'n': Feats.featCoins}) : '';
  if (id == 'lines') {
    Celebration.open('${tr('eggs.lines.text', 'You’ve ridden every MRT and LRT line.')} $coins'.trim());
    return;
  }
  _window(
    title: tr('eggs.featDone', 'You did something special!'),
    name: def.name(),
    how: team != null ? tr('eggs.teamHow', 'Your team run, {team}, did it together: {goal}', {'team': team, 'goal': def.goal()}) : def.how(),
    got: coins,
    count: tr('eggs.featCount', '{n} of {all} feats done', {'n': Feats.done().length, 'all': EggsData.all.length}),
    go: Coins.shown ? (tr('coins.spinGo', 'Spin the wheel'), CoinsScreen.open) : null,
    confetti: true,
  );
}

/// A feat shared with you (a /feat/ link): what they did, and how far along you are.
void showSharedFeat(Map data) {
  final who = (data['name'] as String?)?.isNotEmpty == true ? data['name'] as String : tr('eggs.shared.someone', 'Someone');
  final theirs = [for (final id in (data['done'] as List? ?? const [])) if (EggsData.byId('$id') != null) '$id'];
  final one = EggsData.byId('${data['feat']}');
  final mine = Feats.done();
  _window(
    title: one != null ? tr('eggs.shared.title', '{who} did a feat!', {'who': who}) : tr('eggs.shared.titleAll', '{who}’s achievements', {'who': who}),
    name: one?.name() ?? tr('eggs.featCount', '{n} of {all} feats done', {'n': theirs.length, 'all': EggsData.all.length}),
    how: one != null
        ? (mine.contains(one.id) ? tr('eggs.shared.youToo', 'You’ve done this one too.') : tr('eggs.shared.yourTurn', 'Your turn: {goal}', {'goal': one.goal()}))
        : theirs.map(_eggName).join(' · '),
    got: '',
    count: tr('eggs.shared.you', 'You: {n} of {all} feats done', {'n': mine.length, 'all': EggsData.all.length}),
    go: (tr('achievements.see', 'See your achievements'), AchievementsScreen.open),
    confetti: one != null,
  );
}

void _window({required String title, required String name, required String how, required String got, required String count, (String, VoidCallback)? go, bool confetti = false}) {
  final context = AppNav.context;
  if (context == null) return;
  showDialog<void>(
    context: context,
    builder: (c) {
      final sg = c.sg;
      return Stack(children: [
        AlertDialog(
          title: Text(title),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (name.isNotEmpty) Text(name, style: Theme.of(c).textTheme.titleLarge?.copyWith(color: sg.brandInk, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(how),
            if (got.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(got, style: const TextStyle(fontWeight: FontWeight.w600))),
            const SizedBox(height: 8),
            Text(count, style: TextStyle(color: sg.muted, fontSize: 13)),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: Text(tr('unlock.later', 'Later'))),
            if (go != null)
              FilledButton(
                onPressed: () {
                  Navigator.pop(c);
                  go.$2();
                },
                child: Text(go.$1),
              ),
          ],
        ),
        if (confetti && !MediaQuery.disableAnimationsOf(c)) const Positioned.fill(child: IgnorePointer(child: Confetti())),
      ]);
    },
  );
}

// ---------- the wheel ----------

class CoinsScreen extends StatefulWidget {
  const CoinsScreen({super.key});
  static Future<void> open() => AppNav.push(const CoinsScreen(), name: 'coins');

  @override
  State<CoinsScreen> createState() => _CoinsScreenState();
}

class _CoinsScreenState extends State<CoinsScreen> with SingleTickerProviderStateMixin {
  static const _spinMs = 5000;
  static const _turns = 6;
  late final _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: _spinMs));
  double _from = 0, _to = 0; // in turns
  bool _spinning = false;
  int _held = 0; // a spin's winnings, kept off the balance until the wheel stops on them
  String? _result;
  String? _resultMore;
  bool _confetti = false;

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  Future<void> _spin() async {
    final r = Coins.spin();
    if (r == null) return;
    final still = MediaQuery.disableAnimationsOf(context);
    final slice = 1 / Coins.slots.length;
    final at = r.index * slice + (math.Random().nextDouble() - 0.5) * slice * 0.7;
    setState(() {
      _spinning = true;
      _held = r.coins ?? 0;
      _result = null;
      _confetti = false;
      _from = _to;
      _to = _from + (still ? 0 : _turns) + (((-_from - at) % 1) + 1) % 1;
    });
    _anim.duration = Duration(milliseconds: still ? 50 : _spinMs);
    await _anim.forward(from: 0);
    if (!mounted) return;
    setState(() {
      _spinning = false;
      _held = 0;
      if (r.gta6) {
        _result = tr('coins.wonGta6', 'GTA VI’s colours!');
        _resultMore = tr('coins.wonGta6More', 'They’re yours to keep. Pick them in Theme.');
        _confetti = true;
      } else if (r.egg != null) {
        _result = tr('coins.wonEgg', 'An Easter egg: {name}!', {'name': _eggName(r.egg!)});
        final lines = <String>[];
        if (r.got?.secrets.isNotEmpty == true) {
          lines.add(tr('eggs.unlockedSecret', 'You’ve unlocked a secret: {what}', {'what': tr('eggs.got.colours', 'Your colours: pick one colour, and the app makes the whole theme from it.')}));
        }
        final preset = r.got?.preset;
        if (preset != null) {
          lines.add(Feats.coloursUnlocked
              ? tr('eggs.gotPreset', 'Your colours has a new preset: {name}.', {'name': preset.name()})
              : tr('eggs.presetLater', 'It also comes with a preset, {name}, for when Your colours is unlocked.', {'name': preset.name()}));
        }
        _resultMore = lines.join(' ');
        _confetti = true;
      } else {
        _result = tr('coins.wonCoins', '{n} uwuCoins!', {'n': r.coins});
        _resultMore = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Rewards.I,
        builder: (context, _) {
          final sg = context.sg;
          final balance = Coins.balance - _held;
          final need = Coins.spinCost - Coins.balance;
          return SgScaffold(
            title: tr('coins.title', 'uwuCoins'),
            body: Stack(children: [
              ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
                if (!Coins.shown)
                  Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(tr('coins.showNote', "Off hides uwuCoins everywhere: the wheel, the Edge Tray's coin and the pop-ups. Trips and feats still earn them meanwhile, so they're all there if you turn it back on."), style: TextStyle(color: sg.muted))),
                SgCard(
                  child: Column(children: [
                    Row(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                      const CoinIcon(size: 28),
                      const SizedBox(width: 6),
                      TweenAnimationBuilder<double>(
                        tween: Tween(end: balance.toDouble()),
                        duration: const Duration(milliseconds: 1000),
                        curve: Curves.easeOutCubic,
                        builder: (_, v, _) => Text('${v.round()}', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 6),
                      Text(tr('coins.unit', 'uwuCoins'), style: TextStyle(color: sg.muted)),
                    ]),
                    const SizedBox(height: 12),
                    // The pointer at the top, over the wheel.
                    SizedBox(
                      width: 260,
                      height: 280,
                      child: Stack(alignment: Alignment.topCenter, children: [
                        Positioned(
                          top: 16,
                          child: AnimatedBuilder(
                            animation: _anim,
                            builder: (_, _) {
                              final t = Curves.easeOutQuart.transform(_anim.value);
                              final turns = _spinning ? _from + (_to - _from) * t : _to;
                              return Transform.rotate(
                                angle: turns * 2 * math.pi,
                                child: SizedBox(width: 260, height: 260, child: CustomPaint(painter: _WheelPainter(sg, Theme.of(context).colorScheme))),
                              );
                            },
                          ),
                        ),
                        Icon(Icons.arrow_drop_down, size: 44, color: sg.ink),
                      ]),
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _spinning || Coins.balance < Coins.spinCost ? null : _spin,
                      icon: const Icon(Icons.casino_outlined),
                      label: Text(tr('coins.spin', 'Spin for {n}', {'n': Coins.spinCost})),
                    ),
                    if (need > 0 && !_spinning) Padding(padding: const EdgeInsets.only(top: 6), child: Text(tr('coins.need', '{n} more uwuCoins for a spin.', {'n': need}), style: TextStyle(color: sg.muted))),
                    if (_result != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Semantics(
                          liveRegion: true,
                          child: Text.rich(
                            TextSpan(children: [
                              TextSpan(text: _result, style: const TextStyle(fontWeight: FontWeight.w700)),
                              if (_resultMore?.isNotEmpty == true) TextSpan(text: ' $_resultMore'),
                            ]),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                  ]),
                ),
                if (Gta6.due) Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr('coins.gta6Due', 'The egg slice wins GTA VI’s colours first.'), style: const TextStyle(fontWeight: FontWeight.w600))),
                const SizedBox(height: 8),
                Text(
                    '${tr('eggs.featCount', '{n} of {all} feats done', {'n': Feats.done().length, 'all': EggsData.all.length})} · ${tr('eggs.count', '{n} of {all} Easter eggs found', {'n': Feats.eggs().length, 'all': EggsData.all.length})}',
                    style: TextStyle(color: sg.muted)),
                const SizedBox(height: 6),
                Text(
                    tr('coins.how',
                        'Every spin wins something: an Easter egg you haven’t found, with a secret or a colour preset, or more coins. Coins come from trips taken with the Get Off Alert to the end: more for longer trips, changes, and each bus and train operator and line you ride with. Each feat gives 100 more.'),
                    style: TextStyle(color: sg.muted, fontSize: 13)),
                const SizedBox(height: 8),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Wrap(spacing: 8, runSpacing: 8, children: [
                    OutlinedButton.icon(onPressed: AchievementsScreen.open, icon: const Icon(Icons.emoji_events_outlined), label: Text(tr('achievements.see', 'See your achievements'))),
                    // Not while a spin's going: it'd give the prize away.
                    OutlinedButton.icon(onPressed: _spinning ? null : CoinsHistory.open, icon: const Icon(Icons.receipt_long_outlined), label: Text(tr('coins.history', 'History'))),
                  ]),
                ),
                const SizedBox(height: 8),
                SgCard(
                  padding: EdgeInsets.zero,
                  child: Column(children: [
                    SwitchListTile(
                      value: Coins.shown,
                      onChanged: (v) => setState(() => Coins.shown = v),
                      title: Text(tr('coins.showTitle', 'Show uwuCoins')),
                    ),
                    if (Coins.shown)
                      SwitchListTile(
                        value: Coins.pops,
                        onChanged: (v) => setState(() => Coins.pops = v),
                        title: Text(tr('coins.popsTitle', 'Coin pop-ups')),
                        subtitle: Text(tr('coins.popsNote', 'The +uwuCoins that floats up after a trip, and the window for coins from past trips. Off, the coins still come in quietly.')),
                      ),
                  ]),
                ),
              ]),
              if (_confetti) const Positioned.fill(child: IgnorePointer(child: Confetti())),
            ]),
          );
        },
      );
}

// ---------- History ----------

/// What an entry of the log was, and a line more on where it came from (the site's entryWords).
({String what, String more}) coinEntryWords(Map e) {
  switch (e['why']) {
    case 'trip':
      var name = '${e['name'] ?? ''}';
      if (name.isEmpty) {
        // Where a trip's name is, if the log hasn't one: Your trips, while it's there.
        final t = Store.I.list('sgbus_trips').whereType<Map>().where((x) => x['id'] == e['trip']).firstOrNull;
        name = '${t?['title'] ?? ''}';
        if (name.isEmpty) name = '${(t?['to'] as Map?)?['label'] ?? ''}';
      }
      final parts = (e['parts'] as Map?) ?? const {};
      String part(String key, String word) => (parts[key] as num? ?? 0) > 0 ? word : '';
      final n = {for (final k in parts.keys) '$k': parts[k]};
      return (
        what: name.isNotEmpty ? tr('coins.log.trip', 'Trip: {name}', {'name': name}) : tr('coins.log.aTrip', 'A trip'),
        more: [
          part('finish', tr('coins.part.finish', '{n} for getting there', {'n': n['finish']})),
          part('km', tr('coins.part.km', '{n} for the distance', {'n': n['km']})),
          part('changes', tr('coins.part.changes', '{n} for changes', {'n': n['changes']})),
          part('busOps', tr('coins.part.busOps', '{n} for bus operators', {'n': n['busOps']})),
          part('trainOps', tr('coins.part.trainOps', '{n} for train operators', {'n': n['trainOps']})),
          part('lines', tr('coins.part.lines', '{n} for lines', {'n': n['lines']})),
        ].where((w) => w.isNotEmpty).join(' · '),
      );
    case 'feat':
      final team = e['team'] as String?;
      return (
        what: tr('coins.log.feat', 'Feat: {name}', {'name': _eggName('${e['feat']}')}),
        more: team != null
            ? tr('achievements.withTeam', 'Done with your team run, {team}', {'team': team})
            : e['past'] == true
                ? tr('coins.log.pastTrip', 'From a trip before uwuCoins')
                : '',
      );
    case 'past':
      return (what: tr('coins.log.past', 'Trips from before uwuCoins'), more: e['trips'] != null ? tr('coins.log.pastN', '{n} trips', {'n': e['trips']}) : '');
    case 'spin':
      return (what: tr('coins.log.spin', 'A spin of the wheel'), more: '');
    case 'wheel':
      return (what: tr('coins.log.wheel', 'Won on the wheel'), more: '');
    case 'egg':
      return (what: tr('coins.log.egg', 'Won on the wheel: {name}', {'name': _eggName('${e['egg']}')}), more: tr('coins.log.eggNote', 'An Easter egg'));
    case 'gta6':
      return (what: tr('coins.log.gta6', 'Won on the wheel: GTA VI’s colours'), more: '');
    case 'simulated':
      return (what: tr('coins.log.simulated', 'Added from the console'), more: '');
    case 'sync':
      return (what: tr('coins.log.sync', 'Added by sync'), more: '');
    case 'egglink':
      return (what: tr('coins.log.eggLink', 'From an Easter egg link'), more: '');
    default:
      return (what: tr('coins.log.other', 'uwuCoins'), more: '');
  }
}

/// Every coin in and out and where it came from, newest first, by the day in Singapore.
class CoinsHistory extends StatefulWidget {
  const CoinsHistory({super.key});
  static Future<void> open() => AppNav.push(const CoinsHistory(), name: 'coinsHistory');

  @override
  State<CoinsHistory> createState() => _CoinsHistoryState();
}

class _CoinsHistoryState extends State<CoinsHistory> {
  String _filter = 'all';

  String _day(int at) {
    final label = When.dayLabel(at);
    final year = When.sgClock(at).year;
    final words = '${label[0].toUpperCase()}${label.substring(1)}';
    return year == When.sgClock(When.nowMs()).year ? words : '$words $year';
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Rewards.I,
        builder: (context, _) {
          final sg = context.sg;
          final log = Coins.log.where((e) => e['n'] is num).toList();
          num earned = 0, spent = 0;
          for (final e in log) {
            final n = e['n'] as num;
            if (n > 0) earned += n;
            if (n < 0) spent -= n;
          }
          final wanted = log.where((e) => _filter == 'earned' ? (e['n'] as num) >= 0 : _filter == 'spent' ? (e['n'] as num) < 0 : true).toList();
          // The day's heading before its first entry.
          final rows = <Object>[];
          String? last;
          for (final e in wanted) {
            final at = ((e['at'] as num?) ?? 0).toInt();
            final ymd = When.sgClock(at).ymd;
            if (ymd != last) rows.add(_day(at));
            last = ymd;
            rows.add(e);
          }
          return SgScaffold(
            title: tr('coins.history', 'History'),
            body: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
              itemCount: rows.length + 1,
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final (id, word) in [('all', tr('coins.history.all', 'All')), ('earned', tr('coins.history.earned', 'Earned')), ('spent', tr('coins.history.spent', 'Spent'))])
                        Pill(label: word, on: _filter == id, onTap: () => setState(() => _filter = id)),
                    ]),
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(tr('coins.history.totals', 'Earned {earned} · Spent {spent}', {'earned': earned, 'spent': spent}), style: TextStyle(color: sg.muted)),
                    ),
                    if (rows.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Text(tr('coins.history.none', 'Nothing yet. A trip taken with the Get Off Alert to the end earns your first uwuCoins.'), style: TextStyle(color: sg.muted)),
                      ),
                  ]);
                }
                final row = rows[i - 1];
                if (row is String) return SectionLabel(row);
                final e = row as Map;
                final n = e['n'] as num;
                final words = coinEntryWords(e);
                final amount = n > 0 ? '+${n.toInt()}' : n < 0 ? '−${(-n).toInt()}' : e['why'] == 'gta6' ? '🎨' : '🥚';
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(words.what, style: const TextStyle(fontWeight: FontWeight.w600)),
                        if (words.more.isNotEmpty) Text(words.more, style: TextStyle(color: sg.muted, fontSize: 13)),
                      ]),
                    ),
                    const SizedBox(width: 12),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(amount, style: TextStyle(fontWeight: FontWeight.w700, color: n > 0 ? sg.ok : n < 0 ? sg.error : sg.ink)),
                      Text(When.clock(((e['at'] as num?) ?? 0).toInt()), style: TextStyle(color: sg.muted, fontSize: 13)),
                    ]),
                  ]),
                );
              },
            ),
          );
        },
      );
}

class _WheelPainter extends CustomPainter {
  _WheelPainter(this.sg, this.scheme);
  final SgColors sg;
  final ColorScheme scheme;

  @override
  void paint(Canvas canvas, Size size) {
    final n = Coins.slots.length;
    final r = size.width / 2;
    final c = Offset(r, r);
    for (var i = 0; i < n; i++) {
      final coins = Coins.slotNow(i);
      final start = (i / n) * 2 * math.pi - math.pi / n - math.pi / 2;
      final slice = sg.slice(i);
      final fill = coins == null
          ? const Color(0xFFF2B31B)
          : slice?.$1 ?? (i.isOdd ? sg.brand : sg.surfaceStrong);
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), start, 2 * math.pi / n, true, Paint()..color = fill);
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), start, 2 * math.pi / n, true, Paint()
        ..color = sg.border
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5);
      final a = (i / n) * 2 * math.pi - math.pi / 2;
      final at = c + Offset(math.cos(a), math.sin(a)) * r * 0.66;
      canvas.save();
      canvas.translate(at.dx, at.dy);
      canvas.rotate(a + math.pi / 2);
      final tp = TextPainter(
        text: TextSpan(
          text: coins == null ? (Gta6.due ? '🎨' : '🥚') : '$coins',
          style: TextStyle(color: coins == null ? Colors.black : slice?.$2 ?? (i.isOdd ? sg.onBrand : sg.ink), fontSize: 20, fontWeight: FontWeight.w800),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      canvas.restore();
    }
    canvas.drawCircle(c, 20, Paint()..color = sg.ink);
    canvas.drawCircle(c, r, Paint()
      ..color = sg.ink.withValues(alpha: 0.6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3);
  }

  @override
  bool shouldRepaint(_WheelPainter old) => true;
}

// ---------- Achievements ----------

class AchievementsScreen extends StatelessWidget {
  const AchievementsScreen({super.key});
  static Future<void> open() => AppNav.push(const AchievementsScreen(), name: 'achievements');

  void _share(BuildContext context, String? id) {
    final done = Feats.done();
    if (done.isEmpty || (id != null && !done.contains(id))) return;
    final count = tr('eggs.featCount', '{n} of {all} feats done', {'n': done.length, 'all': EggsData.all.length});
    ShareCard.show(
      context,
      ShareCard(
        heading: id != null ? tr('share.feat.heading', 'Share this feat') : tr('share.feats.heading', 'Share your achievements'),
        name: id != null ? _eggName(id) : count,
        sub: id != null ? count : done.map(_eggName).join(' · '),
        kind: 'feat',
        data: {'feat': id, 'done': done, 'name': Store.I.get('sgbus_name'), 'on': id != null ? Feats.doneOn(id) : null},
        text: id != null
            ? tr('share.feat.text', 'I did a feat on SG Bus Timings: {name}!', {'name': _eggName(id)})
            : tr('share.feats.text', 'I’ve done {n} of {all} feats on SG Bus Timings!', {'n': done.length, 'all': EggsData.all.length}),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Rewards.I,
        builder: (context, _) {
          final sg = context.sg;
          final all = Feats.progress();
          final done = all.where((a) => a.done).length;
          return SgScaffold(
            title: tr('settings.achievements', 'Achievements'),
            actions: [
              if (done > 0) IconButton(tooltip: tr('achievements.shareAll', 'Share your achievements'), onPressed: () => _share(context, null), icon: const Icon(Icons.share_outlined)),
            ],
            body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
              Text(tr('eggs.featCount', '{n} of {all} feats done', {'n': done, 'all': all.length}), style: Theme.of(context).textTheme.titleMedium),
              Text(tr('eggs.count', '{n} of {all} Easter eggs found', {'n': Feats.eggs().length, 'all': EggsData.all.length}), style: TextStyle(color: sg.muted)),
              const SizedBox(height: 8),
              for (final a in all)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: SgCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        if (a.done) Padding(padding: const EdgeInsets.only(right: 6), child: Icon(Icons.emoji_events, color: const Color(0xFFE0A100), size: 20)),
                        Expanded(child: Text(a.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                        Text(
                          a.done ? tr('achievements.done', 'Done') : a.need > 1 ? tr('achievements.of', '{have} of {need}', {'have': a.have, 'need': a.need}) : tr('achievements.notYet', 'Not yet'),
                          style: TextStyle(color: a.done ? sg.ok : sg.muted, fontWeight: FontWeight.w600),
                        ),
                      ]),
                      const SizedBox(height: 4),
                      Text(a.how, style: TextStyle(color: sg.muted)),
                      if (a.team != null) Text(tr('achievements.withTeam', 'Done with your team run, {team}', {'team': a.team}), style: TextStyle(color: sg.brandInk, fontSize: 13)),
                      const SizedBox(height: 8),
                      Semantics(
                        label: a.name,
                        value: '${a.have} / ${a.need}',
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(value: a.have / a.need, minHeight: 8, backgroundColor: sg.surfaceStrong, color: a.done ? sg.ok : sg.brandInk),
                        ),
                      ),
                      if (a.egg) Padding(padding: const EdgeInsets.only(top: 6), child: Text(tr('achievements.eggFound', 'Its Easter egg: found'), style: TextStyle(color: sg.brandInk))),
                      if (a.done)
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: TextButton.icon(onPressed: () => _share(context, a.id), icon: const Icon(Icons.share_outlined, size: 18), label: Text(tr('achievements.share', 'Share'))),
                        ),
                    ]),
                  ),
                ),
              SgCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: const Icon(Icons.groups_outlined),
                  title: Text(tr('team.title', 'Team run')),
                  subtitle: Text(tr('team.about', 'Speedrun the feats with friends.').split('.').first),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => AppNav.open('team'),
                ),
              ),
              const SizedBox(height: 10),
              Text(tr('achievements.eggsNote', 'Each feat is worth 100 uwuCoins once. Its Easter egg comes from the uwuCoins wheel, in Help and extras.'), style: TextStyle(color: sg.muted, fontSize: 13)),
              const SizedBox(height: 6),
              Text(tr('achievements.ridesNote', 'Rides count here once your phone’s location shows you took them, so these can be fewer than the rides in Your trips.'), style: TextStyle(color: sg.muted, fontSize: 13)),
            ]),
          );
        },
      );
}

// ---------- confetti ----------

/// Confetti falling for a few seconds, in the lines' colours (the site's js/confetti.js).
class Confetti extends StatefulWidget {
  const Confetti({super.key, this.seconds = 4});
  final int seconds;

  @override
  State<Confetti> createState() => _ConfettiState();
}

class _ConfettiState extends State<Confetti> with SingleTickerProviderStateMixin {
  // Done, it's gone, whatever is showing it (the site's tidy() removes its canvas).
  bool _done = false;
  late final _anim = AnimationController(vsync: this, duration: Duration(seconds: widget.seconds))
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) setState(() => _done = true);
    })
    ..forward();
  final _bits = List.generate(140, (i) {
    final r = math.Random(i * 7919);
    return (x: r.nextDouble(), delay: r.nextDouble() * 0.35, speed: 0.6 + r.nextDouble() * 0.8, sway: r.nextDouble() * 2 * math.pi, spin: r.nextDouble() * 6, colour: _colours[i % _colours.length], w: 6 + r.nextDouble() * 6);
  });
  static const _colours = [Color(0xFFD42E12), Color(0xFF009645), Color(0xFF9900AA), Color(0xFFFA9E0D), Color(0xFF005EC4), Color(0xFF9D5B25), Color(0xFFF2B31B)];

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _done ? const SizedBox.shrink() : AnimatedBuilder(animation: _anim, builder: (_, _) => CustomPaint(size: Size.infinite, painter: _ConfettiPainter(_bits, _anim.value)));
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.bits, this.t);
  final List<({double x, double delay, double speed, double sway, double spin, Color colour, double w})> bits;
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    // All of it fades over the last quarter, as the site's does over its last second.
    final fade = ((1 - t) / 0.25).clamp(0.0, 1.0);
    if (fade <= 0) return;
    for (final b in bits) {
      // Each piece falls the whole height, top to past the bottom, the faster ones sooner: a
      // slow one stopped short used to stay mid-screen once the time was up.
      final life = (1 - b.delay) / math.max(1.0, b.speed);
      final p = (t - b.delay) / life;
      if (p <= 0 || p >= 1) continue;
      final y = -20 + p * (size.height + 60);
      final x = b.x * size.width + math.sin(b.sway + p * 8) * 24;
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(b.spin * p * 6);
      canvas.drawRect(Rect.fromCenter(center: Offset.zero, width: b.w, height: b.w * 0.45), Paint()..color = b.colour.withValues(alpha: (1 - p * 0.6) * fade));
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.t != t;
}

// ---------- the celebration ----------

/// Every MRT and LRT line ridden: the network in its lines' colours, tilted and turning slowly,
/// a gold trophy over it and confetti, then Spin the wheel or Close. Still, with reduced motion.
class Celebration extends StatefulWidget {
  const Celebration({super.key, required this.text});
  final String text;

  static Future<void> open(String text) {
    final context = AppNav.context;
    if (context == null) return Future.value();
    return Navigator.of(context).push(PageRouteBuilder<void>(
      opaque: false,
      barrierColor: Colors.black87,
      pageBuilder: (_, _, _) => Celebration(text: text),
      transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
    ));
  }

  @override
  State<Celebration> createState() => _CelebrationState();
}

class _CelebrationState extends State<Celebration> with SingleTickerProviderStateMixin {
  late final _turn = AnimationController(vsync: this, duration: const Duration(seconds: 40));
  List<({String line, List<List<double>> points})> _lines = [];

  @override
  void initState() {
    super.initState();
    RailTracks.lines().then((l) {
      if (mounted) setState(() => _lines = l);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!MediaQuery.disableAnimationsOf(context)) _turn.repeat();
    });
  }

  @override
  void dispose() {
    _turn.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.disableAnimationsOf(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(children: [
        Positioned.fill(
          child: AnimatedBuilder(
            animation: _turn,
            builder: (_, _) => Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..setEntry(3, 2, 0.0012)
                ..rotateX(0.95)
                ..rotateZ(_turn.value * 2 * math.pi),
              child: CustomPaint(painter: _NetworkPainter(_lines)),
            ),
          ),
        ),
        if (!still) const Positioned.fill(child: IgnorePointer(child: Confetti(seconds: 6))),
        SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.emoji_events, size: 120, color: Color(0xFFF2B31B), shadows: [Shadow(color: Colors.black54, blurRadius: 16)]),
                const SizedBox(height: 12),
                Text(tr('eggs.lines', 'Every line ridden'),
                    textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text(widget.text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16)),
                const SizedBox(height: 20),
                Wrap(spacing: 12, children: [
                  if (Coins.shown)
                    FilledButton(
                      onPressed: () {
                        Navigator.pop(context);
                        CoinsScreen.open();
                      },
                      child: Text(tr('coins.spinGo', 'Spin the wheel')),
                    ),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54)),
                    onPressed: () => Navigator.pop(context),
                    child: Text(tr('common.close', 'Close')),
                  ),
                ]),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _NetworkPainter extends CustomPainter {
  _NetworkPainter(this.lines);
  final List<({String line, List<List<double>> points})> lines;

  @override
  void paint(Canvas canvas, Size size) {
    if (lines.isEmpty) return;
    const centre = [1.3521, 103.8198];
    final scale = size.shortestSide / 0.42;
    Offset at(List<double> p) => Offset(size.width / 2 + (p[1] - centre[1]) * scale, size.height / 2 - (p[0] - centre[0]) * scale);
    canvas.drawRect(Rect.fromCenter(center: Offset(size.width / 2, size.height / 2), width: size.shortestSide * 1.1, height: size.shortestSide * 0.8), Paint()..color = const Color(0xFF1B2226));
    for (final l in lines) {
      if (l.points.length < 2) continue;
      final path = Path()..moveTo(at(l.points.first).dx, at(l.points.first).dy);
      for (final p in l.points.skip(1)) {
        path.lineTo(at(p).dx, at(p).dy);
      }
      canvas.drawPath(path, Paint()
        ..color = lineColour(l.line == 'CG' ? 'EW' : l.line)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round);
    }
  }

  @override
  bool shouldRepaint(_NetworkPainter old) => old.lines != lines;
}
