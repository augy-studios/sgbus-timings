// The live map's stick: a side button held and dragged to slide the map, the map going the way the
// stick is dragged and faster the further it's held, for as long as it's held. A stick and not
// the map following the finger, as the button sits at the screen's edge with little room to drag.
// A tap says what it's for, as a tooltip's long press would take the hold from it.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';

class MapStick extends StatefulWidget {
  const MapStick({super.key, required this.builder, required this.onStart, required this.onSlide, required this.onTap});

  /// The button's face, by whether it's held.
  final Widget Function(bool held) builder;
  final VoidCallback onStart;

  /// How far the map's picture moves now, in logical pixels.
  final ValueChanged<Offset> onSlide;
  final VoidCallback onTap;

  /// How far the stick goes from where it rests, in logical pixels.
  static const reach = 44.0;

  /// How far it's held before the map moves, so that a shaking thumb doesn't move it.
  static const rest = 4.0;

  /// The map's speed at the stick's full reach, in logical pixels a second.
  static const topSpeed = 700.0;

  /// Where a drag leaves the stick: as far as it's dragged, up to its reach.
  static Offset held(Offset dragged) {
    final d = dragged.distance;
    return d <= reach ? dragged : dragged * (reach / d);
  }

  /// The map's speed with the stick held there, in logical pixels a second: its way, and slow to
  /// begin with, for fine moves.
  static Offset speed(Offset held) {
    final d = held.distance;
    if (d <= rest) return Offset.zero;
    final f = math.min((d - rest) / (reach - rest), 1.0);
    return held / d * (topSpeed * f * f);
  }

  @override
  State<MapStick> createState() => _MapStickState();
}

class _MapStickState extends State<MapStick> {
  Offset _held = Offset.zero;
  bool _holding = false;
  Timer? _timer;
  final _clock = Stopwatch();

  void _start(DragStartDetails _) {
    widget.onStart();
    _clock
      ..reset()
      ..start();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 16), (_) => _tick());
    setState(() {
      _holding = true;
      _held = Offset.zero;
    });
  }

  void _tick() {
    final seconds = _clock.elapsedMicroseconds / 1000000;
    _clock
      ..reset()
      ..start();
    final v = MapStick.speed(_held);
    if (v != Offset.zero) widget.onSlide(v * seconds);
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
    _clock.stop();
    if (mounted) {
      setState(() {
        _holding = false;
        _held = Offset.zero;
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      // From where the finger came down, as there's little room to the screen's edge to lose any.
      dragStartBehavior: DragStartBehavior.down,
      onTap: widget.onTap,
      onPanStart: _start,
      onPanUpdate: (d) => setState(() => _held = MapStick.held(_held + d.delta)),
      onPanEnd: (_) => _stop(),
      onPanCancel: _stop,
      child: Transform.translate(offset: _held, child: widget.builder(_holding)),
    );
  }
}
