// The live map's handle: a button held and dragged to move the camera's angle over the same spot,
// up and down tilting the 3D view and left and right turning it. The drag carries on past the
// button for as long as the finger stays down. A tap says what it's for, as a tooltip's long press
// would take the hold from it.
import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

/// Where a drag on the handle takes the camera, staying over the same spot: up tilts further, down
/// flattens, and sideways turns the view.
CameraPosition orbited(CameraPosition from, Offset drag) => CameraPosition(
      target: from.target,
      zoom: from.zoom,
      tilt: (from.tilt - drag.dy * 0.5).clamp(0.0, 60.0),
      bearing: (from.bearing + drag.dx * 0.8) % 360,
    );

class OrbitHandle extends StatefulWidget {
  const OrbitHandle({super.key, required this.label, required this.builder, required this.onStart, required this.onDrag, required this.onEnd, required this.onTap});

  final String label;

  /// The button's face, by whether it's held.
  final Widget Function(bool held) builder;
  final VoidCallback onStart;

  /// How far the finger's moved since last time, in logical pixels.
  final ValueChanged<Offset> onDrag;
  final VoidCallback onEnd;
  final VoidCallback onTap;

  @override
  State<OrbitHandle> createState() => _OrbitHandleState();
}

class _OrbitHandleState extends State<OrbitHandle> {
  bool _held = false;

  void _start(DragStartDetails _) {
    widget.onStart();
    setState(() => _held = true);
  }

  // Not for a tap, which cancels a pan that never started.
  void _stop() {
    if (!_held) return;
    widget.onEnd();
    if (mounted) setState(() => _held = false);
  }

  /// For a screen reader, which can't drag: one step of it.
  void _step(Offset drag) {
    widget.onStart();
    widget.onDrag(drag);
    widget.onEnd();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: widget.label,
      excludeSemantics: true,
      onTap: widget.onTap,
      onScrollUp: () => _step(const Offset(0, -30)),
      onScrollDown: () => _step(const Offset(0, 30)),
      onScrollLeft: () => _step(const Offset(-30, 0)),
      onScrollRight: () => _step(const Offset(30, 0)),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        // From where the finger came down, so that a small drag counts in full.
        dragStartBehavior: DragStartBehavior.down,
        onTap: widget.onTap,
        onPanStart: _start,
        onPanUpdate: (d) => widget.onDrag(d.delta),
        onPanEnd: (_) => _stop(),
        onPanCancel: _stop,
        child: widget.builder(_held),
      ),
    );
  }
}
