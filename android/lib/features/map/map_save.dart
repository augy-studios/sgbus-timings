// Singapore's map saved for offline, from Explorer's Save the map button (the site's
// js/map-save.js): every OpenFreeMap vector tile over Singapore, from the zoom the live map opens
// out to (9) to the closest OpenFreeMap goes (14, drawn closer in from those), with the style,
// sprites and label fonts, so the live map shows the streets with no connection, on a trip or a
// walk. MapLibre keeps it as an offline region (its own database, never trimmed), in the light
// and the dark style; Remove deletes both. Kept as sgbus_map_saved: { at, ids, bytes }.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../data/store.dart';
import '../../data/when.dart';
import '../../i18n/i18n.dart';
import '../../theme/theme.dart';
import 'live_map.dart';

class MapSave {
  MapSave._();
  static const metaKey = 'sgbus_map_saved';
  // Singapore and the Johor Bahru stops its buses cross to: [south, west, north, east].
  static const box = [1.15, 103.55, 1.5, 104.1];
  static const minZoom = 9.0;
  static const maxZoom = 14.0;

  static Map<String, dynamic> get meta => Store.I.map(metaKey);
  static bool get saved => meta['at'] is num;

  static Future<void> open(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => const _SaveSheet(),
      );
}

class _SaveSheet extends StatefulWidget {
  const _SaveSheet();

  @override
  State<_SaveSheet> createState() => _SaveSheetState();
}

class _SaveSheetState extends State<_SaveSheet> {
  double? _progress; // while downloading
  int _bytes = 0;
  String _message = '';
  bool _cancelled = false;

  String _mb(num bytes) => '${(bytes / (1024 * 1024)).toStringAsFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB';

  Future<void> _download() async {
    setState(() {
      _progress = 0;
      _message = '';
      _cancelled = false;
      _bytes = 0;
    });
    final ids = <int>[];
    try {
      // Light and dark, one after the other: the second's tiles are the first's, so it's mostly
      // its style and sprites.
      for (final (k, style) in [LiveMap.styleLight, LiveMap.styleDark].indexed) {
        final done = Completer<void>();
        final region = await downloadOfflineRegion(
          OfflineRegionDefinition(
            bounds: LatLngBounds(southwest: LatLng(MapSave.box[0], MapSave.box[1]), northeast: LatLng(MapSave.box[2], MapSave.box[3])),
            mapStyleUrl: style,
            minZoom: MapSave.minZoom,
            maxZoom: MapSave.maxZoom,
          ),
          metadata: {'name': 'Singapore', 'style': style},
          onEvent: (e) {
            if (!mounted) return;
            if (e is InProgress) {
              setState(() {
                _progress = (k + e.progress / 100) / 2;
                _bytes = e.completedResourceSize;
              });
            } else if (e is Success) {
              if (!done.isCompleted) done.complete();
            } else if (e is Error) {
              if (!done.isCompleted) done.completeError(e.cause);
            }
          },
        );
        ids.add(region.id);
        await done.future;
        if (_cancelled) break;
      }
      if (_cancelled) {
        for (final id in ids) {
          await deleteOfflineRegion(id).catchError((_) {});
        }
        _message = tr('mapSave.cancelled', 'Cancelled. Nothing was kept.');
      } else {
        // The old download's regions, once the new one's in.
        for (final id in (MapSave.meta['ids'] as List? ?? const [])) {
          if (!ids.contains(id)) await deleteOfflineRegion((id as num).toInt()).catchError((_) {});
        }
        Store.I.putJson(MapSave.metaKey, {'at': When.nowMs(), 'ids': ids, 'bytes': _bytes});
      }
    } catch (e) {
      _message = tr('mapSave.failed', "Couldn't save the map: {why}", {'why': '$e'});
    }
    if (mounted) setState(() => _progress = null);
  }

  Future<void> _remove() async {
    for (final id in (MapSave.meta['ids'] as List? ?? const [])) {
      await deleteOfflineRegion((id as num).toInt()).catchError((_) {});
    }
    Store.I.put(MapSave.metaKey, null);
    setState(() => _message = tr('mapSave.removed', 'Removed. The map keeps what you look at, as before.'));
  }

  @override
  Widget build(BuildContext context) {
    final sg = context.sg;
    final m = MapSave.meta;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr('html.singapore_s_map_offline', 'Singapore’s map, offline'), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          if (_progress != null) ...[
            Text('${tr('mapSave.saving', 'Saving the map… {done} of {total}', {'done': (_progress! * 100).round(), 'total': 100})} · ${_mb(_bytes)}'),
            const SizedBox(height: 10),
            LinearProgressIndicator(value: _progress),
            const SizedBox(height: 10),
            TextButton(onPressed: () => setState(() => _cancelled = true), child: Text(tr('common.cancel', 'Cancel'))),
          ] else if (MapSave.saved) ...[
            Row(children: [
              Icon(Icons.download_done, color: sg.ok),
              const SizedBox(width: 8),
              Expanded(
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: tr('mapSave.saved', 'Map saved for offline'), style: const TextStyle(fontWeight: FontWeight.w700)),
                  TextSpan(text: ' (${When.clockDay((m['at'] as num).toInt())}, ${_mb((m['bytes'] as num?) ?? 0)})'),
                ])),
              ),
            ]),
            if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_message, style: TextStyle(color: sg.muted))),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              FilledButton.tonalIcon(onPressed: _download, icon: const Icon(Icons.sync), label: Text(tr('mapSave.update', 'Update map'))),
              TextButton.icon(onPressed: _remove, icon: const Icon(Icons.close), label: Text(tr('mapSave.remove', 'Remove'))),
            ]),
          ] else ...[
            Text(tr('mapSave.intro', "Keep Singapore's map on this phone, so the live map shows the streets with no connection, on a trip or a walk.")),
            const SizedBox(height: 6),
            Text(tr('mapSave.size', '{n} tiles from OpenFreeMap, about {mb}. Best on Wi-Fi.', {'n': '616', 'mb': '15 MB'}), style: TextStyle(color: sg.muted)),
            if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_message, style: TextStyle(color: sg.muted))),
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: _download, icon: const Icon(Icons.download), label: Text(tr('mapSave.download', 'Download the Singapore map'))),
          ],
        ]),
      ),
    );
  }
}
