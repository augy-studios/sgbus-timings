"""/sync: this chat's favourites, places, routines, calendar link and pin settings, with the web
app or the Android app, by the code its Settings shows under Sync with the Telegram bot.

The bot can't join the direct channel two devices sync over, so this goes through the site's
relay (main-site/api/sync.js), which holds it 10 minutes at most: the bot joins with the code
and says what it has, then saves whatever the device sends, until the device ends it, the bot
is told /sync stop, or the time's up. The messages are the web app's (main-site/js/sync.js):

    {type: "favs", favs, kinds}   what the bot has, and the kinds it keeps
    {type: "add", id, favs}       from the device: save these
    {type: "added", id, count}    the answer, with how many were new
    {type: "bye"}                 the device ended it

Copying only adds, as on the web, except where there's one of a thing (your name, your
birthday, the calendar's link, a pin setting), where the device's replaces the bot's. Home and
Work are only filled where they aren't set."""

import asyncio
import re
import time

import httpx

from .bus_stops import get_bus_stop_by_code
from .calendar_events import get_link, set_link
from .config import config
from .favourite_buses import add_favourite_bus, is_favourite_bus, list_favourite_buses
from .favourite_prefs import get_pref, set_pref
from .favourite_routes import add_favourite_route, is_favourite_route, list_favourite_routes
from .favourites import add_favourite, is_favourite, list_favourites
from .http_client import shared_client
from .navs import is_favourite_nav, list_favourite_navs, toggle_favourite_nav
from .routines import add_routine, join_services, list_routines, split_services
from .saved_places import add_place, custom_count, get_place, list_places, set_place, MAX_CUSTOM
from .user_settings import (
    get_birthday,
    get_clock_times,
    get_display_name,
    get_has_bike,
    set_birthday,
    set_clock_times,
    set_display_name,
    set_has_bike,
)

# What the bot keeps, as js/sync.js names them. No trips, past searches or last bus
# reminders, and of the settings only where favourites pin, whether you have a bike and how
# bus times show.
KINDS = ["profile", "stop", "bus", "route", "nav", "place", "routine", "calendar", "setting:pin.stop", "setting:pin.bus", "setting:bike", "setting:bus.times"]

# The sync code, as js/p2p.js makes them.
CODE_RE = re.compile(r"^[BCDFGHJKLMNPQRSTVWXYZ23456789]{6}$")
POLL_S = 2
# Polls in a row that fail before the bot gives up.
MAX_FAILS = 5
MAX_ITEMS = 500
MAX_ROUTINES = 20

_BUS_RE = re.compile(r"^[0-9A-Z]{1,5}$")
# A routine's buses can also be a wildcard, "22*" (routines.service_wanted).
_ROUTINE_BUS_RE = re.compile(r"^[0-9A-Z]{1,5}$|^[0-9A-Z]{1,3}\*$")
_STOP_RE = re.compile(r"^\d{5}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^([01]\d|2[0-3])[0-5]\d$")
_CAL_RE = re.compile(r"^(https|webcals?)://[^\s/]+\.[^\s]+$", re.IGNORECASE)

# A sync running per chat.
_sessions: "dict[int, asyncio.Task]" = {}


class SyncError(RuntimeError):
    pass


def normalise_code(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())[:6]


# ---------- what the bot has ----------


def own_favs(chat_id: int) -> dict:
    """This chat's, in the web app's shapes (js/sync.js's ownFavs)."""
    name = get_display_name(chat_id, "")
    birthday = get_birthday(chat_id)
    link = get_link(chat_id)
    return {
        "profile": [
            *([{"field": "name", "value": name}] if name else []),
            *([{"field": "birthday", "value": birthday}] if birthday and _DATE_RE.match(birthday) else []),
        ],
        "stops": [{"code": r["code"], "name": r["name"]} for r in list_favourites(chat_id)],
        "buses": [r["service_no"] for r in list_favourite_buses(chat_id)],
        "routes": [
            {"start": r["start_code"], "startName": r["start_name"], "end": r["end_code"], "endName": r["end_name"]}
            for r in list_favourite_routes(chat_id)
        ],
        "navs": [
            {
                "from": {"label": r["from_label"], "lat": r["from_lat"], "lng": r["from_lng"]},
                "to": {"label": r["to_label"], "lat": r["to_lat"], "lng": r["to_lng"]},
            }
            for r in list_favourite_navs(chat_id)
        ],
        "places": [
            {
                "key": p["kind"] if p["kind"] in ("home", "work") else "place",
                "name": "" if p["kind"] in ("home", "work") or p["name"] == p["label"] else p["name"],
                "label": p["label"], "lat": p["lat"], "lng": p["lng"],
                **({"stop": p["stop"]} if p.get("stop") else {}),
            }
            for p in list_places(chat_id)
        ],
        "routines": [
            {
                "code": r["stop_code"], "name": r["stop_name"], "buses": split_services(r["services"]),
                "time": f"{r['hour']:02d}{r['minute']:02d}", "days": sorted(int(d) for d in r["days"].split(",") if d),
            }
            for r in list_routines(chat_id)
        ],
        "calendar": [{"url": link["url"]}] if link else [],
        # As on the web: only a setting changed from how it starts.
        "settings": [{"field": f"pin.{kind}", "value": "bottom"} for kind in ("stop", "bus") if get_pref(chat_id, kind) == "bottom"]
        + ([{"field": "bike", "value": "on"}] if get_has_bike(chat_id) else [])
        + ([{"field": "bus.times", "value": "clock"}] if get_clock_times(chat_id) else []),
    }


# ---------- saving what the device sends ----------


def _text(v, n=80) -> str:
    return v.strip()[:n] if isinstance(v, str) else ""


def _point(p) -> bool:
    return (
        isinstance(p, dict) and isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lng"), (int, float))
        and 1.15 < p["lat"] < 1.5 and 103.55 < p["lng"] < 104.1
    )


def _list(raw, key) -> list:
    v = raw.get(key) if isinstance(raw, dict) else None
    return v[:MAX_ITEMS] if isinstance(v, list) else []


def _stop_name(code: str, given) -> str:
    stop = get_bus_stop_by_code(code)
    return stop["name"] if stop else (_text(given) or code)


def merge(chat_id: int, favs: dict) -> dict:
    """Saves whichever of `favs` this chat doesn't have, checked field by field, as they're
    from another machine. Answers how many of each kind were saved, by js/sync.js's labels."""
    saved = {}

    def count(label):
        saved[label] = saved.get(label, 0) + 1

    for p in _list(favs, "profile"):
        if not isinstance(p, dict):
            continue
        if p.get("field") == "name" and _text(p.get("value"), 64) and _text(p.get("value"), 64) != get_display_name(chat_id, ""):
            set_display_name(chat_id, _text(p["value"], 64))
            count("your name")
        elif p.get("field") == "birthday" and isinstance(p.get("value"), str) and _DATE_RE.match(p["value"]) and p["value"] != get_birthday(chat_id):
            set_birthday(chat_id, p["value"])
            count("your birthday")

    for s in _list(favs, "stops"):
        code = s.get("code") if isinstance(s, dict) else None
        if isinstance(code, str) and _STOP_RE.match(code) and not is_favourite(chat_id, code):
            add_favourite(chat_id, code, _stop_name(code, s.get("name")))
            count("stop")

    for b in _list(favs, "buses"):
        if isinstance(b, str) and _BUS_RE.match(b) and not is_favourite_bus(chat_id, b):
            add_favourite_bus(chat_id, b)
            count("bus")

    for r in _list(favs, "routes"):
        if not isinstance(r, dict):
            continue
        start, end = r.get("start"), r.get("end")
        if isinstance(start, str) and isinstance(end, str) and _STOP_RE.match(start) and _STOP_RE.match(end) and not is_favourite_route(chat_id, start, end):
            add_favourite_route(chat_id, start, _stop_name(start, r.get("startName")), end, _stop_name(end, r.get("endName")))
            count("route")

    for n in _list(favs, "navs"):
        if not isinstance(n, dict) or not _point(n.get("from")) or not _point(n.get("to")):
            continue
        a = {"label": _text(n["from"].get("label")) or "Place", "lat": n["from"]["lat"], "lng": n["from"]["lng"]}
        b = {"label": _text(n["to"].get("label")) or "Place", "lat": n["to"]["lat"], "lng": n["to"]["lng"]}
        if not is_favourite_nav(chat_id, a, b):
            toggle_favourite_nav(chat_id, a, b)
            count("nav")

    have = {(round(p["lat"], 5), round(p["lng"], 5)) for p in list_places(chat_id) if p["kind"] not in ("home", "work")}
    for p in _list(favs, "places"):
        if not _point(p) or not _text(p.get("label"), 120):
            continue
        stop = p.get("stop") if isinstance(p.get("stop"), str) and _STOP_RE.match(p["stop"]) else None
        if p.get("key") in ("home", "work"):
            if not get_place(chat_id, p["key"]):
                set_place(chat_id, p["key"], _text(p["label"], 120), p["lat"], p["lng"], stop)
                count("place")
        elif (round(p["lat"], 5), round(p["lng"], 5)) not in have and custom_count(chat_id) < MAX_CUSTOM:
            have.add((round(p["lat"], 5), round(p["lng"], 5)))
            add_place(chat_id, _text(p["label"], 120), p["lat"], p["lng"], stop, _text(p.get("name"), 40))
            count("place")

    def routine_key(code, hour, minute, days, buses):
        return (code, hour, minute, tuple(sorted(days)), tuple(sorted(buses)))

    existing = list_routines(chat_id)
    have_routines = {
        routine_key(r["stop_code"], r["hour"], r["minute"], [int(d) for d in r["days"].split(",") if d], split_services(r["services"]))
        for r in existing
    }
    room = MAX_ROUTINES - len(existing)
    for r in _list(favs, "routines"):
        if room <= 0 or not isinstance(r, dict):
            break
        code, at, days, buses = r.get("code"), r.get("time"), r.get("days"), r.get("buses")
        if not (isinstance(code, str) and _STOP_RE.match(code) and isinstance(at, str) and _TIME_RE.match(at)):
            continue
        if not (isinstance(days, list) and days and all(isinstance(d, int) and 1 <= d <= 7 for d in days)):
            continue
        if not (isinstance(buses, list) and len(buses) <= 20 and all(isinstance(x, str) and _ROUTINE_BUS_RE.match(x) for x in buses)):
            continue
        hour, minute = int(at[:2]), int(at[2:])
        key = routine_key(code, hour, minute, set(days), set(buses))
        if key in have_routines:
            continue
        have_routines.add(key)
        add_routine(chat_id, hour, minute, ",".join(str(d) for d in sorted(set(days))), code, _stop_name(code, r.get("name")), join_services(sorted(set(buses))))
        room -= 1
        count("routine")

    # Only its form here: fetch_calendar checks where it goes each time it's read, without
    # this holding the bot up looking the host up.
    for c in _list(favs, "calendar")[:1]:
        url = c.get("url") if isinstance(c, dict) else None
        if not (isinstance(url, str) and len(url) <= 2000 and _CAL_RE.match(url)):
            continue
        url = re.sub(r"^webcals?://", "https://", url, flags=re.IGNORECASE)
        link = get_link(chat_id)
        if not link or link["url"] != url:
            set_link(chat_id, url)
            count("your calendar link")

    for s in _list(favs, "settings"):
        if not isinstance(s, dict):
            continue
        if s.get("field") == "bike" and s.get("value") in ("on", "off"):
            if get_has_bike(chat_id) != (s["value"] == "on"):
                set_has_bike(chat_id, s["value"] == "on")
                count("setting")
            continue
        if s.get("field") == "bus.times" and s.get("value") in ("mins", "clock"):
            if get_clock_times(chat_id) != (s["value"] == "clock"):
                set_clock_times(chat_id, s["value"] == "clock")
                count("setting")
            continue
        kind = {"pin.stop": "stop", "pin.bus": "bus"}.get(s.get("field"))
        if kind and s.get("value") in ("top", "bottom") and get_pref(chat_id, kind) != s["value"]:
            set_pref(chat_id, kind, s["value"])
            count("setting")

    return saved


def saved_text(saved: dict) -> str:
    """ "2 stops, 1 routine and your name"."""
    plurals = {"bus": "buses"}
    parts = [
        label if label.startswith("your ") else f"{n} {label if n == 1 else plurals.get(label, label + 's')}"
        for label, n in saved.items()
    ]
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"


# ---------- the relay ----------


def _url() -> str:
    return config.nav_api_url.rstrip("/") + "/api/sync"


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.bot_api_token}"}


async def _post(body: dict) -> "dict | None":
    res = await shared_client().post(_url(), json=body, headers=_headers(), timeout=20)
    if res.status_code == 404:
        raise SyncError("not found")
    if res.status_code == 503:
        raise SyncError("not set up")
    res.raise_for_status()
    return res.json() if res.status_code == 200 else None


async def _send(code: str, message: dict) -> None:
    await _post({"op": "send", "code": code, "message": message})


async def join(code: str, chat_id: int) -> int:
    """Joins the device's sync with what this chat has; answers when it ends, in ms."""
    data = await _post({"op": "join", "code": code, "message": {"type": "favs", "favs": own_favs(chat_id), "kinds": KINDS}})
    return int(data["expiresAt"])


async def run(client, chat_id: int, code: str, expires_at: int) -> None:
    """Saves what the device sends until it ends the sync, or the time runs out."""
    fails = 0
    try:
        while time.time() * 1000 < expires_at:
            await asyncio.sleep(POLL_S)
            try:
                res = await shared_client().get(_url(), params={"code": code}, headers=_headers(), timeout=20)
                res.raise_for_status()
                data = res.json()
                fails = 0
            except (httpx.HTTPError, ValueError):
                fails += 1
                if fails >= MAX_FAILS:
                    await client.send_message(chat_id, "🔄 Lost touch with the sync. Start it again on your device, and send me the new code.")
                    return
                continue
            for message in data.get("messages") or []:
                if not isinstance(message, dict):
                    continue
                if message.get("type") == "bye":
                    await client.send_message(chat_id, "🔄 Your device ended the sync.")
                    return
                if message.get("type") == "add" and isinstance(message.get("id"), int):
                    saved = merge(chat_id, message.get("favs") or {})
                    total = sum(saved.values())
                    await _send(code, {"type": "added", "id": message["id"], "count": total})
                    if total:
                        await _send(code, {"type": "favs", "favs": own_favs(chat_id), "kinds": KINDS})
                        await client.send_message(chat_id, f"🔄 Saved from your device: {saved_text(saved)}.")
                    else:
                        await client.send_message(chat_id, "🔄 Your device sent things I already have.")
            if not data.get("open"):
                await client.send_message(chat_id, "🔄 Your device ended the sync.")
                return
        await _post({"op": "leave", "code": code})
        await client.send_message(chat_id, "🔄 The sync ended after 10 minutes. Start it again on your device for more.")
    except asyncio.CancelledError:
        try:
            await _post({"op": "leave", "code": code})
        except (httpx.HTTPError, SyncError):
            pass
        raise
    except (httpx.HTTPError, SyncError):
        await client.send_message(chat_id, "🔄 Lost touch with the sync. Start it again on your device, and send me the new code.")
    finally:
        if _sessions.get(chat_id) is asyncio.current_task():
            del _sessions[chat_id]


def stop(chat_id: int) -> bool:
    """Ends this chat's sync, if one's running. True if it was."""
    task = _sessions.pop(chat_id, None)
    if not task:
        return False
    task.cancel()
    return True


def start(client, chat_id: int, code: str, expires_at: int) -> None:
    stop(chat_id)
    _sessions[chat_id] = asyncio.create_task(run(client, chat_id, code, expires_at))
