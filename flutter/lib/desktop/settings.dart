// The desktop app's own settings file (desktop-features-spec §20): one small JSON object,
// settings.json, in the same folder the Electron app (2.0.0 to 2.4.x) kept it, so its keys carry on
// as they were. Every write reads the file first and merges, so two parts of the app writing
// different keys never undo each other. A failed read is an empty map and a failed write is
// ignored. Nothing secret is ever kept here.
//
// Only the main window writes it: the other windows (widgets, Make it yours) run their own engines
// and ask the main window over the 'sgbus/main' channel instead (desktop_main.dart).
//
// Keys, and the files that write them: bounds, maximized, trayHintShown (desktop.dart);
// loginChosen (desktop.dart, tray.dart, welcome.dart); updateNotices (host.dart; updater.dart only
// reads it); setupDone, pendingLook (welcome.dart); useSystemAccent (welcome.dart, from Make it
// yours, and desk_theme.dart's setSystemAccent, from Settings' Theme; desk_theme.dart reads it at
// start); widgets (widgets_window.dart); trayStop (glance.dart, also through host.dart's
// SgBus.setTrayStop), favourites (glance.dart); linkHandoff (links.dart).
import 'dart:convert';
import 'dart:io';

/// Reads and writes settings.json, the desktop app's small file of its own settings.
class DeskSettings {
  DeskSettings._();

  /// The app's name as its folder has it, on every system.
  static const folderName = 'SG Bus Timings';

  /// The settings folder: %APPDATA%\SG Bus Timings, ~/Library/Application Support/SG Bus Timings,
  /// or ~/.config/SG Bus Timings, as Electron's userData was. The Electron app's localStorage is
  /// in this folder too (host.dart reads it once, to bring it across).
  static String get dir {
    final env = Platform.environment;
    if (Platform.isWindows) return '${env['APPDATA'] ?? '${env['USERPROFILE']}\\AppData\\Roaming'}\\$folderName';
    final home = env['HOME'] ?? '';
    if (Platform.isMacOS) return '$home/Library/Application Support/$folderName';
    return '${env['XDG_CONFIG_HOME'] ?? '$home/.config'}/$folderName';
  }

  /// For tests: another folder to keep settings.json in, instead of [dir].
  static String? override;

  /// The settings file itself.
  static File get _file => File('${override ?? dir}${Platform.pathSeparator}settings.json');

  /// Everything in the file, as a map: empty if there's no file yet or it can't be read.
  static Map<String, dynamic> read() {
    try {
      final v = jsonDecode(_file.readAsStringSync());
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }

  /// One key's value, or null if it isn't there or isn't a [T] (a bool, a Map, a List...).
  static T? get<T>(String key) {
    final v = read()[key];
    return v is T ? v : null;
  }

  /// Writes [changes] over what's in the file, keeping every other key as it was. A key set to
  /// null is kept as null (JSON's null), as the Electron app did.
  static void write(Map<String, dynamic> changes) {
    try {
      _file.parent.createSync(recursive: true);
      final now = {...read(), ...changes};
      // Written beside it first, then renamed over it, so a crash halfway through a write never
      // leaves half a file behind.
      final tmp = File('${_file.path}.tmp');
      tmp.writeAsStringSync(jsonEncode(now));
      tmp.renameSync(_file.path);
    } catch (_) {
      // Not kept: the window opens at its usual size next time.
    }
  }
}
