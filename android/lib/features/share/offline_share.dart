// Offline Sharing (the site's js/offline-share.js): the share card's button that hands the link
// to a phone nearby with no internet on either (OfflineSharePlugin), two ways at once:
//
//   Tap     hold the backs of the phones together: this phone answers as an NFC tag with the
//           link on it, so the other needs nothing open.
//   Nearby  the other phone opens Receive nearby (the Edge Tray) and shows up here by its name;
//           picking it sends the link over Bluetooth and Wi-Fi.
//
// And the link written onto a blank NFC sticker, so tapping it later opens it: a stop at the
// front door, Bus home by the desk.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/links.dart';
import '../../app/nav.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';

void registerOfflineShare() {
  AppNav.register('offlineShare', (a) => OfflineShare.open('send', url: '${a['url']}', title: '${a['label'] ?? ''}'));
  AppNav.register('receive', (_) => OfflineShare.open('receive'));
  AppNav.register('sticker', (a) => OfflineShare.open('sticker', url: '${a['url']}', title: '${a['label'] ?? ''}'));
  // A link that came from a phone nearby: one to the site only, opened as if it were tapped.
  Native.on('OfflineShare', 'received', (d) {
    final u = Uri.tryParse('${d['url']}');
    if (u == null || u.host != Uri.parse('https://sgbus.uwuapps.org').host) return;
    if (OfflineShare._open) AppNav.nav?.maybePop();
    Links.open(u.toString());
  });
}

class OfflineShare extends StatefulWidget {
  const OfflineShare._(this.mode, {this.url, this.title});
  final String mode; // send, receive, sticker
  final String? url;
  final String? title;

  static bool _open = false;

  static Future<void> open(String mode, {String? url, String? title}) {
    final context = AppNav.context;
    if (context == null) return Future.value();
    _open = true;
    return showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => OfflineShare._(mode, url: url, title: title))
        .whenComplete(() => _open = false);
  }

  @override
  State<OfflineShare> createState() => _OfflineShareState();
}

class _OfflineShareState extends State<OfflineShare> with WidgetsBindingObserver {
  late String _mode = widget.mode;
  Map<String, dynamic>? _status;
  String? _writing; // waiting, done, off, or what went wrong
  int _tapped = 0;
  final Map<String, ({String name, String state, String? message})> _peers = {};
  bool _finding = false;
  bool _listening = false;
  String? _incoming;
  String? _problem; // permission, failed
  final _subs = <NativeListener>[];

  Future<Map<String, dynamic>?> _call(String method, [Map<String, dynamic>? options]) => Native.call('OfflineShare', method, options);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _subs.addAll([
      Native.on('OfflineShare', 'found', (d) {
        final id = '${d['id']}';
        if (_mode != 'send' || _peers[id]?.state == 'sent') return;
        setState(() => _peers[id] = (name: '${d['name'] ?? ''}', state: 'found', message: null));
      }),
      Native.on('OfflineShare', 'lost', (d) {
        if (_peers['${d['id']}']?.state == 'found') setState(() => _peers.remove('${d['id']}'));
      }),
      Native.on('OfflineShare', 'sent', (d) {
        if (_mode != 'send') return;
        HapticFeedback.mediumImpact();
        setState(() {
          if (d['via'] == 'tap') {
            _tapped++;
          } else if (_peers['${d['id']}'] != null) {
            final p = _peers['${d['id']}']!;
            _peers['${d['id']}'] = (name: p.name, state: 'sent', message: null);
          }
        });
      }),
      Native.on('OfflineShare', 'failed', (d) {
        final p = _peers['${d['id']}'];
        if (p != null) setState(() => _peers['${d['id']}'] = (name: p.name, state: 'failed', message: d['message'] as String?));
      }),
      Native.on('OfflineShare', 'incoming', (d) {
        if (_mode == 'receive') setState(() => _incoming = '${d['name'] ?? 'a phone'}');
      }),
    ]);
    _begin();
  }

  void _begin() {
    if (_mode == 'send') _startSending();
    if (_mode == 'receive') _receive();
    if (_mode == 'sticker') _write();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final s in _subs) {
      s.cancel();
    }
    if (_writing == 'waiting') _call('cancelWrite').catchError((_) => null);
    if (_mode == 'send') _call('stop').catchError((_) => null);
    if (_mode == 'receive') _call('stopReceiving').catchError((_) => null);
    super.dispose();
  }

  // Back from NFC's or the app's settings: as it is now.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    if (_mode == 'send') {
      _startSending();
    } else if (_mode == 'sticker' && (_writing == 'off' || _writing == null)) {
      _write();
    } else if (_problem == 'permission') {
      _receive();
    }
  }

  String get _name => (Store.I.get('sgbus_name') ?? '').trim();

  Future<void> _startSending() async {
    _status = await _call('status').catchError((_) => null);
    if (!mounted || _mode != 'send' || _status == null) return;
    await _call('share', {'url': widget.url}).catchError((_) => null);
    if (!mounted) return;
    setState(() {});
    if (_status!['nearby'] == true && _status!['allowed'] == true && !_finding) _find();
  }

  Future<void> _find() async {
    setState(() {
      _problem = null;
      _finding = true;
    });
    try {
      await _call('find');
    } on NativeError catch (e) {
      _finding = false;
      _problem = e.code == 'permission' ? 'permission' : 'failed';
    }
    if (mounted) setState(() {});
  }

  void _sendTo(String id) {
    final p = _peers[id];
    if (p == null || p.state == 'sending') return;
    setState(() => _peers[id] = (name: p.name, state: 'sending', message: null));
    _call('send', {'id': id, 'name': p.name, 'from': _name}).catchError((_) {
      if (mounted) {
        setState(() => _peers[id] = (name: p.name, state: 'failed', message: tr('offline.peerFailed', "Couldn't reach that phone. Try again, closer to it.")));
      }
      return null;
    });
  }

  Future<void> _write() async {
    setState(() => _writing = 'waiting');
    try {
      await _call('write', {'url': widget.url});
      _writing = 'done';
      HapticFeedback.mediumImpact();
    } on NativeError catch (e) {
      _writing = e.code == 'cancelled'
          ? null
          : e.code == 'off'
              ? 'off'
              : (e.message.isNotEmpty ? e.message : tr('offline.writeFailed', 'Couldn’t write it. Try again.'));
    }
    if (mounted) setState(() {});
  }

  Future<void> _receive() async {
    setState(() {
      _problem = null;
      _incoming = null;
    });
    _status = await _call('status').catchError((_) => null);
    try {
      await _call('receive', {'name': _name});
      _listening = true;
    } on NativeError catch (e) {
      _problem = e.code == 'permission' ? 'permission' : 'failed';
    }
    if (mounted) setState(() {});
  }

  void _settings(String what) => Native.call('SgBus', 'openSettings', {'what': what}).catchError((_) => null);

  Widget _wait(String title, [String? sub]) {
    final sg = context.sg;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(children: [
        Icon(Icons.wifi_tethering, size: 48, color: sg.brandInk),
        const SizedBox(height: 8),
        Text(title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        if (sub != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(sub, textAlign: TextAlign.center, style: TextStyle(color: sg.muted))),
      ]),
    );
  }

  Widget _button(IconData icon, String label, VoidCallback onTap) =>
      Padding(padding: const EdgeInsets.only(top: 8), child: FilledButton.tonalIcon(onPressed: onTap, icon: Icon(icon), label: Text(label)));

  List<Widget> _sticker() {
    final sg = context.sg;
    switch (_writing) {
      case 'waiting':
        return [_wait(tr('offline.holdSticker', 'Hold a blank NFC sticker to the back of the phone'), tr('offline.nearCamera', "Near the camera on most phones. Keep it still until it's written."))];
      case 'done':
        return [
          Row(children: [Icon(Icons.check_circle, color: sg.ok), const SizedBox(width: 6), Text(tr('offline.written', 'Written.'), style: const TextStyle(fontWeight: FontWeight.w700))]),
          Text(tr('offline.tapSticker', 'Tap the sticker with a phone to open it: in SG Bus Timings, or the browser.'), style: TextStyle(color: sg.muted)),
          _button(Icons.nfc, tr('offline.writeAnother', 'Write another'), _write),
        ];
      case 'off':
        return [Text(tr('offline.nfcOff', 'NFC is off. Turn it on, then come back here.')), _button(Icons.settings_outlined, tr('offline.turnOnNfc', 'Turn on NFC'), () => _settings('nfc'))];
    }
    return [if (_writing != null) Text(_writing!), _button(Icons.nfc, tr('offline.writeIt', 'Write it'), _write)];
  }

  List<Widget> _send() {
    final sg = context.sg;
    final s = _status;
    final out = <Widget>[Text(widget.title ?? '', style: const TextStyle(fontWeight: FontWeight.w700))];
    if (s == null) return [...out, Text(tr('offline.gettingReady', 'Getting ready…'), style: TextStyle(color: sg.muted))];
    if (s['tap'] == true && s['nfc'] == 'on') {
      out.add(_wait(tr('offline.holdPhones', 'Hold the backs of your phones together'),
          tr('offline.opensOnTheirs', 'It opens on theirs in SG Bus Timings, or in their browser. Their phone needs NFC on, and to be unlocked.')));
      if (_tapped > 0) {
        out.add(Row(children: [
          Icon(Icons.check_circle, color: sg.ok),
          const SizedBox(width: 6),
          Expanded(child: Text(_tapped > 1 ? tr('offline.sentMany', 'Sent to {n} phones. Hold another phone to send it again.', {'n': _tapped}) : tr('offline.sentOne', 'Sent. Hold another phone to send it again.'))),
        ]));
      }
    } else if (s['tap'] == true && s['nfc'] == 'off') {
      out.addAll([Text(tr('offline.turnOnToShare', 'Turn on NFC to share by holding your phones together.')), _button(Icons.settings_outlined, tr('offline.turnOnNfc', 'Turn on NFC'), () => _settings('nfc'))]);
    }
    if (s['nearby'] == true) {
      out.add(SectionLabel(tr('offline.phonesNearby', 'Phones nearby')));
      if (_problem == 'permission') {
        out.addAll([
          Text(tr('offline.allowFind', 'To find phones nearby, allow SG Bus Timings to use Nearby devices.'), style: TextStyle(color: sg.muted)),
          _button(Icons.settings_outlined, tr('offline.openSettings', 'Open settings'), () => _settings('app')),
        ]);
      } else if (_problem == 'failed') {
        out.addAll([
          Text(tr('offline.findFailed', "Couldn't look for phones nearby. Check Bluetooth is on."), style: TextStyle(color: sg.muted)),
          _button(Icons.refresh, tr('common.tryAgain', 'Try again'), _find),
        ]);
      } else if (!_finding) {
        out.addAll([
          Text(tr('offline.orBluetooth', 'Or send it to a phone with SG Bus Timings, over Bluetooth, without touching.'), style: TextStyle(color: sg.muted)),
          _button(Icons.wifi_tethering, tr('offline.findPhones', 'Find phones nearby'), _find),
        ]);
      } else {
        for (final e in _peers.entries) {
          final p = e.value;
          out.add(ListTile(
            contentPadding: EdgeInsets.zero,
            enabled: p.state != 'sending',
            leading: Icon(p.state == 'sent' ? Icons.check_circle : Icons.smartphone, color: p.state == 'sent' ? sg.ok : null),
            title: Text(p.name.isNotEmpty ? p.name : tr('offline.aPhone', 'A phone')),
            subtitle: Text(switch (p.state) {
              'found' => tr('offline.tapToSend', 'Tap to send'),
              'sending' => tr('offline.sending', 'Sending…'),
              'sent' => tr('offline.sent', 'Sent'),
              _ => p.message ?? tr('offline.didntSend', 'Didn’t send. Tap to try again.'),
            }),
            onTap: () => _sendTo(e.key),
          ));
        }
        out.add(Text(
          _peers.isNotEmpty
              ? tr('offline.notThere', "Not there? On their phone, open SG Bus Timings and tap Receive nearby in the Edge Tray (Settings, Edge Tray buttons, if it's off).")
              : tr('offline.looking', "Looking… On their phone, open SG Bus Timings and tap Receive nearby in the Edge Tray (Settings, Edge Tray buttons, if it's off)."),
          style: TextStyle(color: sg.muted, fontSize: 13),
        ));
      }
    }
    if (Native.has('sticker')) {
      out.addAll([
        SectionLabel(tr('offline.sticker', 'NFC sticker')),
        _button(Icons.nfc, tr('offline.writeToSticker', 'Write it to an NFC sticker'), () {
          // Sharing by tap stops meanwhile, as the phone's reading rather than being read.
          _call('stop').catchError((_) => null);
          setState(() => _mode = 'sticker');
          _write();
        }),
      ]);
    }
    return out;
  }

  List<Widget> _receiveBody() {
    final sg = context.sg;
    final out = <Widget>[];
    if (_problem == 'permission') {
      out.addAll([Text(tr('offline.allowReceive', 'To receive from phones nearby, allow SG Bus Timings to use Nearby devices.')), _button(Icons.settings_outlined, tr('offline.openSettings', 'Open settings'), () => _settings('app'))]);
    } else if (_problem == 'failed') {
      out.addAll([Text(tr('offline.receiveFailed', "Couldn't get ready to receive. Check Bluetooth is on.")), _button(Icons.refresh, tr('common.tryAgain', 'Try again'), _receive)]);
    } else if (_incoming != null) {
      out.add(_wait(tr('offline.receivingFrom', 'Receiving from {name}…', {'name': _incoming})));
    } else {
      out.add(_wait(
        _listening ? tr('offline.ready', 'Ready to receive') : tr('offline.gettingReady', 'Getting ready…'),
        _name.isNotEmpty
            ? tr('offline.pickName', 'On their phone: Share, then Offline Sharing, and pick {name}.', {'name': _name})
            : tr('offline.pickThis', 'On their phone: Share, then Offline Sharing, and pick this phone (it shows by its model; set your name in Settings to show that instead).'),
      ));
    }
    if (_status?['nfc'] != null && _status!['nfc'] != 'none') {
      out.add(Text(tr('offline.orHold', 'Or hold the backs of the phones together: that works without this open.'), style: TextStyle(color: sg.muted)));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final title = _mode == 'receive'
        ? tr('offline.receive', 'Receive nearby')
        : _mode == 'sticker'
            ? tr('offline.sticker', 'NFC sticker')
            : tr('offline.title', 'Offline Sharing');
    final note = _mode == 'receive'
        ? tr('offline.receiveNote', 'Only links to SG Bus Timings are taken. Nothing is sent from this phone but its name.')
        : _mode == 'sticker'
            ? tr('offline.stickerNote', 'Any blank NFC sticker (NTAG213 or bigger) will do. Writing over one replaces what was on it.')
            : tr('offline.sendNote', 'No internet needed to send it. They need the internet to plan the way there.');
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(note, style: TextStyle(color: sg.muted)),
          const SizedBox(height: 12),
          ...switch (_mode) {
            'send' => _send(),
            'sticker' => _sticker(),
            _ => _receiveBody(),
          },
        ]),
      ),
    );
  }
}
