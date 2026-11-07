// Theme (the site's theme window): Material You first, the Android app's own (on by default,
// 2.4.0: no longer an Easter egg's secret), then light, dark, by the clock or the phone's, the
// UwU Apps theme's brand colour, High contrast, Your colours (still a secret an egg unlocks, as on
// the site: one colour on the colour wheel, or a preset an egg brought, and the whole theme made
// from it), and the Easter eggs found.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/eggs_data.dart';
import '../../data/gta6.dart';
import '../../data/rewards.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../theme/colours.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import 'settings_screen.dart';

class ThemeScreen extends StatefulWidget {
  const ThemeScreen({super.key});

  static void open() => AppNav.push(const ThemeScreen(), name: 'theme');

  @override
  State<ThemeScreen> createState() => _ThemeScreenState();
}

class _ThemeScreenState extends State<ThemeScreen> {
  String? _draft; // a colour picked but not kept yet
  String? _draftPreset;

  AppLook get look => AppLook.I;

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final yc = look.yourColours;
    final unlocked = EggsData.coloursUnlocked();
    final found = EggsData.found();
    final modeNote = look.modePreference == 'time'
        ? (AppLook.daylight() ? tr('theme.note.light', 'Following the clock. Currently light.') : tr('theme.note.dark', 'Following the clock. Currently dark.'))
        : null;
    return SgScaffold(
      title: tr('theme.title', 'Theme'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        // ---- Material You ----
        SgCard(
          child: SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: look.materialYou,
            onChanged: (on) => setState(() => look.materialYou = on),
            title: Text(tr('theme.materialYou', 'Material You'), style: Theme.of(context).textTheme.titleMedium),
            subtitle: Text(tr('theme.materialYouNote', 'Turn off for the UwU Apps theme.')),
          ),
        ),
        // ---- Material You's colours: the wallpaper's, unless GTA VI's or Your colours are picked ----
        if (look.materialYou)
          Choice(
            label: tr('theme.youColours', 'Colours'),
            value: look.youColours,
            options: [
              ('phone', tr('theme.youColours.phone', 'Your phone’s')),
              if (Gta6.canPick) (AppLook.gta6, tr('theme.gta6', 'GTA VI')),
              if (yc != null) ('yours', tr('theme.youColours.yours', 'Your colours')),
            ],
            onChanged: (v) => setState(() => look.youColours = v),
          ),
        if (look.materialYou) ..._gta6Note(sg),
        // ---- light or dark ----
        Choice(
          label: tr('theme.mode', 'Mode'),
          value: look.modePreference,
          options: [
            ('light', tr('theme.light', 'Light')),
            ('dark', tr('theme.dark', 'Dark')),
            ('time', tr('theme.time', 'Time-based')),
            ('phone', tr('theme.contrast.auto', 'Phone’s setting')),
          ],
          onChanged: (v) => setState(() => look.modePreference = v),
          note: modeNote,
        ),
        // ---- the UwU Apps theme's brand colour ----
        if (!look.materialYou) ...[
          Text(tr('theme.brand', 'Brand colour'), style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (yc != null)
            Text(tr('theme.brandAway', 'Your colours are on. The brand colours come back with Back to the usual colours.'), style: TextStyle(color: sg.muted, fontSize: 13))
          else
            Wrap(spacing: 10, runSpacing: 10, children: [
              for (final s in AppLook.swatches)
                if (s.id != AppLook.gta6 || Gta6.canPick || Coins.shown)
                Tooltip(
                  message: s.id == 'classic'
                      ? tr('theme.classic', 'Classic')
                      : s.id == 'really-light-green'
                          ? tr('theme.reallyLight', 'Really really light green')
                          : s.id == AppLook.gta6
                              ? tr('theme.gta6', 'GTA VI')
                              : tr('theme.notGreen', 'Not green {n}', {'n': s.id.split('-').last}),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => s.id == AppLook.gta6 && !Gta6.canPick ? AppNav.open('coins') : setState(() => look.swatchId = s.id),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Color(s.hex),
                        gradient: s.dot == null ? null : LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: s.dot!),
                        shape: BoxShape.circle,
                        border: Border.all(color: look.swatchId == s.id ? sg.ink : sg.border, width: look.swatchId == s.id ? 3 : 1),
                      ),
                      child: s.id == AppLook.gta6 && !Gta6.canPick ? const Icon(Icons.lock_outline, color: Colors.white, size: 20) : null,
                    ),
                  ),
                ),
            ]),
          if (yc == null) ..._gta6Note(sg),
          const SizedBox(height: 8),
        ],
        // ---- High contrast ----
        Choice(
          label: tr('theme.contrast', 'High contrast'),
          value: look.contrast,
          options: [('auto', tr('theme.contrast.auto', 'Phone’s setting')), ('on', tr('theme.contrast.on', 'On')), ('off', tr('theme.contrast.off', 'Off'))],
          onChanged: (v) => setState(() => look.contrast = v),
          note: tr('theme.contrast.note', 'Darker text, solid cards and clear edges, for reading in bright light or with low vision.'),
        ),
        // ---- Your colours ----
        if (unlocked) ...[
          SectionLabel(tr('colours.title', 'Your colours')),
          SgCard(child: _yourColours(yc)),
        ],
        // ---- the eggs found ----
        if (found.isNotEmpty) ...[
          SectionLabel(tr('eggs.title', 'Easter eggs')),
          SgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tr('eggs.count', '{n} of {all} Easter eggs found', {'n': found.length, 'all': EggsData.all.length}), style: TextStyle(color: sg.muted)),
              const SizedBox(height: 6),
              for (final id in found) Text('• ${EggsData.byId(id)!.name()}'),
            ]),
          ),
        ],
      ]),
    );
  }

  // How to keep GTA VI's colours, or where to win them. Nothing once they're theirs.
  List<Widget> _gta6Note(SgColors sg) {
    if (Gta6.owned) return const [];
    if (Gta6.open) {
      return [
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 8),
          child: Text(tr('gta6.setNote', 'Set GTA VI before 26 November to keep it for good.'), style: TextStyle(color: sg.muted, fontSize: 13)),
        ),
      ];
    }
    if (!Coins.shown) return const [];
    return [
      Row(children: [
        Expanded(child: Text(tr('gta6.locked', 'Win GTA VI on the uwuCoins wheel.'), style: TextStyle(color: sg.muted, fontSize: 13))),
        TextButton(onPressed: () => AppNav.open('coins'), child: Text(tr('coins.spinGo', 'Spin the wheel'))),
      ]),
    ];
  }

  Widget _yourColours(Map<String, dynamic>? yc) {
    final sg = context.sg;
    final base = _draft ?? (yc?['base'] as String?) ?? Colours.classic;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final t = Colours.derive(base, dark ? 'dark' : 'light');
    final button = hexColor(t['--brand']!);
    final adjusted = t['--brand']!.toLowerCase() != base.toLowerCase();
    final presets = [EggPreset('classic', Colours.classic, () => tr('theme.classic', 'Classic')), ...EggsData.presets()];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Center(
        child: _Wheel(
          colour: hexColor(base),
          onChanged: (c) => setState(() {
            _draft = Colours.toHex((c.r * 255), (c.g * 255), (c.b * 255));
            _draftPreset = null;
          }),
        ),
      ),
      const SizedBox(height: 12),
      // The sample: a card, its text, its softer text and a button, as the theme would have them.
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: hexColor(t['--bg']!), borderRadius: BorderRadius.circular(16)),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: hexColor(t['--surface']!),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: hexColor(t['--surface-border']!)),
          ),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tr('colours.sampleCard', 'A card'), style: TextStyle(color: hexColor(t['--brand-ink']!), fontWeight: FontWeight.w700)),
                Text(tr('colours.sample', 'Sample text'), style: TextStyle(color: hexColor(t['--ink']!))),
                Text(tr('colours.sampleSoft', 'and its softer text'), style: TextStyle(color: hexColor(t['--muted']!))),
              ]),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: button, borderRadius: BorderRadius.circular(12)),
              child: Text(tr('colours.sampleButton', 'A button'), style: TextStyle(color: hexColor(t['--on-brand']!))),
            ),
          ]),
        ),
      ),
      if (adjusted)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            tr('colours.adjusted', 'The buttons are a little {way} than the colour picked, so their text is easy to read.', {
              'way': Colours.luminance(t['--brand']!) > Colours.luminance(base) ? tr('colours.lighter', 'lighter') : tr('colours.darker', 'darker'),
            }),
            style: TextStyle(color: sg.muted, fontSize: 13),
          ),
        ),
      SectionLabel(tr('colours.presets', 'Presets')),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final p in presets)
          Pill(
            label: p.name(),
            on: (_draftPreset ?? yc?['preset']) == p.id,
            onTap: () => setState(() {
              _draft = p.base;
              _draftPreset = p.id;
            }),
          ),
      ]),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        FilledButton(
          onPressed: () {
            Store.I.putJson(AppLook.coloursKey, Colours.keep(base, _draftPreset));
            setState(() => _draft = null);
            look.changed();
          },
          child: Text(tr('colours.keepOne', 'Use this colour')),
        ),
        if (yc != null)
          OutlinedButton(
            onPressed: () {
              Store.I.remove(AppLook.coloursKey);
              setState(() => _draft = null);
              look.changed();
            },
            child: Text(tr('colours.reset', 'Back to the usual colours')),
          ),
      ]),
      // Only once every line's really been ridden, not for the egg alone.
      if (Feats.done().contains('lines'))
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Center(
            child: TextButton.icon(
              onPressed: () => AppNav.open('celebrationAgain'),
              icon: const Icon(Icons.celebration_outlined),
              label: Text(tr('colours.replay', 'Watch the celebration again')),
            ),
          ),
        ),
    ]);
  }
}

// The colour wheel (the site's js/wheel.js): hue round it, saturation out from the middle, and
// brightness on the slider under it.
class _Wheel extends StatefulWidget {
  const _Wheel({required this.colour, required this.onChanged});
  final Color colour;
  final void Function(Color) onChanged;

  @override
  State<_Wheel> createState() => _WheelState();
}

class _WheelState extends State<_Wheel> {
  late HSVColor _hsv = HSVColor.fromColor(widget.colour);

  @override
  void didUpdateWidget(covariant _Wheel old) {
    super.didUpdateWidget(old);
    if (old.colour != widget.colour && widget.colour != _hsv.toColor()) _hsv = HSVColor.fromColor(widget.colour);
  }

  void _at(Offset p, double size) {
    final c = Offset(size / 2, size / 2);
    final d = p - c;
    final s = (d.distance / (size / 2)).clamp(0.0, 1.0);
    final h = (math.atan2(d.dy, d.dx) * 180 / math.pi + 360) % 360;
    setState(() => _hsv = _hsv.withHue(h).withSaturation(s));
    widget.onChanged(_hsv.toColor());
  }

  @override
  Widget build(BuildContext context) {
    const size = 220.0;
    return Column(children: [
      Semantics(
        label: tr('colours.wheel', 'Colour wheel. Left and right arrows turn the hue, up and down change the saturation.'),
        value: tr('colours.wheel.value', 'Hue {h} degrees, saturation {s} percent, brightness {v} percent',
            {'h': _hsv.hue.round(), 's': (_hsv.saturation * 100).round(), 'v': (_hsv.value * 100).round()}),
        child: GestureDetector(
          onPanDown: (d) => _at(d.localPosition, size),
          onPanUpdate: (d) => _at(d.localPosition, size),
          child: CustomPaint(size: const Size(size, size), painter: _WheelPainter(_hsv)),
        ),
      ),
      Row(children: [
        Text(tr('colours.brightness', 'Brightness')),
        Expanded(
          child: Slider(
            value: _hsv.value,
            min: 0.15,
            onChanged: (v) {
              setState(() => _hsv = _hsv.withValue(v));
              widget.onChanged(_hsv.toColor());
            },
          ),
        ),
      ]),
    ]);
  }
}

class _WheelPainter extends CustomPainter {
  _WheelPainter(this.hsv);
  final HSVColor hsv;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    final sweep = SweepGradient(colors: [for (var h = 0; h <= 360; h += 30) HSVColor.fromAHSV(1, h % 360.0, 1, hsv.value).toColor()]);
    canvas.drawCircle(c, r, Paint()..shader = sweep.createShader(Rect.fromCircle(center: c, radius: r)));
    final grey = HSVColor.fromAHSV(1, 0, 0, hsv.value).toColor();
    canvas.drawCircle(
        c, r, Paint()..shader = RadialGradient(colors: [grey, grey.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: c, radius: r)));
    final a = hsv.hue * math.pi / 180;
    final p = c + Offset(math.cos(a), math.sin(a)) * hsv.saturation * r;
    canvas.drawCircle(p, 11, Paint()..color = Colors.white);
    canvas.drawCircle(p, 8, Paint()..color = hsv.toColor());
  }

  @override
  bool shouldRepaint(covariant _WheelPainter old) => old.hsv != hsv;
}
