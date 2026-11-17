// The desktop app's colours. Unlike the Android app (where Material You's wallpaper colours are
// the default), the desktop app looks like the site: the UwU Apps theme in the person's brand
// colour, with the site's fonts and surfaces (desktop_main.dart turns Material You off once, the
// first time). Settings can turn on "Use system accent colour", which paints the brand colour
// with the computer's own accent colour (Windows' accent colour, macOS's, or the GTK theme's on
// Linux), keeping the site's neutral surfaces and fonts (theme/theme.dart's accentOverride).
//
// The choice is kept in the desktop settings file as `useSystemAccent` (desktop-features-spec
// §1 and §20), off by default. The accent colour is read again whenever the app comes back to
// the front, in case the person changed it.
import 'package:dynamic_color/dynamic_color.dart' show DynamicColorPlugin;
import 'package:flutter/widgets.dart';

import '../theme/theme.dart';
import 'settings.dart';

/// The desktop's colour choice and the computer's accent colour. Everything is static.
class DeskTheme {
  DeskTheme._();

  /// The settings file's key for the choice.
  static const key = 'useSystemAccent';

  /// Whether "Use system accent colour" is on. Settings' switch shows and changes it through
  /// [setSystemAccent].
  static final ValueNotifier<bool> systemAccent = ValueNotifier<bool>(false);

  /// The computer's accent colour as last read, or null if the system doesn't say.
  static final ValueNotifier<Color?> accent = ValueNotifier<Color?>(null);

  /// At start: reads the choice and the accent colour, and applies them, and makes the
  /// desktop's controls compact (smaller paddings, for a mouse rather than a finger).
  static Future<void> init() async {
    AppLook.I.compact = true;
    systemAccent.value = DeskSettings.get<bool>(key) == true;
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

  /// Hands the accent colour to the app's look while the choice is on, or takes it away.
  static void _apply() {
    AppLook.I.accentOverride = systemAccent.value ? accent.value : null;
  }
}
