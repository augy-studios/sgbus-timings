// The window the app opens with, as Discord's does (updater.dart, startup): its icon, and what
// it's doing, "Checking for updates…", "Downloading update" with a bar and Later, "Installing
// update…", "Starting…". Light or dark as the computer is, in its own colours. Dragged by
// anywhere, as it has no title bar. Drawn in the main window, made small for it
// (desktop_main.dart, splash), and again over the app for Restart to update.
import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../i18n/i18n.dart';
import 'updater.dart';

/// The update window's own colours, light and dark: a soft green, not the brand colour, as the
/// Electron app's splash.html had.
class SplashColors {
  const SplashColors(this.bg, this.ink, this.muted, this.track, this.fill, this.edge);

  /// The background, the main line's colour, the smaller line's, the bar's track, the bar's fill,
  /// and the hairline round the window.
  final Color bg, ink, muted, track, fill, edge;

  static const light = SplashColors(Color(0xFFF3FAF1), Color(0xFF10200F), Color(0xFF4C5C49), Color(0xFFD4E8CD), Color(0xFF2E7D32), Color(0x14000000));
  static const dark = SplashColors(Color(0xFF1B221A), Color(0xFFEEF6EA), Color(0xFFA9B8A5), Color(0xFF34432F), Color(0xFF8FD18A), Color(0x14FFFFFF));
}

/// The update window's screen. It follows Updater.splash as the check and download go, unless
/// it's given a fixed [status] (for the guide's screenshots).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, this.status, this.brightness});

  /// For the guide's screenshots: a fixed status, drawn still.
  final SplashStatus? status;

  /// For the guide's screenshots: light or dark whatever the computer is.
  final Brightness? brightness;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

/// Runs the icon's bob while the splash window is up.
class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  // The icon's gentle bob: up and a little bigger, then back, every 2.4 seconds.
  late final AnimationController _bob = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400));

  /// Starts the bob, unless this is a screenshot.
  @override
  void initState() {
    super.initState();
    if (widget.status == null) _bob.repeat();
  }

  /// Stops the bob with the window.
  @override
  void dispose() {
    _bob.dispose();
    super.dispose();
  }

  /// The window: the icon, the two lines, the bar and Later, centred, on its own background.
  @override
  Widget build(BuildContext context) {
    final dark = (widget.brightness ?? MediaQuery.platformBrightnessOf(context)) == Brightness.dark;
    final c = dark ? SplashColors.dark : SplashColors.light;
    // Still under the computer's "reduce motion", and in screenshots.
    final still = MediaQuery.disableAnimationsOf(context) || widget.status != null;
    return ValueListenableBuilder<SplashStatus>(
      valueListenable: Updater.splash,
      builder: (context, live, _) {
        final s = widget.status ?? live;
        return DragToMoveArea(
          child: Container(
            decoration: BoxDecoration(color: c.bg, border: Border.all(color: c.edge)),
            child: DefaultTextStyle(
              style: TextStyle(color: c.ink, fontSize: 15, fontWeight: FontWeight.w600, height: 1.35),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                _icon(still),
                const SizedBox(height: 28),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Semantics(liveRegion: true, child: Text(_text(s), textAlign: TextAlign.center))),
                const SizedBox(height: 4),
                SizedBox(
                  height: 18,
                  child: Text(s.detail, style: TextStyle(color: c.muted, fontWeight: FontWeight.w500, fontSize: 13, fontFeatures: const [FontFeature.tabularFigures()])),
                ),
                const SizedBox(height: 12),
                _keepingSpace(visible: s.percent != null, child: _bar(s, c, still)),
                const SizedBox(height: 18),
                _keepingSpace(visible: s.later, child: _laterButton(c)),
              ]),
            ),
          ),
        );
      },
    );
  }

  /// The main line. Updater.splash starts as a fixed "Starting…" (made before the app's words
  /// load), so that one is put into the app's language here.
  String _text(SplashStatus s) => s.text == 'Starting…' ? tr('desktop.update.starting', 'Starting…') : s.text;

  /// The app's icon, bobbing gently unless [still].
  Widget _icon(bool still) {
    return AnimatedBuilder(
      animation: _bob,
      builder: (context, child) {
        // 0 to 1 and back over each loop, eased at both ends.
        final t = still ? 0.0 : (1 - (2 * _bob.value - 1).abs());
        final eased = Curves.easeInOut.transform(t);
        return Transform.translate(offset: Offset(0, -6 * eased), child: Transform.scale(scale: 1 + .04 * eased, child: child));
      },
      child: ClipRRect(borderRadius: BorderRadius.circular(26), child: Image.asset('assets/desktop/icon.png', width: 92, height: 92, excludeFromSemantics: true)),
    );
  }

  /// The progress bar: how far the download is, or a moving bar while it can't tell (drawn part
  /// filled when [still]).
  Widget _bar(SplashStatus s, SplashColors c, bool still) {
    final percent = s.percent;
    final double? value;
    if (percent != null && percent >= 0) {
      value = percent / 100;
    } else {
      value = still ? 0.35 : null;
    }
    return SizedBox(
      width: 180,
      height: 6,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(3),
        child: LinearProgressIndicator(value: value, backgroundColor: c.track, color: c.fill, minHeight: 6),
      ),
    );
  }

  /// Later, under the bar while it downloads: opens the app now and leaves the download to finish.
  Widget _laterButton(SplashColors c) {
    return TextButton(
      onPressed: Updater.later,
      style: TextButton.styleFrom(foregroundColor: c.muted, shape: const StadiumBorder(), textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
      child: Text(tr('desktop.update.later', 'Later')),
    );
  }

  /// Shows [child] or leaves its space empty, so the window's lines don't jump as the bar and
  /// Later come and go.
  Widget _keepingSpace({required bool visible, required Widget child}) {
    return Visibility(visible: visible, maintainSize: true, maintainAnimation: true, maintainState: true, child: child);
  }
}
