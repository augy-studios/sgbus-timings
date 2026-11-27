// The event colours (the site's js/gta6.js, in step with it): brand colours anyone can set until an
// event's `until`. Set once by then, they're theirs for good, whatever they change to afterwards.
// After that they're locked until the uwuCoins wheel's egg slice gives them (Coins.spin), which it
// does before any more eggs, one event at a time in EventColours.list's order, and until it does
// the slice stays a prize once the eggs are all found.
//
//   GTA VI's, for the game's release on 19 November: open until midnight going into 15 December
//   in Singapore.
//   The IKEA shuttle's, in IKEA's blue and yellow, to see off the free shuttle to IKEA Tampines,
//   which runs for the last time on 31 December: open until midnight going into 1 January 2027.
//
// sgbus_<id>: { at, how: "set", "wheel" or "egglink" }, and sgbus_<id>_offer once offered
// (EventOffer). This phone's, not synced, as the coins and eggs aren't.
import 'store.dart';
import 'when.dart';

/// An event's colours: its id (for its keys and the wheel's log), its brand colour's id
/// (theme.dart) and when it stops being anyone's to set.
class EventColour {
  EventColour({required this.id, required this.theme, required this.until});
  final String id;
  final String theme;
  final int until;

  String get key => 'sgbus_$id';
  String get offerKey => 'sgbus_${id}_offer';

  bool get owned => Store.I.get(key) != null;
  bool get open => When.nowMs() < until;
  bool get canPick => owned || open;

  /// The wheel's to give.
  bool get due => !canPick;

  void claim(String how) {
    if (!owned) Store.I.putJson(key, {'at': When.nowMs(), 'how': how});
  }

  /// Set from Theme or the offer: true if it may be, and kept if that's what does it.
  bool pick() {
    if (owned) return true;
    if (!open) return false;
    claim('set');
    return true;
  }
}

/// Every event's colours, counted beside the Easter eggs found. The wheel gives them in this order.
/// In step with the site's window.EventColours (js/gta6.js).
class EventColours {
  EventColours._();
  static final list = [Gta6.event, Ikea.event];
  static List<String> get all => [for (final e in list) e.theme];
  static List<String> found() => [for (final e in list) if (e.owned) e.theme];
  static EventColour? byTheme(String theme) => list.where((e) => e.theme == theme).firstOrNull;
  static EventColour? byId(String id) => list.where((e) => e.id == id).firstOrNull;

  /// The first the wheel's egg slice gives, or null.
  static EventColour? get due => list.where((e) => e.due).firstOrNull;
}

/// GTA VI's colours.
class Gta6 {
  Gta6._();
  static final event = EventColour(id: 'gta6', theme: theme, until: DateTime.utc(2026, 12, 14, 16).millisecondsSinceEpoch);
  static const key = 'sgbus_gta6';
  static const offerKey = 'sgbus_gta6_offer'; // offered once: EventOffer
  static const theme = 'gta-6'; // its brand colour's id (theme.dart)
  static int get until => event.until;

  static bool get owned => event.owned;
  static bool get open => event.open;
  static bool get canPick => event.canPick;
  static bool get due => event.due;
  static void claim(String how) => event.claim(how);
  static bool pick() => event.pick();
}

/// The IKEA shuttle's colours.
class Ikea {
  Ikea._();
  static final event = EventColour(id: 'ikea', theme: theme, until: DateTime.utc(2026, 12, 31, 16).millisecondsSinceEpoch);
  static const theme = 'ikea'; // its brand colour's id (theme.dart)
  static bool get owned => event.owned;
  static bool get open => event.open;
  static bool get canPick => event.canPick;
  static bool get due => event.due;
}
