from .db import db
from .lta import fetch_all_bus_routes


async def refresh_bus_routes() -> int:
    """Downloads the latest bus route list from LTA DataMall and refreshes the local cache."""
    routes = await fetch_all_bus_routes()
    with db:
        db.execute("DELETE FROM bus_routes")
        db.executemany(
            """
            INSERT INTO bus_routes (
                service_no, direction, stop_sequence, stop_code,
                wd_first, wd_last, sat_first, sat_last, sun_first, sun_last
            )
            VALUES (
                :service_no, :direction, :stop_sequence, :stop_code,
                :wd_first, :wd_last, :sat_first, :sat_last, :sun_first, :sun_last
            )
            """,
            routes,
        )
    return len(routes)


def bus_routes_count() -> int:
    return db.execute("SELECT COUNT(*) AS n FROM bus_routes").fetchone()["n"]


def first_last_bus_times(service_no: str, stop_code: str) -> "dict | None":
    """First/last bus times (HHmm strings) for a service at a given stop, for
    weekdays, Saturdays and Sundays. Uses the lowest-direction row on the rare
    stop served by more than one direction."""
    return db.execute(
        """
        SELECT wd_first, wd_last, sat_first, sat_last, sun_first, sun_last
        FROM bus_routes
        WHERE service_no = ? AND stop_code = ?
        ORDER BY direction
        LIMIT 1
        """,
        (service_no, stop_code),
    ).fetchone()


def stops_for_service(service_no: str) -> list:
    """Bus stops served by a given service, joined with stop details, ordered the way the
    bus travels (direction 1 first, then any stops only served in direction 2)."""
    rows = db.execute(
        """
        SELECT bus_stops.*
        FROM bus_routes
        JOIN bus_stops ON bus_stops.code = bus_routes.stop_code
        WHERE bus_routes.service_no = ?
        ORDER BY bus_routes.direction, bus_routes.stop_sequence
        """,
        (service_no,),
    ).fetchall()
    seen = set()
    stops = []
    for stop in rows:
        if stop["code"] not in seen:
            seen.add(stop["code"])
            stops.append(stop)
    return stops
