"""Journeys for route ends that no single bus links: up to two changes of bus, with a short
walk allowed at either end and between buses, since the two sides of a road are two
different stops and a change often means crossing over.

Unlike `services_between`, every bus leg here has to travel forwards - boarding before
alighting on one run of the route - or a journey could ride out to a terminus and back.

LTA gives no journey times, so every time here is an estimate from straight-line distance
between consecutive stops. They are good for ranking journeys against each other and for
a rough "you'd get there around" - nothing tighter."""

import math
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
MAX_JOURNEYS = 5

# Grid cells of about 220 m, so every stop within the walk limit is in the 3x3 block of
# cells around a stop.
_CELL_DEG = 0.002

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
        self.coords = {
            row["code"]: (row["lat"], row["lng"])
            for row in db.execute("SELECT code, lat, lng FROM bus_stops WHERE lat IS NOT NULL AND lng IS NOT NULL")
        }
        self._near = {}
        self.grid = defaultdict(list)
        for code, (lat, lng) in self.coords.items():
            self.grid[self._cell(lat, lng)].append(code)

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


def _leg(net, run, i, j) -> dict:
    stops = net.runs[run]
    return {"bus": run[0], "dir": run[1], "from": stops[i], "to": stops[j]}


def find_journeys(start_code: str, end_code: str, limit: int = MAX_JOURNEYS) -> list:
    """The quickest few ways from one stop to another with a walk or up to two changes,
    best first, one per sequence of buses. Each is a list of legs, {bus, dir, from, to},
    the walks being implied by the gaps between one leg's `to` and the next's `from`.

    Meant for when no single bus links the two stops, so it doesn't look for one riding
    straight between them - but a bus from the stop across the road does count."""
    net = _get_network()
    starts = net.with_near(start_code)
    ends = net.with_near(end_code)

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

    best = {}

    def offer(cost, legs):
        buses = tuple(leg["bus"] for leg in legs)
        if len(set(buses)) < len(buses):
            return
        if buses not in best or cost < best[buses][0]:
            best[buses] = (cost, legs)

    end_walk = dict(ends)
    onward_at = defaultdict(list)
    for (stop, run), (cost, i, j) in onward.items():
        onward_at[stop].append((run, cost, i, j))
        # No change: one bus, with a walk at one end or both.
        if stop in end_walk:
            offer(cost + _walk_min(end_walk[stop]), [_leg(net, run, i, j)])

    # One change: off the first bus, a short walk at most, onto a bus to the end.
    for (stop, run1), (cost1, i1, j1) in onward.items():
        for board, walk_m in net.with_near(stop):
            for run2, cost2, i2, j2 in inward_at.get(board, ()):
                if run2[0] == run1[0]:
                    continue
                cost = cost1 + _walk_min(walk_m) + CHANGE_PENALTY_MIN + cost2
                offer(cost, [_leg(net, run1, i1, j1), _leg(net, run2, i2, j2)])

    # Two changes: the best way onto each stop after the first bus, and the best way to
    # the end from each stop before the last one, joined up by a middle bus between them.
    reach = {}
    for stop, entries in onward_at.items():
        run1, cost1, i1, j1 = min(entries, key=lambda e: e[1])
        for board, walk_m in net.with_near(stop):
            cost = cost1 + _walk_min(walk_m) + CHANGE_PENALTY_MIN
            if board not in reach or cost < reach[board][0]:
                reach[board] = (cost, run1, i1, j1)
    finish = {}
    for stop, entries in inward_at.items():
        run3, cost3, i3, j3 = min(entries, key=lambda e: e[1])
        for alight, walk_m in net.with_near(stop):
            cost = _walk_min(walk_m) + CHANGE_PENALTY_MIN + cost3
            if alight not in finish or cost < finish[alight][0]:
                finish[alight] = (cost, run3, i3, j3)

    for run2, stops in net.runs.items():
        # The cheapest way to be on this bus so far, as minutes before its own ride is
        # counted, so the ride on to any later stop is just a subtraction away.
        best_on = None
        for index, stop in enumerate(stops):
            if best_on and stop in finish:
                on_cost, i2, run1, i1, j1 = best_on
                tail, run3, i3, j3 = finish[stop]
                cost = on_cost + net.cum[run2][index] / BUS_M_PER_MIN + tail
                offer(cost, [_leg(net, run1, i1, j1), _leg(net, run2, i2, index), _leg(net, run3, i3, j3)])
            if stop in reach:
                cost, run1, i1, j1 = reach[stop]
                on_cost = cost - net.cum[run2][index] / BUS_M_PER_MIN
                if best_on is None or on_cost < best_on[0]:
                    best_on = (on_cost, index, run1, i1, j1)

    ranked = sorted(best.values(), key=lambda item: (item[0], [_natural_sort_key(leg["bus"]) for leg in item[1]]))
    return [legs for _, legs in ranked[:limit]]


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
