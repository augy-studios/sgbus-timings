// The shared screens' desktop manners (lib/desktop/adaptive.dart): a sheet stays a phone's bottom
// sheet on Android and becomes a dialog or a right-hand panel on the desktop, closed with Esc or
// Ctrl+W (Cmd+W on a Mac); the right-click menu shows only on the desktop, with the right items,
// and does what it says. `Native.fake(['desktop', ...])` stands in for the desktop app's bridge
// host, as the guide's screenshots fake a phone's.
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/nav.dart';
import 'package:sgbus_timings/data/favs.dart';
import 'package:sgbus_timings/data/store.dart';
import 'package:sgbus_timings/desktop/adaptive.dart';
import 'package:sgbus_timings/native/native_bridge.dart';
import 'package:sgbus_timings/theme/theme.dart';
import 'package:sgbus_timings/widgets/stop_rows.dart';

/// A page with one button that opens a sheet through AppSheet.show, keeping what it closed with.
/// In the app's own look, which its rows (StopRows) need.
Widget _opener({required WidgetBuilder sheet, DeskSheet desktop = DeskSheet.dialog, void Function(Object?)? closed}) => MaterialApp(
      theme: AppLook.I.theme(Brightness.light),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async {
                final got = await AppSheet.show<Object>(context: context, desktop: desktop, isScrollControlled: true, builder: sheet);
                closed?.call(got);
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );

/// A page with one right-clickable row for [target], in the window [layout] the desktop's chrome
/// hands down (none, as on a phone, if it isn't given).
Widget _row(DeskTarget target, {DeskLayout? layout}) {
  final page = Scaffold(body: DeskContextMenu(target: target, child: const ListTile(title: Text('The row'))));
  return MaterialApp(home: layout == null ? page : DeskLayoutScope(layout: layout, child: page));
}

/// What the screens asked the bridge for, while it stands in for the desktop app's.
final _calls = <(String, Map<String, dynamic>?)>[];

/// Stands in for the desktop app: the bridge's host listing 'desktop', the tray countdown and
/// widgets, and answering every call, each kept in [_calls].
void _desktop() => Native.fake(['desktop', 'glance', 'widgets'], (plugin, method, options) async {
      _calls.add((method, options));
      return <String, dynamic>{};
    });

void main() {
  setUp(() {
    Store.memory({});
    _calls.clear();
  });
  tearDown(() => Native.fake(const [], null));

  group('AppSheet.show', () {
    testWidgets('on Android, the same bottom sheet as ever', (t) async {
      await t.pumpWidget(_opener(sheet: (_) => const Text('Sheet body')));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.text('Sheet body'), findsOneWidget);
      expect(find.byType(BottomSheet), findsOneWidget);
      expect(find.byType(Dialog), findsNothing);
      expect(find.byTooltip('Close'), findsNothing);
      final route = ModalRoute.of(t.element(find.text('Sheet body')))! as ModalBottomSheetRoute;
      expect(route.isScrollControlled, isTrue);
    });

    testWidgets('on the desktop, a sheet that asked not to be dismissed has no Close, and Esc leaves it', (t) async {
      _desktop();
      await t.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => AppSheet.show<void>(context: context, isDismissible: false, builder: (_) => const Text('Stays')),
            child: const Text('Open'),
          ),
        ),
      ));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.byTooltip('Close'), findsNothing);
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
      await t.pumpAndSettle();
      expect(find.text('Stays'), findsOneWidget);
    });

    testWidgets('on the desktop, a dialog that gives back what it closed with', (t) async {
      _desktop();
      Object? got = 'not yet';
      await t.pumpWidget(_opener(
        sheet: (ctx) => TextButton(onPressed: () => Navigator.pop(ctx, 'picked'), child: const Text('Pick me')),
        closed: (v) => got = v,
      ));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
      expect(find.byType(BottomSheet), findsNothing);
      expect(find.byTooltip('Close'), findsOneWidget);
      await t.tap(find.text('Pick me'));
      await t.pumpAndSettle();
      expect(got, 'picked');
      expect(find.byType(Dialog), findsNothing);
    });

    testWidgets('on the desktop, a panel down the right edge, its full height', (t) async {
      _desktop();
      await t.pumpWidget(_opener(sheet: (_) => const Text('Panel body'), desktop: DeskSheet.panel));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.byType(BottomSheet), findsNothing);
      expect(find.byType(Dialog), findsNothing);
      final panel = t.getRect(find.ancestor(of: find.text('Panel body'), matching: find.byType(Material)).first);
      final screen = t.getRect(find.byType(Scaffold));
      expect(panel.right, screen.right);
      expect(panel.width, AppSheet.panelWidth);
      expect(panel.height, screen.height);
    });

    testWidgets('Esc closes the dialog, Ctrl+W the panel', (t) async {
      _desktop();
      await t.pumpWidget(_opener(sheet: (_) => const Text('Body')));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.text('Body'), findsOneWidget);
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
      await t.pumpAndSettle();
      expect(find.text('Body'), findsNothing);

      await t.pumpWidget(_opener(sheet: (_) => const Text('Body'), desktop: DeskSheet.panel));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.text('Body'), findsOneWidget);
      await t.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.keyW);
      await t.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await t.pumpAndSettle();
      expect(find.text('Body'), findsNothing);
    });

    testWidgets('on a Mac, Cmd+W closes it', (t) async {
      _desktop();
      debugDefaultTargetPlatformOverride = TargetPlatform.macOS;
      await t.pumpWidget(_opener(sheet: (_) => const Text('Body')));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      await t.sendKeyDownEvent(LogicalKeyboardKey.metaLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.keyW);
      await t.sendKeyUpEvent(LogicalKeyboardKey.metaLeft);
      await t.pumpAndSettle();
      expect(find.text('Body'), findsNothing);
      debugDefaultTargetPlatformOverride = null;
    });

    testWidgets('a search box that asks for focus still gets it, and Esc still closes', (t) async {
      _desktop();
      await t.pumpWidget(_opener(sheet: (_) => const TextField(autofocus: true), desktop: DeskSheet.panel));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(t.widget<EditableText>(find.byType(EditableText)).focusNode.hasFocus, isTrue);
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
      await t.pumpAndSettle();
      expect(find.byType(TextField), findsNothing);
    });
  });

  group('AppSheet.draggable', () {
    Widget list(BuildContext _) => AppSheet.draggable(
          expand: false,
          initialChildSize: 0.7,
          builder: (ctx, scroll) => ListView(controller: scroll, children: [for (var i = 0; i < 40; i++) Text('Row $i')]),
        );

    testWidgets('drags on Android', (t) async {
      await t.pumpWidget(_opener(sheet: list));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.byType(DraggableScrollableSheet), findsOneWidget);
    });

    testWidgets('fills the panel on the desktop, and scrolls', (t) async {
      _desktop();
      await t.pumpWidget(_opener(sheet: list, desktop: DeskSheet.panel));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      expect(find.byType(DraggableScrollableSheet), findsNothing);
      expect(find.text('Row 0'), findsOneWidget);
      await t.drag(find.byType(ListView), const Offset(0, -2000));
      await t.pumpAndSettle();
      expect(find.text('Row 39'), findsOneWidget);
    });
  });

  group('the right-click menu', () {
    testWidgets('in a picker, Open picks the stop and closes the picker, as a click does', (t) async {
      _desktop();
      Object? got = 'not yet';
      await t.pumpWidget(_opener(
        desktop: DeskSheet.panel,
        sheet: (ctx) => StopRows(stops: const [StopRowItem('84009')], pin: false, onPick: (code) => Navigator.pop(ctx, code)),
        closed: (v) => got = v,
      ));
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      await t.tap(find.text('84009').first, buttons: kSecondaryButton);
      await t.pumpAndSettle();
      await t.tap(find.text('Open').last);
      await t.pumpAndSettle();
      expect(got, '84009');
      expect(find.byType(StopRows), findsNothing);
    });

    test('Tray countdown and Desktop widget need the desktop, not only the features', () {
      Native.fake(['glance', 'widgets'], (plugin, method, options) async => <String, dynamic>{});
      expect(DeskActions.canTray, isFalse);
      expect(DeskActions.canWidget, isFalse);
      _desktop();
      expect(DeskActions.canTray, isTrue);
      expect(DeskActions.canWidget, isTrue);
    });

    testWidgets('not on Android', (t) async {
      await t.pumpWidget(_row(const DeskTarget.stop('84009')));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      expect(find.byType(PopupMenuItem<Object>), findsNothing);
      expect(find.text('Copy link'), findsNothing);
    });

    testWidgets("a stop's five items on the desktop", (t) async {
      _desktop();
      await t.pumpWidget(_row(const DeskTarget.stop('84009')));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      for (final item in ['Open', 'Pin as a desktop widget', 'Set as tray countdown', 'Star', 'Copy link']) {
        expect(find.text(item), findsOneWidget, reason: item);
      }
    });

    testWidgets('a bus on its own has no tray countdown or widget', (t) async {
      _desktop();
      await t.pumpWidget(_row(const DeskTarget.bus('174')));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      expect(find.text('Open'), findsOneWidget);
      expect(find.text('Star'), findsOneWidget);
      expect(find.text('Copy link'), findsOneWidget);
      expect(find.text('Pin as a desktop widget'), findsNothing);
      expect(find.text('Set as tray countdown'), findsNothing);
    });

    testWidgets('in the split layout, Open says it opens in the split pane', (t) async {
      _desktop();
      await t.pumpWidget(_row(const DeskTarget.stop('84009'), layout: DeskLayout.split));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      expect(find.text('Open in split pane'), findsOneWidget);
    });

    testWidgets('beside the rail without a split, Open is just Open', (t) async {
      _desktop();
      await t.pumpWidget(_row(const DeskTarget.stop('84009'), layout: DeskLayout.rail));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      expect(find.text('Open'), findsOneWidget);
      expect(find.text('Open in split pane'), findsNothing);
    });

    testWidgets('Star stars the stop, and then it says Unstar', (t) async {
      _desktop();
      await t.pumpWidget(_row(const DeskTarget.stop('84009')));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      await t.tap(find.text('Star'));
      await t.pumpAndSettle();
      expect(Favs.I.isStop('84009'), isTrue);
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      expect(find.text('Unstar'), findsOneWidget);
    });

    testWidgets('Star on a bus at a stop stars that bus there, and Unstar takes it out', (t) async {
      _desktop();
      const target = DeskTarget.stop('84009', buses: '174');
      DeskActions.toggleStar(target);
      expect(Favs.I.isStopBus('84009', '174'), isTrue);
      expect(Favs.I.isStop('84009'), isFalse);
      DeskActions.toggleStar(target);
      expect(Favs.I.isStopBus('84009', '174'), isFalse);
    });

    testWidgets("Copy link shares the stop's site address, which the desktop copies", (t) async {
      _desktop();
      await t.pumpWidget(_row(const DeskTarget.stop('84009', buses: '174')));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      await t.tap(find.text('Copy link'));
      await t.pumpAndSettle();
      final share = _calls.where((c) => c.$1 == 'share').single;
      expect(share.$2?['url'], 'https://sgbus.uwuapps.org/#84009,174');
    });

    testWidgets('Set as tray countdown and Pin as a desktop widget ask the desktop for them', (t) async {
      _desktop();
      await t.pumpWidget(_row(const DeskTarget.stop('84009', buses: '174')));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      await t.tap(find.text('Set as tray countdown'));
      await t.pumpAndSettle();
      final tray = _calls.where((c) => c.$1 == 'setTrayStop').single;
      expect(tray.$2?['code'], '84009');
      expect(tray.$2?['service'], '174');
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      await t.tap(find.text('Pin as a desktop widget'));
      await t.pumpAndSettle();
      final widget = _calls.where((c) => c.$1 == 'addWidget').single;
      expect(widget.$2?['code'], '84009');
      expect(widget.$2?['buses'], ['174']);
    });

    testWidgets('a desktop without a tray countdown or widgets leaves them out', (t) async {
      Native.fake(['desktop'], (plugin, method, options) async => <String, dynamic>{});
      await t.pumpWidget(_row(const DeskTarget.stop('84009')));
      await t.tap(find.text('The row'), buttons: kSecondaryButton);
      await t.pumpAndSettle();
      expect(find.text('Open'), findsOneWidget);
      expect(find.text('Pin as a desktop widget'), findsNothing);
      expect(find.text('Set as tray countdown'), findsNothing);
    });
  });

  group('DeskTarget', () {
    test('its links, as the Share buttons make them', () {
      expect(const DeskTarget.stop('84009').link, 'https://sgbus.uwuapps.org/#84009');
      expect(const DeskTarget.bus('174').link, 'https://sgbus.uwuapps.org/#bus/174');
    });

    test('a group such as 22* is neither starred nor put on a widget', () {
      const group = DeskTarget.stop('84009', buses: '22*');
      expect(group.busList, isEmpty);
      expect(group.canStar, isFalse);
      expect(const DeskTarget.stop('84009', buses: '174,175').busList, ['174', '175']);
    });
  });

  group('hover and scrolling', () {
    testWidgets('DeskHover shows the pointer only on the desktop', (t) async {
      Finder pointer() => find.descendant(of: find.byType(DeskHover), matching: find.byWidgetPredicate((w) => w is MouseRegion && w.cursor == SystemMouseCursors.click));
      await t.pumpWidget(const MaterialApp(home: DeskHover(child: Text('Card'))));
      expect(pointer(), findsNothing);
      _desktop();
      await t.pumpWidget(const MaterialApp(home: DeskHover(child: Text('Card'))));
      expect(pointer(), findsOneWidget);
    });

    testWidgets('DeskScrollBehavior: no glow or stretch, no bounce, and a scroll bar', (t) async {
      await t.pumpWidget(MaterialApp(
        scrollBehavior: const DeskScrollBehavior(),
        home: ListView(children: [for (var i = 0; i < 60; i++) Text('Row $i')]),
      ));
      expect(find.byType(GlowingOverscrollIndicator), findsNothing);
      expect(find.byType(StretchingOverscrollIndicator), findsNothing);
      expect(find.byType(Scrollbar), findsOneWidget);
      final context = t.element(find.byType(ListView));
      expect(const DeskScrollBehavior().getScrollPhysics(context), isA<ClampingScrollPhysics>());
      expect(const DeskScrollBehavior().dragDevices, isNot(contains(PointerDeviceKind.mouse)));
    });

    testWidgets('DeskTooltips waits 400 ms', (t) async {
      late BuildContext inside;
      await t.pumpWidget(MaterialApp(home: DeskTooltips(child: Builder(builder: (c) {
        inside = c;
        return const SizedBox();
      }))));
      expect(TooltipTheme.of(inside).waitDuration, const Duration(milliseconds: 400));
    });
  });
}
