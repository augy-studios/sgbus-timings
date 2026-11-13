// Your colours (the site's js/colours.js): one colour, and the whole theme made from it for light
// and dark (derive), every pair held to WCAG AA's 4.5:1: the buttons lighter or darker than the
// colour picked until their text reads, and the softer text darker or lighter. Kept under
// sgbus_colours as { kind: "base", base, preset, light: tokens, dark: tokens }, the tokens as
// the site's CSS custom properties, so the site and the app read each other's.
import 'dart:math' as math;

class Colours {
  Colours._();
  static const aa = 4.5;
  static const darkText = '#121815';
  static const classic = '#ccffcc';

  static List<int> rgb(String hex) {
    final n = int.parse(hex.replaceAll('#', ''), radix: 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  static String toHex(num r, num g, num b) =>
      '#${[r, g, b].map((v) => v.round().clamp(0, 255).toRadixString(16).padLeft(2, '0')).join()}';

  static double luminance(String hex) {
    final c = rgb(hex).map((v) {
      final x = v / 255;
      return x <= 0.03928 ? x / 12.92 : math.pow((x + 0.055) / 1.055, 2.4).toDouble();
    }).toList();
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  static double contrast(String a, String b) {
    final la = luminance(a), lb = luminance(b);
    final hi = math.max(la, lb), lo = math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  static String mix(String a, String b, double share) {
    final x = rgb(a), y = rgb(b);
    return toHex(x[0] * share + y[0] * (1 - share), x[1] * share + y[1] * (1 - share), x[2] * share + y[2] * (1 - share));
  }

  static String onColour(String bg) => contrast(darkText, bg) >= contrast('#ffffff', bg) ? darkText : '#ffffff';

  static ({double h, double s, double l}) hsl(String hex) {
    final c = rgb(hex).map((v) => v / 255).toList();
    final r = c[0], g = c[1], b = c[2];
    final mx = math.max(r, math.max(g, b)), mn = math.min(r, math.min(g, b));
    final l = (mx + mn) / 2;
    final d = mx - mn;
    var h = 0.0;
    if (d != 0) {
      if (mx == r) {
        h = ((g - b) / d) % 6;
      } else if (mx == g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }
      h = (h * 60 + 360) % 360;
    }
    return (h: h, s: d != 0 ? d / (1 - (2 * l - 1).abs()) : 0, l: l);
  }

  static String fromHsl(double h, double s, double l) {
    final c = (1 - (2 * l - 1).abs()) * s;
    final x = c * (1 - ((h / 60) % 2 - 1).abs());
    final m = l - c / 2;
    final (r, g, b) = h < 60
        ? (c, x, 0.0)
        : h < 120
            ? (x, c, 0.0)
            : h < 180
                ? (0.0, c, x)
                : h < 240
                    ? (0.0, x, c)
                    : h < 300
                        ? (x, 0.0, c)
                        : (c, 0.0, x);
    return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  static ({String fill, String text}) buttonFor(String base, String card) {
    final c = hsl(base);
    bool reads(String fill, String text) => [fill, mix(fill, card, 0.55), mix(fill, card, 0.75)].every((x) => contrast(text, x) >= aa);
    ({String fill, String text, double off})? best;
    for (final (text, step) in [(darkText, 0.01), ('#ffffff', -0.01)]) {
      for (var l = c.l; l >= 0 && l <= 1; l += step) {
        final fill = fromHsl(c.h, c.s, l);
        if (reads(fill, text)) {
          if (best == null || (l - c.l).abs() < best.off) best = (fill: l == c.l ? base : fill, text: text, off: (l - c.l).abs());
          break;
        }
      }
    }
    return best == null ? (fill: base, text: onColour(base)) : (fill: best.fill, text: best.text);
  }

  static String inkOf(String hue, String bg, String card, String mode) {
    final c = hsl(hue);
    final sat = c.s < 0.05 ? 0.0 : c.s.clamp(0.35, 0.8);
    final step = mode == 'dark' ? 0.01 : -0.01;
    for (var l = mode == 'dark' ? 0.7 : 0.42; l >= 0 && l <= 1; l += step) {
      final x = fromHsl(c.h, sat, l);
      if (contrast(x, bg) >= aa && contrast(x, card) >= aa) return x;
    }
    return mode == 'dark' ? '#ffffff' : '#000000';
  }

  static String softer(String ink, String bg, String card, [double from = 0.55]) {
    for (var share = from; share < 1; share += 0.05) {
      final c = mix(ink, card, share);
      if (contrast(c, card) >= aa && contrast(c, bg) >= aa) return c;
    }
    return ink;
  }

  static Map<String, String> tokens({required String bg, required String card, required String ink, required String brand, required String onBrand,
          required String brandInk, required String muted, required String mutedStrong, required String border}) =>
      {
        '--bg': bg,
        '--surface': card,
        '--surface-strong': card,
        '--surface-border': border,
        '--ink': ink,
        '--muted': muted,
        '--muted-strong': mutedStrong,
        '--brand': brand,
        '--brand-rgb': rgb(brand).join(', '),
        '--on-brand': onBrand,
        '--brand-ink': brandInk,
      };

  /// The whole theme from one colour, for a mode.
  static Map<String, String> derive(String base, String mode) {
    final c = hsl(base);
    final dark = mode == 'dark';
    final bg = dark ? fromHsl(c.h, math.min(c.s, 0.25), 0.07) : fromHsl(c.h, math.min(c.s, 0.3), 0.94);
    final card = dark ? fromHsl(c.h, math.min(c.s, 0.2), 0.13) : fromHsl(c.h, math.min(c.s, 0.4), 0.985);
    final ink = dark ? fromHsl(c.h, math.min(c.s, 0.15), 0.94) : fromHsl(c.h, math.min(c.s, 0.25), 0.1);
    final button = buttonFor(base, card);
    return tokens(
      bg: bg,
      card: card,
      ink: ink,
      muted: softer(ink, bg, card),
      mutedStrong: softer(ink, bg, card, 0.7),
      border: mix(ink, card, 0.18),
      brand: button.fill,
      onBrand: button.text,
      brandInk: inkOf(base, bg, card, mode),
    );
  }

  /// Your colours for both modes, as kept.
  static Map<String, Object?> keep(String base, String? preset) =>
      {'kind': 'base', 'base': base, 'preset': preset, 'light': derive(base, 'light'), 'dark': derive(base, 'dark')};
}
