// The small things: the app's update bar and Check for app updates (the site's js/app-update.js),
// Report a bug (js/bug-report.js), the Edge Tray's SimplyGo, and #near links.
//
// Update bar: as the app opens, and again on coming back after six hours, /api/app-release says
// the newest version; a newer one than this brings a bar to the top, whose Update opens the app's
// own update window (UpdateActivity), and Not now puts it away while the app's open.
//
// Report a bug: what went wrong, a way to be reached if they'd like an answer, up to three
// pictures (from the phone, or a screenshot of the app as it is), and what helps find it (the
// app's version, the phone, the page on show and the language), sent to Augy on Telegram by
// /api/bug-report. What's typed stays until it's sent.
import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../app/shell.dart';
import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../settings/settings_screen.dart';
import '../timings/timings_page.dart';

const _updateLink = 'intent://update#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;end';
const _checkLink = 'intent://update/check#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;end';
const _simplyGoPlay = 'https://play.google.com/store/apps/details?id=sg.com.transitlink';

void registerMisc() {
  AppNav.register('simplygo', (_) => Native.call('SgBus', 'openLink', {
        'url': 'intent://open/simplygo#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;S.browser_fallback_url=${Uri.encodeComponent(_simplyGoPlay)};end',
      }).catchError((_) => null));
  AppNav.register('near', (_) {
    AppNav.showPage('timings');
    TimingsPage.askNear.value++;
  });
  AppNav.register('appUpdate', (a) {
    if (a['version'] != null) {
      AppUpdate.check(version: '${a['version']}');
    } else {
      Native.call('SgBus', 'openLink', {'url': _checkLink}).catchError((_) => null);
    }
  });
  BugReportEntry.build = (context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.bug_report_outlined),
        title: Text(tr('settings.report_a_bug', 'Report a bug')),
        subtitle: Text(tr('settings.something_not_working_tell_augy', 'Something not working? Tell Augy what happened, and it reaches him on Telegram.')),
        onTap: () => AppNav.push(const BugReport(), name: 'bug'),
      );
  Shell.top.add(() => const AppUpdateBar());
  AppUpdate.check();
  WidgetsBinding.instance.addObserver(_Resume());
}

class _Resume extends WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && When.nowMs() - AppUpdate._checkedAt > 6 * 3600 * 1000) AppUpdate.check();
  }
}

// ---------- the update bar ----------

class AppUpdate {
  AppUpdate._();
  static int _checkedAt = 0;
  static bool dismissed = false;
  static final latest = ValueNotifier<Map<String, dynamic>?>(null);

  /// Whether version a comes after b, number by number: 1.10.0 after 1.9.0.
  static bool newer(String a, String b) {
    final x = a.split('.').map((n) => int.tryParse(n) ?? 0).toList();
    final y = b.split('.').map((n) => int.tryParse(n) ?? 0).toList();
    for (var i = 0; i < (x.length > y.length ? x.length : y.length); i++) {
      final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
      if (d != 0) return d > 0;
    }
    return false;
  }

  static Future<void> check({String? version}) async {
    _checkedAt = When.nowMs();
    final running = Native.info?['version'] as String?;
    if (running == null) return;
    try {
      final got = await Api.map('app-release', query: {'v': ?version});
      final v = got['version'] as String?;
      if (v != null && newer(v, running)) latest.value = got;
    } catch (_) {
      // Offline: next time.
    }
  }
}

class AppUpdateBar extends StatelessWidget {
  const AppUpdateBar({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
        valueListenable: AppUpdate.latest,
        builder: (context, latest, _) {
          if (latest == null || AppUpdate.dismissed) return const SizedBox.shrink();
          final sg = context.sg;
          final self = Native.has('update');
          return Semantics(
            container: true,
            label: tr('appUpdate.label', 'App update'),
            child: Material(
              color: sg.brand,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                  child: Row(children: [
                    Expanded(child: Text(tr('appUpdate.out', 'Version {v} of the Android app is out.', {'v': latest['version']}), style: TextStyle(color: sg.onBrand))),
                    FilledButton(
                      onPressed: () => Native.call('SgBus', 'openLink', {'url': self ? _updateLink : '${latest['page']}'}).catchError((_) => null),
                      child: Text(self ? tr('appUpdate.update', 'Update') : tr('appUpdate.download', 'Download')),
                    ),
                    TextButton(
                      onPressed: () {
                        AppUpdate.dismissed = true;
                        AppUpdate.latest.value = null;
                      },
                      child: Text(tr('appUpdate.notNow', 'Not now'), style: TextStyle(color: sg.onBrand)),
                    ),
                  ]),
                ),
              ),
            ),
          );
        },
      );
}

// ---------- Report a bug ----------

class BugReport extends StatefulWidget {
  const BugReport({super.key});

  @override
  State<BugReport> createState() => _BugReportState();
}

class _BugReportState extends State<BugReport> {
  static const _draftKey = 'app.bugDraft';
  static const _maxShots = 3;
  static const _shotSide = 1600.0;
  static const _email = 'augy@augystudios.com';
  late final _text = TextEditingController(text: Store.I.map(_draftKey)['text'] as String? ?? '');
  late final _contact = TextEditingController(text: Store.I.map(_draftKey)['contact'] as String? ?? '');
  final List<String> _shots = []; // JPEG data URLs
  bool _sending = false;
  String _status = '';
  bool _offerEmail = false;

  @override
  void dispose() {
    _text.dispose();
    _contact.dispose();
    super.dispose();
  }

  void _keep() => Store.I.putJson(_draftKey, {'text': _text.text, 'contact': _contact.text});

  Map<String, String> get _details {
    final info = Native.info;
    return {
      'version': '${info?['version'] ?? ''}',
      'platform': 'android',
      'device': ['Android ${info?['android'] ?? ''}'.trim(), if (info?['model'] != null) '${info!['model']}', 'Flutter'].join(' · '),
      'page': AppNav.page.value,
      'lang': I18n.I.lang,
    };
  }

  String get _detailsText => ['Android app', _details['version'], _details['device'], _details['page']].where((s) => s != null && s.isNotEmpty).join(' · ');

  /// An image as a JPEG data URL, at most _shotSide a side and about 900 KB, made away from
  /// the screen's thread.
  static Future<String?> _jpeg(Uint8List bytes) => compute(_toJpeg, bytes);

  static String? _toJpeg(Uint8List bytes) {
    var image = img.decodeImage(bytes);
    if (image == null) return null;
    final side = image.width > image.height ? image.width : image.height;
    if (side > _shotSide) image = img.copyResize(image, width: (image.width * _shotSide / side).round());
    for (final q in [80, 65, 50, 35]) {
      final out = img.encodeJpg(image, quality: q);
      if (out.length <= 900 * 1024 || q == 35) return 'data:image/jpeg;base64,${base64Encode(out)}';
    }
    return null;
  }

  Future<void> _pick() async {
    final files = await openFiles(acceptedTypeGroups: const [XTypeGroup(label: 'Images', mimeTypes: ['image/*'], extensions: ['jpg', 'jpeg', 'png', 'webp'])]);
    for (final f in files.take(_maxShots - _shots.length)) {
      final s = await _jpeg(await f.readAsBytes());
      if (s != null) _shots.add(s);
    }
    if (mounted) setState(() {});
  }

  Future<void> _screenshot() async {
    final boundary = AppNav.shotKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return;
    // The page under this form.
    final shot = await boundary.toImage(pixelRatio: 1.5);
    final png = await shot.toByteData(format: ui.ImageByteFormat.png);
    final jpeg = png == null ? null : await _jpeg(png.buffer.asUint8List());
    if (jpeg != null && _shots.length < _maxShots) _shots.add(jpeg);
    if (mounted) setState(() {});
  }

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.length < 5) return setState(() => _status = tr('bug.say_what_went_wrong', 'Please say what went wrong first.'));
    setState(() {
      _sending = true;
      _status = tr('bug.sending', 'Sending…');
      _offerEmail = false;
    });
    try {
      final r = await Api.post('bug-report', {..._details, 'text': text, 'contact': _contact.text.trim(), 'website': '', 'images': _shots, 'full': <int>[]});
      final id = r is Map && r['id'] is String ? r['id'] as String : null;
      _text.clear();
      _contact.clear();
      _shots.clear();
      Store.I.put(_draftKey, null);
      _status = id != null
          ? tr('bug.sentId', 'Sent as report {id}. Thank you! Augy will look into it.', {'id': id})
          : tr('bug.sent', 'Sent. Thank you! Augy will look into it.');
    } on ApiError catch (e) {
      if (e.status == 400 || e.status == 413 || e.status == 429) {
        _status = e.message.isNotEmpty ? e.message : tr('bug.couldnt_send', "Couldn't send it right now.");
      } else {
        _status = e.status == 503 ? tr('bug.not_set_up', "Bug reports can't be sent from the app yet.") : tr('bug.couldnt_send', "Couldn't send it right now.");
        _offerEmail = true;
      }
    } catch (_) {
      _status = tr('bug.couldnt_send', "Couldn't send it right now.");
      _offerEmail = true;
    }
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    return SgScaffold(
      title: tr('bug.report_a_bug', 'Report a bug'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        TextField(
          controller: _text,
          minLines: 4,
          maxLines: 10,
          onChanged: (_) => _keep(),
          decoration: InputDecoration(labelText: tr('bug.what_went_wrong', 'What went wrong?'), hintText: tr('bug.what_you_did_what_happened', 'What you did, what happened, and what you expected'), alignLabelWithHint: true),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _contact,
          onChanged: (_) => _keep(),
          decoration: InputDecoration(labelText: tr('bug.how_to_reach_you_optional', 'How to reach you (optional)'), hintText: tr('bug.telegram_or_email_for_an', 'Telegram @name or email, for an answer')),
        ),
        SectionLabel(tr('bug.pictures', 'Pictures (optional)')),
        if (_shots.isNotEmpty)
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (i, s) in _shots.indexed)
              Stack(children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.memory(base64Decode(s.split(',').last), width: 90, height: 140, fit: BoxFit.cover, semanticLabel: tr('bug.picture_n', 'Picture {n}', {'n': i + 1})),
                ),
                Positioned(
                  right: 0,
                  top: 0,
                  child: IconButton.filledTonal(
                    visualDensity: VisualDensity.compact,
                    tooltip: tr('bug.remove_picture', 'Remove picture {n}', {'n': i + 1}),
                    onPressed: () => setState(() => _shots.removeAt(i)),
                    icon: const Icon(Icons.close, size: 16),
                  ),
                ),
              ]),
          ]),
        Wrap(spacing: 8, children: [
          OutlinedButton.icon(onPressed: _shots.length >= _maxShots ? null : _pick, icon: const Icon(Icons.image_outlined), label: Text(tr('bug.add_pictures', 'Add pictures'))),
          OutlinedButton.icon(onPressed: _shots.length >= _maxShots ? null : _screenshot, icon: const Icon(Icons.screenshot_outlined), label: Text(tr('bug.screenshot_page', 'Screenshot this page'))),
        ]),
        Text(tr('bug.pictures_note', 'Up to 3. Screenshot this page takes the whole page, top to bottom, as it is under Settings and this window; a map may come out blank.'),
            style: TextStyle(color: sg.muted, fontSize: 13)),
        const SizedBox(height: 12),
        Text('${tr('bug.sent_with_it', 'Sent with it, to help find the bug:')} $_detailsText.', style: TextStyle(color: sg.muted, fontSize: 13)),
        const SizedBox(height: 12),
        FilledButton.icon(onPressed: _sending ? null : _send, icon: const Icon(Icons.send), label: Text(tr('bug.send', 'Send'))),
        if (_status.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_status)),
        if (_offerEmail)
          TextButton(
            onPressed: () => Native.call('SgBus', 'openLink', {
              'url': 'mailto:$_email?subject=${Uri.encodeComponent('SG Bus Timings bug report')}&body=${Uri.encodeComponent('${_text.text.trim()}\n\n$_detailsText')}',
            }).catchError((_) => null),
            child: Text(tr('bug.email_it_instead', 'Email it instead.')),
          ),
      ]),
    );
  }
}
