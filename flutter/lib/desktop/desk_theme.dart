// STUB, so welcome.dart builds on its own: the shell agent writes the real DeskTheme (the desktop
// look, and "Use system accent colour", desktop-features-spec §1 and §13), which replaces this
// file when the branches are merged. Only what welcome.dart calls is here.
import 'package:flutter/foundation.dart';

/// The desktop's theme settings. Stub: see the note at the top of the file.
class DeskTheme {
  /// Whether the app uses the computer's accent colour instead of its brand colour.
  static final ValueNotifier<bool> systemAccent = ValueNotifier(false);

  /// Turns the computer's accent colour on or off.
  static Future<void> setSystemAccent(bool on) async {
    systemAccent.value = on;
  }
}
