// The greeting at the top of Glance and Bus timings (script.js's updateGreeting): Good Morning, Afternoon or
// Evening with your name (sgbus_name), and on your birthday (sgbus_birthday) Happy 25th Birthday
// over two lines, with "Made with ♥ by Augy" under it.
import 'dart:async';

import 'package:flutter/material.dart';

import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';

class Greeting extends StatefulWidget {
  const Greeting({super.key});

  static String greeting(DateTime now) {
    if (now.hour < 12) return tr('greeting.morning', 'Good Morning');
    if (now.hour < 18) return tr('greeting.afternoon', 'Good Afternoon');
    return tr('greeting.evening', 'Good Evening');
  }

  static bool isBirthday(DateTime now) {
    final b = Store.I.get('sgbus_birthday') ?? '';
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(b)) return false;
    return int.parse(b.substring(5, 7)) == now.month && int.parse(b.substring(8, 10)) == now.day;
  }

  static String ordinal(int n) {
    final teen = n % 100 >= 11 && n % 100 <= 13;
    final end = teen ? 'th' : const {1: 'st', 2: 'nd', 3: 'rd'}[n % 10] ?? 'th';
    return '$n$end';
  }

  static int? age(DateTime now) {
    final year = int.tryParse((Store.I.get('sgbus_birthday') ?? '').split('-').first);
    final a = year == null ? null : now.year - year;
    return a != null && a >= 1 && a <= 130 ? a : null;
  }

  @override
  State<Greeting> createState() => _GreetingState();
}

class _GreetingState extends State<Greeting> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final now = When.now();
    final name = Store.I.get('sgbus_name') ?? '';
    String text;
    if (Greeting.isBirthday(now)) {
      final a = Greeting.age(now);
      final wish = a != null
          ? tr('greet.birthdayAge', 'Happy {nth} Birthday', {'nth': I18n.I.lang == 'en' ? Greeting.ordinal(a) : a})
          : tr('greet.birthday', 'Happy Birthday');
      text = name.isNotEmpty ? '$wish,\n$name!' : '$wish!';
    } else {
      final g = Greeting.greeting(now);
      text = name.isNotEmpty ? '$g, $name!' : '$g!';
    }
    final made = tr('tray.header3', 'Made with ❤️ by {creator}', {'creator': 'Augy'}).split('❤️');
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Semantics(header: true, child: Text(text, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w600))),
      const SizedBox(height: 2),
      Text.rich(
        TextSpan(style: TextStyle(color: sg.muted, fontSize: 13), children: [
          TextSpan(text: made.first),
          if (made.length > 1) WidgetSpan(alignment: PlaceholderAlignment.middle, child: Icon(Icons.favorite, size: 14, color: sg.error)),
          if (made.length > 1) TextSpan(text: made[1]),
        ]),
      ),
    ]);
  }
}
