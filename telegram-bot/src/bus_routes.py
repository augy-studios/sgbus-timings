from .db import db
from .lta import _natural_sort_key, fetch_all_bus_routes


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


def route_terminals(service_no: str) -> dict:
    """First and last stop code of the outbound direction, plus how many directions the
    service runs, derived from the cached route. Used to tell a one-way service from a
    two-way one, and as a fallback when LTA's service list has no origin/destination."""
    rows = db.execute(
        """
        SELECT direction, stop_code
        FROM bus_routes
        WHERE service_no = ?
        ORDER BY direction, stop_sequence
        """,
        (service_no,),
    ).fetchall()
    if not rows:
        return {}

    outbound = [row for row in rows if row["direction"] == rows[0]["direction"]]
    return {
        "origin_code": outbound[0]["stop_code"],
        "destination_code": outbound[-1]["stop_code"],
        "directions": len({row["direction"] for row in rows}),
    }


def stops_for_service(service_no: str, single_direction: bool = False, reverse: bool = False) -> list:
    """Bus stops served by a given service, joined with stop details, ordered the way the
    bus travels (direction 1 first, then any stops only served in direction 2).
    Pass `reverse=True` to walk the route the other way round, the return direction first -
    a no-op for the one-directional services, which have nothing to swap to.
    Pass `single_direction=True` for just the direction the ordering starts with, i.e. one
    run of the route from end to end."""
    leading_direction = "MAX" if reverse else "MIN"
    direction_filter = (
        f"AND bus_routes.direction = "
        f"(SELECT {leading_direction}(direction) FROM bus_routes WHERE service_no = ?)"
        if single_direction
        else ""
    )
    rows = db.execute(
        f"""
        SELECT bus_stops.*
        FROM bus_routes
        JOIN bus_stops ON bus_stops.code = bus_routes.stop_code
        WHERE bus_routes.service_no = ? {direction_filter}
        ORDER BY bus_routes.direction {"DESC" if reverse else "ASC"}, bus_routes.stop_sequence
        """,
        (service_no, service_no) if single_direction else (service_no,),
    ).fetchall()
    seen = set()
    stops = []
    for stop in rows:
        if stop["code"] not in seen:
            seen.add(stop["code"])
            stops.append(stop)
    return stops


def services_for_stop(stop_code: str) -> list:
    """Every bus service that visits a given stop, in bus-number order. Comes from the
    cached route list rather than live arrivals, so a service that isn't running right
    now is still listed."""
    rows = db.execute(
        "SELECT DISTINCT service_no FROM bus_routes WHERE stop_code = ?", (stop_code,)
    ).fetchall()
    return sorted((row["service_no"] for row in rows), key=_natural_sort_key)


def stops_onward_from(service_no: str, stop_code: str, reverse: bool = False) -> tuple:
    """The stops a service still has to call at from a given stop, that stop first and its
    terminus last, following a single direction. `reverse` picks the return direction, as
    it does everywhere else; if the stop isn't on that direction's run the other one is
    used instead, since a stop served one way only would otherwise come back empty.
    Returns (stops, reverse) - the direction actually used, so callers can carry it on."""
    for direction in (reverse, not reverse):
        stops = stops_for_service(service_no, single_direction=True, reverse=direction)
        codes = [stop["code"] for stop in stops]
        if stop_code in codes:
            return stops[codes.index(stop_code) :], direction
    return [], reverse
