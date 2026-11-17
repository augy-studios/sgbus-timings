// The desktop's layout by the window's width (desktop-features-spec §5): the phone's shell under
// 720 px, the navigation rail from 720 to 1024 px, and the list and detail panes side by side
// above 1024 px. And where a screen opens: one with a site address (a stop, a bus) in the detail
// pane on a wide window, replacing what it showed, or on top of it when opened from inside it;
// the departures board and screens without an address over the whole window, as on Android. A
// dialog a pane's screen opened closes when another screen replaces that one.
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/app/shell.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/desktop/adaptive.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
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

    /// The shell, in [layout], in a window [width] px wide, with two plain pages. [observers]
    /// watch the app's navigator, as the desktop's title bar does.
    Future<void> shell(WidgetTester t, DeskLayout layout, double width, {List<NavigatorObserver> observers = const []}) async {
      t.view.physicalSize = Size(width, 700);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        navigatorKey: AppNav.navigatorKey,
        navigatorObservers: observers,
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

    testWidgets("split: a dialog from the pane's screen closes when another screen replaces it", (t) async {
      Native.fake(['desktop'], (_, _, _) async => <String, dynamic>{});
      // The title bar's watcher, as desktop/chrome.dart sets it up.
      final watcher = RouteWatcher();
      AppNav.rootWatcher = watcher;
      addTearDown(() {
        AppNav.rootWatcher = null;
        Native.fake(const [], null);
      });
      await shell(t, DeskLayout.split, 1200, observers: [watcher]);
      Object? got = 'not yet';
      AppNav.push(_Picker(closed: (v) => got = v), name: 'stop', address: '#84009');
      await t.pumpAndSettle();
      await t.tap(find.text('Pick a bus'));
      await t.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);

      // The command bar, Forward, a link or the tray opens another stop while it's up.
      await open(t, 'stop 84011', address: '#84011');
      expect(find.byType(Dialog), findsNothing);
      expect(got, isNull, reason: 'the screen that opened it hears it closed with nothing');
      expect(find.text('Pick a bus'), findsNothing, reason: 'the stop it came from was replaced');
      expect(find.text('stop 84011').hitTestable(), findsOneWidget, reason: 'nothing left over the new stop');
      expect(AppNav.nav!.canPop(), isFalse);
      expect(t.takeException(), isNull);
    });

    testWidgets("phone: a screen opens over a sheet that's up, which is still there after Back, as on Android", (t) async {
      await shell(t, DeskLayout.phone, 600);
      AppNav.push(_Picker(closed: (_) {}), name: 'stop', address: '#84009');
      await t.pumpAndSettle();
      await t.tap(find.text('Pick a bus'));
      await t.pumpAndSettle();
      expect(find.byType(BottomSheet), findsOneWidget);
      await open(t, 'bus 22', name: 'bus', address: '#bus/22');
      expect(find.text('bus 22'), findsOneWidget);
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(find.byType(BottomSheet), findsOneWidget);
    });
  });

  group('narrowing the window to the phone layout', () {
    /// The window's layout, as the desktop's chrome hands it down; changed as the window would.
    late ValueNotifier<DeskLayout> layout;

    /// The title bar's watcher of the app's navigator, and its Back and Forward, set up as
    /// desktop/chrome.dart sets them.
    late RouteWatcher watcher;
    late ViewHistory history;

    setUp(() {
      Store.memory({'sgbus_tour': 'done', 'sgbus_first_run': 'done', 'sgbus_start': 'timings'});
      AppNav.fromPane = false;
      Native.fake(['desktop'], (_, _, _) async => <String, dynamic>{});
      history = ViewHistory()..pageShown('timings');
      watcher = RouteWatcher()..onNewScreen = history.screenOpened;
      AppNav.rootWatcher = watcher;
      DeskPanes.observer.onNewScreen = history.screenOpened;
      DeskPanes.historyStep = (step) => history.stepping(step);
    });
    tearDown(() {
      AppNav.rootWatcher = null;
      DeskPanes.observer.onNewScreen = null;
      DeskPanes.historyStep = null;
      Native.fake(const [], null);
    });

    /// The shell in [start], with its layout following [layout].
    Future<void> shell(WidgetTester t, DeskLayout start) async {
      t.view.physicalSize = const Size(1200, 700);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      layout = ValueNotifier(start);
      addTearDown(layout.dispose);
      await t.pumpWidget(MaterialApp(
        navigatorKey: AppNav.navigatorKey,
        navigatorObservers: [watcher],
        theme: AppLook.I.theme(Brightness.light),
        home: ValueListenableBuilder<DeskLayout>(
          valueListenable: layout,
          builder: (_, now, shell) => DeskLayoutScope(layout: now, child: shell!),
          child: Shell(pages: {'timings': () => const Center(child: Text('the list'))}),
        ),
      ));
      await t.pumpAndSettle();
    }

    /// Opens a plain screen called [text] with a site address, from the list or ([fromPane])
    /// from inside the detail pane.
    Future<void> open(WidgetTester t, String text, String address, {bool fromPane = false}) async {
      AppNav.fromPane = fromPane;
      AppNav.push(Scaffold(body: Center(child: Text(text))), name: 'stop', address: address);
      await t.pumpAndSettle();
    }

    /// The layout changes to [to], as the window crosses a width.
    Future<void> resize(WidgetTester t, DeskLayout to) async {
      layout.value = to;
      await t.pumpAndSettle();
    }

    testWidgets("the detail pane's screens move over the whole window, in order", (t) async {
      await shell(t, DeskLayout.split);
      await open(t, 'stop 84009', '#84009');
      await open(t, 'bus 22', '#bus/22', fromPane: true);
      await resize(t, DeskLayout.phone);
      expect(AppNav.pane, isNull, reason: 'the pane has gone');
      expect(find.text('bus 22'), findsOneWidget, reason: 'what was in front still is');
      expect(AppNav.addressOf(DeskPanes.observer.ownTop), isNull, reason: "the pane's watcher let them go");
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(find.text('stop 84009'), findsOneWidget, reason: 'Back steps through them as before');
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(find.text('the list'), findsOneWidget);
      expect(AppNav.nav!.canPop(), isFalse);
    });

    testWidgets('from the rail layout too', (t) async {
      await shell(t, DeskLayout.rail);
      await open(t, 'stop 84009', '#84009');
      await resize(t, DeskLayout.phone);
      expect(find.text('stop 84009'), findsOneWidget);
      expect(AppNav.nav!.canPop(), isTrue);
    });

    testWidgets("going wide again doesn't open them twice", (t) async {
      await shell(t, DeskLayout.split);
      await open(t, 'stop 84009', '#84009');
      await open(t, 'bus 22', '#bus/22', fromPane: true);
      await resize(t, DeskLayout.phone);
      await resize(t, DeskLayout.split);
      expect(AppNav.paneShowsScreen, isFalse, reason: 'the new pane starts empty');
      expect(find.text('bus 22', skipOffstage: false), findsOneWidget);
      expect(find.text('stop 84009', skipOffstage: false), findsOneWidget);
      AppNav.nav!.pop();
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(AppNav.nav!.canPop(), isFalse, reason: 'just the two, over the shell');

      // And narrowing again, with nothing in the pane, opens nothing.
      await resize(t, DeskLayout.phone);
      expect(AppNav.nav!.canPop(), isFalse);
      expect(find.text('the list'), findsOneWidget);
    });

    testWidgets('an empty pane moves nothing', (t) async {
      await shell(t, DeskLayout.split);
      await resize(t, DeskLayout.phone);
      expect(AppNav.nav!.canPop(), isFalse);
      expect(find.text('the list'), findsOneWidget);
    });

    testWidgets("a dialog the pane's screen opened closes first, not left under the moved screen", (t) async {
      await shell(t, DeskLayout.split);
      Object? got = 'not yet';
      AppNav.push(_Picker(closed: (v) => got = v), name: 'stop', address: '#84009');
      await t.pumpAndSettle();
      await t.tap(find.text('Pick a bus'));
      await t.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);

      await resize(t, DeskLayout.phone);
      expect(find.byType(Dialog, skipOffstage: false), findsNothing);
      expect(got, isNull, reason: 'the screen that opened it hears it closed with nothing');
      expect(find.text('Pick a bus').hitTestable(), findsOneWidget, reason: 'the stop, moved, is in front');
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(find.text('the list'), findsOneWidget, reason: 'Back goes to the list, not to a stale dialog');
      expect(AppNav.nav!.canPop(), isFalse);
      expect(t.takeException(), isNull);
    });

    testWidgets('with Settings open, it stays in front; the screens move once it closes', (t) async {
      await shell(t, DeskLayout.split);
      await open(t, 'stop 84009', '#84009');
      await open(t, 'bus 22', '#bus/22', fromPane: true);
      AppNav.push(const Scaffold(body: Center(child: Text('Settings'))), name: 'settings');
      await t.pumpAndSettle();

      await resize(t, DeskLayout.phone);
      expect(find.text('Settings').hitTestable(), findsOneWidget, reason: 'still what the person sees');
      expect(find.text('bus 22', skipOffstage: false), findsNothing, reason: 'waiting, not yet over the window');

      AppNav.nav!.pop(); // closes Settings
      await t.pumpAndSettle();
      expect(find.text('bus 22').hitTestable(), findsOneWidget);
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(find.text('stop 84009').hitTestable(), findsOneWidget, reason: 'in the same order');
      AppNav.nav!.pop();
      await t.pumpAndSettle();
      expect(find.text('the list'), findsOneWidget);
      expect(AppNav.nav!.canPop(), isFalse);
    });

    testWidgets('widened again while they wait, they go back into the pane', (t) async {
      await shell(t, DeskLayout.split);
      await open(t, 'stop 84009', '#84009');
      await open(t, 'bus 22', '#bus/22', fromPane: true);
      AppNav.push(const Scaffold(body: Center(child: Text('Settings'))), name: 'settings');
      await t.pumpAndSettle();
      await resize(t, DeskLayout.phone);
      await resize(t, DeskLayout.split);
      expect(AppNav.paneShowsScreen, isTrue);
      expect(find.text('Settings').hitTestable(), findsOneWidget, reason: 'Settings is still in front');

      AppNav.nav!.pop(); // closes Settings
      await t.pumpAndSettle();
      expect(AppNav.nav!.canPop(), isFalse, reason: 'nothing was moved over the window as well');
      expect(find.text('bus 22').hitTestable(), findsOneWidget);
      AppNav.pane!.pop();
      await t.pumpAndSettle();
      expect(find.text('stop 84009').hitTestable(), findsOneWidget, reason: 'in the same order, in the pane');
    });

    testWidgets("moving the screens leaves the title bar's Forward as it was", (t) async {
      await shell(t, DeskLayout.split);
      await open(t, 'stop 84009', '#84009');
      await open(t, 'bus 22', '#bus/22', fromPane: true);
      // Then something for Forward to open again: a page left with Back, as chrome.dart's Back
      // does it.
      history.pageShown('favs');
      final before = history.backAPage()!;
      history.stepping(() => history.pageShown(before));
      expect(history.canForward, isTrue);

      await resize(t, DeskLayout.phone);
      expect(find.text('bus 22'), findsOneWidget);
      expect(history.canForward, isTrue, reason: 'the moved screens are not new ones');
    });
  });
}

/// A stop's screen in miniature: Pick a bus opens a sheet (a dialog on the desktop) with one
/// choice, and the screen shows what was picked. [closed] hears what the sheet closed with.
class _Picker extends StatefulWidget {
  const _Picker({required this.closed});
  final void Function(String?) closed;

  @override
  State<_Picker> createState() => _PickerState();
}

/// What was picked, shown on the button.
class _PickerState extends State<_Picker> {
  String _picked = '';

  /// Opens the sheet; once it closes, shows the pick if the screen's still there.
  Future<void> _pick() async {
    final pick = await AppSheet.show<String>(
      context: context,
      builder: (ctx) => TextButton(onPressed: () => Navigator.pop(ctx, '22'), child: const Text('Bus 22')),
    );
    widget.closed(pick);
    if (!mounted || pick == null) return;
    setState(() => _picked = pick);
  }

  /// The one button, with the pick beside its name.
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: TextButton(onPressed: _pick, child: Text('Pick a bus$_picked'))));
}

/// A context with no chrome above it, as on Android.
class _FakeContext extends Fake implements BuildContext {
  @override
  T? dependOnInheritedWidgetOfExactType<T extends InheritedWidget>({Object? aspect}) => null;
}
