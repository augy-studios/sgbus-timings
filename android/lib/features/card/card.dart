// Card value and Scan a stop's code (the site's js/card.js and js/scan.js).
//
// Card value: the stored value on an EZ-Link or NETS FlashPay card, read by holding it to the back
// of the phone (CardPlugin). Holding a card to the phone with the app closed opens it too
// ("tapped"). Cards on SimplyGo keep their value in the SimplyGo account, so the card's own
// figure can be out of date for them. A value outside what a card can hold isn't shown, and the
// card's data can be copied (without its numbers) to work out why.
//
// Scan: the camera, a still from it every so often to the app's on-device text reader
// (ScanPlugin, ML Kit), and the first 5-digit number that's a real stop opens its timings.
import 'dart:async';
import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/nav.dart';
import '../../data/stops.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../timings/stop_screen.dart';

void registerCard() {
  AppNav.register('card', (_) => CardSheet.open());
  AppNav.register('scan', (_) => AppNav.push(const ScanScreen(), name: 'scan'));
  // A card held to the phone while nothing was waiting for one, already read by the app.
  Native.on('Card', 'tapped', (c) => CardSheet.open(tapped: c));
  Native.on('Card', 'reading', (_) {
    final open = CardSheet._state;
    if (open != null) {
      open._readingNow();
    } else {
      CardSheet.open(reading: true);
    }
  });
}

class CardSheet extends StatefulWidget {
  const CardSheet._({this.tapped, this.reading = false});
  final Map<String, dynamic>? tapped;
  final bool reading;

  static _CardSheetState? _state;

  static Future<void> open({Map<String, dynamic>? tapped, bool reading = false}) async {
    if (_state != null) {
      if (tapped != null) _state!._tapped(tapped);
      return;
    }
    final context = AppNav.context;
    if (context == null || !Native.has('card')) return;
    await showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => CardSheet._(tapped: tapped, reading: reading));
  }

  @override
  State<CardSheet> createState() => _CardSheetState();
}

class _CardSheetState extends State<CardSheet> {
  static const _maxCents = 50000;
  static const _minCents = -1000;
  bool _reading = false;
  String _stage = 'wait'; // wait, reading, nonfc, off, card, error
  Map<String, dynamic>? _card;
  String? _error;
  String? _raw;
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    CardSheet._state = this;
    if (widget.tapped != null) {
      _tapped(widget.tapped!);
    } else if (widget.reading) {
      _stage = 'reading';
    } else {
      _read();
    }
  }

  @override
  void dispose() {
    if (CardSheet._state == this) CardSheet._state = null;
    if (_reading) Native.call('Card', 'cancel').catchError((_) => null);
    super.dispose();
  }

  void _readingNow() => setState(() => _stage = 'reading');

  Future<void> _read() async {
    if (_reading) return;
    final s = await Native.call('Card', 'status').catchError((_) => <String, dynamic>{'nfc': 'none'});
    if (!mounted) return;
    if (s?['nfc'] == 'none') return setState(() => _stage = 'nonfc');
    if (s?['nfc'] == 'off') return setState(() => _stage = 'off');
    setState(() {
      _reading = true;
      _stage = 'wait';
    });
    try {
      _show(await Native.call('Card', 'read') ?? const {});
    } on NativeError catch (e) {
      _fail(e.code, e.data?['raw'] as String?);
    } finally {
      _reading = false;
    }
  }

  void _tapped(Map<String, dynamic> c) {
    if (_reading) return;
    if (c['error'] != null) {
      _fail('${c['error']}', c['raw'] as String?);
    } else {
      _show(c);
    }
  }

  void _show(Map<String, dynamic> c) {
    HapticFeedback.mediumImpact();
    Future.delayed(const Duration(milliseconds: 100), HapticFeedback.mediumImpact);
    if (!mounted) return;
    setState(() {
      _raw = c['raw'] as String?;
      _card = c;
      _stage = 'card';
      _copied = false;
    });
  }

  void _fail(String? code, String? raw) {
    if (code == 'cancelled' || !mounted) return;
    setState(() {
      _raw = raw;
      _stage = code == 'off' ? 'off' : 'error';
      _error = switch (code) {
        'not-cepas' => tr('card.notCepas', "That card couldn't be read as an EZ-Link or NETS FlashPay card. Bank cards and phones can't be read for a value."),
        'lost' => tr('card.lost', 'The card moved away too soon. Hold it still against the phone, and try again.'),
        _ => tr('card.failed', "Couldn't read the card. Try again."),
      };
    });
  }

  static String _dollars(num cents) => '${cents < 0 ? '−' : ''}\$${(cents.abs() / 100).toStringAsFixed(2)}';
  static String _can(String s) => s.replaceAllMapped(RegExp(r'(.{4})(?=.)'), (m) => '${m[1]} ');
  static String _date(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).add(const Duration(hours: 8));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  Widget _wait(IconData icon, String title, String sub) {
    final sg = context.sg;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(children: [
        Icon(icon, size: 56, color: sg.brandInk),
        const SizedBox(height: 10),
        Text(title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 4),
        Text(sub, textAlign: TextAlign.center, style: TextStyle(color: sg.muted)),
      ]),
    );
  }

  Widget _rawBlock() {
    if (_raw == null) return const SizedBox.shrink();
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      title: Text(tr('card.data', 'Card data')),
      children: [
        SelectableText(_raw!, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: _raw!));
              setState(() => _copied = true);
            },
            icon: const Icon(Icons.copy),
            label: Text(_copied ? tr('share.copied', 'Copied') : tr('card.copy', 'Copy')),
          ),
        ),
      ],
    );
  }

  List<Widget> _cardBody() {
    final sg = context.sg;
    final c = _card!;
    final balance = (c['balance'] as num?) ?? double.nan;
    final done = Row(children: [
      Icon(Icons.check_circle, color: sg.ok),
      const SizedBox(width: 6),
      Expanded(child: Text(tr('card.done', 'Done: you can take your card away.'), style: TextStyle(color: sg.ok, fontWeight: FontWeight.w600))),
    ]);
    if (!(balance >= _minCents && balance <= _maxCents)) {
      return [
        done,
        const SizedBox(height: 8),
        Text(tr('card.unreadable', "This card's value couldn't be read."), style: const TextStyle(fontWeight: FontWeight.w700)),
        Text(tr('card.unreadableHelp', "Check it in the SimplyGo app for now. To help fix this, open Card data below, copy it and send it to us: it doesn't include your card's number."),
            style: TextStyle(color: sg.muted)),
        _rawBlock(),
      ];
    }
    final expiry = (c['expiry'] as num?)?.toInt() ?? 0;
    final autoload = (c['autoload'] as num?) ?? 0;
    final history = (c['history'] as List? ?? const []).whereType<Map>().take(15).toList();
    return [
      done,
      const SizedBox(height: 8),
      Text(_dollars(balance), style: Theme.of(context).textTheme.displayMedium?.copyWith(fontWeight: FontWeight.w800)),
      Text(tr('card.onCard', 'on card {can}', {'can': _can('${c['can'] ?? ''}')}), style: TextStyle(color: sg.muted)),
      const SizedBox(height: 8),
      Row(children: [
        Text('${tr('card.expires', 'Expires')}: ', style: const TextStyle(fontWeight: FontWeight.w600)),
        if (expiry < DateTime.now().millisecondsSinceEpoch) Text('${tr('card.expired', 'Expired')} ', style: TextStyle(color: sg.error, fontWeight: FontWeight.w700)),
        Text(_date(expiry)),
      ]),
      if (c['autoloadOn'] == true && autoload > 0 && autoload <= _maxCents)
        Text('${tr('card.autoTopUp', 'Auto top-up')}: ${tr('card.whenLow', '{amount} when it runs low', {'amount': _dollars(autoload)})}'),
      if (balance < 300)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(children: [
            Icon(Icons.warning_amber_rounded, color: sg.warn),
            const SizedBox(width: 6),
            Expanded(child: Text(tr('card.low', 'Under \$3: top up before your next ride.'), style: TextStyle(color: sg.warn))),
          ]),
        ),
      if (history.isNotEmpty) ...[
        SectionLabel(tr('card.history', 'Recent rides and top-ups')),
        for (final h in history)
          () {
            final type = '${h['type']}';
            final amount = (h['amount'] as num?) ?? 0;
            final icon = switch (type) {
              'bus' || 'refund' => Icons.directions_bus_outlined,
              'train' => Icons.train_outlined,
              _ => Icons.credit_card,
            };
            final label = switch (type) {
              'bus' => tr('history.bus', 'Bus'),
              'train' => tr('card.train', 'Train'),
              'topup' => tr('card.topUp', 'Top-up'),
              'refund' => tr('card.refund', 'Bus refund'),
              _ => tr('card.other', 'Other'),
            };
            final what = type == 'bus' || type == 'refund' ? tr('favs.bus', 'Bus {no}', {'no': '${h['what'] ?? ''}'.replaceFirst(RegExp(r'^BUS\s*', caseSensitive: false), '')}) : '${h['what'] ?? ''}';
            final time = (h['time'] as num?)?.toInt() ?? 0;
            final d = DateTime.fromMillisecondsSinceEpoch(time, isUtc: true).add(const Duration(hours: 8));
            return ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              leading: Icon(icon),
              title: Text(what.isNotEmpty ? what : label),
              subtitle: Text('${_date(time)}, ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}'),
              trailing: Text('${amount > 0 ? '+' : ''}${_dollars(amount)}', style: TextStyle(color: amount > 0 ? sg.ok : sg.ink, fontWeight: FontWeight.w600)),
            );
          }(),
      ],
      const SizedBox(height: 8),
      Text(tr('card.simplygo', 'A card on SimplyGo keeps its value in your SimplyGo account, so this can be out of date for it: check the SimplyGo app.'), style: TextStyle(color: sg.muted, fontSize: 13)),
      _rawBlock(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final again = _stage == 'card' || _stage == 'error';
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(tr('settings.card_value', 'Card value'), style: Theme.of(context).textTheme.titleLarge),
          ...switch (_stage) {
            'nonfc' => [Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(tr('card.noNfc', "This phone can't read cards: it has no NFC.")))],
            'off' => [
                Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(tr('offline.nfcOff', 'NFC is off. Turn it on, then come back here.'))),
                FilledButton.tonalIcon(
                  onPressed: () => Native.call('SgBus', 'openSettings', {'what': 'nfc'}).catchError((_) => null),
                  icon: const Icon(Icons.settings_outlined),
                  label: Text(tr('html.turn_on_nfc', 'Turn on NFC')),
                ),
              ],
            'reading' => [_wait(Icons.contactless, tr('card.reading', 'Reading your card…'), tr('card.keepHolding', 'Keep holding it still. It takes about a second.'))],
            'card' => _cardBody(),
            'error' => [Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(_error ?? '')), _rawBlock()],
            _ => [_wait(Icons.credit_card, tr('card.hold', 'Hold your card to the back of the phone'), tr('card.nearCamera', "Near the camera on most phones. Keep it still until it's read."))],
          },
          if (again) Padding(padding: const EdgeInsets.only(top: 8), child: FilledButton.icon(onPressed: _read, icon: const Icon(Icons.contactless), label: Text(tr('html.read_another', 'Read another')))),
          const SizedBox(height: 8),
          Text(tr('html.ez_link_and_nets_flashpay', 'EZ-Link and NETS FlashPay cards. Nothing is written to the card, and what it says stays on this phone.'),
              style: TextStyle(color: context.sg.muted, fontSize: 13)),
        ]),
      ),
    );
  }
}

// ---------- scan a stop's code ----------

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> with WidgetsBindingObserver {
  static const _every = Duration(milliseconds: 900);
  CameraController? _camera;
  Timer? _timer;
  bool _looking = false;
  String _status = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _status = tr('scan.point', 'Point the camera at the 5-digit code on the bus stop’s pole');
    Stops.load();
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) Navigator.of(context).maybePop();
  }

  Future<void> _start() async {
    try {
      final cams = await availableCameras();
      final back = cams.where((c) => c.lensDirection == CameraLensDirection.back).firstOrNull ?? cams.first;
      final c = CameraController(back, ResolutionPreset.high, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      await c.initialize();
      await c.setFlashMode(FlashMode.off);
      if (!mounted) {
        await c.dispose();
        return;
      }
      setState(() => _camera = c);
      _timer = Timer.periodic(_every, (_) => _look());
    } catch (_) {
      if (mounted) setState(() => _status = tr('scan.noCamera', 'The camera isn’t allowed. Allow Camera for SG Bus Timings in Android’s settings, then try again.'));
    }
  }

  void _stop() {
    _timer?.cancel();
    _camera?.dispose();
    _camera = null;
  }

  Future<void> _look() async {
    final c = _camera;
    if (_looking || c == null || !c.value.isInitialized || c.value.isTakingPicture) return;
    _looking = true;
    try {
      final shot = await c.takePicture();
      final bytes = await shot.readAsBytes();
      final r = await Native.call('Scan', 'read', {'image': base64Encode(bytes)});
      final text = '${r?['text'] ?? ''}';
      final code = RegExp(r'\b\d{5}\b').allMatches(text).map((m) => m[0]!).where((c) => Stops.of(c) != null).firstOrNull;
      if (code != null && mounted) {
        HapticFeedback.lightImpact();
        _stop();
        Navigator.of(context).pop();
        StopScreen.open(code);
      }
    } catch (_) {
      // Busy, or nothing readable: the next one.
    } finally {
      _looking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _camera;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        if (c != null && c.value.isInitialized) Positioned.fill(child: FittedBox(fit: BoxFit.cover, child: SizedBox(width: c.value.previewSize!.height, height: c.value.previewSize!.width, child: CameraPreview(c)))),
        // The frame to put the code in.
        Center(
          child: FractionallySizedBox(
            widthFactor: 0.8,
            child: AspectRatio(
              aspectRatio: 1.6,
              child: Container(decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 3), borderRadius: BorderRadius.circular(16))),
            ),
          ),
        ),
        SafeArea(
          child: Column(children: [
            Align(
              alignment: AlignmentDirectional.topStart,
              child: IconButton(tooltip: tr('common.close', 'Close'), onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.close, color: Colors.white)),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Text(_status, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16, shadows: [Shadow(blurRadius: 6)])),
            ),
          ]),
        ),
      ]),
    );
  }
}
