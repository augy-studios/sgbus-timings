// A Share button's link: Android's share sheet (SgBusPlugin.share), or copied where there's no
// app side, as the site's shareLink.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/nav.dart';
import '../i18n/i18n.dart';
import '../native/native_bridge.dart';

Future<void> shareLink(BuildContext context, String url, String title, {String? text}) async {
  if (Native.available) {
    try {
      await Native.call('SgBus', 'share', {'title': title, 'text': text ?? '', 'url': url});
      return;
    } on NativeError {
      // No share sheet: copied instead.
    }
  }
  await Clipboard.setData(ClipboardData(text: url));
  AppNav.say(tr('share.linkCopied', 'Link copied'));
}
