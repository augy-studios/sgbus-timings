// The feats and their Easter eggs (the site's js/eggs.js EGGS): each feat's words, and the
// preset each egg adds to Your colours. Found eggs are sgbus_eggs, { id: when }; Your colours is
// unlocked (sgbus_colours_unlocked) by an egg, as on the site. Material You is no longer one of
// the eggs' secrets: in the Android app it's simply on (theme/theme.dart).
import '../i18n/i18n.dart';
import 'store.dart';

class EggPreset {
  const EggPreset(this.id, this.base, this.name);
  final String id;
  final String base;
  final String Function() name;
}

class EggDef {
  const EggDef(this.id, {required this.goal, required this.name, required this.how, this.preset, this.buses});
  final String id;
  final String Function() goal;
  final String Function() name;
  final String Function() how;
  final EggPreset? preset;
  final List<String>? buses;
}

class EggsData {
  EggsData._();
  static const featsKey = 'sgbus_feats';
  static const eggsKey = 'sgbus_eggs';
  static const unlockedKey = 'sgbus_colours_unlocked';

  static final all = <EggDef>[
    EggDef('lines', goal: () => tr('eggs.lines.goal', 'Ride every MRT and LRT line.'), name: () => tr('eggs.lines', 'Every line ridden'), how: () => tr('eggs.lines.how', 'You rode every MRT and LRT line.')),
    EggDef('up',
        goal: () => tr('eggs.up.goal', 'Ride buses 12, 34, 56, 78 and 90.'),
        buses: const ['12', '34', '56', '78', '90'],
        name: () => tr('eggs.up', '12, 34, 56, 78, 90'),
        how: () => tr('eggs.up.how', 'You rode buses 12, 34, 56, 78 and 90.'),
        preset: EggPreset('rising', '#ff9e40', () => tr('colours.preset.rising', 'Rising'))),
    EggDef('down',
        goal: () => tr('eggs.down.goal', 'Ride buses 9, 87, 65, 43 and 21.'),
        buses: const ['9', '87', '65', '43', '21'],
        name: () => tr('eggs.down', '9, 87, 65, 43, 21'),
        how: () => tr('eggs.down.how', 'You rode buses 9, 87, 65, 43 and 21.'),
        preset: EggPreset('sunset', '#8e5bd0', () => tr('colours.preset.sunset', 'Sunset'))),
    EggDef('loop',
        goal: () => tr('eggs.loop.goal', 'Go somewhere by way of a stop, and come back to where you started.'),
        name: () => tr('eggs.loop', 'There and back again'),
        how: () => tr('eggs.loop.how', 'You went somewhere and came back to where you started.'),
        preset: EggPreset('loop', '#fa9e0d', () => tr('colours.preset.loop', 'Loop'))),
    EggDef('long',
        goal: () => tr('eggs.long.goal', 'Take a trip of over three hours.'),
        name: () => tr('eggs.long', 'The long way round'),
        how: () => tr('eggs.long.how', 'You took a trip of over three hours.'),
        preset: EggPreset('longhaul', '#2f5fd0', () => tr('colours.preset.longhaul', 'Long haul'))),
    EggDef('ktm',
        goal: () => tr('eggs.ktm.goal', 'Travel between two places on the old KTM railway line.'),
        name: () => tr('eggs.ktm', 'Down the old railway'),
        how: () => tr('eggs.ktm.how', 'You travelled between two places on the old KTM railway line.'),
        preset: EggPreset('ktm', '#2e7d32', () => tr('colours.preset.ktm', 'KTM'))),
    EggDef('first',
        goal: () => tr('eggs.first.goal', 'Get on or off a bus at stop 01012 and at stop 99189, the first and last stop codes.'),
        name: () => tr('eggs.first', 'First to last'),
        how: () => tr('eggs.first.how', 'You took buses at stop 01012 and at stop 99189, the first and last stop codes.'),
        preset: EggPreset('firstlast', '#c2185b', () => tr('colours.preset.firstlast', 'End to end'))),
    EggDef('hundred',
        goal: () => tr('eggs.hundred.goal', 'Take 100 rides on buses and trains.'),
        name: () => tr('eggs.hundred', '100 rides'),
        how: () => tr('eggs.hundred.how', 'You took 100 rides on buses and trains.'),
        preset: EggPreset('century', '#c99a06', () => tr('colours.preset.century', 'Century'))),
    EggDef('ends',
        goal: () => tr('eggs.ends.goal', 'Get off a train at Tuas Link, Woodlands North, Punggol Coast and Changi Airport.'),
        name: () => tr('eggs.ends', 'Ends of the island'),
        how: () => tr('eggs.ends.how', 'You got off a train at Tuas Link, Woodlands North, Punggol Coast and Changi Airport.'),
        preset: EggPreset('compass', '#00897b', () => tr('colours.preset.compass', 'Compass'))),
  ];

  static EggDef? byId(String id) => all.where((e) => e.id == id).firstOrNull;

  static Map<String, dynamic> _read(String key) {
    final v = Store.I.map(key);
    if (v.isEmpty && Store.I.get(eggsKey) == null && Store.I.get(featsKey) == null && Store.I.get(unlockedKey) != null) {
      return {'lines': int.tryParse(Store.I.get(unlockedKey)!) ?? DateTime.now().millisecondsSinceEpoch};
    }
    return v;
  }

  static List<String> found() => [for (final e in all) if (_read(eggsKey)[e.id] != null) e.id];
  static List<String> feats() => [for (final e in all) if (_read(featsKey)[e.id] != null) e.id];
  static bool coloursUnlocked() => Store.I.get(unlockedKey) != null;
  static List<EggPreset> presets() => [for (final id in found()) if (byId(id)?.preset != null) byId(id)!.preset!];
}
