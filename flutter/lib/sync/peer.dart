// Host and guest pairing over PeerJS's public broker, STUN only (the site's js/p2p.js, and
// STUN-p2p-spec.md in the repo root): the same broker, ids, ICE servers, wire and BinaryPack as
// PeerJS 1.5's, so the app syncs with the site on another device and the other way round.
//
//   The broker  wss://0.peerjs.com/peerjs?key=peerjs&id=…&token=…: OPEN once registered,
//               ID-TAKEN, EXPIRE (the peer asked for isn't there), and OFFER, ANSWER and
//               CANDIDATE between peers, relayed by `dst` and `src`; a HEARTBEAT every 5 s.
//   A link      one WebRTC data channel, made by the guest (its label the connection's id,
//               "dc_…"), each message BinaryPack-packed, and one over 16300 bytes sent as
//               chunks: { __peerData, n, total, data }, put back together on arrival.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;

import '../i18n/i18n.dart';
import 'binarypack.dart';

class P2P {
  P2P._();
  static const prefix = 'sgbus-sync-';
  static const alphabet = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
  static const codeLength = 6;
  static const protocolVersion = 1;
  static const connectTimeout = Duration(seconds: 15);
  static const _host = '0.peerjs.com';
  static const _ice = [
    {'urls': 'stun:stun.l.google.com:19302'},
    {'urls': 'stun:stun.cloudflare.com:3478'},
  ];
  static const _mtu = 16300;

  static String generateCode() {
    final r = math.Random.secure();
    return [for (var i = 0; i < codeLength; i++) alphabet[r.nextInt(alphabet.length)]].join();
  }

  static String normalise(String input) {
    final s = input.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    return s.length > codeLength ? s.substring(0, codeLength) : s;
  }

  static bool isValid(String input) {
    final c = normalise(input);
    return c.length == codeLength && c.split('').every(alphabet.contains);
  }

  static String _token() => math.Random.secure().nextInt(1 << 32).toRadixString(36) + math.Random.secure().nextInt(1 << 32).toRadixString(36);
}

/// What went wrong, as js/p2p.js's describePeerError says it.
String peerError(String type) => switch (type) {
      'peer-unavailable' => tr('p2p.nobody', 'Nobody is showing that code. Check it and try again.'),
      'unavailable-id' => tr('p2p.inUse', 'That code is already in use. Generate a new one.'),
      'network' || 'server-error' || 'socket-error' || 'socket-closed' => tr('p2p.noService', 'Cannot reach the pairing service. Everything else still works.'),
      _ => tr('p2p.failed', 'The connection failed.'),
    };

/// The broker: registering an id, relaying offers, answers and candidates.
class _Broker {
  _Broker(this.id, this.onMessage, this.onClosed);
  final String id;
  final void Function(Map<String, dynamic> m) onMessage;
  final void Function() onClosed;
  WebSocket? _ws;
  Timer? _beat;
  final _open = Completer<void>();

  Future<void> connect() async {
    final url = 'wss://${P2P._host}:443/peerjs?key=peerjs&id=${Uri.encodeComponent(id)}&token=${P2P._token()}&version=1.5.4';
    _ws = await WebSocket.connect(url).timeout(const Duration(seconds: 15));
    _ws!.listen((raw) {
      Map<String, dynamic> m;
      try {
        m = Map<String, dynamic>.from(jsonDecode('$raw') as Map);
      } catch (_) {
        return;
      }
      if (m['type'] == 'OPEN' && !_open.isCompleted) _open.complete();
      if (m['type'] == 'ID-TAKEN' && !_open.isCompleted) _open.completeError('unavailable-id');
      if (m['type'] == 'ERROR' && !_open.isCompleted) _open.completeError('server-error');
      onMessage(m);
    }, onDone: () {
      _beat?.cancel();
      if (!_open.isCompleted) _open.completeError('socket-closed');
      onClosed();
    }, onError: (_) {});
    _beat = Timer.periodic(const Duration(seconds: 5), (_) => send({'type': 'HEARTBEAT'}));
    return _open.future;
  }

  void send(Map<String, Object?> m) {
    try {
      _ws?.add(jsonEncode(m));
    } catch (_) {}
  }

  void close() {
    _beat?.cancel();
    _ws?.close();
    _ws = null;
  }

  /// A random id from the broker, for a guest.
  static Future<String> newId() async {
    final r = await http.get(Uri.parse('https://${P2P._host}:443/peerjs/id?ts=${DateTime.now().millisecondsSinceEpoch}${math.Random().nextDouble()}')).timeout(const Duration(seconds: 15));
    if (r.statusCode != 200) throw 'server-error';
    return r.body.trim();
  }
}

/// One data channel to the other device.
class PeerLink {
  PeerLink._(this.peer, this.connectionId, this.pc);
  final String peer;
  final String connectionId;
  final RTCPeerConnection pc;
  RTCDataChannel? _dc;
  bool open = false;
  final List<RTCIceCandidate> _early = [];
  bool _remoteSet = false;
  final Map<int, List<Uint8List?>> _chunks = {};
  int _chunkId = 0;

  void Function()? onOpen;
  void Function(Map<String, dynamic> message)? onMessage;
  void Function()? onClose;

  void _bind(RTCDataChannel dc) {
    _dc = dc;
    dc.onDataChannelState = (s) {
      if (s == RTCDataChannelState.RTCDataChannelOpen && !open) {
        open = true;
        onOpen?.call();
      } else if (s == RTCDataChannelState.RTCDataChannelClosed) {
        _closed();
      }
    };
    dc.onMessage = (m) => _receive(m.isBinary ? m.binary : Uint8List.fromList(utf8.encode(m.text)));
  }

  bool _gone = false;
  void _closed() {
    if (_gone) return;
    _gone = true;
    open = false;
    onClose?.call();
  }

  void _receive(Uint8List bytes) {
    Object? v;
    try {
      v = BinaryPack.unpack(bytes);
    } catch (_) {
      return;
    }
    if (v is Map && v['__peerData'] != null) {
      final id = (v['__peerData'] as num).toInt();
      final total = (v['total'] as num).toInt();
      final n = (v['n'] as num).toInt();
      final list = _chunks[id] ??= List<Uint8List?>.filled(total, null);
      if (n < total && v['data'] is Uint8List) list[n] = v['data'] as Uint8List;
      if (list.every((c) => c != null)) {
        _chunks.remove(id);
        final whole = BytesBuilder(copy: false);
        for (final c in list) {
          whole.add(c!);
        }
        _receive(whole.takeBytes());
      }
      return;
    }
    if (v is Map && v['type'] is String) onMessage?.call(Map<String, dynamic>.from(v));
  }

  void send(Map<String, Object?> message) {
    final dc = _dc;
    if (dc == null || !open) return;
    final bytes = BinaryPack.pack(message);
    if (bytes.length <= P2P._mtu) {
      dc.send(RTCDataChannelMessage.fromBinary(bytes));
      return;
    }
    final id = _chunkId++;
    final total = (bytes.length / P2P._mtu).ceil();
    for (var n = 0; n < total; n++) {
      final part = Uint8List.sublistView(bytes, n * P2P._mtu, math.min(bytes.length, (n + 1) * P2P._mtu));
      dc.send(RTCDataChannelMessage.fromBinary(BinaryPack.pack({'__peerData': id, 'n': n, 'total': total, 'data': part})));
    }
  }

  Future<void> _remote(Map sdp) async {
    await pc.setRemoteDescription(RTCSessionDescription('${sdp['sdp']}', '${sdp['type']}'));
    _remoteSet = true;
    for (final c in _early) {
      await pc.addCandidate(c);
    }
    _early.clear();
  }

  Future<void> _candidate(Map c) async {
    final cand = RTCIceCandidate(c['candidate'] as String?, c['sdpMid'] as String?, (c['sdpMLineIndex'] as num?)?.toInt());
    if (_remoteSet) {
      await pc.addCandidate(cand);
    } else {
      _early.add(cand);
    }
  }

  Future<void> close() async {
    try {
      await _dc?.close();
    } catch (_) {}
    try {
      await pc.close();
    } catch (_) {}
    _closed();
  }

  static Future<RTCPeerConnection> _pc() => createPeerConnection({'iceServers': P2P._ice, 'sdpSemantics': 'unified-plan'});
}

/// The status a session reports: connecting, waiting, connected, dropped, unreachable, error.
typedef PeerStatus = void Function(String status, {String? message, bool taken});

/// The host: registers sgbus-sync-CODE and takes one guest at a time.
class PeerHost {
  PeerHost(this.onStatus, this.onMessage);
  final PeerStatus onStatus;
  final void Function(Map<String, dynamic> m) onMessage;
  _Broker? _broker;
  PeerLink? link;
  bool _closed = false;

  Future<void> start(String code) async {
    onStatus('connecting');
    _broker = _Broker(P2P.prefix + code, _onBroker, () {
      if (!_closed && link == null) onStatus('error', message: peerError('socket-closed'));
    });
    try {
      await _broker!.connect();
      onStatus('waiting');
    } catch (e) {
      onStatus('error', message: peerError('$e'), taken: e == 'unavailable-id');
    }
  }

  Future<void> _onBroker(Map<String, dynamic> m) async {
    final payload = (m['payload'] as Map?) ?? const {};
    final src = '${m['src'] ?? ''}';
    if (m['type'] == 'OFFER') {
      // The newcomer replaces the incumbent.
      await link?.close();
      final pc = await PeerLink._pc();
      final l = PeerLink._(src, '${payload['connectionId']}', pc);
      link = l;
      pc.onIceCandidate = (c) => _broker?.send({
            'type': 'CANDIDATE',
            'payload': {'candidate': c.toMap(), 'type': 'data', 'connectionId': l.connectionId},
            'dst': src,
          });
      pc.onDataChannel = l._bind;
      l.onOpen = () => onStatus('connected');
      l.onMessage = onMessage;
      l.onClose = () {
        if (link == l) {
          link = null;
          if (!_closed) onStatus('waiting');
        }
      };
      await l._remote(payload['sdp'] as Map);
      final answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      _broker?.send({
        'type': 'ANSWER',
        'payload': {'sdp': {'type': answer.type, 'sdp': answer.sdp}, 'type': 'data', 'connectionId': l.connectionId, 'browser': 'flutter'},
        'dst': src,
      });
    } else if (m['type'] == 'CANDIDATE' && link?.connectionId == payload['connectionId']) {
      await link!._candidate(payload['candidate'] as Map);
    }
  }

  void send(Map<String, Object?> message) => link?.send(message);

  Future<void> close() async {
    _closed = true;
    await link?.close();
    link = null;
    _broker?.close();
  }
}

/// The guest: connects to the device showing CODE.
class PeerGuest {
  PeerGuest(this.onStatus, this.onMessage);
  final PeerStatus onStatus;
  final void Function(Map<String, dynamic> m) onMessage;
  _Broker? _broker;
  PeerLink? link;
  Timer? _timer;
  bool _everOpened = false;
  bool _done = false;

  Future<void> connect(String code) async {
    onStatus('connecting');
    try {
      final id = await _Broker.newId();
      _broker = _Broker(id, _onBroker, () {});
      await _broker!.connect();
    } catch (e) {
      onStatus('error', message: peerError(e is String ? e : 'network'));
      return;
    }
    // Nothing errors when ICE can't find a path; it just keeps trying.
    _timer = Timer(P2P.connectTimeout, () {
      if (_everOpened || _done) return;
      hangUp();
      onStatus('unreachable');
    });
    final pc = await PeerLink._pc();
    final connectionId = 'dc_${P2P._token()}';
    final dst = P2P.prefix + code;
    final l = PeerLink._(dst, connectionId, pc);
    link = l;
    pc.onIceCandidate = (c) => _broker?.send({
          'type': 'CANDIDATE',
          'payload': {'candidate': c.toMap(), 'type': 'data', 'connectionId': connectionId},
          'dst': dst,
        });
    l._bind(await pc.createDataChannel(connectionId, RTCDataChannelInit()..ordered = true));
    l.onOpen = () {
      _everOpened = true;
      _timer?.cancel();
      onStatus('connected');
      l.send({'type': 'hello', 'v': P2P.protocolVersion});
    };
    l.onMessage = onMessage;
    l.onClose = () {
      if (_done || link != l) return;
      link = null;
      onStatus(_everOpened ? 'dropped' : 'unreachable');
    };
    final offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    _broker!.send({
      'type': 'OFFER',
      'payload': {
        'sdp': {'type': offer.type, 'sdp': offer.sdp},
        'type': 'data',
        'connectionId': connectionId,
        'label': connectionId,
        'reliable': true,
        'serialization': 'binary',
        'browser': 'flutter',
      },
      'dst': dst,
    });
  }

  Future<void> _onBroker(Map<String, dynamic> m) async {
    final payload = (m['payload'] as Map?) ?? const {};
    final l = link;
    if (m['type'] == 'EXPIRE' || (m['type'] == 'ERROR' && !_everOpened)) {
      hangUp();
      onStatus('error', message: peerError(m['type'] == 'EXPIRE' ? 'peer-unavailable' : 'server-error'));
      return;
    }
    if (l == null || payload['connectionId'] != l.connectionId) return;
    if (m['type'] == 'ANSWER') await l._remote(payload['sdp'] as Map);
    if (m['type'] == 'CANDIDATE') await l._candidate(payload['candidate'] as Map);
  }

  void send(Map<String, Object?> message) => link?.send(message);

  /// Leaving on purpose: bye first, so the host retires its code.
  Future<void> leave() async {
    send({'type': 'bye'});
    _done = true;
    _timer?.cancel();
    final l = link;
    link = null;
    await Future<void>.delayed(const Duration(milliseconds: 300));
    await l?.close();
    _broker?.close();
  }

  void hangUp() {
    _done = true;
    _timer?.cancel();
    link?.close();
    link = null;
    _broker?.close();
  }
}

/// Syncing with the Telegram bot, through the site's relay (js/sync-relay.js, /api/sync): this
/// phone hosts, the bot's /sync joins; held there 10 minutes at most.
class BotRelay {
  BotRelay(this.onStatus, this.onMessage);
  final void Function(String status, {String? message}) onStatus;
  final void Function(Map<String, dynamic> m) onMessage;
  String code = '';
  final secret = [for (var i = 0; i < 16; i++) math.Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0')].join();
  String status = 'idle';
  int _fails = 0;
  int _expiresAt = 0;
  Timer? _timer;

  void _set(String s, [String? message]) {
    if (status == 'ended' || status == 'error') return;
    status = s;
    onStatus(s, message: message);
    if (s == 'ended' || s == 'error') _timer?.cancel();
  }

  Future<Map<String, dynamic>?> _post(Map<String, Object?> body) async {
    final r = await http
        .post(Uri.parse('https://sgbus.uwuapps.org/api/sync'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'code': code, 'secret': secret, ...body}))
        .timeout(const Duration(seconds: 15));
    if (r.statusCode == 204) return null;
    if (r.statusCode != 200) {
      String? why;
      try {
        why = (jsonDecode(r.body) as Map)['error'] as String?;
      } catch (_) {}
      throw why ?? tr('syncRelay.noSite', 'Couldn’t reach the site. Check your connection.');
    }
    return Map<String, dynamic>.from(jsonDecode(r.body) as Map);
  }

  Future<void> start(String c) async {
    code = c;
    _set('connecting');
    try {
      final got = await _post({'op': 'open'});
      _expiresAt = (got?['expiresAt'] as num?)?.toInt() ?? 0;
      _set('waiting');
      _poll();
    } catch (e) {
      _set('error', '$e');
    }
  }

  Future<void> _poll() async {
    if (status == 'ended' || status == 'error') return;
    try {
      final r = await http.get(Uri.parse('https://sgbus.uwuapps.org/api/sync?code=${Uri.encodeComponent(code)}&secret=$secret')).timeout(const Duration(seconds: 15));
      if (r.statusCode != 200) throw '${r.statusCode}';
      final got = jsonDecode(r.body) as Map;
      _fails = 0;
      if (got['joined'] == true && status == 'waiting') _set('connected');
      for (final m in (got['messages'] as List? ?? const []).whereType<Map>()) {
        if (m['type'] == 'bye') {
          _set('ended', tr('syncRelay.botEnded', 'The Telegram bot ended the sync.'));
          return;
        }
        onMessage(Map<String, dynamic>.from(m));
      }
      if (got['open'] != true) {
        _set(
          'ended',
          DateTime.now().millisecondsSinceEpoch >= _expiresAt
              ? tr('syncRelay.timedOut', 'The sync with the Telegram bot ended after 10 minutes. Start it again for more.')
              : tr('syncRelay.ended', 'The sync with the Telegram bot has ended.'),
        );
        return;
      }
    } catch (_) {
      if (++_fails >= 5) {
        _set('error', tr('syncRelay.lost', 'Lost touch with the site. Check your connection, then start again.'));
        return;
      }
    }
    _timer = Timer(const Duration(seconds: 2), _poll);
  }

  void send(Map<String, Object?> message) {
    if (status != 'connected') return;
    _post({'op': 'send', 'message': message}).catchError((_) => null);
  }

  void close() {
    final was = status;
    status = 'ended';
    _timer?.cancel();
    if (code.isNotEmpty && was != 'idle') _post({'op': 'close'}).catchError((_) => null);
  }
}
