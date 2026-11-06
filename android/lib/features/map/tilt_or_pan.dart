// Two fingers on the live map: a pan or a tilt, decided once per gesture.
//
// MapLibre's Android map tilts as soon as two fingers side by side have drifted 16dp up or down
// in all, and turns panning off until they lift. Fingers always drift that much, so a two-finger
// drag only ever panned for its first moment, then tilted. So tilting stays off (LiveMap's
// tiltGesturesEnabled) until the fingers' first move says it's meant: both going the same way, up
// or down, close to straight. Anything else stays a pan. MapLibre asks again on every move, so a
// tilt allowed here starts at once. A pinch or a twist leaves the fingers' midpoint where it is,
// so they aren't decided here and tilting stays off for them.
import 'dart:ui' show Offset;

class TiltOrPan {
  /// How far the fingers' midpoint moves before it's decided, in logical pixels: under MapLibre's
  /// 16dp, so that a tilt is allowed by the time it would start.
  static const slop = 10.0;

  /// How many times further up or down than across counts as close to straight (about 27°).
  static const steep = 2.0;

  final Map<int, Offset> _at = {};
  Map<int, Offset> _start = {};
  bool _decided = false;

  /// Whether the fingers now on the map may tilt it.
  bool tilt = false;

  void down(int pointer, Offset at) {
    _at[pointer] = at;
    _restart();
  }

  void up(int pointer) {
    _at.remove(pointer);
    _restart();
  }

  void move(int pointer, Offset at) {
    if (!_at.containsKey(pointer)) return;
    _at[pointer] = at;
    if (_decided || _at.length != 2) return;
    final moved = [for (final e in _at.entries) e.value - _start[e.key]!];
    final mid = (moved[0] + moved[1]) / 2;
    if (mid.distance < slop) return;
    _decided = true;
    tilt = moved[0].dy * moved[1].dy > 0 && mid.dy.abs() >= steep * mid.dx.abs();
  }

  // A finger more or less is a new gesture, for MapLibre too.
  void _restart() {
    _start = Map.of(_at);
    _decided = false;
    tilt = false;
  }
}
