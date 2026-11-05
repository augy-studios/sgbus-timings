import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/timings/stop_screen.dart';

import 'harness.dart';

void main() {
  setUpAll(loadFonts);

  testWidgets('stop', timeout: const Timeout(Duration(minutes: 3)), (t) async {
    await t.runAsync(() => stillData(state: {'sgbus_favs_v2': '[{"code":"84009","name":"Bedok Int"}]', 'sgbus_fav_buses': '["14"]'}));
    await shot(t, 'stop', () => const StopScreen(code: '84009'));
    await shot(t, 'stop-usual', () => const StopScreen(code: '84009'), material: false);
    await shot(t, 'stop-dark', () => const StopScreen(code: '84009'), brightness: Brightness.dark);
  });
}
