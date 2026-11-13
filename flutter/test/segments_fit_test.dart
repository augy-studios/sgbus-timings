// Choices in a language with long words (bug reports 20261107-RUHF and FYAG): side by side while each
// one's words fit, one under another where they don't, and never a word broken in two.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/alerts/alerts.dart';
import 'package:sgbus_timings/features/settings/settings_screen.dart';
import 'package:sgbus_timings/theme/theme.dart';
import 'package:sgbus_timings/widgets/common.dart';

import 'shots/harness.dart';

const _state = {'sgbus_tour': 'done', 'sgbus_first_run': 'done'};

void _noWordBroken(WidgetTester t, {required int atLeast}) {
  final words = find.descendant(of: find.byWidgetPredicate((w) => w is SegmentedButton), matching: find.byType(RichText));
  expect(words.evaluate().length, greaterThanOrEqualTo(atLeast));
  for (final e in words.evaluate()) {
    final p = e.findRenderObject()! as RenderParagraph;
    expectNoWordBroken(p);
  }
}

Axis _way(WidgetTester t, int i) => t.widget<SegmentedButton<dynamic>>(find.byWidgetPredicate((w) => w is SegmentedButton).at(i)).direction;

void main() {
  setUpAll(() async {
    await loadFonts();
    await loadTamil();
  });

  Future<void> pump(WidgetTester t, Widget home, {double width = 360, double scale = 1}) async {
    AppLook.I.materialYou = true;
    // Tall enough for the whole page: a list only builds what's on the screen.
    t.view.physicalSize = Size(width, 6000) * 3;
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(MediaQuery(
      data: MediaQueryData(size: Size(width, 6000), devicePixelRatio: 3, textScaler: TextScaler.linear(scale)),
      child: MaterialApp(theme: withTamil(AppLook.I.theme(Brightness.dark)), home: Scaffold(body: home)),
    ));
    for (var i = 0; i < 4; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
      await settle(t);
    }
    expect(t.takeException(), isNull);
  }

  Widget seg(List<String> labels) => Padding(
        padding: const EdgeInsets.all(16),
        child: SizedBox(
          width: double.infinity,
          child: FitSegments<String>(options: [for (final l in labels) (l, l)], selected: labels.first, onChanged: (_) {}),
        ),
      );

  group('FitSegments', () {
    testWidgets('short words: side by side', (t) async {
      await t.runAsync(() => stillData(state: _state, lang: 'en'));
      await pump(t, seg(['Off', 'All updates', 'Disruptions only']));
      expect(_way(t, 0), Axis.horizontal);
      _noWordBroken(t, atLeast: 3);
    });

    testWidgets('Theme’s Mode in English stays side by side, with its hyphen', (t) async {
      await t.runAsync(() => stillData(state: _state, lang: 'en'));
      await pump(t, seg(['Light', 'Dark', 'Time-based', 'Phone’s setting']), width: 412);
      expect(_way(t, 0), Axis.horizontal);
      _noWordBroken(t, atLeast: 4);
    });

    testWidgets('a word too long for its share: one under another', (t) async {
      await t.runAsync(() => stillData(state: _state, lang: 'en'));
      await pump(t, seg(['Off', 'Extraordinarilylongword', 'On']));
      expect(_way(t, 0), Axis.vertical);
      _noWordBroken(t, atLeast: 3);
    });

    testWidgets('too many lines: one under another', (t) async {
      await t.runAsync(() => stillData(state: _state, lang: 'en'));
      await pump(t, seg(['a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j k l m n o p', 'On']), width: 200);
      expect(_way(t, 0), Axis.vertical);
    });

    testWidgets('Chinese breaks anywhere, so it stays side by side', (t) async {
      await t.runAsync(() => stillData(state: _state, lang: 'zh-SG'));
      await pump(t, seg(['关闭', '所有更新', '仅限服务中断']));
      expect(_way(t, 0), Axis.horizontal);
    });

    testWidgets('tapping still picks', (t) async {
      await t.runAsync(() => stillData(state: _state, lang: 'en'));
      String? picked;
      await pump(t, Padding(
        padding: const EdgeInsets.all(16),
        child: FitSegments<String>(options: const [('a', 'Off'), ('b', 'Extraordinarilylongword'), ('c', 'On')], selected: 'a', onChanged: (v) => picked = v),
      ));
      await t.tap(find.text('On'));
      expect(picked, 'c');
    });
  });

  for (final lang in ['en', 'ms', 'ta', 'zh-SG']) {
    for (final (width, scale) in [(360.0, 1.0), (320.0, 1.0), (360.0, 1.3)]) {
      testWidgets('Service alerts in $lang at $width, text x$scale', (t) async {
        await t.runAsync(() => stillData(state: _state, lang: lang));
        await pump(t, const AlertsPage(), width: width, scale: scale);
        _noWordBroken(t, atLeast: 6);
      });

      testWidgets('Settings, Navigate in $lang at $width, text x$scale', (t) async {
        await t.runAsync(() => stillData(state: _state, lang: lang));
        await pump(t, const SettingsGroup(group: 'navigate'), width: width, scale: scale);
        _noWordBroken(t, atLeast: 8);
      });
    }
  }
}
