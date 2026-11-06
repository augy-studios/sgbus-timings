import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/map/tilt_or_pan.dart';

void main() {
  const left = Offset(100, 500);
  const right = Offset(300, 500);

  /// Two fingers side by side, each dragged by its own amount in ten steps.
  TiltOrPan drag(Offset a, Offset b) {
    final g = TiltOrPan()
      ..down(1, left)
      ..down(2, right);
    for (var i = 1; i <= 10; i++) {
      g
        ..move(1, left + a * (i / 10))
        ..move(2, right + b * (i / 10));
    }
    return g;
  }

  test('starts with tilting off', () {
    final g = TiltOrPan()
      ..down(1, left)
      ..down(2, right);
    expect(g.tilt, isFalse);
  });

  test('a drag straight up or down tilts', () {
    expect(drag(const Offset(0, -100), const Offset(0, -100)).tilt, isTrue);
    expect(drag(const Offset(0, 100), const Offset(0, 100)).tilt, isTrue);
    expect(drag(const Offset(10, -100), const Offset(-5, -100)).tilt, isTrue);
  });

  test('a sideways or slanting drag pans', () {
    expect(drag(const Offset(100, 0), const Offset(100, 0)).tilt, isFalse);
    expect(drag(const Offset(100, -60), const Offset(100, -60)).tilt, isFalse);
    expect(drag(const Offset(-100, 100), const Offset(-100, 100)).tilt, isFalse);
  });

  test('a pinch, with the fingers going opposite ways, does not tilt', () {
    expect(drag(const Offset(0, -60), const Offset(0, 80)).tilt, isFalse);
    expect(drag(const Offset(-80, 0), const Offset(80, 0)).tilt, isFalse);
  });

  test('it is decided once: a pan that turns upward stays a pan', () {
    final g = drag(const Offset(100, 0), const Offset(100, 0));
    g
      ..move(1, left + const Offset(100, -300))
      ..move(2, right + const Offset(100, -300));
    expect(g.tilt, isFalse);
  });

  test('one finger never tilts', () {
    final g = TiltOrPan()
      ..down(1, left)
      ..move(1, left + const Offset(0, -200));
    expect(g.tilt, isFalse);
  });

  test('lifting a finger ends the tilt, and the next two fingers start afresh', () {
    final g = drag(const Offset(0, -100), const Offset(0, -100));
    expect(g.tilt, isTrue);
    g.up(2);
    expect(g.tilt, isFalse);
    g
      ..up(1)
      ..down(3, left)
      ..down(4, right)
      ..move(3, left + const Offset(100, 0))
      ..move(4, right + const Offset(100, 0));
    expect(g.tilt, isFalse);
  });

  test('a finger it never saw come down is ignored', () {
    final g = TiltOrPan()
      ..down(1, left)
      ..down(2, right)
      ..move(9, const Offset(0, 0));
    expect(g.tilt, isFalse);
  });
}
