// When a journey is for (the site's When.picker, js/when.js): Leave now, Leave at or Arrive by,
// and for the last two a day (today and the six after it) and a time, in five-minute steps. A
// first pick starts on the next five minutes, or half an hour on for Arrive by.
import 'package:flutter/material.dart';

import '../../data/when.dart';
import '../../i18n/i18n.dart';

class WhenPicker extends StatelessWidget {
  const WhenPicker({super.key, required this.value, required this.onChanged});
  final WhenPick? value;
  final void Function(WhenPick?) onChanged;

  String get _mode => value?.mode ?? 'now';

  Future<void> _pickTime(BuildContext context) async {
    final w = value;
    if (w == null) return;
    final ms = When.atToMs(w.at) ?? When.nowMs();
    final c = When.sgClock(ms);
    final t = await showTimePicker(context: context, initialTime: TimeOfDay(hour: c.min ~/ 60, minute: c.min % 60));
    if (t == null) return;
    final m = (t.minute / When.stepMin).round() * When.stepMin;
    final hh = (t.hour + m ~/ 60).toString().padLeft(2, '0');
    final mm = (m % 60).toString().padLeft(2, '0');
    onChanged(WhenPick(w.mode, '${c.ymd}T$hh:$mm'));
  }

  @override
  Widget build(BuildContext context) {
    final days = [for (var i = 0; i < When.daysAhead; i++) When.nowMs() + i * 86400000];
    final w = value;
    final ymd = w?.at.split('T').first;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SegmentedButton<String>(
        showSelectedIcon: false,
        segments: [
          ButtonSegment(value: 'now', label: Text(tr('nav.leave_now', 'Leave now'))),
          ButtonSegment(value: 'leave', label: Text(tr('nav.leave_at', 'Leave at'))),
          ButtonSegment(value: 'arrive', label: Text(tr('nav.arrive_by', 'Arrive by'))),
        ],
        selected: {_mode},
        onSelectionChanged: (s) {
          final mode = s.first;
          if (mode == 'now') return onChanged(null);
          final keep = w != null && When.problem(WhenPick(mode, w.at)) == null;
          onChanged(WhenPick(mode, keep ? w.at : When.msToAt(When.firstPick(mode))));
        },
      ),
      if (w != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: days.map((d) => When.sgClock(d).ymd).contains(ymd) ? ymd : When.sgClock(days.first).ymd,
                decoration: InputDecoration(labelText: tr('when.day', 'Day'), isDense: true),
                items: [
                  for (final d in days)
                    DropdownMenuItem(
                      value: When.sgClock(d).ymd,
                      child: Text(() {
                        final l = When.dayLabel(d);
                        return l.isEmpty ? l : '${l[0].toUpperCase()}${l.substring(1)}';
                      }()),
                    ),
                ],
                onChanged: (v) => v == null ? null : onChanged(WhenPick(w.mode, '${v}T${w.at.split('T').last}')),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: () => _pickTime(context),
              icon: const Icon(Icons.schedule),
              label: Text(w.at.split('T').last),
            ),
          ]),
        ),
    ]);
  }
}
