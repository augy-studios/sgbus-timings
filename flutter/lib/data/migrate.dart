// The first launch after updating from the WebView app (2.3.1 and before): everything the site
// kept in the WebView's localStorage brought into the app's own store, as it was, once
// (MigratePlugin reads it). The WebView's copy is left alone, so nothing's lost either way.
import '../native/native_bridge.dart';
import 'store.dart';

class Migrate {
  static const doneKey = 'app.migrated';

  /// How many values came over this time (0 when it was done before, or there was nothing).
  static Future<int> run(Store store) async {
    if (store.has(doneKey) || !Native.available) return 0;
    var n = 0;
    try {
      final r = await Native.call('Migrate', 'read');
      final items = Map<String, dynamic>.from((r?['items'] as Map?) ?? const {});
      items.forEach((k, v) {
        // Only the site's own, and never over anything the app has set since.
        if (!k.startsWith('sgbus') || store.has(k) || v is! String) return;
        store.put(k, v);
        n++;
      });
    } on NativeError {
      // No WebView to read: a phone that never had the old app's data either.
    }
    store.put(doneKey, DateTime.now().millisecondsSinceEpoch.toString());
    return n;
  }
}
