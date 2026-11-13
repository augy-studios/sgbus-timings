// The Calendar tab of Navigate's From, To and Add a stop (the site's Calendar.render), and
// Calendar settings (the site's #calendarModal). The events and their places are data/calendar.dart's.
import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import '../../app/nav.dart';
import '../../data/calendar.dart';
import '../../data/places.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../share/share_card.dart';

/// An event picked, and the place it's at (null when its location matched nothing).
typedef EventPick = ({CalEvent event, CalPlace? place});

class CalendarTab extends StatefulWidget {
  const CalendarTab({super.key, required this.onPick});
  final void Function(EventPick pick) onPick;

  @override
  State<CalendarTab> createState() => _CalendarTabState();
}

class _CalendarTabState extends State<CalendarTab> with WidgetsBindingObserver {
  List<CalEvent>? _list;
  CalError? _error;
  final Map<String, CalPlace?> _places = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (Calendar.connected) _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from the permission prompt or the calendar app: read again.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _error?.reason == 'permission') _load();
  }

  Future<void> _load() async {
    setState(() {
      _list = null;
      _error = null;
    });
    try {
      final list = await Calendar.upcomingList();
      if (!mounted) return;
      for (final ev in list) {
        final k = Calendar.knownPlace(ev.location);
        if (k.known) _places[ev.location] = k.place;
      }
      setState(() => _list = list);
      // Matched three at a time, each row filled in as its place comes back.
      final locations = {for (final ev in list) ev.location}.where((l) => !_places.containsKey(l)).toList();
      var next = 0;
      Future<void> worker() async {
        while (next < locations.length) {
          final loc = locations[next++];
          try {
            final place = await Calendar.placeFor(loc);
            _places[loc] = place;
          } catch (_) {
            // Not looked up: tried again next time.
          }
          if (mounted) setState(() {});
        }
      }

      await Future.wait([worker(), worker(), worker()]);
    } on CalError catch (e) {
      if (mounted) setState(() => _error = e);
    } catch (_) {
      if (mounted) setState(() => _error = CalError(tr('cal.readFailed', "Couldn't read your calendar right now.")));
    }
  }

  Future<void> _allow() async {
    try {
      if (await Native.allow('PhoneCalendar', 'calendar')) _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final settings = TextButton(
      onPressed: () async {
        await CalendarSettings.open();
        if (mounted) Calendar.connected ? _load() : setState(() => _list = null);
      },
      child: Text(tr('cal.settings', 'Calendar settings')),
    );
    if (!Calendar.connected) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (Calendar.canPhone)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.calendar_month_outlined),
            title: Text(tr('cal.usePhone', "Use this phone's calendar")),
            subtitle: Text(tr('cal.usePhoneSub', 'Every calendar on this phone')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Calendar.usePhone();
              _load();
            },
          ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.calendar_month_outlined),
          title: Text(tr('cal.sync', 'Sync with calendar')),
          subtitle: Text(tr('cal.syncSub', 'Plan trips from your events')),
          trailing: const Icon(Icons.chevron_right),
          onTap: () async {
            await CalendarSettings.open();
            if (mounted && Calendar.connected) _load();
          },
        ),
      ]);
    }
    if (_error != null) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(_error!.message, style: TextStyle(color: sg.muted))),
        if (_error!.reason == 'permission')
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FilledButton.tonalIcon(onPressed: _allow, icon: const Icon(Icons.calendar_month_outlined), label: Text(tr('cal.allowAccess', 'Allow calendar access'))),
          ),
        Align(alignment: AlignmentDirectional.centerEnd, child: settings),
      ]);
    }
    if (_list == null) return EmptyNote(tr('cal.reading', 'Reading your calendar…'));
    final list = _list!;
    final today = list.where(Calendar.isToday).toList();
    final later = list.where((e) => !Calendar.isToday(e)).toList();
    Widget head(String t) => Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 2),
          child: Text(t, style: TextStyle(color: sg.muted, fontSize: 12, fontWeight: FontWeight.w700)),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (list.isEmpty) EmptyNote(Calendar.eventsText(0)),
      if (today.isNotEmpty) head(tr('alerts.today', 'Today')),
      ...today.map(_row),
      if (later.isNotEmpty) head(tr('cal.later', 'Later')),
      ...later.map(_row),
      Align(alignment: AlignmentDirectional.centerEnd, child: settings),
    ]);
  }

  Widget _row(CalEvent ev) {
    final sg = context.sg;
    final place = _places[ev.location];
    final notFound = _places.containsKey(ev.location) && place == null;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.event_outlined),
      title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(Calendar.whenText(ev), style: TextStyle(color: sg.brandInk, fontSize: 12, fontWeight: FontWeight.w700)),
        Text(ev.title),
      ]),
      subtitle: Text.rich(TextSpan(children: [
        TextSpan(text: ev.location),
        if (notFound) TextSpan(text: ' · ${tr('cal.notFound', 'Location not found. Tap to pick it.')}', style: const TextStyle(fontStyle: FontStyle.italic)),
      ])),
      onTap: () => widget.onPick((event: ev, place: place)),
      trailing: PopupMenuButton<String>(
        tooltip: tr('cal.moreFor', 'More for {title}', {'title': ev.title}),
        onSelected: (v) {
          if (v == 'hide') {
            Calendar.hide(ev.key);
            setState(() => _list = _list!.where((e) => e != ev).toList());
          } else if (v == 'save' && place != null) {
            Places.setCustom(Places.custom()..add({'id': Places.newId(), 'name': ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title, ...place.toJson()}));
            AppNav.say(tr('places.saving', 'Saving: {place}', {'place': place.label}));
          } else if (v == 'share' && place != null) {
            ShareCard.place(context, label: place.label, lat: place.lat, lng: place.lng);
          }
        },
        itemBuilder: (_) => [
          if (place != null) PopupMenuItem(value: 'save', child: ListTile(leading: const Icon(Icons.push_pin_outlined), title: Text(tr('cal.saveAsPlace', 'Save as place')))),
          if (place != null) PopupMenuItem(value: 'share', child: ListTile(leading: const Icon(Icons.share_outlined), title: Text(tr('cal.sharePlace', 'Share place')))),
          PopupMenuItem(value: 'hide', child: ListTile(leading: const Icon(Icons.visibility_off_outlined), title: Text(tr('cal.hideEvent', 'Hide this event')))),
        ],
      ),
    );
  }
}

/// Calendar settings: this phone's calendar, an iCal link, or an .ics file.
class CalendarSettings extends StatefulWidget {
  const CalendarSettings({super.key});

  static Future<void> open() => AppNav.push(const CalendarSettings(), name: 'calendar');

  @override
  State<CalendarSettings> createState() => _CalendarSettingsState();
}

class _CalendarSettingsState extends State<CalendarSettings> with WidgetsBindingObserver {
  late final _url = TextEditingController(text: Calendar.settings()['url'] as String? ?? '');
  String _note = '';
  String _tone = ''; // error, allow
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _url.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && Calendar.settings()['phone'] == true && _tone == 'allow') _usePhone();
  }

  String get _found => tr('cal.findThem', "Find them under Calendar when you tap into Navigate's From, To or Add a stop.");

  Future<void> _usePhone() async {
    Calendar.usePhone();
    setState(() {
      _note = tr('cal.readingPhone', "Reading your phone's calendar…");
      _tone = '';
    });
    try {
      final list = await Calendar.phoneEvents();
      _note = '${tr('cal.linked', 'Linked.')} ${Calendar.eventsText(list.length, yet: true)} $_found';
    } on CalError catch (e) {
      _note = e.message;
      _tone = e.reason == 'permission' ? 'allow' : 'error';
    }
    if (mounted) setState(() {});
  }

  Future<void> _link() async {
    final url = _url.text.trim();
    if (url.isEmpty) {
      setState(() {
        _note = tr('cal.pasteFirst', 'Paste the link first.');
        _tone = 'error';
      });
      return;
    }
    setState(() {
      _busy = true;
      _note = tr('cal.reading', 'Reading your calendar…');
      _tone = '';
    });
    try {
      final list = await Calendar.link(url);
      _note = '${tr('cal.linked', 'Linked.')} ${Calendar.eventsText(list.length, yet: true)} $_found';
    } catch (e) {
      _note = '$e';
      _tone = 'error';
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _import() async {
    try {
      final file = await openFile(acceptedTypeGroups: const [XTypeGroup(label: 'iCalendar', extensions: ['ics'], mimeTypes: ['text/calendar'])]);
      if (file == null) return;
      if (await file.length() > 5 * 1024 * 1024) throw CalError(tr('cal.fileTooBig', 'That file is too big. Export just the next few months.'));
      final list = Calendar.importFile(file.name, utf8.decode(await file.readAsBytes(), allowMalformed: true));
      _note = '${tr('cal.imported', 'Imported.')} ${Calendar.eventsText(list.length)}';
      _tone = '';
    } catch (e) {
      _note = '$e';
      _tone = 'error';
    }
    if (mounted) setState(() {});
  }

  Future<void> _remove() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(tr('cal.removeConfirm', 'Stop showing your calendar here? This forgets the link, file or phone calendar choice on this device.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('places.cancel', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('html.remove_calendar', 'Remove calendar'))),
        ],
      ),
    );
    if (yes != true) return;
    Calendar.unlink();
    _url.clear();
    setState(() {
      _note = 'Removed.';
      _tone = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final s = Calendar.settings();
    final file = s['file'] as Map?;
    final source = s['phone'] == true
        ? tr('cal.source.phone', "Using this phone's calendar, through the Android app.")
        : s['url'] != null
            ? tr('cal.source.url', 'Linked to your calendar by its iCal link.')
            : file != null
                ? tr('cal.source.file', 'Imported from {file}, {date}. Import it again for new events.',
                    {'file': file['name'], 'date': file['importedAt'] is num ? When.dayShort((file['importedAt'] as num).toInt()) : ''})
                : tr('cal.source.none', 'Not linked yet.');
    TextStyle note = TextStyle(color: sg.muted, fontSize: 13);
    return SgScaffold(
      title: tr('html.sync_with_calendar', 'Sync with calendar'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        Text(
            tr('html.calendar_events_note',
                "Your events with a location, for the next two weeks, show under Calendar when you tap into Navigate's From, To or Add a stop. Tap one in To for the way there, arriving by its start."),
            style: note),
        const SizedBox(height: 10),
        SgCard(child: Text(source, style: const TextStyle(fontWeight: FontWeight.w600))),
        if (_note.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(_note, style: TextStyle(color: _tone.isEmpty ? sg.ok : sg.error)),
          ),
        if (_tone == 'allow')
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton.tonalIcon(
                onPressed: () async {
                  if (await Native.allow('PhoneCalendar', 'calendar').catchError((_) => false)) _usePhone();
                },
                icon: const Icon(Icons.calendar_month_outlined),
                label: Text(tr('html.allow_calendar_access', 'Allow calendar access')),
              ),
            ),
          ),
        if (Calendar.canPhone) ...[
          SectionLabel(tr('html.this_phone_s_calendar', "This phone's calendar")),
          if (s['phone'] != true)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton.icon(onPressed: _usePhone, icon: const Icon(Icons.phone_android), label: Text(tr('html.use_this_phone_s_calendar', "Use this phone's calendar"))),
            ),
          const SizedBox(height: 6),
          Text(
              tr('html.calendar_phone_note',
                  'Every calendar on this phone (Google, Outlook, Samsung and others), read by the app each time the Calendar tab opens. Nothing leaves the phone except each event\'s location, looked up to find the place.'),
              style: note),
        ],
        SectionLabel(tr('html.your_calendar_s_private_ical', "Your calendar's private iCal link")),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _url,
              keyboardType: TextInputType.url,
              onSubmitted: (_) => _link(),
              decoration: const InputDecoration(hintText: 'https://… .ics, or webcal://…'),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(onPressed: _busy ? null : _link, child: Text(tr('html.link', 'Link'))),
        ]),
        const SizedBox(height: 8),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: Text(tr('html.where_to_find_the_link', 'Where to find the link')),
          childrenPadding: const EdgeInsets.only(bottom: 8),
          children: [
            _how(tr('html.google_calendar', 'Google Calendar'),
                '${tr('html.on_a_computer_settings_then', ', on a computer: Settings, then your calendar under "Settings for my calendars", then Integrate calendar. Copy')} ${tr('html.secret_address_in_ical_format', 'Secret address in iCal format')}.'),
            _how(tr('html.outlook', 'Outlook'),
                '${tr('html.settings_calendar_shared_calendars_under', ': Settings, Calendar, Shared calendars. Under Publish a calendar, pick the calendar and "Can view all details", Publish, then copy the')} ${tr('html.ics', 'ICS')} ${tr('html.link_2', 'link.')}'),
            _how(tr('html.icloud', 'iCloud'),
                '${tr('html.in_calendar_share_the_calendar', ': in Calendar, share the calendar and turn on')} ${tr('html.public_calendar', 'Public Calendar')}${tr('html.then_copy_its_link_anyone', ', then copy its link. Anyone with that link can see the calendar.')}'),
          ],
        ),
        Text(
            tr('html.calendar_link_note',
                "The link is kept on this device. Each time the Calendar tab opens, it's read through this site's server, because calendar services don't let a web page read it directly. The server passes the calendar straight back and keeps nothing. Treat the link like a password: anyone who has it can see your calendar."),
            style: note),
        SectionLabel(tr('html.or_import_an_ics_file', 'Or import an .ics file')),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: OutlinedButton.icon(onPressed: _import, icon: const Icon(Icons.upload_file), label: Text(tr('html.or_import_an_ics_file', 'Or import an .ics file'))),
        ),
        const SizedBox(height: 6),
        Text(tr('html.a_file_is_read_on', "A file is read on this device only and never sent anywhere, but it's a snapshot: import it again for new events."), style: note),
        if (Calendar.connected) ...[
          const SizedBox(height: 16),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(onPressed: _remove, icon: Icon(Icons.delete_outline, color: sg.error), label: Text(tr('html.remove_calendar', 'Remove calendar'), style: TextStyle(color: sg.error))),
          ),
        ],
      ]),
    );
  }

  Widget _how(String what, String rest) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text.rich(TextSpan(children: [TextSpan(text: what, style: const TextStyle(fontWeight: FontWeight.w700)), TextSpan(text: rest)])),
      );
}
