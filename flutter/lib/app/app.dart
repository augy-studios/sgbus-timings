// The app: its look (theme/theme.dart) and language (i18n/i18n.dart), redrawn as either changes,
// the main screen (app/shell.dart), and what it was opened with (app/links.dart). In the desktop
// app it's wrapped in the desktop's window chrome (desktop/chrome.dart): the title bar, the
// navigation rail, the split panes, the menu bar and the keyboard shortcuts; its tooltips wait
// 400 ms under the mouse, and on Windows and Linux lists scroll as theirs do
// (desktop/adaptive.dart).
import 'dart:async';

import 'package:cupertino_ui/cupertino_ui.dart' show GlobalCupertinoLocalizations;
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
// Flutter 3.50: the Material and Cupertino delegates come from material_ui and cupertino_ui.
import 'package:flutter_localizations/flutter_localizations.dart' show GlobalWidgetsLocalizations;

import '../desktop/adaptive.dart';
import '../desktop/chrome.dart';
import '../desktop/desk_theme.dart';
import '../desktop/desktop.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import '../theme/theme.dart';
import 'links.dart';
import 'nav.dart';
import 'shell.dart';
import '../features/misc/magic_cup.dart';

/// The whole app, the same on Android and the desktop.
class SgBusApp extends StatefulWidget {
  const SgBusApp({super.key, required this.pages});
  final Map<String, Widget Function()> pages;

  @override
  State<SgBusApp> createState() => _SgBusAppState();
}

/// Follows the look, the language, links opened and the app coming back to the front.
class _SgBusAppState extends State<SgBusApp> with WidgetsBindingObserver {
  NativeListener? _open;
  NativeListener? _language;

  /// Starts following the look, the language and the app coming back, and, once the first
  /// frame's up, the links the app's opened with and the language Android's settings pick.
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    AppLook.I.addListener(_redraw);
    I18n.I.addListener(_newLanguage);
    // Links the app's opened with, now and later, once the first frame's up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _open = Native.on('SgBus', 'open', (d) {
        final url = d['url'];
        if (url is String) Links.open(url);
      });
      // The app's language set in Android's settings: the app follows.
      _language = Native.on('SgBus', 'language', (d) {
        final tag = d['lang'] is String ? d['lang'] as String : '';
        if (tag.isEmpty) {
          if (I18n.I.chosen != null) MagicCup.run(change: () async => I18n.I.unset());
        } else {
          final code = I18n.match(tag);
          if (code != null && code != I18n.I.lang) {
            MagicCup.run(name: [for (final l in I18n.langs) if (l.code == code) l.name].firstOrNull, change: () => I18n.I.use(code));
          }
        }
      });
    });
  }

  /// Stops following them all.
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    AppLook.I.removeListener(_redraw);
    I18n.I.removeListener(_newLanguage);
    _open?.cancel();
    _language?.cancel();
    super.dispose();
  }

  /// The wallpaper's colours (or the desktop's accent colour) read again each time the app
  /// comes back, and the clock's light or dark checked.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      AppLook.I.readPhone();
      AppLook.I.changed();
      // The desktop's accent colour, in case it was changed meanwhile.
      if (Desktop.on) DeskTheme.refresh();
    }
  }

  /// The look changed: the app's drawn again in it.
  void _redraw() => setState(() {});

  /// A new language reaches every screen that's open, not only the one on top: a screen asks
  /// for its words as it's built, and those under it wouldn't be built again till you came back.
  void _newLanguage() {
    setState(() {});
    void redo(Element e) {
      e.markNeedsBuild();
      e.visitChildren(redo);
    }

    (context as Element).visitChildren(redo);
  }

  /// The app in its look and language, with the desktop's chrome around it on a computer.
  @override
  Widget build(BuildContext context) {
    final look = AppLook.I;
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 2.0,
      child: Builder(builder: (context) {
        final contrast = look.highContrast(context);
        return MaterialApp(
          title: 'SG Bus Timings',
          debugShowCheckedModeBanner: false,
          navigatorKey: AppNav.navigatorKey,
          // The desktop's title bar keeps its own history (desktop/chrome.dart).
          navigatorObservers: [if (Desktop.on) DeskChrome.observer],
          // Windows and Linux: scrolling as theirs (no Android glow, a scroll bar). macOS keeps
          // Flutter's own, which already scrolls as a Mac does.
          scrollBehavior: Desktop.on && !Desktop.mac ? const DeskScrollBehavior() : null,
          scaffoldMessengerKey: AppNav.messengerKey,
          theme: look.theme(Brightness.light, contrast: contrast),
          darkTheme: look.theme(Brightness.dark, contrast: contrast),
          themeMode: look.themeMode(),
          locale: I18n.I.current.locale,
          supportedLocales: [for (final l in I18n.langs) l.locale],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) {
            // The tooltips wrap the chrome too, so the title bar's and the rail's wait as well.
            if (Desktop.on) child = DeskTooltips(child: DeskChrome.wrap(context, child!));
            final dark = Theme.of(context).brightness == Brightness.dark;
            return AnnotatedRegion<SystemUiOverlayStyle>(
              value: (dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
                statusBarColor: Colors.transparent,
                systemNavigationBarColor: Colors.transparent,
              ),
              // The whole app, for a bug report's Screenshot a page, whose button floats over it
              // and so stays out of the picture; in picture-in-picture, what's wanted small
              // (features/misc/extras.dart).
              child: Stack(children: [
                Positioned.fill(
                  child: ValueListenableBuilder(
                    valueListenable: AppNav.pip,
                    builder: (context, small, _) => RepaintBoundary(key: AppNav.shotKey, child: (small ? AppNav.pipView?.call() : null) ?? child!),
                  ),
                ),
                ValueListenableBuilder(
                  valueListenable: AppNav.shooting,
                  builder: (context, on, _) => on && AppNav.shotBar != null ? AppNav.shotBar!() : const SizedBox.shrink(),
                ),
              ]),
            );
          },
          home: Shell(pages: widget.pages),
        );
      }),
    );
  }
}

/// Starts one of the app's timers that tick while it's open: [fn] every [d], until the
/// subscription is cancelled.
StreamSubscription<void> every(Duration d, void Function() fn) => Stream<void>.periodic(d).listen((_) => fn());
