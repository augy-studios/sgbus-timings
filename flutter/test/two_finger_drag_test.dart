import 'package:flutter_test/flutter_test.dart';
import 'package:sgbus_timings/features/map/two_finger_drag.dart';

void main() {
  bool drag(Offset a, Offset b, {int steps = 10}) {
    final d = TwoFingerDrag();
    const startA = Offset(100, 300), startB = Offset(200, 300);
    d.down(1, startA);
    d.down(2, startB);
    var dragged = false;
    for (var step = 1; step <= steps; step++) {
      dragged = d.move(1, startA + a * (step / steps)) || dragged;
      dragged = d.move(2, startB + b * (step / steps)) || dragged;
    }
    return dragged;
  }

  test('both going the same way is a drag, in any direction', () {
    expect(drag(const Offset(0, 100), const Offset(0, 100)), isTrue);
    expect(drag(const Offset(0, -100), const Offset(0, -100)), isTrue);
    expect(drag(const Offset(-100, 20), const Offset(-100, 20)), isTrue);
  });

  test('a slow drag counts, however little it moves between touch events', () {
    expect(drag(const Offset(0, 40), const Offset(0, 40), steps: 80), isTrue);
  });

  test('a pinch, a twist and a small tremble are not', () {
    expect(drag(const Offset(-100, 0), const Offset(100, 0)), isFalse);
    expect(drag(const Offset(0, -100), const Offset(0, 100)), isFalse);
    expect(drag(const Offset(0, 100), Offset.zero), isFalse);
    expect(drag(const Offset(5, 5), const Offset(5, 5)), isFalse);
  });

  test('one finger is not, and a finger lifting starts again', () {
    final d = TwoFingerDrag();
    d.down(1, const Offset(100, 300));
    expect(d.count, 1);
    expect(d.move(1, const Offset(100, 500)), isFalse);
    d.down(2, const Offset(200, 500));
    expect(d.count, 2);
    expect(d.move(1, const Offset(100, 502)), isFalse);
    d.up(2);
    expect(d.count, 1);
    expect(d.move(1, const Offset(100, 700)), isFalse);
  });
}
