// How the app looks. Two looks, picked in Settings, Theme:
//
//   Material You (the default, 3.0.0)  Material 3, as Android's own apps are: the phone's font,
//            solid tonal cards, pill buttons, sheets from the bottom, and the colours of the
//            phone's wallpaper on Android 12 and later (the app's green tonal palette before
//            that), or Your colours' one colour when that's on. Only in the Android app, and no
//            longer an Easter egg's secret: off is APP_LOOK_KEY = "usual".
//   The usual look  the site's: Jua, see-through glass cards on a soft background, in one of
//            the seven brand colours (sgbus.colorTheme) or Your colours (sgbus_colours).
//
// Either way light, dark or by the clock (sgbus.mode: light 09:00 to 18:00), and High contrast
// (sgbus_contrast: the phone's setting, on or off). Every screen takes its colours from
// SgColors, the site's tokens (style.css), so a screen reads the same in both looks.
// CorePalette and Scheme: what DynamicColorPlugin hands back, and how Android's own palettes
// map to roles; their replacements take no CorePalette.
// ignore_for_file: deprecated_member_use
import 'package:dynamic_color/dynamic_color.dart' show DynamicColorPlugin;
import 'package:flutter/material.dart';
import 'package:material_color_utilities/material_color_utilities.dart' show CorePalette, Scheme;

import '../data/store.dart';

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
  final bool glass; // the usual look's see-through cards

  /// A load's colour: SEA, SDA, LSD.
  Color load(String? l) => switch ((l ?? '').toUpperCase()) {
        'SEA' => ok,
        'SDA' => warn,
        'LSD' => busy,
        _ => muted,
      };

  @override
  SgColors copyWith({Color? brand}) => SgColors(
        bg: bg, surface: surface, surfaceStrong: surfaceStrong, border: border, ink: ink, muted: muted,
        brand: brand ?? this.brand, onBrand: onBrand, brandInk: brandInk, ok: ok, warn: warn, busy: busy,
        error: error, tones: tones, glass: glass,
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
    );
  }
}

extension SgTheme on BuildContext {
  SgColors get sg => Theme.of(this).extension<SgColors>()!;
  bool get materialYou => AppLook.I.materialYou;
}

class BrandSwatch {
  const BrandSwatch(this.id, this.hex, this.label);
  final String id;
  final int hex;
  final String Function() label;
}

Color hexColor(String s, [Color fallback = const Color(0xFFCCFFCC)]) {
  final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(s.trim());
  return m == null ? fallback : Color(0xFF000000 | int.parse(m[1]!, radix: 16));
}

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
  ];
  static String _classic() => 'Classic';
  static String _ng1() => 'Not green 1';
  static String _ng2() => 'Not green 2';
  static String _ng3() => 'Not green 3';
  static String _ng4() => 'Not green 4';
  static String _ng5() => 'Not green 5';
  static String _rl() => 'Really really light green';

  /// The phone's wallpaper colours (Android 12 and later), once read.
  ColorScheme? phoneLight;
  ColorScheme? phoneDark;

  /// For tests and screenshots: the platform's brightness and contrast.
  Brightness Function()? platformBrightness;

  bool get materialYou => Store.I.get(lookKey) != 'usual';
  set materialYou(bool on) {
    Store.I.put(lookKey, on ? null : 'usual');
    notifyListeners();
  }

  String get swatchId => Store.I.get(colorKey) ?? 'classic';
  set swatchId(String id) {
    Store.I.put(colorKey, id);
    notifyListeners();
  }

  /// "light", "dark" or "time".
  String get modePreference {
    final v = Store.I.get(modeKey);
    return const ['light', 'dark', 'time', 'phone'].contains(v) ? v! : (materialYou ? 'phone' : 'light');
  }

  set modePreference(String v) {
    Store.I.put(modeKey, v);
    notifyListeners();
  }

  /// "auto" (the phone's), "on" or "off".
  String get contrast {
    final v = Store.I.get(contrastKey);
    return v == 'on' || v == 'off' ? v! : 'auto';
  }

  set contrast(String v) {
    Store.I.put(contrastKey, v == 'auto' ? null : v);
    notifyListeners();
  }

  /// Your colours' one colour, when it's on: { kind: base, base: "#rrggbb", light: tokens, dark: tokens }.
  Map<String, dynamic>? get yourColours {
    final v = Store.I.map(coloursKey);
    return v['kind'] == 'base' && v['base'] is String ? v : null;
  }

  void changed() => notifyListeners();

  static bool daylight([DateTime? now]) {
    final h = (now ?? DateTime.now()).hour;
    return h >= lightFromHour && h < lightUntilHour;
  }

  ThemeMode themeMode() => switch (modePreference) {
        'dark' => ThemeMode.dark,
        'time' => daylight() ? ThemeMode.light : ThemeMode.dark,
        'phone' => ThemeMode.system,
        _ => ThemeMode.light,
      };

  bool highContrast(BuildContext context) =>
      contrast == 'on' || (contrast == 'auto' && MediaQuery.maybeHighContrastOf(context) == true);

  Color get brand {
    final yc = yourColours;
    if (yc != null) return hexColor(yc['base'] as String);
    return Color(swatches.firstWhere((s) => s.id == swatchId, orElse: () => swatches.first).hex);
  }

  ThemeData theme(Brightness b, {bool contrast = false}) =>
      materialYou ? _material(b, contrast) : _usual(b, contrast);

  // ---------- Material You ----------

  static const _seed = Color(0xFF2E7D32); // the site's green, as a tone that seeds well

  ThemeData _material(Brightness b, bool contrast) {
    final yc = yourColours;
    ColorScheme scheme;
    if (yc != null) {
      scheme = ColorScheme.fromSeed(seedColor: hexColor(yc['base'] as String), brightness: b);
    } else {
      final phone = b == Brightness.dark ? phoneDark : phoneLight;
      scheme = phone ?? ColorScheme.fromSeed(seedColor: _seed, brightness: b);
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
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      brightness: b,
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

  // ---------- the usual look ----------

  Color _token(Map<String, dynamic>? tokens, String name, Color fallback) {
    final v = tokens?[name];
    if (v is! String) return fallback;
    if (v.startsWith('#')) return hexColor(v, fallback);
    final m = RegExp(r'rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)').firstMatch(v);
    if (m == null) return fallback;
    return Color.fromRGBO(double.parse(m[1]!).round(), double.parse(m[2]!).round(), double.parse(m[3]!).round(), m[4] == null ? 1 : double.parse(m[4]!));
  }

  ThemeData _usual(Brightness b, bool contrast) {
    final dark = b == Brightness.dark;
    final yc = yourColours;
    final tokens = yc == null ? null : (yc[dark ? 'dark' : 'light'] as Map?)?.cast<String, dynamic>();
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
        onBrand: Colors.black,
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

  Color brandColor(Map<String, dynamic>? tokens) {
    final b = tokens?['--brand'];
    return b is String ? hexColor(b, brand) : brand;
  }

  // Android's own tonal palettes as the scheme: seeded from them for the newer roles, then the
  // roles Android sets itself put back, so the app matches the phone's other apps.
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

  /// Reads the wallpaper's colours (Android 12 and later), each time the app opens or comes back.
  Future<void> readPhone() async {
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
