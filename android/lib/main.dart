import 'package:flutter/material.dart';

import 'native/native_bridge.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Native.start();
  runApp(const MaterialApp(home: Scaffold(body: Center(child: Text('SG Bus Timings')))));
}
