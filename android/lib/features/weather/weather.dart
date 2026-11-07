// The weather button and its sheet (the site's js/weather.js): today's temperature range, PSI and
// PM2.5 across Singapore on the button, and in the sheet the weather now in central Singapore,
// today at a glance, the next hours, the two-hour rain nowcast, and air quality by region, from
// /api/weather (Open-Meteo and NEA). Fetched again after ten minutes.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api/api.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';

class Weather {
  Weather._();
  static Map<String, dynamic>? data;
  static int fetchedAt = 0;
  static Future<void>? _loading;
  static final changed = ValueNotifier<int>(0);
  static const staleMs = 10 * 60 * 1000;

  static Future<void> load() => _loading ??= () async {
        try {
          data = await Api.map('weather');
          fetchedAt = DateTime.now().millisecondsSinceEpoch;
          changed.value++;
        } catch (_) {
          // The button says Weather until it comes.
        } finally {
          _loading = null;
        }
      }();

  static void loadIfStale() {
    if (DateTime.now().millisecondsSinceEpoch - fetchedAt > staleMs) load();
  }

  static String wmoText(Object? code) => switch (code) {
        0 => tr('weather.wmo.0', 'Clear'),
        1 => tr('weather.wmo.1', 'Mainly clear'),
        2 => tr('weather.wmo.2', 'Partly cloudy'),
        3 => tr('weather.wmo.3', 'Overcast'),
        45 => tr('weather.wmo.45', 'Fog'),
        48 => tr('weather.wmo.48', 'Depositing rime fog'),
        51 => tr('weather.wmo.51', 'Light drizzle'),
        53 => tr('weather.wmo.53', 'Drizzle'),
        55 => tr('weather.wmo.55', 'Heavy drizzle'),
        56 || 57 => tr('weather.wmo.56', 'Freezing drizzle'),
        61 => tr('weather.wmo.61', 'Light rain'),
        63 => tr('weather.wmo.63', 'Rain'),
        65 => tr('weather.wmo.65', 'Heavy rain'),
        66 || 67 => tr('weather.wmo.66', 'Freezing rain'),
        80 || 81 => tr('weather.wmo.80', 'Rain showers'),
        82 => tr('weather.wmo.82', 'Violent rain showers'),
        95 => tr('weather.wmo.95', 'Thunderstorm'),
        96 => tr('weather.wmo.96', 'Thunderstorm with hail'),
        99 => tr('weather.wmo.99', 'Thunderstorm with heavy hail'),
        _ => tr('weather.notReported', 'Not reported'),
      };

  static IconData wmoIcon(Object? code) {
    if (code == 0) return Icons.wb_sunny_outlined;
    if (code == 1 || code == 2) return Icons.wb_cloudy_outlined;
    if (code == 3) return Icons.cloud_outlined;
    if (code == 45 || code == 48) return Icons.foggy;
    if (const [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].contains(code)) return Icons.water_drop_outlined;
    if (const [95, 96, 99].contains(code)) return Icons.thunderstorm_outlined;
    return Icons.thermostat;
  }

  static String span(Object? r, [String unit = '']) {
    if (r is! Map) return '';
    return r['min'] == r['max'] ? '${r['min']}$unit' : '${r['min']} - ${r['max']}$unit';
  }

  /// "23 - 32 °C, 72 - 94 PSI, 24 - 48 PM2.5".
  static String buttonText() {
    final d = data;
    if (d == null) return tr('timings.weather', 'Weather');
    final parts = [
      if (d['temp'] != null) span(d['temp'], ' °C'),
      if (d['psi'] != null) '${span(d['psi'])} PSI',
      if (d['pm25'] != null) '${span(d['pm25'])} PM2.5',
    ];
    return parts.isEmpty ? tr('timings.weather', 'Weather') : parts.join(', ');
  }
}

/// The weather button, as Glance and Bus timings have it.
class WeatherButton extends StatefulWidget {
  const WeatherButton({super.key});

  @override
  State<WeatherButton> createState() => _WeatherButtonState();
}

class _WeatherButtonState extends State<WeatherButton> {
  @override
  void initState() {
    super.initState();
    Weather.changed.addListener(_redraw);
    Weather.loadIfStale();
  }

  @override
  void dispose() {
    Weather.changed.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final d = Weather.data;
    final text = Weather.buttonText();
    return Semantics(
      button: true,
      label: tr('timings.todays_weather_now', "Today's weather: {now}", {'now': text}),
      excludeSemantics: true,
      child: Align(
        alignment: Alignment.centerLeft,
        child: Pill(
          icon: Weather.wmoIcon((d?['now'] as Map?)?['code'] ?? (d?['today'] as Map?)?['code']),
          label: text,
          onTap: () {
            Weather.loadIfStale();
            showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => const WeatherSheet());
          },
        ),
      ),
    );
  }
}

class WeatherSheet extends StatefulWidget {
  const WeatherSheet({super.key});

  @override
  State<WeatherSheet> createState() => _WeatherSheetState();
}

class _WeatherSheetState extends State<WeatherSheet> {
  @override
  void initState() {
    super.initState();
    Weather.changed.addListener(_redraw);
  }

  @override
  void dispose() {
    Weather.changed.removeListener(_redraw);
    super.dispose();
  }

  void _redraw() {
    if (mounted) setState(() {});
  }

  String _round(Object? v) => v is num ? '${v.round()}' : tr('weather.na', 'n/a');
  String _time(Object? iso) => iso is String && iso.contains('T') ? iso.split('T')[1].substring(0, 5) : '';
  String _compass(num deg) => const ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][((deg % 360) / 22.5).round() % 16];

  (String, Color) _psiBand(num v, SgColors sg) {
    if (v <= 50) return (tr('weather.psi.good', 'Good'), sg.ok);
    if (v <= 100) return (tr('weather.psi.moderate', 'Moderate'), sg.warn);
    if (v <= 200) return (tr('weather.psi.unhealthy', 'Unhealthy'), sg.error);
    if (v <= 300) return (tr('weather.psi.veryUnhealthy', 'Very unhealthy'), sg.error);
    return (tr('weather.psi.hazardous', 'Hazardous'), sg.error);
  }

  (String, Color) _pmBand(num v, SgColors sg) {
    if (v <= 55) return (tr('weather.pm.normal', 'Normal'), sg.ok);
    if (v <= 150) return (tr('weather.pm.elevated', 'Elevated'), sg.warn);
    if (v <= 250) return (tr('weather.pm.high', 'High'), sg.error);
    return (tr('weather.pm.veryHigh', 'Very high'), sg.error);
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final d = Weather.data;
    final regions = {
      'north': tr('weather.region.north', 'North'),
      'south': tr('weather.region.south', 'South'),
      'east': tr('weather.region.east', 'East'),
      'west': tr('weather.region.west', 'West'),
      'central': tr('weather.region.central', 'Central'),
    };
    final kids = <Widget>[];
    if (d == null) {
      kids.add(EmptyNote(tr('weather.loading', "Loading today's weather…")));
    } else {
      final n = d['now'] as Map?;
      final t = d['today'] as Map?;
      if (n != null) {
        kids.add(Row(children: [
          Icon(Weather.wmoIcon(n['code']), size: 48, color: sg.brandInk),
          const SizedBox(width: 12),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${_round(n['temp'])} °C', style: Theme.of(context).textTheme.headlineMedium),
            Text(tr('weather.skyCentral', '{sky}, central Singapore', {'sky': Weather.wmoText(n['code'])}), style: TextStyle(color: sg.muted)),
          ]),
        ]));
      }
      if (t != null) {
        final summary = (d['temp'] != null
                ? tr('weather.todayRunsIsland', 'Today runs {min} to {max} °C ({range} across the island).',
                    {'min': _round(t['min']), 'max': _round(t['max']), 'range': Weather.span(d['temp'], ' °C')})
                : tr('weather.todayRuns', 'Today runs {min} to {max} °C.', {'min': _round(t['min']), 'max': _round(t['max'])})) +
            ((t['rainChance'] ?? 0) != 0 ? ' ${tr('weather.rainPeaks', 'Rain chance peaks at {p}%.', {'p': t['rainChance']})}' : '');
        kids.add(Padding(padding: const EdgeInsets.only(top: 10), child: Text(summary)));
      }
      final fields = <(String, String)>[
        if (n != null) ...[
          (tr('weather.feelsLike', 'Feels like'), '${_round(n['feels'])} °C'),
          (tr('weather.humidity', 'Humidity'), '${_round(n['humidity'])}%'),
          (tr('weather.wind', 'Wind'), '${_round(n['wind'])} km/h${n['windDir'] is num ? ' ${_compass(n['windDir'] as num)}' : ''}'),
          (tr('weather.gusts', 'Gusts'), '${_round(n['gusts'])} km/h'),
          (tr('weather.pressure', 'Pressure'), '${_round(n['pressure'])} hPa'),
          (tr('weather.cloud', 'Cloud cover'), '${_round(n['cloud'])}%'),
        ],
        if (t != null) ...[
          (tr('weather.rainToday', 'Rain today'), '${((t['rain'] as num?) ?? 0).toStringAsFixed(1)} mm'),
          (tr('weather.windMax', 'Strongest wind'), '${_round(t['windMax'])} km/h'),
          if (t['sunrise'] != null && t['sunset'] != null)
            (tr('weather.sun', 'Sun'), tr('planner.clockRange', '{a} to {b}', {'a': _time(t['sunrise']), 'b': _time(t['sunset'])})),
        ],
      ];
      if (fields.isNotEmpty) {
        kids.add(Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Wrap(spacing: 12, runSpacing: 10, children: [
            for (final f in fields)
              SizedBox(
                width: 150,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(f.$1, style: TextStyle(color: sg.muted, fontSize: 12)),
                  Text(f.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              ),
          ]),
        ));
      }
      final hours = (d['hours'] as List?) ?? const [];
      if (hours.isNotEmpty) {
        kids.add(SectionLabel(tr('weather.nextHours', 'Next hours')));
        kids.add(SizedBox(
          height: 96,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final h in hours.cast<Map>())
              Padding(
                padding: const EdgeInsets.only(right: 14),
                child: Column(children: [
                  Text(_time(h['time']), style: TextStyle(color: sg.muted, fontSize: 12)),
                  Icon(Weather.wmoIcon(h['code'])),
                  Text('${_round(h['temp'])}°'),
                  Text(h['pop'] != null ? '${h['pop']}%' : '', style: TextStyle(color: sg.tones[0], fontSize: 12)),
                ]),
              ),
          ]),
        ));
      }
      final nowcast = ((d['nowcast'] as List?) ?? const []).cast<Map>();
      if (nowcast.isNotEmpty) {
        final peak = nowcast.map((p) => (p['mm'] as num?)?.toDouble() ?? 0).reduce(math.max);
        kids.add(SectionLabel(tr('weather.rainNext', 'Rain, next two hours')));
        kids.add(Text(peak == 0 ? tr('weather.dry', 'Dry for the next two hours.') : tr('weather.upTo', 'Up to {mm} mm in a quarter hour.', {'mm': peak.toStringAsFixed(2)})));
        if (peak > 0) {
          kids.add(SizedBox(
            height: 80,
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              for (final p in nowcast)
                Expanded(
                  child: Tooltip(
                    message: '${_time(p['time'])}: ${(((p['mm'] as num?) ?? 0)).toStringAsFixed(2)} mm',
                    child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                      Container(
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        height: math.max(4, ((((p['mm'] as num?) ?? 0) / peak) * 52)).toDouble(),
                        decoration: BoxDecoration(color: sg.tones[0], borderRadius: BorderRadius.circular(4)),
                      ),
                      Text(_time(p['time']), style: TextStyle(fontSize: 9, color: sg.muted)),
                    ]),
                  ),
                ),
            ]),
          ));
        }
      }
      kids.add(SectionLabel(tr('weather.air', 'Air quality')));
      for (final (label, key, band, unit) in [
        (tr('weather.psi', 'PSI, 24-hour'), 'psi', _psiBand, ''),
        (tr('weather.pm25', 'PM2.5, 1-hour (µg/m³)'), 'pm25', _pmBand, ''),
      ]) {
        final r = d[key] as Map?;
        if (r == null) {
          kids.add(Text(tr('weather.notAvailable', '{what}: not available right now.', {'what': label})));
          continue;
        }
        kids.add(Padding(padding: const EdgeInsets.only(top: 6, bottom: 4), child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700))));
        (r['regions'] as Map).forEach((region, v) {
          final (text, tone) = band(v as num, sg);
          kids.add(Row(children: [
            SizedBox(width: 90, child: Text(regions[region] ?? '$region')),
            SizedBox(width: 50, child: Text('$v$unit')),
            Icon(Icons.circle, size: 10, color: tone),
            const SizedBox(width: 6),
            Text(text),
          ]));
        });
      }
      final at = DateTime.fromMillisecondsSinceEpoch(((d['fetchedAt'] as num?) ?? DateTime.now().millisecondsSinceEpoch).toInt(), isUtc: true).add(const Duration(hours: 8));
      kids.add(Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Text(
          tr('weather.source', 'Forecast from Open-Meteo, air quality from NEA via data.gov.sg. Updated {time}.',
              {'time': '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}'}),
          style: TextStyle(color: sg.muted, fontSize: 12),
        ),
      ));
    }
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      builder: (ctx, scroll) => ListView(controller: scroll, padding: EdgeInsets.fromLTRB(20, 0, 20, 24 + MediaQuery.paddingOf(ctx).bottom), children: [
        Text(tr('timings.weather', 'Weather'), style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        ...kids,
      ]),
    );
  }
}
