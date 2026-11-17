// The sgbus_desktop plugin's Dart side (lib/sgbus_desktop.dart) against a pretend native side that,
// like the real ones, keeps a link until Dart says "ready". It checks that setting the quit handler
// first doesn't say "ready" (so the kept link isn't sent before anything listens), that the first
// listener says it once and gets the link, that quits are answered, and that a call the platform
// hasn't got gives null. The tests run in order and share the plugin's state. Run from the app's
// folder: flutter test packages/sgbus_desktop/test/sgbus_desktop_test.dart
import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_desktop/sgbus_desktop.dart';

const _channel = MethodChannel('org.uwuapps.sgbus/desktop');
const _codec = StandardMethodCodec();
const _link = 'uwu://sgbus/84009';

/// Sends [method] to the Dart side as the native side would, and gives back the Dart side's answer.
Future<Object?> _fromNative(String method, [Object? args]) {
  final answer = Completer<Object?>();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.handlePlatformMessage(
    _channel.name,
    _codec.encodeMethodCall(MethodCall(method, args)),
    (data) => answer.complete(data == null ? null : _codec.decodeEnvelope(data)),
  );
  return answer.future;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // What the pretend native side was asked, in order.
  final calls = <String>[];

  setUpAll(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(_channel, (call) async {
      calls.add(call.method);
      switch (call.method) {
        case 'ready':
          // The link the app was started with, kept until now, sent straight after.
          Timer.run(() => _fromNative('open', {'url': _link}));
        case 'startLink':
          return _link;
        case 'handle':
          return 1234;
        case 'getLogin':
          throw MissingPluginException();
      }
      return null;
    });
  });

  test('setting the quit handler first tells the native side, but not "ready"', () async {
    SgbusDesktop.setQuitHandler(() async {});
    await pumpEventQueue();
    expect(calls, contains('quitHandler'));
    expect(calls, isNot(contains('ready')));
  });

  test('the start link can be asked for before anything listens', () async {
    expect(await SgbusDesktop.startLink(), _link);
    expect(calls, isNot(contains('ready')));
  });

  test('the first listener says "ready" once, and the kept link arrives', () async {
    final (name, data) = await SgbusDesktop.events.first;
    expect(name, 'open');
    expect(data['url'], _link);

    SgbusDesktop.events.listen((_) {});
    await pumpEventQueue();
    expect(calls.where((c) => c == 'ready'), hasLength(1));
  });

  test('a quit goes to the quit handler, or back to the native side without one', () async {
    var ran = false;
    SgbusDesktop.setQuitHandler(() async => ran = true);
    expect(await _fromNative('quit'), isTrue);
    await pumpEventQueue();
    expect(ran, isTrue);

    SgbusDesktop.setQuitHandler(null);
    expect(await _fromNative('quit'), isFalse);
  });

  test('answers come back, and a call the platform hasn\'t got gives null', () async {
    expect(await SgbusDesktop.handle(), 1234);
    expect(await SgbusDesktop.startsAtLogin(), isNull);
  });
}
