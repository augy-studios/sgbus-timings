import re
from datetime import datetime, timezone
from typing import Optional

import httpx

from .config import config

BASE = "https://datamall2.mytransport.sg/ltaodataservice"


async def _lta_get(client: httpx.AsyncClient, pathname: str, params: Optional[dict] = None) -> dict:
    params = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    res = await client.get(
        f"{BASE}{pathname}",
        params=params,
        headers={"AccountKey": config.lta_account_key, "accept": "application/json"},
    )
    if res.status_code != 200:
        raise RuntimeError(f"LTA DataMall request failed ({res.status_code}): {pathname}")
    return res.json()


async def fetch_all_bus_stops() -> list[dict]:
    """Fetch the full bus stop list from LTA DataMall, paginating 500 records at a time."""
    stops: list[dict] = []
    skip = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            data = await _lta_get(client, "/BusStops", {"$skip": skip})
            rows = data.get("value") or []
            if not rows:
                break
            for s in rows:
                stops.append(
                    {
                        "code": s.get("BusStopCode"),
                        "name": s.get("Description"),
                        "road": s.get("RoadName"),
                        "lat": s.get("Latitude"),
                        "lng": s.get("Longitude"),
                    }
                )
            if len(rows) < 500:
                break
            skip += 500
    return stops


async def fetch_all_bus_services() -> list[dict]:
    """Fetch the full bus service list from LTA DataMall, paginating 500 records at a time."""
    services: dict[str, dict] = {}
    skip = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            data = await _lta_get(client, "/BusServices", {"$skip": skip})
            rows = data.get("value") or []
            if not rows:
                break
            for s in rows:
                service_no = s.get("ServiceNo")
                if service_no and service_no not in services:
                    services[service_no] = {"service_no": service_no, "operator": s.get("Operator")}
            if len(rows) < 500:
                break
            skip += 500
    return list(services.values())


async def fetch_all_bus_routes() -> list[dict]:
    """Fetch the full bus route list from LTA DataMall, paginating 500 records at a time.
    Reshaped to (service_no, direction, stop_sequence, stop_code) rows, each carrying the
    first/last bus times (HHmm strings) for weekdays, Saturdays and Sundays."""
    routes: dict[tuple[str, int, str], dict] = {}
    skip = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            data = await _lta_get(client, "/BusRoutes", {"$skip": skip})
            rows = data.get("value") or []
            if not rows:
                break
            for r in rows:
                service_no = r.get("ServiceNo")
                stop_code = r.get("BusStopCode")
                direction = r.get("Direction")
                stop_sequence = r.get("StopSequence")
                if service_no and stop_code and direction is not None and stop_sequence is not None:
                    key = (service_no, int(direction), stop_code)
                    existing = routes.get(key)
                    if existing is None or stop_sequence < existing["stop_sequence"]:
                        routes[key] = {
                            "stop_sequence": stop_sequence,
                            "wd_first": r.get("WD_FirstBus") or None,
                            "wd_last": r.get("WD_LastBus") or None,
                            "sat_first": r.get("SAT_FirstBus") or None,
                            "sat_last": r.get("SAT_LastBus") or None,
                            "sun_first": r.get("SUN_FirstBus") or None,
                            "sun_last": r.get("SUN_LastBus") or None,
                        }
            if len(rows) < 500:
                break
            skip += 500
    return [
        {"service_no": service_no, "direction": direction, "stop_code": stop_code, **fields}
        for (service_no, direction, stop_code), fields in routes.items()
    ]


def _shape_next_bus(nb: Optional[dict]) -> Optional[dict]:
    if not nb or not nb.get("EstimatedArrival"):
        return None
    arrival = datetime.fromisoformat(nb["EstimatedArrival"])
    now = datetime.now(timezone.utc if arrival.tzinfo else None)
    eta_ms = max(0, int((arrival - now).total_seconds() * 1000))
    monitored = nb.get("Monitored") in (1, "1")
    lat = float(nb["Latitude"]) if monitored and nb.get("Latitude") else None
    lng = float(nb["Longitude"]) if monitored and nb.get("Longitude") else None
    bus_type = nb.get("Type")
    return {
        "etaMs": eta_ms,
        "load": nb.get("Load") or None,
        "wheelchair": nb.get("Feature") == "WAB",
        "deck": "Double" if bus_type == "DD" else "Bendy" if bus_type == "BD" else "Single",
        "lat": lat,
        "lng": lng,
        "rough": lat is None or lng is None,
    }


def _natural_sort_key(text: str) -> list:
    """Mirrors JS localeCompare(..., { numeric: true }): numeric chunks compare by value."""
    return [int(chunk) if chunk.isdigit() else chunk for chunk in re.split(r"(\d+)", text)]


async def fetch_arrivals(stop_code: str, service_no: Optional[str] = None) -> dict:
    """Live bus arrival timings for a given bus stop code, reshaped for display."""
    async with httpx.AsyncClient(timeout=15) as client:
        data = await _lta_get(client, "/v3/BusArrival", {"BusStopCode": stop_code, "ServiceNo": service_no})

    services = []
    for svc in data.get("Services") or []:
        nexts = [_shape_next_bus(svc.get(k)) for k in ("NextBus", "NextBus2", "NextBus3")]
        services.append(
            {
                "serviceNo": svc.get("ServiceNo"),
                "operator": svc.get("Operator"),
                "next": nexts[0],
                "next2": nexts[1],
                "next3": nexts[2],
            }
        )

    services.sort(key=lambda s: _natural_sort_key(s["serviceNo"]))

    return {"busStopCode": data.get("BusStopCode") or stop_code, "services": services}
