// Closing a Bus timings widget (lib/desktop/widgets_window.dart, desktop-features-spec §8): closed
// by a person, with its × or Alt+F4, it's forgotten; closed by the computer shutting down, or
// while the app is quitting, it's kept for next time, as the Electron app's `quitting` flag had it.
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/desktop.dart';
import 'package:sgbus_timings/desktop/settings.dart';
import 'package:sgbus_timings/desktop/widgets_window.dart';
import 'package:window_manager/window_manager.dart';

/// A window's close request as nativeapi hands it over: one a person made ([cancelable]), which
/// can be held, or one the system forces, which can't.
class _Request implements EventRequest {
  _Request({required this.cancelable});
  final bool cancelable;

  /// The hold handed out, if one was asked for.
  _Decision? decision;

  @override
  bool get isCancelable => cancelable;

  @override
  EventDecision? defer() => cancelable ? decision = _Decision() : null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// A held close request: let through ([accepted]) or not yet.
class _Decision implements EventDecision {
  bool accepted = false;

  @override
  bool accept() => accepted = true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group("the widget's window", () {
    test('Alt+F4 (a close a person asked for) is held until the main window has forgotten the widget', () async {
      final asked = Completer<void>();
      final ids = <String>[];
      final closing = WidgetClosing('w1', ask: (id) {
        ids.add(id);
        return asked.future;
      });
      final request = _Request(cancelable: true);
      closing.onCloseRequested(request);
      await pumpEventQueue();
      expect(ids, ['w1']);
      expect(request.decision!.accepted, isFalse, reason: 'not closed before the main window answers');
      asked.complete();
      await pumpEventQueue();
      expect(request.decision!.accepted, isTrue, reason: 'then it closes');
    });

    test('a close the system forces (shutting down, signing out) keeps the widget', () async {
      final ids = <String>[];
      final closing = WidgetClosing('w1', ask: (id) async => ids.add(id));
      closing.onCloseRequested(_Request(cancelable: false));
      await pumpEventQueue();
      expect(ids, isEmpty, reason: 'the main window is never asked to forget it');
    });

    test('the × asks once: the close it starts goes straight through', () async {
      final ids = <String>[];
      final closing = WidgetClosing('w1', ask: (id) async => ids.add(id));
      await closing.forget(); // the × button
      final request = _Request(cancelable: true);
      closing.onCloseRequested(request); // the window's close that follows
      await pumpEventQueue();
      expect(ids, ['w1']);
      expect(request.decision!.accepted, isTrue);
    });

    test('Alt+F4 while the × still waits for the main window waits on the same asking', () async {
      final asked = Completer<void>();
      final ids = <String>[];
      final closing = WidgetClosing('w1', ask: (id) {
        ids.add(id);
        return asked.future;
      });
      var forgotten = false;
      unawaited(closing.forget().then((_) => forgotten = true)); // the ×
      final request = _Request(cancelable: true);
      closing.onCloseRequested(request); // Alt+F4 straight after
      await pumpEventQueue();
      expect(ids, ['w1'], reason: 'asked once');
      expect(forgotten, isFalse);
      expect(request.decision!.accepted, isFalse, reason: 'held until the main window answers');
      asked.complete();
      await pumpEventQueue();
      expect(forgotten, isTrue);
      expect(request.decision!.accepted, isTrue);
    });

    // A widget test only for its clock, which the test moves on by hand.
    testWidgets("a main window that doesn't answer still lets it close", (t) async {
      final closing = WidgetClosing('w1', ask: (_) => Completer<void>().future);
      final request = _Request(cancelable: true);
      closing.onCloseRequested(request);
      await t.pump(WidgetClosing.wait - const Duration(milliseconds: 1));
      expect(request.decision!.accepted, isFalse);
      await t.pump(const Duration(milliseconds: 2));
      expect(request.decision!.accepted, isTrue);
    });
  });

  group('the main window, asked to forget a widget', () {
    late Directory dir;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('sgbus-widgets-');
      DeskSettings.override = dir.path;
      DeskSettings.write({
        'widgets': [
          {'id': 'w1', 'code': '84009', 'name': 'Bedok Int', 'buses': <String>[], 'onTop': false},
          {'id': 'w2', 'code': '84011', 'name': '', 'buses': <String>[], 'onTop': true},
        ],
      });
    });
    tearDown(() {
      Desktop.quitting = false;
      DeskSettings.override = null;
      if (dir.existsSync()) dir.deleteSync(recursive: true);
    });

    test('forgets it, and keeps the others', () async {
      expect(await DeskWidgets.handle('widget-close', {'id': 'w1'}), isTrue);
      expect([for (final w in DeskWidgets.list()) w['id']], ['w2']);
    });

    test('while the app is quitting, keeps it for next time', () async {
      Desktop.quitting = true;
      await DeskWidgets.handle('widget-close', {'id': 'w1'});
      expect([for (final w in DeskWidgets.list()) w['id']], ['w1', 'w2']);
    });
  });
}
