// The desktop app checking for its own updates: as it opens, in the small window (splash.dart,
// up to 10 seconds), 30 seconds after the window, then every hour (it lives in the tray for days),
// soon after the computer wakes, and whenever the tray's "Check for updates..." asks, which says
// what it found either way.
//
// It reads the same latest.yml (Windows), latest-mac.yml (macOS), latest-linux.yml or
// latest-linux-arm64.yml (Linux, by the processor) electron-updater did, from the newest GitHub
// release (releases/latest/download/ always points at it): the version, the file and its SHA-512,
// checked before anything's installed. The Electron app (2.4.x and before) reads the same files,
// so it updates to this one the same way.
//
// How it updates depends on how it was installed:
//   Windows .exe (NSIS), Linux .AppImage,  downloaded in the background; a notification, the tray
//   macOS in a folder you can write to     and the title bar offer Restart to update, and it's
//                                          installed on quit anyway.
//   Windows .msi, Linux .deb or .rpm,      told only: an updater can't replace these safely (the
//   a Mac app it can't write to, a copy    .msi's own records, a .deb needs your password), so it
//   run from source                        opens the release page to download the new one.
//
// The notifications it shows unasked ("2.5.1 is out", "is ready", "Couldn't download") can be
// turned off with "New versions of the app" in Service alerts (settings.json's updateNotices).
// The tray's menu and the title bar's button still offer the update.
import 'dart:async';
import 'dart:convert';
import 'dart:ffi' show Abi;
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:yaml/yaml.dart';

import '../app/version.dart';
import '../i18n/i18n.dart';
import 'desktop.dart';
import 'notify.dart';
import 'settings.dart';

/// What the update window says: its line, a smaller line under it, how far (0 to 100, -1 for no
/// telling, null for no bar), and whether Later's offered.
class SplashStatus {
  const SplashStatus(this.text, {this.detail = '', this.percent, this.later = false});
  final String text;
  final String detail;
  final int? percent;
  final bool later;
}

/// One update file's answer.
class UpdateInfo {
  UpdateInfo({required this.version, required this.file, required this.sha512, required this.size});
  final String version;
  final String file;
  final String sha512;
  final int size;

  static UpdateInfo? parse(String text, {bool arm64 = false}) {
    final doc = loadYaml(text);
    if (doc is! YamlMap || doc['version'] == null) return null;
    final files = (doc['files'] is YamlList ? doc['files'] as YamlList : const []).whereType<YamlMap>().toList();
    YamlMap? pick;
    if (files.isNotEmpty) {
      // macOS lists a .zip and a .dmg for each processor: the .zip for this one (the updater's
      // file); elsewhere the one file.
      final zips = files.where((f) => '${f['url']}'.endsWith('.zip')).toList();
      final from = zips.isNotEmpty ? zips : files;
      pick = from.where((f) => '${f['url']}'.contains('arm64') == arm64).firstOrNull ?? (zips.isEmpty ? from.first : null);
    }
    final file = '${pick?['url'] ?? doc['path'] ?? ''}';
    final sha = '${pick?['sha512'] ?? doc['sha512'] ?? ''}';
    if (file.isEmpty || sha.isEmpty) return null;
    return UpdateInfo(version: '${doc['version']}', file: file, sha512: sha, size: (pick?['size'] as num?)?.toInt() ?? 0);
  }
}

class Updater {
  Updater._();

  static const _base = 'https://github.com/augy-studios/sgbus-timings/releases/latest/download';
  static const firstCheck = Duration(seconds: 30);
  static const checkEvery = Duration(hours: 1);
  static const afterWake = Duration(seconds: 20);
  static const startupWait = Duration(seconds: 10);

  /// The newer version found, and once it's downloaded and ready to install.
  static final available = ValueNotifier<String?>(null);
  static final ready = ValueNotifier<String?>(null);
  static final checking = ValueNotifier<bool>(false);

  /// What the update window says, while it's up.
  static final splash = ValueNotifier<SplashStatus>(const SplashStatus('Starting…'));
  static Completer<void>? _later;

  static String? _notifiedFor;
  static String? _failedFor;
  static String? _downloading;
  static File? _file; // the downloaded installer, AppImage or Mac .zip
  static Directory? _macStaged; // the unzipped .app
  static bool _asked = false;
  static Timer? _timer;
  static DateTime _lastTick = DateTime.now();

  static bool get arm64 => Abi.current() == Abi.windowsArm64 || Abi.current() == Abi.linuxArm64 || Abi.current() == Abi.macosArm64;

  static String get ymlName {
    if (Desktop.windows) return 'latest.yml';
    if (Desktop.mac) return 'latest-mac.yml';
    return arm64 ? 'latest-linux-arm64.yml' : 'latest-linux.yml';
  }

  static bool get _wanted => DeskSettings.get<bool>('updateNotices') != false;

  // ---------- how it was installed ----------

  static String get exeDir => File(Platform.resolvedExecutable).parent.path;

  /// The running SG Bus Timings.app: the executable is in its Contents/MacOS.
  static String get macApp => File(Platform.resolvedExecutable).parent.parent.parent.path;

  static bool _writable(String path) {
    try {
      final probe = File('$path${Platform.pathSeparator}.sgbus-write-test');
      probe.writeAsStringSync('');
      probe.deleteSync();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Whether this copy can install an update itself.
  static bool get canInstall {
    if (Desktop.fromSource) return false;
    if (Desktop.windows) return File('$exeDir\\Uninstall ${Desktop.name}.exe').existsSync();
    if (Desktop.linux) return Platform.environment['APPIMAGE']?.isNotEmpty == true;
    if (Desktop.mac) {
      final bundle = macApp;
      return bundle.endsWith('.app') && !bundle.startsWith('/Volumes/') && !bundle.contains('/AppTranslocation/') && _writable(bundle) && _writable(File(bundle).parent.path);
    }
    return false;
  }

  /// Whether a is a later version than b, number by number.
  static bool newer(String a, String b) {
    List<int> parts(String v) => v.split(RegExp(r'[.+-]')).take(3).map((p) => int.tryParse(p) ?? 0).toList();
    final x = parts(a), y = parts(b);
    for (var i = 0; i < 3; i++) {
      final p = i < x.length ? x[i] : 0, q = i < y.length ? y[i] : 0;
      if (p != q) return p > q;
    }
    return false;
  }

  /// The newest release's update file, if it's newer than this copy.
  static Future<UpdateInfo?> find() async {
    final r = await http.get(Uri.parse('$_base/$ymlName?t=${DateTime.now().millisecondsSinceEpoch}'), headers: {'User-Agent': Desktop.userAgent, 'Cache-Control': 'no-cache'}).timeout(const Duration(seconds: 20));
    if (r.statusCode != 200) throw HttpException('update file: ${r.statusCode}');
    final info = UpdateInfo.parse(utf8.decode(r.bodyBytes), arm64: arm64);
    if (info == null) throw const FormatException('update file');
    return newer(info.version, appVersion) ? info : null;
  }

  /// Downloads [info]'s file into the temp folder, checking its SHA-512. [progress] hears
  /// (bytes so far, of how many).
  static Future<File> download(UpdateInfo info, {void Function(int got, int total)? progress}) async {
    final dir = Directory('${Directory.systemTemp.path}${Platform.pathSeparator}sgbus-timings-update')..createSync(recursive: true);
    final out = File('${dir.path}${Platform.pathSeparator}${info.file.split('/').last}');
    if (out.existsSync() && await _hash(out) == info.sha512) return out;
    final client = http.Client();
    try {
      final req = http.Request('GET', Uri.parse('$_base/${Uri.encodeComponent(info.file)}'))..headers['User-Agent'] = Desktop.userAgent;
      final res = await client.send(req).timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) throw HttpException('download: ${res.statusCode}');
      final total = res.contentLength ?? info.size;
      final sink = out.openWrite();
      var got = 0;
      await for (final chunk in res.stream.timeout(const Duration(seconds: 60))) {
        sink.add(chunk);
        got += chunk.length;
        progress?.call(got, total);
      }
      await sink.close();
    } finally {
      client.close();
    }
    if (await _hash(out) != info.sha512) {
      try {
        out.deleteSync();
      } catch (_) {}
      throw const FormatException("the download's SHA-512 doesn't match");
    }
    return out;
  }

  static Future<String> _hash(File f) async => base64.encode((await sha512.bind(f.openRead()).first).bytes);

  // ---------- installing ----------

  /// The download made ready to install: on a Mac, unzipped beside the old app's temp folder
  /// (ditto keeps the app's links and signature whole).
  static Future<void> _stage(File file) async {
    _file = file;
    if (!Desktop.mac) return;
    final dir = Directory('${Directory.systemTemp.path}/sgbus-timings-staged');
    if (dir.existsSync()) dir.deleteSync(recursive: true);
    dir.createSync(recursive: true);
    final r = await Process.run('/usr/bin/ditto', ['-x', '-k', file.path, dir.path]);
    if (r.exitCode != 0) throw ProcessException('ditto', [], '${r.stderr}', r.exitCode);
    final app = dir.listSync().whereType<Directory>().where((d) => d.path.endsWith('.app')).firstOrNull;
    if (app == null) throw const FormatException('no .app in the update');
    _macStaged = app;
  }

  // macOS: once this process has gone, swap the new app in for the old, keeping the old if the
  // swap fails part-way, then open it again if asked. Detached, so it outlives the app.
  static const _swap = r'''
while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
old="$3.old-$$"
if mv "$3" "$old"; then
  if mv "$2" "$3"; then rm -rf "$old"; else mv "$old" "$3"; fi
fi
xattr -dr com.apple.quarantine "$3" 2>/dev/null
rm -rf "$4"
[ "$5" = 1 ] && open "$3"
''';

  static bool _installing = false;

  /// Installs the downloaded update as the app goes; [relaunch] opens the new version after.
  static Future<void> _installOnExit({required bool relaunch}) async {
    if (_installing || _file == null) return;
    _installing = true;
    final file = _file!;
    if (Desktop.windows) {
      // The installer closes this copy, installs over it and, with --force-run, opens it again.
      await Process.start(file.path, ['--updated', '/S', if (relaunch) '--force-run'], mode: ProcessStartMode.detached);
    } else if (Desktop.linux) {
      final target = Platform.environment['APPIMAGE']!;
      final next = File('$target.new');
      await file.copy(next.path);
      await Process.run('chmod', ['755', next.path]);
      next.renameSync(target);
      if (relaunch) await Process.start(target, const [], mode: ProcessStartMode.detached);
    } else if (Desktop.mac && _macStaged != null) {
      await Process.start('/bin/sh', ['-c', _swap, 'sgbus-update', '$pid', _macStaged!.path, macApp, _macStaged!.parent.path, relaunch ? '1' : '0'], mode: ProcessStartMode.detached);
    }
  }

  /// Restart to update: the small window, "Installing update…", then the new version.
  static Future<void> restartToUpdate() async {
    if (ready.value == null) return;
    showSplash?.call();
    splash.value = SplashStatus(tr('desktop.update.installing', 'Installing update…'), percent: -1);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    await _installOnExit(relaunch: true);
    await Desktop.quit();
  }

  /// Set by main.dart: puts the update window up over the app, for Restart to update.
  static void Function()? showSplash;

  // ---------- after the app's open ----------

  static void start() {
    if (Desktop.fromSource) return;
    // Quit any other way than Restart to update: installed then, not reopened.
    Desktop.beforeQuit.add(() async {
      if (ready.value != null && !_installing && canInstall) await _installOnExit(relaunch: false);
    });
    Timer(firstCheck, check);
    _lastTick = DateTime.now();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      final now = DateTime.now();
      // A laptop asleep overnight: the clock jumps. What came out meanwhile, soon after.
      final slept = now.difference(_lastTick) > const Duration(minutes: 5);
      _lastTick = now;
      if (slept) {
        Timer(afterWake, check);
      } else if (_sinceCheck() >= checkEvery) {
        check();
      }
    });
  }

  static DateTime _checkedAt = DateTime.now();
  static Duration _sinceCheck() => DateTime.now().difference(_checkedAt);

  static Future<void> check() async {
    if (checking.value) return;
    checking.value = true;
    _checkedAt = DateTime.now();
    final asked = _asked;
    try {
      final info = await find();
      if (info == null) {
        if (asked) DeskNotify.show(title: tr('desktop.update.upToDate', "You're up to date"), body: tr('desktop.update.newest', '{app} {v} is the newest version.', {'app': Desktop.name, 'v': appVersion}));
        return;
      }
      _found(info, asked: asked);
    } catch (_) {
      if (asked) DeskNotify.show(title: tr('desktop.update.cantCheck', "Couldn't check for updates"), body: tr('desktop.update.checkConnection', 'Check your connection and try again.'));
    } finally {
      checking.value = false;
      _asked = false;
    }
  }

  static void _found(UpdateInfo info, {required bool asked}) {
    available.value = info.version;
    final install = canInstall;
    if (asked && install) {
      if (ready.value == info.version) {
        _sayReady(info.version, force: true);
      } else {
        DeskNotify.show(title: tr('desktop.update.out', '{app} {v} is out', {'app': Desktop.name, 'v': info.version}), body: tr('desktop.update.downloading', "It's downloading. You'll be told when it's ready to install."));
      }
    }
    if (!install) {
      if (_notifiedFor == info.version && !asked) return;
      if (!asked && !_wanted) return;
      _notifiedFor = info.version;
      DeskNotify.show(
        title: tr('desktop.update.out', '{app} {v} is out', {'app': Desktop.name, 'v': info.version}),
        body: tr('desktop.update.downloadIt', 'Click to download it from GitHub, then install it over this one.'),
        onClick: () => Desktop.openExternal(Desktop.releases),
      );
      return;
    }
    if (ready.value == info.version || _downloading == info.version) return;
    _downloading = info.version;
    download(info).then((file) async {
      await _stage(file);
      _downloading = null;
      ready.value = info.version;
      _sayReady(info.version);
    }).catchError((Object _) => _downloadFailed(info.version));
  }

  static void _sayReady(String version, {bool force = false}) {
    if (!force && (_notifiedFor == version || !_wanted)) return;
    _notifiedFor = version;
    DeskNotify.show(
      title: tr('desktop.update.ready', '{app} {v} is ready', {'app': Desktop.name, 'v': version}),
      body: tr('desktop.update.readyBody', 'Click to restart and update. Otherwise it updates the next time you quit.'),
      onClick: restartToUpdate,
    );
  }

  // A new version was found but didn't download (or, on a Mac, wouldn't unzip): the next check
  // tries again. Said once per version, unless "New versions of the app" is off.
  static void _downloadFailed(String version) {
    _downloading = null;
    if (_failedFor == version || !_wanted) return;
    _failedFor = version;
    DeskNotify.show(
      title: tr('desktop.update.failed', "Couldn't download {app} {v}", {'app': Desktop.name, 'v': version}),
      body: tr('desktop.update.failedBody', 'It tries again within the hour, or click to download it from GitHub.'),
      onClick: () => Desktop.openExternal(Desktop.releases),
    );
  }

  /// The tray's "Check for updates...": a check now, and a notification of what it found.
  static void checkNow() {
    if (Desktop.fromSource) {
      DeskNotify.show(title: tr('desktop.update.none', 'No updates to check for'), body: tr('desktop.update.fromSource', 'Run from source, there is nothing to update. The installed app checks for itself.'));
      return;
    }
    if (checking.value) return;
    _asked = true;
    check();
  }

  // ---------- the update window at launch ----------

  static void later() => _later?.complete();

  /// As the app opens: checks for an update, and downloads and installs one it can install itself,
  /// as Discord does. Completes once the app should open; never, if it's restarting into the new
  /// version. From source there's nothing to update, unless SGBUS_SPLASH_DEMO=1 has it go through
  /// the steps with made-up numbers.
  static Future<void> startup() async {
    final demo = Desktop.fromSource && Platform.environment['SGBUS_SPLASH_DEMO'] == '1';
    if (Desktop.fromSource && !demo) return;
    if (demo) return _demo();
    splash.value = SplashStatus(tr('desktop.update.checking', 'Checking for updates…'), percent: -1);
    UpdateInfo? info;
    try {
      info = await find().timeout(startupWait);
    } catch (_) {
      info = null;
    }
    // None, offline, or one it can't install itself (.msi, .deb): told about it as before, once
    // the app's open.
    if (info == null || !canInstall) {
      if (info != null) Timer(const Duration(seconds: 5), () => _found(info!, asked: false));
      return _opening();
    }
    available.value = info.version;
    _downloading = info.version;
    splash.value = SplashStatus(tr('desktop.update.downloadingShort', 'Downloading update'), detail: tr('desktop.update.version', 'Version {v}', {'v': info.version}), percent: 0, later: true);
    _later = Completer<void>();
    final done = Completer<Object?>();
    download(info, progress: (got, total) {
      if (_later?.isCompleted ?? true) return;
      splash.value = SplashStatus(
        tr('desktop.update.downloadingShort', 'Downloading update'),
        detail: tr('desktop.update.megabytes', '{got} of {total} MB', {'got': _mb(got), 'total': _mb(total)}),
        percent: total > 0 ? (got * 100 ~/ total) : -1,
        later: true,
      );
    }).then((f) => done.isCompleted ? null : done.complete(f)).catchError((Object e) => done.isCompleted ? null : done.complete(e));
    final outcome = await Future.any<Object?>([done.future, _later!.future.then((_) => 'later')]);
    if (outcome == 'later') {
      // The app opens; the download carries on, ready on the tray when it's done.
      done.future.then((f) async {
        if (f is File) {
          try {
            await _stage(f);
            _downloading = null;
            ready.value = info!.version;
            _sayReady(info.version);
          } catch (_) {
            _downloadFailed(info!.version);
          }
        } else {
          _downloadFailed(info!.version);
        }
      });
      return _opening();
    }
    if (outcome is! File) {
      _downloading = null;
      return _opening();
    }
    try {
      await _stage(outcome);
    } catch (_) {
      _downloading = null;
      return _opening();
    }
    _downloading = null;
    ready.value = info.version;
    await restartToUpdate();
    // Quitting into the installer: the app doesn't open meanwhile.
    await Completer<void>().future;
  }

  static String _mb(int bytes) => (bytes / 1e6).toStringAsFixed(bytes < 10e6 ? 1 : 0);

  static Future<void> _opening() async {
    splash.value = SplashStatus(tr('desktop.update.starting', 'Starting…'));
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }

  static Future<void> _demo() async {
    splash.value = SplashStatus(tr('desktop.update.checking', 'Checking for updates…'), percent: -1);
    await Future<void>.delayed(const Duration(milliseconds: 1500));
    const total = 84600000;
    _later = Completer<void>();
    for (var p = 0; p <= 100; p += 4) {
      if (_later!.isCompleted) return _opening();
      splash.value = SplashStatus(tr('desktop.update.downloadingShort', 'Downloading update'),
          detail: tr('desktop.update.megabytes', '{got} of {total} MB', {'got': _mb(total * p ~/ 100), 'total': _mb(total)}), percent: p, later: true);
      await Future<void>.delayed(const Duration(milliseconds: 120));
    }
    splash.value = SplashStatus(tr('desktop.update.installing', 'Installing update…'), percent: -1);
    await Future<void>.delayed(const Duration(milliseconds: 1500));
    return _opening();
  }
}
