// The app's smaller habits, as the site has them:
//
// Picture-in-picture (js/pip.js): while a trip runs or the live map is open, leaving the app
// shrinks it into a small window over other apps instead of hiding it, tall for the map and
// wide for the trip's line of text, and while it's small only that shows. The app does the
// shrinking (MainActivity, SgBusPlugin.pip); this says when it's wanted, checked every
// checkMs, and sent only when the answer changes. Settings' Picture-in-picture turns it off
// (sgbus_pip).
//
// Shake to refresh (js/shake.js): a firm shake refreshes the stop's timings on screen, for a
// hand that's holding on to a pole. Several sharp swings back and forth within a second: the
// push of a bus pulling away or braking is one way at a time, and its bumps are far softer.
// Off in Settings (sgbus_shake).
//
// Asking for a coffee (js/donate.js), once every six months: a small window with the Edge
// Tray's Buy Augy a Coffee link and Not now. Never in the first weeks (open on minDays
// different days, the first minAgeDays ago), and never on top of anything: not on a trip,
// offline, during the first open's choice, with a screen open over the pages, or with Buy
// Augy a Coffee turned off in the Edge Tray's buttons (that's an answer already). Shown a
// little after the app's opened, on Glance or Bus timings. Kept as { first, days, last }.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../../api/net.dart';
import '../../app/edge_tray.dart';
import '../../app/nav.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../map/live_map.dart';
import '../trips/trip.dart';

void registerExtras() {
  Pip.start();
  Shake.start();
  Donate.start();
}

// ---------- picture-in-picture ----------

class Pip {
  Pip._();
  static const checkMs = 1500;
  static const offKey = 'sgbus_pip';
  static String? _sent;

  static bool get enabled => Store.I.get(offKey) != 'off';

  static void start() {
    if (!Native.has('pip')) return;
    Native.on('SgBus', 'pip', (d) => AppNav.pip.value = d['active'] == true);
    AppNav.pipView = () => LiveMap.isOpen || !Trip.I.active ? null : const _TripSmall();
    Timer.periodic(const Duration(milliseconds: checkMs), (_) => check());
    check();
  }

  static Map<String, Object> wanted() {
    if (!enabled) return {'auto': false};
    if (LiveMap.isOpen) return {'auto': true, 'ratio': [3, 4]};
    if (Trip.I.active) return {'auto': true, 'ratio': [16, 9]};
    return {'auto': false};
  }

  static void check() {
    final w = wanted();
    final key = '${w['auto']}${w['ratio']}';
    if (key == _sent) return;
    _sent = key;
    Native.call('SgBus', 'pip', w).catchError((_) {
      _sent = null;
      return null;
    });
  }
}

/// A trip, small: where it's going and how it's going, big enough to read in a corner.
class _TripSmall extends StatelessWidget {
  const _TripSmall();

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Trip.I,
        builder: (context, _) {
          final sg = context.sg;
          final t = Trip.I;
          return Material(
            color: sg.brand,
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Row(children: [
                Icon(t.current?.kind == 'train' ? Icons.directions_subway_filled : t.current?.kind == 'walk' ? Icons.directions_walk : Icons.directions_bus,
                    color: sg.onBrand, size: 28),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sg.onBrand, fontWeight: FontWeight.w700)),
                    Text(t.barText(), maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(color: sg.onBrand)),
                  ]),
                ),
              ]),
            ),
          );
        },
      );
}

// ---------- shake to refresh ----------

class Shake {
  Shake._();
  static const key = 'sgbus_shake';
  // m/s², gravity aside: a deliberate shake goes well past this, a bus ride doesn't.
  static const hard = 14.0;
  static const swings = 4;
  static const withinMs = 1000;
  static const restMs = 4000;

  /// What a shake refreshes: the stop's timings on screen, set while one's shown.
  static VoidCallback? onShake;

  static final List<int> _swings = [];
  static int _lastSign = 0;
  static int _restUntil = 0;
  static StreamSubscription<UserAccelerometerEvent>? _sub;

  static bool get enabled => Store.I.get(key) != 'off';

  static void start() {
    if (!Native.available) return;
    try {
      _sub = userAccelerometerEventStream(samplingPeriod: SensorInterval.gameInterval).listen(_onMotion, onError: (_) => _sub?.cancel(), cancelOnError: true);
    } catch (_) {
      // No accelerometer: no shake.
    }
  }

  static void _onMotion(UserAccelerometerEvent e) {
    // The axis it's swinging along most.
    final axis = [e.x, e.y, e.z].reduce((m, v) => v.abs() > m.abs() ? v : m);
    if (axis.abs() < hard) return;
    final sign = axis.sign.toInt();
    if (sign == _lastSign) return;
    _lastSign = sign;
    final now = DateTime.now().millisecondsSinceEpoch;
    _swings.removeWhere((t) => now - t >= withinMs);
    _swings.add(now);
    if (_swings.length >= swings && now > _restUntil) {
      _swings.clear();
      _restUntil = now + restMs;
      _shaken();
    }
  }

  static void _shaken() {
    final shown = WidgetsBinding.instance.lifecycleState;
    if (!enabled || onShake == null || (shown != null && shown != AppLifecycleState.resumed)) return;
    HapticFeedback.lightImpact();
    onShake!();
  }
}

// ---------- asking for a coffee ----------

class Donate {
  Donate._();
  static const key = 'sgbus_donate';
  static const dayMs = 24 * 60 * 60 * 1000;
  static const everyDays = 182;
  static const minDays = 5;
  static const minAgeDays = 14;
  static const waitMs = 20 * 1000;
  static const link = 'https://donate.stripe.com/28o2akeAr3hv0DK6oo';

  static String _today() {
    final sg = DateTime.now().toUtc().add(const Duration(hours: 8));
    return '${sg.year}-${'${sg.month}'.padLeft(2, '0')}-${'${sg.day}'.padLeft(2, '0')}';
  }

  static Map<String, dynamic>? _read() {
    final v = Store.I.json<Object?>(key, null);
    return v is Map && v['first'] is num && v['days'] is List ? Map<String, dynamic>.from(v) : null;
  }

  static bool due(Map<String, dynamic> v) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if ((v['days'] as List).length < minDays || now - (v['first'] as num) < minAgeDays * dayMs) return false;
    return now - ((v['last'] as num?) ?? 0) >= everyDays * dayMs;
  }

  /// Today counted as a day the app was open.
  static Map<String, dynamic> count() {
    final v = _read() ?? {'first': DateTime.now().millisecondsSinceEpoch, 'days': <String>[], 'last': 0};
    final days = [for (final d in v['days'] as List) '$d'];
    final d = _today();
    if (days.length < minDays && !days.contains(d)) days.add(d);
    v['days'] = days;
    Store.I.putJson(key, v);
    return v;
  }

  static bool _quiet() {
    if (Store.I.get('sgbus_first_run') == 'ask') return false;
    if (Net.off.value || Trip.I.active || LiveMap.isOpen) return false;
    if (EdgeTray.hidden().contains('coffee')) return false;
    final shown = WidgetsBinding.instance.lifecycleState;
    if (shown != null && shown != AppLifecycleState.resumed) return false;
    // Nothing open over the pages.
    if (AppNav.nav?.canPop() ?? true) return false;
    final on = AppNav.page.value;
    return on == 'glance' || on == 'timings';
  }

  static void start() {
    final v = count();
    if (!due(v)) return;
    Timer(const Duration(milliseconds: waitMs), show);
  }

  static void show() {
    final v = _read();
    final context = AppNav.context;
    if (v == null || !due(v) || !_quiet() || context == null) return;
    v['last'] = DateTime.now().millisecondsSinceEpoch;
    Store.I.putJson(key, v);
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.coffee_outlined),
        title: Text(tr('donate.love_sg_bus_timings', 'Love SG Bus Timings?')),
        content: Text(tr('donate.consider_donating_it_helps_us', 'Consider donating! It helps us keep it up and running 24/7.')),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(tr('donate.not_now', 'Not now'))),
          FilledButton(
            onPressed: () {
              Navigator.of(context).pop();
              Native.call('SgBus', 'openLink', {'url': link}).catchError((_) => null);
            },
            child: Text(tr('donate.donate', 'Donate')),
          ),
        ],
      ),
    );
  }

}
