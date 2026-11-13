// The flag-down screen (the site's js/flag.js): a bus's number as big as the screen allows, white
// on black, to hold up at a dark stop so its captain sees which bus you want. The screen stays on
// at full brightness, and the torch can be turned on, steady (SgBusPlugin.flag). Never a strobe:
// flashing it at a driver would dazzle them.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/nav.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';

class FlagScreen extends StatefulWidget {
  const FlagScreen({super.key, required this.no});
  final String no;

  static void open(String no) => AppNav.push(FlagScreen(no: no), name: 'flag');

  @override
  State<FlagScreen> createState() => _FlagScreenState();
}

class _FlagScreenState extends State<FlagScreen> with WidgetsBindingObserver {
  bool _hasTorch = false;
  bool _torch = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _flag();
  }

  Future<void> _flag() async {
    if (!Native.has('flag')) return;
    try {
      final r = await Native.call('SgBus', 'flag', {'on': true, 'torch': _torch});
      if (mounted) setState(() => _hasTorch = r?['torch'] == true);
    } on NativeError {
      // No brightness or torch: the number still shows.
    }
  }

  // Away and back: the app turned the torch off as it went.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _flag();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    if (Native.has('flag')) Native.call('SgBus', 'flag', {'on': false}).catchError((_) => null);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Column(children: [
            Expanded(
              child: Center(
                child: FittedBox(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(widget.no, style: const TextStyle(color: Colors.white, fontSize: 400, fontWeight: FontWeight.w900, height: 1)),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (_hasTorch)
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: _torch ? Colors.white : Colors.white24, foregroundColor: _torch ? Colors.black : Colors.white),
                    onPressed: () {
                      setState(() => _torch = !_torch);
                      _flag();
                    },
                    icon: const Icon(Icons.flashlight_on_outlined),
                    label: Text(tr('html.torch', 'Torch')),
                  ),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close),
                  label: Text(tr('bug.close', 'Close')),
                ),
              ]),
            ),
          ]),
        ),
      );
}
