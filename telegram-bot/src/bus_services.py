from .db import db
from .lta import fetch_all_bus_services


async def refresh_bus_services() -> int:
    """Downloads the latest bus service list from LTA DataMall and refreshes the local cache."""
    services = await fetch_all_bus_services()
    with db:
        db.executemany(
            """
            INSERT INTO bus_services (service_no, operator, origin_code, destination_code, loop_desc)
            VALUES (:service_no, :operator, :origin_code, :destination_code, :loop_desc)
            ON CONFLICT(service_no) DO UPDATE SET
                operator = excluded.operator,
                origin_code = excluded.origin_code,
                destination_code = excluded.destination_code,
                loop_desc = excluded.loop_desc
            """,
            services,
        )
    return len(services)


def bus_services_count() -> int:
    return db.execute("SELECT COUNT(*) AS n FROM bus_services").fetchone()["n"]


def service_terminals(service_no: str) -> "dict | None":
    """A service's start/end terminal stop codes and its loop description (set only for
    loop services), as reported by LTA's bus service list."""
    row = db.execute(
        "SELECT origin_code, destination_code, loop_desc FROM bus_services WHERE service_no = ?",
        (service_no,),
    ).fetchone()
    return dict(row) if row else None


def is_valid_service(service_no: str) -> bool:
    return db.execute(
        "SELECT 1 FROM bus_services WHERE service_no = ?", (service_no,)
    ).fetchone() is not None
