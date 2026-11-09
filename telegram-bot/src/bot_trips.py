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


def _state(eta: dict, row, updated: int, gone: bool = False) -> str:
    """The widget's state for the trip, revision left at 0, to tell whether anything changed."""
    return public_data(eta, 0, updated, _parts_of(row), gone=gone)


# ---------- starting, following, ending ----------

async def start_trip(chat_id: int, name: str, start: dict, end: dict, option: dict) -> str:
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
    put = await _site_call("PUT", f"/api/push/trips/{device_id}", json=server_trip("tg-" + secrets.token_hex(8), parts, share, now))
    if put.status_code != 200:
        await _site_call("PATCH", "/api/share", params={"id": eta_id}, json={"secret": secret, "data": {**eta, "stopped": True}})
        raise TripError("Live trips aren't available right now. Please try again later.")

    widget_parts = [{"kind": p["kind"], "label": p["label"], "to": p["to"]} for p in parts]
    with db:
        db.execute(
            """INSERT INTO trip_widgets (eta_id, owner_chat, secret, device_id, parts_json, last_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (eta_id, chat_id, secret, device_id, json.dumps(widget_parts), json.dumps(eta), now, now),
        )
    row = get_trip(eta_id)
    state = _state(eta, row, now)
    try:
        msg = await bot_api.send_widget(
            chat_id, widget_html(), public_data=public_data(eta, 1, now, widget_parts), chat_data=OWNER_CHAT_DATA,
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
    await _set_cache_time(widget_id, public_data(eta, 1, now, widget_parts))
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
        await bot_api.edit_shared_widget_data(row["widget_id"], public_data(eta, rev, updated, _parts_of(row), gone=gone))
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
