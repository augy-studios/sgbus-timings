// The small things: the app's update bar and Check for app updates (the site's js/app-update.js),
// Report a bug (js/bug-report.js), the Edge Tray's SimplyGo, and #near links.
//
// Update bar: as the app opens, and again on coming back after six hours, /api/app-release says
// the newest version; a newer one than this brings a bar to the top, whose Update opens the app's
// own update window (UpdateActivity), and Not now puts it away while the app's open.
//
// Report a bug: what went wrong, a way to be reached if they'd like an answer, up to three
// pictures (from the phone, or a screenshot of a page of the app), and what helps find it (the
// app's version, the phone, the page on show and the language), sent to Augy on Telegram by
// /api/bug-report. What's typed stays until it's sent.
//
// Screenshot a page puts the report away and leaves you in the app, to go to the page you want,
// with a floating Screenshot this page. That takes the whole page, top to bottom, scrolling it a
// screen at a time and joining them up, and brings you back to the report. The button floats outside
// the part of the screen that's taken, so it isn't in the picture.
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import '../../api/api.dart';
import '../../api/net.dart';
import '../../app/nav.dart';
import '../../app/shell.dart';
import '../../data/nav_offline.dart';
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

void registerMisc() {
  AppNav.register('simplygo', (_) => Native.call('SgBus', 'openApp', {'name': 'simplygo'}).catchError((_) => null));
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
  AppNav.shotBar = () => const _ShotBar();
  // Press and hold a button to see what it does: said once, a moment after the first open.
  if (Store.I.get('sgbus_hold_hint') != '1') {
    Timer(const Duration(milliseconds: 2500), () {
      if (AppNav.nav?.canPop() ?? true) return;
      Store.I.put('sgbus_hold_hint', '1');
      AppNav.say(tr('ui.holdTip', 'Tip: press and hold a button to see what it does.'));
    });
  }
  // What Bus and train needs to plan with no connection, kept while there is one.
  Timer(const Duration(seconds: 8), () => NavOffline.keepReady());
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
              color: sg.bar,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                  child: Row(children: [
                    Expanded(child: Text(tr('appUpdate.out', 'Version {v} of the Android app is out.', {'v': latest['version']}), style: TextStyle(color: sg.onBar))),
                    FilledButton(
                      onPressed: () => Native.call('SgBus', 'openLink', {'url': self ? _updateLink : '${latest['page']}'}).catchError((_) => null),
                      child: Text(self ? tr('appUpdate.update', 'Update') : tr('appUpdate.download', 'Download')),
                    ),
                    TextButton(
                      onPressed: () {
                        AppUpdate.dismissed = true;
                        AppUpdate.latest.value = null;
                      },
                      child: Text(tr('appUpdate.notNow', 'Not now'), style: TextStyle(color: sg.onBar)),
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

/// A report's pictures, which outlive its screen while you go and find a page to take.
class _Pictures {
  _Pictures._();
  static final List<String> shots = []; // JPEG data URLs
  static final Set<int> full = {}; // whole pages among them: each also goes as a file, at its full size

  static void clear() {
    shots.clear();
    full.clear();
  }

  static void removeAt(int i) {
    shots.removeAt(i);
    final moved = {for (final n in full) if (n != i) n > i ? n - 1 : n};
    full
      ..clear()
      ..addAll(moved);
  }
}

class BugReport extends StatefulWidget {
  const BugReport({super.key});

  /// The whole page, as a JPEG data URL that Telegram takes as a photo: no wider than pageWidth,
  /// no taller than pageRatio times its width, with its sides adding up to at most pageSum, and
  /// about 900 KB, rougher and then smaller till it is.
  static const pageWidth = 1080;
  static const pageRatio = 20;
  static const pageSum = 9998;

  static String? pageJpeg(Uint8List bytes) {
    final image = img.decodeImage(bytes);
    if (image == null) return null;
    final w = image.width;
    final h = math.min(image.height, w * pageRatio);
    var k = math.min(1.0, math.min(pageWidth / w, pageSum / (w + h)));
    final page = h == image.height ? image : img.copyCrop(image, x: 0, y: 0, width: w, height: h);
    for (var tries = 0; tries < 8; tries++) {
      final out = img.encodeJpg(k >= 1 ? page : img.copyResize(page, width: math.max(1, (w * k).floor()), height: math.max(1, (h * k).floor())), quality: tries < 2 ? 80 : 68);
      if (out.length <= 900 * 1024 || tries == 7) return 'data:image/jpeg;base64,${base64Encode(out)}';
      if (tries >= 1) k *= 0.82;
    }
    return null;
  }

  @override
  State<BugReport> createState() => _BugReportState();
}

/// What floats over the app while you find the page to take.
class _ShotBar extends StatefulWidget {
  const _ShotBar();

  @override
  State<_ShotBar> createState() => _ShotBarState();
}

class _ShotBarState extends State<_ShotBar> {
  bool _busy = false;

  /// Each screenful settled before it's taken.
  static Future<void> _settled() async {
    WidgetsBinding.instance.scheduleFrame();
    await WidgetsBinding.instance.endOfFrame;
    await Future<void>.delayed(const Duration(milliseconds: 80));
    WidgetsBinding.instance.scheduleFrame();
    await WidgetsBinding.instance.endOfFrame;
  }

  /// The biggest list on show that has more than fits on the screen, if there is one.
  static ScrollableState? _pageScroll(BuildContext from) {
    ScrollableState? best;
    var most = 0.0;
    final wide = MediaQuery.sizeOf(from).width / 2;
    void look(Element e) {
      if (e is StatefulElement && e.state is ScrollableState) {
        final s = e.state as ScrollableState;
        final box = e.findRenderObject();
        final p = s.position;
        // Not the Edge Tray's column, or anything else down one side.
        if (p.axis == Axis.vertical && box is RenderBox && box.hasSize && box.size.width >= wide && p.hasContentDimensions && p.maxScrollExtent > 8) {
          final area = box.size.width * box.size.height;
          if (area > most) {
            most = area;
            best = s;
          }
        }
      }
      e.debugVisitOnstageChildren(look);
    }

    (from as Element).debugVisitOnstageChildren(look);
    return best;
  }

  static const _ratio = 1.5;

  /// What can be drawn in one picture, in pixels.
  static const _tallest = 8000.0;

  /// The page from top to bottom: the screen with its list at the top, then each further screenful
  /// of the list, and the rest of the screen under them.
  static Future<ui.Image?> _wholePage() async {
    final at = AppNav.shotKey.currentContext;
    final boundary = at?.findRenderObject() as RenderRepaintBoundary?;
    if (at == null || boundary == null) return null;
    final scroll = _pageScroll(at);
    if (scroll == null) return boundary.toImage(pixelRatio: _ratio);
    final p = scroll.position;
    final was = p.pixels;
    final box = scroll.context.findRenderObject()! as RenderBox;
    final bottom = (box.localToGlobal(Offset.zero, ancestor: boundary).dy + box.size.height) * _ratio;
    final slices = <(ui.Image, double)>[];
    ui.Image first;
    try {
      p.jumpTo(p.minScrollExtent);
      await _settled();
      first = await boundary.toImage(pixelRatio: _ratio);
      var y = p.minScrollExtent;
      var height = first.height.toDouble();
      while (y < p.maxScrollExtent - 0.5 && height < _tallest) {
        final next = math.min(y + p.viewportDimension, p.maxScrollExtent);
        p.jumpTo(next);
        await _settled();
        final h = (next - y) * _ratio;
        slices.add((await boundary.toImage(pixelRatio: _ratio), h));
        height += h;
        y = next;
      }
    } finally {
      p.jumpTo(was);
    }
    final w = first.width.toDouble();
    var total = first.height.toDouble();
    for (final s in slices) {
      total += s.$2;
    }
    final record = ui.PictureRecorder();
    final canvas = Canvas(record);
    final paint = Paint();
    canvas.drawImageRect(first, Rect.fromLTWH(0, 0, w, bottom), Rect.fromLTWH(0, 0, w, bottom), paint);
    var y = bottom;
    for (final (image, h) in slices) {
      canvas.drawImageRect(image, Rect.fromLTWH(0, bottom - h, w, h), Rect.fromLTWH(0, y, w, h), paint);
      y += h;
    }
    final under = first.height - bottom;
    if (under > 0) canvas.drawImageRect(first, Rect.fromLTWH(0, bottom, w, under), Rect.fromLTWH(0, y, w, under), paint);
    final out = await record.endRecording().toImage(w.round(), total.round());
    first.dispose();
    for (final (image, _) in slices) {
      image.dispose();
    }
    return out;
  }

  void _back() {
    AppNav.shooting.value = false;
    AppNav.push(const BugReport(), name: 'bug');
  }

  Future<void> _take() async {
    setState(() => _busy = true);
    try {
      final shot = await _wholePage();
      final png = await shot?.toByteData(format: ui.ImageByteFormat.png);
      shot?.dispose();
      final jpeg = png == null ? null : await compute(BugReport.pageJpeg, png.buffer.asUint8List());
      if (jpeg == null) throw StateError('no picture');
      _Pictures.shots.add(jpeg);
      _Pictures.full.add(_Pictures.shots.length - 1);
    } catch (_) {
      AppNav.say(tr('bug.screenshot_failed', "Couldn't take a screenshot here. Take one with your phone and add it instead."));
    }
    if (mounted) _busy = false;
    _back();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Flexible(
              child: FloatingActionButton.extended(
                heroTag: null,
                onPressed: _busy ? null : _take,
                icon: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.screenshot_outlined),
                label: Text(_busy ? tr('bug.taking_screenshot', 'Taking a screenshot…') : tr('bug.screenshot_page', 'Screenshot this page')),
              ),
            ),
            const SizedBox(width: 10),
            FloatingActionButton.small(
              heroTag: null,
              onPressed: _busy ? null : _back,
              child: Semantics(label: tr('bug.cancel', 'Cancel'), child: const Icon(Icons.close)),
            ),
          ]),
        ),
      ),
    );
  }
}

class _BugReportState extends State<BugReport> {
  static const _draftKey = 'app.bugDraft';
  static const _maxShots = 3;
  static const _shotSide = 1600.0;
  static const _email = 'augy@augystudios.com';
  late final _text = TextEditingController(text: Store.I.map(_draftKey)['text'] as String? ?? '');
  late final _contact = TextEditingController(text: Store.I.map(_draftKey)['contact'] as String? ?? '');
  List<String> get _shots => _Pictures.shots;
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
      if (s != null) {
        _shots.add(s);
      } else if (mounted) {
        AppNav.say(tr('bug.picture_failed', "Couldn't add that picture."));
      }
    }
    if (mounted) setState(() {});
  }

  /// Off to the app to find the page to take; what's typed is kept (_keep).
  void _screenshot() {
    _keep();
    AppNav.shooting.value = true;
    AppNav.nav?.popUntil((r) => r.isFirst);
  }

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.length < 5) return setState(() => _status = tr('bug.say_what_went_wrong', 'Please say what went wrong first.'));
    if (Net.off.value) return setState(() => _status = tr('bug.offline', "You're offline. It's kept here: send it once you're back online."));
    setState(() {
      _sending = true;
      _status = tr('bug.sending', 'Sending…');
      _offerEmail = false;
    });
    try {
      final r = await Api.post('bug-report', {..._details, 'text': text, 'contact': _contact.text.trim(), 'website': '', 'images': _shots, 'full': _Pictures.full.toList()});
      final id = r is Map && r['id'] is String ? r['id'] as String : null;
      _text.clear();
      _contact.clear();
      _Pictures.clear();
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
      // Room at the top for the first field's label, which sits on the field's top edge.
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
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
                  child: Image.memory(base64Decode(s.split(',').last), width: 90, height: 140, fit: BoxFit.cover, alignment: Alignment.topCenter, semanticLabel: tr('bug.picture_n', 'Picture {n}', {'n': i + 1})),
                ),
                Positioned(
                  right: 0,
                  top: 0,
                  child: IconButton.filledTonal(
                    visualDensity: VisualDensity.compact,
                    tooltip: tr('bug.remove_picture', 'Remove picture {n}', {'n': i + 1}),
                    onPressed: () => setState(() => _Pictures.removeAt(i)),
                    icon: const Icon(Icons.close, size: 16),
                  ),
                ),
              ]),
          ]),
        Wrap(spacing: 8, children: [
          OutlinedButton.icon(onPressed: _shots.length >= _maxShots ? null : _pick, icon: const Icon(Icons.image_outlined), label: Text(tr('bug.add_pictures', 'Add pictures'))),
          OutlinedButton.icon(onPressed: _shots.length >= _maxShots ? null : _screenshot, icon: const Icon(Icons.screenshot_outlined), label: Text(tr('bug.screenshot_a_page', 'Screenshot a page'))),
        ]),
        Text(tr('bug.pictures_note_app', 'Up to 3. Screenshot a page takes you to the app: go to the page you want, then tap Screenshot this page. It takes the whole page, top to bottom, and brings you back here. A map may come out blank.'),
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
