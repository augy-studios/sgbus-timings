// How far you've gone since the last good GPS fix, for the live map in a tunnel or anywhere else
// the fixes stop. The map moves you that far along your route, which is what keeps the estimate on
// the road: there's no heading to drift.
//
// The speed starts from the GPS's own, not the accelerometer's. Working a speed out of the
// accelerometer alone doesn't hold up: a small bias, or a degree of tilt on a sloping tunnel,
// adds up to tens of km/h within a minute or two, and which way the phone sits in a car isn't
// known. So the accelerometer only corrects it:
//
//   Stopped or moving  a car's or a train's vibration, or a walker's steps, stop when you do, so a
//                      quiet few seconds is a stop (a jam in the tunnel) and vibration again is
//                      pulling away, back up to the speed you were going.
//   Braking and speed  the fixes teach which way the phone's forward is, by which way it's pushed
//   changes            as the GPS's speed rises and falls. Once that's sure, a push along it
//                      changes the speed, and the estimate drifts back to the last known speed
//                      over half a minute, so any error stays small.
//
// Fixes come as you move (Locate.watch's distance filter), so none for a while only means they've
// stopped if you were moving fast enough for one to be due. A rough fix doesn't count as one.
import 'dart:math' as math;

class DeadReckon {
  /// A fix this close is one to go by.
  static const goodFixM = 50.0;

  /// No fix for this long, and this far gone at the last fix's speed, and they've stopped.
  static const lostAfterMs = 6000;
  static const dueM = 30.0;

  /// Past this without a fix it's only a guess, and the map stops making it.
  static const maxLostMs = 15 * 60000;

  // Vibration, m/s², gravity aside. A car or train stopped is under stillRms, and one moving is
  // over it. On foot it's the steps: a phone held by someone standing shakes more than a parked
  // car does, but far less than a walk.
  static const stillRms = 0.12;
  static const stillOnFootRms = 0.6;
  static const onFootMs = 3.0; // m/s
  static const _rmsTauS = 1.5;
  static const stillForMs = 3000;
  static const movingForMs = 1000;

  /// A sharp knock like this is the phone being picked up or moved: its forward's not known now.
  static const movedM = 12.0;

  // A forward push under this is road noise, not braking.
  static const _deadband = 0.25;
  // Back to the last known speed, over this long.
  static const _leakS = 30.0;
  // Pulling away from a stop, m/s².
  static const _pullAway = 1.5;
  // About 100 km/h, a little over Singapore's fastest limit.
  static const _capMs = 28.0;

  // What it takes to learn forward: a real change of speed, a real push, and enough that agree.
  static const _learnDv = 0.6;
  static const _learnPush = 0.3;
  static const _learnEvents = 4;
  static const _learnAgree = 0.6;

  /// The speed now, m/s.
  double speed = 0;

  /// The speed you were going at, from the GPS.
  double cruise = 0;

  /// Metres since the last good fix.
  double travelled = 0;

  bool stopped = false;
  bool lost = false;

  int? _fixAt;
  int? _tickAt;
  int? _motionAt;
  double _fixSpeed = 0;
  bool _resuming = false;

  double _power = 0;
  int? _quietSince;
  int? _busySince;

  final _mean = [0.0, 0.0, 0.0];
  int _meanN = 0;
  final _axisSum = [0.0, 0.0, 0.0];
  int _axisEvents = 0;

  /// Which way the phone's forward is, once the fixes have made that sure.
  List<double>? get forward {
    if (_axisEvents < _learnEvents) return null;
    final n = _len(_axisSum);
    if (n / _axisEvents < _learnAgree) return null;
    return [_axisSum[0] / n, _axisSum[1] / n, _axisSum[2] / n];
  }

  static double _len(List<double> v) => math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

  /// A fix from the GPS. A rough one doesn't count, so it doesn't end an estimate.
  void fix({double? speed, double? accuracy, required int at}) {
    if ((accuracy ?? 0) > goodFixM) return;
    final known = speed != null && !speed.isNaN && speed >= 0;
    final v = known ? speed : this.speed;
    if (_fixAt != null && known) _learn(v, (at - _fixAt!) / 1000);
    if (v >= 1) cruise = cruise == 0 ? v : cruise * 0.7 + v * 0.3;
    this.speed = v;
    _fixSpeed = v;
    travelled = 0;
    lost = false;
    stopped = v < 0.5;
    _resuming = false;
    _fixAt = at;
    _tickAt = at;
    _mean.fillRange(0, 3, 0.0);
    _meanN = 0;
  }

  void _learn(double v, double dt) {
    if (dt < 0.5 || dt > 3 || _meanN == 0) return;
    final rate = (v - _fixSpeed) / dt;
    final push = [_mean[0] / _meanN, _mean[1] / _meanN, _mean[2] / _meanN];
    final size = _len(push);
    if (rate.abs() < _learnDv || size < _learnPush) return;
    final sign = rate.sign;
    for (var k = 0; k < 3; k++) {
      _axisSum[k] += push[k] / size * sign;
    }
    _axisEvents++;
  }

  /// A reading from the accelerometer, gravity aside.
  void motion(double x, double y, double z, int at) {
    final dt = _motionAt == null ? 0.0 : math.min((at - _motionAt!) / 1000, 0.5);
    _motionAt = at;
    final m2 = x * x + y * y + z * z;
    if (math.sqrt(m2) >= movedM) {
      _axisSum.fillRange(0, 3, 0.0);
      _axisEvents = 0;
    }
    _power += (m2 - _power) * math.min(dt / _rmsTauS, 1.0);
    final quiet = math.sqrt(_power) < (cruise < onFootMs ? stillOnFootRms : stillRms);
    if (quiet) {
      _busySince = null;
      _quietSince ??= at;
      if (at - _quietSince! >= stillForMs) stopped = true;
    } else {
      _quietSince = null;
      _busySince ??= at;
      if (stopped && at - _busySince! >= movingForMs) {
        stopped = false;
        _resuming = true;
      }
    }
    _mean[0] += x;
    _mean[1] += y;
    _mean[2] += z;
    _meanN++;
    final f = forward;
    if (lost && f != null && !stopped) {
      final along = x * f[0] + y * f[1] + z * f[2];
      if (along.abs() > _deadband) speed += along * dt;
    }
  }

  /// The clock moves on: the speed and how far that's gone, and whether the fixes have stopped.
  void advance(int at) {
    if (_fixAt == null) return;
    final dt = math.min((at - _tickAt!) / 1000, 30.0);
    _tickAt = at;
    // With no readings (no accelerometer, or the app's away), the speed just carries on.
    final sensed = _motionAt != null && at - _motionAt! < 2000;
    if (sensed) {
      if (stopped) {
        speed = 0;
      } else if (_resuming) {
        speed = math.min(cruise, speed + _pullAway * dt);
        if (speed >= cruise) _resuming = false;
      } else {
        speed += (cruise - speed) * math.min(dt / _leakS, 1.0);
      }
    }
    speed = speed.clamp(0.0, math.min(_capMs, math.max(cruise * 1.5, cruise + 3)));
    travelled += speed * dt;
    final gap = at - _fixAt!;
    if (gap > maxLostMs) {
      lost = false;
    } else if (!lost && gap >= lostAfterMs && _fixSpeed * gap / 1000 >= dueM) {
      lost = true;
    }
  }
}

/// The point [metres] along a path.
List<double> pointAlong(List<List<double>> path, double metres, double Function(List<double> a, List<double> b) distance) {
  var left = metres;
  for (var k = 0; k < path.length - 1; k++) {
    final seg = distance(path[k], path[k + 1]);
    if (left <= seg && seg > 0) {
      final t = left < 0 ? 0.0 : left / seg;
      return [path[k][0] + (path[k + 1][0] - path[k][0]) * t, path[k][1] + (path[k + 1][1] - path[k][1]) * t];
    }
    left -= seg;
  }
  return path.last;
}
