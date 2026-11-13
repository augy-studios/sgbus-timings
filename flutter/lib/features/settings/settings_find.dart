// Find a setting (the site's script.js, findSettings): at the top of Settings, a box that lists the
// settings whose name, or the words kept with it, has every word typed, each opening its group on it.
import '../../i18n/i18n.dart';

class FoundSetting {
  const FoundSetting(this.group, this.label, this.words);

  /// you, pages, trips, navigate, help, or a screen of its own: theme, achievements, sync.
  final String group;
  final String Function() label;
  final String words;
}

class SettingsFind {
  SettingsFind._();

  static final all = <FoundSetting>[
    FoundSetting('theme', () => tr('theme.title', 'Theme'), 'colours colors dark light look material you contrast wallpaper'),
    FoundSetting('you', () => tr('settings.language', 'Language'), 'language languages bahasa 语言 中文 மொழி chinese malay tamil english'),
    FoundSetting('you', () => tr('settings.your_name_for_the_greeting', 'Your name, for the greeting'), 'name greeting'),
    FoundSetting('you', () => tr('settings.birthday', 'Birthday'), 'birthday age'),
    FoundSetting('you', () => tr('settings.birthday_confetti', 'Birthday confetti'), 'confetti'),
    FoundSetting('you', () => tr('settings.home_work_and_your_places', 'Home, Work and your places'), 'home work'),
    FoundSetting('you', () => tr('settings.calendar', 'Calendar'), 'ical ics events'),
    FoundSetting('pages', () => tr('settings.custom_home', 'Custom home'), 'start page opens'),
    FoundSetting('pages', () => tr('settings.edge_tray_side', 'Edge Tray side'), 'left right'),
    FoundSetting('pages', () => tr('settings.edge_tray_buttons', 'Edge Tray buttons'), 'pages turn off hide glance service alerts your trips explorer simplygo telegram coffee guide card value receive nearby timings near a stop routines'),
    FoundSetting('pages', () => tr('settings.pin_favourite_stops_in_lists', 'Pin favourite stops in lists'), 'top bottom favourites'),
    FoundSetting('pages', () => tr('settings.pin_favourite_buses_in_timings', 'Pin favourite buses in timings'), 'top bottom favourites'),
    FoundSetting('pages', () => tr('settings.bus_times', 'Bus times'), 'clock countdown minutes seconds hh:mm arrival time eta'),
    FoundSetting('trips', () => tr('settings.get_off_alert_on_a', 'Get Off Alert on a trip'), 'morse beep buzz vibrate'),
    FoundSetting('trips', () => tr('settings.get_off_alerts_sound', "Get Off Alert's sound"), 'earphones out loud'),
    FoundSetting('trips', () => tr('settings.shake_to_refresh', 'Shake to refresh'), 'shake'),
    FoundSetting('trips', () => tr('settings.pictureinpicture', 'Picture-in-picture'), 'pip window'),
    FoundSetting('trips', () => tr('settings.time_to_leave', 'Time to leave'), 'calendar reminder notification'),
    FoundSetting('trips', () => tr('settings.on_a_bus', '“On a bus?”'), 'riding'),
    FoundSetting('trips', () => tr('settings.last_bus_reminders', 'Last bus reminders'), 'reminder bell'),
    FoundSetting('navigate', () => tr('settings.restricted_areas', 'Restricted areas'), 'pass changi cargo mindef'),
    FoundSetting('navigate', () => tr('settings.immigration_time', 'Immigration time'), 'customs causeway checkpoint jb johor woodlands'),
    FoundSetting('navigate', () => tr('settings.cycling', 'Cycling'), 'bike bicycle'),
    FoundSetting('navigate', () => tr('settings.shuttle_buses', 'Shuttle buses'), 'shuttle shuttles campus ikea mandai fare'),
    FoundSetting('help', () => tr('settings.show_me_around', 'Show me around'), 'tour tutorial'),
    FoundSetting('help', () => tr('settings.sgbus_terminal', 'sgbus terminal'), 'command line linux'),
    FoundSetting('help', () => tr('coins.title', 'uwuCoins'), 'coins uwucoins wheel spin easter eggs feats hide show pop-ups popups toast'),
    FoundSetting('help', () => tr('settings.report_a_bug', 'Report a bug'), 'bug problem broken feedback wrong error'),
    FoundSetting('achievements', () => tr('achievements.feats', 'Feats'), 'achievements feats progress trophy'),
    FoundSetting('achievements', () => tr('team.title', 'Team run'), 'team run relay speedrun friends together group'),
    FoundSetting('achievements', () => tr('eggs.title', 'Easter eggs'), 'easter eggs secrets wheel'),
    FoundSetting('sync', () => tr('settings.sync_with_another_device_or', 'Sync with another device or Telegram'), 'code qr bot import export'),
  ];

  /// The settings with every word typed, in their name, their words or their group's name.
  static List<FoundSetting> find(String typed, String Function(String group) groupName) {
    final words = typed.toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return const [];
    return [
      for (final s in all)
        if (_has('${s.label()} ${s.words} ${groupName(s.group)}'.toLowerCase(), words)) s,
    ];
  }

  static bool _has(String text, List<String> words) => words.every(text.contains);
}
