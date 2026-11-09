"""A team run's shared widget (team_widget.html), the same for every chat in the team here, kept
up to date from the team's server every teams.REFRESH_S, with each chat given the feats the team
does (teams.py, award)."""

import asyncio
import json
import time
import traceback
from urllib.parse import quote

from . import bot_api, feats, teams
from .buttons import make_button
from .db import db
from .trip_widget import html_of

_bot = "sgbus_app"
_task = None


def set_bot(username: str) -> None:
    global _bot
    _bot = username or _bot


def state(team: dict, folded: dict, gone: bool = False) -> dict:
    if gone:
        return {"n": team.get("name", ""), "x": 1}
    names = {m["id"]: m["name"] for m in team.get("members") or []}
    h = []
    for fid in feats.IDS:
        have, need = folded["have"].get(fid, [0, 1])
        if fid == "long":
            have, need = have // 60000, need // 60000
        h.append([have, need])
    ho = folded.get("handoff")
    return {
        "n": team.get("name", "")[:30],
        "m": [m["name"][:20] for m in team.get("members") or [] if not m.get("left")][:8],
        "h": h,
        "k": folded.get("rides", 0),
        "o": [names.get(ho["by"], "Someone")[:20], ho["endedAt"] // 1000] if ho else None,
    }


def _dump(d: dict) -> str:
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def buttons(team_id: str, team_name: str) -> list:
    tg, web = teams.invite_links(team_id, _bot)
    text = f"Join my team run, {team_name}, on SG Bus Timings: the feats speedrun together. In Telegram: {tg} . Or in the app: {web}"
    return [
        [("📤 Invite to the team", {"url": f"https://t.me/share/url?url={quote(tg, safe='')}&text={quote(text, safe='')}"})],
        [("🔄 Refresh", make_button("team_refresh", {"id": team_id})), ("🚪 Leave", make_button("team_leave", {"id": team_id}))],
    ]


async def show(chat_id: int) -> bool:
    """The chat's team's widget, sent to it. False when it's in no team."""
    me = teams.mine(chat_id)
    if not me:
        return False
    team_id = me["team_id"]
    team = await teams.api(None, team_id)
    folded = teams.fold(team)
    row = db.execute("SELECT * FROM team_widgets WHERE team_id = ?", (team_id,)).fetchone()
    data = state(team, folded)
    caption = f"👥 Team run: {team['name']}. Rides and trips any of you take count for all of you."
    if row and row["widget_id"]:
        msg = await bot_api.send_shared_widget(chat_id, row["widget_id"], caption=caption, buttons=buttons(team_id, team["name"]))
    else:
        rev = 1
        msg = await bot_api.send_widget(chat_id, html_of("team_widget.html"), public_data=_dump({"r": rev, **data}), caption=caption,
                                        buttons=buttons(team_id, team["name"]))
        with db:
            db.execute("""INSERT INTO team_widgets (team_id, widget_id, state, rev) VALUES (?, ?, ?, ?)
                          ON CONFLICT(team_id) DO UPDATE SET widget_id = excluded.widget_id, state = excluded.state, rev = excluded.rev""",
                       (team_id, msg["widget"]["id"], _dump(data), rev))
    with db:
        db.execute("""INSERT INTO team_widget_messages (team_id, chat_id, message_id) VALUES (?, ?, ?)
                      ON CONFLICT(team_id, chat_id) DO UPDATE SET message_id = excluded.message_id""", (team_id, chat_id, msg["message_id"]))
    return True


async def refresh(team_id: str, client=None) -> "dict | None":
    """The team from its server: its widget edited if anything changed, each chat in it here given
    the feats the team's done (and told), and every chat let go of once the team's gone."""
    for m in teams.chats_in(team_id):
        await teams.flush(m["chat_id"])
    try:
        team = await teams.api(None, team_id)
    except teams.TeamError as err:
        if err.status != 404:
            raise
        await _gone(team_id, client)
        return None
    folded = teams.fold(team)
    for m in teams.chats_in(team_id):
        new = teams.award(m["chat_id"], team, folded)
        if new and client:
            try:
                await client.send_message(m["chat_id"], f"👥 Your team run, {team['name']}, did it:\n" + feats.said(new))
            except Exception as err:
                print(f"[team] to {m['chat_id']}: {err}")
    await _edit(team_id, state(team, folded))
    return folded


async def _edit(team_id: str, data: dict) -> None:
    row = db.execute("SELECT * FROM team_widgets WHERE team_id = ?", (team_id,)).fetchone()
    if not row or not row["widget_id"] or row["state"] == _dump(data):
        return
    rev = row["rev"] + 1
    await bot_api.edit_shared_widget_data(row["widget_id"], _dump({"r": rev, **data}))
    with db:
        db.execute("UPDATE team_widgets SET state = ?, rev = ? WHERE team_id = ?", (_dump(data), rev, team_id))


async def _gone(team_id: str, client=None) -> None:
    name = next((m["team_name"] for m in teams.chats_in(team_id)), "")
    for m in teams.chats_in(team_id):
        teams.forget(m["chat_id"])
        if client:
            try:
                await client.send_message(m["chat_id"], f"👥 Your team run, {name}, has ended.")
            except Exception:
                pass
    await drop(team_id, {"n": name, "x": 1})


async def drop(team_id: str, data: "dict | None" = None, chat_id: "int | None" = None) -> None:
    """Buttons taken off the team's messages (one chat's, or all), and the widget ended if `data`."""
    for m in db.execute("SELECT * FROM team_widget_messages WHERE team_id = ?", (team_id,)).fetchall():
        if chat_id is not None and m["chat_id"] != chat_id:
            continue
        try:
            await bot_api.edit_buttons(m["chat_id"], m["message_id"], None)
        except bot_api.BotApiError:
            pass
        with db:
            db.execute("DELETE FROM team_widget_messages WHERE team_id = ? AND chat_id = ?", (team_id, m["chat_id"]))
    if data:
        await _edit(team_id, data)


async def poll(client) -> None:
    ids = {r["team_id"] for r in db.execute("SELECT DISTINCT team_id FROM team_members")}
    for team_id in ids:
        try:
            await refresh(team_id, client)
        except Exception:
            print(f"[team] {team_id}:")
            traceback.print_exc()
        await asyncio.sleep(0.1)


async def _loop(client) -> None:
    while True:
        await poll(client)
        await asyncio.sleep(teams.REFRESH_S)


async def start_team_loop(client) -> None:
    global _task
    me = await client.get_me()
    set_bot(me.username)
    _task = asyncio.get_event_loop().create_task(_loop(client))


def stop_team_loop() -> None:
    if _task:
        _task.cancel()
