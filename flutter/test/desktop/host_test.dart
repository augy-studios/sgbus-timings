// Where a shared screen's link goes on the desktop (lib/desktop/host.dart, desktop-features-spec
// §11): the site's own pages in the app, web pages and mailto: outside it, and nothing else at all,
// as some links come from the server.
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/desktop/host.dart';

void main() {
  test("the site's # addresses and short links open in the app", () {
    expect(DesktopHost.opensInApp('https://sgbus.uwuapps.org/#84009'), isTrue);
    expect(DesktopHost.opensInApp('https://sgbus.uwuapps.org/go/k3v9q2x7ma'), isTrue);
    expect(DesktopHost.opensInApp('https://sgbus.uwuapps.org/'), isFalse);
    expect(DesktopHost.opensInApp('http://sgbus.uwuapps.org/#84009'), isFalse);
    expect(DesktopHost.opensInApp('https://example.org/#84009'), isFalse);
  });

  test('web pages and mailto: may open outside the app', () {
    expect(DesktopHost.opensOutside('https://www.lta.gov.sg/content/ltagov/en/newsroom.html'), isTrue);
    expect(DesktopHost.opensOutside('http://example.org/a?b=c'), isTrue);
    expect(DesktopHost.opensOutside('HTTPS://EXAMPLE.ORG/'), isTrue);
    expect(DesktopHost.opensOutside('mailto:hello@uwuapps.org'), isTrue);
  });

  test('anything else is never handed to the system', () {
    for (final url in [
      '',
      '-a',
      '--help',
      ' https://example.org/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ms-settings:privacy-location',
      'x-apple.systempreferences:com.apple.preference.security',
      'smb://server/share',
      'https:',
      'https:///path-only',
      'mailto:',
      'example.org',
    ]) {
      expect(DesktopHost.opensOutside(url), isFalse, reason: url);
    }
  });
}
