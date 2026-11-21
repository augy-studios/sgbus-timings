// On Windows each Bus timings widget is a copy of the app of its own, asking the main window over a
// loopback socket (lib/desktop/widget_process.dart): engines sharing one process share ANGLE's
// Direct3D 11 renderer, and a widget opening crashed the app. Here both ends run in one test: a
// call gets the main window's answer, an error comes back as one, a stranger without the token is
// refused, the widget hears when the main window goes, and a widget copy's command line reads back.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/widget_process.dart';

void main() {
  test("a widget copy's command line names its widget and the main window's link", () {
    final args = WidgetHost.args('w-1', 50123, 'abc');
    expect(WidgetLink.parse(args), (id: 'w-1', port: 50123, token: 'abc'));
    expect(WidgetLink.parse(['uwu://sgbus/stop/84009']), isNull, reason: "the main window's own command line");
    expect(WidgetLink.parse(['--widget', 'w-1']), isNull, reason: 'no link to ask');
  });

  test('a call gets the main window answer, and an error comes back as one', () async {
    WidgetHost.answer = (method, args) async {
      if (method == 'widget-get') return {'id': args['id'], 'code': '84009', 'buses': ['14']};
      if (method == 'boom') throw StateError('no');
      return null;
    };
    final (port, token) = await WidgetHost.serveForTest();
    final gone = Completer<void>();
    final link = await WidgetLink.connect('w-1', port, token, onGone: gone.complete);
    final got = await link.invokeMethod<Map>('widget-get', {'id': 'w-1'});
    expect(got, {'id': 'w-1', 'code': '84009', 'buses': ['14']});
    expect(await link.invokeMethod<bool>('widget-on-top', {'id': 'w-1', 'on': true}), isNull);
    await expectLater(link.invokeMethod('boom'), throwsA(isA<StateError>()));
    expect(WidgetHost.running('w-1'), isTrue);
  });

  test('a stranger without the token gets nothing, and is let go', () async {
    var asked = false;
    WidgetHost.answer = (method, args) async {
      asked = true;
      return true;
    };
    final (port, _) = await WidgetHost.serveForTest();
    final socket = await Socket.connect(InternetAddress.loopbackIPv4, port);
    socket.writeln(jsonEncode({'token': 'wrong', 'id': 'x'}));
    socket.writeln(jsonEncode({'n': 1, 'method': 'widget-close', 'args': {'id': 'x'}}));
    final closed = Completer<List<int>>();
    final heard = <int>[];
    socket.listen(heard.addAll, onDone: () => closed.complete(heard));
    expect(await closed.future.timeout(const Duration(seconds: 5)), isEmpty);
    expect(asked, isFalse);
    expect(WidgetHost.running('x'), isFalse);
  });

  test('the widget hears when the main window goes', () async {
    // A main window of its own: a server that takes the hello and then closes.
    final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((s) async {
      await s.first;
      await s.close();
    });
    final gone = Completer<void>();
    final link = await WidgetLink.connect('w-2', server.port, 't', onGone: gone.complete);
    await gone.future.timeout(const Duration(seconds: 5));
    await expectLater(link.invokeMethod('widget-get'), throwsA(anything));
    await server.close();
  });
}
