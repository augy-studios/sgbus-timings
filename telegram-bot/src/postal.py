"""Where a 6-digit postal code is, from OneMap's address search, so the stops near an
address can be found by its postal code.

With ONEMAP_EMAIL and ONEMAP_PASSWORD set, searches carry a OneMap token, fetched with
them and reused until it runs out - three days, per OneMap. Without them, or when the
token can't be had, the search goes without one, which OneMap still answers."""

import asyncio
import re
import time
from typing import Optional

import httpx

from .config import config
from .http_client import shared_client

POSTAL_CODE_RE = re.compile(r"^\d{6}$")

_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
_TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"
# A token is renewed this long before it runs out, so no search goes out on one that
# lapses on the way.
_TOKEN_MARGIN_S = 3600
_TOKEN_LIFETIME_S = 3 * 24 * 3600

_token = {"value": None, "expires": 0.0}
_token_lock = asyncio.Lock()


async def _get_token(client: httpx.AsyncClient, renew: bool = False) -> Optional[str]:
    """The OneMap token, fetched when there's none yet, it's about to run out, or `renew`
    says the last one was turned away. None without credentials, or when OneMap won't
    give one - bad credentials say so in the log, and the search goes on without."""
    if not (config.onemap_email and config.onemap_password):
        return None
    async with _token_lock:
        if renew or not _token["value"] or time.time() > _token["expires"] - _TOKEN_MARGIN_S:
            try:
                r = await client.post(
                    _TOKEN_URL, json={"email": config.onemap_email, "password": config.onemap_password}
                )
                r.raise_for_status()
                data = r.json()
                _token["value"] = data["access_token"]
                # expiry_timestamp is Unix seconds, as a string.
                _token["expires"] = float(data.get("expiry_timestamp") or time.time() + _TOKEN_LIFETIME_S)
            except (httpx.HTTPError, KeyError, ValueError) as err:
                print(f"[onemap] couldn't get a token, searching without one: {err}")
                _token["value"], _token["expires"] = None, 0.0
        return _token["value"]


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
    params = {"searchVal": code, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1}
    client = shared_client()

    async def search(token):
        headers = {"accept": "application/json", **({"Authorization": token} if token else {})}
        return await client.get(_SEARCH_URL, params=params, headers=headers, timeout=15)

    token = await _get_token(client)
    r = await search(token)
    # A token OneMap has stopped taking before its expiry: one more try on a new one.
    if token and r.status_code in (401, 403):
        r = await search(await _get_token(client, renew=True))
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
