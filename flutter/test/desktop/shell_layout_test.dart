// The desktop's layout by the window's width (desktop-features-spec §5): the phone's shell under
// 720 px, the navigation rail from 720 to 1024 px, and the list and detail panes side by side
// above 1024 px. And where a screen opens: one with a site address (a stop, a bus) in the detail
// pane on a wide window, replacing what it showed, or on top of it when opened from inside it;
// the departures board and screens without an address over the whole window, as on Android.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/app/shell.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/theme/theme.dart';

void main() {
  group('the layout for a width', () {
    test('under 720 px is the phone', () {
      expect(DeskPanes.layoutFor(360), DeskLayout.phone);
      expect(DeskPanes.layoutFor(719.9), DeskLayout.phone);
    });
    test('720 to 1024 px is the rail and one pane', () {
      expect(DeskPanes.layoutFor(720), DeskLayout.rail);
      expect(DeskPanes.layoutFor(800), DeskLayout.rail);
      expect(DeskPanes.layoutFor(1024), DeskLayout.rail);
    });
    test('above 1024 px is split', () {
      expect(DeskPanes.layoutFor(1024.5), DeskLayout.split);
      expect(DeskPanes.layoutFor(1120), DeskLayout.split);
      expect(DeskPanes.layoutFor(3840), DeskLayout.split);
    });
    test('the list pane is 360 to 400 px wide', () {
      expect(DeskPanes.listWidth(940), 360);
      expect(DeskPanes.listWidth(1100), closeTo(374, 0.01));
      expect(DeskPanes.listWidth(2400), 400);
    });
    test('without the chrome (Android), the shell is the phone', () {
      expect(DeskPanes.layoutOf(_FakeContext()), DeskLayout.phone);
    });
  });

  group('screens and the detail pane', () {
    setUp(() {
      Store.memory({'sgbus_tour': 'done', 'sgbus_first_run': 'done', 'sgbus_start': 'timings'});
      AppNav.fromPane = false;
    });

    /// The shell, in [layout], in a window [width] px wide, with two plain pages.
    Future<void> shell(WidgetTester t, DeskLayout layout, double width) async {
      t.view.physicalSize = Size(width, 700);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        navigatorKey: AppNav.navigatorKey,
        theme: AppLook.I.theme(Brightness.light),
        home: DeskLayoutScope(
          layout: layout,
          child: Shell(pages: {
            'timings': () => const Center(child: Text('the list')),
            'favs': () => const Center(child: Text('the favourites')),
          }),
        ),
      ));
      await t.pumpAndSettle();
    }

    /// Opens a plain screen called [text], as a feature would.
    Future<void> open(WidgetTester t, String text, {String name = 'stop', String? address}) async {
      AppNav.push(Scaffold(body: Center(child: Text(text))), name: name, address: address);
      await t.pumpAndSettle();
    }

    testWidgets('split: a stop opens in the pane, beside the list', (t) async {
      await shell(t, DeskLayout.split, 1200);
      expect(find.text('Pick a stop or a bus to see its timings here.'), findsOneWidget);
      await open(t, 'stop 84009', address: '#84009');
      final list = t.getRect(find.text('the list'));
      final stop = t.getRect(find.text('stop 84009'));
      expect(list.center.dx, lessThan(400), reason: 'the list stays in its pane on the left');
      expect(stop.center.dx, greaterThan(400), reason: 'the stop is in the detail pane');
      expect(AppNav.nav!.canPop(), isFalse, reason: 'nothing was pushed over the whole window');
      expect(AppNav.paneShowsScreen, isTrue);
    });

    testWidgets('split: from the list, a new stop replaces the one shown', (t) async {
      await shell(t, DeskLayout.split, 1200);
      await open(t, 'stop 84009', address: '#84009');
      await open(t, 'stop 84011', address: '#84011');
      expect(find.text('stop 84009'), findsNothing);
      expect(find.text('stop 84011'), findsOneWidget);
      AppNav.pane!.pop();
      await t.pumpAndSettle();
      expect(AppNav.paneShowsScreen, isFalse, reason: 'Back leaves the pane empty, not on the stop before');
    });

    testWidgets('split: from inside the pane, a bus goes on top, and Back comes back', (t) async {
      await shell(t, DeskLayout.split, 1200);
      await open(t, 'stop 84009', address: '#84009');
      AppNav.fromPane = true;
      await open(t, 'bus 22', name: 'bus', address: '#bus/22');
      expect(find.text('bus 22'), findsOneWidget);
      expect(AppNav.fromPane, isFalse, reason: 'used once, so a keyboard or menu open next replaces');
      AppNav.pane!.pop();
      await t.pumpAndSettle();
      expect(find.text('stop 84009'), findsOneWidget);
    });

    testWidgets('split: the board and screens without an address use the whole window', (t) async {
      await shell(t, DeskLayout.split, 1200);
      await open(t, 'the board', name: 'board', address: '#board/84009');
      expect(AppNav.nav!.canPop(), isTrue);
      expect(t.getRect(find.text('the board')).center.dx, closeTo(600, 1));
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      await open(t, 'settings', name: 'settings');
      expect(AppNav.nav!.canPop(), isTrue);
      expect(AppNav.paneShowsScreen, isFalse);
    });

    testWidgets('split: over a full-screen screen, a stop opens over it too', (t) async {
      await shell(t, DeskLayout.split, 1200);
      await open(t, 'settings', name: 'settings');
      await open(t, 'stop 84009', address: '#84009');
      expect(AppNav.paneShowsScreen, isFalse);
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(find.text('settings'), findsOneWidget, reason: 'Back comes back to it, as on the phone');
    });

    testWidgets('rail: the stop covers the list while it shows', (t) async {
      await shell(t, DeskLayout.rail, 900);
      expect(find.text('the list'), findsOneWidget);
      await open(t, 'stop 84009', address: '#84009');
      expect(find.text('stop 84009'), findsOneWidget);
      expect(find.text('the list'), findsNothing, reason: 'the list is offstage under the stop');
      AppNav.pane!.pop();
      await t.pumpAndSettle();
      expect(find.text('the list'), findsOneWidget);
    });

    testWidgets('phone: a stop is pushed over everything, as on Android', (t) async {
      await shell(t, DeskLayout.phone, 600);
      await open(t, 'stop 84009', address: '#84009');
      expect(AppNav.pane, isNull);
      expect(AppNav.nav!.canPop(), isTrue);
    });

    testWidgets('a page picked clears the pane', (t) async {
      await shell(t, DeskLayout.split, 1200);
      await open(t, 'stop 84009', address: '#84009');
      AppNav.showPage('favs');
      await t.pumpAndSettle();
      expect(AppNav.paneShowsScreen, isFalse);
      expect(find.text('the favourites'), findsOneWidget);
    });
  });
}

/// A context with no chrome above it, as on Android.
class _FakeContext extends Fake implements BuildContext {
  @override
  T? dependOnInheritedWidgetOfExactType<T extends InheritedWidget>({Object? aspect}) => null;
}
