// The magic cup (the site's js/magic-cup.js): Singapore's famous language-changing cup, as a quick
// loading screen while the language changes, all of it within a second. One sip, one new language:
// the whole app changes behind it partway through its spin.
//
// A real 3D cup, drawn with nothing but Flutter's own canvas, as the 3D packages for Flutter aren't
// ready to rely on (flutter_scene is a preview that needs Flutter's master channel). A cup's only a
// shape turned on a lathe, so its rings are worked out here, turned and put in perspective each
// frame, and given to Canvas.drawVertices: its inside, then the tea, which swishes round instead of
// turning with it, then the side facing you, painted with magic-cup-texture.png, the site's picture.
// With animations off, the language just changes.
import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/nav.dart';
import '../../theme/theme.dart';

class MagicCup {
  MagicCup._();
  static const ms = 900; // the whole of it, fading in and out too: under a second
  static const changeAt = 0.45; // how far along the language changes
  static const turns = 2.0;
  static ui.Image? _texture;
  static Future<void>? _loading;

  /// For tests: the plain white cup it is without its picture.
  @visibleForTesting
  static void debugNoPicture() => _texture = null;

  /// The cup's picture, ready before it's wanted. Without it, it's a plain white cup.
  static Future<void> warm() => _loading ??= () async {
        try {
          final data = await rootBundle.load('assets/images/magic-cup-texture.png');
          final codec = await ui.instantiateImageCodec(data.buffer.asUint8List());
          _texture = (await codec.getNextFrame()).image;
        } catch (e) {
          debugPrint('magic cup: no picture: $e');
        }
      }();

  /// Plays the cup and runs `change` partway through. `name`, the language's name in itself, is
  /// shown under it. Done when both are.
  static Future<void> run({String? name, required Future<void> Function() change}) async {
    final overlay = AppNav.navigatorKey.currentState?.overlay;
    final context = AppNav.context;
    if (overlay == null || context == null || MediaQuery.maybeDisableAnimationsOf(context) == true) return change();
    unawaited(warm());
    final done = Completer<void>();
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _CupScreen(
        name: name,
        change: change,
        done: () {
          entry.remove();
          entry.dispose();
          if (!done.isCompleted) done.complete();
        },
      ),
    );
    overlay.insert(entry);
    return done.future;
  }
}

class _CupScreen extends StatefulWidget {
  const _CupScreen({required this.name, required this.change, required this.done});
  final String? name;
  final Future<void> Function() change;
  final VoidCallback done;

  @override
  State<_CupScreen> createState() => _CupScreenState();
}

class _CupScreenState extends State<_CupScreen> with SingleTickerProviderStateMixin {
  late final _spin = AnimationController(vsync: this, duration: const Duration(milliseconds: MagicCup.ms));
  bool _changed = false;
  Future<void>? _change;

  @override
  void initState() {
    super.initState();
    _spin.addListener(_tick);
    _spin.forward().whenComplete(_finish);
  }

  void _tick() {
    if (_changed || _spin.value < MagicCup.changeAt) return;
    _changed = true;
    _change = _safely();
  }

  Future<void> _safely() async {
    try {
      await widget.change();
    } catch (e) {
      debugPrint('magic cup: the language: $e');
    }
  }

  Future<void> _finish() async {
    // However it stopped: the language changes all the same.
    if (!_changed) {
      _changed = true;
      _change = _safely();
    }
    await _change;
    if (mounted) widget.done();
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    return AnimatedBuilder(
      animation: _spin,
      builder: (context, _) {
        final t = _spin.value;
        final fade = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1.0;
        return Opacity(
          opacity: fade.clamp(0.0, 1.0),
          child: ColoredBox(
            color: sg.bg.withValues(alpha: 0.94),
            child: Center(
              child: Semantics(
                liveRegion: true,
                label: widget.name,
                child: MagicCupView(value: t, name: widget.name),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// The cup at a point in its spin, 0 to 1, and the language's name under it.
class MagicCupView extends StatelessWidget {
  const MagicCupView({super.key, required this.value, this.name});
  final double value;
  final String? name;

  @override
  Widget build(BuildContext context) => Material(
        type: MaterialType.transparency,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(width: 200, height: 200, child: CustomPaint(painter: _CupPainter(value, MagicCup._texture))),
          if (name != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(name!, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: context.sg.ink))),
        ]),
      );
}

// ---------- the 3D ----------

const _outside = <List<double>>[[0, 0], [0.3, 0], [0.31, 0.03], [0.29, 0.05], [0.36, 0.1], [0.44, 0.3], [0.46, 0.55], [0.44, 0.78], [0.43, 0.9], [0.46, 1]];
const _inside = <List<double>>[[0.46, 1], [0.44, 1], [0.415, 0.9], [0.425, 0.75], [0.43, 0.5], [0.4, 0.25], [0.3, 0.1], [0, 0.08]];
const _teaY = 0.8, _teaR = 0.423;
const _segs = 48;
const _distance = 3.2, _pitch = 0.62;

class _CupPainter extends CustomPainter {
  _CupPainter(this.t, this.texture);
  final double t;
  final ui.Image? texture;

  static final _light = _norm(0.45, 0.75, 0.6);
  static List<double> _norm(double x, double y, double z) {
    final l = math.sqrt(x * x + y * y + z * z);
    return [x / l, y / l, z / l];
  }

  @override
  void paint(Canvas canvas, Size size) {
    final spin = t * MagicCup.turns * 2 * math.pi;
    final cosA = math.cos(spin), sinA = math.sin(spin);
    final cosP = math.cos(_pitch), sinP = math.sin(_pitch);
    final focal = size.shortestSide * 2.05;
    final cx = size.width / 2, cy = size.height / 2;

    // A point of the cup, its middle at the origin, turned by `a` then tipped towards you.
    List<double> view(double x, double y, double z, double c, double s) {
      final rx = x * c + z * s, rz = -x * s + z * c;
      return [rx, y * cosP - rz * sinP, y * sinP + rz * cosP];
    }

    Offset screen(List<double> p) {
      final k = focal / (_distance - p[2]);
      return Offset(cx + p[0] * k, cy - p[1] * k);
    }

    // One side of the cup: the rings of its outline, the faces towards you, shaded as the light has them.
    ({List<Offset> at, List<int> faces, List<Color> shade, List<Offset> uv}) lathe(List<List<double>> outline) {
      final rows = outline.length;
      final at = <Offset>[], shade = <Color>[], uv = <Offset>[], towards = <bool>[];
      final w = (texture?.width ?? 1).toDouble(), h = (texture?.height ?? 1).toDouble();
      for (var r = 0; r < rows; r++) {
        final before = outline[math.max(0, r - 1)], after = outline[math.min(rows - 1, r + 1)];
        // Square to the outline: outwards going up it, and towards the middle coming down the inside.
        var nr = after[1] - before[1], ny = before[0] - after[0];
        final len = math.sqrt(nr * nr + ny * ny);
        nr = len == 0 ? 0 : nr / len;
        ny = len == 0 ? 1 : ny / len;
        for (var s = 0; s <= _segs; s++) {
          final a = s / _segs * 2 * math.pi;
          final ca = math.cos(a), sa = math.sin(a);
          final p = view(outline[r][0] * ca, outline[r][1] - 0.5, outline[r][0] * sa, cosA, sinA);
          final n = view(nr * ca, ny, nr * sa, cosA, sinA);
          at.add(screen(p));
          uv.add(Offset(s / _segs * w, (1 - outline[r][1]) * h));
          towards.add(n[0] * -p[0] + n[1] * -p[1] + n[2] * (_distance - p[2]) > 0);
          final diffuse = math.max(0.0, n[0] * _light[0] + n[1] * _light[1] + n[2] * _light[2]);
          final half = _norm(_light[0], _light[1], _light[2] + 1);
          final gloss = math.pow(math.max(0.0, n[0] * half[0] + n[1] * half[1] + n[2] * half[2]), 40).toDouble();
          shade.add(gloss > 0.04
              ? Colors.white.withValues(alpha: (gloss * 0.75).clamp(0.0, 0.75))
              : const Color(0xFF0B1B3A).withValues(alpha: ((1 - diffuse) * 0.28).clamp(0.0, 0.28)));
        }
      }
      final faces = <int>[];
      final across = _segs + 1;
      for (var r = 0; r < rows - 1; r++) {
        for (var s = 0; s < _segs; s++) {
          final a = r * across + s, b = a + 1, c = a + across, d = c + 1;
          if (towards[a] || towards[b] || towards[c] || towards[d]) faces.addAll([a, c, b, b, c, d]);
        }
      }
      return (at: at, faces: faces, shade: shade, uv: uv);
    }

    Float32List flat(List<Offset> list) {
      final out = Float32List(list.length * 2);
      for (var i = 0; i < list.length; i++) {
        out[i * 2] = list[i].dx;
        out[i * 2 + 1] = list[i].dy;
      }
      return out;
    }

    Int32List colours(List<Color> list) => Int32List.fromList([for (final c in list) c.toARGB32()]);

    void plain(List<Offset> at, List<Color> shade, List<int> faces) {
      final v = ui.Vertices.raw(VertexMode.triangles, flat(at), colors: colours(shade), indices: Uint16List.fromList(faces));
      canvas.drawVertices(v, BlendMode.dst, Paint());
      v.dispose();
    }

    // The inside, its far side showing over the rim.
    final inner = lathe(_inside);
    final white = List<Color>.filled(inner.at.length, const Color(0xFFF4F7FB));
    plain(inner.at, white, inner.faces);
    plain(inner.at, inner.shade, inner.faces);

    // The tea, which doesn't turn with the cup: a wave going round it.
    const rings = 7;
    final tea = <Offset>[], teaColour = <Color>[], teaFaces = <int>[];
    final amp = 0.05 * math.sin(math.pi * t.clamp(0.0, 1.0)) + 0.012;
    Color amber(double lift) => Color.lerp(const Color(0xFF8A5216), const Color(0xFFE0A652), (0.5 + lift * 7).clamp(0.0, 1.0))!;
    double wave(double k, double a) => amp * k * math.cos(a - spin) + 0.007 * math.sin(k * 14 - spin * 2);
    tea.add(screen(view(0, _teaY - 0.5 + wave(0, 0), 0, 1, 0)));
    teaColour.add(amber(0));
    for (var r = 1; r <= rings; r++) {
      final k = r / rings;
      for (var s = 0; s < _segs; s++) {
        final a = s / _segs * 2 * math.pi;
        final lift = wave(k, a);
        tea.add(screen(view(math.cos(a) * _teaR * k, _teaY - 0.5 + lift, math.sin(a) * _teaR * k, 1, 0)));
        teaColour.add(amber(lift));
      }
    }
    for (var s = 0; s < _segs; s++) {
      final n = (s + 1) % _segs;
      teaFaces.addAll([0, 1 + s, 1 + n]);
      for (var r = 0; r < rings - 1; r++) {
        final a = 1 + r * _segs + s, b = 1 + r * _segs + n;
        teaFaces.addAll([a, a + _segs, b + _segs, a, b + _segs, b]);
      }
    }
    plain(tea, teaColour, teaFaces);

    // The side facing you, in front of it all: its picture, then its light and shade.
    final outer = lathe(_outside);
    final image = texture;
    if (image == null) {
      plain(outer.at, List<Color>.filled(outer.at.length, const Color(0xFFE6EEF9)), outer.faces);
    } else {
      final v = ui.Vertices.raw(VertexMode.triangles, flat(outer.at), textureCoordinates: flat(outer.uv), indices: Uint16List.fromList(outer.faces));
      final shader = ImageShader(image, TileMode.repeated, TileMode.clamp, Matrix4.identity().storage, filterQuality: FilterQuality.medium);
      canvas.drawVertices(v, BlendMode.srcOver, Paint()..shader = shader);
      shader.dispose();
      v.dispose();
    }
    plain(outer.at, outer.shade, outer.faces);
  }

  @override
  bool shouldRepaint(_CupPainter old) => old.t != t || old.texture != texture;
}
