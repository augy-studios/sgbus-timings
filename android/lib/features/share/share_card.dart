// The share card (the site's js/share.js): a short link made by /api/share for a place ("How to
// get to", /go/<id>), directions (/trip/<id>), live progress (/eta/<id>) or a feat (/feat/<id>),
// with its map (/api/share-map) or the feat's card (/api/feat-card), and the ways to send it:
// Android's share sheet, Telegram and WhatsApp straight to their chat pickers, Copy, and Offline
// Sharing to a phone nearby (features/share/offline_share.dart).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/api.dart';
import '../../app/nav.dart';
import '../../i18n/i18n.dart';
import '../../native/native_bridge.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';

class ShareCard extends StatefulWidget {
  const ShareCard({super.key, required this.heading, required this.name, this.sub = '', required this.kind, required this.data, required this.text, this.made, this.onStop});
  final String heading;
  final String name;
  final String sub;
  final String kind; // place, directions, eta, feat
  final Map<String, Object?> data;
  final String text;
  final Future<Map<String, dynamic>>? made; // a link already made (live progress)
  final VoidCallback? onStop; // live progress: Stop sharing

  static Future<void> show(BuildContext context, ShareCard card) =>
      showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => card);

  /// "How to get to" a place.
  static Future<void> place(BuildContext context, {required String label, required double lat, required double lng, String note = ''}) => show(
        context,
        ShareCard(
          heading: tr('share.howToGetTo', 'How to get to:'),
          name: label,
          sub: note,
          kind: 'place',
          data: {'label': label, 'lat': lat, 'lng': lng},
          text: tr('share.howToGetToPlace', 'How to get to {place}', {'place': label}),
        ),
      );

  /// Opening another phone's directions, place or live progress link: what the link holds.
  static Future<Map<String, dynamic>> read(String id) => Api.map('share', query: {'id': id});

  @override
  State<ShareCard> createState() => _ShareCardState();
}

class _ShareCardState extends State<ShareCard> {
  String? _url;
  String? _id;
  String? _error;

  @override
  void initState() {
    super.initState();
    _make();
  }

  Future<void> _make() async {
    try {
      final body = widget.made != null ? await widget.made! : Map<String, dynamic>.from((await Api.post('share', {'kind': widget.kind, 'data': widget.data})) as Map);
      if (!mounted) return;
      setState(() {
        _id = body['id'] as String?;
        _url = '${Api.site}${body['path']}';
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiError ? e.message : tr('share.wentWrong', 'Something went wrong. Please try again.'));
    }
  }

  Future<void> _send([String? app]) async {
    if (_url == null) return;
    if (!Native.available) {
      await Clipboard.setData(ClipboardData(text: '${widget.text} $_url'));
      AppNav.say(tr('share.linkCopied', 'Link copied'));
      return;
    }
    try {
      final r = await Native.call('SgBus', 'share', {'title': widget.name, 'text': widget.text, 'url': _url, 'app': ?app});
      // Not installed: its web link, in the browser.
      if (app != null && r?['sent'] == false) {
        final web = app == 'telegram'
            ? 'https://t.me/share/url?url=${Uri.encodeComponent(_url!)}&text=${Uri.encodeComponent(widget.text)}'
            : 'https://wa.me/?text=${Uri.encodeComponent('${widget.text} $_url')}';
        await Native.call('SgBus', 'openLink', {'url': web});
      }
    } on NativeError {
      // Nothing to share with.
    }
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final image = _id == null ? null : (widget.kind == 'feat' ? '${Api.site}/api/feat-card?id=$_id' : '${Api.site}/api/share-map?id=$_id');
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(widget.heading, style: TextStyle(color: sg.muted)),
          Text(widget.name, style: Theme.of(context).textTheme.titleLarge),
          if (widget.sub.isNotEmpty) Text(widget.sub, style: TextStyle(color: sg.muted)),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: widget.kind == 'feat' ? 1200 / 630 : 16 / 10,
              child: Container(
                color: sg.surfaceStrong,
                child: image == null || Api.fake != null
                    ? Center(child: Icon(widget.kind == 'feat' ? Icons.emoji_events_outlined : Icons.map_outlined, size: 48, color: sg.muted))
                    : Image.network(image, fit: BoxFit.cover, errorBuilder: (_, _, _) => Icon(Icons.map_outlined, size: 48, color: sg.muted)),
              ),
            ),
          ),
          const SizedBox(height: 10),
          if (_error != null) Text(_error!, style: TextStyle(color: sg.error)),
          if (_url != null) SelectableText(_url!, style: TextStyle(color: sg.brandInk)),
          if (_url == null && _error == null) const LinearProgressIndicator(),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
            Pill(icon: Icons.ios_share, label: tr('html.more', 'More'), onTap: _url == null ? null : () => _send()),
            Pill(icon: Icons.send_outlined, label: 'Telegram', onTap: _url == null ? null : () => _send('telegram')),
            Pill(icon: Icons.chat_outlined, label: 'WhatsApp', onTap: _url == null ? null : () => _send('whatsapp')),
            Pill(
              icon: Icons.copy,
              label: tr('share.copyLink', 'Copy link'),
              onTap: _url == null
                  ? null
                  : () async {
                      await Clipboard.setData(ClipboardData(text: _url!));
                      AppNav.say(tr('share.linkCopied', 'Link copied'));
                    },
            ),
            if (Native.has('sharetap') || Native.has('sharenearby'))
              Pill(icon: Icons.wifi_tethering, label: tr('offline.title', 'Offline Sharing'), onTap: _url == null ? null : () => AppNav.open('offlineShare', {'url': _url, 'label': widget.name})),
          ]),
          if (widget.onStop != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: TextButton.icon(
                onPressed: () {
                  widget.onStop!();
                  Navigator.of(context).maybePop();
                },
                icon: Icon(Icons.stop_circle_outlined, color: sg.error),
                label: Text(tr('html.stop_sharing_my_eta', 'Stop sharing my ETA'), style: TextStyle(color: sg.error)),
              ),
            ),
        ]),
      ),
    );
  }
}
