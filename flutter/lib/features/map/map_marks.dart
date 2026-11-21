// Icons on the live map (the site's js/map-marks.js, in step with it): where a trip starts and
// ends, as pins; a speech bubble over each stop where you get on or off, its point on the stop;
// and you, as what you're riding: a bus, a train, a car or a bike (an arrow on foot is MapLibre's
// own). Each is drawn here once, by [MarkArt.paint]: as an image for MapLibre (a PNG at the
// screen's density, live_map.dart's sg-mark layer), and straight onto MapPreview's canvas. Words
// are in Roboto, Android's own font, as an image has no theme to take one from.
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:material_ui/material_ui.dart';

/// An icon at a point on the map, `at` [lat, lng], over the lines and dots, higher [z] on top.
class MapMark {
  MapMark(this.at, this.art, {this.z = 0});
  List<double> at;
  MarkArt art;
  final int z;
}

/// How a mark looks: its size in logical pixels, the point of it that sits on the map's point,
/// and how it's drawn. [key] names its image, the same for the same look.
abstract class MarkArt {
  const MarkArt();
  String get key;
  Size get size;

  /// Where on the art the map's point is: 'bottom' (a pin's or a bubble's point) or 'center'.
  String get anchor;
  void paint(Canvas c);

  Offset get anchorOffset => anchor == 'bottom' ? Offset(size.width / 2, size.height) : Offset(size.width / 2, size.height / 2);

  /// The art as a PNG, [ratio] image pixels to a logical one.
  Future<Uint8List> png(double ratio) async {
    final rec = ui.PictureRecorder();
    final c = Canvas(rec)..scale(ratio);
    paint(c);
    final img = await rec.endRecording().toImage((size.width * ratio).ceil(), (size.height * ratio).ceil());
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    img.dispose();
    return data!.buffer.asUint8List();
  }
}

const _navy = Color(0xFF14213D);
const _shadow = Color(0x40000000);
String _hex(Color c) => (c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0');

/// A trip's start (navy) or end (red): a map pin with a white middle.
class PinArt extends MarkArt {
  const PinArt.start() : end = false;
  const PinArt.end() : end = true;
  final bool end;
  static const _start = _navy;
  static const _finish = Color(0xFFE4572E);

  @override
  String get key => end ? 'pin-end' : 'pin-start';
  @override
  Size get size => const Size(30, 40);
  @override
  String get anchor => 'bottom';

  @override
  void paint(Canvas c) {
    const w = 30.0, h = 40.0, r = 13.0;
    const centre = Offset(w / 2, r + 2);
    final pin = Path()
      ..addArc(Rect.fromCircle(center: centre, radius: r), math.pi * 0.78, math.pi * 1.44)
      ..lineTo(w / 2, h - 1)
      ..close();
    c.drawPath(pin.shift(const Offset(0, 1.5)), Paint()
      ..color = _shadow
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2));
    c.drawPath(pin, Paint()..color = end ? _finish : _start);
    c.drawPath(pin, Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2);
    c.drawCircle(centre, 5, Paint()..color = Colors.white);
  }
}

/// A speech bubble with a point at the bottom: "Get off", "Board 67". [fill] its colour.
class BubbleArt extends MarkArt {
  BubbleArt(this.text, {this.fill = _navy, this.icon});
  final String text;
  final Color fill;
  final IconData? icon;

  static const _font = 13.0;
  static const _padX = 10.0, _padY = 6.0, _tail = 7.0, _iconGap = 4.0;

  late final TextPainter _words = TextPainter(
    text: TextSpan(text: text, style: const TextStyle(fontFamily: 'Roboto', color: Colors.white, fontSize: _font, fontWeight: FontWeight.w700, height: 1.1)),
    textDirection: TextDirection.ltr,
    maxLines: 1,
  )..layout(maxWidth: 220);
  late final TextPainter? _glyph = icon == null
      ? null
      : (TextPainter(
          text: TextSpan(
              text: String.fromCharCode(icon!.codePoint),
              style: TextStyle(fontFamily: icon!.fontFamily, package: icon!.fontPackage, fontSize: _font + 2, color: Colors.white, height: 1)),
          textDirection: TextDirection.ltr,
        )..layout());

  double get _iconW => _glyph == null ? 0 : _glyph.width + _iconGap;

  @override
  String get key => 'bubble-${_hex(fill)}-${icon?.codePoint ?? 0}-$text';
  @override
  Size get size => Size(_words.width + _iconW + _padX * 2 + 2, _words.height + _padY * 2 + _tail + 2);
  @override
  String get anchor => 'bottom';

  @override
  void paint(Canvas c) {
    final s = size;
    final box = RRect.fromRectAndRadius(Rect.fromLTWH(1, 1, s.width - 2, s.height - _tail - 2), const Radius.circular(9));
    final tail = Path()
      ..moveTo(s.width / 2 - _tail, box.bottom - 0.5)
      ..lineTo(s.width / 2, s.height - 1)
      ..lineTo(s.width / 2 + _tail, box.bottom - 0.5)
      ..close();
    final shape = Path()
      ..addRRect(box)
      ..addPath(tail, Offset.zero);
    c.drawPath(shape.shift(const Offset(0, 1)), Paint()
      ..color = _shadow
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5));
    c.drawPath(shape, Paint()..color = fill);
    var x = box.left + _padX;
    if (_glyph != null) {
      _glyph.paint(c, Offset(x, box.top + (box.height - _glyph.height) / 2));
      x += _iconW;
    }
    _words.paint(c, Offset(x, box.top + (box.height - _words.height) / 2));
  }
}

/// You, as what you're riding: a round badge in its colour, ringed in white, with its icon.
class RideArt extends MarkArt {
  const RideArt(this.kind, this.fill);

  /// bus, train, car or bike.
  final String kind;
  final Color fill;

  IconData get icon => switch (kind) {
        'train' => Icons.directions_subway_filled,
        'car' => Icons.directions_car_filled,
        'bike' => Icons.pedal_bike,
        _ => Icons.directions_bus_filled,
      };

  @override
  String get key => 'ride-$kind-${_hex(fill)}';
  @override
  Size get size => const Size(40, 40);
  @override
  String get anchor => 'center';

  @override
  void paint(Canvas c) {
    const centre = Offset(20, 20);
    c.drawCircle(centre.translate(0, 1.5), 17, Paint()
      ..color = _shadow
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5));
    c.drawCircle(centre, 17, Paint()..color = Colors.white);
    c.drawCircle(centre, 14, Paint()..color = fill);
    final glyph = TextPainter(
      text: TextSpan(text: String.fromCharCode(icon.codePoint), style: TextStyle(fontFamily: icon.fontFamily, package: icon.fontPackage, fontSize: 18, color: Colors.white, height: 1)),
      textDirection: TextDirection.ltr,
    )..layout();
    glyph.paint(c, centre - Offset(glyph.width / 2, glyph.height / 2));
  }
}
