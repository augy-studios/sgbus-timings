// Singapore's map saved for offline, from Explorer's Save the map button (the site's
// js/map-save.js): every OpenFreeMap vector tile over Singapore, from the zoom the live map opens
// out to (9) to the closest OpenFreeMap goes (14, drawn closer in from those), with the style,
// sprites and label fonts, so the live map shows the streets with no connection, on a trip or a
// walk. MapLibre keeps it as an offline region (its own database, never trimmed), in the light
// and the dark style; Remove deletes both. Kept as sgbus_map_saved: { at, ids, bytes, week, capped }.
//
// Within OpenFreeMap's terms for an app's offline download: one that comes to maxBytes stops there
// and keeps what it has. Its tiles are at a new address every week (its TileJSON names them): the one
// used is kept with the download, and once a newer one's out, the sheet says so and Update map fetches
// that week's, keeping the old until the new one's in.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../api/net.dart';
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
  static const tileJson = 'https://tiles.openfreemap.org/planet';

  // OpenFreeMap's limit for one download, stopped this far short of it, as tiles already asked for
  // are still coming in.
  static const maxBytes = 50 * 1024 * 1024;
  static const bytesMargin = 1024 * 1024;

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
  bool _updating = false;
  bool _capped = false;
  String? _week; // this week's tiles, as OpenFreeMap names them
  bool _newer = false;
  final List<int> _ids = [];
  Completer<void>? _current;

  @override
  void initState() {
    super.initState();
    _checkWeek();
  }

  static Future<String?> _thisWeek() async {
    try {
      final r = await http.get(Uri.parse(MapSave.tileJson)).timeout(const Duration(seconds: 15));
      if (r.statusCode != 200) return null;
      final tiles = (jsonDecode(r.body) as Map)['tiles'] as List?;
      return tiles == null || tiles.isEmpty ? null : '${tiles.first}';
    } catch (_) {
      return null; // Offline: the map saved still works.
    }
  }

  Future<void> _checkWeek() async {
    if (!MapSave.saved || Net.off.value) return;
    final week = await _thisWeek();
    if (!mounted || week == null) return;
    setState(() {
      _week = week;
      _newer = MapSave.meta['week'] != week;
    });
  }

  // Stops what's under way at once, rather than when it would have finished.
  Future<void> _cancel() async {
    setState(() => _cancelled = true);
    if (_current?.isCompleted == false) _current!.complete();
  }

  String _mb(num bytes) => '${(bytes / (1024 * 1024)).toStringAsFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB';

  Future<void> _download() async {
    if (Net.off.value) {
      setState(() => _message = tr('mapSave.offline', 'Saving the map needs a connection.'));
      return;
    }
    setState(() {
      _progress = 0;
      _message = '';
      _cancelled = false;
      _capped = false;
      _updating = MapSave.saved;
      _bytes = 0;
    });
    final ids = _ids..clear();
    try {
      final week = _week ?? await _thisWeek();
      // Light and dark, one after the other: the second's tiles are the first's, so it's mostly
      // its style and sprites.
      for (final (k, style) in [LiveMap.styleLight, LiveMap.styleDark].indexed) {
        final done = _current = Completer<void>();
        int? regionId;
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
              // At OpenFreeMap's limit: stopped there, keeping what it has.
              if (e.completedResourceSize >= MapSave.maxBytes - MapSave.bytesMargin && !done.isCompleted) {
                _capped = true;
                if (regionId != null) pauseOfflineRegionDownload(regionId).catchError((_) {});
                done.complete();
              }
            } else if (e is Success) {
              if (!done.isCompleted) done.complete();
            } else if (e is Error) {
              if (!done.isCompleted) done.completeError(e.cause);
            }
          },
        );
        regionId = region.id;
        ids.add(region.id);
        await done.future;
        if (_cancelled || _capped) break;
      }
      if (_cancelled) {
        for (final id in ids) {
          await deleteOfflineRegion(id).catchError((_) {});
        }
        _message = _updating ? tr('mapSave.updateCancelled', 'Update cancelled. The map saved before is still there.') : tr('mapSave.cancelled', 'Cancelled. Nothing was kept.');
      } else {
        // The old download's regions, once the new one's in.
        for (final id in (MapSave.meta['ids'] as List? ?? const [])) {
          if (!ids.contains(id)) await deleteOfflineRegion((id as num).toInt()).catchError((_) {});
        }
        Store.I.putJson(MapSave.metaKey, {'at': When.nowMs(), 'ids': ids, 'bytes': _bytes, 'week': week, if (_capped) 'capped': true});
        _newer = false;
        if (_capped) {
          _message = tr('mapSave.capped', "The map came near {mb}, OpenFreeMap's limit for one download, so it stopped there: the closest-in view of some places isn't saved.", {'mb': _mb(MapSave.maxBytes)});
        }
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
            Text('${_updating ? tr('mapSave.updating', 'Updating the map… {done} of {total}', {'done': (_progress! * 100).round(), 'total': 100}) : tr('mapSave.saving', 'Saving the map… {done} of {total}', {'done': (_progress! * 100).round(), 'total': 100})} · ${_mb(_bytes)}'),
            const SizedBox(height: 10),
            LinearProgressIndicator(value: _progress),
            const SizedBox(height: 10),
            TextButton(onPressed: _cancelled ? null : _cancel, child: Text(tr('common.cancel', 'Cancel'))),
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
            if (m['capped'] == true && _message.isEmpty)
              Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr('mapSave.cappedNote', "It stopped at OpenFreeMap's {mb} limit, so the closest-in view of some places isn't saved.", {'mb': _mb(MapSave.maxBytes)}), style: TextStyle(color: sg.muted))),
            if (_newer) Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr('mapSave.newer', 'OpenFreeMap has a newer map out. Update to get it; the one saved still works offline meanwhile.'), style: TextStyle(color: sg.muted))),
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
