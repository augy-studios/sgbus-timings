// Settings (the site's settings window): its groups, each a screen of its own, as the site has
// them. You (language, name, birthday, confetti, places, calendar); Pages and Edge Tray (custom
// home, the tray's side and buttons, favourites first or last, bus times); Trips and alerts (the
// Get Off Alert and its sound, shake to refresh, picture-in-picture, reminders); Navigate
// (restricted areas, immigration time, cycling, shuttle buses); Help and extras (tours, the
// terminal, uwuCoins); Achievements; and Sync. Every setting is kept under the site's own key.
import 'package:flutter/material.dart';

import '../../app/edge_tray.dart';
import '../../app/nav.dart';
import '../../app/pages.dart';
import '../../data/favs.dart';
import '../../data/network.dart';
import '../../data/store.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  static void open([String? group]) {
    if (group == null) {
      AppNav.push(const SettingsScreen(), name: 'settings');
    } else {
      AppNav.push(SettingsGroup(group: group), name: 'settings/$group');
    }
  }

  @override
  Widget build(BuildContext context) {
    final groups = [
      ('you', Icons.person_outline, tr('settings.you', 'You'), tr('settings.name_birthday_confetti_places_calendar', 'Language · Name · Birthday · Confetti · Places · Calendar')),
      ('pages', Icons.view_sidebar_outlined, tr('settings.pages_and_edge_tray', 'Pages and Edge Tray'),
          tr('settings.custom_home_edge_tray_side', 'Custom home · Edge Tray side · Edge Tray buttons · Favourites first or last')),
      ('trips', Icons.notifications_outlined, tr('settings.trips_and_alerts', 'Trips and alerts'), tr('settings.get_off_alert', 'Get Off Alert')),
      ('navigate', Icons.directions, tr('settings.navigate', 'Navigate'),
          tr('settings.restricted_areas_immigration_time_cycling_shuttles', 'Restricted areas · Immigration time · Cycling · Shuttle buses')),
      ('help', Icons.help_outline, tr('settings.help_and_extras', 'Help and extras'), tr('settings.show_me_around_sgbus_terminal_coins', 'Show me around · sgbus terminal · uwuCoins')),
      ('achievements', Icons.emoji_events_outlined, tr('settings.achievements', 'Achievements'), tr('settings.feats_and_eggs', 'Feats · Easter eggs')),
      ('sync', Icons.sync, tr('settings.sync', 'Sync'), tr('settings.with_another_device_or_the', 'With another device or the Telegram bot')),
    ];
    return SgScaffold(
      title: tr('settings.settings', 'Settings'),
      body: ListView(padding: const EdgeInsets.fromLTRB(12, 0, 12, 24), children: [
        ListTile(
          leading: const Icon(Icons.palette_outlined),
          title: Text(tr('theme.title', 'Theme')),
          subtitle: Text(AppLook.I.materialYou ? tr('theme.materialYou', 'Material You') : tr('theme.usualLook', 'The usual look')),
          onTap: () => AppNav.open('theme'),
        ),
        for (final g in groups)
          ListTile(
            leading: Icon(g.$2),
            title: Text(g.$3),
            subtitle: Text(g.$4),
            onTap: () {
              if (g.$1 == 'achievements') {
                AppNav.open('achievements');
              } else if (g.$1 == 'sync') {
                AppNav.open('sync');
              } else {
                SettingsScreen.open(g.$1);
              }
            },
          ),
      ]),
    );
  }
}

/// One of a setting's choices, as the site's mode-toggle buttons.
class Choice<T> extends StatelessWidget {
  const Choice({super.key, required this.label, required this.value, required this.options, required this.onChanged, this.note});
  final String label;
  final T value;
  final List<(T, String)> options;
  final void Function(T) onChanged;
  final String? note;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<T>(
              showSelectedIcon: false,
              segments: [for (final o in options) ButtonSegment(value: o.$1, label: Text(o.$2, textAlign: TextAlign.center))],
              selected: {value},
              onSelectionChanged: (s) => onChanged(s.first),
            ),
          ),
          if (note != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(note!, style: TextStyle(color: context.sg.muted, fontSize: 13))),
        ]),
      );
}

class SettingsGroup extends StatefulWidget {
  const SettingsGroup({super.key, required this.group});
  final String group;

  @override
  State<SettingsGroup> createState() => _SettingsGroupState();
}

class _SettingsGroupState extends State<SettingsGroup> {
  late final _name = TextEditingController(text: Store.I.get('sgbus_name') ?? '');

  void _set(String key, String? v) => setState(() => Store.I.put(key, v));
  String _onOff(String key, {String off = 'off'}) => Store.I.get(key) == off ? 'off' : 'on';

  List<(String, String)> get _onOffOptions => [('on', tr('settings.on', 'On')), ('off', tr('settings.off', 'Off'))];

  Future<void> _pickLanguage() async {
    final pick = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final l in I18n.langs)
            ListTile(
              title: Text(l.name),
              trailing: I18n.I.lang == l.code ? const Icon(Icons.check) : null,
              onTap: () => Navigator.pop(ctx, l.code),
            ),
        ]),
      ),
    );
    if (pick == null) return;
    await I18n.I.use(pick);
    // The app's own language follows (Android's per-app languages, SgBusPlugin.setLanguage).
    if (Native.has('applang')) Native.call('SgBus', 'setLanguage', {'lang': pick}).catchError((_) => null);
    setState(() {});
  }

  List<Widget> _you() {
    final birthday = Store.I.get('sgbus_birthday') ?? '';
    return [
      ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(tr('settings.language', 'Language')),
        subtitle: Text(I18n.I.current.name),
        trailing: const Icon(Icons.chevron_right),
        onTap: _pickLanguage,
      ),
      const SizedBox(height: 8),
      TextField(
        controller: _name,
        decoration: InputDecoration(labelText: tr('settings.your_name_for_the_greeting', 'Your name, for the greeting')),
        onChanged: (v) => Store.I.put('sgbus_name', v.trim().isEmpty ? null : v.trim()),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          child: Text(tr('settings.birthday', 'Birthday'), style: Theme.of(context).textTheme.titleSmall),
        ),
        TextButton(
          onPressed: () async {
            final now = DateTime.now();
            final initial = DateTime.tryParse(birthday) ?? DateTime(now.year - 20, now.month, now.day);
            final d = await showDatePicker(context: context, initialDate: initial, firstDate: DateTime(now.year - 130), lastDate: now);
            if (d != null) {
              _set('sgbus_birthday', '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
            }
          },
          child: Text(birthday.isEmpty ? '—' : birthday),
        ),
        if (birthday.isNotEmpty) TextButton(onPressed: () => _set('sgbus_birthday', null), child: Text(tr('settings.clear', 'Clear'))),
      ]),
      Text(tr('settings.on_your_birthday_the_greeting', "On your birthday, the greeting wishes you a happy one, with your age if the year's set."),
          style: TextStyle(color: context.sg.muted, fontSize: 13)),
      Choice(
        label: tr('settings.birthday_confetti', 'Birthday confetti'),
        value: _onOff('sgbus_confetti'),
        options: _onOffOptions,
        onChanged: (v) => _set('sgbus_confetti', v == 'on' ? null : 'off'),
        note: tr('settings.confetti_each_time_you_open', 'Confetti each time you open the app on your birthday.'),
      ),
      ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(tr('settings.home_work_and_your_places', 'Home, Work and your places')),
        trailing: TextButton(onPressed: () => AppNav.showPage('places'), child: Text(tr('settings.open_places', 'Open Places'))),
      ),
      ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(tr('settings.calendar', 'Calendar')),
        subtitle: Text(tr('settings.your_events_with_a_location', "Your events with a location show under Calendar in Navigate's From, To and Add a stop.")),
        trailing: TextButton(onPressed: () => AppNav.open('calendarSettings'), child: Text(tr('settings.calendar_settings', 'Calendar settings'))),
      ),
    ];
  }

  List<Widget> _pages() {
    final labels = {
      'glance': tr('settings.glance', 'Glance'),
      'timings': tr('settings.bus_timings', 'Bus timings'),
      'favs': tr('settings.favourites', 'Favourites'),
      'nav': tr('settings.navigate', 'Navigate'),
      'alerts': tr('settings.service_alerts', 'Service alerts'),
      'trips': tr('settings.your_trips', 'Your trips'),
      'places': tr('settings.places', 'Places'),
    };
    final extras = {
      'explorer': tr('settings.explorer', 'Explorer'),
      'simplygo': tr('settings.simplygo', 'SimplyGo'),
      'coins': tr('settings.coins', 'uwuCoins'),
      'nearstops': tr('settings.timings_near_a_stop', 'Timings near a stop'),
      'routines': tr('settings.routines', 'Routines'),
      'card': tr('settings.card_value', 'Card value'),
      'receive': tr('settings.receive_nearby', 'Receive nearby'),
    };
    final hidden = EdgeTray.hidden();
    return [
      Text(tr('settings.custom_home', 'Custom home'), style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final id in Pages.ids)
          if (Pages.shows(id)) Pill(label: labels[id]!, on: Pages.home() == id, onTap: () => _set(Pages.homeKey, id)),
      ]),
      const SizedBox(height: 6),
      Text(
          tr('settings.the_page_the_app_opens',
              'The page the app opens on, first in the Edge Tray. Each of these is a page of its own: tap its button at the top of the tray to switch to it. A link to a stop, a bus or a journey still opens that. Pages turned off in Edge Tray buttons, below, aren’t here.'),
          style: TextStyle(color: context.sg.muted, fontSize: 13)),
      Choice(
        label: tr('settings.edge_tray_side', 'Edge Tray side'),
        value: EdgeTray.left() ? 'left' : 'right',
        options: [('left', tr('settings.left', 'Left')), ('right', tr('settings.right', 'Right'))],
        onChanged: (v) => _set(EdgeTray.sideKey, v == 'left' ? 'left' : null),
        note: tr('settings.the_edge_tray_is_the', 'The Edge Tray is the column of buttons at the top of the screen. Its arrow tucks it away at the edge.'),
      ),
      Text(tr('settings.edge_tray_buttons', 'Edge Tray buttons'), style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final id in Pages.canHide) Pill(label: labels[id]!, on: Pages.shows(id), onTap: () => setState(() => Pages.setOn(id, !Pages.shows(id)))),
        for (final e in extras.entries) Pill(label: e.value, on: !hidden.contains(e.key), onTap: () => setState(() => EdgeTray.setExtra(e.key, hidden.contains(e.key)))),
      ]),
      const SizedBox(height: 6),
      Text(
          tr('settings.turn_off_the_buttons_you',
              'Turn off the buttons you don’t use, for a tidier tray. Glance, Service alerts and Your trips are pages: off, each leaves the tray and Custom home too, and if it was home, the app opens on Bus timings. The trips you take are still kept with Your trips off. The guide is also at guide.sgbus.uwuapps.org.'),
          style: TextStyle(color: context.sg.muted, fontSize: 13)),
      Choice(
        label: tr('settings.pin_favourite_stops_in_lists', 'Pin favourite stops in lists'),
        value: Favs.I.pin('stop'),
        options: [('top', tr('settings.top', 'Top')), ('bottom', tr('settings.bottom', 'Bottom'))],
        onChanged: (v) => setState(() => Favs.I.setPin('stop', v)),
      ),
      Choice(
        label: tr('settings.pin_favourite_buses_in_timings', 'Pin favourite buses in timings'),
        value: Favs.I.pin('bus'),
        options: [('top', tr('settings.top', 'Top')), ('bottom', tr('settings.bottom', 'Bottom'))],
        onChanged: (v) => setState(() => Favs.I.setPin('bus', v)),
      ),
      Choice(
        label: tr('settings.bus_times', 'Bus times'),
        value: Store.I.get('sgbus_times') == 'clock' ? 'clock' : 'mins',
        options: [('mins', tr('settings.minutes_and_seconds', 'Minutes and seconds')), ('clock', tr('settings.clock_time', 'Clock time'))],
        onChanged: (v) => _set('sgbus_times', v == 'clock' ? 'clock' : null),
        note: tr('settings.bus_times_note', 'How long till each bus comes, such as 3 mins 20s, or the time it comes, such as 14:32. Every bus timing in the app follows it.'),
      ),
    ];
  }

  List<Widget> _trips() => [
        Choice(
          label: tr('settings.get_off_alert_on_a', 'Get Off Alert on a trip'),
          value: _onOff('sgbus.getOffAlert'),
          options: _onOffOptions,
          onChanged: (v) => _set('sgbus.getOffAlert', v == 'on' ? null : 'off'),
          note: tr('settings.two_stops_before_you_get', 'Two stops before you get off or change, the phone buzzes "OFF" in Morse code, beeps and shows a notification. Keep the site open on a trip.'),
        ),
        if (Native.has('earphones'))
          Choice(
            label: tr('settings.get_off_alerts_sound', "Get Off Alert's sound"),
            value: Store.I.get('sgbus_getoff_earphones') == 'on' ? 'ear' : 'loud',
            options: [('loud', tr('settings.out_loud', 'Out loud')), ('ear', tr('settings.earphones_only', 'Earphones only'))],
            onChanged: (v) => _set('sgbus_getoff_earphones', v == 'ear' ? 'on' : null),
            note: tr('settings.earphones_only_with_earphones_in',
                'Earphones only: with earphones in, the beeps play just in them; without, the phone only buzzes. Never out loud on a quiet bus.'),
          ),
        Choice(
          label: tr('settings.shake_to_refresh', 'Shake to refresh'),
          value: _onOff('sgbus_shake'),
          options: _onOffOptions,
          onChanged: (v) => _set('sgbus_shake', v),
          note: tr('settings.give_the_phone_a_firm', 'Give the phone a firm shake to refresh the timings on screen.'),
        ),
        if (Native.has('pip'))
          Choice(
            label: tr('settings.pictureinpicture', 'Picture-in-picture'),
            value: _onOff('sgbus_pip'),
            options: _onOffOptions,
            onChanged: (v) => _set('sgbus_pip', v == 'on' ? null : 'off'),
            note: tr('settings.on_a_trip_or_with',
                'On a trip or with the live map open, leaving the app shrinks it into a small window over your other apps. Off, it goes to the background like any other app, and the Get Off Alert still comes as a notification.'),
          ),
        ?RemindersSettings.build?.call(context),
      ];

  List<Widget> _navigate() => [
        Choice(
          label: tr('settings.restricted_areas', 'Restricted areas'),
          value: Store.I.get('sgbus_restricted') == 'on' ? 'pass' : 'out',
          options: [('out', tr('settings.keep_out', 'Keep out')), ('pass', tr('settings.i_have_a_pass', 'I have a pass'))],
          onChanged: (v) {
            _set('sgbus_restricted', v == 'pass' ? 'on' : null);
            BusNet.setOpenAccess(v == 'pass');
          },
          note: tr('settings.for_people_who_work_there',
              "For people who work there: with a pass, Navigate can get on and off inside Changi Airport's cargo area and at MINDEF's stops, which it otherwise keeps away from."),
        ),
        Choice(
          label: tr('settings.immigration_time', 'Immigration time'),
          value: ['15', '30', '45', '60'].contains(Store.I.get('sgbus_customs')) ? Store.I.get('sgbus_customs')! : 'auto',
          options: [
            ('auto', tr('settings.by_the_time', 'By the time')),
            ('15', tr('settings.15_min', '15 min')),
            ('30', tr('settings.30_min', '30 min')),
            ('45', tr('settings.45_min', '45 min')),
            ('60', tr('settings.1_hr', '1 hr')),
          ],
          onChanged: (v) => _set('sgbus_customs', v == 'auto' ? null : v),
          note: tr('settings.journeys_across_the_causeway_count',
              "Journeys across the Causeway count this for getting off, clearing both checkpoints and getting on again. By the time: about 15 min when it's quiet, up to an hour at the rush (weekday mornings into Singapore, evenings and Friday nights out to JB, Sunday nights back)."),
        ),
        Choice(
          label: tr('settings.cycling', 'Cycling'),
          value: Store.I.get('sgbus_bike') == 'on' ? 'bike' : 'none',
          options: [('none', tr('settings.no_bike', 'No bike')), ('bike', tr('settings.i_have_a_bike', 'I have a bike'))],
          onChanged: (v) => _set('sgbus_bike', v == 'bike' ? 'on' : null),
          note: tr('settings.with_a_bike_navigate_also', 'With a bike, Navigate also says how long cycling there takes, and a trip tells you when cycling the rest of the way is quicker.'),
        ),
        Choice(
          label: tr('settings.shuttle_buses', 'Shuttle buses'),
          value: Store.I.get('sgbus_shuttles') == 'paid' ? 'paid' : 'free',
          options: [('free', tr('settings.shuttles_free', 'Free only')), ('paid', tr('settings.shuttles_paid', 'Free and paid'))],
          onChanged: (v) => _set('sgbus_shuttles', v == 'paid' ? 'paid' : null),
          note: tr('settings.shuttles_note',
              "Shuttle buses, such as NUS's and NTU's, IKEA's and Changi Airport's, in Navigate and on Explorer's map. Paid ones, such as Mandai's and the TS1 to Johor Bahru, only with Free and paid. A hotel's shuttle is only used to or from that hotel."),
        ),
      ];

  List<Widget> _help() => [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(tr('settings.show_me_around', 'Show me around')),
          subtitle: Text(tr('settings.each_page_shows_you_around', 'Each page shows you around the first time you open it. Pick one to see its tour again.')),
          onTap: () => AppNav.open('tours'),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(tr('settings.sgbus_terminal', 'sgbus terminal')),
          trailing: TextButton(onPressed: () => AppNav.open('terminal'), child: Text(tr('settings.open_the_sgbus_terminal', 'Open the sgbus terminal'))),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(tr('settings.coins', 'uwuCoins')),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => AppNav.open('coins'),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(tr('settings.guide', 'Guide')),
          subtitle: const Text('guide.sgbus.uwuapps.org'),
          onTap: () => Native.call('SgBus', 'openLink', {'url': 'https://guide.sgbus.uwuapps.org/'}).catchError((_) => null),
        ),
        ?BugReportEntry.build?.call(context),
      ];

  @override
  Widget build(BuildContext context) {
    final (title, body) = switch (widget.group) {
      'you' => (tr('settings.you', 'You'), _you()),
      'pages' => (tr('settings.pages_and_edge_tray', 'Pages and Edge Tray'), _pages()),
      'trips' => (tr('settings.trips_and_alerts', 'Trips and alerts'), _trips()),
      'navigate' => (tr('settings.navigate', 'Navigate'), _navigate()),
      _ => (tr('settings.help_and_extras', 'Help and extras'), _help()),
    };
    return SgScaffold(title: title, body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: body));
  }
}

/// The reminders' settings (features/reminders/), when the app has them.
class RemindersSettings {
  RemindersSettings._();
  static Widget Function(BuildContext context)? build;
}

/// Report a problem (features/misc/bug_report.dart).
class BugReportEntry {
  BugReportEntry._();
  static Widget Function(BuildContext context)? build;
}
