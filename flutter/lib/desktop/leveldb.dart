// A reader for Chromium's localStorage, as the Electron desktop app (2.0.0 to 2.4.x) kept the
// site's: a LevelDB database in <settings folder>/Local Storage/leveldb/. Pure Dart, read-only,
// for bringing everything across once when the Flutter app first opens (desktop/import_old.dart).
//
// LevelDB keeps its newest writes in .log files (a write-ahead log) and older ones in .ldb tables.
// Every entry has a sequence number; the highest one for a key wins, and a deletion hides the key.
// The formats are LevelDB's own (doc/log_format.md, doc/table_format.md): 32 KiB log blocks of
// records, each a WriteBatch; tables of blocks, Snappy-compressed, with prefix-compressed keys.
//
// Chromium's localStorage keys are "_" + origin + "\x00" + the key, and its values and keys start
// with one byte saying how the rest is written: 1 Latin-1, 0 UTF-16 (little-endian).
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

class LevelDbEntry {
  LevelDbEntry(this.key, this.value, this.sequence);
  final Uint8List key;

  /// Null for a deletion.
  final Uint8List? value;
  final int sequence;
}

class LevelDb {
  LevelDb._();

  /// Every live key and its value in the database at [dir], newest write winning.
  static Map<String, Uint8List> readAll(Directory dir) {
    final best = <String, LevelDbEntry>{};
    void take(LevelDbEntry e) {
      final k = latin1.decode(e.key);
      final was = best[k];
      if (was == null || e.sequence >= was.sequence) best[k] = e;
    }

    final files = dir.listSync().whereType<File>().toList()..sort((a, b) => a.path.compareTo(b.path));
    for (final f in files) {
      final name = f.uri.pathSegments.last.toLowerCase();
      try {
        if (name.endsWith('.ldb') || name.endsWith('.sst')) {
          readTable(f.readAsBytesSync()).forEach(take);
        } else if (name.endsWith('.log')) {
          readLog(f.readAsBytesSync()).forEach(take);
        }
      } catch (_) {
        // A damaged or half-written file: what the others hold still counts.
      }
    }
    return {
      for (final e in best.entries)
        if (e.value.value != null) e.key: e.value.value!,
    };
  }

  // ---------- the log ----------

  static const _block = 32768;

  /// The entries in a .log file, in order.
  static List<LevelDbEntry> readLog(Uint8List bytes) {
    final out = <LevelDbEntry>[];
    final record = BytesBuilder(copy: false);
    var at = 0;
    while (at < bytes.length) {
      final left = _block - (at % _block);
      if (left < 7) {
        at += left; // the block's trailer
        continue;
      }
      if (at + 7 > bytes.length) break;
      final length = bytes[at + 4] | (bytes[at + 5] << 8);
      final type = bytes[at + 6];
      final start = at + 7;
      final end = start + length;
      if (end > bytes.length || type == 0) break; // a torn write, or zeroed preallocation
      final data = Uint8List.sublistView(bytes, start, end);
      at = end;
      switch (type) {
        case 1: // full
          record.clear();
          _batch(data, out);
        case 2: // first
          record.clear();
          record.add(data);
        case 3: // middle
          record.add(data);
        case 4: // last
          record.add(data);
          _batch(record.takeBytes(), out);
      }
    }
    return out;
  }

  static void _batch(Uint8List b, List<LevelDbEntry> out) {
    if (b.length < 12) return;
    final view = ByteData.sublistView(b);
    var seq = view.getUint32(0, Endian.little) + view.getUint32(4, Endian.little) * 4294967296;
    final count = view.getUint32(8, Endian.little);
    final r = _Reader(b, 12);
    for (var i = 0; i < count && !r.done; i++) {
      final tag = r.byte();
      final key = r.slice();
      if (tag == 1) {
        out.add(LevelDbEntry(key, r.slice(), seq));
      } else {
        out.add(LevelDbEntry(key, null, seq));
      }
      seq++;
    }
  }

  // ---------- tables ----------

  static const _magic = [0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb];

  /// The entries in a .ldb table.
  static List<LevelDbEntry> readTable(Uint8List bytes) {
    if (bytes.length < 48) return const [];
    final footer = Uint8List.sublistView(bytes, bytes.length - 48);
    for (var i = 0; i < 8; i++) {
      if (footer[40 + i] != _magic[i]) throw const FormatException('not a LevelDB table');
    }
    final f = _Reader(footer, 0);
    f.varint(); // the metaindex block, not needed
    f.varint();
    final indexOffset = f.varint();
    final indexSize = f.varint();
    final out = <LevelDbEntry>[];
    for (final (_, handle) in _entries(_blockAt(bytes, indexOffset, indexSize))) {
      final h = _Reader(handle, 0);
      final offset = h.varint();
      final size = h.varint();
      for (final (key, value) in _entries(_blockAt(bytes, offset, size))) {
        if (key.length < 8) continue;
        final tail = ByteData.sublistView(key, key.length - 8);
        final packed = tail.getUint32(0, Endian.little) + tail.getUint32(4, Endian.little) * 4294967296;
        final type = packed & 0xff;
        final seq = packed ~/ 256;
        final user = Uint8List.sublistView(key, 0, key.length - 8);
        out.add(LevelDbEntry(Uint8List.fromList(user), type == 1 ? Uint8List.fromList(value) : null, seq));
      }
    }
    return out;
  }

  static Uint8List _blockAt(Uint8List bytes, int offset, int size) {
    final data = Uint8List.sublistView(bytes, offset, offset + size);
    final compression = bytes[offset + size];
    return compression == 1 ? Snappy.decode(data) : data;
  }

  /// A block's key-value pairs, its keys rebuilt from their shared prefixes.
  static List<(Uint8List, Uint8List)> _entries(Uint8List block) {
    if (block.length < 4) return const [];
    final restarts = ByteData.sublistView(block, block.length - 4).getUint32(0, Endian.little);
    final end = block.length - 4 - restarts * 4;
    final out = <(Uint8List, Uint8List)>[];
    final r = _Reader(block, 0);
    var last = Uint8List(0);
    while (r.at < end) {
      final shared = r.varint();
      final unshared = r.varint();
      final valueLength = r.varint();
      final key = Uint8List(shared + unshared)
        ..setRange(0, shared, last)
        ..setRange(shared, shared + unshared, block, r.at);
      r.at += unshared;
      final value = Uint8List.sublistView(block, r.at, r.at + valueLength);
      r.at += valueLength;
      out.add((key, value));
      last = key;
    }
    return out;
  }
}

class _Reader {
  _Reader(this.b, this.at);
  final Uint8List b;
  int at;

  bool get done => at >= b.length;
  int byte() => b[at++];

  int varint() {
    var shift = 0;
    var v = 0;
    while (true) {
      final x = b[at++];
      v += (x & 0x7f) * (1 << shift);
      if (x < 0x80) return v;
      shift += 7;
    }
  }

  Uint8List slice() {
    final n = varint();
    final s = Uint8List.sublistView(b, at, at + n);
    at += n;
    return s;
  }
}

/// Snappy's raw format, decompression only.
class Snappy {
  Snappy._();

  static Uint8List decode(Uint8List src) {
    final r = _Reader(src, 0);
    final out = Uint8List(r.varint());
    var o = 0;
    while (!r.done) {
      final tag = r.byte();
      switch (tag & 3) {
        case 0:
          var len = tag >> 2;
          if (len >= 60) {
            final n = len - 59;
            len = 0;
            for (var i = 0; i < n; i++) {
              len |= r.byte() << (8 * i);
            }
          }
          len += 1;
          out.setRange(o, o + len, src, r.at);
          r.at += len;
          o += len;
        case 1:
          final len = ((tag >> 2) & 7) + 4;
          final off = ((tag >> 5) << 8) | r.byte();
          o = _copy(out, o, off, len);
        case 2:
          final len = (tag >> 2) + 1;
          final off = r.byte() | (r.byte() << 8);
          o = _copy(out, o, off, len);
        case 3:
          final len = (tag >> 2) + 1;
          final off = r.byte() | (r.byte() << 8) | (r.byte() << 16) | (r.byte() << 24);
          o = _copy(out, o, off, len);
      }
    }
    return out;
  }

  // Byte by byte: a copy may overlap what it's writing (a run).
  static int _copy(Uint8List out, int o, int off, int len) {
    if (off <= 0 || off > o) throw const FormatException('bad snappy offset');
    for (var i = 0; i < len; i++) {
      out[o + i] = out[o - off + i];
    }
    return o + len;
  }
}

/// The site's localStorage, as Chromium keeps it.
class ChromiumLocalStorage {
  ChromiumLocalStorage._();

  /// Every key and value [origin] (such as https://example.org) kept, in the database at [dir].
  static Map<String, String> read(Directory dir, String origin) {
    if (!dir.existsSync()) return const {};
    final prefix = '_$origin\u0000';
    final out = <String, String>{};
    LevelDb.readAll(dir).forEach((k, v) {
      if (!k.startsWith(prefix)) return;
      final key = decode(Uint8List.fromList(latin1.encode(k.substring(prefix.length))));
      if (key == null || key.isEmpty) return;
      final value = decode(v);
      if (value != null) out[key] = value;
    });
    return out;
  }

  /// One of Chromium's strings: 1 then Latin-1 bytes, or 0 then UTF-16LE.
  static String? decode(Uint8List b) {
    if (b.isEmpty) return null;
    if (b[0] == 1) return latin1.decode(Uint8List.sublistView(b, 1));
    if (b[0] == 0) {
      final n = (b.length - 1) ~/ 2;
      final units = Uint16List(n);
      final view = ByteData.sublistView(b, 1);
      for (var i = 0; i < n; i++) {
        units[i] = view.getUint16(i * 2, Endian.little);
      }
      return String.fromCharCodes(units);
    }
    return null;
  }
}
