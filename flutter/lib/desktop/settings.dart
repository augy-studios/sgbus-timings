// The desktop app's own settings: one small JSON file in the same folder the Electron app (2.0.0
// to 2.4.x) kept it, so its keys carry on as they were, read and merged on every write, so two
// parts of the app writing different keys never undo each other. A failed read is an empty map
// and a failed write is ignored. Nothing secret is ever kept here.
//
// Keys: bounds, maximized, trayHintShown, loginChosen, updateNotices (desktop.dart, updater.dart);
// setupDone, pendingLook (welcome.dart); widgets (widgets_window.dart); trayStop, favourites
// (glance.dart); linkHandoff (links.dart); imported (import_old.dart).
import 'dart:convert';
import 'dart:io';

class DeskSettings {
  DeskSettings._();

  /// The app's name as its folder has it, on every system.
  static const folderName = 'SG Bus Timings';

  /// The settings folder: %APPDATA%\SG Bus Timings, ~/Library/Application Support/SG Bus Timings,
  /// or ~/.config/SG Bus Timings, as Electron's userData was.
  static String get dir {
    final env = Platform.environment;
    if (Platform.isWindows) return '${env['APPDATA'] ?? '${env['USERPROFILE']}\\AppData\\Roaming'}\\$folderName';
    final home = env['HOME'] ?? '';
    if (Platform.isMacOS) return '$home/Library/Application Support/$folderName';
    return '${env['XDG_CONFIG_HOME'] ?? '$home/.config'}/$folderName';
  }

  /// For tests: another folder.
  static String? override;

  static File get _file => File('${override ?? dir}${Platform.pathSeparator}settings.json');

  static Map<String, dynamic> read() {
    try {
      final v = jsonDecode(_file.readAsStringSync());
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }

  static T? get<T>(String key) {
    final v = read()[key];
    return v is T ? v : null;
  }

  static void write(Map<String, dynamic> changes) {
    try {
      _file.parent.createSync(recursive: true);
      final now = {...read(), ...changes};
      final tmp = File('${_file.path}.tmp');
      tmp.writeAsStringSync(jsonEncode(now));
      tmp.renameSync(_file.path);
    } catch (_) {
      // Not kept: the window opens at its usual size next time.
    }
  }
}
