// The app: its look (theme/theme.dart) and language (i18n/i18n.dart), redrawn as either changes,
// the main screen (app/shell.dart), and what it was opened with (app/links.dart).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../i18n/i18n.dart';
import '../native/native_bridge.dart';
import '../theme/theme.dart';
import 'links.dart';
import 'nav.dart';
import 'shell.dart';

class SgBusApp extends StatefulWidget {
  const SgBusApp({super.key, required this.pages});
  final Map<String, Widget Function()> pages;

  @override
  State<SgBusApp> createState() => _SgBusAppState();
}

class _SgBusAppState extends State<SgBusApp> with WidgetsBindingObserver {
  NativeListener? _open;
  NativeListener? _language;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    AppLook.I.addListener(_redraw);
    I18n.I.addListener(_redraw);
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
          if (I18n.I.chosen != null) I18n.I.unset();
        } else {
          final code = I18n.match(tag);
          if (code != null && code != I18n.I.lang) I18n.I.use(code);
        }
      });
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    AppLook.I.removeListener(_redraw);
    I18n.I.removeListener(_redraw);
    _open?.cancel();
    _language?.cancel();
    super.dispose();
  }

  // The wallpaper's colours read again each time the app comes back, and the clock's light or
  // dark checked.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      AppLook.I.readPhone();
      AppLook.I.changed();
    }
  }

  void _redraw() => setState(() {});

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
            final dark = Theme.of(context).brightness == Brightness.dark;
            return AnnotatedRegion<SystemUiOverlayStyle>(
              value: (dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
                statusBarColor: Colors.transparent,
                systemNavigationBarColor: Colors.transparent,
              ),
              // The whole app, for a bug report's Screenshot this page; in picture-in-picture,
              // what's wanted small (features/misc/extras.dart).
              child: ValueListenableBuilder(
                valueListenable: AppNav.pip,
                builder: (context, small, _) => RepaintBoundary(key: AppNav.shotKey, child: (small ? AppNav.pipView?.call() : null) ?? child!),
              ),
            );
          },
          home: Shell(pages: widget.pages),
        );
      }),
    );
  }
}

/// Starts the app's timers that tick while it's open, cancelled with the subscription.
StreamSubscription<void> every(Duration d, void Function() fn) => Stream<void>.periodic(d).listen((_) => fn());
