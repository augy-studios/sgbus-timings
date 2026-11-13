// Spots two fingers dragging the map together. While it's following you, MapLibre ignores two
// fingers moving until they've gone a very long way, so that a pinch can't pull the dot off centre,
// and two-finger panning stops working. So a drag is seen here and following let go, which puts its
// usual threshold back. It adds up each finger's way from where it started, as a slow drag on a phone
// moves too little between one touch event and the next to tell. A pinch or a twist moves the
// fingers apart or around, and doesn't count.
import 'package:flutter/widgets.dart' show Offset;

class TwoFingerDrag {
  /// In logical pixels.
  static const _together = 16.0;
  static const _eachFinger = 8.0;

  final Map<int, Offset> _start = {};
  final Map<int, Offset> _now = {};

  /// How many fingers are down.
  int get count => _now.length;

  void down(int pointer, Offset at) {
    _now[pointer] = at;
    _start
      ..clear()
      ..addAll(_now);
  }

  void up(int pointer) {
    _now.remove(pointer);
    _start
      ..clear()
      ..addAll(_now);
  }

  /// Whether this move makes it a drag.
  bool move(int pointer, Offset at) {
    if (!_now.containsKey(pointer)) return false;
    _now[pointer] = at;
    if (_now.length != 2) return false;
    final moves = [for (final e in _now.entries) e.value - _start[e.key]!];
    final a = moves.first, b = moves.last;
    return a.distance >= _eachFinger && b.distance >= _eachFinger && a.dx * b.dx + a.dy * b.dy > 0 && ((a + b) / 2).distance >= _together;
  }
}
