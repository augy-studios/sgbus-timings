"""Where a 6-digit postal code is, from OneMap's address search, so the stops near an
address can be found by its postal code. OneMap still answers without a token, if with a
warning; set ONEMAP_API_TOKEN should it start to insist."""

import re
from typing import Optional

import httpx

from .config import config

POSTAL_CODE_RE = re.compile(r"^\d{6}$")

_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"


def _title_case(text: str) -> str:
    """OneMap writes addresses in capitals: "1 PASIR RIS CLOSE" reads as "1 Pasir Ris Close"."""
    return " ".join(word[:1].upper() + word[1:].lower() for word in text.split())


def _address(hit: dict) -> str:
    blk = hit.get("BLK_NO") if hit.get("BLK_NO") not in (None, "", "NIL") else ""
    road = hit.get("ROAD_NAME") if hit.get("ROAD_NAME") not in (None, "", "NIL") else hit.get("BUILDING", "")
    return _title_case(f"{blk} {road}".strip())


async def lookup_postal_code(code: str) -> Optional[dict]:
    """{postal, address, lat, lng} for a postal code, or None when no address has it.
    Raises httpx.HTTPError when OneMap can't be reached."""
    headers = {"accept": "application/json"}
    if config.onemap_api_token:
        headers["Authorization"] = config.onemap_api_token
    params = {"searchVal": code, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(_SEARCH_URL, params=params, headers=headers)
        r.raise_for_status()
        data = r.json()

    # The search matches addresses as text, so a result only counts on the exact code.
    for hit in data.get("results") or []:
        if hit.get("POSTAL") == code and hit.get("LATITUDE") and hit.get("LONGITUDE"):
            return {
                "postal": code,
                "address": _address(hit),
                "lat": float(hit["LATITUDE"]),
                "lng": float(hit["LONGITUDE"]),
            }
    return None
