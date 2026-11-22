// How the app looks. Two looks, picked in Settings, Theme:
//
//   Material You (the default, 2.4.0)  Material 3, as Android's own apps are: the phone's own
//            fonts (Google Sans on a Pixel, the maker's or the person's chosen font elsewhere),
//            solid tonal cards, pill buttons, sheets from the bottom, and the colours of the
//            phone's wallpaper on Android 12 and later (the app's green tonal palette before
//            that). Your colours' one colour or GTA VI's only when picked for it (app.youColours =
//            "yours" or "gta-6").
//            Only in the Android app, and no longer an Easter egg's secret: off is
//            APP_LOOK_KEY = "usual".
//   The UwU Apps theme  the site's: Jua, see-through glass cards on a soft background, in one
//            of the eight brand colours (sgbus.colorTheme) or Your colours (sgbus_colours).
//
// Either way light, dark or by the clock (sgbus.mode: light 09:00 to 18:00), and High contrast
// (sgbus_contrast: the phone's setting, on or off). Every screen takes its colours from
// SgColors, the site's tokens (style.css), so a screen reads the same in both looks.
//
// The desktop app (desktop/desk_theme.dart) starts in the UwU Apps theme, can paint the brand
// colour with the computer's accent colour (accentOverride), and uses compact controls
// (compact). In Material You's place it offers the computer's own look (deskStyle, deskLook):
//
//   Fluent 2 (Windows)       Mica behind the window (Acrylic where there's no Mica), Segoe UI,
//            4 px controls and 8 px cards, and a title bar of plain white or black.
//   macOS Tahoe (macOS)      the window's vibrancy behind Liquid Glass cards: see-through, blurred,
//            with a bright rim, capsule buttons and round corners, in the system font.
//   Frosted glass (Linux)    Deepin's and COSMIC's: frosted cards over a soft backdrop of the
//            accent colour, 8 px controls and 14 px cards, in the desktop's font.
//
// Each in the computer's accent colour (or Your colours, or GTA VI's, as Material You has them),
// light, dark or the system's. On Android none of these is ever set, so nothing changes there.
// CorePalette and Scheme: what DynamicColorPlugin hands back, and how Android's own palettes
// map to roles; their replacements take no CorePalette.
// ignore_for_file: deprecated_member_use
import 'package:dynamic_color/dynamic_color.dart' show DynamicColorPlugin;
import 'package:material_ui/material_ui.dart';
import 'package:material_color_utilities/material_color_utilities.dart' show CorePalette, Scheme;

import '../data/gta6.dart';
import '../data/store.dart';
import '../native/native_bridge.dart';
import 'colours.dart';

/// The site's colour tokens, as both looks have them.
@immutable
class SgColors extends ThemeExtension<SgColors> {
  const SgColors({
    required this.bg,
    required this.surface,
    required this.surfaceStrong,
    required this.border,
    required this.ink,
    required this.muted,
    required this.brand,
    required this.onBrand,
    required this.brandInk,
    required this.ok,
    required this.warn,
    required this.busy,
    required this.error,
    required this.tones,
    required this.glass,
    this.accents,
  });

  final Color bg;
  final Color surface;
  final Color surfaceStrong;
  final Color border;
  final Color ink;
  final Color muted;
  final Color brand;
  final Color onBrand;
  final Color brandInk;
  final Color ok; // seats available
  final Color warn; // standing room
  final Color busy; // limited standing
  final Color error;
  final List<Color> tones; // the ways a bus goes at a stop it calls at both ways
  final bool glass; // the UwU Apps theme's see-through cards
  final SgAccents? accents; // GTA VI's other colours; every other theme has the one brand colour

  // A colour to each kind of thing, which in every theme but GTA VI is the brand colour.

  /// What's picked, and the writing on it.
  Color get pick => accents?.pick ?? brand;
  Color get onPick => accents?.onPick ?? onBrand;

  /// The page you're on and what's switched on, and the writing on it.
  Color get tray => accents?.tray ?? brand;
  Color get onTray => accents?.onTray ?? onBrand;

  /// The bars across the top, and the writing on them.
  Color get bar => accents?.bar ?? brand;
  Color get onBar => accents?.onBar ?? onBrand;

  /// Codes and round icons, and the writing on them.
  Color get badge => accents?.badge ?? brand;
  Color get onBadge => accents?.onBadge ?? onBrand;

  /// Section labels.
  Color get heading => accents?.heading ?? muted;

  /// A bus number's colour, the same for that bus wherever it's shown.
  Color busInk(String no) {
    final inks = accents?.inks;
    return inks == null ? ink : inks[no.codeUnits.fold<int>(0, (a, b) => a + b) % inks.length];
  }

  /// A slice of the wheel: its colour and the colour on it, or null for the theme's own.
  (Color, Color)? slice(int i) {
    final all = accents?.slices;
    return all == null ? null : all[i % all.length];
  }

  /// A load's colour: SEA, SDA, LSD.
  Color load(String? l) => switch ((l ?? '').toUpperCase()) {
        'SEA' => ok,
        'SDA' => warn,
        'LSD' => busy,
        _ => muted,
      };

  @override
  SgColors copyWith({Color? brand, Color? onBrand, Color? brandInk, SgAccents? accents}) => SgColors(
        bg: bg, surface: surface, surfaceStrong: surfaceStrong, border: border, ink: ink, muted: muted,
        brand: brand ?? this.brand, onBrand: onBrand ?? this.onBrand, brandInk: brandInk ?? this.brandInk, ok: ok, warn: warn, busy: busy,
        error: error, tones: tones, glass: glass, accents: accents ?? this.accents,
      );

  @override
  SgColors lerp(covariant SgColors? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return SgColors(
      bg: l(bg, other.bg), surface: l(surface, other.surface), surfaceStrong: l(surfaceStrong, other.surfaceStrong),
      border: l(border, other.border), ink: l(ink, other.ink), muted: l(muted, other.muted), brand: l(brand, other.brand),
      onBrand: l(onBrand, other.onBrand), brandInk: l(brandInk, other.brandInk), ok: l(ok, other.ok), warn: l(warn, other.warn),
      busy: l(busy, other.busy), error: l(error, other.error),
      tones: [for (var i = 0; i < tones.length; i++) l(tones[i], other.tones[i])],
      glass: t < 0.5 ? glass : other.glass,
      accents: t < 0.5 ? accents : other.accents,
    );
  }
}

/// GTA VI's colours beyond its pink, a colour to each kind of thing (AppLook._gta6Dress).
@immutable
class SgAccents {
  const SgAccents({required this.heading, required this.inks});
  static const _on = Color(0xFF1D0030);
  static const _white = Colors.white;

  /// Orange for what's picked, yellow for what's on, blue for the bars, magenta for codes, each
  /// with the writing that reads on it.
  Color get pick => const Color(0xFFE6953E);
  Color get onPick => _on;
  Color get tray => const Color(0xFFFFBC24);
  Color get onTray => _on;
  Color get bar => const Color(0xFF2B60DA);
  Color get onBar => _white;
  Color get badge => const Color(0xFFBC0082);
  Color get onBadge => _white;
  final Color heading;
  final List<Color> inks;

  /// The wheel's slices, each colour with its writing.
  List<(Color, Color)> get slices => const [
        (Color(0xFFFF2B90), _on),
        (Color(0xFF2B60DA), _white),
        (Color(0xFFE6953E), _on),
        (Color(0xFFBC0082), _white),
        (Color(0xFFFFBC24), _on),
      ];
}

/// The computer's own look on the desktop, in Material You's place (desktop/desk_theme.dart):
/// its corners, its accent colour when the computer doesn't say, and its fonts.
enum DeskStyle {
  /// Windows' Fluent 2: Mica and Acrylic.
  fluent(card: 8, control: 4, dialog: 8, accent: Color(0xFF0078D4), font: 'Segoe UI Variable Text', fallback: ['Segoe UI', 'Nirmala UI', 'Microsoft YaHei UI', 'Segoe UI Symbol']),

  /// macOS Tahoe's Liquid Glass. Capsule controls.
  tahoe(card: 22, control: 0, dialog: 26, accent: Color(0xFF007AFF), font: null, fallback: []),

  /// Deepin's (DDE) and COSMIC's frosted glass.
  frosted(card: 14, control: 8, dialog: 16, accent: Color(0xFF0081FF), font: 'sans-serif', fallback: ['Noto Sans', 'Cantarell', 'DejaVu Sans']);

  const DeskStyle({required this.card, required this.control, required this.dialog, required this.accent, required this.font, required this.fallback});

  /// Corner radii: a card, a control (0 for a capsule) and a dialog.
  final double card, control, dialog;

  /// The accent colour when the computer doesn't give one.
  final Color accent;

  /// The font, with what stands in for the letters it hasn't; null for the system's own.
  final String? font;
  final List<String> fallback;

  /// The platform whose type sizes and font the look takes.
  TargetPlatform get platform => switch (this) {
        fluent => TargetPlatform.windows,
        tahoe => TargetPlatform.macOS,
        frosted => TargetPlatform.linux,
      };

  /// A control's shape, with its edge.
  OutlinedBorder shape([BorderSide side = BorderSide.none]) =>
      control == 0 ? StadiumBorder(side: side) : RoundedRectangleBorder(borderRadius: BorderRadius.circular(control), side: side);
}

/// Short ways for a screen to reach the look: `context.sg` for the site's colours.
extension SgTheme on BuildContext {
  /// The site's colour tokens in the theme in use.
  SgColors get sg => Theme.of(this).extension<SgColors>()!;

  /// Whether the Material You look is on.
  bool get materialYou => AppLook.I.materialYou;
}

/// One of the site's brand colours: its id (kept in sgbus.colorTheme), colour and name.
class BrandSwatch {
  const BrandSwatch(this.id, this.hex, this.label, {this.dot});
  final String id;
  final int hex;
  final String Function() label;
  final List<Color>? dot; // its dot's colours, top to bottom, where it isn't just the one
}

/// A colour as "#rrggbb", for Colours' sums.
String hexOf(Color c) => '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// The writing that meets WCAG on a line's or a ride's colour: dark or white, whichever reads
/// better (white on the Circle Line's orange is only 2.1:1). As the site's inkOn (js/campus.js).
Color inkOn(Color bg) => hexColor(Colours.onColour(hexOf(bg)));

/// The desktop title bar's colours (desktop/title_bar.dart), from the theme in use: the bars'
/// colour, writing that reads on it (the theme's own, held to WCAG AA), and the tints for the
/// command bar's field and a button under the pointer. The tints only ever add contrast: lighter
/// behind dark writing, darker behind light writing.
@immutable
class BarColours {
  const BarColours({required this.background, required this.fg, required this.field, required this.hover});

  /// The bar's colours for a theme's tokens: the brand colour (GTA VI's blue bar), and its
  /// writing.
  factory BarColours.of(SgColors sg) {
    final background = sg.bar;
    var fg = sg.onBar;
    // The theme's colours already meet AA on every real bar colour; if one doesn't (a colour of
    // someone's own), the better of dark or white stands in.
    if (Colours.contrast(hexOf(fg), hexOf(background)) < Colours.aa) fg = hexColor(Colours.onColour(hexOf(background)));
    final lightWriting = fg.computeLuminance() > .5;
    if (lightWriting) {
      return BarColours(background: background, fg: fg, field: const Color(0x2E000000), hover: const Color(0x38000000));
    }
    // A very light bar (white, say) can't get lighter, so it takes a faint grey; dark writing
    // still reads easily on it.
    if (background.computeLuminance() > .8) {
      return BarColours(background: background, fg: fg, field: const Color(0x12000000), hover: const Color(0x1A000000));
    }
    return BarColours(background: background, fg: fg, field: const Color(0x59FFFFFF), hover: const Color(0x4DFFFFFF));
  }

  /// The bar's colour.
  final Color background;

  /// The writing and icons on it.
  final Color fg;

  /// The command bar's field, laid over the bar.
  final Color field;

  /// A button under the pointer, laid over the bar.
  final Color hover;
}

/// A "#rrggbb" colour, or [fallback] if it isn't one.
Color hexColor(String s, [Color fallback = const Color(0xFFCCFFCC)]) {
  final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(s.trim());
  return m == null ? fallback : Color(0xFF000000 | int.parse(m[1]!, radix: 16));
}

/// The app's look: which one, its colours, light or dark, and the ThemeData for it. Screens
/// redraw when it changes (app/app.dart listens).
class AppLook extends ChangeNotifier {
  AppLook._();
  static final AppLook I = AppLook._();

  static const lookKey = 'app.look'; // "usual", or unset for Material You
  static const colorKey = 'sgbus.colorTheme';
  static const modeKey = 'sgbus.mode';
  static const contrastKey = 'sgbus_contrast';
  static const coloursKey = 'sgbus_colours';
  static const lightFromHour = 9;
  static const lightUntilHour = 18;

  static const swatches = [
    BrandSwatch('classic', 0xFFCCFFCC, _classic),
    BrandSwatch('not-green-1', 0xFFFFCCCC, _ng1),
    BrandSwatch('not-green-2', 0xFFCCCCFF, _ng2),
    BrandSwatch('not-green-3', 0xFFFFFFCC, _ng3),
    BrandSwatch('not-green-4', 0xFFFFCCFF, _ng4),
    BrandSwatch('not-green-5', 0xFFCCFFFF, _ng5),
    BrandSwatch('really-light-green', 0xFFFFFFFF, _rl),
    BrandSwatch(gta6, 0xFFFF2B90, _gta6, dot: [Color(0xFF2B60DA), Color(0xFFFF2B90), Color(0xFFE6953E)]),
  ];

  /// GTA VI, for its release on 19 November 2026, set in time or won on the wheel (data/gta6.dart):
  /// the colours of the game's logo, as style.css has them, more than the other swatches' tint.
  static const gta6 = 'gta-6';
  static const _gta6Tokens = {
    'light': {'--bg': '#fff0f7', '--ink': '#1d0030', '--muted': '#66406f', '--brand': '#ff2b90', '--on-brand': '#1d0030', '--brand-ink': '#bc0082'},
    'dark': {'--bg': '#1d0030', '--ink': '#fff4fa', '--muted': '#d9c2de', '--brand': '#ff2b90', '--on-brand': '#1d0030', '--brand-ink': '#ff7ccb'},
  };
  // The swatches' names, as the site has them (not translated there either).
  static String _classic() => 'Classic';
  static String _ng1() => 'Not green 1';
  static String _ng2() => 'Not green 2';
  static String _ng3() => 'Not green 3';
  static String _ng4() => 'Not green 4';
  static String _ng5() => 'Not green 5';
  static String _rl() => 'Really really light green';
  static String _gta6() => 'GTA VI';

  /// The phone's wallpaper colours (Android 12 and later), once read.
  ColorScheme? phoneLight;
  ColorScheme? phoneDark;

  /// The phone's own fonts, as Android names them ("google-sans-text" on a Pixel), once read.
  /// "sans-serif" is the phone's default font everywhere else.
  String phoneBodyFont = 'sans-serif';
  String phoneHeadFont = 'sans-serif';

  /// In Material You: the wallpaper's colours ("phone", the default), Your colours ("yours") or
  /// GTA VI's ("gta-6").
  static const youColoursKey = 'app.youColours';

  /// Which colours Material You uses (above); Your colours only while they're set, GTA VI only
  /// while it can be picked.
  String get youColours {
    final v = Store.I.get(youColoursKey);
    if (v == 'yours' && yourColours != null) return v!;
    return v == gta6 && Gta6.canPick ? gta6 : 'phone';
  }

  /// Picks Material You's colours; GTA VI only if it can be picked now.
  set youColours(String v) {
    if (v == gta6 && !Gta6.pick()) return;
    Store.I.put(youColoursKey, v == 'phone' ? null : v);
    notifyListeners();
  }

  /// For tests and screenshots: the platform's brightness and contrast.
  Brightness Function()? platformBrightness;

  // ---------- the desktop's (desktop/desk_theme.dart) ----------

  Color? _accentOverride;

  /// The computer's accent colour, standing in for the brand colour, while the desktop's "Use
  /// system accent colour" is on; null otherwise (always, on Android). Your colours still come
  /// first, as they do over the brand colours.
  Color? get accentOverride => _accentOverride;
  /// Sets (or clears) the accent colour, repainting the app if it changed.
  set accentOverride(Color? colour) {
    if (colour == _accentOverride) return;
    _accentOverride = colour;
    notifyListeners();
  }

  /// The desktop's compact controls: smaller paddings, for a mouse rather than a finger.
  bool compact = false;

  /// The computer's own look that the desktop offers in Material You's place (DeskStyle); null on
  /// Android. While it's set, Material You is off whatever was saved.
  DeskStyle? deskStyle;

  bool _deskLook = false;

  /// Whether the computer's own look is on (the UwU Apps theme when it's off).
  bool get deskLook => deskStyle != null && _deskLook;
  set deskLook(bool on) {
    if (on == _deskLook) return;
    _deskLook = on;
    notifyListeners();
  }

  /// The computer's own look while it's on; null otherwise.
  DeskStyle? get desk => deskLook ? deskStyle : null;

  Color? _deskAccent;

  /// The computer's accent colour, for its own look, whether or not "Use system accent colour"
  /// is on; null where the computer doesn't say.
  Color? get deskAccent => _deskAccent;
  set deskAccent(Color? colour) {
    if (colour == _deskAccent) return;
    _deskAccent = colour;
    if (deskLook) notifyListeners();
  }

  /// A card's corners in the look in use.
  double get cardRadius => materialYou ? 24 : desk?.card ?? 18;

  /// A pill's shape (a filter, a choice) in the look in use: Fluent's are 4 px rectangles, the
  /// rest capsules.
  OutlinedBorder pillShape([BorderSide side = BorderSide.none]) => desk == DeskStyle.fluent ? desk!.shape(side) : StadiumBorder(side: side);

  /// The accent colour's tokens, while it stands in for the brand colour.
  Map<String, dynamic>? _accentTokens(Brightness b) {
    final accent = _accentOverride;
    if (accent == null || yourColours != null) return null;
    return Colours.accentTokens(hexOf(accent), b == Brightness.dark ? 'dark' : 'light');
  }

  /// Whether the Material You look is on (the UwU Apps theme when it's off). Never on the
  /// desktop, which offers the computer's own look in its place.
  bool get materialYou => deskStyle == null && Store.I.get(lookKey) != 'usual';
  set materialYou(bool on) {
    Store.I.put(lookKey, on ? null : 'usual');
    notifyListeners();
  }

  /// The brand colour picked; Classic for GTA VI once it can't be picked.
  String get swatchId {
    final v = Store.I.get(colorKey) ?? 'classic';
    return v == gta6 && !Gta6.canPick ? 'classic' : v;
  }

  /// Picks a brand colour. GTA VI while it's locked (as when Sync brings it from another
  /// device) is Classic instead.
  set swatchId(String id) {
    Store.I.put(colorKey, id == gta6 && !Gta6.pick() ? 'classic' : id);
    notifyListeners();
  }

  /// "light", "dark" or "time".
  String get modePreference {
    final v = Store.I.get(modeKey);
    return const ['light', 'dark', 'time', 'phone'].contains(v) ? v! : (materialYou || deskLook ? 'phone' : 'light');
  }

  /// Picks light, dark, by the clock, or the phone's.
  set modePreference(String v) {
    Store.I.put(modeKey, v);
    notifyListeners();
  }

  /// "auto" (the phone's), "on" or "off".
  String get contrast {
    final v = Store.I.get(contrastKey);
    return v == 'on' || v == 'off' ? v! : 'auto';
  }

  /// Picks High contrast: the phone's ("auto"), on or off.
  set contrast(String v) {
    Store.I.put(contrastKey, v == 'auto' ? null : v);
    notifyListeners();
  }

  /// Your colours' one colour, when it's on: { kind: base, base: "#rrggbb", light: tokens, dark: tokens }.
  Map<String, dynamic>? get yourColours {
    final v = Store.I.map(coloursKey);
    return v['kind'] == 'base' && v['base'] is String ? v : null;
  }

  /// Repaints the app with what's set now (the clock may have turned light or dark).
  void changed() => notifyListeners();

  /// Whether it's light by the clock: 09:00 to 18:00.
  static bool daylight([DateTime? now]) {
    final h = (now ?? DateTime.now()).hour;
    return h >= lightFromHour && h < lightUntilHour;
  }

  /// Light, dark or the system's, from the mode picked.
  ThemeMode themeMode() => switch (modePreference) {
        'dark' => ThemeMode.dark,
        'time' => daylight() ? ThemeMode.light : ThemeMode.dark,
        'phone' => ThemeMode.system,
        _ => ThemeMode.light,
      };

  /// Whether High contrast is on: set on, or the phone's setting while it's "auto".
  bool highContrast(BuildContext context) =>
      contrast == 'on' || (contrast == 'auto' && MediaQuery.maybeHighContrastOf(context) == true);

  /// The brand colour in use: Your colours' one colour, the computer's accent colour (the
  /// desktop's choice), or the picked swatch.
  Color get brand {
    final yc = yourColours;
    if (yc != null) return hexColor(yc['base'] as String);
    if (_accentOverride != null) return _accentOverride!;
    return Color(swatches.firstWhere((s) => s.id == swatchId, orElse: () => swatches.first).hex);
  }

  /// The app's whole theme for light or dark, in the look picked.
  ThemeData theme(Brightness b, {bool contrast = false}) {
    final d = desk;
    var t = d != null
        ? _desk(d, b, contrast)
        : materialYou
            ? _material(b, contrast)
            : _usual(b, contrast);
    if (isGta6 && !contrast) t = _gta6Dress(t, b);
    if (compact) t = t.copyWith(visualDensity: VisualDensity.compact);
    return t;
  }

  /// GTA VI's colours are what's showing.
  bool get isGta6 => materialYou || deskLook ? youColours == gta6 : yourColours == null && _accentOverride == null && swatchId == gta6;

  /// GTA VI uses every colour of the logo, a colour to each kind of thing, as style.css has it:
  /// pink for the main buttons, orange for what's picked, yellow for what's switched on, blue for
  /// the bars and icons, magenta for codes, and the bus numbers going through them. The status
  /// colours (ok, warn, busy, error, the tones) keep their meaning. Not over High contrast or
  /// Your colours.
  ThemeData _gta6Dress(ThemeData t, Brightness b) {
    final dark = b == Brightness.dark;
    final sg = t.extension<SgColors>()!;
    const pink = Color(0xFFFF2B90), orange = Color(0xFFE6953E), yellow = Color(0xFFFFBC24), on = Color(0xFF1D0030);
    final blueInk = dark ? const Color(0xFF8FB0FF) : const Color(0xFF2B60DA);
    final orangeInk = dark ? yellow : const Color(0xFF9A5206);
    final pinkInk = dark ? const Color(0xFFFF7CCB) : const Color(0xFFBC0082);
    final accents = SgAccents(
      heading: dark ? yellow : const Color(0xFF2B60DA),
      inks: dark
          ? const [Color(0xFFFF7CCB), Color(0xFF8FB0FF), yellow, Color(0xFFF0AA5C)]
          : const [Color(0xFFBC0082), Color(0xFF2B60DA), Color(0xFF9A5206), Color(0xFF6D016D)],
    );
    return t.copyWith(
      extensions: [sg.copyWith(brand: pink, onBrand: on, brandInk: pinkInk, accents: accents)],
      colorScheme: t.colorScheme.copyWith(
        primary: pinkInk,
        primaryContainer: pink,
        onPrimaryContainer: on,
        secondary: blueInk,
        tertiary: orangeInk,
        secondaryContainer: orange,
        onSecondaryContainer: on,
        tertiaryContainer: yellow,
        onTertiaryContainer: on,
      ),
      appBarTheme: t.appBarTheme.copyWith(foregroundColor: pinkInk),
      iconTheme: t.iconTheme.copyWith(color: blueInk),
      listTileTheme: t.listTileTheme.copyWith(iconColor: pinkInk),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: pink, foregroundColor: on)),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(foregroundColor: blueInk, side: BorderSide(color: blueInk))),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: orangeInk)),
      iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: blueInk)),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(selectedBackgroundColor: orange, selectedForegroundColor: on),
      ),
      switchTheme: SwitchThemeData(
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? yellow : null),
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? on : null),
      ),
      sliderTheme: t.sliderTheme.copyWith(activeTrackColor: orange, thumbColor: pink, inactiveTrackColor: blueInk.withValues(alpha: .3)),
      progressIndicatorTheme: t.progressIndicatorTheme.copyWith(color: blueInk),
      floatingActionButtonTheme: t.floatingActionButtonTheme.copyWith(backgroundColor: yellow, foregroundColor: on),
    );
  }

  // ---------- Material You ----------

  static const _seed = Color(0xFF2E7D32); // the site's green, as a tone that seeds well

  /// The Material You look, in the wallpaper's (or Your, or GTA VI's) colours.
  ThemeData _material(Brightness b, bool contrast) {
    final yc = yourColours;
    ColorScheme scheme;
    if (yc != null && youColours == 'yours') {
      scheme = ColorScheme.fromSeed(seedColor: hexColor(yc['base'] as String), brightness: b);
    } else if (youColours == gta6) {
      scheme = _gta6Scheme(b);
    } else {
      // The phone's wallpaper colours; on the desktop, the computer's accent colour if it's
      // chosen; otherwise the app's green.
      final phone = b == Brightness.dark ? phoneDark : phoneLight;
      final seed = _accentOverride ?? _seed;
      scheme = phone ?? ColorScheme.fromSeed(seedColor: seed, brightness: b);
    }
    if (contrast) {
      scheme = ColorScheme.fromSeed(
          seedColor: scheme.primary, brightness: b, contrastLevel: 1.0, dynamicSchemeVariant: DynamicSchemeVariant.fidelity);
    }
    final dark = b == Brightness.dark;
    final sg = SgColors(
      bg: scheme.surface,
      surface: scheme.surfaceContainer,
      surfaceStrong: scheme.surfaceContainerHigh,
      border: scheme.outlineVariant,
      ink: scheme.onSurface,
      muted: scheme.onSurfaceVariant,
      brand: scheme.primaryContainer,
      onBrand: scheme.onPrimaryContainer,
      brandInk: scheme.primary,
      ok: dark ? const Color(0xFF4ADE80) : const Color(0xFF0F7234),
      warn: dark ? const Color(0xFFFBBF24) : const Color(0xFFA24B08),
      busy: dark ? const Color(0xFF94A3B8) : const Color(0xFF627288),
      error: scheme.error,
      tones: dark
          ? const [Color(0xFF93C5FD), Color(0xFFF9A8D4), Color(0xFFC4B5FD)]
          : const [Color(0xFF1D4ED8), Color(0xFFBE185D), Color(0xFF6D28D9)],
      glass: false,
    );
    // The phone's own fonts: its headline font for the big words, its body font for the rest,
    // and the phone's default (then Noto) for arrows and the other languages' letters.
    const fallback = ['sans-serif', 'Roboto', 'Noto Sans'];
    final base = Typography.material2021(platform: TargetPlatform.android);
    final plain = (dark ? base.white : base.black).apply(fontFamily: phoneBodyFont, fontFamilyFallback: fallback);
    TextStyle? head(TextStyle? t) => t?.copyWith(fontFamily: phoneHeadFont, fontFamilyFallback: fallback);
    final text = plain.copyWith(
      displayLarge: head(plain.displayLarge),
      displayMedium: head(plain.displayMedium),
      displaySmall: head(plain.displaySmall),
      headlineLarge: head(plain.headlineLarge),
      headlineMedium: head(plain.headlineMedium),
      headlineSmall: head(plain.headlineSmall),
      titleLarge: head(plain.titleLarge),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      brightness: b,
      fontFamily: phoneBodyFont,
      fontFamilyFallback: fallback,
      textTheme: text,
      extensions: [sg],
      // Material 3 Expressive's rounder shapes, as the site's Material look had them.
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        margin: EdgeInsets.zero,
      ),
      bottomSheetTheme: const BottomSheetThemeData(showDragHandle: true),
      chipTheme: ChipThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
      }),
    );
  }

  /// GTA VI in Material You: the logo's pink as it is, and at night its violet for the surfaces,
  /// not a dark pink.
  static ColorScheme _gta6Scheme(Brightness b) {
    final s = ColorScheme.fromSeed(seedColor: const Color(0xFFFF2B90), brightness: b, dynamicSchemeVariant: DynamicSchemeVariant.fidelity);
    if (b == Brightness.light) return s;
    return s.copyWith(
      surface: const Color(0xFF1D0030),
      surfaceContainerLowest: const Color(0xFF160026),
      surfaceContainerLow: const Color(0xFF250339),
      surfaceContainer: const Color(0xFF2C0646),
      surfaceContainerHigh: const Color(0xFF350054),
      surfaceContainerHighest: const Color(0xFF420D63),
    );
  }

  // ---------- the computer's own look (the desktop's) ----------

  /// Each look's background (under the window's own effect, or where there's none), cards,
  /// stronger cards, card edges, writing and quieter writing, light and dark. The quieter
  /// writing meets WCAG AA on the background, the cards and the stronger cards
  /// (test/trains_contrast_test.dart).
  static const _deskTokens = {
    DeskStyle.fluent: {
      'light': [Color(0xFFF3F3F3), Color(0xB3FFFFFF), Color(0xE6FFFFFF), Color(0x14000000), Color(0xFF1B1B1B), Color(0xFF5E5E5E)],
      'dark': [Color(0xFF202020), Color(0x0FFFFFFF), Color(0x1AFFFFFF), Color(0x17FFFFFF), Color(0xFFFFFFFF), Color(0xFFC8C8C8)],
    },
    DeskStyle.tahoe: {
      'light': [Color(0xFFF5F5F7), Color(0x8CFFFFFF), Color(0xC7FFFFFF), Color(0xB3FFFFFF), Color(0xFF1D1D1F), Color(0xFF636366)],
      // The quieter writing #B5B5BA, 4.9:1 on the stronger cards (the map's bubble); #A1A1A6 was 3.9:1.
      'dark': [Color(0xFF1E1E1E), Color(0x1AFFFFFF), Color(0x29FFFFFF), Color(0x2EFFFFFF), Color(0xFFF5F5F7), Color(0xFFB5B5BA)],
    },
    DeskStyle.frosted: {
      'light': [Color(0xFFEEF0F4), Color(0x99FFFFFF), Color(0xD1FFFFFF), Color(0xB3FFFFFF), Color(0xFF1F2329), Color(0xFF575E6A)],
      'dark': [Color(0xFF1C1D21), Color(0x14FFFFFF), Color(0x24FFFFFF), Color(0x24FFFFFF), Color(0xFFF0F1F3), Color(0xFFA8ADB6)],
    },
  };

  /// Dialogs, menus and side panels: solid, so what's under them doesn't show through the
  /// writing.
  static Color _deskSolid(DeskStyle d, bool dark) => switch (d) {
        DeskStyle.fluent => dark ? const Color(0xFF2B2B2B) : const Color(0xFFFFFFFF),
        DeskStyle.tahoe => dark ? const Color(0xFF2A2A2C) : const Color(0xFFF6F6F6),
        DeskStyle.frosted => dark ? const Color(0xFF2A2B30) : const Color(0xFFFAFAFB),
      };

  /// The colour the computer's own look is in: Your colours or GTA VI's when picked for it, as
  /// Material You has them, else the computer's accent colour, else the look's own.
  Color _deskBrand(DeskStyle d) {
    final yc = yourColours;
    if (youColours == 'yours' && yc != null) return hexColor(yc['base'] as String);
    if (youColours == gta6) return const Color(0xFFFF2B90);
    return _deskAccent ?? d.accent;
  }

  /// The computer's own look ([DeskStyle]): its system font and corners, see-through cards (the
  /// window's Mica or vibrancy behind them, or the frosted backdrop on Linux: desk_theme.dart),
  /// in its accent colour. High contrast makes it solid: plain white or black, with clear edges.
  ThemeData _desk(DeskStyle d, Brightness b, bool contrast) {
    final dark = b == Brightness.dark;
    final mode = dark ? 'dark' : 'light';
    final t = _deskTokens[d]![mode]!;
    final bg = contrast ? (dark ? Colors.black : Colors.white) : t[0];
    final card = contrast ? bg : Color.alphaBlend(t[1], bg);
    final accent = _deskBrand(d);
    final button = Colours.buttonFor(hexOf(accent), hexOf(card));
    final brand = hexColor(button.fill);
    var sg = SgColors(
      bg: bg,
      surface: t[1],
      surfaceStrong: t[2],
      border: t[3],
      ink: t[4],
      muted: t[5],
      brand: brand,
      onBrand: hexColor(button.text),
      brandInk: hexColor(Colours.inkOf(hexOf(accent), hexOf(bg), hexOf(card), mode)),
      ok: dark ? const Color(0xFF4ADE80) : const Color(0xFF0F7234),
      warn: dark ? const Color(0xFFFBBF24) : const Color(0xFFA24B08),
      busy: dark ? const Color(0xFF94A3B8) : const Color(0xFF627288),
      error: dark ? const Color(0xFFFA9696) : const Color(0xFFB91C1C),
      tones: dark
          ? const [Color(0xFF93C5FD), Color(0xFFF9A8D4), Color(0xFFC4B5FD)]
          : const [Color(0xFF1D4ED8), Color(0xFFBE185D), Color(0xFF6D28D9)],
      // Fluent's cards sit on Mica as they are; Tahoe's and the frosted ones blur what's behind.
      glass: d != DeskStyle.fluent,
    );
    if (contrast) {
      sg = SgColors(
        bg: bg,
        surface: dark ? const Color(0xFF0D0D0D) : Colors.white,
        surfaceStrong: dark ? const Color(0xFF161616) : Colors.white,
        border: dark ? const Color(0xFFF2F2F2) : const Color(0xFF121815),
        ink: dark ? Colors.white : Colors.black,
        muted: dark ? const Color(0xFFE6E6E6) : const Color(0xFF1F2622),
        brand: brand,
        onBrand: _contrastOnBrand(brand),
        brandInk: sg.brandInk,
        ok: dark ? const Color(0xFF4ADE80) : const Color(0xFF0B5A28),
        warn: dark ? const Color(0xFFFBBF24) : const Color(0xFF7A3600),
        busy: sg.busy,
        error: dark ? const Color(0xFFFA9696) : const Color(0xFF8F1010),
        tones: sg.tones,
        glass: false,
      );
    }
    final solid = contrast ? sg.surface : _deskSolid(d, dark);
    final scheme = ColorScheme(
      brightness: b,
      primary: sg.brandInk,
      onPrimary: dark ? const Color(0xFF0C100E) : Colors.white,
      primaryContainer: sg.brand,
      onPrimaryContainer: sg.onBrand,
      secondary: sg.brandInk,
      onSecondary: dark ? const Color(0xFF0C100E) : Colors.white,
      secondaryContainer: Color.alphaBlend(sg.brand.withValues(alpha: 0.35), solid),
      onSecondaryContainer: sg.ink,
      error: sg.error,
      onError: Colors.white,
      surface: solid,
      onSurface: sg.ink,
      onSurfaceVariant: sg.muted,
      surfaceContainerLowest: solid,
      surfaceContainerLow: Color.alphaBlend(sg.surface, sg.bg),
      surfaceContainer: Color.alphaBlend(sg.surface, sg.bg),
      surfaceContainerHigh: Color.alphaBlend(sg.surfaceStrong, sg.bg),
      surfaceContainerHighest: Color.alphaBlend(sg.surfaceStrong, sg.bg),
      outline: sg.muted,
      outlineVariant: contrast ? sg.border : Color.alphaBlend(sg.border, sg.bg),
      surfaceTint: Colors.transparent,
    );
    final typography = Typography.material2021(platform: d.platform);
    final fallback = d.fallback.isEmpty ? null : d.fallback;
    final text = (dark ? typography.white : typography.black).apply(fontFamily: d.font, fontFamilyFallback: fallback, bodyColor: sg.ink, displayColor: sg.ink);
    final edge = BorderSide(color: contrast ? sg.border : Color.alphaBlend(sg.border, sg.bg));
    final control = d.shape();
    final field = d.control == 0 ? 10.0 : d.control;
    final menu = d.control == 0 ? 12.0 : d.control + 4;
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      brightness: b,
      fontFamily: d.font,
      fontFamilyFallback: fallback,
      textTheme: text,
      // See-through, for the window's Mica or vibrancy (or the frosted backdrop) to show; solid
      // in high contrast.
      scaffoldBackgroundColor: contrast ? sg.bg : Colors.transparent,
      canvasColor: solid,
      extensions: [sg],
      // No ripples: a desktop's controls light up under the pointer and when pressed.
      splashFactory: NoSplash.splashFactory,
      cardTheme: CardThemeData(
        elevation: 0,
        color: sg.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(d.card), side: BorderSide(color: sg.border)),
        margin: EdgeInsets.zero,
      ),
      appBarTheme: AppBarTheme(backgroundColor: Colors.transparent, foregroundColor: sg.ink, elevation: 0, scrolledUnderElevation: 0, surfaceTintColor: Colors.transparent),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: sg.brand, foregroundColor: sg.onBrand, shape: control)),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(foregroundColor: sg.ink, shape: control, side: edge)),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: sg.brandInk, shape: control)),
      elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(shape: control, elevation: 0)),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(shape: control, side: edge, selectedBackgroundColor: sg.brand, selectedForegroundColor: sg.onBrand),
      ),
      chipTheme: ChipThemeData(shape: control, side: edge),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: sg.surfaceStrong,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(field), borderSide: edge),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(field), borderSide: edge),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(field), borderSide: BorderSide(color: sg.brandInk, width: 2)),
      ),
      switchTheme: SwitchThemeData(
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? sg.brand : null),
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? sg.onBrand : null),
      ),
      dialogTheme: DialogThemeData(backgroundColor: solid, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(d.dialog), side: edge)),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: solid, showDragHandle: true),
      popupMenuTheme: PopupMenuThemeData(color: solid, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(menu), side: edge)),
      menuTheme: MenuThemeData(
        style: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(solid),
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(menu), side: edge)),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: solid, borderRadius: BorderRadius.circular(d.control == 0 ? 8 : d.control), border: Border.fromBorderSide(edge)),
        textStyle: TextStyle(color: sg.ink, fontSize: 12),
      ),
    );
  }

  /// The desktop title bar's colours in the computer's own look; null in the other looks.
  /// Fluent 2's is plain white in light and plain black in dark; Tahoe's is the window's own
  /// glass; the frosted one is a pane of it.
  BarColours? deskBar(Brightness b, {bool contrast = false}) {
    final d = desk;
    if (d == null) return null;
    final dark = b == Brightness.dark;
    final t = _deskTokens[d]![dark ? 'dark' : 'light']!;
    final field = dark ? const Color(0x1FFFFFFF) : const Color(0x0F000000);
    final hover = dark ? const Color(0x1FFFFFFF) : const Color(0x14000000);
    if (d == DeskStyle.fluent) {
      return dark
          ? BarColours(background: Colors.black, fg: Colors.white, field: field, hover: hover)
          : BarColours(background: Colors.white, fg: const Color(0xFF1B1B1B), field: field, hover: hover);
    }
    if (contrast) return BarColours(background: dark ? Colors.black : Colors.white, fg: dark ? Colors.white : Colors.black, field: field, hover: hover);
    return BarColours(background: d == DeskStyle.tahoe ? Colors.transparent : t[1], fg: t[4], field: field, hover: hover);
  }

  // ---------- the UwU Apps theme ----------

  /// One of the site's CSS colour tokens ("#rrggbb" or "rgba(…)"), or [fallback] without it.
  Color _token(Map<String, dynamic>? tokens, String name, Color fallback) {
    final v = tokens?[name];
    if (v is! String) return fallback;
    if (v.startsWith('#')) return hexColor(v, fallback);
    final m = RegExp(r'rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)').firstMatch(v);
    if (m == null) return fallback;
    return Color.fromRGBO(double.parse(m[1]!).round(), double.parse(m[2]!).round(), double.parse(m[3]!).round(), m[4] == null ? 1 : double.parse(m[4]!));
  }

  /// The UwU Apps theme: the site's look, in the brand colour (or Your colours, GTA VI's, or the
  /// desktop's accent colour).
  ThemeData _usual(Brightness b, bool contrast) {
    final dark = b == Brightness.dark;
    final yc = yourColours;
    final tokens = yc != null
        ? (yc[dark ? 'dark' : 'light'] as Map?)?.cast<String, dynamic>()
        : _accentTokens(b) ?? (swatchId == gta6 ? _gta6Tokens[dark ? 'dark' : 'light'] : null);
    final brand = brandColor(tokens);
    var sg = SgColors(
      bg: _token(tokens, '--bg', dark ? const Color(0xFF0C100E) : const Color(0xFFEEF2F0)),
      surface: _token(tokens, '--surface', dark ? const Color(0x0FFFFFFF) : const Color(0x8CFFFFFF)),
      surfaceStrong: _token(tokens, '--surface-strong', dark ? const Color(0x1CFFFFFF) : const Color(0xC7FFFFFF)),
      border: _token(tokens, '--surface-border', dark ? const Color(0x24FFFFFF) : const Color(0xA6FFFFFF)),
      ink: _token(tokens, '--ink', dark ? const Color(0xFFEEF2EF) : const Color(0xFF121815)),
      muted: _token(tokens, '--muted', dark ? const Color(0xFFA9B5AE) : const Color(0xFF5B665F)),
      brand: brand,
      onBrand: _token(tokens, '--on-brand', const Color(0xFF121815)),
      brandInk: _token(tokens, '--brand-ink', dark ? const Color(0xFFBFF5CF) : const Color(0xFF1F6B3D)),
      ok: dark ? const Color(0xFF4ADE80) : const Color(0xFF0F7234),
      warn: dark ? const Color(0xFFFBBF24) : const Color(0xFFA24B08),
      busy: dark ? const Color(0xFF94A3B8) : const Color(0xFF627288),
      error: dark ? const Color(0xFFFA9696) : const Color(0xFFB91C1C),
      tones: dark
          ? const [Color(0xFF93C5FD), Color(0xFFF9A8D4), Color(0xFFC4B5FD)]
          : const [Color(0xFF1D4ED8), Color(0xFFBE185D), Color(0xFF6D28D9)],
      glass: true,
    );
    if (contrast) {
      sg = SgColors(
        bg: dark ? Colors.black : const Color(0xFFEEF2F0),
        surface: dark ? const Color(0xFF0D0D0D) : Colors.white,
        surfaceStrong: dark ? const Color(0xFF161616) : Colors.white,
        border: dark ? const Color(0xFFF2F2F2) : const Color(0xFF121815),
        ink: dark ? Colors.white : Colors.black,
        muted: dark ? const Color(0xFFE6E6E6) : const Color(0xFF1F2622),
        brand: sg.brand,
        onBrand: _contrastOnBrand(sg.brand),
        brandInk: dark ? const Color(0xFFBFF5CF) : const Color(0xFF0B4D26),
        ok: dark ? const Color(0xFF4ADE80) : const Color(0xFF0B5A28),
        warn: dark ? const Color(0xFFFBBF24) : const Color(0xFF7A3600),
        busy: sg.busy,
        error: dark ? const Color(0xFFFA9696) : const Color(0xFF8F1010),
        tones: sg.tones,
        glass: false,
      );
    }
    final scheme = ColorScheme(
      brightness: b,
      primary: sg.brandInk,
      onPrimary: dark ? const Color(0xFF0C100E) : Colors.white,
      primaryContainer: sg.brand,
      onPrimaryContainer: sg.onBrand,
      secondary: sg.brandInk,
      onSecondary: dark ? const Color(0xFF0C100E) : Colors.white,
      secondaryContainer: Color.alphaBlend(sg.brand.withValues(alpha: 0.55), sg.bg),
      onSecondaryContainer: sg.onBrand,
      error: sg.error,
      onError: Colors.white,
      surface: sg.bg,
      onSurface: sg.ink,
      onSurfaceVariant: sg.muted,
      surfaceContainerLowest: Color.alphaBlend(sg.surface, sg.bg),
      surfaceContainerLow: Color.alphaBlend(sg.surface, sg.bg),
      surfaceContainer: Color.alphaBlend(sg.surface, sg.bg),
      surfaceContainerHigh: Color.alphaBlend(sg.surfaceStrong, sg.bg),
      surfaceContainerHighest: Color.alphaBlend(sg.surfaceStrong, sg.bg),
      outline: sg.muted,
      outlineVariant: sg.border,
    );
    // Jua has no "·", "→" or the other languages' letters: the phone's font stands in for them.
    const fallback = ['Roboto', 'Noto Sans'];
    final text = Typography.material2021(platform: TargetPlatform.android).black.apply(fontFamily: 'Jua', fontFamilyFallback: fallback);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      brightness: b,
      fontFamily: 'Jua',
      fontFamilyFallback: fallback,
      textTheme: (dark ? Typography.material2021(platform: TargetPlatform.android).white.apply(fontFamily: 'Jua', fontFamilyFallback: fallback) : text)
          .apply(bodyColor: sg.ink, displayColor: sg.ink),
      scaffoldBackgroundColor: sg.bg,
      extensions: [sg],
      cardTheme: CardThemeData(
        elevation: 0,
        color: sg.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: sg.border)),
        margin: EdgeInsets.zero,
      ),
      appBarTheme: AppBarTheme(backgroundColor: Colors.transparent, foregroundColor: sg.ink, elevation: 0, scrolledUnderElevation: 0),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: sg.brand,
          foregroundColor: sg.onBrand,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: sg.surfaceStrong,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: sg.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: sg.border)),
      ),
      dialogTheme: DialogThemeData(backgroundColor: Color.alphaBlend(sg.surfaceStrong, sg.bg)),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: Color.alphaBlend(sg.surfaceStrong, sg.bg), showDragHandle: true),
    );
  }

  /// High contrast's writing on the brand colour: black wherever black reads (WCAG AA, 4.5:1), as
  /// on every brand swatch and GTA VI's pink; white on a brand colour too dark for black (a dark
  /// colour of Your colours, or a dark accent colour on the desktop). The same on Android and
  /// the desktop.
  Color _contrastOnBrand(Color brand) {
    if (Colours.contrast('#000000', hexOf(brand)) >= Colours.aa) return Colors.black;
    return Colors.white;
  }

  /// The brand colour from a set of tokens, or the one in use without them.
  Color brandColor(Map<String, dynamic>? tokens) {
    final b = tokens?['--brand'];
    return b is String ? hexColor(b, brand) : brand;
  }

  /// Android's own tonal palettes as the scheme: seeded from them for the newer roles, then the
  /// roles Android sets itself put back, so the app matches the phone's other apps.
  static ColorScheme _fromPalette(CorePalette p, Brightness b) {
    final s = b == Brightness.dark ? Scheme.darkFromCorePalette(p) : Scheme.lightFromCorePalette(p);
    return ColorScheme.fromSeed(seedColor: Color(s.primary), brightness: b).copyWith(
      primary: Color(s.primary),
      onPrimary: Color(s.onPrimary),
      primaryContainer: Color(s.primaryContainer),
      onPrimaryContainer: Color(s.onPrimaryContainer),
      secondary: Color(s.secondary),
      onSecondary: Color(s.onSecondary),
      secondaryContainer: Color(s.secondaryContainer),
      onSecondaryContainer: Color(s.onSecondaryContainer),
      tertiary: Color(s.tertiary),
      onTertiary: Color(s.onTertiary),
      tertiaryContainer: Color(s.tertiaryContainer),
      onTertiaryContainer: Color(s.onTertiaryContainer),
      surface: Color(s.surface),
      onSurface: Color(s.onSurface),
      onSurfaceVariant: Color(s.onSurfaceVariant),
      outline: Color(s.outline),
      outlineVariant: Color(s.outlineVariant),
      inverseSurface: Color(s.inverseSurface),
      onInverseSurface: Color(s.inverseOnSurface),
      inversePrimary: Color(s.inversePrimary),
    );
  }

  /// Reads the wallpaper's colours (Android 12 and later) and the phone's fonts, each time the
  /// app opens or comes back.
  Future<void> readPhone() async {
    try {
      final fonts = await Native.call('SgBus', 'phoneFonts');
      if (fonts != null) {
        phoneBodyFont = (fonts['body'] as String?) ?? 'sans-serif';
        phoneHeadFont = (fonts['headline'] as String?) ?? phoneBodyFont;
      }
    } catch (_) {
      // An older app or no bridge: the phone's default font.
    }
    try {
      final palette = await DynamicColorPlugin.getCorePalette();
      if (palette == null) return;
      phoneLight = _fromPalette(palette, Brightness.light);
      phoneDark = _fromPalette(palette, Brightness.dark);
      notifyListeners();
    } catch (_) {
      // Before Android 12, or no dynamic colours: the app's green.
    }
  }
}
