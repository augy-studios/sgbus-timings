"""Live trips in the bot, each shown as one live widget (trip_widget.py) that the person on the
trip and everyone following it share.

Every trip here is a live ETA link (the site's api/_lib/share-links.js, kind eta), by its id:

- One started here, with Start trip under a way in /nav: the bot makes the trip's ETA link and
  gives the site the trip to follow (api/push/trips/<id>, with no push subscription, which only
  the bot may do). The site's cron moves it on each minute, by the clock and where LTA says the
  bus is, and keeps the link updated (api/push/trip-poll.js), as it does for the web app in the
  background. Share sends a t.me/<bot>?start=eta_<id> link, with the web link as well.
- One the web app shares, opened here from that link (the /eta page's Follow in Telegram).

Either way the bot reads the link every POLL_SECONDS and edits the shared widget once, for every
message showing it. It sends the person on the trip their Get Off Alert, from the link, as the
site would push it; and tells everyone following when they've arrived.

Widgets only go to private chats for now (Telegram's rule in production), so a trip is followed
in each person's own chat with the bot."""

import asyncio
import json
import math
import secrets
import time
import traceback
from urllib.parse import quote

import httpx

from . import bot_api
from .buttons import make_button
from .config import config
from .db import db
from .http_client import shared_client
from .nav_view import _place_name
from .route_shapes import colour_of, shapes_for_link, shapes_for_trip
from . import coins, feats, rides
from .trip_widget import OWNER_CHAT_DATA, caption, public_data, widget_html

# As the site's api/_push/trip.js: the Get Off Alert comes this many stops before the stop.
ALERT_STOPS = 2
POLL_SECONDS = 30
# How often Telegram's apps fetch the widget's shared state while one's on screen.
CACHE_TIME = 15
# A walk shorter than this isn't a part of its own (js/nav.js, WALK_LEG_MIN_M).
WALK_MIN_M = 60

_username = "sgbus_app"
_task: "asyncio.Task | None" = None


class TripError(RuntimeError):
    pass


def _now_ms() -> int:
    return int(time.time() * 1000)


def _site(path: str) -> str:
    return config.nav_api_url.rstrip("/") + path


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.bot_api_token}"} if config.bot_api_token else {}


def eta_url(eta_id: str) -> str:
    return config.webapp_url.rstrip("/") + f"/eta/{eta_id}"


def follow_link(eta_id: str) -> str:
    return f"https://t.me/{_username}?start=eta_{eta_id}"


# ---------- the trip, from a way in /nav ----------

def _pt(p) -> "list | None":
    if not p or p.get("lat") is None or p.get("lng") is None:
        return None
    return [round(float(p["lat"]), 6), round(float(p["lng"]), 6)]


def _exit_point(p, exit_) -> dict:
    if exit_ and exit_.get("lat") is not None and exit_.get("lng") is not None:
        return {**(p or {}), "lat": exit_["lat"], "lng": exit_["lng"]}
    return p or {}


def trip_parts(option: dict, start: dict, end: dict) -> list:
    """The trip's parts as the site follows them (api/_push/validate.js, parseTrip), from one of
    /api/nav's ways: the same as tripFromNav in js/nav.js. A short walk (under WALK_MIN_M) isn't
    a part, its minutes going to the part before."""
    src = option.get("legs") or []
    parts = []
    for k, l in enumerate(src):
        last = k == len(src) - 1
        if l.get("mode") == "walk":
            a = _pt(start) if k == 0 else _pt(_exit_point(l.get("from") or src[k - 1].get("to"), l.get("fromExit")))
            b = _pt(end) if last else _pt(_exit_point(l.get("to"), l.get("toExit")))
            metres = l.get("metres")
            minutes = l.get("minutes") or 0
            if a and b and (WALK_MIN_M if metres is None else metres) >= WALK_MIN_M:
                to_exit = (l.get("toExit") or {}).get("name")
                to = end.get("label") if last else _place_name(l.get("to")) + (f", Exit {to_exit}" if to_exit else "")
                parts.append({"kind": "walk", "label": "Walk", "to": (to or "the next stop")[:120], "points": [a, b],
                              "minutes": max(1, round(minutes or 1)), "wait": 0, "walkAfter": 0})
            elif parts:
                parts[-1]["walkAfter"] = min(120, parts[-1]["walkAfter"] + minutes)
            continue
        path = l.get("path") or []
        if len(path) < 2 or l.get("mode") not in ("bus", "train"):
            continue
        route = str(l.get("route") or "")
        campus = l.get("campus")
        if campus:
            label = f"{campus.get('name', '')} shuttle {route}".strip()
        elif l["mode"] == "bus":
            label = f"Bus {route}"
        else:
            label = f"{route} LRT" if l.get("lrt") else f"{route} Line"
        part = {
            "kind": l["mode"], "label": label[:40], "to": (_place_name(l.get("to")) or "the next stop")[:120],
            "points": [[float(p[0]), float(p[1])] for p in path[:200]],
            "minutes": min(300, l.get("minutes") or 0), "wait": min(60, l.get("wait") or 0), "walkAfter": 0,
        }
        frm, to = l.get("from") or {}, l.get("to") or {}
        if l["mode"] == "bus" and not campus and frm.get("code") and to.get("code"):
            part.update(service=route, board=frm["code"], alight=to["code"], boardName=(frm.get("name") or "")[:80])
        parts.append(part)
    if not parts:
        raise TripError("There's nothing on this way to follow. Pick a way with a bus or train.")
    if len(parts) > 12:
        raise TripError("This way has too many parts to follow as a trip.")
    return parts


def first_eta(name: str, end: dict, parts: list, minutes: float, now: int) -> dict:
    """The ETA link's first progress, before the site's cron has moved the trip on."""
    first = parts[0]
    return {
        "name": name[:64],
        "to": {"label": end["label"][:120], "lat": end["lat"], "lng": end["lng"]},
        "arriveAt": now + round(minutes * 60000),
        "leg": {"label": first["label"], "to": first["to"], "stopsLeft": len(first["points"]) - 1, "kind": first["kind"]},
        "legIndex": 0,
        "legCount": len(parts),
        "at": first["points"][0],
        "path": [p for part in parts for p in part["points"]][:400],
        "ended": False,
    }


def server_trip(trip_id: str, parts: list, share: dict, now: int) -> dict:
    """What api/push/trips/<id> takes, for the cron to follow (api/_push/validate.js, parseTrip)."""
    return {
        "tripId": trip_id,
        "subscription": {"bot": True},
        "legs": parts,
        "leg": 0, "at": 0, "pos": 0,
        "legStartedAt": now, "seenAt": now,
        "alerted": [False] * len(parts),
        "readied": [False] * len(parts),
        "share": share,
        "clockRuns": True,
    }


# ---------- the site ----------

async def _site_call(method: str, path: str, **kw) -> httpx.Response:
    try:
        return await shared_client().request(method, _site(path), headers=_headers(), timeout=20, **kw)
    except httpx.HTTPError as err:
        raise TripError("Couldn't reach SG Bus Timings just now. Please try again shortly.") from err


async def read_link(eta_id: str) -> "dict | None":
    """{kind, data, updatedAt} for a share link, or None once it's gone (404)."""
    res = await _site_call("GET", "/api/share", params={"id": eta_id})
    if res.status_code == 404:
        return None
    if res.status_code != 200:
        raise TripError("Couldn't read that trip just now. Please try again shortly.")
    return res.json()


# ---------- the rows ----------

def get_trip(eta_id: str):
    return db.execute("SELECT * FROM trip_widgets WHERE eta_id = ?", (eta_id,)).fetchone()


def own_live_trip(chat_id: int):
    return db.execute(
        "SELECT * FROM trip_widgets WHERE owner_chat = ? AND status = 'live' ORDER BY created_at DESC LIMIT 1", (chat_id,)
    ).fetchone()


def messages(eta_id: str) -> list:
    return db.execute("SELECT * FROM trip_widget_messages WHERE eta_id = ?", (eta_id,)).fetchall()


def _save_message(eta_id: str, chat_id: int, message_id: int, own: bool) -> None:
    with db:
        db.execute(
            """INSERT INTO trip_widget_messages (eta_id, chat_id, message_id, own) VALUES (?, ?, ?, ?)
               ON CONFLICT(eta_id, chat_id) DO UPDATE SET message_id = excluded.message_id, own = excluded.own""",
            (eta_id, chat_id, message_id, int(own)),
        )


# ---------- the buttons under the widget ----------

def owner_buttons(eta_id: str, to_label: str) -> list:
    text = f"Follow my trip to {to_label} live in Telegram. Not on Telegram? {eta_url(eta_id)}"
    share = f"https://t.me/share/url?url={quote(follow_link(eta_id), safe='')}&text={quote(text, safe='')}"
    return [
        [("📤 Share this trip", {"url": share})],
        [("🔄 Refresh", make_button("trip_refresh", {"eta": eta_id})), ("🏁 End trip", make_button("trip_end", {"eta": eta_id}))],
    ]


def follower_buttons(eta_id: str) -> list:
    return [
        [("🗺 Follow on the map", {"url": eta_url(eta_id)})],
        [("🔄 Refresh", make_button("trip_refresh", {"eta": eta_id})), ("✖️ Stop following", make_button("trip_unfollow", {"eta": eta_id}))],
    ]


def _parts_of(row) -> "list | None":
    return json.loads(row["parts_json"]) if row and row["parts_json"] else None


def _routes_of(row) -> "list | None":
    """The trip's parts for the widget's map, each {"c": colour, "p": points}: the way they
    really go once it's been worked out (route_shapes.py), the stops in straight lines till then."""
    if row and row["shapes_json"]:
        return json.loads(row["shapes_json"])
    if not row or not row["trip_json"]:
        return None
    return [{"c": colour_of(l["kind"], l.get("label", "")), "p": l["points"]} for l in json.loads(row["trip_json"])["legs"]]


# The shapes being worked out, kept so they aren't dropped half way.
_shaping: set = set()


def _shape_later(eta_id: str, work) -> None:
    """Works out a trip's way in the background (route_shapes.py), then redraws its map."""
    async def run():
        try:
            shapes = await work
            if shapes:
                with db:
                    db.execute("UPDATE trip_widgets SET shapes_json = ? WHERE eta_id = ?", (json.dumps(shapes), eta_id))
                await refresh(eta_id)
        except Exception as err:
            print(f"[bot_trips] the way for {eta_id} wasn't worked out: {err}")
    task = asyncio.get_event_loop().create_task(run())
    _shaping.add(task)
    task.add_done_callback(_shaping.discard)


def _data(eta: dict, row, rev: int, updated: int, gone: bool = False) -> str:
    return public_data(eta, rev, updated, _parts_of(row), gone=gone, routes=_routes_of(row))


def _state(eta: dict, row, updated: int, gone: bool = False) -> str:
    """The widget's state for the trip, revision left at 0, to tell whether anything changed."""
    return _data(eta, row, 0, updated, gone)


# ---------- starting, following, ending ----------

async def start_trip(chat_id: int, name: str, start: dict, end: dict, option: dict, via: "dict | None" = None) -> str:
    """Starts a trip on one of /nav's ways, and sends its widget. Answers the ETA link's id.
    A trip already going in this chat ends first: one trip at a time, as in the web app."""
    if not config.bot_api_token:
        raise TripError("Live trips aren't set up on this bot yet.")
    old = own_live_trip(chat_id)
    if old:
        await end_trip(old["eta_id"], chat_id)
    now = _now_ms()
    parts = trip_parts(option, start, end)
    eta = first_eta(name, end, parts, option.get("minutes") or sum(p["minutes"] + p["wait"] for p in parts), now)

    res = await _site_call("POST", "/api/share", json={"kind": "eta", "data": eta})
    if res.status_code != 200:
        raise TripError("Couldn't start the trip just now. Please try again shortly.")
    made = res.json()
    eta_id, secret = made["id"], made["secret"]

    device_id = "tg-" + secrets.token_hex(12)
    share = {"id": eta_id, "secret": secret, "name": name[:64], "to": eta["to"]}
    body = server_trip("tg-" + secrets.token_hex(8), parts, share, now)
    # The stop on the way, for There and back again (feats.py); the site doesn't read it.
    body_via = [via["lat"], via["lng"]] if via and via.get("lat") is not None else None
    put = await _site_call("PUT", f"/api/push/trips/{device_id}", json=body)
    if put.status_code != 200:
        await _site_call("PATCH", "/api/share", params={"id": eta_id}, json={"secret": secret, "data": {**eta, "stopped": True}})
        raise TripError("Live trips aren't available right now. Please try again later.")

    widget_parts = [{"kind": p["kind"], "label": p["label"], "to": p["to"]} for p in parts]
    with db:
        db.execute(
            """INSERT INTO trip_widgets (eta_id, owner_chat, secret, device_id, parts_json, last_json, trip_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (eta_id, chat_id, secret, device_id, json.dumps(widget_parts), json.dumps(eta), json.dumps({**body, "via": body_via}), now, now),
        )
    row = get_trip(eta_id)
    state = _state(eta, row, now)
    try:
        msg = await bot_api.send_widget(
            chat_id, widget_html(), public_data=_data(eta, row, 1, now), chat_data=OWNER_CHAT_DATA,
            caption=caption(eta, own=True), buttons=owner_buttons(eta_id, eta["to"]["label"]),
        )
    except bot_api.BotApiError as err:
        # No widget, no trip: the site stops following it, and its link says it's off.
        print(f"[bot_trips] trip widget for {chat_id} not sent: {err}")
        await _site_call("DELETE", f"/api/push/trips/{device_id}")
        await _site_call("PATCH", "/api/share", params={"id": eta_id}, json={"secret": secret, "data": {**eta, "stopped": True}})
        with db:
            db.execute("UPDATE trip_widgets SET status = 'ended', secret = NULL WHERE eta_id = ?", (eta_id,))
        raise TripError("Couldn't show the trip here. Live trips need an up-to-date Telegram app, in your own chat with the bot.") from err
    widget_id = msg["widget"]["id"]
    with db:
        db.execute("UPDATE trip_widgets SET widget_id = ?, state = ?, rev = 1 WHERE eta_id = ?", (widget_id, state, eta_id))
    _save_message(eta_id, chat_id, msg["message_id"], True)
    _shape_later(eta_id, shapes_for_trip(parts))
    await _set_cache_time(widget_id, _data(eta, row, 1, now))
    return eta_id


async def _set_cache_time(widget_id: str, data: str) -> None:
    # Only an edit sets how often the apps fetch the shared state (30 s when it's made).
    try:
        await asyncio.sleep(1.1)
        await bot_api.edit_shared_widget_data(widget_id, data, cache_time=CACHE_TIME)
    except bot_api.BotApiError as err:
        print(f"[bot_trips] cache time for widget {widget_id} not set: {err}")


class FollowAnswer:
    """What following a link came to: a widget sent, or why not, as text to send instead."""

    def __init__(self, sent: bool, text: str = ""):
        self.sent, self.text = sent, text


async def follow(chat_id: int, eta_id: str) -> FollowAnswer:
    """Sends a trip's widget to this chat, from its t.me/<bot>?start=eta_<id> link: the trip's
    shared widget if it has one already, or a new one for a trip the web app shares."""
    row = get_trip(eta_id)
    if row and row["status"] != "live":
        return FollowAnswer(False, "That trip's over now.")
    if not row:
        link = await read_link(eta_id)
        if not link:
            return FollowAnswer(False, "This trip link has expired, or doesn't exist.")
        if link.get("kind") != "eta":
            return FollowAnswer(False, "That isn't a live trip. Open it in the web app instead: " + config.webapp_url.rstrip("/") + f"/#share/{eta_id}")
        eta = link["data"]
        if eta.get("ended") or eta.get("stopped"):
            return FollowAnswer(False, "That trip's over now.")
        now = _now_ms()
        with db:
            db.execute(
                "INSERT OR IGNORE INTO trip_widgets (eta_id, last_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (eta_id, json.dumps(eta), now, now),
            )
        row = get_trip(eta_id)
        updated = link.get("updatedAt") or now
        msg = await bot_api.send_widget(
            chat_id, widget_html(), public_data=public_data(eta, 1, updated), caption=caption(eta, own=False),
            buttons=follower_buttons(eta_id),
        )
        with db:
            db.execute("UPDATE trip_widgets SET widget_id = ?, state = ?, rev = 1 WHERE eta_id = ?",
                       (msg["widget"]["id"], _state(eta, row, updated), eta_id))
        _save_message(eta_id, chat_id, msg["message_id"], False)
        _shape_later(eta_id, shapes_for_link(eta))
        await _set_cache_time(msg["widget"]["id"], public_data(eta, 1, updated))
        return FollowAnswer(True)

    own = row["owner_chat"] == chat_id
    eta = json.loads(row["last_json"] or "{}")
    msg = await bot_api.send_shared_widget(
        chat_id, row["widget_id"], chat_data=OWNER_CHAT_DATA if own else None, caption=caption(eta, own=own),
        buttons=owner_buttons(eta_id, (eta.get("to") or {}).get("label", "")) if own else follower_buttons(eta_id),
    )
    _save_message(eta_id, chat_id, msg["message_id"], own)
    return FollowAnswer(True)


async def unfollow(chat_id: int, eta_id: str) -> None:
    for m in messages(eta_id):
        if m["chat_id"] == chat_id and not m["own"]:
            await _drop_buttons(m)
            with db:
                db.execute("DELETE FROM trip_widget_messages WHERE eta_id = ? AND chat_id = ?", (eta_id, chat_id))


async def end_trip(eta_id: str, chat_id: int, client=None) -> bool:
    """The person on the trip ends it: the link says they've got there, as the web app's End
    trip does, and the site stops following it. False if it isn't theirs, or is over already."""
    row = get_trip(eta_id)
    if not row or row["owner_chat"] != chat_id or row["status"] != "live":
        return False
    # Ended by hand: its coins only if they'd got there (_settle).
    if row["trip_json"]:
        with db:
            db.execute("UPDATE trip_widgets SET trip_json = ? WHERE eta_id = ?",
                       (json.dumps({**json.loads(row["trip_json"]), "endedByHand": _now_ms()}), eta_id))
    # The site stops following it first, so its cron doesn't put the trip back on the link.
    if row["device_id"]:
        await _site_call("DELETE", f"/api/push/trips/{row['device_id']}")
    last = json.loads(row["last_json"] or "{}")
    if last and row["secret"]:
        res = await _site_call("PATCH", "/api/share", params={"id": eta_id},
                               json={"secret": row["secret"], "data": {**last, "ended": True, "arriveAt": _now_ms()}})
        if res.status_code not in (204, 404):
            print(f"[bot_trips] ending link {eta_id} answered {res.status_code}")
    await refresh(eta_id, client)
    return True


# ---------- your location ----------
#
# A location sent on a trip puts it right: once with the 📍 Send my location button (on Start trip
# and on Refresh), or all the way with Telegram's live location, whose every move comes as an edit
# of its message (handlers/trips.py). Each is placed on the trip's parts as the site places a bus
# (api/_push/trip.js, alongLeg), and sent to the site as a hand-moved place with a fresh fix
# (api/push/trips/[id].js, merge): it stands over the site's clock, which leaves the trip alone
# while fixes keep coming (LIVE_MS there) and carries on from it by the clock and LTA after. The
# ETA link is updated here at once, with where they really are, for the dot on the live map
# (share-links.js, me), and the widget with it.

# As the site's api/_push/trip.js.
ON_ROUTE_M = 250
BEND_SHARE = 0.3
# Live location moves every few seconds; the trip is put right at most this often.
FIX_EVERY_MS = 15 * 1000
# A 📍 button asked for this long ago still takes the location for the trip.
ASK_MS = 10 * 60 * 1000
# A fix this recent: no need to ask again on Refresh.
FIX_FRESH_MS = 3 * 60 * 1000


def along_part(here, pts) -> "tuple[float, float] | None":
    """Where a point is along a part, as a stop index with a fraction, and how far off it is in
    metres; None when it isn't near the part at all."""
    kx = 111320 * math.cos(math.radians(here[0]))
    ky = 110540
    best = None
    for i in range(len(pts) - 1):
        ax, ay = pts[i][1] * kx, pts[i][0] * ky
        dx, dy = pts[i + 1][1] * kx - ax, pts[i + 1][0] * ky - ay
        px, py = here[1] * kx - ax, here[0] * ky - ay
        len2 = dx * dx + dy * dy
        t = max(0.0, min(1.0, (px * dx + py * dy) / len2)) if len2 else 0.0
        m = math.hypot(px - t * dx, py - t * dy)
        if m <= max(ON_ROUTE_M, BEND_SHARE * math.sqrt(len2)) and (best is None or m < best[1]):
            best = (i + t, m)
    return best


def locate(legs: list, current: int, here) -> "tuple[int, float] | None":
    """The part they're on and how far along, from a point: the part the trip has them on first,
    then those after it, then those before (the clock had them too far on). At the very end of a
    part, the start of the next. None when the point is off the trip."""
    n = len(legs)
    current = max(0, min(current, n - 1))
    for k in [current, *range(current + 1, n), *range(current - 1, -1, -1)]:
        got = along_part(here, legs[k]["points"])
        if got is None:
            continue
        last = len(legs[k]["points"]) - 1
        if got[0] >= last - 0.2 and k < n - 1:
            return k + 1, 0.0
        return k, got[0]
    return None


def _point_at(pts, pos: float) -> list:
    i = max(0, min(int(pos), len(pts) - 1))
    j = min(i + 1, len(pts) - 1)
    f = pos - i
    return [round(pts[i][0] + (pts[j][0] - pts[i][0]) * f, 5), round(pts[i][1] + (pts[j][1] - pts[i][1]) * f, 5)]


def _js_round(x: float) -> int:
    """Math.round, as the site rounds: halves up (Python's round goes to the even one)."""
    return math.floor(x + 0.5)


def eta_at(trip: dict, k: int, pos: float, now: int, me: "dict | None" = None) -> dict:
    """The ETA link's progress with them on part k, pos along it: as the site's etaFromTrip
    (api/_lib/share-links.js), with where they really are."""
    legs, share = trip["legs"], trip["share"]
    leg = legs[k]
    last = len(leg["points"]) - 1
    minutes = leg["minutes"] * (1 - pos / max(1, last)) + (leg.get("walkAfter") or 0)
    for l in legs[k + 1:]:
        minutes += (l.get("wait") or 0) + l["minutes"] + (l.get("walkAfter") or 0)
    return {
        "name": share.get("name") or "",
        "to": share["to"],
        "arriveAt": _js_round(now + minutes * 60000),
        "leg": {"label": leg.get("label") or "", "to": leg["to"], "stopsLeft": max(0, _js_round(last - pos)), "kind": leg["kind"]},
        "legIndex": k,
        "legCount": len(legs),
        "at": _point_at(leg["points"], pos),
        "path": [p for l in legs for p in l["points"]][:400],
        "me": me,
        "ended": False,
    }


def wants_location(chat_id: int, live: bool):
    """The chat's trip, if this location is for it: live location while a trip's on, or a
    location sent soon after the bot asked for one. None otherwise."""
    row = own_live_trip(chat_id)
    if not row or not row["trip_json"]:
        return None
    if live or _now_ms() - (row["asked_at"] or 0) <= ASK_MS:
        return row
    return None


def mark_asked(eta_id: str) -> None:
    with db:
        db.execute("UPDATE trip_widgets SET asked_at = ? WHERE eta_id = ?", (_now_ms(), eta_id))


def fix_is_fresh(row) -> bool:
    return _now_ms() - (row["fix_at"] or 0) <= FIX_FRESH_MS


async def apply_fix(row, lat: float, lng: float, accuracy=None, live: bool = False, client=None) -> "dict | None":
    """Puts the trip right from a location. Answers {"on": True, "eta": …} with where it has
    them, {"on": False} for a location off the trip (only the dot moves), or None when it comes
    too soon after the last (live location)."""
    now = _now_ms()
    if live and now - (row["fix_at"] or 0) < FIX_EVERY_MS:
        return None
    trip = json.loads(row["trip_json"])
    last_eta = json.loads(row["last_json"] or "{}")
    me = {"lat": lat, "lng": lng, "accuracy": round(accuracy) if accuracy else None, "t": now}
    with db:
        db.execute("UPDATE trip_widgets SET fix_at = ?, asked_at = 0 WHERE eta_id = ?", (now, row["eta_id"]))
    spot = locate(trip["legs"], int(last_eta.get("legIndex") or 0), [lat, lng])
    if spot is None:
        # Off the trip (a detour, a bad fix): the trip stays as it is, and the dot shows where
        # they are.
        if last_eta:
            await _patch_eta(row, {**last_eta, "me": me})
            await refresh(row["eta_id"], client)
        return {"on": False}
    k, pos = spot
    n = len(trip["legs"])
    # Towards judging each ride (rides.py): the part they're on, and the one before, whose end
    # this may be.
    seen = rides.load_seen(row)
    for j in {k, k - 1}:
        rides.see(seen, trip["legs"], j, [lat, lng], accuracy, now)
    rides.save_seen(row["eta_id"], seen)
    body = {
        **trip,
        "leg": k, "at": int(pos), "pos": pos,
        "legStartedAt": now if k != trip.get("leg") else trip.get("legStartedAt", now),
        "seenAt": now, "anchor": {"pos": pos, "t": now},
        "movedAt": now, "fixAt": now, "clockRuns": True,
        # No push for the bot's trips; the bot sends the Get Off Alert itself, from the link.
        "alerted": [False] * n, "readied": [True] * n,
    }
    put = await _site_call("PUT", f"/api/push/trips/{row['device_id']}", json={k2: v for k2, v in body.items() if k2 not in ("via", "endedByHand")})
    if put.status_code != 200:
        print(f"[bot_trips] fix for {row['eta_id']} answered {put.status_code}")
    with db:
        db.execute("UPDATE trip_widgets SET trip_json = ? WHERE eta_id = ?", (json.dumps(body), row["eta_id"]))
    eta = eta_at(body, k, pos, now, me)
    await _patch_eta(row, eta)
    await refresh(row["eta_id"], client)
    return {"on": True, "eta": eta}


async def _patch_eta(row, data: dict) -> None:
    if not row["secret"]:
        return
    res = await _site_call("PATCH", "/api/share", params={"id": row["eta_id"]}, json={"secret": row["secret"], "data": data})
    if res.status_code not in (204, 404):
        print(f"[bot_trips] link {row['eta_id']} answered {res.status_code}")


def where_text(eta: dict) -> str:
    """Where a fix put them, in a few words."""
    leg = eta.get("leg") or {}
    left = leg.get("stopsLeft")
    if leg.get("kind") == "walk":
        return f"walking to {leg.get('to')}"
    stops = "at the stop" if left == 0 else f"{left} stop{'s' if left != 1 else ''} to {leg.get('to')}"
    return f"on {leg.get('label')}, {stops}"


# ---------- keeping the widget up to date ----------

def alert_text(eta: dict, parts: "list | None") -> "str | None":
    """The Get Off Alert's words, once the link has them ALERT_STOPS or fewer stops from where
    they get off (the site's api/_push/trip.js, alertText); None for a walk or before then."""
    leg = eta.get("leg") or {}
    left = leg.get("stopsLeft")
    if leg.get("kind") == "walk" or left is None or left > ALERT_STOPS or eta.get("ended"):
        return None
    i = int(eta.get("legIndex") or 0)
    change = any(p["kind"] != "walk" for p in (parts or [])[i + 1:])
    stop = leg.get("to") or "your stop"
    if left == 0:
        return f"🔔 Get off now at {stop}."
    return f"🔔 Get off in {left} stop{'s' if left != 1 else ''}, at {stop}{', to change' if change else ''}."


async def _drop_buttons(m) -> None:
    try:
        await bot_api.edit_buttons(m["chat_id"], m["message_id"], None)
    except bot_api.BotApiError as err:
        print(f"[bot_trips] buttons on {m['chat_id']}/{m['message_id']} stayed: {err}")


async def refresh(eta_id: str, client=None) -> "dict | None":
    """Reads the trip's link and, if anything changed, edits its widget for everyone. Sends the
    Get Off Alert, and once it's over, takes the buttons away and tells those following.
    Answers the link's data, or None once it's gone."""
    row = get_trip(eta_id)
    if not row or row["status"] != "live" or not row["widget_id"]:
        return None
    now = _now_ms()
    link = await read_link(eta_id)
    gone = link is None or link.get("kind") != "eta"
    eta = json.loads(row["last_json"] or "{}") if gone else link["data"]
    updated = now if gone else (link.get("updatedAt") or now)
    state = _state(eta, row, updated, gone=gone)
    over = gone or bool(eta.get("ended") or eta.get("stopped"))

    if state != row["state"]:
        rev = row["rev"] + 1
        await bot_api.edit_shared_widget_data(row["widget_id"], _data(eta, row, rev, updated, gone))
        with db:
            db.execute("UPDATE trip_widgets SET state = ?, rev = ?, last_json = ?, updated_at = ? WHERE eta_id = ?",
                       (state, rev, json.dumps(eta), now, eta_id))

    if row["owner_chat"] and client and not over:
        text = alert_text(eta, _parts_of(row))
        alerted = json.loads(row["alerted_json"] or "[]")
        i = int(eta.get("legIndex") or 0)
        if text and i not in alerted:
            with db:
                db.execute("UPDATE trip_widgets SET alerted_json = ? WHERE eta_id = ?", (json.dumps(alerted + [i]), eta_id))
            try:
                await client.send_message(row["owner_chat"], text)
            except Exception as err:
                print(f"[bot_trips] Get Off Alert to {row['owner_chat']} failed: {err}")

    if row["owner_chat"] and row["trip_json"]:
        try:
            await _settle(eta_id, eta, over and not gone and not eta.get("stopped"), over, client)
        except Exception:
            print(f"[bot_trips] rides and coins for {eta_id}:")
            traceback.print_exc()

    if over:
        with db:
            db.execute("UPDATE trip_widgets SET status = 'ended', secret = NULL WHERE eta_id = ?", (eta_id,))
        name = (eta.get("name") or "").strip() or "They"
        to = (eta.get("to") or {}).get("label") or "their stop"
        for m in messages(eta_id):
            await _drop_buttons(m)
            if m["own"] or not client:
                continue
            note = (f"🏁 {name} has arrived at {to}." if eta.get("ended") and not gone
                    else f"📴 {name} stopped sharing their trip." if eta.get("stopped") and not gone
                    else f"🏁 The trip to {to} has ended.")
            try:
                await client.send_message(m["chat_id"], note)
            except Exception as err:
                print(f"[bot_trips] end note to {m['chat_id']} failed: {err}")
    elif not row["owner_chat"] and not messages(eta_id):
        # A web share nobody here follows any more: no need to keep reading it.
        with db:
            db.execute("UPDATE trip_widgets SET status = 'ended' WHERE eta_id = ?", (eta_id,))
    return None if gone else eta


# ---------- rides, feats and uwuCoins ----------

def _arrived(trip: dict, eta: dict, seen: list) -> bool:
    """Got there: the trip ran to its end, or was ended by hand once they were there (their
    location by the end, or the last ride seen at its end)."""
    if not trip.get("endedByHand"):
        return True
    end = trip["legs"][-1]["points"][-1]
    me = eta.get("me") or {}
    if me.get("lat") is not None and rides.metres([me["lat"], me["lng"]], end) <= rides.END_M:
        return True
    last_ride = max((j for j, l in enumerate(trip["legs"]) if rides.is_ride(l)), default=None)
    return last_ride is not None and len(seen) > last_ride and bool(seen[last_ride]) and seen[last_ride].get("endAt") is not None


async def _settle(eta_id: str, eta: dict, finished: bool, over: bool, client=None) -> None:
    """The person on the trip's rides judged as the trip moves on from each (rides.py), each
    real one kept, towards the feats and their team run; and once it's over, the trip's
    uwuCoins and feats, if they got there with a real ride on it (coins.py, feats.py)."""
    from . import teams
    row = get_trip(eta_id)
    chat = row["owner_chat"]
    trip = json.loads(row["trip_json"])
    legs = trip["legs"]
    seen = rides.load_seen(row)
    upto = len(legs) if over else min(int(eta.get("legIndex") or 0), len(legs))
    new_feats = []
    for j in range(upto):
        was = len(seen) > j and seen[j] and seen[j].get("judged")
        ok = rides.judge(seen, legs, j)
        if ok and not was:
            got = rides.keep(chat, legs[j], eta_id)
            new_feats += feats.ride_done(chat, legs[j])
            teams.queue(chat, "ride", {**got, **feats.ride_marks(legs[j])})
    rides.save_seen(eta_id, seen)
    if over and not row["paid"]:
        with db:
            db.execute("UPDATE trip_widgets SET paid = 1 WHERE eta_id = ?", (eta_id,))
        got = coins.for_trip(legs, seen) if finished and _arrived(trip, eta, seen) else None
        if got and not coins.paid_for(chat, eta_id):
            to = (eta.get("to") or {}).get("label") or ""
            coins.add(chat, got["n"], "trip", {"trip": eta_id, "name": f"To {to}" if to else "", "parts": got["parts"]})
            start, end = legs[0]["points"][0], legs[-1]["points"][-1]
            via = trip.get("via")
            away = bool(via) and rides.metres(start, via) >= feats.LOOP_AWAY_M
            new_feats += feats.trip_done(chat, start, end, _now_ms() - row["created_at"], away)
            teams.queue(chat, "trip", {"start": start, "end": end, "via": via, "startedAt": row["created_at"], "endedAt": _now_ms()})
            # The card counts the coins up, on the message of the person on the trip.
            for m in messages(eta_id):
                if m["own"]:
                    try:
                        await bot_api.edit_message_widget_data(m["chat_id"], m["message_id"], json.dumps({"o": 1, "c": got["n"]}))
                    except bot_api.BotApiError as err:
                        print(f"[bot_trips] coins on {eta_id}'s card: {err}")
            if client:
                await _say(client, chat, f"🪙 +{got['n']} uwuCoins for your trip. You have {coins.balance(chat)}: /coins to spin the wheel.")
    if new_feats and client:
        await _say(client, chat, feats.said(new_feats))
    if new_feats or (over and coins.paid_for(chat, eta_id)):
        from .coins_view import update_wheel
        await update_wheel(chat)
    if new_feats or over:
        await teams.flush(chat)


async def _say(client, chat: int, text: str) -> None:
    try:
        await client.send_message(chat, text)
    except Exception as err:
        print(f"[bot_trips] to {chat}: {err}")


async def poll(client) -> None:
    for row in db.execute("SELECT eta_id FROM trip_widgets WHERE status = 'live'").fetchall():
        try:
            await refresh(row["eta_id"], client)
        except Exception:
            print(f"[bot_trips] trip {row['eta_id']} failed:")
            traceback.print_exc()
        # A shared widget takes one edit a second; different ones don't share it, but the
        # Bot API's own limits do.
        await asyncio.sleep(0.05)


async def _loop(client) -> None:
    while True:
        await poll(client)
        await asyncio.sleep(POLL_SECONDS)


async def start_trip_loop(client) -> None:
    """Keeps every live trip's widget current, from the bot's start. Trips survive a restart:
    they're in the database, and the site goes on following them meanwhile."""
    global _username, _task
    me = await client.get_me()
    if me.username:
        _username = me.username
    _task = asyncio.get_event_loop().create_task(_loop(client))


def stop_trip_loop() -> None:
    if _task:
        _task.cancel()
