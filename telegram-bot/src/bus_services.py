from .db import db
from .lta import fetch_all_bus_services


async def refresh_bus_services() -> int:
    """Downloads the latest bus service list from LTA DataMall and refreshes the local cache."""
    services = await fetch_all_bus_services()
    with db:
        db.executemany(
            """
            INSERT INTO bus_services (service_no, operator)
            VALUES (:service_no, :operator)
            ON CONFLICT(service_no) DO UPDATE SET operator = excluded.operator
            """,
            services,
        )
    return len(services)


def bus_services_count() -> int:
    return db.execute("SELECT COUNT(*) AS n FROM bus_services").fetchone()["n"]


def is_valid_service(service_no: str) -> bool:
    return db.execute(
        "SELECT 1 FROM bus_services WHERE service_no = ?", (service_no,)
    ).fetchone() is not None
