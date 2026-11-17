// The app's version in Dart (lib/app/version.dart: the desktop updater, bug reports and the title
// bar use it) must be pubspec.yaml's version name, which Android and the desktop builds take, so
// raising one without the other fails here.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/version.dart';

void main() {
  test('version.dart matches pubspec.yaml', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final name = RegExp(r'^version:\s*([^\s+]+)', multiLine: true).firstMatch(pubspec)?[1];
    expect(appVersion, name);
  });
}
