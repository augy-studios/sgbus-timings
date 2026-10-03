import math
import re
import sqlite3
from typing import Optional

from .db import db
from .journeys import invalidate_network
from .lta import fetch_all_bus_stops
from .stations import find_station, station_points


def _haversine_meters(lat1, lon1, lat2, lon2) -> Optional[float]:
    if any(v is None for v in (lat1, lon1, lat2, lon2)):
        return None
    r = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return round(r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


async def refresh_bus_stops() -> int:
    """Downloads the latest bus stop list from LTA DataMall and refreshes the local cache."""
    stops = await fetch_all_bus_stops()
    with db:
        db.executemany(
            """
            INSERT INTO bus_stops (code, name, road, lat, lng)
            VALUES (:code, :name, :road, :lat, :lng)
            ON CONFLICT(code) DO UPDATE SET
                name = excluded.name,
                road = excluded.road,
                lat = excluded.lat,
                lng = excluded.lng
            """,
            stops,
        )
    invalidate_network()
    return len(stops)


def bus_stops_count() -> int:
    return db.execute("SELECT COUNT(*) AS n FROM bus_stops").fetchone()["n"]


def get_bus_stop_by_code(code: str) -> Optional[sqlite3.Row]:
    return db.execute("SELECT * FROM bus_stops WHERE code = ?", (code,)).fetchone()


# LTA's stop names always shorten a station to "Stn" ("Bedok Stn Exit B"), so a search
# saying "station", "MRT" or "LRT" is also tried that way. Whole words only: the one stop
# name with "station" spelled out is in "Substation", at Lim Chu Kang.
_STN_WORDS_RE = re.compile(r"\b(?:(?:mrt|lrt)\s+(?:station|stn)|mrt|lrt|station)\b")


def search_bus_stops(query: str, limit: int = 10) -> list:
    """Search cached bus stops by exact code, code prefix, or a substring of the name/road.
    A station, as "Bedok MRT" or "Senja LRT", lists the stops at it instead, nearest first
    and with their distance from the closest exit."""
    q = query.strip().lower()
    if not q:
        return []

    station = find_station(q)
    if station:
        at_station = bus_stops_at_station(station, limit)
        if at_station:
            return at_station

    if q.isdigit():
        return db.execute(
            "SELECT * FROM bus_stops WHERE code LIKE ? ORDER BY code LIMIT ?",
            (f"{q}%", limit),
        ).fetchall()

    as_stn = _STN_WORDS_RE.sub("stn", q)
    return db.execute(
        """
        SELECT * FROM bus_stops
        WHERE LOWER(name) LIKE ? OR LOWER(road) LIKE ? OR LOWER(name) LIKE ?
        ORDER BY
            CASE WHEN LOWER(name) LIKE ? OR LOWER(name) LIKE ? THEN 0 ELSE 1 END,
            name
        LIMIT ?
        """,
        (f"%{q}%", f"%{q}%", f"%{as_stn}%", f"{q}%", f"{as_stn}%", limit),
    ).fetchall()


# How far from a station exit a stop can be and still count as at the station: across the
# road and a little way along it.
STATION_RADIUS_M = 250


def bus_stops_at_station(station: dict, limit: int = 10) -> list[dict]:
    """The stops within STATION_RADIUS_M of any of a station's exits, nearest first, each
    with its distance from the closest exit."""
    points = station_points(station)
    found = []
    for row in db.execute("SELECT * FROM bus_stops").fetchall():
        distances = [_haversine_meters(lat, lng, row["lat"], row["lng"]) for lat, lng in points]
        distances = [d for d in distances if d is not None]
        if distances and min(distances) <= STATION_RADIUS_M:
            found.append({**dict(row), "distance": min(distances)})
    found.sort(key=lambda s: s["distance"])
    return found[:limit]


def nearest_bus_stops(lat: float, lng: float, limit: int = 8) -> list[dict]:
    """Returns the closest cached bus stops to a given coordinate, nearest first."""
    rows = db.execute("SELECT * FROM bus_stops").fetchall()
    with_distance = []
    for row in rows:
        distance = _haversine_meters(lat, lng, row["lat"], row["lng"])
        if distance is not None:
            item = dict(row)
            item["distance"] = distance
            with_distance.append(item)
    with_distance.sort(key=lambda s: s["distance"])
    return with_distance[:limit]
