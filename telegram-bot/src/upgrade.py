"""Cards brought up to the newest look. Telegram fixes a widget's code once it's sent, so a card
sent before an update keeps the old code for good: sending it again (sendSharedWidget) sends the
same. Each card keeps which code it was sent with (trip_widget.code_version); when the bot starts,
every live trip, team run and uwuCoins wheel whose card has older code gets a fresh one, sent
silently, carrying on where the old one was, and the old message is deleted (or, past Telegram's
48 hours for that, left without its buttons). /trip does the same for one trip.

A trip from before the doors were drawn kept them as sentences: they're read back into what's
drawn (mrt_doors.from_tip)."""

import asyncio
import json
import traceback

from . import bot_api, bot_trips, coins, mrt_doors, team_view, teams
from .db import db
from .trip_widget import OWNER_CHAT_DATA, caption, code_version, html_of


async def _replace(chat_id: int, old_message_id: int) -> None:
    """The old card's message gone, or at least its buttons."""
    if not await bot_api.delete_message(chat_id, old_message_id):
        try:
            await bot_api.edit_buttons(chat_id, old_message_id, None)
        except bot_api.BotApiError:
            pass


async def upgrade_trip(eta_id: str) -> bool:
    """A live trip's card sent again in the newest look, for everyone with it. False when it's
    the newest already, or over."""
    row = bot_trips.get_trip(eta_id)
    version = code_version("trip_widget.html")
    if not row or row["status"] != "live" or not row["widget_id"] or row["code_ver"] == version:
        return False
    # The doors as they're drawn now.
    if row["parts_json"]:
        parts = json.loads(row["parts_json"])
        for p in parts:
            if p.get("y") is not None:
                y = mrt_doors.from_tip(p["y"])
                if y:
                    p["y"] = y
                else:
                    p.pop("y")
        with db:
            db.execute("UPDATE trip_widgets SET parts_json = ? WHERE eta_id = ?", (json.dumps(parts), eta_id))
        row = bot_trips.get_trip(eta_id)
    eta = json.loads(row["last_json"] or "{}")
    rev = row["rev"] + 1
    updated = row["updated_at"]
    data = bot_trips._data(eta, row, rev, updated)
    to = (eta.get("to") or {}).get("label", "")
    widget_id = None
    for m in sorted(bot_trips.messages(eta_id), key=lambda m: -m["own"]):
        own = bool(m["own"])
        args = dict(chat_data=OWNER_CHAT_DATA if own else None, caption=caption(eta, own=own),
                    buttons=bot_trips.owner_buttons(eta_id, to) if own else bot_trips.follower_buttons(eta_id), silent=True)
        try:
            if widget_id is None:
                msg = await bot_api.send_widget(m["chat_id"], html_of("trip_widget.html"), public_data=data, shared=True, **args)
                widget_id = msg["widget"]["id"]
            else:
                msg = await bot_api.send_shared_widget(m["chat_id"], widget_id, **args)
        except bot_api.BotApiError as err:
            print(f"[upgrade] trip {eta_id} to {m['chat_id']}: {err}")
            continue
        await _replace(m["chat_id"], m["message_id"])
        bot_trips._save_message(eta_id, m["chat_id"], msg["message_id"], own)
    if widget_id is None:
        return False
    with db:
        db.execute("UPDATE trip_widgets SET widget_id = ?, rev = ?, state = ?, code_ver = ? WHERE eta_id = ?",
                   (widget_id, rev, bot_trips._state(eta, row, updated), version, eta_id))
    await bot_trips._set_cache_time(widget_id, data)
    return True


async def upgrade_team(team_id: str) -> bool:
    """A team's card sent again in the newest look, for every chat in it here."""
    row = db.execute("SELECT * FROM team_widgets WHERE team_id = ?", (team_id,)).fetchone()
    version = code_version("team_widget.html")
    if not row or not row["widget_id"] or row["code_ver"] == version:
        return False
    msgs = db.execute("SELECT * FROM team_widget_messages WHERE team_id = ?", (team_id,)).fetchall()
    if not msgs:
        return False
    team = await teams.api(None, team_id)
    data = team_view.state(team, teams.fold(team))
    rev = row["rev"] + 1
    cap = f"👥 Team run: {team['name']}. Rides and trips any of you take count for all of you."
    widget_id = None
    for m in msgs:
        args = dict(caption=cap, buttons=team_view.buttons(team_id, team["name"]), silent=True)
        try:
            if widget_id is None:
                msg = await bot_api.send_widget(m["chat_id"], html_of("team_widget.html"), public_data=team_view._dump({"r": rev, **data}), **args)
                widget_id = msg["widget"]["id"]
            else:
                msg = await bot_api.send_shared_widget(m["chat_id"], widget_id, **args)
        except bot_api.BotApiError as err:
            print(f"[upgrade] team {team_id} to {m['chat_id']}: {err}")
            continue
        await _replace(m["chat_id"], m["message_id"])
        with db:
            db.execute("UPDATE team_widget_messages SET message_id = ? WHERE team_id = ? AND chat_id = ?", (msg["message_id"], team_id, m["chat_id"]))
    if widget_id is None:
        return False
    with db:
        db.execute("UPDATE team_widgets SET widget_id = ?, rev = ?, state = ?, code_ver = ? WHERE team_id = ?",
                   (widget_id, rev, team_view._dump(data), version, team_id))
    return True


async def upgrade_wheel(chat_id: int) -> bool:
    """A chat's uwuCoins wheel sent again in the newest look, its balance and last spin carried over."""
    from . import coins_view
    row = db.execute("SELECT * FROM coin_widgets WHERE chat_id = ?", (chat_id,)).fetchone()
    if not row or row["code_ver"] == code_version("coins_widget.html"):
        return False
    rev = row["rev"] + 1
    try:
        last = json.loads(row["state"]) if row["state"] else {}
    except ValueError:
        last = {}
    # The last spin carried over as said, not turned again (its time is past the wheel's minute).
    state = json.dumps({**last, "r": rev, "b": coins.balance(chat_id), "s": last.get("s", -1)}, separators=(",", ":"))
    try:
        msg = await bot_api.send_widget(chat_id, html_of("coins_widget.html"), public_data="", chat_data=state,
                                        caption=coins_view.CAPTION, buttons=coins_view._buttons(), shared=False, silent=True)
    except bot_api.BotApiError as err:
        print(f"[upgrade] wheel in {chat_id}: {err}")
        return False
    await _replace(chat_id, row["message_id"])
    coins_view._keep(chat_id, msg["message_id"], rev, state, sent=True)
    return True


async def upgrade_all() -> dict:
    """Every live card with older code, in the newest look. How many of each were sent again."""
    done = {"trips": 0, "teams": 0, "wheels": 0}
    for kind, ids, fn in (
        ("trips", [r["eta_id"] for r in db.execute("SELECT eta_id FROM trip_widgets WHERE status = 'live' AND widget_id IS NOT NULL")], upgrade_trip),
        ("teams", [r["team_id"] for r in db.execute("SELECT DISTINCT team_id FROM team_widget_messages")], upgrade_team),
        ("wheels", [r["chat_id"] for r in db.execute("SELECT chat_id FROM coin_widgets")], upgrade_wheel),
    ):
        for key in ids:
            try:
                if await fn(key):
                    done[kind] += 1
            except Exception:
                print(f"[upgrade] {kind} {key}:")
                traceback.print_exc()
            await asyncio.sleep(0.2)
    if any(done.values()):
        print(f"[upgrade] sent again in the newest look: {done}")
    return done
