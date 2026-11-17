// The desktop app's colours and looks. Unlike the Android app (where Material You's wallpaper
// colours are the default), the desktop app looks like the site: the UwU Apps theme in the
// person's brand colour, with the site's fonts and surfaces (desktop_main.dart turns Material You
// off once, the first time). Settings can turn on "Use system accent colour", which paints the
// brand colour with the computer's own accent colour (Windows' accent colour, macOS's, or the GTK
// theme's on Linux), keeping the site's neutral surfaces and fonts (theme/theme.dart's
// accentOverride).
//
// In Material You's place, Theme offers the computer's own look (theme/theme.dart's DeskStyle),
// as near as each gets to iOS's Liquid Glass: Fluent 2 (Acrylic and Mica) on Windows, macOS
// Tahoe on a Mac, and Deepin's and COSMIC's frosted glass on Linux. Its page is see-through, so
// the window shows its own effect behind it: Mica on Windows 11 (Acrylic on Windows 10, or before
// Windows 11 22H2), the window's vibrancy on a Mac. Linux has no such effect to ask for, so the
// app draws its own backdrop there ([DeskBackdrop]), soft colour for the frosted cards to blur;
// so does any computer that turns the effect down. The window's effect follows the app's light
// or dark, and goes in high contrast, whose look is solid.
//
// Both choices are kept in the desktop settings file: `useSystemAccent` and `platformLook`
// (desktop-features-spec §1 and §20), each off by default. The accent colour is read again
// whenever the app comes back to the front, in case the person changed it.
import 'dart:io';

import 'package:dynamic_color/dynamic_color.dart' show DynamicColorPlugin;
import 'package:material_ui/material_ui.dart';

import '../theme/theme.dart';
import 'settings.dart';

/// The desktop's colour choices, its own look, and the computer's accent colour. Everything is
/// static.
class DeskTheme {
  DeskTheme._();

  /// The settings file's key for "Use system accent colour".
  static const key = 'useSystemAccent';

  /// The settings file's key for the computer's own look.
  static const lookKey = 'platformLook';

  /// Whether "Use system accent colour" is on. Settings' switch shows and changes it through
  /// [setSystemAccent].
  static final ValueNotifier<bool> systemAccent = ValueNotifier<bool>(false);

  /// Whether the computer's own look is on. Theme's switch shows and changes it through
  /// [setLook].
  static final ValueNotifier<bool> look = ValueNotifier<bool>(false);

  /// The computer's accent colour as last read, or null if the system doesn't say.
  static final ValueNotifier<Color?> accent = ValueNotifier<Color?>(null);

  /// Whether the window's own effect (Mica, Acrylic, vibrancy) is behind the app now (chrome.dart
  /// sets it). While the look is on and it isn't, the app draws [DeskBackdrop] instead.
  static final ValueNotifier<bool> effect = ValueNotifier<bool>(false);

  /// This computer's own look: Fluent 2 on Windows, Tahoe on a Mac, frosted glass on Linux.
  static DeskStyle get style => Platform.isWindows
      ? DeskStyle.fluent
      : Platform.isMacOS
          ? DeskStyle.tahoe
          : DeskStyle.frosted;

  /// The look's name, as Theme's switch says it.
  static String styleName(DeskStyle s) => switch (s) {
        DeskStyle.fluent => 'Fluent 2 (Acrylic & Mica)',
        DeskStyle.tahoe => 'macOS Tahoe',
        DeskStyle.frosted => 'Deepin & COSMIC Frosted Glass',
      };

  /// At start: reads both choices and the accent colour, and applies them, and makes the
  /// desktop's controls compact (smaller paddings, for a mouse rather than a finger).
  static Future<void> init() async {
    AppLook.I.compact = true;
    AppLook.I.deskStyle = style;
    systemAccent.value = DeskSettings.get<bool>(key) == true;
    look.value = DeskSettings.get<bool>(lookKey) == true;
    await readAccent();
    _apply();
  }

  /// Turns "Use system accent colour" on or off, keeps the choice, and repaints the app.
  static Future<void> setSystemAccent(bool on) async {
    DeskSettings.write({key: on});
    systemAccent.value = on;
    if (on) await readAccent();
    _apply();
  }

  /// Turns the computer's own look on or off, keeps the choice, and repaints the app (whose
  /// frame then sets the window's effect: chrome.dart).
  static Future<void> setLook(bool on) async {
    DeskSettings.write({lookKey: on});
    look.value = on;
    if (on) await readAccent();
    _apply();
  }

  /// Reads the accent colour again (the app came back to the front), and repaints if it's
  /// changed while it's in use.
  static Future<void> refresh() async {
    final before = accent.value;
    await readAccent();
    if (accent.value != before) _apply();
  }

  /// Asks the system for its accent colour (dynamic_color's desktop plugins). Null when it
  /// can't say, such as a Linux desktop without a GTK theme.
  static Future<void> readAccent() async {
    try {
      accent.value = await DynamicColorPlugin.getAccentColor();
    } catch (_) {
      accent.value = null;
    }
  }

  /// Hands the choices and the accent colour to the app's look.
  static void _apply() {
    AppLook.I.deskAccent = accent.value;
    AppLook.I.accentOverride = systemAccent.value ? accent.value : null;
    AppLook.I.deskLook = look.value;
  }
}

/// The frosted look's backdrop where the window has no effect of its own (Linux, or a computer
/// that won't give one): the look's background with soft pools of the accent colour, for the
/// frosted cards to blur, as Deepin's and COSMIC's wallpapers show through theirs.
class DeskBackdrop extends StatelessWidget {
  const DeskBackdrop({super.key});

  /// The background, and two pools of colour: the accent's at the top left, a softer one of it
  /// at the bottom right.
  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final glow = sg.brand.withValues(alpha: dark ? .30 : .38);
    final soft = HSLColor.fromColor(sg.brand).withHue((HSLColor.fromColor(sg.brand).hue + 40) % 360).toColor().withValues(alpha: dark ? .20 : .26);
    return DecoratedBox(
      decoration: BoxDecoration(color: sg.bg),
      child: Stack(fit: StackFit.expand, children: [
        DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(center: const Alignment(-.9, -.9), radius: 1.1, colors: [glow, glow.withValues(alpha: 0)]))),
        DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(center: const Alignment(1, 1), radius: 1.2, colors: [soft, soft.withValues(alpha: 0)]))),
      ]),
    );
  }
}
