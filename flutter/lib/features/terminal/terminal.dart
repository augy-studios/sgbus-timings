// The sgbus terminal: the Linux command line's sgbus> prompt, in the app, as the site's
// js/terminal.js has it on the page. The commands are core.dart (js/sgbus-core.js in Dart), so
// each says what it says there: 84009, nav home work, favs -w, help. Opened from Settings, Help
// and extras.
//
// As at the command line's prompt: commands without "sgbus" in front (it's dropped if typed),
// Up and Down through what's been typed before (kept as the site kept it, the last 500), Tab
// to finish a command or a place, Ctrl+C to stop a -w or clear the line, Ctrl+L or clear to
// clear the screen, and exit or Back to close. On a phone's keyboard, which has none of those
// keys, the bar under the screen has Tab, Up and Down, and a -w has Stop.
//
// What's saved is the app's own: fav add 84009 is a favourite on Bus timings too, place set gym
// is in Places, settings are Settings'. What's typed is only read as words, never run as code,
// and what's printed is text with nothing but the commands' own colours.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/nav.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../tour/tour.dart';
import 'core.dart';

class TerminalScreen extends StatefulWidget {
  const TerminalScreen({super.key});

  static const historyKey = 'sgbus_terminal_history';
  static const historyMax = 500;
  static const maxRows = 4000;

  static void register() => AppNav.register('terminal', (_) {
        AppNav.push(const TerminalScreen(), name: 'terminal');
        Tours.first('terminal');
      });

  // A terminal's own colours, light or dark as the app is.
  static const _dark = (bg: Color(0xFF0D1117), fg: Color(0xFFE6EDF3), dim: Color(0xFF8B949E), bar: Color(0xFF161B22));
  static const _light = (bg: Color(0xFFFFFFFF), fg: Color(0xFF1F2328), dim: Color(0xFF656D76), bar: Color(0xFFF6F8FA));
  static const _fgDark = {31: Color(0xFFFF7B72), 32: Color(0xFF3FB950), 33: Color(0xFFE3B341), 34: Color(0xFF58A6FF), 35: Color(0xFFD2A8FF), 36: Color(0xFF39C5CF)};
  static const _fgLight = {31: Color(0xFFCF222E), 32: Color(0xFF1A7F37), 33: Color(0xFF9A6700), 34: Color(0xFF0969DA), 35: Color(0xFF8250DF), 36: Color(0xFF1B7C83)};

  /// A line, its colour marks as styled spans.
  static TextSpan row(String text, {required bool dark}) {
    final colours = dark ? _dark : _light;
    final fgs = dark ? _fgDark : _fgLight;
    final spans = <TextSpan>[];
    var b = false, d = false;
    int? fg;
    void put(String s) {
      if (s.isEmpty) return;
      var colour = fg != null ? fgs[fg] ?? colours.fg : (d ? colours.dim : null);
      if (fg != null && d) colour = colour?.withValues(alpha: 0.75);
      spans.add(TextSpan(text: s, style: TextStyle(fontWeight: b ? FontWeight.w700 : null, color: colour)));
    }

    final re = RegExp('${SgbusCore.open}([0-9;]*)${SgbusCore.shut}');
    var last = 0;
    for (final m in re.allMatches(text)) {
      put(text.substring(last, m.start));
      for (final code in (m[1]!.isEmpty ? '0' : m[1]!).split(';').map(int.tryParse)) {
        if (code == 0) {
          b = d = false;
          fg = null;
        } else if (code == 1) {
          b = true;
        } else if (code == 2) {
          d = true;
        } else if (code == 22) {
          b = d = false;
        } else if (code != null && code >= 30 && code <= 37) {
          fg = code;
        } else if (code == 39) {
          fg = null;
        }
      }
      last = m.end;
    }
    put(text.substring(last));
    return TextSpan(children: spans);
  }

  @override
  State<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends State<TerminalScreen> {
  late final SgbusCore core;
  final rows = <String>[];
  final input = TextEditingController();
  final focus = FocusNode();
  final scroll = ScrollController();
  bool busy = false;
  List<String> history = [];
  int at = 0;
  String draft = '';

  @override
  void initState() {
    super.initState();
    final v = '${Native.info?['version'] ?? ''}';
    core = SgbusCore(out: print, clear: clearScreen, version: v.isEmpty ? 'app' : v);
    history = [for (final h in Store.I.list(TerminalScreen.historyKey)) if (h is String) h];
    at = history.length;
    rows.addAll([...core.intro(), '']);
  }

  @override
  void dispose() {
    core.stopWatching();
    input.dispose();
    focus.dispose();
    scroll.dispose();
    super.dispose();
  }

  void print(String text) {
    if (!mounted) return;
    setState(() {
      rows.addAll(text.split('\n'));
      if (rows.length > TerminalScreen.maxRows) rows.removeRange(0, rows.length - TerminalScreen.maxRows);
    });
    _toEnd();
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent);
      });

  void clearScreen() {
    if (mounted) setState(rows.clear);
  }

  // What was typed, after the prompt, as a terminal leaves it on screen.
  void echo(String text) => print('${SgbusCore.green('sgbus')}${SgbusCore.dim('>')} ${SgbusCore.clean(text)}');

  void remember(String text) {
    // Your calendar's private link isn't kept.
    if (!SgbusCore.remembered(text)) return;
    if (history.isEmpty || history.last != text) history.add(text);
    if (history.length > TerminalScreen.historyMax) history = history.sublist(history.length - TerminalScreen.historyMax);
    at = history.length;
    Store.I.putJson(TerminalScreen.historyKey, history);
  }

  void recall(int step) {
    if (at == history.length) draft = input.text;
    at = (at + step).clamp(0, history.length);
    final text = at == history.length ? draft : history[at];
    input.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }

  // Tab: the word before the caret finished, or as far as every match agrees, and listed when
  // that goes no further.
  void tab() {
    final caret = input.selection.baseOffset < 0 ? input.text.length : input.selection.baseOffset;
    final before = input.text.substring(0, caret);
    final (hits, word) = core.complete(before);
    if (hits.isEmpty) return;
    var add = '';
    if (hits.length == 1) {
      add = '${hits.first.substring(word.length)} ';
    } else {
      var common = hits.first;
      for (final h in hits) {
        while (!h.startsWith(common)) {
          common = common.substring(0, common.length - 1);
        }
      }
      add = common.substring(word.length);
      if (add.isEmpty) {
        echo(input.text);
        print(hits.join('  '));
        return;
      }
    }
    final text = before + add + input.text.substring(caret);
    input.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: caret + add.length));
  }

  void interrupt() {
    if (core.watching) return core.stopWatching();
    if (busy) return;
    echo('${input.text}^C');
    input.clear();
    at = history.length;
  }

  Future<void> submit() async {
    final text = input.text;
    input.clear();
    echo(text);
    var words = SgbusCore.wordsOf(text.trim());
    if (words.isNotEmpty && words.first == 'sgbus') words = words.sublist(1);
    if (words.isEmpty) return focus.requestFocus();
    remember(text.trim());
    final first = words.first;
    if (first == 'exit' || first == 'quit' || first == 'q') return close();
    if (first == 'clear') {
      clearScreen();
      return focus.requestFocus();
    }
    if (first == 'help' && words.length == 1) {
      print('${core.promptHelp()}\n');
      return focus.requestFocus();
    }
    setState(() => busy = true);
    try {
      await core.run(words);
    } catch (e) {
      core.report(e);
    } finally {
      print('');
      if (mounted) {
        setState(() => busy = false);
        focus.requestFocus();
      }
    }
  }

  void close() {
    core.stopWatching();
    if (mounted) Navigator.of(context).maybePop();
  }

  KeyEventResult onKey(FocusNode _, KeyEvent e) {
    if (e is! KeyDownEvent && e is! KeyRepeatEvent) return KeyEventResult.ignored;
    final ctrl = HardwareKeyboard.instance.isControlPressed;
    final k = e.logicalKey;
    final selected = !input.selection.isCollapsed;
    if (ctrl && k == LogicalKeyboardKey.keyC && !selected) {
      interrupt();
    } else if (ctrl && k == LogicalKeyboardKey.keyL) {
      clearScreen();
    } else if (ctrl && k == LogicalKeyboardKey.keyD && input.text.isEmpty && !busy) {
      close();
    } else if (k == LogicalKeyboardKey.escape) {
      core.watching ? core.stopWatching() : close();
    } else if (busy) {
      return KeyEventResult.ignored;
    } else if (k == LogicalKeyboardKey.arrowUp) {
      recall(-1);
    } else if (k == LogicalKeyboardKey.arrowDown) {
      recall(1);
    } else if (k == LogicalKeyboardKey.tab && !HardwareKeyboard.instance.isShiftPressed) {
      tab();
    } else {
      return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final c = dark ? TerminalScreen._dark : TerminalScreen._light;
    final mono = TextStyle(fontFamily: 'monospace', fontFamilyFallback: const ['Roboto Mono', 'Droid Sans Mono', 'Noto Sans Mono'], fontSize: 13.5, height: 1.45, color: c.fg);
    Widget key(String label, VoidCallback onTap, {String? tip}) => Tooltip(
          message: tip ?? label,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(6),
            child: Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8), child: Text(label, style: mono.copyWith(color: c.dim))),
          ),
        );
    return PopScope(
      onPopInvokedWithResult: (_, _) => core.stopWatching(),
      child: Scaffold(
        backgroundColor: c.bg,
        appBar: AppBar(
          backgroundColor: c.bar,
          foregroundColor: c.fg,
          title: Row(children: [const Icon(Icons.terminal, size: 20), const SizedBox(width: 8), Text('sgbus', style: mono.copyWith(fontSize: 16, fontWeight: FontWeight.w700))]),
          actions: [
            if (core.watching) TextButton(onPressed: () => setState(core.stopWatching), child: Text(tr('terminal.stop', 'Stop'))),
            TourTarget(
              id: 'terminal.close',
              child: IconButton(tooltip: tr('common.close', 'Close'), icon: const Icon(Icons.close), onPressed: close),
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: Column(children: [
            Expanded(
              child: TourTarget(
                id: 'terminal.screen',
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTap: () => busy ? null : focus.requestFocus(),
                  child: SelectionArea(
                    child: ListView.builder(
                      controller: scroll,
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                      itemCount: rows.length + 1,
                      itemBuilder: (_, i) {
                        if (i < rows.length) return Text.rich(TerminalScreen.row(rows[i], dark: dark), style: mono);
                        if (busy) return const SizedBox(height: 20);
                        return TourTarget(
                          id: 'terminal.prompt',
                          child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                            Text.rich(TerminalScreen.row('${SgbusCore.green('sgbus')}${SgbusCore.dim('>')}', dark: dark), style: mono),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Focus(
                                onKeyEvent: onKey,
                                child: TextField(
                                  controller: input,
                                  focusNode: focus,
                                  autofocus: true,
                                  style: mono,
                                  cursorColor: c.fg,
                                  autocorrect: false,
                                  enableSuggestions: false,
                                  keyboardType: TextInputType.visiblePassword,
                                  textInputAction: TextInputAction.send,
                                  decoration: InputDecoration.collapsed(hintText: '', hintStyle: mono),
                                  onSubmitted: (_) => submit(),
                                ),
                              ),
                            ),
                          ]),
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
            // The keys a phone's keyboard hasn't got.
            Container(
              color: c.bar,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              child: Row(children: [
                key('Tab', () => busy ? null : tab(), tip: tr('terminal.tab', 'Finish the word')),
                key('↑', () => busy ? null : recall(-1), tip: tr('terminal.up', 'The one before')),
                key('↓', () => busy ? null : recall(1), tip: tr('terminal.down', 'The one after')),
                key('^C', interrupt, tip: tr('terminal.ctrlC', 'Stop it, or clear the line')),
                const Spacer(),
                key('clear', clearScreen, tip: tr('terminal.clear', 'Clear the screen')),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
