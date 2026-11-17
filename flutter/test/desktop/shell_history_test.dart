// The desktop title bar's Back and Forward (app/nav.dart's ViewHistory): Back walks back
// through the pages, and Forward comes back; a screen closed by Back can be opened again by
// Forward only if it has its own site address; a screen that won't close (a PopScope) leaves
// Forward as it was; and anything new clears Forward, as in a browser.
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';

void main() {
  group('pages', () {
    test('Back goes to the page before, and Forward comes back', () {
      final h = ViewHistory()
        ..pageShown('timings')
        ..pageShown('favs');
      expect(h.hasPageBefore, isTrue);
      final back = h.backAPage();
      expect(back, 'timings');
      h.stepping(() => h.pageShown(back!));
      expect(h.hasPageBefore, isFalse);
      expect(h.canForward, isTrue);
      expect(ViewHistory.pageIn(h.takeForward()!), 'favs');
      expect(h.canForward, isFalse);
    });

    test('Back twice, then Forward twice, in order', () {
      final h = ViewHistory()
        ..pageShown('a')
        ..pageShown('b')
        ..pageShown('c');
      h.stepping(() => h.pageShown(h.backAPage()!));
      h.stepping(() => h.pageShown(h.backAPage()!));
      expect(h.backAPage(), isNull, reason: 'no page before the first');
      final first = h.takeForward()!;
      h.stepping(() => h.pageShown(ViewHistory.pageIn(first)!));
      expect(ViewHistory.pageIn(first), 'b');
      expect(ViewHistory.pageIn(h.takeForward()!), 'c');
    });

    test('a page picked after Back clears Forward', () {
      final h = ViewHistory()
        ..pageShown('a')
        ..pageShown('b');
      h.stepping(() => h.pageShown(h.backAPage()!));
      h.pageShown('c');
      expect(h.canForward, isFalse);
    });

    test('a new screen clears Forward; one opened by Forward itself does not', () {
      final h = ViewHistory()
        ..pageShown('a')
        ..pageShown('b');
      h.stepping(() => h.pageShown(h.backAPage()!));
      h.stepping(h.screenOpened);
      expect(h.canForward, isTrue);
      h.screenOpened();
      expect(h.canForward, isFalse);
    });

    test('the same page twice is one step', () {
      final h = ViewHistory()
        ..pageShown('a')
        ..pageShown('a');
      expect(h.hasPageBefore, isFalse);
    });
  });

  group('closing screens', () {
    late GlobalKey<NavigatorState> key;
    late RouteWatcher watcher;

    /// A navigator watched as the title bar watches the app's.
    Future<void> navigator(WidgetTester t) async {
      key = GlobalKey<NavigatorState>();
      watcher = RouteWatcher();
      await t.pumpWidget(MaterialApp(navigatorKey: key, navigatorObservers: [watcher], home: const Text('the page')));
    }

    /// Opens a screen called [text], with or without a site address, maybe one that won't close.
    Future<void> open(WidgetTester t, String text, {String? address, bool stays = false}) async {
      key.currentState!.push(MaterialPageRoute<void>(
        settings: RouteSettings(name: text, arguments: address == null ? null : {'address': address}),
        builder: (_) => PopScope(canPop: !stays, child: Scaffold(body: Text(text))),
      ));
      await t.pumpAndSettle();
    }

    testWidgets('a stop closed by Back can be opened again by Forward', (t) async {
      await navigator(t);
      await open(t, 'stop', address: '#84009');
      final h = ViewHistory();
      expect(await h.close(key.currentState!, watcher), isTrue);
      await t.pumpAndSettle();
      expect(find.text('the page'), findsOneWidget);
      expect(h.takeForward(), '#84009');
    });

    testWidgets('Settings closed by Back leaves Forward greyed, not on what was under it', (t) async {
      await navigator(t);
      await open(t, 'stop', address: '#84009');
      await open(t, 'settings');
      final h = ViewHistory();
      expect(await h.close(key.currentState!, watcher), isTrue);
      await t.pumpAndSettle();
      expect(find.text('stop'), findsOneWidget);
      expect(h.canForward, isFalse);
    });

    testWidgets('a screen that will not close leaves Forward as it was', (t) async {
      await navigator(t);
      await open(t, 'a trip', address: '#84009', stays: true);
      final h = ViewHistory();
      expect(await h.close(key.currentState!, watcher), isFalse);
      await t.pumpAndSettle();
      expect(find.text('a trip'), findsOneWidget);
      expect(h.canForward, isFalse);
    });

    testWidgets('a dialog closed by Back leaves Forward greyed', (t) async {
      await navigator(t);
      showDialog<void>(context: key.currentContext!, builder: (_) => const AlertDialog(content: Text('a dialog')));
      await t.pumpAndSettle();
      final h = ViewHistory();
      expect(await h.close(key.currentState!, watcher), isTrue);
      await t.pumpAndSettle();
      expect(find.text('a dialog'), findsNothing);
      expect(h.canForward, isFalse);
    });
  });
}
