"""/nav's list of ways: the order the sort picks, each way's tags (Fastest, Least walking,
Fewest changes, Your bus), the chat's preferred buses, and what a way should cost, roughly.
Keep in step with main-site/js/ways.js and flutter/lib/features/nav/ways.dart.

Preferred buses come from two lists: one in /settings, for going anywhere, and one on each saved
place (/places), which counts only when going to within NEAR_PLACE_M of it. A way that rides one
is tagged Your bus and comes first in Best.

The fare is the distance fare of PTC's table, January 2026: one fare for the whole way by its
distance on buses and trains, however many changes, as a card pays it. The distance is along the
stops and stations ridden, a little more for the roads and tracks between them, so it's an
estimate. Ways across the Causeway have no fare here."""

import math
import re

SORTS = ("best", "fastest", "walk", "changes")
SORT_NAMES = {"best": "Best", "fastest": "Fastest", "walk": "Least walking", "changes": "Fewest changes"}
FARE_TYPES = ("adult", "student", "senior", "workfare")
FARE_NAMES = {"adult": "Adult", "student": "Student", "senior": "Senior citizen or PwD", "workfare": "Workfare"}
TAG_NAMES = {"fastest": "⚡ Fastest", "walk": "🚶 Least walking", "changes": "🔁 Fewest changes", "mine": "⭐ Your bus"}

# A walking minute counts this much in Best: in the sun, a long walk is worse than its minutes.
WALK_WEIGHT = 1.5
NEAR_PLACE_M = 400
MAX_BUSES = 20
# Roads wind more than the line between stops; tracks a little.
ROAD_FACTOR = 1.15
TRACK_FACTOR = 1.1
# Express buses cost a fixed $1 more for adults (PTC).
EXPRESS_EXTRA = 100

# Cents, by distance: up to 3.2 km, then each kilometre to 40.2 km, then over. Concession tables
# stop at over 7.2 km. Senior citizens and persons with disabilities pay the same.
FARES = {
    "adult": [128, 138, 149, 159, 168, 175, 182, 186, 190, 194, 198, 202, 207, 211, 215, 220, 224, 227, 230, 233, 236, 238, 240, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257],
    "student": [52, 60, 66, 71, 74, 78],
    "senior": [69, 79, 87, 94, 100, 107],
    "workfare": [78, 89, 98, 106, 113, 120, 126, 129, 132, 135, 138, 141, 144, 147, 150, 153, 156, 159, 162, 165, 168, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187],
}

_BUS_RE = re.compile(r"^[A-Z0-9]{1,5}$")


def parse_buses(text: str) -> list:
    """Bus numbers typed in a message, as a list: "228, 69 225w" is ["228", "69", "225W"]."""
    out = []
    for word in re.split(r"[\s,;/]+", str(text or "").upper()):
        if _BUS_RE.match(word) and word not in out:
            out.append(word)
    return out[:MAX_BUSES]


def metres(a, b) -> float:
    """Metres between two (lat, lng) pairs."""
    rad = math.radians
    h = math.sin(rad(b[0] - a[0]) / 2) ** 2 + math.cos(rad(a[0])) * math.cos(rad(b[0])) * math.sin(rad(b[1] - a[1]) / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def preferred_for(to: "dict | None", buses: list, places: list) -> set:
    """The buses you'd rather take going to `to`: the chat's own list (`buses`) and that of
    every saved place near it (`places`, each with its `buses`)."""
    out = set(buses)
    if to and to.get("lat") is not None:
        for p in places:
            if p.get("lat") is None or metres((p["lat"], p["lng"]), (to["lat"], to["lng"])) > NEAR_PLACE_M:
                continue
            out.update(p.get("buses") or [])
    return out


# ---------- facts, order and tags ----------


def _rides(o: dict) -> list:
    return [leg for leg in o.get("legs") or [] if leg["mode"] != "walk"]


def facts(o: dict) -> dict:
    """Minutes, metres and minutes walked, and changes: getting off at a stop on the way isn't one."""
    legs = o.get("legs") or []
    walks = [leg for leg in legs if leg["mode"] == "walk"]
    via = o.get("via")
    halves = [legs[: via["leg"]], legs[via["leg"]:]] if via else [legs]
    return {
        "minutes": o.get("minutes") or 0,
        "walk_m": sum(leg.get("metres") or 0 for leg in walks),
        "walk_min": sum(leg.get("minutes") or 0 for leg in walks),
        "changes": sum(max(0, len([leg for leg in h if leg["mode"] != "walk"]) - 1) for h in halves),
    }


def rides_preferred(o: dict, buses: set) -> bool:
    return bool(buses) and any(leg["mode"] == "bus" and str(leg.get("route", "")).upper() in buses for leg in _rides(o))


def order(options: list, sort: str = "best", buses: "set | None" = None) -> list:
    """The ways in the order of `sort`. Best: your buses first, then by minutes with walking
    counted at WALK_WEIGHT. Least walking and Fewest changes leave walking all the way last.
    Stable, as the site's."""
    buses = buses or set()
    f = [facts(o) for o in options]
    keys = {
        "fastest": lambda i: (f[i]["minutes"],),
        "walk": lambda i: (bool(options[i].get("walkOnly")), f[i]["walk_m"], f[i]["minutes"]),
        "changes": lambda i: (bool(options[i].get("walkOnly")), f[i]["changes"], f[i]["minutes"]),
        "best": lambda i: (not rides_preferred(options[i], buses), f[i]["minutes"] + (WALK_WEIGHT - 1) * f[i]["walk_min"], f[i]["minutes"]),
    }
    key = keys.get(sort, keys["best"])
    return [options[i] for i in sorted(range(len(options)), key=key)]


def tags(options: list, buses: "set | None" = None) -> list:
    """Each way's tags, a list per way in the same order: 'fastest', 'walk', 'changes', the best
    at each among the ways by bus and train where that's better than some other way, the first
    such in order of minutes; and 'mine' on every way riding one of your buses."""
    buses = buses or set()
    out = [[] for _ in options]
    ways = sorted((i for i, o in enumerate(options) if not o.get("walkOnly")), key=lambda i: (options[i].get("minutes") or 0, i))
    if len(ways) > 1:
        f = {i: facts(options[i]) for i in ways}
        for tag, of in (("fastest", "minutes"), ("walk", "walk_m"), ("changes", "changes")):
            values = [f[i][of] for i in ways]
            least = min(values)
            if least == max(values):
                continue
            out[ways[values.index(least)]].append(tag)
    for i, o in enumerate(options):
        if rides_preferred(o, buses):
            out[i].append("mine")
    return out


# ---------- the fare ----------


def _ride_metres(leg: dict) -> float:
    path = leg.get("path") or []
    m = sum(metres(path[i - 1], path[i]) for i in range(1, len(path)))
    return m * (TRACK_FACTOR if leg["mode"] == "train" else ROAD_FACTOR)


def band(km: float, table: list) -> int:
    """The band of a table for a distance in kilometres, counted to the tenth as the fare is."""
    # Halves up, as JavaScript's Math.round and Dart's round do (Python's round goes to even).
    half_up = lambda x: math.floor(x + 0.5)
    tenths = half_up(km * 10) / 10
    i = 0 if tenths <= 3.2 else math.ceil(half_up((tenths - 3.2) * 10) / 10)
    return table[min(i, len(table) - 1)]


def fare(o: dict, fare_type: str = "adult", category=None) -> "dict | None":
    """What a way should cost by card: {cents, km}, or None with nothing to pay for (walking all
    the way, or only shuttles) or no fare known (across the Causeway). `category(no)`, when
    given, is a bus's LTA category, for the express fare."""
    paid = [leg for leg in _rides(o) if not leg.get("campus")]
    if not paid or any(leg.get("customs") or not leg.get("path") for leg in paid):
        return None
    km = sum(_ride_metres(leg) for leg in paid) / 1000
    kind = fare_type if fare_type in FARES else "adult"
    cents = band(km, FARES[kind])
    if kind == "adult" and category and any(leg["mode"] == "bus" and category(str(leg.get("route"))) == "EXPRESS" for leg in paid):
        cents += EXPRESS_EXTRA
    return {"cents": cents, "km": math.floor(km * 10 + 0.5) / 10}


def fare_text(cents: int) -> str:
    return f"S${cents / 100:.2f}"
