import math
import sqlite3
from typing import Optional

from .db import db
from .lta import fetch_all_bus_stops


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
    return len(stops)


def bus_stops_count() -> int:
    return db.execute("SELECT COUNT(*) AS n FROM bus_stops").fetchone()["n"]


def get_bus_stop_by_code(code: str) -> Optional[sqlite3.Row]:
    return db.execute("SELECT * FROM bus_stops WHERE code = ?", (code,)).fetchone()


def search_bus_stops(query: str, limit: int = 10) -> list:
    """Search cached bus stops by exact code, code prefix, or a substring of the name/road."""
    q = query.strip().lower()
    if not q:
        return []

    if q.isdigit():
        return db.execute(
            "SELECT * FROM bus_stops WHERE code LIKE ? ORDER BY code LIMIT ?",
            (f"{q}%", limit),
        ).fetchall()

    like = f"%{q}%"
    return db.execute(
        """
        SELECT * FROM bus_stops
        WHERE LOWER(name) LIKE ? OR LOWER(road) LIKE ?
        ORDER BY
            CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
            name
        LIMIT ?
        """,
        (like, like, f"{q}%", limit),
    ).fetchall()


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
