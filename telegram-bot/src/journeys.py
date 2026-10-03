"""The buses that run from one stop to another, and journeys for route ends that no single
bus links: up to three changes of bus, with a short walk allowed at either end and between
buses, since the two sides of a road are two different stops and a change often means
crossing over.

Every bus here has to travel forwards - boarding before alighting on one run of the
route - or a bus could ride out to a terminus and back.

LTA gives no journey times, so every time here is an estimate from straight-line distance
between consecutive stops. They are good for ranking journeys against each other and for
a rough "you'd get there around" - nothing tighter."""

import math
import re
from collections import defaultdict

from .db import db
from .lta import _natural_sort_key

WALK_LIMIT_M = 200
# Straight-line metres covered per minute. A bus's ~15 km/h takes in its stops and the
# road's bends; on foot, 80 m/min slowed down for crossings and the long way round.
BUS_M_PER_MIN = 250
WALK_M_PER_MIN = 60
# What a change costs over the time spent moving - the wait for the next bus, mostly - so
# a journey with fewer changes wins unless it's clearly slower.
CHANGE_PENALTY_MIN = 6
# A change on foot, to another stop, over one at the same stop: finding the stop and
# crossing to it. So when the first bus goes on into the interchange the next one leaves
# from, riding in wins unless getting off early and walking is clearly quicker. The same as
# CHANGE_WALK_MIN in main-site/js/journeys.js and main-site/api/_nav/network.js.
CHANGE_WALK_MIN = 1
# Changes of bus in one journey, at most: some trips across the island take four buses.
MAX_CHANGES = 3
MAX_JOURNEYS = 5
# The stop across the road: the other side's stop on the same road, this close. Two stops
# on one road within 100 m are nearly always the pair facing each other; stops one after
# the other on a route are rarely that close.
ACROSS_ROAD_M = 100
# How much quicker the stop across the road has to be before the one given is called the
# wrong side, rather than a stop with slower buses.
WRONG_SIDE_MIN = 5

# A change of bus at a hub - an interchange, a terminal or a station - can be between any
# two of its stops this far apart, beyond the usual walk: Tampines Int is 300 m from
# Tampines Stn/Int, and HarbourFront Int nearly 400 m from HarbourFront Stn. The walk is
# timed like any other, so a long one only wins when it's worth it.
HUB_WALK_M = 400

# Grid cells of about 220 m, so every stop within the walk limit is in the 3x3 block of
# cells around a stop.
_CELL_DEG = 0.002

# The hub a stop belongs to, from its name: what comes before "Int", "Ter" or "Stn", with
# which side of the road it's on dropped, so "Tampines Int", "Opp Tampines Stn/Int" and
# "Tampines Stn Exit D" are all "tampines". Stations that aren't rail stations ("Police
# Stn", "Caltex Stn") belong to none. Keep in step with hubOf in main-site/js/network.js and
# main-site/api/_nav/network.js.
_HUB_RE = re.compile(r"^(.*?)\s*\b(?:bus\s+)?(?:int|ter|stn)\b", re.IGNORECASE)
_NOT_A_STATION_RE = re.compile(
    r"\b(?:police|fire|pumping|power|petrol|radio|coast\s*guard|civil\s*defence|bus"
    r"|caltex|shell|esso|spc|sinopec|mobil)\s+stn\b",
    re.IGNORECASE,
)
_SIDE_PREFIX_RE = re.compile(r"^(?:opp|aft|bef|bet|opposite)\s+", re.IGNORECASE)


def hub_of(name) -> str | None:
    if not name:
        return None
    match = _HUB_RE.match(_SIDE_PREFIX_RE.sub("", _NOT_A_STATION_RE.sub("", name)).strip())
    if not match:
        return None
    return match.group(1).strip().lower() or None

_network = None


def invalidate_network() -> None:
    """Drops the cached network, so the next search rebuilds it from the refreshed tables."""
    global _network
    _network = None


def _haversine(a, b) -> float:
    lat1, lng1 = a
    lat2, lng2 = b
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


class _Network:
    """Every run of every service - one direction, stop by stop - held in memory, with the
    distance ridden to each stop, where each stop sits on each run, and a grid for finding
    the stops a short walk away."""

    def __init__(self):
        self.coords = {}
        self.roads = {}
        hubs = defaultdict(list)
        for row in db.execute(
            "SELECT code, name, road, lat, lng FROM bus_stops WHERE lat IS NOT NULL AND lng IS NOT NULL"
        ):
            self.coords[row["code"]] = (row["lat"], row["lng"])
            if row["road"]:
                self.roads[row["code"]] = row["road"].strip().lower()
            hub = hub_of(row["name"])
            if hub:
                hubs[hub].append(row["code"])
        self._near = {}
        self.grid = defaultdict(list)
        for code, (lat, lng) in self.coords.items():
            self.grid[self._cell(lat, lng)].append(code)

        # (stop, metres) for the stops of the same hub too far apart for an ordinary walk
        # but close enough to change between: see HUB_WALK_M.
        self.hub_mates = defaultdict(list)
        for codes in hubs.values():
            for a in codes:
                for b in codes:
                    if a != b:
                        metres = _haversine(self.coords[a], self.coords[b])
                        if WALK_LIMIT_M < metres <= HUB_WALK_M:
                            self.hub_mates[a].append((b, metres))

        loops = {
            row["service_no"]: row["origin_code"]
            for row in db.execute(
                "SELECT service_no, origin_code FROM bus_services "
                "WHERE origin_code IS NOT NULL AND (loop_desc IS NOT NULL OR origin_code = destination_code)"
            )
        }
        self.runs = defaultdict(list)
        for row in db.execute(
            "SELECT service_no, direction, stop_code FROM bus_routes ORDER BY service_no, direction, stop_sequence"
        ):
            self.runs[(row["service_no"], row["direction"])].append(row["stop_code"])
        for (service_no, _), stops in self.runs.items():
            # A loop ends where it started, but the route list keeps one row per stop, so
            # the terminus is only there as the first stop. Put it back on the end, or no
            # journey could ever ride a loop service home to its interchange.
            origin = loops.get(service_no)
            if origin and stops[0] == origin and stops[-1] != origin:
                stops.append(origin)

        self.cum = {}
        self.at = defaultdict(list)
        for run, stops in self.runs.items():
            total, cum = 0.0, [0.0]
            for prev, stop in zip(stops, stops[1:]):
                if prev in self.coords and stop in self.coords:
                    total += _haversine(self.coords[prev], self.coords[stop])
                cum.append(total)
            self.cum[run] = cum
            for index, stop in enumerate(stops):
                self.at[stop].append((run, index))

    @staticmethod
    def _cell(lat, lng):
        return (math.floor(lat / _CELL_DEG), math.floor(lng / _CELL_DEG))

    def near(self, code) -> list:
        """(stop, metres) for every other stop within walking distance of this one."""
        if code not in self._near:
            self._near[code] = self._find_near(code)
        return self._near[code]

    def _find_near(self, code) -> list:
        here = self.coords.get(code)
        if not here:
            return []
        cx, cy = self._cell(*here)
        found = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in self.grid.get((cx + dx, cy + dy), ()):
                    if other != code:
                        metres = _haversine(here, self.coords[other])
                        if metres <= WALK_LIMIT_M:
                            found.append((other, metres))
        return found

    def with_near(self, code) -> list:
        """The stop itself at no distance, then the stops within walking distance of it."""
        return [(code, 0.0), *self.near(code)]

    def change_near(self, code) -> list:
        """Where a change of bus off at this stop can board the next: `with_near`, plus the
        rest of its hub (HUB_WALK_M). Only for changes; a journey's two ends keep to the
        ordinary walk."""
        return [*self.with_near(code), *self.hub_mates.get(code, ())]

    def walk_metres(self, a, b) -> float:
        if a == b or a not in self.coords or b not in self.coords:
            return 0.0
        return _haversine(self.coords[a], self.coords[b])


def _get_network() -> _Network:
    global _network
    if _network is None:
        _network = _Network()
    return _network


def _ride_min(net, run, i, j) -> float:
    return (net.cum[run][j] - net.cum[run][i]) / BUS_M_PER_MIN


def _walk_min(metres) -> float:
    return metres / WALK_M_PER_MIN


def _change_walk(metres) -> float:
    """A change's walk: none at the same stop, or the walk and CHANGE_WALK_MIN to another."""
    return _walk_min(metres) + CHANGE_WALK_MIN if metres > 0 else 0.0


def _leg(net, run, i, j) -> dict:
    stops = net.runs[run]
    return {"bus": run[0], "dir": run[1], "from": stops[i], "to": stops[j]}


def direct_services(start_code: str, end_code: str) -> list:
    """Every bus that runs from one stop to the other without a change, heading the right
    way: calling at the end after the start on one run of its route. A loop service counts
    round to its interchange, not past it. In bus-number order.

    A bus that calls at both stops only the wrong way round isn't one - it would ride out
    to its terminus and back. Picking the stop on the wrong side of the road is how that
    usually comes about, and it's the journeys, which walk across, that find the bus for it."""
    net = _get_network()
    found = {run[0] for run, i in net.at.get(start_code, ()) if end_code in net.runs[run][i + 1 :]}
    return sorted(found, key=_natural_sort_key)


def find_journeys(start_code: str, end_code: str, limit: int = MAX_JOURNEYS) -> list:
    """The quickest few ways from one stop to another with a walk or up to three changes,
    best first, one per sequence of buses. Each is a list of legs, {bus, dir, from, to},
    the walks being implied by the gaps between one leg's `to` and the next's `from`.

    Meant for when no single bus links the two stops, so it doesn't look for one riding
    straight between them - but a bus from the stop across the road does count."""
    return [legs for _, legs in _ranked_journeys(start_code, end_code)[:limit]]


def _ranked_journeys(start_code: str, end_code: str, walk_start: bool = True, walk_end: bool = True) -> list:
    """Every journey `find_journeys` weighs up, best first, as (cost, legs). With
    `walk_start` or `walk_end` off, that end is used as it is, with no walk to or from it."""
    net = _get_network()
    starts = net.with_near(start_code) if walk_start else [(start_code, 0.0)]
    ends = net.with_near(end_code) if walk_end else [(end_code, 0.0)]

    # Onward: every stop reachable on one bus from the start, best way per (stop, run).
    # value = (minutes so far, board index)
    onward = {}
    for board, walk_m in starts:
        for run, i in net.at.get(board, ()):
            stops = net.runs[run]
            for j in range(i + 1, len(stops)):
                cost = _walk_min(walk_m) + _ride_min(net, run, i, j)
                key = (stops[j], run)
                if key not in onward or cost < onward[key][0]:
                    onward[key] = (cost, i, j)

    # Inward: every stop one bus away from the end, best way per (stop, run).
    # value = (minutes still to go, board index, alight index)
    inward = {}
    for alight, walk_m in ends:
        for run, j in net.at.get(alight, ()):
            for i in range(j):
                cost = _ride_min(net, run, i, j) + _walk_min(walk_m)
                key = (net.runs[run][i], run)
                if key not in inward or cost < inward[key][0]:
                    inward[key] = (cost, i, j)
    inward_at = defaultdict(list)
    for (stop, run), value in inward.items():
        inward_at[stop].append((run, *value))

    # `parts` is (run, i, j) per leg; the legs themselves are only built for the journeys
    # that make the list.
    best = {}

    def offer(cost, parts):
        buses = tuple(run[0] for run, _, _ in parts)
        if len(set(buses)) < len(buses):
            return
        if buses not in best or cost < best[buses][0]:
            best[buses] = (cost, parts)

    end_walk = dict(ends)
    onward_at = defaultdict(list)
    for (stop, run), (cost, i, j) in onward.items():
        onward_at[stop].append((run, cost, i, j))
        # No change: one bus, with a walk at one end or both.
        if stop in end_walk:
            offer(cost + _walk_min(end_walk[stop]), ((run, i, j),))

    # One change: off the first bus, a short walk at most, onto a bus to the end.
    for (stop, run1), (cost1, i1, j1) in onward.items():
        for board, walk_m in net.change_near(stop):
            for run2, cost2, i2, j2 in inward_at.get(board, ()):
                if run2[0] == run1[0]:
                    continue
                cost = cost1 + _change_walk(walk_m) + CHANGE_PENALTY_MIN + cost2
                offer(cost, ((run1, i1, j1), (run2, i2, j2)))

    # Two changes or more: the best way onto each stop after the first few buses, and the
    # best way to the end from each stop before the last few, joined up by a middle bus.
    # reach[k] and finish[k] are {stop: (minutes, parts)} with k buses ridden, the walk and
    # the change onto or off the middle bus counted in.
    reach = [None, _change_at(net, _cheapest(onward_at))]
    finish = [None, _change_at(net, _cheapest(inward_at))]
    for _ in range(2, MAX_CHANGES):
        reach.append(_change_at(net, _ride_on(net, reach[-1])))
        finish.append(_change_at(net, _ride_back(net, finish[-1])))

    for run, stops in net.runs.items():
        for before in range(1, MAX_CHANGES):
            for index, cost, board, parts in _scan_on(net, reach[before], run):
                for after in range(1, MAX_CHANGES - before + 1):
                    tail = finish[after].get(stops[index])
                    if tail:
                        offer(cost + tail[0], (*parts, (run, board, index), *tail[1]))

    sort_keys = {}

    def bus_key(bus):
        if bus not in sort_keys:
            sort_keys[bus] = _natural_sort_key(bus)
        return sort_keys[bus]

    ranked = sorted(best.values(), key=lambda item: (item[0], [bus_key(run[0]) for run, _, _ in item[1]]))
    return [(cost, [_leg(net, *part) for part in parts]) for cost, parts in ranked]


def _scan_on(net, reach, run):
    """Every stop along one run that a journey in `reach` could ride this bus to, as
    (index, minutes so far, board index, parts before this bus), boarding wherever is
    cheapest before it. A journey that has already ridden this bus doesn't board it again."""
    stops = net.runs[run]
    cum = net.cum[run]
    # The cheapest way to be on this bus so far, as minutes before its own ride is counted,
    # so the ride on to any later stop is just a subtraction away.
    best_on = None
    for index, stop in enumerate(stops):
        if best_on:
            on_cost, board, parts = best_on
            yield index, on_cost + cum[index] / BUS_M_PER_MIN, board, parts
        label = reach.get(stop)
        if label and all(r[0] != run[0] for r, _, _ in label[1]):
            on_cost = label[0] - cum[index] / BUS_M_PER_MIN
            if best_on is None or on_cost < best_on[0]:
                best_on = (on_cost, index, label[1])


def _ride_on(net, reach) -> dict:
    """The cheapest way off one more bus at every stop, from the journeys in `reach`, as
    {stop: (minutes, parts)}."""
    off = {}
    for run, stops in net.runs.items():
        for index, cost, board, parts in _scan_on(net, reach, run):
            stop = stops[index]
            if stop not in off or cost < off[stop][0]:
                off[stop] = (cost, (*parts, (run, board, index)))
    return off


def _ride_back(net, finish) -> dict:
    """`_ride_on` backwards: the cheapest way to the end from every stop, one more bus
    before the journeys in `finish`, as {stop: (minutes still to go, parts)}."""
    on = {}
    for run, stops in net.runs.items():
        cum = net.cum[run]
        # The cheapest way on from getting off this bus, as minutes plus its own ride so far.
        best_off = None
        for index in range(len(stops) - 1, -1, -1):
            stop = stops[index]
            if best_off:
                off_cost, alight, parts = best_off
                cost = off_cost - cum[index] / BUS_M_PER_MIN
                if stop not in on or cost < on[stop][0]:
                    on[stop] = (cost, ((run, index, alight), *parts))
            label = finish.get(stop)
            if label and all(r[0] != run[0] for r, _, _ in label[1]):
                off_cost = label[0] + cum[index] / BUS_M_PER_MIN
                if best_off is None or off_cost < best_off[0]:
                    best_off = (off_cost, index, label[1])
    return on


def _cheapest(entries_at) -> dict:
    """The quickest of each stop's (run, minutes, i, j) one-bus entries, as
    {stop: (minutes, parts)}."""
    out = {}
    for stop, entries in entries_at.items():
        run, cost, i, j = min(entries, key=lambda e: e[1])
        out[stop] = (cost, ((run, i, j),))
    return out


def _change_at(net, at) -> dict:
    """A change of bus at every stop in `at`, {stop: (minutes, parts)}: the short walk to
    each stop near it, or across its hub, and the wait there, cheapest per stop, keyed the
    same way."""
    out = {}
    for stop, (cost, parts) in at.items():
        for other, walk_m in net.change_near(stop):
            total = cost + _change_walk(walk_m) + CHANGE_PENALTY_MIN
            if other not in out or total < out[other][0]:
                out[other] = (total, parts)
    return out


def across_the_road(code: str) -> list:
    """(stop, metres) for the stops across the road from this one, nearest first."""
    net = _get_network()
    road = net.roads.get(code)
    if not road:
        return []
    return sorted(
        ((other, metres) for other, metres in net.near(code) if metres <= ACROSS_ROAD_M and net.roads.get(other) == road),
        key=lambda item: item[1],
    )


def wrong_side_ends(start_code: str, end_code: str) -> dict:
    """The stop across the road that each end of a route was most likely meant to be, as
    {"start": (code, metres), "end": (code, metres)}, leaving out an end that looks right.

    An end looks wrong when the quickest journey boards or gets off across the road from
    it, and staying put at the end as given is at least WRONG_SIDE_MIN slower, or can't be
    done at all: the stop on the side of the road the buses don't go your way from. A
    minute or two either way is just a choice of buses, not the wrong stop."""
    ranked = _ranked_journeys(start_code, end_code)
    if not ranked:
        return {}
    best_cost, best = ranked[0]
    fixes = {}
    for field, code, used, stay_put in (
        ("start", start_code, best[0]["from"], {"walk_start": False}),
        ("end", end_code, best[-1]["to"], {"walk_end": False}),
    ):
        across = dict(across_the_road(code))
        if used not in across:
            continue
        own = _ranked_journeys(start_code, end_code, **stay_put)
        if own and own[0][0] - best_cost < WRONG_SIDE_MIN:
            continue
        fixes[field] = (used, across[used])
    return fixes


def leg_details(leg: dict) -> "dict | None":
    """How long a leg is: the stops it rides, and roughly how many minutes that takes.
    None when the bus no longer runs that way - the route list is refreshed daily, and a
    journey on an old button may name a run that's since changed."""
    net = _get_network()
    run = (leg["bus"], leg["dir"])
    stops = net.runs.get(run)
    if not stops or leg["from"] not in stops:
        return None
    i = stops.index(leg["from"])
    if leg["to"] not in stops[i + 1 :]:
        return None
    j = stops.index(leg["to"], i + 1)
    return {"stops": j - i, "minutes": _ride_min(net, run, i, j)}


def walk_details(from_code: str, to_code: str) -> "dict | None":
    """The walk between two stops, or None when there's no walk because they're the same."""
    if from_code == to_code:
        return None
    metres = _get_network().walk_metres(from_code, to_code)
    return {"metres": metres, "minutes": _walk_min(metres)}


def journey_minutes(legs: list, start_code: str, end_code: str) -> "float | None":
    """Time on the move - riding and walking, not waiting - for the whole journey."""
    total = 0.0
    here = start_code
    for leg in legs:
        details = leg_details(leg)
        if not details:
            return None
        walk = walk_details(here, leg["from"])
        total += details["minutes"] + (walk["minutes"] if walk else 0)
        here = leg["to"]
    walk = walk_details(here, end_code)
    return total + (walk["minutes"] if walk else 0)


def stops_to(service_no: str, from_code: str, to_code: str) -> "dict | None":
    """How many stops a bus rides from one stop to another. Forwards on one run if it can;
    failing that, out to the terminus on the run it's boarded on and back along the other
    direction's run, which is how a bus that serves the two stops on opposite runs gets
    there. {stops, via} where `via` is that terminus's code, or None when there's no turn."""
    net = _get_network()
    runs = [(run, stops) for run, stops in net.runs.items() if run[0] == service_no]
    for _, stops in runs:
        if from_code in stops and to_code in stops[stops.index(from_code) + 1 :]:
            i = stops.index(from_code)
            return {"stops": stops.index(to_code, i + 1) - i, "via": None}
    for _, out in runs:
        for _, back in runs:
            if out is not back and from_code in out and to_code in back:
                i = out.index(from_code)
                return {"stops": (len(out) - 1 - i) + back.index(to_code), "via": out[-1]}
    return None
