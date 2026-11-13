// The window the app opens with, as Discord's does (updater.dart, startup): its icon, and what
// it's doing, "Checking for updates…", "Downloading update" with a bar and Later, "Installing
// update…", "Starting…". Light or dark as the computer is, in its own colours. Dragged by
// anywhere, as it has no title bar. Drawn in the main window, made small for it.
import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../i18n/i18n.dart';
import 'updater.dart';

class SplashColors {
  const SplashColors(this.bg, this.ink, this.muted, this.track, this.fill, this.edge);
  final Color bg, ink, muted, track, fill, edge;
  static const light = SplashColors(Color(0xFFF3FAF1), Color(0xFF10200F), Color(0xFF4C5C49), Color(0xFFD4E8CD), Color(0xFF2E7D32), Color(0x14000000));
  static const dark = SplashColors(Color(0xFF1B221A), Color(0xFFEEF6EA), Color(0xFFA9B8A5), Color(0xFF34432F), Color(0xFF8FD18A), Color(0x14FFFFFF));
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, this.status, this.brightness});

  /// For the guide's screenshots: a fixed status and look.
  final SplashStatus? status;
  final Brightness? brightness;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _bob = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400));

  @override
  void initState() {
    super.initState();
    if (widget.status == null) _bob.repeat();
  }

  @override
  void dispose() {
    _bob.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = (widget.brightness ?? MediaQuery.platformBrightnessOf(context)) == Brightness.dark;
    final c = dark ? SplashColors.dark : SplashColors.light;
    final still = MediaQuery.disableAnimationsOf(context) || widget.status != null;
    return ValueListenableBuilder<SplashStatus>(
      valueListenable: Updater.splash,
      builder: (context, live, _) {
        final s = widget.status ?? live;
        final text = s.text == 'Starting…' ? tr('desktop.update.starting', 'Starting…') : s.text;
        return DragToMoveArea(
          child: Container(
            decoration: BoxDecoration(color: c.bg, border: Border.all(color: c.edge)),
            child: DefaultTextStyle(
              style: TextStyle(color: c.ink, fontSize: 15, fontWeight: FontWeight.w600, height: 1.35),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                AnimatedBuilder(
                  animation: _bob,
                  builder: (context, child) {
                    final t = still ? 0.0 : (1 - (2 * _bob.value - 1).abs());
                    final eased = Curves.easeInOut.transform(t);
                    return Transform.translate(offset: Offset(0, -6 * eased), child: Transform.scale(scale: 1 + .04 * eased, child: child));
                  },
                  child: ClipRRect(borderRadius: BorderRadius.circular(26), child: Image.asset('assets/desktop/icon.png', width: 92, height: 92, excludeFromSemantics: true)),
                ),
                const SizedBox(height: 28),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Semantics(liveRegion: true, child: Text(text, textAlign: TextAlign.center))),
                const SizedBox(height: 4),
                SizedBox(
                  height: 18,
                  child: Text(s.detail, style: TextStyle(color: c.muted, fontWeight: FontWeight.w500, fontSize: 13, fontFeatures: const [FontFeature.tabularFigures()])),
                ),
                const SizedBox(height: 12),
                Visibility(
                  visible: s.percent != null,
                  maintainSize: true,
                  maintainAnimation: true,
                  maintainState: true,
                  child: SizedBox(
                    width: 180,
                    height: 6,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: LinearProgressIndicator(
                        value: s.percent == null || s.percent! < 0 ? (still ? 0.35 : null) : s.percent! / 100,
                        backgroundColor: c.track,
                        color: c.fill,
                        minHeight: 6,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Visibility(
                  visible: s.later,
                  maintainSize: true,
                  maintainAnimation: true,
                  maintainState: true,
                  child: TextButton(
                    onPressed: Updater.later,
                    style: TextButton.styleFrom(foregroundColor: c.muted, shape: const StadiumBorder(), textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    child: Text(tr('desktop.update.later', 'Later')),
                  ),
                ),
              ]),
            ),
          ),
        );
      },
    );
  }
}
