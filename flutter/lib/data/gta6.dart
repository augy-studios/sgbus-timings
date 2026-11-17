// GTA VI's colours (the site's js/gta6.js), for the game's release on 19 November: anyone can set
// them until `until`, midnight going into 26 November in Singapore. Set once by then, they're
// theirs for good, whatever they change to afterwards. After that they're locked until the uwuCoins
// wheel's egg slice gives them (Coins.spin), which it does before any more eggs, and until it does
// the slice stays a prize once the eggs are all found.
//
// sgbus_gta6: { at, how: "set" or "wheel" }. This phone's, not synced, as the coins and eggs aren't.
import 'store.dart';
import 'when.dart';

class Gta6 {
  Gta6._();
  static const key = 'sgbus_gta6';
  static const offerKey = 'sgbus_gta6_offer'; // offered once: Gta6Offer
  static final until = DateTime.utc(2026, 11, 25, 16).millisecondsSinceEpoch;

  static bool get owned => Store.I.get(key) != null;
  static bool get open => When.nowMs() < until;
  static bool get canPick => owned || open;

  /// The wheel's to give.
  static bool get due => !canPick;

  static void claim(String how) {
    if (!owned) Store.I.putJson(key, {'at': When.nowMs(), 'how': how});
  }

  /// Set from Theme or the offer: true if it may be, and kept if that's what does it.
  static bool pick() {
    if (owned) return true;
    if (!open) return false;
    claim('set');
    return true;
  }
}
