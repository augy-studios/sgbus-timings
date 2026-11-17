// The desktop updater's own logic (lib/desktop/updater.dart): reading the update files, which
// file each install picks from them, comparing versions, telling how the app was installed, and
// refusing a download whose SHA-512 doesn't match (from a small server the test runs itself).
// The update files are the Electron app's real 2.4.8 ones, as published on release
// android-v2.4.11, so the parser reads what electron-builder wrote; installers/update-files.mjs
// writes the same form, without blockMapSize.
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/updater.dart';

const _latestWindows = '''
version: 2.4.8
files:
  - url: sg-bus-timings-2.4.8-setup.exe
    sha512: 3QAT6uW60E0Or1OL1mEnMulHDYLAxOPYgR17FpO3aurCz2fV/msdxdfSpge0YFJiGxGgcfnKiZybCdgb/ngG3w==
    size: 216934720
path: sg-bus-timings-2.4.8-setup.exe
sha512: 3QAT6uW60E0Or1OL1mEnMulHDYLAxOPYgR17FpO3aurCz2fV/msdxdfSpge0YFJiGxGgcfnKiZybCdgb/ngG3w==
releaseDate: '2026-11-09T17:50:48.413Z'
''';

const _latestMac = '''
version: 2.4.8
files:
  - url: sg-bus-timings-2.4.8-mac-x64.zip
    sha512: aeMjmAWHbicmWbk89GuZEqpxClBytb2l9z0XdwP6Bwmk4dpmR1V6hbHG/z52THBAId0/8Pih4ur8Or+paxBMng==
    size: 134266860
  - url: sg-bus-timings-2.4.8-mac-arm64.zip
    sha512: zNt6E54S8Olxt5kQ7ZL+pkWU/nYigy/jN1Ia8fEqFeLZ1ebdrYeTMPzvjtfvMaNIx9R3OT759GKxbWkyAjf1NQ==
    size: 127400162
  - url: sg-bus-timings-2.4.8-mac-x64.dmg
    sha512: 1XKVLVnFThXSAsiE1/luSKGbqT2SeGFZrm0I2EwLJtf/uyROqUK3SGWm8WuX2tdZktgKZOkWXWoO7s0ePoK2lA==
    size: 134367447
  - url: sg-bus-timings-2.4.8-mac-arm64.dmg
    sha512: n+HWntw8sI4FaZ2Qq+NmSYh//u9RX/o9Xt7YvvyMMYKZwM4OTGBD4KQVAMkJmtAaObgXLhN2J3TY7kAf41rCXw==
    size: 127559290
path: sg-bus-timings-2.4.8-mac-x64.zip
sha512: aeMjmAWHbicmWbk89GuZEqpxClBytb2l9z0XdwP6Bwmk4dpmR1V6hbHG/z52THBAId0/8Pih4ur8Or+paxBMng==
releaseDate: '2026-11-09T17:49:20.957Z'
''';

const _latestLinux = '''
version: 2.4.8
files:
  - url: sg-bus-timings-2.4.8-x86_64.AppImage
    sha512: Ub+/KpYfNY85x55BFc16ysF2loiGb2GmfSOKLln4l/huWwCU7JHmcaKGED4H6j93xHK28bhxvljF9nZWt9okuw==
    size: 125707544
    blockMapSize: 132396
  - url: sg-bus-timings-2.4.8-amd64.deb
    sha512: +UW1SI77qk2QzunV8SVef87iYwSiQNo059wRKtTN2wOZRL680tzXT1n50LqMHHHLrckHUPweRcCIibkvznQMdQ==
    size: 100574320
  - url: sg-bus-timings-2.4.8-x86_64.rpm
    sha512: mBmYcyIjBvTDdgFManqle+5xw68x2VAznYaUv6P0AONJUXXazwPjCPZCARkpXWmq9oBEuF2T6Av/mlTAWOzAog==
    size: 89164852
path: sg-bus-timings-2.4.8-x86_64.AppImage
sha512: Ub+/KpYfNY85x55BFc16ysF2loiGb2GmfSOKLln4l/huWwCU7JHmcaKGED4H6j93xHK28bhxvljF9nZWt9okuw==
releaseDate: '2026-11-09T17:51:05.854Z'
''';

const _latestLinuxArm64 = '''
version: 2.4.8
files:
  - url: sg-bus-timings-2.4.8-arm64.AppImage
    sha512: rb7QDYk3sJCfX9uj6pBNFnY0KyzzPJK/ZhtrOOWcx/fV6XCQYhwByr+LBvXO0Igs4+TDS0iLLmBJGUfcs6KXgg==
    size: 126962787
    blockMapSize: 133039
  - url: sg-bus-timings-2.4.8-arm64.deb
    sha512: 6QZvjhezaX1/xXk53EZMnfpjANiSxDYOS6xU66EsPWSC8lCLytpKwKlQDSMikjSxXhzWl8OGn7fT+4iRFx17Ng==
    size: 95598196
  - url: sg-bus-timings-2.4.8-aarch64.rpm
    sha512: 7yJwg68IKW8WpIa8WWUJewNL4T20F7pIw8bN6TfGyl7dJ1R9ApMJJar/NjTvZKzeUoz+hNHKSdF4GmJHmuRDhg==
    size: 84596292
path: sg-bus-timings-2.4.8-arm64.AppImage
sha512: rb7QDYk3sJCfX9uj6pBNFnY0KyzzPJK/ZhtrOOWcx/fV6XCQYhwByr+LBvXO0Igs4+TDS0iLLmBJGUfcs6KXgg==
releaseDate: '2026-11-09T17:51:05.854Z'
''';

/// Runs InstallKind.detect with a pretend computer: the files in [files] exist, the folders in
/// [writable] can be written to.
InstallKind _detect(
  String os,
  String executable, {
  Map<String, String> environment = const {},
  bool fromSource = false,
  Set<String> files = const {},
  Set<String> writable = const {},
  String? allUsersFolder,
}) {
  return InstallKind.detect(
    os: os,
    executable: executable,
    environment: environment,
    fromSource: fromSource,
    exists: files.contains,
    writable: writable.contains,
    allUsersFolder: allUsersFolder,
  );
}

void main() {
  group('UpdateInfo.parse', () {
    test('Windows takes the one .exe, for x64 and Arm64 alike', () {
      final info = UpdateInfo.parse(_latestWindows, extension: '.exe')!;
      expect(info.version, '2.4.8');
      expect(info.file, 'sg-bus-timings-2.4.8-setup.exe');
      expect(info.sha512, '3QAT6uW60E0Or1OL1mEnMulHDYLAxOPYgR17FpO3aurCz2fV/msdxdfSpge0YFJiGxGgcfnKiZybCdgb/ngG3w==');
      expect(info.size, 216934720);
    });

    test("a Mac takes its own processor's .zip, never a .dmg", () {
      final arm = UpdateInfo.parse(_latestMac, extension: '.zip', arm64: true)!;
      expect(arm.file, 'sg-bus-timings-2.4.8-mac-arm64.zip');
      expect(arm.sha512, startsWith('zNt6E54S8Olxt5kQ'));
      expect(arm.size, 127400162);

      final intel = UpdateInfo.parse(_latestMac, extension: '.zip', arm64: false)!;
      expect(intel.file, 'sg-bus-timings-2.4.8-mac-x64.zip');
      expect(intel.size, 134266860);
    });

    test('Linux takes the AppImage from its processor\'s file, not the .deb or .rpm', () {
      expect(UpdateInfo.parse(_latestLinux, extension: '.AppImage')!.file, 'sg-bus-timings-2.4.8-x86_64.AppImage');
      final arm = UpdateInfo.parse(_latestLinuxArm64, extension: '.AppImage')!;
      expect(arm.file, 'sg-bus-timings-2.4.8-arm64.AppImage');
      expect(arm.size, 126962787);
    });

    test('nothing to take: not an update file, or no file of that kind', () {
      expect(UpdateInfo.parse('<html>Not Found</html>', extension: '.exe'), isNull);
      expect(UpdateInfo.parse('version: [', extension: '.exe'), isNull);
      expect(UpdateInfo.parse('files: []', extension: '.exe'), isNull);
      expect(UpdateInfo.parse(_latestWindows, extension: '.zip'), isNull);
      expect(UpdateInfo.parse(_latestMac, extension: '.exe'), isNull);
    });

    test('only a plain file name is taken, never a path', () {
      for (final name in ['../sg-bus-timings-2.5.0-setup.exe', 'x/sg-bus-timings-2.5.0-setup.exe', r'x\sg-bus-timings-2.5.0-setup.exe', 'https://example.com/a.exe']) {
        final yml = 'version: 2.5.0\nfiles:\n  - url: $name\n    sha512: abc==\n    size: 1\n';
        expect(UpdateInfo.parse(yml, extension: '.exe'), isNull, reason: name);
      }
    });

    test('the oldest form, with only path and sha512, still reads', () {
      const old = 'version: 2.0.1\npath: sg-bus-timings-2.0.1-setup.exe\nsha512: abc==\n';
      final info = UpdateInfo.parse(old, extension: '.exe')!;
      expect(info.file, 'sg-bus-timings-2.0.1-setup.exe');
      expect(info.sha512, 'abc==');
      expect(info.size, 0);
    });
  });

  group('Updater.newer', () {
    test('compares number by number', () {
      expect(Updater.newer('2.5.0', '2.4.11'), isTrue);
      expect(Updater.newer('2.10.0', '2.9.9'), isTrue);
      expect(Updater.newer('3.0.0', '2.99.99'), isTrue);
      expect(Updater.newer('2.4.11', '2.5.0'), isFalse);
    });

    test('the same version is not newer', () {
      expect(Updater.newer('2.5.0', '2.5.0'), isFalse);
      expect(Updater.newer('2.5', '2.5.0'), isFalse);
    });

    test('a build number or label after - or + is ignored', () {
      expect(Updater.newer('2.5.0+42', '2.5.0'), isFalse);
      expect(Updater.newer('2.5.1-beta', '2.5.0'), isTrue);
    });
  });

  group('Updater.download', () {
    late HttpServer server;
    final installer = utf8.encode('pretend installer ' * 1000);
    const name = 'sg-bus-timings-9.9.9-setup.exe';

    setUp(() async {
      // Serves the pretend installer at /<name>, as the release's download address would.
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) {
        if (request.uri.path == '/$name') {
          request.response.add(installer);
        } else {
          request.response.statusCode = HttpStatus.notFound;
        }
        request.response.close();
      });
    });

    tearDown(() => server.close(force: true));

    String base() => 'http://${server.address.address}:${server.port}';

    test('a download with the right SHA-512 is kept, in a folder only this person can open', () async {
      final sha = base64.encode(sha512.convert(installer).bytes);
      final file = await Updater.download(UpdateInfo(version: '9.9.9', file: name, sha512: sha, size: installer.length), base: base());
      expect(file.readAsBytesSync(), installer);
      expect(file.parent.path.split(Platform.pathSeparator).last, startsWith('sgbus-timings-update'));
      if (!Platform.isWindows) expect(file.parent.statSync().modeString(), 'rwx------');
      file.parent.deleteSync(recursive: true);
    });

    test('a download with the wrong SHA-512 is refused and not left on disk', () async {
      final wrong = base64.encode(sha512.convert(utf8.encode('something else')).bytes);
      File? kept;
      await expectLater(
        Updater.download(UpdateInfo(version: '9.9.9', file: name, sha512: wrong, size: installer.length), base: base(), progress: (_, _) {}).then((f) => kept = f),
        throwsA(isA<FormatException>()),
      );
      expect(kept, isNull);
      final left = Directory.systemTemp.listSync().whereType<Directory>().where((d) => d.path.split(Platform.pathSeparator).last.startsWith('sgbus-timings-update'));
      expect(left.where((d) => File('${d.path}${Platform.pathSeparator}$name').existsSync()), isEmpty);
    });
  });

  group('InstallKind.detect', () {
    const winExe = r'C:\Users\augy\AppData\Local\Programs\SG Bus Timings\SG Bus Timings.exe';
    const macExe = '/Applications/SG Bus Timings.app/Contents/MacOS/SG Bus Timings';

    test("Windows: the .exe installer's uninstaller beside the app, or the .msi without one", () {
      const folder = r'C:\Users\augy\AppData\Local\Programs\SG Bus Timings';
      final kind = _detect('windows', winExe, files: {'$folder\\Uninstall SG Bus Timings.exe'}, writable: {folder});
      expect(kind, InstallKind.windowsExe);
      expect(kind.canInstall, isTrue);

      final msi = _detect('windows', winExe, writable: {r'C:\Users\augy\AppData\Local\Programs\SG Bus Timings'});
      expect(msi, InstallKind.windowsMsi);
      expect(msi.canInstall, isFalse);
    });

    test('Windows, for all users: only tells, even where the folder can be written to', () {
      const folder = r'C:\Program Files\SG Bus Timings';
      const exe = '$folder\\SG Bus Timings.exe';
      const files = {'$folder\\Uninstall SG Bus Timings.exe'};
      final kind = _detect('windows', exe, files: files);
      expect(kind, InstallKind.windowsAllUsers);
      expect(kind.canInstall, isFalse, reason: "no administrator prompt at every start, and no app lost if it's refused");

      // Program Files made writable (by an organisation, or an administrator running it): still
      // tell-only, found by the folder it's in.
      const programFiles = {'ProgramFiles': r'C:\Program Files', 'ProgramW6432': r'C:\Program Files'};
      expect(_detect('windows', exe, files: files, writable: {folder}, environment: programFiles), InstallKind.windowsAllUsers);

      // Or by the folder an all-users install recorded under HKEY_LOCAL_MACHINE, wherever it is.
      const other = r'D:\Apps\SG Bus Timings';
      expect(
        _detect('windows', '$other\\SG Bus Timings.exe', files: {'$other\\Uninstall SG Bus Timings.exe'}, writable: {other}, allUsersFolder: r'd:\apps\sg bus timings\'),
        InstallKind.windowsAllUsers,
      );

      // A per-user copy with the same environment is still the person's own.
      const own = r'C:\Users\augy\AppData\Local\Programs\SG Bus Timings';
      expect(
        _detect('windows', '$own\\SG Bus Timings.exe', files: {'$own\\Uninstall SG Bus Timings.exe'}, writable: {own}, environment: programFiles, allUsersFolder: folder),
        InstallKind.windowsExe,
      );
    });

    test('Linux: an AppImage it can replace, or the .deb/.rpm', () {
      const appImage = '/home/augy/Apps/sg-bus-timings-2.5.0-x86_64.AppImage';
      final kind = _detect('linux', '/tmp/.mount_sgbusX/usr/lib/sgbus-timings/sgbus-timings', environment: {'APPIMAGE': appImage}, writable: {'/home/augy/Apps'});
      expect(kind, InstallKind.appImage);
      expect(kind.canInstall, isTrue);

      // An AppImage in a folder only root can change can't be replaced: told only.
      expect(_detect('linux', '/tmp/.mount_x/sgbus-timings', environment: {'APPIMAGE': '/opt/apps/sgbus.AppImage'}), InstallKind.linuxPackage);

      final deb = _detect('linux', '/opt/SG Bus Timings/sgbus-timings');
      expect(deb, InstallKind.linuxPackage);
      expect(deb.canInstall, isFalse);
    });

    test('macOS: an app in a folder it can write to updates itself', () {
      final kind = _detect('macos', macExe, writable: {'/Applications/SG Bus Timings.app', '/Applications'});
      expect(kind, InstallKind.macWritable);
      expect(kind.canInstall, isTrue);
    });

    test('macOS: on its disk image, translocated, or read-only, it only tells', () {
      expect(_detect('macos', '/Volumes/SG Bus Timings/SG Bus Timings.app/Contents/MacOS/SG Bus Timings', writable: {'/Volumes/SG Bus Timings/SG Bus Timings.app', '/Volumes/SG Bus Timings'}), InstallKind.macReadOnly);
      const translocated = '/private/var/folders/x/AppTranslocation/1234/d/SG Bus Timings.app';
      expect(_detect('macos', '$translocated/Contents/MacOS/SG Bus Timings', writable: {translocated, '/private/var/folders/x/AppTranslocation/1234/d'}), InstallKind.macReadOnly);
      // Installed by an admin: the app or its folder can't be changed by this person.
      expect(_detect('macos', macExe, writable: {'/Applications'}), InstallKind.macReadOnly);
      expect(_detect('macos', macExe, writable: {'/Applications/SG Bus Timings.app'}), InstallKind.macReadOnly);
      expect(InstallKind.macReadOnly.canInstall, isFalse);
    });

    test('run from source, nothing is installed', () {
      final kind = _detect('windows', winExe, fromSource: true, files: {r'C:\Users\augy\AppData\Local\Programs\SG Bus Timings\Uninstall SG Bus Timings.exe'}, writable: {r'C:\Users\augy\AppData\Local\Programs\SG Bus Timings'});
      expect(kind, InstallKind.fromSource);
      expect(kind.canInstall, isFalse);
    });
  });

  // "Couldn't check for updates" says what went wrong, from a small server answering as GitHub
  // might, not always "check your connection".
  group('Updater.find', () {
    late HttpServer server;
    var status = HttpStatus.ok;
    var body = '';

    // Every computer's installer, so the check finds this one's wherever the test runs.
    const everyone = '''
version: 99.0.0
files:
  - url: sg-bus-timings-99.0.0-setup.exe
    sha512: c2hh
  - url: sg-bus-timings-99.0.0-mac-x64.zip
    sha512: c2hh
  - url: sg-bus-timings-99.0.0-mac-arm64.zip
    sha512: c2hh
  - url: sg-bus-timings-99.0.0-x86_64.AppImage
    sha512: c2hh
  - url: sg-bus-timings-99.0.0-arm64.AppImage
    sha512: c2hh
''';

    setUp(() async {
      status = HttpStatus.ok;
      body = everyone;
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) {
        request.response.statusCode = status;
        request.response.write(body);
        request.response.close();
      });
    });

    tearDown(() => server.close(force: true));

    String base() => 'http://${server.address.address}:${server.port}';

    Future<UpdateCheckError> failure() async {
      try {
        await Updater.find(base: base());
      } on UpdateCheckError catch (e) {
        return e;
      }
      fail('the check should have failed');
    }

    test('a newer version is found', () async {
      expect((await Updater.find(base: base()))?.version, '99.0.0');
    });

    test('no update file on the release yet: not ready, not the connection', () async {
      status = HttpStatus.notFound;
      final e = await failure();
      expect(e.problem, UpdateProblem.notReady);
      expect(e.message, contains("isn't ready for this computer"));
      expect(e.message, isNot(contains('connection')));
    });

    test("an update file without this computer's installer: not ready", () async {
      body = 'version: 99.0.0\nfiles:\n  - url: sg-bus-timings-99.0.0.msi\n    sha512: c2hh\n';
      expect((await failure()).problem, UpdateProblem.notReady);
    });

    test('GitHub turning checks away, or down, says so with its error', () async {
      status = HttpStatus.tooManyRequests;
      expect((await failure()).problem, UpdateProblem.limited);
      status = HttpStatus.forbidden;
      expect((await failure()).problem, UpdateProblem.limited);
      status = HttpStatus.serviceUnavailable;
      final e = await failure();
      expect(e.problem, UpdateProblem.github);
      expect(e.message, contains('503'));
      status = HttpStatus.gone;
      expect((await failure()).message, contains('410'));
    });

    test('GitHub not reached: the connection', () async {
      final port = server.port;
      await server.close(force: true);
      try {
        await Updater.find(base: 'http://127.0.0.1:$port');
        fail('the check should have failed');
      } on UpdateCheckError catch (e) {
        expect(e.problem, UpdateProblem.offline);
        expect(e.message, contains('connection'));
      }
    });

    test('anything else thrown still has a message', () {
      expect(UpdateCheckError.of(StateError('?')).message, isNotEmpty);
    });
  });
}
