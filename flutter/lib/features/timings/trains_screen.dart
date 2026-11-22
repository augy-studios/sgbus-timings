// A station's train times (data/trains.dart), from a station search ("Tampines MRT"): each
// platform's next trains, refreshed every half a minute, the minutes counting down between.
// As the site's #trainsModal (main-site/js/trains.js); keep their words in step.
import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../app/nav.dart';
import '../../data/campus.dart';
import '../../data/stations.dart';
import '../../data/trains.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/colours.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';

class TrainsScreen extends StatefulWidget {
  const TrainsScreen({super.key, required this.name, required this.codes});
  final String name;
  final List<String> codes;

  static Future<void> open(Station station) async {
    unawaited(Trains.warm());
    AppNav.push(TrainsScreen(name: station.name, codes: station.codes), name: 'trains', address: '#trains/${station.codes.join(',')}');
  }

  @override
  State<TrainsScreen> createState() => _TrainsScreenState();
}

class _TrainsScreenState extends State<TrainsScreen> {
  TrainsData? _data;
  bool _loading = true;
  Timer? _tick;
  int _askedAt = 0;

  @override
  void initState() {
    super.initState();
    _load();
    // The minutes count down; the answer's asked for again every half a minute.
    _tick = Timer.periodic(const Duration(seconds: 10), (_) {
      if (When.nowMs() - _askedAt >= 30 * 1000) {
        _load();
      } else if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    _askedAt = When.nowMs();
    final data = await Trains.load(widget.codes);
    if (!mounted) return;
    setState(() {
      _data = data ?? _data;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: Text(tr('trains.titleAt', 'Trains at {station}', {'station': widget.name}), overflow: TextOverflow.ellipsis)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: EdgeInsets.fromLTRB(16, 0, 16, 32 + MediaQuery.paddingOf(context).bottom), children: [
          if (data == null)
            SgCard(child: EmptyNote(_loading ? tr('trains.loading', 'Loading train times…') : tr('trains.failed', 'Couldn’t get the train times. Try again in a moment.')))
          else ...[
            if (data.usual)
              _Note(tr('trains.usualNote', 'Offline: LTA’s usual timetable for today. Works or a disruption may change it.'), color: sg.warn)
            else ...[
              if (data.offline) _Note(tr('trains.savedNote', 'Offline: times saved earlier today.'), color: sg.warn),
              _Note(data.live
                  ? tr('trains.liveNote', 'Live: LTA reports a disruption here. Changed and cancelled trains are marked.')
                  : tr('trains.timetableNote', 'Timetable times from LTA. LTA gives live train times only during a disruption.')),
            ],
            for (final p in data.platforms) _PlatformCard(data: data, platform: p),
          ],
        ]),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text, {this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.fromLTRB(4, 4, 4, 10), child: Text(text, style: TextStyle(color: color ?? context.sg.muted, fontSize: 13)));
}

/// The bus pills' red (the map card's "last 3 buses"), behind the last three trains' white marks:
/// 5.4:1 under white.
const lastRed = Color(0xFFD1242F);

/// What an app card is painted with ([SgCard]): Material You's surfaceContainerLow, or the theme's
/// surface over its background (see-through in the UwU Apps theme).
Color cardColour(ThemeData t, {bool? materialYou}) {
  final sg = t.extension<SgColors>()!;
  final c = (materialYou ?? AppLook.I.materialYou) ? t.colorScheme.surfaceContainerLow : sg.surface;
  return Color.alphaBlend(c, sg.bg);
}

/// The red for writing about the last trains on [on]: the site's darker red on a light card, its
/// lighter one on a dark card, whichever reads better (both are 4.5:1 or more on every theme's
/// cards, test/trains_contrast_test.dart). #D1242F as writing fell short on light grey.
Color lastRedOn(Color on) {
  // The site's two, then a deeper and a paler one for a mid grey (High contrast's map bubble).
  const reds = [Color(0xFFB91C1C), Color(0xFFFFA198), Color(0xFF991B1B), Color(0xFFFFC9C4)];
  double r(Color c) => Colours.contrast(hexOf(c), hexOf(on));
  for (final c in reds) {
    if (r(c) >= Colours.aa) return c;
  }
  return reds.reduce((a, b) => r(a) >= r(b) ? a : b);
}

/// The red for writing on this screen's cards.
Color lastRedText(BuildContext context) => lastRedOn(cardColour(Theme.of(context), materialYou: context.materialYou));

/// "Last train", "2nd last", "3rd last".
String rankText(int r) => r == 1 ? tr('trains.rank1', 'Last train') : r == 2 ? tr('trains.rank2', '2nd last') : tr('trains.rank3', '3rd last');

/// A platform's last train today, red once only its last three are left; nothing when none is.
class LastTrainLine extends StatelessWidget {
  const LastTrainLine({super.key, required this.data, required this.platform, this.on});
  final TrainsData data;
  final TrainPlatform platform;

  /// What it's written on, when not a card (the map's bubble).
  final Color? on;
  @override
  Widget build(BuildContext context) {
    final lastMs = Trains.lastTrainMs(data, platform);
    if (lastMs == null) return const SizedBox.shrink();
    final left = Trains.left(data, platform, When.nowMs());
    final red = left > 0 && left <= 3;
    return Padding(
      padding: const EdgeInsets.only(top: 2, bottom: 2),
      child: Text(
        tr('trains.lastAt', 'Last train today at {time}', {'time': When.clock(lastMs)}),
        style: TextStyle(fontSize: 13, color: red ? (on != null ? lastRedOn(on!) : lastRedText(context)) : context.sg.muted, fontWeight: red ? FontWeight.w600 : null),
      ),
    );
  }
}

/// A platform as the map's station card shows it: its next trains as chips, the last three red
/// and marked, then its last train today. As the site's Trains.compactHtml.
class TrainsCompact extends StatelessWidget {
  const TrainsCompact({super.key, required this.data, required this.platform, this.on});
  final TrainsData data;
  final TrainPlatform platform;

  /// What it sits on, when not a card (the map's bubble), for its last train line's red.
  final Color? on;
  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final now = When.nowMs();
    final ranks = Trains.lastRanks(platform);
    final next = data.trainsFrom(platform, now).where((x) => x.state != 2).take(Trains.nextN).toList();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (next.isEmpty)
          Text(
            platform.first != null
                ? tr('trains.lastGone', 'No more trains today. First train tomorrow at {time}.', {'time': When.clock(data.start + (platform.first![0] + 86400) * 1000)})
                : tr('trains.noneToday', 'No more trains today.'),
            style: TextStyle(color: sg.muted, fontSize: 13),
          )
        else
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final x in next)
              () {
                final r = ranks[(x.ms - data.start) ~/ 1000];
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: r != null ? lastRed : const Color(0xFF15803D),
                    borderRadius: BorderRadius.circular(10),
                    border: x.state == 1 ? Border.all(color: sg.warn, width: 2) : null,
                  ),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(trainWhen(x.ms, now), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    // What its colour means, in words too (WCAG 1.4.1).
                    if (r != null || x.state == 1)
                      Text([if (r != null) rankText(r), if (x.state == 1) tr('trains.changed', 'New time')].join(' · '),
                          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                  ]),
                );
              }(),
          ]),
        LastTrainLine(data: data, platform: platform, on: on),
      ]),
    );
  }
}

/// "Now", "4 min", or the clock past an hour away.
String trainWhen(int ms, int now) {
  final s = (ms - now) / 1000;
  if (s <= Trains.nowS) return tr('trains.now', 'Now');
  final min = (s / 60).round();
  if (min >= 60) return When.clock(ms);
  return tr('trains.min', '{n} min', {'n': '$min'});
}

class _PlatformCard extends StatelessWidget {
  const _PlatformCard({required this.data, required this.platform});
  final TrainsData data;
  final TrainPlatform platform;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final p = platform;
    final now = When.nowMs();
    final list = data.trainsFrom(p, now).take(Trains.nextN + 1).toList();
    final ranks = Trains.lastRanks(p);
    final heads = {for (final x in list) x.head}.toList();
    final towards = (heads.isEmpty ? p.heads : heads).join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SgCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: sg.brand.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (p.colour != null) ...[
                  Container(width: 10, height: 10, decoration: BoxDecoration(color: Campus.colorOf(p.colour!), shape: BoxShape.circle)),
                  const SizedBox(width: 5),
                ],
                Text(p.line ?? p.code, style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(tr('trains.towards', 'Towards {place}', {'place': towards}), style: const TextStyle(fontWeight: FontWeight.w600))),
            if (p.platform.isNotEmpty) Text(tr('trains.platform', 'Platform {p}', {'p': p.platform}), style: TextStyle(color: sg.muted, fontSize: 12)),
          ]),
          LastTrainLine(data: data, platform: p),
          const SizedBox(height: 4),
          if (list.isEmpty)
            Text(
              p.first != null
                  ? tr('trains.lastGone', 'No more trains today. First train tomorrow at {time}.', {'time': When.clock(data.start + (p.first![0] + 86400) * 1000)})
                  : tr('trains.noneToday', 'No more trains today.'),
              style: TextStyle(color: sg.muted),
            )
          else
            for (final x in list)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(children: [
                  SizedBox(
                    width: 80,
                    child: Text(
                      x.state == 2 ? tr('trains.cancelled', 'Cancelled') : trainWhen(x.ms, now),
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: x.state == 1 ? sg.warn : x.state == 2 ? sg.muted : ranks.containsKey((x.ms - data.start) ~/ 1000) ? lastRedText(context) : null,
                        decoration: x.state == 2 ? TextDecoration.lineThrough : null,
                      ),
                    ),
                  ),
                  if (heads.length > 1) Expanded(child: Text(x.head, style: TextStyle(color: sg.muted))) else const Spacer(),
                  // A new time from the disruption feed, in words as well as orange (WCAG 1.4.1).
                  if (x.state == 1)
                    Container(
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                      decoration: BoxDecoration(border: Border.all(color: sg.warn), borderRadius: BorderRadius.circular(999)),
                      child: Text(tr('trains.changed', 'New time'), style: TextStyle(color: sg.warn, fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  if (ranks[(x.ms - data.start) ~/ 1000] case final r?)
                    Container(
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                      decoration: BoxDecoration(color: lastRed, borderRadius: BorderRadius.circular(999)),
                      child: Text(rankText(r), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  Text(When.clock(x.ms), style: TextStyle(color: sg.muted, decoration: x.state == 2 ? TextDecoration.lineThrough : null)),
                ]),
              ),
        ]),
      ),
    );
  }
}
