// The title bar's screenshot buttons (desktop-features-spec §5): the app as it is on screen (not
// the bar), or a long one, the whole page top to bottom (up to 16384 pixels tall, the most the
// Electron app's Chromium drew). Either is copied, and saved in the Downloads folder as
// "SG Bus Timings <date> <time>.png" ("(long)" for a long one), and a notification says so;
// clicking it shows the file. Only one is taken at a time: [DeskShot.busy] greys the buttons out.
//
// A long one scrolls the page in front from its top a screenful at a time, takes each, and puts
// them together: what's above and below the page's scrolling part (its bars) once, at the top and
// bottom. It's scrolled back to where it was after. A page taller than 16384 pixels is drawn
// smaller, so all of it fits.
import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:material_ui/material_ui.dart';
import 'package:flutter/rendering.dart';
import 'package:pasteboard/pasteboard.dart';

import '../i18n/i18n.dart';
import '../theme/theme.dart';
import 'chrome.dart';
import 'desktop.dart';
import 'notify.dart';

/// Takes the title bar's screenshots, short and long.
class DeskShot {
  DeskShot._();

  /// On the RepaintBoundary around the app's content (chrome.dart): what a screenshot draws.
  static final key = GlobalKey();

  /// True while a screenshot's being taken: the buttons are greyed out, and another press does
  /// nothing.
  static final busy = ValueNotifier<bool>(false);

  /// The tallest picture, in pixels.
  static const maxHeight = 16384;

  /// The title bar's message line (chrome.dart sets it).
  static void Function(String)? say;

  /// Takes a screenshot ([long]: the whole page), copies it, saves it in Downloads, and says so in
  /// the title bar and a notification. Says "Couldn't take a screenshot" if anything fails.
  static Future<void> take({required bool long}) async {
    if (busy.value) return;
    busy.value = true;
    try {
      final png = long ? await _long() : await _short();
      if (png == null) throw StateError('nothing drawn');
      await Pasteboard.writeImage(png);
      final file = File('${Desktop.downloads}${Platform.pathSeparator}${fileName(DateTime.now(), long: long)}');
      file.parent.createSync(recursive: true);
      await file.writeAsBytes(png);
      say?.call(long ? tr('desktop.shot.longDone', 'Long screenshot copied and saved') : tr('desktop.shot.done', 'Screenshot copied and saved'));
      await DeskNotify.show(
        title: long ? tr('desktop.shot.longSaved', 'Long screenshot saved') : tr('desktop.shot.saved', 'Screenshot saved'),
        body: tr('desktop.shot.body', "It's copied too, and in Downloads. Click to show it."),
        onClick: () => Desktop.showInFolder(file.path),
      );
    } catch (_) {
      say?.call(tr('desktop.shot.failed', "Couldn't take a screenshot"));
    } finally {
      busy.value = false;
    }
  }

  /// The file's name, as the Electron app named it: "SG Bus Timings 2026-11-16 14.05.09.png", or
  /// "… (long).png".
  static String fileName(DateTime now, {required bool long}) {
    String two(int n) => n.toString().padLeft(2, '0');
    final stamp = '${now.year}-${two(now.month)}-${two(now.day)} ${two(now.hour)}.${two(now.minute)}.${two(now.second)}';
    return '${Desktop.name} $stamp${long ? ' (long)' : ''}.png';
  }

  /// The RepaintBoundary that holds the app's content.
  static RenderRepaintBoundary? get _boundary => key.currentContext?.findRenderObject() as RenderRepaintBoundary?;

  /// The screen's pixels per logical pixel, so the picture is as sharp as the screen.
  static double get _ratio => WidgetsBinding.instance.platformDispatcher.views.first.devicePixelRatio;

  /// The page's own background, under each picture: in the computer's own look the page is
  /// see-through, and the window's glass behind it isn't in the picture.
  static Color get _background {
    final c = key.currentContext;
    return c == null ? Colors.white : c.sg.bg;
  }

  /// The content as it is on screen, as a PNG.
  static Future<Uint8List?> _short() async {
    final b = _boundary;
    if (b == null) return null;
    final shot = await b.toImage(pixelRatio: _ratio);
    final recorder = ui.PictureRecorder();
    Canvas(recorder)
      ..drawColor(_background, BlendMode.src)
      ..drawImage(shot, Offset.zero, Paint());
    final image = await recorder.endRecording().toImage(shot.width, shot.height);
    shot.dispose();
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return data?.buffer.asUint8List();
  }

  /// The page's scrolling part in front: the biggest vertical one that's showing and can scroll.
  /// Pages behind the one in front are left out (their tickers are off).
  static ScrollableState? _scrollable() {
    final top = DeskChrome.observer.top;
    final ctx = top is ModalRoute ? top.subtreeContext : key.currentContext;
    ScrollableState? best;
    double bestArea = 0;
    void look(Element e) {
      if (e is StatefulElement && e.state is ScrollableState && TickerMode.valuesOf(e).enabled) {
        final s = e.state as ScrollableState;
        final box = e.findRenderObject();
        if (s.axisDirection == AxisDirection.down && box is RenderBox && box.hasSize && box.attached) {
          final area = box.size.width * box.size.height;
          if (area > bestArea && s.position.maxScrollExtent > 0) {
            best = s;
            bestArea = area;
          }
        }
      }
      e.visitChildren(look);
    }

    if (ctx is Element) ctx.visitChildren(look);
    return best;
  }

  /// Waits until a scroll has been drawn (two frames: one to lay it out, one to paint it).
  static Future<void> _frame() async {
    await WidgetsBinding.instance.endOfFrame;
    await WidgetsBinding.instance.endOfFrame;
  }

  /// The whole page, top to bottom, as a PNG: a short one if nothing on it scrolls.
  static Future<Uint8List?> _long() async {
    final b = _boundary;
    final s = _scrollable();
    if (b == null) return null;
    if (s == null) return _short();
    final pos = s.position;
    final was = pos.pixels;
    final box = s.context.findRenderObject() as RenderBox;
    final viewTop = box.localToGlobal(Offset.zero, ancestor: b).dy;
    final viewH = box.size.height;
    final full = b.size;
    // The whole picture's height in pixels: above the scrolling part, all of it, and below.
    final content = pos.maxScrollExtent + viewH;
    final wantH = (viewTop + content + (full.height - viewTop - viewH)) * _ratio;
    final scale = wantH > maxHeight ? maxHeight / wantH : 1.0;
    final px = _ratio * scale;
    final shots = <(double, ui.Image)>[];
    try {
      pos.jumpTo(0);
      await _frame();
      while (true) {
        shots.add((pos.pixels, await b.toImage(pixelRatio: px)));
        if (pos.pixels >= pos.maxScrollExtent - .5) break;
        // Stop once the picture would be taller than the most there is.
        if ((viewTop + pos.pixels + viewH) * px >= maxHeight) break;
        pos.jumpTo(math.min(pos.pixels + viewH, pos.maxScrollExtent));
        await _frame();
      }
    } finally {
      pos.jumpTo(was);
    }
    try {
      return await _stitch(shots, width: full.width, height: full.height, viewTop: viewTop, viewH: viewH, px: px);
    } finally {
      for (final (_, i) in shots) {
        i.dispose();
      }
    }
  }

  /// Puts the screenfuls together into one picture, as a PNG. Each shot is the whole content
  /// [width] × [height] (logical pixels, drawn at [px] pixels each), taken at a scroll offset;
  /// the scrolling part is [viewH] tall and starts [viewTop] down.
  static Future<Uint8List?> _stitch(List<(double, ui.Image)> shots, {required double width, required double height, required double viewTop, required double viewH, required double px}) async {
    final lastOffset = shots.last.$1;
    final bottom = height - viewTop - viewH;
    final outH = math.min((viewTop + lastOffset + viewH + bottom) * px, maxHeight.toDouble());
    final w = width * px;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, w, outH));
    final paint = Paint()..filterQuality = FilterQuality.high;
    canvas.drawColor(_background, BlendMode.src);
    // Above the scrolling part, from the first.
    canvas.drawImageRect(shots.first.$2, Rect.fromLTWH(0, 0, w, viewTop * px), Rect.fromLTWH(0, 0, w, viewTop * px), paint);
    // Each screenful, where its scroll offset puts it. The last may overlap the one before (it
    // stops at the end of the page); it's the same picture there, so that's fine.
    for (final (offset, image) in shots) {
      final y = (viewTop + offset) * px;
      canvas.drawImageRect(image, Rect.fromLTWH(0, viewTop * px, w, viewH * px), Rect.fromLTWH(0, y, w, viewH * px), paint);
    }
    // Below it, from the last.
    if (bottom > 0) {
      canvas.drawImageRect(shots.last.$2, Rect.fromLTWH(0, (viewTop + viewH) * px, w, bottom * px), Rect.fromLTWH(0, (viewTop + lastOffset + viewH) * px, w, bottom * px), paint);
    }
    final picture = recorder.endRecording();
    final image = await picture.toImage(w.round(), outH.round());
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return data?.buffer.asUint8List();
  }
}
