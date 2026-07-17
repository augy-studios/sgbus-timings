from .db import db
from .lta import fetch_all_bus_routes


async def refresh_bus_routes() -> int:
    """Downloads the latest bus route list from LTA DataMall and refreshes the local cache."""
    routes = await fetch_all_bus_routes()
    with db:
        db.execute("DELETE FROM bus_routes")
        db.executemany(
            "INSERT INTO bus_routes (service_no, stop_code) VALUES (:service_no, :stop_code)",
            routes,
        )
    return len(routes)


def bus_routes_count() -> int:
    return db.execute("SELECT COUNT(*) AS n FROM bus_routes").fetchone()["n"]


def stops_for_service(service_no: str) -> list:
    """Bus stops served by a given service, joined with stop details, ordered by name."""
    return db.execute(
        """
        SELECT bus_stops.*
        FROM bus_routes
        JOIN bus_stops ON bus_stops.code = bus_routes.stop_code
        WHERE bus_routes.service_no = ?
        ORDER BY bus_stops.name
        """,
        (service_no,),
    ).fetchall()
