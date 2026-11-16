// The desktop app checking for its own updates: as it opens, in the small window (splash.dart,
// up to 10 seconds), 30 seconds after the window, then every hour (it lives in the tray for days),
// 20 seconds after the computer wakes, and whenever the tray's "Check for updates..." asks, which
// says what it found either way.
//
// It reads the same latest.yml (Windows), latest-mac.yml (macOS), latest-linux.yml or
// latest-linux-arm64.yml (Linux, by the processor) electron-updater did, from the newest GitHub
// release (releases/latest/download/ always points at it): the version, the file and its SHA-512,
// checked before anything's installed. installers/update-files.mjs writes them, in the same form
// the Electron app's build did, so the Electron app (2.4.x and before) updates to this one too.
//
// How it updates depends on how it was installed (InstallKind):
//   Windows .exe (NSIS), Linux .AppImage,  downloaded in the background; a notification, the tray
//   macOS in a folder you can write to     and the title bar offer Restart to update, and it's
//                                          installed on quit anyway.
//   Windows .msi, Linux .deb or .rpm,      told only: an updater can't replace these safely (the
//   a Mac app it can't write to, a copy    .msi's own records, a .deb needs your password), so it
//   run from source                        opens the release page to download the new one.
//
// The files it downloads are the installers' own (installers/): sg-bus-timings-<v>-setup.exe on
// Windows, sg-bus-timings-<v>-mac-arm64.zip or -mac-x64.zip on a Mac, and
// sg-bus-timings-<v>-x86_64.AppImage or -arm64.AppImage on Linux.
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

  /// The main line: "Checking for updates…", "Downloading update", "Installing update…".
  final String text;

  /// The smaller line under it: "Version 2.5.1", "31 of 85 MB", or nothing.
  final String detail;

  /// The bar: 0 to 100, -1 for a bar that moves without telling how far, null for no bar.
  final int? percent;

  /// Whether the Later button shows.
  final bool later;
}

/// One update file's answer: the newest version, and the file this copy would update from.
class UpdateInfo {
  UpdateInfo({required this.version, required this.file, required this.sha512, required this.size});

  /// The newest version, such as 2.5.1.
  final String version;

  /// The installer's file name on the release, such as sg-bus-timings-2.5.1-setup.exe.
  final String file;

  /// The file's SHA-512, in base64, checked once it's downloaded.
  final String sha512;

  /// The file's size in bytes (0 if the update file didn't say), for the download's progress.
  final int size;

  /// Reads an update file's [text] and picks the file this copy updates from: the one whose name
  /// ends in [extension] (.exe, .zip, .AppImage). Where the file lists one for each processor (the
  /// Mac's .zip files), [arm64] picks it the way electron-updater does: "arm64" in the name for
  /// Apple silicon, not in it for Intel. Null when the text isn't an update file or has no such
  /// file. Only a plain file name is taken (no folders, no ".."), as it becomes a file on disk.
  static UpdateInfo? parse(String text, {required String extension, bool? arm64}) {
    final Object? doc;
    try {
      doc = loadYaml(text);
    } on YamlException {
      return null;
    }
    if (doc is! YamlMap || doc['version'] == null) return null;
    final version = '${doc['version']}';

    final listed = doc['files'] is YamlList ? (doc['files'] as YamlList).whereType<YamlMap>() : const <YamlMap>[];
    for (final entry in listed) {
      final url = '${entry['url'] ?? ''}';
      if (!url.endsWith(extension) || !_plainName(url)) continue;
      if (arm64 != null && url.contains('arm64') != arm64) continue;
      final sha = '${entry['sha512'] ?? ''}';
      if (sha.isEmpty) continue;
      return UpdateInfo(version: version, file: url, sha512: sha, size: (entry['size'] as num?)?.toInt() ?? 0);
    }

    // The oldest update files had only `path` and `sha512`, with no list.
    final path = '${doc['path'] ?? ''}';
    final sha = '${doc['sha512'] ?? ''}';
    if (listed.isEmpty && path.endsWith(extension) && _plainName(path) && sha.isNotEmpty && (arm64 == null || path.contains('arm64') == arm64)) {
      return UpdateInfo(version: version, file: path, sha512: sha, size: 0);
    }
    return null;
  }

  /// Whether [name] is just a file's name, with no folder in it and no "..": what the release's
  /// files are called. Anything else is refused, so a bad update file can't write elsewhere.
  static bool _plainName(String name) => name.isNotEmpty && !name.contains('/') && !name.contains(r'\') && !name.contains('..');
}

/// How this copy of the app was installed, which decides whether it can update itself
/// (desktop-features-spec §3).
enum InstallKind {
  /// Windows, by the .exe installer (NSIS), for this person (their own %LOCALAPPDATA%\Programs).
  /// Updates itself.
  windowsExe,

  /// Windows, by the .exe installer "for all users" (in Program Files, or the folder recorded under
  /// HKEY_LOCAL_MACHINE; an Electron install made that way), or in a folder this person can't
  /// change. Updating it needs an administrator, so it only says there's a new version: the app
  /// doesn't ask for administrator rights at every start. The installer from the release page asks
  /// for them itself when it's run.
  windowsAllUsers,

  /// Windows, by the .msi: no uninstaller beside it. Only says there's a new version.
  windowsMsi,

  /// Linux, an AppImage in a folder this person can write to. Updates itself.
  appImage,

  /// Linux, from the .deb or .rpm (or an AppImage it can't replace). Only says so.
  linuxPackage,

  /// macOS, an app in a folder this person can write to (Applications on most Macs). Updates itself.
  macWritable,

  /// macOS, an app still on its disk image, run from Downloads (macOS then runs a read-only copy,
  /// "translocated"), or in a folder only an admin can change. Only says so.
  macReadOnly,

  /// Run from source with `flutter run`: nothing to update.
  fromSource;

  /// Whether this kind of install can download and install an update itself.
  bool get canInstall => this == windowsExe || this == appImage || this == macWritable;

  /// Works out how the app was installed from where it's running. [os] is Platform.operatingSystem,
  /// [executable] the running program's path; [exists] and [writable] check a path on disk.
  /// [allUsersFolder] is the folder an all-users install recorded (HKEY_LOCAL_MACHINE's
  /// InstallLocation), if any. All passed in, so tests can say what's there.
  static InstallKind detect({
    required String os,
    required String executable,
    required Map<String, String> environment,
    required bool fromSource,
    required bool Function(String path) exists,
    required bool Function(String path) writable,
    String? allUsersFolder,
  }) {
    if (fromSource) return InstallKind.fromSource;
    switch (os) {
      case 'windows':
        final folder = _parent(executable, r'\');
        if (!exists('$folder\\Uninstall ${Desktop.name}.exe')) return InstallKind.windowsMsi;
        // An all-users copy stays tell-only even where this person could write to it (Program
        // Files opened up by an organisation): its installer would still ask for administrator
        // rights at every start.
        final forEveryone = _samePath(folder, allUsersFolder) ||
            _inside(folder, environment['ProgramFiles']) ||
            _inside(folder, environment['ProgramW6432']);
        if (forEveryone) return InstallKind.windowsAllUsers;
        return writable(folder) ? InstallKind.windowsExe : InstallKind.windowsAllUsers;
      case 'linux':
        // The AppImage's own runtime sets APPIMAGE to the file it was started from.
        final appImage = environment['APPIMAGE'] ?? '';
        if (appImage.isEmpty) return InstallKind.linuxPackage;
        return writable(_parent(appImage, '/')) ? InstallKind.appImage : InstallKind.linuxPackage;
      case 'macos':
        // The program is SG Bus Timings.app/Contents/MacOS/<name>.
        final bundle = _parent(_parent(_parent(executable, '/'), '/'), '/');
        final inPlace = bundle.endsWith('.app') && !bundle.startsWith('/Volumes/') && !bundle.contains('/AppTranslocation/');
        return inPlace && writable(bundle) && writable(_parent(bundle, '/')) ? InstallKind.macWritable : InstallKind.macReadOnly;
      default:
        // Not a desktop: there's nothing to update.
        return InstallKind.fromSource;
    }
  }

  /// The folder [path] is in, for a path written with [separator].
  static String _parent(String path, String separator) {
    final end = path.lastIndexOf(separator);
    return end <= 0 ? path : path.substring(0, end);
  }

  /// Whether two Windows folders are the same, ignoring case and a trailing backslash.
  static bool _samePath(String a, String? b) {
    if (b == null || b.isEmpty) return false;
    String plain(String p) => p.toLowerCase().replaceAll(RegExp(r'\\+$'), '');
    return plain(a) == plain(b);
  }

  /// Whether the Windows folder [path] is inside the folder [parent] (such as C:\Program Files).
  static bool _inside(String path, String? parent) {
    if (parent == null || parent.isEmpty) return false;
    final top = parent.toLowerCase().replaceAll(RegExp(r'\\+$'), '');
    return path.toLowerCase().startsWith('$top\\');
  }
}

/// Finds, downloads, verifies and installs new versions of the desktop app (spec §9), and drives
/// the update window at launch.
class Updater {
  Updater._();

  static const _base = 'https://github.com/augy-studios/sgbus-timings/releases/latest/download';
  static const firstCheck = Duration(seconds: 30);
  static const checkEvery = Duration(hours: 1);
  static const afterWake = Duration(seconds: 20);
  static const startupWait = Duration(seconds: 10);

  /// The newer version found, for the tray's menu.
  static final available = ValueNotifier<String?>(null);

  /// The version downloaded and ready to install, for the tray's menu and the title bar's button.
  static final ready = ValueNotifier<String?>(null);

  /// Whether a check is running (the tray's "Checking for updates..." greys out meanwhile).
  static final checking = ValueNotifier<bool>(false);

  /// What the update window says, while it's up.
  static final splash = ValueNotifier<SplashStatus>(const SplashStatus('Starting…'));
  static Completer<void>? _later;

  static String? _notifiedFor;
  static String? _failedFor;
  static String? _downloading;
  static File? _file; // the downloaded installer, AppImage or Mac .zip
  static String? _fileSha512; // its SHA-512 from the update file, checked again before installing
  static Directory? _macStaged; // the unzipped .app
  static bool _asked = false;
  static bool _installing = false;
  static Timer? _timer;
  static DateTime _lastTick = DateTime.now();
  static DateTime _checkedAt = DateTime.now();

  /// Whether this copy runs on an Arm processor (Apple silicon, Windows on Arm, Linux arm64).
  static bool get arm64 => Abi.current() == Abi.windowsArm64 || Abi.current() == Abi.linuxArm64 || Abi.current() == Abi.macosArm64;

  /// The update file for this platform and processor.
  static String get ymlName {
    if (Desktop.windows) return 'latest.yml';
    if (Desktop.mac) return 'latest-mac.yml';
    return arm64 ? 'latest-linux-arm64.yml' : 'latest-linux.yml';
  }

  /// The end of the file name this copy updates from: the .exe installer (one for both
  /// processors), the Mac's .zip, or the AppImage.
  static String get _extension {
    if (Desktop.windows) return '.exe';
    if (Desktop.mac) return '.zip';
    return '.AppImage';
  }

  /// Whether to tell the person unasked: the "New versions of the app" switch (missing means on).
  static bool get _wanted => DeskSettings.get<bool>('updateNotices') != false;

  // ---------- how it was installed ----------

  /// The folder the running program is in.
  static String get exeDir => File(Platform.resolvedExecutable).parent.path;

  /// The running SG Bus Timings.app: the executable is in its Contents/MacOS.
  static String get macApp => File(Platform.resolvedExecutable).parent.parent.parent.path;

  /// How this copy was installed, worked out once (it doesn't change while the app runs).
  static final InstallKind installKind = InstallKind.detect(
    os: Platform.operatingSystem,
    executable: Platform.resolvedExecutable,
    environment: Platform.environment,
    fromSource: Desktop.fromSource,
    exists: (path) => File(path).existsSync(),
    writable: _writable,
    allUsersFolder: Platform.isWindows ? _allUsersFolder() : null,
  );

  /// The folder an all-users install recorded: HKEY_LOCAL_MACHINE\Software\8b1cb8d1-…'s
  /// InstallLocation (the Electron installer's key, kept by installers/windows/sgbus-timings.nsi),
  /// or null when there's none.
  static String? _allUsersFolder() {
    try {
      final r = Process.runSync('reg', ['query', r'HKLM\Software\8b1cb8d1-c06f-5377-97bb-cd1bae528f5a', '/v', 'InstallLocation', '/reg:64']);
      if (r.exitCode != 0) return null;
      return RegExp(r'InstallLocation\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$', multiLine: true).firstMatch('${r.stdout}')?.group(1);
    } catch (_) {
      return null;
    }
  }

  /// Whether this person can write to the folder [path]. On macOS and Linux: the shell's `test -w`
  /// (as Electron's fs.accessSync), without writing anything into the app's bundle to find out.
  /// Windows has no `test`, so there a small file is made in the folder and deleted again (Program
  /// Files refuses it without administrator rights). The uninstaller also deletes any left behind.
  static bool _writable(String path) {
    if (Platform.isWindows) {
      final probe = File('$path\\.sgbus-write-test-$pid');
      try {
        probe.writeAsStringSync('');
        return true;
      } catch (_) {
        return false;
      } finally {
        try {
          if (probe.existsSync()) probe.deleteSync();
        } catch (_) {
          // Left behind: harmless, and the uninstaller clears it.
        }
      }
    }
    try {
      return Process.runSync('test', ['-w', path]).exitCode == 0;
    } catch (_) {
      return false;
    }
  }

  /// Whether this copy can install an update itself (the tray offers "Download version x.y.z"
  /// when it can't).
  static bool get canInstall => installKind.canInstall;

  /// Whether version [a] is later than version [b], number by number (2.10.0 is later than 2.9.9).
  /// Anything after a "-" or "+" is ignored.
  static bool newer(String a, String b) {
    List<int> parts(String v) => v.split(RegExp(r'[-+]')).first.split('.').take(3).map((p) => int.tryParse(p) ?? 0).toList();
    final x = parts(a), y = parts(b);
    for (var i = 0; i < 3; i++) {
      final p = i < x.length ? x[i] : 0, q = i < y.length ? y[i] : 0;
      if (p != q) return p > q;
    }
    return false;
  }

  // ---------- finding and downloading ----------

  /// The newest release's update file, if it's newer than this copy; null if this is the newest.
  /// Throws when it can't tell (offline, or no update file on the release).
  static Future<UpdateInfo?> find() async {
    final address = Uri.parse('$_base/$ymlName?t=${DateTime.now().millisecondsSinceEpoch}');
    final r = await http.get(address, headers: {'User-Agent': Desktop.userAgent, 'Cache-Control': 'no-cache'}).timeout(const Duration(seconds: 20));
    if (r.statusCode != 200) throw HttpException('update file: ${r.statusCode}');
    final info = UpdateInfo.parse(utf8.decode(r.bodyBytes), extension: _extension, arm64: Desktop.mac ? arm64 : null);
    if (info == null) throw const FormatException('update file');
    return newer(info.version, appVersion) ? info : null;
  }

  /// Downloads [info]'s file, checking its SHA-512. [progress] hears (bytes so far, of how many).
  /// It goes into a new folder only this person can open (on Linux the temp folder, /tmp, is
  /// shared by everyone); earlier downloads are cleared first, so old installers don't pile up.
  /// [base] is where the files are: the newest release, or a test's own server.
  static Future<File> download(UpdateInfo info, {void Function(int got, int total)? progress, String base = _base}) async {
    final dir = await _freshDownloadFolder();
    final out = File('${dir.path}${Platform.pathSeparator}${info.file}');
    final client = http.Client();
    try {
      final req = http.Request('GET', Uri.parse('$base/${Uri.encodeComponent(info.file)}'))..headers['User-Agent'] = Desktop.userAgent;
      final res = await client.send(req).timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) throw HttpException('download: ${res.statusCode}');
      final total = res.contentLength ?? info.size;
      final sink = out.openWrite();
      var got = 0;
      try {
        // A minute with nothing arriving counts as failed.
        await for (final chunk in res.stream.timeout(const Duration(seconds: 60))) {
          sink.add(chunk);
          got += chunk.length;
          progress?.call(got, total);
        }
      } finally {
        await sink.close();
      }
    } finally {
      client.close();
    }
    if (await _hash(out) != info.sha512) {
      try {
        dir.deleteSync(recursive: true);
      } catch (_) {}
      throw const FormatException("the download's SHA-512 doesn't match");
    }
    return out;
  }

  /// Clears the folders earlier downloads left in the temp folder, then makes a new one. Dart's
  /// createTemp makes it readable by this person only (mode 0700 on Linux and macOS). Another
  /// person's folders, which can't be deleted, are skipped.
  static Future<Directory> _freshDownloadFolder() async {
    final temp = Directory.systemTemp;
    try {
      for (final old in temp.listSync().whereType<Directory>()) {
        final name = old.path.split(Platform.pathSeparator).last;
        if (!name.startsWith('sgbus-timings-update')) continue;
        try {
          old.deleteSync(recursive: true);
        } catch (_) {}
      }
    } catch (_) {
      // The temp folder couldn't be listed: nothing to clear.
    }
    return temp.createTemp('sgbus-timings-update-');
  }

  /// A file's SHA-512 in base64, as the update files give it.
  static Future<String> _hash(File f) async => base64.encode((await sha512.bind(f.openRead()).first).bytes);

  // ---------- installing ----------

  /// Gets the download ready to install, remembering its [sha512]. On a Mac, the .zip is unzipped
  /// into a temp folder now (ditto keeps the app's links and signature whole), so quitting only
  /// has to swap it in.
  static Future<void> _stage(File file, String sha512) async {
    _file = file;
    _fileSha512 = sha512;
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
  // $1 this process, $2 the new .app, $3 the running .app, $4 the temp folder, $5 1 to reopen.
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

  /// Installs the downloaded update as the app goes; [relaunch] opens the new version after.
  static Future<void> _installOnExit({required bool relaunch}) async {
    if (_installing || _file == null) return;
    _installing = true;
    try {
      // The installer or AppImage is checked again just before it runs: it sat in a temp folder
      // since it was downloaded. (A Mac's was unzipped then, from the checked .zip.)
      if (!Desktop.mac && await _hash(_file!) != _fileSha512) throw const FormatException('the update changed since it was downloaded');
      if (Desktop.windows) {
        await _runWindowsInstaller(_file!, relaunch: relaunch);
      } else if (Desktop.linux) {
        await _replaceAppImage(_file!, relaunch: relaunch);
      } else if (Desktop.mac && _macStaged != null) {
        await Process.start('/bin/sh', ['-c', _swap, 'sgbus-update', '$pid', _macStaged!.path, macApp, _macStaged!.parent.path, relaunch ? '1' : '0'], mode: ProcessStartMode.detached);
      }
    } catch (_) {
      // Couldn't start it (the file's gone or changed, or the folder's become read-only): the app
      // quits as asked, and the next check downloads it again.
      _installing = false;
    }
  }

  /// Windows: starts the downloaded installer the way electron-updater did. It waits for this copy
  /// to close, installs over it silently (/S), and with --force-run opens the new version.
  static Future<void> _runWindowsInstaller(File installer, {required bool relaunch}) async {
    await Process.start(installer.path, ['--updated', '/S', if (relaunch) '--force-run'], mode: ProcessStartMode.detached);
  }

  /// Linux: puts the downloaded AppImage in place of the running one. It's copied beside it first
  /// and then renamed over it, so the swap is all-or-nothing (the running copy carries on from the
  /// old file until it quits). Reopened, the new copy starts only once this one has gone: started
  /// sooner, it would find this copy still running and hand itself over to it (one copy at a time).
  static Future<void> _replaceAppImage(File download, {required bool relaunch}) async {
    final target = Platform.environment['APPIMAGE']!;
    final next = File('$target.new');
    await download.copy(next.path);
    await Process.run('chmod', ['755', next.path]);
    next.renameSync(target);
    if (relaunch) await Process.start('/bin/sh', ['-c', _afterExit, 'sgbus-relaunch', '$pid', target], mode: ProcessStartMode.detached);
  }

  // Linux: waits for this process ($1) to end, then starts the new AppImage ($2).
  static const _afterExit = r'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec "$2"';

  /// Restart to update: the small window says "Installing update…", then the new version opens.
  static Future<void> restartToUpdate() async {
    if (ready.value == null) return;
    showSplash?.call();
    splash.value = SplashStatus(tr('desktop.update.installing', 'Installing update…'), percent: -1);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    await _installOnExit(relaunch: true);
    await Desktop.quit();
  }

  /// Set by desktop_main.dart: puts the update window up over the app, for Restart to update.
  static void Function()? showSplash;

  // ---------- after the app's open ----------

  /// Starts the checks once the main window's up: 30 seconds later, then hourly and after waking.
  /// Also has a downloaded update installed when the app quits any other way.
  static void start() {
    if (Desktop.fromSource) return;
    Desktop.beforeQuit.add(() async {
      if (ready.value != null && !_installing && canInstall) await _installOnExit(relaunch: false);
    });
    Timer(firstCheck, check);
    _lastTick = DateTime.now();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _tick());
  }

  /// The minute timer: checks hourly, and soon after the computer wakes. A sleeping computer runs
  /// no timers, so a jump of the wall clock between two ticks means it was asleep (the
  /// monotonic clock stops while it sleeps, so it can't tell).
  static void _tick() {
    final now = DateTime.now();
    final slept = now.difference(_lastTick) > const Duration(minutes: 5);
    _lastTick = now;
    if (slept) {
      // The network takes a moment to come back.
      Timer(afterWake, check);
    } else if (now.difference(_checkedAt) >= checkEvery) {
      check();
    }
  }

  /// Checks for a new version now. Says what it found only when asked from the tray (checkNow);
  /// otherwise only a new version is told about, once.
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

  /// A newer version was found: downloaded if this copy can install it, else told about with a
  /// link to the release.
  static void _found(UpdateInfo info, {required bool asked}) {
    available.value = info.version;
    if (!canInstall) {
      _tellOut(info.version, asked: asked);
      return;
    }
    // Asked from the tray: what's happening with it, even if it was said before.
    if (asked) {
      if (ready.value == info.version) {
        _sayReady(info.version, force: true);
      } else {
        DeskNotify.show(title: tr('desktop.update.out', '{app} {v} is out', {'app': Desktop.name, 'v': info.version}), body: tr('desktop.update.downloading', "It's downloading. You'll be told when it's ready to install."));
      }
    }
    if (ready.value == info.version || _downloading == info.version) return;
    // A newer version than the one ready: the new download clears the old one's file.
    ready.value = null;
    _file = null;
    _downloading = info.version;
    download(info).then((file) async {
      await _stage(file, info.sha512);
      _downloading = null;
      ready.value = info.version;
      _sayReady(info.version);
    }).catchError((Object _) => _downloadFailed(info.version));
  }

  /// "x.y.z is out", for an install that can't update itself: once per version unless asked, and
  /// only with "New versions of the app" on. Clicking opens the release page.
  static void _tellOut(String version, {required bool asked}) {
    if (!asked && (_notifiedFor == version || !_wanted)) return;
    _notifiedFor = version;
    DeskNotify.show(
      title: tr('desktop.update.out', '{app} {v} is out', {'app': Desktop.name, 'v': version}),
      body: tr('desktop.update.downloadIt', 'Click to download it from GitHub, then install it over this one.'),
      onClick: () => Desktop.openExternal(Desktop.releases),
    );
  }

  /// "x.y.z is ready": once per version (or whenever [force]d by the tray), only with "New
  /// versions of the app" on. Clicking restarts into it.
  static void _sayReady(String version, {bool force = false}) {
    if (!force && (_notifiedFor == version || !_wanted)) return;
    _notifiedFor = version;
    DeskNotify.show(
      title: tr('desktop.update.ready', '{app} {v} is ready', {'app': Desktop.name, 'v': version}),
      body: tr('desktop.update.readyBody', 'Click to restart and update. Otherwise it updates the next time you quit.'),
      onClick: restartToUpdate,
    );
  }

  /// A new version was found but didn't download (or, on a Mac, wouldn't unzip): the next check
  /// tries again. Said once per version, unless "New versions of the app" is off.
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
      DeskNotify.show(title: tr('desktop.update.none', 'No updates to check for'), body: tr('desktop.update.fromSource', "Running from source, so there's nothing to update. The installed app checks for itself."));
      return;
    }
    if (checking.value) return;
    _asked = true;
    check();
  }

  // ---------- the update window at launch ----------

  /// The update window's Later: the app opens now and the download carries on behind it. A second
  /// click does nothing.
  static void later() {
    final waiting = _later;
    if (waiting != null && !waiting.isCompleted) waiting.complete();
  }

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
      if (info != null) {
        final found = info;
        Timer(const Duration(seconds: 5), () => _found(found, asked: false));
      }
      return _opening();
    }
    final outcome = await _downloadInWindow(info);
    if (outcome == null) return _opening(); // Later, a failed download, or one that won't unpack
    ready.value = info.version;
    await restartToUpdate();
    // Quitting into the installer: the app doesn't open meanwhile.
    await Completer<void>().future;
  }

  /// The download, shown in the update window with its bar and Later. Returns the staged file once
  /// it's downloaded and ready to install, or null for Later (the download then carries on, and is
  /// offered from the tray when it's done), a failed download, or one that won't unpack.
  static Future<File?> _downloadInWindow(UpdateInfo info) async {
    available.value = info.version;
    _downloading = info.version;
    splash.value = SplashStatus(tr('desktop.update.downloadingShort', 'Downloading update'), detail: tr('desktop.update.version', 'Version {v}', {'v': info.version}), percent: 0, later: true);
    _later = Completer<void>();

    final done = Completer<Object?>(); // the File, or the error
    download(info, progress: (got, total) {
      if (_later!.isCompleted) return;
      splash.value = SplashStatus(
        tr('desktop.update.downloadingShort', 'Downloading update'),
        detail: tr('desktop.update.megabytes', '{got} of {total} MB', {'got': _mb(got), 'total': _mb(total)}),
        percent: total > 0 ? (got * 100 ~/ total) : -1,
        later: true,
      );
    }).then(done.complete, onError: (Object e) => done.complete(e));

    final outcome = await Future.any<Object?>([done.future, _later!.future.then((_) => 'later')]);
    if (outcome == 'later') {
      done.future.then((f) => _finishInBackground(info, f));
      return null;
    }
    if (outcome is! File) {
      _downloading = null;
      return null;
    }
    try {
      await _stage(outcome, info.sha512);
    } catch (_) {
      _downloading = null;
      return null;
    }
    _downloading = null;
    return outcome;
  }

  /// After Later: [info]'s download finished behind the app ([result] is the File or the error).
  /// Ready to install from the tray, or "Couldn't download" if it failed.
  static Future<void> _finishInBackground(UpdateInfo info, Object? result) async {
    if (result is! File) return _downloadFailed(info.version);
    try {
      await _stage(result, info.sha512);
    } catch (_) {
      return _downloadFailed(info.version);
    }
    _downloading = null;
    ready.value = info.version;
    _sayReady(info.version);
  }

  /// Bytes as megabytes for the update window: one decimal under 10 MB ("8.4"), none above ("85").
  static String _mb(int bytes) => (bytes / 1e6).toStringAsFixed(bytes < 10e6 ? 1 : 0);

  /// "Starting…" for half a second, then the app's window takes the update window's place.
  static Future<void> _opening() async {
    splash.value = SplashStatus(tr('desktop.update.starting', 'Starting…'));
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }

  /// SGBUS_SPLASH_DEMO=1: every step with made-up numbers, for seeing the window without a
  /// release. Later works as it does for real.
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
