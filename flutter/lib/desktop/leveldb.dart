// A reader for Chromium's localStorage, as the Electron desktop app (2.0.0 to 2.4.x) kept the
// site's: a LevelDB database in <settings folder>/Local Storage/leveldb/. Pure Dart, read-only,
// used once when the Flutter app first opens, to bring everything the old app kept across
// (host.dart answers the bridge's Migrate.read with it, and data/migrate.dart copies it into the
// app's own store). See flutter-desktop-app-spec §12.
//
// LevelDB keeps its newest writes in .log files (a write-ahead log) and older ones in .ldb tables.
// Every entry has a sequence number; the highest one for a key wins, and a deletion hides the key.
// The formats are LevelDB's own (doc/log_format.md, doc/table_format.md): 32 KiB log blocks of
// records, each a WriteBatch; tables of blocks, Snappy-compressed, with prefix-compressed keys.
// This reads every .log and .ldb file in the folder rather than following the MANIFEST: simpler,
// and the newest-sequence rule gives the same answer unless LevelDB left an old file behind.
//
// Chromium's localStorage keys are "_" + origin + "\x00" + the key, and its values and keys start
// with one byte saying how the rest is written: 1 Latin-1, 0 UTF-16 (little-endian).
// test/desktop/leveldb_test.dart checks it against a database a real Chromium wrote.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// One write found in a LevelDB file: a key, its value (null for a deletion), and the sequence
/// number that says which of several writes to the same key is the newest.
class LevelDbEntry {
  LevelDbEntry(this.key, this.value, this.sequence);
  final Uint8List key;

  /// Null for a deletion.
  final Uint8List? value;
  final int sequence;
}

/// Reads a whole LevelDB database folder into memory, newest write winning.
class LevelDb {
  LevelDb._();

  /// Every live key and its value in the database at [dir], newest write winning. Keys come back
  /// as Latin-1 strings, one character per byte, so no byte is lost.
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

  /// A log file is cut into blocks of this many bytes.
  static const _block = 32768;

  /// The entries in a .log file, in order. Each block holds records with a 7-byte header
  /// (checksum, length, type); a write too big for one block is split into first, middle and
  /// last pieces, which are joined again here before the batch inside is read.
  static List<LevelDbEntry> readLog(Uint8List bytes) {
    final out = <LevelDbEntry>[];
    final record = BytesBuilder(copy: false);
    var at = 0;
    while (at < bytes.length) {
      final left = _block - (at % _block);
      if (left < 7) {
        at += left; // the block's trailer: too short for a header, so LevelDB leaves it as zeros
        continue;
      }
      if (at + 7 > bytes.length) break;
      // Bytes 0 to 3 are the checksum, not checked: a damaged record is only ever skipped.
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

  /// One WriteBatch from the log: an 8-byte starting sequence number, a 4-byte count, then each
  /// put (tag 1, key, value) or deletion (tag 0, key), numbered on from the first.
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

  /// The last 8 bytes of every LevelDB table.
  static const _magic = [0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb];

  /// The entries in a .ldb table. Its 48-byte footer points at the index block, which points at
  /// each data block; each data block's keys end with 8 bytes packing the sequence number and
  /// whether it's a put (1) or a deletion (0).
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

  /// The block at [offset], [size] bytes long, unpacked. The byte after it says how it's
  /// compressed: 0 not at all, 1 Snappy.
  static Uint8List _blockAt(Uint8List bytes, int offset, int size) {
    final data = Uint8List.sublistView(bytes, offset, offset + size);
    final compression = bytes[offset + size];
    return compression == 1 ? Snappy.decode(data) : data;
  }

  /// A block's key-value pairs, its keys rebuilt from their shared prefixes: each key is stored
  /// as how many bytes it shares with the key before, then the rest.
  static List<(Uint8List, Uint8List)> _entries(Uint8List block) {
    if (block.length < 4) return const [];
    // The block ends with a list of "restart points" (4 bytes each) and their count: not needed
    // when reading every entry from the start, only to know where the entries stop.
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

/// Steps through bytes: single bytes, LevelDB's varints and length-prefixed slices.
class _Reader {
  _Reader(this.b, this.at);
  final Uint8List b;
  int at;

  /// Whether every byte has been read.
  bool get done => at >= b.length;

  /// The next byte.
  int byte() => b[at++];

  /// The next varint: 7 bits a byte, lowest first, the top bit set on every byte but the last.
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

  /// The next slice: a varint length, then that many bytes.
  Uint8List slice() {
    final n = varint();
    final s = Uint8List.sublistView(b, at, at + n);
    at += n;
    return s;
  }
}

/// Snappy's raw format, decompression only: what LevelDB compresses its table blocks with.
class Snappy {
  Snappy._();

  /// The bytes [src] stands for. It starts with the full length as a varint, then a run of
  /// literals (bytes as they are) and copies (bytes repeated from earlier in the output).
  static Uint8List decode(Uint8List src) {
    final r = _Reader(src, 0);
    final out = Uint8List(r.varint());
    var o = 0;
    while (!r.done) {
      final tag = r.byte();
      // The tag's low two bits say what comes next.
      switch (tag & 3) {
        case 0: // a literal: its length is in the tag, or in the 1 to 4 bytes after it
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
        case 1: // a copy with an 11-bit offset
          final len = ((tag >> 2) & 7) + 4;
          final off = ((tag >> 5) << 8) | r.byte();
          o = _copy(out, o, off, len);
        case 2: // a copy with a 2-byte offset
          final len = (tag >> 2) + 1;
          final off = r.byte() | (r.byte() << 8);
          o = _copy(out, o, off, len);
        case 3: // a copy with a 4-byte offset
          final len = (tag >> 2) + 1;
          final off = r.byte() | (r.byte() << 8) | (r.byte() << 16) | (r.byte() << 24);
          o = _copy(out, o, off, len);
      }
    }
    return out;
  }

  /// Copies [len] bytes from [off] bytes back in [out] to position [o], and returns the new end.
  /// Byte by byte, as a copy may overlap what it's writing (a run of the same few bytes).
  static int _copy(Uint8List out, int o, int off, int len) {
    if (off <= 0 || off > o) throw const FormatException('bad snappy offset');
    for (var i = 0; i < len; i++) {
      out[o + i] = out[o - off + i];
    }
    return o + len;
  }
}

/// The site's localStorage, as Chromium keeps it in LevelDB.
class ChromiumLocalStorage {
  ChromiumLocalStorage._();

  /// Every key and value [origin] (such as https://example.org) kept, in the database at [dir].
  /// Empty if there's no such folder. Other origins' keys and Chromium's own bookkeeping
  /// ("VERSION", "META:…") are left out.
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

  /// One of Chromium's strings: 1 then Latin-1 bytes, or 0 then UTF-16LE. Null for anything else.
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
