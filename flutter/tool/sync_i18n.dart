// Copies the site's words (main-site/i18n/*.json) into the app's assets, so the app says what the
// site says: run after the site's words change. test/i18n_test.dart checks they match.
import 'dart:io';

void main() {
  for (final f in Directory('../main-site/i18n').listSync().whereType<File>()) {
    f.copySync('assets/i18n/${f.uri.pathSegments.last}');
  }
  stdout.writeln('assets/i18n/ is the site\'s again');
}
