// Make it yours (desktop-features-spec §1): the app's first window, once, for a new install and for
// anyone updating to the first version with it (the Electron app's 2.4.x had it too, so its
// setupDone carries on), and from the tray's menu after that. Language, starting when you sign in,
// following the computer's light or dark or a theme of your own, and the brand colour (or the
// computer's own accent colour), shown here as they're picked.
//
// A window of its own (its own engine, through desktop_multi_window): the main window sends what's
// set now as its arguments, and Get started sends the picks back, which the main window applies
// with the app's own settings (i18n/i18n.dart, theme/theme.dart, GTA VI's rules from
// data/gta6.dart, desk_theme.dart for the accent colour), so they stay one set. Closing the window
// any other way changes nothing. Its words are its own, in the app's four languages, as it follows
// its own Language as it's picked.
//
// So this file has two halves: [Welcome], in the main window, and [runWelcome] and the screen it
// draws, in the welcome window.
import 'dart:async';
import 'dart:convert';

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:dynamic_color/dynamic_color.dart';
import 'package:material_ui/material_ui.dart';
import 'package:window_manager/window_manager.dart';

import '../data/gta6.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'desk_theme.dart';
import 'desktop.dart';
import 'settings.dart';

/// The welcome window's own words, in the app's four languages (the Electron app's setup.html
/// had the same), as the main window's translations may not have loaded yet.
const welcomeWords = {
  'en': {
    'welcome': 'Welcome to SG Bus Timings', 'tag': 'Live bus arrivals, trips and alerts, your way.', 'timings': 'Bus timings', 'navigate': 'Navigate', 'alerts': 'Service alerts',
    'title': 'Make SG Bus Timings yours', 'sub': 'Choose how the app should look and feel.', 'language': 'Language', 'auto': 'Automatic',
    'start': 'Start when I sign in', 'follow': 'Follow system theme', 'theme': 'Theme', 'light': 'Light', 'dark': 'Dark', 'time': 'Time-based', 'colour': 'Brand colour',
    'system': 'System accent', 'systemNote': 'Your computer’s own accent colour',
    'yours': 'Your colours are on, so the brand colours wait until you turn them off.', 'foot': 'You can change these any time, from Make it yours in the tray’s menu.', 'go': 'Get started',
  },
  'ms': {
    'welcome': 'Selamat datang ke SG Bus Timings', 'tag': 'Ketibaan bas, perjalanan dan amaran secara langsung, mengikut cara anda.', 'timings': 'Waktu bas', 'navigate': 'Navigasi', 'alerts': 'Amaran perkhidmatan',
    'title': 'Jadikan SG Bus Timings milik anda', 'sub': 'Pilih rupa dan rasa aplikasi ini.', 'language': 'Bahasa', 'auto': 'Automatik',
    'start': 'Mula apabila saya log masuk', 'follow': 'Ikut tema sistem', 'theme': 'Tema', 'light': 'Cerah', 'dark': 'Gelap', 'time': 'Ikut masa', 'colour': 'Warna jenama',
    'system': 'Warna aksen sistem', 'systemNote': 'Warna aksen komputer anda sendiri',
    'yours': 'Warna anda sedang digunakan, jadi warna jenama menunggu sehingga anda mematikannya.', 'foot': 'Anda boleh menukar semua ini bila-bila masa, daripada “Jadikan milik anda” dalam menu dulang.', 'go': 'Mulakan',
  },
  'ta': {
    'welcome': 'SG Bus Timings-க்கு வரவேற்கிறோம்', 'tag': 'நேரடி பேருந்து வருகைகள், பயணங்கள் மற்றும் எச்சரிக்கைகள், உங்கள் விருப்பப்படி.', 'timings': 'பேருந்து நேரங்கள்', 'navigate': 'வழிகாட்டல்', 'alerts': 'சேவை எச்சரிக்கைகள்',
    'title': 'SG Bus Timings-ஐ உங்களுடையதாக்குங்கள்', 'sub': 'செயலி எப்படி இருக்க வேண்டும் என்பதைத் தேர்ந்தெடுங்கள்.', 'language': 'மொழி', 'auto': 'தானியங்கி',
    'start': 'நான் உள்நுழையும்போது தொடங்கு', 'follow': 'கணினியின் தீமைப் பின்பற்று', 'theme': 'தீம்', 'light': 'வெளிர்', 'dark': 'இருண்ட', 'time': 'நேரத்தைப் பொறுத்து', 'colour': 'முதன்மை வண்ணம்',
    'system': 'கணினியின் வண்ணம்', 'systemNote': 'உங்கள் கணினியின் சொந்த வண்ணம்',
    'yours': 'உங்கள் வண்ணங்கள் இயக்கத்தில் உள்ளன, அவற்றை அணைக்கும் வரை முதன்மை வண்ணங்கள் காத்திருக்கும்.', 'foot': 'இவற்றை எப்போது வேண்டுமானாலும் தட்டு மெனுவில் உள்ள உங்களுடையதாக்கு என்பதிலிருந்து மாற்றலாம்.', 'go': 'தொடங்கு',
  },
  'zh-SG': {
    'welcome': '欢迎使用 SG Bus Timings', 'tag': '实时巴士到站、行程和通告，随你所愿。', 'timings': '巴士时刻', 'navigate': '导航', 'alerts': '服务通告',
    'title': '打造你的 SG Bus Timings', 'sub': '选择应用的外观和感觉。', 'language': '语言', 'auto': '自动',
    'start': '登录时启动', 'follow': '跟随系统主题', 'theme': '主题', 'light': '浅色', 'dark': '深色', 'time': '按时间', 'colour': '主题色',
    'system': '系统强调色', 'systemNote': '使用电脑自己的强调色',
    'yours': '“你的颜色”已开启，关闭后才会使用主题色。', 'foot': '你可以随时在托盘菜单的“个性化设置”中更改这些设置。', 'go': '开始使用',
  },
};

/// One brand colour on offer: its id, name, colour, a gradient for its dot where it has one
/// (GTA VI), and whether it's locked (shown greyed with a lock, and can't be picked).
class WelcomeColour {
  const WelcomeColour(this.id, this.label, this.hex, {this.dot, this.locked = false});
  final String id;
  final String label;
  final int hex;
  final List<int>? dot;
  final bool locked;

  /// As sent to the welcome window.
  Map<String, Object?> toJson() => {'id': id, 'label': label, 'hex': hex, 'dot': dot, 'locked': locked};

  /// As the welcome window receives it.
  static WelcomeColour fromJson(Map m) => WelcomeColour('${m['id']}', '${m['label']}', (m['hex'] as num).toInt(),
      dot: (m['dot'] as List?)?.map((e) => (e as num).toInt()).toList(), locked: m['locked'] == true);
}

/// What the window opens with, and what it changes as things are picked. [mode] is one of
/// light, dark, time (dark from 18:00 to 09:00) or phone (follow the computer); [yours] is
/// whether the person's own custom colours are on; [systemAccent] whether the computer's accent
/// colour is used instead of a brand colour, and [systemColour] that colour (ARGB), or null if
/// the computer can't say.
class WelcomeState {
  WelcomeState({
    this.lang = 'auto',
    this.mode = 'light',
    this.color = 'classic',
    this.start = true,
    this.yours = false,
    this.colours = const [],
    this.systemLang = 'en',
    this.systemAccent = false,
    this.systemColour,
  });
  String lang;
  String mode;
  String color;
  bool start;
  bool yours;
  List<WelcomeColour> colours;
  String systemLang;
  bool systemAccent;
  int? systemColour;

  /// As sent to the welcome window.
  Map<String, Object?> toJson() => {
        'lang': lang,
        'mode': mode,
        'color': color,
        'start': start,
        'yours': yours,
        'colours': [for (final c in colours) c.toJson()],
        'systemLang': systemLang,
        'systemAccent': systemAccent,
        'systemColour': systemColour,
      };

  /// As the welcome window receives it, with the defaults for anything missing.
  static WelcomeState fromJson(Map m) => WelcomeState(
        lang: '${m['lang'] ?? 'auto'}',
        mode: '${m['mode'] ?? 'light'}',
        color: '${m['color'] ?? 'classic'}',
        start: m['start'] != false,
        yours: m['yours'] == true,
        colours: [for (final c in (m['colours'] as List? ?? const [])) WelcomeColour.fromJson(c as Map)],
        systemLang: '${m['systemLang'] ?? 'en'}',
        systemAccent: m['systemAccent'] == true,
        systemColour: m['systemColour'] is num ? (m['systemColour'] as num).toInt() : null,
      );
}

// ---------- in the main window ----------

/// The main window's side: opening the welcome window and applying what's picked in it.
class Welcome {
  Welcome._();

  /// The languages and theme modes it may set, as the Electron app checked them.
  static const langs = ['auto', 'en', 'zh-SG', 'ms', 'ta'];
  static const modes = ['light', 'dark', 'time', 'phone'];
  static WindowController? _window;
  static void Function()? _after;
  static StreamSubscription<void>? _watch;

  /// Whether it should open by itself: not yet seen, here or in the Electron app.
  static bool get due => DeskSettings.get<bool>('setupDone') != true;

  /// What's set now, for the window to open with.
  static Future<WelcomeState> current() async {
    final look = AppLook.I;
    return WelcomeState(
      lang: I18n.I.chosen ?? 'auto',
      mode: look.modePreference,
      color: look.swatchId,
      start: await Desktop.startsAtLogin(),
      yours: look.yourColours != null,
      systemLang: I18n.match(WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag()) ?? 'en',
      systemAccent: DeskSettings.get<bool>('useSystemAccent') == true,
      systemColour: await _systemColour(),
      colours: [
        for (final s in AppLook.swatches)
          // An event's only until its offer ends, unless it's yours (data/gta6.dart).
          if (EventColours.byTheme(s.id)?.canPick ?? true)
            WelcomeColour(s.id, s.label(), s.hex, dot: s.dot?.map((c) => c.toARGB32()).toList()),
      ],
    );
  }

  /// The computer's accent colour (ARGB), or null where it can't be read.
  static Future<int?> _systemColour() async {
    try {
      return (await DynamicColorPlugin.getAccentColor())?.toARGB32();
    } catch (_) {
      return null;
    }
  }

  /// Opens the window, or brings it forward. [then] runs once it's gone, however it went.
  static Future<void> open([void Function()? then]) async {
    if (_window != null) {
      try {
        await _window!.show();
      } catch (_) {}
      return;
    }
    _after = then;
    final state = await current();
    _window = await WindowController.create(WindowConfiguration(hiddenAtLaunch: true, arguments: jsonEncode({'kind': 'welcome', 'state': state.toJson()})));
    final id = _window!.windowId;
    // Told when any window opens or closes: this one's gone when it's no longer in the list.
    _watch = onWindowsChanged.listen((_) async {
      final all = await WindowController.getAll();
      if (!all.any((w) => w.windowId == id)) closed();
    });
  }

  /// The window's gone: seen, and whatever was waiting runs.
  static void closed() {
    if (_window == null) return;
    _window = null;
    _watch?.cancel();
    _watch = null;
    DeskSettings.write({'setupDone': true});
    final go = _after;
    _after = null;
    go?.call();
  }

  /// Get started: the picks, checked, then applied with the app's own settings. Starting at
  /// sign-in is set and marked as chosen; the language, theme and colour go through pendingLook,
  /// as the Electron app did; the accent colour straight to DeskTheme.
  static Future<void> finish(Map<String, Object?> picked) async {
    final look = {
      'lang': langs.contains(picked['lang']) ? picked['lang'] : 'auto',
      'mode': modes.contains(picked['mode']) ? picked['mode'] : 'light',
      'color': RegExp(r'^[a-z0-9-]{1,30}$').hasMatch('${picked['color']}') ? picked['color'] : 'classic',
    };
    if (picked['start'] is bool && picked['start'] != await Desktop.startsAtLogin()) await Desktop.setStartAtLogin(picked['start'] as bool);
    final accent = picked['systemAccent'];
    DeskSettings.write({'pendingLook': look, 'loginChosen': true, 'setupDone': true, if (accent is bool) 'useSystemAccent': accent});
    if (accent is bool) await DeskTheme.setSystemAccent(accent);
    await applyPending();
  }

  /// What's picked and not yet applied: from Get started, or kept by the Electron app for a site
  /// that hadn't loaded. Applied once, then forgotten.
  static Future<void> applyPending() async {
    final look = DeskSettings.get<Map<String, dynamic>>('pendingLook');
    if (look == null) return;
    DeskSettings.write({'pendingLook': null});
    final app = AppLook.I;
    if (modes.contains(look['mode'])) app.modePreference = look['mode'] as String;
    // A brand colour would paint over Your colours, which stand in front of it.
    if (app.yourColours == null && look['color'] is String) app.swatchId = look['color'] as String;
    final lang = look['lang'];
    if (lang == 'auto') {
      await I18n.I.unset();
    } else if (lang is String && langs.contains(lang)) {
      await I18n.I.use(lang);
    }
  }
}

// ---------- in its own window ----------

/// The welcome window's engine starts here: draws the window, sets its size and title, and sends
/// the picks to the main window on Get started.
Future<void> runWelcome(Map<String, Object?> args) async {
  final state = WelcomeState.fromJson((args['state'] as Map?) ?? const {});
  runApp(WelcomeApp(state: state, onFinish: (picked) async {
    try {
      await const WindowMethodChannel('sgbus/main', mode: ChannelMode.unidirectional).invokeMethod('welcome-finish', picked);
    } catch (_) {}
    Desktop.window?.close();
  }));
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    final w = await Desktop.findWindow();
    if (w == null) return;
    w.title = (welcomeWords[_langNow(state)] ?? welcomeWords['en']!)['welcome']!;
    w.minimumSize = const Size(620, 560).toNative();
    w.setSize(const Size(940, 660).toNative(), false);
    w.center();
    w.show();
    w.focus();
  });
}

/// The language the window's words are in: the one picked, or the computer's for Automatic.
String _langNow(WelcomeState s) => s.lang == 'auto' ? s.systemLang : s.lang;

/// The welcome window's app: just the screen.
class WelcomeApp extends StatelessWidget {
  const WelcomeApp({super.key, required this.state, required this.onFinish, this.brightness});
  final WelcomeState state;
  final Future<void> Function(Map<String, Object?> picked) onFinish;

  /// For screenshots: the computer's light or dark.
  final Brightness? brightness;

  /// A plain app around the welcome screen; the screen draws its own colours.
  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: welcomeWords['en']!['welcome']!,
        theme: ThemeData(useMaterial3: true),
        home: WelcomeScreen(state: state, onFinish: onFinish, brightness: brightness),
      );
}

/// The welcome screen: the welcome panel on the left (hidden below 760 px wide) and the choices
/// on the right, repainted as each is picked.
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, required this.state, required this.onFinish, this.brightness});
  final WelcomeState state;
  final Future<void> Function(Map<String, Object?> picked) onFinish;
  final Brightness? brightness;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

/// The window's own colours, light or dark (not the brand colour), as setup.html had them.
class _Look {
  /// The dark set, or the light one.
  _Look(bool dark)
      : ink = dark ? const Color(0xFFEEF2EF) : const Color(0xFF121815),
        muted = dark ? const Color(0xFFA9B5AE) : const Color(0xFF5B665F),
        bg = dark ? const Color(0xFF171C19) : const Color(0xFFF4F7F5),
        row = dark ? const Color(0xFF202622) : Colors.white,
        tile = dark ? const Color(0xFF2B322D) : const Color(0xFFEEF2F0),
        edge = dark ? const Color(0x1AFFFFFF) : const Color(0x1A121815);
  final Color ink, muted, bg, row, tile, edge;
}

/// The welcome window's picks as they're made, and whether Get started has been pressed (it
/// sends the picks once).
class _WelcomeScreenState extends State<WelcomeScreen> {
  late final WelcomeState s = widget.state;
  bool _busy = false;

  /// The Theme drop-down's choice, kept while Follow system theme is on, so turning that off
  /// goes back to it (as setup.html did).
  late String _themePick = s.mode == 'phone' ? 'light' : s.mode;

  /// The words in the language picked now.
  Map<String, String> get w => welcomeWords[_langNow(s)] ?? welcomeWords['en']!;

  /// Whether the window's dark now, by the theme picked.
  bool get _dark {
    final hour = DateTime.now().hour;
    return switch (s.mode) {
      'phone' => (widget.brightness ?? MediaQuery.platformBrightnessOf(context)) == Brightness.dark,
      'time' => hour < AppLook.lightFromHour || hour >= AppLook.lightUntilHour,
      'dark' => true,
      _ => false,
    };
  }

  /// The brand colour picked, or the first if that one's no longer offered.
  WelcomeColour? get _colour => s.colours.where((c) => c.id == s.color).firstOrNull ?? s.colours.firstOrNull;

  /// Whether to offer the System accent swatch: when the computer's colour can be read, or when
  /// it's on already (so it can be turned off).
  bool get _offerSystem => s.systemColour != null || s.systemAccent;

  /// The colour the panel and button preview: Classic while Your colours are on (they're the
  /// app's, not this window's), else the computer's accent or the brand colour picked.
  Color get _accent {
    if (s.yours) return const Color(0xFFCCFFCC);
    if (s.systemAccent && s.systemColour != null) return Color(s.systemColour!);
    return Color(_colour?.hex ?? 0xFFCCFFCC);
  }

  /// Writing on [_accent]: dark on the brand colours, as the site has it; on the computer's accent
  /// (often a dark blue), whichever reads.
  Color get _onAccent {
    const dark = Color(0xFF121815);
    if (s.yours || !s.systemAccent) return dark;
    return ThemeData.estimateBrightnessForColor(_accent) == Brightness.dark ? Colors.white : dark;
  }

  /// A change, drawn, with the window's title in the language now picked.
  void _set(VoidCallback f) {
    setState(f);
    Desktop.window?.title = w['welcome']!;
  }

  /// The welcome panel beside the choices, or the choices alone in a window under 760 px wide.
  @override
  Widget build(BuildContext context) {
    final look = _Look(_dark);
    return Scaffold(
      backgroundColor: look.bg,
      body: LayoutBuilder(
        builder: (context, box) => box.maxWidth < 760
            ? _choices(look)
            : Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SizedBox(width: (box.maxWidth * .34).clamp(250, 420), child: _panel()),
                Expanded(child: _choices(look)),
              ]),
      ),
    );
  }

  /// How long a repaint fades over: none when the computer asks for reduced motion.
  Duration get _fade => MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 200);

  /// One row of the choices: a rounded card with an icon tile, a label and its control.
  Widget _card(_Look look, IconData icon, Widget label, Widget control) => Container(
        constraints: const BoxConstraints(minHeight: 62),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: look.row, borderRadius: BorderRadius.circular(10), border: Border.all(color: look.edge)),
        child: Row(children: [
          Container(width: 40, height: 40, decoration: BoxDecoration(color: look.tile, borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 20, color: look.ink)),
          const SizedBox(width: 14),
          Expanded(child: DefaultTextStyle.merge(style: TextStyle(fontWeight: FontWeight.w600, color: look.ink), child: label)),
          control,
        ]),
      );

  /// A drop-down, greyed out when [onChanged] is null.
  Widget _dropdown<T>(_Look look, T value, List<(T, String)> items, ValueChanged<T>? onChanged, String label) => Semantics(
        label: label,
        child: Container(
          width: 210,
          height: 38,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(color: look.tile, borderRadius: BorderRadius.circular(6), border: Border.all(color: look.edge)),
          child: Opacity(
            opacity: onChanged == null ? .55 : 1,
            child: DropdownButtonHideUnderline(
              child: DropdownButton<T>(
                value: value,
                isExpanded: true,
                dropdownColor: look.row,
                style: TextStyle(color: look.ink, fontSize: 15),
                iconEnabledColor: look.ink,
                items: [for (final (v, t) in items) DropdownMenuItem(value: v, child: Text(t, overflow: TextOverflow.ellipsis))],
                onChanged: onChanged == null ? null : (v) => v == null ? null : onChanged(v),
              ),
            ),
          ),
        ),
      );

  /// A switch, in the window's own colours.
  Widget _toggle(_Look look, bool on, ValueChanged<bool> changed, String label) => Semantics(
        label: label,
        toggled: on,
        child: Switch(
          value: on,
          onChanged: changed,
          activeTrackColor: look.ink,
          activeThumbColor: look.row,
          inactiveThumbColor: look.muted,
          inactiveTrackColor: Colors.transparent,
          trackOutlineColor: WidgetStatePropertyAll(on ? look.ink : look.muted),
        ),
      );

  /// One round swatch, ringed when it's the one picked. Swatches act as a radio group for screen
  /// readers, and show a ring when focused with Tab.
  Widget _swatch(_Look look, {required String label, required bool picked, required bool locked, required VoidCallback onTap, Color? colour, List<Color>? dot, IconData? icon}) {
    return Tooltip(
      message: label,
      child: Semantics(
        label: label,
        inMutuallyExclusiveGroup: true,
        checked: picked,
        enabled: !locked,
        button: true,
        child: InkWell(
          customBorder: const CircleBorder(),
          focusColor: look.ink.withValues(alpha: .25),
          onTap: locked ? null : onTap,
          child: Opacity(
            opacity: locked ? .4 : 1,
            child: Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dot == null ? colour : null,
                gradient: dot == null ? null : LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: dot),
                border: Border.all(color: look.edge),
                boxShadow: picked ? [BoxShadow(color: look.bg, spreadRadius: 2), BoxShadow(color: look.ink, spreadRadius: 4)] : null,
              ),
              child: locked
                  ? const Center(child: Icon(Icons.lock, size: 13, color: Color(0xFF121815)))
                  : icon == null
                      ? null
                      : Center(child: Icon(icon, size: 14, color: ThemeData.estimateBrightnessForColor(colour ?? look.tile) == Brightness.dark ? Colors.white : const Color(0xFF121815))),
            ),
          ),
        ),
      ),
    );
  }

  /// The brand colours' swatches, then System accent when it's offered; nothing while Your
  /// colours are on.
  Widget _swatches(_Look look) {
    if (s.yours) return const SizedBox.shrink();
    return Flexible(
      child: Wrap(
        alignment: WrapAlignment.end,
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final c in s.colours)
            _swatch(
              look,
              label: c.label,
              picked: !s.systemAccent && c.id == s.color,
              locked: c.locked,
              colour: Color(c.hex),
              dot: c.dot?.map(Color.new).toList(),
              onTap: () => _set(() {
                s.color = c.id;
                s.systemAccent = false;
              }),
            ),
          if (_offerSystem)
            _swatch(
              look,
              label: w['system']!,
              picked: s.systemAccent,
              locked: false,
              colour: s.systemColour == null ? look.tile : Color(s.systemColour!),
              icon: Icons.computer,
              onTap: () => _set(() => s.systemAccent = true),
            ),
        ],
      ),
    );
  }

  /// The words under Brand colour: the colour picked, or why the swatches are hidden.
  String get _colourNote {
    if (s.yours) return w['yours']!;
    if (s.systemAccent) return w['systemNote']!;
    return _colour?.label ?? '';
  }

  /// The right-hand side: the heading, a card per choice, and the footer with Get started.
  Widget _choices(_Look look) {
    final following = s.mode == 'phone';
    return Container(
      color: look.bg,
      padding: const EdgeInsets.fromLTRB(36, 30, 36, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(w['title']!, style: TextStyle(fontSize: 26, color: look.ink, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(w['sub']!, style: TextStyle(color: look.muted, fontSize: 15)),
        const SizedBox(height: 18),
        Expanded(
          child: SingleChildScrollView(
            child: Column(children: [
              _card(look, Icons.language, Text(w['language']!),
                  _dropdown<String>(look, s.lang, [('auto', w['auto']!), for (final l in I18n.langs) (l.code, l.name)], (v) => _set(() => s.lang = v), w['language']!)),
              const SizedBox(height: 8),
              _card(look, Icons.power_settings_new, Text(w['start']!), _toggle(look, s.start, (v) => _set(() => s.start = v), w['start']!)),
              const SizedBox(height: 8),
              _card(look, Icons.desktop_windows_outlined, Text(w['follow']!), _toggle(look, following, (v) => _set(() => s.mode = v ? 'phone' : _themePick), w['follow']!)),
              const SizedBox(height: 8),
              _card(
                look,
                Icons.wb_sunny_outlined,
                Text(w['theme']!),
                _dropdown<String>(look, _themePick, [('light', w['light']!), ('dark', w['dark']!), ('time', w['time']!)], following ? null : (v) => _set(() => s.mode = _themePick = v), w['theme']!),
              ),
              const SizedBox(height: 8),
              _card(
                look,
                Icons.palette_outlined,
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(w['colour']!),
                  Text(_colourNote, style: TextStyle(fontWeight: FontWeight.w400, fontSize: 12.5, color: look.muted)),
                ]),
                _swatches(look),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 18),
        Row(children: [
          Expanded(child: Text(w['foot']!, style: TextStyle(fontSize: 13, color: look.muted))),
          const SizedBox(width: 16),
          _getStarted(look),
        ]),
      ]),
    );
  }

  /// Get started, in the colour picked: sends the picks, once.
  Widget _getStarted(_Look look) {
    final on = _onAccent;
    return AnimatedContainer(
      duration: _fade,
      decoration: BoxDecoration(color: _accent, borderRadius: BorderRadius.circular(8), border: Border.all(color: look.edge)),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: _busy
              ? null
              : () async {
                  setState(() => _busy = true);
                  await widget.onFinish({'lang': s.lang, 'mode': s.mode, 'color': s.color, 'start': s.start, 'systemAccent': s.systemAccent});
                },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(w['go']!, style: TextStyle(color: on, fontWeight: FontWeight.w600, fontSize: 15)),
              const SizedBox(width: 8),
              Icon(Icons.arrow_forward, size: 20, color: on),
            ]),
          ),
        ),
      ),
    );
  }

  /// The left-hand welcome panel: the icon, "Welcome to SG Bus Timings", a tagline and three
  /// headline features, on the colour picked with two soft circles in its corners.
  Widget _panel() {
    final accent = _accent;
    final on = _onAccent;
    return AnimatedContainer(
      duration: _fade,
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: const Alignment(-.3, -1), end: const Alignment(.3, 1), colors: [accent, Color.lerp(accent, Colors.black, .08)!]),
      ),
      child: Stack(clipBehavior: Clip.hardEdge, children: [
        Positioned(top: -110, right: -90, child: Container(width: 260, height: 260, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x38FFFFFF)))),
        Positioned(bottom: -60, left: -60, child: Container(width: 170, height: 170, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x38FFFFFF)))),
        Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
            ClipRRect(borderRadius: BorderRadius.circular(20), child: Image.asset('assets/desktop/icon.png', width: 72, height: 72, excludeFromSemantics: true)),
            const SizedBox(height: 18),
            Text(w['welcome']!, style: TextStyle(fontSize: 26, height: 1.2, color: on, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Text(w['tag']!, style: TextStyle(color: on, fontSize: 15)),
            const SizedBox(height: 22),
            for (final (i, k) in [(Icons.schedule, 'timings'), (Icons.directions, 'navigate'), (Icons.warning_amber_rounded, 'alerts')])
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(children: [
                  Icon(i, size: 20, color: on),
                  const SizedBox(width: 12),
                  Flexible(child: Text(w[k]!, style: TextStyle(color: on, fontWeight: FontWeight.w600, fontSize: 15))),
                ]),
              ),
          ]),
        ),
      ]),
    );
  }
}
