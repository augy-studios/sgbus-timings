// On Windows each Bus timings widget is a copy of the app of its own, not a window of the main
// window's process. Every Flutter engine in one process draws through the one Direct3D 11 renderer
// ANGLE keeps for it, and a second engine making its context current while another draws clears
// the shared state the drawing one is using (StateManager11::onMakeCurrent): the app crashed with
// a black window as a widget opened, and could whenever both redrew at once. Separate processes
// have separate renderers. macOS and Linux don't draw through ANGLE, and keep their widgets as
// windows of the main window's engine (desktop_multi_window).
//
// The main window starts each one as `<the app> --widget <id> --main-port <port> --main-token
// <token>`; the runner (windows/runner/main.cpp) lets such a copy run beside the one copy, under
// a title a second copy never hands its link to. The widget asks the main window what it would
// ask over the 'sgbus/main' channel (widgets_window.dart's mainChannel), over a loopback socket
// instead: one JSON line a call, `{"n": 1, "method": "widget-get", "args": {...}}`, and one back,
// `{"n": 1, "result": ...}` or `{"n": 1, "error": "..."}`. Its first line is the token, so nothing
// else on the computer can ask. When the main window goes (the app quitting, or a crash), the
// widget's socket closes and it ends too, kept for next time, as quitting keeps them.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

/// The main window's side: the loopback server the widgets' copies ask, and the copies it started.
class WidgetHost {
  WidgetHost._();

  static ServerSocket? _server;
  static String _token = '';

  /// Answers one call (desktop_main.dart sets it: what the 'sgbus/main' channel answers).
  static Future<Object?> Function(String method, Map<String, Object?> args)? answer;

  /// The widgets whose copy is running and connected, by widget id.
  static final Map<String, Socket> _running = {};

  /// Copies started but not yet connected, by widget id, so one isn't started twice.
  static final Set<String> _starting = {};

  /// Whether a widget's copy is running (or starting).
  static bool running(String id) => _running.containsKey(id) || _starting.contains(id);

  /// Starts the server, once.
  static Future<ServerSocket> _serve() async {
    final open = _server;
    if (open != null) return open;
    final r = math.Random.secure();
    _token = List.generate(32, (_) => r.nextInt(16).toRadixString(16)).join();
    final server = _server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    server.listen(_accept);
    return server;
  }

  static void _accept(Socket socket) {
    String? id;
    var trusted = false;
    utf8.decoder.bind(socket).transform(const LineSplitter()).listen((line) async {
      if (!trusted) {
        // The first line: the token, then the widget's id.
        final hello = _decode(line);
        if (hello == null || hello['token'] != _token || hello['id'] is! String) {
          socket.destroy();
          return;
        }
        trusted = true;
        id = hello['id'] as String;
        _starting.remove(id);
        _running[id!] = socket;
        return;
      }
      final call = _decode(line);
      if (call == null) return;
      final n = call['n'];
      Map<String, Object?> reply;
      try {
        final args = call['args'] is Map ? Map<String, Object?>.from(call['args'] as Map) : <String, Object?>{};
        reply = {'n': n, 'result': await answer?.call('${call['method']}', args)};
      } catch (e) {
        reply = {'n': n, 'error': '$e'};
      }
      try {
        socket.writeln(jsonEncode(reply));
      } catch (_) {}
    }, onDone: () {
      if (id != null && _running[id] == socket) _running.remove(id);
      socket.destroy();
    }, onError: (_) {});
  }

  static Map<String, Object?>? _decode(String line) {
    try {
      final v = jsonDecode(line);
      return v is Map ? Map<String, Object?>.from(v) : null;
    } catch (_) {
      return null;
    }
  }

  /// Starts widget [id]'s own copy of the app. [exe] is this program (for tests).
  static Future<void> start(String id, {String? exe}) async {
    if (running(id)) return;
    final server = await _serve();
    _starting.add(id);
    // It counts as starting for at most 30 s: a copy that never connects can be started again.
    Timer(const Duration(seconds: 30), () => _starting.remove(id));
    try {
      await Process.start(exe ?? Platform.resolvedExecutable, args(id, server.port, _token), mode: ProcessStartMode.detached);
    } catch (_) {
      _starting.remove(id);
    }
  }

  /// A widget copy's command line.
  static List<String> args(String id, int port, String token) => ['--widget', id, '--main-port', '$port', '--main-token', token];

  /// For tests: the server's port and token, started if need be.
  static Future<(int, String)> serveForTest() async => ((await _serve()).port, _token);

  /// Forgets a widget's copy (it's being closed).
  static void forget(String id) => _running.remove(id);
}

/// A widget copy's side: its link to the main window, asked as the channel is.
class WidgetLink {
  WidgetLink._(this._socket);

  final Socket _socket;
  int _n = 0;
  bool _gone = false;
  final Map<int, Completer<Object?>> _waiting = {};

  /// The widget's id and the main window's port and token, from a widget copy's command line;
  /// null if [args] aren't a widget copy's.
  static ({String id, int port, String token})? parse(List<String> args) {
    String? after(String flag) {
      final i = args.indexOf(flag);
      return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
    }

    final id = after('--widget'), port = int.tryParse(after('--main-port') ?? ''), token = after('--main-token');
    if (id == null || port == null || token == null) return null;
    return (id: id, port: port, token: token);
  }

  /// Connects to the main window. [onGone] runs when it goes (the app quit, or crashed).
  static Future<WidgetLink> connect(String id, int port, String token, {required void Function() onGone}) async {
    final socket = await Socket.connect(InternetAddress.loopbackIPv4, port, timeout: const Duration(seconds: 5));
    final link = WidgetLink._(socket);
    socket.writeln(jsonEncode({'token': token, 'id': id}));
    utf8.decoder.bind(socket).transform(const LineSplitter()).listen((line) {
      try {
        final m = Map<String, Object?>.from(jsonDecode(line) as Map);
        final waiting = link._waiting.remove(m['n']);
        if (waiting == null) return;
        if (m.containsKey('error')) {
          waiting.completeError(StateError('${m['error']}'));
        } else {
          waiting.complete(m['result']);
        }
      } catch (_) {}
    }, onDone: () {
      link._gone = true;
      for (final w in link._waiting.values) {
        if (!w.isCompleted) w.completeError(StateError('the main window has gone'));
      }
      link._waiting.clear();
      onGone();
    }, onError: (_) {}, cancelOnError: false);
    return link;
  }

  /// Asks the main window, as WindowMethodChannel.invokeMethod does.
  Future<T?> invokeMethod<T>(String method, [Object? arguments]) async {
    if (_gone) throw StateError('the main window has gone');
    final n = ++_n;
    final done = _waiting[n] = Completer<Object?>();
    _socket.writeln(jsonEncode({'n': n, 'method': method, 'args': arguments}));
    return (await done.future) as T?;
  }
}
