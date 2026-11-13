// The title bar's screenshot buttons: the app as it is on screen (not the bar), or a long one,
// the whole page top to bottom (up to 16384 pixels tall, the most the Electron app's Chromium
// drew). Either is copied, and saved in the Downloads folder as "SG Bus Timings <date> <time>.png"
// ("(long)" for a long one), and a notification says so; clicking it shows the file.
//
// A long one scrolls the page in front from its top a screenful at a time, takes each, and puts
// them together: what's above and below the page's scrolling part (its bars) once, at the top and
// bottom. It's scrolled back to where it was after.
import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:pasteboard/pasteboard.dart';

import '../i18n/i18n.dart';
import 'chrome.dart';
import 'desktop.dart';
import 'notify.dart';

class DeskShot {
  DeskShot._();

  static final key = GlobalKey();
  static final busy = ValueNotifier<bool>(false);
  static const maxHeight = 16384;

  /// The title bar's message line (chrome.dart sets it).
  static void Function(String)? say;

  static Future<void> take({required bool long}) async {
    if (busy.value) return;
    busy.value = true;
    try {
      final png = long ? await _long() : await _short();
      if (png == null) throw StateError('nothing drawn');
      await Pasteboard.writeImage(png);
      final now = DateTime.now();
      String two(int n) => n.toString().padLeft(2, '0');
      final stamp = '${now.year}-${two(now.month)}-${two(now.day)} ${two(now.hour)}.${two(now.minute)}.${two(now.second)}';
      final dir = Directory(Desktop.downloads)..createSync(recursive: true);
      final file = File('${dir.path}${Platform.pathSeparator}${Desktop.name} $stamp${long ? ' (long)' : ''}.png');
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

  static RenderRepaintBoundary? get _boundary => key.currentContext?.findRenderObject() as RenderRepaintBoundary?;

  static double get _ratio => WidgetsBinding.instance.platformDispatcher.views.first.devicePixelRatio;

  static Future<Uint8List?> _short() async {
    final b = _boundary;
    if (b == null) return null;
    final image = await b.toImage(pixelRatio: _ratio);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  }

  /// The page's scrolling part in front: the biggest vertical one that's showing.
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

  static Future<void> _frame() async {
    await WidgetsBinding.instance.endOfFrame;
    await WidgetsBinding.instance.endOfFrame;
  }

  static Future<Uint8List?> _long() async {
    final b = _boundary;
    final s = _scrollable();
    if (b == null) return null;
    if (s == null) return _short();
    final pos = s.position;
    final was = pos.pixels;
    final ratio = _ratio;
    final box = s.context.findRenderObject() as RenderBox;
    final at = box.localToGlobal(Offset.zero, ancestor: b);
    final viewTop = at.dy, viewH = box.size.height;
    final full = b.size;
    final content = pos.maxScrollExtent + viewH;
    // The whole picture's height in pixels: above the scrolling part, all of it, and below.
    final wantH = (viewTop + content + (full.height - viewTop - viewH)) * ratio;
    final scale = wantH > maxHeight ? maxHeight / wantH : 1.0;
    final px = ratio * scale;
    final shots = <(double, ui.Image)>[];
    try {
      var offset = 0.0;
      pos.jumpTo(0);
      await _frame();
      while (true) {
        shots.add((pos.pixels, await b.toImage(pixelRatio: px)));
        if (pos.pixels >= pos.maxScrollExtent - .5) break;
        // Stop once the picture would be taller than the most there is.
        if ((viewTop + pos.pixels + viewH) * px >= maxHeight) break;
        offset = math.min(pos.pixels + viewH, pos.maxScrollExtent);
        pos.jumpTo(offset);
        await _frame();
      }
    } finally {
      pos.jumpTo(was);
    }
    final lastOffset = shots.last.$1;
    final bottom = full.height - viewTop - viewH;
    final height = math.min((viewTop + lastOffset + viewH + bottom) * px, maxHeight.toDouble());
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, full.width * px, height));
    final paint = Paint()..filterQuality = FilterQuality.high;
    // Above the scrolling part, from the first.
    final first = shots.first.$2;
    canvas.drawImageRect(first, Rect.fromLTWH(0, 0, full.width * px, viewTop * px), Rect.fromLTWH(0, 0, full.width * px, viewTop * px), paint);
    // Each screenful, where its scroll offset puts it.
    for (final (offset, image) in shots) {
      final y = (viewTop + offset) * px;
      canvas.drawImageRect(image, Rect.fromLTWH(0, viewTop * px, full.width * px, viewH * px), Rect.fromLTWH(0, y, full.width * px, viewH * px), paint);
    }
    // Below it, from the last.
    if (bottom > 0) {
      canvas.drawImageRect(shots.last.$2, Rect.fromLTWH(0, (viewTop + viewH) * px, full.width * px, bottom * px), Rect.fromLTWH(0, (viewTop + lastOffset + viewH) * px, full.width * px, bottom * px), paint);
    }
    final picture = recorder.endRecording();
    final image = await picture.toImage((full.width * px).round(), height.round());
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    for (final (_, i) in shots) {
      i.dispose();
    }
    return data?.buffer.asUint8List();
  }
}
