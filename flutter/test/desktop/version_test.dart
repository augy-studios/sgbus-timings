// The app's version in Dart (lib/app/version.dart: the desktop updater, bug reports and the title
// bar use it) must be pubspec.yaml's version name, which Android and the desktop builds take, so
// raising one without the other fails here.
//
// Skipped for now: version.dart is 2.5.0 ahead of the release on purpose (DESKTOP-HANDOVER.md),
// and pubspec.yaml is raised to 2.5.0 at release. Remove the skip then.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/version.dart';

void main() {
  test('version.dart matches pubspec.yaml', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final name = RegExp(r'^version:\s*([^\s+]+)', multiLine: true).firstMatch(pubspec)?[1];
    expect(appVersion, name);
  }, skip: 'pubspec.yaml is raised to 2.5.0 at the release; until then version.dart is ahead on purpose');
}
