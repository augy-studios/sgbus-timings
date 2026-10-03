"""Which of URA's 55 planning areas a bus stop is in - Bedok, Toa Payoh, Bukit Merah - so a
list can tell apart the stops that share a name, like the five called Blk 111. The outlines
are vendored in planning_areas.json by scripts/vendor-planning-areas.mjs."""

import json
from functools import lru_cache
from pathlib import Path

from .bus_stops import get_bus_stop_by_code


def _bbox(polygons) -> tuple:
    points = [point for polygon in polygons for point in polygon[0]]
    lngs = [lng for lng, _ in points]
    lats = [lat for _, lat in points]
    return min(lngs), min(lats), max(lngs), max(lats)


with open(Path(__file__).with_name("planning_areas.json"), encoding="utf-8") as f:
    _AREAS = [(area["name"], _bbox(area["polygons"]), area["polygons"]) for area in json.load(f)["areas"]]


def _in_ring(lng: float, lat: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _distance_to_ring(lng: float, lat: float, ring) -> float:
    """How far a point is from a ring's edge, in degrees - near enough to flat this close
    to the equator."""
    best = float("inf")
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((lng - x1) * dx + (lat - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, ((lng - x1 - t * dx) ** 2 + (lat - y1 - t * dy) ** 2) ** 0.5)
    return best


# A stop on a boundary road or the shore can land just outside every outline; within this
# (about 330 m) it takes the nearest area. The cross-border stops are well beyond it.
_NEAR = 0.003


@lru_cache(maxsize=8192)
def area_at(lat, lng) -> "str | None":
    """The planning area a point is in, or None outside them all - in Johor Bahru, say,
    where a few cross-border stops are."""
    if lat is None or lng is None:
        return None
    for name, (west, south, east, north), polygons in _AREAS:
        if not (west <= lng <= east and south <= lat <= north):
            continue
        for outer, *holes in polygons:
            if _in_ring(lng, lat, outer) and not any(_in_ring(lng, lat, hole) for hole in holes):
                return name

    nearest, best = None, _NEAR
    for name, (west, south, east, north), polygons in _AREAS:
        if not (west - _NEAR <= lng <= east + _NEAR and south - _NEAR <= lat <= north + _NEAR):
            continue
        for outer, *_ in polygons:
            distance = _distance_to_ring(lng, lat, outer)
            if distance < best:
                nearest, best = name, distance
    return nearest


def _area_and_road(stop) -> tuple:
    # Favourites keep only a stop's code and name, so look the rest up.
    if "lat" not in stop.keys():
        stop = get_bus_stop_by_code(stop["code"])
        if not stop:
            return None, None
    return area_at(stop["lat"], stop["lng"]), stop["road"] or None


def tell_apart(stops) -> dict:
    """For each stop in a list that shares its name with another in it, a few words on where
    it is: its planning area, or its road where another of the same name is in that area
    too. Keyed by stop code; a stop whose name is its own isn't in it."""
    by_name = {}
    for stop in stops:
        by_name.setdefault(" ".join(stop["name"].casefold().split()), []).append(stop)

    places = {}
    for same in by_name.values():
        if len(same) < 2:
            continue
        found = [_area_and_road(stop) for stop in same]
        areas = [area for area, _ in found]
        for stop, (area, road) in zip(same, found):
            place = area if area and areas.count(area) == 1 else road or area
            if place:
                places[stop["code"]] = place
    return places
