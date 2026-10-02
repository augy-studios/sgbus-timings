"""The site's /api/nav and /api/places, which plan /nav's journeys. The bot asks the site
rather than carrying its own router, so a nav reads the same in Telegram as on the web.

With BOT_API_TOKEN set (the same value as in the site's Vercel project), requests carry it,
which lifts the site's per-IP limit: every chat's /nav comes from this one server."""

import httpx

from .config import config


class NavError(RuntimeError):
    pass


def _url(path: str) -> str:
    return config.nav_api_url.rstrip("/") + path


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.bot_api_token}"} if config.bot_api_token else {}


async def places(query: str) -> list[dict]:
    """Up to 10 of {kind: station | stop | place, label, sub, lat, lng} for typed text."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(_url("/api/places"), params={"q": query}, headers=_headers())
    except httpx.HTTPError as err:
        raise NavError("Couldn't search for that place right now. Please try again shortly.") from err
    if res.status_code != 200:
        raise NavError("Couldn't search for that place right now. Please try again shortly.")
    return res.json()


async def plan(from_point: dict, to_point: dict) -> dict:
    """{options: [...], onemap: bool, alerts: {lines}}, quickest option first."""
    params = {
        "from": f"{from_point['lat']:.5f},{from_point['lng']:.5f}",
        "to": f"{to_point['lat']:.5f},{to_point['lng']:.5f}",
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.get(_url("/api/nav"), params=params, headers=_headers())
    except httpx.HTTPError as err:
        raise NavError("Couldn't plan that right now. Please try again shortly.") from err
    if res.status_code != 200:
        try:
            message = res.json().get("error")
        except ValueError:
            message = None
        raise NavError(message or "Couldn't plan that right now. Please try again shortly.")
    return res.json()
