"""The site's /api/nav and /api/places, which plan /nav's journeys. The bot asks the site
rather than carrying its own router, so a nav reads the same in Telegram as on the web.

With BOT_API_TOKEN set (the same value as in the site's Vercel project), requests carry it,
which lifts the site's per-IP limit: every chat's /nav comes from this one server."""

import httpx

from .config import config
from .http_client import shared_client


class NavError(RuntimeError):
    pass


def _url(path: str) -> str:
    return config.nav_api_url.rstrip("/") + path


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.bot_api_token}"} if config.bot_api_token else {}


async def places(query: str) -> list[dict]:
    """Up to 10 of {kind: station | stop | place, label, sub, lat, lng} for typed text, or the
    one place a Google Maps link, GPS coordinates or a plus code in it points at. One that
    can't be placed, or is outside Singapore, raises NavError with the site's reason (422)."""
    try:
        res = await shared_client().get(_url("/api/places"), params={"q": query}, headers=_headers(), timeout=20)
    except httpx.HTTPError as err:
        raise NavError("Couldn't search for that place right now. Please try again shortly.") from err
    if res.status_code == 422:
        try:
            message = res.json().get("error")
        except ValueError:
            message = None
        raise NavError(message or "Couldn't place that. Please check it and try again.")
    if res.status_code != 200:
        raise NavError("Couldn't search for that place right now. Please try again shortly.")
    return res.json()


async def share_place(place: dict) -> str:
    """A "How to get to" link to a place, /go/<id>, made by the site's /api/share as the web
    app's Share makes them: the same link every time the same place is shared."""
    data = {"label": place["label"][:120], "lat": place["lat"], "lng": place["lng"]}
    try:
        res = await shared_client().post(_url("/api/share"), json={"kind": "place", "data": data}, headers=_headers(), timeout=20)
    except httpx.HTTPError as err:
        raise NavError("Couldn't make a link right now. Please try again shortly.") from err
    if res.status_code != 200:
        raise NavError("Couldn't make a link right now. Please try again shortly.")
    # On the site people open, which NAV_API_URL needn't be.
    return config.webapp_url.rstrip("/") + res.json()["path"]


async def plan(from_point: dict, to_point: dict, when: "dict | None" = None) -> dict:
    """{options: [...], onemap: bool, alerts: {lines}, when}, quickest option first. `when`
    is a picked time (when.py), None for Leave now."""
    params = {
        "from": f"{from_point['lat']:.5f},{from_point['lng']:.5f}",
        "to": f"{to_point['lat']:.5f},{to_point['lng']:.5f}",
        **({"when": when["mode"], "at": when["at"]} if when else {}),
    }
    try:
        res = await shared_client().get(_url("/api/nav"), params=params, headers=_headers(), timeout=60)
    except httpx.HTTPError as err:
        raise NavError("Couldn't plan that right now. Please try again shortly.") from err
    if res.status_code != 200:
        try:
            message = res.json().get("error")
        except ValueError:
            message = None
        raise NavError(message or "Couldn't plan that right now. Please try again shortly.")
    return res.json()
