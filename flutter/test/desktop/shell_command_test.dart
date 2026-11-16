// The desktop title bar's command bar: what it takes for an address (opened in the app, or in the
// browser), another UwU app's link, or words to search for, as the Electron app's address bar did
// (desktop/main.js's typedAddress) and desktop-features-spec §5 says (app/links.dart's read).
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/app/links.dart';

void main() {
  const site = 'https://sgbus.uwuapps.org';

  /// What the bar makes of [typed].
  CommandInput read(String typed) => Links.read(typed);

  group('opened in the app', () {
    final cases = {
      '$site/#84009': '$site/#84009',
      '  $site/#bus/22  ': '$site/#bus/22',
      'sgbus.uwuapps.org/#bus/22': '$site/#bus/22',
      'http://sgbus.uwuapps.org/#84009': '$site/#84009', // typed http:// is upgraded to https://
      '/#84009': '$site/#84009',
      '#bus/22': '$site/#bus/22',
      '#nav': '$site/#nav',
      '$site/': '$site/',
      '$site/go/k3v9q2x7ma': '$site/go/k3v9q2x7ma',
      'uwu://sgbus/': '$site/',
      'uwu://sgbus/84009': '$site/#84009',
      'UWU://SGBUS/bus/22': '$site/#bus/22',
      'uwu://sgbus/go/k3v9q2x7ma': '$site/go/k3v9q2x7ma',
      'uwu://sgbus/map/84009': '$site/#map/84009',
    };
    cases.forEach((typed, url) {
      test(typed.trim(), () => expect(read(typed), CommandInput(InputKind.inApp, url)));
    });
  });

  group('opened in the browser', () {
    final cases = {
      'https://example.com/a?b=1': 'https://example.com/a?b=1',
      'example.com': 'https://example.com',
      'www.lta.gov.sg/content/ltagov/en.html': 'https://www.lta.gov.sg/content/ltagov/en.html',
      // A page of the site the app has no screen for.
      '$site/privacy.html': '$site/privacy.html',
      '10.0.0.1': 'https://10.0.0.1',
      'http://[::1]:8080/': 'http://[::1]:8080/',
      'http://[::ffff:10.0.0.1]': 'http://[::ffff:10.0.0.1]',
    };
    cases.forEach((typed, url) {
      test(typed, () => expect(read(typed), CommandInput(InputKind.browser, url)));
    });
  });

  test("another UwU app's link is handed to it", () {
    expect(read('uwu://weather/today'), const CommandInput(InputKind.otherApp, 'uwu://weather/today'));
  });

  group('searched for', () {
    // A stop's code, a bus number and a stop's name are words, not addresses (84009 would
    // otherwise be taken as an IP address), and nor is another kind of link.
    // Words with a dot in them, numbers with one, and coordinates aren't sites either.
    for (final typed in ['84009', '22', 'bedok int', 'Opp Blk 123', 'ftp://example.com', 'example.com with words', 'a.b c', '1.5', '1.3521,103.8198', 'uwu://we ather/x']) {
      test(typed, () => expect(read(typed), CommandInput(InputKind.search, typed)));
    }
  });

  test('nothing typed', () {
    expect(read(''), const CommandInput(InputKind.empty, ''));
    expect(read('   '), const CommandInput(InputKind.empty, ''));
  });
}
