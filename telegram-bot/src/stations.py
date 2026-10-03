"""MRT and LRT stations and their exits, so a search for "Bedok MRT" or "Senja LRT" can
list the bus stops at the station. LTA names those stops "Bedok Stn", or after a block or
a road, never "MRT", so they're found by how close they are to an exit instead.

The stations come from sgraildata, copied from main-site/api/_nav/rail.json into
rail_stations.json by scripts/vendor-rail.mjs."""

import json
import re
from pathlib import Path

with open(Path(__file__).with_name("rail_stations.json"), encoding="utf-8") as f:
    STATIONS = json.load(f)["stations"]

# "Bedok MRT", "Bedok MRT station", "Senja LRT", "Bedok station". Not "Bedok Stn": that's
# how LTA names stops, so it stays a search of their names.
_STATION_QUERY_RE = re.compile(r"^(?P<name>.+?)\s+(?:(?:mrt|lrt)(?:\s+(?:station|stn))?|station)\.?$", re.I)

# Line code prefixes of the LRT lines: Bukit Panjang, Sengkang and Punggol.
_LRT_PREFIXES = ("BP", "SW", "SE", "STC", "PW", "PE", "PTC")


def _key(name: str) -> str:
    return " ".join(name.casefold().replace("'", "").split())


def find_station(query: str) -> "dict | None":
    """The station a search like "Bedok MRT" asks for: the one of that name, or else the
    only one whose name starts with it ("Botanic MRT"). None for any other search, or one
    that could be several stations."""
    m = _STATION_QUERY_RE.match(query.strip())
    if not m:
        return None
    wanted = _key(m["name"])
    exact = [s for s in STATIONS if _key(s["name"]) == wanted]
    if exact:
        return exact[0]
    starts = [s for s in STATIONS if _key(s["name"]).startswith(wanted)]
    return starts[0] if len(starts) == 1 else None


def station_label(station: dict) -> str:
    """ "Bedok MRT station", "Senja LRT station", or both for an interchange like
    Choa Chu Kang."""
    lrt = any(code.startswith(_LRT_PREFIXES) for code in station["codes"])
    mrt = any(not code.startswith(_LRT_PREFIXES) for code in station["codes"])
    kind = "MRT/LRT" if lrt and mrt else "LRT" if lrt else "MRT"
    return f"{station['name']} {kind} station"


def station_points(station: dict) -> list:
    """Where to measure from: each exit, or the station itself where none are known."""
    return station["exits"] or [[station["lat"], station["lng"]]]
