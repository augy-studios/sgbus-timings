"""Team runs in the bot, as the web app has them (main-site/js/team.js): the feats speedrun as a
team, with the same team server (the site's api/team.js), so a team can be phones and Telegram
chats together. Start one with /team <name>, join with its code or a t.me/<bot>?start=team_<code>
link (or the web app's #team/<code>), up to eight at once.

What a chat sends: each ride judged real on a trip here (rides.py), and each trip it got to the
end of with a real ride on it (bot_trips.py, _settle), through an outbox (team_outbox) until the
team's server takes them. Every member works the team's feats out from the same rides and trips
(fold, js/team.js's fold in Python), and each chat in the team gets each feat the team does once
it's in, with its uwuCoins (feats.py).

The team shows as one shared widget (team_view.py), the same for every chat in it here, updated
every REFRESH_S. Keep the rules in step with js/team.js and js/eggs.js."""

import json
import random
import string
import time

import httpx

from . import feats
from .config import config
from .db import db
from .http_client import shared_client
from .rides import LINES, metres

HANDOFF_M = 400
HANDOFF_EARLY_MS = 5 * 60 * 1000
HANDOFF_GAP_MS = 30 * 60 * 1000
REFRESH_S = 90
SEND_MAX = 50
GONE = "This team run has ended, or doesn't exist."


class TeamError(RuntimeError):
    def __init__(self, message: str, status: "int | None" = None):
        super().__init__(message)
        self.status = status


def _now() -> int:
    return int(time.time() * 1000)


def _url() -> str:
    return config.nav_api_url.rstrip("/") + "/api/team"


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.bot_api_token}"} if config.bot_api_token else {}


async def api(body: "dict | None" = None, team_id: "str | None" = None):
    try:
        if body is None:
            res = await shared_client().get(_url(), params={"id": team_id}, headers=_headers(), timeout=20)
        else:
            res = await shared_client().post(_url(), json=body, headers=_headers(), timeout=20)
    except httpx.HTTPError as err:
        raise TeamError("Couldn't reach the team run just now. Please try again shortly.") from err
    if res.status_code == 204:
        return {}
    try:
        data = res.json()
    except ValueError:
        data = {}
    if res.status_code != 200:
        raise TeamError(data.get("error") or "Something went wrong. Please try again.", res.status_code)
    return data


# ---------- membership ----------

def mine(chat_id: int):
    return db.execute("SELECT * FROM team_members WHERE chat_id = ?", (chat_id,)).fetchone()


def chats_in(team_id: str) -> list:
    return db.execute("SELECT * FROM team_members WHERE team_id = ?", (team_id,)).fetchall()


def _keep(chat_id: int, made: dict) -> None:
    with db:
        db.execute(
            """INSERT INTO team_members (chat_id, team_id, team_name, member_id, secret, joined_at) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(chat_id) DO UPDATE SET team_id = excluded.team_id, team_name = excluded.team_name,
               member_id = excluded.member_id, secret = excluded.secret, joined_at = excluded.joined_at""",
            (chat_id, made["id"], made["name"], made["member"]["id"], made["member"]["secret"], _now()),
        )


async def create(chat_id: int, team_name: str, you: str) -> dict:
    if mine(chat_id):
        await leave(chat_id)
    made = await api({"action": "create", "team": team_name, "name": you or "Telegram"})
    _keep(chat_id, made)
    return made


async def join(chat_id: int, team_id: str, you: str) -> dict:
    was = mine(chat_id)
    if was and was["team_id"] == team_id:
        return {"id": team_id, "name": was["team_name"], "again": True}
    if was:
        await leave(chat_id)
    try:
        made = await api({"action": "join", "id": team_id, "name": you or "Telegram"})
    except TeamError as err:
        if err.status == 409:
            raise TeamError("This team run is full: eight at once.", 409) from err
        raise
    _keep(chat_id, made)
    return made


async def leave(chat_id: int) -> "str | None":
    me = mine(chat_id)
    if not me:
        return None
    await flush(chat_id)
    try:
        await api({"action": "leave", "id": me["team_id"], "member": me["member_id"], "secret": me["secret"]})
    except TeamError:
        pass
    forget(chat_id)
    return me["team_name"]


def forget(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM team_members WHERE chat_id = ?", (chat_id,))
        db.execute("DELETE FROM team_outbox WHERE chat_id = ?", (chat_id,))


# ---------- what a chat sends ----------

def _eid(member: str) -> str:
    ts = ""
    n = _now()
    digits = string.digits + string.ascii_lowercase
    while n:
        n, r = divmod(n, 36)
        ts = digits[r] + ts
    return f"{member}-{ts}{''.join(random.choices(digits, k=6))}"[:40]


def queue(chat_id: int, kind: str, data: dict) -> None:
    """A real ride ({mode, line, bus, first, end}) or a trip ({start, end, via, startedAt,
    endedAt}) for the chat's team, if it's in one. Sent by flush."""
    me = mine(chat_id)
    if not me:
        return
    if kind == "ride":
        data = {"mode": data["mode"], "line": data.get("line") or "", "bus": data.get("bus") or "",
                "first": data.get("first") or [], "end": data.get("end") or ""}
    with db:
        db.execute("INSERT INTO team_outbox (eid, chat_id, kind, data_json, at) VALUES (?, ?, ?, ?, ?)",
                   (_eid(me["member_id"]), chat_id, kind, json.dumps(data), _now()))


async def flush(chat_id: int) -> bool:
    """The chat's outbox to its team, SEND_MAX at a time. False once the team's gone."""
    me = mine(chat_id)
    if not me:
        return False
    while True:
        rows = db.execute("SELECT * FROM team_outbox WHERE chat_id = ? ORDER BY at LIMIT ?", (chat_id, SEND_MAX)).fetchall()
        if not rows:
            return True
        events = [{"eid": r["eid"], "kind": r["kind"], "data": json.loads(r["data_json"])} for r in rows]
        try:
            await api({"action": "add", "id": me["team_id"], "member": me["member_id"], "secret": me["secret"], "events": events})
        except TeamError as err:
            if err.status == 404:
                return False
            if err.status == 400:
                # One refused won't be taken later either: each on its own, the refused dropped.
                for e in events:
                    try:
                        await api({"action": "add", "id": me["team_id"], "member": me["member_id"], "secret": me["secret"], "events": [e]})
                    except TeamError as one:
                        if one.status != 400:
                            return True
                    with db:
                        db.execute("DELETE FROM team_outbox WHERE eid = ?", (e["eid"],))
                continue
            return True
        with db:
            db.executemany("DELETE FROM team_outbox WHERE eid = ?", [(e["eid"],) for e in events])


# ---------- the team's feats (js/team.js, fold) ----------

def fold(team: dict, now: "int | None" = None) -> dict:
    """What the team has done: {done: {feat: when}, have: {feat: [have, need]}, longest, rides,
    handoff}, from the team as api/team.js gives it."""
    now = now or _now()
    firsts = {"lines": {}, "buses": {}, "first": {}, "ends": {}}
    done, rides = {}, 0

    def keep(m, key, at):
        if key and key not in m:
            m[key] = at

    for e in team.get("events") or []:
        if e.get("kind") != "ride":
            continue
        d = e.get("data") or {}
        rides += 1
        if rides == feats.HUNDRED:
            done["hundred"] = e["at"]
        keep(firsts["lines"], d.get("line"), e["at"])
        keep(firsts["buses"], d.get("bus"), e["at"])
        for c in d.get("first") or []:
            keep(firsts["first"], c, e["at"])
        keep(firsts["ends"], d.get("end"), e["at"])
    sets = {"lines": ("lines", LINES), "up": ("buses", feats.UP), "down": ("buses", feats.DOWN),
            "first": ("first", feats.FIRST_LAST), "ends": ("ends", list(feats.ENDS))}
    have = {"hundred": [min(rides, feats.HUNDRED), feats.HUNDRED]}
    for fid, (m, keys) in sets.items():
        got = [k for k in keys if k in firsts[m]]
        have[fid] = [len(got), len(keys)]
        if len(got) == len(keys):
            done[fid] = max(firsts[m][k] for k in keys)

    trips = sorted(({**e["data"], "by": e["member"], "at": e["at"]} for e in team.get("events") or []
                    if e.get("kind") == "trip" and (e.get("data") or {}).get("start") and e["data"].get("end")),
                   key=lambda t: t["startedAt"])
    nxt = [[j for j, u in enumerate(trips) if u is not t and u["by"] != t["by"] and u["startedAt"] > t["startedAt"]
            and t["endedAt"] - HANDOFF_EARLY_MS <= u["startedAt"] <= t["endedAt"] + HANDOFF_GAP_MS
            and metres(t["end"], u["start"]) <= HANDOFF_M] for t in trips]
    ktm_at = lambda p: next((k for k, at in feats.KTM.items() if metres(p, at) <= feats.KTM_M), None)

    def soonest(fid, at):
        if fid not in done or at < done[fid]:
            done[fid] = at

    longest = 0
    for i, s in enumerate(trips):
        away = lambda t: any(p and metres(p, s["start"]) >= feats.LOOP_AWAY_M for p in (t["start"], t["end"], t.get("via")))
        frm = ktm_at(s["start"])
        seen, todo = set(), [(i, away(s))]
        while todo:
            j, far = todo.pop()
            if (j, far) in seen:
                continue
            seen.add((j, far))
            t = trips[j]
            at = max(s["at"], t["at"])
            ms = t["endedAt"] - s["startedAt"]
            longest = max(longest, ms)
            if ms >= feats.LONG_MS:
                soonest("long", at)
            if far and metres(t["end"], s["start"]) <= feats.LOOP_M:
                soonest("loop", at)
            to = ktm_at(t["end"])
            if frm and to and frm != to:
                soonest("ktm", at)
            for u in nxt[j]:
                todo.append((u, far or away(trips[u])))
    have["long"] = [min(longest, feats.LONG_MS), feats.LONG_MS]
    for fid in ("loop", "ktm"):
        have[fid] = [1 if fid in done else 0, 1]
    last = max(trips, key=lambda t: t["endedAt"], default=None)
    handoff = last if last and now - last["endedAt"] <= HANDOFF_GAP_MS else None
    return {"done": done, "have": have, "longest": longest, "rides": rides, "handoff": handoff}


def award(chat_id: int, team: dict, folded: dict) -> list:
    """The feats the team's done since this chat joined, made its own. Answers those new now."""
    me = mine(chat_id)
    member = next((m for m in team.get("members") or [] if me and m["id"] == me["member_id"]), None)
    if not member or member.get("left"):
        return []
    return [fid for fid in feats.IDS if (at := folded["done"].get(fid)) is not None and at >= member["joinedAt"]
            and feats.feat(chat_id, fid, team=team["name"])]


def invite_links(team_id: str, bot: str) -> tuple:
    return f"https://t.me/{bot}?start=team_{team_id}", config.webapp_url.rstrip("/") + f"/#team/{team_id}"
