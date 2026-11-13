// uwu:// links on the desktop, shared by every UwU App (the Electron apps' links.js, as is).
//
// On Android each app claims uwu:// for its own host, and the phone sends each link to the right
// app. Windows, macOS and Linux can't do that: a URL scheme belongs to exactly one app. So each UwU
// desktop app, as it starts:
//
//   1. notes which app holds uwu:// now, if it isn't itself
//   2. claims uwu:// for itself
//   3. passes any link for another app's host on to the app it noted
//
// With two apps installed, whichever started last holds the scheme and hands the other its links,
// so every link opens the app it's for, as on a phone. Only uwu:// links ever come through here,
// and they're handed over as one argument, never through a shell. The note is settings.json's
// linkHandoff, which the Electron app kept the same way.
import 'dart:convert';
import 'dart:io';

import 'desktop.dart';
import 'settings.dart';

class DeskLinks {
  DeskLinks._();

  static const _key = 'linkHandoff';

  // What every copy of this app's handler has in it: the install folder and .app are "SG Bus
  // Timings", the .deb's menu entry is sgbus-timings.desktop, a build from source sgbus_timings.exe.
  // Either alone would miss the other, take this app for another, and hand its links back to itself.
  static const ownName = 'timings';

  static Future<String> _run(String file, List<String> args) async {
    try {
      final r = await Process.run(file, args).timeout(const Duration(seconds: 5));
      return r.exitCode == 0 ? '${r.stdout}' : '';
    } catch (_) {
      return '';
    }
  }

  /// Which app holds uwu:// now: {command} on Windows, {app} on macOS, {desktop} on Linux.
  static Future<Map<String, String>?> currentHandler() async {
    if (Platform.isWindows) {
      for (final root in [r'HKCU\Software\Classes', r'HKLM\Software\Classes']) {
        final out = await _run('reg', ['query', '$root\\${Desktop.scheme}\\shell\\open\\command', '/ve']);
        final m = RegExp(r'REG_(?:EXPAND_)?SZ\s+(.+?)\s*$', multiLine: true).firstMatch(out);
        if (m != null) return {'command': m[1]!};
      }
      return null;
    }
    if (Platform.isMacOS) {
      final out = (await _run('/usr/bin/osascript', [
        '-l',
        'JavaScript',
        '-e',
        "ObjC.import('AppKit'); var u = \$.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(\$.NSURL.URLWithString('${Desktop.scheme}://x')); u.isNil() ? '' : u.path.js",
      ])).trim();
      return out.isEmpty ? null : {'app': out};
    }
    final desktop = (await _run('xdg-mime', ['query', 'default', 'x-scheme-handler/${Desktop.scheme}'])).trim();
    return desktop.isEmpty ? null : {'desktop': desktop};
  }

  /// Whether a handler is this app: any copy of it, installed or from source.
  static bool isThisApp(Map handler) {
    final text = jsonEncode(handler).toLowerCase();
    return text.contains(ownName) || text.contains(Platform.resolvedExecutable.toLowerCase().replaceAll(r'\', r'\\'));
  }

  /// Notes the app holding uwu://, then takes it. Run at every start: another UwU app may have
  /// taken it since (the installers register it too; this keeps it so after an update or a move).
  static Future<void> init() async {
    final before = await currentHandler();
    if (before != null && !isThisApp(before)) DeskSettings.write({_key: before});
    final exe = Platform.resolvedExecutable;
    if (Platform.isWindows) {
      const root = r'HKCU\Software\Classes\uwu';
      await _run('reg', ['add', root, '/ve', '/d', 'URL:${Desktop.name} link', '/f']);
      await _run('reg', ['add', root, '/v', 'URL Protocol', '/d', '', '/f']);
      await _run('reg', ['add', '$root\\DefaultIcon', '/ve', '/d', '"$exe",0', '/f']);
      await _run('reg', ['add', '$root\\shell\\open\\command', '/ve', '/d', '"$exe" "%1"', '/f']);
    } else if (Platform.isMacOS) {
      await _run('/usr/bin/osascript', [
        '-l',
        'JavaScript',
        '-e',
        "ObjC.import('CoreServices'); \$.LSSetDefaultHandlerForURLScheme(\$('${Desktop.scheme}'), \$('${Desktop.appId}'))",
      ]);
    } else {
      // The .deb's and .rpm's menu entry declares the scheme; an AppImage once it's in the menu.
      await _run('xdg-mime', ['default', 'sgbus-timings.desktop', 'x-scheme-handler/${Desktop.scheme}']);
    }
  }

  /// Splits a command line on spaces, keeping "quoted parts" whole. [escapes]: a .desktop file's
  /// \" \` \$ \\ inside quotes. Never for Windows paths, whose backslashes are separators.
  static List<String> split(String command, {bool escapes = false}) {
    final pattern = escapes ? RegExp(r'"((?:[^"\\]|\\.)*)"|(\S+)') : RegExp(r'"([^"]*)"|(\S+)');
    return [
      for (final m in pattern.allMatches(command))
        if (m[1] == null) m[2]! else escapes ? m[1]!.replaceAllMapped(RegExp(r'\\(["`$\\])'), (x) => x[1]!) : m[1]!,
    ];
  }

  static Future<void> _start(String file, List<String> args) async {
    try {
      await Process.start(file, args, mode: ProcessStartMode.detached);
    } catch (_) {
      // An app that has since been uninstalled: nothing to do.
    }
  }

  /// The Exec line of a .desktop file, from the usual places.
  static String? desktopExec(String name) {
    if (!RegExp(r'^[\w.-]+\.desktop$').hasMatch(name)) return null;
    final env = Platform.environment;
    final dataHome = env['XDG_DATA_HOME'] ?? '${env['HOME']}/.local/share';
    final dirs = (env['XDG_DATA_DIRS'] ?? '/usr/local/share:/usr/share').split(':');
    for (final dir in [dataHome, ...dirs]) {
      try {
        final text = File('$dir/applications/$name').readAsStringSync();
        final entry = text.split(RegExp(r'^\[', multiLine: true)).where((s) => s.startsWith('Desktop Entry]')).firstOrNull;
        final exec = RegExp(r'^Exec=(.+)$', multiLine: true).firstMatch(entry ?? '');
        if (exec != null) return exec[1]!.trim();
      } catch (_) {
        // Not in this one.
      }
    }
    return null;
  }

  /// Hands a link for another app's host to the app that held uwu:// before this one. False if
  /// there's nobody to hand it to.
  static bool passOn(String link) {
    final to = DeskSettings.get<Map<String, dynamic>>(_key);
    if (to == null || isThisApp(to)) return false;
    if (Platform.isWindows && to['command'] is String) {
      // "C:\...\App.exe" "%1", as Electron and most installers write it.
      var used = false;
      final parts = <String>[];
      for (final part in split(to['command'] as String)) {
        if (RegExp(r'%[1lL]').hasMatch(part)) {
          used = true;
          parts.add(part.replaceAll(RegExp(r'%[1lL]'), link));
        } else {
          parts.add(part);
        }
      }
      if (!used) parts.add(link);
      if (parts.isEmpty) return false;
      _start(parts.first, parts.sublist(1));
      return true;
    }
    if (Platform.isMacOS && to['app'] is String) {
      _start('/usr/bin/open', ['-a', to['app'] as String, link]);
      return true;
    }
    if (Platform.isLinux && to['desktop'] is String) {
      final exec = desktopExec(to['desktop'] as String);
      if (exec == null) return false;
      var used = false;
      final parts = <String>[];
      for (final part in split(exec, escapes: true)) {
        if (RegExp(r'^%[uUfF]$').hasMatch(part)) {
          parts.add(link);
          used = true;
        } else if (!RegExp(r'^%[a-zA-Z]$').hasMatch(part)) {
          parts.add(part.replaceAll('%%', '%'));
        }
      }
      if (!used) parts.add(link);
      if (parts.isEmpty) return false;
      _start(parts.first, parts.sublist(1));
      return true;
    }
    return false;
  }
}
