// Make it yours: the app's first window, once, for a new install and for anyone updating to the
// first version with it (the Electron app's 2.4.x had it too, so its setupDone carries on), and
// from the tray's menu after that. Language, starting when you sign in, following the computer's
// light or dark or a theme of your own, and the brand colour, shown here as they're picked.
//
// A window of its own (its own engine, through desktop_multi_window): the main window sends what's
// set now as its arguments, and Get started sends the picks back, which the main window applies
// with the app's own settings (i18n/i18n.dart, theme/theme.dart, GTA VI's rules from
// data/gta6.dart), so they stay one set. Closing the window any other way changes nothing. Its
// words are its own, in the app's four languages, as it follows its own Language as it's picked.
import 'dart:async';
import 'dart:convert';

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../data/gta6.dart';
import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'desktop.dart';
import 'settings.dart';

const welcomeWords = {
  'en': {
    'welcome': 'Welcome to SG Bus Timings', 'tag': 'Live bus arrivals, trips and alerts, your way.', 'timings': 'Bus timings', 'navigate': 'Navigate', 'alerts': 'Service alerts',
    'title': 'Make SG Bus Timings yours', 'sub': 'Choose how the app should look and feel.', 'language': 'Language', 'auto': 'Automatic',
    'start': 'Start when I sign in', 'follow': 'Follow system theme', 'theme': 'Theme', 'light': 'Light', 'dark': 'Dark', 'time': 'Time-based', 'colour': 'Brand colour',
    'yours': 'Your colours are on, so the brand colours wait until you turn them off.', 'foot': 'You can change these any time, from Make it yours in the tray’s menu.', 'go': 'Get started',
  },
  'ms': {
    'welcome': 'Selamat datang ke SG Bus Timings', 'tag': 'Ketibaan bas, perjalanan dan amaran secara langsung, mengikut cara anda.', 'timings': 'Waktu bas', 'navigate': 'Navigasi', 'alerts': 'Amaran perkhidmatan',
    'title': 'Jadikan SG Bus Timings milik anda', 'sub': 'Pilih rupa dan rasa aplikasi ini.', 'language': 'Bahasa', 'auto': 'Automatik',
    'start': 'Mula apabila saya log masuk', 'follow': 'Ikut tema sistem', 'theme': 'Tema', 'light': 'Cerah', 'dark': 'Gelap', 'time': 'Ikut masa', 'colour': 'Warna jenama',
    'yours': 'Warna anda sedang digunakan, jadi warna jenama menunggu sehingga anda mematikannya.', 'foot': 'Anda boleh menukar semua ini bila-bila masa, daripada menu dulang.', 'go': 'Mulakan',
  },
  'ta': {
    'welcome': 'SG Bus Timings-க்கு வரவேற்கிறோம்', 'tag': 'நேரடி பேருந்து வருகைகள், பயணங்கள் மற்றும் எச்சரிக்கைகள், உங்கள் விருப்பப்படி.', 'timings': 'பேருந்து நேரங்கள்', 'navigate': 'வழிகாட்டல்', 'alerts': 'சேவை எச்சரிக்கைகள்',
    'title': 'SG Bus Timings-ஐ உங்களுடையதாக்குங்கள்', 'sub': 'செயலி எப்படி இருக்க வேண்டும் என்பதைத் தேர்ந்தெடுங்கள்.', 'language': 'மொழி', 'auto': 'தானியங்கி',
    'start': 'நான் உள்நுழையும்போது தொடங்கு', 'follow': 'கணினியின் தீமைப் பின்பற்று', 'theme': 'தீம்', 'light': 'வெளிர்', 'dark': 'இருண்ட', 'time': 'நேரத்தைப் பொறுத்து', 'colour': 'முதன்மை வண்ணம்',
    'yours': 'உங்கள் வண்ணங்கள் இயக்கத்தில் உள்ளன, அவற்றை அணைக்கும் வரை முதன்மை வண்ணங்கள் காத்திருக்கும்.', 'foot': 'இவற்றை எப்போது வேண்டுமானாலும் தட்டு மெனுவிலிருந்து மாற்றலாம்.', 'go': 'தொடங்கு',
  },
  'zh-SG': {
    'welcome': '欢迎使用 SG Bus Timings', 'tag': '实时巴士到站、行程和通告，随你所愿。', 'timings': '巴士时刻', 'navigate': '导航', 'alerts': '服务通告',
    'title': '打造你的 SG Bus Timings', 'sub': '选择应用的外观和感觉。', 'language': '语言', 'auto': '自动',
    'start': '登录时启动', 'follow': '跟随系统主题', 'theme': '主题', 'light': '浅色', 'dark': '深色', 'time': '按时间', 'colour': '主题色',
    'yours': '“你的颜色”已开启，关闭后才会使用主题色。', 'foot': '你可以随时在托盘菜单中更改这些设置。', 'go': '开始使用',
  },
};

/// One brand colour on offer.
class WelcomeColour {
  const WelcomeColour(this.id, this.label, this.hex, {this.dot, this.locked = false});
  final String id;
  final String label;
  final int hex;
  final List<int>? dot;
  final bool locked;

  Map<String, Object?> toJson() => {'id': id, 'label': label, 'hex': hex, 'dot': dot, 'locked': locked};
  static WelcomeColour fromJson(Map m) => WelcomeColour('${m['id']}', '${m['label']}', (m['hex'] as num).toInt(),
      dot: (m['dot'] as List?)?.map((e) => (e as num).toInt()).toList(), locked: m['locked'] == true);
}

/// What the window opens with, and what Get started sends back.
class WelcomeState {
  WelcomeState({this.lang = 'auto', this.mode = 'light', this.color = 'classic', this.start = true, this.yours = false, this.colours = const [], this.systemLang = 'en'});
  String lang;
  String mode;
  String color;
  bool start;
  bool yours;
  List<WelcomeColour> colours;
  String systemLang;

  Map<String, Object?> toJson() => {'lang': lang, 'mode': mode, 'color': color, 'start': start, 'yours': yours, 'colours': [for (final c in colours) c.toJson()], 'systemLang': systemLang};
  static WelcomeState fromJson(Map m) => WelcomeState(
        lang: '${m['lang'] ?? 'auto'}',
        mode: '${m['mode'] ?? 'light'}',
        color: '${m['color'] ?? 'classic'}',
        start: m['start'] != false,
        yours: m['yours'] == true,
        colours: [for (final c in (m['colours'] as List? ?? const [])) WelcomeColour.fromJson(c as Map)],
        systemLang: '${m['systemLang'] ?? 'en'}',
      );
}

// ---------- in the main window ----------

class Welcome {
  Welcome._();

  static const langs = ['auto', 'en', 'zh-SG', 'ms', 'ta'];
  static const modes = ['light', 'dark', 'time', 'phone'];
  static WindowController? _window;
  static void Function()? _after;
  static StreamSubscription<void>? _watch;

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
      colours: [
        for (final s in AppLook.swatches)
          // GTA VI only until its offer ends, unless it's yours (data/gta6.dart).
          if (s.id != AppLook.gta6 || Gta6.canPick)
            WelcomeColour(s.id, s.label(), s.hex, dot: s.dot?.map((c) => c.toARGB32()).toList(), locked: s.id == AppLook.gta6 && !Gta6.canPick),
      ],
    );
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

  /// Get started: the picks, applied with the app's own settings.
  static Future<void> finish(Map<String, Object?> picked) async {
    final look = {
      'lang': langs.contains(picked['lang']) ? picked['lang'] : 'auto',
      'mode': modes.contains(picked['mode']) ? picked['mode'] : 'light',
      'color': RegExp(r'^[a-z0-9-]{1,30}$').hasMatch('${picked['color']}') ? picked['color'] : 'classic',
    };
    if (picked['start'] is bool && picked['start'] != await Desktop.startsAtLogin()) await Desktop.setStartAtLogin(picked['start'] as bool);
    DeskSettings.write({'pendingLook': look, 'loginChosen': true, 'setupDone': true});
    await applyPending();
  }

  /// What's picked and not yet applied: from Get started, or kept by the Electron app for a site
  /// that hadn't loaded.
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

/// The welcome window's engine: draws it, and tells the main window what's picked.
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

String _langNow(WelcomeState s) => s.lang == 'auto' ? s.systemLang : s.lang;

class WelcomeApp extends StatelessWidget {
  const WelcomeApp({super.key, required this.state, required this.onFinish, this.brightness});
  final WelcomeState state;
  final Future<void> Function(Map<String, Object?> picked) onFinish;

  /// For screenshots: the computer's light or dark.
  final Brightness? brightness;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: welcomeWords['en']!['welcome']!,
        theme: ThemeData(useMaterial3: true),
        home: WelcomeScreen(state: state, onFinish: onFinish, brightness: brightness),
      );
}

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, required this.state, required this.onFinish, this.brightness});
  final WelcomeState state;
  final Future<void> Function(Map<String, Object?> picked) onFinish;
  final Brightness? brightness;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  late final WelcomeState s = widget.state;
  bool _busy = false;

  Map<String, String> get w => welcomeWords[_langNow(s)] ?? welcomeWords['en']!;

  bool get _dark {
    final hour = DateTime.now().hour;
    return switch (s.mode) {
      'phone' => (widget.brightness ?? MediaQuery.platformBrightnessOf(context)) == Brightness.dark,
      'time' => hour < AppLook.lightFromHour || hour >= AppLook.lightUntilHour,
      'dark' => true,
      _ => false,
    };
  }

  WelcomeColour? get _colour => s.colours.where((c) => c.id == s.color).firstOrNull ?? s.colours.firstOrNull;

  void _set(VoidCallback f) {
    setState(f);
    final title = w['welcome']!;
    Desktop.window?.title = title;
  }

  @override
  Widget build(BuildContext context) {
    final dark = _dark;
    final ink = dark ? const Color(0xFFEEF2EF) : const Color(0xFF121815);
    final muted = dark ? const Color(0xFFA9B5AE) : const Color(0xFF5B665F);
    final bg = dark ? const Color(0xFF171C19) : const Color(0xFFF4F7F5);
    final row = dark ? const Color(0xFF202622) : Colors.white;
    final tile = dark ? const Color(0xFF2B322D) : const Color(0xFFEEF2F0);
    final edge = dark ? const Color(0x1AFFFFFF) : const Color(0x1A121815);
    final accent = s.yours ? const Color(0xFFCCFFCC) : Color(_colour?.hex ?? 0xFFCCFFCC);
    const onAccent = Color(0xFF121815);
    final reduce = MediaQuery.disableAnimationsOf(context);
    final dur = reduce ? Duration.zero : const Duration(milliseconds: 200);

    Widget icon(IconData i, {Color? color}) => Icon(i, size: 20, color: color ?? ink);

    Widget card(IconData i, Widget label, Widget control) => Container(
          constraints: const BoxConstraints(minHeight: 62),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: row, borderRadius: BorderRadius.circular(10), border: Border.all(color: edge)),
          child: Row(children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(color: tile, borderRadius: BorderRadius.circular(8)), child: icon(i)),
            const SizedBox(width: 14),
            Expanded(child: DefaultTextStyle.merge(style: TextStyle(fontWeight: FontWeight.w600, color: ink), child: label)),
            control,
          ]),
        );

    Widget dropdown<T>(T value, List<(T, String)> items, ValueChanged<T>? onChanged, String label) => Semantics(
          label: label,
          child: Container(
            width: 210,
            height: 38,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(color: tile, borderRadius: BorderRadius.circular(6), border: Border.all(color: edge)),
            child: Opacity(
              opacity: onChanged == null ? .55 : 1,
              child: DropdownButtonHideUnderline(
                child: DropdownButton<T>(
                  value: value,
                  isExpanded: true,
                  dropdownColor: row,
                  style: TextStyle(color: ink, fontSize: 15),
                  iconEnabledColor: ink,
                  items: [for (final (v, t) in items) DropdownMenuItem(value: v, child: Text(t, overflow: TextOverflow.ellipsis))],
                  onChanged: onChanged == null ? null : (v) => v == null ? null : onChanged(v),
                ),
              ),
            ),
          ),
        );

    Widget toggle(bool on, ValueChanged<bool> changed, String label) => Semantics(
          label: label,
          toggled: on,
          child: Switch(
            value: on,
            onChanged: changed,
            activeTrackColor: ink,
            activeThumbColor: row,
            inactiveThumbColor: muted,
            inactiveTrackColor: Colors.transparent,
            trackOutlineColor: WidgetStatePropertyAll(on ? ink : muted),
          ),
        );

    final swatches = s.yours
        ? const SizedBox.shrink()
        : Flexible(
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in s.colours)
                  Tooltip(
                    message: c.label,
                    child: Semantics(
                      label: c.label,
                      inMutuallyExclusiveGroup: true,
                      checked: c.id == s.color,
                      enabled: !c.locked,
                      button: true,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: c.locked ? null : () => _set(() => s.color = c.id),
                        child: Opacity(
                          opacity: c.locked ? .4 : 1,
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: c.dot == null ? Color(c.hex) : null,
                              gradient: c.dot == null ? null : LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [for (final d in c.dot!) Color(d)]),
                              border: Border.all(color: edge),
                              boxShadow: c.id == s.color ? [BoxShadow(color: bg, spreadRadius: 2), BoxShadow(color: ink, spreadRadius: 4)] : null,
                            ),
                            child: c.locked ? const Center(child: Icon(Icons.lock, size: 13, color: Color(0xFF121815))) : null,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );

    final main = Container(
      color: bg,
      padding: const EdgeInsets.fromLTRB(36, 30, 36, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(w['title']!, style: TextStyle(fontSize: 26, color: ink, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(w['sub']!, style: TextStyle(color: muted, fontSize: 15)),
        const SizedBox(height: 18),
        Expanded(
          child: SingleChildScrollView(
            child: Column(children: [
              card(Icons.language, Text(w['language']!), dropdown<String>(s.lang, [('auto', w['auto']!), for (final l in I18n.langs) (l.code, l.name)], (v) => _set(() => s.lang = v), w['language']!)),
              const SizedBox(height: 8),
              card(Icons.power_settings_new, Text(w['start']!), toggle(s.start, (v) => _set(() => s.start = v), w['start']!)),
              const SizedBox(height: 8),
              card(Icons.desktop_windows_outlined, Text(w['follow']!), toggle(s.mode == 'phone', (v) => _set(() => s.mode = v ? 'phone' : 'light'), w['follow']!)),
              const SizedBox(height: 8),
              card(
                Icons.wb_sunny_outlined,
                Text(w['theme']!),
                dropdown<String>(s.mode == 'phone' ? 'light' : s.mode, [('light', w['light']!), ('dark', w['dark']!), ('time', w['time']!)], s.mode == 'phone' ? null : (v) => _set(() => s.mode = v), w['theme']!),
              ),
              const SizedBox(height: 8),
              card(
                Icons.palette_outlined,
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(w['colour']!),
                  Text(s.yours ? w['yours']! : (_colour?.label ?? ''), style: TextStyle(fontWeight: FontWeight.w400, fontSize: 12.5, color: muted)),
                ]),
                swatches,
              ),
            ]),
          ),
        ),
        const SizedBox(height: 18),
        Row(children: [
          Expanded(child: Text(w['foot']!, style: TextStyle(fontSize: 13, color: muted))),
          const SizedBox(width: 16),
          AnimatedContainer(
            duration: dur,
            decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(8), border: Border.all(color: edge)),
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        await widget.onFinish({'lang': s.lang, 'mode': s.mode, 'color': s.color, 'start': s.start});
                      },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 11),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(w['go']!, style: const TextStyle(color: onAccent, fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(width: 8),
                    const Icon(Icons.arrow_forward, size: 20, color: onAccent),
                  ]),
                ),
              ),
            ),
          ),
        ]),
      ]),
    );

    final panel = AnimatedContainer(
      duration: dur,
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
            Text(w['welcome']!, style: const TextStyle(fontSize: 26, height: 1.2, color: onAccent, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Text(w['tag']!, style: const TextStyle(color: onAccent, fontSize: 15)),
            const SizedBox(height: 22),
            for (final (i, k) in [(Icons.schedule, 'timings'), (Icons.directions, 'navigate'), (Icons.warning_amber_rounded, 'alerts')])
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(children: [icon(i, color: onAccent), const SizedBox(width: 12), Flexible(child: Text(w[k]!, style: const TextStyle(color: onAccent, fontWeight: FontWeight.w600, fontSize: 15)))]),
              ),
          ]),
        ),
      ]),
    );

    return Scaffold(
      backgroundColor: bg,
      body: LayoutBuilder(
        builder: (context, box) => box.maxWidth < 760
            ? main
            : Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SizedBox(width: (box.maxWidth * .34).clamp(250, 420), child: panel),
                Expanded(child: main),
              ]),
      ),
    );
  }
}
